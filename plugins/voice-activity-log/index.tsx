import { Components, createRoot, definePlugin, findStore, React } from "@evi/api";
import type { FluxAction, PluginContext } from "@evi/api";

import {
    describe, FILTERS, filterEntries, formatClock, formatDuration, formatLine, formatSessions, KindFilter, LogEntry, Move, PATCHES,
    Session, shouldToast, snapshotOf, stayNote, VoiceLog,
} from "./log";

/**
 * Logs who comes and goes in the voice channel you're in. No polling:
 *  - a Flux subscription on VOICE_STATE_UPDATES (and PASSIVE_UPDATE_V2) runs after the stores
 *    applied the action, so VoiceStateStore.getVoiceStatesForChannel is already up to date. The
 *    payload's oldChannelId / channelId tell a move from a join or leave;
 *  - a SelectedChannelStore change listener catches you joining, switching or leaving, which
 *    start and end sessions (getVoiceChannelId).
 * Diffing and wording live in log.ts. The "log" button sits in the Voice Connected panel, left of
 * noise suppression and disconnect, through a source patch. Memory only.
 */

type Settings = typeof settings;
const settings = {
    moves: { type: "boolean", label: "Moves", description: "Log moves from and to other channels as moves, not as plain joins and leaves.", default: true },
    streams: { type: "boolean", label: "Streams and camera", description: "Log when someone starts or stops streaming or their camera.", default: false },
    muteDeafen: { type: "boolean", label: "Mutes and deafens", description: "Log when someone mutes, unmutes, deafens or undeafens.", default: false },
    toasts: { type: "boolean", label: "Toasts", description: "Pop up a toast when someone joins, leaves or moves.", default: false },
    onlyUnfocused: { type: "boolean", label: "Only when Discord isn't focused", description: "Show those toasts only while the Discord window isn't focused.", default: false },
    showButton: { type: "boolean", label: "Voice panel button", description: "A log button in the Voice Connected panel. /vclog works either way.", default: true },
} as const;

let context: PluginContext<Settings> | undefined;
let log: VoiceLog | undefined;

function store(name: string): any {
    try {
        return findStore(name);
    } catch {
        return undefined;
    }
}

const selfId = (): string | undefined => store("UserStore")?.getCurrentUser?.()?.id;
const getChannel = (id: string | null | undefined) => id ? store("ChannelStore")?.getChannel?.(id) : undefined;
const guildOf = (channel: any): string | null => channel?.guild_id ?? channel?.getGuildId?.() ?? null;

function nameOf(userId: string, guildId: string | null) {
    const nick = guildId ? store("GuildMemberStore")?.getNick?.(guildId, userId) ?? store("GuildMemberStore")?.getMember?.(guildId, userId)?.nick : undefined;
    if (nick) return nick;
    const friendNick = store("RelationshipStore")?.getNickname?.(userId);
    if (friendNick) return friendNick;
    const user = store("UserStore")?.getUser?.(userId);
    return user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown user";
}

function channelName(channelId: string) {
    const channel = getChannel(channelId);
    if (channel?.name) return channel.name;
    return channel ? "a call" : "another channel";
}

function avatarOf(userId: string, guildId: string | null | undefined): string | undefined {
    try {
        return store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId ?? undefined, 32);
    } catch {
        return undefined;
    }
}

/** Reads the stores and feeds the log. `moves` comes from a VOICE_STATE_UPDATES payload. */
function sync(moves?: Map<string, Move>) {
    if (!log || !context) return;
    const voiceChannelId: string | null = store("SelectedChannelStore")?.getVoiceChannelId?.() ?? null;
    if (!voiceChannelId && !log.current) return;
    const voice = store("VoiceStateStore");
    const channel = getChannel(voiceChannelId);
    const guildId = guildOf(channel);
    const me = selfId();
    const s = context.settings.all;
    const added = log.sync({
        channelId: voiceChannelId,
        guildId,
        snapshot: voiceChannelId ? snapshotOf(voice?.getVoiceStatesForChannel?.(voiceChannelId), me) : {},
        selfId: me,
        options: { moves: s.moves, streams: s.streams, muteDeafen: s.muteDeafen },
        moveOf: userId => moves?.get(userId) ?? { to: voice?.getVoiceState?.(guildId, userId)?.channelId ?? null },
        nameOf: userId => nameOf(userId, guildId),
        channelName,
    });
    const focused = typeof document !== "undefined" && document.hasFocus();
    for (const entry of added) {
        if (shouldToast(entry, s, focused)) context.toast(describe(entry), { type: "info" });
    }
}

