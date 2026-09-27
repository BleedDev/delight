import { describe, expect, test } from "bun:test";

import {
    ACTIVE_CLASS, ALL_CLASSES, autoActive, bodyClasses, buildCss, HOVER_CLASS, IN_DM_CLASS, matchesHotkey, optionClass,
    parseHotkey, SELECTORS, shouldActivate, toggledOverride, transitionMessage,
} from "../plugins/streamer-mode-plus/state";
import type { BlurOptions } from "../plugins/streamer-mode-plus/state";

const none = { streaming: false, streamerMode: false };
const live = { streaming: true, streamerMode: false };
const sm = { streaming: false, streamerMode: true };

describe("activation", () => {
    test("modes", () => {
        expect(autoActive("always", none)).toBe(true);
        expect(autoActive("streaming", live)).toBe(true);
        expect(autoActive("streaming", sm)).toBe(false);
        expect(autoActive("streamerMode", sm)).toBe(true);
        expect(autoActive("streamerMode", live)).toBe(false);
        expect(autoActive("either", live)).toBe(true);
        expect(autoActive("either", sm)).toBe(true);
        expect(autoActive("either", none)).toBe(false);
    });

    test("override wins", () => {
        expect(shouldActivate("streaming", none, "on")).toBe(true);
        expect(shouldActivate("always", none, "off")).toBe(false);
        expect(shouldActivate("streaming", live, null)).toBe(true);
        expect(shouldActivate("streaming", live)).toBe(true);
    });

    test("toggle flips what's showing", () => {
        expect(toggledOverride(true)).toBe("off");
        expect(toggledOverride(false)).toBe("on");
    });
});

const opts: BlurOptions = { dms: true, servers: true, channels: false, media: true, chatAvatars: false, members: false, dmContent: true, hoverReveal: true };

describe("body classes", () => {
    test("nothing when inactive", () => {
        expect(bodyClasses(false, opts, true)).toEqual([]);
    });

    test("active with options", () => {
        const c = bodyClasses(true, opts, false);
        expect(c[0]).toBe(ACTIVE_CLASS);
        expect(c).toContain("evi-smp-dms");
        expect(c).toContain("evi-smp-servers");
        expect(c).toContain("evi-smp-media");
        expect(c).toContain("evi-smp-dm-content");
        expect(c).toContain(HOVER_CLASS);
        expect(c).not.toContain("evi-smp-channels");
        expect(c).not.toContain(IN_DM_CLASS);
    });

    test("in-dm class only with dmContent", () => {
        expect(bodyClasses(true, opts, true)).toContain(IN_DM_CLASS);
        expect(bodyClasses(true, { ...opts, dmContent: false }, true)).not.toContain(IN_DM_CLASS);
    });

    test("no hover class when reveal is off", () => {
        expect(bodyClasses(true, { ...opts, hoverReveal: false }, false)).not.toContain(HOVER_CLASS);
    });

    test("every class is listed for cleanup", () => {
        const all = bodyClasses(true, { dms: true, servers: true, channels: true, media: true, chatAvatars: true, members: true, dmContent: true, hoverReveal: true }, true);
        for (const c of all) expect(ALL_CLASSES).toContain(c);
        expect(optionClass("chatAvatars")).toBe("evi-smp-chat-avatars");
    });
});

describe("css", () => {
    const css = buildCss({ blur: 10 });

    test("blur amount, clamped", () => {
        expect(css).toContain("blur(10px)");
        expect(buildCss({ blur: 500 })).toContain("blur(40px)");
        expect(buildCss({ blur: Number.NaN })).toContain("blur(8px)");
        expect(buildCss({ blur: 0 })).toContain("blur(1px)");
    });

    test("every option is scoped to its class", () => {
        for (const key of Object.keys(SELECTORS) as (keyof typeof SELECTORS)[]) {
            expect(css).toContain(`body.${ACTIVE_CLASS}.${optionClass(key)}`);
            for (const sel of SELECTORS[key]) expect(css).toContain(sel);
        }
        expect(css).toContain(`.${optionClass("dmContent")}.${IN_DM_CLASS}`);
    });

    test("hover reveal and reduced motion", () => {
        expect(css).toContain(`body.${HOVER_CLASS}.${ACTIVE_CLASS}`);
        expect(css).toContain(":hover");
        expect(css).toContain("filter: none");
        expect(css).toContain("prefers-reduced-motion: reduce");
        expect(css).toContain("transition: filter");
    });

    test("balanced braces and parens", () => {
        const count = (s: string, c: string) => s.split(c).length - 1;
        expect(count(css, "{")).toBe(count(css, "}"));
        expect(count(css, "(")).toBe(count(css, ")"));
    });

    test("nothing applies without the active class", () => {
        for (const line of css.split("\n").filter(l => l.includes("filter: blur"))) expect(line).toContain(`.${ACTIVE_CLASS}`);
    });
});

describe("hotkey", () => {
    const ev = (key: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) =>
        ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

    test("parses", () => {
        expect(parseHotkey("Ctrl+Shift+S")).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: "s" });
        expect(parseHotkey(" alt + F9 ")).toEqual({ ctrl: false, shift: false, alt: true, meta: false, key: "f9" });
        expect(parseHotkey("")).toBeUndefined();
        expect(parseHotkey("Ctrl+Shift")).toBeUndefined();
        expect(parseHotkey("A+B")).toBeUndefined();
    });

    test("matches exactly", () => {
        const hk = parseHotkey("Ctrl+Shift+S");
        expect(matchesHotkey(hk, ev("S", { ctrlKey: true, shiftKey: true }))).toBe(true);
        expect(matchesHotkey(hk, ev("s", { ctrlKey: true }))).toBe(false);
        expect(matchesHotkey(hk, ev("s", { ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
        expect(matchesHotkey(undefined, ev("s"))).toBe(false);
    });
});

test("toast messages", () => {
    expect(transitionMessage(true, "streaming")).toBe("Streamer Mode+ on: you're streaming");
    expect(transitionMessage(false, "streaming")).toBe("Streamer Mode+ off: stream ended");
    expect(transitionMessage(true, "streamerMode")).toContain("Streamer Mode is on");
    expect(transitionMessage(false, "manual")).toBe("Streamer Mode+ off");
});
