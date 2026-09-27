// The live card inside a /claude reply message: spark sprite + status, the session's tool calls as they happen,
// inline approvals, the formatted answer, and actions. Mounted (in its own shadow root) into the message's
// accessories area; the message itself stays a plain local app message.
import { useEffect, useMemo, useState } from "react";
import { useAgents, answerPermission, interrupt, setView, type Item } from "./store";
import { mountShadow, type ShadowMount } from "./cds/shadow";
import { Spark, StaticSpark } from "./cds/Spark";
import { Icon } from "./cds/Icon";
import { Button } from "./cds/Button";
import { Prose } from "./epitaxy/Prose";
import { toolLabel } from "./epitaxy/labels";
import { ComponentDispatch, Dispatcher, Stores } from "./discord";

export interface CardRun {
    localId: string;
    channelId: string;
    prompt: string;
    command: string;
    at: number;
    msgId?: string;
    startIdx: number; // where this run's items begin in the session transcript
}

const TOOL_ICON: Record<string, any> = {
    Read: "File",
    Write: "FileAdd",
    Edit: "Edit",
    MultiEdit: "Edit",
    Bash: "CommandLine",
    Grep: "Search",
    Glob: "Search",
    WebSearch: "Globe",
    WebFetch: "Globe",
    Task: "Agent",
    Agent: "Agent",
    TodoWrite: "CheckCircle",
};
const clean = (n: string) => n.replace(/^mcp__discord__/, "").replace(/^mcp__\w+?__/, "");

