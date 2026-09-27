/**
 * The pure part of Emoji Stealer: what was right-clicked, what Discord accepts as a name, how many
 * slots a server has left, and who may add expressions. No Discord modules in here, so it's testable.
 *
 * Numbers come from Discord's own client (checked against its web bundle):
 * - emoji names: EMOJI_MAX_LENGTH 32, EMOJI_RE /[^a-zA-Z0-9_]/g, EMOJI_MAX_FILESIZE 256 KiB
 * - emoji slots per boost tier: 50 / 100 / 150 / 250, each for static and for animated emoji.
 *   MORE_EMOJI raises the floor to 200 (EMOJI_MAX_SLOTS_MORE), premium_features adds slots on top of 50.
 * - sticker slots per tier: 5 / 15 / 30 / 60, and 120 at tier 3 with MORE_STICKERS
 * - sticker format types: 1 PNG, 2 APNG, 3 LOTTIE, 4 GIF
 */

export const EMOJI_NAME_MIN = 2;
export const EMOJI_NAME_MAX = 32;
export const EMOJI_MAX_BYTES = 256 * 1024;
export const STICKER_NAME_MIN = 2;
export const STICKER_NAME_MAX = 30;
export const STICKER_MAX_BYTES = 512 * 1024;

export const EMOJI_SLOTS_BY_TIER = [50, 100, 150, 250] as const;
export const EMOJI_SLOTS_MORE = 200;
export const STICKER_SLOTS_BY_TIER = [5, 15, 30, 60] as const;
export const STICKER_SLOTS_MORE = 120;

export const StickerFormat = { PNG: 1, APNG: 2, LOTTIE: 3, GIF: 4 } as const;

/** Permission bits, as bigints like Discord keeps them */
export const ADMINISTRATOR = 1n << 3n;
export const MANAGE_GUILD_EXPRESSIONS = 1n << 30n;
export const CREATE_GUILD_EXPRESSIONS = 1n << 43n;

// ---- Names --------------------------------------------------------------------------------------

/**
 * A name Discord takes for an emoji: 2 to 32 of A-Z, a-z, 0-9 and _. Discord's pickers suffix
 * duplicate names with "~1", which is dropped; anything else invalid becomes "_".
 */
export function sanitizeEmojiName(raw: string | null | undefined, fallback = "emoji"): string {
    let name = String(raw ?? "").trim().replace(/^:+|:+$/g, "").split("~")[0];
    name = name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!name) name = fallback;
    if (name.length < EMOJI_NAME_MIN) name = name.padEnd(EMOJI_NAME_MIN, "_");
    return name.slice(0, EMOJI_NAME_MAX);
}

/** What the name field allows while typing: invalid characters are dropped, the length capped */
export function cleanEmojiNameInput(raw: string): string {
    return raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, EMOJI_NAME_MAX);
}

export const isValidEmojiName = (name: string) => /^[A-Za-z0-9_]{2,32}$/.test(name);

/** Sticker names are free text, 2 to 30 characters */
export function sanitizeStickerName(raw: string | null | undefined, fallback = "sticker"): string {
    let name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) name = fallback;
    if (name.length < STICKER_NAME_MIN) name = name.padEnd(STICKER_NAME_MIN, "_");
    return name.slice(0, STICKER_NAME_MAX);
}

export const isValidStickerName = (name: string) => name.trim().length >= STICKER_NAME_MIN && name.trim().length <= STICKER_NAME_MAX;

// ---- Slots --------------------------------------------------------------------------------------

export interface GuildLimitsInput {
    premiumTier?: number | null;
    /** Discord keeps guild features as a Set; plain arrays work too */
    features?: Iterable<string> | null;
    premiumFeatures?: { additionalEmojiSlots?: number | null; additionalStickerSlots?: number | null; } | null;
}

const tierIndex = (tier: number | null | undefined) => Math.min(3, Math.max(0, Math.trunc(Number(tier) || 0)));

function hasFeature(features: Iterable<string> | null | undefined, feature: string) {
    if (!features) return false;
    if (typeof (features as Set<string>).has === "function") return (features as Set<string>).has(feature);
    for (const f of features) if (f === feature) return true;
    return false;
}

