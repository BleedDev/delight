import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
    compareVersions,
    parseRegistry,
    RegistryEntry,
    sha256Hex,
    sortListings,
    storeAction,
    validateEntry,
    validateThemeEntry,
    whyNotHash,
    whyNotManifest,
    whyNotStoreUrl,
} from "../src/shared/store";

const hash = (c: string) => c.repeat(64);
const file = (name: string, h = hash("a")) => ({ url: `https://example.com/p/${name}`, sha256: h });

const valid = () => ({
    id: "my-plugin",
    name: "My Plugin",
    description: "Does a thing",
    authors: ["someone"],
    version: "1.2.0",
    tags: ["fun"],
    native: false,
    minEviVersion: "0.1.0",
    files: { "manifest.json": file("manifest.json"), "index.js": file("index.js") },
});

const entryOf = (raw: unknown) => {
    const result = validateEntry(raw);
    if ("error" in result) throw new Error(result.error);
    return result.entry;
};

describe("registry validation", () => {
    test("accepts a well-formed registry and drops unknown keys", () => {
        const result = parseRegistry({ schema: 1, plugins: [{ ...valid(), extra: "ignored" }] });
        expect("registry" in result && result.problems).toEqual([]);
        if (!("registry" in result)) throw 0;
        expect(result.registry.plugins).toHaveLength(1);
        expect("extra" in result.registry.plugins[0]).toBe(false);
    });

    test("rejects malformed documents as a whole", () => {
        expect(parseRegistry(null)).toHaveProperty("error");
        expect(parseRegistry([])).toHaveProperty("error");
        expect(parseRegistry({ schema: 2, plugins: [] })).toHaveProperty("error");
        expect(parseRegistry({ schema: 1 })).toHaveProperty("error");
        expect(parseRegistry({ schema: 1, plugins: Array(2001).fill(valid()) })).toHaveProperty("error");
    });

    test("drops bad and duplicate entries but keeps the rest", () => {
        const result = parseRegistry({ schema: 1, plugins: [valid(), { ...valid(), id: "../evil" }, valid(), { ...valid(), id: "other" }] });
        if (!("registry" in result)) throw 0;
        expect(result.registry.plugins.map(p => p.id)).toEqual(["my-plugin", "other"]);
        expect(result.problems).toHaveLength(2);
        expect(result.problems.join()).toContain("listed twice");
    });

    test("ids can't escape the plugins folder", () => {
        for (const id of ["../x", "a/b", "a\\b", "A", "-x", "x-", ".x", "", "x".repeat(65), "con.js", 5]) {
            expect(validateEntry({ ...valid(), id })).toHaveProperty("error");
        }
        expect(validateEntry({ ...valid(), id: "a" })).toHaveProperty("entry");
        expect(validateEntry({ ...valid(), id: "abc-123" })).toHaveProperty("entry");
    });

    test("file URLs must be https, hashes 64 lowercase hex", () => {
        const withFile = (f: object) => ({ ...valid(), files: { ...valid().files, "index.js": f } });
        expect(validateEntry(withFile({ url: "http://example.com/i.js", sha256: hash("a") }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "file:///C:/i.js", sha256: hash("a") }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "https://u:p@example.com/i.js", sha256: hash("a") }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "not a url", sha256: hash("a") }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "https://example.com/i.js", sha256: hash("A") }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "https://example.com/i.js", sha256: "abc" }))).toHaveProperty("error");
        expect(validateEntry(withFile({ url: "https://example.com/i.js" }))).toHaveProperty("error");
    });

    test("only the known files, and native.js only on native entries", () => {
        expect(validateEntry({ ...valid(), files: { ...valid().files, "evil.dll": file("evil.dll") } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), files: { "index.js": file("index.js") } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), files: { ...valid().files, "native.js": file("native.js") } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), native: true, files: { ...valid().files, "native.js": file("native.js") } })).toHaveProperty("entry");
    });

    test("field types and limits", () => {
        expect(validateEntry({ ...valid(), name: "" })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), name: "x".repeat(81) })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), authors: [] })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), authors: "me" })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), version: "one" })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), native: "yes" })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), minEviVersion: "latest" })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), tags: [1] })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), description: "bell\x07" })).toHaveProperty("error");
        const { tags: _, ...noTags } = valid();
        expect(entryOf(noTags).tags).toEqual([]);
    });

    test("store URLs", () => {
        expect(whyNotStoreUrl("https://raw.githubusercontent.com/a/b/main/registry.json")).toBeUndefined();
        expect(whyNotStoreUrl("http://example.com/registry.json")).toBeDefined();
        expect(whyNotStoreUrl("javascript:alert(1)")).toBeDefined();
        expect(whyNotStoreUrl(undefined)).toBeDefined();
    });

    test("the repo's registry.json passes the app's validation", () => {
        const result = parseRegistry(JSON.parse(readFileSync(join(import.meta.dir, "..", "registry.json"), "utf8")));
        if (!("registry" in result)) throw new Error(result.error);
        expect(result.problems).toEqual([]);
        expect(result.registry.plugins.length).toBeGreaterThan(0);
        // Every official plugin has a category, so the store's filters have something to show
        expect(result.registry.plugins.every(p => p.tags.length > 0)).toBe(true);
    });
});

