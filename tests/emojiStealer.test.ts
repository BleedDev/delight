import { describe, expect, test } from "bun:test";

import {
    canAddExpressions, canCopySticker, cleanEmojiNameInput, CREATE_GUILD_EXPRESSIONS, describeError, emojiSlotLimit, emojiSlots, emojiUrl,
    expressionFromElement, expressionFromMenuProps, isAnimatedUrl, isValidEmojiName, isValidStickerName, MANAGE_GUILD_EXPRESSIONS,
    parseEmojiMarkup, parseExpressionUrl, sanitizeEmojiName, sanitizeStickerName, stickerSlotLimit, stickerSlots, stickerUrl,
} from "../plugins/emoji-stealer/emoji";

const ID = "123456789012345678";
const ID2 = "987654321098765432";

/** A fake DOM element with attributes and a parent */
function el(attrs: Record<string, string>, parentNode?: unknown) {
    return { getAttribute: (n: string) => attrs[n] ?? null, parentNode };
}

describe("names", () => {
    test("sanitizes emoji names to Discord's rules", () => {
        expect(sanitizeEmojiName("pepe_laugh")).toBe("pepe_laugh");
        expect(sanitizeEmojiName(":blob:")).toBe("blob");
        expect(sanitizeEmojiName("kek~1")).toBe("kek");
        expect(sanitizeEmojiName("hello world!")).toBe("hello_world");
        expect(sanitizeEmojiName("a")).toBe("a_");
        expect(sanitizeEmojiName("")).toBe("emoji");
        expect(sanitizeEmojiName("!!!")).toBe("emoji");
        expect(sanitizeEmojiName(undefined)).toBe("emoji");
        expect(sanitizeEmojiName("x".repeat(40))).toHaveLength(32);
        expect(sanitizeEmojiName("émoji")).toBe("moji");
    });

    test("every sanitized name is valid", () => {
        for (const raw of ["", "a", "a b", "~~", "x".repeat(99), ":ok:", "日本"]) expect(isValidEmojiName(sanitizeEmojiName(raw))).toBe(true);
    });

    test("validates names", () => {
        expect(isValidEmojiName("ok")).toBe(true);
        expect(isValidEmojiName("o")).toBe(false);
        expect(isValidEmojiName("with space")).toBe(false);
        expect(isValidEmojiName("x".repeat(33))).toBe(false);
    });

    test("cleans typed input", () => {
        expect(cleanEmojiNameInput("he llo-!")).toBe("hello");
        expect(cleanEmojiNameInput("y".repeat(50))).toHaveLength(32);
    });

    test("sticker names", () => {
        expect(sanitizeStickerName("  Big   Cat ")).toBe("Big Cat");
        expect(sanitizeStickerName("")).toBe("sticker");
        expect(sanitizeStickerName("x")).toBe("x_");
        expect(sanitizeStickerName("z".repeat(40))).toHaveLength(30);
        expect(isValidStickerName("ab")).toBe(true);
        expect(isValidStickerName(" a ")).toBe(false);
    });
});

describe("slots", () => {
    test("emoji limit by boost tier", () => {
        expect([0, 1, 2, 3].map(premiumTier => emojiSlotLimit({ premiumTier }))).toEqual([50, 100, 150, 250]);
        expect(emojiSlotLimit({})).toBe(50);
        expect(emojiSlotLimit({ premiumTier: 7 })).toBe(250);
    });

    test("MORE_EMOJI and extra slots", () => {
        expect(emojiSlotLimit({ premiumTier: 0, features: new Set(["MORE_EMOJI"]) })).toBe(200);
        expect(emojiSlotLimit({ premiumTier: 3, features: ["MORE_EMOJI"] })).toBe(250);
        expect(emojiSlotLimit({ premiumTier: 1, premiumFeatures: { additionalEmojiSlots: 100 } })).toBe(150);
    });

    test("counts static and animated separately", () => {
        const emojis = [{ animated: true }, { animated: false }, {}, { animated: true }, { animated: true }];
        expect(emojiSlots({ premiumTier: 0 }, emojis)).toEqual({ limit: 50, staticUsed: 2, animatedUsed: 3, staticLeft: 48, animatedLeft: 47 });
        const full = Array.from({ length: 60 }, () => ({ animated: false }));
        expect(emojiSlots({ premiumTier: 0 }, full).staticLeft).toBe(0);
        expect(emojiSlots({ premiumTier: 0 }, undefined).animatedLeft).toBe(50);
    });

    test("sticker limits", () => {
        expect([0, 1, 2, 3].map(premiumTier => stickerSlotLimit({ premiumTier }))).toEqual([5, 15, 30, 60]);
        expect(stickerSlotLimit({ premiumTier: 3, features: new Set(["MORE_STICKERS"]) })).toBe(120);
        expect(stickerSlotLimit({ premiumTier: 1, features: new Set(["MORE_STICKERS"]) })).toBe(15);
        expect(stickerSlots({ premiumTier: 1 }, [1, 2, 3])).toEqual({ limit: 15, used: 3, left: 12 });
    });
});

