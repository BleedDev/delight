import { describe, expect, test } from "bun:test";

import {
    ChannelSnapshot, decide, DEDUPE_WINDOW, GROUP_DM, groupName, Lookup, NotificationLog, RelationshipType, SELF_WINDOW, storeLookup, Tracker,
} from "../plugins/relationship-notifier/events";

const ME = "me";

function lookup(overrides: {
    relationships?: Record<string, number>;
    users?: Record<string, string>;
    channels?: Record<string, ChannelSnapshot>;
    guilds?: Record<string, string>;
    currentUserId?: string;
} = {}): Lookup {
    return {
        currentUserId: "currentUserId" in overrides ? overrides.currentUserId : ME,
        relationshipType: id => overrides.relationships?.[id],
        userName: id => overrides.users?.[id],
        channel: id => overrides.channels?.[id],
        guildName: id => overrides.guilds?.[id],
    };
}

const friends = lookup({
    relationships: { a: RelationshipType.FRIEND, b: RelationshipType.OUTGOING, c: RelationshipType.INCOMING, d: RelationshipType.BLOCKED },
    users: { a: "Alice", b: "Bob", c: "Carol" },
});

describe("relationship notifier: friends", () => {
    test("a friend removing you is reported with their name", () => {
        const n = decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "a", type: 1 } }, friends, new Tracker(), 5);
        expect(n).toEqual({ kind: "friendRemoved", id: "a", name: "Alice", at: 5, text: "Alice removed you as a friend" });
    });

    test("an outgoing request going away is reported as declined or cancelled", () => {
        const n = decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "b", type: 4 } }, friends, new Tracker(), 5);
        expect(n?.kind).toBe("requestCancelled");
        expect(n?.text).toContain("Bob");
    });

    test("incoming requests and blocks are ignored", () => {
        const t = new Tracker();
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "c", type: 3 } }, friends, t)).toBeNull();
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "d", type: 2 } }, friends, t)).toBeNull();
    });

    test("the store's type wins over the payload's, and the payload is a fallback", () => {
        const t = new Tracker();
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "c", type: 1 } }, friends, t)).toBeNull();
        const n = decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "x", type: 1, user: { username: "xavier" } } }, friends, t);
        expect(n?.name).toBe("xavier");
        const unknown = decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "y", type: 1 } }, friends, t);
        expect(unknown?.name).toBe("User y");
    });

    test("removals you made yourself are not reported, once", () => {
        const t = new Tracker();
        t.markSelf("relationship", "a", 0);
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "a" } }, friends, t, 10)).toBeNull();
        // The mark was consumed
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "a" } }, friends, t, 20)?.kind).toBe("friendRemoved");
    });

    test("own marks expire", () => {
        const t = new Tracker();
        t.markSelf("relationship", "a", 0);
        expect(decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "a" } }, friends, t, SELF_WINDOW + 1)?.kind).toBe("friendRemoved");
    });

    test("malformed actions are ignored", () => {
        const t = new Tracker();
        expect(decide({ type: "RELATIONSHIP_REMOVE" }, friends, t)).toBeNull();
        expect(decide({ type: "RELATIONSHIP_ADD", relationship: { id: "a", type: 1 } }, friends, t)).toBeNull();
        expect(decide(undefined as any, friends, t)).toBeNull();
    });
});

describe("relationship notifier: group DMs", () => {
    const groups = lookup({
        channels: {
            g: { type: GROUP_DM, name: "Weekend", recipients: ["a"] },
            h: { type: GROUP_DM, name: "", recipients: ["a", "b", "z"] },
            dm: { type: 1, recipients: ["a"] },
            text: { type: 0, name: "general" },
        },
        users: { a: "Alice", b: "Bob" },
    });

    test("a group DM deleted for you is reported with its name", () => {
        const n = decide({ type: "CHANNEL_DELETE", channel: { id: "g", type: 3 } }, groups, new Tracker(), 7);
        expect(n).toEqual({ kind: "groupRemoved", id: "g", name: "Weekend", at: 7, text: "You were removed from Weekend" });
    });

    test("unnamed groups are named after their members", () => {
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "h" } }, groups, new Tracker())?.name).toBe("Alice, Bob");
        expect(groupName({ type: GROUP_DM, recipients: ["q"] }, groups)).toBe("a group DM");
    });

    test("DMs, guild channels and unknown channels are ignored", () => {
        const t = new Tracker();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "dm" } }, groups, t)).toBeNull();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "text" } }, groups, t)).toBeNull();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "nope" } }, groups, t)).toBeNull();
    });

    test("leaving yourself is not reported", () => {
        const t = new Tracker();
        t.markSelf("channel", "g", 0);
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "g" } }, groups, t, 1)).toBeNull();
    });

    test("recipient removal counts only when it's you", () => {
        const t = new Tracker();
        expect(decide({ type: "CHANNEL_RECIPIENT_REMOVE", channelId: "g", user: { id: "a" } }, groups, t)).toBeNull();
        expect(decide({ type: "CHANNEL_RECIPIENT_REMOVE", channelId: "g", user: { id: ME } }, groups, t)?.kind).toBe("groupRemoved");
        const noUser = lookup({ currentUserId: undefined, channels: { g: { type: GROUP_DM, name: "W" } } });
        expect(decide({ type: "CHANNEL_RECIPIENT_REMOVE", channelId: "g", user: { id: ME } }, noUser, new Tracker())).toBeNull();
    });

    test("recipient remove then channel delete is reported once", () => {
        const t = new Tracker();
        expect(decide({ type: "CHANNEL_RECIPIENT_REMOVE", channelId: "g", user: { id: ME } }, groups, t, 0)).not.toBeNull();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "g" } }, groups, t, 100)).toBeNull();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "g" } }, groups, t, DEDUPE_WINDOW + 200)).not.toBeNull();
    });
});

