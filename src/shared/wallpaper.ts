/**
 * Dynamic Wallpaper: an image or video behind Discord's panels. What's here is pure (settings,
 * file kinds, the CSS), shared by main, the renderer and the tests; main copies the file
 * (src/main/wallpaper.ts) and the renderer shows it (src/renderer/wallpaper.ts).
 *
 * Only Discord's main window turns see-through by default. Its settings and everything that floats
 * (popouts, menus, dialogs, the soundboard) keep solid colours unless the user asks for them too.
 */

export type WallpaperKind = "image" | "video";
/** What the see-through panels are tinted with: the theme's own colours, or plain black (white on light) */
export type WallpaperTint = "theme" | "neutral";

/** Quarter turns, clockwise */
export type WallpaperRotation = 0 | 90 | 180 | 270;
export const WALLPAPER_ROTATIONS: readonly WallpaperRotation[] = [0, 90, 180, 270];

/** How solid each part of Discord stays over the wallpaper, in %: 0 is fully see-through */
export interface WallpaperPanels {
    /** The server list, the title bar and the window's frame */
    frame: number;
    /** The channel list, the member list and profile panels */
    sidebars: number;
    chat: number;
    /** The message box */
    input: number;
    /** Popouts, menus and dialogs, when `behindPopouts` is on */
    popouts: number;
}
export type WallpaperPanel = keyof WallpaperPanels;
export const WALLPAPER_PANELS: readonly WallpaperPanel[] = ["frame", "sidebars", "chat", "input", "popouts"];

/** The logged-out screen (login, register, switching accounts) */
export interface WallpaperLogin {
    /** Your wallpaper behind it instead of Discord's artwork, even while the in-app wallpaper is off */
    show: boolean;
    /** How solid the login box stays, in % */
    boxOpacity: number;
    /** Frosted-glass blur behind the login box, px */
    blur: number;
    /** Discord's illustrations are hidden */
    hideArt: boolean;
}

export interface WallpaperSettings {
    enabled: boolean;
    /** File name inside <Evi data dir>/wallpaper, as main copied it there */
    file?: string;
    kind?: WallpaperKind;
    /**
     * Like Discord's Edit Image: the picture always covers the window, then zooms (%, 100 just
     * covers it), sits at x/y (% of the room it has to move, 50/50 is centred) and turns.
     */
    zoom: number;
    /** Where the picture sits, in % of the room it has to move: 50/50 is centred */
    x: number;
    y: number;
    rotation: WallpaperRotation;
    /** How dark the layer over it is, in %, so text stays readable */
    dim: number;
    /** px */
    blur: number;
    panels: WallpaperPanels;
    /** Discord's settings show the wallpaper too */
    behindSettings: boolean;
    /** Popouts, menus and dialogs show it too, at `panels.popouts` */
    behindPopouts: boolean;
    tint: WallpaperTint;
    pauseOnBattery: boolean;
    login: WallpaperLogin;
}

export const DIM_MIN = 0;
export const DIM_MAX = 90;
export const DIM_STEP = 5;
export const BLUR_MIN = 0;
export const BLUR_MAX = 20;
export const ZOOM_MIN = 100;
export const ZOOM_MAX = 400;
export const PANEL_MIN = 0;
export const PANEL_MAX = 100;

export const LOGIN_BLUR_MAX = 20;
export const LOGIN_DEFAULTS: WallpaperLogin = { show: false, boxOpacity: 85, blur: 12, hideArt: true };

export const PANEL_DEFAULTS: WallpaperPanels = { frame: 35, sidebars: 25, chat: 12, input: 50, popouts: 85 };

