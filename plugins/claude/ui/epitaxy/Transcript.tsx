// Claude Code web transcript: rows, user turns, assistant turns, markers, the working row and scroll pinning.
import { N } from "../native";
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAgents, rt, rewindTo, forkFrom, toggleChapter, setView, warm, sendPrompt, type AgentChat, type Item, type Runtime } from "../store";
import { Icon } from "../cds/Icon";
import { Button } from "../cds/Button";
import { ShimmerText } from "../cds/ShimmerText";
import { Spark, StaticSpark } from "../cds/Spark";
import { TextLink } from "../cds/Controls";
import { Popover } from "../cds/Menu";
import { Prose } from "./Prose";
import { ToolsItem, type ToolItem, type ToolCtx } from "./Tools";
import { COLUMN, ROW_PAD, ExpandingBody, Caret, Spinner, useCopy, formatDuration, HOVER_REVEAL_BODY } from "./primitives";
import { channelLabel, Stores, discordTools, openChannel } from "../discord";
import { useLightbox } from "./Lightbox";
import { useSetting } from "./ChatPanel";
import { lazyMemo } from "../lazyReact";
const placeDraft = (a: any) => discordTools.placeDraft(a);

const EMPTY_ITEMS: Item[] = [];

// ---------------------------------------------------------------- building rows
type Block =
    | { kind: "text"; item: Extract<Item, { kind: "text" }> }
    | { kind: "thinking"; item: Extract<Item, { kind: "thinking" }> }
    | { kind: "tools"; tools: ToolItem[] }
    | { kind: "marker"; item: Extract<Item, { kind: "marker" }> }
    | { kind: "draft"; item: Extract<Item, { kind: "draft" }> }
    | { kind: "result"; item: Extract<Item, { kind: "result" }> };

type Row =
    | { kind: "human"; id: string; item: Extract<Item, { kind: "user" }> }
    | { kind: "assistant"; id: string; blocks: Block[]; at?: number; msgIds: string[] }
    | { kind: "marker"; id: string; item: Extract<Item, { kind: "marker" }> };

function buildRows(items: Item[]) {
    const rows: Row[] = [];
    const children: Record<string, Item[]> = {};
    let turn: Extract<Row, { kind: "assistant" }> | null = null;
    const ensure = () => {
        if (!turn) {
            turn = { kind: "assistant", id: "turn:" + rows.length, blocks: [], msgIds: [] };
            rows.push(turn);
        }
        return turn;
    };
    for (const it of items) {
        const parent = (it as any).parentId;
        if (parent) {
            (children[parent] ??= []).push(it);
            continue;
        }
        if (it.kind === "user") {
            turn = null;
            rows.push({ kind: "human", id: it.id, item: it });
            continue;
        }
        if (it.kind === "marker" && it.type === "init" && rows.some(x => x.kind === "marker" && x.item.type === "init")) continue;
        if (it.kind === "marker" && it.type === "local" && /^Compacted/i.test(it.text ?? "")) continue; // the compaction row already says it
        if (it.kind === "marker" && it.type === "discord") {
            turn = null;
            rows.push({ kind: "marker", id: it.id, item: it });
            continue;
        }
        if (it.kind === "marker" && (it.type === "init" || it.type === "compact" || it.type === "reset")) {
            turn = null;
            rows.push({ kind: "marker", id: it.id, item: it });
            continue;
        }
        const t = ensure();
        if ("msgId" in it && it.msgId && !t.msgIds.includes(it.msgId)) t.msgIds.push(it.msgId);
        if (t.id.startsWith("turn:") && "msgId" in it && it.msgId) t.id = it.msgId;
        const last = t.blocks[t.blocks.length - 1];
        if (it.kind === "tool") {
            if (last?.kind === "tools") last.tools.push(it);
            else t.blocks.push({ kind: "tools", tools: [it] });
        } else if (it.kind === "text") {
            t.blocks.push({ kind: "text", item: it });
            // restored history has no live result: the message's own timestamp dates the turn
            if ((it as any).at) t.at = (it as any).at;
        } else if (it.kind === "thinking") t.blocks.push({ kind: "thinking", item: it });
        else if (it.kind === "marker") t.blocks.push({ kind: "marker", item: it });
        else if (it.kind === "draft") t.blocks.push({ kind: "draft", item: it });
        else if (it.kind === "result") {
            t.at = it.at;
            // a user interrupt ends the turn with error_during_execution: claude.ai shows nothing for it
            const interrupted = t.blocks.some(b => b.kind === "marker" && b.item.type === "interrupted");
            if ((it.subtype !== "success" || it.isError || (it.terminalReason && TERMINAL[it.terminalReason])) && !interrupted && !/^\[ede_diagnostic\]/.test(it.text ?? ""))
                t.blocks.push({ kind: "result", item: it });
        }
    }
    return { rows, children };
}

