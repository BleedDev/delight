import { describe, expect, test } from "bun:test";

import pkg from "../package.json";
import { latestRelease, mergeReleases, Release, RELEASES, releasesSince, SECTION_KINDS } from "../src/shared/changelog";
import { COVERS } from "../src/renderer/ui/covers";
import { compareVersions, isVersion } from "../src/shared/store";

const releases: Release[] = [
    { version: "0.3.0", date: "2026-10-01", sections: { added: ["c"], fixed: ["c fix"] } },
    { version: "0.2.0", date: "2026-09-26", sections: { added: ["b"], improved: ["b better"] } },
    { version: "0.1.0", date: "2026-09-20", sections: { added: ["a"] } },
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

    test("skipped releases read as one changelog, newest first, dated by the newest", () => {
        const merged = mergeReleases(releases.slice(0, 2));
        expect(merged.date).toBe("2026-10-01");
        expect(merged.cover).toBeUndefined();
        expect(mergeReleases([{ ...releases[0] }, { ...releases[1], cover: "store" }]).cover).toBe("store");
        expect(merged.sections).toEqual({ added: ["c", "b"], improved: ["b better"], fixed: ["c fix"] });
    });

    test("the panel's link shows the newest release up to the running one", () => {
        expect(latestRelease("0.2.0", releases)?.version).toBe("0.2.0");
        expect(latestRelease("0.2.5", releases)?.version).toBe("0.2.0");
        expect(latestRelease("0.0.1", releases)).toBeUndefined();
    });

    test("Evi's own release notes are newest first, valid, and cover this version", () => {
        for (const r of RELEASES) {
            expect(isVersion(r.version)).toBe(true);
            const lines = SECTION_KINDS.flatMap(k => r.sections[k] ?? []);
            expect(lines.length).toBeGreaterThan(0);
            expect(lines.every(l => l.trim().length > 0 && (l.match(/\*\*/g) ?? []).length % 2 === 0)).toBe(true);
            expect(isNaN(Date.parse(r.date))).toBe(false);
            // Bundled into Evi, and an actual picture
            if (r.cover) expect(COVERS[r.cover]).toStartWith("<svg");
        }
        for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBe(1);
        expect(RELEASES.some(r => r.version === pkg.version)).toBe(true);
    });
});
