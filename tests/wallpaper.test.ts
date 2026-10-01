import { describe, expect, test } from "bun:test";

import {
    BASE_LAYER, buildMediaCss, imageRect, LOGIN_ART, LOGIN_BOX, buildWallpaperCss, MAX_WALLPAPER_BYTES, normalizeWallpaper, PANEL_DEFAULTS, POPOUT_LAYER, SETTINGS_LAYER,
    WALLPAPER_DEFAULTS, WALLPAPER_EXTENSIONS, wallpaperKind, wallpaperMime,
} from "../src/shared/wallpaper";

describe("which files are wallpapers", () => {
    test("images and videos by extension, any case", () => {
        for (const name of ["a.png", "a.JPG", "a.jpeg", "a.webp", "a.gif"]) expect(wallpaperKind(name)).toBe("image");
        for (const name of ["a.mp4", "clip.WEBM"]) expect(wallpaperKind(name)).toBe("video");
        expect(wallpaperMime("a.jpg")).toBe("image/jpeg");
        expect(wallpaperMime("a.webm")).toBe("video/webm");
    });

    test("anything else isn't", () => {
        for (const name of ["a.svg", "a.mov", "a.png.exe", "png", "", "a."]) expect(wallpaperKind(name)).toBeUndefined();
    });

    test("the picker offers exactly those", () => {
        expect(WALLPAPER_EXTENSIONS.sort()).toEqual(["gif", "jpeg", "jpg", "mp4", "png", "webm", "webp"]);
        expect(MAX_WALLPAPER_BYTES.video).toBe(200 * 1024 * 1024);
        expect(MAX_WALLPAPER_BYTES.image).toBe(30 * 1024 * 1024);
    });
});

describe("settings", () => {
    test("missing settings are off, with the defaults", () => {
        expect(normalizeWallpaper(undefined)).toEqual({ ...WALLPAPER_DEFAULTS, file: undefined, kind: undefined });
        expect(WALLPAPER_DEFAULTS).toMatchObject({ dim: 40, blur: 0, pauseOnBattery: true, enabled: false });
    });

    test("numbers are kept in range and rounded", () => {
        expect(normalizeWallpaper({ dim: 150, blur: -3 } as any)).toMatchObject({ dim: 90, blur: 0 });
        expect(normalizeWallpaper({ dim: 42.6, blur: 7.2 } as any)).toMatchObject({ dim: 43, blur: 7 });
        expect(normalizeWallpaper({ dim: NaN, blur: "5" } as any)).toMatchObject({ dim: 40, blur: 0 });
    });

    test("the kind always follows the file, and a file Evi can't show is dropped", () => {
        expect(normalizeWallpaper({ enabled: true, file: "wallpaper-1.mp4", kind: "image" } as any)).toMatchObject({ file: "wallpaper-1.mp4", kind: "video" });
        expect(normalizeWallpaper({ enabled: true, file: "evil.html" } as any)).toMatchObject({ file: undefined, kind: undefined });
    });

    test("only a real false turns off pausing on battery", () => {
        expect(normalizeWallpaper({ pauseOnBattery: false } as any).pauseOnBattery).toBe(false);
        expect(normalizeWallpaper({ pauseOnBattery: 0 } as any).pauseOnBattery).toBe(true);
    });
});