export const WALLPAPER_DEFAULTS: WallpaperSettings = {
    enabled: false,
    zoom: 100,
    x: 50,
    y: 50,
    rotation: 0,
    dim: 40,
    blur: 0,
    panels: PANEL_DEFAULTS,
    behindSettings: false,
    behindPopouts: false,
    tint: "theme",
    pauseOnBattery: true,
    login: LOGIN_DEFAULTS,
};

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
    const kind = file ? wallpaperKind(file) : undefined;
    const p = w.panels && typeof w.panels === "object" ? w.panels : {} as Partial<WallpaperPanels>;
    const panels = Object.fromEntries(WALLPAPER_PANELS.map(k => [k, clamp(p[k], PANEL_MIN, PANEL_MAX, PANEL_DEFAULTS[k])])) as unknown as WallpaperPanels;
    const l = w.login && typeof w.login === "object" ? w.login : {} as Partial<WallpaperLogin>;
    const login: WallpaperLogin = {
        show: l.show === true,
        boxOpacity: clamp(l.boxOpacity, PANEL_MIN, PANEL_MAX, LOGIN_DEFAULTS.boxOpacity),
        blur: clamp(l.blur, 0, LOGIN_BLUR_MAX, LOGIN_DEFAULTS.blur),
        hideArt: l.hideArt !== false,
    };
    return {
        enabled: w.enabled === true,
        file,
        kind,
        zoom: clamp(w.zoom, ZOOM_MIN, ZOOM_MAX, WALLPAPER_DEFAULTS.zoom),
        x: clamp(w.x, 0, 100, WALLPAPER_DEFAULTS.x),
        y: clamp(w.y, 0, 100, WALLPAPER_DEFAULTS.y),
        rotation: WALLPAPER_ROTATIONS.includes(w.rotation as WallpaperRotation) ? w.rotation as WallpaperRotation : 0,
        dim: clamp(w.dim, DIM_MIN, DIM_MAX, WALLPAPER_DEFAULTS.dim),
        blur: clamp(w.blur, BLUR_MIN, BLUR_MAX, WALLPAPER_DEFAULTS.blur),
        panels,
        behindSettings: w.behindSettings === true,
        behindPopouts: w.behindPopouts === true,
        tint: w.tint === "neutral" ? "neutral" : "theme",
        pauseOnBattery: w.pauseOnBattery !== false,
        login,
    };
}

export const WALLPAPER_LAYER_ID = "evi-wallpaper";

type Look = Pick<WallpaperSettings, "zoom" | "x" | "y" | "rotation">;

/**
 * Where the picture lands in a `width` × `height` window, as the box it covers once turned: it
 * covers the window, grows by the zoom around its x/y point, and its edge sits x% of the way across
 * the room it has to move. The editor draws it from this; buildMediaCss gets the same with CSS.
 */
export function imageRect(width: number, height: number, naturalWidth: number, naturalHeight: number, look: Look) {
    const turned = look.rotation % 180 !== 0;
    const nw = turned ? naturalHeight : naturalWidth;
    const nh = turned ? naturalWidth : naturalHeight;
    const cover = Math.max(width / nw, height / nh);
    const zoom = clamp(look.zoom, ZOOM_MIN, ZOOM_MAX, 100) / 100;
    const w = nw * cover * zoom, h = nh * cover * zoom;
    return { left: (look.x / 100) * (width - w), top: (look.y / 100) * (height - h), width: w, height: h };
}

/** Where x/y land along the picture's own axes once it's turned: object-position works before the turn */
function ownAxes({ x, y, rotation }: Look): [number, number] {
    if (rotation === 90) return [y, 100 - x];
    if (rotation === 180) return [100 - x, 100 - y];
    if (rotation === 270) return [100 - y, x];
    return [x, y];
}

/**
 * The picture's rules under `scope` (a selector for its box, the window's layer): a zoom box the
 * size of the window, and in it the picture covering it, turned about its middle. `scale` is a
 * preview's size over the window's, so blur reads the same in both.
 */
export function buildMediaCss(scope: string, look: Look & Pick<WallpaperSettings, "blur">, scale = 1) {
    const zoom = clamp(look.zoom, ZOOM_MIN, ZOOM_MAX, 100) / 100;
    const x = clamp(look.x, 0, 100, 50);
    const y = clamp(look.y, 0, 100, 50);
    const rotation = WALLPAPER_ROTATIONS.includes(look.rotation) ? look.rotation : 0;
    const blur = clamp(look.blur, BLUR_MIN, BLUR_MAX, 0) * scale;
    // Blur pulls in transparent edges: bleed past them
    const bleed = blur * 2;
    const turned = rotation % 180 !== 0;
    const [ox, oy] = ownAxes({ x, y, zoom: look.zoom, rotation });
    return `${scope} > .evi-wallpaper-zoom {
    position: absolute;
    inset-block-start: ${-bleed}px;
    inset-inline-start: ${-bleed}px;
    inline-size: calc(100% + ${bleed * 2}px);
    block-size: calc(100% + ${bleed * 2}px);
    container-type: size;
    transform: scale(${zoom});
    transform-origin: ${x}% ${y}%;
    filter: ${blur ? `blur(${blur}px)` : "none"};
}
/* Centred and turned, which is physical, so left and top rather than logical insets */
${scope} > .evi-wallpaper-zoom > .evi-wallpaper-media {
    position: absolute;
    left: 50%;
    top: 50%;
    inline-size: ${turned ? "100cqh" : "100cqw"};
    block-size: ${turned ? "100cqw" : "100cqh"};
    object-fit: cover;
    object-position: ${ox}% ${oy}%;
    transform: translate(-50%, -50%) rotate(${rotation}deg);
}
`;
}

