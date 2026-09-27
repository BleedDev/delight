import { definePlugin, findStore, React } from "@evi/api";

import { filterVoiceStates, PATCHES, shouldHideMemberRow, shouldHideMessage } from "./filter";
import type { HideOptions, Lookups, MessageLike, RelationshipLike } from "./filter";

/**
 * Discord folds a blocked user's messages into a "N blocked messages" row. This drops them from the
 * channel's message stream instead, the list Discord builds from MessageStore before rendering, so
 * dividers, grouping and scroll anchoring are all computed without them (see PATCHES.stream).
 *
 * Typing indicators need nothing: Discord already leaves blocked and ignored users out of them.
 * Reply previews need nothing either while "Hide replies" is off: Discord shows "Blocked message"
 * (or "Ignored message") in place of the quote by itself.
 *
 * Patched code keeps calling $self after the plugin is turned off until Discord reloads, so every
 * helper does nothing while the plugin isn't running.
 */

const settings = {
    active: {
        type: "boolean",
        label: "Hide blocked messages",
        description: "Turn off to get Discord's collapsed \"blocked messages\" rows back. /hideblocked flips this.",
        default: true,
    },
    ignored: {
        type: "boolean",
        label: "Ignored users too",
        description: "Treat users you ignored like users you blocked.",
        default: true,
    },
    replies: {
        type: "boolean",
        label: "Hide replies to them",
        description: "Also hide messages replying to a hidden user. When off, the reply stays and its quote reads \"Blocked message\".",
        default: false,
    },
    memberList: {
        type: "boolean",
        label: "Hide from the member list",
        description: "Leave them out of a server's member list. Takes effect as the list updates.",
        default: true,
    },
    voice: {
        type: "boolean",
        label: "Hide from voice channels",
        description: "Leave them out of the users listed under voice channels.",
        default: false,
    },
} as const;

let options: HideOptions & { memberList: boolean; voice: boolean; } | undefined;
interface Listenable {
    addChangeListener?(listener: () => void): void;
    removeChangeListener?(listener: () => void): void;
}
let relationships: RelationshipLike & Listenable | undefined;
let referencedStore: Listenable & { getMessageByReference?(ref: unknown): { message?: MessageLike | null; } | undefined; } | undefined;

const lookups: Lookups = {
    get relationships() {
        return relationships;
    },
    referenced: ref => referencedStore?.getMessageByReference?.(ref),
};

/** Bumped whenever what's hidden may have changed; patched components re-render on it */
let version = 0;
const listeners = new Set<() => void>();
function bump() {
    version++;
    listeners.forEach(l => l());
}
function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

function useVersion() {
    return React.useSyncExternalStore(subscribe, () => version);
}

/** Voice lists get a stable array per input and version, so Discord's memos downstream hold */
const voiceCache = new WeakMap<object, { version: number; out: readonly unknown[]; }>();

export default definePlugin({
    settings,

    patches: [PATCHES.stream, PATCHES.memberList, PATCHES.voiceUsers],

    /** Channel stream: skip this message? `collapse` is Discord's own grouping verdict for it */
    hide(message: MessageLike, collapse: unknown) {
        return !!options && shouldHideMessage(message, collapse, lookups, options);
    },

    useVersion,

    hideMember(row: unknown) {
        return !!options?.memberList && shouldHideMemberRow(row, relationships, options);
    },

    useVoiceStates<V extends { user?: { id?: string; } | null; }>(states: readonly V[]): readonly V[] {
        const v = useVersion();
        if (!options?.voice || !Array.isArray(states)) return states;
        const cached = voiceCache.get(states);
        if (cached?.version === v) return cached.out as readonly V[];
        const out = filterVoiceStates(states, relationships, options);
        voiceCache.set(states, { version: v, out });
        return out;
    },

    start(ctx) {
        relationships = findStore("RelationshipStore");
        referencedStore = findStore("ReferencedMessageStore");
        options = { ...ctx.settings.all };
        if (!relationships) ctx.logger.warn("RelationshipStore not found, only Discord's own blocked flags are used");

        // Discord refreshes message records itself when someone is blocked, but the reply check and
        // the lists read the stores directly, so they rebuild on these
        const onRelationships = () => void (options?.active && bump());
        const onReferenced = () => void (options?.active && options.replies && bump());
        relationships?.addChangeListener?.(onRelationships);
        referencedStore?.addChangeListener?.(onReferenced);

        ctx.settings.onChange(values => {
            options = { ...values };
            bump();
        });

        ctx.command({
            name: "hideblocked",
            description: "Toggle hiding blocked users' messages",
            execute() {
                const next = !ctx.settings.get("active");
                ctx.settings.set("active", next);
                return { ephemeral: next ? "Blocked users' messages are hidden." : "Blocked users' messages show as Discord's collapsed rows again." };
            },
        });

        ctx.onDispose(() => {
            relationships?.removeChangeListener?.(onRelationships);
            referencedStore?.removeChangeListener?.(onReferenced);
            options = undefined;
            relationships = undefined;
            referencedStore = undefined;
            bump();
        });
        bump();
    },
});
