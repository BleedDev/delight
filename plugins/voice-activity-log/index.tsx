import { Components, definePlugin, findStore, openLayer, React } from "@evi/api";
import type { CloseLayer, FluxAction, PluginContext } from "@evi/api";

import {
    describe, FILTERS, filterEntries, formatClock, formatDuration, formatLine, formatSessions, KindFilter, LogEntry, Move, PATCHES,
    Session, shouldToast, snapshotOf, stayNote, touchesSession, VoiceLog,
} from "./log";

/**
 * Logs who comes and goes in the voice channel you're in. No polling:
 *  - a Flux subscription on VOICE_STATE_UPDATES (and PASSIVE_UPDATE_V2) runs after the stores
 *    applied the action, so VoiceStateStore.getVoiceStatesForChannel is already up to date. The
 *    payload's oldChannelId / channelId tell a move from a join or leave. Updates about other channels
 *    are skipped without reading the stores (touchesSession);
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
/** SelectedChannelStore, captured on start: sync runs on every voice state update anywhere you can see */
let selectedChannels: any;

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
    const voiceChannelId: string | null = (selectedChannels ??= store("SelectedChannelStore"))?.getVoiceChannelId?.() ?? null;
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

let closeOpen: CloseLayer | undefined;

function openLog() {
    if (!log) return;
    closeOpen?.();
    const current = log;
    const close = openLayer(close => <LogDialog log={current} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

function useNow(ms: number) {
    const [now, setNow] = React.useState(Date.now);
    React.useEffect(() => {
        const handle = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(handle);
    }, [ms]);
    return now;
}

/** "Now · 12m" for the session you're in, "14:02 · 1h 5m" for earlier ones */
function sessionDetail(session: Session, now: number) {
    if (session.endedAt === undefined) return `Now · ${formatDuration(now - session.startedAt)}`;
    return `${formatClock(session.startedAt)} · ${formatDuration(session.endedAt - session.startedAt)}`;
}

function Avatar({ entry, guildId }: { entry: LogEntry; guildId?: string | null; }) {
    const [broken, setBroken] = React.useState(false);
    const src = entry.userId ? avatarOf(entry.userId, guildId) : undefined;
    if (!src || broken) return <span className="evi-vcl-avatar" aria-hidden="true">{entry.name.slice(0, 1).toUpperCase()}</span>;
    return <img className="evi-vcl-avatar" src={src} alt="" width={32} height={32} onError={() => setBroken(true)} />;
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
                <span>{named ? <><strong>{entry.name}</strong>{text.slice(entry.name.length)}</> : text}</span>
                {note && <span className="evi-vcl-note">{note}</span>}
            </span>
            <time className="evi-vcl-time" dateTime={new Date(entry.at).toISOString()} title={new Date(entry.at).toLocaleString()}>{formatClock(entry.at)}</time>
        </li>
    );
}

// Discord's own close and search glyphs
const CloseIcon = () => (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z" />
    </svg>
);

const SearchIcon = () => (
    <svg className="evi-vcl-search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" d="M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
);

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
        <div className="evi-vcl-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="evi-vcl-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-vcl-title" aria-describedby="evi-vcl-subtitle" tabIndex={-1} ref={ref}>
                <header className="evi-vcl-head">
                    <div>
                        <h2 id="evi-vcl-title">Voice Activity Log</h2>
                        <p id="evi-vcl-subtitle">Who came and went in your voice channels. Kept until Discord restarts.</p>
                    </div>
                    <button type="button" className="evi-vcl-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
                </header>
                {!session ? (
                    <p className="evi-vcl-empty">Nothing yet. Join a voice channel and who comes and goes shows up here.</p>
                ) : (
                    <div className="evi-vcl-main">
                        {sessions.length > 1 && (
                            <nav className="evi-vcl-nav" aria-labelledby="evi-vcl-sessions">
                                <h3 id="evi-vcl-sessions">Sessions</h3>
                                {sessions.map(s => (
                                    <button type="button" key={s.id} className="evi-vcl-tab" aria-current={s.id === session.id} title={s.channelName} onClick={() => setSelected(s.id)}>
                                        <span className="evi-vcl-tab-name">
                                            {s.endedAt === undefined && <span className="evi-vcl-live" role="img" aria-label="You're here now" />}
                                            <span>{s.channelName}</span>
                                        </span>
                                        <small>{sessionDetail(s, now)}</small>
                                    </button>
                                ))}
                            </nav>
                        )}
                        <div className="evi-vcl-body">
                            <div className="evi-vcl-tools">
                                <label className="evi-vcl-search">
                                    <SearchIcon />
                                    <input
                                        type="search"
                                        inputMode="search"
                                        placeholder="Filter by name"
                                        aria-label="Filter by name"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={query}
                                        onChange={e => setQuery(e.currentTarget.value)}
                                    />
                                </label>
                                <div className="evi-vcl-chips" role="group" aria-label="Show">
                                    {FILTERS.map(f => (
                                        <button type="button" key={f.value} className="evi-vcl-chip" aria-pressed={kind === f.value} onClick={() => setKind(f.value)}>{f.label}</button>
                                    ))}
                                </div>
                            </div>
                            {entries.length ? (
                                <ul className="evi-vcl-list" aria-label={`Activity in ${session.channelName}`}>
                                    {[...entries].reverse().map(e => <Row key={e.id} entry={e} session={session} now={now} />)}
                                </ul>
                            ) : (
                                <p className="evi-vcl-empty">{session.entries.length ? "Nothing matches the filter." : "Nothing logged in this session yet."}</p>
                            )}
                        </div>
                    </div>
                )}
                <footer className="evi-vcl-foot">
                    <button type="button" className="evi-vcl-button" data-variant="danger" disabled={!log.size} onClick={() => log.clear()}>Clear log</button>
                    <button type="button" className="evi-vcl-button" data-variant="primary" disabled={!entries.length} onClick={copyText}>Copy as text</button>
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

.evi-vcl-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 32px 16px; background: var(--opacity-black-72, rgb(0 0 0 / 0.72)); }
.evi-vcl-modal {
  --evi-vcl-muted: var(--text-muted, #949ba4);
  --evi-vcl-strong: var(--text-strong, var(--header-primary, #f2f3f5));
  --evi-vcl-line: var(--border-subtle, rgb(255 255 255 / 0.08));
  --evi-vcl-hover: var(--background-mod-subtle, var(--background-modifier-hover, rgb(255 255 255 / 0.06)));
  --evi-vcl-selected: var(--background-mod-normal, var(--background-modifier-selected, rgb(255 255 255 / 0.1)));
  --evi-vcl-focus: var(--focus-primary, #00a8fc);
  inline-size: min(720px, 100%); block-size: min(620px, 100%); display: flex; flex-direction: column; overflow: hidden;
  border-radius: var(--radius-md, 12px); border: 1px solid var(--border-subtle, transparent);
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  box-shadow: var(--shadow-high, 0 12px 24px rgb(0 0 0 / 0.24)); outline: none; font-family: var(--font-primary); font-size: 14px; line-height: 18px; }

.evi-vcl-head { display: flex; align-items: flex-start; gap: 16px; padding: 24px 24px 16px; }
.evi-vcl-head > div { flex: 1; min-width: 0; }
.evi-vcl-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--evi-vcl-strong); text-wrap: balance; }
.evi-vcl-head p { margin: 4px 0 0; color: var(--evi-vcl-muted); text-wrap: pretty; }
.evi-vcl-close { flex: none; display: grid; place-items: center; width: 32px; height: 32px; margin: -4px -8px 0 0; padding: 0; border: 0; border-radius: var(--radius-sm, 8px);
  background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }

.evi-vcl-main { flex: 1; min-height: 0; display: flex; border-block-start: 1px solid var(--evi-vcl-line); }
.evi-vcl-nav { flex: none; inline-size: 196px; overflow-y: auto; padding: 16px 8px; display: flex; flex-direction: column; gap: 2px;
  border-inline-end: 1px solid var(--evi-vcl-line); background: var(--background-base-lower, transparent); }
.evi-vcl-nav h3 { margin: 0 0 6px; padding-inline: 10px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--evi-vcl-muted); }
.evi-vcl-tab { display: flex; flex-direction: column; gap: 2px; inline-size: 100%; padding: 8px 10px; border: 0; border-radius: var(--radius-sm, 8px);
  background: none; color: var(--interactive-normal, #b5bac1); font: inherit; text-align: start; cursor: pointer; }
.evi-vcl-tab-name { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; }
.evi-vcl-tab-name > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-vcl-tab small { font-size: 12px; line-height: 16px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-vcl-tab[aria-current="true"] { background: var(--evi-vcl-selected); color: var(--interactive-active, #fff); }
.evi-vcl-live { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--status-positive, var(--green-360, #23a55a)); }

.evi-vcl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-vcl-tools { display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 12px; }
.evi-vcl-search { position: relative; display: flex; align-items: center; }
.evi-vcl-search-icon { position: absolute; inset-inline-start: 10px; color: var(--icon-subtle, var(--evi-vcl-muted)); pointer-events: none; }
.evi-vcl-search input { inline-size: 100%; block-size: 36px; padding: 0 12px 0 34px; border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--input-border-default, var(--input-border, var(--evi-vcl-line)));
  background: var(--input-background-default, var(--input-background, var(--background-base-lowest, #1e1f22)));
  color: var(--text-default, inherit); font: inherit; font-size: 14px; outline: none; }
.evi-vcl-search input::placeholder { color: var(--input-placeholder-text-default, var(--text-muted, #949ba4)); }
.evi-vcl-search input:focus-visible { border-color: var(--evi-vcl-focus); }
.evi-vcl-search input::-webkit-search-cancel-button { cursor: pointer; }
.evi-vcl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.evi-vcl-chip { block-size: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--evi-vcl-hover); color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.evi-vcl-chip[aria-pressed="true"] { background: var(--control-primary-background-default, var(--brand-500, #5865f2)); color: var(--control-primary-text-default, #fff); }

.evi-vcl-list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0 8px 8px; }
/* Discord's thin scrollbar instead of Windows' grey one with arrows: a slim rounded thumb, no track */
.evi-vcl-list, .evi-vcl-nav { scrollbar-width: auto; scrollbar-color: auto; }
.evi-vcl-list::-webkit-scrollbar, .evi-vcl-nav::-webkit-scrollbar { width: 8px; }
.evi-vcl-list::-webkit-scrollbar-track, .evi-vcl-nav::-webkit-scrollbar-track, .evi-vcl-list::-webkit-scrollbar-corner { background: transparent; }
.evi-vcl-list::-webkit-scrollbar-button, .evi-vcl-nav::-webkit-scrollbar-button { display: none; }
.evi-vcl-list::-webkit-scrollbar-thumb, .evi-vcl-nav::-webkit-scrollbar-thumb { min-height: 40px; border: 2px solid transparent; border-radius: 4px; background-clip: padding-box;
  background-color: var(--scrollbar-auto-thumb, rgb(151 151 159 / 0.4)); }
.evi-vcl-list::-webkit-scrollbar-thumb:hover, .evi-vcl-nav::-webkit-scrollbar-thumb:hover { background-color: rgb(151 151 159 / 0.6); }
.evi-vcl-row { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: var(--radius-sm, 8px); }
.evi-vcl-row[data-self] { color: var(--evi-vcl-muted); }
.evi-vcl-row[data-kind="leave"] .evi-vcl-avatar, .evi-vcl-row[data-kind="moveOut"] .evi-vcl-avatar { opacity: .5; }
.evi-vcl-avatar { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; object-fit: cover; font-size: 14px; font-weight: 600;
  background: var(--background-mod-normal, rgb(255 255 255 / 0.08)); color: var(--evi-vcl-muted); outline: 1px solid rgb(255 255 255 / 0.08); outline-offset: -1px; }
.evi-vcl-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.evi-vcl-text strong { font-weight: 600; color: var(--evi-vcl-strong); }
.evi-vcl-note { font-size: 12px; line-height: 16px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; }
.evi-vcl-time { flex: none; font-size: 12px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; }
.evi-vcl-empty { margin: 8px 24px 24px; color: var(--evi-vcl-muted); text-wrap: pretty; }

.evi-vcl-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-block-start: 1px solid var(--evi-vcl-line); }
.evi-vcl-button { block-size: 36px; padding: 0 16px; border: 0; border-radius: var(--radius-sm, 8px); font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.evi-vcl-button[data-variant="primary"] { background: var(--control-primary-background-default, var(--brand-500, #5865f2)); color: var(--control-primary-text-default, #fff); }
.evi-vcl-button[data-variant="danger"] { background: none; color: var(--control-critical-secondary-text-default, var(--text-feedback-critical, #f23f43)); }
.evi-vcl-button:disabled { opacity: .5; cursor: not-allowed; }

@media (hover: hover) {
  .evi-vcl-close:hover { background: var(--evi-vcl-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-tab:hover:not([aria-current="true"]) { background: var(--evi-vcl-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-chip:hover:not([aria-pressed="true"]) { background: var(--evi-vcl-selected); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-row:hover { background: var(--evi-vcl-hover); }
  .evi-vcl-button[data-variant="primary"]:hover:not(:disabled) { background: var(--control-primary-background-hover, var(--brand-560, #4752c4)); }
  .evi-vcl-button[data-variant="danger"]:hover:not(:disabled) { background: var(--evi-vcl-hover); }
}
.evi-vcl-close:focus-visible, .evi-vcl-tab:focus-visible, .evi-vcl-chip:focus-visible, .evi-vcl-button:focus-visible { outline: 2px solid var(--evi-vcl-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  :root:not(.reduce-motion) .evi-vcl-button { transition: scale 200ms ease-out; }
  :root:not(.reduce-motion) .evi-vcl-button:active:not(:disabled) { scale: .97; }
}
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
            closeOpen?.({ instant: true });
            if (log === current) log = undefined;
            context = undefined;
        });

        /** The session you're in, while you're still in its channel: updates elsewhere can't change it */
        const settled = () => {
            const session = current.current;
            const channelId = (selectedChannels ??= store("SelectedChannelStore"))?.getVoiceChannelId?.() ?? null;
            return session && session.channelId === channelId ? session : undefined;
        };
        const onVoiceStates = (action: FluxAction) => {
            const session = settled();
            if (session && !touchesSession(action.voiceStates, session.channelId, session.snapshot, selfId())) return;
            sync(movesOf(action));
        };
        ctx.flux.subscribe("VOICE_STATE_UPDATES", onVoiceStates);
        ctx.flux.subscribe("PASSIVE_UPDATE_V2", (action: FluxAction) => {
            const session = settled();
            if (session && session.guildId && action.guildId && action.guildId !== session.guildId) return;
            sync();
        });

        // You joining, switching or leaving. Only a different channel counts: the store also emits
        // while voice states are being reloaded, and those are diffed on VOICE_STATE_UPDATES
        const selected = selectedChannels = store("SelectedChannelStore");
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