const DARK = ":is(.theme-dark, .theme-darker, .theme-midnight)";
const LIGHT = ".theme-light";
/**
 * An id nothing has: `:not(#…)` adds an id's worth of specificity, so these win over every theme
 * (and Discord's own `.theme-dark` rules on nested elements) without !important on each variable.
 */
const WIN = ":not(#evi-wallpaper-none)";

/** Discord's main window, its other full-screen layers (settings), and where popouts and dialogs go */
export const BASE_LAYER = '[class*="baseLayer_"]';
export const SETTINGS_LAYER = '[class*="layers_"] > [class*="layer_"]:not([class*="baseLayer_"])';
export const POPOUT_LAYER = '[class*="layerContainer_"]';

/** The login box, and Discord's illustrations behind it. The box's class is on the logged-out screen only */
export const LOGIN_BOX = '[class*="authBox_"]';
export const LOGIN_ART = '[class*="characterBackground_"] > [class*="artwork_"]';
/** True on the logged-out screen (login, register, account switching) */
const ON_LOGIN = `html:has(${LOGIN_BOX})`;

/** The login box over the wallpaper: translucent, with the backdrop blurred, and Discord's artwork out of the way */
function loginCss(w: WallpaperSettings) {
    const { boxOpacity, blur, hideArt } = w.login;
    const box = `color-mix(in srgb, var(--modal-background, rgb(49 51 56)) ${boxOpacity}%, transparent)`;
    return `
html ${LOGIN_BOX} {
    background: ${box} !important;
    -webkit-backdrop-filter: ${blur ? `blur(${blur}px)` : "none"};
    backdrop-filter: ${blur ? `blur(${blur}px)` : "none"};
}
${hideArt ? `
html ${LOGIN_ART} {
    display: none !important;
}
` : ""}`;
}

/** Discord's colours for each part of its window */
const PANEL_VARS: Record<Exclude<WallpaperPanel, "popouts">, string[]> = {
    frame: ["--background-base-lowest", "--app-frame-background", "--background-tertiary", "--background-secondary-alt"],
    // The member list paints with its own variable
    sidebars: ["--background-base-low", "--background-secondary", "--custom-channel-members-bg"],
    chat: ["--background-base-lower", "--background-primary", "--chat-background"],
    // The message box has to stand out from the chat behind it
    input: ["--chat-background-default", "--channeltextarea-background"],
};

/** What popouts, menus and dialogs paint with */
const POPOUT_VARS = [
    ...PANEL_VARS.frame, ...PANEL_VARS.sidebars, ...PANEL_VARS.chat,
    "--background-floating", "--background-surface-high", "--background-surface-higher", "--background-surface-highest",
    "--modal-background", "--modal-footer-background", "--card-primary-bg",
];

/** Nitro colour themes paint these over everything; each use falls back to a --background-base-* colour */
const GRADIENTS = ["lowest", "lower", "low", "high", "higher", "highest", "chat", "chat-preview", "app-frame"].map(g => `--background-gradient-${g}`);

/** Discord's colour for `v` as the page root has it, saved before the panels override it */
const saved = (v: string) => `--evi-wp${v.slice(1)}`;
const SAVED_VARS = [...new Set([...POPOUT_VARS, ...PANEL_VARS.input])];

/**
 * `v` at `percent` % solid. Tinted by the theme, it's Discord's (or the theme's) own colour made
 * see-through; neutral, plain black on dark and white on light.
 */
function see(v: string, percent: number, tint: WallpaperTint, dark: boolean) {
    const base = dark ? "0 0 0" : "255 255 255";
    if (tint === "neutral") return `    ${v}: rgb(${base} / ${Math.round(percent) / 100});`;
    return `    ${v}: color-mix(in srgb, var(${saved(v)}, rgb(${base})) ${Math.round(percent)}%, transparent);`;
}

