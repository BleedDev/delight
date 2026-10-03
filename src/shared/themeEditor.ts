/**
 * The theme editor's model: a handful of colours, corners and a font, turned into a theme file and
 * read back out of one. Shared by the renderer (the editor and its live preview) and the tests;
 * nothing here touches the page or the disk.
 *
 * A colour sets every Discord variable that plays its part (the new names and the ones older builds
 * still read), and the in-between shades Discord derives from it are mixed from it, so a theme stays
 * consistent without a picker per variable. Reading a theme back takes the first value it sets for
 * each colour's main variable, so it also works on themes the editor didn't write (Midnight becomes a
 * starting point); anything it can't read keeps the preset's colour.
 */
import type { PluginLocales } from "./pluginLocales";
import { isPluginId } from "./store";
import { parseThemeMeta } from "./themes";

/** Which of Discord's appearances a theme styles: its dark modes (Dark, Onyx, Midnight) or light */
export type ThemeBase = "dark" | "light";

export const COLOR_KEYS = ["frame", "chat", "panel", "popout", "input", "text", "strong", "muted", "icon", "accent", "link", "mention", "highlight"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** How the editor lists them */
export const COLOR_GROUPS: readonly { id: "backgrounds" | "text" | "accents"; keys: readonly ColorKey[]; }[] = [
    { id: "backgrounds", keys: ["frame", "chat", "panel", "popout", "input"] },
    { id: "text", keys: ["text", "strong", "muted", "icon"] },
    { id: "accents", keys: ["accent", "link", "mention", "highlight"] },
];

export interface ThemeDraft {
    name: string;
    description: string;
    author: string;
    version: string;
    base: ThemeBase;
    colors: Record<ColorKey, string>;
    /** Corner roundness as a percentage of Discord's own: 0 is square, 100 leaves them alone */
    radius: number;
    /** A font installed on the computer, tried before Discord's; empty for Discord's own */
    font: string;
    /** Anything else, added after the colours as it is */
    extraCss: string;
    /** The name and description in other languages, from `@name:de` tags; kept as they were */
    locales?: PluginLocales;
}

/** Discord's own colours, measured from its stylesheet (Dark, and Light), so a blank theme starts as Discord looks */
export const PRESETS: Record<ThemeBase, Record<ColorKey, string>> = {
    dark: {
        frame: "#2c2d32", chat: "#323339", panel: "#36373e", popout: "#393a41", input: "#393a41",
        text: "#f3f3f4", strong: "#ffffff", muted: "#abacb2", icon: "#c5c6ca",
        accent: "#5865f2", link: "#76aff6", mention: "#5865f2", highlight: "#f8a300",
    },
    light: {
        frame: "#f3f3f4", chat: "#fbfbfb", panel: "#fbfbfb", popout: "#ffffff", input: "#ffffff",
        text: "#2e2e34", strong: "#28282d", muted: "#6c6d76", icon: "#595a63",
        accent: "#5865f2", link: "#006dd4", mention: "#5865f2", highlight: "#f8a300",
    },
};

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 200;
export const RADIUS_STEP = 25;
const MAX_FONT = 64;

/** Discord's corner radius steps, in px at 100% */
const RADII = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** The element classes Discord puts its appearance on: on <html>, and again on some popouts */
const SELECTORS: Record<ThemeBase, readonly string[]> = {
    dark: [".theme-dark", ".theme-darker", ".theme-midnight"],
    light: [".theme-light"],
};

/** Marks where the editor's part of a file ends; what follows is the theme's own extra CSS */
const EXTRA_MARKER = "/* Extra CSS */";
const EDITOR_NOTE = "/* Made with Evi's theme editor. ";

export function blankDraft(base: ThemeBase, author = ""): ThemeDraft {
    return { name: "", description: "", author, version: "1.0.0", base, colors: { ...PRESETS[base] }, radius: 100, font: "", extraCss: "" };
}

/** #rgb, #rrggbb, #rrggbbaa (alpha dropped) and rgb()/rgba() as #rrggbb, or undefined */
export function toHex(raw: string): string | undefined {
    const value = raw.trim().toLowerCase();
    const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    const long = value.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
    if (long) return `#${long[1]}`;
    const rgb = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\b/);
    if (rgb) {
        const parts = rgb.slice(1, 4).map(Number);
        if (parts.every(n => n <= 255)) return `#${parts.map(n => n.toString(16).padStart(2, "0")).join("")}`;
    }
}