// ---------------------------------------------------------------- transcript
export function Transcript({ chat, showThinking }: { chat: AgentChat; showThinking: boolean }) {
    const r = useAgents(s => s.runtimes[chat.localId]) ?? rt(chat.localId);
    const items = r.items ?? EMPTY_ITEMS;
    const { rows, children } = useMemo(() => buildRows(items), [items]);
    const awaiting = useMemo(() => new Set(r.permissions.map(p => p.toolUseID).filter(Boolean) as string[]), [r.permissions]);
    const [verbose] = useSetting<boolean>("verbose", false);
    const ctx: ToolCtx = { cwd: chat.cwd, busy: r.busy, summaries: r.summaries, tasks: r.tasks, children, awaiting, stopped: !r.busy, verbose };
    const feed = useRef<HTMLDivElement>(null);
    const pinned = useRef(true);
    const [showPill, setShowPill] = useState(false);
    const [sticky, setSticky] = useState<number | null>(null); // index of the prompt pinned at the top while you read its answer

    // stick to the bottom while pinned; release when the user scrolls up
    useLayoutEffect(() => {
        const el = feed.current;
        if (el && pinned.current) el.scrollTop = el.scrollHeight;
    });
    useEffect(() => {
        const el = feed.current;
        if (!el) return;
        const onScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            pinned.current = atBottom;
            setShowPill(!atBottom);
            // the latest prompt that scrolled out above, while its answer is still on screen
            const top = el.getBoundingClientRect().top + 8;
            let idx: number | null = null;
            for (const row of el.querySelectorAll<HTMLElement>('[data-perf-row="human"]')) {
                const b = row.getBoundingClientRect();
                if (b.bottom < top) idx = Number(row.dataset.index);
                else break;
            }
            setSticky(idx);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        const ro = new ResizeObserver(() => pinned.current && (el.scrollTop = el.scrollHeight));
        ro.observe(el.firstElementChild?.nextElementSibling?.nextElementSibling ?? el);
        return () => (el.removeEventListener("scroll", onScroll), ro.disconnect());
    }, []);
    useEffect(() => {
        const onJump = () => {
            pinned.current = true;
            feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
        };
        window.addEventListener("evi-claude:scroll-bottom", onJump);
        return () => window.removeEventListener("evi-claude:scroll-bottom", onJump);
    }, []);

    const lastMsg = rows.reduce((n, row, i) => (row.kind !== "marker" ? i : n), -1);
    const stickyRow = sticky != null ? (rows[sticky] as any) : null;
    // ↑/↓ move between messages when a message has focus
    const onFeedKey = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        const row = (e.target as HTMLElement).closest?.('[data-testid="transcript-row"]') as HTMLElement | null;
        if (!row || e.target !== row) return;
        const next = (e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling) as HTMLElement | null;
        if (next?.dataset.testid === "transcript-row") (e.preventDefault(), next.focus(), next.scrollIntoView({ block: "nearest" }));
    };
    return (
        <div className="epitaxy-chat-panel-body flex-1 min-h-0 relative ">
            {stickyRow?.kind === "human" && (
                <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ zIndex: 3 }}>
                    <div className={COLUMN}>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                aria-label="Scroll to this message"
                                className="epitaxy-sticky-prompt-clip cds-reset pointer-events-auto max-w-[85%] cursor-pointer border-0 p-0"
                                onClick={() => (feed.current?.querySelector(`[data-index="${sticky}"]`) as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            >
                                <span className="epitaxy-sticky-prompt-bubble">
                                    {String(stickyRow.item?.text ?? "")
                                        .replace(/<pasted_text[\s\S]*?<\/pasted_text>/g, "[Pasted text]")
                                        .trim()}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div data-epitaxy-transcript-region="" tabIndex={-1} className="h-full isolate focus:outline-none">
                <div role="status" className="sr-only" data-testid="response-status-announcer">
                    {r.busy ? "Claude is responding" : rows.length ? "Claude finished the response" : ""}
                </div>
                <div className="h-full">
                    <div
                        ref={feed}
                        role="feed"
                        data-perf-region="transcript"
                        aria-label="Chat messages"
                        aria-busy={r.busy}
                        data-testid="epitaxy-virtual-transcript"
                        data-autoscroll-container=""
                        onKeyDown={onFeedKey}
                        className="h-full overflow-y-auto overflow-x-hidden [contain:strict] [overflow-anchor:none] [scrollbar-gutter:stable_both-edges] supports-[animation-timeline:scroll()]:[--epitaxy-top-fade-height:32px] "
                        style={{ overflowAnchor: "none" }}
                    >
                        <p className="sr-only select-none" data-find-omitted="">
                            Use the up and down arrow keys to move between messages.
                        </p>
                        <div
                            aria-hidden="true"
                            className="scroll-fade-strip-top [--cds-scroll-fade-size:var(--epitaxy-top-fade-height)] [--cds-scroll-fade-strip-color:var(--epitaxy-transcript-surface,var(--cds-surface-1))]"
                        />
                        <div data-rocksteady-sizer="" data-testid="transcript-sizer" className="relative epitaxy-transcript-typography">
                            <div aria-hidden="true" data-testid="transcript-end-sentinel" className="absolute bottom-0 left-0 h-px w-full pointer-events-none" />
                            <div data-testid="transcript-rows" className="motion-safe:[&_[data-rs-index]]:animate-transcript-in">
                                <div aria-hidden="true" data-testid="transcript-spacer" style={{ height: 48 }} />
                                {!rows.length && !r.busy && chat.attachedChannelId && <Starters chat={chat} />}
                                {rows.map((row, i) => (
                                    <div
                                        key={row.id}
                                        data-index={i}
                                        data-rs-index={i}
                                        tabIndex={-1}
                                        className="outline-none focus-visible:shadow-focus rounded"
                                        data-testid="transcript-row"
                                        data-perf-row={row.kind}
                                        data-perf-row-streaming={row.kind === "assistant" && r.busy && i === rows.length - 1 ? "true" : "false"}
                                        // long sessions: rows far from the end skip layout/paint while off-screen
                                        style={{
                                            display: "flow-root",
                                            position: "relative",
                                            ...(i < rows.length - 8 ? ({ contentVisibility: "auto", containIntrinsicSize: "auto 160px" } as any) : {}),
                                        }}
                                    >
                                        <RowView
                                            row={row}
                                            index={i}
                                            last={i === lastMsg}
                                            chat={chat}
                                            r={r}
                                            ctx={i === rows.length - 1 ? ctx : { ...ctx, busy: false }}
                                            showThinking={showThinking}
                                            streaming={r.busy && i === rows.length - 1}
                                        />
                                    </div>
                                ))}
                                {r.status === "error" && r.error && (
                                    <div data-testid="transcript-row" data-perf-row="marker" style={{ display: "flow-root", position: "relative" }}>
                                        <div data-transcript-column-row="" className={`${COLUMN} ${ROW_PAD}`}>
                                            <div className="flex w-full max-w-[480px] flex-col items-start gap-1 self-start">
                                                <div className="flex min-w-0 items-center gap-1.25 select-text">
                                                    <Icon name="Warning" size="sm" className="shrink-0 text-danger" />
                                                    <span className="min-w-0 text-body text-secondary">{chat.provider === "codex" ? "Codex stopped" : "Claude Code stopped"}</span>
                                                </div>
                                                <span className="min-w-0 text-body text-secondary break-words select-text">{r.error}</span>
                                                <Button variant="secondary" size="sm" onClick={() => warm(chat)}>
                                                    Restart session
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    data-index={rows.length}
                                    data-testid="transcript-row"
                                    data-perf-row="marker"
                                    data-transcript-keeps-pin=""
                                    style={{ display: "flow-root", position: "relative" }}
                                >
                                    <div data-transcript-column-row="" className={`${COLUMN} [&_[data-solo-line]]:mb-3`}>
                                        <WorkingRow r={r} visible={rows.length > 0 || r.busy} codex={chat.provider === "codex"} localId={chat.localId} />
                                    </div>
                                </div>
                                <div aria-hidden="true" data-testid="transcript-spacer" style={{ height: 48 }} />
                            </div>
                        </div>
                        <div
                            aria-hidden="true"
                            className="scroll-fade-strip-bottom scroll-fade-size-[48px] [--cds-scroll-fade-strip-color:var(--epitaxy-transcript-surface,var(--cds-surface-1))]"
                        />
                    </div>
                </div>
            </div>
            <ScrollPillPortal show={showPill} />
        </div>
    );
}

// The pill is rendered by the composer column; we just broadcast visibility.
function ScrollPillPortal({ show }: { show: boolean }) {
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("evi-claude:scroll-pill", { detail: show }));
    }, [show]);
    return null;
}

