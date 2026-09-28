import { describe, expect, test } from "bun:test";

import { bodyFor, runSequential, targets, toggles } from "../plugins/voice-chat-utilities/bulk";

describe("voice chat utilities", () => {
    const states = { a: { userId: "a", mute: true }, me: { userId: "me" }, b: { userId: "b", deaf: true } };

    test("everyone, you last", () => {
        expect(targets(states, "me")).toEqual(["a", "b", "me"]);
        expect(targets(null, "me")).toEqual([]);
    });

    test("request bodies", () => {
        expect(bodyFor({ kind: "disconnect" })).toEqual({ channel_id: null });
        expect(bodyFor({ kind: "move", channelId: "2" })).toEqual({ channel_id: "2" });
        expect(bodyFor({ kind: "mute", value: false })).toEqual({ mute: false });
        expect(bodyFor({ kind: "deafen", value: true })).toEqual({ deaf: true });
    });

    test("only offers toggles that change someone", () => {
        expect(toggles(states)).toEqual({ mute: true, unmute: true, deafen: true, undeafen: true });
        expect(toggles({ a: { userId: "a", mute: true } })).toEqual({ mute: false, unmute: true, deafen: true, undeafen: false });
    });

    test("runs one at a time and counts failures", async () => {
        const seen: string[] = [];
        const result = await runSequential(["a", "b", "c"], async id => {
            seen.push(id);
            if (id === "b") throw new Error("nope");
        }, 10, async () => { });
        expect(seen).toEqual(["a", "b", "c"]);
        expect(result).toEqual({ done: 2, failed: 1 });
    });
});
