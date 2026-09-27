/**
 * Community themes: what an author sends to evi.rest (from the website, or from Evi's theme editor
 * with a linked account) and the checks it goes through before an admin reviews it. Shared by the
 * server, the app and the tests.
 *
 * The rule that matters most: a community theme loads nothing from the internet. Anything a
 * stylesheet fetches (an @import, a url() image or font) tells whoever serves it that this person
 * has Discord open with that theme, from which address, every time. So @import is refused outright,
 * and every address a theme mentions must be Discord's own CDN, which Discord talks to anyway. Images
 * and fonts can still be embedded as data: URLs, or fonts named when people have them installed.
 * CSS escapes are decoded before looking, so `\75rl(` or `\2f\2f` can't slip one past.
 */
import { isPluginId, isVersion } from "./store";
import { whyNotCss } from "./themes";

/** The most a reviewer is asked to read, and the most a community theme can be */
export const MAX_COMMUNITY_THEME_BYTES = 512 * 1024;
export const MAX_THEME_SCREENSHOT_BYTES = 1024 * 1024;
export const MAX_THEME_TAGS = 5;
export const MAX_THEME_NOTES = 10;
/** Where a theme may point: Discord's CDN, which Discord already loads from */
export const ALLOWED_THEME_HOSTS: readonly string[] = ["cdn.discordapp.com", "media.discordapp.net"];

export type ScreenshotType = "image/png" | "image/jpeg" | "image/webp";
export const SCREENSHOT_EXTENSIONS: Record<ScreenshotType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** POST /v1/me/theme-submissions */
export interface ThemeSubmissionInput {
    /** The store id: lowercase letters, digits and dashes, the theme's file name once installed */
    id: string;
    name: string;
    description: string;
    version: string;
    tags: string[];
    /** What changed in this version, a line each */
    notes: string[];
    css: string;
    /** base64; checked against the type by its first bytes on the server */
    screenshot?: { type: ScreenshotType; data: string; };
}

/** What reading a theme found, for its review */
export interface ThemeScan {
    bytes: number;
    lines: number;
    /** @import rules: refused, so only ever seen on uploads from before a rule changed */
    imports: number;
    /** Every host the theme mentions, and whether it may */
    hosts: { host: string; allowed: boolean; count: number; }[];
    /** Embedded images and fonts */
    dataUrls: number;
    /** Font families it brings along with @font-face */
    fontFaces: string[];
    /** !important declarations: many of them usually means it restyles Discord by force, not by variables */
    importants: number;
}

/** CSS with its escapes turned back into the characters they stand for, and comments dropped */
export function decodeCss(css: string) {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_, hex: string) => {
            const code = parseInt(hex, 16);
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
        })
        .replace(/\\([^\n0-9a-fA-F])/g, "$1");
}

/**
 * The CSS without the contents of its data: URLs, which load nothing: base64 has slashes in it, and
 * an embedded SVG names its namespace (http://www.w3.org/2000/svg) without fetching it
 */