function movesOf(action: FluxAction): Map<string, Move> {
    const moves = new Map<string, Move>();
    for (const vs of (action.voiceStates ?? []) as any[]) {
        if (vs?.userId) moves.set(vs.userId, { from: vs.oldChannelId ?? null, to: vs.channelId ?? null });
    }
    return moves;
}

// ---- Clipboard ----------------------------------------------------------------------------------

async function copy(text: string) {
    const native = (window as any).DiscordNative?.clipboard;
    if (native?.copy) native.copy(text);
    else await navigator.clipboard.writeText(text);
}

// ---- The dialog ---------------------------------------------------------------------------------

let closeOpen: (() => void) | undefined;

function openLog() {
    if (!log) return;
    closeOpen?.();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const close = () => {
        if (closeOpen !== close) return;
        closeOpen = undefined;
        root.unmount();
        container.remove();
    };
    closeOpen = close;
    root.render(<LogDialog log={log} onClose={close} />);
}

function useNow(ms: number) {
    const [now, setNow] = React.useState(Date.now);
    React.useEffect(() => {
        const handle = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(handle);
    }, [ms]);
    return now;
}

function sessionLabel(session: Session, now: number) {
    const live = session.endedAt === undefined;
    const time = live ? "Now" : formatClock(session.startedAt);
    return { title: `${time} · ${session.channelName}`, detail: live ? `since ${formatClock(session.startedAt)}` : formatDuration((session.endedAt ?? now) - session.startedAt) };
}

function Avatar({ entry, guildId }: { entry: LogEntry; guildId?: string | null; }) {
    const [broken, setBroken] = React.useState(false);
    const src = entry.userId ? avatarOf(entry.userId, guildId) : undefined;
    if (!src || broken) return <span className="evi-vcl-avatar" aria-hidden="true">{entry.name.slice(0, 1).toUpperCase()}</span>;
    return <img className="evi-vcl-avatar" src={src} alt="" width={24} height={24} onError={() => setBroken(true)} />;
}

function Row({ entry, session, now }: { entry: LogEntry; session: Session; now: number; }) {
    const text = describe(entry, session.channelName);
    const self = entry.kind === "selfJoin" || entry.kind === "selfLeave";
    const note = stayNote(entry, now);
    const named = !self && text.startsWith(entry.name);
    return (
        <li className="evi-vcl-row" data-kind={entry.kind} data-self={self || undefined}>
            <Avatar entry={entry} guildId={session.guildId} />
            <span className="evi-vcl-text">
                {named ? <><strong>{entry.name}</strong>{text.slice(entry.name.length)}</> : text}
                {note && <span className="evi-vcl-note">{note}</span>}
            </span>
            <time className="evi-vcl-time" dateTime={new Date(entry.at).toISOString()} title={new Date(entry.at).toLocaleString()}>{formatClock(entry.at)}</time>
        </li>
    );
}

