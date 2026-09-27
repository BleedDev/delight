import { describe, expect, test } from "bun:test";

import { channelGallery, imagesOfMessage, isHiddenAttachment, isImageAttachment, MAX_AROUND } from "../plugins/better-image-viewer/gallery";

const png = (id: string, extra: object = {}) => ({
    id, filename: `${id}.png`, content_type: "image/png", url: `https://cdn.discordapp.com/attachments/1/${id}.png?ex=1`,
    proxy_url: `https://media.discordapp.net/attachments/1/${id}.png?ex=1`, width: 800, height: 600, ...extra,
});
const msg = (id: string, attachments: any[] = [], extra: object = {}) => ({ id, channel_id: "c", content: "", attachments, embeds: [], ...extra });
const ids = (items: any[]) => items.map(i => i.sourceMetadata?.identifier?.attachmentId ?? i.url);

describe("which images are added", () => {
    test("image attachments by content type or file name", () => {
        expect(isImageAttachment({ content_type: "image/webp" })).toBe(true);
        expect(isImageAttachment({ content_type: "video/mp4", filename: "a.png" })).toBe(false);
        expect(isImageAttachment({ filename: "photo.JPEG" })).toBe(true);
        expect(isImageAttachment({ filename: "notes.txt" })).toBe(false);
    });

    test("spoilers and sensitive media are hidden", () => {
        expect(isHiddenAttachment({ filename: "SPOILER_a.png" })).toBe(true);
        expect(isHiddenAttachment({ spoiler: true })).toBe(true);
        expect(isHiddenAttachment({ flags: 8 })).toBe(true);
        expect(isHiddenAttachment({ flags: 16 })).toBe(true);
        expect(isHiddenAttachment({ filename: "a.png", flags: 32 })).toBe(false);
    });

    test("attachments then embed images, in the viewer's item shape", () => {
        const m = msg("m", [png("a"), { id: "v", filename: "v.mp4", content_type: "video/mp4" }, png("s", { filename: "SPOILER_s.png" })], {
            embeds: [
                { type: "rich", image: { url: "https://x.com/e.jpg", proxyURL: "https://images-ext-1.discordapp.net/e.jpg", width: 10, height: 20 } },
                { type: "gifv", thumbnail: { url: "https://t.com/g.gif" } },
                { type: "image", thumbnail: { url: "https://i.com/b.png", proxyURL: "https://p/b.png" } },
                { type: "article", thumbnail: { url: "https://i.com/thumb.png" } },
            ],
        });
        const items = imagesOfMessage(m);
        expect(ids(items)).toEqual(["a", "https://x.com/e.jpg", "https://i.com/b.png"]);
        expect(items[0]).toMatchObject({ type: "IMAGE", proxyUrl: png("a").proxy_url, sourceMetadata: { message: m, identifier: { type: "attachment", attachmentId: "a" } } });
        expect(items[1]).toMatchObject({ type: "IMAGE", proxyUrl: "https://images-ext-1.discordapp.net/e.jpg", width: 10, sourceMetadata: { identifier: { type: "embed", embedIndex: 0 } } });
    });

    test("an embed of an attached file isn't added twice", () => {
        const m = msg("m", [png("a")], { embeds: [{ type: "image", thumbnail: { url: png("a").url.replace("?ex=1", "?ex=2") } }] });
        expect(imagesOfMessage(m)).toHaveLength(1);
    });

    test("a message with ||spoilers|| keeps its attachments but not its embeds", () => {
        const m = msg("m", [png("a")], { content: "||https://x.com/e.jpg||", embeds: [{ type: "image", thumbnail: { url: "https://x.com/e.jpg" } }] });
        expect(ids(imagesOfMessage(m))).toEqual(["a"]);
    });

    test("uses the given attachment helper and drops what it doesn't call an image", () => {
        const helper = (a: any, message: any) => ({ type: a.id === "b" ? "INVALID" : "IMAGE", url: a.url, sourceMetadata: { message, identifier: { attachmentId: a.id } }, fromHelper: true });
        const items = imagesOfMessage(msg("m", [png("a"), png("b")]), helper);
        expect(ids(items)).toEqual(["a"]);
        expect(items[0].fromHelper).toBe(true);
    });
});

describe("channel gallery", () => {
    const messages = [msg("1", [png("a")]), msg("2", [png("b"), png("c")]), msg("3"), msg("4", [png("d")])];
    const clicked = imagesOfMessage(messages[1]).map(i => ({ ...i, fromDiscord: true }));

    test("keeps Discord's items for the clicked message and adds the rest around them", () => {
        const g = channelGallery(messages, "2", clicked, 1)!;
        expect(ids(g.items)).toEqual(["a", "b", "c", "d"]);
        expect(g.items[1]).toBe(clicked[0]);
        expect(g.items[2]).toBe(clicked[1]);
        expect(g.startingIndex).toBe(2);
    });

    test("leaves the call alone when the message isn't loaded", () => {
        expect(channelGallery(messages, "nope", clicked, 0)).toBeUndefined();
    });

    test("skips messages the predicate hides", () => {
        const g = channelGallery(messages, "2", clicked, 0, undefined, m => m.id === "1")!;
        expect(ids(g.items)).toEqual(["b", "c", "d"]);
        expect(g.startingIndex).toBe(0);
    });

    test("keeps at most MAX_AROUND images on each side", () => {
        const many = Array.from({ length: MAX_AROUND * 3 }, (_, i) => msg(`m${i}`, [png(`p${i}`)]));
        const at = MAX_AROUND * 2;
        const own = imagesOfMessage(many[at]);
        const g = channelGallery(many, `m${at}`, own, 0)!;
        expect(g.items).toHaveLength(MAX_AROUND * 2);
        expect(g.startingIndex).toBe(MAX_AROUND);
        expect(g.items[g.startingIndex]).toBe(own[0]);
        expect(ids(g.items)[0]).toBe(`p${at - MAX_AROUND}`);
        expect(ids(g.items).at(-1)).toBe(`p${at + MAX_AROUND - 1}`);
    });
});
