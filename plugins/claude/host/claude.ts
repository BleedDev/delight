/**
 * A Claude Code session: the user's installed `claude` CLI, driven over its stream-json protocol (NDJSON on
 * stdin/stdout, plus control requests for permissions, interrupts, model/mode changes and so on). This is the same
 * wire protocol Anthropic's Agent SDK speaks; it's implemented here directly so the plugin has no dependencies.
 * Runs on the user's own Claude login.
 */
import { spawn, execFile, execFileSync, type ChildProcessWithoutNullStreams } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

export interface ClaudeHost {
    binary: string;
    env: Record<string, string>;
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string>; }>;
    appendSystemPrompt: string;
    emit(type: string, data?: any): void;
    canUseTool(req: PermissionRequest, signal: AbortSignal): Promise<any>;
    ask(kind: "elicitation" | "dialog", data: any, signal: AbortSignal, cancelled: any): Promise<any>;
    onExit(error?: string): void;
}

export interface PermissionRequest {
    toolName: string;
    input: any;
    toolUseID?: string;
    suggestions?: any[];
    blockedPath?: string;
    decisionReason?: string;
    title?: string;
    displayName?: string;
    description?: string;
    mcpServer?: any;
    defaultToNo?: boolean;
    suppressAlwaysAllowRule?: boolean;
    agentID?: string;
}

const run = (bin: string, args: string[], env: Record<string, string>) =>
    new Promise<string>(resolve => execFile(bin, args, { env, timeout: 5000 }, (err, out) => resolve(err ? "" : String(out))));
const newer = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function candidatesFor(env: Record<string, string>) {
    const home = os.homedir();
    const exe = process.platform === "win32" ? "claude.exe" : "claude";
    return [
        path.join(home, ".local/bin", exe), path.join(home, ".bun/bin", exe), path.join(home, ".claude/local", exe),
        "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude",
        ...(process.platform === "win32" ? [path.join(env.APPDATA ?? "", "npm", "claude.cmd"), path.join(env.LOCALAPPDATA ?? "", "Programs", "claude", exe)] : []),
    ];
}

/**
 * The newest `claude` on this machine. The model list comes from the CLI, so an old copy that happens to be
 * found first would hide the newer models. Runs in the background (a few `--version` calls).
 */
