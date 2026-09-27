import { describe, expect, test } from "bun:test";

import {
    AlertConfig, AlertEngine, DEFAULT_CONFIG, isOnlineStatus, isWatched, messageFor, parseWatchList, shouldDeliver, snapshotOf, Snapshot,
    STARTUP_GRACE_MS, toggleWatch,
} from "../plugins/friend-online-alerts/alerts";

const M = 60_000;
const ON: Snapshot = { online: true };
const OFF: Snapshot = { online: false };
const all: AlertConfig = { ...DEFAULT_CONFIG, offline: true, game: true, stream: true };

/** An engine with "a" already baselined at `status`, outside any grace period */
function engine(first: Snapshot = OFF, at = 0) {
    const e = new AlertEngine();
    e.seed("a", first, at);
    return e;
}

describe("statuses and snapshots", () => {
    test("online, idle and dnd count as online", () => {
        for (const s of ["online", "idle", "dnd"]) expect(isOnlineStatus(s)).toBe(true);
        for (const s of ["offline", "invisible", "unknown", undefined, null]) expect(isOnlineStatus(s)).toBe(false);
    });

    test("snapshotOf reads the game and streaming", () => {
        expect(snapshotOf("offline", [{ type: 0, name: "Chess" }])).toEqual({ online: false });
        expect(snapshotOf("idle", [{ type: 4, name: "Custom Status" }, { type: 0, name: " Chess " }])).toEqual({ online: true, game: "Chess", streaming: false });
        expect(snapshotOf("dnd", [{ type: 1, name: "Twitch" }])).toEqual({ online: true, game: undefined, streaming: true });
        expect(snapshotOf("online", null, true).streaming).toBe(true);
        expect(snapshotOf("online", [{ type: 0, name: "  " }]).game).toBeUndefined();
    });
});

describe("transitions", () => {
    test("the first snapshot is only a baseline", () => {
        const e = new AlertEngine();
        expect(e.observe("a", ON, 1000, all)).toEqual([]);
        expect(e.has("a")).toBe(true);
    });

    test("offline to online alerts, idle/dnd changes don't", () => {
        const e = engine();
        expect(e.observe("a", ON, 1000, all)).toEqual([{ kind: "online", userId: "a", game: undefined }]);
        expect(e.observe("a", snapshotOf("idle", []), 2000, all)).toEqual([]);
        expect(e.observe("a", snapshotOf("dnd", []), 3000, all)).toEqual([]);
    });

    test("coming online idle or dnd counts", () => {
        const e = engine();
        expect(e.observe("a", snapshotOf("idle", []), 1000, all).map(a => a.kind)).toEqual(["online"]);
        const d = engine();
        expect(d.observe("a", snapshotOf("dnd", []), 1000, all).map(a => a.kind)).toEqual(["online"]);
    });

    test("going offline only alerts when enabled", () => {
        const e = engine(ON);
        expect(e.observe("a", OFF, 1000, DEFAULT_CONFIG)).toEqual([]);
        const f = engine(ON);
        expect(f.observe("a", OFF, 1000, all)).toEqual([{ kind: "offline", userId: "a" }]);
    });

    test("online alerts can be turned off", () => {
        const e = engine();
        expect(e.observe("a", ON, 1000, { ...all, online: false })).toEqual([]);
    });

    test("coming online while playing is one alert that mentions the game", () => {
        const e = engine();
        expect(e.observe("a", { online: true, game: "Chess", streaming: true }, 1000, all)).toEqual([{ kind: "online", userId: "a", game: "Chess" }]);
    });

    test("starting and switching games, starting a stream", () => {
        const cfg = { ...all, cooldownMs: 0 };
        const e = engine(ON);
        expect(e.observe("a", { online: true, game: "Chess" }, 1000, cfg)).toEqual([{ kind: "game", userId: "a", game: "Chess" }]);
        expect(e.observe("a", { online: true, game: "Chess" }, 2000, cfg)).toEqual([]);
        expect(e.observe("a", { online: true, game: "Go" }, 3000, cfg)).toEqual([{ kind: "game", userId: "a", game: "Go" }]);
        expect(e.observe("a", { online: true }, 4000, cfg)).toEqual([]);
        expect(e.observe("a", { online: true, game: "Go", streaming: true }, 5000, cfg)).toEqual([
            { kind: "game", userId: "a", game: "Go" },
            { kind: "stream", userId: "a", game: "Go" },
        ]);
    });

    test("game and stream alerts are opt-in", () => {
        const e = engine(ON);
        expect(e.observe("a", { online: true, game: "Chess", streaming: true }, 1000, DEFAULT_CONFIG)).toEqual([]);
    });
});

