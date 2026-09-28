import { describe, expect, test } from "bun:test";

import { activeSuspect, Breadcrumb, CrashRecord, CURRENT_FRESH_MS, describeSite, isOfferable, MIN_BUSY_MS, parseBreadcrumb, parseCrashRecord, pickCrashSuspect, RECORD_MAX_AGE_MS } from "../src/shared/crashDetective";
import { DEFAULT_SETTINGS, EviSettings, PluginManifest } from "../src/shared/ipc";

const T = 1_000_000;
const crumb = (b: Partial<Breadcrumb> = {}): Breadcrumb => ({ at: T, running: ["a", "b"], busiest: [], ...b });
const site = (plugin: string, ms: number, name = "after sendMessage") => ({ plugin, kind: "hook", name, ms });

describe("picking a suspect", () => {
    test("no breadcrumb, or nothing busy, blames no one", () => {
        expect(pickCrashSuspect(undefined, T)).toBeUndefined();
        expect(pickCrashSuspect(crumb(), T)).toBeUndefined();
        expect(pickCrashSuspect(crumb({ busiest: [site("a", MIN_BUSY_MS - 1)] }), T)).toBeUndefined();
    });

    test("the plugin whose code was running wins, if the breadcrumb is recent", () => {
        const b = crumb({ busiest: [site("a", 900)], current: { plugin: "b", kind: "flux", name: "MESSAGE_CREATE", since: T - 10 } });
        expect(pickCrashSuspect(b, T + 1000)).toEqual({ plugin: "b", why: "running", site: { kind: "flux", name: "MESSAGE_CREATE" } });
        // Too old to say what was running at the crash: the busiest one instead
        expect(pickCrashSuspect(b, T + CURRENT_FRESH_MS + 1)?.plugin).toBe("a");
    });

    test("otherwise the busiest plugin, its time summed over its sites", () => {
        const b = crumb({ busiest: [site("a", 300), site("b", 200, "before x"), site("b", 150, "before y")] });
        expect(pickCrashSuspect(b, T)).toEqual({ plugin: "b", why: "busiest", site: { kind: "hook", name: "before x", ms: 350 } });
    });

    test("only plugins that run count, never Evi's own sites", () => {
        const b = crumb({ running: ["a"], busiest: [site("evi", 5000), site("a", 200)], current: { plugin: "evi", kind: "hook", name: "x", since: T } });
        expect(pickCrashSuspect(b, T)?.plugin).toBe("a");
    });
});

describe("offering it", () => {
    const manifests: PluginManifest[] = [{ id: "a", name: "A" }, { id: "b", name: "B", enabledByDefault: true }];
    const settings = (plugins: EviSettings["plugins"]): EviSettings => ({ ...structuredClone(DEFAULT_SETTINGS), plugins });
    const record = { at: T, reason: "crashed", suspect: { plugin: "a", why: "busiest" as const, site: { kind: "hook", name: "x" } } };

    test("only unseen, recent records with a suspect", () => {
        expect(isOfferable(record, T + 1000)).toBe(true);
        expect(isOfferable({ ...record, seen: true }, T + 1000)).toBe(false);
        expect(isOfferable({ ...record, suspect: undefined }, T + 1000)).toBe(false);
        expect(isOfferable(record, T + RECORD_MAX_AGE_MS + 1)).toBe(false);
        expect(isOfferable(undefined, T)).toBe(false);
    });

    test("only while the suspect is installed and on", () => {
        expect(activeSuspect(record, settings({ a: { enabled: true } }), manifests)?.plugin).toBe("a");
        expect(activeSuspect(record, settings({ a: { enabled: false } }), manifests)).toBeUndefined();
        expect(activeSuspect(record, settings({ a: { enabled: true } }), [])).toBeUndefined();
        const byDefault = { ...record, suspect: { ...record.suspect, plugin: "b" } };
        expect(activeSuspect(byDefault, settings({}), manifests)?.plugin).toBe("b");
    });
});

describe("sites in words", () => {
    test("hooks name what they hook", () => {
        expect(describeSite({ kind: "hook", name: "after sendMessage" })).toEqual({ words: "hook", name: "sendMessage" });
        expect(describeSite({ kind: "hook", name: "instead MessageStore.getMessage (getMessage2)" })).toEqual({ words: "hook", name: "MessageStore.getMessage" });
    });

    test("the other kinds", () => {
        expect(describeSite({ kind: "patch", name: "$self.renderButton" })).toEqual({ words: "patch", name: "renderButton" });
        expect(describeSite({ kind: "timer", name: "setInterval 1000 ms" })).toEqual({ words: "interval", name: "1000" });
        expect(describeSite({ kind: "timer", name: "setTimeout" })).toEqual({ words: "timer", name: "setTimeout" });
        expect(describeSite({ kind: "flux", name: "MESSAGE_CREATE" })).toEqual({ words: "flux", name: "MESSAGE_CREATE" });
        expect(describeSite({ kind: "start", name: "start()" }).words).toBe("start");
        expect(describeSite({ kind: "mystery", name: "x" })).toEqual({ words: "other", name: "x" });
    });
});

describe("parsing", () => {
    test("breadcrumbs from the page are checked", () => {
        expect(parseBreadcrumb(null)).toBeUndefined();
        expect(parseBreadcrumb({ at: "now", running: [], busiest: [] })).toBeUndefined();
        expect(parseBreadcrumb({ at: T, running: ["a", 3], busiest: [site("a", 5), { plugin: "b" }], current: { plugin: "a" } }))
            .toEqual({ at: T, running: ["a"], busiest: [site("a", 5)] });
    });

    test("crash records from disk survive damage", () => {
        expect(parseCrashRecord(undefined)).toBeUndefined();
        expect(parseCrashRecord({ at: T })).toBeUndefined();
        expect(parseCrashRecord({ at: T, reason: "oom", suspect: { plugin: "a", why: "guess" }, seen: "yes" })).toEqual({ at: T, reason: "oom" });
        const full: CrashRecord = { at: T, reason: "crashed", suspect: { plugin: "a", why: "busiest", site: { kind: "hook", name: "x", ms: 120 } }, breadcrumb: crumb(), seen: true };
        expect(parseCrashRecord(JSON.parse(JSON.stringify(full)))).toEqual(full);
    });
});
