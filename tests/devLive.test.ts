import { describe, expect, test } from "bun:test";

import { isAdminRoute, parseHealth, parsePeople, parseReports, parseSubmissions } from "../src/shared/devAdmin";
import { fillDays, parseDevLive } from "../src/shared/devLive";

describe("the developers' numbers", () => {
    test("anything malformed becomes zero or is left out", () => {
        const live = parseDevLive({
            at: 5,
            now: { online: -3, connections: "x", versions: [{ version: "1.4.3", count: 2.7 }, { count: 1 }] },
            days: [{ day: "2026-10-01", active: 4, peak: 2 }, { day: "nope", active: 1 }],
            topPlugins: [{ id: "view-icons", installs: 9 }],
        });
        expect(live.now).toEqual({ online: 0, connections: 0, versions: [{ version: "1.4.3", count: 2 }, { version: "old", count: 1 }] });
        expect(live.days).toEqual([{ day: "2026-10-01", active: 4, peak: 2 }]);
        expect(live.topPlugins).toEqual([{ id: "view-icons", name: "view-icons", installs: 9 }]);
        expect(live.store).toEqual({ plugins: 0, waiting: 0, reports: 0 });
        expect(parseDevLive(null).today).toEqual({ active: 0, peak: 0 });
    });

    test("days evi.rest has no row for are zero, today last", () => {
        const days = fillDays([{ day: "2026-09-30", active: 7, peak: 3 }], "2026-10-01", 3);
        expect(days).toEqual([
            { day: "2026-09-29", active: 0, peak: 0 },
            { day: "2026-09-30", active: 7, peak: 3 },
            { day: "2026-10-01", active: 0, peak: 0 },
        ]);
    });
});

describe("the Developers page's calls to evi.rest", () => {
    test("only the routes it uses, with the methods it uses them with", () => {
        for (const [method, path] of [
            ["GET", "/admin/stats"], ["GET", "/admin/health"], ["GET", "/admin/people?q=evi%20tester"],
            ["GET", "/admin/submissions?status=pending"], ["POST", "/admin/submissions/12/approve"], ["POST", "/admin/theme-submissions/3/reject"],
            ["POST", "/admin/reports/7/dismiss"], ["POST", "/admin/reviews/9/hide"], ["POST", "/admin/announcements"], ["DELETE", "/admin/announcements/4"],
            ["POST", "/admin/plugins/fix-embeds/pull"], ["DELETE", "/admin/plugins/fix-embeds/pull?version=1.0.0"],
        ]) expect(isAdminRoute(method, path)).toBe(true);
        for (const [method, path] of [
            ["GET", "/admin/badges"], ["PUT", "/admin/supporters/1"], ["DELETE", "/admin/submissions/12"], ["GET", "/admin/submissions?status=pending&x=1"],
            ["POST", "/admin/submissions/12/approve/../../badges"], ["GET", "/me"], ["GET", "/admin/stats#x"], ["PATCH", "/admin/stats"],
            ["POST", "/admin/plugins/../pull"], [1, "/admin/stats"], ["GET", 5],
        ]) expect(isAdminRoute(method, path)).toBe(false);
    });

    test("waiting uploads read the parts a reviewer needs; anything else is left out", () => {
        const [s] = parseSubmissions({ submissions: [
            { id: 1, status: "pending", plugin: "cool", name: "Cool", version: "1.1.0", published: "1.0.0", channel: "beta", author: { slug: "a", name: "Ann" }, createdAt: 5, code: "x", scan: { patchCount: 2, domains: ["a.io"], dynamicCode: ["eval"], clipboardRead: true, stores: ["UserStore"] } },
            { id: 2, status: "approved", plugin: "old" },
            { id: "bad", status: "pending" },
        ] }, "plugin");
        expect(s).toMatchObject({ id: 1, item: "cool", version: "1.1.0", published: "1.0.0", beta: true, author: "Ann", scan: { patches: 2, domains: ["a.io"], dynamicCode: ["eval"], clipboardRead: true, stores: 1 } });
        expect(parseSubmissions({ submissions: [{ id: 3, status: "pending", theme: "t", css: "a{}", scan: { hosts: [{ host: "x.io", allowed: false }] } }] }, "theme")[0].hosts).toEqual([{ host: "x.io", allowed: false }]);
        expect(parseSubmissions(null, "plugin")).toEqual([]);
    });

    test("reports, people and health come through whatever shape is off", () => {
        expect(parseReports({ reports: [{ id: "4", status: "open", plugin: "p", reason: "broken", details: "d", openForPlugin: 2, createdAt: 1, reporter: { id: "1", username: "u" } }, { id: "5", status: "resolved" }] }))
            .toEqual([{ id: 4, plugin: "p", kind: "plugin", version: undefined, reason: "broken", details: "d", reporter: { id: "1", name: "u", username: "u", avatar: undefined }, openForPlugin: 2, createdAt: 1 }]);
        expect(parsePeople({ people: [{ user: { id: "1", username: "u", globalName: "U" }, lastLogin: 3, badges: ["early-supporter", 4] }, { user: null }] }))
            .toEqual([{ user: { id: "1", name: "U", username: "u", avatar: undefined }, lastLogin: 3, badges: ["early-supporter"] }]);
        const health = parseHealth({ plugins: [{ id: "a", name: "A", installsReporting: 10, brokenPatches: 3 }], pulls: { pulled: { b: { versions: "all", reason: "r", removed: true, at: 2 } } } });
        expect(health.plugins[0]).toMatchObject({ id: "a", brokenPatches: 3 });
        expect(health.pulls).toEqual([{ plugin: "b", versions: "all", reason: "r", removed: true, at: 2 }]);
        expect(parseHealth(undefined)).toEqual({ plugins: [], pulls: [] });
    });
});
