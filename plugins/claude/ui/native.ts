/**
 * The renderer's view of the plugin's native side, with the same shape the UI was written against:
 * `N().agents.start(...)`, `N().git.status(...)`, `N().agents.onEvent(cb)` and so on. Requests go through
 * `ctx.native.call("invoke", channel, args)`; events arrive through a long poll (`ctx.native.call("poll", cursor)`).
 */
import type { PluginContext } from "@evi/api";

type Listener = (ev: any) => void;
let ctx: PluginContext<any> | null = null;
let running = false;
const agentListeners = new Set<Listener>();
let discordHandler: ((method: string, args: any) => Promise<any>) | null = null;

const invoke = (channel: string, ...args: unknown[]) => {
    if (!ctx) return Promise.reject(new Error("The Claude plugin isn't running"));
    // arguments cross IPC: plain data only
    return ctx.native.call<any>("invoke", channel, JSON.parse(JSON.stringify(args ?? [])));
};

async function pump() {
    let cursor = 0;
    while (running && ctx) {
        let res: { cursor: number; events: any[] } | undefined;
        try {
            res = await ctx.native.call<{ cursor: number; events: any[] }>("poll", cursor);
        } catch (e) {
            if (!running) return;
            await new Promise(r => setTimeout(r, 1000)); // native side restarting: try again shortly
            continue;
        }
        if (!running) return;
        if (!res || typeof res !== "object" || !Array.isArray(res.events)) {
            await new Promise(r => setTimeout(r, 2000)); // not our native side answering: back off
            continue;
        }
        cursor = typeof res.cursor === "number" ? res.cursor : cursor;
        for (const ev of res.events) {
            if (ev.kind === "agent")
                for (const l of agentListeners)
                    try {
                        l({ localId: ev.localId, type: ev.type, data: ev.data });
                    } catch (e) {
                        console.error("[Claude] event", e);
                    }
            else if (ev.kind === "discord-call") runDiscordCall(ev);
        }
    }
}

async function runDiscordCall({ id, method, args }: any) {
    try {
        if (!discordHandler) throw new Error("Discord tools aren't ready");
        const value = await discordHandler(method, args);
        await invoke("discord:result", { id, ok: true, value: JSON.parse(JSON.stringify(value ?? null)) });
    } catch (e: any) {
        await invoke("discord:result", { id, ok: false, error: String(e?.message ?? e) }).catch(() => {});
    }
}

export function connectNative(c: PluginContext<any>) {
    ctx = c;
    running = true;
    void pump();
    c.onDispose(() => {
        running = false;
        ctx = null;
        agentListeners.clear();
        discordHandler = null;
    });
}

let env: { home: string; platform: string; claude: string } = { home: "", platform: "", claude: "claude" };
export async function loadEnv() {
    try {
        const e = await invoke("agents:env");
        if (e && typeof e === "object" && typeof e.home === "string") env = e;
    } catch {}
    return env;
}

const Native = {
    env: {
        get home() {
            return env.home;
        },
        get platform() {
            return env.platform;
        },
    },
    agents: {
        env: () => invoke("agents:env") as Promise<{ home: string; platform: string; claude: string }>,
        state: () => invoke("agents:state"),
        saveState: (s: any) => invoke("agents:save-state", s),
        pickFolder: () => invoke("agents:pick-folder"),
        listSessions: (o?: any) => invoke("agents:list-sessions", o ?? {}),
        history: (id: string, dir?: string) => invoke("agents:history", id, dir),
        start: (o: any) => invoke("agents:start", o),
        send: (id: string, content: any, o: any, uuid?: string) => invoke("agents:send", id, content, o, uuid),
        interrupt: (id: string) => invoke("agents:interrupt", id),
        setMode: (id: string, m: string) => invoke("agents:set-mode", id, m),
        setModel: (id: string, m?: string) => invoke("agents:set-model", id, m),
        setEffort: (id: string, e: string) => invoke("agents:set-effort", id, e),
        setFast: (id: string, on: boolean) => invoke("agents:set-fast", id, on),
        contextUsage: (id: string) => invoke("agents:context-usage", id),
        usage: (id: string) => invoke("agents:usage", id),
        fileSuggestions: (id: string, q: string, cwd: string) => invoke("agents:file-suggestions", id, q, cwd),
        rewind: (id: string, uid: string, dry?: boolean) => invoke("agents:rewind", id, uid, dry),
        mcpStatus: (id: string) => invoke("agents:mcp-status", id),
        stopTask: (id: string, t: string) => invoke("agents:stop-task", id, t),
        running: (id: string) => invoke("agents:running", id),
        snapshot: () => invoke("agents:snapshot"),
        respond: (reqId: string, result: any) => invoke("agents:respond", reqId, result),
        toggleMcp: (id: string, name: string, on: boolean) => invoke("agents:toggle-mcp", id, name, on),
        reconnectMcp: (id: string, name: string) => invoke("agents:reconnect-mcp", id, name),
        openPath: (p: string) => invoke("agents:open-path", p),
        revealPath: (p: string) => invoke("agents:reveal-path", p),
        openTerminal: (cwd: string, sessionId?: string) => invoke("agents:open-terminal", cwd, sessionId),
        keepAwake: (on: boolean) => invoke("agents:keep-awake", on),
        shell: (cwd: string, cmd: string) => invoke("agents:shell", cwd, cmd),
        setNotifications: (p: any) => invoke("agents:set-notifications", p),
        stop: (id: string) => invoke("agents:stop", id),
        permission: (reqId: string, d: any) => invoke("agents:permission", reqId, d),
        onEvent: (cb: Listener) => {
            agentListeners.add(cb);
            return () => void agentListeners.delete(cb);
        },
    },
    git: {
        status: (cwd: string) => invoke("git:status", cwd),
        fileDiff: (cwd: string, f: string) => invoke("git:file-diff", cwd, f),
        commit: (cwd: string, msg: string, files?: string[]) => invoke("git:commit", cwd, msg, files),
        push: (cwd: string) => invoke("git:push", cwd),
        pr: (cwd: string, title?: string, body?: string, draft?: boolean) => invoke("git:pr", cwd, title, body, draft),
        prMerge: (cwd: string) => invoke("git:pr-merge", cwd),
        prReady: (cwd: string, ready: boolean) => invoke("git:pr-ready", cwd, ready),
        prView: (cwd: string) => invoke("git:pr-view", cwd),
        discard: (cwd: string, f: string) => invoke("git:discard", cwd, f),
    },
    discord: {
        emit: (localId: string, ev: any) => invoke("discord:event", localId, ev),
        onCall: (handler: (method: string, args: any) => Promise<any>) => {
            discordHandler = handler;
        },
    },
    // Electron's webUtils isn't reachable from a plugin; dropped files come as images/text instead of paths
    pathForFile: (_file: File) => "",
};

export type NativeApi = typeof Native;
export const N = () => Native;
