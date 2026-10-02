import { describe, expect, test } from "bun:test";

import {
    Block, componentCount, componentTextLength, convertToV2, draftFromJson, draftToJson, embedLength, emptyBlock, emptyDraft, emptyEmbed, fieldColumns,
    galleryRows, hexToInt, intToHex, IS_COMPONENTS_V2, LIMITS, parseMessageLink, payload, problems, requestBody, safeFileName, totalLength, usableWebhooks,
    webhookUrl,
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

    describe("Components V2", () => {
        const v2 = (components: Block[]) => ({ ...emptyDraft("v2"), components });

        test("the payload is flags and components only, nested as Discord wants", () => {
            const d = v2([
                { kind: "text", content: "Hello" },
                {
                    kind: "container", color: "#5865f2", spoiler: false, children: [
                        { kind: "section", texts: ["A", "B"], accessory: { kind: "thumbnail", url: "https://x.y/t.png", description: "alt", spoiler: true } },
                        { kind: "separator", divider: false, spacing: 2 },
                        { kind: "gallery", items: [{ url: "attachment://a.png", description: "", spoiler: false }] },
                        { kind: "file", name: "notes.txt", spoiler: false },
                        { kind: "buttons", buttons: [{ label: "Site", url: "https://evi.rest", emoji: "🔗" }] },
                    ],
                },
            ]);
            const body = payload(d) as any;
            expect(body.flags).toBe(IS_COMPONENTS_V2);
            expect(body.content).toBeUndefined();
            expect(body.embeds).toBeUndefined();
            expect(body.components[0]).toEqual({ type: 10, content: "Hello" });
            const container = body.components[1];
            expect(container.type).toBe(17);
            expect(container.accent_color).toBe(0x5865f2);
            expect(container.components[0]).toEqual({
                type: 9,
                components: [{ type: 10, content: "A" }, { type: 10, content: "B" }],
                accessory: { type: 11, media: { url: "https://x.y/t.png" }, description: "alt", spoiler: true },
            });
            expect(container.components[1]).toEqual({ type: 14, divider: false, spacing: 2 });
            expect(container.components[2]).toEqual({ type: 12, items: [{ media: { url: "attachment://a.png" } }] });
            expect(container.components[3]).toEqual({ type: 13, file: { url: "attachment://notes.txt" } });
            expect(container.components[4]).toEqual({ type: 1, components: [{ type: 2, style: 5, label: "Site", url: "https://evi.rest", emoji: { name: "🔗" } }] });
        });

        test("components and text are counted like Discord counts them", () => {
            const blocks: Block[] = [
                { kind: "text", content: "abc" },
                {
                    kind: "container", color: "", spoiler: false, children: [
                        { kind: "section", texts: ["de", "f"], accessory: { kind: "button", label: "x", url: "https://a.b", emoji: "" } },
                        { kind: "buttons", buttons: [{ label: "a", url: "https://a.b", emoji: "" }, { label: "b", url: "https://a.b", emoji: "" }] },
                    ],
                },
            ];
            // text 1, container 1, section 1 + 2 texts + accessory 1, row 1 + 2 buttons
            expect(componentCount(blocks)).toBe(9);
            expect(componentTextLength(blocks)).toBe(6);
        });

        test("its limits and empty parts are problems, named by where they are", () => {
            expect(problems(v2([])).map(p => p.kind)).toEqual(["empty"]);
            const d = v2([
                { kind: "text", content: "" },
                { kind: "container", color: "#12", spoiler: false, children: [{ kind: "buttons", buttons: [{ label: "", url: "nope", emoji: "" }] }, { kind: "file", name: "missing.png", spoiler: false }] },
                { kind: "gallery", items: [{ url: "attachment://gone.png", description: "", spoiler: false }] },
            ]);
            const kinds = problems(d, ["here.png"]).map(p => `${p.kind}:${"where" in p ? p.where : ""}`);
            expect(kinds).toContain("emptyComponent:c1");
            expect(kinds).toContain("badColor:c2.color");
            expect(kinds).toContain("buttonNeedsLabel:c2.c1.b1");
            expect(kinds).toContain("badUrl:c2.c1.b1.link");
            expect(kinds).toContain("noAttachment:c2.c2");
            expect(kinds).toContain("noAttachment:c3.i1.media");

            const many = v2(Array.from({ length: 41 }, () => ({ kind: "text", content: "x".repeat(100) }) as Block));
            const tooMany = problems(many);
            expect(tooMany.some(p => p.kind === "tooMany" && p.where === "components")).toBe(true);
            expect(tooMany.some(p => p.kind === "tooLong" && p.where === "componentText")).toBe(true);
        });

        test("imports read V2 messages, keep link buttons and count what they drop", () => {
            const raw = {
                flags: 32768,
                components: [
                    { type: 10, content: "T" },
                    { type: 17, accent_color: 255, components: [{ type: 1, components: [{ type: 2, style: 5, label: "L", url: "https://a.b" }, { type: 2, style: 1, label: "Click", custom_id: "x" }] }] },
                    { type: 3, custom_id: "menu" },
                ],
            };
            const d = draftFromJson(JSON.stringify(raw));
            expect(d.mode).toBe("v2");
            expect(d.skipped).toBe(2);
            expect(d.components[0]).toEqual({ kind: "text", content: "T" });
            expect(d.components[1]).toEqual({ kind: "container", color: "#0000ff", spoiler: false, children: [{ kind: "buttons", buttons: [{ label: "L", url: "https://a.b", emoji: "" }] }] });
            // Discohook keeps V2 messages the same way, under data
            expect(draftFromJson(JSON.stringify({ messages: [{ data: raw }] })).mode).toBe("v2");
            expect(draftFromJson(JSON.stringify({ content: "x" })).mode).toBe("classic");
        });

        test("a loaded message's attachments read as attachment://name again", () => {
            const sent = [{ id: "99", filename: "pic.png", url: "https://cdn.discordapp.com/attachments/1/99/pic.png?ex=abc" }];
            const raw = { flags: 32768, components: [{ type: 12, items: [{ media: { url: "https://cdn.discordapp.com/attachments/1/99/pic.png?ex=zzz" } }] }, { type: 13, file: { url: "https://x", attachment_id: "99" } }] };
            const d = draftFromJson(JSON.stringify(raw), sent);
            expect(d.components[0]).toEqual({ kind: "gallery", items: [{ url: "attachment://pic.png", description: "", spoiler: false }] });
            expect(d.components[1]).toEqual({ kind: "file", name: "pic.png", spoiler: false });
        });

        test("V2 export and import round-trip", () => {
            const d = v2([
                { kind: "container", color: "#123456", spoiler: true, children: [{ kind: "text", content: "inside" }] },
                { kind: "section", texts: ["s"], accessory: { kind: "button", label: "b", url: "https://a.b", emoji: "" } },
            ]);
            const back = draftFromJson(draftToJson(d));
            expect(back.mode).toBe("v2");
            expect(back.components).toEqual(d.components);
        });

        test("classic drafts convert to V2 without losing what was written", () => {
            const d = {
                ...emptyDraft(),
                content: "Hi",
                embeds: [{ ...emptyEmbed(), title: "T", url: "https://t", description: "D", color: "#ff0000", thumbnail: "https://th", image: "https://im", fields: [{ name: "n", value: "v", inline: false }], footerText: "F" }],
            };
            const blocks = convertToV2(d);
            expect(blocks[0]).toEqual({ kind: "text", content: "Hi" });
            const c = blocks[1] as any;
            expect(c.kind).toBe("container");
            expect(c.color).toBe("#ff0000");
            expect(c.children.map((x: any) => x.kind)).toEqual(["section", "text", "gallery", "separator", "text"]);
            expect(c.children[0].texts).toEqual(["### [T](https://t)", "D"]);
            expect(c.children[4].content).toBe("-# F");
            expect(problems({ ...d, mode: "v2", components: blocks })).toEqual([]);
            expect(convertToV2(emptyDraft())).toEqual([emptyBlock("container")]);
        });

        test("galleries lay out like Discord's mosaic", () => {
            expect(galleryRows(1)).toEqual([1]);
            expect(galleryRows(3)).toBe("tall");
            expect(galleryRows(5)).toEqual([2, 3]);
            expect(galleryRows(10)).toEqual([1, 3, 3, 3]);
            for (let n = 1; n <= 10; n++) {
                const rows = galleryRows(n);
                expect(rows === "tall" ? 3 : rows.reduce((a, b) => a + b, 0)).toBe(n);
            }
        });

        test("V2 messages ask Discord to read their components, files go along by index", () => {
            expect(webhookUrl("1", "tok", { wait: true, components: true })).toBe("https://discord.com/api/v10/webhooks/1/tok?wait=true&with_components=true");
            const { json, multipart } = requestBody({ flags: IS_COMPONENTS_V2 }, [{ name: "a.png" }, { name: "b.txt" }], [{ id: "77", filename: "old.png", url: "" }]);
            expect(multipart).toBe(true);
            expect(json.attachments).toEqual([{ id: "77", filename: "old.png" }, { id: 0, filename: "a.png" }, { id: 1, filename: "b.txt" }]);
            expect(requestBody({ content: "x" }, []).json).toEqual({ content: "x" });
            expect(safeFileName("my photo (1).png")).toBe("my_photo_(1).png");
        });

        test("every string is in all nine languages", async () => {
            const { readFileSync } = await import("fs");
            const { missingTranslations } = await import("../src/shared/pluginTranslations");
            const dir = "plugins/embed-builder";
            const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
            const code = ["index.tsx", "strings.ts", "embed.ts"].map(f => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
            expect(missingTranslations(manifest, code)).toEqual([]);
        });
    });
});
