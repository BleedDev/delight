/**
 * Plugin authors on evi.rest: a profile tied to a Discord account. Someone claims one from the
 * dashboard, an admin approves it, and it's verified from then on. Verified authors own their
 * plugins: they see those plugins' crash reports, set their status and upload new versions.
 * Shared by the server, the app and the site.
 */
import { isPluginId, whyNotStoreUrl } from "./store";

/** Evi's own profile: every official plugin is published under it, and admins act for it */
export const OFFICIAL_AUTHOR = "evi";

/**
 * The Discord id Evi's own profile is shown with: no real account (it's no admin's business to be
 * found through it), but shaped like one so parseAuthors keeps the profile. Snowflake 0: the default
 * avatar, and no avatar hash.
 */
export const OFFICIAL_USER_ID = "0".repeat(17);

/** Slugs nobody can claim: they'd look official or collide with pages */
const RESERVED = new Set([OFFICIAL_AUTHOR, "admin", "admins", "discord", "evi-team", "official", "staff", "support", "store", "system", "team"]);

export interface AuthorLinks {
    github?: string;
    site?: string;
}

/** An author as everyone sees them (GET /v1/authors, GET /v1/authors/:slug) */
export interface AuthorProfile {
    slug: string;
    name: string;
    bio: string;
    verified: boolean;
    /** Their Discord account */
    userId: string;
    /** Discord avatar hash, null for the default one */
    avatar: string | null;
    links: AuthorLinks;
    /** Ids of the store plugins they own */
    plugins: string[];
    /** Their page's banner image (https), missing without one. Profiles from before 1.0 don't have these. */
    banner?: string | null;
    /** Up to MAX_PINNED of their plugins, shown first */
    pinned?: string[];
    /** People following them */
    followers?: number;
    /** Installs running any of their plugins, null while that's too few to show */
    installs?: number | null;
}

export const MAX_PINNED = 3;
/** Banner uploads: PNG, JPEG, GIF or WebP, like badge icons, but bigger */
export const MAX_BANNER_BYTES = 2 * 1024 * 1024;

/** Which of `plugins` to pin, in order, or why not */
export function validatePinned(raw: unknown, plugins: string[]): { pinned: string[]; } | { error: string; } {
    if (!Array.isArray(raw) || raw.length > MAX_PINNED) return { error: `Pin at most ${MAX_PINNED} plugins` };
    if (!raw.every(id => typeof id === "string" && plugins.includes(id))) return { error: "You can only pin your own plugins" };
    return { pinned: [...new Set(raw as string[])] };
}

/** A request to become an author (POST /v1/me/author-claim) */
export interface AuthorClaimInput {
    slug: string;
    name: string;
    bio: string;
    links: AuthorLinks;
    /** Store plugins already listed under their name that they say are theirs */
    plugins: string[];
    /** Anything that helps an admin check them: a repo, a Discord server */
    note: string;
}

export const isAuthorSlug = (slug: unknown): slug is string => isPluginId(slug) && slug.length >= 2 && slug.length <= 32;

function text(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length <= max && !/[\0-\x08\x0e-\x1f]/.test(value);
}

function cleanLinks(raw: unknown): { links: AuthorLinks; } | { error: string; } {
    if (raw === undefined || raw === null) return { links: {} };
    if (typeof raw !== "object" || Array.isArray(raw)) return { error: "links must be an object" };
    const links: AuthorLinks = {};
    for (const key of ["github", "site"] as const) {
        const value = (raw as Record<string, unknown>)[key];
        if (value === undefined || value === "") continue;
        const bad = whyNotStoreUrl(value);
        if (bad) return { error: `${key} link: ${bad}` };
        links[key] = value as string;
    }
    return { links };
}

/** The editable part of a profile, cleaned, or why it can't be used */
export function validateProfile(raw: unknown): { profile: Pick<AuthorProfile, "name" | "bio" | "links">; } | { error: string; } {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!text(e.name, 40) || !e.name.trim()) return { error: "The name must be 1-40 characters" };
    if (e.bio !== undefined && !text(e.bio, 300)) return { error: "The bio must be at most 300 characters" };
    const links = cleanLinks(e.links);
    if ("error" in links) return links;
    return { profile: { name: e.name.trim(), bio: typeof e.bio === "string" ? e.bio.trim() : "", links: links.links } };
}

/** Letters from other scripts that look like Latin ones, as they'd be read */
const HOMOGLYPHS: Record<string, string> = {
    // Cyrillic
    "а": "a", "в": "b", "е": "e", "ё": "e", "є": "e", "һ": "h", "і": "i", "ї": "i", "ӏ": "i", "ј": "j", "к": "k", "м": "m", "н": "h",
    "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ѕ": "s", "ѵ": "v", "ѡ": "w", "ԁ": "d", "ԛ": "q", "ԝ": "w",
    // Greek
    "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "ϲ": "c", "ϳ": "j",
    // Latin look-alikes that NFKD leaves alone
    "ı": "i", "ɩ": "i", "ɪ": "i", "ʋ": "v", "ᴠ": "v", "ᴇ": "e", "ℓ": "i",
};
/** Before lowercasing: a lowercase l passes for a capital I, an uppercase L doesn't */
const TALL_STROKES: Record<string, string> = { "l": "i", "1": "i", "|": "i", "!": "i" };

