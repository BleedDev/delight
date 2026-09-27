/**
 * The Claude plugin's main-process side: runs Claude Code and Codex sessions, holds their approvals, serves the
 * Discord tools, does git for the Changes pane, and keeps the chat list. The renderer talks to it through two
 * native calls: `invoke(channel, args)` for requests and `poll(cursor)` for the event stream (a long poll, since
 * native plugins can't push).
 */
import { BrowserWindow, dialog, Notification, powerSaveBlocker, shell } from "electron";
import { execFile, execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { BRIDGE_SOURCE } from "./bridge";
import { ClaudeSession, claudeBinary } from "./claude";
import { CodexSession } from "./codex";
import { getSessionMessages, listSessions } from "./history";

export interface HostSession {
    localId: string;
    cwd: string;
    busy?: boolean;
    sessionId?: string;
    caps?: any;
    permissionMode?: string;
    turnOrigin?: "human" | "channel";
    lastActive?: number;
    startedAt?: number;
    start(): Promise<void>;
    send(content: any[], uuid?: string, origin?: any): void;
    interrupt(): Promise<unknown> | unknown;
    setPermissionMode(mode: string): Promise<unknown> | unknown;
    setModel(model?: string): Promise<unknown> | unknown;
    setEffort(effort: string): Promise<unknown> | unknown;
    setFast(on: boolean): Promise<unknown> | unknown;
    close(): void;
    control?(req: any): Promise<any>;
    answer?(requestId: string, decision: any): boolean;
    contextUsage?(): Promise<any>;
    usage?(): Promise<any>;
    rewindFiles?(userMessageId: string, dryRun?: boolean): Promise<any>;
    mcpStatus?(): Promise<any>;
    toggleMcp?(name: string, enabled: boolean): Promise<any>;
    reconnectMcp?(name: string): Promise<any>;
    stopTask?(taskId: string): Promise<any>;
}

const NEEDS_APPROVAL = new Set(["send_message", "edit_message", "delete_message", "add_reaction"]);
const IDLE_MS = 20 * 60_000;

export function createHub(dataDir: string) {
    const sessions = new Map<string, HostSession>();
    const pendingPermissions = new Map<string, { resolve: (d: any) => void; input: any; localId: string; ev: any; }>();
    const pendingRequests = new Map<string, { resolve: (r: any) => void; localId: string; ev: any; }>();
    const pendingDiscordCalls = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; }>();
    const disposers: (() => void)[] = [];
    fs.mkdirSync(dataDir, { recursive: true });
    const STATE_FILE = path.join(dataDir, "chats.json");

    // ------------------------------------------------------------ event stream (long poll)
    let seq = 0;
    const events: { seq: number; ev: any; }[] = [];
    let waiters: (() => void)[] = [];
    function push(ev: any) {
        events.push({ seq: ++seq, ev });
        if (events.length > 4000) events.splice(0, events.length - 4000);
        const w = waiters;
        waiters = [];
        for (const f of w) f();
    }
    const emit = (localId: string, type: string, data?: any) => push({ kind: "agent", localId, type, data });
    async function poll(cursor: number, timeoutMs = 25_000) {
        if (cursor > seq) cursor = 0; // the host restarted: start over
        if (!events.some(e => e.seq > cursor)) {
            await new Promise<void>(resolve => {
                const t = setTimeout(done, timeoutMs);
                function done() { clearTimeout(t); resolve(); }
                waiters.push(done);
            });
        }
        const out = events.filter(e => e.seq > cursor);
        return { cursor: out.length ? out[out.length - 1].seq : Math.max(cursor, seq), events: out.map(e => e.ev) };
    }

    // ------------------------------------------------------------ environment
    let shellEnv: Record<string, string> | null = null;
    function userEnv() {
        if (shellEnv) return shellEnv;
        // Login shells know the user's PATH (bun, node, git, claude…); GUI-launched apps don't
        try {
            if (process.platform === "win32") throw 0;
            const sh = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
            const out = execFileSync(sh, ["-lc", "env -0"], { maxBuffer: 4 << 20 }).toString();
            shellEnv = Object.fromEntries(out.split("\0").filter(Boolean).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
        } catch {
            shellEnv = { ...process.env } as Record<string, string>;
        }
        delete shellEnv!.ELECTRON_RUN_AS_NODE;
        return shellEnv!;
    }
    const win = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().includes("discord")) ?? BrowserWindow.getAllWindows()[0];

    // ------------------------------------------------------------ chats (metadata; transcripts live in the CLIs' own stores)
    function readState() {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch {
            return { chats: [] };
        }
    }
    function writeState(s: any) {
        // temp file + rename: a crash mid-write can't leave a truncated file (which would read as "no chats")
        const tmp = `${STATE_FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
        fs.renameSync(tmp, STATE_FILE);
    }
    function updateChat(localId: string, patch: any) {
        const s = readState();
        const c = s.chats.find((x: any) => x.localId === localId);
        if (c) Object.assign(c, patch, { updatedAt: Date.now() });
        writeState(s);
        emit(localId, "chat-updated", c);
    }

    // ------------------------------------------------------------ notifications
    let prefs: Record<string, boolean> = { enabled: true, approval: true, question: true, done: true, sound: true };
    function notify(title: string, body: string, localId: string, force = false, kind?: string) {
        if (!prefs.enabled && !force) return;
        if (kind && prefs[kind] === false) return;
        const w = win();
        if (!force && w?.isFocused()) return;
        try {
            const n = new Notification({ title, body, silent: !prefs.sound });
            n.on("click", () => {
                w?.show();
                w?.focus();
                emit(localId, "focus", {});
            });
            n.show();
        } catch { }
    }

    // ------------------------------------------------------------ Discord tools (run in the renderer, in the user's own session)
    function callDiscord(method: string, args: any) {
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            pendingDiscordCalls.set(id, { resolve, reject });
            push({ kind: "discord-call", id, method, args });
            setTimeout(() => {
                if (!pendingDiscordCalls.has(id)) return;
                pendingDiscordCalls.delete(id);
                reject(new Error("Discord didn't answer (is it open?)"));
            }, 30_000);
        });
    }
    type Field = { type: "string" | "number" | "boolean"; optional?: boolean; max?: number; description?: string; };
    const s = (optional = false, max?: number): Field => ({ type: "string", optional, max });
    const n = (optional = true, max?: number): Field => ({ type: "number", optional, max });
    const b = (optional = true): Field => ({ type: "boolean", optional });
    function toolSpecs(localId: string) {
        const text = (v: any) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
        const wrap = (fn: (a: any) => any) => async (a: any) => {
            try {
                return text(await fn(a ?? {}));
            } catch (e: any) {
                return { content: [{ type: "text", text: `Error: ${e?.message ?? e}` }], isError: true };
            }
        };
        const tool = (name: string, description: string, fields: Record<string, Field>, handler: (a: any) => any) => ({
            name,
            description,
            fields,
            // acting-as-you tools ask inside the handler, so no permission mode, allow rule or hook can skip the card
            handler: NEEDS_APPROVAL.has(name)
                ? async (a: any) => ((await askDiscordApproval(localId, name, a ?? {})) ? handler(a) : { content: [{ type: "text", text: "The user declined." }], isError: true })
                : handler,
        });
        const d = (m: string) => wrap(a => callDiscord(m, a));
        return [
            tool("list_conversations", "List the user's recent Discord DMs and group DMs (id, name, last activity).", { limit: n() }, d("listConversations")),
            tool("list_servers", "List the user's Discord servers and their text channels.", {}, d("listServers")),
            tool("read_messages", "Read message history of a Discord channel or DM, newest last. Use `before` (message id) to page back, `after` to read newer messages.", { channel_id: s(), limit: n(true, 100), before: s(true), after: s(true) }, d("readMessages")),
            tool("search_messages", "Search Discord messages. Scope with guild_id or channel_id; filter by author_id.", { query: s(), guild_id: s(true), channel_id: s(true), author_id: s(true) }, d("searchMessages")),
            tool("get_user", "Look up a Discord user (and their profile) by id.", { user_id: s() }, d("getUser")),
            tool("draft_reply", "Prepare a reply for the user to review. It appears as a draft card; the user can put it into the Discord message box themselves. Nothing is sent.", { channel_id: s(), content: s(), reply_to_message_id: s(true) }, wrap(a => {
                emit(localId, "draft", a);
                return "Draft ready for the user to review.";
            })),
            tool("open_channel", "Open a Discord channel/DM in the UI for the user.", { channel_id: s() }, d("openChannel")),
            tool("current_context", "What the user is currently looking at in Discord (open channel, attached DM).", {}, wrap(() => callDiscord("currentContext", { localId }))),
            tool("current_user", "The Discord account this is running as (id, username, status).", {}, d("currentUser")),
            tool("send_message", "Send a Discord message as the user. Approved one by one unless the session is in Bypass mode. Prefer draft_reply unless the user asked you to send.", { channel_id: s(), content: s(false, 2000), reply_to_message_id: s(true) }, d("sendMessage")),
            tool("edit_message", "Edit one of the user's own Discord messages.", { channel_id: s(), message_id: s(), content: s(false, 2000) }, d("editMessage")),
            tool("delete_message", "Delete one of the user's own Discord messages.", { channel_id: s(), message_id: s() }, d("deleteMessage")),
            tool("add_reaction", "React to a Discord message with an emoji (unicode, or name:id for custom).", { channel_id: s(), message_id: s(), emoji: s() }, d("addReaction")),
            tool("get_channel", "Details about a channel or DM: name, type, server, topic, recipients, unread state.", { channel_id: s() }, d("getChannel")),
            tool("get_message", "Fetch a single Discord message by id.", { channel_id: s(), message_id: s() }, d("getMessage")),
            tool("get_unread", "Channels and DMs with unread messages, mentions first.", { limit: n() }, d("getUnread")),
            tool("get_mentions", "Recent messages that mention the user.", { limit: n(), guild_id: s(true) }, d("getMentions")),
            tool("list_friends", "The user's friends with their online status and current activity.", {}, d("listFriends")),
            tool("get_presence", "A user's online status and activities.", { user_id: s() }, d("getPresence")),
            tool("get_server", "Details about a server: channels, voice channels, roles, member count.", { guild_id: s() }, d("getGuild")),
            tool("search_members", "Search members of a server by name.", { guild_id: s(), query: s(), limit: n() }, d("searchMembers")),
            tool("get_pins", "Pinned messages in a channel.", { channel_id: s() }, d("getPins")),
            tool("get_voice", "Who is in voice channels (optionally in one server).", { guild_id: s(true) }, d("getVoice")),
            tool("open_dm", "Open (or create) a DM with a user and show it.", { user_id: s() }, d("openDm")),
            tool("mark_read", "Mark a channel or DM as read.", { channel_id: s() }, d("markRead")),
            tool("watch_channel", "Watch a channel/DM: every new message there is delivered to you as a new turn, so you can react (e.g. draft replies). Set watch=false to stop.", { channel_id: s(), watch: b() }, wrap(a => callDiscord("watchChannel", { ...a, localId }))),
            tool("notify_user", "Ping the user with a desktop notification and a badge on this chat (when something needs their attention).", { title: s(), body: s(true) }, wrap(a => {
                emit(localId, "ping", a);
                notify(a.title, a.body ?? "", localId, true);
                return "Notified.";
            })),
        ];
    }
    function askDiscordApproval(localId: string, name: string, input: any): Promise<boolean> {
        // Bypass mode is the user's explicit "don't ask": honoured, except in turns started by someone else's incoming
        // Discord message (a watched channel), so a stranger can't make the agent post as the user
        const sess = sessions.get(localId);
        if (sess?.permissionMode === "bypassPermissions" && sess.turnOrigin !== "channel") return Promise.resolve(true);
        return new Promise(resolve => {
            const requestId = crypto.randomUUID();
            const ev = { requestId, toolName: `mcp__discord__${name}`, input, at: Date.now() };
            pendingPermissions.set(requestId, { resolve: d => resolve(d.behavior === "allow"), input, localId, ev });
            emit(localId, "permission", ev);
            notify("Your agent wants to act on Discord", name.replace(/_/g, " "), localId, false, "approval");
        });
    }

    // The MCP bridge (host/bridge.ts) connects here; one socket serves every session, keyed by EVI_CLAUDE_AGENT
    const SOCK = process.platform === "win32" ? `\\\\.\\pipe\\evi-claude-${process.pid}` : path.join(dataDir, `mcp-${process.pid}.sock`);
    const BRIDGE = path.join(dataDir, "discord-mcp.js");
    let mcpServer: net.Server | null = null;
    function ensureBridge() {
        fs.writeFileSync(BRIDGE, BRIDGE_SOURCE);
        if (mcpServer) return;
        if (process.platform !== "win32") {
            for (const f of fs.readdirSync(dataDir)) {
                const pid = /^mcp-(\d+)\.sock$/.exec(f)?.[1];
                if (!pid) continue;
                let alive = false;
                try {
                    process.kill(Number(pid), 0);
                    alive = Number(pid) !== process.pid;
                } catch { }
                if (!alive) try { fs.unlinkSync(path.join(dataDir, f)); } catch { }
            }
        }
        mcpServer = net.createServer(c => {
            let buf = "";
            c.on("data", async d => {
                buf += d;
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, i);
                    buf = buf.slice(i + 1);
                    let m: any;
                    try {
                        m = JSON.parse(line);
                    } catch {
                        continue;
                    }
                    const reply = (x: any) => c.write(JSON.stringify({ id: m.id, ...x }) + "\n");
                    const specs = toolSpecs(String(m.agent));
                    if (m.method === "list") reply({ result: specs.map(t => ({ name: t.name, description: t.description, fields: t.fields })) });
                    else if (m.method === "call") {
                        const t = specs.find(x => x.name === m.params?.name);
                        if (!t) reply({ error: "Unknown tool" });
                        else reply({ result: await t.handler(m.params.args ?? {}) });
                    }
                }
            });
            c.on("error", () => { });
        });
        mcpServer.on("error", e => console.warn("[Claude] MCP socket", e.message));
        mcpServer.listen(SOCK);
        disposers.push(() => {
            mcpServer?.close();
            mcpServer = null;
            if (process.platform !== "win32") try { fs.unlinkSync(SOCK); } catch { }
        });
    }
    function bridgeServer(localId: string) {
        ensureBridge();
        return { command: process.execPath, args: [BRIDGE], env: { ELECTRON_RUN_AS_NODE: "1", EVI_CLAUDE_SOCK: SOCK, EVI_CLAUDE_AGENT: localId } };
    }

    // ------------------------------------------------------------ sessions
    function cancelPending(localId: string) {
        for (const [id, p] of pendingPermissions)
            if (p.localId === localId) {
                pendingPermissions.delete(id);
                p.resolve({ behavior: "deny", message: "Cancelled" });
                emit(localId, "permission-cancelled", { requestId: id });
            }
        for (const [id, p] of pendingRequests)
            if (p.localId === localId) {
                pendingRequests.delete(id);
                p.resolve({ action: "cancel" });
                emit(localId, "request-cancelled", { requestId: id });
            }
    }
    function systemAppend(attachedChannelId?: string | null) {
        return (
            "You are running inside Discord (through Evi's Claude plugin) and have deep access to Discord through the discord MCP tools: " +
            "read any DM/channel history, search, unread and mention inboxes, friends/presence, servers/members/pins/voice, open channels and DMs, mark read, " +
            "watch a channel so new messages wake you (they arrive wrapped in <discord-event>), and ping the user with notify_user. " +
            "To reply for the user, prefer draft_reply (they review and send). send_message/edit_message/delete_message/add_reaction act as the user (approved one by one unless the session is in Bypass mode); only use them when asked. " +
            "Never claim a message was sent unless send_message returned sent: true." +
            (attachedChannelId ? ` This session is attached to the Discord conversation ${attachedChannelId}; use it as the default context.` : "") +
            " When a <discord-event> arrives, briefly tell the user what came in and, if it needs an answer, prepare one with draft_reply. Keep it short."
        );
    }
    function createSession(opts: any): HostSession {
        const localId = opts.localId;
        if (opts.provider === "codex") {
            const bridge = bridgeServer(localId);
            const toml = (v: unknown) => JSON.stringify(v);
            const sess: any = new (CodexSession as any)(opts, {
                env: userEnv(),
                extraArgs: [
                    "-c", `mcp_servers.discord.command=${toml(bridge.command)}`,
                    "-c", `mcp_servers.discord.args=${toml(bridge.args)}`,
                    "-c", `mcp_servers.discord.env={ ELECTRON_RUN_AS_NODE = "1", EVI_CLAUDE_SOCK = ${toml(bridge.env.EVI_CLAUDE_SOCK)}, EVI_CLAUDE_AGENT = ${toml(localId)} }`,
                ],
                emit: (type: string, data: any) => {
                    if (type === "permission") notify(data.toolName === "AskUserQuestion" ? "Codex has a question" : "Codex needs your approval", data.toolName, localId, false, data.toolName === "AskUserQuestion" ? "question" : "approval");
                    emit(localId, type, data);
                },
                updateChat: (patch: any) => updateChat(localId, patch),
                notify: (title: string, body: string) => notify(title, body, localId, false, "done"),
                onExit: () => {
                    if (sessions.get(localId) !== sess) return;
                    sessions.delete(localId);
                    cancelPending(localId);
                },
            });
            return sess;
        }
        const sess: ClaudeSession = new ClaudeSession(opts, {
            binary: claudeBinary(userEnv()),
            env: userEnv(),
            mcpServers: { discord: bridgeServer(localId) },
            appendSystemPrompt: systemAppend(opts.attachedChannelId),
            emit: (type, data) => {
                if (type === "message" && data?.type === "system" && data.subtype === "init") updateChat(localId, { sessionId: data.session_id, model: data.model });
                if (type === "message" && data?.type === "result") notify("Claude finished", resultSummary(data), localId, false, "done");
                emit(localId, type, data);
            },
            // tool permission prompts from the CLI
            canUseTool: (req, signal) => new Promise(resolve => {
                // Discord tools: the acting-as-you ones ask inside their handler (every time), the rest are read-only
                if (req.toolName.startsWith("mcp__discord__")) return resolve({ behavior: "allow", updatedInput: req.input });
                const requestId = crypto.randomUUID();
                const ev = { ...req, requestId, at: Date.now() };
                pendingPermissions.set(requestId, { resolve, input: req.input, localId, ev });
                emit(localId, "permission", ev);
                if (req.toolName === "AskUserQuestion") notify("Claude has a question", req.input?.questions?.[0]?.question ?? "", localId, false, "question");
                else notify("Claude needs your approval", req.toolName, localId, false, "approval");
                signal.addEventListener("abort", () => {
                    if (!pendingPermissions.has(requestId)) return;
                    pendingPermissions.delete(requestId);
                    emit(localId, "permission-cancelled", { requestId });
                    resolve({ behavior: "deny", message: "Cancelled" });
                });
            }),
            // MCP elicitations and CLI dialogs: cards in the UI, answered through agents:respond
            ask: (kind, data, signal, cancelled) => new Promise(resolve => {
                const requestId = crypto.randomUUID();
                const ev = { requestId, kind, data, at: Date.now() };
                pendingRequests.set(requestId, { resolve, localId, ev });
                emit(localId, "request", ev);
                notify(kind === "elicitation" ? `${data?.serverName ?? "A tool"} needs your input` : "Claude Code needs your input", data?.message ?? "", localId, false, "question");
                signal.addEventListener("abort", () => {
                    if (!pendingRequests.has(requestId)) return;
                    pendingRequests.delete(requestId);
                    emit(localId, "request-cancelled", { requestId });
                    resolve(cancelled);
                });
            }),
            onExit: (error?: string) => {
                // a replaced/stopped session ending mustn't reset the UI of the one that took its place
                if (sessions.get(localId) !== sess) return;
                emit(localId, "status", error ? { state: "error", error } : { state: "ended" });
                sessions.delete(localId);
                cancelPending(localId);
            },
        });
        return sess;
    }
    // register + start; a session that fails to start doesn't stay behind as a zombie
    async function startSession(localId: string, opts: any) {
        const sess = createSession({ ...opts, localId });
        sessions.set(localId, sess);
        try {
            await sess.start();
        } catch (e: any) {
            if (sessions.get(localId) === sess) sessions.delete(localId);
            try { sess.close(); } catch { }
            emit(localId, "status", { state: "error", error: String(e?.message ?? e) });
            throw e;
        }
        return sess;
    }
    const reaper = setInterval(() => {
        for (const [localId, sess] of sessions) {
            const waiting = [...pendingPermissions.values(), ...pendingRequests.values()].some(p => p.localId === localId);
            if (!sess.busy && !waiting && Date.now() - (sess.lastActive ?? sess.startedAt ?? 0) > IDLE_MS) {
                sess.close();
                sessions.delete(localId);
                emit(localId, "status", { state: "idle" });
            }
        }
    }, 60_000);
    disposers.push(() => clearInterval(reaper));

    // ------------------------------------------------------------ git
    function run(cmd: string, args: string[], cwd: string, input?: string) {
        return new Promise<{ ok: boolean; code: any; stdout: string; stderr: string; }>(resolve => {
            const cp = execFile(cmd, args, { cwd, env: userEnv(), maxBuffer: 32 << 20, timeout: 60_000 }, (err: any, stdout, stderr) =>
                resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr || err?.message || "") }));
            if (input != null) {
                cp.stdin?.write(input);
                cp.stdin?.end();
            }
        });
    }
    // literal pathspecs: a file named `*` or `[ab].ts` means just that file
    const git = (cwd: string, ...args: string[]) => run("git", ["--literal-pathspecs", ...args], cwd);
    async function gitStatus(cwd: string) {
        const top = await git(cwd, "rev-parse", "--show-toplevel");
        if (!top.ok) return { repo: false };
        const root = top.stdout.trim();
        const [branch, status, numstat, cached, upstream, remote] = await Promise.all([
            git(root, "branch", "--show-current"),
            git(root, "status", "--porcelain=v1", "-z", "-uall"), // -z: raw paths, no C-quoting
            git(root, "diff", "--numstat", "-z", "--no-renames"),
            git(root, "diff", "--cached", "--numstat", "-z", "--no-renames"),
            git(root, "rev-list", "--left-right", "--count", "@{upstream}...HEAD"),
            git(root, "remote", "get-url", "origin"),
        ]);
        const counts: Record<string, { adds: number; dels: number; }> = {};
        for (const line of (numstat.stdout + cached.stdout).split("\0").filter(Boolean)) {
            const [a, d, f] = line.split("\t");
            const c = (counts[f] ??= { adds: 0, dels: 0 });
            c.adds += Number(a) || 0;
            c.dels += Number(d) || 0;
        }
        const entries = status.stdout.split("\0");
        const files: any[] = [];
        for (let i = 0; i < entries.length; i++) {
            const l = entries[i];
            if (!l) continue;
            const x = l[0], y = l[1];
            const p = l.slice(3);
            if (x === "R" || x === "C") i++; // the original path follows as its own entry
            const kind = x === "?" ? "untracked" : x === "A" || y === "A" ? "added" : x === "D" || y === "D" ? "deleted" : x === "R" ? "renamed" : "modified";
            files.push({ path: p, staged: x !== " " && x !== "?", kind, ...(counts[p] ?? {}) });
        }
        const [behind, ahead] = upstream.ok ? upstream.stdout.trim().split(/\s+/).map(Number) : [0, 0];
        return { repo: true, root, branch: branch.stdout.trim() || "(detached)", files, ahead, behind, hasUpstream: upstream.ok, remote: remote.ok ? remote.stdout.trim() : null };
    }
    async function gitFileDiff(cwd: string, file: string) {
        const root = (await git(cwd, "rev-parse", "--show-toplevel")).stdout.trim();
        const head = await git(root, "show", `HEAD:${file}`);
        let now = "";
        try { now = fs.readFileSync(path.join(root, file), "utf8"); } catch { }
        return { old: head.ok ? head.stdout : "", new: now };
    }
    // @-mention suggestions without the CLI (Codex): tracked + untracked files matching the query
    async function listFiles(cwd: string, query: string) {
        const out = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], cwd);
        const q = String(query || "").toLowerCase();
        const score = (f: string) => {
            const l = f.toLowerCase();
            const base = l.split("/").pop()!;
            return base.startsWith(q) ? 0 : base.includes(q) ? 1 : l.includes(q) ? 2 : 9;
        };
        return out.stdout.split("\n").filter(Boolean)
            .map(f => [f, score(f)] as const)
            .filter(([, sc]) => !q || sc < 9)
            .sort((a, z) => a[1] - z[1] || a[0].length - z[0].length)
            .slice(0, 30)
            .map(([f]) => ({ path: f }));
    }

    // ------------------------------------------------------------ requests from the renderer
    const str = (v: unknown, name: string) => {
        if (typeof v !== "string") throw new Error(`${name} must be a string`);
        return v;
    };
    let awakeId: number | null = null;
    const handlers: Record<string, (...a: any[]) => any> = {
        "agents:state": () => readState(),
        "agents:save-state": (st: any) => {
            if (!st || !Array.isArray(st.chats)) throw new Error("Bad state");
            writeState(st);
        },
        "agents:pick-folder": async () => {
            const w = win();
            const r = w ? await dialog.showOpenDialog(w, { properties: ["openDirectory", "createDirectory"] }) : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
            return r.canceled ? null : r.filePaths[0];
        },
        "agents:list-sessions": (o: any) => listSessions(o ?? {}),
        "agents:history": (id: string, dir?: string) => getSessionMessages(str(id, "session id"), dir),
        "agents:start": async (opts: any) => {
            if (opts.warm && sessions.has(opts.localId)) return true;
            sessions.get(opts.localId)?.close();
            await startSession(str(opts.localId, "localId"), opts);
            return true;
        },
        "agents:send": async (localId: string, content: any[], opts: any, uuid?: string) => {
            let sess = sessions.get(localId);
            if (!sess) sess = await startSession(str(localId, "localId"), opts);
            sess.turnOrigin = "human";
            sess.send(content, uuid);
            return true;
        },
        "agents:interrupt": async (localId: string) => {
            cancelPending(localId);
            return sessions.get(localId)?.interrupt();
        },
        "agents:set-mode": async (localId: string, mode: string) => {
            const sess = sessions.get(localId);
            if (sess) {
                sess.permissionMode = mode;
                await sess.setPermissionMode(mode);
            }
        },
        "agents:set-model": (localId: string, model?: string) => sessions.get(localId)?.setModel(model),
        "agents:set-effort": (localId: string, effort: string) => sessions.get(localId)?.setEffort(effort),
        "agents:set-fast": (localId: string, on: boolean) => sessions.get(localId)?.setFast(!!on),
        "agents:context-usage": (localId: string) => sessions.get(localId)?.contextUsage?.(),
        "agents:usage": (localId: string) => sessions.get(localId)?.usage?.(),
        "agents:file-suggestions": async (localId: string, query: string, cwd: string) => {
            const sess = sessions.get(localId);
            if (sess?.control) try { return await sess.control({ subtype: "file_suggestions", query }); } catch { }
            return listFiles(sess?.cwd ?? cwd, query);
        },
        "agents:rewind": (localId: string, userMessageId: string, dryRun?: boolean) => sessions.get(localId)?.rewindFiles?.(userMessageId, dryRun),
        "agents:mcp-status": (localId: string) => sessions.get(localId)?.mcpStatus?.(),
        "agents:toggle-mcp": (localId: string, name: string, enabled: boolean) => sessions.get(localId)?.toggleMcp?.(name, enabled),
        "agents:reconnect-mcp": (localId: string, name: string) => sessions.get(localId)?.reconnectMcp?.(name),
        "agents:stop-task": (localId: string, taskId: string) => sessions.get(localId)?.stopTask?.(taskId),
        "agents:running": (localId: string) => sessions.has(localId),
        // after a renderer reload: which sessions are alive/busy and which approvals are still waiting
        "agents:snapshot": () => ({
            sessions: [...sessions.entries()].map(([localId, sess]) => ({ localId, busy: !!sess.busy, sessionId: sess.sessionId, caps: sess.caps })),
            permissions: [...pendingPermissions.values()].map(p => ({ localId: p.localId, ...p.ev })),
            requests: [...pendingRequests.values()].map(p => ({ localId: p.localId, ...p.ev })),
        }),
        "agents:stop": (localId: string) => {
            sessions.get(localId)?.close();
            sessions.delete(localId);
            cancelPending(localId);
        },
        "agents:permission": (requestId: string, decision: any) => {
            const p = pendingPermissions.get(requestId);
            if (!p) {
                for (const sess of sessions.values()) if (sess.answer?.(requestId, decision)) return;
                return;
            }
            pendingPermissions.delete(requestId);
            if (decision?.allow) p.resolve({ behavior: "allow", updatedInput: decision.updatedInput ?? p.input, ...(decision.updatedPermissions ? { updatedPermissions: decision.updatedPermissions } : {}) });
            else p.resolve({ behavior: "deny", message: decision?.message || "The user declined.", interrupt: !!decision?.interrupt });
        },
        "agents:respond": (requestId: string, result: any) => {
            const p = pendingRequests.get(requestId);
            if (!p) {
                for (const sess of sessions.values()) if (sess.answer?.(requestId, { ...result, allow: result?.action === "accept" })) return;
                return;
            }
            pendingRequests.delete(requestId);
            p.resolve(result);
        },
        "agents:open-path": (p: string) => shell.openPath(str(p, "path")),
        "agents:reveal-path": (p: string) => shell.showItemInFolder(str(p, "path")),
        // "Open in Terminal": continue the session in the system terminal (the user clicked it)
        "agents:open-terminal": (cwd: string, sessionId?: string) => {
            const q = (v: string) => `'${String(v).replace(/'/g, "'\\''")}'`;
            const cmd = `cd ${q(cwd)}${sessionId ? ` && claude --resume ${q(sessionId)}` : ""}`;
            if (process.platform === "darwin") return run("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, "-e", 'tell application "Terminal" to activate'], cwd);
            if (process.platform === "win32") return run("cmd.exe", ["/c", "start", "cmd", "/k", `cd /d "${cwd}"${sessionId ? ` && claude --resume ${sessionId}` : ""}`], cwd);
            return run("x-terminal-emulator", ["-e", "bash", "-lc", `${cmd}; exec bash`], cwd);
        },
        // composer "!" shell mode: the user's own command, run in the session folder
        "agents:shell": async (cwd: string, cmd: string) => {
            const sh = process.platform === "win32" ? "cmd.exe" : process.env.SHELL || "/bin/sh";
            const r = await run(sh, process.platform === "win32" ? ["/c", str(cmd, "command")] : ["-lc", str(cmd, "command")], str(cwd, "cwd"));
            return { ok: r.ok, code: r.code, stdout: r.stdout.slice(-20000), stderr: r.stderr.slice(-8000) };
        },
        "agents:set-notifications": (p: any) => void (prefs = typeof p === "object" && p ? { ...prefs, ...p } : { ...prefs, enabled: !!p }),
        "agents:keep-awake": (on: boolean) => {
            if (on && awakeId == null) awakeId = powerSaveBlocker.start("prevent-app-suspension");
            else if (!on && awakeId != null) (powerSaveBlocker.stop(awakeId), (awakeId = null));
            return awakeId != null;
        },
        "agents:env": () => ({ home: os.homedir(), platform: process.platform, claude: claudeBinary(userEnv()) }),
        "git:status": (cwd: string) => gitStatus(str(cwd, "cwd")),
        "git:file-diff": (cwd: string, file: string) => gitFileDiff(str(cwd, "cwd"), str(file, "file")),
        "git:commit": async (cwd: string, message: string, files?: string[]) => {
            const root = (await git(cwd, "rev-parse", "--show-toplevel")).stdout.trim();
            const add = await git(root, "add", "--", ...(files?.length ? files : ["."]));
            if (!add.ok) return add;
            // only the picked files, even if other things were staged before
            return run("git", ["--literal-pathspecs", "commit", "-F", "-", ...(files?.length ? ["--", ...files] : [])], root, str(message, "message"));
        },
        "git:push": async (cwd: string) => {
            const st: any = await gitStatus(cwd);
            return st.hasUpstream ? git(st.root, "push") : git(st.root, "push", "-u", "origin", st.branch);
        },
        // push the branch (setting upstream) and open the PR; no title = gh fills it from the commits
        "git:pr": async (cwd: string, title?: string, body?: string, draft?: boolean) => {
            const st: any = await gitStatus(cwd);
            if (!st.repo) return { ok: false, stderr: "Not a git repository" };
            const pushed = st.hasUpstream ? await git(st.root, "push") : await git(st.root, "push", "-u", "origin", st.branch);
            if (!pushed.ok) return pushed;
            return run("gh", ["pr", "create", ...(title ? ["--title", title, "--body", body || ""] : ["--fill"]), ...(draft ? ["--draft"] : [])], st.root);
        },
        "git:pr-merge": (cwd: string) => run("gh", ["pr", "merge", "--auto", "--squash"], cwd),
        "git:pr-ready": (cwd: string, ready: boolean) => run("gh", ["pr", "ready", ...(ready ? [] : ["--undo"])], cwd),
        "git:pr-view": async (cwd: string) => {
            const r = await run("gh", ["pr", "view", "--json", "number,title,url,state,isDraft,reviewDecision,statusCheckRollup"], cwd);
            try { return r.ok ? JSON.parse(r.stdout) : null; } catch { return null; }
        },
        "git:discard": async (cwd: string, file: string) => {
            const root = (await git(cwd, "rev-parse", "--show-toplevel")).stdout.trim();
            const tracked = await git(root, "ls-files", "--error-unmatch", "--", file);
            if (tracked.ok) return git(root, "checkout", "HEAD", "--", file);
            // a new file goes to the Trash (recoverable), never deleted outright
            try {
                await shell.trashItem(path.join(root, file));
                return { ok: true };
            } catch (e: any) {
                return { ok: false, stderr: String(e?.message ?? e) };
            }
        },
        // a new message in a watched channel: wake (or revive) the session with it
        "discord:event": async (localId: string, ev: any) => {
            let sess = sessions.get(localId);
            if (!sess) {
                const c = readState().chats?.find((x: any) => x.localId === localId);
                if (!c) return;
                sess = await startSession(localId, { provider: c.provider, cwd: c.cwd, model: c.model, effort: c.effort, permissionMode: c.permissionMode, resume: c.sessionId, attachedChannelId: c.attachedChannelId }).catch(() => undefined);
                if (!sess) return;
            }
            const m = ev?.message ?? {};
            const text = `<discord-event>New message in ${ev.channel} (channel_id ${ev.channel_id}) from ${m.author} (user_id ${m.author_id}), message_id ${m.id}:\n${m.content ?? ""}${m.attachments ? `\n[attachments: ${m.attachments.map((a: any) => a.filename).join(", ")}]` : ""}</discord-event>`;
            emit(localId, "discord-event", ev);
            sess.turnOrigin = "channel";
            sess.send([{ type: "text", text }], undefined, { kind: "channel", server: "discord" });
        },
        "discord:result": ({ id, ok, value, error }: any) => {
            const p = pendingDiscordCalls.get(id);
            if (!p) return;
            pendingDiscordCalls.delete(id);
            ok ? p.resolve(value) : p.reject(new Error(error));
        },
    };

    return {
        async invoke(channel: unknown, args: unknown) {
            const h = typeof channel === "string" ? handlers[channel] : undefined;
            if (!h) throw new Error(`Unknown request: ${String(channel)}`);
            return h(...(Array.isArray(args) ? args : []));
        },
        poll,
        dispose() {
            for (const sess of sessions.values()) try { sess.close(); } catch { }
            sessions.clear();
            if (awakeId != null) powerSaveBlocker.stop(awakeId);
            for (const d of disposers.splice(0)) try { d(); } catch { }
            const w = waiters;
            waiters = [];
            for (const f of w) f();
        },
    };
}

function resultSummary(m: any) {
    if (m.subtype !== "success") return "Stopped: " + m.subtype;
    const t = String(m.result || "").replace(/\s+/g, " ").trim();
    return t.length > 120 ? t.slice(0, 117) + "…" : t || "Done";
}
