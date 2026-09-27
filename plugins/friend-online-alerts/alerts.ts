/**
 * Pure logic for Friend Online Alerts: turning presence snapshots into alerts, with the anti-spam
 * rules. No Discord access here, so it can be tested on its own.
 *
 * - Online means online, idle or dnd. Anything else (offline, invisible, unknown) is offline.
 * - The first snapshot of someone is only a baseline: nobody "comes online" the moment we start.
 * - Startup grace: after start, CONNECTION_OPEN or a reconnect, snapshots update the baseline
 *   silently, so the burst of presences Discord sends then doesn't fire a wall of alerts.
 * - Flapping: coming back online within `flapMs` of going offline isn't announced, and neither is
 *   the end of that silent session, so a bad connection stays quiet until it settles.
 * - Cooldown: per person and per kind of alert, at most one every `cooldownMs`.
 */

export type AlertKind = "online" | "offline" | "game" | "stream";

export interface Snapshot {
    online: boolean;
    /** Name of the game they're playing, if any */
    game?: string;
    /** Streaming (a streaming activity, or Go Live) */
    streaming?: boolean;
}

export interface AlertConfig {
    online: boolean;
    offline: boolean;
    game: boolean;
    stream: boolean;
    /** Online again within this long after going offline counts as flapping. 0 turns it off. */
    flapMs: number;
    /** Minimum time between two alerts of the same kind for one person. 0 turns it off. */
    cooldownMs: number;
}

export const DEFAULT_CONFIG: AlertConfig = {
    online: true,
    offline: false,
    game: false,
    stream: false,
    flapMs: 5 * 60_000,
    cooldownMs: 2 * 60_000,
};

export const STARTUP_GRACE_MS = 15_000;

export interface Alert {
    kind: AlertKind;
    userId: string;
    /** The game, for "game" alerts and for "online" alerts of someone already playing */
    game?: string;
}

export const isOnlineStatus = (status: string | null | undefined) => status === "online" || status === "idle" || status === "dnd";

/** Activity types, as Discord numbers them */
export const ActivityType = { PLAYING: 0, STREAMING: 1 } as const;

interface ActivityLike { type?: number; name?: string; }

/** A snapshot from a status, activities and whether they have a Go Live stream */
export function snapshotOf(status: string | null | undefined, activities: readonly ActivityLike[] | null | undefined, goLive = false): Snapshot {
    const online = isOnlineStatus(status);
    if (!online) return { online: false };
    const list = Array.isArray(activities) ? activities : [];
    const game = list.find(a => a?.type === ActivityType.PLAYING && typeof a.name === "string" && a.name.trim())?.name?.trim();
    const streaming = goLive || list.some(a => a?.type === ActivityType.STREAMING);
    return { online, game, streaming };
}

interface State {
    snapshot: Snapshot;
    /** When they last went offline */
    offlineAt?: number;
    /** The current online session came back from a flap and wasn't announced */
    silent?: boolean;
}

export class AlertEngine {
    private states = new Map<string, State>();
    private lastAlert = new Map<string, number>();
    private graceUntil = -Infinity;

    /** Snapshots until `now + ms` only update the baseline */
    beginGrace(now: number, ms = STARTUP_GRACE_MS) {
        this.graceUntil = Math.max(this.graceUntil, now + ms);
    }

    inGrace(now: number) {
        return now < this.graceUntil;
    }

    /** When the current grace ends (-Infinity if none was started) */
    get graceEnd() {
        return this.graceUntil;
    }

    /** Sets the baseline without alerting. Keeps the flap/cooldown history. */
    seed(userId: string, snapshot: Snapshot, now: number) {
        this.observe(userId, snapshot, now, DEFAULT_CONFIG, true);
    }

    has(userId: string) {
        return this.states.has(userId);
    }

