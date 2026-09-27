import { describe, expect, test } from "bun:test";

import { isDiscordId, parseBadges } from "../src/shared/badges";
import { imageDataUrl, imageType } from "../src/shared/images";

const icon = "https://evi.rest/badges/dev.png?v=abc";

describe("badge list from the server", () => {
    test("keeps well-formed badges and users holding them", () => {
        const doc = parseBadges({
            badges: { dev: { name: "Developer", description: "Builds Evi", icon } },
            users: { "123456789012345678": ["dev"] },
        });
        expect(doc).toEqual({ badges: { dev: { name: "Developer", description: "Builds Evi", icon } }, users: { "123456789012345678": ["dev"] } });
    });

    test("drops what the page shouldn't get: bad ids, non-https icons, unknown badges, non-Discord users", () => {
        const doc = parseBadges({
            badges: {
                dev: { name: "Developer", icon },
                "../x": { name: "Bad id", icon },
                plain: { name: "Http", icon: "http://evi.rest/x.png" },
                script: { name: "Script", icon: "javascript:alert(1)" },
                blank: { name: "  ", icon },
            },
            users: { "123456789012345678": ["dev", "plain", "nope"], "not-a-user": ["dev"], "876543210987654321": ["plain"] },
        });
        expect(Object.keys(doc!.badges)).toEqual(["dev"]);
        expect(doc!.badges.dev.description).toBe("");
        expect(doc!.users).toEqual({ "123456789012345678": ["dev"] });
    });

    test("garbage is rejected, not thrown", () => {
        expect(parseBadges(null)).toBeUndefined();
        expect(parseBadges({ badges: [] })).toBeUndefined();
        expect(parseBadges("x")).toBeUndefined();
    });

    test("Discord ids", () => {
        expect(isDiscordId("123456789012345678")).toBe(true);
        expect(isDiscordId("1234")).toBe(false);
        expect(isDiscordId("12345678901234567a")).toBe(false);
    });
});

describe("images", () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));

    test("recognised by their bytes, not their name", () => {
        expect(imageType(png)?.type).toBe("image/png");
        expect(imageType(new TextEncoder().encode("GIF89a..."))?.ext).toBe("gif");
        expect(imageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeUndefined();
        expect(imageType(new TextEncoder().encode("RIFF0000WAVE"))).toBeUndefined();
    });

    test("data URLs only for images", () => {
        expect(imageDataUrl(png)).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...png))}`);
        expect(imageDataUrl(new TextEncoder().encode("<html>"))).toBeUndefined();
    });
});