export async function findNewestClaude(env: Record<string, string> = process.env as any) {
    const candidates = candidatesFor(env);
    const which = process.platform === "win32" ? await run("where", ["claude"], env) : await run("/bin/sh", ["-lc", "which -a claude"], env);
    candidates.push(...which.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
    let best: { bin: string; v: number[] } | null = null;
    for (const bin of new Set(candidates.filter(c => c && fs.existsSync(c)))) {
        const v = (await run(bin, ["--version"], env)).match(/\d+\.\d+\.\d+/)?.[0]?.split(".").map(Number);
        if (v && (!best || newer(v, best.v) > 0)) best = { bin, v };
    }
    return best?.bin ?? null;
}

/** Quick answer while the newest one is still being looked for: the first install that exists */
export function claudeBinary(env: Record<string, string> = process.env as any) {
    const exe = process.platform === "win32" ? "claude.exe" : "claude";
    for (const c of candidatesFor(env)) if (c && fs.existsSync(c)) return c;
    try {
        const which = process.platform === "win32" ? execFileSync("where", ["claude"], { env }) : execFileSync("/bin/sh", ["-lc", "command -v claude"], { env });
        const first = which.toString().split(/\r?\n/)[0].trim();
        if (first) return first;
    } catch { }
    return exe;
}

export class ClaudeSession {
    localId: string;
    cwd: string;
    model?: string;
    permissionMode: string;
    effort?: string;
    resume?: string;
    resumeSessionAt?: string;
    forkSession?: boolean;
    sessionId?: string;
    busy = false;
    caps: any;
    turnOrigin?: "human" | "channel";
    lastActive?: number;
    startedAt?: number;

    private child: ChildProcessWithoutNullStreams | null = null;
    private closed = false;
    private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; }>();
    private inbound = new Map<string, AbortController>(); // CLI → host requests still being answered
    private stderrTail = "";
    private lastResultError: string | null = null;

    constructor(opts: any, private host: ClaudeHost) {
        this.localId = opts.localId;
        this.cwd = opts.cwd;
        this.model = opts.model;
        this.permissionMode = opts.permissionMode || "default";
        this.effort = opts.effort;
        this.resume = opts.resume;
        this.resumeSessionAt = opts.resumeSessionAt;
        this.forkSession = opts.forkSession;
    }

    private argv() {
        const a = ["--output-format", "stream-json", "--verbose", "--input-format", "stream-json", "--thinking", "adaptive", "--thinking-display", "summarized"];
        if (this.effort) a.push("--effort", this.effort);
        if (this.model) a.push("--model", this.model);
        a.push("--permission-prompt-tool", "stdio");
        if (this.resume) a.push(`--resume=${this.resume}`);
        const mcp = Object.fromEntries(Object.entries(this.host.mcpServers).map(([k, v]) => [k, { type: "stdio", ...v }]));
        if (Object.keys(mcp).length) a.push("--mcp-config", JSON.stringify({ mcpServers: mcp }));
        a.push("--setting-sources=user,project,local", "--permission-mode", this.permissionMode);
        if (this.permissionMode === "bypassPermissions") a.push("--allow-dangerously-skip-permissions");
        a.push("--include-hook-events", "--include-partial-messages");
        if (this.resume && this.forkSession) a.push("--fork-session");
        if (this.resume && this.resumeSessionAt) a.push(`--resume-session-at=${this.resumeSessionAt}`);
        return a;
    }

    private spawnEnv() {
        const env: Record<string, string> = {};
        // nothing inherited from another Claude Code process (when Discord was started from one)
        for (const [k, v] of Object.entries(this.host.env)) if (!/^CLAUDE|^CLAUDECODE$/.test(k) || k === "CLAUDE_CONFIG_DIR") env[k] = v;
        delete env.NODE_OPTIONS;
        delete env.DEBUG;
        env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
        env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = "true";
        return env;
    }

    async start() {
        this.startedAt = Date.now();
        const child = spawn(this.host.binary, this.argv(), { cwd: this.cwd, env: this.spawnEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        this.child = child;
        child.stdin.on("error", () => { }); // EPIPE when it dies mid-write; 'exit' handles the rest
        child.stderr.on("data", d => (this.stderrTail = (this.stderrTail + d).slice(-2000)));
        const failed = new Promise<never>((_, reject) => child.once("error", (e: any) => reject(new Error(e?.code === "ENOENT" ? `Claude Code isn't installed (looked for ${this.host.binary}). Install it from claude.com/code.` : e?.message ?? String(e)))));
        child.once("error", (e: any) => this.finish(e?.message ?? String(e)));
        child.once("exit", (code, signal) => {
            if (this.closed) return this.finish();
            if (signal) return this.finish(`Claude Code was terminated by ${signal}`);
            if (code) return this.finish(this.lastResultError ?? `Claude Code exited with code ${code}${this.stderrTail.trim() ? `: ${this.stderrTail.trim().split("\n").slice(-3).join(" ")}` : ""}`);
            this.finish();
        });
        readline.createInterface({ input: child.stdout }).on("line", line => this.onLine(line));
        this.host.emit("status", { state: "running" });

        const init = await Promise.race([
            this.request({ subtype: "initialize", appendSystemPrompt: this.host.appendSystemPrompt, promptSuggestions: true, agentProgressSummaries: true, perTaskStopAffordance: true }),
            failed,
        ]);
        this.caps = { models: init?.models ?? [], commands: init?.commands ?? [], agents: init?.agents ?? [], account: init?.account ?? null, init };
        this.host.emit("capabilities", this.caps);
    }

    private finished = false;
    private finish(error?: string) {
        if (this.finished) return;
        this.finished = true;
        this.busy = false;
        for (const p of this.pending.values()) p.reject(new Error(error ?? "Claude Code closed"));
        this.pending.clear();
        for (const c of this.inbound.values()) c.abort();
        this.inbound.clear();
        this.host.onExit(this.closed ? undefined : error);
    }

    private write(obj: any) {
        if (!this.child?.stdin.writable) return false;
        this.child.stdin.write(JSON.stringify(obj) + "\n");
        return true;
    }

    /** host → CLI control request; resolves with its response payload */
    request(req: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            this.pending.set(id, { resolve, reject });
            if (!this.write({ type: "control_request", request_id: id, request: req })) {
                this.pending.delete(id);
                reject(new Error("Claude Code isn't running"));
            }
        });
    }
    control(req: any) {
        return this.request(req);
    }

    private onLine(line: string) {
        let m: any;
        try {
            m = JSON.parse(line);
        } catch {
            return; // not JSON (diagnostics): skipped
        }
        this.lastActive = Date.now();
        switch (m.type) {
            case "control_response": {
                const r = m.response ?? {};
                const p = this.pending.get(r.request_id);
                if (!p) return;
                this.pending.delete(r.request_id);
                if (r.subtype === "error") p.reject(new Error(r.error ?? "Request failed"));
                else {
                    p.resolve(r.response);
                    // permission prompts that were already waiting when we (re)attached
                    for (const f of [...(r.pending_permission_requests ?? []), ...(r.pending_user_dialog_requests ?? [])]) this.onLine(JSON.stringify(f));
                }
                return;
            }
            case "control_request":
                return void this.onControlRequest(m.request_id, m.request ?? {});
            case "control_cancel_request":
                this.inbound.get(m.request_id)?.abort();
                this.inbound.delete(m.request_id);
                return;
            case "keep_alive":
            case "transcript_mirror":
            case "command_lifecycle":
                return;
        }
        if (m.type === "system" && m.subtype === "init") this.sessionId = m.session_id;
        if (m.type === "result") {
            this.busy = false;
            this.lastResultError = m.is_error ? String(m.result || (m.errors ?? []).join("\n") || "") || null : null;
        }
        this.host.emit("message", m);
    }

    private async onControlRequest(id: string, req: any) {
        const answer = (response: any) => this.write({ type: "control_response", response: { subtype: "success", request_id: id, response } });
        const fail = (error: string) => this.write({ type: "control_response", response: { subtype: "error", request_id: id, error } });
        const ctrl = new AbortController();
        this.inbound.set(id, ctrl);
        try {
            switch (req.subtype) {
                case "can_use_tool": {
                    const r = await this.host.canUseTool({
                        toolName: req.tool_name,
                        input: req.input,
                        toolUseID: req.tool_use_id,
                        suggestions: req.permission_suggestions,
                        blockedPath: req.blocked_path,
                        decisionReason: req.decision_reason,
                        title: req.title,
                        displayName: req.display_name,
                        description: req.description,
                        mcpServer: req.mcp_server,
                        defaultToNo: req.default_to_no,
                        suppressAlwaysAllowRule: req.suppress_always_allow_rule,
                        agentID: req.agent_id,
                    }, ctrl.signal);
                    if (ctrl.signal.aborted) return; // the CLI withdrew the prompt
                    return void answer(r.behavior === "allow"
                        ? { behavior: "allow", updatedInput: r.updatedInput ?? req.input, ...(r.updatedPermissions ? { updatedPermissions: r.updatedPermissions } : {}), toolUseID: req.tool_use_id }
                        : { behavior: "deny", message: r.message ?? "The user declined.", interrupt: !!r.interrupt, toolUseID: req.tool_use_id });
                }
                case "elicitation": {
                    const r = await this.host.ask("elicitation", {
                        serverName: req.mcp_server_name,
                        message: req.message,
                        mode: req.mode,
                        url: req.url,
                        elicitationId: req.elicitation_id,
                        requestedSchema: req.requested_schema,
                        title: req.title,
                        displayName: req.display_name,
                        description: req.description,
                    }, ctrl.signal, { action: "cancel" });
                    if (ctrl.signal.aborted) return;
                    return void answer(r);
                }
                case "hook_callback":
                    return void answer({ continue: true });
                case "request_user_dialog":
                    return; // no dialog kinds are declared, so none should arrive; answering would count as a dismissal
                default:
                    return void fail(`Unsupported control request subtype: ${req.subtype}`);
            }
        } catch (e: any) {
            fail(String(e?.message ?? e));
        } finally {
            this.inbound.delete(id);
        }
    }

    send(content: any[], uuid?: string, origin: any = { kind: "human" }) {
        this.busy = true;
        this.lastActive = Date.now();
        this.write({ type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: this.sessionId ?? "", origin, ...(uuid ? { uuid } : {}), timestamp: new Date().toISOString() });
    }

    interrupt() {
        return this.request({ subtype: "interrupt" }).catch(() => { });
    }
    setPermissionMode(mode: string) {
        this.permissionMode = mode;
        return this.request({ subtype: "set_permission_mode", mode });
    }
    setModel(model?: string) {
        this.model = model;
        return this.request({ subtype: "set_model", model: model ?? "default" });
    }
    setEffort(effortLevel: string) {
        this.effort = effortLevel;
        return this.request({ subtype: "apply_flag_settings", settings: { effortLevel } });
    }
    setFast(fastMode: boolean) {
        return this.request({ subtype: "apply_flag_settings", settings: { fastMode } });
    }
    contextUsage() {
        return this.request({ subtype: "get_context_usage", detail: "summary" });
    }
    usage() {
        return this.request({ subtype: "get_usage", skip_behaviors: true });
    }
    rewindFiles(userMessageId: string, dryRun = false) {
        return this.request({ subtype: "rewind_files", user_message_id: userMessageId, dry_run: dryRun });
    }
    async mcpStatus() {
        return (await this.request({ subtype: "mcp_status" }))?.mcpServers ?? [];
    }
    toggleMcp(serverName: string, enabled: boolean) {
        return this.request({ subtype: "mcp_toggle", serverName, enabled });
    }
    reconnectMcp(serverName: string) {
        return this.request({ subtype: "mcp_reconnect", serverName });
    }
    stopTask(taskId: string) {
        return this.request({ subtype: "stop_task", task_id: taskId });
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        for (const c of this.inbound.values()) c.abort();
        const child = this.child;
        try {
            child?.stdin.end();
        } catch { }
        if (!child) return this.finish();
        // like the SDK: EOF first, then SIGTERM after 2 s and SIGKILL 5 s later
        const term = setTimeout(() => {
            if (child.exitCode == null) child.kill("SIGTERM");
            setTimeout(() => child.exitCode == null && child.kill("SIGKILL"), 5000).unref?.();
        }, 2000);
        term.unref?.();
    }
}
