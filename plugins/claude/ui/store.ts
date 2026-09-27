import { N } from "./native";
import { createStore } from "zustand/vanilla";
import { useSyncExternalStore } from "react";

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions" | "auto" | "dontAsk";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentChat {
    localId: string;
    title: string;
    provider: "claude" | "codex";
    cwd: string;
    model?: string;
    effort?: Effort;
    fast?: boolean;
    permissionMode: PermissionMode;
    sessionId?: string;
    pinned?: boolean;
    archived?: boolean; // hidden from the rail's recents (still searchable, restorable)
    chapters?: Record<string, string>; // assistant msg id -> chapter title
    watching?: boolean; // new messages in the attached conversation wake the agent
    autoTitle?: boolean; // title still derived from the first prompt; replaced by Claude Code's session summary
    titled?: boolean;
    resumeSessionAt?: string; // one-shot: rewind point for the next session start
    forkSession?: boolean;
    attachedChannelId?: string | null;
    createdAt: number;
    updatedAt: number;
    unread?: number;
}

export interface ToolResult {
    content: any;
    isError?: boolean;
}
export type Item =
    | { kind: "user"; id: string; origin?: any; text: string; images?: string[]; at?: number; local?: boolean; prevUuid?: string }
    | { kind: "text"; id: string; msgId: string; text: string; streaming?: boolean; parentId?: string | null }
    | { kind: "thinking"; id: string; msgId: string; text: string; streaming?: boolean; startedAt?: number; endedAt?: number; parentId?: string | null }
    | {
          kind: "tool";
          id: string;
          msgId: string;
          name: string;
          input: any;
          result?: ToolResult;
          parentId?: string | null;
          startedAt?: number;
          endedAt?: number;
          streamingInput?: boolean;
      }
    | { kind: "marker"; id: string; type: MarkerType; text?: string; data?: any; at?: number }
    | {
          kind: "result";
          id: string;
          subtype: string;
          terminalReason?: string;
          cost?: number;
          durationMs?: number;
          turns?: number;
          usage?: any;
          isError?: boolean;
          text?: string;
          at?: number;
      }
    | { kind: "draft"; id: string; channelId: string; content: string; replyTo?: string };

export type MarkerType =
    "init" | "compact" | "interrupted" | "retry" | "error" | "info" | "denied" | "local" | "notification" | "reset" | "memory" | "hook" | "refusal" | "files" | "discord" | "ping";

export interface Permission {
    requestId: string;
    toolName: string;
    input: any;
    suggestions?: any[];
    toolUseID?: string;
    blockedPath?: string;
    decisionReason?: string;
    title?: string;
    displayName?: string;
    description?: string;
    mcpServer?: { name: string; source: string };
    defaultToNo?: boolean;
    suppressAlwaysAllowRule?: boolean;
    at?: number;
}

export interface TaskInfo {
    taskId: string;
    toolUseId?: string;
    description: string;
    subagentType?: string;
    summary?: string;
    lastToolName?: string;
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number };
    status?: "running" | "completed" | "failed" | "stopped";
}

export interface PendingRequest {
    requestId: string;
    kind: "elicitation" | "dialog";
    data: any;
    at?: number;
}

export interface Runtime {
    items: Item[];
    status: "idle" | "running" | "ended" | "error";
    busy: boolean;
    error?: string;
    permissions: Permission[];
    capabilities?: { models: any[]; commands: any[]; agents?: any[]; account: any; init?: any; provider?: string };
    historyLoaded?: boolean;
    lastResult?: any;
    turnStartedAt?: number;
    phase?: "requesting" | "thinking" | "writing" | "tool" | "compacting";
    outputTokens?: number;
    summaries: Record<string, string>; // tool_use_id -> summary label
    tasks: Record<string, TaskInfo>; // tool_use_id -> subagent progress
    toolElapsed: Record<string, number>;
    suggestion?: string;
    rateLimit?: any;
    contextUsage?: any;
    usage?: any;
    queued: { id: string; content: any[]; text: string }[];
    streamChars?: number;
    lastUuid?: string;
    thinkingStartedAt?: number;
    thinkingEndedAt?: number;
    stopping?: boolean;
    requests: PendingRequest[];
    hooks: Record<string, { name: string; event: string; startedAt: number }>; // running hooks
    bgTasks: { task_id: string; task_type: string; description: string }[];
    thinkingTokens?: number;
    sessionState?: "idle" | "running" | "requires_action";
    auth?: { isAuthenticating: boolean; output: string[]; error?: string };
}

interface State {
    chats: AgentChat[];
    runtimes: Record<string, Runtime>;
    activeId: string | null;
    open: boolean; // agents view visible
    panelFor: Record<string, string>; // discord channelId -> agent localId (attached side panel)
}

// zustand's vanilla store with a small hook on top (zustand's own React binding imports React at load time, and
// Evi evaluates plugins before Discord's React exists)
const agentsStore = createStore<State>()(() => ({ chats: [], runtimes: {}, activeId: null, open: false, panelFor: {} }));
function useAgentsHook<T>(selector: (s: State) => T): T {
    return useSyncExternalStore(agentsStore.subscribe, () => selector(agentsStore.getState()));
}
export const useAgents = Object.assign(useAgentsHook, {
    getState: agentsStore.getState,
    setState: agentsStore.setState,
    subscribe: agentsStore.subscribe,
});
const set = useAgents.setState;
const get = useAgents.getState;

const EMPTY: Runtime = { items: [], status: "idle", busy: false, permissions: [], summaries: {}, tasks: {}, toolElapsed: {}, queued: [], requests: [], hooks: {}, bgTasks: [] };
export function rt(id: string): Runtime {
    return get().runtimes[id] ?? EMPTY;
}
function patchRt(id: string, fn: (r: Runtime) => Runtime) {
    set(s => ({ runtimes: { ...s.runtimes, [id]: fn({ ...rt(id) }) } }));
}
export const chatById = (id: string) => get().chats.find(c => c.localId === id);

