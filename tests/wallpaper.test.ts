import { describe, expect, test } from "bun:test";

import {
    BASE_LAYER, buildMediaCss, buildWallpaperCss, fitsFor, MAX_WALLPAPER_BYTES, NATURAL_WIDTH_VAR, normalizeWallpaper, PANEL_DEFAULTS, POPOUT_LAYER, SETTINGS_LAYER,
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

    test("settings and popouts only when asked, popouts at their own amount", () => {
        const css = buildWallpaperCss({ tint: "neutral", behindSettings: true, behindPopouts: true, panels: { popouts: 70 } as any });
        expect(css).toContain(`${SETTINGS_LAYER}:is(`);
        expect(css).toContain(`${POPOUT_LAYER}:is(`);
        expect(css).toContain("--background-surface-high: rgb(0 0 0 / 0.7);");
        expect(css).toContain("--modal-background: rgb(0 0 0 / 0.7);");
    });
});

describe("size and position", () => {
    test("fill, fit and stretch move and zoom the picture around its focal point", () => {
        const css = buildMediaCss("#w", { fit: "fill", zoom: 150, x: 20, y: 80, blur: 0 });
        expect(css).toContain("object-fit: cover;");
        expect(css).toContain("object-position: 20% 80%;");
        expect(css).toContain("transform: scale(1.5);");
        expect(css).toContain("transform-origin: 20% 80%;");
        expect(css).toContain("#w > .evi-wallpaper-tile { display: none; }");
        expect(buildMediaCss("#w", { fit: "fit", zoom: 100, x: 50, y: 50, blur: 0 })).toContain("object-fit: contain;");
        expect(buildMediaCss("#w", { fit: "stretch", zoom: 100, x: 50, y: 50, blur: 0 })).toContain("object-fit: fill;");
    });

    test("center and tile keep the image's own pixels, scaled down with a preview", () => {
        const tile = buildMediaCss("#w", { fit: "tile", zoom: 200, x: 0, y: 0, blur: 0 }, 0.25);
        expect(tile).toContain("#w > .evi-wallpaper-media { display: none; }");
        expect(tile).toContain("background-repeat: repeat;");
        expect(tile).toContain(`background-size: calc(var(${NATURAL_WIDTH_VAR}, 512px) * 0.5) auto;`);
        expect(buildMediaCss("#w", { fit: "center", zoom: 100, x: 50, y: 50, blur: 0 })).toContain("background-repeat: no-repeat;");
    });

    test("a fitted or centred picture gets the blurred copy behind it", () => {
        expect(buildMediaCss("#w", { fit: "fit", zoom: 100, x: 50, y: 50, blur: 0 })).toMatch(/\.evi-wallpaper-backdrop \{\n {4}display: block;/);
        expect(buildMediaCss("#w", { fit: "fill", zoom: 100, x: 50, y: 50, blur: 0 })).toMatch(/\.evi-wallpaper-backdrop \{\n {4}display: none;/);
    });

    test("settings are kept in range, and a video can't tile or centre", () => {
        const w = normalizeWallpaper({ file: "a.png", fit: "tile", zoom: 9000, x: -5, y: 250, panels: { chat: 140, frame: "x" } } as any);
        expect(w).toMatchObject({ fit: "tile", zoom: 400, x: 0, y: 100, behindSettings: false, behindPopouts: false, tint: "theme" });
        expect(w.panels).toEqual({ ...PANEL_DEFAULTS, chat: 100 });
        expect(normalizeWallpaper({ file: "a.mp4", fit: "tile" } as any).fit).toBe("fill");
        expect(normalizeWallpaper({ file: "a.mp4", fit: "center" } as any).fit).toBe("fill");
        expect(fitsFor("video")).toEqual(["fill", "fit", "stretch"]);
        expect(normalizeWallpaper({ fit: "sideways" } as any).fit).toBe("fill");
    });
});
