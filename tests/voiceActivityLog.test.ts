import { describe, expect, test } from "bun:test";

import type { Replacement } from "../src/renderer/patching/source";
import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";
import {
    DEFAULT_OPTIONS, describe as describeEntry, diffSnapshots, filterEntries, formatClock, formatDuration, formatLine, formatSessions, LogEntry,
    MemberState, PATCHES, shouldToast, snapshotOf, Snapshot, stayNote, SyncInput, toMemberState, touchesSession, VoiceLog,
} from "../plugins/voice-activity-log/log";

const quiet: MemberState = { muted: false, deafened: false, streaming: false, video: false };
const snap = (...ids: string[]): Snapshot => Object.fromEntries(ids.map(id => [id, { ...quiet }]));
const names: Record<string, string> = { a: "Alice", b: "Bob", c: "Cara", me: "Me" };
const T0 = new Date(2026, 8, 27, 14, 2, 0).getTime();
const MIN = 60_000;

function input(channelId: string | null, snapshot: Snapshot, now: number, extra: Partial<SyncInput> = {}): SyncInput {
    return {
        channelId, snapshot, now, selfId: "me",
        nameOf: id => names[id] ?? id,
        channelName: id => ({ vc1: "General", vc2: "Gaming" } as Record<string, string>)[id] ?? id,
        ...extra,
    };
}

describe("snapshots", () => {
    test("reads Discord's voice states, server mutes included", () => {
        expect(toMemberState({ selfMute: true })).toEqual({ muted: true, deafened: false, streaming: false, video: false });
        expect(toMemberState({ mute: true, deaf: true, selfStream: true, selfVideo: true })).toEqual({ muted: true, deafened: true, streaming: true, video: true });
    });
    test("copies the store's map and leaves you out", () => {
        const store = { a: { userId: "a" }, me: { userId: "me" } };
        const s = snapshotOf(store, "me");
        expect(Object.keys(s)).toEqual(["a"]);
        (store as any).b = { userId: "b" };
        expect(Object.keys(s)).toEqual(["a"]);
        expect(snapshotOf(undefined)).toEqual({});
    });
});

describe("diffSnapshots", () => {
    test("joins and leaves", () => {
        expect(diffSnapshots("vc1", snap("a", "b"), snap("b", "c"))).toEqual([
            { kind: "leave", userId: "a" },
            { kind: "join", userId: "c" },
        ]);
    });
    test("moves come from the payload's oldChannelId / channelId", () => {
        const moves: Record<string, { from?: string | null; to?: string | null; }> = { a: { from: "vc1", to: "vc2" }, c: { from: "vc3", to: "vc1" } };
        const events = diffSnapshots("vc1", snap("a"), snap("c"), DEFAULT_OPTIONS, id => moves[id]);
        expect(events).toEqual([
            { kind: "moveOut", userId: "a", otherChannelId: "vc2" },
            { kind: "moveIn", userId: "c", otherChannelId: "vc3" },
        ]);
        const plain = diffSnapshots("vc1", snap("a"), snap("c"), { ...DEFAULT_OPTIONS, moves: false }, id => moves[id]);
        expect(plain.map(e => e.kind)).toEqual(["leave", "join"]);
    });
    test("disconnecting (to: null) is a leave", () => {
        expect(diffSnapshots("vc1", snap("a"), {}, DEFAULT_OPTIONS, () => ({ from: "vc1", to: null }))).toEqual([{ kind: "leave", userId: "a" }]);
    });
    test("streams, camera, mutes and deafens only when asked", () => {
        const prev = snap("a", "b");
        const next: Snapshot = { a: { ...quiet, streaming: true, video: true }, b: { ...quiet, muted: true } };
        expect(diffSnapshots("vc1", prev, next)).toEqual([]);
        expect(diffSnapshots("vc1", prev, next, { moves: true, streams: true, muteDeafen: true })).toEqual([
            { kind: "streamStart", userId: "a" },
            { kind: "videoStart", userId: "a" },
            { kind: "mute", userId: "b" },
        ]);
    });
    test("deafening (which mutes too) is one entry", () => {
        const opts = { moves: true, streams: false, muteDeafen: true };
        expect(diffSnapshots("vc1", snap("a"), { a: { ...quiet, muted: true, deafened: true } }, opts)).toEqual([{ kind: "deafen", userId: "a" }]);
        expect(diffSnapshots("vc1", { a: { ...quiet, muted: true, deafened: true } }, snap("a"), opts)).toEqual([{ kind: "undeafen", userId: "a" }]);
        // Muted before, then deafened: still just the deafen
        expect(diffSnapshots("vc1", { a: { ...quiet, muted: true } }, { a: { ...quiet, muted: true, deafened: true } }, opts)).toEqual([{ kind: "deafen", userId: "a" }]);
    });
});

