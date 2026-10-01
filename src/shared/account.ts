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
/** `admin`: one of Evi's developers, whose Evi shows the Developers page */
export type AccountStatus = { ok: true; user: AccountUser | null; site: string; admin?: boolean; } | { ok: false; error: string; };
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

/**
 * PUT /v1/me/profile: the linked account's Discord name and avatar, as Evi sees them in Discord right
 * now, so evi.rest (credits, author pages, reviews) doesn't keep the ones from the last login. Only
 * well-formed values: a snowflake id, a Discord username, a display name, an avatar hash or none.
 */
export function cleanProfile(json: unknown): AccountUser | null {
    const p = json as Record<string, unknown> | null;
    if (!p || typeof p !== "object") return null;
    const { id, username, globalName, avatar } = p;
    if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return null;
    if (typeof username !== "string" || !/^[\w.]{2,32}$/.test(username)) return null;
    if (globalName !== null && globalName !== undefined && (typeof globalName !== "string" || !globalName.trim() || globalName.length > 32 || /[\u0000-\u001f\u007f]/.test(globalName))) return null;
    if (avatar !== null && avatar !== undefined && (typeof avatar !== "string" || !/^(a_)?[0-9a-f]{32}$/.test(avatar))) return null;
    return { id, username, globalName: typeof globalName === "string" ? globalName : null, avatar: typeof avatar === "string" ? avatar : null };
}