/**
 * What a name looks like, for comparing names that could pass for each other: lowercase, accents and
 * other marks dropped, look-alike letters from other scripts mapped to Latin, anything that isn't a
 * letter left out. "Ｅѵі", "E.V.I", "EvI" and "Évi" all come out as "evi".
 */
export function nameSkeleton(name: string) {
    const folded = [...name.normalize("NFKD").replace(/\p{M}/gu, "")].map(c => TALL_STROKES[c] ?? c).join("").toLowerCase();
    return [...folded].map(c => HOMOGLYPHS[c] ?? c).join("").replace(/\P{L}/gu, "");
}

/** Skeletons of names only Evi goes by */
const OFFICIAL_SKELETONS = new Set(["evi", "eviteam", "evistaff", "eviofficial", "officialevi", "eviadmin", "evisupport", "evidev"]);

/**
 * An author name, NFKC-normalised, or why it can't be used: no invisible, private-use, unassigned or
 * text-direction characters (they make a name read differently from what it is), and nothing that
 * passes for Evi's own name.
 */
export function cleanAuthorName(raw: string): { name: string; } | { error: string; } {
    const normalized = raw.normalize("NFKC");
    // Before trimming, which would quietly take a byte order mark off either end. Cf covers the
    // zero-width characters and every text-direction control (U+200E/F, U+202A-202E, U+2066-2069)
    if (/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(normalized)) return { error: "The name can't contain invisible or text-direction characters" };
    const name = normalized.trim();
    if (!name || name.length > 40) return { error: "The name must be 1-40 characters" };
    if (OFFICIAL_SKELETONS.has(nameSkeleton(name))) return { error: "That name is Evi's own" };
    return { name };
}

/** A claim, cleaned, or why it can't be sent */
export function validateClaim(raw: unknown): { claim: AuthorClaimInput; } | { error: string; } {
    const e = (raw ?? {}) as Record<string, unknown>;
    const slug = typeof e.slug === "string" ? e.slug.trim().toLowerCase() : e.slug;
    if (!isAuthorSlug(slug)) return { error: "The handle must be 2-32 lowercase letters, digits and dashes" };
    if (RESERVED.has(slug)) return { error: "That handle is reserved" };
    const profile = validateProfile(e);
    if ("error" in profile) return profile;
    const plugins = e.plugins ?? [];
    if (!Array.isArray(plugins) || plugins.length > 50 || !plugins.every(isPluginId)) return { error: "plugins must list at most 50 plugin ids" };
    if (e.note !== undefined && !text(e.note, 500)) return { error: "The note must be at most 500 characters" };
    return { claim: { slug, ...profile.profile, plugins: [...new Set(plugins as string[])], note: typeof e.note === "string" ? e.note.trim() : "" } };
}

/** GET /v1/authors, cleaned: profiles by slug. Anything malformed is left out. */
export function parseAuthors(raw: unknown): Record<string, AuthorProfile> {
    const out: Record<string, AuthorProfile> = {};
    const list = (raw as { authors?: unknown; } | null)?.authors;
    if (!Array.isArray(list)) return out;
    for (const a of list.slice(0, 5000)) {
        if (!a || typeof a !== "object") continue;
        const e = a as Record<string, unknown>;
        if (!isAuthorSlug(e.slug) && e.slug !== OFFICIAL_AUTHOR) continue;
        const profile = validateProfile(e);
        if ("error" in profile) continue;
        if (typeof e.userId !== "string" || !/^\d{17,20}$/.test(e.userId)) continue;
        out[e.slug as string] = {
            slug: e.slug as string,
            ...profile.profile,
            verified: e.verified === true,
            userId: e.userId,
            avatar: typeof e.avatar === "string" && /^(a_)?[0-9a-f]{32}$/.test(e.avatar) ? e.avatar : null,
            plugins: Array.isArray(e.plugins) ? e.plugins.filter(isPluginId) : [],
            // Author pages from Evi 1.0 on: only evi.rest's own banner addresses, only their own plugins pinned
            banner: typeof e.banner === "string" && /^https:\/\/[^\s/]+\/banners\/[a-z0-9-]+-[0-9a-z]{1,16}\.(png|jpg|gif|webp)$/.test(e.banner) ? e.banner : null,
            pinned: Array.isArray(e.pinned) ? e.pinned.filter(id => isPluginId(id) && Array.isArray(e.plugins) && e.plugins.includes(id)).slice(0, MAX_PINNED) : [],
            followers: typeof e.followers === "number" && e.followers >= 0 ? Math.floor(e.followers) : 0,
            installs: typeof e.installs === "number" && e.installs >= 0 ? Math.floor(e.installs) : null,
        };
    }
    return out;
}

/**
 * Whether a store entry is one of Evi's own plugins: published under the `evi` author, or, from before
 * authorIds, listed as by "Evi" alone. Everything else is a community plugin. The server uses the same
 * rule for ownership, so a third-party entry can never pass as official.
 */
export function isOfficialListing(entry: { authors: string[]; authorIds?: string[]; }): boolean {
    return entry.authorIds ? entry.authorIds[0] === OFFICIAL_AUTHOR : entry.authors.length === 1 && entry.authors[0] === "Evi";
}

/** An author's page on the site */
export const authorPageUrl = (siteOrigin: string, slug: string) => `${siteOrigin}/author?u=${encodeURIComponent(slug)}`;
