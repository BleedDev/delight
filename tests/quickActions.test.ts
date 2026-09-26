import { describe, expect, test } from "bun:test";

import {
    cleanImageUrl, discordOrigin, googleLanguage, IMAGE_SEARCH_ENGINES, isImageAttachment, isVideoUrl, messageLink, TRANSLATE_MAX_CHARS,
    translateUrl,
} from "../plugins/quick-actions/urls";

const engine = (id: string) => IMAGE_SEARCH_ENGINES.find(e => e.id === id)!;

describe("quick actions URLs", () => {
    test("message links use the guild, or @me in DMs", () => {
        expect(messageLink("https://discord.com", "1", "2", "3")).toBe("https://discord.com/channels/1/2/3");
        expect(messageLink("https://discord.com", null, "2", "3")).toBe("https://discord.com/channels/@me/2/3");
        expect(messageLink("https://discord.com", undefined, "2", "3")).toBe("https://discord.com/channels/@me/2/3");
    });

    test("links point at the Discord flavor in use, never at a local origin", () => {
        expect(discordOrigin({ protocol: "https:", host: "canary.discord.com" })).toBe("https://canary.discord.com");
        expect(discordOrigin({ protocol: "https:", host: "discord.com" })).toBe("https://discord.com");
        expect(discordOrigin({ protocol: "http:", host: "localhost:3000" })).toBe("https://discord.com");
        expect(discordOrigin({ protocol: "https:", host: "discord.com.evil.io" })).toBe("https://discord.com");
    });

    test("image search engines get the image URL encoded", () => {
        const image = "https://cdn.discordapp.com/attachments/1/2/cat pic.png?ex=a&is=b&hm=c";
        const encoded = encodeURIComponent(image);
        expect(engine("google-lens").url(image)).toBe(`https://lens.google.com/uploadbyurl?url=${encoded}`);
        expect(engine("yandex").url(image)).toBe(`https://yandex.com/images/search?rpt=imageview&url=${encoded}`);
        expect(engine("tineye").url(image)).toBe(`https://tineye.com/search?url=${encoded}`);
        for (const e of IMAGE_SEARCH_ENGINES) expect(new URL(e.url(image)).protocol).toBe("https:");
    });

    test("media proxy resizing is dropped, the signature kept", () => {
        const cleaned = cleanImageUrl("https://media.discordapp.net/attachments/1/2/a.png?ex=1&is=2&hm=3&format=webp&width=400&height=300&quality=lossless")!;
        const url = new URL(cleaned);
        expect([...url.searchParams.keys()]).toEqual(["ex", "is", "hm"]);
        // Other hosts are left alone
        expect(cleanImageUrl("https://example.com/a.png?width=4")).toBe("https://example.com/a.png?width=4");
    });

    test("non-web image sources are refused", () => {
        expect(cleanImageUrl("blob:https://discord.com/abc")).toBeUndefined();
        expect(cleanImageUrl("data:image/png;base64,AAAA")).toBeUndefined();
        expect(cleanImageUrl("not a url")).toBeUndefined();
    });

    test("images and videos are told apart", () => {
        expect(isImageAttachment({ content_type: "image/png", filename: "a.bin" })).toBe(true);
        expect(isImageAttachment({ content_type: "video/mp4", filename: "a.png" })).toBe(false);
        expect(isImageAttachment({ filename: "photo.JPG" })).toBe(true);
        expect(isImageAttachment({ filename: "notes.txt" })).toBe(false);
        expect(isVideoUrl("https://cdn.discordapp.com/a/clip.mp4?ex=1")).toBe(true);
        expect(isVideoUrl("https://cdn.discordapp.com/a/pic.png")).toBe(false);
    });

    test("Discord locales map to Google Translate codes", () => {
        expect(googleLanguage("en-US")).toBe("en");
        expect(googleLanguage("pt-BR")).toBe("pt");
        expect(googleLanguage("es-419")).toBe("es");
        expect(googleLanguage("zh-TW")).toBe("zh-TW");
        expect(googleLanguage("zh-CN")).toBe("zh-CN");
        expect(googleLanguage("de")).toBe("de");
        expect(googleLanguage(undefined)).toBe("en");
    });

    test("translate URLs carry the text and target language", () => {
        const url = new URL(translateUrl("hello & bye #1 **bold**", "de"));
        expect(url.origin).toBe("https://translate.google.com");
        expect(url.searchParams.get("sl")).toBe("auto");
        expect(url.searchParams.get("tl")).toBe("de");
        expect(url.searchParams.get("text")).toBe("hello & bye #1 **bold**");
        expect(url.searchParams.get("op")).toBe("translate");
    });

    test("long text is cut without splitting an emoji", () => {
        const text = "a".repeat(TRANSLATE_MAX_CHARS - 1) + "😀😀";
        const sent = new URL(translateUrl(text, "en")).searchParams.get("text")!;
        expect(Array.from(sent).length).toBe(TRANSLATE_MAX_CHARS);
        expect(sent.endsWith("😀")).toBe(true);
    });
});
