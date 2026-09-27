import type { SourcePatch } from "@evi/api";

/**
 * Pure logic for Hide Blocked Completely: which messages, members and voice users to hide, and the
 * source patches that ask. No Discord or Evi runtime imports, so tests can run all of it against
 * real snippets of Discord's code.
 */

/** Discord's collapsed-row types (the channel stream's item types for "N blocked messages" etc.) */
export const BLOCKED_GROUP = "MESSAGE_GROUP_BLOCKED";
export const IGNORED_GROUP = "MESSAGE_GROUP_IGNORED";

/** MessageTypes.REPLY. Forwards and thread starters also carry a messageReference, but aren't replies. */
export const REPLY_TYPE = 19;

export interface HideOptions {
    /** Master switch, flipped by /hideblocked */
    active: boolean;
    /** Treat ignored users like blocked ones */
    ignored: boolean;
    /** Also hide replies to a hidden user's message */
    replies: boolean;
}

export interface MessageLike {
    id?: string;
    type?: number;
    author?: { id?: string; } | null;
    blocked?: boolean;
    ignored?: boolean;
    messageReference?: { channel_id?: string; message_id?: string; type?: number; } | null;
}

/** The subset of Discord's RelationshipStore we read */
export interface RelationshipLike {
    isBlocked?(userId: string | undefined): boolean;
    isIgnored?(userId: string | undefined): boolean;
    isBlockedForMessage?(message: MessageLike): boolean;
    isIgnoredForMessage?(message: MessageLike): boolean;
}

export interface Lookups {
    relationships?: RelationshipLike;
    /** ReferencedMessageStore.getMessageByReference: `.message` is set once the replied-to message loaded */
    referenced?(reference: NonNullable<MessageLike["messageReference"]>): { message?: MessageLike | null; } | null | undefined;
}

export type HiddenKind = "blocked" | "ignored";

function safe(fn: () => boolean | undefined) {
    try {
        return fn() === true;
    } catch {
        return false;
    }
}

/**
 * Whether a message's author is someone we hide. Discord keeps `blocked` / `ignored` on message
 * records in sync with RelationshipStore; the store is asked too in case a record is stale. Blocked
 * wins over ignored, like Discord's own grouping.
 */
export function hiddenKind(message: MessageLike | null | undefined, rel: RelationshipLike | undefined, options: Pick<HideOptions, "ignored">): HiddenKind | null {
    if (!message) return null;
    const authorId = message.author?.id;
    if (message.blocked || safe(() => rel?.isBlockedForMessage?.(message)) || (authorId != null && safe(() => rel?.isBlocked?.(authorId)))) return "blocked";
    if (!options.ignored) return null;
    if (message.ignored || safe(() => rel?.isIgnoredForMessage?.(message)) || (authorId != null && safe(() => rel?.isIgnored?.(authorId)))) return "ignored";
    return null;
}

/** Whether a user is someone we hide (member list, voice channels) */
export function isHiddenUser(userId: string | null | undefined, rel: RelationshipLike | undefined, options: Pick<HideOptions, "active" | "ignored">) {
    if (!options.active || userId == null) return false;
    return safe(() => rel?.isBlocked?.(userId)) || (options.ignored && safe(() => rel?.isIgnored?.(userId)));
}

/** A reply whose replied-to message is by someone we hide (only once that message has loaded) */
export function repliesToHidden(message: MessageLike, lookups: Lookups, options: Pick<HideOptions, "ignored">) {
    const ref = message.messageReference;
    if (message.type !== REPLY_TYPE || ref?.message_id == null || !lookups.referenced) return false;
    let target: MessageLike | null | undefined;
    try {
        target = lookups.referenced(ref)?.message;
    } catch {
        return false;
    }
    return hiddenKind(target, lookups.relationships, options) != null;
}

/**
 * The decision the patched channel stream asks for every message. `collapse` is what Discord's own
 * grouping returned for it (MESSAGE_GROUP_BLOCKED and friends, or null), so we hide exactly what
 * Discord would have folded into a "N blocked messages" row, and nothing it deliberately keeps.
 * Replies are only hidden when asked; otherwise they stay and Discord itself swaps the quote for
 * "Blocked message".
 */