/**
 * WCAG contrast ratio of two #rrggbb colours, 1 to 21. The editor warns under 4.5 for text on the
 * background it mostly sits on.
 */
export function contrast(a: string, b: string) {
    const lum = (hex: string) => {
        const [r, g, bl] = [1, 3, 5].map(i => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const mix = (color: string, percent: number, other: string) => `color-mix(in oklab, ${color} ${percent}%, ${other})`;
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** A header value on one line, with nothing that would end the comment or start another tag */
const headerValue = (value: string) => value.replace(/\*\//g, "").replace(/\s+/g, " ").replace(/(^|\s)@(?=\w)/g, "$1").trim();

/** Font family names only: letters, digits, spaces and dashes, so a font can't close the declaration */
export const cleanFont = (font: string) => font.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_FONT);

const clampRadius = (radius: number) => Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round((Number.isFinite(radius) ? radius : 100) / RADIUS_STEP) * RADIUS_STEP));

/** The variables each part of the theme sets, grouped and commented the way the file shows them */
function sections(d: ThemeDraft): [title: string, decls: [string, string][]][] {
    const c = d.colors;
    // Lighter on dark, darker on light: for accents used as text
    const toward = d.base === "dark" ? "#ffffff" : "#000000";
    const out: [string, [string, string][]][] = [
        ["Backgrounds", [
            ["--background-base-lowest", c.frame],
            ["--app-frame-background", c.frame],
            ["--background-base-lower", c.chat],
            ["--background-base-low", c.panel],
            ["--background-surface-high", c.popout],
            ["--background-surface-higher", mix(c.popout, 96, c.strong)],
            ["--background-surface-highest", mix(c.popout, 92, c.strong)],
            ["--modal-background", c.popout],
            ["--modal-footer-background", c.popout],
            ["--chat-background-default", c.input],
            ["--channeltextarea-background", c.input],
            ["--scrollbar-auto-thumb", mix(c.muted, 40, c.chat)],
            ["--scrollbar-thin-thumb", mix(c.muted, 40, c.chat)],
        ]],
        ["Names older Discord builds use for the same surfaces", [
            ["--background-tertiary", c.frame],
            ["--background-primary", c.chat],
            ["--chat-background", c.chat],
            ["--background-secondary", c.panel],
            ["--background-secondary-alt", c.popout],
            ["--background-floating", c.popout],
        ]],
        ["Text", [
            ["--text-default", c.text],
            ["--text-normal", c.text],
            ["--input-text-default", c.text],
            ["--text-strong", c.strong],
            ["--header-primary", c.strong],
            ["--interactive-text-hover", c.strong],
            ["--interactive-text-active", c.strong],
            ["--text-subtle", mix(c.text, 50, c.muted)],
            ["--interactive-text-default", mix(c.text, 50, c.muted)],
            ["--text-muted", c.muted],
            ["--header-secondary", c.muted],
            ["--chat-text-muted", c.muted],
            ["--channels-default", c.muted],
            ["--input-placeholder-text-default", c.muted],
        ]],
        ["Icons", [
            ["--icon-default", c.icon],
            ["--icon-subtle", c.icon],
            ["--interactive-icon-default", c.icon],
            ["--interactive-normal", c.icon],
            ["--input-icon-default", c.icon],
            ["--icon-strong", c.strong],
            ["--interactive-icon-hover", c.strong],
            ["--interactive-icon-active", c.strong],
            ["--interactive-hover", c.strong],
            ["--interactive-active", c.strong],
            ["--icon-muted", c.muted],
            ["--interactive-muted", mix(c.muted, 60, c.chat)],
        ]],
        ["Accent: buttons, switches, unread pills", [
            ["--control-primary-background-default", c.accent],
            ["--control-primary-background-hover", mix(c.accent, 88, "#000000")],
            ["--control-primary-background-active", mix(c.accent, 76, "#000000")],
            ["--background-brand", c.accent],
            ["--badge-background-brand", c.accent],
            ["--interactive-accent-background-hover", c.accent],
            ["--interactive-accent-background-selected", c.accent],
            ["--input-border-active", c.accent],
            ["--brand-500", c.accent],
            ["--brand-560", mix(c.accent, 88, "#000000")],
            ["--brand-360", mix(c.accent, 70, toward)],
            ["--control-brand-foreground", mix(c.accent, 70, toward)],
            ["--control-brand-foreground-new", mix(c.accent, 70, toward)],
            ["--text-brand", mix(c.accent, 70, toward)],
            ["--icon-brand", mix(c.accent, 70, toward)],
        ]],
        ["Links and mentions", [
            ["--text-link", c.link],
            ["--icon-link", c.link],
            ["--mention-background", tint(c.mention, 24)],
            ["--mention-foreground", mix(c.mention, 45, c.strong)],
            ["--message-mentioned-background-default", tint(c.highlight, 10)],
            ["--message-mentioned-background-hover", tint(c.highlight, 6)],
            ["--background-mentioned", tint(c.highlight, 10)],
            ["--background-mentioned-hover", tint(c.highlight, 6)],
            ["--info-warning-foreground", c.highlight],
        ]],
    ];
    const radius = clampRadius(d.radius);
    if (radius !== 100) {
        out.push([`Corners, ${radius}% of Discord's`, Object.entries(RADII).map(([step, px]) => [`--radius-${step}`, `${Math.round(px * radius / 100)}px`])]);
    }
    const font = cleanFont(d.font);
    if (font) out.push(["Font", [["--font-primary", `"${font}", "gg sans", "Noto Sans", sans-serif`]]]);
    return out;
}

/** The theme file for a draft: a BetterDiscord-style header, the variables, then any extra CSS */
export function buildThemeCss(draft: ThemeDraft): string {
    const header = [
        ["name", headerValue(draft.name) || "Untitled theme"],
        ["description", headerValue(draft.description)],
        ["author", headerValue(draft.author)],
        ["version", headerValue(draft.version) || "1.0.0"],
        ["base", draft.base],
        ...Object.entries(draft.locales ?? {}).flatMap(([lang, l]) => [
            [`name:${lang}`, headerValue(l.name ?? "")],
            [`description:${lang}`, headerValue(l.description ?? "")],
        ]),
    ].filter(([, v]) => v).map(([k, v]) => ` * @${k} ${v}`);
    const selectors = SELECTORS[draft.base];
    const scope = draft.base === "dark" ? "Discord's dark modes only: light mode stays as it is." : "Discord's light mode only: the dark modes stay as they are.";
    const body = sections(draft).map(([title, decls]) => [`    /* ${title} */`, ...decls.map(([k, v]) => `    ${k}: ${v};`)].join("\n")).join("\n\n");
    const is = `:is(${selectors.join(", ")})`;
    const gradients = ["lowest", "lower", "low", "high", "higher", "highest", "chat", "chat-preview", "app-frame"].map(g => `    --background-gradient-${g}: initial;`).join("\n");

    const parts = [
        `/**\n${header.join("\n")}\n */`,
        `${EDITOR_NOTE}${scope} */\n${selectors.join(",\n")} {\n${body}\n}`,
        [
            "/*",
            " * Nitro colour themes paint the chat, sidebars and title bar with these gradients instead of the",
            " * colours above. Every use falls back to a --background-base-* colour, so clearing them is enough.",
            " */",
            `.custom-theme-background${is},\n${is} .custom-theme-background,\n.custom-theme-background ${is} {\n${gradients}\n}`,
        ].join("\n"),
    ];
    const extra = draft.extraCss.trim();
    if (extra) parts.push(`${EXTRA_MARKER}\n${extra}`);
    return `${parts.join("\n\n")}\n`;
}

/** Where each colour is read from, first match wins: the editor's own variable, then older names */
const READ_FROM: Record<ColorKey, readonly string[]> = {
    frame: ["--background-base-lowest", "--app-frame-background", "--background-tertiary"],
    chat: ["--background-base-lower", "--background-primary", "--chat-background"],
    panel: ["--background-base-low", "--background-secondary"],
    popout: ["--background-surface-high", "--background-floating", "--modal-background"],
    input: ["--chat-background-default", "--channeltextarea-background"],
    text: ["--text-default", "--text-normal"],
    strong: ["--text-strong", "--header-primary"],
    muted: ["--text-muted", "--header-secondary"],
    icon: ["--icon-default", "--interactive-normal"],
    accent: ["--control-primary-background-default", "--brand-500", "--brand-experiment"],
    link: ["--text-link"],
    // Written as a tint of the colour: its first colour is the one picked
    mention: ["--mention-background"],
    highlight: ["--info-warning-foreground", "--message-mentioned-background-default", "--background-mentioned"],
};

/** Comments out of the way, so a commented-out declaration isn't read */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The first value `css` gives a custom property, or undefined */
function declared(css: string, name: string) {
    const escaped = name.replace(/[-]/g, "\\-");
    return css.match(new RegExp(`(?:^|[;{\\s])${escaped}\\s*:\\s*([^;{}]+)`))?.[1]?.trim();
}

/** A colour from a declared value: the value itself, or the first colour in a color-mix() */
function colorOf(value: string | undefined) {
    if (!value) return;
    const direct = toHex(value);
    if (direct) return direct;
    const inner = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0];
    return inner ? toHex(inner) : undefined;
}

