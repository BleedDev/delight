/**
 * Evi badges in the page: loaded through main (cached copy first, then the live list), updated the
 * moment evi.rest says they changed, with a poll every few minutes in case that stream is down.
 * Looked up by Discord user id; drawn by the core (ui/badges.tsx), not a plugin.
 *
 * People hide and order their own badges in Discord's badge settings. That arrangement is saved on
 * evi.rest and comes back in the list, so everyone's Evi shows it.
 */
import type { BadgeAdminAction, BadgeAdminResult, BadgeInfo, BadgePrefs, BadgePrefsResult, BadgesDocument, BadgesResult } from "@shared/badges";
import { isSupporterBadge } from "@shared/supporter";

import { Logger } from "./logger";
import { Native } from "./native";

export interface Badge {
    id: string;
    name: string;
    description: string;
    /** data: URL */
    icon: string;
    /** What hiding and ordering go by: "supporter" for every supporter level, otherwise the id */
    key: string;
    /** Hidden by its owner: only shown to them, in Discord's badge settings */
    hidden: boolean;
}

const logger = new Logger("Badges", "#f0b232");
const listeners = new Set<() => void>();
/** Only a fallback: changes normally arrive over main's stream from evi.rest */
const REFRESH_EVERY = 5 * 60 * 1000;
const NONE: readonly Badge[] = Object.freeze([]);
const NO_PREFS: BadgePrefs = Object.freeze({ order: [], hidden: [] }) as BadgePrefs;

let doc: BadgesDocument = { badges: {}, users: {}, supporters: {}, prefs: {} };
/** Everything each user has, hidden too, in their order */
let allByUser = new Map<string, readonly Badge[]>();
/** What others see */
let shownByUser = new Map<string, readonly Badge[]>();
let version = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;

const sinceFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export const badgeKey = (id: string) => isSupporterBadge(id) ? "supporter" : id;

function set(next: BadgesDocument) {
    doc = next;
    // Built once per load, so every lookup while rendering is a single Map.get
    allByUser = new Map();
    shownByUser = new Map();
    for (const [user, ids] of Object.entries(next.users)) {
        const prefs = next.prefs[user] ?? NO_PREFS;
        const hidden = new Set(prefs.hidden);
        const position = new Map(prefs.order.map((id, i) => [id, i]));
        const since = next.supporters[user];
        const list = ids.map((id): Badge => {
            const key = badgeKey(id);
            // A supporter's level says since when, like Discord's Nitro badge
            const description = since && key === "supporter" ? `Supporting Evi since ${sinceFormat.format(since)}` : next.badges[id].description;
            return { id, ...next.badges[id], description, key, hidden: hidden.has(key) };
        });
        // Their order where they set one; the rest stay in the order they were given, in front
        const at = (b: Badge) => position.get(b.key) ?? -1;
        const ordered = list.map((b, i) => ({ b, i })).sort((x, y) => at(x.b) - at(y.b) || x.i - y.i).map(x => x.b);
        allByUser.set(user, Object.freeze(ordered));
        const shown = ordered.filter(b => !b.hidden);
        if (shown.length) shownByUser.set(user, Object.freeze(shown));
    }
    version++;
    for (const listener of listeners) listener();
}

function apply(result: BadgesResult | undefined) {
    if (!result) return;
    if (result.ok) set({ badges: result.badges, users: result.users, supporters: result.supporters ?? {}, prefs: result.prefs ?? {} });
    else logger.warn(`Badges unavailable: ${result.error}`);
}

async function load(cachedOnly = false) {
    apply(await Native.getBadges?.(cachedOnly).catch(err => ({ ok: false as const, error: String(err) })));
}

// Pushed by main whenever evi.rest's list changes
Native?.onBadgesChange?.(result => {
    if (users > 0) apply(result);
});

export const Badges = {
    /** Starts loading and refreshing while something uses badges; returns the matching stop */
    use() {
        if (users++ === 0) {
            // The cached copy shows right away, the live list replaces it when it arrives
            void load(true).then(() => load());
            timer = setInterval(() => void load(), REFRESH_EVERY);
        }
        return () => {
            if (--users === 0) {
                clearInterval(timer);
                timer = undefined;
            }
        };
    },

    refresh: () => load(),

    /** The badges others see on a user, in their order; the same array until the list changes */
    forUser: (userId: string | undefined): readonly Badge[] => (userId && shownByUser.get(userId)) || NONE,

    /** Every badge a user has, hidden ones too: for their own badge settings */
    allForUser: (userId: string | undefined): readonly Badge[] => (userId && allByUser.get(userId)) || NONE,

    /** How a user arranged their badges */
    prefsFor: (userId: string | undefined): BadgePrefs => (userId && doc.prefs[userId]) || NO_PREFS,

    /** Since when a user supports Evi, if they do */
    supporterSince: (userId: string | undefined): number | undefined => userId ? doc.supporters[userId] : undefined,

    /** A badge from the list by id, whoever has it: supporter levels are shown as tiers */
    info: (id: string): BadgeInfo | undefined => doc.badges[id],

    /**
     * Saves how you arranged your badges. Shown straight away, here and (through evi.rest) for
     * everyone; put back if evi.rest refuses, like when this Evi isn't linked to that account.
     */
    async setPrefs(userId: string, prefs: Partial<BadgePrefs>): Promise<BadgePrefsResult> {
        if (!Native.setBadgePrefs) return { ok: false, error: "This Evi can't save badge settings" };
        const before = doc;
        set({ ...doc, prefs: { ...doc.prefs, [userId]: { ...Badges.prefsFor(userId), ...prefs } } });
        const optimistic = doc;
        const result = await Native.setBadgePrefs(userId, prefs).catch(err => ({ ok: false as const, error: String(err) }));
        // Undone only if nothing newer arrived in the meantime
        if (!result.ok && doc === optimistic) set(before);
        return result;
    },

    /** Changes whenever the list does, for useSyncExternalStore */
    getVersion: () => version,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },

    /** Whether this install can manage badges (it has an admin token) */
    canManage: () => Native.badgeAdminAvailable?.() ?? Promise.resolve(false),

    async manage(input: BadgeAdminAction): Promise<BadgeAdminResult> {
        if (!Native.badgeAdmin) return { ok: false, error: "This Evi can't manage badges" };
        const result = await Native.badgeAdmin(input);
        if (result.ok && input.action !== "list") void load();
        return result;
    },
};
