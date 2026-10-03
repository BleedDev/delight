import { describe, expect, test } from "bun:test";

import FastLists from "../plugins/fast-lists/index";

describe("fast-lists defaults", () => {
    // Measured in scripts/test-fast-lists.ts: chat relayouts get several times cheaper, while
    // Discord's virtualized member list never has a row far enough away to skip
    test("server list and chat on, member list off", () => {
        const settings = FastLists.settings!;
        expect(settings.servers.default).toBe(true);
        expect(settings.chat.default).toBe(true);
        expect(settings.members.default).toBe(false);
    });
});
