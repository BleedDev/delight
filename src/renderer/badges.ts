/**
 * Evi badges in the page: loaded through main (cached copy first, then the live list), updated the
 * moment evi.rest says they changed, with a poll every few minutes in case that stream is down.
 * Looked up by Discord user id; drawn by the core (ui/badges.tsx), not a plugin.
 *
 * People hide and order their own badges in Discord's badge settings. That arrangement is saved on
 * evi.rest and comes back in the list, so everyone's Evi shows it.
 */
import type { BadgeAdminAction, BadgeAdminResult, BadgeInfo, BadgePrefs, BadgePrefsResult, BadgesDocument, BadgesResult } from "@shared/badges";
import type { EviKey } from "@shared/locales";
import { isSupporterBadge } from "@shared/supporter";

import { I18n, t } from "./i18n";
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
let stopLocale: (() => void) | undefined;

const sinceDate = (since: number) => new Intl.DateTimeFormat(I18n.discordLocale, { month: "short", day: "numeric", year: "numeric" }).format(since);

/** A supporter level's name in Discord's language: "Gold" */
export const levelName = (badgeId: string) => t(`badge.level.${badgeId.slice("supporter-".length)}` as EviKey);

/** The badges Evi's own code knows get their name and line in Discord's language; the rest are as evi.rest has them */
function localized(id: string, info: BadgeInfo): BadgeInfo {
    if (id === "plugin-author") return { ...info, name: t("badge.pluginAuthor.name"), description: t("badge.pluginAuthor.description") };
    if (isSupporterBadge(id)) return { ...info, name: t("badge.supporterLevel", { level: levelName(id) }), description: t("badge.supporter.description") };
    return info;
}

export const badgeKey = (id: string) => isSupporterBadge(id) ? "supporter" : id;

/** Supporter badges in their supporter's own colour, by colour and icon, drawn once each */
const tinted = new Map<string, string>();
const tinting = new Set<string>();

/**
 * The icon recoloured, keeping its shading: the colour blend takes the hue and saturation of `color`
 * and the lightness of the icon, then the icon's own shape cuts it back out. Undefined until it's drawn
 * (a moment, once); the list is rebuilt when it is.
 */
function tintedIcon(icon: string, color: string): string | undefined {
    const key = `${color}|${icon}`;
    const done = tinted.get(key);
    if (done || tinting.has(key)) return done;
    tinting.add(key);
    void (async () => {
        try {
            const img = new Image();
            img.src = icon;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            ctx.globalCompositeOperation = "color";
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(img, 0, 0);
            tinted.set(key, canvas.toDataURL("image/png"));
            set(doc);
        } catch (err) {
            logger.warn("Couldn't colour a supporter badge", err);
        }
    })();
}

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
            const info = localized(id, next.badges[id]);
            const description = since && key === "supporter" ? t("badge.supportingSince", { date: sinceDate(since) }) : info.description;
            // Their own colour, once it's drawn; their level's until then
            const icon = key === "supporter" && prefs.color ? tintedIcon(info.icon, prefs.color) ?? info.icon : info.icon;
            return { id, ...info, icon, description, key, hidden: hidden.has(key) };
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
            // Names and dates are worded in Discord's language: again when it changes
            stopLocale = I18n.subscribe(() => set(doc));
        }
        return () => {
            if (--users === 0) {
                clearInterval(timer);
                timer = undefined;
                stopLocale?.();
                stopLocale = undefined;
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
    async setPrefs(userId: string, prefs: Omit<Partial<BadgePrefs>, "color"> & { color?: string | null; }): Promise<BadgePrefsResult> {
        if (!Native.setBadgePrefs) return { ok: false, error: "This Evi can't save badge settings" };
        const before = doc;
        // A null colour goes back to the level's
        const { color, ...rest } = prefs;
        const next: BadgePrefs = { ...Badges.prefsFor(userId), ...rest };
        if (color) next.color = color;
        else if (color === null) delete next.color;
        set({ ...doc, prefs: { ...doc.prefs, [userId]: next } });
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
