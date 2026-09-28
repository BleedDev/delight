import { describe, expect, test } from "bun:test";

import { cdnUrl, extensionOf, fileName, fitSize, linkedPicture, pictureFromUrl, safeFileName } from "../plugins/view-icons/icons";

const HASH = "0123456789abcdef0123456789abcdef";
const ANIMATED = `a_${HASH}`;

describe("view icons: links", () => {
    test("full size, GIF only for animated hashes, nothing for bad hashes", () => {
        expect(cdnUrl("avatars/1", HASH)).toBe(`https://cdn.discordapp.com/avatars/1/${HASH}.png?size=4096`);
        expect(cdnUrl("avatars/1", ANIMATED)).toBe(`https://cdn.discordapp.com/avatars/1/${ANIMATED}.gif?size=4096`);
        expect(cdnUrl("splashes/1", ANIMATED, false)).toBe(`https://cdn.discordapp.com/splashes/1/${ANIMATED}.png?size=4096`);
        expect(cdnUrl("avatars/1", null)).toBeNull();
        expect(cdnUrl("avatars/1", "../../x")).toBeNull();
        expect(extensionOf(`x/${ANIMATED}.gif?size=4096`)).toBe("gif");
        expect(extensionOf("x/y.png")).toBe("png");
    });

    test("a CDN link to a profile picture, as its full-size link", () => {
        const at = (path: string) => pictureFromUrl(`https://cdn.discordapp.com/${path}`);
        expect(at(`avatars/10/${HASH}.webp?size=128`)).toEqual({ kind: "avatar", ownerId: "10", url: `https://cdn.discordapp.com/avatars/10/${HASH}.png?size=4096` });
        expect(at(`avatars/10/${ANIMATED}.webp?size=128&animated=true`)?.url).toBe(`https://cdn.discordapp.com/avatars/10/${ANIMATED}.gif?size=4096`);
        expect(at(`banners/10/${HASH}.png?size=600`)).toMatchObject({ kind: "banner", ownerId: "10" });
        expect(at(`guilds/20/users/10/avatars/${HASH}.webp`)).toEqual({ kind: "server-avatar", ownerId: "10", url: `https://cdn.discordapp.com/guilds/20/users/10/avatars/${HASH}.png?size=4096` });
        expect(at(`guilds/20/users/10/banners/${ANIMATED}.gif`)).toMatchObject({ kind: "server-banner", ownerId: "10" });
        expect(at(`icons/30/${ANIMATED}.webp`)).toMatchObject({ kind: "icon", ownerId: "30" });
        expect(at(`channel-icons/40/${ANIMATED}.png`)?.url).toBe(`https://cdn.discordapp.com/channel-icons/40/${ANIMATED}.png?size=4096`);
        expect(at("embed/avatars/3.png")).toEqual({ kind: "avatar", ownerId: null, url: "https://cdn.discordapp.com/embed/avatars/3.png" });
        expect(pictureFromUrl(`https://media.discordapp.net/avatars/10/${HASH}.webp`)?.kind).toBe("avatar");
    });

    test("anything else isn't a profile picture", () => {
        expect(pictureFromUrl("https://cdn.discordapp.com/attachments/1/2/cat.png")).toBeNull();
        expect(pictureFromUrl("https://cdn.discordapp.com/emojis/123.webp")).toBeNull();
        expect(pictureFromUrl(`https://cdn.discordapp.com/avatars/x/${HASH}.png`)).toBeNull();
        expect(pictureFromUrl(`https://evil.example/avatars/10/${HASH}.png`)).toBeNull();
        expect(pictureFromUrl(`http://cdn.discordapp.com/avatars/10/${HASH}.png`)).toBeNull();
        expect(pictureFromUrl("data:image/png;base64,AAAA")).toBeNull();
        expect(pictureFromUrl("blob:https://discord.com/1")).toBeNull();
        expect(pictureFromUrl(null)).toBeNull();
    });

    test("downloads are named after whose they are", () => {
        const avatar = linkedPicture(pictureFromUrl(`https://cdn.discordapp.com/avatars/10/${ANIMATED}.webp`)!, "alice");
        expect([avatar.label, avatar.animated, fileName(avatar)]).toEqual(["Avatar", true, "alice-avatar.gif"]);
        const banner = linkedPicture(pictureFromUrl(`https://cdn.discordapp.com/guilds/20/users/10/banners/${HASH}.png`)!, "alice");
        expect([banner.label, banner.aspect, fileName(banner)]).toEqual(["Server Banner", 2.5, "alice-server-banner.png"]);
    });
});

describe("view icons: files and sizes", () => {
    test("file names are safe everywhere", () => {
        expect(safeFileName(String.raw`a/b\c:d*e?"f<g>h|i`)).toBe("a b c d e f g h i");
        expect(safeFileName("  dots...  ")).toBe("dots");
        expect(safeFileName("CON")).toBe("CON_");
        expect(safeFileName("")).toBe("image");
        expect(safeFileName("x".repeat(200)).length).toBe(80);
    });

    test("fits the box, keeping the aspect", () => {
        expect(fitSize(1, 800, 600)).toEqual({ width: 600, height: 600 });
        expect(fitSize(2.5, 800, 600)).toEqual({ width: 800, height: 320 });
        expect(fitSize(16 / 9, 1600, 450)).toEqual({ width: 800, height: 450 });
    });
});
