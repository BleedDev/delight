// Codex provider: drives `codex app-server` (NDJSON JSON-RPC over stdio) and translates its thread/turn/item
// protocol into the same Claude-Agent-SDK-shaped messages the UI already renders (assistant/user/tool_use/
// tool_result/stream_event/result), so Codex sessions render in the same transcript.
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";

// the npm `codex` is a node shim; GUI apps may not have node on PATH, so prefer the native binary
function codexBinary(env: any) {
    const candidates = [];
    try {
        const shim = (process.platform === "win32" ? execFileSync("where", ["codex"], { env }) : execFileSync("/bin/sh", ["-lc", "command -v codex"], { env }))
            .toString()
            .split(/\r?\n/)[0]
            .trim();
        const real = fs.realpathSync(shim);
        const pkg = path.resolve(path.dirname(real), "..");
        for (const dir of [path.join(pkg, "node_modules", "@openai"), path.join(pkg, "..")]) {
            try {
                for (const d of fs.readdirSync(dir)) if (d.startsWith("codex-")) candidates.push(...findVendor(path.join(dir, d)));
            } catch {}
        }
        candidates.push(shim);
    } catch {}
    return candidates.find(c => fs.existsSync(c)) ?? "codex";
}
function findVendor(dir: any) {
    try {
        const v = path.join(dir, "vendor");
        return fs.readdirSync(v).map(t => path.join(v, t, "bin", "codex"));
    } catch {
        return [];
    }
}

// The plugin's permission modes -> Codex approval/sandbox settings (as T3 Code maps them)
function modeConfig(mode: any) {
    switch (mode) {
        case "bypassPermissions":
            return { approvalPolicy: "never", sandbox: "danger-full-access", sandboxPolicy: { type: "dangerFullAccess" }, approvalsReviewer: "user" };
        case "auto":
            return { approvalPolicy: "on-request", sandbox: "workspace-write", sandboxPolicy: { type: "workspaceWrite" }, approvalsReviewer: "auto_review" };
        case "acceptEdits":
        case "dontAsk":
            return { approvalPolicy: "on-request", sandbox: "workspace-write", sandboxPolicy: { type: "workspaceWrite" }, approvalsReviewer: "user" };
        default: // manual and plan
            return { approvalPolicy: "untrusted", sandbox: "workspace-write", sandboxPolicy: { type: "workspaceWrite" }, approvalsReviewer: "user" };
    }
}

function describeCommand(item: any) {
    const a = item.commandActions?.[0];
    if (!a) return undefined;
    if (a.type === "read") return `Read ${a.name ?? a.path ?? ""}`.trim();
    if (a.type === "listFiles") return `List ${a.path ?? "files"}`;
    if (a.type === "search") return `Search for ${a.query ?? ""}`.trim();
    return undefined;
}

