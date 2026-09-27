// A session panel: titlebar, transcript, approval dock and composer.
import { N } from "../native";
import { useEffect, useRef, useState } from "react";
import { openPluginSettings } from "../settings";
import { useAgents, rt, rateLimitText, sendPrompt, loadHistory, warm, updateChat, removeChat, setView, newChat, restartSession, type AgentChat } from "../store";
import { Button } from "../cds/Button";
import { Icon } from "../cds/Icon";
import { Menu, MenuItem, MenuSeparator, MenuLabel, Switch } from "../cds/Menu";
import { Transcript } from "./Transcript";
import { Composer, QueueStack, ScrollToBottom } from "./Composer";
import { ApprovalDock } from "./Approvals";
import { COLUMN } from "./primitives";
import { channelLabel, Stores, openChannel } from "../discord";
import { TodoRail } from "./TodoRail";
import { BranchBar, ChangesPane } from "./Changes";
import { kv } from "../kv";

export const DOCK =
    "group/approval-dock w-full " +
    COLUMN +
    " relative min-h-0 flex flex-col gap-1.5 [&>*]:shrink-0 [&_.epitaxy-approval-card]:shrink supports-[flex-basis:content]:[&_.epitaxy-approval-card]:basis-[content] supports-[flex-basis:content]:[&_.epitaxy-approval-card]:h-[var(--approval-dock-floor,144px)] [contain:layout]";
const PILL =
    "relative isolate inline-flex items-center gap-0.75 h-[20px] px-1.25 rounded text-footnote select-none before:content-[''] before:absolute before:-z-[1] before:inset-0 before:rounded before:bg-alpha-2 text-secondary min-w-0 border-0 focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus hover:before:bg-alpha-3 aria-[expanded=true]:before:bg-alpha-3";
const TITLEBAR = "epitaxy-titlebar relative flex items-center h-[calc(2rem*var(--cds-rem-scale,1))] pl-0 pr-[var(--titlebar-end-inset,12px)]";

export function useSetting<T>(key: string, def: T): [T, (v: T) => void] {
    const [v, setV] = useState<T>(() => kv.get(key, def));
    useEffect(() => {
        const fn = (e: any) => e.detail?.key === key && setV(e.detail.value);
        window.addEventListener("evi-claude:setting", fn);
        return () => window.removeEventListener("evi-claude:setting", fn);
    }, [key]);
    return [
        v,
        (x: T) => {
            setV(x);
            kv.set(key, x);
            window.dispatchEvent(new CustomEvent("evi-claude:setting", { detail: { key, value: x } }));
        },
    ];
}

export function ChatPanel({ chat, compact, onClose }: { chat: AgentChat; compact?: boolean; onClose?: () => void }) {
    const [showThinking, setShowThinking] = useSetting("showThinking", false);
    const [width, setWidth] = useSetting<"s" | "m" | "l">("transcriptWidth", "s");
    const [textSize] = useSetting<"s" | "m" | "l">("chatTextSize", "m");
    const [changes, setChanges] = useState(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            const k = e.key.toLowerCase();
            const chord =
                e.altKey && k === "m"
                    ? "mode"
                    : e.altKey && k === "f"
                      ? "fast"
                      : e.shiftKey && k === "i"
                        ? "model"
                        : e.shiftKey && k === "e"
                          ? "effort"
                          : e.shiftKey && k === "d"
                            ? "changes"
                            : null;
            if (!chord) return;
            e.preventDefault();
            e.stopPropagation();
            if (chord === "changes") setChanges(c => !c);
            else window.dispatchEvent(new CustomEvent("evi-claude:chord", { detail: chord }));
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);
    useEffect(() => {
        loadHistory(chat);
        warm(chat);
        if (chat.unread) updateChat(chat.localId, { unread: 0 });
    }, [chat.localId]);
    return (
        <div
            className="relative isolate min-w-0 epitaxy-chat-panel h-full"
            data-chat-gutter-end="bleed"
            data-transcript-width={width === "s" ? undefined : width}
            data-chat-text-size={textSize === "m" ? undefined : textSize}
            style={{ width: "100%", ...(compact ? ({ "--chat-gutter": "16px" } as any) : {}) }}
        >
            <div className="flex h-full min-w-0">
                <div className="relative h-full min-w-0 flex flex-col flex-1">
                    <Titlebar
                        chat={chat}
                        compact={compact}
                        onClose={onClose}
                        showThinking={showThinking}
                        setShowThinking={setShowThinking}
                        width={width}
                        setWidth={setWidth}
                        changes={changes}
                        setChanges={setChanges}
                    />
                    <Transcript chat={chat} showThinking={showThinking} />
                    <div data-epitaxy-chat-column="" className={DOCK} style={{ paddingBottom: 12 }}>
                        <div className="contents">
                            <ScrollToBottom />
                        </div>
                        <BranchBar chat={chat} onOpenChanges={() => setChanges(true)} />
                        <TodoRail chat={chat} />
                        <AuthBanner chat={chat} />
                        <RateLimitBanner chat={chat} />
                        <CompactNudge chat={chat} />
                        <ApprovalDock chat={chat} />
                        <QueueStack chat={chat} />
                        <div className="contents">
                            <Composer key={chat.localId} chat={chat} autoFocus={!compact} />
                        </div>
                    </div>
                </div>
                {changes && <ChangesPane chat={chat} onClose={() => setChanges(false)} />}
            </div>
        </div>
    );
}

