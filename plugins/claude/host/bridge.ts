/**
 * The Discord tools' MCP server, as a standalone script. The Claude and Codex CLIs start it over stdio (it's written to
 * the plugin's data folder and run with Electron's own Node: ELECTRON_RUN_AS_NODE=1). It has no dependencies: it speaks
 * MCP's JSON-RPC over stdin/stdout and forwards tool calls over a local socket to the plugin, which runs them inside
 * Discord.
 *
 * Environment: EVI_CLAUDE_SOCK (socket or pipe path), EVI_CLAUDE_AGENT (which session is asking).
 */
export const BRIDGE_SOURCE = String.raw`
"use strict";
const net = require("net");
const SOCK = process.env.EVI_CLAUDE_SOCK;
const AGENT = process.env.EVI_CLAUDE_AGENT;

let conn = null;
let nextId = 1;
const pending = new Map();
function connect() {
    if (conn) return conn;
    conn = net.createConnection(SOCK);
    let buf = "";
    conn.on("data", d => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            try {
                const m = JSON.parse(line);
                const p = pending.get(m.id);
                pending.delete(m.id);
                if (p) p(m);
            } catch {}
        }
    });
    const fail = msg => {
        for (const r of pending.values()) r({ error: msg });
        pending.clear();
        conn = null;
    };
    conn.on("error", e => fail(String(e && e.message || e)));
    conn.on("close", () => fail("Discord closed the connection"));
    return conn;
}
function ask(method, params) {
    return new Promise(resolve => {
        const id = nextId++;
        pending.set(id, resolve);
        connect().write(JSON.stringify({ id, agent: AGENT, method, params }) + "\n");
    });
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function schema(fields) {
    const properties = {};
    const required = [];
    for (const [k, f] of Object.entries(fields || {})) {
        properties[k] = { type: f.type, ...(f.description ? { description: f.description } : {}), ...(f.max ? (f.type === "string" ? { maxLength: f.max } : { maximum: f.max }) : {}) };
        if (!f.optional) required.push(k);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
}

async function handle(m) {
    const reply = result => m.id !== undefined && send({ jsonrpc: "2.0", id: m.id, result });
    const error = (code, message) => m.id !== undefined && send({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    switch (m.method) {
        case "initialize":
            return reply({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "discord", version: "1.0.0" } });
        case "ping":
            return reply({});
        case "tools/list": {
            const r = await ask("list", {});
            if (r.error) return error(-32000, r.error);
            return reply({ tools: r.result.map(t => ({ name: t.name, description: t.description, inputSchema: schema(t.fields) })) });
        }
        case "tools/call": {
            const r = await ask("call", { name: m.params && m.params.name, args: (m.params && m.params.arguments) || {} });
            if (r.error) return reply({ content: [{ type: "text", text: "Error: " + r.error }], isError: true });
            return reply(r.result);
        }
        default:
            if (m.method && m.method.startsWith("notifications/")) return;
            return error(-32601, "Method not found: " + m.method);
    }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => {
    input += d;
    let i;
    while ((i = input.indexOf("\n")) >= 0) {
        const line = input.slice(0, i).trim();
        input = input.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        handle(m).catch(e => m.id !== undefined && send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: String(e && e.message || e) } }));
    }
});
process.stdin.on("end", () => process.exit(0));
`;