describe("VoiceLog sessions", () => {
    test("joining logs you and who was already there, not as joins", () => {
        const log = new VoiceLog();
        const added = log.sync(input("vc1", snap("a", "b"), T0));
        expect(added.map(e => [e.kind, e.name])).toEqual([["selfJoin", "You"], ["present", "Alice"], ["present", "Bob"]]);
        expect(log.current?.channelName).toBe("General");
        expect(log.current?.here).toEqual({ a: T0, b: T0 });
    });

    test("nothing happens outside voice", () => {
        const log = new VoiceLog();
        expect(log.sync(input(null, {}, T0))).toEqual([]);
        expect(log.sessions).toEqual([]);
        expect(log.version).toBe(0);
    });

    test("durations: joins get leftAt, leaves get how long they stayed", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        log.sync(input("vc1", snap("a", "c"), T0 + 3 * MIN));
        const left = log.sync(input("vc1", snap("c"), T0 + 10 * MIN));
        expect(left).toHaveLength(1);
        expect(left[0]).toMatchObject({ kind: "leave", userId: "a", stayed: 10 * MIN, sinceBefore: true });
        const leftC = log.sync(input("vc1", {}, T0 + 18 * MIN))[0];
        expect(leftC).toMatchObject({ kind: "leave", stayed: 15 * MIN });
        expect(leftC.sinceBefore).toBeUndefined();

        const entries = log.current!.entries;
        const joinC = entries.find(e => e.kind === "join")!;
        expect(joinC.leftAt).toBe(T0 + 18 * MIN);
        expect(stayNote(joinC, T0 + 99 * MIN)).toBe("stayed 15m");
        expect(stayNote(entries.find(e => e.kind === "present")!, T0)).toBe("stayed at least 10m");
    });

    test("rejoining after leaving tracks the new stay only", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", {}, T0));
        log.sync(input("vc1", snap("a"), T0 + MIN));
        log.sync(input("vc1", {}, T0 + 2 * MIN));
        log.sync(input("vc1", snap("a"), T0 + 5 * MIN));
        const again = log.sync(input("vc1", {}, T0 + 9 * MIN));
        expect(again[0].stayed).toBe(4 * MIN);
        const joins = log.current!.entries.filter(e => e.kind === "join");
        expect(joins.map(j => j.leftAt)).toEqual([T0 + 2 * MIN, T0 + 9 * MIN]);
    });

    test("an arrival still here shows a running duration", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", {}, T0));
        const [join] = log.sync(input("vc1", snap("b"), T0 + MIN));
        expect(stayNote(join, T0 + 6 * MIN)).toBe("still here · 5m");
    });

    test("leaving ends the session; people still there are marked", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        const added = log.sync(input(null, {}, T0 + 42 * MIN));
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ kind: "selfLeave", stayed: 42 * MIN });
        expect(describeEntry(added[0])).toBe("You left (stayed 42m)");
        expect(log.current).toBeUndefined();
        const session = log.sessions[0];
        expect(session.endedAt).toBe(T0 + 42 * MIN);
        const present = session.entries.find(e => e.kind === "present")!;
        expect(present).toMatchObject({ leftAt: T0 + 42 * MIN, stillThere: true });
        expect(stayNote(present, T0 + 99 * MIN)).toBe("still there when you left · 42m");
        // No phantom leaves logged after the session ended
        expect(log.sync(input(null, {}, T0 + 50 * MIN))).toEqual([]);
    });

    test("switching channels ends one session and starts the next", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        const added = log.sync(input("vc2", snap("b"), T0 + 5 * MIN));
        expect(added.map(e => e.kind)).toEqual(["selfLeave", "selfJoin", "present"]);
        expect(describeEntry(added[0])).toBe("You moved to Gaming (stayed 5m)");
        expect(log.sessions.map(s => s.channelName)).toEqual(["Gaming", "General"]);
        expect(log.current?.channelId).toBe("vc2");
        // Alice isn't reported as leaving General
        expect(log.sessions[1].entries.some(e => e.kind === "leave")).toBe(false);
    });

    test("move names are captured", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        const [out] = log.sync(input("vc1", {}, T0 + 2 * MIN, { moveOf: () => ({ from: "vc1", to: "vc2" }) }));
        expect(describeEntry(out)).toBe("Alice moved to Gaming (stayed at least 2m)");
    });

    test("keeps the last sessions and caps entries", () => {
        const log = new VoiceLog(20, 3);
        for (let i = 0; i < 5; i++) {
            log.sync(input(`c${i}`, {}, T0 + i * MIN));
        }
        expect(log.sessions).toHaveLength(3);
        expect(log.sessions.map(s => s.channelId)).toEqual(["c4", "c3", "c2"]);

        const busy = new VoiceLog(10, 10);
        busy.sync(input("vc1", {}, T0));
        for (let i = 0; i < 20; i++) busy.sync(input("vc1", i % 2 ? {} : snap("a"), T0 + i * 1000));
        expect(busy.size).toBe(10);
        expect(busy.current!.entries.at(-1)!.kind).toBe("leave");
    });

    test("old sessions are dropped first when entries overflow", () => {
        const log = new VoiceLog(6, 10);
        log.sync(input("vc1", snap("a", "b"), T0)); // 3
        log.sync(input("vc2", snap("c"), T0 + MIN)); // +1 selfLeave, +2 = 6
        log.sync(input("vc2", snap("c", "a"), T0 + 2 * MIN)); // 7: vc1 loses its oldest
        expect(log.size).toBe(6);
        expect(log.sessions[1].entries[0].kind).toBe("present");
    });

    test("last() is newest-N, oldest first, across sessions", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        log.sync(input("vc2", {}, T0 + MIN));
        log.sync(input("vc2", snap("b"), T0 + 2 * MIN));
        expect(log.last(3).map(e => e.kind)).toEqual(["selfLeave", "selfJoin", "join"]);
        expect(log.last(100)).toHaveLength(5);
    });

    test("clear keeps who's here in the current session", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        log.sync(input("vc2", snap("a"), T0 + MIN));
        let calls = 0;
        log.subscribe(() => calls++);
        log.clear();
        expect(calls).toBe(1);
        expect(log.size).toBe(0);
        expect(log.sessions).toHaveLength(1);
        const [left] = log.sync(input("vc2", {}, T0 + 4 * MIN));
        expect(left.stayed).toBe(3 * MIN);
    });
});

