/**
 * Evi badges, part of the core: always on, not a plugin that can be turned off or removed. Drawn by
 * Discord itself where it can:
 *
 * - Profiles: Discord gets a profile's badges from one hook, `useProfileBadges(displayProfile)`, and
 *   renders `badge.iconSrc ?? cdn(badge.icon)`. Ours go among Discord's in the owner's order (in front,
 *   if they never set one) with an iconSrc, so they get Discord's own sizing, tooltip and layout.
 *   Ones the owner hid are left out.
 * - Discord's badge settings ("Customize your badges", "Your badges"): see badgeSettings.ts.
 *
 * Only on profiles, like Discord's own: nothing next to names in chat. Export hooks, no source
 * patches. The /badge command is registered only on an install holding the admin token.
 */
import { arrange, BadgeAdminAction, EVI_PREFIX } from "@shared/badges";

import { Badge, badgeKey, Badges } from "../badges";
import { PluginContext } from "../plugins/context";
import { ProfileBadges, sameBadges } from "../profileBadges";
import { filters, findStore } from "../webpack/find";
import { currentPrefs, installBadgeSettings } from "./badgeSettings";

/** Discord's `(displayProfile, hideLegacyUsername?) => ProfileBadge[]` */
const profileBadgesFilter = filters.byCode("getBadges()??[]", "hidePersonalInformation");
/**
 * Discord's profile badge id ("premium_tenure_12_month_v2") to its badge number, as badge settings order
 * them. While you edit your profile, the preview uses it to tell which directory badges are already
 * shown and adds the rest.
 */
const badgeTypeFilter = filters.byCode(".toUpperCase()]", "\"number\"==typeof");

/** One line, like Discord's: the name, or for a supporter since when (like Nitro's "Subscriber since …") */
const tooltip = (b: Badge) => b.key === "supporter" && b.description ? b.description : b.name;

/** In Discord's profile badge format */
const toProfileBadge = (b: Badge) => ({ id: EVI_PREFIX + b.id, description: tooltip(b), iconSrc: b.icon, eviKey: b.key });

let started: PluginContext | undefined;

/** Starts drawing badges; once, for the life of the page */
export function startBadges() {
    if (started) return;
    const ctx = started = new PluginContext({ id: "evi-badges", name: "Badges" }, {});

    ctx.onDispose(Badges.use());

    let badgeType: ((id: string) => number | undefined) | undefined;
    ctx.waitFor(badgeTypeFilter, fn => void (badgeType = fn));
    // Ours ("evi-supporter-gold") to their directory id ("evi-supporter"): without it the preview
    // doesn't know they're shown, and draws them twice
    ctx.hookExport("after", badgeTypeFilter, ({ args, result }) => {
        const id = args[0];
        if (result !== undefined || typeof id !== "string" || !id.startsWith(EVI_PREFIX)) return;
        return EVI_PREFIX + badgeKey(id.slice(EVI_PREFIX.length));
    });

    // Discord's badge row compares the list by identity: while nothing changed, the same array goes back
    const last = new Map<string, any[]>();
    const stable = (userId: string | undefined, badges: any[]) => {
        if (!userId) return badges;
        const previous = last.get(userId);
        if (previous && sameBadges(previous, badges)) return previous;
        if (last.size >= 200) last.clear();
        last.set(userId, badges);
        return badges;
    };

    let userStore: any;
    ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
        const userId: string | undefined = args[0]?.userId;
        const isMe = !!userId && userId === (userStore ??= findStore<any>("UserStore"))?.getCurrentUser?.()?.id;
        // Your own profile follows what you're editing, before it's saved
        const prefs = currentPrefs(userId, isMe);
        const hidden = new Set(prefs.hidden);
        const ours = (isMe ? Badges.allForUser(userId) : Badges.forUser(userId)).filter(b => !hidden.has(b.key));
        // Discord's preview may pass ours back in while you edit: ours are placed here
        const theirs = (Array.isArray(result) ? result : []).filter(b => !(typeof b?.id === "string" && b.id.startsWith(EVI_PREFIX)));
        // Plugins' badges (ctx.profileBadges) go after everything else
        const plugins = userId ? ProfileBadges.forUser(userId).map(b => ({ id: EVI_PREFIX + b.id, description: b.description, iconSrc: b.iconSrc, ...b.link && { link: b.link } })) : [];
        if (!ours.length && !plugins.length) return theirs.length === result?.length ? undefined : theirs;
        const arranged = ours.length ? arrange(theirs, ours.map(toProfileBadge), b => b.eviKey, b => typeof b?.id === "string" ? badgeType?.(b.id) : undefined, prefs.order) : theirs;
        return stable(userId, plugins.length ? [...arranged, ...plugins] : arranged);
    });

    installBadgeSettings(ctx);

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