describe("relationship notifier: servers", () => {
    const servers = lookup({ guilds: { s: "Cool Server" } });

    test("being removed from a server is reported with its name", () => {
        const n = decide({ type: "GUILD_DELETE", guild: { id: "s" } }, servers, new Tracker(), 3);
        expect(n).toEqual({ kind: "serverRemoved", id: "s", name: "Cool Server", at: 3, text: "You were removed from Cool Server" });
    });

    test("outages (unavailable) are ignored", () => {
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s", unavailable: true } }, servers, new Tracker())).toBeNull();
    });

    test("servers you left yourself are ignored", () => {
        const t = new Tracker();
        t.markSelf("guild", "s", 0);
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s" } }, servers, t, 1)).toBeNull();
    });

    test("unknown servers and duplicates are ignored", () => {
        const t = new Tracker();
        expect(decide({ type: "GUILD_DELETE", guild: { id: "unknown" } }, servers, t)).toBeNull();
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s" } }, servers, t, 0)).not.toBeNull();
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s" } }, servers, t, 5)).toBeNull();
    });

    test("scopes don't mix", () => {
        const t = new Tracker();
        t.markSelf("channel", "s", 0);
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s" } }, servers, t, 1)).not.toBeNull();
    });
});

describe("relationship notifier: log", () => {
    const entry = (id: string, at = 1) => ({ kind: "friendRemoved" as const, id, name: id, at, text: id });

    test("newest first, limited, immutable snapshots", () => {
        const log = new NotificationLog(2);
        log.add(entry("a"));
        const first = log.entries;
        log.add(entry("b"));
        log.add(entry("c"));
        expect(log.entries.map(e => e.id)).toEqual(["c", "b"]);
        expect(first.map(e => e.id)).toEqual(["a"]);
    });

    test("notifies listeners and clears", () => {
        const log = new NotificationLog();
        let calls = 0;
        const off = log.subscribe(() => calls++);
        log.add(entry("a"));
        log.clear();
        log.clear();
        expect(calls).toBe(2);
        expect(log.entries).toEqual([]);
        off();
        log.add(entry("b"));
        expect(calls).toBe(2);
    });
});

describe("relationship notifier: store lookup", () => {
    function stores() {
        const asked: string[] = [];
        const all: Record<string, any> = {
            UserStore: { getCurrentUser: () => ({ id: ME }), getUser: (id: string) => id === "a" ? { globalName: "Alice" } : undefined },
            RelationshipStore: { getRelationshipType: () => RelationshipType.FRIEND, getNickname: () => undefined },
            ChannelStore: { getChannel: (id: string) => id === "g" ? { type: GROUP_DM, name: "Pals", recipients: ["a"] } : { type: 0, name: "general" } },
            GuildStore: { getGuild: (id: string) => id === "s" ? { name: "Server" } : undefined },
        };
        return { asked, store: (name: string) => (asked.push(name), all[name]) };
    }

    test("a server channel being deleted only looks up ChannelStore", () => {
        const { asked, store } = stores();
        expect(decide({ type: "CHANNEL_DELETE", channel: { id: "text" } }, storeLookup(store), new Tracker())).toBeNull();
        expect(asked).toEqual(["ChannelStore"]);
    });

    test("an unavailable server looks nothing up", () => {
        const { asked, store } = stores();
        expect(decide({ type: "GUILD_DELETE", guild: { id: "s", unavailable: true } }, storeLookup(store), new Tracker())).toBeNull();
        expect(asked).toEqual([]);
    });

    test("each store is looked up once per action, and answers like before", () => {
        const { asked, store } = stores();
        const entry = decide({ type: "RELATIONSHIP_REMOVE", relationship: { id: "a", type: RelationshipType.FRIEND } }, storeLookup(store), new Tracker());
        expect(entry?.text).toBe("Alice removed you as a friend");
        expect(asked.sort()).toEqual(["RelationshipStore", "UserStore"]);
        const lookup = storeLookup(store);
        expect(lookup.currentUserId).toBe(ME);
        expect(lookup.guildName("s")).toBe("Server");
        expect(lookup.channel("g")).toEqual({ type: GROUP_DM, name: "Pals", recipients: ["a"] });
    });
});