// ---------------- persistence
export async function loadChats() {
    const st: any = await N()
        .agents.state()
        .catch(() => null);
    const chats: AgentChat[] = Array.isArray(st?.chats) ? st.chats : [];
    const panelFor: Record<string, string> = {};
    for (const c of chats) if (c.attachedChannelId) panelFor[c.attachedChannelId] = c.localId;
    set({ chats, panelFor });
}
let saveT: any;
function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(() => N().agents.saveState({ chats: get().chats }), 200);
}
export function updateChat(id: string, patch: Partial<AgentChat>) {
    set(s => {
        const chats = s.chats.map(c => (c.localId === id ? { ...c, ...patch, updatedAt: Date.now() } : c));
        const panelFor: Record<string, string> = {};
        for (const c of chats) if (c.attachedChannelId) panelFor[c.attachedChannelId] = c.localId;
        return { chats, panelFor };
    });
    persist();
}

export async function newChat(opts: Partial<AgentChat> = {}) {
    const cwd = opts.cwd ?? (await N().agents.pickFolder());
    if (!cwd) return null;
    const chat: AgentChat = {
        localId: crypto.randomUUID(),
        title: opts.title ?? cwd.split("/").pop() ?? "New session",
        provider: opts.provider ?? "claude",
        cwd,
        permissionMode: opts.permissionMode ?? "default",
        model: opts.model,
        effort: opts.effort,
        fast: opts.fast,
        sessionId: opts.sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachedChannelId: opts.attachedChannelId ?? null,
        pinned: opts.pinned,
        autoTitle: opts.autoTitle,
    };
    set(s => ({
        chats: [chat, ...s.chats],
        activeId: chat.localId,
        open: true,
        panelFor: chat.attachedChannelId ? { ...s.panelFor, [chat.attachedChannelId]: chat.localId } : s.panelFor,
    }));
    persist();
    return chat;
}

// stop the CLI process; the runtime shows it as idle right away (the process's own "ended" may never come)
export async function stopSession(id: string) {
    await N().agents.stop(id);
    patchRt(id, r => ({ ...r, status: "idle", busy: false, stopping: false, phase: undefined, permissions: [], requests: [] }));
}
export async function restartSession(chat: AgentChat) {
    await stopSession(chat.localId);
    await warm(chat);
}

export function removeChat(id: string) {
    N().agents.stop(id);
    set(s => {
        const runtimes = { ...s.runtimes };
        delete runtimes[id];
        return { chats: s.chats.filter(c => c.localId !== id), runtimes, activeId: s.activeId === id ? null : s.activeId };
    });
    persist();
}

// ---------------- transcript normalisation (SDK / session messages -> items)
function blocksOf(content: any): any[] {
    if (typeof content === "string") return [{ type: "text", text: content }];
    return Array.isArray(content) ? content : [];
}
// best-effort parse of a tool input that's still streaming (input_json_delta), so rows fill in as Claude writes
function parsePartialJson(src: string): any {
    try {
        return JSON.parse(src);
    } catch {}
    let inStr = false;
    let esc = false;
    const stack: string[] = [];
    for (const ch of src) {
        if (inStr) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
        else if (ch === "}" || ch === "]") stack.pop();
    }
    let fixed = src.replace(/\\$/, "");
    if (inStr) fixed += '"';
    fixed = fixed
        .replace(/,\s*$/, "")
        .replace(/:\s*$/, ": null")
        .replace(/,\s*"[^"]*"\s*$/, "");
    try {
        return JSON.parse(fixed + stack.reverse().join(""));
    } catch {
        return undefined;
    }
}
const isLocalCommandEcho = (t: string) => /^<(command-name|command-message|command-args|local-command-stdout|local-command-caveat|system-reminder)>/.test(t.trim());