describe("store page extras", () => {
    test("changelog, screenshots, source and date are kept when valid, defaulted when missing", () => {
        const entry = entryOf({
            ...valid(),
            updatedAt: "2026-09-26",
            source: "https://github.com/someone/my-plugin",
            screenshots: ["https://example.com/a.png"],
            changelog: [{ version: "1.2.0", notes: ["Faster"], extra: 1 }],
        });
        expect(entry.updatedAt).toBe("2026-09-26");
        expect(entry.source).toBe("https://github.com/someone/my-plugin");
        expect(entry.screenshots).toEqual(["https://example.com/a.png"]);
        expect(entry.changelog).toEqual([{ version: "1.2.0", notes: ["Faster"] }]);

        const bare = entryOf(valid());
        expect(bare.screenshots).toEqual([]);
        expect(bare.changelog).toEqual([]);
        expect("source" in bare).toBe(false);
    });

    test("extras are checked as strictly as the rest", () => {
        const bad = (extra: object) => validateEntry({ ...valid(), ...extra });
        expect(bad({ source: "javascript:alert(1)" })).toHaveProperty("error");
        expect(bad({ screenshots: ["http://example.com/a.png"] })).toHaveProperty("error");
        expect(bad({ screenshots: Array(7).fill("https://example.com/a.png") })).toHaveProperty("error");
        expect(bad({ updatedAt: "yesterday" })).toHaveProperty("error");
        expect(bad({ updatedAt: "2026-13-45" })).toHaveProperty("error");
        expect(bad({ changelog: [{ version: "new", notes: [] }] })).toHaveProperty("error");
        expect(bad({ changelog: [{ version: "1.0.0", notes: "not a list" }] })).toHaveProperty("error");
    });

    test("sorting by name or newest, undated last", () => {
        const e = (name: string, updatedAt?: string) => ({ ...entryOf({ ...valid(), id: name.toLowerCase(), name }), ...(updatedAt && { updatedAt }) });
        const items = [e("Beta", "2026-01-01"), e("Alpha"), e("Gamma", "2026-09-01"), e("Delta", "2026-01-01")];
        expect(sortListings(items, "name").map(i => i.name)).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
        expect(sortListings(items, "updated").map(i => i.name)).toEqual(["Gamma", "Beta", "Delta", "Alpha"]);
    });
});

describe("theme entries", () => {
    const theme = () => ({
        id: "midnight",
        name: "Midnight",
        description: "Black",
        authors: ["Evi"],
        version: "1.0.0",
        file: { url: "https://example.com/midnight.css", sha256: hash("b") },
    });

    test("a registry without themes still parses, with an empty list", () => {
        const result = parseRegistry({ schema: 1, plugins: [valid()] });
        if (!("registry" in result)) throw 0;
        expect(result.registry.themes).toEqual([]);
    });

    test("themes are validated like plugins, one https file each", () => {
        const result = parseRegistry({ schema: 1, plugins: [], themes: [theme(), { ...theme(), id: "../up" }, theme()] });
        if (!("registry" in result)) throw 0;
        expect(result.registry.themes.map(t => t.id)).toEqual(["midnight"]);
        expect(result.problems).toHaveLength(2);
        expect(result.problems.every(p => p.startsWith("theme "))).toBe(true);

        expect(validateThemeEntry({ ...theme(), file: { url: "http://example.com/a.css", sha256: hash("b") } })).toHaveProperty("error");
        expect(validateThemeEntry({ ...theme(), file: { url: "https://example.com/a.css", sha256: "nope" } })).toHaveProperty("error");
        expect(validateThemeEntry({ ...theme(), file: undefined })).toHaveProperty("error");
        expect(parseRegistry({ schema: 1, plugins: [], themes: "no" })).toHaveProperty("error");
    });

    test("a theme and a plugin may share an id", () => {
        const result = parseRegistry({ schema: 1, plugins: [{ ...valid(), id: "midnight" }], themes: [theme()] });
        if (!("registry" in result)) throw 0;
        expect(result.problems).toEqual([]);
    });
});

