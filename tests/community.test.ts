import { describe, expect, test } from "bun:test";

import { crashRate, validateCheckin } from "../src/shared/analytics";
import { parseAuthors } from "../src/shared/authors";
import { parseBadges, parseCredits } from "../src/shared/badges";
import { mergeNotifications, parseNotification, parseNotifications, unreadCount } from "../src/shared/notifications";
import { parsePluginPage, parseRatings, ratingScore, summarize, validateReview } from "../src/shared/reviews";
import { betaOf, parseRegistry, previewType, sortListings, validateEntry } from "../src/shared/store";
import { parseStoreHome, rankTrending, validateCollection } from "../src/shared/storeHome";

const hash = "a".repeat(64);
const files = (id: string, folder = "aaaaaaaaaaaa") => ({
    "manifest.json": { url: `https://evi.rest/store/plugins/${id}/${folder}/manifest.json`, sha256: hash },
    "index.js": { url: `https://evi.rest/store/plugins/${id}/${folder}/index.js`, sha256: hash },
});
const entry = (extra: Record<string, unknown> = {}) => ({
    id: "quiet-mode", name: "Quiet Mode", description: "", authors: ["Alice"], version: "1.0.0", native: false,
    files: files("quiet-mode"), changelog: [{ version: "1.0.0", notes: ["First release."] }], permissions: {}, ...extra,
});

describe("registry: previews, supporters and betas", () => {
    test("a preview is an https mp4, webm, gif or webp", () => {
        expect(previewType("https://x.dev/demo.mp4")).toBe("video/mp4");
        expect(previewType("https://x.dev/a/demo.GIF?x=1")).toBe("image/gif");
        expect(previewType("https://x.dev/demo.png")).toBeUndefined();
        expect("entry" in validateEntry(entry({ preview: "https://x.dev/demo.webm" }))).toBe(true);
        expect(validateEntry(entry({ preview: "http://x.dev/demo.webm" }))).toMatchObject({ error: expect.stringContaining("preview") });
        expect(validateEntry(entry({ preview: "https://x.dev/demo.png" }))).toMatchObject({ error: expect.stringContaining(".mp4") });
    });

    test("supporters is a flag, kept only when true", () => {
        expect((validateEntry(entry({ supporters: true })) as { entry: { supporters?: boolean; }; }).entry.supporters).toBe(true);
        expect((validateEntry(entry({ supporters: false })) as { entry: { supporters?: boolean; }; }).entry.supporters).toBeUndefined();
        expect("error" in validateEntry(entry({ supporters: "yes" }))).toBe(true);
    });

    test("a beta is its own version with its own files; a broken one only loses the beta", () => {
        const beta = { version: "1.1.0-beta.1", native: false, files: files("quiet-mode", "bbbbbbbbbbbb"), changelog: [{ version: "1.1.0-beta.1", notes: ["Try this"] }], permissions: { readMessages: true } };
        const ok = validateEntry(entry({ beta })) as { entry: ReturnType<typeof betaOf> & object; };
        expect(ok.entry.beta?.version).toBe("1.1.0-beta.1");
        const as = betaOf(ok.entry)!;
        expect(as.version).toBe("1.1.0-beta.1");
        expect(as.files["index.js"].url).toContain("bbbbbbbbbbbb");
        expect(as.permissions?.readMessages).toBe(true);
        expect(as.changelog.map(c => c.version)).toEqual(["1.1.0-beta.1", "1.0.0"]);
        expect(as.beta).toBeUndefined();

        const broken = validateEntry(entry({ beta: { ...beta, files: {} } }));
        expect("entry" in broken && broken.entry.beta).toBeUndefined();
        // A beta the stable version caught up with is no beta
        expect(betaOf({ ...ok.entry, version: "1.1.0" })).toBeUndefined();
        expect(parseRegistry({ schema: 1, plugins: [entry({ beta })], themes: [] })).toMatchObject({ problems: [] });
    });

    test("sorting by a score: rating or trending", () => {
        const items = [{ name: "B" }, { name: "A" }, { name: "C" }].map(i => ({ ...i, id: i.name.toLowerCase(), description: "", authors: [], version: "1", tags: [], screenshots: [], changelog: [] }));
        const scores: Record<string, number> = { a: 1, b: 3, c: 3 };
        expect(sortListings(items, "rating", i => scores[i.id]).map(i => i.name)).toEqual(["B", "C", "A"]);
    });
});

