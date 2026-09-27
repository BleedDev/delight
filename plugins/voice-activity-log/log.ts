import type { SourcePatch } from "@evi/api";

/**
 * The pure half of Voice Activity Log: no Discord, no DOM, so it's unit tested.
 *
 * The plugin hands `VoiceLog.sync` the voice channel you're in and a snapshot of who's in it
 * (VoiceStateStore.getVoiceStatesForChannel, copied, yourself left out) after every voice state
 * change. The log diffs it against the previous snapshot:
 *  - a different channel (or none) ends the current session and, if there's a channel, starts a
 *    new one. Everyone already there is logged once as "was already here", not as joining;
 *  - the same channel yields joins, leaves and, depending on the options, moves, streams, camera,
 *    mutes and deafens.
 * Memory only, capped at MAX_ENTRIES entries over the last MAX_SESSIONS sessions.
 */

export const MAX_ENTRIES = 500;
export const MAX_SESSIONS = 10;

/** What we track of someone's voice state */
export interface MemberState {
    muted: boolean;
    deafened: boolean;
    streaming: boolean;
    video: boolean;
}

export type Snapshot = Readonly<Record<string, MemberState>>;

/** Reads one of Discord's VoiceState records. Server mutes and deafens count too. */
export function toMemberState(voiceState: any): MemberState {
    return {
        muted: !!(voiceState?.selfMute || voiceState?.mute || voiceState?.suppress),
        deafened: !!(voiceState?.selfDeaf || voiceState?.deaf),
        streaming: !!voiceState?.selfStream,
        video: !!voiceState?.selfVideo,
    };
}

/** Copies VoiceStateStore.getVoiceStatesForChannel's { userId: VoiceState } (it's mutated in place), without you */
export function snapshotOf(voiceStates: Record<string, any> | null | undefined, selfId?: string): Snapshot {
    const out: Record<string, MemberState> = {};
    for (const [userId, state] of Object.entries(voiceStates ?? {})) {
        if (!state || userId === selfId) continue;
        out[userId] = toMemberState(state);
    }
    return out;
}

export type EntryKind =
    | "selfJoin" | "selfLeave"
    | "present" | "join" | "leave" | "moveIn" | "moveOut"
    | "streamStart" | "streamStop" | "videoStart" | "videoStop"
    | "mute" | "unmute" | "deafen" | "undeafen";

export const ARRIVALS: ReadonlySet<EntryKind> = new Set(["present", "join", "moveIn"]);
export const DEPARTURES: ReadonlySet<EntryKind> = new Set(["leave", "moveOut"]);

export interface DiffOptions {
    /** Log moves from and to other channels as such, instead of plain joins and leaves */
    moves: boolean;
    /** Streams and camera */
    streams: boolean;
    muteDeafen: boolean;
}

export const DEFAULT_OPTIONS: DiffOptions = { moves: true, streams: false, muteDeafen: false };

/** Where someone came from or went, from the VOICE_STATE_UPDATES payload (oldChannelId, channelId) */
export interface Move {
    from?: string | null;
    to?: string | null;
}

/**
 * Whether a VOICE_STATE_UPDATES payload can change what's logged for the session in `channelId`:
 * someone joining, leaving or already in it, or you. Discord sends these for every voice channel
 * you can see, so most are about other channels and can be skipped without reading the stores.
 */
export function touchesSession(voiceStates: readonly any[] | null | undefined, channelId: string, snapshot: Snapshot, selfId?: string): boolean {
    if (!Array.isArray(voiceStates)) return true;
    for (const vs of voiceStates) {
        const userId = vs?.userId;
        if (!userId || userId === selfId || userId in snapshot) return true;
        if (vs.channelId === channelId || vs.oldChannelId === channelId) return true;
    }
    return false;
}

export interface RawEvent {
    kind: EntryKind;
    userId: string;
    /** Moves: the other channel */
    otherChannelId?: string;
}

