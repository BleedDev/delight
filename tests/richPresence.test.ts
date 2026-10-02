import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

import {
    formatTimer, fromLocalInput, httpsUrl, imageKeys, imageRef, imageUrls, isAppId, isStreamUrl, keySlot, newPreset, parseState, problems, startOfDay,
    toActivity, toLocalInput,
} from "../plugins/rich-presence/rpc";
import type { Preset } from "../plugins/rich-presence/rpc";
import { missingTranslations } from "../src/shared/pluginTranslations";

const APP = "1234567890123456789";
const preset = (change: Partial<Preset> = {}): Preset => ({ ...newPreset("a", "Mine"), name: "Valorant", ...change });
const times = { since: 1_000_000, now: 2_000_000 };

describe("Rich Presence Builder", () => {
    test("a preset becomes the activity a game's Rich Presence would send", () => {
        const p = preset({
            details: "Ranked", state: "In a match", largeImage: "https://example.com/big.png", largeText: "Map: Ascent",
            smallImage: "https://example.com/small.png", smallText: "Gold", partySize: 2, partyMax: 5,
            buttons: [{ label: "Watch", url: "https://twitch.tv/me" }, { label: "", url: "" }],
        });
        const activity = toActivity(p, APP, times, { "https://example.com/big.png": "mp:external/big", "https://example.com/small.png": "mp:external/small" });
        expect(activity).toEqual({
            application_id: APP, name: "Valorant", type: 0, flags: 1, details: "Ranked", state: "In a match",
            timestamps: { start: 1_000_000 },
            assets: { large_image: "mp:external/big", large_text: "Map: Ascent", small_image: "mp:external/small", small_text: "Gold" },
            buttons: ["Watch"], metadata: { button_urls: ["https://twitch.tv/me"] },
            party: { id: "evi-a", size: [2, 5] },
        });
    });

    test("pictures Discord didn't turn into assets, empty lines and a finished countdown are left out", () => {
        const activity = toActivity(preset({ largeImage: "https://example.com/x.png", details: "  ", timeMode: "end", time: 1_500_000 }), APP, times, {});
        expect(activity).toEqual({ application_id: APP, name: "Valorant", type: 0, flags: 1 });
        expect(toActivity(preset({ timeMode: "end", time: 3_000_000 }), APP, times, {}).timestamps).toEqual({ end: 3_000_000 });
        expect(toActivity(preset({ timeMode: "none" }), APP, times, {}).timestamps).toBeUndefined();
        expect(toActivity(preset({ timeMode: "localTime" }), APP, times, {}).timestamps).toEqual({ start: startOfDay(2_000_000) });
    });

    test("streaming carries its Twitch or YouTube link; other types use Discord's numbers", () => {
        expect(toActivity(preset({ type: "streaming", streamUrl: "https://www.twitch.tv/me" }), APP, times, {})).toMatchObject({ type: 1, url: "https://www.twitch.tv/me" });
        expect(toActivity(preset({ type: "listening" }), APP, times, {}).type).toBe(2);
        expect(toActivity(preset({ type: "watching" }), APP, times, {}).type).toBe(3);
        expect(toActivity(preset({ type: "competing" }), APP, times, {}).type).toBe(5);
    });

    test("Discord's limits: 128 characters of text, 32 per button, two buttons", () => {
        const long = "x".repeat(300);
        const activity = toActivity(preset({
            name: long, buttons: [1, 2, 3].map(n => ({ label: `${n}${long}`, url: `https://example.com/${n}` })),
        }), APP, times, {});
        expect((activity.name as string).length).toBe(128);
        expect(activity.buttons).toHaveLength(2);
        expect((activity.buttons as string[])[0]).toHaveLength(32);
    });

    test("what's wrong with a preset is said before it's shown", () => {
        expect(problems(preset(), APP)).toEqual([]);
        expect(problems(preset(), "")).toEqual(["noAppId"]);
        expect(problems(preset({ name: " " }), APP)).toEqual(["noName"]);
        expect(problems(preset({ largeImage: "http://example.com/a.png", smallImage: "javascript:alert(1)" }), APP)).toEqual(["badLargeImage", "badSmallImage"]);
        expect(problems(preset({ type: "streaming", streamUrl: "https://example.com" }), APP)).toEqual(["badStreamUrl"]);
        expect(problems(preset({ buttons: [{ label: "", url: "https://a.com" }, { label: "Go", url: "ftp://a.com" }] }), APP)).toEqual(["buttonLabel", "buttonUrl"]);
        expect(problems(preset({ partySize: 6, partyMax: 5 }), APP)).toEqual(["badParty"]);
        expect(problems(preset({ timeMode: "start", time: 0 }), APP)).toEqual(["noTime"]);
    });

    test("links: https only, no credentials; streams only on Twitch or YouTube; IDs are snowflakes", () => {
        expect(httpsUrl(" https://example.com/a.png ")).toBe("https://example.com/a.png");
        expect(httpsUrl("http://example.com")).toBeUndefined();
        expect(httpsUrl("https://user:pw@example.com")).toBeUndefined();
        expect(httpsUrl("data:image/png;base64,AAAA")).toBeUndefined();
        expect(isStreamUrl("https://youtube.com/watch?v=1")).toBe(true);
        expect(isStreamUrl("https://youtu.be/1")).toBe(true);
        expect(isStreamUrl("https://twitch.tv.evil.com/x")).toBe(false);
        expect(isAppId(APP)).toBe(true);
        expect(isAppId("12345")).toBe(false);
        expect(imageUrls(preset({ largeImage: "https://a.com/1.png", smallImage: "nope" }))).toEqual(["https://a.com/1.png"]);
    });

    test("saved presets are read back safely, whatever was stored", () => {
        expect(parseState(undefined)).toEqual({ presets: [], active: "" });
        expect(parseState("not json")).toEqual({ presets: [], active: "" });
        const state = parseState({
            presets: [{ id: "a", name: "x".repeat(500), type: "dancing", buttons: [{ label: "a" }, {}, {}], partySize: -3, timeMode: "end", time: "soon" }, { id: "a" }, { name: "no id" }],
            active: "missing",
        });
        expect(state.presets).toHaveLength(1);
        expect(state.presets[0]).toMatchObject({ id: "a", type: "playing", partySize: 0, timeMode: "end", time: 0 });
        expect(state.presets[0].name).toHaveLength(128);
        expect(state.presets[0].buttons).toHaveLength(2);
        expect(state.active).toBe("");
        expect(parseState(JSON.stringify({ presets: [preset()], active: "a" })).active).toBe("a");
    });

    test("timers read like Discord's, and the date field round-trips", () => {
        expect(formatTimer(65_000)).toBe("01:05");
        expect(formatTimer(3_723_000)).toBe("1:02:03");
        expect(formatTimer(-5)).toBe("00:00");
        const at = new Date(2026, 9, 2, 14, 30).getTime();
        expect(fromLocalInput(toLocalInput(at))).toBe(at);
        expect(toLocalInput(0)).toBe("");
    });

    test("every string and the manifest are in all of Evi's languages", () => {
        const dir = "plugins/rich-presence";
        const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
        const code = ["index.tsx", "strings.ts", "rpc.ts"].map(f => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
        expect(missingTranslations(manifest, code)).toEqual([]);
        expect(manifest.enabledByDefault).toBe(false);
    });

    test("a picture is an https link or an art asset key; keys go out as their asset ids", () => {
        expect(imageRef("https://example.com/a.png")).toEqual({ kind: "url", url: "https://example.com/a.png" });
        expect(imageRef("logo")).toEqual({ kind: "key", key: "logo" });
        expect(imageRef("big_logo-2")).toEqual({ kind: "key", key: "big_logo-2" });
        expect(imageRef("http://example.com/a.png")).toBeUndefined();
        expect(imageRef("not a key")).toBeUndefined();
        const p = preset({ largeImage: "Logo", smallImage: "https://example.com/s.png" });
        expect(problems(p, "123456789012345678")).toEqual([]);
        expect(imageUrls(p)).toEqual(["https://example.com/s.png"]);
        expect(imageKeys(p)).toEqual(["Logo"]);
        const assets = { [keySlot("Logo")]: "111", "https://example.com/s.png": "mp:external/abc" };
        const a = toActivity(p, "123456789012345678", times, assets) as any;
        expect(a.assets.large_image).toBe("111");
        expect(a.assets.small_image).toBe("mp:external/abc");
        // An unknown key is left out, like Discord's RPC server does
        expect((toActivity(preset({ largeImage: "missing" }), "123456789012345678", times, {}) as any).assets).toBeUndefined();
    });

    test("with no name, the application's own name shows", () => {
        const p = preset({ name: "" });
        expect(problems(p, "123456789012345678")).toEqual(["noName"]);
        expect(problems(p, "123456789012345678", "My Game")).toEqual([]);
        expect((toActivity(p, "123456789012345678", times, {}, "My Game") as any).name).toBe("My Game");
        expect((toActivity(preset({ name: "Custom" }), "123456789012345678", times, {}, "My Game") as any).name).toBe("Custom");
    });

    test("no default application: everyone brings their own", () => {
        const code = readFileSync("plugins/rich-presence/index.tsx", "utf8");
        expect(code).not.toContain("DEFAULT_APP_ID");
    });
});