describe("permissions", () => {
    const guildId = "1";
    const base = { guildId, userId: "u", ownerId: "owner", memberRoleIds: ["r1"] };

    test("owner can always add", () => {
        expect(canAddExpressions({ ...base, ownerId: "u", memberRoleIds: [], roles: [] })).toBe(true);
    });

    test("administrator can add", () => {
        expect(canAddExpressions({ ...base, roles: [{ id: guildId, permissions: 0n }, { id: "r1", permissions: 8n }] })).toBe(true);
    });

    test("create or manage expressions from a role or @everyone", () => {
        expect(canAddExpressions({ ...base, roles: [{ id: "r1", permissions: CREATE_GUILD_EXPRESSIONS }] })).toBe(true);
        expect(canAddExpressions({ ...base, roles: [{ id: "r1", permissions: MANAGE_GUILD_EXPRESSIONS.toString() }] })).toBe(true);
        expect(canAddExpressions({ ...base, memberRoleIds: [], roles: { [guildId]: { id: guildId, permissions: CREATE_GUILD_EXPRESSIONS } } })).toBe(true);
    });

    test("no permission, or the role isn't the member's", () => {
        expect(canAddExpressions({ ...base, roles: [{ id: guildId, permissions: 1n << 11n }, { id: "r1", permissions: 1n << 10n }] })).toBe(false);
        expect(canAddExpressions({ ...base, roles: [{ id: "r2", permissions: MANAGE_GUILD_EXPRESSIONS }] })).toBe(false);
        expect(canAddExpressions({ ...base, roles: [{ id: "r1", permissions: "garbage" }] })).toBe(false);
    });
});