describe("the stylesheet", () => {
    test("dims by the setting, black on dark and white on light", () => {
        const css = buildWallpaperCss({ dim: 60, blur: 0 });
        expect(css).toContain("background: rgb(0 0 0 / 0.6);");
        expect(css).toContain("background: rgb(255 255 255 / 0.6);");
        expect(css).toContain("filter: none;");
    });

    test("blurs, bleeding past the edges", () => {
        const css = buildWallpaperCss({ dim: 0, blur: 8 });
        expect(css).toContain("filter: blur(8px);");
        expect(css).toContain("inset-block-start: -16px;");
        expect(css).toContain("calc(100% + 32px)");
    });

    test("clamps what it's given", () => {
        expect(buildWallpaperCss({ dim: 500, blur: 99 })).toContain("rgb(0 0 0 / 0.9)");
        expect(buildWallpaperCss({ dim: 500, blur: 99 })).toContain("blur(20px)");
    });

    test("only Discord's main window turns see-through by default, in the theme's own colours", () => {
        const css = buildWallpaperCss({ dim: 60, blur: 0 });
        for (const v of ["--background-base-lowest", "--background-base-lower", "--background-base-low", "--background-primary", "--background-secondary", "--background-tertiary", "--chat-background"]) {
            expect(css).toMatch(new RegExp(`${v}: color-mix\\(in srgb, var\\(--evi-wp${v.slice(1)}, rgb\\(0 0 0\\)\\) \\d+%, transparent\\);`));
            expect(css).toContain(`--evi-wp${v.slice(1)}: var(${v});`);
        }
        expect(css).toContain(`${BASE_LAYER}:is(:is(.theme-dark, .theme-darker, .theme-midnight) *):not(#evi-wallpaper-none)`);
        expect(css).not.toContain(SETTINGS_LAYER);
        expect(css).not.toContain(POPOUT_LAYER);
        expect(css).toContain("background: transparent !important;");
        expect(css).toContain("--background-gradient-chat: initial;");
        expect(css).not.toContain("--background-surface-high:");
    });

    test("each part of the window gets its own amount, and neutral tints are plain black or white", () => {
        const css = buildWallpaperCss({ tint: "neutral", panels: { frame: 40, sidebars: 30, chat: 0, input: 100, popouts: 85 } });
        expect(css).toContain("--background-base-lowest: rgb(0 0 0 / 0.4);");
        expect(css).toContain("--background-base-low: rgb(0 0 0 / 0.3);");
        expect(css).toContain("--background-base-lower: rgb(0 0 0 / 0);");
        expect(css).toContain("--channeltextarea-background: rgb(0 0 0 / 1);");
        expect(css).toContain("--background-base-low: rgb(255 255 255 / 0.3);");
        expect(css).not.toContain("--evi-wp-");
    });

    test("Discord's backdrop behind every layer goes clear too, and the member list is tinted", () => {
        const css = buildWallpaperCss({});
        expect(css).toContain(':is([class^="app_"], [class*=" app_"]) > :is([class^="bg_"], [class*=" bg_"])');
        expect(css).toContain("--custom-channel-members-bg: color-mix(");
    });

    test("settings and popouts only when asked, popouts at their own amount", () => {
        const css = buildWallpaperCss({ tint: "neutral", behindSettings: true, behindPopouts: true, panels: { popouts: 70 } as any });
        expect(css).toContain(`${SETTINGS_LAYER}:is(`);
        expect(css).toContain(`${POPOUT_LAYER}:is(`);
        expect(css).toContain("--background-surface-high: rgb(0 0 0 / 0.7);");
        expect(css).toContain("--modal-background: rgb(0 0 0 / 0.7);");
        // A footer on a see-through dialog doesn't stack a second see-through layer on it
        expect(css).toContain("--modal-footer-background: transparent;");
        expect(css).not.toContain("--modal-footer-background: rgb(");
    });
});

describe("the login screen", () => {
    test("is off by default, and old settings without it still load", () => {
        expect(normalizeWallpaper(undefined).login).toEqual({ show: false, boxOpacity: 85, blur: 12, hideArt: true });
        expect(normalizeWallpaper({ enabled: true, file: "a.png" }).login.show).toBe(false);
        expect(normalizeWallpaper({ login: { show: true } } as any).login).toEqual({ show: true, boxOpacity: 85, blur: 12, hideArt: true });
    });

    test("clamps and ignores junk", () => {
        expect(normalizeWallpaper({ login: { show: true, boxOpacity: 900, blur: -4, hideArt: false } } as any).login).toEqual({ show: true, boxOpacity: 100, blur: 0, hideArt: false });
        expect(normalizeWallpaper({ login: { show: "yes", boxOpacity: "x", blur: NaN } } as any).login).toEqual({ show: false, boxOpacity: 85, blur: 12, hideArt: true });
        expect(normalizeWallpaper({ login: 5 } as any).login.blur).toBe(12);
    });

    test("no login rules unless it's on and there's a file", () => {
        expect(buildWallpaperCss({ file: "a.png" })).not.toContain("backdrop-filter");
        expect(buildWallpaperCss({ login: { show: true } as any })).not.toContain("backdrop-filter");
        expect(buildWallpaperCss({ file: "a.png", login: { show: false } as any }, { inApp: false })).not.toContain("backdrop-filter");
    });

    test("a translucent, blurred box, and Discord's artwork hidden", () => {
        const css = buildWallpaperCss({ file: "a.png", login: { show: true, boxOpacity: 60, blur: 8, hideArt: true } });
        expect(css).toContain(`html ${LOGIN_BOX} {`);
        expect(css).toContain("var(--modal-background, rgb(49 51 56)) 60%, transparent)");
        expect(css).toContain("backdrop-filter: blur(8px);");
        expect(css).toContain(`html ${LOGIN_ART} {
    display: none !important;`);
        expect(buildWallpaperCss({ file: "a.png", login: { show: true, hideArt: false } as any })).not.toContain(LOGIN_ART);
        expect(buildWallpaperCss({ file: "a.png", login: { show: true, blur: 0 } as any })).toContain("backdrop-filter: none;");
    });

    test("with the in-app wallpaper off, only the login screen goes see-through", () => {
        const css = buildWallpaperCss({ file: "a.png", login: { show: true } as any }, { inApp: false });
        expect(css).toContain("html:has([class*=\"authBox_\"]) body");
        expect(css).toContain("#evi-wallpaper {\n    display: none;");
        expect(css).not.toContain(BASE_LAYER + ":is(");
        expect(css).not.toContain("--background-base-lower:");
    });
});