describe("downloaded manifests", () => {
    const entry = entryOf(valid());
    const nativeEntry = entryOf({ ...valid(), native: true, files: { ...valid().files, "native.js": file("native.js") } });

    test("must match the entry", () => {
        expect(whyNotManifest({ id: "my-plugin", name: "Mine" }, entry)).toBeUndefined();
        expect(whyNotManifest({ id: "other", name: "Mine" }, entry)).toContain("not \"my-plugin\"");
        expect(whyNotManifest([], entry)).toBeDefined();
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", main: "../../evil.js" }, entry)).toBeDefined();
    });

    test("nothing outside the renderer unless the entry is native", () => {
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", native: "native.js" }, entry)).toBeDefined();
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", chromiumSwitches: { "remote-debugging-port": "9222" } }, entry)).toContain("native");
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", native: "native.js" }, nativeEntry)).toBeUndefined();
        expect(whyNotManifest({ id: "my-plugin", name: "Mine" }, nativeEntry)).toBeDefined();
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", native: "other.js" }, nativeEntry)).toBeDefined();
    });

    test("declares exactly what the registry shows", () => {
        const declaring = entryOf({ ...valid(), permissions: { network: ["api.example.com"], readMessages: true } });
        expect(declaring.permissions).toEqual({ network: ["api.example.com"], readMessages: true, sendMessages: false, changeSettings: false });
        // Written differently, read the same
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", permissions: { readMessages: true, network: ["API.example.com", "api.example.com"], sendMessages: false } }, declaring)).toBeUndefined();
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", permissions: { network: ["api.example.com"] } }, declaring)).toContain("don't match");
        expect(whyNotManifest({ id: "my-plugin", name: "Mine" }, declaring)).toContain("don't match");
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", permissions: {} }, entry)).toContain("don't match");
        expect(whyNotManifest({ id: "my-plugin", name: "Mine", permissions: { network: ["https://api.example.com"] } }, declaring)).toContain("isn't a site");
    });

    test("a registry entry's permissions are checked like the rest of it", () => {
        expect(validateEntry({ ...valid(), permissions: { network: ["*.example.com"] } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), permissions: { readMessages: "yes" } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), permissions: { everything: true } })).toHaveProperty("error");
        expect(validateEntry({ ...valid(), permissions: [] })).toHaveProperty("error");
        expect(entryOf(valid())).not.toHaveProperty("permissions");
        expect(entryOf({ ...valid(), permissions: {} }).permissions).toEqual({ network: [], readMessages: false, sendMessages: false, changeSettings: false });
    });
});

describe("versions", () => {
    test("numeric, not lexicographic", () => {
        expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
        expect(compareVersions("1.2", "1.2.0")).toBe(0);
        expect(compareVersions("2.0.0", "10.0.0")).toBe(-1);
        expect(compareVersions("0.1.1", "0.1.0")).toBe(1);
    });

    test("prereleases sort before their release", () => {
        expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
        expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
        expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBe(-1);
        expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
        expect(compareVersions("1.0.0-beta", "1.0.0-beta.1")).toBe(-1);
    });

    test("garbage sorts lowest instead of throwing", () => {
        expect(compareVersions("nope", "0.0.1")).toBe(-1);
        expect(compareVersions("1.0.0", "")).toBe(1);
    });

    test("what the Store tab offers", () => {
        const entry: RegistryEntry = entryOf({ ...valid(), version: "1.2.0", minEviVersion: "0.2.0" });
        expect(storeAction(entry, undefined, "0.1.0")).toBe("incompatible");
        expect(storeAction(entry, undefined, "0.2.0")).toBe("install");
        expect(storeAction(entry, { id: entry.id, version: "1.1.9", fromStore: true }, "0.2.0")).toBe("update");
        expect(storeAction(entry, { id: entry.id, version: "1.2.0", fromStore: true }, "0.2.0")).toBe("installed");
        expect(storeAction(entry, { id: entry.id, version: "1.3.0", fromStore: true }, "0.2.0")).toBe("installed");
        expect(storeAction(entry, { id: entry.id, version: "1.0.0", fromStore: false }, "0.2.0")).toBe("local");
    });
});

describe("hashes", () => {
    const bytes = new TextEncoder().encode("hello");
    const HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    test("sha256 of known input", async () => {
        expect(await sha256Hex(bytes)).toBe(HELLO);
        expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("matching bytes pass, one changed byte fails", async () => {
        expect(await whyNotHash("index.js", bytes, HELLO)).toBeUndefined();
        const tampered = new TextEncoder().encode("hellp");
        const error = await whyNotHash("index.js", tampered, HELLO);
        expect(error).toContain("index.js doesn't match");
        expect(error).toContain("Nothing was installed");
    });
});
