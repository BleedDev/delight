/**
 * Pure bookkeeping for Last Seen: who was last seen online when, and when they last sent a message.
 * No Discord or storage access here, so it can be tested on its own.
 */

export interface Entry {
    /** Last time we saw them online (the moment they went offline, or the last observation while online) */
    seen?: number;
    /** Last time we saw them send a message */
    message?: number;
    /** Online at the last observation */
    online?: boolean;
}

/** Insertion-ordered: least recently touched first, so pruning drops from the front */
export type Tracker = Map<string, Entry>;

export const DEFAULT_CAP = 5000;

export const isOnlineStatus = (status: string | null | undefined) => status === "online" || status === "idle" || status === "dnd";

/** Moves an entry to the most recently used end and returns it */
function touch(tracker: Tracker, id: string): Entry {
    const entry = tracker.get(id) ?? {};
    tracker.delete(id);
    tracker.set(id, entry);
    return entry;
}

/** Drops the least recently touched entries beyond `cap`. Returns how many were removed. */
export function prune(tracker: Tracker, cap = DEFAULT_CAP): number {
    let removed = 0;
    for (const id of tracker.keys()) {
        if (tracker.size <= cap) break;
        tracker.delete(id);
        removed++;
    }
    return removed;
}

/**
 * Records a presence observation. Online (online/idle/dnd): marks them online and seen now.
 * Anything else (offline, invisible, unknown): if they were online, they were last seen now.
 * Someone we never saw online isn't recorded. Returns whether anything changed.
 */
export function observePresence(tracker: Tracker, id: string, status: string | null | undefined, now: number, cap = DEFAULT_CAP): boolean {
    if (isOnlineStatus(status)) {
        const entry = touch(tracker, id);
        entry.online = true;
        entry.seen = now;
        prune(tracker, cap);
        return true;
    }
    const entry = tracker.get(id);
    if (!entry?.online) return false;
    touch(tracker, id);
    entry.online = false;
    entry.seen = now;
    return true;
}

/** Records a message sent at `at` */
export function observeMessage(tracker: Tracker, id: string, at: number, cap = DEFAULT_CAP) {
    const entry = touch(tracker, id);
    entry.message = Math.max(entry.message ?? 0, at);
    prune(tracker, cap);
}

/** [id, seen, message, online] */
type Row = [string, number | 0, number | 0, 0 | 1];

export interface Saved {
    v: 1;
    savedAt: number;
    rows: Row[];
}

export function serialize(tracker: Tracker, now: number): Saved {
    const rows: Row[] = [];
    for (const [id, e] of tracker) rows.push([id, e.seen ?? 0, e.message ?? 0, e.online ? 1 : 0]);
    return { v: 1, savedAt: now, rows };
}

/**
 * Restores saved data. Anyone who was online when it was saved was, as far as we know, last seen
 * then: the "online" flag is stale after a restart, so it becomes a timestamp.
 */
export function deserialize(data: unknown, cap = DEFAULT_CAP): Tracker {
    const tracker: Tracker = new Map();
    const saved = data as Partial<Saved> | null | undefined;
    if (!saved || !Array.isArray(saved.rows)) return tracker;
    const savedAt = typeof saved.savedAt === "number" ? saved.savedAt : 0;
    for (const row of saved.rows) {
        if (!Array.isArray(row) || typeof row[0] !== "string") continue;
        const [id, seen, message, online] = row;
        const entry: Entry = {};
        const s = typeof seen === "number" && seen > 0 ? seen : 0;
        const lastSeen = online ? Math.max(s, savedAt) : s;
        if (lastSeen) entry.seen = lastSeen;
        if (typeof message === "number" && message > 0) entry.message = message;
        if (entry.seen || entry.message) tracker.set(id, entry);
    }
    prune(tracker, cap);
    return tracker;
}

const UNITS: [number, string][] = [
    [365 * 24 * 3600_000, "y"],
    [30 * 24 * 3600_000, "mo"],
    [7 * 24 * 3600_000, "w"],
    [24 * 3600_000, "d"],
    [3600_000, "h"],
    [60_000, "m"],
];

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", "1y ago" */
export function formatRelative(then: number, now: number): string {
    const diff = Math.max(0, now - then);
    for (const [ms, unit] of UNITS) {
        if (diff >= ms) return `${Math.floor(diff / ms)}${unit} ago`;
    }
    return "just now";
}

/** "Last seen 3h ago · Last message 2d ago", "Online now · Last message 5m ago", or null when nothing is known */
export function describe(entry: Entry | undefined, onlineNow: boolean, now: number): string | null {
    const parts: string[] = [];
    if (onlineNow) parts.push("Online now");
    else if (entry?.seen) parts.push(`Last seen ${formatRelative(entry.seen, now)}`);
    if (entry?.message) parts.push(`Last message ${formatRelative(entry.message, now)}`);
    return parts.length ? parts.join(" · ") : null;
}