describe("store home", () => {
    test("collections: store items only, deduplicated", () => {
        expect(validateCollection("privacy", { title: "Privacy", items: ["plugin:no-track", "plugin:no-track", "theme:midnight"] }))
            .toEqual({ collection: { id: "privacy", title: "Privacy", description: "", items: ["plugin:no-track", "theme:midnight"] } });
        expect(validateCollection("Bad Id", { title: "x", items: [] })).toHaveProperty("error");
        expect(validateCollection("x", { title: "", items: [] })).toHaveProperty("error");
        expect(validateCollection("x", { title: "x", items: ["no-track"] })).toHaveProperty("error");
    });

    test("a client keeps only what's well formed", () => {
        const home = parseStoreHome({ trending: ["plugin:a", "evil", 3], fresh: ["theme:b"], collections: [{ id: "picks", title: "Picks", items: ["plugin:a"] }, { id: "bad" }], at: 5 });
        expect(home).toEqual({ trending: ["plugin:a"], fresh: ["theme:b"], collections: [{ id: "picks", title: "Picks", description: "", items: ["plugin:a"] }], at: 5 });
        expect(parseStoreHome(null)).toEqual({ trending: [], fresh: [], collections: [], at: 0 });
    });

    test("trending: stars count most, growth counts relative to size, nothing moved means not trending", () => {
        const ranked = rankTrending([
            { item: "plugin:big", stars: 0, activeNow: 1010, activeBefore: 1000 },
            { item: "plugin:small", stars: 0, activeNow: 20, activeBefore: 10 },
            { item: "plugin:starred", stars: 5, activeNow: 0, activeBefore: 0 },
            { item: "plugin:still", stars: 0, activeNow: 50, activeBefore: 50 },
        ]);
        expect(ranked[0]).toBe("plugin:starred");
        expect(ranked.indexOf("plugin:small")).toBeLessThan(ranked.indexOf("plugin:big"));
        expect(ranked).not.toContain("plugin:still");
    });
});

describe("reviews", () => {
    test("a review: 1 to 5 stars, short text, tidy lines", () => {
        expect(validateReview({ rating: 4, body: "  Nice\r\nplugin  ", version: "1.0.0" })).toEqual({ rating: 4, body: "Nice\nplugin", version: "1.0.0" });
        expect(validateReview({ rating: 0 })).toHaveProperty("error");
        expect(validateReview({ rating: 3.5 })).toHaveProperty("error");
        expect(validateReview({ rating: 5, body: "x".repeat(501) })).toHaveProperty("error");
        expect(validateReview({ rating: 5, body: "a\n\n\n\n\nb" })).toHaveProperty("error");
    });

    test("summaries and a score that wants a few ratings", () => {
        expect(summarize([5, 4, 4, 1])).toEqual({ average: 3.5, count: 4, counts: [1, 0, 0, 2, 1] });
        expect(summarize([])).toEqual({ average: 0, count: 0, counts: [0, 0, 0, 0, 0] });
        expect(ratingScore(summarize([5]))).toBeLessThan(ratingScore(summarize(Array(40).fill(4.5).map((_, i) => i % 2 ? 5 : 4))));
        expect(ratingScore(undefined)).toBe(0);
    });

    test("what the server sends is checked before the page sees it", () => {
        expect(parseRatings({ "plugin:a": { average: 4, count: 2, counts: [0, 0, 0, 2, 0] }, "evil": {}, "plugin:b": { average: "x" } })).toEqual({ "plugin:a": { average: 4, count: 2, counts: [0, 0, 0, 2, 0] } });
        const page = parsePluginPage({
            rating: { average: 5, count: 1, counts: [0, 0, 0, 0, 1] },
            reviews: [{ id: 1, plugin: "a", rating: 5, body: "Great", version: "1.0.0", user: { id: "111111111111111111", name: "Bob", avatar: "javascript:alert(1)" }, createdAt: 1, updatedAt: 2 }, { id: "x" }],
            mine: null,
            related: ["b", "../c"],
            issues: [{ kind: "status", text: "Fix coming" }, { kind: "evil", text: "no" }],
            note: { version: "1.0.0", text: "Hello" },
            installs: 42,
        });
        expect(page.reviews).toHaveLength(1);
        expect(page.reviews[0].user.avatar).toBeNull();
        expect(page.related).toEqual(["b"]);
        expect(page.issues).toEqual([{ kind: "status", text: "Fix coming" }]);
        expect(page.note).toEqual({ version: "1.0.0", text: "Hello" });
        expect(page.installs).toBe(42);
        expect(parsePluginPage(undefined)).toMatchObject({ reviews: [], mine: null, installs: null });
    });
});

