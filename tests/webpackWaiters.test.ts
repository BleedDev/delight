import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";

type Find = typeof import("../src/renderer/webpack/find");
type Common = typeof import("../src/renderer/webpack/common");

const g = globalThis as any;
let find: Find;
let common: Common;
let req: any;
let nextId = 1000;

/** Registers one module the way a Discord chunk does and runs it, returning its id */
function load(factory: (module: any, exports: any, require: any) => void): string {
    const id = String(nextId++);
    g.webpackChunkdiscord_app.push([[id], { [id]: factory }]);
    req(id);
    return id;
}

beforeAll(async () => {
    // Just enough of a page for runtime.ts and find.ts, removed again after these tests
    g.window = g;
    g.document = { documentElement: {} };
    const runtime = await import("../src/renderer/webpack/runtime");
    find = await import("../src/renderer/webpack/find");
    common = await import("../src/renderer/webpack/common");
    runtime.interceptWebpack();

    // A minimal rspack runtime: a module cache, require.d getters, and the chunk array's push chain
    const m: Record<string, any> = {};
    const c: Record<string, any> = {};
    req = (id: string) => {
        if (c[id]) return c[id].exports;
        const module = c[id] = { id, loaded: false, exports: {} };
        m[id].call(module.exports, module, module.exports, req);
        module.loaded = true;
        return module.exports;
    };
    Object.assign(req, {
        m,
        c,
        o: (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key),
        d(exports: object, definition: Record<string, () => unknown>) {
            for (const key in definition) if (!req.o(exports, key)) Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
        },
    });
    const jsonp = (parentPush: ((data: unknown) => void) | 0, data: [unknown, Record<string, unknown>, ((r: unknown) => void)?]) => {
        Object.assign(m, data[1]);
        data[2]?.(req);
        if (parentPush) parentPush(data);
    };
    const chunks = g.webpackChunkdiscord_app = g.webpackChunkdiscord_app || [];
    chunks.forEach(jsonp.bind(null, 0));
    chunks.push = jsonp.bind(null, chunks.push.bind(chunks));
});

afterAll(() => {
    delete g.webpackChunkdiscord_app;
    delete g.window;
    delete g.document;
});

