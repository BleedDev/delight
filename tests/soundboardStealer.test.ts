import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { whyNotPermissions } from "../src/shared/declaredPermissions";
import { missingTranslations } from "../src/shared/pluginTranslations";
import {
    audioKind, canAddSounds, CREATE_GUILD_EXPRESSIONS, describeError, emojiFor, fileName, isDefaultSound, isValidSoundName, MANAGE_GUILD_EXPRESSIONS,
    parseSoundMarkup, sanitizeSoundName, soundFromObject, soundsFromMenuProps, soundSlotLimit, soundSlots, soundUrl,
} from "../plugins/soundboard-stealer/sound";

const DIR = join(import.meta.dir, "../plugins/soundboard-stealer");

// Verbatim from Discord's web build (2026-10-02): the sound creator the plugin finds by its code,
// and the sound editor next to it, which must not match
const CREATE = "async function N(e){let{guildId:t,name:n,sound:i,volume:r,emojiId:s,emojiName:l}=e,o=await a.Bo.post({url:I.Rsh.GUILD_SOUNDBOARD_SOUNDS(t),body:{name:n,sound:i,volume:r,emoji_id:s,emoji_name:l},rejectWithError:(0,a.fT)()});return(0,A.N0)(o.body,t)}";
const UPDATE = "async function C(e){let{guildId:t,soundId:n,name:i,volume:r,emojiId:s,emojiName:l}=e,o=await a.Bo.patch({url:I.Rsh.GUILD_SOUNDBOARD_SOUND(t,n),body:{name:i,volume:r,emoji_id:s,emoji_name:l},rejectWithError:(0,a.fT)()});return(0,A.N0)(o.body,t)}";

