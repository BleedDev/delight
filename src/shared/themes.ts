import type { ThemeMeta } from "./ipc";

/** Largest theme we download, remote themes are usually well under 200 KB */
export const MAX_THEME_BYTES = 2 * 1024 * 1024;

export const isThemeFile = (file: string) => /\.css$/i.test(file);

/**
 * Reads a BetterDiscord-style header, the first comment of the file:
 *
 *   /**
 *    * @name Midnight
 *    * @description A dark theme
 *    * @author someone
 *    * @version 1.2.0
 *    *\/
 *
 * Tags may also share a line. Missing names fall back to the file name.
 */
export function parseThemeMeta(css: string, file: string): ThemeMeta {
    const header = css.match(/^\s*\/\*([\s\S]*?)\*\//)?.[1] ?? "";
    const tags: Record<string, string> = {};
    // A tag starts after whitespace (so emails don't count) and runs to the next tag or line end
    for (const [, key, value] of header.matchAll(/(?:^|\s)@(\w+)[ \t]+(.*?)(?=[ \t]+@\w+[ \t]|[ \t]*\r?\n|[ \t]*$)/g)) {
        const k = key.toLowerCase();
        if (!(k in tags) && value.trim()) tags[k] = value.trim();
    }

    return {
        file,
        name: tags.name ?? file.replace(/\.css$/i, ""),
        description: tags.description,
        author: tags.author,
        version: tags.version,
    };
}

/** Why a downloaded body isn't a usable theme, or undefined when it looks like CSS */
export function whyNotCss(text: string, contentType = ""): string | undefined {
    const type = contentType.split(";")[0].trim().toLowerCase();
    if (/html|json|javascript|image|video|audio|octet-stream|zip/.test(type)) return `The server sent ${type}, not CSS`;
    if (text.includes("\0")) return "That file is binary, not CSS";
    if (/^\s*</.test(text)) return "That link points to a web page, not a CSS file. For GitHub, use the Raw link";
    if (!/[{}]|@import/.test(text)) return "That file doesn't contain any CSS rules";
}

/** A safe file name for a theme downloaded from a URL */
export function themeFileName(url: URL, meta: { name?: string; }) {
    const last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const base = isThemeFile(last) ? last.replace(/\.css$/i, "") : meta.name || url.hostname;
    const safe = base.replace(/[^\w.-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(0, 80) || "theme";
    return `${safe}.css`;
}
