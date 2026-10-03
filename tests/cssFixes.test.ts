import { describe, expect, test } from "bun:test";

import { compoundsOf, isAnchored, isSmallBlur, isStateOf, isUnanchoredHas, raiseTint, splitSelectorList, TINT_ALPHA, unblur } from "../src/renderer/cssFixes";

// Every :has() selector in Discord's web stylesheets (crawled 2026-10-03)
import discordHas from "./fixtures/discord-has-selectors.json";

describe("selectors", () => {
    test("lists split on top-level commas only", () => {
        expect(splitSelectorList(".a:is(.b, .c), [data-x=\"1,2\"] .d")).toEqual([".a:is(.b, .c)", "[data-x=\"1,2\"] .d"]);
    });

    test("compounds keep their combinators", () => {
        expect(compoundsOf(".a > .b:has(+ .c) ~ d e")).toEqual([
            { combinator: "", compound: ".a" },
            { combinator: ">", compound: ".b:has(+ .c)" },
            { combinator: "~", compound: "d" },
            { combinator: " ", compound: "e" },
        ]);
    });

    test("anchored by a class, id, attribute, tag or the root", () => {
        for (const c of [".a:has(*)", "#x:has(*)", "[data-x]:has(*)", "footer:has(> .b)", ":root:has(.modal)", ":where(.a):has(.b)", ":is(.a, b):has(*)"]) expect(isAnchored(c)).toBe(true);
        for (const c of [":has(*)", ":not(:has(*)):not(:empty)", ":not(.a):has(*)", "*:has(.a)", ":is(.a, :hover):has(*)"]) expect(isAnchored(c)).toBe(false);
    });
});

describe("unanchored :has()", () => {
    test("catches Discord's staff text highlighter", () => {
        expect(isUnanchoredHas("[data-text-variant] :not(:has(*)):not(:empty)")).toBe(true);
        expect(isUnanchoredHas(":not([data-text-variant]):not([data-mana-composed] *):not(:has(*)):not(:empty):not(script)")).toBe(true);
    });

    test("catches universal subjects anywhere in the chain", () => {
        expect(isUnanchoredHas(":has(.a)")).toBe(true);
        expect(isUnanchoredHas(".app :has(> img)")).toBe(true);
        expect(isUnanchoredHas("*:has(.a) .b")).toBe(true);
        // A child of something itself unanchored is no better
        expect(isUnanchoredHas(":hover > :has(.a)")).toBe(true);
    });

    test("leaves children and siblings of an anchored compound alone", () => {
        expect(isUnanchoredHas(".container > :has(.editButton)")).toBe(false);
        expect(isUnanchoredHas(".a + :has(.b)")).toBe(false);
        expect(isUnanchoredHas(".a > b > :has(.c)")).toBe(false);
    });

    test("keeps every one of Discord's other :has() rules", () => {
        const flagged = (discordHas as string[]).flatMap(splitSelectorList).filter(isUnanchoredHas);
        expect(flagged).toHaveLength(2);
        expect(flagged.every(s => s.includes(":not(:has(*))"))).toBe(true);
        expect((discordHas as string[]).length).toBeGreaterThan(90);
    });
});

/** A CSSStyleDeclaration's surface, enough for the blur fix */
function declarations(init: Record<string, string>) {
    const values = new Map<string, { value: string; priority: string; }>();
    for (const [k, v] of Object.entries(init)) {
        const [value, priority = ""] = v.split(" !");
        values.set(k, { value, priority });
    }
    return {
        values,
        getPropertyValue: (p: string) => values.get(p)?.value ?? "",
        getPropertyPriority: (p: string) => values.get(p)?.priority ?? "",
        setProperty(p: string, value: string | null, priority?: string) {
            values.set(p, { value: value ?? "", priority: priority ?? "" });
        },
        removeProperty(p: string) {
            const old = values.get(p)?.value ?? "";
            values.delete(p);
            return old;
        },
    };
}
const supportsColor = (v: string) => /^(rgba?\(|#|black|white)/.test(v);

describe("backdrop blur over video", () => {
    test("only a small blur on its own", () => {
        expect(isSmallBlur("blur(4px)")).toBe(true);
        expect(isSmallBlur("blur(2px)")).toBe(true);
        expect(isSmallBlur("blur(8px)")).toBe(false);
        expect(isSmallBlur("brightness(60%) blur(4px)")).toBe(false);
        expect(isSmallBlur("blur(var(--x))")).toBe(false);
        expect(isSmallBlur("blur(0px)")).toBe(false);
    });

    test("the user panel's muted button over a nameplate: blur out, the same color near-opaque, still !important", () => {
        const style = declarations({ "backdrop-filter": "blur(4px)", "-webkit-backdrop-filter": "blur(4px)", "background-color": "var(--custom-nameplate-neutral) !important" });
        expect(unblur(style, supportsColor)).toBe(true);
        expect(style.values.has("backdrop-filter")).toBe(false);
        expect(style.values.has("-webkit-backdrop-filter")).toBe(false);
        expect(style.values.get("background-color")).toEqual({ value: `rgb(from var(--custom-nameplate-neutral) r g b / max(alpha, ${TINT_ALPHA}))`, priority: "important" });
    });

    test("a stream tile's control: the background shorthand", () => {
        const style = declarations({ "backdrop-filter": "blur(2px)", background: "var(--background-scrim)" });
        expect(unblur(style, supportsColor)).toBe(true);
        expect(style.getPropertyValue("background")).toBe(`rgb(from var(--background-scrim) r g b / max(alpha, ${TINT_ALPHA}))`);
    });

    test("leaves blurs without a plain background alone: nothing to stand in for them", () => {
        const none = declarations({ "backdrop-filter": "blur(4px)" });
        expect(unblur(none, supportsColor)).toBe(false);
        expect(none.getPropertyValue("backdrop-filter")).toBe("blur(4px)");
        const gradient = declarations({ "backdrop-filter": "blur(4px)", background: "linear-gradient(red, blue)" });
        expect(unblur(gradient, supportsColor)).toBe(false);
        const big = declarations({ "backdrop-filter": "blur(12px)", background: "var(--x)" });
        expect(unblur(big, supportsColor)).toBe(false);
    });

    test("plain colors count, mixes and images don't", () => {
        const plain = declarations({ "background-color": "rgba(0, 0, 0, 0.22)" });
        expect(raiseTint(plain, supportsColor)).toBe(true);
        expect(raiseTint(declarations({ background: "url(x.png)" }), supportsColor)).toBe(false);
        expect(raiseTint(declarations({ background: "color-mix(in oklab, var(--a) 50%, transparent)" }), supportsColor)).toBe(false);
    });

    test("the states of an unblurred rule", () => {
        expect(isStateOf(".plateMuted_x:hover", ".plateMuted_x")).toBe(true);
        expect(isStateOf(".a::after", ".a")).toBe(false);
        expect(isStateOf(".a .b:hover", ".a")).toBe(false);
        expect(isStateOf(".ab:hover", ".a")).toBe(false);
        expect(isStateOf(".a", ".a")).toBe(false);
    });
});
