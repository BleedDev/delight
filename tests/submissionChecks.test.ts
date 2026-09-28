import { describe, expect, test } from "bun:test";

import { checkSubmission, hiddenCharacter, PLACEHOLDER_DESCRIPTION } from "../src/shared/submissionChecks";

const store = { officialIds: new Set(["read-all"]), officialNames: new Set(["read all"]) };
const manifest = (extra: Record<string, unknown> = {}) => ({
    id: "my-plugin", name: "My Plugin", description: "Does a thing.", version: "1.0.0", tags: ["social"],
    permissions: {}, changelog: [{ version: "1.0.0", notes: ["First release."] }], main: "index.js", ...extra,
});
const check = (m: unknown, code = "module.exports = {};", extra: { nativeCode?: string; publishedVersion?: string; } = {}) =>
    checkSubmission({ manifest: m, code, nativeCode: extra.nativeCode }, { ...store, publishedVersion: extra.publishedVersion });
const errors = (findings: ReturnType<typeof check>) => findings.filter(f => f.level === "error").map(f => f.message);
const warnings = (findings: ReturnType<typeof check>) => findings.filter(f => f.level === "warning").map(f => f.message);

describe("what an upload is refused for", () => {
    test("a complete plugin passes", () => {
        expect(check(manifest())).toEqual([]);
    });

    test("permissions must be declared, and declared right", () => {
        const { permissions: _, ...without } = manifest();
        expect(errors(check(without))[0]).toContain(`needs "permissions"`);
        expect(errors(check(manifest({ permissions: { network: ["https://x.com"] } })))[0]).toContain("isn't a site");
        expect(errors(check(manifest({ permissions: { readMessages: "yes" } })))[0]).toContain("true or false");
    });

    test("ids and names that are Evi's", () => {
        expect(errors(check(manifest({ id: "evi-thing" })))).toEqual([`Plugin ids starting with "evi" are reserved for Evi`]);
        expect(errors(check(manifest({ id: "read-all" })))).toEqual(["That's one of Evi's own plugins"]);
        expect(errors(check(manifest({ name: "Read All" })))).toEqual([`"Read All" is the name of one of Evi's own plugins`]);
        expect(errors(check(manifest({ id: "Bad Id" })))[0]).toContain("lowercase letters");
    });

    test("a version must be newer than the store's", () => {
        expect(errors(check(manifest({ version: "1.0.0" }), undefined, { publishedVersion: "1.0.0" }))).toEqual(["Version 1.0.0 isn't newer than the published 1.0.0"]);
        expect(errors(check(manifest({ version: "1.1.0", changelog: [{ version: "1.1.0", notes: ["x"] }] }), undefined, { publishedVersion: "1.0.0" }))).toEqual([]);
        expect(errors(check(manifest({ version: "one" })))[0]).toContain("version like 1.0.0");
    });

    test("native parts and Chromium switches", () => {
        expect(errors(check(manifest({ native: "native.js" })))).toEqual(["manifest.json has a native part, but there's no native.js"]);
        expect(errors(check(manifest(), undefined, { nativeCode: "x" }))[0]).toContain(`add "native": "native.js"`);
        expect(errors(check(manifest({ native: "native.js" }), undefined, { nativeCode: "x" }))).toEqual([]);
        expect(errors(check(manifest({ chromiumSwitches: { "enable-x": true } })))[0]).toContain("chromiumSwitches");
    });

    test("invisible characters, found by line", () => {
        expect(hiddenCharacter("a\nb​c")).toEqual({ char: "U+200B", line: 2 });
        expect(hiddenCharacter("﻿ok")).toBeUndefined();
        expect(errors(check(manifest(), "let a = 1;\nlet b‮ = 2;"))[0]).toContain("U+202E) on line 2");
    });
});

describe("what a reviewer would ask about", () => {
    test("a missing description, tags or changelog entry", () => {
        expect(warnings(check(manifest({ description: "" })))[0]).toContain("No description");
        expect(warnings(check(manifest({ description: PLACEHOLDER_DESCRIPTION })))[0]).toContain("still the one new-plugin wrote");
        expect(warnings(check(manifest({ tags: [] })))[0]).toContain("No tags");
        expect(warnings(check(manifest({ version: "1.0.1" })))[0]).toContain("No changelog entry for 1.0.1");
    });

    test("code that does more than it declares", () => {
        const code = `fetch("https://api.weather.io/x"); ctx.flux.subscribe("MESSAGE_CREATE", h); findStore("MessageStore");`;
        const found = warnings(check(manifest(), code));
        expect(found.some(w => w.includes("api.weather.io") && w.includes(`"network"`))).toBe(true);
        expect(found.some(w => w.includes("MESSAGE_CREATE") && w.includes("readMessages"))).toBe(true);
        expect(found.some(w => w.includes("MessageStore") && w.includes("readMessages"))).toBe(true);
        expect(warnings(check(manifest({ permissions: { network: ["weather.io"], readMessages: true } }), code))).toEqual([]);
    });
});
