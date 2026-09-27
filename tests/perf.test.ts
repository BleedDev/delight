import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { hook } from "../src/renderer/patching/hooks";
import { Perf, WINDOW_S } from "../src/renderer/perf";

// A clock the test moves by hand, so times are exact
const realNow = performance.now;
let clock = 0;
const spend = (ms: number) => void (clock += ms);

beforeEach(() => {
    clock = 100_000;
    performance.now = () => clock;
});

afterEach(() => {
    performance.now = realNow;
    if (Perf.recording) Perf.stopRecording();
});

const report = (plugin: string) => Perf.snapshot().find(p => p.plugin === plugin);
const siteOf = (plugin: string, name: string) => report(plugin)?.sites.find(s => s.name === name);

describe("perf", () => {
    test("counts calls, total and worst call per site", () => {
        const f = Perf.measure(Perf.site("p-basic", "flux", "MESSAGE_CREATE"), (ms: number) => spend(ms));
        f(2);
        f(5);
        f(1);
        const site = siteOf("p-basic", "MESSAGE_CREATE")!;
        expect(site).toMatchObject({ kind: "flux", calls: 3, ms: 8, max: 5 });
        expect(report("p-basic")).toMatchObject({ calls: 3, ms: 8, max: 5 });
    });

    test("a site is created once and shared", () => {
        expect(Perf.site("p-same", "hook", "x")).toBe(Perf.site("p-same", "hook", "x"));
        expect(Perf.site("p-same", "hook", "x")).not.toBe(Perf.site("p-same", "flux", "x"));
    });

    test("nested time is charged to the inner site only", () => {
        const inner = Perf.measure(Perf.site("p-inner", "hook", "inner"), () => spend(7));
        const outer = Perf.measure(Perf.site("p-outer", "hook", "outer"), () => {
            spend(2);
            inner();
            spend(1);
        });
        outer();
        expect(siteOf("p-outer", "outer")!.ms).toBe(3);
        expect(siteOf("p-inner", "inner")!.ms).toBe(7);
    });

    test("a throwing call is still measured and leaves nesting intact", () => {
        const bad = Perf.measure(Perf.site("p-throw", "timer", "bad"), () => {
            spend(4);
            throw new Error("boom");
        });
        expect(() => bad()).toThrow("boom");
        const outer = Perf.measure(Perf.site("p-throw", "timer", "outer"), () => {
            spend(1);
            try {
                bad();
            } catch { }
        });
        outer();
        expect(siteOf("p-throw", "bad")).toMatchObject({ calls: 2, ms: 8 });
        expect(siteOf("p-throw", "outer")!.ms).toBe(1);
    });

    test("recent time covers only the last window", () => {
        const f = Perf.measure(Perf.site("p-window", "flux", "TICK"), (ms: number) => spend(ms));
        f(3);
        clock += (WINDOW_S + 1) * 1000;
        f(2);
        const site = siteOf("p-window", "TICK")!;
        expect(site.ms).toBe(5);
        expect(site.recent).toEqual({ calls: 1, ms: 2, max: 2 });
        clock += (WINDOW_S + 1) * 1000;
        expect(siteOf("p-window", "TICK")!.recent).toEqual({ calls: 0, ms: 0, max: 0 });
    });

    test("plugins and their sites are sorted by recent time, then by all time", () => {
        const slowOld = Perf.measure(Perf.site("p-sort-old", "flux", "A"), () => spend(50));
        const fastNew = Perf.measure(Perf.site("p-sort-new", "flux", "B"), () => spend(1));
        slowOld();
        clock += (WINDOW_S + 1) * 1000;
        fastNew();
        const order = Perf.snapshot().map(p => p.plugin).filter(id => id.startsWith("p-sort"));
        expect(order).toEqual(["p-sort-new", "p-sort-old"]);
    });

    test("a recording holds only what ran while it did, and lists slow calls", () => {
        const f = Perf.measure(Perf.site("p-rec", "hook", "after render"), (ms: number) => spend(ms));
        f(9);
        Perf.startRecording();
        spend(100);
        f(0.5);
        f(3);
        spend(100);
        const rec = Perf.stopRecording();
        expect(rec.ms).toBe(203.5);
        const plugin = rec.plugins.find(p => p.plugin === "p-rec")!;
        expect(plugin).toMatchObject({ calls: 2, ms: 3.5, max: 3 });
        expect(plugin.sites[0]).toMatchObject({ kind: "hook", name: "after render", calls: 2 });
        expect(rec.slowCalls.filter(c => c.plugin === "p-rec")).toEqual([{ plugin: "p-rec", kind: "hook", name: "after render", ms: 3, at: 100.5 }]);
        // Calls after it stopped don't count
        f(2);
        expect(Perf.stopRecording().plugins.find(p => p.plugin === "p-rec")).toMatchObject({ calls: 2, ms: 3.5 });
    });

    test("reset zeroes every site, and they keep counting after", () => {
        const f = Perf.measure(Perf.site("p-reset", "timer", "tick"), () => spend(1));
        f();
        Perf.reset();
        expect(report("p-reset")).toBeUndefined();
        f();
        expect(siteOf("p-reset", "tick")).toMatchObject({ calls: 1, ms: 1 });
    });
});

