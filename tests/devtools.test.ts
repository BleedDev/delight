import { describe, expect, test } from "bun:test";

import {
    actionKeys, describeValue, evaluateGetters, matchesType, patchHits, RingBuffer, TREE_LIMITS, treeChildren, zeroArgGetters,
} from "../src/shared/devtools";

describe("ring buffer", () => {
    test("keeps the last `capacity` items, oldest first", () => {
        const log = new RingBuffer<number>(3);
        expect(log.toArray()).toEqual([]);
        log.push(1);
        log.push(2);
        expect(log.toArray()).toEqual([1, 2]);
        log.push(3);
        log.push(4);
        log.push(5);
        expect(log.toArray()).toEqual([3, 4, 5]);
        expect(log.newestFirst()).toEqual([5, 4, 3]);
        expect(log.size).toBe(3);
        expect(log.total).toBe(5);
    });

    test("wraps around many times", () => {
        const log = new RingBuffer<number>(500);
        for (let i = 0; i < 1234; i++) log.push(i);
        const items = log.toArray();
        expect(items).toHaveLength(500);
        expect(items[0]).toBe(734);
        expect(items[499]).toBe(1233);
    });

    test("clear empties it and starts counting again", () => {
        const log = new RingBuffer<string>(2);
        log.push("a");
        log.push("b");
        log.push("c");
        log.clear();
        expect(log.size).toBe(0);
        expect(log.total).toBe(0);
        log.push("d");
        expect(log.toArray()).toEqual(["d"]);
    });

    test("a buffer needs room", () => {
        expect(() => new RingBuffer(0)).toThrow();
    });
});

describe("describing values", () => {
    test("primitives", () => {
        expect(describeValue("hi")).toEqual({ kind: "string", label: "\"hi\"", expandable: false });
        expect(describeValue(42).label).toBe("42");
        expect(describeValue(-0).label).toBe("-0");
        expect(describeValue(10n).label).toBe("10n");
        expect(describeValue(null).kind).toBe("null");
        expect(describeValue(undefined).kind).toBe("undefined");
        expect(describeValue(Symbol("s")).label).toBe("Symbol(s)");
        expect(describeValue(true).label).toBe("true");
    });

    test("long strings are cut", () => {
        const info = describeValue("x".repeat(1000));
        expect(info.label.length).toBeLessThan(TREE_LIMITS.string + 5);
        expect(info.label.endsWith("…\"")).toBe(true);
    });

    test("functions and classes", () => {
        function named() { }
        class Thing { }
        expect(describeValue(named)).toEqual({ kind: "function", label: "ƒ named()", expandable: false });
        expect(describeValue(Thing).label).toBe("class Thing");
        expect(describeValue(() => { }).label).toBe("ƒ anonymous()");
    });

    test("collections and objects", () => {
        expect(describeValue([1, 2, 3])).toEqual({ kind: "array", label: "Array(3)", expandable: true });
        expect(describeValue([]).expandable).toBe(false);
        expect(describeValue(new Map([["a", 1]])).label).toBe("Map(1)");
        expect(describeValue(new Set()).expandable).toBe(false);
        expect(describeValue({ a: 1 })).toEqual({ kind: "object", label: "{…}", expandable: true });
        expect(describeValue({}).label).toBe("{}");
        expect(describeValue(Object.create(null)).label).toBe("{}");
        expect(describeValue(new Date(0)).label).toBe("1970-01-01T00:00:00.000Z");
        expect(describeValue(/a+/g).label).toBe("/a+/g");
        expect(describeValue(new TypeError("bad")).label).toBe("TypeError: bad");
    });

    test("class instances say their class", () => {
        class UserRecord { id = "1"; }
        expect(describeValue(new UserRecord()).label).toBe("UserRecord {…}");
    });

    test("values that throw when read are unreadable, not a crash", () => {
        const hostile = new Proxy({}, { ownKeys() { throw new Error("no"); }, getPrototypeOf() { throw new Error("no"); } });
        expect(describeValue(hostile).kind).toBe("unreadable");
    });
});