function LogDialog({ log, onClose }: { log: VoiceLog; onClose(): void; }) {
    React.useSyncExternalStore(log.subscribe, log.getVersion);
    const now = useNow(15_000);
    const sessions = log.sessions;
    const [selected, setSelected] = React.useState<number | undefined>(sessions[0]?.id);
    const [kind, setKind] = React.useState<KindFilter>("all");
    const [query, setQuery] = React.useState("");
    const ref = React.useRef<HTMLDivElement>(null);
    const session = sessions.find(s => s.id === selected) ?? sessions[0];
    const entries = session ? filterEntries(session.entries, kind, query) : [];

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    const copyText = async () => {
        if (!session) return;
        try {
            await copy(formatSessions([{ ...session, entries }], Date.now()));
            context?.toast("Copied the log", { type: "success" });
        } catch (err) {
            context?.logger.error("Couldn't copy", err);
            context?.toast("Couldn't copy the log", { type: "failure" });
        }
    };

    return (
        <div className="evi-vcl-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="evi-vcl-modal" role="dialog" aria-modal="true" aria-labelledby="evi-vcl-title" tabIndex={-1} ref={ref}>
                <header className="evi-vcl-head">
                    <div>
                        <h2 id="evi-vcl-title">Voice Activity Log</h2>
                        <p>Kept in memory until Discord restarts. Last {sessions.length === 1 ? "session" : `${sessions.length} sessions`}.</p>
                    </div>
                    <button type="button" className="evi-vcl-icon" aria-label="Close" onClick={onClose}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                </header>
                {!session ? (
                    <p className="evi-vcl-empty">Nothing yet. Join a voice channel and who comes and goes shows up here.</p>
                ) : (
                    <div className="evi-vcl-main">
                        {sessions.length > 1 && (
                            <nav className="evi-vcl-nav" aria-label="Sessions">
                                {sessions.map(s => {
                                    const { title, detail } = sessionLabel(s, now);
                                    return (
                                        <button type="button" key={s.id} className="evi-vcl-tab" aria-current={s.id === session.id} onClick={() => setSelected(s.id)}>
                                            <span>{title}</span>
                                            <small>{detail}</small>
                                        </button>
                                    );
                                })}
                            </nav>
                        )}
                        <div className="evi-vcl-body">
                            <div className="evi-vcl-tools">
                                <input
                                    className="evi-vcl-search"
                                    type="search"
                                    placeholder="Filter by name"
                                    aria-label="Filter by name"
                                    value={query}
                                    onChange={e => setQuery(e.currentTarget.value)}
                                />
                                <div className="evi-vcl-chips" role="group" aria-label="Show">
                                    {FILTERS.map(f => (
                                        <button type="button" key={f.value} className="evi-vcl-chip" aria-pressed={kind === f.value} onClick={() => setKind(f.value)}>{f.label}</button>
                                    ))}
                                </div>
                            </div>
                            {entries.length ? (
                                <ul className="evi-vcl-list">
                                    {[...entries].reverse().map(e => <Row key={e.id} entry={e} session={session} now={now} />)}
                                </ul>
                            ) : (
                                <p className="evi-vcl-empty">{session.entries.length ? "Nothing matches the filter." : "Nothing logged in this session."}</p>
                            )}
                        </div>
                    </div>
                )}
                <footer className="evi-vcl-foot">
                    <button type="button" className="evi-vcl-button" data-variant="danger" disabled={!log.size} onClick={() => log.clear()}>Clear</button>
                    <button type="button" className="evi-vcl-button" disabled={!entries.length} onClick={copyText}>Copy as text</button>
                </footer>
            </div>
        </div>
    );
}

// ---- The panel button ---------------------------------------------------------------------------

function LogIcon() {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx={4.5} cy={6} r={1} fill="currentColor" stroke="none" />
            <circle cx={4.5} cy={12} r={1} fill="currentColor" stroke="none" />
            <circle cx={4.5} cy={18} r={1} fill="currentColor" stroke="none" />
        </svg>
    );
}