export function ingest(id: string, m: any, live = true) {
    patchRt(id, r => {
        const items = [...r.items];
        const now = Date.now();
        const find = (iid: string) => items.findIndex(x => x.id === iid);
        const upsert = (it: Item) => {
            const i = find(it.id);
            if (i >= 0) items[i] = { ...(items[i] as any), ...it };
            else items.push(it);
        };
        const parentId = m.parent_tool_use_id ?? null;

        if (m.type === "stream_event") {
            const ev = m.event;
            const msgId = m.message_id ?? ev?.message?.id ?? (r.items.findLast?.((x: any) => x.id.startsWith("live:")) as any)?.msgId ?? "live";
            let phase = r.phase;
            let outputTokens = r.outputTokens;
            if (ev?.type === "message_start") {
                (r as any)._liveMsg = ev.message?.id;
            } else if (ev?.type === "content_block_start") {
                const b = ev.content_block;
                const mid = (r as any)._liveMsg ?? msgId;
                const liveId = `live:${parentId ?? "root"}:${mid}:${ev.index}`;
                if (b?.type === "thinking") {
                    upsert({ kind: "thinking", id: liveId, msgId: mid, text: "", streaming: true, startedAt: now, parentId });
                    phase = "thinking";
                    if (!r.thinkingStartedAt) (r as any).thinkingStartedAt = now;
                    (r as any).thinkingEndedAt = undefined;
                } else {
                    if (r.thinkingStartedAt && !r.thinkingEndedAt) (r as any).thinkingEndedAt = now;
                    if (b?.type === "text") (upsert({ kind: "text", id: liveId, msgId: mid, text: "", streaming: true, parentId }), (phase = "writing"));
                    else if (b?.type === "tool_use") {
                        upsert({ kind: "tool", id: b.id, msgId: mid, name: b.name, input: {}, parentId, startedAt: now, streamingInput: true, partialJson: "" } as any);
                        phase = "tool";
                        (r as any)._toolAt = { ...((r as any)._toolAt ?? {}), [`${parentId ?? "root"}:${ev.index}`]: b.id };
                    }
                }
            } else if (ev?.type === "content_block_delta") {
                const mid = (r as any)._liveMsg ?? msgId;
                const liveId = `live:${parentId ?? "root"}:${mid}:${ev.index}`;
                const cur = items[find(liveId)] as any;
                if (ev.delta?.type === "text_delta") upsert({ kind: "text", id: liveId, msgId: mid, text: (cur?.text ?? "") + ev.delta.text, streaming: true, parentId });
                else if (ev.delta?.type === "thinking_delta")
                    upsert({ kind: "thinking", id: liveId, msgId: mid, text: (cur?.text ?? "") + ev.delta.thinking, streaming: true, startedAt: cur?.startedAt ?? now, parentId });
                else if (ev.delta?.type === "input_json_delta") {
                    const tid = (r as any)._toolAt?.[`${parentId ?? "root"}:${ev.index}`];
                    const ti = tid ? find(tid) : -1;
                    if (ti >= 0 && (items[ti] as any).streamingInput) {
                        const partialJson = ((items[ti] as any).partialJson ?? "") + (ev.delta.partial_json ?? "");
                        const input = parsePartialJson(partialJson);
                        items[ti] = { ...(items[ti] as any), partialJson, ...(input && typeof input === "object" ? { input } : {}) };
                    }
                }
                const n = (ev.delta?.text ?? ev.delta?.thinking ?? ev.delta?.partial_json ?? "").length;
                (r as any).streamChars = (r.streamChars ?? 0) + n;
            } else if (ev?.type === "content_block_stop") {
                const mid = (r as any)._liveMsg ?? msgId;
                const liveId = `live:${parentId ?? "root"}:${mid}:${ev.index}`;
                const i = find(liveId);
                if (i >= 0 && items[i].kind === "thinking") items[i] = { ...(items[i] as any), endedAt: now };
            } else if (ev?.type === "message_delta") {
                outputTokens = (r.outputTokens ?? 0) + (ev.usage?.output_tokens ?? 0);
            }
            return { ...r, items, busy: true, phase, outputTokens };
        }

        if ((m.type === "assistant" || m.type === "user") && m.uuid && !parentId) {
            (r as any)._prevForUser = r.lastUuid;
            (r as any).lastUuid = m.uuid;
        }
        if (m.type === "assistant") {
            // the CLI doesn't echo streamed-in prompts: the first reply confirms delivery of the optimistic user message
            for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "user" && (items[i] as any).local) items[i] = { ...(items[i] as any), local: false };
            const msg = m.message;
            const mid = msg?.id ?? m.uuid;
            // the complete message supersedes the streamed partials of the same message
            const liveThinking = items.find(x => x.kind === "thinking" && x.id.startsWith("live:") && (x as any).msgId === mid) as any;
            for (let i = items.length - 1; i >= 0; i--)
                if (items[i].id.startsWith("live:") && ((items[i] as any).msgId === mid || (items[i] as any).msgId === "live")) items.splice(i, 1);
            blocksOf(msg?.content).forEach((b: any, i: number) => {
                // the SDK sends one message per content block, all sharing message.id: key by the message's own uuid
                const bid = `${m.uuid ?? mid}:${i}`;
                if (b.type === "text" && b.text?.trim())
                    upsert({ kind: "text", id: bid, msgId: mid, text: b.text, parentId, ...(m.timestamp ? { at: Date.parse(m.timestamp) } : {}) } as any);
                else if ((b.type === "thinking" || b.type === "redacted_thinking") && (b.thinking ?? "").trim())
                    upsert({
                        kind: "thinking",
                        id: bid,
                        msgId: mid,
                        text: b.thinking,
                        parentId,
                        startedAt: liveThinking?.startedAt,
                        endedAt: liveThinking?.endedAt ?? (live ? now : undefined),
                    });
                else if (b.type === "tool_use") {
                    const prev = items[find(b.id)] as any;
                    upsert({
                        kind: "tool",
                        id: b.id,
                        msgId: mid,
                        name: b.name,
                        input: b.input,
                        parentId,
                        startedAt: prev?.startedAt ?? (live ? now : undefined),
                        streamingInput: false,
                    });
                }
            });
            if (m.error) items.push({ kind: "marker", id: "err:" + (m.uuid ?? now), type: "error", text: String(m.error), at: now });
            return { ...r, items, busy: live ? true : r.busy };
        }

        if (m.type === "user") {
            const blocks = blocksOf(m.message?.content);
            const results = blocks.filter((b: any) => b.type === "tool_result");
            if (results.length) {
                for (const b of results) {
                    const i = items.findIndex(x => x.kind === "tool" && x.id === b.tool_use_id);
                    if (i >= 0) items[i] = { ...(items[i] as any), result: { content: b.content, isError: b.is_error }, endedAt: live ? now : undefined };
                }
                return { ...r, items, phase: live ? "requesting" : r.phase };
            }
            if (m.isSynthetic || m.isMeta || parentId) return r;
            const text = blocks
                .filter((b: any) => b.type === "text")
                .map((b: any) => b.text)
                .join("\n");
            const de = /^<discord-event>([\s\S]*)<\/discord-event>$/.exec(text.trim());
            if (de) {
                // same id as the live marker (the Discord message id), so history and live don't show it twice
                const dmid = /message_id (\d+)/.exec(de[1])?.[1];
                if (dmid && items.some(x => x.id === "de:" + dmid)) return { ...r, items };
                items.push({ kind: "marker", id: "de:" + (dmid ?? m.uuid ?? now), type: "discord", text: de[1], at: m.timestamp ? Date.parse(m.timestamp) : now });
                return { ...r, items };
            }
            if (text.includes("[Request interrupted by user")) {
                items.push({ kind: "marker", id: "int:" + (m.uuid ?? now), type: "interrupted", at: now });
                return { ...r, items };
            }
            if (isLocalCommandEcho(text)) {
                const out = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)?.[1];
                const cmd = text.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1];
                if (cmd) {
                    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1];
                    upsert({ kind: "user", id: m.uuid ?? "cmd:" + now, text: `${cmd}${args ? " " + args : ""}` });
                }
                if (out?.trim()) items.push({ kind: "marker", id: "local:" + (m.uuid ?? now), type: "local", text: out.trim() });
                return { ...r, items };
            }
            const images = blocks.filter((b: any) => b.type === "image").map((b: any) => `data:${b.source?.media_type};base64,${b.source?.data}`);
            if (text || images.length) {
                // replace the optimistic local echo with the real (uuid-bearing) message
                const li = items.findIndex(x => x.kind === "user" && x.local && x.text === text);
                const it: Item = {
                    kind: "user",
                    id: m.uuid ?? crypto.randomUUID(),
                    text,
                    images,
                    origin: m.origin && m.origin.kind !== "human" ? m.origin : undefined,
                    at: m.timestamp ? Date.parse(m.timestamp) : items[li]?.kind === "user" ? (items[li] as any).at : undefined,
                    prevUuid: prevUuidBefore(items, r, li),
                };
                if (li >= 0) items[li] = it;
                else upsert(it);
            }
            return { ...r, items };
        }

        if (m.type === "result") {
            if (m.uuid && items.some(x => x.id === m.uuid)) return r;
            if (r.stopping && m.subtype === "error_during_execution") items.push({ kind: "marker", id: "int:" + (m.uuid ?? now), type: "interrupted", at: now });
            items.push({
                kind: "result",
                id: m.uuid ?? "result:" + now,
                subtype: m.subtype,
                cost: m.total_cost_usd,
                durationMs: m.duration_ms,
                turns: m.num_turns,
                usage: m.usage,
                isError: m.is_error,
                terminalReason: m.terminal_reason,
                text: m.subtype === "success" ? undefined : (m.errors ?? []).join("\n") || m.result,
                at: now,
            });
            return {
                ...r,
                items,
                busy: false,
                lastResult: m,
                ...(m.fast_mode_state ? { fastMode: { state: m.fast_mode_state, reason: m.fast_mode_disabled_reason } } : {}),
                phase: undefined,
                turnStartedAt: undefined,
                outputTokens: 0,
                streamChars: 0,
                thinkingStartedAt: undefined,
                thinkingEndedAt: undefined,
                stopping: false,
            };
        }

        if (m.type === "tool_use_summary") {
            const summaries = { ...r.summaries };
            for (const t of m.preceding_tool_use_ids ?? []) summaries[t] = m.summary;
            return { ...r, summaries };
        }
        if (m.type === "tool_progress") return { ...r, toolElapsed: { ...r.toolElapsed, [m.tool_use_id]: m.elapsed_time_seconds } };
        if (m.type === "prompt_suggestion") return { ...r, suggestion: m.suggestion };
        if (m.type === "rate_limit_event") {
            const info = m.rate_limit_info;
            if (live && (info?.status === "rejected" || info?.status === "allowed_warning") && r.rateLimit?.status !== info.status)
                items.push({ kind: "marker", id: "rl:" + (m.uuid ?? now), type: info.status === "rejected" ? "error" : "info", text: rateLimitText(info), data: info, at: now });
            return { ...r, items, rateLimit: info };
        }
        if (m.type === "auth_status") return { ...r, auth: { isAuthenticating: m.isAuthenticating, output: m.output ?? [], error: m.error } };
        if (m.type === "conversation_reset") {
            items.push({ kind: "marker", id: "reset:" + (m.uuid ?? now), type: "reset", data: { trigger: m.trigger }, at: now });
            return { ...r, items };
        }

        if (m.type === "system") {
            switch (m.subtype) {
                case "init":
                    if (m.fast_mode_state) r = { ...r, fastMode: { state: m.fast_mode_state, reason: m.fast_mode_disabled_reason } } as any;
                    if (!items.some(x => x.kind === "marker" && x.type === "init"))
                        items.push({
                            kind: "marker",
                            id: "init:" + m.session_id,
                            type: "init",
                            data: {
                                model: m.model,
                                cwd: m.cwd,
                                tools: m.tools?.length,
                                mcp: m.mcp_servers,
                                provider: r.capabilities?.provider,
                                pluginErrors: m.plugin_errors,
                                plugins: m.plugins?.length,
                            },
                            at: now,
                        });
                    return { ...r, items };
                case "compact_boundary":
                    items.push({ kind: "marker", id: m.uuid, type: "compact", data: m.compact_metadata, at: now });
                    return { ...r, items };
                case "status":
                    // a failed compaction says why (the session keeps going uncompacted)
                    if (m.compact_result === "failed")
                        items.push({
                            kind: "marker",
                            id: "cf:" + (m.uuid ?? now),
                            type: "error",
                            text: `Couldn’t compact the conversation${m.compact_error ? `: ${m.compact_error}` : "."}`,
                            at: now,
                        });
                    return { ...r, items, phase: m.status === "compacting" ? "compacting" : m.status === "requesting" ? "requesting" : r.phase };
                case "api_retry":
                    upsert({ kind: "marker", id: "retry:" + (m.uuid ?? now), type: "retry", data: m, at: now });
                    return { ...r, items };
                case "informational":
                    items.push({ kind: "marker", id: m.uuid, type: "info", text: m.content, data: { level: m.level }, at: now });
                    return { ...r, items };
                case "local_command_output":
                    items.push({ kind: "marker", id: m.uuid, type: "local", text: m.content, at: now });
                    return { ...r, items };
                case "permission_denied":
                    items.push({ kind: "marker", id: m.uuid, type: "denied", text: m.message, data: m, at: now });
                    return { ...r, items };
                case "notification":
                    items.push({ kind: "marker", id: m.uuid, type: "notification", text: m.text, data: m, at: now });
                    return { ...r, items };
                case "model_refusal_fallback":
                    // the refused partial is retracted: drop it from the transcript
                    for (const u of m.retracted_message_uuids ?? [])
                        for (let k = items.length - 1; k >= 0; k--) if (items[k].id === u || items[k].id.startsWith(u + ":")) items.splice(k, 1);
                    items.push({
                        kind: "marker",
                        id: m.uuid,
                        type: "refusal",
                        text: `Switched from ${m.original_model} to ${m.fallback_model}${m.api_refusal_explanation ? ` — ${m.api_refusal_explanation}` : ""}`,
                        data: m,
                        at: now,
                    });
                    return { ...r, items };
                case "model_refusal_no_fallback":
                    items.push({ kind: "marker", id: m.uuid, type: "error", text: m.content || m.api_refusal_explanation || `${m.original_model} declined this request`, at: now });
                    return { ...r, items };
                case "hook_started":
                    return { ...r, hooks: { ...r.hooks, [m.hook_id]: { name: m.hook_name, event: m.hook_event, startedAt: now } } };
                case "hook_progress":
                    return r;
                case "hook_response": {
                    const hooks = { ...r.hooks };
                    delete hooks[m.hook_id];
                    if (m.outcome === "error" || (m.exit_code && m.exit_code !== 0))
                        items.push({
                            kind: "marker",
                            id: m.uuid,
                            type: "hook",
                            text: `${m.hook_event} hook “${m.hook_name}” failed${m.stderr ? `: ${m.stderr.trim()}` : ""}`,
                            data: { ...m, failed: true },
                            at: now,
                        });
                    else if ((m.output ?? "").trim()) items.push({ kind: "marker", id: m.uuid, type: "hook", text: m.output.trim(), data: m, at: now });
                    return { ...r, items, hooks };
                }
                case "plugin_install":
                    items.push({
                        kind: "marker",
                        id: m.uuid,
                        type: m.status === "failed" ? "error" : "info",
                        text: `Plugin ${m.name ?? ""} ${m.status}${m.error ? `: ${m.error}` : ""}`,
                        at: now,
                    });
                    return { ...r, items };
                case "task_updated": {
                    const key = Object.keys(r.tasks).find(k => r.tasks[k].taskId === m.task_id) ?? m.task_id;
                    const prev = r.tasks[key] ?? { taskId: m.task_id, description: m.patch?.description ?? "" };
                    const st = m.patch?.status;
                    return {
                        ...r,
                        tasks: {
                            ...r.tasks,
                            [key]: {
                                ...prev,
                                description: m.patch?.description ?? prev.description,
                                status: st === "killed" ? "stopped" : st === "pending" || st === "paused" ? "running" : (st ?? prev.status),
                            },
                        },
                    };
                }
                case "background_tasks_changed":
                    return { ...r, bgTasks: (m.tasks ?? []).filter((t: any) => !t.ambient) };
                case "thinking_tokens":
                    return { ...r, thinkingTokens: m.estimated_tokens };
                case "session_state_changed":
                    return { ...r, sessionState: m.state, busy: m.state === "idle" ? false : r.busy || m.state === "running" };
                case "worker_shutting_down":
                    items.push({ kind: "marker", id: m.uuid, type: "info", text: `Claude Code is shutting down: ${m.reason}`, at: now });
                    return { ...r, items };
                case "commands_changed":
                    return { ...r, capabilities: { ...(r.capabilities ?? { models: [], account: null, commands: [] }), commands: m.commands ?? [] } };
                case "files_persisted":
                    items.push({
                        kind: "marker",
                        id: m.uuid,
                        type: "files",
                        text: `Saved ${m.files?.length ?? 0} file${m.files?.length === 1 ? "" : "s"}${m.failed?.length ? `, ${m.failed.length} failed` : ""}`,
                        data: m,
                        at: now,
                    });
                    return { ...r, items };
                case "memory_recall":
                    items.push({
                        kind: "marker",
                        id: m.uuid,
                        type: "memory",
                        text: `Recalled ${m.memories?.length ?? 0} ${m.memories?.length === 1 ? "memory" : "memories"}`,
                        data: m,
                        at: now,
                    });
                    return { ...r, items };
                case "mirror_error":
                    items.push({ kind: "marker", id: m.uuid, type: "error", text: `Couldn’t mirror the session: ${m.error}`, at: now });
                    return { ...r, items };
                case "elicitation_complete": {
                    // the server confirmed a URL-mode elicitation (e.g. OAuth finished in the browser): close its card
                    const q = r.requests.find((x: any) => x.data?.elicitationId && x.data.elicitationId === m.elicitation_id);
                    if (q) setTimeout(() => answerRequest(id, q, { action: "accept" }), 0);
                    return r;
                }
                case "control_request_progress":
                    return r;
                case "task_started":
                case "task_progress":
                case "task_notification": {
                    const key = m.tool_use_id ?? m.task_id;
                    const prev = r.tasks[key] ?? { taskId: m.task_id, description: m.description };
                    const next: TaskInfo = {
                        ...prev,
                        toolUseId: m.tool_use_id,
                        description: m.description ?? prev.description,
                        subagentType: m.subagent_type ?? prev.subagentType,
                        summary: m.summary ?? prev.summary,
                        lastToolName: m.last_tool_name ?? prev.lastToolName,
                        usage: m.usage ?? prev.usage,
                        status: m.subtype === "task_notification" ? m.status : "running",
                    };
                    return { ...r, tasks: { ...r.tasks, [key]: next } };
                }
            }
        }
        return r;
    });
}

