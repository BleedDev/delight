/**
 * Linking this install to an Evi account (a Discord login on the website), so its stars follow the
 * person to every install they link. Shared by main, the preload and the renderer.
 *
 *   POST /v1/link/start   { code, url }   a code to confirm on the site, which `url` opens
 *   GET  /v1/link         { linked, user }
 */

export interface AccountUser {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
}

/** `site` is the website the API belongs to, where the dashboard is */
export type AccountStatus = { ok: true; user: AccountUser | null; site: string; } | { ok: false; error: string; };
export type AccountLinkResult = { ok: true; code: string; } | { ok: false; error: string; };

export function parseAccountUser(json: unknown): AccountUser | null {
    const u = (json as { user?: any; } | null)?.user;
    if (!u || typeof u.id !== "string" || !/^\d{17,20}$/.test(u.id) || typeof u.username !== "string") return null;
    return {
        id: u.id,
        username: u.username.slice(0, 64),
        globalName: typeof u.globalName === "string" ? u.globalName.slice(0, 64) : null,
        // Discord avatar hashes only, so the image URL can't point anywhere but Discord's CDN
        avatar: typeof u.avatar === "string" && /^(a_)?[0-9a-f]{32}$/.test(u.avatar) ? u.avatar : null,
    };
}