const RowView = lazyMemo(function RowView({
    row,
    index,
    last,
    chat,
    r,
    ctx,
    showThinking,
    streaming,
}: {
    row: Row;
    index: number;
    last: boolean;
    chat: AgentChat;
    r: Runtime;
    ctx: ToolCtx;
    showThinking: boolean;
    streaming: boolean;
}) {
    const pad = `${ROW_PAD}${last ? " [&_[data-solo-line]]:mb-3" : ""} empty:pb-0`;
    if (row.kind === "human")
        return (
            <div
                data-epitaxy-entry={row.id}
                data-epitaxy-entry-index={index}
                role="article"
                aria-label={`Message ${index + 1}`}
                tabIndex={-1}
                data-transcript-column-row=""
                className={`${COLUMN} ${pad}`}
            >
                <UserTurn item={row.item} chat={chat} busy={r.busy} />
            </div>
        );
    if (row.kind === "marker")
        return (
            <div data-transcript-column-row="" className={`${COLUMN} ${pad}`}>
                {row.item.type === "discord" ? (
                    <DiscordEvent item={row.item} />
                ) : row.item.type === "init" ? (
                    <InitMarker item={row.item} />
                ) : row.item.type === "reset" ? (
                    <StatusDone label="Context cleared" />
                ) : (
                    <CompactMarker item={row.item} />
                )}
            </div>
        );
    return (
        <div
            data-epitaxy-entry={row.id}
            data-epitaxy-entry-index={index}
            role="article"
            aria-label={streaming ? "Currently streaming message" : `Message ${index + 1}`}
            tabIndex={last ? 0 : -1}
            data-transcript-column-row=""
            className={`${COLUMN} ${pad}`}
        >
            <AssistantTurn row={row} chat={chat} ctx={ctx} showThinking={showThinking} streaming={streaming} />
        </div>
    );
}, rowPropsEqual);

// Rows re-render only when their own items change (items keep their identity until updated), so streaming
// into the last turn doesn't re-render the whole transcript.
function sameRow(a: Row, b: Row) {
    if (a === b) return true;
    if (a.kind !== b.kind || a.id !== b.id) return false;
    if (a.kind === "human" || a.kind === "marker") return a.item === (b as any).item;
    const bb = (b as Extract<Row, { kind: "assistant" }>).blocks;
    if (a.blocks.length !== bb.length || a.at !== (b as any).at) return false;
    return a.blocks.every((x, i) => {
        const y = bb[i] as any;
        if (x.kind !== y.kind) return false;
        if (x.kind === "tools") return x.tools.length === y.tools.length && x.tools.every((t, k) => t === y.tools[k]);
        return (x as any).item === y.item;
    });
}
function rowPropsEqual(p: any, n: any) {
    if (!sameRow(p.row, n.row) || p.index !== n.index || p.last !== n.last || p.streaming !== n.streaming || p.showThinking !== n.showThinking) return false;
    if (p.chat.chapters !== n.chat.chapters || p.chat.model !== n.chat.model || p.chat.sessionId !== n.chat.sessionId) return false;
    // live state only matters to the row that can be running
    if (n.ctx.busy || p.ctx.busy)
        return p.ctx.busy === n.ctx.busy && p.ctx.tasks === n.ctx.tasks && p.ctx.children === n.ctx.children && p.ctx.awaiting === n.ctx.awaiting && p.r.busy === n.r.busy;
    return p.r.busy === n.r.busy;
}

// ---------------------------------------------------------------- user
// who sent a message that isn't yours (the CLI's message origin)
function originLabel(o: any): string | null {
    switch (o?.kind) {
        case "peer":
            return `From another session${o.from ? ` · ${o.from}` : ""}`;
        case "task-notification":
            return "From a background task";
        case "coordinator":
            return "From the coordinator";
        case "auto-continuation":
            return "Continued automatically";
        case "channel":
            return o.server === "discord" ? null : `From ${o.server}`;
        default:
            return null;
    }
}

