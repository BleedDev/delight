import { describe, expect, test } from "bun:test";

import { isAdminRoute, parseAdminBadges, parseHealth, parsePeople, parsePersonDetail, parseReports, parseSubmissions } from "../src/shared/devAdmin";
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
            ["GET", "/admin/stats"], ["GET", "/admin/health"], ["GET", "/admin/people?page=1&size=25&q=evi%20tester"], ["GET", "/admin/badges"],
            ["GET", "/admin/submissions?status=pending"], ["POST", "/admin/submissions/12/approve"], ["POST", "/admin/theme-submissions/3/reject"],
            ["POST", "/admin/reports/7/dismiss"], ["POST", "/admin/reviews/9/hide"], ["POST", "/admin/announcements"], ["DELETE", "/admin/announcements/4"],
            ["POST", "/admin/plugins/fix-embeds/pull"], ["DELETE", "/admin/plugins/fix-embeds/pull?version=1.0.0"],
        ]) expect(isAdminRoute(method, path)).toBe(true);
        for (const [method, path] of [
            ["GET", "/admin/people?q=evi"], ["PUT", "/admin/supporters/1"], ["DELETE", "/admin/submissions/12"], ["GET", "/admin/submissions?status=pending&x=1"],
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
        expect(parsePeople({ total: 7, page: 2, size: 5, people: [{ user: { id: "1", username: "u", globalName: "U" }, lastLogin: 3, installs: 2, admin: true, badges: ["early-supporter", 4], banned: { reason: "Spam", until: 9, by: "5", at: 4 } }, { user: null }] }))
            .toEqual({
                total: 7, page: 2, size: 5,
                people: [{ user: { id: "1", name: "U", username: "u", avatar: undefined }, createdAt: 0, lastLogin: 3, installs: 2, admin: true, badges: ["early-supporter"], banned: { reason: "Spam", until: 9, at: 4, by: { id: "5", name: "5" } } }],
            });
        expect(parsePeople(null)).toEqual({ people: [], total: 0, page: 1, size: 25 });
        const health = parseHealth({ plugins: [{ id: "a", name: "A", installsReporting: 10, brokenPatches: 3 }], pulls: { pulled: { b: { versions: "all", reason: "r", removed: true, at: 2 } } } });
        expect(health.plugins[0]).toMatchObject({ id: "a", brokenPatches: 3 });
        expect(health.pulls).toEqual([{ plugin: "b", versions: "all", reason: "r", removed: true, at: 2 }]);
        expect(parseHealth(undefined)).toEqual({ plugins: [], pulls: [] });
    });

    test("a person's page, the badge list and the People routes", () => {
        const d = parsePersonDetail({
            user: { id: "222222222222222222", username: "bob" }, createdAt: 1, lastLogin: 2, logins: 3, installs: 1, admin: false,
            badges: [{ id: "tester", position: 0, grantedAt: 5 }, { id: 7 }],
            supporter: { level: "supporter-1", since: 10, days: 40, startedAt: 10, grantedDays: -3, next: { level: "supporter-2", at: 99 } },
            author: { slug: "bob", name: "Bob", plugins: [{ id: "thing", name: "Thing" }, { nope: 1 }] },
            banned: { reason: "Spam", until: null, by: { id: "1", username: "alice" }, at: 4 },
            banLog: [{ action: "ban", reason: "Spam", at: 4 }, { action: "explode", at: 1 }],
        })!;
        expect(d.badges).toEqual([{ id: "tester", position: 0, grantedAt: 5 }]);
        expect(d.supporter).toMatchObject({ level: "supporter-1", grantedDays: -3, next: { level: "supporter-2", at: 99 } });
        expect(d.author!.plugins).toEqual([{ id: "thing", name: "Thing" }]);
        expect(d.banned).toEqual({ reason: "Spam", until: undefined, at: 4, by: { id: "1", name: "alice", username: "alice", avatar: undefined } });
        expect(d.banLog.map(l => l.action)).toEqual(["ban"]);
        expect(parsePersonDetail({ user: null })).toBeUndefined();

        const badges = parseAdminBadges({ badges: [{ id: "a", name: "A", icon: "https://evi.rest/badges/a.png", holders: 2, supporter: true }, { id: "b", icon: "javascript:alert(1)" }, { name: "no id" }] });
        expect(badges).toEqual([
            { id: "a", name: "A", description: "", icon: "https://evi.rest/badges/a.png", holders: 2, supporter: true, automatic: false },
            { id: "b", name: "b", description: "", icon: "", holders: 0, supporter: false, automatic: false },
        ]);

        const user = "222222222222222222";
        expect(isAdminRoute("GET", "/admin/people?page=2&size=25&q=bob")).toBe(true);
        expect(isAdminRoute("GET", "/admin/people?q=bob")).toBe(false);
        expect(isAdminRoute("GET", `/admin/users/${user}`)).toBe(true);
        expect(isAdminRoute("PUT", `/admin/users/${user}/ban`)).toBe(true);
        expect(isAdminRoute("DELETE", `/admin/users/${user}/ban`)).toBe(true);
        expect(isAdminRoute("PUT", `/admin/users/${user}/badges/early-supporter`)).toBe(true);
        expect(isAdminRoute("PUT", "/admin/badges/tester/icon")).toBe(true);
        expect(isAdminRoute("POST", `/admin/supporters/${user}/time`)).toBe(true);
        expect(isAdminRoute("PUT", "/admin/users/x/ban")).toBe(false);
        expect(isAdminRoute("PUT", `/admin/users/${user}/badges/../../x`)).toBe(false);
    });
});