describe("notifications", () => {
    const n = (id: string, at: number, read = false) => ({ id, kind: "follow" as const, title: `t${id}`, body: "", at, read });

    test("parsed strictly: kinds, lengths, links", () => {
        expect(parseNotification({ ...n("1", 5), link: { kind: "plugin", id: "quiet-mode" } })?.link).toEqual({ kind: "plugin", id: "quiet-mode" });
        expect(parseNotification({ ...n("1", 5), link: { kind: "url", url: "javascript:alert(1)" } })?.link).toBeUndefined();
        expect(parseNotification({ ...n("1", 5), kind: "evil" })).toBeUndefined();
        expect(parseNotifications([n("1", 1), null, "x"])).toHaveLength(1);
    });

    test("server and local together, newest first, one per id, unread counted", () => {
        const merged = mergeNotifications([n("1", 1), n("2", 3, true)], [n("local:a", 2), n("1", 9)] as never);
        expect(merged.map(x => x.id)).toEqual(["2", "local:a", "1"]);
        expect(unreadCount(merged as never)).toBe(2);
    });
});

describe("usage check-ins", () => {
    test("store plugins with their version and whether they're on", () => {
        expect(validateCheckin({ eviVersion: "1.0.0", plugins: [{ id: "a", version: "1.0.0", enabled: true }, { id: "a", version: "2.0.0", enabled: false }] }))
            .toEqual({ eviVersion: "1.0.0", plugins: [{ id: "a", version: "1.0.0", enabled: true }] });
        expect(validateCheckin({ eviVersion: "1.0.0", plugins: [{ id: "A B", version: "1", enabled: true }] })).toHaveProperty("error");
        expect(validateCheckin({ eviVersion: "x", plugins: [] })).toHaveProperty("error");
        expect(validateCheckin({ eviVersion: "1.0.0", plugins: Array(201).fill({ id: "a", version: "1", enabled: true }) })).toHaveProperty("error");
    });

    test("a crash rate needs enough installs to mean something", () => {
        expect(crashRate(1, 4)).toBeNull();
        expect(crashRate(1, 10)).toBe(0.1);
        expect(crashRate(20, 10)).toBe(1);
    });
});

describe("authors and supporters", () => {
    test("author pages: only evi.rest banners, only their own plugins pinned", () => {
        const base = { slug: "alice", name: "Alice", bio: "", verified: true, userId: "111111111111111111", avatar: null, links: {}, plugins: ["a", "b"] };
        const good = parseAuthors({ authors: [{ ...base, banner: "https://evi.rest/banners/alice-abc123.png", pinned: ["b", "zzz"], followers: 3, installs: 12 }] }).alice;
        expect(good).toMatchObject({ banner: "https://evi.rest/banners/alice-abc123.png", pinned: ["b"], followers: 3, installs: 12 });
        expect(parseAuthors({ authors: [{ ...base, banner: "https://evil.example/x.png" }] }).alice.banner).toBeNull();
    });

    test("a badge colour from an older evi.rest is dropped; credits are checked", () => {
        const doc = parseBadges({ badges: { x: { name: "X", description: "", icon: "https://evi.rest/badges/x.png" } }, users: { "111111111111111111": ["x"] }, supporters: { "111111111111111111": 1 }, prefs: { "111111111111111111": { order: ["x"], hidden: [], color: "#FF00AA" } } });
        expect(doc?.prefs["111111111111111111"]).toEqual({ order: ["x"], hidden: [] });
        expect(parseCredits({ supporters: [{ name: "Bob", avatar: null, userId: "111111111111111111", since: 1, level: "gold" }, { name: 1 }] }).supporters).toHaveLength(1);
    });
});