export function rateLimitText(info: any) {
    const when = info?.resetsAt
        ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
        : null;
    const kind = info?.rateLimitType === "five_hour" ? "5-hour limit" : info?.rateLimitType?.startsWith("seven_day") ? "weekly limit" : "usage limit";
    if (info?.status === "rejected") return `Rate limited: you’ve hit your ${kind}.${when ? ` Resets ${when}.` : ""}`;
    const pct = info?.utilization != null ? Math.round(info.utilization <= 1 ? info.utilization * 100 : info.utilization) : null;
    return `You’ve used ${pct != null ? pct + "% of " : "most of "}your ${kind}.${when ? ` Resets ${when}.` : ""}`;
}

// uuid of the message just before a user message (the rewind point that drops it)
function prevUuidBefore(items: Item[], r: Runtime, li: number) {
    return (r as any)._prevForUser ?? undefined;
}

// After a renderer reload the CLI sessions keep running in the main process: restore their live state.
export async function restoreLive() {
    try {
        const snap = await N().agents.snapshot();
        for (const s of snap.sessions ?? [])
            patchRt(s.localId, r => ({
                ...r,
                status: "running",
                busy: s.busy,
                capabilities: s.caps ?? r.capabilities,
                turnStartedAt: s.busy ? Date.now() : undefined,
                phase: s.busy ? "requesting" : undefined,
            }));
        for (const q of snap.requests ?? []) patchRt(q.localId, r => ({ ...r, requests: r.requests.some(x => x.requestId === q.requestId) ? r.requests : [...r.requests, q] }));
        for (const p of snap.permissions ?? [])
            patchRt(p.localId, r => ({ ...r, permissions: r.permissions.some(x => x.requestId === p.requestId) ? r.permissions : [...r.permissions, p] }));
    } catch {}
}

