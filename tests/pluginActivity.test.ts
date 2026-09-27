import { describe, expect, test } from "bun:test";

import { ActivityEvent, ActivityLog, groupActivity, isExpectedHost, MASK, scrubUrl } from "../src/shared/pluginActivity";

const req = (host: string, at: number, extra: Partial<ActivityEvent> = {}): ActivityEvent =>
    ({ kind: "request", at, method: "GET", host, path: "/", ...extra });

describe("plugin activity: URL scrubbing", () => {
    test("keeps host and path, drops query, fragment and credentials", () => {
        expect(scrubUrl("https://user:pass@api.example.com/v1/items?key=secret&token=abc#frag"))
            .toEqual({ host: "api.example.com", path: "/v1/items" });
    });

    test("keeps non-default ports, lowercases the host", () => {
        expect(scrubUrl("http://API.Example.com:8080/a")).toEqual({ host: "api.example.com:8080", path: "/a" });
        expect(scrubUrl("https://api.example.com:443/a")).toEqual({ host: "api.example.com", path: "/a" });
    });

    test("masks path segments that look like tokens, keeps ids and words", () => {
        const webhook = scrubUrl("https://discord.com/api/webhooks/123456789012345678/Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefghij");
        expect(webhook).toEqual({ host: "discord.com", path: `/api/webhooks/123456789012345678/${MASK}` });
        expect(scrubUrl("https://api.example.com/key/tok9Xq2Lr7Wm4Pz8Vn3Kb6Yd/charge")!.path).toBe(`/key/${MASK}/charge`);
        expect(scrubUrl("https://api.example.com/users/profile-settings")!.path).toBe("/users/profile-settings");
    });

    test("resolves relative URLs against the page, skips what isn't a request", () => {
        expect(scrubUrl("/api/v9/users/@me?x=1", "https://discord.com/channels/@me")).toEqual({ host: "discord.com", path: "/api/v9/users/@me" });
        expect(scrubUrl("data:text/plain,hi")).toBeUndefined();
        expect(scrubUrl("blob:https://discord.com/1234")).toBeUndefined();
        expect(scrubUrl("not a url")).toBeUndefined();
        expect(scrubUrl("wss://gateway.example.com/?v=10&encoding=json")).toEqual({ host: "gateway.example.com", path: "/" });
    });

    test("caps very long paths", () => {
        const path = scrubUrl(`https://a.example.com/${"word/".repeat(60)}`)!.path;
        expect(path.length).toBe(120);
        expect(path.endsWith("…")).toBe(true);
    });
});

describe("plugin activity: log", () => {
    test("keeps the newest events up to the cap, per plugin", () => {
        const log = new ActivityLog(200);
        for (let i = 0; i < 250; i++) log.add("a", req("x.com", i));
        log.add("b", req("y.com", 1));
        const events = log.get("a");
        expect(events.length).toBe(200);
        expect(events[0].at).toBe(50);
        expect(events[199].at).toBe(249);
        expect(log.get("b").length).toBe(1);
    });

    test("clear empties one plugin only", () => {
        const log = new ActivityLog();
        log.add("a", req("x.com", 1));
        log.add("b", req("y.com", 1));
        log.clear("a");
        expect(log.get("a")).toEqual([]);
        expect(log.get("b").length).toBe(1);
    });
});

