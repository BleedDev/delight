import { describe, expect, test } from "bun:test";

import { BULK_ACK_LIMIT, chunk, collectUnread, countGuilds, summary, toAck } from "../plugins/read-all/collect";
import type { ReadStores } from "../plugins/read-all/collect";

const ch = (id: string) => ({ id });

function makeStores(unread: Record<string, { unread?: boolean; mentions?: number; last?: string | null; }>): ReadStores {
    return {
        GuildStore: { getGuilds: () => ({ g1: {}, g2: {}, g3: {} }) },
        GuildChannelStore: {
            getChannels: id => ({
                g1: { SELECTABLE: [{ channel: ch("a") }, { channel: ch("b") }], VOCAL: [{ channel: ch("v") }], count: 3 },
                g2: { SELECTABLE: [{ channel: ch("c") }] },
                g3: undefined,
            } as Record<string, any>)[id],
        },
        ReadStateStore: {
            hasUnread: id => !!unread[id]?.unread,
            getMentionCount: id => unread[id]?.mentions ?? 0,
            lastMessageId: id => (unread[id] && "last" in unread[id] ? unread[id].last : `m-${id}`),
        },
        ActiveJoinedThreadsStore: {
            getActiveJoinedThreadsForGuild: (id): Record<string, Record<string, unknown>> => (id === "g1" ? { a: { t1: { channel: ch("t1") }, t2: { channel: ch("t2") } } } : {}),
        },
        ChannelStore: { getSortedPrivateChannels: () => [ch("dm1"), ch("dm2")] },
    };
}

describe("read all: collecting", () => {
    test("picks unread and mentioned channels and threads across servers, skipping read ones", () => {
        const stores = makeStores({ a: { unread: true }, v: { mentions: 2 }, c: { unread: true }, t2: { unread: true }, dm1: { unread: true } });
        const result = collectUnread(stores);
        expect(result.map(r => r.channelId)).toEqual(["a", "v", "t2", "c"]);
        expect(result[0]).toEqual({ guildId: "g1", channelId: "a", messageId: "m-a", readStateType: 0 });
        expect(countGuilds(result)).toBe(2);
    });

    test("DMs only when asked", () => {
        const stores = makeStores({ dm1: { unread: true }, dm2: {} });
        expect(collectUnread(stores)).toEqual([]);
        const dms = collectUnread(stores, { includeDms: true });
        expect(dms).toEqual([{ guildId: null, channelId: "dm1", messageId: "m-dm1", readStateType: 0 }]);
        expect(countGuilds(dms)).toBe(0);
    });

    test("tolerates missing optional stores, array guild lists and null message ids", () => {
        const stores = makeStores({ a: { unread: true, last: null } });
        stores.GuildStore = { getGuilds: () => [{ id: "g1" }] };
        delete stores.ActiveJoinedThreadsStore;
        delete stores.ChannelStore;
        expect(collectUnread(stores, { includeDms: true })).toEqual([{ guildId: "g1", channelId: "a", messageId: null, readStateType: 0 }]);
    });

    test("prefers getGuildIds and never lists a channel twice", () => {
        const stores = makeStores({ a: { unread: true } });
        stores.GuildStore = { getGuilds: () => ({}), getGuildIds: () => ["g1", "g1"] };
        expect(collectUnread(stores).map(r => r.channelId)).toEqual(["a"]);
    });

    test("toAck keeps only what BULK_ACK reads", () => {
        expect(toAck({ guildId: "g", channelId: "c", messageId: "m", readStateType: 0 } as any)).toEqual({ channelId: "c", messageId: "m", readStateType: 0 });
    });
});

describe("read all: batching", () => {
    test("batches of at most 100", () => {
        const items = Array.from({ length: 250 }, (_, i) => i);
        const batches = chunk(items);
        expect(BULK_ACK_LIMIT).toBe(100);
        expect(batches.map(b => b.length)).toEqual([100, 100, 50]);
        expect(batches.flat()).toEqual(items);
        expect(chunk([])).toEqual([]);
        expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
        expect(() => chunk([1], 0)).toThrow(RangeError);
    });

    test("summary text", () => {
        expect(summary(0, 0)).toBe("Nothing to mark: everything is already read");
        expect(summary(1, 1)).toBe("Marked 1 channel in 1 server as read");
        expect(summary(12, 3)).toBe("Marked 12 channels in 3 servers as read");
        expect(summary(2, 0)).toBe("Marked 2 channels as read");
    });
});