/** What changed in `channelId` between two snapshots: departures, arrivals, then state changes */
export function diffSnapshots(
    channelId: string,
    prev: Snapshot,
    next: Snapshot,
    options: DiffOptions = DEFAULT_OPTIONS,
    moveOf: (userId: string) => Move | undefined = () => undefined,
): RawEvent[] {
    const departures: RawEvent[] = [];
    const arrivals: RawEvent[] = [];
    const changes: RawEvent[] = [];

    for (const userId of Object.keys(prev)) {
        if (userId in next) continue;
        const to = moveOf(userId)?.to;
        departures.push(options.moves && to && to !== channelId ? { kind: "moveOut", userId, otherChannelId: to } : { kind: "leave", userId });
    }
    for (const [userId, now] of Object.entries(next)) {
        const before = prev[userId];
        if (!before) {
            const from = moveOf(userId)?.from;
            arrivals.push(options.moves && from && from !== channelId ? { kind: "moveIn", userId, otherChannelId: from } : { kind: "join", userId });
            continue;
        }
        if (options.streams) {
            if (before.streaming !== now.streaming) changes.push({ kind: now.streaming ? "streamStart" : "streamStop", userId });
            if (before.video !== now.video) changes.push({ kind: now.video ? "videoStart" : "videoStop", userId });
        }
        if (options.muteDeafen) {
            const deafChanged = before.deafened !== now.deafened;
            if (deafChanged) changes.push({ kind: now.deafened ? "deafen" : "undeafen", userId });
            // Deafening mutes you too: one entry, not two
            const muteImplied = deafChanged && now.muted === now.deafened;
            if (before.muted !== now.muted && !muteImplied) changes.push({ kind: now.muted ? "mute" : "unmute", userId });
        }
    }
    return [...departures, ...arrivals, ...changes];
}

export interface LogEntry {
    id: number;
    sessionId: number;
    kind: EntryKind;
    /** Your own id for selfJoin and selfLeave */
    userId: string;
    /** Display name when it happened */
    name: string;
    at: number;
    channelId: string;
    /** Moves: the other channel, and its name */
    otherChannelId?: string;
    otherChannelName?: string;
    /** Departures: how long they stayed */
    stayed?: number;
    /** Departures of someone who was already there when you joined: they stayed at least `stayed` */
    sinceBefore?: boolean;
    /** Arrivals: when they left, once they have (or when you did) */
    leftAt?: number;
    /** Arrivals: `leftAt` is when you left, they were still there */
    stillThere?: boolean;
}

export interface Session {
    id: number;
    channelId: string;
    channelName: string;
    guildId?: string | null;
    startedAt: number;
    endedAt?: number;
    /** Oldest first */
    entries: LogEntry[];
    /** Who's here now, and since when */
    here: Record<string, number>;
    /** The last snapshot */
    snapshot: Snapshot;
}

export interface SyncInput {
    /** The voice channel you're in, or null */
    channelId: string | null;
    guildId?: string | null;
    /** Who's in it, yourself left out */
    snapshot: Snapshot;
    now?: number;
    selfId?: string;
    options?: DiffOptions;
    moveOf?(userId: string): Move | undefined;
    nameOf?(userId: string): string;
    channelName?(channelId: string): string;
}

export class VoiceLog {
    /** Newest first */
    sessions: Session[] = [];
    /** Bumped on every change, for useSyncExternalStore */
    version = 0;
    private nextId = 1;
    private nextSession = 1;
    private readonly listeners = new Set<() => void>();

    constructor(private readonly maxEntries = MAX_ENTRIES, private readonly maxSessions = MAX_SESSIONS) { }

    /** The session you're in */
    get current(): Session | undefined {
        const first = this.sessions[0];
        return first && first.endedAt === undefined ? first : undefined;
    }

    /** Applies the latest state and returns the entries it added */
    sync(input: SyncInput): LogEntry[] {
        const now = input.now ?? Date.now();
        const nameOf = input.nameOf ?? (id => id);
        const channelName = input.channelName ?? (id => id);
        const added: LogEntry[] = [];
        let current = this.current;

        if (current && current.channelId !== input.channelId) {
            added.push(this.end(current, now, input.channelId, input.selfId, channelName));
            current = undefined;
        }

        if (!current && input.channelId) {
            current = {
                id: this.nextSession++,
                channelId: input.channelId,
                channelName: channelName(input.channelId),
                guildId: input.guildId,
                startedAt: now,
                entries: [],
                here: {},
                snapshot: input.snapshot,
            };
            this.sessions.unshift(current);
            added.push(this.push(current, { kind: "selfJoin", userId: input.selfId ?? "", name: "You", at: now }));
            for (const userId of Object.keys(input.snapshot)) {
                current.here[userId] = now;
                added.push(this.push(current, { kind: "present", userId, name: nameOf(userId), at: now }));
            }
        } else if (current) {
            const events = diffSnapshots(current.channelId, current.snapshot, input.snapshot, input.options, input.moveOf);
            current.snapshot = input.snapshot;
            for (const event of events) added.push(this.apply(current, event, now, nameOf, channelName));
        }

        if (added.length) {
            this.trim();
            this.changed();
        }
        return added;
    }

