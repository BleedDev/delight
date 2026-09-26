import { describe, expect, test } from "bun:test";

import { getUnhooked, hook, rebaseHooks } from "../src/renderer/patching/hooks";

describe("hooks", () => {
    test("before, instead and after compose in order", () => {
        const obj = { f: (x: number) => x * 2 };
        hook(obj, "f", "instead", ctx => ctx.callOriginal(ctx.args[0] + 1) + 100);
        hook(obj, "f", "before", ctx => { ctx.args[0] = 10; });
        hook(obj, "f", "after", ctx => ctx.result + 1);
        expect(obj.f(1)).toBe((10 + 1) * 2 + 100 + 1);
    });

    test("the newest instead hook is outermost", () => {
        const calls: string[] = [];
        const obj = { f: () => calls.push("original") };
        hook(obj, "f", "instead", ctx => { calls.push("first"); return ctx.callOriginal(); });
        hook(obj, "f", "instead", ctx => { calls.push("second"); return ctx.callOriginal(); });
        obj.f();
        expect(calls).toEqual(["second", "first", "original"]);
    });

    test("a throwing hook is skipped, the call still works", () => {
        const obj = { f: () => 1 };
        hook(obj, "f", "before", () => { throw new Error("boom"); });
        hook(obj, "f", "instead", () => { throw new Error("boom"); });
        expect(obj.f()).toBe(1);
    });

    test("removing every hook restores the exact original property", () => {
        const f = () => 1;
        const obj = { f };
        const a = hook(obj, "f", "after", () => 2);
        const b = hook(obj, "f", "before", () => { });
        expect(obj.f()).toBe(2);
        a();
        b();
        expect(obj.f).toBe(f);
    });

    test("getter exports (webpack style) are restored as getters", () => {
        const f = () => 1;
        const exports = {};
        Object.defineProperty(exports, "A", { configurable: true, enumerable: true, get: () => f });
        const unhook = hook(exports as any, "A", "after", () => 2);
        expect((exports as any).A()).toBe(2);
        unhook();
        expect(typeof Object.getOwnPropertyDescriptor(exports, "A")!.get).toBe("function");
    });

    test("construct through a hooked class", () => {
        class K { constructor(public v: number) { } }
        const mod = { K };
        hook(mod, "K", "after", ctx => { ctx.result.hooked = true; });
        const k = new (mod.K as any)(5);
        expect(k).toBeInstanceOf(K);
        expect(k.v).toBe(5);
        expect(k.hooked).toBe(true);
    });

    test("wrapper keeps statics and original source", () => {
        function Component() { return "x"; }
        (Component as any).displayName = "Thing";
        const mod = { Component };
        hook(mod, "Component", "after", () => { });
        expect((mod.Component as any).displayName).toBe("Thing");
        expect(String(mod.Component)).toBe(String(Component));
        expect(getUnhooked(mod.Component)).toBe(Component);
    });

    test("rebase moves hooks onto replaced exports (live module replacement)", () => {
        const exports: any = { f: () => "old", actions: { send: (m: string) => `old:${m}` } };
        hook(exports, "f", "after", ctx => ctx.result + "+hook");
        const unhookSend = hook(exports.actions, "send", "before", ctx => { ctx.args[0] = ctx.args[0].toUpperCase(); });

        const oldValues = new Map<PropertyKey, unknown>(Object.entries(exports));
        exports.f = () => "new";
        exports.actions = { send: (m: string) => `new:${m}` };
        rebaseHooks(exports, oldValues);

        expect(exports.f()).toBe("new+hook");
        expect(exports.actions.send("hi")).toBe("new:HI");

        // Unhooking after a rebase restores the new function, on the new object
        unhookSend();
        expect(exports.actions.send("hi")).toBe("new:hi");
    });
});

import { lazy } from "../src/renderer/utils/lazy";

test("hooking a lazy proxy hooks the real object", () => {
    const real = { dispatch: (x: number) => x };
    const proxy = lazy(() => real);
    hook(proxy, "dispatch", "after", ctx => ctx.result + 1);
    expect(real.dispatch(1)).toBe(2);
    expect(proxy.dispatch(1)).toBe(2);
});
