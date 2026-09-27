/**
 * Pure bookkeeping for Last Seen: who was last seen online when, when they were last active, and
 * when (and where) they last sent a message. No Discord or storage access here, so it can be
 * tested on its own.
 */

export interface Entry {
    /** Last time we saw them online (the moment they went offline, or the last observation while online) */
    seen?: number;
    /**
     * `seen` is only a lower bound: they were online when Discord closed and may have stayed online
     * after, so the real time is somewhere between `seen` and now
     */
    approx?: boolean;
    /** Online at the last observation */
    online?: boolean;
    /** Last time we saw them do something: typing, joining or leaving voice, reacting */
    active?: number;
    /** Last time we saw them send a message */
    message?: number;
    /** Where that message was */
    channelId?: string;
    messageId?: string;
}

/** Insertion-ordered: least recently touched first, so pruning drops from the front */
export type Tracker = Map<string, Entry>;

/** About 40 bytes per person saved, so roughly a megabyte at the cap */
export const DEFAULT_CAP = 25_000;

/** People who are never dropped while anyone else can be (friends, DM contacts) */
export type Keep = (id: string) => boolean;

export const isOnlineStatus = (status: string | null | undefined) => status === "online" || status === "idle" || status === "dnd";

/** Moves an entry to the most recently used end and returns it */
function touch(tracker: Tracker, id: string): Entry {
    const entry = tracker.get(id) ?? {};
    tracker.delete(id);
    tracker.set(id, entry);
    return entry;
}

/**
 * How far past the cap the tracker may grow before it's pruned. Pruning then drops this many at
 * once, so it runs once per few hundred new people instead of on every one.
 */
export const PRUNE_SLACK = 500;

/**
 * Drops the least recently touched entries until `cap` are left, skipping anyone `keep` protects.
 * Only if everyone left is protected do protected people go too. With `slack`, nothing happens
 * until there are more than `cap + slack`. Returns how many were removed.
 *
 * Protected people who were skipped move to the most recently used end, so the next prune doesn't
 * walk past them again: with thousands of friends at the front, every prune would rescan them all.
 */
export function prune(tracker: Tracker, cap = DEFAULT_CAP, keep?: Keep, slack = 0): number {
    if (tracker.size <= cap + slack) return 0;
    const excess = tracker.size - cap;
    let removed = 0;
    const skipped: [string, Entry][] = [];
    for (const [id, entry] of tracker) {
        if (removed >= excess) break;
        if (keep?.(id)) {
            skipped.push([id, entry]);
            continue;
        }
        tracker.delete(id);
        removed++;
    }
    for (const [id, entry] of skipped) {
        tracker.delete(id);
        tracker.set(id, entry);
    }
    for (const id of tracker.keys()) {
        if (removed >= excess) break;
        tracker.delete(id);
        removed++;
    }
    return removed;
}

export interface Options {
    cap?: number;
    keep?: Keep;
    /** Extra room before pruning, see PRUNE_SLACK. 0 (the default) prunes on every addition over the cap. */
    slack?: number;
}

/**
 * Whether someone isn't tracked: you, and bots when `ignoreBots` is on. Only an explicit bot flag
 * counts: raw payloads (presences, typing, voice) usually leave it out, and looking each one up in
 * UserStore on every dispatch isn't worth it. The lines under names pass the user record's own flag.
 */
export function isIgnored(id: string | undefined, bot: boolean | undefined, me: string | undefined, ignoreBots: boolean): boolean {
    if (!id || id === me) return true;
    return ignoreBots && bot === true;
}

/**
 * Records a presence observation. Online (online/idle/dnd): marks them online and seen now.
 * Anything else (offline, invisible, unknown): if they were online, they were last seen now.
 * Someone we never saw online isn't recorded. Returns whether anything changed.
 */
export function observePresence(tracker: Tracker, id: string, status: string | null | undefined, now: number, opts: Options = {}): boolean {
    if (isOnlineStatus(status)) {
        const entry = touch(tracker, id);
        entry.online = true;
        entry.seen = now;
        delete entry.approx;
        prune(tracker, opts.cap, opts.keep, opts.slack);
        return true;
    }
    const entry = tracker.get(id);
    if (!entry?.online) return false;
    touch(tracker, id);
    entry.online = false;
    entry.seen = now;
    delete entry.approx;
    return true;
}

/** Records activity (typing, voice, a reaction) at `at`. Returns whether anything changed. */
export function observeActivity(tracker: Tracker, id: string, at: number, opts: Options = {}): boolean {
    const old = tracker.get(id)?.active ?? 0;
    if (at <= old) return false;
    touch(tracker, id).active = at;
    prune(tracker, opts.cap, opts.keep, opts.slack);
    return true;
}

/**
 * Records a message sent at `at`, and where. Older messages than the one we have (from scrolling
 * back through history) change nothing and don't count as a recent touch. Returns whether anything
 * changed.
 */
export function observeMessage(tracker: Tracker, id: string, at: number, where: { channelId?: string; messageId?: string; } = {}, opts: Options = {}): boolean {
    const old = tracker.get(id)?.message ?? 0;
    if (at <= old) return false;
    const entry = touch(tracker, id);
    entry.message = at;
    if (where.channelId) entry.channelId = where.channelId;
    else delete entry.channelId;
    if (where.messageId) entry.messageId = where.messageId;
    else delete entry.messageId;
    prune(tracker, opts.cap, opts.keep, opts.slack);
    return true;
}

