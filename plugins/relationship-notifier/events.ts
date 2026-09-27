/**
 * What Relationship Notifier decides, in memory only. Pure: no Discord, no DOM, so it's unit tested.
 *
 * `decide` looks at a Flux action BEFORE Discord's stores apply it, so the lookup still sees the
 * friend, group DM or server that's about to go, and its name. Things you do yourself (removing a
 * friend, leaving a group or server) are marked on the tracker first and never reported.
 */

export type NotificationKind = "friendRemoved" | "requestCancelled" | "groupRemoved" | "serverRemoved";

export interface RelationshipNotification {
    kind: NotificationKind;
    /** The user, group DM or server id */
    id: string;
    name: string;
    /** When it happened (ms) */
    at: number;
    /** What the toast and the log say */
    text: string;
}

/** Discord's relationship types */
export const RelationshipType = { NONE: 0, FRIEND: 1, BLOCKED: 2, INCOMING: 3, OUTGOING: 4, IMPLICIT: 5 } as const;
/** Discord's channel type for group DMs */
export const GROUP_DM = 3;

export interface ChannelSnapshot {
    type: number;
    name?: string | null;
    /** Recipient user ids, yourself excluded */
    recipients?: readonly string[];
}

/** Reads the stores as they are before the action is applied */
export interface Lookup {
    currentUserId?: string;
    relationshipType(userId: string): number | undefined;
    userName(userId: string): string | undefined;
    channel(channelId: string): ChannelSnapshot | undefined;
    guildName(guildId: string): string | undefined;
}

export type Scope = "relationship" | "channel" | "guild";

/** How long something you did yourself waits for Discord's matching event */
export const SELF_WINDOW = 60_000;
/** A group DM removal can arrive twice (recipient remove, then channel delete): report it once */
export const DEDUPE_WINDOW = 10_000;
/** Marks every pending relationship as yours, e.g. when you clear all pending requests */
export const ALL = "*";

export class Tracker {
    private readonly self = new Map<string, number>();
    private readonly reported = new Map<string, number>();

    /** Something you're about to do yourself, e.g. leaving a server */
    markSelf(scope: Scope, id: string, now = Date.now()) {
        this.prune(now);
        this.self.set(`${scope}:${id}`, now);
    }

    /** Whether the event was caused by you. Consumes the mark. */
    consumeSelf(scope: Scope, id: string, now = Date.now()) {
        this.prune(now);
        if (this.self.delete(`${scope}:${id}`)) return true;
        return this.self.has(`${scope}:${ALL}`);
    }

    /** True the first time within the dedupe window */
    firstReport(scope: Scope, id: string, now = Date.now()) {
        this.prune(now);
        const key = `${scope}:${id}`;
        if (this.reported.has(key)) return false;
        this.reported.set(key, now);
        return true;
    }

    private prune(now: number) {
        for (const [key, at] of this.self) if (now - at > SELF_WINDOW) this.self.delete(key);
        for (const [key, at] of this.reported) if (now - at > DEDUPE_WINDOW) this.reported.delete(key);
    }
}

export interface FluxLikeAction {
    type: string;
    [key: string]: any;
}

const fallbackUser = (id: string) => `User ${id}`;

export function groupName(channel: ChannelSnapshot, lookup: Pick<Lookup, "userName">) {
    if (channel.name) return channel.name;
    const names = (channel.recipients ?? []).map(id => lookup.userName(id)).filter((n): n is string => !!n);
    return names.length ? names.join(", ") : "a group DM";
}

function groupRemoved(channelId: string, lookup: Lookup, tracker: Tracker, now: number): RelationshipNotification | null {
    const channel = lookup.channel(channelId);
    if (!channel || channel.type !== GROUP_DM) return null;
    if (tracker.consumeSelf("channel", channelId, now)) return null;
    if (!tracker.firstReport("channel", channelId, now)) return null;
    const name = groupName(channel, lookup);
    return { kind: "groupRemoved", id: channelId, name, at: now, text: `You were removed from ${name}` };
}

/** What an action means for you, or null if there's nothing to report */
export function decide(action: FluxLikeAction, lookup: Lookup, tracker: Tracker, now = Date.now()): RelationshipNotification | null {
    switch (action?.type) {
        case "RELATIONSHIP_REMOVE": {
            const rel = action.relationship;
            const id: string | undefined = rel?.id ?? rel?.user?.id;
            if (!id) return null;
            const type = lookup.relationshipType(id) ?? rel?.type;
            if (type !== RelationshipType.FRIEND && type !== RelationshipType.OUTGOING) return null;
            if (tracker.consumeSelf("relationship", id, now)) return null;
            const name = lookup.userName(id) ?? rel?.user?.global_name ?? rel?.user?.username ?? fallbackUser(id);
            return type === RelationshipType.FRIEND
                ? { kind: "friendRemoved", id, name, at: now, text: `${name} removed you as a friend` }
                : { kind: "requestCancelled", id, name, at: now, text: `Your friend request to ${name} was declined or cancelled` };
        }
        case "CHANNEL_DELETE": {
            const id: string | undefined = action.channel?.id;
            return id ? groupRemoved(id, lookup, tracker, now) : null;
        }
        case "CHANNEL_RECIPIENT_REMOVE": {
            const userId: string | undefined = action.user?.id;
            if (!action.channelId || !userId || !lookup.currentUserId || userId !== lookup.currentUserId) return null;
            return groupRemoved(action.channelId, lookup, tracker, now);
        }
        case "GUILD_DELETE": {
            const guild = action.guild;
            const id: string | undefined = guild?.id;
            // Outages send GUILD_DELETE with unavailable: the server comes back on its own
            if (!id || guild.unavailable) return null;
            const known = lookup.guildName(id);
            if (known === undefined) return null;
            if (tracker.consumeSelf("guild", id, now)) return null;
            if (!tracker.firstReport("guild", id, now)) return null;
            return { kind: "serverRemoved", id, name: known, at: now, text: `You were removed from ${known}` };
        }
    }
    return null;
}

/** Recent notifications, newest first, in memory only */
export class NotificationLog {
    private items: readonly RelationshipNotification[] = [];
    private readonly listeners = new Set<() => void>();

    constructor(private limit = 100) { }

    add(entry: RelationshipNotification) {
        this.items = [entry, ...this.items].slice(0, Math.max(1, this.limit));
        this.changed();
    }

    /** Immutable: a new array after every change, so it works as a React snapshot */
    get entries() {
        return this.items;
    }

    clear() {
        if (!this.items.length) return;
        this.items = [];
        this.changed();
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    };

    private changed() {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch { }
        }
    }
}