const withoutDataUrls = (css: string) => css
    .replace(/(["'])data:[\s\S]*?\1/gi, "$1data:$1")
    .replace(/url\(\s*data:[^)]*\)/gi, "url(data:)");

export function scanThemeCss(css: string): ThemeScan {
    const decoded = decodeCss(css);
    const hosts = new Map<string, number>();
    // Anything that names a host: https://host, //host, and the same inside strings
    for (const [, host] of withoutDataUrls(decoded).matchAll(/\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d+)?/gi)) {
        const key = host.toLowerCase();
        hosts.set(key, (hosts.get(key) ?? 0) + 1);
    }
    const fontFaces = new Set<string>();
    for (const [, block] of decoded.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
        const family = block.match(/font-family\s*:\s*["']?([^"';}]+)/i)?.[1]?.trim();
        if (family) fontFaces.add(family.slice(0, 64));
    }
    return {
        bytes: new TextEncoder().encode(css).length,
        lines: css.split("\n").length,
        imports: (decoded.match(/@import\b/gi) ?? []).length,
        hosts: [...hosts].map(([host, count]) => ({ host, allowed: ALLOWED_THEME_HOSTS.includes(host), count })).sort((a, b) => b.count - a.count),
        dataUrls: (decoded.match(/\bdata:/gi) ?? []).length,
        fontFaces: [...fontFaces],
        importants: (decoded.match(/!\s*important\b/gi) ?? []).length,
    };
}

/** Why CSS can't be a community theme, or undefined when it can */
export function whyNotCommunityCss(css: string): string | undefined {
    const bytes = new TextEncoder().encode(css).length;
    if (bytes > MAX_COMMUNITY_THEME_BYTES) return `The theme is ${Math.ceil(bytes / 1024)} KB; community themes can be at most ${MAX_COMMUNITY_THEME_BYTES / 1024} KB`;
    const notCss = whyNotCss(css, "text/css");
    if (notCss) return notCss;
    const scan = scanThemeCss(css);
    if (scan.imports) return "Themes can't use @import: it loads a stylesheet from somewhere else every time Discord starts. Put the CSS in the theme itself";
    const remote = scan.hosts.find(h => !h.allowed);
    if (remote) return `Themes can't load anything from ${remote.host}: it would learn who uses the theme, and when. Embed images and fonts as data: URLs, or host images on Discord`;
}

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && !/[\0-\x08\x0e-\x1f]/.test(value);

/** An upload, cleaned, or why it can't be sent. The CSS rules are checked separately (whyNotCommunityCss). */
export function validateThemeSubmission(raw: unknown): { input: ThemeSubmissionInput; } | { error: string; } {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!isPluginId(e.id)) return { error: "The id must be lowercase letters, digits and dashes, like ocean-night" };
    if (!text(e.name, 80) || !e.name.trim()) return { error: "The name must be 1-80 characters" };
    if (e.description !== undefined && !text(e.description, 300)) return { error: "The description must be at most 300 characters" };
    if (!isVersion(e.version)) return { error: "The version must look like 1.0.0" };
    const tags = e.tags ?? [];
    if (!Array.isArray(tags) || tags.length > MAX_THEME_TAGS || !tags.every(t => typeof t === "string" && /^[a-z0-9-]{1,24}$/.test(t))) {
        return { error: `Tags: at most ${MAX_THEME_TAGS}, each lowercase letters, digits and dashes` };
    }
    const notes = e.notes ?? [];
    if (!Array.isArray(notes) || notes.length > MAX_THEME_NOTES || !notes.every(n => text(n, 300) && n.trim())) {
        return { error: `What changed: at most ${MAX_THEME_NOTES} lines of 300 characters` };
    }
    if (typeof e.css !== "string" || !e.css.trim()) return { error: "The theme's CSS is missing" };
    let screenshot: ThemeSubmissionInput["screenshot"];
    if (e.screenshot !== undefined && e.screenshot !== null) {
        const s = e.screenshot as Record<string, unknown>;
        if (!(typeof s.type === "string" && s.type in SCREENSHOT_EXTENSIONS)) return { error: "The screenshot must be a PNG, JPEG or WebP image" };
        if (typeof s.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.data)) return { error: "The screenshot must be base64" };
        if (s.data.length > Math.ceil(MAX_THEME_SCREENSHOT_BYTES / 3) * 4) return { error: `The screenshot can be at most ${MAX_THEME_SCREENSHOT_BYTES / 1024 / 1024} MB` };
        screenshot = { type: s.type as ScreenshotType, data: s.data };
    }
    return {
        input: {
            id: e.id,
            name: e.name.trim(),
            description: typeof e.description === "string" ? e.description.trim() : "",
            version: e.version,
            tags: [...new Set(tags as string[])],
            notes: (notes as string[]).map(n => n.trim()),
            css: e.css,
            ...(screenshot && { screenshot }),
        },
    };
}

/** Whether an image's first bytes say it's what it claims to be */
export function isScreenshotType(data: Uint8Array, type: ScreenshotType) {
    const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
    if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
    return starts(0x52, 0x49, 0x46, 0x46) && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
}

/**
 * The CSS as it's published: its own header replaced by one from the verified details, so the name
 * Evi shows once it's installed is the one reviewed and the author is who uploaded it. A @base from
 * the old header (the editor's) is kept.
 */
export function withStoreHeader(css: string, meta: { name: string; description: string; author: string; version: string; }) {
    const clean = (value: string) => value.replace(/\*\//g, "").replace(/\s+/g, " ").replace(/(^|\s)@(?=\w)/g, "$1").trim();
    const header = css.match(/^\s*\/\*[\s\S]*?\*\//)?.[0];
    const isHeader = !!header && /(?:^|\s)@\w+/.test(header);
    const base = isHeader ? header!.match(/(?:^|\s)@base[ \t]+(dark|light)\b/i)?.[1]?.toLowerCase() : undefined;
    const body = (isHeader ? css.slice(header!.length) : css).replace(/^\s+/, "");
    const lines = [
        ["name", clean(meta.name)],
        ["description", clean(meta.description)],
        ["author", clean(meta.author)],
        ["version", meta.version],
        ["base", base ?? ""],
    ].filter(([, v]) => v).map(([k, v]) => ` * @${k} ${v}`);
    return `/**\n${lines.join("\n")}\n */\n\n${body.replace(/\s*$/, "\n")}`;
}
