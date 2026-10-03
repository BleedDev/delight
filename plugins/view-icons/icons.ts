/**
 * Pure pieces of View Icons: which avatar, banner or icon a CDN link is, its full-size link, and
 * the file name it downloads as. No Discord or DOM access, so tests can run them.
 *
 * Every link asks the CDN for its largest size (4096; it sends the original when that's smaller).
 * Animated images (hashes starting with "a_") come as GIF so they animate in the viewer and download
 * as something every app opens; everything else as PNG.
 */

export const CDN = "https://cdn.discordapp.com";
export const SIZE = 4096;

export type PictureKind = "avatar" | "server-avatar" | "banner" | "server-banner" | "icon" | "splash" | "discovery-splash";

export interface Picture {
    kind: PictureKind;
    /** What it is: "Avatar", "Server Banner"... */
    label: string;
    url: string;
    animated: boolean;
    /** The download's file name, without the extension */
    baseName: string;
    /** Width / height. Discord crops every upload of a kind to the same shape */
    aspect: number;
}

const LABELS: Record<PictureKind, string> = {
    "avatar": "Avatar",
    "server-avatar": "Server Avatar",
    "banner": "Banner",
    "server-banner": "Server Banner",
    "icon": "Icon",
    "splash": "Invite Background",
    "discovery-splash": "Discovery Background",
};

const ASPECTS: Record<PictureKind, number> = {
    "avatar": 1,
    "server-avatar": 1,
    "icon": 1,
    // Profile banners are 5:2 (600x240); a server's own banner and backgrounds 16:9
    "banner": 2.5,
    "server-banner": 2.5,
    "splash": 16 / 9,
    "discovery-splash": 16 / 9,
};

const HASH = /^(a_)?[0-9a-f]{32}$/;
const SNOWFLAKE = /^\d{1,20}$/;

export const isAnimatedHash = (hash: string) => hash.startsWith("a_");

/** `${CDN}/${path}/${hash}.png|gif?size=4096`, or null for a missing or malformed hash */
export function cdnUrl(path: string, hash: unknown, allowAnimated = true): string | null {
    if (typeof hash !== "string" || !HASH.test(hash)) return null;
    const ext = allowAnimated && isAnimatedHash(hash) ? "gif" : "png";
    return `${CDN}/${path}/${hash}.${ext}?size=${SIZE}`;
}

/** The file extension of a CDN link: "gif" or "png" */
export const extensionOf = (url: string) => /\.gif(\?|$)/.test(url) ? "gif" : "png";

/** A name safe for a file on every system: no path characters, no trailing dots, at most 80 characters */
export function safeFileName(name: string): string {
    const clean = name
        .normalize("NFKC")
        .replace(/[\u0000-\u001f<>:"/\\|?*\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 80)
        .trim();
    return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? `${clean}_` : clean || "image";
}

/** "name-avatar.png" */
export const fileName = (picture: Picture) => `${picture.baseName}.${extensionOf(picture.url)}`;

function picture(kind: PictureKind, url: string, owner: string): Picture {
    return {
        kind,
        label: LABELS[kind],
        url,
        animated: extensionOf(url) === "gif",
        baseName: safeFileName(`${owner} ${LABELS[kind].toLowerCase()}`).replace(/ /g, "-"),
        aspect: ASPECTS[kind],
    };
}

/** A picture's size in the viewer: as large as fits `maxWidth` x `maxHeight`, keeping its aspect */
export function fitSize(aspect: number, maxWidth: number, maxHeight: number): { width: number; height: number; } {
    const width = Math.max(1, Math.round(Math.min(maxWidth, maxHeight * aspect)));
    return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/** What a CDN link in the image viewer shows, and whose it is */
export interface LinkedPicture {
    kind: PictureKind;
    /** The user, server or group DM it belongs to; null for Discord's default avatars */
    ownerId: string | null;
    /** The same picture at full size */
    url: string;
}

const CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const HASH_FILE = /^((?:a_)?[0-9a-f]{32})\.(?:png|jpe?g|webp|gif|avif)$/;

/**
 * The avatar, banner or icon a Discord CDN link points at, as its full-size link. Null for anything
 * else (attachments, emojis, stickers), so the viewer only offers Download for profile pictures.
 */
export function pictureFromUrl(link: unknown): LinkedPicture | null {
    if (typeof link !== "string") return null;
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || !CDN_HOSTS.has(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);

    const defaultAvatar = /^embed\/avatars\/(\d)\.png$/.exec(parts.join("/"));
    if (defaultAvatar) return { kind: "avatar", ownerId: null, url: `${CDN}/embed/avatars/${defaultAvatar[1]}.png` };

    const file = HASH_FILE.exec(parts[parts.length - 1] ?? "");
    if (!file) return null;
    const dir = parts.slice(0, -1);
    const make = (kind: PictureKind, ownerId: string, path: string, allowAnimated = true): LinkedPicture | null => {
        const full = cdnUrl(path, file[1], allowAnimated);
        return full ? { kind, ownerId, url: full } : null;
    };

    if (dir.length === 2 && SNOWFLAKE.test(dir[1])) {
        const [type, id] = dir;
        if (type === "avatars") return make("avatar", id, `avatars/${id}`);
        if (type === "banners") return make("banner", id, `banners/${id}`);
        if (type === "icons") return make("icon", id, `icons/${id}`);
        if (type === "channel-icons") return make("icon", id, `channel-icons/${id}`, false);
        if (type === "splashes") return make("splash", id, `splashes/${id}`, false);
        if (type === "discovery-splashes") return make("discovery-splash", id, `discovery-splashes/${id}`, false);
    }
    // guilds/<guild>/users/<user>/avatars|banners/<hash>
    if (dir.length === 5 && dir[0] === "guilds" && dir[2] === "users" && SNOWFLAKE.test(dir[1]) && SNOWFLAKE.test(dir[3])) {
        if (dir[4] === "avatars") return make("server-avatar", dir[3], dir.join("/"));
        if (dir[4] === "banners") return make("server-banner", dir[3], dir.join("/"));
    }
    return null;
}

/** A linked picture as a downloadable one, named after its owner */
export function linkedPicture(linked: LinkedPicture, owner: string): Picture {
    return picture(linked.kind, linked.url, owner);
}
