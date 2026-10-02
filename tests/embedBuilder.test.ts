import { describe, expect, test } from "bun:test";

import {
    draftFromJson, draftToJson, embedLength, emptyDraft, emptyEmbed, fieldColumns, hexToInt, intToHex, LIMITS, parseMessageLink, payload,
    problems, totalLength, usableWebhooks, webhookUrl,
} from "../plugins/embed-builder/embed";

const embed = (over: Partial<ReturnType<typeof emptyEmbed>> = {}) => ({ ...emptyEmbed(), ...over });

describe("Embed Builder", () => {
    test("colours go between #rrggbb and Discord's number", () => {
        expect(hexToInt("#5865F2")).toBe(0x5865f2);
        expect(hexToInt("5865f2")).toBe(0x5865f2);
        expect(hexToInt("#fff")).toBeUndefined();
        expect(intToHex(0x5865f2)).toBe("#5865f2");
        expect(intToHex(0)).toBe("#000000");
    });

    test("the payload leaves out what's empty and sends what Discord expects", () => {
        const d = {
            ...emptyDraft(),
            content: "hello",
            username: "  Bot ",
            embeds: [
                embed({
                    title: "Title", color: "#ff0000", authorName: "Me", authorIcon: "https://x.y/a.png", footerText: "foot",
                    fields: [{ name: "a", value: "b", inline: true }, { name: "", value: "", inline: false }],
                    timestamp: "2026-10-02T10:00:00.000Z", image: "https://x.y/i.png",
                }),
                emptyEmbed(),
            ],
        };
        const body = payload(d) as any;
        expect(body.username).toBe("Bot");
        expect(body.avatar_url).toBeUndefined();
        expect(body.embeds).toHaveLength(1);
        expect(body.embeds[0]).toEqual({
            author: { name: "Me", icon_url: "https://x.y/a.png" },
            title: "Title",
            color: 0xff0000,
            fields: [{ name: "a", value: "b", inline: true }],
            image: { url: "https://x.y/i.png" },
            footer: { text: "foot" },
            timestamp: "2026-10-02T10:00:00.000Z",
        });
        // Editing a message can't change who sent it
        expect((payload(d, true) as any).username).toBeUndefined();
    });

    test("Discord's limits are checked, and where they're broken is named", () => {
        const d = emptyDraft();
        expect(problems(d)).toEqual([{ kind: "empty" }]);
        d.embeds = [embed({ title: "x".repeat(LIMITS.title + 1), url: "not a link", color: "#12" })];
        const kinds = problems(d).map(p => `${p.kind}:${"where" in p ? p.where : ""}`);
        expect(kinds).toContain("tooLong:e1.title");
        expect(kinds).toContain("badUrl:e1.url");
        expect(kinds).toContain("badColor:e1.color");

        d.embeds = [embed({ fields: [{ name: "only a name", value: "", inline: false }], description: "x" })];
        expect(problems(d).map(p => p.kind)).toEqual(["fieldNeedsBoth"]);

        d.embeds = Array.from({ length: 6 }, () => embed({ description: "x".repeat(1001) }));
        expect(totalLength(d)).toBe(6006);
        expect(problems(d).some(p => p.kind === "tooLong" && p.where === "total")).toBe(true);

        d.embeds = Array.from({ length: 11 }, () => embed({ title: "t" }));
        expect(problems(d).some(p => p.kind === "tooMany" && p.where === "embeds")).toBe(true);

        // Attachment images are fine, an embed with only a colour isn't
        d.embeds = [embed({ image: "attachment://pic.png" }), embed({ color: "#ffffff" })];
        expect(problems(d).map(p => `${p.kind}:${"where" in p ? p.where : ""}`)).toEqual(["emptyEmbed:e2"]);
    });

    test("embed length counts what Discord counts", () => {
        expect(embedLength(embed({ title: "ab", description: "cde", authorName: "f", footerText: "gh", fields: [{ name: "i", value: "jk", inline: false }] }))).toBe(11);
    });

    test("imports read the webhook body, Discohook, a list of embeds and a single embed", () => {
        const plain = draftFromJson(JSON.stringify({ content: "hi", username: "U", avatar_url: "https://a/b.png", embeds: [{ title: "T", color: 255, fields: [{ name: "n", value: "v", inline: true }] }] }));
        expect(plain.content).toBe("hi");
        expect(plain.username).toBe("U");
        expect(plain.embeds[0].color).toBe("#0000ff");
        expect(plain.embeds[0].fields).toEqual([{ name: "n", value: "v", inline: true }]);

        const discohook = draftFromJson(JSON.stringify({ version: "d2", messages: [{ _id: "x", data: { content: "dh", embeds: [{ description: "D" }] } }] }));
        expect(discohook.content).toBe("dh");
        expect(discohook.embeds[0].description).toBe("D");

        expect(draftFromJson(JSON.stringify([{ title: "A" }, { title: "B" }])).embeds.map(e => e.title)).toEqual(["A", "B"]);
        expect(draftFromJson(JSON.stringify({ title: "Solo", footer: { text: "f" } })).embeds[0].footerText).toBe("f");

        expect(() => draftFromJson("{nope")).toThrow("not-json");
        expect(() => draftFromJson(JSON.stringify({ hello: 1 }))).toThrow("not-message");
    });

    test("export and import round-trip", () => {
        const d = { ...emptyDraft(), content: "c", embeds: [embed({ title: "T", color: "#5865f2", timestamp: "2026-01-01T00:00:00.000Z", thumbnail: "https://t/t.png" })] };
        const back = draftFromJson(draftToJson(d));
        expect(back.content).toBe("c");
        expect(back.embeds[0]).toEqual(d.embeds[0]);
    });

    test("inline fields share rows: three, or two next to a thumbnail", () => {
        expect(fieldColumns([true, true, true, true], 3)).toEqual(["1 / 5", "5 / 9", "9 / 13", "1 / 13"]);
        expect(fieldColumns([true, false, true, true], 3)).toEqual(["1 / 13", "1 / 13", "1 / 7", "7 / 13"]);
        expect(fieldColumns([true, true, true], 2)).toEqual(["1 / 7", "7 / 13", "1 / 13"]);
    });

    test("message links and webhook URLs", () => {
        expect(parseMessageLink("https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333")).toEqual({
            guildId: "111111111111111111", channelId: "222222222222222222", messageId: "333333333333333333",
        });
        expect(parseMessageLink("https://ptb.discord.com/channels/111111111111111111/222222222222222222/333333333333333333/")).toBeDefined();
        expect(parseMessageLink("https://example.com/channels/1/2/3")).toBeUndefined();
        expect(webhookUrl("1", "tok", { wait: true, threadId: "9" })).toBe("https://discord.com/api/v10/webhooks/1/tok?wait=true&thread_id=9");
        expect(webhookUrl("1", "tok", { messageId: "5" })).toBe("https://discord.com/api/v10/webhooks/1/tok/messages/5");
    });

    test("only incoming webhooks with a token can be used", () => {
        expect(usableWebhooks([
            { id: "1", type: 1, name: "Zed", token: "a", channel_id: "c" },
            { id: "2", type: 2, name: "Follower", channel_id: "c" },
            { id: "3", type: 3, name: "App", channel_id: "c" },
            { id: "4", type: 1, name: "Alpha", token: "b", avatar: "h", channel_id: "c" },
        ]).map(w => w.name)).toEqual(["Alpha", "Zed"]);
        expect(usableWebhooks(null)).toEqual([]);
    });
});
