import { definePlugin, findStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import { cssVars, paletteKey, paletteOf, parseKey, PATCHES, Place, typerIds } from "./colours";
import { t } from "./strings";

/**
 * People's role colours where Discord leaves names plain: @mentions in messages, the "is typing"
 * line, voice channel members in the channel list and the reactions popout. Only in servers.
 *
 * Source patches (colours.ts) hand each name to wrap(), which puts it in a RoleName: a component of
 * our own that follows GuildMemberStore, so a role change recolours names already on screen. Without
 * a coloured role, or with the place switched off, the name renders exactly as Discord's.
 */

type Settings = typeof settings;
const settings = {
    mentions: { type: "boolean", get label() { return t("settings.mentions"); }, get description() { return t("settings.mentions.description"); }, default: true },
    typing: { type: "boolean", get label() { return t("settings.typing"); }, get description() { return t("settings.typing.description"); }, default: true },
    voice: { type: "boolean", get label() { return t("settings.voice"); }, get description() { return t("settings.voice.description"); }, default: true },
    reactions: { type: "boolean", get label() { return t("settings.reactions"); }, get description() { return t("settings.reactions.description"); }, default: true },
    gradients: { type: "boolean", get label() { return t("settings.gradients"); }, get description() { return t("settings.gradients.description"); }, default: true },
} as const;

let context: PluginContext<Settings> | undefined;

function store(name: string): any {
    try {
        return findStore(name);
    } catch {
        return undefined;
    }
}

function subscribeMembers(onChange: () => void) {
    const members = store("GuildMemberStore");
    members?.addChangeListener?.(onChange);
    return () => members?.removeChangeListener?.(onChange);
}

// The settings, read with a hook that runs on every render: after the plugin stops, a constant
// "nothing on", so names already on screen go back to Discord's without the hook count changing
const OFF = { mentions: false, typing: false, voice: false, reactions: false, gradients: false };
const settingsListeners = new Set<() => void>();
const subscribeSettings = (cb: () => void) => (settingsListeners.add(cb), () => void settingsListeners.delete(cb));
const settingsSnapshot = () => context?.settings.snapshot() ?? OFF;

function RoleName({ place, userId, guildId, children }: { place: Place; userId: string; guildId: string; children: ReactNode; }) {
    const on = React.useSyncExternalStore(subscribeSettings, settingsSnapshot);
    const gradients = on.gradients;
    const key = React.useSyncExternalStore(subscribeMembers, () => paletteKey(paletteOf(store("GuildMemberStore")?.getMember?.(guildId, userId), gradients)));
    const palette = on[place] ? parseKey(key) : null;
    if (!palette) return <>{children}</>;
    return (
        <span
            className={place === "mentions" ? "evi-rc evi-rc-mention" : "evi-rc"}
            data-evi-rc-gradient={palette.secondary ? "" : undefined}
            style={cssVars(palette) as React.CSSProperties}
        >
            {children}
        </span>
    );
}

const idOf = (user: unknown): string | undefined =>
    typeof user === "string" ? user : typeof (user as { id?: unknown; })?.id === "string" ? (user as { id: string; }).id : undefined;

/** A name, in a RoleName when it's someone's in a server */
function wrap(place: Place, name: ReactNode, user: unknown, guildId: string | null | undefined): ReactNode {
    const userId = idOf(user);
    if (!context || !userId || !guildId) return name;
    return <RoleName key={`evi-rc-${userId}`} place={place} userId={userId} guildId={guildId}>{name}</RoleName>;
}

export default definePlugin({
    settings,

    patches: [PATCHES.typing, PATCHES.mention, PATCHES.voice, PATCHES.reactions],

    /** Called by the patches with a name: the same name, in a RoleName when it's in a server */
    wrap,

    /**
     * Called by the patched typing line with the typers' names and its props. Discord's names come
     * from TypingStore in order, so the same filter gives their ids; if it doesn't line up (the store
     * a moment ahead of the line), Discord's names are kept.
     */
    typers(names: unknown, props: { channel?: { id?: string; guild_id?: string | null; }; guildId?: string | null; }) {
        try {
            if (!context || !Array.isArray(names) || !names.length) return;
            const channelId = props?.channel?.id;
            const guildId = props?.guildId ?? props?.channel?.guild_id;
            if (!channelId || !guildId) return;
            const users = store("UserStore");
            const relationships = store("RelationshipStore");
            const ids = typerIds(
                store("TypingStore")?.getTypingUsers?.(channelId),
                users?.getCurrentUser?.()?.id,
                id => !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id)),
                id => !!users?.getUser?.(id),
            );
            if (ids.length !== names.length) return;
            return names.map((name, i) => wrap("typing", name, ids[i], guildId));
        } catch (err) {
            context?.logger.error("Couldn't colour the typing line", err);
        }
    },

    css: `
        /* Readable on the theme: light enough on dark themes, dark enough on the light one */
        .evi-rc { --evi-rc-a: oklch(from var(--evi-rc) max(l, 0.66) c h); color: var(--evi-rc-a); }
        .theme-light .evi-rc { --evi-rc-a: oklch(from var(--evi-rc) min(l, 0.5) c h); }
        .evi-rc[data-evi-rc-gradient] {
            --evi-rc-b: oklch(from var(--evi-rc-2) max(l, 0.66) c h);
            --evi-rc-c: oklch(from var(--evi-rc-3, var(--evi-rc)) max(l, 0.66) c h);
            background-image: linear-gradient(90deg, var(--evi-rc-a), var(--evi-rc-b), var(--evi-rc-c));
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .theme-light .evi-rc[data-evi-rc-gradient] {
            --evi-rc-b: oklch(from var(--evi-rc-2) min(l, 0.5) c h);
            --evi-rc-c: oklch(from var(--evi-rc-3, var(--evi-rc)) min(l, 0.5) c h);
        }

        /* A mention: our span is the pill, tinted with the colour, like Discord's role mentions */
        .mention:has(> .evi-rc-mention) { background: none !important; padding: 0 !important; }
        .evi-rc-mention {
            --evi-rc-tint: color-mix(in oklab, var(--evi-rc) 20%, transparent);
            padding: 0 2px;
            border-radius: 3px;
            font-weight: 500;
            background-color: var(--evi-rc-tint);
            transition: background-color 0.1s;
        }
        .mention:hover > .evi-rc-mention, .evi-rc-mention:hover { --evi-rc-tint: color-mix(in oklab, var(--evi-rc) 34%, transparent); }
        .evi-rc-mention[data-evi-rc-gradient] {
            background-image: linear-gradient(90deg, var(--evi-rc-a), var(--evi-rc-b), var(--evi-rc-c)), linear-gradient(var(--evi-rc-tint), var(--evi-rc-tint));
            -webkit-background-clip: text, padding-box;
            background-clip: text, padding-box;
            background-color: transparent;
        }
    `,

    start(ctx) {
        context = ctx;
        ctx.settings.onChange(() => settingsListeners.forEach(l => l()));
        ctx.onDispose(() => {
            context = undefined;
            settingsListeners.forEach(l => l());
        });
    },
});
