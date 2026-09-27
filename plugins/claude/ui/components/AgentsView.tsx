// Coding Agents page: the new-session page (with your Discord inbox and past sessions), or an open session.
import { N } from "../native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAgents, rt, newChat, sendPrompt, setView, removeChat, updateChat, type AgentChat } from "../store";
import { ChatPanel, DOCK } from "../epitaxy/ChatPanel";
import { DraftChin } from "../epitaxy/Composer";
import { COLUMN } from "../epitaxy/primitives";
import { StaticSpark, Spark } from "../cds/Spark";
import { Icon } from "../cds/Icon";
import { Button } from "../cds/Button";
import { Menu, MenuItem, MenuSeparator, MenuLabel } from "../cds/Menu";
import { TextArea } from "../cds/Controls";
import { Stores, discordTools, channelLabel, openChannel } from "../discord";
import { kv } from "../kv";

export function relTime(ms: number) {
    const d = (Date.now() - ms) / 1000;
    if (d < 60) return "just now";
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
}

export function AgentsView() {
    const activeId = useAgents(s => s.activeId);
    const chat = useAgents(s => s.chats.find(c => c.localId === s.activeId));
    return (
        <div className="flex h-full min-h-0 w-full" style={{ background: "var(--cds-surface-1)" }}>
            <div className="flex-1 min-w-0 min-h-0">{activeId && chat ? <ChatPanel key={chat.localId} chat={chat} /> : <Home />}</div>
        </div>
    );
}

// ---------------------------------------------------------------- the sessions list (shown in the DM sidebar)
const ROW =
    "w-full shrink-0 border-none text-left text-body flex items-center gap-xs h-[30px] px-md rounded text-secondary hover:bg-fill-ghost-hover hover:text-primary focus-visible:outline-hidden focus-visible:shadow-focus cursor-pointer";