describe("Edit Image: zoom, position and rotation", () => {
    test("the picture covers the window, then zooms and moves across the room it has", () => {
        // 1000×500 picture in a 1000×1000 window: covered at 2x, 2000 wide, 1000 of room left and right
        expect(imageRect(1000, 1000, 1000, 500, { zoom: 100, x: 50, y: 50, rotation: 0 })).toEqual({ left: -500, top: 0, width: 2000, height: 1000 });
        expect(imageRect(1000, 1000, 1000, 500, { zoom: 100, x: 0, y: 50, rotation: 0 }).left).toBeCloseTo(0);
        expect(imageRect(1000, 1000, 1000, 500, { zoom: 100, x: 100, y: 50, rotation: 0 }).left).toBe(-1000);
        expect(imageRect(1000, 1000, 1000, 500, { zoom: 200, x: 50, y: 50, rotation: 0 })).toEqual({ left: -1500, top: -500, width: 4000, height: 2000 });
    });

    test("a quarter turn covers with the picture's sides swapped", () => {
        // Turned, the 1000×500 picture is 500×1000: a 1000×1000 window covers it at 2x, 1000×2000
        expect(imageRect(1000, 1000, 1000, 500, { zoom: 100, x: 50, y: 50, rotation: 90 })).toEqual({ left: 0, top: -500, width: 1000, height: 2000 });
    });

    test("the CSS zooms around the point and turns the picture, its position along its own axes", () => {
        const css = buildMediaCss("#w", { zoom: 150, x: 20, y: 80, rotation: 0, blur: 0 });
        expect(css).toContain("transform: scale(1.5);");
        expect(css).toContain("transform-origin: 20% 80%;");
        expect(css).toContain("object-fit: cover;");
        expect(css).toContain("object-position: 20% 80%;");
        expect(css).toContain("inline-size: 100cqw;");
        expect(css).toContain("rotate(0deg)");
        const turned = buildMediaCss("#w", { zoom: 100, x: 20, y: 80, rotation: 90, blur: 0 });
        expect(turned).toContain("inline-size: 100cqh;");
        expect(turned).toContain("block-size: 100cqw;");
        expect(turned).toContain("rotate(90deg)");
        expect(turned).toContain("object-position: 80% 80%;");
        expect(buildMediaCss("#w", { zoom: 100, x: 20, y: 80, rotation: 180, blur: 0 })).toContain("object-position: 80% 20%;");
        expect(buildMediaCss("#w", { zoom: 100, x: 20, y: 80, rotation: 270, blur: 0 })).toContain("object-position: 20% 20%;");
    });

    test("settings are kept in range, and only quarter turns", () => {
        const w = normalizeWallpaper({ file: "a.png", zoom: 9000, x: -5, y: 250, rotation: 45, panels: { chat: 140, frame: "x" } } as any);
        expect(w).toMatchObject({ zoom: 400, x: 0, y: 100, rotation: 0, behindSettings: false, behindPopouts: false, tint: "theme" });
        expect(w.panels).toEqual({ ...PANEL_DEFAULTS, chat: 100 });
        expect(normalizeWallpaper({ rotation: 270 } as any).rotation).toBe(270);
        // Settings from before Edit Image load as they were, minus the size choice
        expect(normalizeWallpaper({ file: "a.png", fit: "tile", zoom: 150 } as any)).not.toHaveProperty("fit");
    });
});