/** Emoji slots of each kind: static and animated emoji each get this many */
export function emojiSlotLimit(guild: GuildLimitsInput): number {
    const byTier = EMOJI_SLOTS_BY_TIER[tierIndex(guild.premiumTier)];
    const base = EMOJI_SLOTS_BY_TIER[0];
    const extra = base + (guild.premiumFeatures?.additionalEmojiSlots ?? 0);
    const floor = hasFeature(guild.features, "MORE_EMOJI") ? EMOJI_SLOTS_MORE : base;
    return Math.max(byTier, floor, extra);
}

export function stickerSlotLimit(guild: GuildLimitsInput): number {
    const tier = tierIndex(guild.premiumTier);
    const byTier = tier === 3 && hasFeature(guild.features, "MORE_STICKERS") ? STICKER_SLOTS_MORE : STICKER_SLOTS_BY_TIER[tier];
    const extra = STICKER_SLOTS_BY_TIER[0] + (guild.premiumFeatures?.additionalStickerSlots ?? 0);
    return Math.max(byTier, extra);
}

export interface EmojiSlots {
    limit: number;
    staticUsed: number;
    animatedUsed: number;
    staticLeft: number;
    animatedLeft: number;
}

/** Slots left in a server, from its emoji list (EmojiStore.getGuildEmoji) */
export function emojiSlots(guild: GuildLimitsInput, emojis: readonly { animated?: boolean | null; }[] | null | undefined): EmojiSlots {
    const limit = emojiSlotLimit(guild);
    let animatedUsed = 0, staticUsed = 0;
    for (const e of emojis ?? []) e?.animated ? animatedUsed++ : staticUsed++;
    return { limit, staticUsed, animatedUsed, staticLeft: Math.max(0, limit - staticUsed), animatedLeft: Math.max(0, limit - animatedUsed) };
}

export function stickerSlots(guild: GuildLimitsInput, stickers: readonly unknown[] | null | undefined) {
    const limit = stickerSlotLimit(guild);
    const used = stickers?.length ?? 0;
    return { limit, used, left: Math.max(0, limit - used) };
}

// ---- Permissions --------------------------------------------------------------------------------

export function toBits(value: unknown): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
    return 0n;
}

export interface ExpressionPermissionInput {
    guildId: string;
    ownerId?: string | null;
    userId: string;
    /** The member's role ids; @everyone (the guild id) is always counted */
    memberRoleIds: readonly string[];
    roles: readonly { id: string; permissions: unknown; }[] | Record<string, { id: string; permissions: unknown; }>;
}

/**
 * Whether the user can add emoji and stickers to the server: the owner, Administrator, or either
 * Create Expressions or Manage Expressions from @everyone or one of their roles.
 */
export function canAddExpressions(input: ExpressionPermissionInput): boolean {
    if (input.ownerId && input.ownerId === input.userId) return true;
    const roles = Array.isArray(input.roles) ? input.roles : Object.values(input.roles);
    const byId = new Map(roles.filter(r => r?.id).map(r => [r.id, r]));
    let perms = toBits(byId.get(input.guildId)?.permissions);
    for (const id of input.memberRoleIds) perms |= toBits(byId.get(id)?.permissions);
    return !!(perms & (ADMINISTRATOR | CREATE_GUILD_EXPRESSIONS | MANAGE_GUILD_EXPRESSIONS));
}

// ---- What was right-clicked ---------------------------------------------------------------------

export interface ParsedEmoji {
    kind: "emoji";
    id: string;
    name?: string;
    animated: boolean;
}

export interface ParsedSticker {
    kind: "sticker";
    id: string;
    name?: string;
    formatType?: number;
}

export type Expression = ParsedEmoji | ParsedSticker;

const SNOWFLAKE = /^\d{15,25}$/;
const MARKUP = /<(a)?:([A-Za-z0-9_~]{1,32}):(\d{15,25})>/g;

/** Every custom emoji in message text, like <:name:id> and <a:name:id> */
export function parseEmojiMarkup(text: string | null | undefined): ParsedEmoji[] {
    const out: ParsedEmoji[] = [];
    for (const m of String(text ?? "").matchAll(MARKUP)) out.push({ kind: "emoji", id: m[3], name: m[2], animated: !!m[1] });
    return out;
}

