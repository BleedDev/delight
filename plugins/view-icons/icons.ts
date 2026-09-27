/**
 * Pure pieces of View Icons: the full-size CDN links for avatars, banners and server images, and
 * the file names they download as. No Discord or DOM access, so tests can run them.
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
    /** What it is, as the menu and viewer call it: "Avatar", "Server Banner"... */
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

/** Discord's default avatar for someone without one: by id for new usernames, by discriminator for old ones */
export function defaultAvatarUrl(userId: string, discriminator?: string | null): string {
    let index = 0;
    try {
        index = discriminator && discriminator !== "0"
            ? Number(discriminator) % 5
            : Number((BigInt(userId) >> 22n) % 6n);
    } catch { /* not a snowflake */ }
    return `${CDN}/embed/avatars/${Number.isFinite(index) ? index : 0}.png`;
}

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

function picture(kind: PictureKind, url: string | null, owner: string, aspect = ASPECTS[kind]): Picture | null {
    if (!url) return null;
    return {
        kind,
        label: LABELS[kind],
        url,
        animated: extensionOf(url) === "gif",
        baseName: safeFileName(`${owner} ${LABELS[kind].toLowerCase()}`).replace(/ /g, "-"),
        aspect,
    };
}

const present = (list: (Picture | null)[]) => list.filter((p): p is Picture => !!p);

export interface UserImages {
    id: string;
    name: string;
    avatar?: string | null;
    discriminator?: string | null;
    banner?: string | null;
    /** The server the menu was opened in, for server avatars and banners */
    guildId?: string | null;
    memberAvatar?: string | null;
    memberBanner?: string | null;
}

/** Someone's avatars: the server one first when there is one, since that's what the server shows */
export function userAvatars(u: UserImages): Picture[] {
    if (!SNOWFLAKE.test(u.id)) return [];
    const inGuild = u.guildId && SNOWFLAKE.test(u.guildId) ? u.guildId : null;
    return present([
        inGuild ? picture("server-avatar", cdnUrl(`guilds/${inGuild}/users/${u.id}/avatars`, u.memberAvatar), u.name) : null,
        picture("avatar", cdnUrl(`avatars/${u.id}`, u.avatar) ?? defaultAvatarUrl(u.id, u.discriminator), u.name),
    ]);
}

export function userBanners(u: UserImages): Picture[] {
    if (!SNOWFLAKE.test(u.id)) return [];
    const inGuild = u.guildId && SNOWFLAKE.test(u.guildId) ? u.guildId : null;
    return present([
        inGuild ? picture("server-banner", cdnUrl(`guilds/${inGuild}/users/${u.id}/banners`, u.memberBanner), u.name) : null,
        picture("banner", cdnUrl(`banners/${u.id}`, u.banner), u.name),
    ]);
}

export interface GuildImages {
    id: string;
    name: string;
    icon?: string | null;
    banner?: string | null;
    splash?: string | null;
    discoverySplash?: string | null;
}

export function guildIcons(g: GuildImages): Picture[] {
    if (!SNOWFLAKE.test(g.id)) return [];
    return present([picture("icon", cdnUrl(`icons/${g.id}`, g.icon), g.name)]);
}

/** A server's banner and its invite and Discovery backgrounds (never animated) */
export function guildBanners(g: GuildImages): Picture[] {
    if (!SNOWFLAKE.test(g.id)) return [];
    return present([
        picture("banner", cdnUrl(`banners/${g.id}`, g.banner), g.name, 16 / 9),
        picture("splash", cdnUrl(`splashes/${g.id}`, g.splash, false), g.name),
        picture("discovery-splash", cdnUrl(`discovery-splashes/${g.id}`, g.discoverySplash, false), g.name),
    ]);
}

/** A group DM's icon */
export function groupDmIcons(channelId: string, name: string, icon: string | null | undefined): Picture[] {
    if (!SNOWFLAKE.test(channelId)) return [];
    return present([picture("icon", cdnUrl(`channel-icons/${channelId}`, icon, false), name)]);
}

/** A picture's size in the viewer: as large as fits `maxWidth` x `maxHeight`, keeping its aspect */
export function fitSize(aspect: number, maxWidth: number, maxHeight: number): { width: number; height: number; } {
    const width = Math.max(1, Math.round(Math.min(maxWidth, maxHeight * aspect)));
    return { width, height: Math.max(1, Math.round(width / aspect)) };
}
