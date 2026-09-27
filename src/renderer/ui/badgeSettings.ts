/**
 * Evi badges in Discord's own badge screens: "Customize your badges" (drag to reorder, hide) and
 * "Your badges" (the badge directory, with levels and progress).
 *
 * Both read BadgeDirectoryStore, Discord's per-user list of badge entries. Ours are added to what it
 * answers, with ids starting "evi-" so nothing of Discord's ever matches them. Hiding and reordering
 * are pending profile changes until the profile is saved; the save is one PATCH to
 * /users/@me/badges/settings with { display_order, hidden_badges }. Ours are taken out of it before it
 * leaves (Discord would refuse them) and saved on evi.rest instead, which shows them to everyone.
 */
import { arrange, BadgePrefs, EVI_PREFIX, oursFromDiscord, splitSettings } from "@shared/badges";
import { DAY, nextSupporterTier, SUPPORTER_TIERS, supportedDays, supporterTier } from "@shared/supporter";

import { Badge, badgeKey, Badges } from "../badges";
import type { PluginContext } from "../plugins/context";
import { PLUGIN_BADGE_PREFIX, ProfileBadges, sameBadges } from "../profileBadges";
import { showToast } from "../toolkit/toasts";
import { findStore, filters } from "../webpack/find";

const SETTINGS_URL = "/users/@me/badges/settings";

/** Discord's badge rarities */
const RARITY = { COMMON: 1, RARE: 2, EPIC: 3, MYTHIC: 5 } as const;
/** Bronze and Silver common, up to Ruby and Prismatic mythic */
const LEVEL_RARITY = [RARITY.COMMON, RARITY.COMMON, RARITY.RARE, RARITY.RARE, RARITY.EPIC, RARITY.EPIC, RARITY.MYTHIC, RARITY.MYTHIC];