describe("flapping", () => {
    test("back online within the window isn't announced", () => {
        const e = engine(ON);
        e.observe("a", OFF, 0, all);
        expect(e.observe("a", ON, 4 * M, all)).toEqual([]);
    });

    test("and neither is the end of that silent session", () => {
        const e = engine(ON);
        e.observe("a", OFF, 0, all);
        e.observe("a", ON, 1 * M, all);
        expect(e.observe("a", OFF, 2 * M, all)).toEqual([]);
        // Still flapping: every return is within the window of the last drop
        expect(e.observe("a", ON, 6 * M, all)).toEqual([]);
    });

    test("after the window it's a real return", () => {
        const e = engine(ON);
        e.observe("a", OFF, 0, all);
        expect(e.observe("a", ON, 5 * M, all).map(a => a.kind)).toEqual(["online"]);
    });

    test("a window of 0 announces every time (cooldown aside)", () => {
        const cfg = { ...all, flapMs: 0, cooldownMs: 0 };
        const e = engine(ON);
        e.observe("a", OFF, 0, cfg);
        expect(e.observe("a", ON, 1000, cfg).map(a => a.kind)).toEqual(["online"]);
    });

    test("the first time online isn't a flap", () => {
        const e = engine();
        expect(e.observe("a", ON, 1000, all).map(a => a.kind)).toEqual(["online"]);
    });
});

describe("cooldown", () => {
    test("one alert per kind per person within the cooldown", () => {
        const cfg = { ...all, flapMs: 0, cooldownMs: 10 * M };
        const e = engine();
        expect(e.observe("a", ON, 0, cfg)).toHaveLength(1);
        e.observe("a", OFF, 1 * M, cfg);
        expect(e.observe("a", ON, 2 * M, cfg)).toEqual([]);
        e.observe("a", OFF, 3 * M, cfg);
        expect(e.observe("a", ON, 10 * M, cfg)).toHaveLength(1);
    });

    test("kinds and people have their own cooldowns", () => {
        const cfg = { ...all, flapMs: 0, cooldownMs: 10 * M };
        const e = engine();
        e.seed("b", OFF, 0);
        expect(e.observe("a", ON, 0, cfg)).toHaveLength(1);
        expect(e.observe("b", ON, 0, cfg)).toHaveLength(1);
        expect(e.observe("a", { online: true, game: "Chess" }, 1000, cfg).map(a => a.kind)).toEqual(["game"]);
        expect(e.observe("a", OFF, 2000, cfg).map(a => a.kind)).toEqual(["offline"]);
    });

    test("forget clears a person's history", () => {
        const cfg = { ...all, flapMs: 0, cooldownMs: 10 * M };
        const e = engine();
        e.observe("a", ON, 0, cfg);
        e.forget("a");
        expect(e.has("a")).toBe(false);
        e.seed("a", OFF, 1000);
        expect(e.observe("a", ON, 2000, cfg)).toHaveLength(1);
    });
});