// ---------------- runtime events
let installed = false;
export function installAgentEvents() {
    if (installed) return;
    installed = true;
    const off = N().agents.onEvent((ev: any) => {
        const { localId, type, data } = ev;
        if (type === "message") {
            ingest(localId, data);
            if (data?.type === "system" && data.subtype === "status" && data.permissionMode) updateChat(localId, { permissionMode: data.permissionMode });
            if (data?.type === "result") {
                maybeSummaryTitle(localId);
                bumpUnread(localId);
                drainQueue(localId);
                refreshUsage(localId);
            }
        } else if (type === "status")
            patchRt(localId, r => {
                const alive = data.state === "running";
                // a session that ended can't take answers any more
                return { ...r, status: data.state, busy: alive ? r.busy : false, error: data.error, ...(alive ? {} : { permissions: [], requests: [] }) };
            });
        else if (type === "permission") {
            // the same requestId again = updated details (e.g. a Codex patch whose diff arrived later)
            patchRt(localId, r =>
                r.permissions.some(p => p.requestId === data.requestId)
                    ? { ...r, permissions: r.permissions.map(p => (p.requestId === data.requestId ? data : p)) }
                    : { ...r, permissions: [...r.permissions, data] },
            );
            bumpUnread(localId);
        } else if (type === "permission-cancelled") patchRt(localId, r => ({ ...r, permissions: r.permissions.filter(p => p.requestId !== data.requestId) }));
        else if (type === "request") {
            patchRt(localId, r => ({ ...r, requests: [...r.requests.filter(x => x.requestId !== data.requestId), data] }));
            bumpUnread(localId);
        } else if (type === "request-cancelled") patchRt(localId, r => ({ ...r, requests: r.requests.filter(x => x.requestId !== data.requestId) }));
        else if (type === "capabilities") {
            patchRt(localId, r => ({ ...r, capabilities: data }));
            refreshUsage(localId);
        } else if (type === "chat-updated" && data)
            // main also writes the chats file; take its fields here so the renderer's next save keeps them (e.g. Codex thread names)
            updateChat(localId, {
                ...(data.sessionId !== undefined ? { sessionId: data.sessionId } : {}),
                model: chatById(localId)?.model ?? data.model,
                ...(data.titled && data.title && !chatById(localId)?.titled ? { title: data.title, autoTitle: false, titled: true } : {}),
            });
        else if (type === "draft")
            patchRt(localId, r => ({
                ...r,
                items: [...r.items, { kind: "draft", id: "draft:" + Date.now(), channelId: data.channel_id, content: data.content, replyTo: data.reply_to_message_id }],
            }));
        else if (type === "focus") set({ activeId: localId, open: true });
        else if (type === "history") {
            // a restarted Codex session replays its thread; the transcript already has it
            if (rt(localId).historyLoaded && rt(localId).items.length) return;
            for (const m of data ?? []) ingest(localId, m, false);
            patchRt(localId, r => ({ ...r, historyLoaded: true }));
        } else if (type === "context-usage") patchRt(localId, r => ({ ...r, contextUsage: data }));
        else if (type === "usage") patchRt(localId, r => ({ ...r, usage: data }));
        else if (type === "discord-event")
            patchRt(localId, r => ({
                ...r,
                busy: true,
                turnStartedAt: r.busy ? r.turnStartedAt : Date.now(),
                phase: r.busy ? r.phase : "requesting",
                items: [
                    ...r.items,
                    {
                        kind: "marker",
                        id: "de:" + (data.message?.id ?? Date.now()),
                        type: "discord",
                        text: `New message in ${data.channel} (channel_id ${data.channel_id}) from ${data.message?.author}:\n${data.message?.content ?? ""}`,
                        data,
                        at: Date.now(),
                    },
                ],
            }));
        else if (type === "ping") {
            patchRt(localId, r => ({
                ...r,
                items: [...r.items, { kind: "marker", id: "ping:" + Date.now(), type: "ping", text: data.title + (data.body ? ` — ${data.body}` : ""), at: Date.now() }],
            }));
            bumpUnread(localId);
        }
    });
    return () => {
        off();
        installed = false;
    };
}

