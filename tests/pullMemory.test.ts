import { describe, expect, test } from "bun:test";

import { pullKey, readPullMemory, unseenPulls } from "../src/renderer/pullMemory";
import type { PulledPlugin } from "../src/shared/pulls";

const pull = (at = 1000, extra: Partial<PulledPlugin> = {}): PulledPlugin => ({ versions: ["1.0.0"], reason: "Sends your messages somewhere", at, removed: false, ...extra });
const install = (id: string, p = pull(), enabled = true) => ({ id, pull: p, enabled });

describe("unseenPulls", () => {
    test("tells about a pull once, then remembers it", () => {
        const first = unseenPulls([install("a")], {}, 5000);
        expect(first.due.map(p => p.id)).toEqual(["a"]);
        expect(first.memory).toEqual({ [pullKey("a", pull())]: 5000 });
        expect(unseenPulls([install("a")], first.memory, 9000).due).toEqual([]);
    });

    test("pulled again later is news again", () => {
        const { memory } = unseenPulls([install("a")], {}, 5000);
        expect(unseenPulls([install("a", pull(2000))], memory, 9000).due.map(p => p.id)).toEqual(["a"]);
    });

    test("a plugin that was off anyway isn't news, and isn't remembered", () => {
        const result = unseenPulls([install("a", pull(), false)], {}, 5000);
        expect(result.due).toEqual([]);
        expect(result.memory).toEqual({});
    });

    test("forgets pulls that no longer apply", () => {
        const memory = { [pullKey("a", pull())]: 5000, [pullKey("gone", pull())]: 5000 };
        expect(unseenPulls([install("a")], memory, 9000).memory).toEqual({ [pullKey("a", pull())]: 5000 });
    });

    test("keeps each plugin's own details for the notice", () => {
        const [due] = unseenPulls([{ ...install("a"), name: "Plugin A" }], {}, 0).due;
        expect(due.name).toBe("Plugin A");
    });
});

describe("readPullMemory", () => {
    test("reads what was saved, anything else is nothing told", () => {
        expect(readPullMemory('{"a@1000":5,"bad":"x"}')).toEqual({ "a@1000": 5 });
        expect(readPullMemory(null)).toEqual({});
        expect(readPullMemory(undefined)).toEqual({});
        expect(readPullMemory("not json")).toEqual({});
        expect(readPullMemory("[1,2]")).toEqual({});
        expect(readPullMemory("null")).toEqual({});
    });
});