describe("words", () => {
    test("clock and durations", () => {
        expect(formatClock(T0)).toBe("14:02");
        expect(formatDuration(45_000)).toBe("45s");
        expect(formatDuration(12 * MIN + 30_000)).toBe("12m");
        expect(formatDuration(65 * MIN)).toBe("1h 5m");
        expect(formatDuration(120 * MIN)).toBe("2h");
        expect(formatDuration(-5)).toBe("0s");
    });

    test("describes every kind", () => {
        const base = { id: 1, sessionId: 1, userId: "a", name: "Alice", at: T0, channelId: "vc1" };
        const d = (e: Partial<LogEntry>) => describeEntry({ ...base, kind: "join", ...e } as LogEntry, "General");
        expect(d({ kind: "selfJoin", name: "You" })).toBe("You joined General");
        expect(d({ kind: "present" })).toBe("Alice was already here");
        expect(d({ kind: "join" })).toBe("Alice joined");
        expect(d({ kind: "leave", stayed: 15 * MIN })).toBe("Alice left (stayed 15m)");
        expect(d({ kind: "moveIn", otherChannelName: "Gaming", otherChannelId: "vc2" })).toBe("Alice moved in from Gaming");
        expect(d({ kind: "streamStart" })).toBe("Alice started streaming");
        expect(d({ kind: "videoStop" })).toBe("Alice turned off their camera");
        expect(d({ kind: "deafen" })).toBe("Alice deafened");
        expect(d({ kind: "unmute" })).toBe("Alice unmuted");
        expect(formatLine({ ...base, kind: "join" })).toBe("14:02  Alice joined");
    });

    test("copy as text", () => {
        const log = new VoiceLog();
        log.sync(input("vc1", snap("a"), T0));
        log.sync(input("vc1", snap("a", "b"), T0 + 3 * MIN));
        log.sync(input(null, {}, T0 + 10 * MIN));
        const text = formatSessions(log.sessions);
        const date = new Date(T0).toLocaleDateString();
        expect(text).toBe([
            `General · ${date} 14:02–14:12 (10m)`,
            "14:02  You joined General",
            "14:02  Alice was already here",
            "14:05  Bob joined",
            "14:12  You left (stayed 10m)",
        ].join("\n"));
        expect(formatSessions([{ channelName: "X", channelId: "x", startedAt: T0, entries: [] }], T0 + MIN)).toContain("(nothing logged)");
    });
});

