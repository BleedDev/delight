import { describe, expect, test } from "bun:test";

import { copyText, gradient, hasDetails, hex, nameStyleOf, profileDetails, toInt } from "../plugins/view-icons/details";

describe("View Icons: profile details", () => {
    test("colours as Discord stores them become hex", () => {
        expect(hex(0xff00aa)).toBe("#ff00aa");
        expect(hex(0)).toBe("#000000");
        expect(hex(-1)).toBeUndefined();
        expect(hex("#fff")).toBeUndefined();
    });

    test("a Nitro profile: theme, banner colour, name style, nameplate", () => {
        const d = profileDetails(
            { displayNameStyles: { fontId: 3, effectId: 2, colors: [0x5865f2, 0xeb459e] }, collectibles: { nameplate: { label: "Koi Pond", asset: "nameplates/koi_pond/" } } },
            { themeColors: [0x112233, 0x445566], accentColor: 0xabcdef },
        );
        expect(d).toEqual({
            theme: { primary: "#112233", accent: "#445566" },
            bannerColor: "#abcdef",
            nameStyle: { font: "Cherry Bomb", effect: "Gradient", colors: ["#5865f2", "#eb459e"], raw: { fontId: 3, effectId: 2, colors: [0x5865f2, 0xeb459e] } },
            nameplate: { name: "Koi Pond" },
        });
        expect(hasDetails(d)).toBe(true);
    });

    test("a plain profile has nothing, and half-set colours still show", () => {
        expect(hasDetails(profileDetails({ username: "a" }, null))).toBe(false);
        expect(profileDetails({}, { themeColors: [null, 0x445566] }).theme).toEqual({ primary: "#445566", accent: "#445566" });
    });

    test("name styles from the API's snake case, unknown ids named by number, nameplate from its asset", () => {
        expect(nameStyleOf({ font_id: 99, effect_id: 1, colors: [0xffffff] })).toEqual({ font: "Font 99", effect: "Solid", colors: ["#ffffff"], raw: { fontId: 99, effectId: 1, colors: [0xffffff] } });
        expect(nameStyleOf({ colors: [] })).toBeUndefined();
        expect(profileDetails({ collectibles: { nameplate: { label: "COLLECTIBLES_X", asset: "nameplates/twilight_garden/" } } }, null).nameplate).toEqual({ name: "Twilight Garden" });
    });

    test("colours copy without the #, Discord's fields add it; the nameplate keeps its shop id", () => {
        expect(copyText("#dd1515")).toBe("dd1515");
        expect(toInt("#dd1515")).toBe(0xdd1515);
        expect(profileDetails({ collectibles: { nameplate: { label: "Koi Pond", skuId: "1349849614353829990" } } }, null).nameplate).toEqual({ name: "Koi Pond", skuId: "1349849614353829990" });
    });

    test("gradients", () => {
        expect(gradient(["#111111"])).toBe("#111111");
        expect(gradient(["#111111", "#222222"], 90)).toBe("linear-gradient(90deg, #111111, #222222)");
    });
});
