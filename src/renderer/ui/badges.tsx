/**
 * Evi badges, part of the core: always on, not a plugin that can be turned off or removed. Drawn by
 * Discord itself where it can:
 *
 * - Profiles: Discord gets a profile's badges from one hook, `useProfileBadges(displayProfile)`, and
 *   renders `badge.iconSrc ?? cdn(badge.icon)`. Ours go among Discord's in the owner's order (in front,
 *   if they never set one) with an iconSrc, so they get Discord's own sizing, tooltip and layout.
 *   Ones the owner hid are left out.
 * - Discord's badge settings ("Customize your badges", "Your badges"): see badgeSettings.ts.
 * - Chat: the message username takes `decorations[BADGES]`, the elements after the name (role icon,
 *   new member, …). Ours are added to that list.
 *
 * Both are export hooks: no source patches. The /badge command is registered only on an install
 * holding the admin token.
 */
import { arrange, BadgeAdminAction, EVI_PREFIX } from "@shared/badges";
import type { ReactElement } from "react";

import { Badge, Badges } from "../badges";
import { PluginContext } from "../plugins/context";
import { React } from "../webpack/common";
import { filters, findStore } from "../webpack/find";
import { currentPrefs, installBadgeSettings } from "./badgeSettings";
import { DiscordUI } from "./discord";

/** Discord's `(displayProfile, hideLegacyUsername?) => ProfileBadge[]` */
const profileBadgesFilter = filters.byCode("getBadges()??[]", "hidePersonalInformation");
/** Discord's profile badge id ("premium_tenure_12_month_v2") to its badge number, as badge settings order them */
const badgeTypeFilter = filters.byCode(".toUpperCase()]", "\"number\"==typeof");
/** The username in a message header, with decorations = { [SYSTEM_TAG]: …, [BADGES]: [...] } */
const usernameFilter = filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
/** Discord's MessageHeaderDecorations.BADGES */
const BADGES = 1;

const css = `
.evi-chat-badges { display: inline-flex; gap: 4px; margin-inline-start: 4px; vertical-align: -3px; }
.evi-chat-badges img { width: 16px; height: 16px; object-fit: contain; }
.evi-chat-badges[data-compact] { vertical-align: -2px; }
.evi-chat-badges[data-compact] img { width: 14px; height: 14px; }
`;

const tooltip = (b: Badge) => b.description ? `${b.name}: ${b.description}` : b.name;

/** In Discord's profile badge format */
const toProfileBadge = (b: Badge) => ({ id: EVI_PREFIX + b.id, description: tooltip(b), iconSrc: b.icon, eviKey: b.key });

function useUserBadges(userId: string | undefined) {
    React.useSyncExternalStore(Badges.subscribe, Badges.getVersion);
    return Badges.forUser(userId);
}

function ChatBadges({ userId, compact }: { userId: string; compact: boolean; }) {
    const badges = useUserBadges(userId);
    if (!badges.length) return null;
    const Tooltip = DiscordUI.Tooltip.get;
    return (
        <span className="evi-chat-badges" data-compact={compact ? "" : undefined}>
            {badges.map(b => {
                const img = <img src={b.icon} alt={b.name} aria-label={tooltip(b)} draggable={false} />;
                return Tooltip ? <Tooltip key={b.id} text={tooltip(b)}>{img}</Tooltip> : React.cloneElement(img, { key: b.id, title: tooltip(b) });
            })}
        </span>
    );
}

let started: PluginContext | undefined;