/** v2: [id, seen, message, online, active, channelId, messageId, approx]. v1 rows are the first four. */
type Row = [string, number, number, 0 | 1, number, string, string, 0 | 1];

export interface Saved {
    v: 2;
    savedAt: number;
    rows: Row[];
}

export function serialize(tracker: Tracker, now: number): Saved {
    const rows: Row[] = [];
    for (const [id, e] of tracker) {
        rows.push([id, e.seen ?? 0, e.message ?? 0, e.online ? 1 : 0, e.active ?? 0, e.channelId ?? "", e.messageId ?? "", e.approx ? 1 : 0]);
    }
    return { v: 2, savedAt: now, rows };
}

const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * Restores saved data (v1 or v2). Anyone who was online when it was saved was, as far as we know,
 * last seen then: the "online" flag is stale after a restart, so it becomes an approximate timestamp.
 */
export function deserialize(data: unknown, opts: Options = {}): Tracker {
    const tracker: Tracker = new Map();
    const saved = data as { savedAt?: unknown; rows?: unknown; } | null | undefined;
    if (!saved || !Array.isArray(saved.rows)) return tracker;
    const savedAt = num(saved.savedAt);
    for (const row of saved.rows) {
        if (!Array.isArray(row) || typeof row[0] !== "string") continue;
        const [id, seen, message, online, active, channelId, messageId, approx] = row;
        const entry: Entry = {};
        const s = num(seen);
        if (online && savedAt > s) {
            entry.seen = savedAt;
            entry.approx = true;
        } else if (s) {
            entry.seen = s;
            if (approx) entry.approx = true;
        }
        if (num(active)) entry.active = num(active);
        if (num(message)) {
            entry.message = num(message);
            if (str(channelId)) entry.channelId = str(channelId);
            if (str(messageId)) entry.messageId = str(messageId);
        }
        if (entry.seen || entry.message || entry.active) tracker.set(id, entry);
    }
    prune(tracker, opts.cap, opts.keep, opts.slack);
    return tracker;
}

/** Keeps the newer of each field. Used to merge what was seen while the saved data was loading. */
export function merge(into: Entry | undefined, from: Entry): Entry {
    const out: Entry = { ...into };
    if (from.seen && (!out.seen || from.seen >= out.seen || from.online)) {
        out.seen = from.seen;
        out.online = from.online;
        if (from.approx) out.approx = true;
        else delete out.approx;
    }
    if (from.active && from.active > (out.active ?? 0)) out.active = from.active;
    if (from.message && from.message > (out.message ?? 0)) {
        out.message = from.message;
        out.channelId = from.channelId;
        out.messageId = from.messageId;
        if (!out.channelId) delete out.channelId;
        if (!out.messageId) delete out.messageId;
    }
    return out;
}

const UNITS: [number, string][] = [
    [365 * 24 * 3600_000, "y"],
    [30 * 24 * 3600_000, "mo"],
    [7 * 24 * 3600_000, "w"],
    [24 * 3600_000, "d"],
    [3600_000, "h"],
    [60_000, "m"],
];

/** "5m", "3h", "2d", or null under a minute */
export function formatSpan(then: number, now: number): string | null {
    const diff = Math.max(0, now - then);
    for (const [ms, unit] of UNITS) {
        if (diff >= ms) return `${Math.floor(diff / ms)}${unit}`;
    }
    return null;
}

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", "1y ago" */
export function formatRelative(then: number, now: number): string {
    const span = formatSpan(then, now);
    return span ? `${span} ago` : "just now";
}

/** "Last seen 3h ago", or "Last seen in the last 3h" when it's only a lower bound */
export function seenText(entry: Entry, now: number): string | null {
    if (!entry.seen) return null;
    if (!entry.approx) return `Last seen ${formatRelative(entry.seen, now)}`;
    const span = formatSpan(entry.seen, now);
    return span ? `Last seen in the last ${span}` : "Last seen just now";
}

/** The one-line summary for an offline person: whichever of last seen and last active is newer */
export function lineText(entry: Entry | undefined, now: number): string | null {
    if (!entry) return null;
    if (entry.active && entry.active > (entry.seen ?? 0)) return `Active ${formatRelative(entry.active, now)}`;
    return seenText(entry, now);
}

/**
 * "Last seen 3h ago · Active 1h ago · Last message 2d ago in #general", "Online now · Last message
 * 5m ago", or null when nothing is known. Activity is only mentioned when it's newer than last seen.
 */
export function describe(entry: Entry | undefined, onlineNow: boolean, now: number, where?: string): string | null {
    const parts: string[] = [];
    if (onlineNow) parts.push("Online now");
    else if (entry?.seen) parts.push(seenText(entry, now)!);
    if (!onlineNow && entry?.active && entry.active > (entry.seen ?? 0)) parts.push(`Active ${formatRelative(entry.active, now)}`);
    if (entry?.message) parts.push(`Last message ${formatRelative(entry.message, now)}${where ? ` in ${where}` : ""}`);
    return parts.length ? parts.join(" · ") : null;
}