function windowVars(dark: boolean, w: WallpaperSettings) {
    return Object.entries(PANEL_VARS).flatMap(([panel, vars]) =>
        vars.map(v => see(v, w.panels[panel as keyof typeof PANEL_VARS], w.tint, dark))).join("\n");
}

function popoutVars(dark: boolean, w: WallpaperSettings) {
    return POPOUT_VARS.map(v => see(v, w.panels.popouts, w.tint, dark)).join("\n");
}

/** `scope` and every element under it that sets Discord's theme again */
const themed = (scope: string, theme: string) => `${scope}:is(${theme} *)${WIN},
${scope} ${theme}${WIN}`;

/** What sits between the page and the main window (or the login screen), painted by Discord */
const TRANSPARENT = [
    "html", "body", "#app-mount",
    '#app-mount [class*="appAsidePanelWrapper_"]',
    '#app-mount [class*="notAppAsidePanel_"]',
    '#app-mount :is([class^="app_"], [class*=" app_"])',
    '#app-mount [class*="layers_"]',
    // Discord's backdrop behind every layer: a sibling of them, with its own theme class
    '#app-mount :is([class^="app_"], [class*=" app_"]) > :is([class^="bg_"], [class*=" bg_"])',
    BASE_LAYER,
];

/** The wallpaper layer's own look: the picture, and the dim over it */
function layerCss(w: WallpaperSettings) {
    const dim = w.dim / 100;
    return `#${WALLPAPER_LAYER_ID} {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background: #000;
}

${buildMediaCss(`#${WALLPAPER_LAYER_ID}`, w)}
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
`;
}

/**
 * The stylesheet while a wallpaper shows: the layer's own look, and Discord's background colours
 * swapped for see-through tints (black on dark appearances, white on light) in the parts the user
 * chose, so the wallpaper shows through wherever Discord would paint them. Everything between the
 * page and the main window goes transparent; the layer sits under #app-mount.
 */
export function buildWallpaperCss(settings: Partial<WallpaperSettings>, { inApp = true }: { inApp?: boolean; } = {}) {
    const w = normalizeWallpaper({ ...settings, file: undefined });
    const login = w.login.show && normalizeWallpaper(settings).file ? loginCss(w) : "";
    // Only the login screen shows the wallpaper: the app itself keeps every colour it has
    if (!inApp) return `${TRANSPARENT.map(s => s === "html" ? ON_LOGIN : `${ON_LOGIN} ${s}`).join(",\n")} {
    background: transparent !important;
}

#${WALLPAPER_LAYER_ID} {
    display: none;
}

${ON_LOGIN} #${WALLPAPER_LAYER_ID} {
    display: block;
}

${layerCss(w)}${login}`;
    const scopes = [BASE_LAYER, ...w.behindSettings ? [SETTINGS_LAYER] : []];
    const windows = (theme: string) => scopes.map(s => themed(s, theme)).join(",\n");
    const popouts = (theme: string) => themed(POPOUT_LAYER, theme);

    return `${TRANSPARENT.join(", ")} {
    background: transparent !important;
}

${layerCss(w)}
${w.tint === "theme" ? `html${WIN} {
${SAVED_VARS.map(v => `    ${saved(v)}: var(${v});`).join("\n")}
}

` : ""}${windows(DARK)} {
${windowVars(true, w)}
}

${windows(LIGHT)} {
${windowVars(false, w)}
}
${w.behindPopouts ? `
${popouts(DARK)} {
${popoutVars(true, w)}
}

${popouts(LIGHT)} {
${popoutVars(false, w)}
}
` : ""}
/* Evi's own settings float over Discord: they keep solid colours, from the surfaces left alone */
.dl-root${WIN} {
    --dl-bg-panel: var(--dl-bg-modal);
    --dl-bg-sidebar: var(--background-surface-higher, var(--dl-bg-modal));
}

:is(${[...scopes, ...w.behindPopouts ? [POPOUT_LAYER] : []].join(", ")}):is(${DARK} *, ${LIGHT} *)${WIN},
:is(${[...scopes, ...w.behindPopouts ? [POPOUT_LAYER] : []].join(", ")}) :is(${DARK}, ${LIGHT}, .custom-theme-background)${WIN} {
${GRADIENTS.map(g => `    ${g}: initial;`).join("\n")}
}
${login}`;
}
