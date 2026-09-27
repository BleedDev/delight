import { describe, expect, test } from "bun:test";

import { arrange, isDiscordId, oursFromDiscord, parseBadgeEvents, parseBadges, splitSettings } from "../src/shared/badges";
import { isSupporterBadge, nextSupporterTier, SUPPORTER_TIERS, supportedDays, supporterTier } from "../src/shared/supporter";
import { imageDataUrl, imageType } from "../src/shared/images";

const icon = "https://evi.rest/badges/dev.png?v=abc";

describe("badge list from the server", () => {
    test("keeps well-formed badges and users holding them", () => {
        const doc = parseBadges({
            badges: { dev: { name: "Developer", description: "Builds Evi", icon } },
            users: { "123456789012345678": ["dev"] },
        });
        expect(doc).toEqual({ badges: { dev: { name: "Developer", description: "Builds Evi", icon } }, users: { "123456789012345678": ["dev"] }, supporters: {}, prefs: {} });
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

describe("supporters", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 8, 27);

    test("the list keeps a since date only for users it shows", () => {
        const doc = parseBadges({
            badges: { "supporter-gold": { name: "Gold Supporter", icon } },
            users: { "123456789012345678": ["supporter-gold"] },
            supporters: { "123456789012345678": now - 200 * DAY, "876543210987654321": now, "123456789012345679": "soon" },
        });
        expect(doc!.supporters).toEqual({ "123456789012345678": now - 200 * DAY });
        // Servers from before supporters leave it out
        expect(parseBadges({ badges: {}, users: {} })!.supporters).toEqual({});
    });

    test("levels by days supported, granted time included", () => {
        expect(supporterTier(now, now).badge).toBe("supporter-bronze");
        expect(supporterTier(now - 29 * DAY, now).badge).toBe("supporter-bronze");
        expect(supporterTier(now - 30 * DAY, now).badge).toBe("supporter-silver");
        expect(supporterTier(now - 300 * DAY, now).badge).toBe("supporter-ruby")
        // A year is the top
        expect(supporterTier(now - 365 * DAY, now).badge).toBe("supporter-prismatic");
        expect(supporterTier(now - 4000 * DAY, now).badge).toBe("supporter-prismatic");
        // A start date in the future (time taken away) is just day 0
        expect(supportedDays(now + 10 * DAY, now)).toBe(0);
        expect(nextSupporterTier(now - 100 * DAY, now)).toEqual({ tier: SUPPORTER_TIERS[4], at: now - 100 * DAY + 122 * DAY });
        expect(nextSupporterTier(now - 4000 * DAY, now)).toBeUndefined();
        expect(isSupporterBadge("supporter-ruby")).toBe(true);
        expect(isSupporterBadge("developer")).toBe(false);
    });
});

describe("hiding and ordering in Discord's badge settings", () => {
    const user = "123456789012345678";

    test("the list keeps a user's arrangement, cleaned", () => {
        const doc = parseBadges({
            badges: { dev: { name: "Developer", icon } },
            users: { [user]: ["dev"] },
            prefs: { [user]: { order: [22, "dev", 1.5, "../x", 1], hidden: ["dev", 7] }, "876543210987654321": { order: [1], hidden: [] } },
        });
        expect(doc!.prefs).toEqual({ [user]: { order: [22, "dev", 1], hidden: ["dev"] } });
    });

    test("ours go among Discord's in the saved order, in front without one", () => {
        const theirs = [{ t: 1 }, { t: 5 }, { t: 22 }];
        const ours = [{ k: "dev" }, { k: "supporter" }];
        const run = (order: (number | string)[]) => arrange<any>(theirs, ours, o => o.k, o => o.t, order).map(o => o.t ?? o.k);
        expect(run([])).toEqual(["dev", "supporter", 1, 5, 22]);
        expect(run([1, "dev", 5, "supporter", 22])).toEqual([1, "dev", 5, "supporter", 22]);
        expect(run([22, 5, 1, "supporter"])).toEqual(["dev", 1, 5, 22, "supporter"]);
        // Not in the order at all: before the first of Discord's that is
        expect(run([5, 22])).toEqual([1, "dev", "supporter", 5, 22]);
        expect(arrange<any>(theirs, [], o => o.k, o => o.t, [1])).toBe(theirs);
    });

    test("the settings save is split: Discord gets its own, evi.rest gets ours", () => {
        const { body, prefs } = splitSettings({ display_order: [1, "evi-dev", 5, "evi-supporter"], hidden_badges: ["evi-dev", 22], other: true });
        expect(body).toEqual({ display_order: [1, 5], hidden_badges: [22], other: true });
        expect(prefs).toEqual({ order: [1, "dev", 5, "supporter"], hidden: ["dev"] });
        // Only what's there is touched
        expect(splitSettings({ hidden_badges: new Set([22]) })).toEqual({ body: { hidden_badges: [22] }, prefs: { hidden: [] } });
        expect(oursFromDiscord(["evi-dev", "nope", 3])).toEqual(["dev", 3]);
    });

    test("plugins' badges in the directory are saved nowhere", () => {
        const { body, prefs } = splitSettings({ display_order: ["evi-plugin-last-seen", 1, "evi-dev"], hidden_badges: ["evi-plugin-platform-web"] });
        expect(body).toEqual({ display_order: [1], hidden_badges: [] });
        expect(prefs).toEqual({ order: [1, "dev"], hidden: [] });
    });
});

describe("change stream events", () => {
    test("reads the etags of badges events, ignoring the rest", () => {
        expect(parseBadgeEvents(`retry: 15000\nevent: badges\ndata: {"etag":"\\"a\\""}\n\n: ping\n\nevent: other\ndata: {"etag":"x"}\n\nevent: badges\r\ndata: {"etag":"\\"b\\""}`)).toEqual(["\"a\"", "\"b\""]);
        expect(parseBadgeEvents("event: badges\ndata: not json")).toEqual([]);
        expect(parseBadgeEvents(": ping")).toEqual([]);
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