function RunCard({ run }: { run: CardRun }) {
    const r = useAgents(s => s.runtimes[run.localId]);
    const chat = useAgents(s => s.chats.find(c => c.localId === run.localId));
    const [now, setNow] = useState(Date.now());
    const [all, setAll] = useState(false);
    useEffect(() => {
        if (!r?.busy) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [r?.busy]);
    // this run only: from its prompt to its own result (a later /claude in the same session doesn't touch this card)
    const { items, done } = useMemo(() => {
        const rest = (r?.items ?? []).slice(run.startIdx);
        const end = rest.findIndex((i: any) => i.kind === "result");
        return { items: end >= 0 ? rest.slice(0, end + 1) : rest, done: end >= 0 };
    }, [r?.items, run.startIdx]);
    if (!r || !chat) return null;
    const tools = items.filter((i: any) => i.kind === "tool" && !i.parentId) as any[];
    const texts = items.filter((i: any) => i.kind === "text" && !i.parentId) as any[];
    const answer = texts[texts.length - 1]?.text ?? "";
    const draft = [...(r.items ?? [])].reverse().find((i: any) => i.kind === "draft" && i.channelId === run.channelId) as any;
    const perms = done ? [] : r.permissions;
    const busy = !done && r.busy;
    const result = items.find((i: any) => i.kind === "result") as any;
    const failed = done && (result?.isError || (result?.subtype && result.subtype !== "success"));
    const secs = Math.max(0, Math.round(((done ? (result?.at ?? run.at) : now) - run.at) / 1000));
    const status = perms.length
        ? "Needs your ok"
        : busy
          ? r.phase === "thinking"
              ? "Thinking"
              : tools.length && r.phase === "tool"
                ? "Working"
                : "Writing"
          : failed
            ? "Couldn’t finish"
            : done
              ? "Done"
              : "Waiting";
    const shown = all ? tools : tools.slice(-6);

    const useDraft = () => {
        if (draft.replyTo) {
            const channel = Stores.Channel()?.getChannel(run.channelId);
            const message = Stores.Message()?.getMessage(run.channelId, draft.replyTo);
            if (channel && message) Dispatcher()?.dispatch({ type: "CREATE_PENDING_REPLY", channel, message, shouldMention: true, showMentionToggle: true });
        }
        ComponentDispatch()?.dispatchToLastSubscribed("INSERT_TEXT", { rawText: draft.content, plainText: draft.content });
    };

    return (
        <div
            className="flex flex-col gap-sm rounded-card px-lg py-md"
            style={{ background: "var(--dl-raised, #17171a)", border: "1px solid var(--dl-border, #232327)", maxWidth: 560 }}
        >
            {/* status: the spark sprite animates while Claude works */}
            <div className="flex items-center gap-sm">
                <span className="flex size-[20px] shrink-0 items-center justify-center">
                    {busy && !perms.length ? (
                        <Spark state={r.phase === "thinking" ? "thinking" : "writing"} size={20} />
                    ) : perms.length ? (
                        <Icon name="Hand" size="sm" className="text-warning" />
                    ) : (
                        <StaticSpark size={18} />
                    )}
                </span>
                <span
                    className={`text-body-medium ${perms.length ? "text-warning" : failed ? "text-danger" : "text-primary"} ${busy && !perms.length ? "epitaxy-thinking-shimmer" : ""}`}
                >
                    {status}
                </span>
                <span className="text-footnote text-muted tabular-nums">{secs ? `${secs}s` : ""}</span>
                <span className="flex-1" />
                <span className="text-footnote text-muted truncate max-w-[220px]" title={chat.title}>
                    {chat.title}
                </span>
            </div>

            {tools.length > 0 && (
                <div className="flex flex-col gap-0.5">
                    {tools.length > 6 && !all && (
                        <button type="button" className="cds-reset self-start text-footnote text-muted hover:text-primary cursor-pointer" onClick={() => setAll(true)}>
                            {tools.length - 6} earlier step{tools.length - 6 === 1 ? "" : "s"}
                        </button>
                    )}
                    {shown.map(t => {
                        const l = toolLabel(t.name, t.input, t.result);
                        const running = !t.result && busy;
                        const err = t.result?.isError;
                        const text = running
                            ? (l.runningLabel ?? `${l.runningVerb}${l.meta ? ` ${l.meta}` : ""}`)
                            : err
                              ? (l.failedLabel ?? `${l.failedVerb}${l.meta ? ` ${l.meta}` : ""}`)
                              : (l.doneLabel ?? `${l.verb}${l.meta ? ` ${l.meta}` : ""}`);
                        return (
                            <div key={t.id} className="flex min-w-0 items-center gap-sm text-footnote">
                                <Icon
                                    name={TOOL_ICON[t.name] ?? (t.name.startsWith("mcp__discord__") ? "Chat" : "Wrench")}
                                    size="xs"
                                    className={err ? "text-danger" : "text-muted"}
                                />
                                <span
                                    className={`min-w-0 truncate ${running ? "text-primary epitaxy-thinking-shimmer" : err ? "text-danger" : "text-secondary"}`}
                                    title={clean(t.name)}
                                >
                                    {text.charAt(0).toUpperCase() + text.slice(1)}
                                </span>
                                {!running && !err && <Icon name="Check" size="xs" className="shrink-0 text-muted" />}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* approvals right in the message */}
            {perms.slice(0, 1).map(p => {
                const l = toolLabel(p.toolName, p.input);
                return (
                    <div key={p.requestId} className="flex flex-col gap-xs rounded bg-alpha-1 px-md py-sm">
                        <span className="text-body text-primary">
                            Allow Claude to {l.verb.toLowerCase()}
                            {l.meta ? ` ${l.meta}` : ""}?
                        </span>
                        {p.toolName.startsWith("mcp__discord__") && p.input?.content && (
                            <span className="text-footnote text-secondary whitespace-pre-wrap break-words">“{String(p.input.content).slice(0, 400)}”</span>
                        )}
                        {p.input?.command && <code className="text-footnote text-secondary break-all">{String(p.input.command).slice(0, 300)}</code>}
                        <div className="flex gap-xs pt-xs">
                            <Button variant="primary" size="sm" onClick={() => answerPermission(run.localId, p, { allow: true })}>
                                Allow
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => answerPermission(run.localId, p, { allow: false })}>
                                Deny
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setView({ open: true, activeId: run.localId })}>
                                Review
                            </Button>
                        </div>
                    </div>
                );
            })}

            {answer && (
                <div className="text-body text-primary select-text" style={{ maxHeight: 420, overflowY: "auto" }}>
                    <Prose text={answer} cwd={chat.cwd} streaming={busy} />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-xs">
                {draft && !busy && (
                    <Button variant="primary" size="sm" icon="Edit" onClick={useDraft}>
                        Use draft
                    </Button>
                )}
                {busy && (
                    <Button variant="secondary" size="sm" icon="StopCircle" onClick={() => interrupt(run.localId)}>
                        Stop
                    </Button>
                )}
                <Button variant="ghost" size="sm" icon="ArrowOutSquare" onClick={() => setView({ open: true, activeId: run.localId })}>
                    Open session
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- mounting into messages
const mounted = new Map<string, { host: HTMLElement; root: ShadowMount }>();
export function syncCards(runs: CardRun[]) {
    for (const run of runs) {
        if (!run.msgId) continue;
        const acc = document.getElementById(`message-accessories-${run.msgId}`);
        const cur = mounted.get(run.msgId);
        if (cur && acc?.contains(cur.host)) continue;
        if (cur) (cur.root.unmount(), mounted.delete(run.msgId));
        if (!acc) continue;
        const host = document.createElement("div");
        host.className = "dl-root dl-claude-card";
        host.dataset.eviClaude = "card";
        // first in the message's accessories, so Discord's "Only you can see this" stays underneath (like real app replies)
        acc.prepend(host);
        const root = mountShadow(host, { density: "compact", detachedPortal: true });
        root.render(<RunCard run={run} />);
        mounted.set(run.msgId, { host, root });
    }
}

export function unmountCards() {
    for (const { host, root } of mounted.values()) {
        root.unmount();
        host.remove();
    }
    mounted.clear();
}
