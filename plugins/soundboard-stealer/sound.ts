/**
 * Soundboard Stealer's pure parts: what was right-clicked, file types, names, slots and permissions.
 * No DOM, no network, so the tests run them as they are.
 *
 * Discord's numbers, checked 2026-10-02 in its web build:
 * - slots: max(MORE_SOUNDBOARD ? 200 : 8, 8 + premiumFeatures.additionalSoundSlots). A server
 *   Discord sent no premiumFeatures for falls back to the boost tiers' 8 / 24 / 36 / 48.
 * - Discord's own sound upload takes 512 KB and 5.2 seconds at most, names of 2 to 32 characters.
 * - sounds live at https://cdn.discordapp.com/soundboard-sounds/{id}, as MP3 or Ogg.
 * - Discord's built-in sounds have guildId "0" (or "DEFAULT" in older builds).
 */

export const SOUND_MAX_BYTES = 512 * 1024;
export const SOUND_MAX_SECONDS = 5.2;
export const SOUND_NAME_MIN = 2;
export const SOUND_NAME_MAX = 32;

export const BASE_SOUND_SLOTS = 8;
export const MORE_SOUND_SLOTS = 200;
const SOUND_SLOTS_BY_TIER = [8, 24, 36, 48];

export const ADMINISTRATOR = 1n << 3n;
export const MANAGE_GUILD_EXPRESSIONS = 1n << 30n;
export const CREATE_GUILD_EXPRESSIONS = 1n << 43n;

export const soundUrl = (soundId: string) => `https://cdn.discordapp.com/soundboard-sounds/${soundId}`;

/** Discord's built-in sounds aren't in any server */
export const isDefaultSound = (guildId: string | null | undefined) => !guildId || guildId === "0" || guildId === "DEFAULT";

// ---- What was right-clicked ---------------------------------------------------------------------

export interface Sound {
    soundId: string;
    guildId?: string;
    name?: string;
    /** 0 to 1 */
    volume: number;
    emojiId?: string | null;
    emojiName?: string | null;
}

const SNOWFLAKE = /^\d{1,25}$/;
const MARKUP = /<sound:(\d{1,25}):(\d{1,25})>/g;

/** Discord's sound objects (SoundboardStore, the sound button's menu) */
export function soundFromObject(raw: any): Sound | undefined {
    const soundId = raw?.soundId ?? raw?.sound_id;
    if (typeof soundId !== "string" && typeof soundId !== "number") return;
    const id = String(soundId);
    if (!SNOWFLAKE.test(id)) return;
    const volume = Number(raw.volume);
    const guildId = raw.guildId ?? raw.guild_id;
    return {
        soundId: id,
        guildId: guildId != null ? String(guildId) : undefined,
        name: typeof raw.name === "string" ? raw.name : undefined,
        volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1,
        emojiId: raw.emojiId ?? raw.emoji_id ?? null,
        emojiName: raw.emojiName ?? raw.emoji_name ?? null,
    };
}

/** Sounds shared in a message, like <sound:guildId:soundId>, once each */
export function parseSoundMarkup(text: string | null | undefined): { guildId: string; soundId: string; }[] {
    const seen = new Set<string>();
    const out: { guildId: string; soundId: string; }[] = [];
    for (const m of String(text ?? "").matchAll(MARKUP)) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        out.push({ guildId: m[1], soundId: m[2] });
    }
    return out;
}

/**
 * The sound a menu is about: the sound button's menu gets { sound, soundGuild }, a message menu
 * gets { message } whose text may share sounds. `lookup` finds a known sound by id.
 */
export function soundsFromMenuProps(props: any, lookup: (soundId: string) => any): Sound[] {
    const direct = soundFromObject(props?.sound);
    if (direct) return [direct];
    const content = props?.message?.content;
    if (typeof content !== "string") return [];
    return parseSoundMarkup(content).map(({ guildId, soundId }) => soundFromObject(lookup(soundId)) ?? { soundId, guildId, volume: 1 });
}

// ---- Files --------------------------------------------------------------------------------------

export type AudioKind = { ext: "mp3"; mime: "audio/mpeg"; } | { ext: "ogg"; mime: "audio/ogg"; };
const MP3: AudioKind = { ext: "mp3", mime: "audio/mpeg" };
const OGG: AudioKind = { ext: "ogg", mime: "audio/ogg" };

/** MP3 or Ogg, from the first bytes; the content type is only a hint */
export function audioKind(bytes: Uint8Array, contentType?: string | null): AudioKind | undefined {
    if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return OGG; // "OggS"
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return MP3; // "ID3"
    if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return MP3; // MPEG frame sync
    const type = (contentType ?? "").toLowerCase();
    if (type.includes("ogg")) return OGG;
    if (type.includes("mpeg") || type.includes("mp3")) return MP3;
    return undefined;
}