describe("filters and toasts", () => {
    const log = new VoiceLog();
    log.sync(input("vc1", snap("a"), T0));
    log.sync(input("vc1", { a: { ...quiet, streaming: true }, b: { ...quiet } }, T0 + MIN, { options: { moves: true, streams: true, muteDeafen: true } }));
    log.sync(input("vc1", { a: { ...quiet, streaming: true }, b: { ...quiet, muted: true } }, T0 + 2 * MIN, { options: { moves: true, streams: true, muteDeafen: true } }));
    const entries = log.current!.entries;

    test("by kind and by name", () => {
        expect(filterEntries(entries, "all")).toHaveLength(entries.length);
        expect(filterEntries(entries, "people").map(e => e.kind)).toEqual(["selfJoin", "present", "join"]);
        expect(filterEntries(entries, "streams").map(e => e.kind)).toEqual(["streamStart"]);
        expect(filterEntries(entries, "voice").map(e => e.kind)).toEqual(["mute"]);
        expect(filterEntries(entries, "all", " bo ").map(e => e.name)).toEqual(["Bob", "Bob"]);
    });

    test("toasts: joins, leaves and moves, off by default, optionally only unfocused", () => {
        const join = entries.find(e => e.kind === "join")!;
        const stream = entries.find(e => e.kind === "streamStart")!;
        expect(shouldToast(join, { toasts: false, onlyUnfocused: false }, false)).toBe(false);
        expect(shouldToast(join, { toasts: true, onlyUnfocused: false }, true)).toBe(true);
        expect(shouldToast(join, { toasts: true, onlyUnfocused: true }, true)).toBe(false);
        expect(shouldToast(join, { toasts: true, onlyUnfocused: true }, false)).toBe(true);
        expect(shouldToast(stream, { toasts: true, onlyUnfocused: false }, false)).toBe(false);
        expect(shouldToast(entries[0], { toasts: true, onlyUnfocused: false }, false)).toBe(false);
    });
});

describe("patch", () => {
    // Verbatim from Discord's web build (test-results/chunks), trimmed around the Voice Connected panel
    const SOURCE = 's=(0,eo.bG)([eP.Ay,OP.A,eU.default],()=>OP.A.hasHotspot(RN._.VOICE_PANEL_INTRODUCTION)&&(0,i9.mv)(eU.default.getCurrentUser())&&!eP.Ay.isInteractionRequired()&&!i?.isGuildStageVoice()),l=eg.vL.useSetting();children:()=>(0,L.jsxs)(iK.E,{variant:"text-sm/medium",color:"text-strong",ref:d,className:O$.kL,children:[(0,L.jsxs)(CJ.A,{className:O$.FI,align:CJ.A.Align.CENTER,children:[(0,L.jsx)("div",{className:O$.vW,children:(0,L.jsx)(RM,{channel:i,analyticsLocations:o,hasRemoteVoiceState:c})}),(0,L.jsxs)(CJ.A,{grow:0,shrink:0,className:O$.nL,children:[r&&!c?(0,L.jsx)(Rx,{channel:i}):null,(0,L.jsx)(Rc,{channel:i})]})]}),l?(0,L.jsx)(RB,{channel:i}):null,c?null:(0,L.jsx)(Rk,{channel:i,canGoLive:a})]})';

    test("puts the button first in the panel's button row, with the channel", () => {
        const patch = PATCHES.rtcPanel;
        expect(matchesFind(SOURCE, patch.find)).toBe(true);
        let out = SOURCE;
        for (const r of ([] as Replacement[]).concat(patch.replace)) {
            const re = canonicalizeMatch(r.match) as RegExp;
            expect(SOURCE.match(new RegExp(re.source, "g"))?.length).toBe(1);
            out = out.replace(re, (r.with as string).replaceAll("$self", "S"));
        }
        expect(out).toContain("className:O$.nL,children:[S?.renderButton?.(i),r&&!c?(0,L.jsx)(Rx,{channel:i}):null,(0,L.jsx)(Rc,{channel:i})]");
    });
});

describe("touchesSession", () => {
    const here = snap("a", "b");

    test("updates about other channels are skipped", () => {
        expect(touchesSession([{ userId: "x", channelId: "vc2", oldChannelId: null }, { userId: "y", channelId: null, oldChannelId: "vc3" }], "vc1", here, "me")).toBe(false);
    });

    test("joins, leaves, moves and state changes in the channel count", () => {
        expect(touchesSession([{ userId: "x", channelId: "vc1" }], "vc1", here, "me")).toBe(true);
        expect(touchesSession([{ userId: "x", channelId: "vc2", oldChannelId: "vc1" }], "vc1", here, "me")).toBe(true);
        // Someone who was here, without an oldChannelId: a leave or a mute
        expect(touchesSession([{ userId: "a", channelId: null }], "vc1", here, "me")).toBe(true);
        expect(touchesSession([{ userId: "x", channelId: "vc2" }, { userId: "b", channelId: "vc1", selfMute: true }], "vc1", here, "me")).toBe(true);
    });

    test("your own updates and payloads it can't read always count", () => {
        expect(touchesSession([{ userId: "me", channelId: "vc2" }], "vc1", here, "me")).toBe(true);
        expect(touchesSession([{ channelId: "vc2" }], "vc1", here, "me")).toBe(true);
        expect(touchesSession(undefined, "vc1", here, "me")).toBe(true);
    });
});
