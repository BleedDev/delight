/**
 * What the message logger remembers, in memory only. Pure: no Discord, no DOM, so it's unit tested.
 *
 * Entries are immutable: every change replaces the entry object, so `get` doubles as a snapshot for
 * React's useSyncExternalStore. Both channels and the entries inside a channel are kept in order of
 * last activity, and the oldest are evicted past the limits. Evicting a deleted message is reported
 * to the caller, which then really deletes it from Discord: a deleted message we stop tracking must
 * not stay in the chat looking like a live one.
 */

export interface PreviousVersion {
    content: string;
    /** When this version was posted (ms), the message's creation or edit time */
    timestamp: number;
}

export interface LoggedMessage {
    channelId: string;
    id: string;
    /** When the delete arrived (ms), undefined while the message still exists */
    deletedAt?: number;
    /** Older versions of the content, oldest first */
    edits: readonly PreviousVersion[];
}

export interface LogLimits {
    /** Logged messages per channel */
    perChannel: number;
    /** Channels with logged messages */
    channels: number;
    /** Previous versions per message. The original is always kept, the oldest edits after it go first */
    edits: number;
}

export interface MessageRef {
    channelId: string;
    id: string;
}

export const DEFAULT_LIMITS: LogLimits = { perChannel: 50, channels: 100, edits: 10 };

/** The parts of Discord's MessageRecord the filters look at */
export interface MessageLike {
    author?: { id?: string; bot?: boolean; } | null;
    flags?: number;
    state?: string;
}

export interface LogFilters {
    currentUserId?: string;
    ignoreSelf: boolean;
    ignoreBots: boolean;
}

const EPHEMERAL = 1 << 6;

/**
 * Whether a message is worth logging at all. Ephemeral messages ("Only you can see this") and
 * messages that never finished sending are always left alone: Discord deletes those locally.
 */
export function shouldLog(message: MessageLike, filters: LogFilters) {
    if ((message.flags ?? 0) & EPHEMERAL) return false;
    if (message.state === "SENDING" || message.state === "SEND_FAILED") return false;
    if (filters.ignoreSelf && !!filters.currentUserId && message.author?.id === filters.currentUserId) return false;
    if (filters.ignoreBots && message.author?.bot) return false;
    return true;
}

export class MessageLog {
    private readonly channels = new Map<string, Map<string, LoggedMessage>>();
    private readonly listeners = new Set<() => void>();
    private limits: LogLimits;
    /** Bumped on every change, a cheap snapshot for summaries */
    version = 0;

    constructor(limits: Partial<LogLimits> = {}) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
    }

    get(channelId: string, id: string): LoggedMessage | undefined {
        return this.channels.get(channelId)?.get(id);
    }

    isDeleted(channelId: string, id: string) {
        return this.get(channelId, id)?.deletedAt !== undefined;
    }

    /** Marks a message deleted. Returns deleted messages evicted to make room. */
    markDeleted(channelId: string, id: string, at = Date.now()): MessageRef[] {
        const previous = this.get(channelId, id);
        if (previous?.deletedAt !== undefined) return [];
        return this.put({ channelId, id, edits: previous?.edits ?? [], deletedAt: at });
    }

    /** Records the version a message had before an edit. Returns deleted messages evicted to make room. */
    addEdit(channelId: string, id: string, version: PreviousVersion): MessageRef[] {
        const previous = this.get(channelId, id);
        const edits = [...previous?.edits ?? [], version];
        // Keep the original, drop the oldest edits after it
        while (edits.length > Math.max(1, this.limits.edits)) edits.splice(1, 1);
        return this.put({ channelId, id, deletedAt: previous?.deletedAt, edits });
    }

    /** Forgets one message, e.g. once it's really gone from Discord */
    remove(channelId: string, id: string) {
        const channel = this.channels.get(channelId);
        if (!channel?.delete(id)) return;
        if (!channel.size) this.channels.delete(channelId);
        this.changed();
    }

    /** Applies new limits. Returns deleted messages evicted by them. */
    setLimits(limits: Partial<LogLimits>): MessageRef[] {
        this.limits = { ...this.limits, ...limits };
        const evicted: MessageRef[] = [];
        for (const [channelId, channel] of this.channels) {
            for (const [id, entry] of channel) {
                if (entry.edits.length <= Math.max(1, this.limits.edits)) continue;
                const edits = [...entry.edits];
                while (edits.length > Math.max(1, this.limits.edits)) edits.splice(1, 1);
                channel.set(id, { ...entry, edits });
            }
            evicted.push(...this.trimChannel(channelId, channel));
        }
        evicted.push(...this.trimChannels());
        this.changed();
        return evicted;
    }

    /** Every deleted message currently kept, grouped by channel */
    deleted(): Map<string, string[]> {
        const out = new Map<string, string[]>();
        for (const [channelId, channel] of this.channels) {
            const ids = [...channel.values()].filter(e => e.deletedAt !== undefined).map(e => e.id);
            if (ids.length) out.set(channelId, ids);
        }
        return out;
    }

    /** Forgets everything. Returns the deleted messages that were kept. */
    clear(): MessageRef[] {
        const deleted = [...this.deleted()].flatMap(([channelId, ids]) => ids.map(id => ({ channelId, id })));
        const had = this.channels.size > 0;
        this.channels.clear();
        if (had) this.changed();
        return deleted;
    }

    counts() {
        let deleted = 0;
        let edited = 0;
        for (const channel of this.channels.values()) {
            for (const entry of channel.values()) {
                if (entry.deletedAt !== undefined) deleted++;
                if (entry.edits.length) edited++;
            }
        }
        return { deleted, edited, channels: this.channels.size };
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    };

    private put(entry: LoggedMessage): MessageRef[] {
        let channel = this.channels.get(entry.channelId);
        if (channel) {
            // Re-insert so both maps stay in order of last activity
            this.channels.delete(entry.channelId);
            channel.delete(entry.id);
        } else {
            channel = new Map();
        }
        this.channels.set(entry.channelId, channel);
        channel.set(entry.id, entry);

        const evicted = [...this.trimChannel(entry.channelId, channel), ...this.trimChannels()];
        this.changed();
        return evicted;
    }

    private trimChannel(channelId: string, channel: Map<string, LoggedMessage>): MessageRef[] {
        const evicted: MessageRef[] = [];
        for (const [id, entry] of channel) {
            if (channel.size <= Math.max(1, this.limits.perChannel)) break;
            channel.delete(id);
            if (entry.deletedAt !== undefined) evicted.push({ channelId, id });
        }
        return evicted;
    }

    private trimChannels(): MessageRef[] {
        const evicted: MessageRef[] = [];
        for (const [channelId, channel] of this.channels) {
            if (this.channels.size <= Math.max(1, this.limits.channels)) break;
            this.channels.delete(channelId);
            for (const entry of channel.values()) if (entry.deletedAt !== undefined) evicted.push({ channelId, id: entry.id });
        }
        return evicted;
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