describe("Soundboard Stealer", () => {
    test("finds Discord's sound creator and not its editor", () => {
        const matches = (src: string) => [".GUILD_SOUNDBOARD_SOUNDS(", "emoji_name:"].every(s => src.includes(s));
        expect(matches(CREATE)).toBe(true);
        expect(matches(UPDATE)).toBe(false);
        expect(readFileSync(join(DIR, "index.tsx"), "utf8")).toContain('findByCode(".GUILD_SOUNDBOARD_SOUNDS(", "emoji_name:")');
    });

    test("reads the sound button's menu and messages sharing sounds", () => {
        const sound = { soundId: "1234567890123", guildId: "42", name: "bruh", volume: 0.6, emojiId: null, emojiName: "💀" };
        expect(soundsFromMenuProps({ sound, soundGuild: {} }, () => undefined)).toEqual([{ ...sound }]);

        const known: Record<string, any> = { "777": { soundId: "777", guildId: "9", name: "airhorn", volume: 2 } };
        const message = { content: "listen <sound:9:777> and <sound:9:888> <sound:9:777>" };
        expect(soundsFromMenuProps({ message }, id => known[id])).toEqual([
            { soundId: "777", guildId: "9", name: "airhorn", volume: 1, emojiId: null, emojiName: null },
            { soundId: "888", guildId: "9", volume: 1 },
        ]);
        expect(soundsFromMenuProps({ message: { content: "no sounds" } }, () => undefined)).toEqual([]);
        expect(soundsFromMenuProps({}, () => undefined)).toEqual([]);
        expect(parseSoundMarkup("<sound:0:1>")).toEqual([{ guildId: "0", soundId: "1" }]);
        expect(soundFromObject({ sound_id: "5", guild_id: "6", volume: -1 })).toMatchObject({ soundId: "5", guildId: "6", volume: 0 });
        expect(soundFromObject({ name: "no id" })).toBeUndefined();
        expect(soundUrl("5")).toBe("https://cdn.discordapp.com/soundboard-sounds/5");
        expect(isDefaultSound("0")).toBe(true);
        expect(isDefaultSound("42")).toBe(false);
    });

    test("tells MP3 from Ogg by their bytes, and names files safely", () => {
        expect(audioKind(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))?.ext).toBe("ogg");
        expect(audioKind(new Uint8Array([0x49, 0x44, 0x33, 4]))?.ext).toBe("mp3");
        expect(audioKind(new Uint8Array([0xff, 0xfb, 0x90]))?.ext).toBe("mp3");
        expect(audioKind(new Uint8Array([1, 2, 3]), "audio/ogg")?.mime).toBe("audio/ogg");
        expect(audioKind(new Uint8Array([1, 2, 3]), "text/html")).toBeUndefined();
        expect(fileName('a/b:c*?"<>|', "sound", "mp3")).toBe("abc.mp3");
        expect(fileName("  ...  ", "sound", "ogg")).toBe("sound.ogg");
        expect(fileName("vine boom.", "sound", "mp3")).toBe("vine boom.mp3");
    });

    test("names are 2 to 32 characters", () => {
        expect(sanitizeSoundName("  big   bruh  ")).toBe("big bruh");
        expect(sanitizeSoundName("x")).toBe("x_");
        expect(sanitizeSoundName("a".repeat(40))).toHaveLength(32);
        expect(isValidSoundName("ok")).toBe(true);
        expect(isValidSoundName(" a ")).toBe(false);
        expect(isValidSoundName("a".repeat(33))).toBe(false);
    });

    test("slots follow Discord: 8, its extra sound slots, or 200 with MORE_SOUNDBOARD", () => {
        expect(soundSlotLimit({ premiumFeatures: { additionalSoundSlots: 0 } })).toBe(8);
        expect(soundSlotLimit({ premiumFeatures: { additionalSoundSlots: 40 }, premiumTier: 1 })).toBe(48);
        expect(soundSlotLimit({ features: new Set(["MORE_SOUNDBOARD"]), premiumFeatures: { additionalSoundSlots: 0 } })).toBe(200);
        // No premiumFeatures from Discord: the boost tiers
        expect(soundSlotLimit({ premiumTier: 0 })).toBe(8);
        expect(soundSlotLimit({ premiumTier: 2 })).toBe(36);
        expect(soundSlotLimit({ premiumTier: 9 })).toBe(48);
        expect(soundSlots({ premiumTier: 1 }, new Array(20))).toEqual({ limit: 24, used: 20, left: 4 });
        expect(soundSlots({ premiumTier: 0 }, new Array(12)).left).toBe(0);
    });

    test("who can add sounds", () => {
        const base = { guildId: "g", userId: "me", memberRoleIds: ["r"] };
        expect(canAddSounds({ ...base, ownerId: "me", roles: [] })).toBe(true);
        expect(canAddSounds({ ...base, roles: [{ id: "r", permissions: String(CREATE_GUILD_EXPRESSIONS) }] })).toBe(true);
        expect(canAddSounds({ ...base, roles: { g: { id: "g", permissions: MANAGE_GUILD_EXPRESSIONS } } })).toBe(true);
        expect(canAddSounds({ ...base, roles: [{ id: "r", permissions: 8 }] })).toBe(true);
        expect(canAddSounds({ ...base, roles: [{ id: "r", permissions: "2048" }, { id: "other", permissions: String(CREATE_GUILD_EXPRESSIONS) }] })).toBe(false);
    });

    test("a custom emoji only goes along to its own server", () => {
        const custom = { soundId: "1", volume: 1, emojiId: "55", emojiName: "pog" };
        expect(emojiFor(custom, "target", "target")).toEqual({ emojiId: "55", emojiName: null });
        expect(emojiFor(custom, "target", "elsewhere")).toEqual({ emojiId: null, emojiName: null });
        expect(emojiFor({ soundId: "1", volume: 1, emojiName: "🔥" }, "target")).toEqual({ emojiId: null, emojiName: "🔥" });
    });

    test("shows Discord's reason", () => {
        expect(describeError({ body: { message: "Invalid Form Body", errors: { sound: { _errors: [{ message: "Sound too long" }] } } } })).toBe("Sound too long");
        expect(describeError({ body: { message: "Maximum number of sounds reached (8)" } })).toBe("Maximum number of sounds reached (8)");
        expect(describeError(new Error("offline"))).toBe("offline");
        expect(describeError(undefined, "fallback")).toBe("fallback");
    });

    test("manifest and strings are complete in every language, permissions valid", () => {
        const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
        const code = readFileSync(join(DIR, "strings.ts"), "utf8") + readFileSync(join(DIR, "index.tsx"), "utf8");
        expect(missingTranslations(manifest, code)).toEqual([]);
        expect(whyNotPermissions(manifest.permissions)).toBeUndefined();
        expect(manifest).toMatchObject({ id: "soundboard-stealer", version: "1.0.0", authors: ["Evi"], enabledByDefault: false });
    });
});