// Claude Code writes a short summary title for each session; use it once the first turn is done
async function maybeSummaryTitle(id: string) {
    const c = chatById(id);
    if (!c?.autoTitle || !c.sessionId) return;
    try {
        const list = await N().agents.listSessions({ dir: c.cwd, limit: 20 });
        const s = (list ?? []).find((x: any) => x.sessionId === c.sessionId);
        const t = s?.customTitle || (s?.summary && s.summary !== s.firstPrompt ? s.summary : undefined);
        if (t && t !== c.title && t.length <= 80) updateChat(id, { title: t, autoTitle: false, titled: true });
    } catch {}
}

function bumpUnread(id: string) {
    const s = get();
    if (s.open && s.activeId === id && document.hasFocus()) return;
    updateChat(id, { unread: (chatById(id)?.unread ?? 0) + 1 });
}

// ---------------- actions
const sessionOpts = (chat: AgentChat) => ({
    provider: chat.provider ?? "claude",
    fast: chat.fast,
    resumeSessionAt: chat.resumeSessionAt,
    forkSession: chat.forkSession,
    localId: chat.localId,
    cwd: chat.cwd,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permissionMode,
    resume: chat.sessionId,
    attachedChannelId: chat.attachedChannelId,
});

// Start the CLI as soon as a chat is opened so models, commands and usage are ready before the first prompt.
export async function warm(chat: AgentChat) {
    if (rt(chat.localId).status === "running") return;
    patchRt(chat.localId, r => ({ ...r, status: "running", error: undefined }));
    try {
        await N().agents.start({ ...sessionOpts(chat), warm: true });
    } catch (e) {
        patchRt(chat.localId, r => ({ ...r, status: "error", error: String(e) }));
    }
}