    forget(userId: string) {
        this.states.delete(userId);
        for (const key of [...this.lastAlert.keys()]) if (key.startsWith(`${userId}:`)) this.lastAlert.delete(key);
    }

    clear() {
        this.states.clear();
        this.lastAlert.clear();
    }

    /** Records a snapshot and returns the alerts it causes (usually none) */
    observe(userId: string, next: Snapshot, now: number, config: AlertConfig, silent = false): Alert[] {
        const state = this.states.get(userId);
        const snapshot: Snapshot = next.online ? { online: true, game: next.game || undefined, streaming: !!next.streaming } : { online: false };
        if (!state) {
            this.states.set(userId, { snapshot });
            return [];
        }

        const prev = state.snapshot;
        state.snapshot = snapshot;
        const quiet = silent || this.inGrace(now);
        const alerts: Alert[] = [];

        if (!prev.online && snapshot.online) {
            const flapped = config.flapMs > 0 && state.offlineAt !== undefined && now - state.offlineAt < config.flapMs;
            state.silent = flapped;
            if (!quiet && !flapped && config.online) this.push(alerts, { kind: "online", userId, game: snapshot.game }, now, config);
            // Whatever they're doing as they come online is part of the online alert
            return alerts;
        }

        if (prev.online && !snapshot.online) {
            state.offlineAt = now;
            const wasSilent = state.silent;
            state.silent = false;
            if (!quiet && !wasSilent && config.offline) this.push(alerts, { kind: "offline", userId }, now, config);
            return alerts;
        }

        if (!snapshot.online || quiet) return alerts;

        if (config.game && snapshot.game && snapshot.game !== prev.game) this.push(alerts, { kind: "game", userId, game: snapshot.game }, now, config);
        if (config.stream && snapshot.streaming && !prev.streaming) this.push(alerts, { kind: "stream", userId, game: snapshot.game }, now, config);
        return alerts;
    }

    private push(alerts: Alert[], alert: Alert, now: number, config: AlertConfig) {
        const key = `${alert.userId}:${alert.kind}`;
        const last = this.lastAlert.get(key);
        if (config.cooldownMs > 0 && last !== undefined && now - last < config.cooldownMs) return;
        this.lastAlert.set(key, now);
        alerts.push(alert);
    }
}

/** Whether alerts should reach you, given your own status */
export const shouldDeliver = (selfStatus: string | null | undefined, alertInDnd: boolean) => alertInDnd || selfStatus !== "dnd";

/** Explicitly watched, or a friend while "watch all friends" is on. Never yourself. */
export function isWatched(userId: string, watched: ReadonlySet<string> | readonly string[], watchAllFriends: boolean, isFriend: (id: string) => boolean, selfId?: string) {
    if (!userId || userId === selfId) return false;
    const has = Array.isArray(watched) ? watched.includes(userId) : (watched as ReadonlySet<string>).has(userId);
    return has || (watchAllFriends && isFriend(userId));
}

/** Only unique snowflake-looking ids, in order */
export function parseWatchList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const id of value) if (typeof id === "string" && /^\d{15,25}$/.test(id) && !out.includes(id)) out.push(id);
    return out;
}

export function toggleWatch(list: readonly string[], userId: string): string[] {
    return list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId];
}

export interface AlertMessage {
    /** The notification title: their name */
    title: string;
    /** The notification body */
    body: string;
    /** One line for toasts and the log */
    text: string;
}

export function messageFor(alert: Alert, name: string): AlertMessage {
    const who = name.trim() || "Someone";
    let body: string;
    switch (alert.kind) {
        case "online":
            body = alert.game ? `is online, playing ${alert.game}` : "is online";
            break;
        case "offline":
            body = "went offline";
            break;
        case "game":
            body = `started playing ${alert.game ?? "a game"}`;
            break;
        case "stream":
            body = alert.game ? `started streaming ${alert.game}` : "started streaming";
            break;
    }
    return { title: who, body, text: `${who} ${body}` };
}