describe("waitFor", () => {
    test("waiters for equal filters test each module once between them, called back in the order they asked", () => {
        let reads = 0;
        const calls: string[] = [];
        for (const name of ["a", "b", "c"]) {
            find.waitFor(find.filters.byProps("eviTestRoot"), (value, found) => calls.push(`${name}:${found.key}:${value.tag}`));
        }
        const target = { tag: "dom", get eviTestRoot() { return ++reads; } };
        load((_, exports, require) => require.d(exports, { other: () => ({}), client: () => target }));

        expect(calls).toEqual(["a:client:dom", "b:client:dom", "c:client:dom"]);
        expect(reads).toBe(1);
        expect(find.pendingWaiters()).not.toContain("props eviTestRoot");
    });

    test("the same filter object waited for twice calls back twice", () => {
        const filter = find.filters.byCode("eviTestTwice");
        const calls: unknown[] = [];
        find.waitFor(filter, (_, found) => calls.push(found.key));
        find.waitFor(filter, (_, found) => calls.push(found.key));
        load((_, exports, require) => require.d(exports, { render: () => () => "eviTestTwice" }));
        expect(calls).toEqual(["render", "render"]);
    });

    test("the first matching export wins, like findExport", () => {
        let found: string | undefined;
        find.waitFor(find.filters.byProps("eviTestOrder"), (_, f) => found = f.key);
        load((_, exports, require) => require.d(exports, { a: () => ({}), b: () => ({ eviTestOrder: 1 }), c: () => ({ eviTestOrder: 2 }) }));
        expect(found).toBe("b");
    });

    test("code waiters only look at modules whose source has every snippet", () => {
        const anyFunction = Object.assign((v: any) => typeof v === "function", { $code: ["eviTestSnippet", "second"] });
        const sameCode = Object.assign((v: any) => typeof v === "function", { $code: ["eviTestSnippet", "second"] });
        const ids: string[] = [];
        find.waitFor(anyFunction, (_, found) => ids.push(`first:${found.id}`));
        find.waitFor(sameCode, (_, found) => ids.push(`same:${found.id}`));

        load((_, exports, require) => require.d(exports, { fn: () => () => "eviTestSnippet only" }));
        expect(ids).toEqual([]);
        const id = load((_, exports, require) => require.d(exports, { fn: () => () => "eviTestSnippet and second" }));
        expect(ids).toEqual([`first:${id}`, `same:${id}`]);
    });

    test("RegExp snippets match for every waiter, and only the same pattern and flags count as equal", () => {
        const calls: string[] = [];
        find.waitFor(find.filters.byCode(/eviTestRe\d/), () => calls.push("a"));
        find.waitFor(find.filters.byCode(/eviTestRe\d/), () => calls.push("b"));
        find.waitFor(find.filters.byCode(/EVITESTRE\d/i), () => calls.push("i"));
        const literal = find.filters.byCode("eviTestRe\\d");
        find.waitFor(literal, () => calls.push("string"));
        load((_, exports, require) => require.d(exports, { fn: () => () => "eviTestRe1" }));
        expect(calls).toEqual(["a", "b", "i"]);
        expect(find.pendingWaiters()).toContain(find.describeFilter(literal));
    });

    test("arguments that aren't strings or RegExps never count as equal", () => {
        // Both serialize to {}, but name different properties
        const a = { toString: () => "eviTestPropA" };
        const b = { toString: () => "eviTestPropB" };
        const calls: string[] = [];
        find.waitFor(find.filters.byProps(a as any), () => calls.push("a"));
        find.waitFor(find.filters.byProps(b as any), () => calls.push("b"));
        load((_, exports, require) => require.d(exports, { x: () => ({ eviTestPropA: 1 }) }));
        expect(calls).toEqual(["a"]);
    });

    test("a waiter for something already loaded calls back at once", () => {
        load((_, exports, require) => require.d(exports, { thing: () => ({ eviTestLoaded: true }) }));
        let value: any;
        find.waitFor(find.filters.byProps("eviTestLoaded"), v => value = v);
        expect(value).toEqual({ eviTestLoaded: true });
    });
});

describe("findStore", () => {
    const store = (name: string, tag: string) => ({ _dispatchToken: `t-${tag}`, getName: () => name, tag });

    test("stores of modules that load after the first lookup are found, the first one of a name wins", () => {
        load((_, exports, require) => require.d(exports, { s: () => store("EviTestEarlyStore", "early") }));
        expect(find.findStore("EviTestEarlyStore").tag).toBe("early");

        load((_, exports, require) => require.d(exports, { s: () => store("EviTestLateStore", "first") }));
        load((_, exports, require) => require.d(exports, { s: () => store("EviTestLateStore", "second") }));
        expect(find.findStore("EviTestLateStore").tag).toBe("first");
    });

    test("listStores lists stores that loaded since", () => {
        load((_, exports, require) => require.d(exports, { s: () => store("EviTestListedStore", "listed") }));
        expect(find.listStores()).toContain("EviTestListedStore");
    });
});

describe("onCreateRootReady", () => {
    test("one lookup serves every caller, in order, and a throwing callback doesn't stop the rest", () => {
        const calls: string[] = [];
        const error = spyOn(console, "error").mockImplementation(() => { });
        common.onCreateRootReady(() => calls.push("a"));
        common.onCreateRootReady(() => {
            throw new Error("boom");
        });
        common.onCreateRootReady(() => calls.push("c"));
        expect(find.pendingWaiters().filter(w => w === "props createRoot")).toHaveLength(1);

        load((_, exports) => {
            exports.createRoot = () => ({});
        });
        expect(calls).toEqual(["a", "c"]);
        expect(error).toHaveBeenCalledTimes(1);
        error.mockRestore();

        common.onCreateRootReady(() => calls.push("late"));
        expect(calls).toEqual(["a", "c", "late"]);
    });
});