describe("plugin activity: grouping", () => {
    test("groups by host, newest first, with counts and last time", () => {
        const groups = groupActivity([
            req("api.example.com", 1, { path: "/a", status: 200 }),
            req("cdn.other.net", 2),
            req("api.example.com", 3, { path: "/b", method: "POST", status: 404 }),
            req("api.example.com", 4, { path: "/a", status: "error" }),
        ], ["api.example.com", "cdn.other.net"]);
        expect(groups.map(g => [g.target, g.count, g.lastAt])).toEqual([["api.example.com", 3, 4], ["cdn.other.net", 1, 2]]);
        expect(groups[0].recent).toEqual(["GET /a failed", "POST /b 404", "GET /a 200"]);
        expect(groups[0].errors).toBe(1);
    });

    test("recent lines are distinct and limited", () => {
        const events = Array.from({ length: 10 }, (_, i) => req("x.example.com", i, { path: `/p${i % 5}`, status: 200 }));
        const [group] = groupActivity(events, ["example.com"]);
        expect(group.recent).toEqual(["GET /p4 200", "GET /p3 200", "GET /p2 200"]);
    });

    test("sockets and native calls get their own groups", () => {
        const groups = groupActivity([
            req("gw.example.com", 1, { kind: "socket", method: "WS" }),
            req("gw.example.com", 2),
            { kind: "native", at: 3, target: "readFile", status: 200 },
        ], []);
        expect(groups.map(g => g.key)).toEqual(["native:readFile", "request:gw.example.com", "socket:gw.example.com"]);
        expect(groups[0].unexpected).toBe(false);
        expect(groups[0].recent).toEqual([]);
    });

    test("flags hosts its code doesn't name, never Discord's", () => {
        const groups = groupActivity([
            req("api.named.com", 1),
            req("eu.api.named.com", 2),
            req("tracker.sneaky.io", 3),
            req("discord.com", 4),
            req("cdn.discordapp.com", 5),
        ], ["api.named.com"]);
        const flagged = Object.fromEntries(groups.map(g => [g.target, g.unexpected]));
        expect(flagged).toEqual({
            "api.named.com": false, "eu.api.named.com": false, "tracker.sneaky.io": true,
            "discord.com": false, "cdn.discordapp.com": false,
        });
    });

    test("expected hosts: ports ignored, lookalikes aren't subdomains", () => {
        expect(isExpectedHost("api.named.com:8443", ["named.com"])).toBe(true);
        expect(isExpectedHost("evilnamed.com", ["named.com"])).toBe(false);
        expect(isExpectedHost("discord.com.evil.io", [])).toBe(false);
    });
});

describe("plugin activity: the fetch a plugin is evaluated with", () => {
    test("records the scrubbed request and its status, and hands back the real response", async () => {
        const { PluginActivity } = await import("../src/renderer/plugins/activity");
        const real = globalThis.fetch;
        const seen: unknown[] = [];
        globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
            seen.push([input, init?.body]);
            return new Response("ok", { status: 201 });
        }) as unknown as typeof globalThis.fetch;
        try {
            const { fetch } = PluginActivity.networkScope("demo");
            const res = await fetch("https://api.example.com/v1/send?token=hunter2", { method: "post", body: "secret body" });
            expect(await res.text()).toBe("ok");
            // The request itself goes through untouched
            expect(seen).toEqual([["https://api.example.com/v1/send?token=hunter2", "secret body"]]);
            await Promise.resolve();
            const events = PluginActivity.get("demo");
            expect(events.length).toBe(1);
            expect(events[0]).toMatchObject({ kind: "request", method: "POST", host: "api.example.com", path: "/v1/send", status: 201 });
            expect(JSON.stringify(events)).not.toContain("hunter2");
            expect(JSON.stringify(events)).not.toContain("secret body");

            // Code evaluated the way manager.ts evaluates plugins sees it as its bare `fetch`
            globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof globalThis.fetch;
            const outer = new Function("fetch", "XMLHttpRequest", "WebSocket", "return function (module) {module.exports = () => fetch('https://x.example.org/p');\n}");
            const module = { exports: undefined as unknown as () => Promise<Response> };
            outer(fetch, undefined, undefined)(module);
            await expect(module.exports()).rejects.toThrow("offline");
            await Promise.resolve();
            expect(PluginActivity.get("demo").at(-1)).toMatchObject({ host: "x.example.org", path: "/p", status: "error" });

            PluginActivity.clear("demo");
            expect(PluginActivity.get("demo")).toEqual([]);
        } finally {
            globalThis.fetch = real;
        }
    });
});