export function shouldHideMessage(message: MessageLike | null | undefined, collapse: unknown, lookups: Lookups, options: HideOptions) {
    if (!options.active || !message) return false;
    if (collapse === BLOCKED_GROUP) return true;
    if (collapse === IGNORED_GROUP && options.ignored) return true;
    return options.replies && repliesToHidden(message, lookups, options);
}

/** Reference semantics for the stream patch: the messages left once hidden ones are dropped */
export function filterMessages<M extends MessageLike>(messages: Iterable<M>, collapse: (message: M) => unknown, lookups: Lookups, options: HideOptions): M[] {
    const kept: M[] = [];
    for (const message of messages) if (!shouldHideMessage(message, collapse(message), lookups, options)) kept.push(message);
    return kept;
}

/** Member list rows: { type: "MEMBER", user } for members, groups and other rows are never hidden */
export function shouldHideMemberRow(row: unknown, rel: RelationshipLike | undefined, options: Pick<HideOptions, "active" | "ignored">) {
    if (row == null || typeof row !== "object") return false;
    const { type, user } = row as { type?: unknown; user?: { id?: string; }; };
    return type === "MEMBER" && isHiddenUser(user?.id, rel, options);
}

/** Voice channel users ({ user, nick, voiceState }). Returns the same array when nobody is hidden. */
export function filterVoiceStates<V extends { user?: { id?: string; } | null; }>(states: readonly V[], rel: RelationshipLike | undefined, options: Pick<HideOptions, "active" | "ignored">): readonly V[] {
    if (!options.active || !Array.isArray(states) || states.length === 0) return states;
    const kept = states.filter(s => !isHiddenUser(s?.user?.id, rel, options));
    return kept.length === states.length ? states : kept;
}

export const PATCHES = {
    /**
     * The channel's message stream (what the chat list renders: messages, date and unread dividers,
     * "N blocked messages" rows). Each message is skipped before anything is pushed for it, so no
     * date divider is left with nothing under it, the unread divider falls on the next message
     * shown, and messages around a hidden one group as if it was never there. Discord's grouping
     * function (captured from its own call further down) decides what counts as blocked.
     *
     * The memo that builds the stream also gets our version as a dependency (read through a hook,
     * always called), so toggling or changing settings rebuilds the open channel right away.
     */
    stream: {
        find: "\"416cc9_1\"",
        replace: [
            {
                match: /(\.forEach\((\i)=>\{var \i,\i;let \i,\i,\i;)(if\(\i&&\2\.isFirstMessageInForumPost\((\i)\)\)return;[^]{0,1500}?let \i=(\i)\(\4,\2,\i&&\i\);)/,
                with: "$1if($self?.hide?.($2,$5($4,$2,!1)))return;$3",
            },
            {
                match: /(\[\i,\i,\i,\i,\i,\i,\i,\i,\i,\i,\i)(\]\);return\{messages:\i,channelStream:\i,)/,
                with: "$1,$self?.useVersion?.()$2",
            },
        ],
    },
    /** Member list rows. The list keeps its fixed row slots, a hidden member's slot renders nothing. */
    memberList: {
        find: "getFirstApplicationIdOccurrences",
        replace: {
            match: /(renderRow=(\i)=>\{let\{section:\i,row:\i,rowIndex:\i\}=\2,\{channel:\i\}=this\.props,(\i)=this\.getRowProps\(\2\);)/,
            with: "$1if($self?.hideMember?.($3))return null;",
        },
    },
    /** The users listed under a voice channel in the channel list */
    voiceUsers: {
        find: "\"ConnectedVoiceUser\"",
        replace: {
            match: /(collapsedMax:\i=6,[^]{0,200}?=\(0,\i\.\i\)\(\i\.id,)(\i\?\?\i)\)/,
            with: "$1($self?.useVoiceStates?.($2)??$2))",
        },
    },
} satisfies Record<string, SourcePatch>;