describe("parsing", () => {
    test("markup", () => {
        expect(parseEmojiMarkup(`hi <:kek:${ID}> and <a:party_blob:${ID2}> <:bad:12>`)).toEqual([
            { kind: "emoji", id: ID, name: "kek", animated: false },
            { kind: "emoji", id: ID2, name: "party_blob", animated: true },
        ]);
        expect(parseEmojiMarkup(undefined)).toEqual([]);
    });

    test("animated URLs", () => {
        expect(isAnimatedUrl(`https://cdn.discordapp.com/emojis/${ID}.gif?size=48`)).toBe(true);
        expect(isAnimatedUrl(`https://cdn.discordapp.com/emojis/${ID}.webp?size=48&animated=true`)).toBe(true);
        expect(isAnimatedUrl(`https://cdn.discordapp.com/emojis/${ID}.webp?size=48`)).toBe(false);
        expect(isAnimatedUrl(undefined)).toBe(false);
    });

    test("CDN URLs", () => {
        expect(parseExpressionUrl(`https://cdn.discordapp.com/emojis/${ID}.webp?size=44&animated=true`)).toEqual({ kind: "emoji", id: ID, animated: true });
        expect(parseExpressionUrl(`https://cdn.discordapp.com/emojis/${ID}.png`)).toEqual({ kind: "emoji", id: ID, animated: false });
        expect(parseExpressionUrl(`https://media.discordapp.net/stickers/${ID}.gif?size=160`)).toEqual({ kind: "sticker", id: ID, formatType: 4 });
        expect(parseExpressionUrl(`https://media.discordapp.net/stickers/${ID}.png`)).toEqual({ kind: "sticker", id: ID, formatType: undefined });
        expect(parseExpressionUrl("https://cdn.discordapp.com/attachments/1/2/image.png")).toBeUndefined();
        expect(parseExpressionUrl(undefined)).toBeUndefined();
    });

    test("emoji element in a message", () => {
        const img = el({ "data-type": "emoji", "data-id": ID, alt: ":blob:", src: `https://cdn.discordapp.com/emojis/${ID}.webp?size=48&animated=true` });
        expect(expressionFromElement(img)).toEqual({ kind: "emoji", id: ID, name: "blob", animated: true });
    });

    test("expression picker element", () => {
        const node = el({ "data-type": "emoji", "data-id": ID, "data-name": "cat~1", "data-animated": "false" });
        expect(expressionFromElement(node)).toEqual({ kind: "emoji", id: ID, name: "cat~1", animated: false });
        const sticker = el({ "data-type": "sticker", "data-id": ID, "data-name": "Wave", "data-format-type": "2" });
        expect(expressionFromElement(sticker)).toEqual({ kind: "sticker", id: ID, name: "Wave", formatType: 2 });
    });

    test("walks up to the emoji node, or finds a reaction by its src", () => {
        const inner = el({}, el({ "data-type": "emoji", "data-id": ID, alt: "x_x" }));
        expect(expressionFromElement(inner)).toMatchObject({ kind: "emoji", id: ID, name: "x_x" });
        const reaction = el({ src: `https://cdn.discordapp.com/emojis/${ID}.gif?size=32`, alt: "dance" });
        expect(expressionFromElement(reaction)).toEqual({ kind: "emoji", id: ID, name: "dance", animated: true });
        expect(expressionFromElement(el({ "data-type": "emoji", "data-name": "😀" }))).toBeUndefined();
        expect(expressionFromElement(null)).toBeUndefined();
    });

    test("message menu props: favoriteable emoji, name from the message", () => {
        const props = {
            favoriteableType: "emoji",
            favoriteableId: ID,
            itemSrc: `https://cdn.discordapp.com/emojis/${ID}.gif?size=48`,
            message: { content: `lol <a:dance:${ID}>` },
        };
        expect(expressionFromMenuProps(props)).toEqual({ kind: "emoji", id: ID, name: "dance", animated: true });
    });

    test("message menu props: the nested target wins", () => {
        const props = {
            favoriteableType: null,
            eviMenuArgs: { target: el({ "data-type": "emoji", "data-id": ID, alt: ":wave:" }) },
            message: { content: "" },
        };
        expect(expressionFromMenuProps(props)).toEqual({ kind: "emoji", id: ID, name: "wave", animated: false });
    });

    test("message menu props: a reaction, named from message.reactions", () => {
        const props = {
            itemSrc: `https://cdn.discordapp.com/emojis/${ID}.webp?size=32`,
            message: { content: "", reactions: [{ emoji: { id: ID, name: "hype", animated: true } }] },
        };
        expect(expressionFromMenuProps(props)).toEqual({ kind: "emoji", id: ID, name: "hype", animated: true });
    });

    test("message menu props: a sticker, format from sticker items", () => {
        const props = { favoriteableType: "sticker", favoriteableId: ID, favoriteableName: "Hello", message: { stickerItems: [{ id: ID, name: "Hello", format_type: 1 }] } };
        expect(expressionFromMenuProps(props)).toEqual({ kind: "sticker", id: ID, name: "Hello", formatType: 1 });
    });

    test("nothing to steal", () => {
        expect(expressionFromMenuProps({ message: { content: `<:a:${ID}>` }, itemSrc: "https://cdn.discordapp.com/attachments/1/2/a.png" })).toBeUndefined();
        expect(expressionFromMenuProps(undefined)).toBeUndefined();
        expect(expressionFromMenuProps({ favoriteableType: "emoji", favoriteableId: "abc" })).toBeUndefined();
    });
});

describe("urls and errors", () => {
    test("urls", () => {
        expect(emojiUrl(ID, true, 128)).toBe(`https://cdn.discordapp.com/emojis/${ID}.gif?size=128`);
        expect(emojiUrl(ID, false)).toBe(`https://cdn.discordapp.com/emojis/${ID}.png`);
        expect(stickerUrl(ID, 4)).toBe(`https://media.discordapp.net/stickers/${ID}.gif`);
        expect(stickerUrl(ID, 2)).toBe(`https://media.discordapp.net/stickers/${ID}.png`);
        expect(canCopySticker(3)).toBe(false);
        expect(canCopySticker(1)).toBe(true);
    });

    test("Discord's error messages", () => {
        expect(describeError({ body: { message: "Maximum number of emojis reached (50)", code: 30008 } })).toBe("Maximum number of emojis reached (50)");
        expect(describeError({ body: { name: ["Must be between 2 and 32 in length."] } })).toBe("Must be between 2 and 32 in length.");
        expect(describeError({ body: { message: "Invalid Form Body", code: 50035, errors: { image: { _errors: [{ code: "X", message: "File cannot be larger than 256.0 kb." }] } } } }))
            .toBe("File cannot be larger than 256.0 kb.");
        expect(describeError(new Error("Couldn't download it (HTTP 404)"))).toBe("Couldn't download it (HTTP 404)");
        expect(describeError(undefined, "fallback")).toBe("fallback");
    });
});