function LogButton() {
    const { showButton } = context!.settings.use();
    if (!showButton) return null;
    const label = "Voice activity log";
    const button = (
        <button type="button" className="evi-vcl-panel-button" onClick={openLog} aria-label={label}>
            <LogIcon />
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={label} position="top">{button}</Tooltip> : React.cloneElement(button, { title: label });
}

function SettingsPanel({ log }: { log: VoiceLog; }) {
    React.useSyncExternalStore(log.subscribe, log.getVersion);
    const Button = Components.Button as any;
    const label = "Open log";
    return (
        <div className="dl-field-row">
            <div className="dl-field-text">
                <div className="dl-label">Log</div>
                <p className="dl-hint" role="status">{log.size ? `${log.size} entries over ${log.sessions.length} session${log.sessions.length === 1 ? "" : "s"}.` : "Nothing yet."} Kept in memory only.</p>
            </div>
            {Button
                ? <Button size={Button.Sizes?.SMALL} onClick={openLog}>{label}</Button>
                : <button type="button" className="dl-button" onClick={openLog}>{label}</button>}
        </div>
    );
}

const css = `
.evi-vcl-panel-button { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 32px; height: 32px; padding: 0; border: 0;
  border-radius: var(--radius-sm, 8px); cursor: pointer; background: transparent; color: var(--interactive-normal, var(--interactive-icon-default));
  transition: background-color .1s ease-out, color .1s ease-out; }
.evi-vcl-panel-button:hover { background: var(--background-modifier-hover, var(--interactive-background-hover)); color: var(--interactive-hover, var(--interactive-icon-hover)); }
.evi-vcl-panel-button:active { background: var(--background-modifier-active, var(--interactive-background-active)); color: var(--interactive-active, var(--interactive-icon-active)); }
.evi-vcl-panel-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
.evi-vcl-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-vcl-modal { width: min(680px, calc(100vw - 32px)); height: min(600px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); outline: none; font-family: var(--font-primary); }
.evi-vcl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-vcl-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-vcl-head p { margin: 4px 0 0; font-size: 14px; color: var(--text-muted, #949ba4); }
.evi-vcl-icon { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-vcl-icon:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-vcl-main { flex: 1; min-height: 0; display: flex; }
.evi-vcl-nav { flex: none; width: 180px; overflow-y: auto; padding: 8px; border-right: 1px solid var(--border-subtle, rgba(255,255,255,.06)); display: flex; flex-direction: column; gap: 2px; }
.evi-vcl-tab { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: none; color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 14px; text-align: start; cursor: pointer; }
.evi-vcl-tab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-vcl-tab > small { font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-tab:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-vcl-tab[aria-current="true"] { background: var(--background-modifier-selected, rgba(255,255,255,.1)); color: var(--interactive-active, #fff); }
.evi-vcl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-vcl-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-vcl-search { flex: 1 1 160px; min-width: 0; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08)));
  background: var(--input-background, var(--background-base-lowest, #1e1f22)); color: inherit; font: inherit; font-size: 14px; }
.evi-vcl-search:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-vcl-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.evi-vcl-chip { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--border-subtle, rgba(255,255,255,.08)); background: none; color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 13px; cursor: pointer; }
.evi-vcl-chip:hover { color: var(--interactive-hover, #dbdee1); background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-vcl-chip[aria-pressed="true"] { background: var(--background-modifier-selected, rgba(255,255,255,.1)); color: var(--interactive-active, #fff); border-color: transparent; }
.evi-vcl-chip:focus-visible, .evi-vcl-tab:focus-visible, .evi-vcl-button:focus-visible, .evi-vcl-icon:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
.evi-vcl-list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 4px 20px 12px; }
.evi-vcl-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-vcl-row[data-self] { color: var(--text-muted, #949ba4); }
.evi-vcl-row[data-kind="leave"] .evi-vcl-avatar, .evi-vcl-row[data-kind="moveOut"] .evi-vcl-avatar { opacity: .5; }
.evi-vcl-avatar { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; object-fit: cover; font-size: 12px; font-weight: 600;
  background: var(--background-modifier-accent, rgba(255,255,255,.08)); color: var(--text-muted, #949ba4); }
.evi-vcl-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.evi-vcl-text strong { font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-vcl-note { display: block; font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-time { flex: none; font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-empty { margin: 16px 20px; color: var(--text-muted, #949ba4); font-size: 14px; }
.evi-vcl-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-vcl-button { height: 32px; padding: 0 14px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  background: var(--control-brand-foreground, var(--brand-500, #5865f2)); color: var(--white, #fff); }
.evi-vcl-button[data-variant="danger"] { background: none; color: var(--text-danger, var(--status-danger, #f23f43)); }
.evi-vcl-button[data-variant="danger"]:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-vcl-button:disabled { opacity: .5; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .evi-vcl-panel-button { transition: none; } }
`;

export default definePlugin({
    settings,

    patches: [PATCHES.rtcPanel],

    css,

    /** Called by the patched Voice Connected panel, first in its button row */
    renderButton(_channel: unknown) {
        if (!context) return null;
        return <LogButton key="evi-voice-activity-log" />;
    },

    openLog,

    start(ctx) {
        const current = new VoiceLog();
        context = ctx;
        log = current;
        ctx.onDispose(() => {
            closeOpen?.();
            if (log === current) log = undefined;
            context = undefined;
        });

        const onVoiceStates = (action: FluxAction) => sync(movesOf(action));
        ctx.flux.subscribe("VOICE_STATE_UPDATES", onVoiceStates);
        ctx.flux.subscribe("PASSIVE_UPDATE_V2", () => sync());

        // You joining, switching or leaving. Only a different channel counts: the store also emits
        // while voice states are being reloaded, and those are diffed on VOICE_STATE_UPDATES
        const selected = store("SelectedChannelStore");
        const onSelected = () => {
            const id = selected?.getVoiceChannelId?.() ?? null;
            if (id !== (current.current?.channelId ?? null)) sync();
        };
        selected?.addChangeListener?.(onSelected);
        ctx.onDispose(() => selected?.removeChangeListener?.(onSelected));

        // Already in a call when the plugin starts
        sync();

        ctx.command({
            name: "vclog",
            description: "Who joined and left your voice channel recently",
            execute() {
                const entries = current.last(15);
                if (!entries.length) return { ephemeral: "Nothing logged yet. Join a voice channel and who comes and goes shows up here." };
                const names = new Map(current.sessions.map(s => [s.id, s.channelName]));
                return { ephemeral: entries.map(e => formatLine(e, names.get(e.sessionId))).join("\n") };
            },
        });
    },

    settingsPanel: () => log && <SettingsPanel log={log} />,

    /** The running plugin's log, for tests and debugging */
    getLog: () => log,
});