export async function refreshUsage(id: string) {
    try {
        const [contextUsage, usage] = await Promise.all([
            N()
                .agents.contextUsage(id)
                .catch(() => null),
            N()
                .agents.usage(id)
                .catch(() => null),
        ]);
        patchRt(id, r => ({ ...r, contextUsage: contextUsage ?? r.contextUsage, usage: usage ?? r.usage }));
    } catch {}
}

export async function loadHistory(chat: AgentChat) {
    if (!chat.sessionId || rt(chat.localId).historyLoaded) return;
    if (chat.provider === "codex") return; // Codex history arrives with the resumed thread
    patchRt(chat.localId, r => ({ ...r, historyLoaded: true }));
    try {
        const msgs = await N().agents.history(chat.sessionId, chat.cwd);
        // anything that arrived live while history was loading goes after the history
        const before = rt(chat.localId);
        const live = before.items;
        patchRt(chat.localId, r => ({ ...r, items: [] }));
        for (const m of msgs ?? []) ingest(chat.localId, m, false);
        // replaying past results mustn't make a turn that's running right now look idle
        const { busy, phase, turnStartedAt, stopping, outputTokens, streamChars, thinkingStartedAt, thinkingEndedAt } = before;
        patchRt(chat.localId, r => {
            const ids = new Set(r.items.map(x => x.id));
            return {
                ...r,
                items: [...r.items, ...live.filter(x => !ids.has(x.id))],
                busy,
                phase,
                turnStartedAt,
                stopping,
                outputTokens,
                streamChars,
                thinkingStartedAt,
                thinkingEndedAt,
            };
        });
    } catch (e) {
        console.error("[Claude] history", e);
    }
}

function contentOf(text: string, images: { mediaType: string; data: string }[]) {
    const content: any[] = [];
    for (const im of images) content.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } });
    if (text) content.push({ type: "text", text });
    return content;
}

// "!cmd" in the composer: run it, show the output, and hand it to Claude with the next message (like the CLI's bash mode)
export async function runShell(chat: AgentChat, cmd: string) {
    const id = "sh:" + crypto.randomUUID();
    patchRt(chat.localId, r => ({ ...r, items: [...r.items, { kind: "marker", id, type: "local", text: `! ${cmd}\n…`, at: Date.now() } as any] }));
    const res = await N()
        .agents.shell(chat.cwd, cmd)
        .catch((e: any) => ({ ok: false, stdout: "", stderr: String(e) }));
    const out = [res.stdout, res.stderr]
        .filter((x: string) => x?.trim())
        .join("\n")
        .trimEnd();
    patchRt(chat.localId, r => ({
        ...r,
        items: r.items.map(x => (x.id === id ? ({ ...x, text: `! ${cmd}\n${out || (res.ok ? "(no output)" : `exit ${res.code}`)}` } as any) : x)),
        shellContext: [
            ...((r as any).shellContext ?? []),
            `<bash-input>${cmd}</bash-input>\n<bash-stdout>${res.stdout.slice(-8000)}</bash-stdout>\n<bash-stderr>${res.stderr.slice(-4000)}</bash-stderr>`,
        ],
    }));
}

export async function sendPrompt(chat: AgentChat, text: string, images: { mediaType: string; data: string }[] = []) {
    const sh: string[] = (rt(chat.localId) as any).shellContext ?? [];
    if (sh.length) {
        patchRt(chat.localId, r => ({ ...r, shellContext: [] }) as any);
        text = `${sh.join("\n\n")}\n\n${text}`;
    }
    const content = contentOf(text, images);
    // typing while Claude asks a question answers it with the message (as claude.ai does), instead of queueing behind it
    const question = rt(chat.localId).permissions.find(p => p.toolName === "AskUserQuestion");
    if (question && text.trim() && !images.length) {
        const reply = `[User did not answer this question — they sent a message instead]: ${text.trim()}`;
        const qs: any[] = question.input?.questions ?? [];
        answerPermission(chat.localId, question, { allow: true, updatedInput: { ...question.input, answers: Object.fromEntries(qs.map(q => [q.question, reply])) } });
        patchRt(chat.localId, r => ({ ...r, items: [...r.items, { kind: "user", id: "reply:" + crypto.randomUUID(), text, images: [], at: Date.now() } as any] }));
        return;
    }
    if (rt(chat.localId).busy) {
        // Claude Code queues messages typed mid-turn; they're sent when the turn ends.
        patchRt(chat.localId, r => ({ ...r, queued: [...r.queued, { id: crypto.randomUUID(), content, text }] }));
        return;
    }
    dispatch(chat, content, text);
}