/** A name safe for a file on Windows, macOS and Linux */
export function fileName(name: string | undefined, fallback: string, ext: string): string {
    const base = String(name ?? "").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 64);
    return `${base || fallback}.${ext}`;
}

// ---- Names --------------------------------------------------------------------------------------

/** Discord's name rules: 2 to 32 characters, trimmed */
export function sanitizeSoundName(name: string | undefined): string {
    const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, SOUND_NAME_MAX);
    return clean.length >= SOUND_NAME_MIN ? clean : clean.padEnd(SOUND_NAME_MIN, "_");
}

export const isValidSoundName = (name: string) => {
    const n = name.trim().length;
    return n >= SOUND_NAME_MIN && n <= SOUND_NAME_MAX;
};

// ---- Slots --------------------------------------------------------------------------------------

export interface GuildLimitsInput {
    premiumTier?: number | null;
    features?: Iterable<string> | null;
    premiumFeatures?: { additionalSoundSlots?: number | null; } | null;
}

function hasFeature(features: Iterable<string> | null | undefined, feature: string) {
    if (!features) return false;
    if (typeof (features as Set<string>).has === "function") return (features as Set<string>).has(feature);
    for (const f of features) if (f === feature) return true;
    return false;
}

export function soundSlotLimit(guild: GuildLimitsInput): number {
    const floor = hasFeature(guild.features, "MORE_SOUNDBOARD") ? MORE_SOUND_SLOTS : BASE_SOUND_SLOTS;
    if (guild.premiumFeatures) return Math.max(floor, BASE_SOUND_SLOTS + (guild.premiumFeatures.additionalSoundSlots ?? 0));
    const tier = Math.min(3, Math.max(0, Math.trunc(Number(guild.premiumTier) || 0)));
    return Math.max(floor, SOUND_SLOTS_BY_TIER[tier]);
}

export function soundSlots(guild: GuildLimitsInput, sounds: readonly unknown[] | null | undefined) {
    const limit = soundSlotLimit(guild);
    const used = sounds?.length ?? 0;
    return { limit, used, left: Math.max(0, limit - used) };
}

// ---- Permissions --------------------------------------------------------------------------------

export function toBits(value: unknown): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
    return 0n;
}

export interface PermissionInput {
    guildId: string;
    ownerId?: string | null;
    userId: string;
    /** The member's role ids; @everyone (the guild id) is always counted */
    memberRoleIds: readonly string[];
    roles: readonly { id: string; permissions: unknown; }[] | Record<string, { id: string; permissions: unknown; }>;
}

/** The owner, Administrator, or Create or Manage Expressions from @everyone or one of their roles */
export function canAddSounds(input: PermissionInput): boolean {
    if (input.ownerId && input.ownerId === input.userId) return true;
    const roles = Array.isArray(input.roles) ? input.roles : Object.values(input.roles);
    const byId = new Map(roles.filter(r => r?.id).map(r => [r.id, r]));
    let perms = toBits(byId.get(input.guildId)?.permissions);
    for (const id of input.memberRoleIds) perms |= toBits(byId.get(id)?.permissions);
    return !!(perms & (ADMINISTRATOR | CREATE_GUILD_EXPRESSIONS | MANAGE_GUILD_EXPRESSIONS));
}

/**
 * The emoji the copy keeps: a Unicode one always, a custom one only if it's from the server the
 * sound goes to (`emojiGuildId` is where the custom emoji lives, if known).
 */
export function emojiFor(sound: Sound, targetGuildId: string, emojiGuildId?: string): { emojiId: string | null; emojiName: string | null; } {
    if (sound.emojiId) return emojiGuildId === targetGuildId ? { emojiId: sound.emojiId, emojiName: null } : { emojiId: null, emojiName: null };
    return { emojiId: null, emojiName: sound.emojiName || null };
}

// ---- Errors -------------------------------------------------------------------------------------

/** Discord's HTTP errors keep the reason in their body */
export function describeError(err: any, fallback = "Something went wrong"): string {
    const body = err?.body;
    if (body && typeof body === "object") {
        const detail = firstFieldError(body.errors);
        if (typeof body.message === "string" && body.message && body.message !== "Invalid Form Body") return detail ? `${body.message}: ${detail}` : body.message;
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
        for (const v of Object.values(value)) {
            const found = firstFieldError(v, depth + 1);
            if (found) return found;
        }
    }
}
