/**
 * Evi badges: shown on Discord profiles, served by evi.rest.
 *
 *   GET /v1/badges         { badges: { "<id>": { name, description, icon } }, users: { "<discord id>": ["<id>", …] },
 *                            supporters: { "<discord id>": <since, ms> },
 *                            prefs: { "<discord id>": { order: [22, "developer", 1], hidden: ["developer"] } } }
 *   GET /v1/badges/events  Server-Sent Events: `badges` with { etag } on connect and whenever the list changes
 */
import { isPluginId, whyNotStoreUrl } from "./store";

export const isDiscordId = (id: unknown): id is string => typeof id === "string" && /^\d{17,20}$/.test(id);

export interface BadgeInfo {
    name: string;
    description: string;
    /** https URL from the server; a data: URL once main has fetched it for the page */
    icon: string;
}

export interface BadgesDocument {
    badges: Record<string, BadgeInfo>;
    users: Record<string, string[]>;
    /** Supporters: since when (ms), for "Supporting Evi since …" on their level badge */
    supporters: Record<string, number>;
    /** How people arranged their badges in Discord's badge settings */
    prefs: Record<string, BadgePrefs>;
}

/**
 * Someone's own arrangement. order mixes Discord's badge ids (numbers) with ours (strings), the way
 * Discord's "Customize your badges" orders them; hidden is ours they don't want others to see. A
 * supporter hides "supporter", whatever their level.
 */
export interface BadgePrefs {
    order: (number | string)[];
    hidden: string[];
}

/** Ours, as Discord's badge settings hold them: "evi-developer", "evi-supporter" */
export const EVI_PREFIX = "evi-";
/** Plugins' badges in Discord's badge directory (renderer/profileBadges.ts): saved nowhere */
export const PLUGIN_PREFIX = "evi-plugin-";

type Order = (number | string)[];

/**
 * Puts ours among Discord's in someone's order. Discord's keep their own order; each of ours goes in
 * front of the first of Discord's that comes after it. With no order saved, ours go first.
 */
export function arrange<T>(theirs: T[], ours: T[], oursKey: (item: T) => string, typeOf: (item: T) => number | undefined, order: Order): T[] {
    if (!ours.length) return theirs;
    if (!order.length) return [...ours, ...theirs];
    const at = new Map(order.map((id, i) => [id, i]));
    const pending = ours.map((item, i) => ({ item, pos: at.get(oursKey(item)) ?? -1, i })).sort((a, b) => a.pos - b.pos || a.i - b.i);
    const out: T[] = [];
    for (const item of theirs) {
        const type = typeOf(item);
        const pos = type === undefined ? undefined : at.get(type);
        if (pos !== undefined) while (pending.length && pending[0].pos < pos) out.push(pending.shift()!.item);
        out.push(item);
    }
    return [...out, ...pending.map(p => p.item)];
}

/** The badges settings hold ours as "evi-<key>": back to our keys, Discord's numbers as they are */
export function oursFromDiscord(ids: unknown): Order {
    return (Array.isArray(ids) ? ids : [...(ids as Iterable<unknown> ?? [])]).flatMap((id): Order =>
        typeof id === "number" ? [id] : typeof id === "string" && id.startsWith(EVI_PREFIX) && !id.startsWith(PLUGIN_PREFIX) ? [id.slice(EVI_PREFIX.length)] : []);
}

/** A PATCH body for the badge settings, without ours; and what of it is ours */
export function splitSettings(body: Record<string, unknown>): { body: Record<string, unknown>; prefs: Partial<BadgePrefs>; } {
    const prefs: Partial<BadgePrefs> = {};
    const next = { ...body };
    const discordOnly = (ids: unknown) => (Array.isArray(ids) ? ids : [...(ids as Iterable<unknown> ?? [])]).filter(id => !(typeof id === "string" && id.startsWith(EVI_PREFIX)));
    if (body.display_order != null) {
        prefs.order = oursFromDiscord(body.display_order);
        next.display_order = discordOnly(body.display_order);
    }
    if (body.hidden_badges != null) {
        prefs.hidden = oursFromDiscord(body.hidden_badges).filter((id): id is string => typeof id === "string");
        next.hidden_badges = discordOnly(body.hidden_badges);
    }
    return { body: next, prefs };
}

export type BadgePrefsResult = { ok: true; } | { ok: false; error: string; };

const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\0-\x08\x0e-\x1f]/.test(v);

/** Cleans a server answer: well-formed badges with https icons, and users holding known badges */
export function parseBadges(json: unknown): BadgesDocument | undefined {
    if (!json || typeof json !== "object") return;
    const { badges, users, supporters, prefs } = json as Record<string, unknown>;
    if (!badges || typeof badges !== "object" || !users || typeof users !== "object") return;

    const clean: BadgesDocument = { badges: Object.create(null), users: Object.create(null), supporters: Object.create(null), prefs: Object.create(null) };
    for (const [id, b] of Object.entries(badges as Record<string, any>)) {
        if (!isPluginId(id) || !text(b?.name, 64) || !b.name.trim() || !text(b?.description ?? "", 200) || whyNotStoreUrl(b?.icon)) continue;
        clean.badges[id] = { name: b.name, description: b.description ?? "", icon: b.icon };
    }
    for (const [user, ids] of Object.entries(users as Record<string, unknown>)) {
        if (!isDiscordId(user) || !Array.isArray(ids)) continue;
        const known = ids.filter((id): id is string => typeof id === "string" && id in clean.badges).slice(0, 20);
        if (known.length) clean.users[user] = known;
    }
    // Older servers don't send it
    if (supporters && typeof supporters === "object") {
        for (const [user, since] of Object.entries(supporters as Record<string, unknown>)) {
            if (clean.users[user] && typeof since === "number" && Number.isFinite(since) && since > 0) clean.supporters[user] = since;
        }
    }
    if (prefs && typeof prefs === "object") {
        for (const [user, p] of Object.entries(prefs as Record<string, any>)) {
            if (!clean.users[user] || !p || typeof p !== "object") continue;
            const order = Array.isArray(p.order) ? p.order.filter((v: unknown) => (typeof v === "number" && Number.isSafeInteger(v)) || (typeof v === "string" && isPluginId(v))).slice(0, 64) : [];
            const hidden = Array.isArray(p.hidden) ? p.hidden.filter((v: unknown): v is string => typeof v === "string" && isPluginId(v)).slice(0, 64) : [];
            if (order.length || hidden.length) clean.prefs[user] = { order, hidden };
        }
    }
    return clean;
}

/** The `badges` events in an SSE chunk, as the etag each one carries */
export function parseBadgeEvents(block: string): string[] {
    const etags: string[] = [];
    for (const event of block.split(/\r?\n\r?\n/)) {
        let name = "message", data = "";
        for (const line of event.split(/\r?\n/)) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (name !== "badges" || !data) continue;
        try {
            const { etag } = JSON.parse(data);
            if (typeof etag === "string") etags.push(etag);
        } catch { }
    }
    return etags;
}

export type BadgesResult = ({ ok: true; } & BadgesDocument) | { ok: false; error: string; };

export type BadgeAdminAction =
    | { action: "list"; }
    | { action: "create"; id: string; name: string; description?: string; iconUrl: string; }
    | { action: "delete"; id: string; }
    | { action: "grant"; userId: string; badgeId: string; }
    | { action: "revoke"; userId: string; badgeId: string; }
    | { action: "supporter"; userId: string; }
    | { action: "time"; userId: string; days: number; }
    | { action: "unsupport"; userId: string; };

export type BadgeAdminResult = { ok: true; message: string; } | { ok: false; error: string; };
