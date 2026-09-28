/**
 * Dynamic Wallpaper: an image or video behind Discord's panels. What's here is pure (settings,
 * file kinds, the CSS), shared by main, the renderer and the tests; main copies the file
 * (src/main/wallpaper.ts) and the renderer shows it (src/renderer/wallpaper.ts).
 */

export type WallpaperKind = "image" | "video";

export interface WallpaperSettings {
    enabled: boolean;
    /** File name inside <Evi data dir>/wallpaper, as main copied it there */
    file?: string;
    kind?: WallpaperKind;
    /** How dark the layer over it is, in %, so text stays readable */
    dim: number;
    /** px */
    blur: number;
    pauseOnBattery: boolean;
}

export const DIM_MIN = 0;
export const DIM_MAX = 90;
export const DIM_STEP = 5;
export const BLUR_MIN = 0;
export const BLUR_MAX = 20;

export const WALLPAPER_DEFAULTS: WallpaperSettings = { enabled: false, dim: 60, blur: 0, pauseOnBattery: true };

const MIME: Record<string, { kind: WallpaperKind; mime: string; }> = {
    png: { kind: "image", mime: "image/png" },
    jpg: { kind: "image", mime: "image/jpeg" },
    jpeg: { kind: "image", mime: "image/jpeg" },
    webp: { kind: "image", mime: "image/webp" },
    gif: { kind: "image", mime: "image/gif" },
    mp4: { kind: "video", mime: "video/mp4" },
    webm: { kind: "video", mime: "video/webm" },
};

export const WALLPAPER_EXTENSIONS = Object.keys(MIME);

/** Videos are bigger, but the whole file goes through IPC into the page's memory: keep both sane */
export const MAX_WALLPAPER_BYTES: Record<WallpaperKind, number> = { image: 30 * 1024 * 1024, video: 200 * 1024 * 1024 };

export const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

/** What a file is by its extension, or undefined for anything Evi doesn't show */
export const wallpaperKind = (name: string): WallpaperKind | undefined => MIME[extensionOf(name)]?.kind;
export const wallpaperMime = (name: string): string | undefined => MIME[extensionOf(name)]?.mime;

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** Settings as saved (maybe missing, maybe hand-edited) with defaults filled in and numbers in range */
export function normalizeWallpaper(raw: Partial<WallpaperSettings> | undefined): WallpaperSettings {
    const w = raw && typeof raw === "object" ? raw : {};
    const file = typeof w.file === "string" && wallpaperKind(w.file) ? w.file : undefined;
    return {
        enabled: w.enabled === true,
        file,
        kind: file ? wallpaperKind(file) : undefined,
        dim: clamp(w.dim, DIM_MIN, DIM_MAX, WALLPAPER_DEFAULTS.dim),
        blur: clamp(w.blur, BLUR_MIN, BLUR_MAX, WALLPAPER_DEFAULTS.blur),
        pauseOnBattery: w.pauseOnBattery !== false,
    };
}

export const WALLPAPER_LAYER_ID = "evi-wallpaper";

const DARK = ":is(.theme-dark, .theme-darker, .theme-midnight)";
const LIGHT = ".theme-light";
/**
 * An id nothing has: `:not(#…)` adds an id's worth of specificity, so these win over every theme
 * (and Discord's own `.theme-dark` rules on nested popouts) without !important on each variable.
 */
const WIN = ":not(#evi-wallpaper-none)";

/**
 * How much of each surface stays painted over the wallpaper, 0 to 1. The frame and sidebars keep
 * more than the chat so the layout still reads; popouts, menus and modals aren't touched at all.
 */
const SURFACES: [vars: string[], alpha: number][] = [
    [["--background-base-lowest", "--app-frame-background", "--background-tertiary"], 0.35],
    [["--background-base-low", "--background-secondary"], 0.25],
    [["--background-base-lower", "--background-primary", "--chat-background"], 0.12],
    [["--background-secondary-alt"], 0.35],
    // The message box has to stand out from the chat behind it
    [["--chat-background-default", "--channeltextarea-background"], 0.5],
];

/** Nitro colour themes paint these over everything; each use falls back to a --background-base-* colour */
const GRADIENTS = ["lowest", "lower", "low", "high", "higher", "highest", "chat", "chat-preview", "app-frame"].map(g => `--background-gradient-${g}`);

function surfaces(rgb: string) {
    return SURFACES.flatMap(([vars, alpha]) => vars.map(v => `    ${v}: rgb(${rgb} / ${alpha});`)).join("\n");
}

/**
 * The stylesheet while a wallpaper shows: the layer's own look, and Discord's background colours
 * swapped for see-through tints (black on dark appearances, white on light), so the wallpaper shows
 * through wherever Discord would paint a panel. Page backgrounds go transparent too, the layer sits
 * under #app-mount.
 */
export function buildWallpaperCss(settings: Pick<WallpaperSettings, "dim" | "blur">) {
    const dim = clamp(settings.dim, DIM_MIN, DIM_MAX, WALLPAPER_DEFAULTS.dim) / 100;
    const blur = clamp(settings.blur, BLUR_MIN, BLUR_MAX, WALLPAPER_DEFAULTS.blur);
    return `html, body, #app-mount {
    background: transparent !important;
}

#${WALLPAPER_LAYER_ID} {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background: #000;
}

#${WALLPAPER_LAYER_ID} > .evi-wallpaper-media {
    position: absolute;
    /* Blur pulls in transparent edges: bleed past them. Media needs a size, inset alone doesn't stretch it */
    inset-block-start: ${-blur * 2}px;
    inset-inline-start: ${-blur * 2}px;
    inline-size: calc(100% + ${blur * 4}px);
    block-size: calc(100% + ${blur * 4}px);
    object-fit: cover;
    filter: ${blur ? `blur(${blur}px)` : "none"};
}

#${WALLPAPER_LAYER_ID} > .evi-wallpaper-dim {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / ${dim});
}

html${LIGHT} #${WALLPAPER_LAYER_ID} {
    background: #fff;
}

html${LIGHT} #${WALLPAPER_LAYER_ID} > .evi-wallpaper-dim {
    background: rgb(255 255 255 / ${dim});
}

${DARK}${WIN} {
${surfaces("0 0 0")}
}

${LIGHT}${WIN} {
${surfaces("255 255 255")}
}

/* Evi's own settings float over Discord: they keep solid colours, from the surfaces left alone */
.dl-root${WIN} {
    --dl-bg-panel: var(--dl-bg-modal);
    --dl-bg-sidebar: var(--background-surface-higher, var(--dl-bg-modal));
}

:is(${DARK}, ${LIGHT})${WIN},
.custom-theme-background${WIN} {
${GRADIENTS.map(g => `    ${g}: initial;`).join("\n")}
}
`;
}
