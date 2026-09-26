import { describe, expect, test } from "bun:test";

import pkg from "../package.json";
import { RELEASES, releasesSince } from "../src/shared/changelog";
import { compareVersions, isVersion } from "../src/shared/store";

const releases = [
    { version: "0.3.0", date: "2026-10-01", highlights: ["c"] },
    { version: "0.2.0", date: "2026-09-26", highlights: ["b"] },
    { version: "0.1.0", date: "2026-09-20", highlights: ["a"] },
];

describe("what's new", () => {
    test("shows the releases after the one last seen, up to the running one", () => {
        expect(releasesSince("0.1.0", "0.3.0", releases).map(r => r.version)).toEqual(["0.3.0", "0.2.0"]);
        expect(releasesSince("0.1.0", "0.2.0", releases).map(r => r.version)).toEqual(["0.2.0"]);
    });

    test("nothing on a first run, the same version, or a downgrade", () => {
        expect(releasesSince(undefined, "0.3.0", releases)).toEqual([]);
        expect(releasesSince("0.3.0", "0.3.0", releases)).toEqual([]);
        expect(releasesSince("0.3.0", "0.2.0", releases)).toEqual([]);
    });

    test("Evi's own release notes are newest first, valid, and cover this version", () => {
        for (const r of RELEASES) {
            expect(isVersion(r.version)).toBe(true);
            expect(r.highlights.length).toBeGreaterThan(0);
            expect(isNaN(Date.parse(r.date))).toBe(false);
        }
        for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBe(1);
        expect(RELEASES.some(r => r.version === pkg.version)).toBe(true);
    });
});