// Lives in Discord's DM sidebar (it slides in over the DM list while the agents page is open)
export function SessionList() {
    const chats = useAgents(s => s.chats);
    const activeId = useAgents(s => s.activeId);
    const runtimes = useAgents(s => s.runtimes);
    const [q, setQ] = useState("");
    const [groupBy, setGroupBy] = useState<"date" | "folder" | "status" | "none">(() => kv.get("rail.groupBy", "date"));
    const [sortBy, setSortBy] = useState<"activity" | "created">(() => kv.get("rail.sortBy", "activity"));
    const [showArchived, setShowArchived] = useState<boolean>(() => kv.get("rail.showArchived", false));
    const [filterMenu, setFilterMenu] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const filterRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    // ⌘K: search sessions · ⇧⌘O: new session (while the agents page is open)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!useAgents.getState().open || !(e.metaKey || e.ctrlKey)) return;
            if (e.key.toLowerCase() === "k" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => searchRef.current?.focus(), 0);
            } else if (e.key.toLowerCase() === "o" && e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setView({ activeId: null, open: true });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);
    const groups = useMemo(() => {
        const f = q.trim().toLowerCase();
        const match = (c: AgentChat) => !f || c.title.toLowerCase().includes(f) || c.cwd.toLowerCase().includes(f);
        const when = (c: AgentChat) => (sortBy === "created" ? (c.createdAt ?? c.updatedAt) : c.updatedAt);
        const visible = chats.filter(c => match(c) && (!c.archived || f));
        const pinned = visible.filter(c => c.pinned && !c.archived);
        const rest = [...visible.filter(c => !c.pinned && !c.archived)].sort((a, b) => when(b) - when(a));
        const archived = showArchived || f ? chats.filter(c => c.archived && match(c)).sort((a, b) => when(b) - when(a)) : [];
        const day = 86400_000;
        const start = new Date().setHours(0, 0, 0, 0);
        let out: [string, AgentChat[]][];
        if (groupBy === "folder") {
            const by = new Map<string, AgentChat[]>();
            for (const c of rest) by.set(c.cwd.split("/").pop() || c.cwd, [...(by.get(c.cwd.split("/").pop() || c.cwd) ?? []), c]);
            out = [...by.entries()];
        } else if (groupBy === "status") {
            const rt_ = useAgents.getState().runtimes;
            out = [
                ["Needs input", rest.filter(c => rt_[c.localId]?.permissions.length || rt_[c.localId]?.requests?.length)],
                ["Working", rest.filter(c => rt_[c.localId]?.busy && !rt_[c.localId]?.permissions.length)],
                ["Unread", rest.filter(c => c.unread && !rt_[c.localId]?.busy)],
                ["Idle", rest.filter(c => !c.unread && !rt_[c.localId]?.busy && !rt_[c.localId]?.permissions.length)],
            ];
        } else if (groupBy === "none") out = [["Recents", rest]];
        else
            out = [
                ["Today", rest.filter(c => when(c) >= start)],
                ["Yesterday", rest.filter(c => when(c) < start && when(c) >= start - day)],
                ["Previous 7 days", rest.filter(c => when(c) < start - day && when(c) >= start - 7 * day)],
                ["Older", rest.filter(c => when(c) < start - 7 * day)],
            ];
        return ([["Pinned", pinned], ...out, ["Archived", archived]] as [string, AgentChat[]][]).filter(([, l]) => l.length);
    }, [chats, q, groupBy, sortBy, showArchived]);
    const setK =
        <T,>(k: string, set: (v: T) => void) =>
        (v: T) => (kv.set(k, v), set(v));
    return (
        <aside className="relative flex flex-col h-full w-full min-h-0" style={{ background: "transparent" }} aria-label="Coding Agents sessions">
            <div className="flex items-center h-11 shrink-0 px-2 gap-1">
                <Button iconOnly icon="ArrowLeft" aria-label="Back to Direct Messages" title="Back to Direct Messages" onClick={() => setView({ open: false })} />
                <span className="text-body-medium text-primary flex-1 truncate px-xs">Coding Agents</span>
                <Button iconOnly icon="ChatAdd" aria-label="New session" title="New session (⇧⌘O)" onClick={() => setView({ activeId: null, open: true })} />
                <Button
                    ref={filterRef}
                    iconOnly
                    icon="Filter"
                    aria-label="Filter and group recents"
                    title="Filter and group recents"
                    aria-expanded={filterMenu}
                    onClick={() => setFilterMenu(!filterMenu)}
                />
                <Menu open={filterMenu} onClose={() => setFilterMenu(false)} anchor={filterRef} side="bottom" align="end">
                    <MenuLabel>Group by</MenuLabel>
                    {(
                        [
                            ["date", "Date"],
                            ["folder", "Folder"],
                            ["status", "Status"],
                            ["none", "None"],
                        ] as const
                    ).map(([v, l]) => (
                        <MenuItem key={v} label={l} checkedRole="radio" checked={groupBy === v} keepOpen onSelect={() => setK("rail.groupBy", setGroupBy)(v)} />
                    ))}
                    <MenuSeparator />
                    <MenuLabel>Sort by</MenuLabel>
                    <MenuItem label="Last activity" checkedRole="radio" checked={sortBy === "activity"} keepOpen onSelect={() => setK("rail.sortBy", setSortBy)("activity")} />
                    <MenuItem label="Date created" checkedRole="radio" checked={sortBy === "created"} keepOpen onSelect={() => setK("rail.sortBy", setSortBy)("created")} />
                    <MenuSeparator />
                    <MenuItem
                        label="Show archived"
                        checkedRole="checkbox"
                        checked={showArchived}
                        keepOpen
                        onSelect={() => setK("rail.showArchived", setShowArchived)(!showArchived)}
                    />
                    <MenuItem
                        label="Reset"
                        onSelect={() => {
                            setK("rail.groupBy", setGroupBy)("date");
                            setK("rail.sortBy", setSortBy)("activity");
                            setK("rail.showArchived", setShowArchived)(false);
                        }}
                    />
                </Menu>
            </div>
            <div className="px-2 pb-2 flex flex-col gap-0.5">
                <label className="flex items-center gap-xs h-[30px] px-md rounded bg-alpha-1 text-muted focus-within:shadow-focus">
                    <Icon name="Search" size="sm" />
                    <input
                        className="cds-reset min-w-0 flex-1 bg-transparent border-0 outline-none text-body text-primary placeholder:text-muted"
                        ref={searchRef}
                        placeholder="Search sessions"
                        aria-label="Search sessions (⌘K)"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        onKeyDown={e => e.key === "Escape" && setQ("")}
                    />
                </label>
                <button
                    className={ROW}
                    title="New session (⇧⌘O)"
                    onClick={() => setView({ activeId: null, open: true })}
                    data-selected={!activeId || undefined}
                    style={!activeId ? { background: "var(--cds-fill-ghost-hover)", color: "var(--cds-text-primary)" } : undefined}
                >
                    <Icon name="AddCircle" size="sm" />
                    <span>New session</span>
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-fade-y px-2 pb-3">
                {groups.map(([label, list]) => {
                    const cap = expanded.has(label) || q.trim() ? list.length : 10;
                    return (
                        <div key={label} className="flex flex-col gap-0.5 pt-2">
                            <div className="px-md py-1 text-footnote text-muted">{label}</div>
                            {list.slice(0, cap).map(c => (
                                <RailRow
                                    key={c.localId}
                                    chat={c}
                                    active={c.localId === activeId}
                                    busy={!!runtimes[c.localId]?.busy}
                                    pending={runtimes[c.localId]?.permissions.length ?? 0}
                                />
                            ))}
                            {list.length > cap && (
                                <button type="button" className={ROW + " text-muted"} onClick={() => setExpanded(x => new Set(x).add(label))}>
                                    <span className="flex size-[16px] shrink-0" />
                                    Show {list.length - cap} more
                                </button>
                            )}
                        </div>
                    );
                })}
                {!chats.length && <div className="px-md py-2 text-footnote text-muted">No sessions yet</div>}
                {chats.length > 0 && !groups.length && (
                    <div className="px-md py-2 text-footnote text-muted">{q.trim() ? `No sessions match “${q.trim()}”` : "Nothing here — archived sessions are hidden"}</div>
                )}
            </div>
        </aside>
    );
}
function RailRow({ chat, active, busy, pending }: { chat: AgentChat; active: boolean; busy: boolean; pending: number }) {
    const [menu, setMenu] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    if (renaming)
        return (
            <input
                autoFocus
                aria-label="Session name"
                defaultValue={chat.title}
                className="cds-reset w-full h-[30px] px-md rounded bg-alpha-1 border-0 outline-none text-body text-primary shadow-focus"
                onFocus={e => e.currentTarget.select()}
                onBlur={e => (
                    e.currentTarget.value.trim() && updateChat(chat.localId, { title: e.currentTarget.value.trim(), autoTitle: false, titled: true }),
                    setRenaming(false)
                )}
                onKeyDown={e => (e.key === "Enter" ? e.currentTarget.blur() : e.key === "Escape" && setRenaming(false))}
            />
        );
    return (
        <div className="group relative" draggable onDragStart={e => e.dataTransfer.setData("evi-claude/agent", chat.localId)}>
            {/* a Discord DM-style row: round icon, name, and a status line under it */}
            <button
                className="w-full shrink-0 border-none text-left flex items-center gap-[10px] h-[42px] px-[8px] rounded-[8px] text-secondary hover:bg-fill-ghost-hover hover:text-primary focus-visible:outline-hidden focus-visible:shadow-focus cursor-pointer transition-colors duration-100"
                onClick={() => setView({ activeId: chat.localId, open: true })}
                onContextMenu={e => (e.preventDefault(), setMenu(true))}
                style={active ? { background: "var(--dl-active, var(--cds-fill-ghost-selected))", color: "var(--cds-text-primary)" } : undefined}
                title={chat.cwd}
            >
                <span
                    className="relative flex size-[32px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: chat.provider === "codex" ? "var(--dl-chip, #26262a)" : "color-mix(in oklab, var(--cds-clay) 18%, transparent)" }}
                >
                    {busy ? (
                        <Spark state="thinking" size={18} color={chat.provider === "codex" ? "var(--cds-text-secondary)" : undefined} />
                    ) : chat.provider === "codex" ? (
                        <Icon name="CommandLine" size="sm" className="text-secondary" />
                    ) : (
                        <StaticSpark size={16} />
                    )}
                    {(pending > 0 || !!chat.unread) && !busy && (
                        <span
                            className="absolute rounded-full"
                            style={{
                                right: -1,
                                bottom: -1,
                                width: 11,
                                height: 11,
                                background: pending ? "var(--status-warning, #f0b232)" : "var(--cds-clay)",
                                boxShadow: "0 0 0 2.5px var(--background-base-lower, #131315)",
                            }}
                        />
                    )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className={`truncate text-body ${chat.unread || active ? "text-primary" : ""}`} style={chat.unread ? { fontWeight: 500 } : undefined}>
                        {chat.title}
                    </span>
                    <span className={`truncate text-footnote ${pending ? "text-warning" : "text-muted"}`}>
                        {pending ? "Needs your input" : busy ? "Working…" : `${chat.cwd.split("/").pop()} · ${relTime(chat.updatedAt)}`}
                    </span>
                </span>
                {chat.pinned && <Icon name="Pin" size="xs" className="shrink-0 text-muted" />}
            </button>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
                <Button ref={ref} iconOnly size="xs" icon="DotsHorizontal" aria-label={`More options for ${chat.title}`} onClick={() => setMenu(!menu)} />
            </span>
            <Menu open={menu} onClose={() => (setMenu(false), setConfirmDelete(false))} anchor={ref} side="bottom" align="start">
                <MenuItem icon="Edit" label="Rename" onSelect={() => setRenaming(true)} />
                <MenuItem
                    icon={chat.pinned ? "PinSlash" : "Pin"}
                    label={chat.pinned ? "Unpin" : "Pin to Direct Messages"}
                    onSelect={() => updateChat(chat.localId, { pinned: !chat.pinned })}
                />
                {!active && (
                    <MenuItem
                        icon={chat.unread ? "Check" : "Notification"}
                        label={chat.unread ? "Mark as read" : "Mark as unread"}
                        onSelect={() => updateChat(chat.localId, { unread: chat.unread ? 0 : 1 })}
                    />
                )}
                <MenuItem icon="FolderOpen" label="Reveal folder" onSelect={() => N().agents.revealPath(chat.cwd)} />
                {chat.sessionId && chat.provider !== "codex" && (
                    <MenuItem
                        icon="CommandLine"
                        label="Copy resume command"
                        description="Continue it in your terminal"
                        onSelect={() => navigator.clipboard.writeText(`cd ${JSON.stringify(chat.cwd)} && claude --resume ${chat.sessionId}`)}
                    />
                )}
                <MenuSeparator />
                <MenuItem
                    icon="Archive"
                    label={chat.archived ? "Unarchive" : "Archive"}
                    onSelect={() => updateChat(chat.localId, { archived: !chat.archived, pinned: chat.archived ? chat.pinned : false })}
                />
                <MenuItem
                    icon="Trash"
                    label={confirmDelete ? "Click again to delete" : "Delete"}
                    danger
                    keepOpen={!confirmDelete}
                    onSelect={() => (confirmDelete ? removeChat(chat.localId) : setConfirmDelete(true))}
                />
            </Menu>
        </div>
    );
}

// ---------------------------------------------------------------- new session page
const ENV_PILL =
    "relative inline-flex items-center gap-xs h-[var(--pill-h,24px)] px-sm rounded bg-fill-secondary text-secondary text-body shadow-field hover:bg-fill-secondary-hover disabled:bg-fill-disabled disabled:text-disabled aria-[expanded=true]:bg-fill-secondary-hover aria-[expanded=true]:text-primary aria-[expanded=true]:hover:bg-fill-secondary-hover aria-[expanded=true]:hover:text-primary select-none border-0 focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus";

function Home() {
    const chats = useAgents(s => s.chats);
    const [sessions, setSessions] = useState<any[] | null>(null);
    const [cwd, setCwd] = useState<string | null>(() => kv.get<string | null>("lastCwd", null));
    const [folderMenu, setFolderMenu] = useState(false);
    const [provider, setProvider] = useState<"claude" | "codex">(() => kv.get("lastProvider", "claude"));
    const [providerMenu, setProviderMenu] = useState(false);
    const providerRef = useRef<HTMLButtonElement>(null);
    // the prompt and its mode/model/effort survive leaving the page
    const [text, setTextRaw] = useState<string>(() => kv.get("homeDraft", "") ?? "");
    const setText = (t: string) => (setTextRaw(t), kv.set("homeDraft", t || null));
    const [draft, setDraft] = useState<Partial<AgentChat>>(() => kv.get("homeDraftOpts", {}) ?? {});
    const folderRef = useRef<HTMLButtonElement>(null);
    const name = useMemo(() => {
        const u = Stores.User()?.getCurrentUser?.();
        const n = u?.globalName || u?.username || "";
        return n.split(/\s+/)[0];
    }, []);
    useEffect(() => {
        N()
            .agents.listSessions({ limit: 60 })
            .then(setSessions, () => setSessions([]));
    }, []);
    const known = new Set(chats.map(c => c.sessionId));
    const folders = useMemo(() => {
        const s = new Map<string, number>();
        for (const c of chats) s.set(c.cwd, Math.max(s.get(c.cwd) ?? 0, c.updatedAt));
        for (const x of sessions ?? []) if (x.cwd) s.set(x.cwd, Math.max(s.get(x.cwd) ?? 0, x.lastModified ?? 0));
        return [...s.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([p]) => p)
            .slice(0, 8);
    }, [chats, sessions]);
    const chooseFolder = (p: string) => {
        setCwd(p);
        kv.set("lastCwd", p);
    };
    const start = async () => {
        kv.set("homeDraft", null);
        let dir = cwd;
        if (!dir) {
            dir = await N().agents.pickFolder();
            if (!dir) return;
            chooseFolder(dir);
        }
        const chat = await newChat({ cwd: dir, provider, ...draft, title: text.trim() ? text.trim().replace(/\s+/g, " ").slice(0, 60) : undefined, autoTitle: !!text.trim() });
        if (chat && text.trim()) sendPrompt({ ...chat, title: "" }, text.trim());
        setText("");
    };
    const recent = (sessions ?? []).filter(s => !known.has(s.sessionId)).slice(0, 12);
    const landingClear = !chats.length && !recent.length;
    return (
        <div className="relative isolate min-w-0 epitaxy-chat-panel h-full" data-chat-gutter-end="bleed" style={{ width: "100%" }}>
            <div className="relative h-full min-w-0 flex flex-col">
                <div className="epitaxy-titlebar relative flex items-center h-[calc(2rem*var(--cds-rem-scale,1))] pl-0 pr-[var(--titlebar-end-inset,12px)]" />
                <div className="relative">
                    <header className={`w-full ${COLUMN} flex flex-row items-center gap-1.5 pt-[12px] pb-[24px]`} style={{ paddingTop: "10vh" }}>
                        <StaticSpark size={22} className="translate-y-px" />
                        <h1 className="text-title text-primary">{landingClear ? `What’s up next${name ? `, ${name}` : ""}?` : `Welcome back${name ? `, ${name}` : ""}`}</h1>
                    </header>
                </div>
                <div data-epitaxy-chat-column="" className={DOCK} data-band-enter="">
                    <div className="flex flex-wrap gap-xs pb-xs pr-[96px]">
                        <button
                            ref={providerRef}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={providerMenu}
                            data-testid="epitaxy-env-pill"
                            className={ENV_PILL}
                            onClick={() => setProviderMenu(!providerMenu)}
                            title="Which coding agent runs this session"
                        >
                            <Icon name={provider === "codex" ? "CommandLine" : "Laptop"} size="sm" />
                            <span className="truncate max-w-[200px]">{provider === "codex" ? "Codex" : "Claude Code"}</span>
                            <Icon name="CaretDown" size="xs" className="text-muted" />
                        </button>
                        <Menu open={providerMenu} onClose={() => setProviderMenu(false)} anchor={providerRef} side="bottom" align="start">
                            <MenuLabel>Agent</MenuLabel>
                            <MenuItem
                                icon="Laptop"
                                label="Claude Code"
                                description="Your claude CLI, on your Claude subscription"
                                checkedRole="radio"
                                checked={provider === "claude"}
                                onSelect={() => (setProvider("claude"), kv.set("lastProvider", "claude"))}
                            />
                            <MenuItem
                                icon="CommandLine"
                                label="Codex"
                                description="Your codex CLI (codex app-server), on your ChatGPT plan"
                                checkedRole="radio"
                                checked={provider === "codex"}
                                onSelect={() => (setProvider("codex"), kv.set("lastProvider", "codex"))}
                            />
                        </Menu>
                        <button
                            ref={folderRef}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={folderMenu}
                            aria-label="Choose folder"
                            className={ENV_PILL}
                            onClick={() => setFolderMenu(!folderMenu)}
                            title={cwd ?? undefined}
                        >
                            <Icon name={cwd ? "Folder" : "Add"} size="sm" />
                            <span className="truncate max-w-[200px]">{cwd ? cwd.split("/").pop() : "Select folder…"}</span>
                        </button>
                        <Menu open={folderMenu} onClose={() => setFolderMenu(false)} anchor={folderRef} side="bottom" align="start">
                            <MenuLabel>Recent folders</MenuLabel>
                            {folders.map(f => (
                                <MenuItem
                                    key={f}
                                    icon="Folder"
                                    label={f.split("/").pop()}
                                    description={f.replace(/^\/Users\/[^/]+/, "~")}
                                    checkedRole="radio"
                                    checked={f === cwd}
                                    onSelect={() => chooseFolder(f)}
                                />
                            ))}
                            {folders.length > 0 && <MenuSeparator />}
                            <MenuItem
                                icon="FolderPlus"
                                label="Open folder…"
                                onSelect={async () => {
                                    const p = await N().agents.pickFolder();
                                    if (p) chooseFolder(p);
                                }}
                            />
                        </Menu>
                    </div>
                    <NewSessionComposer
                        text={text}
                        setText={setText}
                        onSubmit={start}
                        chin={
                            <DraftChin
                                draft={{ localId: "__draft__", cwd: cwd ?? "", title: "", createdAt: 0, updatedAt: 0, provider, ...draft } as AgentChat}
                                onChange={p => setDraft(d => (kv.set("homeDraftOpts", { ...d, ...p }), { ...d, ...p }))}
                            />
                        }
                    />
                </div>
                <div className={`epitaxy-chat-panel-body flex-1 min-h-0 relative w-full ${COLUMN}`} style={{ paddingTop: 24 }}>
                    <div className="h-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges]">
                        <DiscordInbox cwd={cwd} />
                        {recent.length > 0 && (
                            <section className="flex flex-col gap-0.5 pb-6">
                                <div className="px-xs py-1 text-footnote text-muted">Resume a Claude Code session</div>
                                {recent.map(s => (
                                    <button
                                        key={s.sessionId}
                                        className="flex items-center gap-sm w-full rounded px-xs py-1.5 text-left hover:bg-fill-ghost-hover focus-visible:outline-hidden focus-visible:shadow-focus"
                                        onClick={() =>
                                            newChat({ cwd: s.cwd, sessionId: s.sessionId, title: s.customTitle || s.summary || s.firstPrompt || s.cwd?.split("/").pop() })
                                        }
                                    >
                                        <Icon name="History" size="sm" className="text-muted shrink-0" />
                                        <span className="flex-1 min-w-0 truncate text-body text-primary">{s.customTitle || s.summary || s.firstPrompt || "Untitled session"}</span>
                                        <span className="shrink-0 truncate text-footnote text-muted max-w-[40%]">
                                            {s.cwd?.split("/").pop()} · {s.lastModified ? relTime(s.lastModified) : ""}
                                        </span>
                                    </button>
                                ))}
                            </section>
                        )}
                        {sessions === null && <div className="px-xs text-footnote text-muted">Loading sessions…</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Unread DMs and mentions, with one-click triage by Claude (drafts only; nothing is sent)
function DiscordInbox({ cwd }: { cwd: string | null }) {
    const [unread, setUnread] = useState<any[] | null>(null);
    const [all, setAll] = useState(false);
    useEffect(() => {
        const load = () => {
            try {
                const all = discordTools.getUnread({ limit: 60 }) as any[];
                const dms = all.filter(c => c.type === "dm" || c.type === "group_dm");
                const servers = all.filter(c => c.guild && c.mentions && c.type !== "announcement").slice(0, 4);
                setUnread([...dms, ...servers]);
            } catch {
                setUnread([]);
            }
        };
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, []);
    if (!unread?.length) return null;
    const triage = async () => {
        const dir = cwd ?? N()?.env?.home;
        const chat = await newChat({ cwd: dir, title: "Discord inbox", autoTitle: false });
        if (!chat) return;
        sendPrompt(
            { ...chat, title: "" },
            "Go through my unread Discord DMs and mentions (use get_unread and get_mentions, then read_messages for context). " +
                "For each conversation give me a one-line summary of what they want. Where a reply is needed, prepare one with draft_reply in my voice — short and natural. " +
                "Don't send anything and don't mark anything read.",
        );
    };
    return (
        <section className="flex flex-col gap-0.5 pb-6">
            <div className="flex items-center gap-xs px-xs py-1">
                <span className="text-footnote text-muted flex-1">From Discord</span>
                <Button variant="secondary" size="sm" icon="Lightbulb" onClick={triage}>
                    Triage with Claude
                </Button>
            </div>
            {(all ? unread : unread.slice(0, 5)).map(c => (
                <button
                    key={c.id}
                    className="flex items-center gap-sm w-full rounded px-xs py-1.5 text-left hover:bg-fill-ghost-hover focus-visible:outline-hidden focus-visible:shadow-focus"
                    onClick={() => (setView({ open: false }), openChannel(c.id))}
                >
                    <Icon name={c.type === "dm" ? "User" : c.type === "group_dm" ? "Users" : "Chat"} size="sm" className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-body text-primary">{c.guild ? `${c.guild.name} · #${c.name}` : c.name}</span>
                    {c.mentions ? (
                        <span className="shrink-0 rounded-full px-1.5 text-caption tabular-nums" style={{ background: "var(--cds-fill-danger, #d9534f)", color: "#fff" }}>
                            {c.mentions}
                        </span>
                    ) : (
                        <span className="shrink-0 size-[6px] rounded-full" style={{ background: "var(--cds-text-secondary)" }} />
                    )}
                </button>
            ))}
            {unread.length > 5 && (
                <button className="self-start px-xs py-1 text-footnote text-muted hover:text-primary" onClick={() => setAll(!all)}>
                    {all ? "Show less" : `Show all ${unread.length}`}
                </button>
            )}
        </section>
    );
}

// a composer-looking prompt box for the new session page (the real composer mounts once the session exists)
function NewSessionComposer({ text, setText, onSubmit, chin }: { text: string; setText: (s: string) => void; onSubmit: () => void; chin?: ReactNode }) {
    return (
        <div className="epitaxy-prompt" data-cds-shell="" data-perf-region="composer">
            <div data-cds="ChatComposer" className="flex w-full min-w-0 flex-col font-sans">
                <div className="bg-surface-3 relative z-[1] flex w-full min-w-0 flex-col text-primary rounded-composer px-[var(--cmp-pad-x)] py-2 [--cmp-pad-x:0.5rem] gap-y-[var(--cmp-gap-y)] [--cmp-gap-y:0.375rem] transition-[background-color,border-color,box-shadow,opacity] duration-200 shadow-composer focus-within:shadow-composer-focus cursor-text">
                    <div className="relative w-full min-w-0">
                        <TextArea
                            bare
                            autosize
                            rows={2}
                            autoFocus
                            aria-label="Prompt"
                            placeholder="Describe a task or ask a question"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), onSubmit())}
                            className="pl-[4px] pr-[34px]"
                            style={{ fontSize: "var(--cds-font-size-prose)", lineHeight: 1.4, maxHeight: "min(24rem, 40svh)" }}
                        />
                        <div className="absolute bottom-0 right-0 flex shrink-0 items-center">
                            <Button iconOnly icon="ArrowReturn" aria-label="Send" data-testid="code-prompt-send" disabled={!text.trim()} onClick={onSubmit} />
                        </div>
                    </div>
                    {chin}
                </div>
            </div>
        </div>
    );
}