class CodexSession {
    [key: string]: any;
    constructor(opts: any, host: any) {
        this.opts = opts;
        this.host = host; // { emit(type, data), updateChat(patch), notify(title, body), env }
        this.localId = opts.localId;
        this.cwd = opts.cwd;
        this.model = opts.model;
        this.effort = opts.effort;
        this.fast = opts.fast;
        this.permissionMode = opts.permissionMode || "default";
        this.threadId = opts.resume;
        this.turnId = null;
        this.pending = new Map(); // our rpc id -> {resolve,reject}
        this.serverRequests = new Map(); // rpc id -> { method, params } (approvals awaiting the user)
        this.items = new Map(); // itemId -> latest item (for fileChange diffs etc.)
        this.nextId = 1;
        this.busy = false;
        this.closed = false;
        this.queue = [];
    }
    emit(type: any, data: any) {
        this.host.emit(type, data);
    }
    msg(m: any) {
        // stable ids (the item's), so a replayed thread lines up with what was shown live
        this.emit("message", { session_id: this.threadId, uuid: m.message?.id ?? crypto.randomUUID(), parent_tool_use_id: null, ...m });
    }
    write(obj: any) {
        if (!this.child?.stdin.writable) return false;
        this.child.stdin.write(JSON.stringify(obj) + "\n");
        return true;
    }
    request(method: any, params?: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const id = this.nextId++;
            this.pending.set(id, { resolve, reject });
            if (!this.write(params === undefined ? { id, method } : { id, method, params })) {
                this.pending.delete(id);
                reject(new Error("Codex isn’t running"));
            }
        });
    }
    // the process is gone (spawn failed or died): settle everything and let the host forget the session
    dead(text: any) {
        if (this.gone) return;
        this.gone = true;
        for (const p of this.pending.values()) p.reject(new Error(text));
        this.pending.clear();
        this.serverRequests.clear();
        this.queue = [];
        this.busy = false;
        this.host.onExit?.();
    }

    async start() {
        this.startedAt = Date.now();
        const env = this.host.env;
        this.child = spawn(codexBinary(env), ["app-server", ...(this.host.extraArgs ?? [])], { cwd: this.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
        this.child.stdin.on("error", () => {}); // EPIPE when it dies mid-write; 'exit' handles the rest
        this.child.on("error", (e: any) => {
            if (this.gone) return;
            this.fail(`Couldn’t start Codex: ${e.message}`);
            this.emit("status", { state: "error", error: `Couldn’t start Codex: ${e.message}` });
            this.dead(e.message);
        });
        this.child.on("exit", (code: any) => {
            if (this.gone) return;
            if (!this.closed) this.emit("status", { state: code ? "error" : "ended", error: code ? `Codex exited with code ${code}` : undefined });
            this.dead(`codex exited (${code})`);
        });
        this.child.stderr.on("data", (d: any) => {
            const s = String(d);
            if (/\bERROR\b/.test(s) && !/state db (missing rollout|record_discrepancy)/.test(s)) console.warn("[Claude plugin: codex]", s.trim());
        });
        readline.createInterface({ input: this.child.stdout }).on("line", line => this.onLine(line));
        this.emit("status", { state: "running" });

        await this.request("initialize", {
            clientInfo: { name: "evi-claude", title: "Evi", version: "1.0.0" },
            capabilities: { experimentalApi: true, optOutNotificationMethods: ["thread/realtime/started", "rawResponseItem/completed"] },
        });
        this.write({ method: "initialized" });

        const [account, models] = await Promise.all([this.request("account/read", {}).catch(() => null), this.listModels().catch(() => [])]);
        this.account = account?.account;
        this.caps = {
            provider: "codex",
            models: models.map(m => ({
                value: m.id,
                displayName: m.displayName ?? m.id,
                description: m.description ?? "",
                supportsEffort: !!m.supportedReasoningEfforts?.length,
                supportedEffortLevels: (m.supportedReasoningEfforts ?? []).map((e: any) => e.reasoningEffort),
                supportsFastMode: !!m.serviceTiers?.length,
                isDefault: m.isDefault,
            })),
            commands: [
                { name: "compact", description: "Summarize the conversation to free up context" },
                { name: "review", description: "Review the current changes" },
            ],
            account: account?.account ? { email: account.account.email, subscriptionType: account.account.planType, provider: "codex" } : null,
        };
        this.emit("capabilities", this.caps);
        if (!account?.account && account?.requiresOpenaiAuth !== false) {
            this.emit("message", {
                type: "system",
                subtype: "informational",
                level: "warning",
                uuid: crypto.randomUUID(),
                content: "Codex isn’t logged in on this Mac. Run `codex login` in a terminal (ChatGPT sign-in), then send your message again.",
            });
        }
        this.refreshLimits();

        const mc = modeConfig(this.permissionMode);
        const common = {
            cwd: this.cwd,
            model: this.model || undefined,
            approvalPolicy: mc.approvalPolicy,
            sandbox: mc.sandbox,
            approvalsReviewer: mc.approvalsReviewer,
            ...(this.fast ? { serviceTier: "priority" } : {}),
        };
        let res;
        if (this.threadId) {
            try {
                res = await this.request("thread/resume", { threadId: this.threadId, ...common });
                this.replay(res.thread?.turns ?? []);
            } catch (e: any) {
                this.emit("message", {
                    type: "system",
                    subtype: "informational",
                    level: "warning",
                    uuid: crypto.randomUUID(),
                    content: `Couldn’t resume the Codex thread (${e.message}); starting a new one.`,
                });
                res = null;
            }
        }
        if (!res) res = await this.request("thread/start", common);
        this.threadId = res.thread.id;
        this.model = this.model || res.model;
        this.effort = this.effort || res.reasoningEffort;
        this.emit("message", {
            type: "system",
            subtype: "init",
            session_id: this.threadId,
            model: res.model,
            cwd: this.cwd,
            tools: [],
            mcp_servers: [],
            uuid: crypto.randomUUID(),
        });
        this.host.updateChat({ sessionId: this.threadId, model: res.model });
        // flush messages typed before the thread was ready
        const q = this.queue.splice(0);
        for (const x of q) await this.send(x.content, x.uuid);
    }

    async listModels() {
        const out = [];
        let cursor;
        do {
            const r = await this.request("model/list", cursor ? { cursor } : {});
            out.push(...(r.data ?? []).filter((m: any) => !m.hidden));
            cursor = r.nextCursor;
        } while (cursor);
        return out;
    }

    async refreshLimits() {
        try {
            const r = await this.request("account/rateLimits/read");
            this.applyLimits(r.rateLimitsByLimitId?.codex ?? r.rateLimits);
        } catch {}
    }
    applyLimits(s: any) {
        if (!s) return;
        this.limits = { ...(this.limits ?? {}), ...Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)) };
        const w = (x: any) => x && { utilization: x.usedPercent, resets_at: x.resetsAt ? new Date(x.resetsAt * 1000).toISOString() : null };
        this.emit("usage", {
            subscription_type: this.account?.planType ?? s.planType ?? null,
            rate_limits_available: true,
            rate_limits: { five_hour: w(this.limits.primary), seven_day: w(this.limits.secondary) },
        });
    }

    // ---------------------------------------------------------------- input
    async send(content: any, uuid: any) {
        // one turn at a time: a second turn/start would come back as a queued turn and Stop would target it
        if (!this.threadId || this.busy) return this.queue.push({ content, uuid });
        this.busy = true;
        this.lastActive = Date.now();
        const input = [];
        for (const b of content ?? []) {
            if (b.type === "text") input.push({ type: "text", text: b.text, text_elements: [] });
            else if (b.type === "image" && b.source?.data) {
                const ext = (b.source.media_type || "image/png").split("/")[1] || "png";
                const file = path.join(os.tmpdir(), `evi-claude-${crypto.randomUUID()}.${ext}`);
                fs.writeFileSync(file, Buffer.from(b.source.data, "base64"));
                input.push({ type: "localImage", path: file });
            }
        }
        const text = input.find(x => x.type === "text")?.text?.trim();
        if (text === "/compact") return this.request("thread/compact/start", { threadId: this.threadId }).catch((e: any) => this.fail(e.message));
        const mc = modeConfig(this.permissionMode);
        const params = {
            threadId: this.threadId,
            input,
            clientUserMessageId: uuid,
            approvalPolicy: mc.approvalPolicy,
            approvalsReviewer: mc.approvalsReviewer,
            sandboxPolicy: mc.sandboxPolicy,
            summary: "auto",
            ...(this.model ? { model: this.model } : {}),
            ...(this.effort ? { effort: this.effort } : {}),
            // overrides are sticky for later turns, so turning plan/fast off has to be sent too
            serviceTier: this.fast ? "priority" : null,
            ...(this.model
                ? {
                      collaborationMode: {
                          mode: this.permissionMode === "plan" ? "plan" : "default",
                          settings: { model: this.model, reasoning_effort: this.effort ?? null, developer_instructions: null },
                      },
                  }
                : {}),
        };
        try {
            const r = await this.request("turn/start", params);
            this.turnId ??= r.turn?.id;
        } catch (e: any) {
            this.busy = false;
            this.fail(e.message);
        }
    }
    fail(text: any) {
        this.msg({ type: "result", subtype: "error_during_execution", is_error: true, errors: [text], result: text });
    }

    async interrupt() {
        // settle open approvals first, or Stop can deadlock (T3 Code)
        for (const [id, r] of this.serverRequests) {
            this.write({ id, result: this.cancelResult(r.method) });
            this.serverRequests.delete(id);
            this.emit("permission-cancelled", { requestId: String(id) });
        }
        if (this.threadId && this.turnId) await this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId }).catch(() => {});
    }
    cancelResult(method: any) {
        if (method === "item/tool/requestUserInput") return { answers: {} };
        if (method === "item/permissions/requestApproval") return { permissions: {}, scope: "turn" };
        if (method === "mcpServer/elicitation/request") return { action: "cancel", content: null, _meta: null };
        if (method === "execCommandApproval" || method === "applyPatchApproval") return { decision: "abort" };
        return { decision: "cancel" };
    }
    setPermissionMode(mode: any) {
        this.permissionMode = mode;
    }
    setModel(model: any) {
        this.model = model;
    }
    setEffort(effort: any) {
        this.effort = effort;
    }
    setFast(on: any) {
        this.fast = on;
    }

    // ---------------------------------------------------------------- wire
    onLine(line: any) {
        if (!line.trim()) return;
        let m;
        try {
            m = JSON.parse(line);
        } catch {
            return;
        }
        if (m.method && m.id !== undefined) return this.onServerRequest(m.id, m.method, m.params ?? {});
        if (m.method) return this.onNotification(m.method, m.params ?? {});
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.error ? p.reject(Object.assign(new Error(m.error.message), m.error)) : p.resolve(m.result);
    }

    onNotification(method: any, p: any) {
        if (p.threadId && this.threadId && p.threadId !== this.threadId) return; // sub-agent / other threads
        this.lastActive = Date.now();
        switch (method) {
            case "turn/started":
                this.turnId = p.turn?.id;
                this.busy = true;
                return;
            case "item/started":
                return this.itemStarted(p.item);
            case "item/completed":
                return this.itemCompleted(p.item);
            case "item/agentMessage/delta":
                return this.msg({ type: "stream_event", message_id: p.itemId, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p.delta } } });
            case "item/reasoning/summaryTextDelta":
            case "item/reasoning/textDelta":
                return this.msg({
                    type: "stream_event",
                    message_id: p.itemId,
                    event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: p.delta } },
                });
            case "item/reasoning/summaryPartAdded":
                return this.msg({
                    type: "stream_event",
                    message_id: p.itemId,
                    event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "\n\n" } },
                });
            case "item/fileChange/patchUpdated": {
                const it = this.items.get(p.itemId);
                if (it) this.items.set(p.itemId, { ...it, changes: p.changes });
                return this.refreshPatchApprovals(p.itemId);
            }
            case "turn/plan/updated": {
                const todos = (p.plan ?? []).map((s: any) => ({ content: s.step, activeForm: s.step, status: s.status === "inProgress" ? "in_progress" : s.status }));
                return this.msg({
                    type: "assistant",
                    message: { id: `plan:${p.turnId}`, content: [{ type: "tool_use", id: `plan:${p.turnId}`, name: "TodoWrite", input: { todos } }] },
                });
            }
            case "thread/tokenUsage/updated": {
                const t = p.tokenUsage;
                const max = t?.modelContextWindow;
                const used = t?.last?.totalTokens ?? 0;
                if (max) this.emit("context-usage", { totalTokens: used, maxTokens: max, percentage: (used / max) * 100, categories: [] });
                return;
            }
            case "account/rateLimits/updated":
                return this.applyLimits(p.rateLimits);
            case "error":
                if (p.willRetry)
                    return this.msg({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 5, retry_delay_ms: 0, error_status: null, error: p.error?.message });
                return this.msg({ type: "system", subtype: "informational", level: "warning", content: p.error?.message ?? "Codex error" });
            case "warning":
                return this.msg({ type: "system", subtype: "informational", level: "warning", content: p.message });
            case "model/rerouted":
                return this.msg({ type: "system", subtype: "model_refusal_fallback", original_model: p.fromModel, fallback_model: p.toModel, direction: "sticky" });
            case "thread/name/updated":
                if (p.threadName) this.host.updateChat({ title: p.threadName, autoTitle: false, titled: true });
                return;
            case "serverRequest/resolved":
                if (this.serverRequests.has(p.requestId)) {
                    this.serverRequests.delete(p.requestId);
                    this.emit("permission-cancelled", { requestId: String(p.requestId) });
                }
                return;
            case "turn/completed": {
                this.busy = false;
                this.turnId = null;
                const next = this.queue.shift();
                if (next) setTimeout(() => this.send(next.content, next.uuid), 0);
                const st = p.turn?.status;
                const err = p.turn?.error?.message;
                this.msg({
                    type: "result",
                    uuid: p.turn?.id ? "result:" + p.turn.id : crypto.randomUUID(),
                    subtype: st === "completed" ? "success" : "error_during_execution",
                    is_error: st === "failed",
                    errors: err ? [err] : [],
                    result: err ?? "",
                    duration_ms: p.turn?.durationMs,
                });
                if (st === "completed") this.host.notify("Codex finished", "");
                return;
            }
        }
    }

    // ThreadItem -> SDK-shaped messages
    itemStarted(item: any) {
        if (!item) return;
        this.items.set(item.id, item);
        if (item.type === "fileChange") this.refreshPatchApprovals(item.id);
        switch (item.type) {
            case "agentMessage":
                this.msg({ type: "stream_event", event: { type: "message_start", message: { id: item.id } } });
                return this.msg({ type: "stream_event", message_id: item.id, event: { type: "content_block_start", index: 0, content_block: { type: "text" } } });
            case "reasoning":
                this.msg({ type: "stream_event", event: { type: "message_start", message: { id: item.id } } });
                return this.msg({ type: "stream_event", message_id: item.id, event: { type: "content_block_start", index: 0, content_block: { type: "thinking" } } });
            default: {
                const tu = this.toolUse(item);
                if (tu) this.msg({ type: "assistant", message: { id: item.id, content: [tu] } });
            }
        }
    }
    itemCompleted(item: any) {
        if (!item) return;
        this.items.set(item.id, item);
        switch (item.type) {
            case "userMessage":
                return;
            case "agentMessage":
                return this.msg({ type: "assistant", message: { id: item.id, content: [{ type: "text", text: item.text ?? "" }] } });
            case "reasoning": {
                const text = [...(item.summary ?? []), ...(item.content ?? [])].join("\n\n");
                return this.msg({ type: "assistant", message: { id: item.id, content: text.trim() ? [{ type: "thinking", thinking: text }] : [] } });
            }
            case "plan":
                return this.msg({ type: "assistant", message: { id: item.id, content: [{ type: "text", text: item.text ?? "" }] } });
            case "contextCompaction":
                return this.msg({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 0 } });
            default: {
                const tu = this.toolUse(item);
                if (!tu) return;
                this.msg({ type: "assistant", message: { id: item.id, content: [tu] } });
                const r = this.toolResult(item);
                if (r) this.msg({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: item.id, ...r }] } });
            }
        }
    }
    toolUse(item: any) {
        switch (item.type) {
            case "commandExecution":
                return { type: "tool_use", id: item.id, name: "Bash", input: { command: item.command, ...(describeCommand(item) ? { description: describeCommand(item) } : {}) } };
            case "fileChange": {
                const ch = item.changes ?? [];
                return {
                    type: "tool_use",
                    id: item.id,
                    name: "ApplyPatch",
                    input: { file_path: ch.length === 1 ? ch[0].path : undefined, changes: ch.map((c: any) => ({ path: c.path, kind: c.kind?.type, diff: c.diff })) },
                };
            }
            case "mcpToolCall":
                return { type: "tool_use", id: item.id, name: `mcp__${item.server}__${item.tool}`, input: item.arguments ?? {} };
            case "dynamicToolCall":
                return { type: "tool_use", id: item.id, name: `${item.namespace ?? "tool"}:${item.tool}`, input: item.arguments ?? {} };
            case "webSearch":
                return { type: "tool_use", id: item.id, name: "WebSearch", input: { query: item.query ?? item.action?.query ?? item.action?.url ?? "" } };
            case "imageView":
                return { type: "tool_use", id: item.id, name: "Read", input: { file_path: item.path } };
            case "collabAgentToolCall":
                return { type: "tool_use", id: item.id, name: "Agent", input: { description: item.prompt?.slice(0, 80), prompt: item.prompt } };
        }
        return null;
    }
    toolResult(item: any) {
        switch (item.type) {
            case "commandExecution":
                return { content: item.aggregatedOutput ?? "", is_error: item.status === "failed" || item.status === "declined" || (item.exitCode != null && item.exitCode !== 0) };
            case "fileChange":
                return {
                    content: item.status === "declined" ? "The user declined this change." : `${item.changes?.length ?? 0} file(s) changed`,
                    is_error: item.status === "failed" || item.status === "declined",
                };
            case "mcpToolCall":
                return { content: item.error ? item.error.message : (item.result?.content ?? []), is_error: !!item.error || item.status === "failed" };
            case "webSearch":
                return { content: JSON.stringify(item.results ?? [], null, 2) };
            case "dynamicToolCall":
                return { content: item.contentItems ?? [], is_error: item.success === false };
            case "imageView":
            case "collabAgentToolCall":
                return { content: "" };
        }
        return null;
    }
    // history on resume
    replay(turns: any) {
        const msgs: any[] = [];
        const push = (m: any) => msgs.push({ session_id: this.threadId, uuid: crypto.randomUUID(), parent_tool_use_id: null, ...m });
        for (const t of turns) {
            for (const item of t.items ?? []) {
                if (item.type === "userMessage") {
                    const text = (item.content ?? [])
                        .filter((c: any) => c.type === "text")
                        .map((c: any) => c.text)
                        .join("\n");
                    push({ type: "user", uuid: item.clientId ?? item.id, message: { content: [{ type: "text", text }] } });
                } else if (item.type === "agentMessage") push({ type: "assistant", uuid: item.id, message: { id: item.id, content: [{ type: "text", text: item.text ?? "" }] } });
                else if (item.type === "reasoning") {
                    const text = [...(item.summary ?? []), ...(item.content ?? [])].join("\n\n");
                    if (text.trim()) push({ type: "assistant", uuid: item.id, message: { id: item.id, content: [{ type: "thinking", thinking: text }] } });
                } else {
                    const tu = this.toolUse(item);
                    if (!tu) continue;
                    push({ type: "assistant", uuid: item.id, message: { id: item.id, content: [tu] } });
                    const r = this.toolResult(item);
                    if (r) push({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: item.id, ...r }] } });
                }
            }
            push({
                type: "result",
                uuid: "result:" + t.id,
                subtype: t.status === "completed" ? "success" : "error_during_execution",
                is_error: t.status === "failed",
                errors: t.error ? [t.error.message] : [],
            });
        }
        if (msgs.length) this.emit("history", msgs);
    }

    // ---------------------------------------------------------------- approvals and questions
    onServerRequest(id: any, method: any, p: any) {
        // sub-agent threads ask through the same cards (auto-cancelling would stop the whole turn)
        this.serverRequests.set(id, { method, params: p });
        const requestId = String(id);
        const base = { requestId, at: Date.now(), toolUseID: p.itemId };
        switch (method) {
            case "item/commandExecution/requestApproval":
            case "execCommandApproval":
                return this.emit("permission", {
                    ...base,
                    toolName: "Bash",
                    input: { command: p.command ?? (Array.isArray(p.command) ? p.command.join(" ") : ""), description: p.reason || undefined },
                    decisionReason: p.reason || undefined,
                    suggestions: [{ type: "addRules", destination: "session" }],
                });
            case "item/fileChange/requestApproval":
            case "applyPatchApproval":
                return this.emitPatchApproval(id);
            case "item/permissions/requestApproval":
                return this.emit("permission", {
                    ...base,
                    toolName: "Permissions",
                    input: p.permissions ?? {},
                    decisionReason: p.reason || undefined,
                    title: "Allow Codex extra sandbox access?",
                });
            case "item/tool/requestUserInput":
                return this.emit("permission", {
                    ...base,
                    toolName: "AskUserQuestion",
                    input: {
                        questions: (p.questions ?? []).map((q: any) => ({
                            id: q.id,
                            question: q.question,
                            header: q.header,
                            multiSelect: false,
                            options: (q.options ?? []).map((o: any) => ({ label: o.label, description: o.description })),
                        })),
                    },
                });
            case "mcpServer/elicitation/request":
                return this.emit("request", {
                    requestId,
                    kind: "elicitation",
                    data: { serverName: p.serverName, message: p.message, requestedSchema: p.requestedSchema, mode: p.mode === "url" ? "url" : "form", url: p.url },
                    at: Date.now(),
                });
            default:
                this.serverRequests.delete(id);
                return this.write({ id, error: { code: -32601, message: "Method not supported by this client" } });
        }
    }

    // the approval can arrive before the item it's about; it's re-sent (same requestId) once the changes are known
    emitPatchApproval(id: any) {
        const { params: p } = this.serverRequests.get(id) ?? {};
        if (!p) return;
        const ch = this.items.get(p.itemId)?.changes ?? [];
        this.emit("permission", {
            requestId: String(id),
            at: Date.now(),
            toolUseID: p.itemId,
            toolName: "ApplyPatch",
            input: { file_path: ch.length === 1 ? ch[0].path : undefined, changes: ch.map((c: any) => ({ path: c.path, kind: c.kind?.type, diff: c.diff })) },
            decisionReason: p.reason || undefined,
            suggestions: [{ type: "addRules", destination: "session" }],
        });
    }
    refreshPatchApprovals(itemId: any) {
        for (const [id, r] of this.serverRequests)
            if ((r.method === "item/fileChange/requestApproval" || r.method === "applyPatchApproval") && r.params.itemId === itemId) this.emitPatchApproval(id);
    }

    // decision from the UI's approval cards (same shape as for Claude Code)
    answer(requestId: any, decision: any) {
        const id = [...this.serverRequests.keys()].find(k => String(k) === String(requestId));
        if (id === undefined) return false;
        const { method, params } = this.serverRequests.get(id);
        this.serverRequests.delete(id);
        let result;
        if (method === "item/tool/requestUserInput") {
            const answers: Record<string, any> = {};
            const byQuestion = decision.updatedInput?.answers ?? {};
            for (const q of params.questions ?? []) {
                const a = byQuestion[q.question];
                if (a != null && !decision.message) answers[q.id] = { answers: Array.isArray(a) ? a : [a] };
            }
            result = { answers };
        } else if (method === "item/permissions/requestApproval")
            result = decision.allow ? { permissions: params.permissions ?? {}, scope: decision.updatedPermissions ? "session" : "turn" } : { permissions: {}, scope: "turn" };
        else if (method === "mcpServer/elicitation/request")
            result = { action: decision.action ?? (decision.allow ? "accept" : "decline"), content: decision.content ?? null, _meta: null };
        else if (method === "execCommandApproval" || method === "applyPatchApproval")
            result = {
                decision: decision.allow
                    ? decision.updatedPermissions
                        ? "approved_for_session"
                        : "approved"
                    : decision.interrupt
                      ? "abort"
                      : { denied: { rejection: decision.message || "The user declined." } },
            };
        else result = { decision: decision.allow ? (decision.updatedPermissions ? "acceptForSession" : "accept") : decision.interrupt ? "cancel" : "decline" };
        this.write({ id, result });
        return true;
    }

    close() {
        this.closed = true;
        try {
            this.child?.stdin.end();
            setTimeout(() => this.child?.kill("SIGTERM"), 2000).unref?.();
        } catch {}
    }
}

export { CodexSession, codexBinary };
