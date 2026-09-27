import { describe, expect, test } from "bun:test";

import { MessageLog, shouldLog } from "../plugins/message-logger/log";

const v = (content: string, timestamp = 1) => ({ content, timestamp });

describe("message logger log", () => {
    test("marks deleted messages and keeps their edit history", () => {
        const log = new MessageLog();
        log.addEdit("c", "1", v("first"));
        log.markDeleted("c", "1", 5);
        expect(log.get("c", "1")).toEqual({ channelId: "c", id: "1", deletedAt: 5, edits: [v("first")] });
        expect(log.isDeleted("c", "1")).toBe(true);
        expect(log.isDeleted("c", "2")).toBe(false);
    });

    test("a second delete of the same message changes nothing", () => {
        const log = new MessageLog();
        log.markDeleted("c", "1", 5);
        const entry = log.get("c", "1");
        const version = log.version;
        expect(log.markDeleted("c", "1", 9)).toEqual([]);
        expect(log.get("c", "1")).toBe(entry);
        expect(log.version).toBe(version);
    });

    test("entries are replaced, never mutated, so they work as React snapshots", () => {
        const log = new MessageLog();
        log.addEdit("c", "1", v("a"));
        const before = log.get("c", "1")!;
        log.addEdit("c", "1", v("b"));
        expect(before.edits).toEqual([v("a")]);
        expect(log.get("c", "1")).not.toBe(before);
        expect(log.get("c", "1")!.edits).toEqual([v("a"), v("b")]);
    });

    test("caps messages per channel, oldest activity first, and reports evicted deleted messages", () => {
        const log = new MessageLog({ perChannel: 2 });
        log.markDeleted("c", "1");
        log.addEdit("c", "2", v("x"));
        // Touching 1 again makes 2 the oldest
        log.addEdit("c", "1", v("y"));
        expect(log.addEdit("c", "3", v("z"))).toEqual([]);
        expect(log.get("c", "2")).toBeUndefined();
        expect(log.markDeleted("c", "4")).toEqual([{ channelId: "c", id: "1" }]);
        expect([...log.deleted()]).toEqual([["c", ["4"]]]);
        expect(log.counts()).toEqual({ deleted: 1, edited: 1, channels: 1 });
    });

    test("caps channels and reports their deleted messages", () => {
        const log = new MessageLog({ channels: 2 });
        log.markDeleted("a", "1");
        log.markDeleted("b", "2");
        expect(log.markDeleted("c", "3")).toEqual([{ channelId: "a", id: "1" }]);
        expect(log.get("a", "1")).toBeUndefined();
        expect(log.counts().channels).toBe(2);
    });

    test("caps edits per message but always keeps the original", () => {
        const log = new MessageLog({ edits: 3 });
        for (const content of ["original", "e1", "e2", "e3", "e4"]) log.addEdit("c", "1", v(content));
        expect(log.get("c", "1")!.edits.map(e => e.content)).toEqual(["original", "e3", "e4"]);
    });

    test("lowering limits trims immediately", () => {
        const log = new MessageLog({ perChannel: 10, edits: 10 });
        for (let i = 0; i < 5; i++) log.markDeleted("c", String(i));
        for (const content of ["o", "a", "b"]) log.addEdit("c", "4", v(content));
        const evicted = log.setLimits({ perChannel: 2, edits: 2 });
        expect(evicted).toEqual([0, 1, 2].map(i => ({ channelId: "c", id: String(i) })));
        expect(log.get("c", "4")!.edits.map(e => e.content)).toEqual(["o", "b"]);
    });

    test("clear forgets everything and returns what was kept deleted", () => {
        const log = new MessageLog();
        log.markDeleted("a", "1");
        log.addEdit("b", "2", v("x"));
        expect(log.clear()).toEqual([{ channelId: "a", id: "1" }]);
        expect(log.counts()).toEqual({ deleted: 0, edited: 0, channels: 0 });
    });

    test("clearChannels forgets only those channels and returns what was kept deleted in them", () => {
        const log = new MessageLog();
        log.markDeleted("a", "1");
        log.addEdit("a", "2", v("x"));
        log.markDeleted("b", "3");
        log.addEdit("c", "4", v("y"));
        let calls = 0;
        log.subscribe(() => calls++);

        expect(log.counts(["a", "c", "missing"])).toEqual({ deleted: 1, edited: 2, channels: 2 });
        expect(log.clearChannels(["a", "c", "missing"])).toEqual([{ channelId: "a", id: "1" }]);
        expect(log.channelIds()).toEqual(["b"]);
        expect(log.counts()).toEqual({ deleted: 1, edited: 0, channels: 1 });
        expect(calls).toBe(1);

        expect(log.clearChannels(["a"])).toEqual([]);
        expect(calls).toBe(1);
    });

    test("remove forgets one message and notifies", () => {
        const log = new MessageLog();
        let calls = 0;
        const unsubscribe = log.subscribe(() => calls++);
        log.markDeleted("a", "1");
        log.remove("a", "1");
        log.remove("a", "1");
        unsubscribe();
        log.markDeleted("a", "2");
        expect(calls).toBe(2);
        expect(log.get("a", "1")).toBeUndefined();
    });
});

describe("message logger filters", () => {
    const base = { currentUserId: "me", ignoreSelf: false, ignoreBots: false };

    test("logs ordinary messages", () => {
        expect(shouldLog({ author: { id: "u" }, flags: 0, state: "SENT" }, base)).toBe(true);
    });

    test("never logs ephemeral or unsent messages", () => {
        expect(shouldLog({ author: { id: "u" }, flags: 64 }, base)).toBe(false);
        expect(shouldLog({ author: { id: "u" }, state: "SENDING" }, base)).toBe(false);
        expect(shouldLog({ author: { id: "u" }, state: "SEND_FAILED" }, base)).toBe(false);
    });

    test("ignore own messages and bots", () => {
        expect(shouldLog({ author: { id: "me" } }, base)).toBe(true);
        expect(shouldLog({ author: { id: "me" } }, { ...base, ignoreSelf: true })).toBe(false);
        expect(shouldLog({ author: { id: "me" } }, { ...base, ignoreSelf: true, currentUserId: undefined })).toBe(true);
        expect(shouldLog({ author: { id: "b", bot: true } }, base)).toBe(true);
        expect(shouldLog({ author: { id: "b", bot: true } }, { ...base, ignoreBots: true })).toBe(false);
    });
});
