import { describe as group, expect, test } from "bun:test";

import { describe, deserialize, formatRelative, observeMessage, observePresence, prune, serialize } from "../plugins/last-seen/track";
import type { Tracker } from "../plugins/last-seen/track";

const H = 3600_000;
const D = 24 * H;

group("observePresence", () => {
    test("online marks seen now, going offline records the transition", () => {
        const t: Tracker = new Map();
        expect(observePresence(t, "a", "online", 1000)).toBe(true);
        expect(t.get("a")).toEqual({ online: true, seen: 1000 });
        expect(observePresence(t, "a", "idle", 2000)).toBe(true);
        expect(t.get("a")!.seen).toBe(2000);
        expect(observePresence(t, "a", "offline", 5000)).toBe(true);
        expect(t.get("a")).toEqual({ online: false, seen: 5000 });
        // Staying offline changes nothing
        expect(observePresence(t, "a", "offline", 9000)).toBe(false);
        expect(t.get("a")!.seen).toBe(5000);
    });

    test("someone never seen online isn't recorded", () => {
        const t: Tracker = new Map();
        expect(observePresence(t, "b", "offline", 1000)).toBe(false);
        expect(observePresence(t, "b", undefined, 1000)).toBe(false);
        expect(observePresence(t, "b", "invisible", 1000)).toBe(false);
        expect(t.size).toBe(0);
    });

    test("dnd counts as online, invisible as offline", () => {
        const t: Tracker = new Map();
        observePresence(t, "c", "dnd", 10);
        expect(t.get("c")!.online).toBe(true);
        observePresence(t, "c", "invisible", 20);
        expect(t.get("c")).toEqual({ online: false, seen: 20 });
    });
});

group("observeMessage", () => {
    test("keeps the latest message time", () => {
        const t: Tracker = new Map();
        observeMessage(t, "a", 500);
        observeMessage(t, "a", 300);
        expect(t.get("a")!.message).toBe(500);
        observeMessage(t, "a", 900);
        expect(t.get("a")!.message).toBe(900);
    });
});

group("prune", () => {
    test("drops least recently touched first", () => {
        const t: Tracker = new Map();
        observeMessage(t, "a", 1, 3);
        observeMessage(t, "b", 2, 3);
        observeMessage(t, "c", 3, 3);
        observeMessage(t, "a", 4, 3); // a is now most recent
        observeMessage(t, "d", 5, 3); // b goes
        expect([...t.keys()]).toEqual(["c", "a", "d"]);
        expect(prune(t, 1)).toBe(2);
        expect([...t.keys()]).toEqual(["d"]);
    });

    test("presence observations prune too", () => {
        const t: Tracker = new Map();
        for (let i = 0; i < 10; i++) observePresence(t, `u${i}`, "online", i, 5);
        expect(t.size).toBe(5);
        expect(t.has("u0")).toBe(false);
        expect(t.has("u9")).toBe(true);
    });
});

group("serialize / deserialize", () => {
    test("round trips and turns stale online flags into last seen at save time", () => {
        const t: Tracker = new Map();
        observePresence(t, "on", "online", 100);
        observePresence(t, "off", "online", 100);
        observePresence(t, "off", "offline", 200);
        observeMessage(t, "msg", 300);
        const saved = serialize(t, 1000);
        const back = deserialize(JSON.parse(JSON.stringify(saved)));
        expect(back.get("on")).toEqual({ seen: 1000 });
        expect(back.get("off")).toEqual({ seen: 200 });
        expect(back.get("msg")).toEqual({ message: 300 });
        expect([...back.keys()]).toEqual(["on", "off", "msg"]);
    });

    test("tolerates junk and applies the cap", () => {
        expect(deserialize(null).size).toBe(0);
        expect(deserialize({ rows: "nope" }).size).toBe(0);
        const back = deserialize({ v: 1, savedAt: 0, rows: [[1, 2, 3, 0], ["a", 5, 0, 0], ["b", 0, 0, 0], ["c", 0, 7, 0], ["d", 9, 9, 0]] }, 2);
        expect([...back.keys()]).toEqual(["c", "d"]);
    });
});

group("formatRelative", () => {
    const now = 1_000 * D;
    test.each([
        [now - 10_000, "just now"],
        [now - 5 * 60_000, "5m ago"],
        [now - 3 * H - 59 * 60_000, "3h ago"],
        [now - 2 * D, "2d ago"],
        [now - 15 * D, "2w ago"],
        [now - 70 * D, "2mo ago"],
        [now - 800 * D, "2y ago"],
        [now + 5000, "just now"],
    ])("%p", (then, expected) => {
        expect(formatRelative(then, now)).toBe(expected);
    });
});

group("describe", () => {
    const now = 10 * D;
    test("combines last seen and last message", () => {
        expect(describe({ seen: now - 3 * H, message: now - 2 * D }, false, now)).toBe("Last seen 3h ago · Last message 2d ago");
    });
    test("online now wins over the stored time", () => {
        expect(describe({ seen: now - 3 * H, message: now - 60_000 }, true, now)).toBe("Online now · Last message 1m ago");
        expect(describe(undefined, true, now)).toBe("Online now");
    });
    test("nothing known", () => {
        expect(describe(undefined, false, now)).toBeNull();
        expect(describe({}, false, now)).toBeNull();
    });
});
