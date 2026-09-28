import { describe, expect, test } from "bun:test";

import { buildWallpaperCss, MAX_WALLPAPER_BYTES, normalizeWallpaper, WALLPAPER_DEFAULTS, WALLPAPER_EXTENSIONS, wallpaperKind, wallpaperMime } from "../src/shared/wallpaper";

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
        expect(WALLPAPER_DEFAULTS).toMatchObject({ dim: 60, blur: 0, pauseOnBattery: true, enabled: false });
    });

    test("numbers are kept in range and rounded", () => {
        expect(normalizeWallpaper({ dim: 150, blur: -3 } as any)).toMatchObject({ dim: 90, blur: 0 });
        expect(normalizeWallpaper({ dim: 42.6, blur: 7.2 } as any)).toMatchObject({ dim: 43, blur: 7 });
        expect(normalizeWallpaper({ dim: NaN, blur: "5" } as any)).toMatchObject({ dim: 60, blur: 0 });
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

    test("makes Discord's backgrounds see-through, winning over themes, and leaves popouts alone", () => {
        const css = buildWallpaperCss({ dim: 60, blur: 0 });
        for (const v of ["--background-base-lowest", "--background-base-lower", "--background-base-low", "--background-primary", "--background-secondary", "--background-tertiary", "--chat-background"]) {
            expect(css).toMatch(new RegExp(`${v}: rgb\\(0 0 0 / 0\\.\\d+\\);`));
        }
        expect(css).toContain(":is(.theme-dark, .theme-darker, .theme-midnight):not(#evi-wallpaper-none) {");
        expect(css).toContain("background: transparent !important;");
        expect(css).toContain("--background-gradient-chat: initial;");
        expect(css).not.toContain("--background-surface-high:");
        expect(css).not.toContain("--modal-background:");
    });
});