// Claude Code is signing in (auth_status): show its output / error above the composer
function AuthBanner({ chat }: { chat: AgentChat }) {
    const auth = useAgents(s => s.runtimes[chat.localId]?.auth);
    if (!auth || (!auth.isAuthenticating && !auth.error)) return null;
    const lines: string[] = (auth.output ?? []).filter(Boolean);
    const url = lines.join(" ").match(/https?:\/\/\S+/)?.[0];
    return (
        <div role="status" className="flex items-start gap-sm rounded-card bg-alpha-1 px-lg py-md">
            <Icon name={auth.error ? "Warning" : "Key"} size="sm" className={`shrink-0 mt-0.5 ${auth.error ? "text-danger" : "text-secondary"}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-xs">
                <span className="text-body-medium text-primary">{auth.error ? "Sign-in failed" : "Claude Code is signing in"}</span>
                <span className="text-footnote text-secondary whitespace-pre-wrap break-words select-text">
                    {auth.error ?? (lines.slice(-3).join("\n") || "Finish signing in in your browser.")}
                </span>
            </div>
            {url && (
                <Button variant="secondary" size="sm" onClick={() => window.open(url)}>
                    Open sign-in page
                </Button>
            )}
        </div>
    );
}

// at or near a usage limit: say so above the composer until it resets
function RateLimitBanner({ chat }: { chat: AgentChat }) {
    const info = useAgents(s => s.runtimes[chat.localId]?.rateLimit) as any;
    const [hidden, setHidden] = useState<string | null>(null);
    if (!info || (info.status !== "rejected" && info.status !== "allowed_warning")) return null;
    const resetMs = info.resetsAt ? info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1) : 0;
    if (resetMs && resetMs < Date.now()) return null;
    const key = `${info.status}:${info.resetsAt}`;
    if (hidden === key) return null;
    const rejected = info.status === "rejected";
    return (
        <div role="status" className="flex items-start gap-sm rounded-card bg-alpha-1 px-lg py-md">
            <Icon name="Warning" size="sm" className={`shrink-0 mt-0.5 ${rejected ? "text-danger" : "text-warning"}`} />
            <span className="flex-1 min-w-0 text-body text-primary">{rateLimitText(info)}</span>
            <Button iconOnly size="sm" icon="X" aria-label="Dismiss" onClick={() => setHidden(key)} />
        </div>
    );
}

// idle with a mostly-full context window: offer to compact now rather than mid-task later
function CompactNudge({ chat }: { chat: AgentChat }) {
    const r = useAgents(s => s.runtimes[chat.localId]);
    const [dismissed, setDismissed] = useState(false);
    const cu = r?.contextUsage;
    const pct = cu?.percentage ?? (cu?.maxTokens ? (cu.totalTokens / cu.maxTokens) * 100 : 0);
    if (dismissed || !r || r.busy || r.permissions.length || chat.provider === "codex" || pct < 70) return null;
    return (
        <div role="status" className="flex items-start gap-sm rounded-card bg-alpha-1 px-lg py-md">
            <Icon name="Archive" size="sm" className="shrink-0 mt-0.5 text-secondary" />
            <div className="flex min-w-0 flex-1 flex-col gap-xs">
                <span className="text-body-medium text-primary">Context is {Math.round(pct)}% full</span>
                <span className="text-footnote text-secondary">
                    Compacting now keeps a summary of the conversation and frees room, so it doesn’t happen in the middle of your next task.
                </span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => (setDismissed(true), sendPrompt(chat, "/compact"))}>
                Compact this session
            </Button>
            <Button iconOnly size="sm" icon="X" aria-label="Dismiss" onClick={() => setDismissed(true)} />
        </div>
    );
}

// the conversation as Markdown (prompts, answers, and one line per tool call)
function transcriptMarkdown(chat: AgentChat) {
    const out = [`# ${chat.title}`, ""];
    for (const it of rt(chat.localId).items as any[]) {
        if (it.parentId) continue;
        if (it.kind === "user") out.push(`**You:** ${it.text}`, "");
        else if (it.kind === "text") out.push(it.text, "");
        else if (it.kind === "tool") out.push(`- \`${it.name}\` ${it.input?.command ?? it.input?.file_path ?? it.input?.pattern ?? it.input?.description ?? ""}`.trimEnd());
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function Titlebar({ chat, compact, onClose, showThinking, setShowThinking, width, setWidth, changes, setChanges }: any) {
    const [textSize, setTextSize] = useSetting<"s" | "m" | "l">("chatTextSize", "m");
    const [verbose, setVerbose] = useSetting<boolean>("verbose", false);
    const [editing, setEditing] = useState(false);
    const [more, setMore] = useState(false);
    const [view, setViewMenu] = useState(false);
    const moreRef = useRef<HTMLButtonElement>(null);
    const viewRef = useRef<HTMLButtonElement>(null);
    const status = useAgents(s => s.runtimes[chat.localId]?.status);
    const attached = chat.attachedChannelId ? Stores.Channel()?.getChannel(chat.attachedChannelId) : null;
    const folder = chat.cwd.split("/").pop();
    return (
        <div data-top-left="true" data-top-right="true" data-perf-region="header" className={TITLEBAR}>
            <div className="draggable absolute inset-0 -z-[1]" aria-hidden="true" />
            <div className="group/lead relative z-[1] flex min-w-0 items-center draggable-none">
                <span
                    className="flex h-[calc(1.5rem*var(--cds-rem-scale,1))] w-[var(--chat-gutter-start,32px)] shrink-0 items-center justify-center"
                    style={compact ? { width: 16 } : undefined}
                >
                    {!compact && (
                        <Button
                            iconOnly
                            icon={status === "running" ? "Laptop" : "LaptopSlash"}
                            iconSize={18}
                            aria-label="Local"
                            title={status === "running" ? "Claude Code is running locally" : "Session idle"}
                            data-testid="epitaxy-origin-gutter"
                            onClick={() => setView({ activeId: null, open: true })}
                        />
                    )}
                </span>
                <span className="flex min-w-0 items-center gap-xs">
                    <div className="flex items-center min-w-[32px]">
                        <span className="flex items-center min-w-[32px]">
                            {editing ? (
                                <input
                                    autoFocus
                                    defaultValue={chat.title}
                                    aria-label="Session title"
                                    className="min-w-0 max-w-full rounded-[3px] border-0 bg-transparent p-0 outline outline-[1.5px] outline-fill-accent outline-offset-[1px] [field-sizing:content] text-body-medium text-primary mx-outset h-control px-xs"
                                    onBlur={e => (updateChat(chat.localId, { title: e.target.value.trim() || chat.title }), setEditing(false))}
                                    onKeyDown={e => (e.key === "Enter" || e.key === "Escape") && (e.target as HTMLInputElement).blur()}
                                />
                            ) : (
                                <button
                                    type="button"
                                    data-pane-title=""
                                    aria-label={`${chat.title}, rename session`}
                                    className="truncate text-body-medium text-primary select-none mx-outset h-control px-xs rounded text-left bg-transparent border-0 hover:bg-fill-ghost-hover focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus cursor-text"
                                    style={{ ["--cds-outset-x" as any]: "var(--cds-pad-xs)", maxWidth: compact ? 160 : 360 }}
                                    onClick={() => setEditing(true)}
                                >
                                    {chat.title}
                                </button>
                            )}
                        </span>
                        <Button
                            ref={moreRef}
                            iconOnly
                            icon="CaretDown"
                            className="text-secondary"
                            aria-label={`More options for ${chat.title}`}
                            aria-haspopup="menu"
                            aria-expanded={more}
                            onClick={() => setMore(!more)}
                        />
                        <Menu open={more} onClose={() => setMore(false)} anchor={moreRef} side="bottom" align="start">
                            <MenuItem icon="Edit" label="Rename" onSelect={() => setEditing(true)} />
                            <MenuItem
                                icon={chat.pinned ? "PinSlash" : "Pin"}
                                label={chat.pinned ? "Unpin from Direct Messages" : "Pin to Direct Messages"}
                                onSelect={() => updateChat(chat.localId, { pinned: !chat.pinned })}
                            />
                            {attached ? (
                                <MenuItem
                                    icon="LinkSimple"
                                    label={`Detach from ${channelLabel(attached)}`}
                                    onSelect={() => updateChat(chat.localId, { attachedChannelId: null })}
                                />
                            ) : (
                                <MenuItem
                                    icon="LinkSimple"
                                    label="Attach to current Discord chat"
                                    disabled={!Stores.SelectedChannel()?.getLastSelectedChannelId?.()}
                                    onSelect={() => updateChat(chat.localId, { attachedChannelId: Stores.SelectedChannel()?.getLastSelectedChannelId?.() })}
                                />
                            )}
                            {Object.keys(chat.chapters ?? {}).length > 0 && (
                                <>
                                    <MenuSeparator />
                                    <MenuLabel>Chapters</MenuLabel>
                                    {Object.entries(chat.chapters ?? {}).map(([id, title]) => (
                                        <MenuItem
                                            key={id}
                                            icon="Bookmark"
                                            label={title as string}
                                            onSelect={() => {
                                                const root = moreRef.current?.getRootNode() as ShadowRoot;
                                                root?.getElementById?.(`chapter-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                                            }}
                                        />
                                    ))}
                                </>
                            )}
                            <MenuSeparator />
                            <MenuItem icon="FolderOpen" label="Reveal folder" onSelect={() => N().agents.revealPath(chat.cwd)} />
                            <MenuItem icon="Copy" label="Copy session ID" disabled={!chat.sessionId} onSelect={() => navigator.clipboard.writeText(chat.sessionId ?? "")} />
                            <MenuItem icon="ChatAdd" label="New session in this folder" onSelect={() => newChat({ cwd: chat.cwd })} />
                            {chat.provider !== "codex" && (
                                <MenuItem
                                    icon="ArrowSplitRight"
                                    label="Fork session"
                                    description="Continue in a new session; this one stays as it is"
                                    disabled={!chat.sessionId}
                                    onSelect={() =>
                                        newChat({
                                            cwd: chat.cwd,
                                            title: chat.title + " (fork)",
                                            provider: chat.provider,
                                            sessionId: chat.sessionId,
                                            model: chat.model,
                                            effort: chat.effort,
                                            fast: chat.fast,
                                            permissionMode: chat.permissionMode,
                                        }).then(f => f && updateChat(f.localId, { forkSession: true }))
                                    }
                                />
                            )}
                            {chat.provider !== "codex" && (
                                <MenuItem
                                    icon="CommandLine"
                                    label="Open in Terminal"
                                    description="claude --resume in Terminal.app"
                                    onSelect={() => N().agents.openTerminal(chat.cwd, chat.sessionId)}
                                />
                            )}
                            <MenuItem icon="Copy" label="Copy transcript as Markdown" onSelect={() => navigator.clipboard.writeText(transcriptMarkdown(chat))} />
                            <MenuItem
                                icon="Archive"
                                label={chat.archived ? "Unarchive" : "Archive"}
                                onSelect={() => (
                                    updateChat(chat.localId, { archived: !chat.archived, pinned: chat.archived ? chat.pinned : false }),
                                    !chat.archived && setView({ activeId: null })
                                )}
                            />
                            <MenuItem icon="ArrowClockwise" label="Restart Claude Code" onSelect={() => restartSession(chat)} />
                            <MenuSeparator />
                            <MenuItem
                                icon="Trash"
                                label="Delete"
                                danger
                                onSelect={() => confirm("Delete this session? Its Claude Code transcript stays on disk.") && removeChat(chat.localId)}
                            />
                        </Menu>
                    </div>
                    <span className="flex items-center gap-0.75 min-w-0">
                        <span className="relative inline-flex items-center min-w-0">
                            <button type="button" className={PILL} title={chat.cwd} onClick={() => N().agents.revealPath(chat.cwd)}>
                                <span className="truncate max-w-[160px]" data-testid="epitaxy-origin-environment">
                                    {chat.provider === "codex" ? "Codex" : "Local"}
                                </span>
                                <span aria-hidden="true" className="size-[2px] shrink-0 rounded-full bg-current opacity-50" />
                                <span className="truncate" data-testid="epitaxy-origin-label">
                                    {folder}
                                </span>
                            </button>
                        </span>
                        {attached && (
                            <span className="relative inline-flex items-center min-w-0">
                                <button
                                    type="button"
                                    className={PILL}
                                    title="Open the attached Discord conversation"
                                    onClick={() => (setView({ open: false }), openChannel(attached.id))}
                                >
                                    <Icon name="Chat" size={12} />
                                    <span className="truncate max-w-[140px]">{channelLabel(attached)}</span>
                                </button>
                            </span>
                        )}
                    </span>
                </span>
            </div>
            <div className="relative z-[1] ml-auto flex shrink-0 items-center gap-1 pl-[24px] draggable-none [--cds-h-control:26px] [--cds-text-primary:var(--cds-text-secondary)]">
                {attached && (
                    <Button
                        iconOnly
                        icon={chat.watching ? "Eye" : "EyeSlash"}
                        iconSize={18}
                        pressed={!!chat.watching}
                        aria-label={chat.watching ? `Stop watching ${channelLabel(attached)}` : `Watch ${channelLabel(attached)}`}
                        title={chat.watching ? "Watching: new messages here wake Claude" : "Watch this conversation: new messages wake Claude (it drafts, never sends)"}
                        onClick={() => updateChat(chat.localId, { watching: !chat.watching })}
                    />
                )}
                <div className="flex items-center gap-1 empty:hidden">
                    <Button
                        iconOnly
                        icon="ChangesPlusMinus"
                        iconSize={18}
                        pressed={changes}
                        aria-label="Changes"
                        title="Changes"
                        aria-keyshortcuts="Control+Shift+d"
                        onClick={() => setChanges(!changes)}
                    />
                </div>
                {!compact && (
                    <Button
                        iconOnly
                        icon={chat.pinned ? "PinFilled" : "Pin"}
                        iconSize={18}
                        pressed={!!chat.pinned}
                        aria-label={chat.pinned ? "Unpin" : "Pin to Direct Messages"}
                        title={chat.pinned ? "Unpin from Direct Messages" : "Pin to Direct Messages"}
                        onClick={() => updateChat(chat.localId, { pinned: !chat.pinned })}
                    />
                )}
                <Button
                    ref={viewRef}
                    iconOnly
                    icon="DotsVertical"
                    iconSize={18}
                    aria-label="View options"
                    aria-haspopup="menu"
                    aria-expanded={view}
                    onClick={() => setViewMenu(!view)}
                />
                <Menu open={view} onClose={() => setViewMenu(false)} anchor={viewRef} side="bottom" align="end">
                    <MenuLabel>View</MenuLabel>
                    <MenuItem
                        icon="ExtendedThinking"
                        label="Show thinking"
                        keepOpen
                        checkedRole="checkbox"
                        checked={showThinking}
                        trailing={
                            <span inert>
                                <Switch size="sm" checked={showThinking} />
                            </span>
                        }
                        onSelect={() => setShowThinking(!showThinking)}
                    />
                    <MenuItem
                        icon="Settings"
                        label="Claude settings"
                        description="Evi settings → Plugins → Claude"
                        onSelect={() => (setView({ open: false }), setTimeout(openPluginSettings, 50))}
                    />
                    <MenuSeparator />
                    <MenuItem
                        label="Verbose"
                        description="Tool calls start expanded"
                        keepOpen
                        checkedRole="checkbox"
                        checked={verbose}
                        trailing={
                            <span inert>
                                <Switch size="sm" checked={verbose} />
                            </span>
                        }
                        onSelect={() => setVerbose(!verbose)}
                    />
                    <MenuSeparator />
                    <MenuLabel>Transcript width</MenuLabel>
                    {(["s", "m", "l"] as const).map(w => (
                        <MenuItem
                            key={w}
                            label={w === "s" ? "Narrow" : w === "m" ? "Medium" : "Wide"}
                            checkedRole="radio"
                            checked={width === w}
                            keepOpen
                            onSelect={() => setWidth(w)}
                        />
                    ))}
                    <MenuSeparator />
                    <MenuLabel>Text size</MenuLabel>
                    {(["s", "m", "l"] as const).map(z => (
                        <MenuItem
                            key={z}
                            label={z === "s" ? "Small" : z === "m" ? "Default" : "Large"}
                            checkedRole="radio"
                            checked={textSize === z}
                            keepOpen
                            onSelect={() => setTextSize(z)}
                        />
                    ))}
                </Menu>
                {onClose && <Button iconOnly icon="X" iconSize={18} aria-label="Close" title="Close panel" onClick={onClose} />}
            </div>
        </div>
    );
}