function UserTurn({ item, chat, busy }: { item: Extract<Item, { kind: "user" }>; chat: AgentChat; busy: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const [interacted, setInteracted] = useState(false);
    const pastes = [...item.text.matchAll(/<pasted_text name="([^"]*)">\n([\s\S]*?)\n<\/pasted_text>/g)].map(m => ({ name: m[1], text: m[2] }));
    const visible = item.text.replace(/<pasted_text name="[^"]*">\n[\s\S]*?\n<\/pasted_text>\s*/g, "").trim();
    const long = visible.length > 1200;
    const paras = visible ? visible.split(/\n{2,}/) : [];
    const [lightbox, openImage] = useLightbox();
    return (
        <div>
            {lightbox}
            <div>
                <div
                    className="group/msg flex justify-start items-start gap-1 w-full "
                    data-take-back-entry={item.id}
                    onPointerEnter={() => setInteracted(true)}
                    onFocusCapture={() => setInteracted(true)}
                >
                    <h2 data-find-omitted="" className="sr-only select-none">
                        You said: {visible}
                    </h2>
                    <div
                        className={`epitaxy-user-turn flex w-full flex-col gap-sm min-w-0 ms-auto items-end ${item.local ? "opacity-60" : ""} transition-opacity duration-base motion-reduce:transition-none group/message-row`}
                    >
                        <div
                            data-cds="UserMessage"
                            className={`group/message-row ms-auto flex w-full min-w-0 flex-col items-end gap-xs font-sans ${item.local ? "animate-code-user-bubble-enter" : ""}`}
                        >
                            {item.origin && originLabel(item.origin) && (
                                <span className="text-footnote text-muted select-none" data-find-omitted="">
                                    {originLabel(item.origin)}
                                </span>
                            )}
                            {!!item.images?.length && (
                                <div data-cds="MessageAttachments" data-fit="natural" className="flex w-full flex-wrap gap-xs justify-end items-end" data-find-omitted="">
                                    {item.images.map((src, k) => (
                                        <button
                                            key={k}
                                            data-cds="MessageAttachmentsImage"
                                            className="self-end relative flex shrink-0 items-center justify-center rounded-lg overflow-hidden border-0.5 border-strong bg-alpha-2 shadow-sm shadow-black/5"
                                            onClick={() => openImage(src)}
                                        >
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                alt={`Attached image ${k + 1}`}
                                                src={src}
                                                style={{ maxHeight: 120, maxWidth: 240, display: "block" }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                            {pastes.length > 0 && (
                                <div data-cds="MessageAttachments" data-fit="natural" className="flex w-full flex-wrap gap-xs justify-end items-end" data-find-omitted="">
                                    {pastes.map((p, k) => (
                                        <div
                                            key={k}
                                            data-cds="MessageAttachmentsFile"
                                            className="self-end select-text flex max-w-full items-center gap-1.25 rounded-lg bg-alpha-2 px-md py-sm"
                                            title={p.text.slice(0, 600)}
                                        >
                                            <Icon name="File" size="sm" className="text-muted" />
                                            <span className="flex min-w-0 flex-col">
                                                <span className="text-body text-primary truncate">{p.name}</span>
                                                <span className="text-footnote text-muted">{p.text.split("\n").length} lines</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!!visible && (
                                <div className="relative flex min-w-0 flex-col gap-xs rounded-card px-lg py-md text-heading font-normal break-words select-text text-primary max-w-[85%] bg-[var(--cds-bg-user-message)]">
                                    <div className="">
                                        <div className="cds-user-message-body">
                                            <div className="flex flex-col gap-1.25">
                                                <div className="contents">
                                                    <div className="contents">
                                                        <div
                                                            className={
                                                                long && !expanded
                                                                    ? "flex flex-col gap-1.25 max-h-[16rem] overflow-clip [mask-image:linear-gradient(to_bottom,black_calc(100%_-_3rem),transparent)]"
                                                                    : "flex flex-col gap-1.25"
                                                            }
                                                        >
                                                            {paras.map((p, k) => (
                                                                <p key={k} className="text-body whitespace-pre-wrap [overflow-wrap:anywhere] text-pretty">
                                                                    {p}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {long && (
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            aria-expanded={expanded}
                                            data-find-omitted=""
                                            className="self-start -ms-pad-md"
                                            onClick={() => setExpanded(!expanded)}
                                        >
                                            {expanded ? "Show less" : "Show more"}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                        {interacted ? (
                            <UserActions item={item} chat={chat} busy={busy} />
                        ) : (
                            <div data-find-omitted="" className="flex items-center">
                                <span aria-hidden="true" className="h-control w-px" />
                                <button type="button" className="sr-only" onFocus={() => setInteracted(true)}>
                                    Show message actions
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function UserActions({ item, chat, busy }: { item: Extract<Item, { kind: "user" }>; chat: AgentChat; busy: boolean }) {
    const [copied, copy] = useCopy();
    // Codex threads can't resume at a message, so rewind/fork are Claude-only
    const canRewind = chat.provider !== "codex" && !item.local && !!chat.sessionId && !item.id.startsWith("local:");
    return (
        <div
            data-cds="MessageActions"
            data-reveal="fade"
            role="toolbar"
            aria-label="Message actions"
            tabIndex={-1}
            className="flex items-center select-none [&_button]:text-muted [&_button:hover:not([aria-pressed=true])]:text-primary"
        >
            {item.at && <RelativeTime at={item.at} />}
            <Button iconOnly icon={copied ? "Check" : "Copy"} aria-label="Copy" title="Copy" onClick={() => copy(item.text)} />
            <span role="status" className="sr-only">
                {copied ? "Copied" : ""}
            </span>
            {canRewind && (
                <>
                    <Button
                        iconOnly
                        icon="ArrowCounterClockwise"
                        aria-label="Rewind to here"
                        title={busy ? "Rewind is unavailable while Claude is working" : "Rewind to here\nRemoves this message and everything after it."}
                        disabled={busy}
                        onClick={async () => {
                            const text = await rewindTo(chat, item);
                            if (text != null) window.dispatchEvent(new CustomEvent("evi-claude:composer-set", { detail: { localId: chat.localId, text } }));
                        }}
                    />
                    <Button
                        iconOnly
                        icon="ArrowSplitRight"
                        aria-label="Fork from here"
                        title={"Fork from here\nStarts a new session from this point. This one stays as it is."}
                        disabled={busy}
                        onClick={() => forkFrom(chat, item)}
                    />
                </>
            )}
        </div>
    );
}

function RelativeTime({ at }: { at: number }) {
    const [, tick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => tick(x => x + 1), 60_000);
        return () => clearInterval(t);
    }, []);
    return (
        <time
            data-cds="RelativeTime"
            dateTime={new Date(at).toISOString()}
            title={new Date(at).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
            className="flex h-control items-center first:ps-0 last:pe-0 font-normal select-none text-body text-muted tabular-nums ps-md pe-md"
        >
            {relative(at)}
        </time>
    );
}
function relative(at: number) {
    const s = (Date.now() - at) / 1000;
    if (s < 60) return "just now";
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "long" });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
    ];
    for (const [u, n] of units) if (s >= n) return rtf.format(-Math.floor(s / n), u);
    return "just now";
}

// ---------------------------------------------------------------- assistant
function AssistantTurn({
    row,
    chat,
    ctx,
    showThinking,
    streaming,
}: {
    row: Extract<Row, { kind: "assistant" }>;
    chat: AgentChat;
    ctx: ToolCtx;
    showThinking: boolean;
    streaming: boolean;
}) {
    const firstText = row.blocks.find(b => b.kind === "text") as any;
    const chapter = chat.chapters?.[row.msgIds[0]];
    const blocks = row.blocks;
    return (
        <div>
            {chapter && (
                <h2 id={`chapter-${row.msgIds[0]}`} className="text-body-semibold text-primary select-text scroll-mt-[56px]">
                    {chapter}
                </h2>
            )}
            <div className="group/msg group/message-row flex flex-col w-full relative gap-sm">
                {!streaming && firstText && (
                    <h2 data-find-omitted="" className="sr-only select-none">
                        Claude responded: {firstText.item.text.split(/(?<=[.!?])\s/)[0]}
                    </h2>
                )}
                <div className="flex flex-col gap-[var(--chat-item-gap)] select-text">
                    {blocks.map((b, k) => (
                        <BlockView key={k} block={b} ctx={ctx} chat={chat} showThinking={showThinking} />
                    ))}
                </div>
                {!streaming && blocks.some(b => b.kind === "text") && (
                    <div data-find-omitted="" className="contents">
                        <AssistantActions row={row} chat={chat} />
                    </div>
                )}
            </div>
        </div>
    );
}

function BlockView({ block, ctx, chat, showThinking }: { block: Block; ctx: ToolCtx; chat: AgentChat; showThinking?: boolean }) {
    switch (block.kind) {
        case "text":
            return (
                <div>
                    <Prose text={block.item.text} cwd={ctx.cwd} streaming={block.item.streaming} />
                </div>
            );
        case "thinking":
            return (
                <div className="contents" data-find-omitted="">
                    <ThinkingBlock item={block.item as any} defaultOpen={!!showThinking} />
                </div>
            );
        case "tools":
            return <ToolsItem tools={block.tools} ctx={ctx} />;
        case "marker":
            return (
                <div className="contents" data-find-omitted="">
                    <ErrorLine item={block.item} />
                </div>
            );
        case "result":
            return (
                <div className="contents" data-find-omitted="">
                    <ErrorLine item={{ kind: "marker", id: block.item.id, type: "error", text: resultError(block.item) }} />
                </div>
            );
        case "draft":
            return <DraftCard item={block.item} />;
    }
}
const TERMINAL: Record<string, string> = {
    prompt_too_long: "The conversation is too long for the model. Compact it or start a new session.",
    blocking_limit: "Stopped: the context window is full. Compact the conversation to continue.",
    image_error: "An image couldn’t be processed.",
    stop_hook_prevented: "A stop hook kept Claude from finishing.",
    hook_stopped: "A hook stopped this turn.",
    budget_exhausted: "Stopped after reaching the budget limit.",
    malformed_tool_use_exhausted: "Claude kept producing invalid tool calls and stopped.",
    turn_setup_failed: "The turn couldn’t start.",
};
function resultError(it: Extract<Item, { kind: "result" }>) {
    const why = (it as any).terminalReason && TERMINAL[(it as any).terminalReason];
    if (why && !it.text) return why;
    switch (it.subtype) {
        case "error_max_turns":
            return "Stopped after reaching the turn limit.";
        case "error_max_budget_usd":
            return "Stopped after reaching the budget limit.";
        case "error_during_execution":
            return it.text || "Something went wrong while Claude was working.";
        default:
            return it.text || "Claude stopped unexpectedly.";
    }
}

// collapsed to "Thought for Ns" like claude.ai; "Show thinking" in view options opens them by default
function ThinkingBlock({ item, defaultOpen }: { item: { id: string; text: string; startedAt?: number; endedAt?: number }; defaultOpen: boolean }) {
    const [copied, copy] = useCopy();
    const [open, setOpen] = useState(defaultOpen);
    useEffect(() => setOpen(defaultOpen), [defaultOpen]);
    const text = item.text;
    const live = item.id.startsWith("live:") || (item.startedAt != null && item.endedAt == null);
    const secs = item.startedAt && item.endedAt ? Math.max(1, Math.round((item.endedAt - item.startedAt) / 1000)) : null;
    const label = live ? "Thinking" : secs ? `Thought for ${secs}s` : "Thought process";
    return (
        <div className="flex flex-col w-full">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="relative group/tool flex self-start max-w-full items-center py-0 gap-0.5 text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm"
            >
                {live ? (
                    <ShimmerText active className="text-body">
                        {label}
                    </ShimmerText>
                ) : (
                    <span className={`text-body ${open ? "text-secondary" : "text-muted group-hover/tool:text-secondary"}`}>{label}</span>
                )}
                <Caret expanded={open} colorClassName={open ? "text-secondary" : "text-muted"} />
            </button>
            <ExpandingBody expanded={open}>
                <div className="border-l-2 border-alpha-2 pl-md mt-xs">
                    <ThinkingText text={text} copied={copied} copy={copy} />
                </div>
            </ExpandingBody>
        </div>
    );
}
function ThinkingText({ text, copied, copy }: { text: string; copied: boolean; copy: (t: string) => void }) {
    return (
        <>
            <div className="group/thinking relative">
                <div className="epitaxy-markdown-inherit-color text-muted break-words pr-[calc(var(--cds-h-control)+var(--cds-pad-xs))]">
                    <Prose text={text} />
                </div>
                <div className="absolute right-0 top-0 opacity-0 pointer-events-none group-hover/thinking:opacity-100 group-hover/thinking:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity duration-fast ease-snap group-hover/thinking:duration-snap group-hover/thinking:delay-100 group-has-[:focus-visible]/thinking:duration-snap focus-within:duration-snap starting:opacity-0 motion-reduce:transition-none pointer-coarse:transition-none [@media(hover:none)]:transition-none">
                    <Button
                        iconOnly
                        icon={copied ? "Check" : "Copy"}
                        aria-label={copied ? "Copied" : "Copy as quote"}
                        onClick={() =>
                            copy(
                                `> **Thinking** (~${Math.round(text.length / 4)} tok)\n>\n` +
                                    text
                                        .split("\n")
                                        .map(l => "> " + l)
                                        .join("\n"),
                            )
                        }
                    />
                </div>
            </div>
        </>
    );
}

function AssistantActions({ row, chat }: { row: Extract<Row, { kind: "assistant" }>; chat: AgentChat }) {
    const [copied, copy] = useCopy();
    const [speaking, setSpeaking] = useState(false);
    const text = row.blocks
        .filter(b => b.kind === "text")
        .map((b: any) => b.item.text)
        .join("\n\n");
    const chapter = chat.chapters?.[row.msgIds[0]];
    return (
        <div
            data-cds="MessageActions"
            data-reveal="fade"
            role="toolbar"
            aria-label="Message actions"
            tabIndex={-1}
            className="flex items-center select-none [&_button]:text-muted [&_button:hover:not([aria-pressed=true])]:text-primary"
        >
            <Button iconOnly icon={copied ? "Check" : "Copy"} aria-label="Copy" title="Copy" tabIndex={0} onClick={() => copy(text)} />
            <span role="status" className="sr-only">
                {copied ? "Copied" : ""}
            </span>
            <Button
                iconOnly
                icon={chapter ? "PinFilled" : "Pin"}
                pressed={!!chapter}
                aria-label={chapter ? "Unpin chapter" : "Pin as chapter"}
                title={chapter ? "Unpin chapter" : "Pin as chapter"}
                tabIndex={-1}
                onClick={() => toggleChapter(chat, row.msgIds[0], (text.split("\n").find(l => l.trim()) ?? "Chapter").replace(/^#+\s*/, "").slice(0, 80))}
            />
            <Button
                iconOnly
                icon={speaking ? "StopCircle" : "Speaker"}
                aria-label="Read aloud"
                title="Read aloud"
                data-testid="epitaxy-read-aloud"
                tabIndex={-1}
                onClick={() => {
                    if (speaking) return (speechSynthesis.cancel(), setSpeaking(false));
                    const u = new SpeechSynthesisUtterance(text.replace(/[`*_#>]/g, ""));
                    u.onend = () => setSpeaking(false);
                    speechSynthesis.speak(u);
                    setSpeaking(true);
                }}
            />
            <TurnChanges row={row} chat={chat} />
            {row.at && <RelativeTime at={row.at} />}
        </div>
    );
}

// files this response changed, with a quick way to open them
function TurnChanges({ row, chat }: { row: Extract<Row, { kind: "assistant" }>; chat: AgentChat }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    const files = useMemo(() => {
        const m = new Map<string, { adds: number; dels: number }>();
        for (const b of row.blocks as any[]) {
            if (b.kind !== "tools") continue;
            for (const t of b.tools) {
                if (t.result?.isError) continue;
                const i = t.input ?? {};
                const add = (p: string, a: number, d: number) => {
                    if (!p) return;
                    const cur = m.get(p) ?? { adds: 0, dels: 0 };
                    m.set(p, { adds: cur.adds + a, dels: cur.dels + d });
                };
                const lines = (x?: string) => (x ? x.split("\n").length : 0);
                if (t.name === "Write") add(i.file_path, lines(i.content), 0);
                else if (t.name === "Edit") add(i.file_path, lines(i.new_string), lines(i.old_string));
                else if (t.name === "MultiEdit") for (const e of i.edits ?? []) add(i.file_path, lines(e.new_string), lines(e.old_string));
                else if (t.name === "ApplyPatch") for (const c of i.changes ?? []) add(c.path, 0, 0);
            }
        }
        return [...m.entries()];
    }, [row.blocks]);
    if (!files.length) return null;
    const rel = (p: string) => (p.startsWith(chat.cwd + "/") ? p.slice(chat.cwd.length + 1) : p);
    return (
        <>
            <Button
                ref={ref}
                iconOnly
                icon="ChangesPlusMinus"
                aria-label="Changes in this response"
                title={`Changes in this response\n${files.length} file${files.length === 1 ? "" : "s"}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                tabIndex={-1}
                onClick={() => setOpen(!open)}
            />
            <Popover open={open} onClose={() => setOpen(false)} anchor={ref} side="top" align="start" padding="p-xs" className="w-[360px] max-w-[calc(100vw-2rem)]">
                <div className="px-sm py-xs text-footnote text-muted">Changed in this response</div>
                {files.map(([p, c]) => (
                    <button
                        key={p}
                        type="button"
                        className="cds-reset flex w-full items-center gap-sm rounded px-sm py-xs text-left hover:bg-alpha-1 cursor-pointer"
                        onClick={() => N().agents.openPath(p.startsWith("/") ? p : `${chat.cwd}/${p}`)}
                    >
                        <Icon name="File" size="sm" className="shrink-0 text-muted" />
                        <span className="flex-1 min-w-0 truncate text-body text-primary">{rel(p)}</span>
                        {(c.adds > 0 || c.dels > 0) && (
                            <span className="shrink-0 text-footnote tabular-nums">
                                <span className="text-git-added">+{c.adds}</span> <span className="text-git-removed">-{c.dels}</span>
                            </span>
                        )}
                    </button>
                ))}
            </Popover>
        </>
    );
}

// ---------------------------------------------------------------- markers
function ErrorLine({ item }: { item: Extract<Item, { kind: "marker" }> }) {
    const [open, setOpen] = useState(false);
    if (item.type === "local" || item.type === "info" || item.type === "notification") {
        // informational levels: warnings stand out, notices stay quiet
        const level = item.data?.level ?? item.data?.priority;
        if (level === "warning" || level === "high" || level === "immediate")
            return (
                <div className="flex min-w-0 items-start gap-1.25 select-text ps-[var(--cds-assistant-message-text-inset,0px)]">
                    <Icon name="Warning" size="sm" className="shrink-0 mt-0.5 text-warning" />
                    <span className="min-w-0 text-body text-primary whitespace-pre-wrap break-words">{item.text}</span>
                </div>
            );
        return (
            <div
                className={`text-body ${level === "notice" || level === "low" ? "text-muted" : "text-secondary"} whitespace-pre-wrap break-words select-text ps-[var(--cds-assistant-message-text-inset,0px)]`}
            >
                {item.text}
            </div>
        );
    }
    if (item.type === "retry" || item.type === "interrupted") return null; // retry: live in the working row; interrupts leave no row
    if (item.type === "memory") return <MemoryLine item={item} />;
    if (item.type === "ping")
        return (
            <div className="flex min-w-0 items-center gap-1.25 select-text ps-[var(--cds-assistant-message-text-inset,0px)]">
                <Icon name="Notification" size="sm" className="shrink-0" style={{ color: "var(--cds-clay)" }} />
                <span className="min-w-0 text-body text-primary">{item.text}</span>
            </div>
        );
    if (item.type === "files" || item.type === "refusal" || (item.type === "hook" && !item.data?.failed))
        return (
            <div className="flex min-w-0 items-start gap-1.25 select-text ps-[var(--cds-assistant-message-text-inset,0px)]">
                <Icon
                    name={item.type === "files" ? "Files" : item.type === "refusal" ? "ArrowSplitRight" : "Lightning"}
                    size="sm"
                    className="shrink-0 text-muted"
                    style={{ marginTop: 2 }}
                />
                <span className="min-w-0 text-body text-secondary whitespace-pre-wrap break-words">{item.text}</span>
            </div>
        );
    const rate = /rate.?limit|usage limit/i.test(item.text ?? "");
    const net = /network|ECONN|fetch failed|offline/i.test(item.text ?? "");
    const icon = rate ? "UsageGaugeHigh" : net ? "CloudSlash" : item.type === "denied" ? "Info" : "Warning";
    const label = item.type === "denied" ? "Permission denied" : item.type === "hook" ? "Hook failed" : rate ? "Rate limited" : net ? "Network error" : "Something went wrong";
    return (
        <div className="flex w-full max-w-[480px] flex-col items-start gap-1 self-start ps-[var(--cds-assistant-message-text-inset,0px)]">
            <div className="flex min-w-0 items-center gap-1.25 select-text">
                <Icon name={icon} size="sm" className={`shrink-0 ${icon === "Info" || icon === "CloudSlash" ? "text-secondary" : "text-danger"}`} />
                <span className="min-w-0 text-body text-secondary">{label}</span>
            </div>
            {item.text && item.text.length < 160 && <span className="min-w-0 text-body text-secondary break-words select-text">{item.text}</span>}
            {item.text && item.text.length >= 160 && (
                <>
                    <TextLink onClick={() => setOpen(!open)}>{open ? "Hide details" : "View details"}</TextLink>
                    {open && <pre className="whitespace-pre-wrap break-words rounded-[3px] bg-alpha-1 p-xs text-code text-secondary select-text">{item.text}</pre>}
                </>
            )}
        </div>
    );
}

// prompt starters for a session attached to a Discord conversation (all read-only or drafts)
function Starters({ chat }: { chat: AgentChat }) {
    const ch = Stores.Channel()?.getChannel(chat.attachedChannelId!);
    const who = ch ? channelLabel(ch) : "this conversation";
    const starters = [
        {
            icon: "ListBullet" as const,
            label: `Summarize my chat with ${who}`,
            prompt: `Read the recent messages in the attached Discord conversation (${who}) and summarize what's been discussed, decided, and what's still open.`,
        },
        {
            icon: "Edit" as const,
            label: "Draft a reply to the last message",
            prompt: `Read the recent messages in the attached Discord conversation and prepare a reply to the last message with draft_reply, in my usual tone.`,
        },
        {
            icon: "Checklist" as const,
            label: "What do I owe them?",
            prompt: `From the attached Discord conversation, list anything I promised or still need to deliver, with dates if mentioned.`,
        },
        {
            icon: "Eye" as const,
            label: "Watch for new messages",
            prompt: `Watch the attached Discord conversation with watch_channel. When a new message arrives, tell me briefly and draft a reply if one is needed.`,
        },
    ];
    return (
        <div data-transcript-column-row="" className={`${COLUMN} ${ROW_PAD}`}>
            <div className="flex flex-col gap-xs">
                <div className="flex items-center gap-xs pb-xs">
                    <StaticSpark size={16} />
                    <span className="text-body text-secondary">
                        Attached to {who}. Try one of these, or type in Discord’s message box and press ⌘⇧↵ to ask me instead of sending.
                    </span>
                </div>
                {starters.map(s => (
                    <button
                        key={s.label}
                        className="flex items-center gap-sm w-full rounded px-md py-sm text-left bg-alpha-1 hover:bg-alpha-2 focus-visible:outline-hidden focus-visible:shadow-focus"
                        onClick={() => sendPrompt(chat, s.prompt)}
                    >
                        <Icon name={s.icon} size="sm" className="text-muted shrink-0" />
                        <span className="text-body text-primary">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function DiscordEvent({ item }: { item: Extract<Item, { kind: "marker" }> }) {
    const m = /New message in (.*?) \(channel_id (\d+)\) from (.*?)(?: \(user_id \d+\))?(?:, message_id \d+)?:\n([\s\S]*)$/.exec(item.text ?? "");
    const [, channel, channelId, author, content] = m ?? [null, "Discord", "", "", item.text];
    return (
        <div className="flex w-full max-w-[85%] flex-col gap-xs rounded-card px-lg py-md select-text" style={{ boxShadow: "inset 0 0 0 1px var(--cds-border)" }}>
            <div className="flex items-center gap-xs text-footnote text-muted">
                <Icon name="Chat" size="xs" />
                <span className="truncate">
                    {author} in{" "}
                    <button
                        className="text-footnote text-secondary hover:underline underline-offset-[3px]"
                        onClick={() => channelId && (setView({ open: false }), openChannel(channelId))}
                    >
                        {channel}
                    </button>
                </span>
                {item.at && <span className="ms-auto shrink-0">{relative(item.at)}</span>}
            </div>
            <div className="text-body text-primary whitespace-pre-wrap break-words">{content}</div>
        </div>
    );
}

function MemoryLine({ item }: { item: Extract<Item, { kind: "marker" }> }) {
    const [open, setOpen] = useState(false);
    const mems: any[] = item.data?.memories ?? [];
    return (
        <div className="flex flex-col w-full">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="relative group/tool flex self-start max-w-full items-center py-0 gap-0.75 text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm cursor-pointer"
            >
                <span className="text-body text-muted group-hover/tool:text-secondary">{item.text}</span>
                <Caret expanded={open} colorClassName={open ? "text-secondary" : "text-muted group-hover/tool:text-secondary"} />
            </button>
            <ExpandingBody expanded={open}>
                <div className="flex flex-col gap-1 pt-xs">
                    {mems.map((m, k) => (
                        <div key={k} className="flex flex-col gap-0.5 rounded bg-alpha-1 px-md py-sm">
                            <span className="text-footnote text-muted">
                                {m.scope} · {m.path}
                            </span>
                            {m.content && <span className="text-body text-secondary whitespace-pre-wrap break-words">{m.content}</span>}
                        </div>
                    ))}
                </div>
            </ExpandingBody>
        </div>
    );
}

function StatusDone({ label }: { label: string }) {
    return (
        <div data-cds="TurnStatus" data-state="done" className="group/status flex w-full min-w-0 flex-col" data-find-omitted="">
            <div
                tabIndex={-1}
                className="flex min-w-0 items-center gap-xs text-start font-sans text-body font-normal items-center py-[calc((var(--cds-h-control)_-_1lh)_/_2)] w-stretch px-xs rounded outline-none"
            >
                <span className="min-w-0 whitespace-normal break-words text-muted">
                    <bdi>{label}</bdi>
                </span>
            </div>
        </div>
    );
}

function InitMarker({ item }: { item: Extract<Item, { kind: "marker" }> }) {
    const [open, setOpen] = useState(false);
    const d = item.data ?? {};
    const mcp: any[] = d.mcp ?? [];
    const failedMcp = mcp.filter(m => m.status === "failed");
    const others = mcp.filter(m => m.name !== "discord");
    const pluginErrors: any[] = d.pluginErrors ?? [];
    const steps: { label: string; state: string; note?: string }[] = [
        { label: d.provider === "codex" ? "Started Codex" : "Started Claude Code", state: "done" },
        { label: `Opened ${String(d.cwd ?? "").replace(/^\/Users\/[^/]+/, "~")}`, state: "done" },
        { label: "Connected to Discord", state: mcp.some(m => m.name === "discord" && m.status === "connected") || !mcp.length ? "done" : "failed" },
        ...(others.filter(m => m.status === "connected").length
            ? [
                  {
                      label: `Connected ${others.filter(m => m.status === "connected").length} MCP server${others.filter(m => m.status === "connected").length === 1 ? "" : "s"}`,
                      state: "done",
                  },
              ]
            : []),
        // needs-auth / disabled servers are skipped, not failed; failures name the server
        ...others
            .filter(m => m.status === "needs-auth" || m.status === "disabled" || m.status === "pending")
            .map(m => ({
                label: `Skipped ${m.name}`,
                state: "skipped",
                note: m.status === "needs-auth" ? "Needs authentication — reconnect it from + → Connectors" : m.status === "disabled" ? "Turned off" : "Still connecting",
            })),
        ...failedMcp.filter(m => m.name !== "discord").map(m => ({ label: `Couldn’t connect to ${m.name}`, state: "failed", note: m.error })),
        ...(d.plugins ? [{ label: `Loaded ${d.plugins} plugin${d.plugins === 1 ? "" : "s"}`, state: "done" }] : []),
        ...pluginErrors.map(e => ({ label: `Plugin ${e.plugin} didn’t load`, state: "failed", note: e.message })),
    ];
    return (
        <div className="flex flex-col w-full">
            <div className="flex flex-col gap-0.5">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="flex self-start max-w-full items-center gap-0.75 text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm"
                >
                    <ShimmerText className={`text-body min-w-0 truncate ${failedMcp.length || pluginErrors.length ? "text-danger" : "text-primary"}`}>
                        Initialized session
                    </ShimmerText>
                    <Caret expanded={open} colorClassName="text-secondary " />
                </button>
            </div>
            <ExpandingBody expanded={open}>
                <div className="flex flex-col gap-0.75 pt-[var(--chat-item-gap)]">
                    {steps.map((s, k) => (
                        <div key={k} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                                <span className="flex size-[14px] shrink-0 items-center justify-center">
                                    <span className="sr-only">{s.state === "done" ? "Completed" : s.state === "skipped" ? "Skipped" : "Failed"}</span>
                                    {s.state === "skipped" ? (
                                        <span aria-hidden="true" className="relative size-[10px] rounded-full border border-alpha-3">
                                            <span className="absolute left-1/2 top-1/2 h-px w-[10px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-alpha-3" />
                                        </span>
                                    ) : (
                                        <Icon name={s.state === "done" ? "CheckCircle" : "XCircle"} size="xs" className={s.state === "done" ? "text-success" : "text-danger"} />
                                    )}
                                </span>
                                <span className={`text-body ${s.state === "done" ? "text-primary" : s.state === "skipped" ? "text-secondary" : "text-danger"}`}>{s.label}</span>
                            </div>
                            {s.note && <p className="ml-[22px] text-footnote text-secondary break-words">{s.note}</p>}
                        </div>
                    ))}
                    {d.model && <p className="ml-[22px] text-footnote text-secondary">Model: {d.model}</p>}
                </div>
            </ExpandingBody>
        </div>
    );
}

const fmtTokens = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));

function CompactMarker({ item }: { item: Extract<Item, { kind: "marker" }> }) {
    const m = item.data ?? {};
    const label =
        m.pre_tokens && m.post_tokens && m.pre_tokens > m.post_tokens
            ? `Compacted session · saved ${fmtTokens(m.pre_tokens - m.post_tokens)} tokens`
            : m.pre_tokens
              ? `Compacted session · from ${fmtTokens(m.pre_tokens)} tokens`
              : "Compacted session";
    return (
        <div data-cds="TurnStatus" data-state="done" className="group/status flex w-full min-w-0 flex-col" data-find-omitted="">
            <div
                tabIndex={-1}
                className="flex min-w-0 items-center gap-xs text-start font-sans text-body font-normal items-center py-[calc((var(--cds-h-control)_-_1lh)_/_2)] w-stretch px-xs rounded outline-none"
            >
                <span className="flex min-w-0 gap-xs items-center">
                    <span className="flex min-w-0 items-center">
                        <span className="min-w-0 whitespace-normal break-words text-muted">
                            <bdi>{label}</bdi>
                        </span>
                    </span>
                </span>
            </div>
            <span className="sr-only" role="status" aria-live="polite">
                {label}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------- Discord draft
function DraftCard({ item }: { item: Extract<Item, { kind: "draft" }> }) {
    const ch = Stores.Channel()?.getChannel(item.channelId);
    const [copied, copy] = useCopy();
    return (
        <div className="epitaxy-card-outline flex w-full max-w-[480px] flex-col overflow-clip rounded-lg select-text">
            <div className="flex items-center gap-1 bg-alpha-1 px-lg py-md">
                <Icon name="PaperPlane" size="sm" className="text-secondary" />
                <span className="min-w-0 flex-1 truncate text-body text-primary">Draft reply · {ch ? channelLabel(ch) : item.channelId}</span>
            </div>
            <div className="px-lg py-md text-body text-primary whitespace-pre-wrap break-words">{item.content}</div>
            <div className="flex items-center justify-end gap-sm px-lg pb-lg">
                <Button variant="secondary" onClick={() => copy(item.content)}>
                    {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="primary" onClick={() => placeDraft({ channel_id: item.channelId, content: item.content, reply_to_message_id: item.replyTo })}>
                    Open in Discord
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- working row
const THINK_VERBS: [number, string][] = [
    [60, "Almost done thinking…"],
    [45, "Thinking some more…"],
    [30, "Thinking more…"],
    [15, "Still thinking…"],
    [0, "Thinking…"],
];
// "N running tasks": opens the list of background tasks, each with Stop
function BgTasksChip({ r, localId, lead }: { r: Runtime; localId?: string; lead?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    const n = r.bgTasks.length;
    return (
        <>
            <button
                ref={ref}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                className="epitaxy-status-control inline-flex items-center cds-reset cursor-pointer text-footnote text-secondary hover:text-primary"
                onClick={() => setOpen(!open)}
            >
                {lead && <span className="px-xs">·</span>}
                {n} running task{n === 1 ? "" : "s"}
            </button>
            <Popover open={open} onClose={() => setOpen(false)} anchor={ref} side="top" align="start" padding="p-xs" className="w-[340px] max-w-[calc(100vw-2rem)]">
                <div className="flex flex-col">
                    <div className="px-sm py-xs text-footnote text-muted">Background tasks</div>
                    {r.bgTasks.map(t => (
                        <div key={t.task_id} className="flex items-center gap-sm px-sm py-xs rounded hover:bg-alpha-1">
                            <Spinner />
                            <span className="flex-1 min-w-0 flex flex-col">
                                <span className="text-body text-primary truncate">{t.description || t.task_type}</span>
                                <span className="text-footnote text-muted truncate">
                                    {t.task_type === "local_bash" ? "Shell" : t.task_type === "local_agent" ? "Agent" : t.task_type}
                                </span>
                            </span>
                            <Button variant="secondary" size="sm" disabled={!localId} onClick={() => localId && N().agents.stopTask(localId, t.task_id)}>
                                Stop
                            </Button>
                        </div>
                    ))}
                </div>
            </Popover>
        </>
    );
}

function WorkingRow({ r, visible, codex, localId }: { r: Runtime; visible: boolean; codex?: boolean; localId?: string }) {
    const [, tick] = useState(0);
    const working = r.busy;
    useEffect(() => {
        if (!working) return;
        const t = setInterval(() => tick(x => x + 1), 250);
        return () => clearInterval(t);
    }, [working]);
    if (!visible) return null;
    const now = Date.now();
    const idleTasks = !working && (r.bgTasks?.length ?? 0) > 0;
    const elapsed = r.turnStartedAt ? Math.floor((now - r.turnStartedAt) / 1000) : 0;
    const tokens = Math.max(r.outputTokens ?? 0, Math.round((r.streamChars ?? 0) / 4) + (r.thinkingTokens ?? 0));
    const hook = Object.values(r.hooks ?? {})[0];
    const bg = r.bgTasks?.length ?? 0;
    const retry = [...r.items].reverse().find(x => x.kind === "marker" && x.type === "retry" && x.at && now - x.at < 60_000) as any;
    let status: ReactNode = null;
    let shimmer = true;
    if (r.stopping) status = "Stopping…";
    else if (hook) status = `Running ${hook.event} hook${hook.name ? ` · ${hook.name}` : ""}…`;
    else if (r.phase === "compacting") status = "Compacting session…";
    else if (retry && r.phase === "requesting") status = `${retry.data?.error_status ?? "Error"} · Retrying (${retry.data?.attempt}/${retry.data?.max_retries})`;
    else if (r.phase === "thinking" && r.thinkingStartedAt && !r.thinkingEndedAt) {
        const s = Math.floor((now - r.thinkingStartedAt) / 1000);
        status = THINK_VERBS.find(([t]) => s >= t)![1];
    } else if (r.thinkingStartedAt && r.thinkingEndedAt && r.phase === "writing") {
        status = `Thought for ${Math.max(1, Math.round((r.thinkingEndedAt - r.thinkingStartedAt) / 1000))}s`;
        shimmer = false;
    } else if (r.permissions.length || r.requests?.length) {
        status = "Needs your input";
        shimmer = false;
    } else if (r.phase === "tool") status = "Running tools…";
    else if (r.phase === "writing") status = "Writing…";
    else status = r.status === "running" && !r.items.length ? "Starting session…" : codex ? "Waiting for Codex…" : "Waiting for Claude…";
    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-[16px] h-5">
                {working ? (
                    <Spark state="thinking" size={18} className="shrink-0" color={codex ? "var(--cds-text-secondary)" : undefined} />
                ) : (
                    <StaticSpark size={18} color={codex ? "var(--cds-text-muted)" : undefined} />
                )}
                <div
                    aria-hidden={!working && !idleTasks}
                    className={`relative flex min-w-0 items-center whitespace-nowrap text-footnote text-secondary tabular-nums transition-opacity ${working || idleTasks ? "opacity-100" : "opacity-0"}`}
                >
                    {idleTasks && <BgTasksChip r={r} localId={localId} />}
                    <span className="inline-flex items-center min-w-0 max-w-full">
                        {working && elapsed >= 2 && <span className="data-[gliding]:overflow-x-clip inline-flex items-center">{formatDuration(elapsed)}</span>}
                        {working && elapsed >= 2 && tokens > 0 && (
                            <span className="data-[gliding]:overflow-x-clip inline-flex items-center">
                                <span className="px-xs">·</span>
                                {fmtTokens(tokens)} tokens
                            </span>
                        )}
                        {working && bg > 0 && <BgTasksChip r={r} localId={localId} lead />}
                        {working && (
                            <span className="inline-flex min-w-0 items-center">
                                {elapsed >= 2 && (
                                    <span className="data-[gliding]:overflow-x-clip inline-flex">
                                        <span className="px-xs">·</span>
                                    </span>
                                )}
                                <span className="data-[gliding]:overflow-x-clip inline-flex min-w-0">
                                    <span
                                        title={typeof status === "string" ? status : undefined}
                                        className={`min-w-[3ch] truncate [[data-motion-pop-id]_&]:text-clip ${shimmer ? "epitaxy-thinking-shimmer" : ""}`}
                                    >
                                        {status}
                                    </span>
                                </span>
                            </span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}

export { fmtTokens, Spinner };