    /** Latest `count` entries over all sessions, oldest first */
    last(count: number): LogEntry[] {
        const all: LogEntry[] = [];
        for (const session of this.sessions) {
            for (let i = session.entries.length - 1; i >= 0 && all.length < count; i--) all.push(session.entries[i]);
            if (all.length >= count) break;
        }
        return all.reverse();
    }

    get size() {
        return this.sessions.reduce((n, s) => n + s.entries.length, 0);
    }

    /** Forgets ended sessions and the current session's entries (who's here is kept) */
    clear() {
        const current = this.current;
        if (!this.size && this.sessions.length === (current ? 1 : 0)) return;
        this.sessions = current ? [current] : [];
        if (current) current.entries = [];
        this.changed();
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    };

    getVersion = () => this.version;

    private push(session: Session, entry: Omit<LogEntry, "id" | "sessionId" | "channelId">): LogEntry {
        const full: LogEntry = { id: this.nextId++, sessionId: session.id, channelId: session.channelId, ...entry };
        session.entries.push(full);
        return full;
    }

    /** The open arrival entry of someone who's here */
    private arrivalOf(session: Session, userId: string) {
        for (let i = session.entries.length - 1; i >= 0; i--) {
            const e = session.entries[i];
            if (e.userId === userId && ARRIVALS.has(e.kind)) return e.leftAt === undefined ? e : undefined;
        }
    }

    private apply(session: Session, event: RawEvent, now: number, nameOf: (id: string) => string, channelName: (id: string) => string) {
        const { kind, userId, otherChannelId } = event;
        const entry: Omit<LogEntry, "id" | "sessionId" | "channelId"> = { kind, userId, name: nameOf(userId), at: now };
        if (otherChannelId) {
            entry.otherChannelId = otherChannelId;
            entry.otherChannelName = channelName(otherChannelId);
        }
        if (ARRIVALS.has(kind)) session.here[userId] = now;
        if (DEPARTURES.has(kind)) {
            const since = session.here[userId];
            if (since !== undefined) {
                entry.stayed = now - since;
                const arrival = this.arrivalOf(session, userId);
                if (arrival) {
                    arrival.leftAt = now;
                    if (arrival.kind === "present") entry.sinceBefore = true;
                }
            }
            delete session.here[userId];
        }
        return this.push(session, entry);
    }

    private end(session: Session, now: number, nextChannel: string | null, selfId: string | undefined, channelName: (id: string) => string) {
        session.endedAt = now;
        for (const userId of Object.keys(session.here)) {
            const arrival = this.arrivalOf(session, userId);
            if (arrival) {
                arrival.leftAt = now;
                arrival.stillThere = true;
            }
        }
        session.here = {};
        const entry: Omit<LogEntry, "id" | "sessionId" | "channelId"> = { kind: "selfLeave", userId: selfId ?? "", name: "You", at: now, stayed: now - session.startedAt };
        if (nextChannel) {
            entry.otherChannelId = nextChannel;
            entry.otherChannelName = channelName(nextChannel);
        }
        return this.push(session, entry);
    }

    private trim() {
        while (this.sessions.length > this.maxSessions) this.sessions.pop();
        let excess = this.size - this.maxEntries;
        for (let i = this.sessions.length - 1; i >= 0 && excess > 0; i--) {
            const session = this.sessions[i];
            const drop = Math.min(excess, session.entries.length);
            session.entries.splice(0, drop);
            excess -= drop;
            if (!session.entries.length && session !== this.current) this.sessions.splice(i, 1);
        }
    }

    private changed() {
        this.version++;
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch { }
        }
    }
}

