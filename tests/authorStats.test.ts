import { describe, expect, test } from "bun:test";

import { clampDays, parseAuthorStats } from "../src/shared/authorStats";

describe("an author's numbers, as Evi reads them", () => {
    test("anything malformed becomes zero or is left out", () => {
        const s = parseAuthorStats({
            author: { slug: "kaz", name: "Kaz" },
            days: 500,
            plugins: [
                { id: "a", history: [{ day: "2026-10-01", active: -4, installed: 2.7 }, { day: "nope" }], rating: { average: 9, count: 2, counts: [1] }, crashes: { latestRate: 3 }, health: { builds: [{ installs: 2 }] }, pull: { versions: "all", reason: "x" } },
                { name: "no id" },
            ],
        });
        expect(s.days).toBe(90);
        expect(s.plugins.map(p => p.id)).toEqual(["a"]);
        const p = s.plugins[0];
        expect(p.name).toBe("a");
        expect(p.history).toEqual([{ day: "2026-10-01", installed: 2, active: 0 }]);
        expect(p.rating).toEqual({ average: 5, count: 2, counts: [1, 0, 0, 0, 0] });
        expect(p.crashes.latestRate).toBeNull();
        expect(p.health.builds).toEqual([{ build: "?", installs: 2, lookups: 0, patches: 0, start: 0 }]);
        expect(p.pull?.versions).toBe("all");
        expect(parseAuthorStats(null).plugins).toEqual([]);
    });

    test("days stay within 7 and 90", () => {
        expect(clampDays("999")).toBe(90);
        expect(clampDays(1)).toBe(7);
        expect(clampDays("x")).toBe(30);
        expect(clampDays(undefined)).toBe(30);
        expect(clampDays(14.4)).toBe(14);
    });
});
