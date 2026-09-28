/**
 * The store's front page (GET /v1/store/home on evi.rest): what's trending, what's new this week, and
 * collections Evi's team puts together, Staff picks first. Items are star keys ("plugin:id",
 * "theme:id"), so a client shows only what its own registry lists and a stale home page can't point
 * at something that's gone.
 */
import { isPluginId } from "./store";

/** The collection shown first, as the page's hero */
export const STAFF_PICKS = "staff-picks";
export const MAX_COLLECTIONS = 20;
export const MAX_COLLECTION_ITEMS = 24;

export interface Collection {
    id: string;
    title: string;
    description: string;
    /** "plugin:id" or "theme:id", in the order shown */
    items: string[];
}

export interface StoreHome {
    /** Most stars gained and installs grown over the last week, highest first */
    trending: string[];
    /** First in the store within the last 7 days, newest first */
    fresh: string[];
    collections: Collection[];
    /** When evi.rest worked this out, ms */
    at: number;
}

const ITEM_RE = /^(plugin|theme):([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;
export const isStoreItem = (v: unknown): v is string => typeof v === "string" && ITEM_RE.test(v);

const plainText = (v: unknown, max: number, required: boolean): v is string =>
    typeof v === "string" && v.length <= max && (!required || v.trim().length > 0) && !/[\0-\x08\x0e-\x1f]/.test(v);

/** An admin's collection, cleaned, or why it can't be one */
export function validateCollection(id: string, raw: unknown): { collection: Collection; } | { error: string; } {
    if (!isPluginId(id)) return { error: "A collection id is lowercase letters, digits and dashes" };
    const c = (raw ?? {}) as Record<string, unknown>;
    if (!plainText(c.title, 60, true)) return { error: "title must be 1-60 characters" };
    if (c.description !== undefined && !plainText(c.description, 200, false)) return { error: "description must be at most 200 characters" };
    if (!Array.isArray(c.items) || c.items.length > MAX_COLLECTION_ITEMS || !c.items.every(isStoreItem)) {
        return { error: `items must list at most ${MAX_COLLECTION_ITEMS} store items like "plugin:no-track"` };
    }
    return { collection: { id, title: c.title.trim(), description: ((c.description as string | undefined) ?? "").trim(), items: [...new Set(c.items as string[])] } };
}

/** What a client makes of GET /v1/store/home: anything malformed is dropped, not trusted */
export function parseStoreHome(raw: unknown): StoreHome {
    const h = (raw ?? {}) as Record<string, unknown>;
    const items = (v: unknown) => Array.isArray(v) ? v.filter(isStoreItem).slice(0, 50) : [];
    const collections: Collection[] = [];
    if (Array.isArray(h.collections)) {
        for (const c of h.collections.slice(0, MAX_COLLECTIONS)) {
            const result = validateCollection(String((c as Record<string, unknown>)?.id ?? ""), c);
            if ("collection" in result) collections.push(result.collection);
        }
    }
    return { trending: items(h.trending), fresh: items(h.fresh), collections, at: typeof h.at === "number" ? h.at : 0 };
}

export interface TrendSignal {
    item: string;
    /** Stars given minus stars taken back, last 7 days */
    stars: number;
    /** Installs running it now, and a week ago (from check-ins) */
    activeNow: number;
    activeBefore: number;
}

/**
 * How much something is trending. Stars count most, since starring is a choice; install growth counts
 * relative to its size, so a small plugin that doubled beats a big one that added the same number.
 */
export function trendScore(s: TrendSignal) {
    const growth = s.activeNow - s.activeBefore;
    const relative = growth / Math.max(10, s.activeBefore);
    return s.stars * 5 + Math.max(0, growth) * 0.2 + relative * 5;
}

/** The trending list: only items that actually moved, highest score first */
export function rankTrending(signals: TrendSignal[], limit = 12) {
    return signals
        .map(s => ({ item: s.item, score: trendScore(s) }))
        .filter(s => s.score > 0.5)
        .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item))
        .slice(0, limit)
        .map(s => s.item);
}