/** Starts drawing badges; once, for the life of the page */
export function startBadges() {
    if (started) return;
    const ctx = started = new PluginContext({ id: "evi-badges", name: "Badges" }, {});

    ctx.addStyle(css);
    ctx.onDispose(Badges.use());

    let badgeType: ((id: string) => number | undefined) | undefined;
    ctx.waitFor(badgeTypeFilter, fn => void (badgeType = fn));

    ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
        const userId: string | undefined = args[0]?.userId;
        const isMe = !!userId && userId === findStore<any>("UserStore")?.getCurrentUser?.()?.id;
        // Your own profile follows what you're editing, before it's saved
        const prefs = currentPrefs(userId, isMe);
        const hidden = new Set(prefs.hidden);
        const ours = (isMe ? Badges.allForUser(userId) : Badges.forUser(userId)).filter(b => !hidden.has(b.key));
        // While you edit, Discord's preview adds badges from its directory, ours included: ours are placed here
        const theirs = (Array.isArray(result) ? result : []).filter(b => !(typeof b?.id === "string" && b.id.startsWith(EVI_PREFIX)));
        if (!ours.length) return theirs.length === result?.length ? undefined : theirs;
        return arrange(theirs, ours.map(toProfileBadge), b => b.eviKey, b => typeof b?.id === "string" ? badgeType?.(b.id) : undefined, prefs.order);
    });

    installBadgeSettings(ctx);

    ctx.hookExport("before", usernameFilter, ({ args }) => {
        const props = args[0];
        const userId = props?.message?.author?.id;
        // Only the message's own header: replies pass decorations without a BADGES slot
        if (!userId || !props.decorations || !(BADGES in props.decorations)) return;
        const existing = props.decorations[BADGES];
        const ours: ReactElement = <ChatBadges key="evi-badges" userId={userId} compact={!!props.compact} />;
        args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...(Array.isArray(existing) ? existing : existing != null ? [existing] : []), ours] } };
    });

    // Managing badges: only on an install holding the admin token, which never leaves main
    void Badges.canManage().then(allowed => {
        if (!allowed) return;
        ctx.command({
            name: "badge",
            description: "Manage Evi badges",
            options: [
                {
                    name: "action",
                    description: "What to do",
                    required: true,
                    choices: [
                        { name: "grant: give a badge to someone", value: "grant" },
                        { name: "revoke: take a badge away", value: "revoke" },
                        { name: "create: make a new badge", value: "create" },
                        { name: "delete: remove a badge from everyone", value: "delete" },
                        { name: "list: every badge", value: "list" },
                        { name: "supporter: make someone a supporter", value: "supporter" },
                        { name: "time: give a supporter time (days, negative takes it away)", value: "time" },
                        { name: "unsupport: stop someone being a supporter", value: "unsupport" },
                    ],
                },
                { name: "badge", description: "Badge id, like early-supporter" },
                { name: "user", description: "Who (grant, revoke, supporter, time, unsupport)", type: "user" },
                { name: "days", description: "Days to add, like 30 or -7 (time)", type: "integer" },
                { name: "name", description: "Shown on hover (create)" },
                { name: "icon", description: "Link to a PNG, GIF, JPEG or WebP, 1 MB max (create)" },
                { name: "description", description: "Extra line on hover (create)" },
            ],
            async execute(args) {
                const { action, badge, user, name, icon, description } = args as Record<string, string | undefined>;
                const days = Number(args.days);
                const missing = (...fields: [string, unknown][]) => fields.filter(([, v]) => !v).map(([k]) => k);
                const need = {
                    grant: missing(["badge", badge], ["user", user]),
                    revoke: missing(["badge", badge], ["user", user]),
                    create: missing(["badge", badge], ["name", name], ["icon", icon]),
                    delete: missing(["badge", badge]),
                    list: [],
                    supporter: missing(["user", user]),
                    time: missing(["user", user], ["days", days]),
                    unsupport: missing(["user", user]),
                }[action as "list"] ?? [];
                if (need.length) return { ephemeral: `/badge ${action} needs ${need.join(" and ")}.` };

                const input: BadgeAdminAction = action === "grant" || action === "revoke" ? { action, userId: user!, badgeId: badge! }
                    : action === "create" ? { action, id: badge!, name: name!, description, iconUrl: icon! }
                        : action === "delete" ? { action, id: badge! }
                            : action === "supporter" || action === "unsupport" ? { action, userId: user! }
                                : action === "time" ? { action, userId: user!, days }
                                    : { action: "list" };
                const result = await Badges.manage(input);
                return { ephemeral: result.ok ? result.message : `Couldn’t ${action}: ${result.error}` };
            },
        });
    });
}
