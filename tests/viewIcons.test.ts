import { describe, expect, test } from "bun:test";

import {
    cdnUrl, defaultAvatarUrl, extensionOf, fileName, fitSize, groupDmIcons, guildBanners, guildIcons, safeFileName, userAvatars, userBanners,
} from "../plugins/view-icons/icons";

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

    test("default avatars: by id for new usernames, by discriminator for old ones", () => {
        // (id >> 22) % 6
        expect(defaultAvatarUrl("80351110224678912", "0")).toBe(`https://cdn.discordapp.com/embed/avatars/${Number((80351110224678912n >> 22n) % 6n)}.png`);
        expect(defaultAvatarUrl("80351110224678912", "1337")).toBe("https://cdn.discordapp.com/embed/avatars/2.png");
        expect(defaultAvatarUrl("not a snowflake")).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
    });

    test("someone's avatars and banners, server ones first", () => {
        const user = { id: "10", name: "alice", avatar: ANIMATED, banner: HASH, guildId: "20", memberAvatar: HASH, memberBanner: null };
        const avatars = userAvatars(user);
        expect(avatars.map(p => [p.kind, p.label, p.animated])).toEqual([["server-avatar", "Server Avatar", false], ["avatar", "Avatar", true]]);
        expect(avatars[0].url).toBe(`https://cdn.discordapp.com/guilds/20/users/10/avatars/${HASH}.png?size=4096`);
        expect(fileName(avatars[1])).toBe("alice-avatar.gif");
        expect(userBanners(user).map(p => [p.kind, p.aspect])).toEqual([["banner", 2.5]]);
        expect(userAvatars({ id: "10", name: "bob" })[0].url).toContain("/embed/avatars/");
        expect(userBanners({ id: "10", name: "bob" })).toEqual([]);
        expect(userAvatars({ id: "10", name: "x", guildId: "../1", memberAvatar: HASH }).map(p => p.kind)).toEqual(["avatar"]);
        expect(userAvatars({ id: "x/y", name: "x" })).toEqual([]);
    });

    test("server icon, banner and backgrounds; group DM icons", () => {
        const guild = { id: "30", name: "Evi HQ", icon: ANIMATED, banner: HASH, splash: HASH, discoverySplash: null };
        expect(guildIcons(guild).map(p => [p.label, fileName(p)])).toEqual([["Icon", "Evi-HQ-icon.gif"]]);
        expect(guildBanners(guild).map(p => [p.label, p.aspect, fileName(p)])).toEqual([
            ["Banner", 16 / 9, "Evi-HQ-banner.png"],
            ["Invite Background", 16 / 9, "Evi-HQ-invite-background.png"],
        ]);
        expect(guildIcons({ id: "30", name: "x" })).toEqual([]);
        expect(groupDmIcons("40", "Squad", HASH)[0].url).toBe(`https://cdn.discordapp.com/channel-icons/40/${HASH}.png?size=4096`);
        expect(groupDmIcons("40", "Squad", null)).toEqual([]);
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