/** An emoji URL is animated if it's a GIF, or a WebP asked for with animated=true */
export function isAnimatedUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    try {
        const u = new URL(url, "https://cdn.discordapp.com");
        return /\.gif$/i.test(u.pathname) || u.searchParams.get("animated") === "true";
    } catch {
        return /\.gif(?:[?#]|$)/i.test(url) || /[?&]animated=true/i.test(url);
    }
}

/** Emoji and sticker ids from Discord's CDN and media proxy URLs */
export function parseExpressionUrl(url: string | null | undefined): Expression | undefined {
    if (!url) return;
    let path: string;
    try {
        path = new URL(url, "https://cdn.discordapp.com").pathname;
    } catch {
        return;
    }
    const emoji = path.match(/\/emojis\/(\d{15,25})(?:\.(\w+))?$/);
    if (emoji) return { kind: "emoji", id: emoji[1], animated: isAnimatedUrl(url) };
    const sticker = path.match(/\/stickers\/(\d{15,25})(?:\.(\w+))?$/);
    if (sticker) {
        const ext = sticker[2]?.toLowerCase();
        return { kind: "sticker", id: sticker[1], formatType: ext === "gif" ? StickerFormat.GIF : ext === "json" ? StickerFormat.LOTTIE : undefined };
    }
}

/** Just enough of a DOM element to read Discord's data attributes */
export interface ElementLike {
    getAttribute?(name: string): string | null;
    tagName?: string;
    parentNode?: unknown;
}

const attr = (el: ElementLike | null | undefined, name: string) => {
    try {
        return el?.getAttribute?.(name) ?? null;
    } catch {
        return null;
    }
};

/** The alt text of an emoji image, ":name:" or "name", or nothing if it isn't a usable name */
function nameFromAlt(alt: string | null) {
    const name = alt?.trim().replace(/^:+|:+$/g, "");
    return name && /^[A-Za-z0-9_~]{1,32}$/.test(name) ? name : undefined;
}

/**
 * The emoji or sticker at a DOM element: Discord's emoji and sticker nodes carry data-type,
 * data-id, data-name (and data-animated / data-format-type in the expression picker). Reactions
 * and plain images are recognised by their CDN src. Walks up a few parents.
 */
export function expressionFromElement(target: ElementLike | null | undefined, depth = 4): Expression | undefined {
    let el: ElementLike | null | undefined = target;
    for (let i = 0; el && i <= depth; i++, el = el.parentNode as ElementLike | null) {
        const type = attr(el, "data-type");
        const id = attr(el, "data-id");
        if (type === "emoji" && id && SNOWFLAKE.test(id)) {
            const src = attr(el, "src");
            const animatedAttr = attr(el, "data-animated");
            return {
                kind: "emoji",
                id,
                name: nameFromAlt(attr(el, "data-name")) ?? nameFromAlt(attr(el, "alt")),
                animated: animatedAttr != null ? animatedAttr === "true" : isAnimatedUrl(src),
            };
        }
        if (type === "sticker" && id && SNOWFLAKE.test(id)) {
            const format = Number(attr(el, "data-format-type"));
            return { kind: "sticker", id, name: attr(el, "data-name") ?? undefined, formatType: format || undefined };
        }
        const src = attr(el, "src");
        const fromSrc = parseExpressionUrl(src);
        if (fromSrc) {
            if (fromSrc.kind === "emoji") fromSrc.name = nameFromAlt(attr(el, "alt")) ?? nameFromAlt(attr(el, "data-name"));
            return fromSrc;
        }
    }
}

/** A message, as far as finding emoji names and sticker formats goes */
export interface MessageLike {
    content?: string;
    reactions?: readonly { emoji?: { id?: string | null; name?: string | null; animated?: boolean; }; }[];
    stickerItems?: readonly { id: string; name?: string; format_type?: number; formatType?: number; }[];
    sticker_items?: readonly { id: string; name?: string; format_type?: number; }[];
    stickers?: readonly { id: string; name?: string; format_type?: number; }[];
}

/** Fills in a name and animation flag from the message's text and reactions */
export function completeFromMessage(found: Expression, message: MessageLike | null | undefined): Expression {
    if (!message) return found;
    if (found.kind === "emoji") {
        const inText = parseEmojiMarkup(message.content).find(e => e.id === found.id);
        const inReactions = message.reactions?.find(r => r.emoji?.id === found.id)?.emoji;
        return {
            ...found,
            name: found.name ?? inText?.name ?? inReactions?.name ?? undefined,
            animated: found.animated || !!inText?.animated || !!inReactions?.animated,
        };
    }
    const items = [...message.stickerItems ?? [], ...message.sticker_items ?? [], ...message.stickers ?? []] as { id: string; name?: string; format_type?: number; formatType?: number; }[];
    const item = items.find(s => s.id === found.id);
    return { ...found, name: found.name ?? item?.name, formatType: found.formatType ?? item?.format_type ?? item?.formatType };
}

/**
 * What a context menu was opened on. Understands:
 * - the expression picker menu: { target } with data attributes
 * - the message menu: { favoriteableType, favoriteableId, favoriteableName, itemSrc, message } and,
 *   one level down, the original { target }
 */
export function expressionFromMenuProps(props: Record<string, any> | null | undefined): Expression | undefined {
    if (!props) return;
    const target = props.target ?? props.eviMenuArgs?.target;
    let found = expressionFromElement(target);

    const favType = props.favoriteableType;
    const favId = props.favoriteableId;
    if (!found && (favType === "emoji" || favType === "sticker") && typeof favId === "string" && SNOWFLAKE.test(favId)) {
        found = favType === "emoji"
            ? { kind: "emoji", id: favId, name: nameFromAlt(props.favoriteableName), animated: isAnimatedUrl(props.itemSrc) }
            : { kind: "sticker", id: favId, name: props.favoriteableName ?? undefined };
    }
    if (!found) {
        // A reaction or any other emoji image: the menu found its src while walking up from the target
        for (const url of [props.itemSrc, props.itemSafeSrc]) {
            if (typeof url === "string" && (found = parseExpressionUrl(url))) break;
        }
    }
    if (!found) return;
    return completeFromMessage(found, props.message);
}

// ---- URLs ---------------------------------------------------------------------------------------

export const emojiUrl = (id: string, animated: boolean, size?: number) =>
    `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}${size ? `?size=${size}` : ""}`;

/** The original file: PNG and APNG as .png (the media proxy keeps APNG frames), GIF as .gif */
export const stickerUrl = (id: string, formatType?: number) =>
    formatType === StickerFormat.LOTTIE
        ? `https://discord.com/stickers/${id}.json`
        : `https://media.discordapp.net/stickers/${id}.${formatType === StickerFormat.GIF ? "gif" : "png"}`;

/** Lottie stickers can only be uploaded to partnered and verified servers, so they are left out */
export const canCopySticker = (formatType?: number) => formatType !== StickerFormat.LOTTIE;

export function stickerMime(formatType?: number) {
    return formatType === StickerFormat.GIF ? "image/gif" : "image/png";
}

// ---- Errors -------------------------------------------------------------------------------------

/**
 * Discord's reason for a failed request. Its HTTP errors carry the response body: usually
 * { message, code }, but with oldFormErrors a validation error becomes { field: ["reason"] }.
 */
export function describeError(err: any, fallback = "Something went wrong"): string {
    const body = err?.body;
    if (body && typeof body === "object") {
        if (typeof body.message === "string" && body.message && body.message !== "Invalid Form Body") {
            const detail = firstFieldError(body.errors);
            return detail ? `${body.message}: ${detail}` : body.message;
        }
        const detail = firstFieldError(body.errors) ?? firstFieldError(body);
        if (detail) return detail;
        if (typeof body.message === "string" && body.message) return body.message;
    }
    if (typeof err === "string" && err) return err;
    if (typeof err?.message === "string" && err.message) return err.message;
    return fallback;
}

function firstFieldError(value: any, depth = 0): string | undefined {
    if (!value || depth > 5) return;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        for (const v of value) {
            const found = typeof v === "string" ? v : typeof v?.message === "string" ? v.message : firstFieldError(v, depth + 1);
            if (found) return found;
        }
        return;
    }
    if (typeof value === "object") {
        if (Array.isArray(value._errors)) return firstFieldError(value._errors, depth + 1);
        for (const key of Object.keys(value)) {
            if (key === "code") continue;
            const found = firstFieldError(value[key], depth + 1);
            if (found) return found;
        }
    }
}
