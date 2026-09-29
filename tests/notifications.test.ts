import { describe, expect, test } from "bun:test";

import { EviNotification, freshArrivals, FRESH_FOR } from "../src/shared/notifications";

const NOW = 1_800_000_000_000;
const note = (id: string, at: number, read = false): EviNotification => ({ id, kind: "review", title: id, body: "", at, read });

describe("live toasts: what pops up", () => {
    test("unread, unseen and recent only, oldest first", () => {
        const list = [
            note("new", NOW - 1000),
            note("older", NOW - 60_000),
            note("read", NOW - 1000, true),
            note("seen", NOW - 1000),
            note("backlog", NOW - FRESH_FOR - 1),
        ];
        expect(freshArrivals(list, new Set(["seen"]), NOW).map(n => n.id)).toEqual(["older", "new"]);
    });

    test("nothing new, nothing to show", () => {
        expect(freshArrivals([], new Set(), NOW)).toEqual([]);
        expect(freshArrivals([note("a", NOW)], new Set(["a"]), NOW)).toEqual([]);
    });
});
