import { describe, expect, test } from "bun:test";

import { MAX_TITLE, parseAnnouncementInput, parseAnnouncements } from "../src/shared/announcements";
import { parseNotifications } from "../src/shared/notifications";

describe("announcements", () => {
    test("what an admin sends is trimmed, needs a title, and links are https", () => {
        expect(parseAnnouncementInput({ title: "  Hi  ", body: " There ", link: "" })).toEqual({ title: "Hi", body: "There" });
        expect(parseAnnouncementInput({ title: "" })).toEqual({ error: "An announcement needs a title" });
        expect(parseAnnouncementInput({ title: "x".repeat(MAX_TITLE + 1) })).toHaveProperty("error");
        expect(parseAnnouncementInput({ title: "Hi", link: "javascript:alert(1)" })).toHaveProperty("error");
        expect(parseAnnouncementInput({ title: "Hi", link: "https://evi.rest/blog" })).toEqual({ title: "Hi", body: "", link: "https://evi.rest/blog" });
    });

    test("an Evi keeps only well-formed ones from evi.rest", () => {
        const list = parseAnnouncements({ announcements: [
            { id: 1, title: "Good", body: "", at: 5 },
            { id: "2", title: "Bad id", body: "", at: 5 },
            { id: 3, title: "", body: "", at: 5 },
            { id: 4, title: "Bad link", body: "", link: "http://x", at: 5 },
        ] });
        expect(list).toEqual([{ id: 1, title: "Good", body: "", at: 5 }]);
        expect(parseAnnouncements(null)).toEqual([]);
    });

    test("they're a kind the Inbox shows", () => {
        expect(parseNotifications([{ id: "local:announcement:1", kind: "announcement", title: "Hi", body: "", at: 1, read: false }])).toHaveLength(1);
    });
});