/** "3 months", "1 year" */
function span(days: number) {
    // 30-day months, the same as the levels
    if (days < 365) return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? "" : "s"}`;
    const years = Math.round(days / 365);
    return `${years} year${years === 1 ? "" : "s"}`;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** One of ours as a BadgeDirectoryStore entry. A supporter is one entry, with the levels as tiers. */
function toEntry(userId: string, b: Badge) {
    const base = {
        badge_id: EVI_PREFIX + b.key,
        owned: true,
        hidden: b.hidden,
        is_earnable: false,
        simple_icon_url: b.icon,
        simple_icon_raster_url: b.icon,
        complex_icon_static_url: b.icon,
        info_label: b.description || undefined,
        progress: [] as { current: number; threshold: number; }[],
    };
    if (b.key !== "supporter") return { ...base, name: b.name, description: b.description, rarity: RARITY.MYTHIC, tiers: [] };

    const since = Badges.supporterSince(userId) ?? Date.now();
    const days = supportedDays(since);
    const current = supporterTier(since);
    const next = nextSupporterTier(since);
    const tiers = SUPPORTER_TIERS.map((t, i) => {
        const icon = Badges.info(t.badge)?.icon;
        return {
            key: t.badge,
            name: t.name,
            owned: days >= t.days,
            rarity: LEVEL_RARITY[i],
            simple_icon_url: icon,
            complex_icon_static_url: icon,
            milestone_text: t.days ? `${span(t.days)} of support` : "Support Evi",
            requirements: [{ threshold: t.days }],
        };
    });
    return {
        ...base,
        name: "Evi Supporter",
        description: "Supports Evi. The badge levels up the longer they do.",
        rarity: LEVEL_RARITY[SUPPORTER_TIERS.indexOf(current)],
        tiers,
        current_tier: current.badge,
        next_tier: next?.tier.badge,
        obtained_at: iso(since),
        tier_obtained_at: Object.fromEntries(SUPPORTER_TIERS.filter(t => days >= t.days).map(t => [t.badge, iso(since + t.days * DAY)])),
        progress: next ? [{ current: days, threshold: next.tier.days }] : [],
    };
}

/**
 * A plugin's profile badge (ctx.profileBadges) as a directory entry. They describe someone right now
 * (online on desktop, last seen), so they're shown but not earned, and never saved with the order.
 */
function pluginEntry(b: ReturnType<typeof ProfileBadges.forUser>[number]) {
    return {
        badge_id: PLUGIN_BADGE_PREFIX + b.id,
        owned: true,
        hidden: false,
        is_earnable: false,
        name: b.name ?? b.description,
        description: b.description,
        info_label: `Shown by ${b.plugin}, an Evi plugin`,
        rarity: RARITY.COMMON,
        simple_icon_url: b.iconSrc,
        simple_icon_raster_url: b.iconSrc,
        complex_icon_static_url: b.iconSrc,
        tiers: [],
        progress: [],
    };
}

/** Discord's stores, found once: the badge hooks run on every profile render */
let profileSettingsStore: any;
let userStore: any;

/** What someone's arrangement is right now: while you edit your own profile, the unsaved one */
export function currentPrefs(userId: string | undefined, isMe: boolean): BadgePrefs {
    const saved = Badges.prefsFor(userId);
    if (!isMe) return saved;
    const pending = (profileSettingsStore ??= findStore<any>("UserProfileSettingsStore"))?.getPendingChanges?.();
    return {
        order: pending?.pendingBadgeDisplayOrder != null ? oursFromDiscord(pending.pendingBadgeDisplayOrder) : saved.order,
        hidden: pending?.pendingBadgeHiddenBadges != null ? oursFromDiscord(pending.pendingBadgeHiddenBadges).filter((id): id is string => typeof id === "string") : saved.hidden,
    };
}

export function installBadgeSettings(ctx: PluginContext) {
    const me = () => (userStore ??= findStore<any>("UserStore"))?.getCurrentUser?.()?.id as string | undefined;

    // Entries are rebuilt only when our list changes: Discord's hooks compare them by identity
    let cachedVersion = -1;
    const cache = new Map<string, any[]>();
    function entriesFor(userId: string) {
        if (cachedVersion !== Badges.getVersion()) {
            cachedVersion = Badges.getVersion();
            cache.clear();
        }
        let entries = cache.get(userId);
        if (!entries) {
            // You see your hidden ones (to unhide them); others don't
            const list = userId === me() ? Badges.allForUser(userId) : Badges.forUser(userId);
            entries = list.map(b => toEntry(userId, b));
            cache.set(userId, entries);
        }
        return entries;
    }

    // Plugins answer from live state, so theirs are rebuilt only when what they return changes
    const pluginCache = new Map<string, { badges: ReturnType<typeof ProfileBadges.forUser>; entries: ReturnType<typeof pluginEntry>[]; }>();
    function pluginEntriesFor(userId: string) {
        if (!ProfileBadges.size) return [];
        const badges = ProfileBadges.forUser(userId);
        const cached = pluginCache.get(userId);
        if (cached && sameBadges(cached.badges, badges)) return cached.entries;
        const entries = badges.map(pluginEntry);
        if (pluginCache.size >= 200) pluginCache.clear();
        pluginCache.set(userId, { badges, entries });
        return entries;
    }

    ctx.waitFor(filters.byStoreName("BadgeDirectoryStore"), (store: any) => {
        ctx.hook.after(store, "getBadges", ({ args, result }) => {
            const userId: string | undefined = args[0] ?? me();
            if (!userId) return;
            const ours = entriesFor(userId);
            const plugins = pluginEntriesFor(userId);
            if (!ours.length && !plugins.length) return;
            const theirs = Array.isArray(result) ? result : [];
            const arranged = ours.length ? arrange(theirs, ours, e => e.badge_id.slice(EVI_PREFIX.length), e => typeof e?.badge_id === "number" ? e.badge_id : undefined, Badges.prefsFor(userId).order) : theirs;
            return plugins.length ? [...arranged, ...plugins] : arranged;
        });
        ctx.hook.after(store, "getBadgeById", ({ args, result }) => {
            if (result != null || typeof args[0] !== "string" || !args[0].startsWith(EVI_PREFIX)) return;
            const userId: string | undefined = args[1] ?? me();
            if (!userId) return;
            return args[0].startsWith(PLUGIN_BADGE_PREFIX) ? pluginEntriesFor(userId).find(e => e.badge_id === args[0]) : entriesFor(userId).find(e => e.badge_id === args[0]);
        });
        // Discord's screens re-read the store when it changes: tell them when ours do
        ctx.onDispose(Badges.subscribe(() => store.emitChange?.()));
    });

    // The profile save: ours come out of Discord's request and go to evi.rest
    ctx.waitFor(filters.byProps("get", "post", "put", "patch", "del"), (http: any) => {
        ctx.hook.before(http, "patch", ({ args }) => {
            const request = args[0];
            if (!request || typeof request !== "object" || typeof request.url !== "string" || !request.url.endsWith(SETTINGS_URL)) return;
            if (!request.body || typeof request.body !== "object") return;
            const userId = me();
            const { body, prefs } = splitSettings(request.body);
            args[0] = { ...request, body };
            // Only when something of ours is in play: a Discord-only change leaves evi.rest alone
            const touchesOurs = Badges.allForUser(userId).length > 0 || (prefs.hidden?.length ?? 0) > 0;
            if (!userId || !touchesOurs) return;
            // Hidden holds ours only; supporter levels all go by "supporter"
            if (prefs.hidden) prefs.hidden = [...new Set(prefs.hidden.map(badgeKey))];
            void Badges.setPrefs(userId, prefs).then(result => {
                if (!result.ok) showToast(`Couldn’t save your Evi badges: ${result.error}`, { type: "failure" });
            });
        });
    });
}
