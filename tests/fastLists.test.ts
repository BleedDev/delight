import { describe, expect, test } from "bun:test";

import FastLists from "../plugins/fast-lists/index";

describe("fast-lists defaults", () => {
    // Chat stays off while it can pull the view back on scroll-up; Discord's virtualized
    // member list never has a row far enough away to skip
    test("server list on, chat and member list off", () => {
        const settings = FastLists.settings!;
        expect(settings.servers.default).toBe(true);
        expect(settings.chat.default).toBe(false);
        expect(settings.members.default).toBe(false);
    });
});