// ---- Words --------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** 24-hour local clock: "14:02" */
export function formatClock(ms: number) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "45s", "12m", "1h 5m" */
export function formatDuration(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

const channelLabel = (name: string | undefined, id: string | undefined) => name || (id ? `channel ${id}` : "another channel");

/** What happened, without the time: "Bob left (stayed 15m)" */
export function describe(entry: LogEntry, sessionChannelName?: string): string {
    const n = entry.name;
    const stayed = entry.stayed !== undefined ? ` (stayed ${entry.sinceBefore ? "at least " : ""}${formatDuration(entry.stayed)})` : "";
    const other = channelLabel(entry.otherChannelName, entry.otherChannelId);
    switch (entry.kind) {
        case "selfJoin": return `You joined ${channelLabel(sessionChannelName, entry.channelId)}`;
        case "selfLeave": return entry.otherChannelId ? `You moved to ${other}${stayed}` : `You left${stayed}`;
        case "present": return `${n} was already here`;
        case "join": return `${n} joined`;
        case "leave": return `${n} left${stayed}`;
        case "moveIn": return `${n} moved in from ${other}`;
        case "moveOut": return `${n} moved to ${other}${stayed}`;
        case "streamStart": return `${n} started streaming`;
        case "streamStop": return `${n} stopped streaming`;
        case "videoStart": return `${n} turned on their camera`;
        case "videoStop": return `${n} turned off their camera`;
        case "mute": return `${n} muted`;
        case "unmute": return `${n} unmuted`;
        case "deafen": return `${n} deafened`;
        case "undeafen": return `${n} undeafened`;
    }
}

/** How long an arrival stayed: "stayed 12m", "still here · 5m", "was still there" */
export function stayNote(entry: LogEntry, now: number): string | undefined {
    if (!ARRIVALS.has(entry.kind)) return;
    if (entry.leftAt === undefined) return `still here · ${formatDuration(now - entry.at)}`;
    const d = formatDuration(entry.leftAt - entry.at);
    if (entry.stillThere) return `still there when you left · ${d}`;
    return entry.kind === "present" ? `stayed at least ${d}` : `stayed ${d}`;
}

export const formatLine = (entry: LogEntry, sessionChannelName?: string) => `${formatClock(entry.at)}  ${describe(entry, sessionChannelName)}`;

/** Plain text for "Copy as text": a header per session, then its entries */
export function formatSessions(sessions: readonly Pick<Session, "channelName" | "channelId" | "startedAt" | "endedAt" | "entries">[], now = Date.now()): string {
    return sessions.map(s => {
        const end = s.endedAt !== undefined ? formatClock(s.endedAt) : "now";
        const date = new Date(s.startedAt).toLocaleDateString();
        const head = `${channelLabel(s.channelName, s.channelId)} · ${date} ${formatClock(s.startedAt)}–${end} (${formatDuration((s.endedAt ?? now) - s.startedAt)})`;
        const lines = s.entries.map(e => formatLine(e, s.channelName));
        return [head, ...(lines.length ? lines : ["(nothing logged)"])].join("\n");
    }).join("\n\n");
}

// ---- Filters ------------------------------------------------------------------------------------

export type KindFilter = "all" | "people" | "streams" | "voice";

export const FILTERS: readonly { value: KindFilter; label: string; }[] = [
    { value: "all", label: "All" },
    { value: "people", label: "Joins & leaves" },
    { value: "streams", label: "Streams" },
    { value: "voice", label: "Mute & deafen" },
];

const GROUPS: Record<Exclude<KindFilter, "all">, ReadonlySet<EntryKind>> = {
    people: new Set(["selfJoin", "selfLeave", "present", "join", "leave", "moveIn", "moveOut"]),
    streams: new Set(["streamStart", "streamStop", "videoStart", "videoStop"]),
    voice: new Set(["mute", "unmute", "deafen", "undeafen"]),
};

export function filterEntries(entries: readonly LogEntry[], kind: KindFilter, query = ""): LogEntry[] {
    const q = query.trim().toLowerCase();
    return entries.filter(e => (kind === "all" || GROUPS[kind].has(e.kind)) && (!q || e.name.toLowerCase().includes(q)));
}

// ---- Toasts -------------------------------------------------------------------------------------

export interface ToastSettings {
    toasts: boolean;
    onlyUnfocused: boolean;
}

/** Joins, leaves and moves toast when enabled; `onlyUnfocused` keeps them to when Discord isn't focused */
export function shouldToast(entry: LogEntry, settings: ToastSettings, focused: boolean) {
    if (!settings.toasts || (settings.onlyUnfocused && focused)) return false;
    return entry.kind === "join" || entry.kind === "leave" || entry.kind === "moveIn" || entry.kind === "moveOut";
}

// ---- Source patch -------------------------------------------------------------------------------

export const PATCHES = {
    /**
     * The "Voice Connected" panel above your user panel. Its right side is a row of
     * [noise suppression (when supported), disconnect]:
     *   (0,L.jsxs)(CJ.A,{grow:0,shrink:0,className:O$.nL,children:[r&&!c?(0,L.jsx)(Rx,{channel:i}):null,(0,L.jsx)(Rc,{channel:i})]})
     * Ours goes first, and gets the channel.
     */
    rtcPanel: {
        find: ".VOICE_PANEL_INTRODUCTION)&&",
        replace: {
            match: /(grow:0,shrink:0,className:\i\.\i,children:\[)(?=\i&&!\i\?\(0,\i\.jsx\)\(\i,\{channel:(\i)\}\):null,)/,
            with: "$1$self?.renderButton?.($2),",
        },
    },
} satisfies Record<string, SourcePatch>;
