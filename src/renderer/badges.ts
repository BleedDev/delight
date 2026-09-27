/**
 * Evi badges in the page: loaded through main (cached copy first, then the live list), refreshed
 * every half hour, looked up by Discord user id. The Badges plugin draws them.
 */
import type { BadgeAdminAction, BadgeAdminResult, BadgesDocument } from "@shared/badges";

import { Logger } from "./logger";
import { Native } from "./native";

export interface Badge {
    id: string;
    name: string;
    description: string;
    /** data: URL */
    icon: string;
}

const logger = new Logger("Badges", "#f0b232");
const listeners = new Set<() => void>();
const REFRESH_EVERY = 30 * 60 * 1000;
const NONE: readonly Badge[] = Object.freeze([]);

let doc: BadgesDocument = { badges: {}, users: {} };
let byUser = new Map<string, readonly Badge[]>();
let version = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;

function set(next: BadgesDocument) {
    doc = next;
    // Built once per load, so every lookup while rendering is a single Map.get
    byUser = new Map(Object.entries(next.users).map(([user, ids]) => [user, Object.freeze(ids.map(id => ({ id, ...next.badges[id] })))]));
    version++;
    for (const listener of listeners) listener();
}

async function load(cachedOnly = false) {
    const result = await Native.getBadges?.(cachedOnly).catch(err => ({ ok: false as const, error: String(err) }));
    if (!result) return;
    if (result.ok) set({ badges: result.badges, users: result.users });
    else logger.warn(`Badges unavailable: ${result.error}`);
}

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

    /** A user's badges, in the order they were given; the same array until the list changes */
    forUser: (userId: string | undefined): readonly Badge[] => (userId && byUser.get(userId)) || NONE,

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
