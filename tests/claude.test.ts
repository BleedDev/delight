import { describe, expect, test } from "bun:test";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import net from "net";
import { tmpdir } from "os";
import { join } from "path";

import { BRIDGE_SOURCE } from "../plugins/claude/host/bridge";
import { encodeProjectDir, listSessions, parseTranscript } from "../plugins/claude/host/history";
import { toolLabel } from "../plugins/claude/ui/epitaxy/labels";

const line = (o: object) => JSON.stringify(o);

describe("session files", () => {
    test("project folders are the path with every other character as a dash", () => {
        expect(encodeProjectDir("/Users/me/my project")).toBe("-Users-me-my-project");
        expect(encodeProjectDir("C:\\src\\app")).toBe("C--src-app");
        const long = "/" + "a".repeat(250);
        expect(encodeProjectDir(long).length).toBeGreaterThan(200);
        expect(encodeProjectDir(long).startsWith("-" + "a".repeat(199))).toBe(true);
    });

    test("a transcript is the chain to the newest leaf, with parallel tool calls put back", () => {
        const text = [
            line({ type: "user", uuid: "u1", parentUuid: null, message: { role: "user", content: "hi" }, timestamp: "2026-01-01T00:00:00Z" }),
            // one API message split over two lines (two parallel tool calls)
            line({ type: "assistant", uuid: "a1", parentUuid: "u1", message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] }, timestamp: "2026-01-01T00:00:01Z" }),
            line({ type: "assistant", uuid: "a2", parentUuid: "a1", message: { id: "m1", content: [{ type: "tool_use", id: "t2", name: "Read", input: {} }] }, timestamp: "2026-01-01T00:00:02Z" }),
            // t1's result hangs off a side branch, t2's result continues the chain
            line({ type: "user", uuid: "r1", parentUuid: "a1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "one" }] }, timestamp: "2026-01-01T00:00:03Z" }),
            line({ type: "user", uuid: "r2", parentUuid: "a2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "two" }] }, timestamp: "2026-01-01T00:00:04Z" }),
            line({ type: "assistant", uuid: "a3", parentUuid: "r2", message: { id: "m2", content: [{ type: "text", text: "done" }] }, timestamp: "2026-01-01T00:00:05Z" }),
            line({ type: "attachment", uuid: "x1", parentUuid: "a3", attachment: { type: "other" } }),
            "not json",
        ].join("\n");
        const msgs = parseTranscript(text, "s");
        expect(msgs.map(m => m.uuid)).toEqual(["u1", "a1", "a2", "r1", "r2", "a3"]);
        expect(msgs.every(m => m.session_id === "s")).toBe(true);
    });

    test("sidechain and meta lines never reach the transcript", () => {
        const text = [
            line({ type: "user", uuid: "u1", parentUuid: null, message: { role: "user", content: "hi" } }),
            line({ type: "user", uuid: "m", parentUuid: "u1", isMeta: true, message: { role: "user", content: "meta" } }),
            line({ type: "assistant", uuid: "a1", parentUuid: "m", message: { id: "m1", content: [{ type: "text", text: "ok" }] } }),
            line({ type: "assistant", uuid: "side", parentUuid: "u1", isSidechain: true, message: { id: "m9", content: [] } }),
        ].join("\n");
        expect(parseTranscript(text, "s").map(m => m.uuid)).toEqual(["u1", "a1"]);
    });

    test("the session list uses titles, skips wrapped prompts and sorts by last change", () => {
        const root = mkdtempSync(join(tmpdir(), "claude-projects-"));
        const dir = join(root, "-work");
        require("fs").mkdirSync(dir);
        const a = "11111111-1111-1111-1111-111111111111";
        const b = "22222222-2222-2222-2222-222222222222";
        const c = "33333333-3333-3333-3333-333333333333";
        writeFileSync(join(dir, `${a}.jsonl`), [
            line({ type: "user", uuid: "u", cwd: "/work", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "fix the build" } }),
            line({ type: "ai-title", aiTitle: "Build fix" }),
        ].join("\n"));
        writeFileSync(join(dir, `${b}.jsonl`), line({ type: "user", uuid: "u", message: { role: "user", content: "<discord-event>hello</discord-event>" } }));
        writeFileSync(join(dir, `${c}.jsonl`), line({ type: "user", uuid: "u", message: { role: "user", content: [{ type: "text", text: "second" }] } }));
        const now = Date.now() / 1000;
        require("fs").utimesSync(join(dir, `${a}.jsonl`), now - 60, now - 60);
        const list = listSessions({}, root);
        expect(list.map(s => s.sessionId)).toEqual([c, a]); // b only has a wrapped prompt, so it has no summary
        expect(list[1].summary).toBe("Build fix");
        expect(list[1].firstPrompt).toBe("fix the build");
        expect(list[1].cwd).toBe("/work");
    });
});

describe("Discord tools bridge", () => {
    test("speaks MCP on stdio and forwards tool calls to the socket", async () => {
        const dir = mkdtempSync(join(tmpdir(), "claude-bridge-"));
        const script = join(dir, "bridge.js");
        writeFileSync(script, BRIDGE_SOURCE);
        const sock = process.platform === "win32" ? `\\\\.\\pipe\\evi-claude-test-${process.pid}` : join(dir, "s.sock");
        const server = net.createServer(c => {
            let buf = "";
            c.on("data", d => {
                buf += d;
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const m = JSON.parse(buf.slice(0, i));
                    buf = buf.slice(i + 1);
                    if (m.method === "list") c.write(line({ id: m.id, result: [{ name: "get_user", description: "Look up a user", fields: { user_id: { type: "string" }, limit: { type: "number", optional: true, max: 50 } } }] }) + "\n");
                    else c.write(line({ id: m.id, result: { content: [{ type: "text", text: `${m.agent}:${m.params.name}:${m.params.args.user_id}` }] } }) + "\n");
                }
            });
        });
        await new Promise<void>(r => server.listen(sock, r));
        const child = spawn(process.execPath, [script], { env: { ...process.env, EVI_CLAUDE_SOCK: sock, EVI_CLAUDE_AGENT: "agent-1" } });
        const replies: any[] = [];
        child.stdout.on("data", d => String(d).split("\n").filter(Boolean).forEach(l => replies.push(JSON.parse(l))));
        const send = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
        send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
        send({ method: "notifications/initialized" });
        send({ id: 2, method: "tools/list" });
        send({ id: 3, method: "tools/call", params: { name: "get_user", arguments: { user_id: "42" } } });
        send({ id: 4, method: "nope" });
        for (let t = 0; t < 100 && replies.length < 4; t++) await new Promise(r => setTimeout(r, 50));
        child.kill();
        server.close();
        const byId = Object.fromEntries(replies.map(r => [r.id, r]));
        expect(byId[1].result.serverInfo.name).toBe("discord");
        expect(byId[2].result.tools[0].inputSchema).toEqual({ type: "object", properties: { user_id: { type: "string" }, limit: { type: "number", maximum: 50 } }, required: ["user_id"] });
        expect(byId[3].result.content[0].text).toBe("agent-1:get_user:42");
        expect(byId[4].error.code).toBe(-32601);
    });
});

describe("tool labels", () => {
    test("describe what a tool did", () => {
        const read = toolLabel("Read", { file_path: "/a/b/index.ts" });
        expect(read.verb.toLowerCase()).toContain("read");
        expect(read.meta).toContain("index.ts");
        const discord = toolLabel("mcp__discord__read_messages", { channel_id: "1" });
        expect(discord.verb.length).toBeGreaterThan(0);
    });
});