/** Whether a file came from the editor: saving it again overwrites it rather than making a copy */
export const isEditorTheme = (css: string) => css.includes(EDITOR_NOTE);

/**
 * A draft from a theme file. `base` comes from the header's @base, else from which appearance its
 * rules target. Colours the file doesn't set, or sets in a way that can't be read, are the preset's.
 */
export function parseThemeCss(css: string, file = ""): ThemeDraft {
    const meta = parseThemeMeta(css, file);
    const headerBase = css.match(/^\s*\/\*[\s\S]*?\*\//)?.[0].match(/(?:^|\s)@base[ \t]+(dark|light)\b/i)?.[1]?.toLowerCase();
    const extraAt = css.indexOf(EXTRA_MARKER);
    const editorPart = stripComments(extraAt === -1 ? css : css.slice(0, extraAt));
    const base: ThemeBase = headerBase === "light" || headerBase === "dark"
        ? headerBase
        : /\.theme-light\b/.test(editorPart) && !/\.theme-(dark|darker|midnight)\b/.test(editorPart) ? "light" : "dark";

    const draft = blankDraft(base);
    for (const key of COLOR_KEYS) {
        for (const name of READ_FROM[key]) {
            const color = colorOf(declared(editorPart, name));
            if (color) {
                draft.colors[key] = color;
                break;
            }
        }
    }
    const sm = declared(editorPart, "--radius-sm")?.match(/^(\d+(?:\.\d+)?)px$/)?.[1];
    if (sm !== undefined) draft.radius = clampRadius(Number(sm) / RADII.sm * 100);
    const font = declared(editorPart, "--font-primary")?.match(/^["']([^"']+)["']/)?.[1];
    if (font && font.toLowerCase() !== "gg sans") draft.font = cleanFont(font);

    return {
        ...draft,
        name: meta.name,
        description: meta.description ?? "",
        author: meta.author ?? "",
        version: meta.version ?? "1.0.0",
        extraCss: extraAt === -1 ? "" : css.slice(extraAt + EXTRA_MARKER.length).trim(),
        ...meta.locales && { locales: meta.locales },
    };
}

/** A store id (and file name) for a theme name: "Ocean Night" → "ocean-night" */
export function themeSlug(name: string) {
    const slug = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
    return isPluginId(slug) ? slug : "theme";
}