describe("perf hooks", () => {
    test("before and after hooks are charged to their plugin, named after what they hook", () => {
        class ChannelStore {
            static displayName = "ChannelStore";
            getChannel(id: string) {
                spend(10);
                return id;
            }
        }
        const store = new ChannelStore();
        hook(store, "getChannel", "before", () => spend(1), "p-hooks");
        hook(store, "getChannel", "after", () => spend(2), "p-hooks");
        expect(store.getChannel("1")).toBe("1");
        expect(siteOf("p-hooks", "before ChannelStore.getChannel")).toMatchObject({ calls: 1, ms: 1 });
        expect(siteOf("p-hooks", "after ChannelStore.getChannel")).toMatchObject({ calls: 1, ms: 2 });
        // The original's 10 ms belong to Discord
        expect(report("p-hooks")!.ms).toBe(3);
    });

    test("an instead hook is charged its own work, not the original it calls through to", () => {
        const exports = { Z: function MessageList() { spend(20); return "list"; } };
        hook(exports, "Z", "instead", ctx => {
            spend(3);
            const result = ctx.callOriginal();
            spend(1);
            return result;
        }, "p-instead");
        expect(exports.Z()).toBe("list");
        // Minified key, readable function name
        expect(siteOf("p-instead", "instead MessageList")).toMatchObject({ calls: 1, ms: 4 });
    });

    test("stacked instead hooks each pay for their own part", () => {
        const obj = { f: () => spend(10) };
        hook(obj, "f", "instead", ctx => { spend(2); return ctx.callOriginal(); }, "p-stack-a");
        hook(obj, "f", "instead", ctx => { spend(5); return ctx.callOriginal(); }, "p-stack-b");
        obj.f();
        expect(report("p-stack-a")!.ms).toBe(2);
        expect(report("p-stack-b")!.ms).toBe(5);
    });
});

describe("perf $self", () => {
    test("functions are measured per method, with the definition as this", () => {
        const definition = {
            count: 2,
            isHidden(id: string) {
                spend(this.count);
                return id === "x";
            },
        };
        const self = Perf.measuredSelf("p-self", definition);
        expect(self.isHidden("x")).toBe(true);
        expect(self.count).toBe(2);
        expect(siteOf("p-self", "$self.isHidden")).toMatchObject({ kind: "patch", calls: 1, ms: 2 });
    });

    test("wrappers keep their identity, so components don't remount", () => {
        function LockIcon() {
            return null;
        }
        (LockIcon as any).displayName = "LockIcon";
        const definition: Record<string, unknown> = { LockIcon };
        const self = Perf.measuredSelf("p-self-id", definition) as any;
        expect(Perf.measuredSelf("p-self-id", definition)).toBe(self);
        expect(self.LockIcon).toBe(self.LockIcon);
        expect(self.LockIcon).not.toBe(LockIcon);
        expect(self.LockIcon.displayName).toBe("LockIcon");
        // A new function on the property gets a new wrapper
        definition.LockIcon = () => null;
        expect(self.LockIcon).not.toBe(LockIcon);
        expect(self.LockIcon()).toBe(null);
    });

    test("classes, frozen definitions and non-functions are left alone", () => {
        class Widget { }
        const definition = { Widget, settings: { a: 1 } };
        const self = Perf.measuredSelf("p-self-class", definition);
        expect(self.Widget).toBe(Widget);
        expect(self.settings).toBe(definition.settings);
        const frozen = Object.freeze({ f: () => 1 });
        expect(Perf.measuredSelf("p-self-frozen", frozen)).toBe(frozen);
    });

    test("optional calls through $self still work", () => {
        const self = Perf.measuredSelf("p-self-opt", { a: () => 1 } as Record<string, any>);
        expect(self?.a?.()).toBe(1);
        expect(self?.missing?.()).toBeUndefined();
    });
});

describe("perf overhead", () => {
    test("one measurement costs well under a microsecond", () => {
        performance.now = realNow;
        const us = Perf.measureOverhead();
        console.log(`perf: ${us.toFixed(3)} µs per measured call (Bun)`);
        expect(us).toBeGreaterThan(0);
        expect(us).toBeLessThan(2);
    });
});
