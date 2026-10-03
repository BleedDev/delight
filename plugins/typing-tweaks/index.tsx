import { Components, definePlugin, findStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import { t } from "./strings";

import { MAX_NAMED, nameSlots, PATCHES, typerIds } from "./typing";

/**
 * Who's typing, easier to see:
 *  - the "is typing" line above the chat box gets each typer's avatar, and their name in their role colour;
 *  - channels, threads and DMs in the lists get three dots while someone other than you types there.
 *
 * Source patches hand the line's formatted text and each row's channel to the render functions below.
 * Everything reads TypingStore, which Discord keeps up to date from TYPING_START and TYPING_STOP.
 */

type Settings = typeof settings;
const settings = {
    avatars: { type: "boolean", get label() { return t("settings.avatars"); }, get description() { return t("settings.avatars.description"); }, default: true },
    roleColors: { type: "boolean", get label() { return t("settings.roleColors"); }, get description() { return t("settings.roleColors.description"); }, default: true },
    channels: { type: "boolean", get label() { return t("settings.channels"); }, get description() { return t("settings.channels.description"); }, default: true },
    dms: { type: "boolean", get label() { return t("settings.dms"); }, get description() { return t("settings.dms.description"); }, default: true },
} as const;

let context: PluginContext<Settings> | undefined;

function store(name: string): any {
    try {
        return findStore(name);
    } catch {
        return undefined;
    }
}

const selfId = (): string | undefined => store("UserStore")?.getCurrentUser?.()?.id;

function isHidden(id: string) {
    const relationships = store("RelationshipStore");
    return !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id));
}

function typersIn(channelId: string) {
    const users = store("UserStore");
    return typerIds(store("TypingStore")?.getTypingUsers?.(channelId), selfId(), isHidden, id => !!users?.getUser?.(id));
}

function subscribeTyping(onChange: () => void) {
    const typing = store("TypingStore");
    typing?.addChangeListener?.(onChange);
    return () => typing?.removeChangeListener?.(onChange);
}

function displayName(id: string, guildId?: string) {
    const user = store("UserStore")?.getUser?.(id);
    const nick = guildId ? store("GuildMemberStore")?.getNick?.(guildId, id) : undefined;
    return nick ?? user?.globalName ?? user?.username ?? t("someone");
}

function TypingName({ userId, guildId, children }: { userId: string; guildId?: string; children: ReactNode; }) {
    const { avatars, roleColors } = context!.settings.use();
    const color = roleColors && guildId ? store("GuildMemberStore")?.getMember?.(guildId, userId)?.colorString : undefined;
    const avatar = avatars ? store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId, 32) : undefined;
    return (
        <span className="evi-typing-name" style={color ? { color } : undefined}>
            {avatar && <img className="evi-typing-avatar" src={avatar} alt="" draggable={false} />}
            {children}
        </span>
    );
}

/** The dots' tooltip on a channel, in Discord's language: "Ada is typing", "Ada and Bo are typing"... */
function typingText(names: string[]): string {
    const [a, b, c] = names;
    if (names.length === 1) return t("typing.one", { a });
    if (names.length === 2) return t("typing.two", { a, b });
    if (names.length === 3) return t("typing.three", { a, b, c });
    return t("typing.many", { a, b, count: names.length - 2 });
}

function TypingIndicator({ channelId, guildId }: { channelId: string; guildId?: string; }) {
    // The ids, not the store's object, so a change elsewhere doesn't re-render every row
    const ids = React.useSyncExternalStore(subscribeTyping, () => typersIn(channelId).join(","));
    if (!ids) return null;

    const label = typingText(ids.split(",").map(id => displayName(id, guildId)));
    const dots = (
        <span className="evi-typing-dots" role="img" aria-label={label}>
            <span /><span /><span />
        </span>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={label} position="top">{dots}</Tooltip> : dots;
}

export default definePlugin({
    settings,

    patches: [PATCHES.typingLine, PATCHES.channel, PATCHES.thread, PATCHES.dm],

    /**
     * Called by the patched typing line with its visible text (Discord's formatted parts, a name per
     * bold part), whether that's the names (not "Multiple people", which Discord shows when they don't
     * fit) and the line's props. Undefined keeps Discord's text.
     */
    renderTypingText(text: unknown, named: boolean, props: { typingUsers?: unknown[]; channel?: { id: string; guild_id?: string; }; guildId?: string; }) {
        try {
            if (!context || !named || !Array.isArray(text) || !props?.channel?.id) return;
            const { avatars, roleColors } = context.settings.all;
            if (!avatars && !roleColors) return;
            const count = props.typingUsers?.length ?? 0;
            if (!count || count > MAX_NAMED) return;

            const ids = typersIn(props.channel.id);
            const slots = nameSlots(text);
            // Not the names Discord drew (a store a moment ahead of the line): leave it be
            if (slots.length !== ids.length || ids.length !== count) return;

            const guildId = props.guildId ?? props.channel.guild_id ?? undefined;
            return text.map((part, i) => {
                const slot = slots.indexOf(i);
                return slot === -1
                    ? <React.Fragment key={i}>{part}</React.Fragment>
                    : <TypingName key={i} userId={ids[slot]} guildId={guildId}>{part}</TypingName>;
            });
        } catch (err) {
            context?.logger.error("Couldn't draw the typing line", err);
        }
    },

    /** Called by the patched channel, thread and DM rows with their channel */
    renderIndicator(channel: { id?: string; guild_id?: string; } | undefined, kind: "channel" | "dm") {
        try {
            if (!context || !channel?.id) return null;
            if (!context.settings.get(kind === "dm" ? "dms" : "channels")) return null;
            return <TypingIndicator key="evi-typing" channelId={channel.id} guildId={channel.guild_id ?? undefined} />;
        } catch (err) {
            context?.logger.error("Couldn't draw the typing dots", err);
            return null;
        }
    },

    css: `
        .evi-typing-name { display: inline-flex; align-items: baseline; gap: 4px; }
        .evi-typing-name > strong, .evi-typing-name > b { color: inherit; }
        .evi-typing-avatar { align-self: center; inline-size: 16px; block-size: 16px; border-radius: 50%; object-fit: cover; }
        .evi-typing-dots { display: inline-flex; flex: none; align-items: center; gap: 2px; margin-inline: 4px;
            color: var(--interactive-normal, var(--interactive-text-default, #b5bac1)); }
        .evi-typing-dots > span { inline-size: 4px; block-size: 4px; border-radius: 50%; background: currentColor; opacity: 0.4; }
        @media (prefers-reduced-motion: no-preference) {
            .evi-typing-dots > span { animation: evi-typing-dot 1.2s ease-in-out infinite; }
            .evi-typing-dots > span:nth-child(2) { animation-delay: 0.15s; }
            .evi-typing-dots > span:nth-child(3) { animation-delay: 0.3s; }
        }
        @keyframes evi-typing-dot { 0%, 60%, 100% { opacity: 0.4; transform: none; } 30% { opacity: 1; transform: translateY(-2px); } }
    `,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));
    },
});