describe("tree children", () => {
    test("object keys, and getters that throw", () => {
        const value = {
            a: 1,
            get broken() {
                throw new Error("nope");
            },
        };
        const { children, more } = treeChildren(value, [value]);
        expect(children.map(c => c.key)).toEqual(["a", "broken"]);
        expect(children[1].info.label).toBe("(threw: nope)");
        expect(children[1].canExpand).toBe(false);
        expect(more).toBe(0);
    });

    test("cycles show as [Circular] and can't be opened", () => {
        const a: any = { name: "a" };
        a.self = a;
        a.child = { parent: a };
        const top = treeChildren(a, [a]).children;
        const self = top.find(c => c.key === "self")!;
        expect(self.info.kind).toBe("circular");
        expect(self.canExpand).toBe(false);
        const child = top.find(c => c.key === "child")!;
        expect(child.canExpand).toBe(true);
        const nested = treeChildren(child.value, [a, child.value]).children;
        expect(nested[0].info.label).toBe("[Circular]");
    });

    test("the same object twice (not a cycle) opens both times", () => {
        const shared = { x: 1 };
        const value = { left: shared, right: shared };
        const { children } = treeChildren(value, [value]);
        expect(children.every(c => c.canExpand)).toBe(true);
    });

    test("big arrays, maps and sets are cut with a count of the rest", () => {
        const big = Array.from({ length: 1000 }, (_, i) => i);
        const arr = treeChildren(big, [big]);
        expect(arr.children).toHaveLength(TREE_LIMITS.children);
        expect(arr.more).toBe(1000 - TREE_LIMITS.children);

        const map = new Map(big.map(i => [`k${i}`, i]));
        const fromMap = treeChildren(map, [map]);
        expect(fromMap.children[0]).toMatchObject({ key: "k0", value: 0 });
        expect(fromMap.more).toBe(1000 - TREE_LIMITS.children);

        const set = new Set(big);
        expect(treeChildren(set, [set]).more).toBe(1000 - TREE_LIMITS.children);
    });

    test("map keys that aren't strings are described", () => {
        const map = new Map<unknown, number>([[{ id: 1 }, 1], [5, 2]]);
        expect(treeChildren(map, [map]).children.map(c => c.key)).toEqual(["{…}", "5"]);
    });

    test("errors show name, message and stack", () => {
        const err = new Error("boom");
        expect(treeChildren(err, [err]).children.map(c => c.key)).toEqual(expect.arrayContaining(["name", "message", "stack"]));
    });

    test("nothing opens past the depth limit", () => {
        const limits = { ...TREE_LIMITS, depth: 2 };
        const value = { a: { b: { c: {} } } };
        expect(treeChildren(value, [value], limits).children[0].canExpand).toBe(true);
        expect(treeChildren(value.a, [value, value.a], limits).children[0].canExpand).toBe(false);
    });

    test("functions and primitives have no children", () => {
        expect(treeChildren(() => { }, []).children).toEqual([]);
        expect(treeChildren(5, []).children).toEqual([]);
    });
});

describe("flux helpers", () => {
    test("an action's keys besides type, the first few", () => {
        expect(actionKeys({ type: "MESSAGE_CREATE", channelId: "1", message: {}, optimistic: false })).toEqual({ keys: ["channelId", "message", "optimistic"], more: 0 });
        expect(actionKeys({ type: "X", a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toEqual({ keys: ["a", "b", "c", "d"], more: 2 });
        expect(actionKeys(null)).toEqual({ keys: [], more: 0 });
    });

    test("type filter: every word, any case", () => {
        expect(matchesType("MESSAGE_CREATE", "message")).toBe(true);
        expect(matchesType("MESSAGE_CREATE", "msg")).toBe(false);
        expect(matchesType("CHANNEL_SELECT", "chan sel")).toBe(true);
        expect(matchesType("ANY", "")).toBe(true);
    });
});

describe("store getters", () => {
    class Base {
        getDispatchToken() {
            return "token";
        }
    }
    class FakeStore extends Base {
        private users = ["a"];
        getUsers() {
            return this.users;
        }
        getUser(id: string) {
            return id;
        }
        isReady() {
            return true;
        }
        hasLoaded() {
            throw new Error("not yet");
        }
        get getterProperty() {
            return 1;
        }
        emitChange() { }
        getter() { }
    }

    test("zero-argument getters along the prototype chain, sorted", () => {
        expect(zeroArgGetters(new FakeStore())).toEqual(["getDispatchToken", "getUsers", "hasLoaded", "isReady"]);
    });

    test("evaluated, with what throws caught", () => {
        const store = new FakeStore();
        expect(evaluateGetters(store, ["getUsers", "hasLoaded"])).toEqual([
            { name: "getUsers", value: ["a"] },
            { name: "hasLoaded", error: "not yet" },
        ]);
    });
});

describe("patch hits", () => {
    const reports = [
        {
            plugin: "busy",
            sites: [
                { kind: "hook", name: "before dispatch", calls: 900, ms: 5, max: 1 },
                { kind: "patch", name: "$self.render", calls: 40, ms: 2, max: 0.5, recent: { calls: 4, ms: 0.2 } },
                { kind: "patch", name: "$self.filter", calls: 400, ms: 1, max: 0.1, recent: { calls: 10, ms: 0.1 } },
            ],
        },
        { plugin: "hooks-only", sites: [{ kind: "hook", name: "x", calls: 5, ms: 1, max: 1 }] },
    ];
    const records = [
        { plugin: "busy", index: 1, state: "applied", modules: ["2"], errors: [] },
        { plugin: "busy", index: 0, state: "applied", modules: ["1"], errors: [] },
        { plugin: "quiet", index: 0, state: "failed", modules: [], errors: ["matched nothing"] },
    ];

    test("per plugin: $self functions busiest first, patches in order", () => {
        const hits = patchHits(reports, records);
        expect(hits.map(h => h.plugin)).toEqual(["busy", "quiet"]);
        const busy = hits[0];
        expect(busy.calls).toBe(440);
        expect(busy.ms).toBe(3);
        expect(busy.functions.map(f => f.name)).toEqual(["$self.filter", "$self.render"]);
        expect(busy.functions[0]).toMatchObject({ calls: 400, recentCalls: 10 });
        expect(busy.patches.map(p => p.index)).toEqual([0, 1]);
    });

    test("a plugin whose patches never called in still shows, with its patch health", () => {
        const quiet = patchHits(reports, records).find(h => h.plugin === "quiet")!;
        expect(quiet.functions).toEqual([]);
        expect(quiet.patches).toEqual([{ index: 0, state: "failed", modules: 0, errors: 1 }]);
    });

    test("plugins with only hooks aren't listed", () => {
        expect(patchHits(reports, []).map(h => h.plugin)).toEqual(["busy"]);
    });
});