async function dispatch(chat: AgentChat, content: any[], text: string) {
    const images = content.filter(b => b.type === "image").map(b => `data:${b.source.media_type};base64,${b.source.data}`);
    const uuid = crypto.randomUUID(); // the CLI keeps our uuid, so rewind/fork can target this message
    patchRt(chat.localId, r => ({
        ...r,
        lastUuid: uuid,
        items: [...r.items, { kind: "user", id: uuid, text, images, at: Date.now(), local: true, prevUuid: r.lastUuid }],
        busy: true,
        status: "running",
        phase: "requesting",
        turnStartedAt: Date.now(),
        outputTokens: 0,
        streamChars: 0,
        thinkingStartedAt: undefined,
        thinkingEndedAt: undefined,
        suggestion: undefined,
    }));
    if ((chat.title === chat.cwd.split("/").pop() || chat.autoTitle) && text && !chat.titled)
        updateChat(chat.localId, { title: text.replace(/\s+/g, " ").slice(0, 60), autoTitle: true });
    await N().agents.send(chat.localId, content, sessionOpts(chat), uuid);
    // the resume point / fork flag only apply to the session start they were set for
    if (chat.resumeSessionAt || chat.forkSession) updateChat(chat.localId, { resumeSessionAt: undefined, forkSession: undefined });
}

function drainQueue(id: string) {
    const r = rt(id);
    const chat = chatById(id);
    if (!chat || !r.queued.length) return;
    const [next, ...rest] = r.queued;
    patchRt(id, x => ({ ...x, queued: rest }));
    dispatch(chat, next.content, next.text);
}
// "Send now": it goes to the head of the queue (images included) and the interrupt's result sends it
export function sendQueuedNow(id: string, qid: string) {
    patchRt(id, r => {
        const it = r.queued.find(q => q.id === qid);
        return it ? { ...r, queued: [it, ...r.queued.filter(q => q.id !== qid)] } : r;
    });
    if (rt(id).busy) interrupt(id);
    else drainQueue(id);
}
export const removeQueued = (id: string, qid: string) => patchRt(id, r => ({ ...r, queued: r.queued.filter(q => q.id !== qid) }));

export function interrupt(id: string) {
    patchRt(id, r => ({ ...r, stopping: true }));
    N().agents.interrupt(id);
}

// Rewind: restore files to before this message (file checkpoints) and continue the session from just before it.
export async function rewindTo(chat: AgentChat, item: Extract<Item, { kind: "user" }>) {
    // files are restored by the live CLI process: bring it back if it was reaped, and don't cut the
    // conversation when the working tree couldn't follow
    let res: any;
    try {
        if (!(await N().agents.running(chat.localId))) await N().agents.start({ ...sessionOpts(chat), warm: true });
        res = await N().agents.rewind(chat.localId, item.id, false);
    } catch (e) {
        res = { canRewind: false, error: String((e as any)?.message ?? e) };
    }
    if (!res || res.canRewind === false) {
        const why = res?.error ?? "the session isn’t running";
        patchRt(chat.localId, x => ({
            ...x,
            items: [...x.items, { kind: "marker", id: "err:rw:" + Date.now(), type: "error", text: `Couldn’t rewind files: ${why}`, at: Date.now() }],
        }));
        return null;
    }
    await N().agents.stop(chat.localId);
    const r = rt(chat.localId);
    const idx = r.items.findIndex(x => x.id === item.id);
    patchRt(chat.localId, x => ({ ...x, items: x.items.slice(0, Math.max(0, idx)), status: "idle", busy: false, permissions: [] }));
    // rewinding past the first message starts a fresh session in the same folder
    updateChat(chat.localId, item.prevUuid ? { resumeSessionAt: item.prevUuid } : { sessionId: undefined, resumeSessionAt: undefined });
    return item.text;
}

// Fork: a new agent chat that continues from this point; the original is untouched.
export async function forkFrom(chat: AgentChat, item: Extract<Item, { kind: "user" }>) {
    const r = rt(chat.localId);
    const idx = r.items.findIndex(x => x.id === item.id);
    const fork = await newChat({
        cwd: chat.cwd,
        title: chat.title + " (fork)",
        provider: chat.provider,
        sessionId: chat.sessionId,
        model: chat.model,
        effort: chat.effort,
        fast: chat.fast,
        permissionMode: chat.permissionMode,
    });
    if (!fork) return;
    updateChat(fork.localId, { resumeSessionAt: item.prevUuid, forkSession: true });
    patchRt(fork.localId, x => ({ ...x, items: r.items.slice(0, Math.max(0, idx)), historyLoaded: true }));
}

export function toggleChapter(chat: AgentChat, msgId: string, title: string) {
    const chapters = { ...(chat.chapters ?? {}) };
    if (chapters[msgId]) delete chapters[msgId];
    else chapters[msgId] = title;
    updateChat(chat.localId, { chapters });
}

export function answerPermission(
    chatId: string,
    p: Permission,
    decision: { allow: boolean; updatedPermissions?: any[]; updatedInput?: any; message?: string; interrupt?: boolean },
) {
    N().agents.permission(p.requestId, decision);
    patchRt(chatId, r => ({ ...r, permissions: r.permissions.filter(x => x.requestId !== p.requestId) }));
}

export function answerRequest(chatId: string, q: PendingRequest, result: any) {
    N().agents.respond(q.requestId, result);
    patchRt(chatId, r => ({ ...r, requests: r.requests.filter(x => x.requestId !== q.requestId) }));
}

export function setMode(chat: AgentChat, mode: PermissionMode) {
    updateChat(chat.localId, { permissionMode: mode });
    N().agents.setMode(chat.localId, mode);
}
export function setModel(chat: AgentChat, model: string | undefined) {
    updateChat(chat.localId, { model });
    N().agents.setModel(chat.localId, model);
    setTimeout(() => refreshUsage(chat.localId), 400);
}
export function setEffort(chat: AgentChat, effort: Effort) {
    updateChat(chat.localId, { effort });
    N().agents.setEffort(chat.localId, effort);
}
export function setFast(chat: AgentChat, fast: boolean) {
    updateChat(chat.localId, { fast });
    N().agents.setFast(chat.localId, fast);
}
export const clearSuggestion = (id: string) => patchRt(id, r => ({ ...r, suggestion: undefined }));

export const setView = (patch: Partial<Pick<State, "open" | "activeId">>) => set(patch);
