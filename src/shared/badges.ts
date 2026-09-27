/**
 * Evi badges: shown on Discord profiles and next to names in chat, served by evi.rest.
 *
 *   GET /v1/badges  { badges: { "<id>": { name, description, icon } }, users: { "<discord id>": ["<id>", …] } }
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
}

const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\0-\x08\x0e-\x1f]/.test(v);

/** Cleans a server answer: well-formed badges with https icons, and users holding known badges */
export function parseBadges(json: unknown): BadgesDocument | undefined {
    if (!json || typeof json !== "object") return;
    const { badges, users } = json as Record<string, unknown>;
    if (!badges || typeof badges !== "object" || !users || typeof users !== "object") return;

    const clean: BadgesDocument = { badges: Object.create(null), users: Object.create(null) };
    for (const [id, b] of Object.entries(badges as Record<string, any>)) {
        if (!isPluginId(id) || !text(b?.name, 64) || !b.name.trim() || !text(b?.description ?? "", 200) || whyNotStoreUrl(b?.icon)) continue;
        clean.badges[id] = { name: b.name, description: b.description ?? "", icon: b.icon };
    }
    for (const [user, ids] of Object.entries(users as Record<string, unknown>)) {
        if (!isDiscordId(user) || !Array.isArray(ids)) continue;
        const known = ids.filter((id): id is string => typeof id === "string" && id in clean.badges).slice(0, 20);
        if (known.length) clean.users[user] = known;
    }
    return clean;
}

export type BadgesResult = ({ ok: true; } & BadgesDocument) | { ok: false; error: string; };

export type BadgeAdminAction =
    | { action: "list"; }
    | { action: "create"; id: string; name: string; description?: string; iconUrl: string; }
    | { action: "delete"; id: string; }
    | { action: "grant"; userId: string; badgeId: string; }
    | { action: "revoke"; userId: string; badgeId: string; };

export type BadgeAdminResult = { ok: true; message: string; } | { ok: false; error: string; };