describe("startup grace", () => {
    test("snapshots during grace only update the baseline", () => {
        const e = engine();
        e.beginGrace(0);
        expect(e.inGrace(STARTUP_GRACE_MS - 1)).toBe(true);
        expect(e.observe("a", ON, 1000, all)).toEqual([]);
        expect(e.observe("a", { online: true, game: "Chess" }, 2000, all)).toEqual([]);
        // After grace nothing replays: they're already online and playing
        expect(e.observe("a", { online: true, game: "Chess" }, STARTUP_GRACE_MS + 1, all)).toEqual([]);
        expect(e.observe("a", OFF, STARTUP_GRACE_MS + 2, all).map(a => a.kind)).toEqual(["offline"]);
    });

    test("a drop during grace still counts for flapping", () => {
        const e = engine(ON);
        e.beginGrace(0);
        e.observe("a", OFF, 1000, all);
        expect(e.observe("a", ON, STARTUP_GRACE_MS + 1000, all)).toEqual([]);
    });

    test("grace only extends, never shortens", () => {
        const e = new AlertEngine();
        e.beginGrace(0, 10_000);
        e.beginGrace(1000, 1000);
        expect(e.graceEnd).toBe(10_000);
        expect(e.inGrace(9_999)).toBe(true);
        expect(e.inGrace(10_000)).toBe(false);
    });

    test("seed never alerts", () => {
        const e = engine();
        e.seed("a", ON, 1000);
        e.seed("a", OFF, 2000);
        expect(e.observe("a", OFF, 3000, all)).toEqual([]);
    });
});

describe("delivery and watch list", () => {
    test("Do Not Disturb holds alerts unless allowed", () => {
        expect(shouldDeliver("dnd", false)).toBe(false);
        expect(shouldDeliver("dnd", true)).toBe(true);
        expect(shouldDeliver("idle", false)).toBe(true);
        expect(shouldDeliver(undefined, false)).toBe(true);
    });

    test("isWatched", () => {
        const friend = (id: string) => id === "f";
        expect(isWatched("a", ["a"], false, friend)).toBe(true);
        expect(isWatched("a", new Set(["a"]), false, friend)).toBe(true);
        expect(isWatched("f", [], false, friend)).toBe(false);
        expect(isWatched("f", [], true, friend)).toBe(true);
        expect(isWatched("x", [], true, friend)).toBe(false);
        expect(isWatched("me", ["me"], true, () => true, "me")).toBe(false);
        expect(isWatched("", [""], true, () => true)).toBe(false);
    });

    test("parseWatchList keeps unique snowflakes", () => {
        const id = "123456789012345678";
        expect(parseWatchList([id, id, "nope", 5, null, "987654321098765432"])).toEqual([id, "987654321098765432"]);
        expect(parseWatchList("x")).toEqual([]);
        expect(parseWatchList(undefined)).toEqual([]);
    });

    test("toggleWatch", () => {
        expect(toggleWatch([], "a")).toEqual(["a"]);
        expect(toggleWatch(["a", "b"], "a")).toEqual(["b"]);
    });
});

describe("messages", () => {
    test("text for each kind", () => {
        expect(messageFor({ kind: "online", userId: "a" }, "Alice")).toEqual({ title: "Alice", body: "is online", text: "Alice is online" });
        expect(messageFor({ kind: "online", userId: "a", game: "Chess" }, "Alice").text).toBe("Alice is online, playing Chess");
        expect(messageFor({ kind: "offline", userId: "a" }, "Alice").text).toBe("Alice went offline");
        expect(messageFor({ kind: "game", userId: "a", game: "Chess" }, "Alice").text).toBe("Alice started playing Chess");
        expect(messageFor({ kind: "stream", userId: "a" }, "Alice").text).toBe("Alice started streaming");
        expect(messageFor({ kind: "stream", userId: "a", game: "Chess" }, "Alice").body).toBe("started streaming Chess");
    });

    test("a missing name falls back", () => {
        expect(messageFor({ kind: "online", userId: "a" }, "  ").text).toBe("Someone is online");
    });
});
