import { AddThemeResult, IPC, ThemeChange, ThemePayload } from "@shared/ipc";
import { isThemeFile, MAX_THEME_BYTES, parseThemeMeta, themeFileName, whyNotCss } from "@shared/themes";
import { ipcMain, webContents } from "electron";
import { existsSync, FSWatcher, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "fs";
import { join } from "path";

import { downloadHttps } from "./download";
import { THEMES_DIR } from "./paths";
import { SafeMode } from "./safeMode";

const themes = new Map<string, ThemePayload>();

function readTheme(file: string): ThemePayload | null {
    if (!isThemeFile(file)) return null;
    try {
        const css = readFileSync(join(THEMES_DIR, file), "utf8");
        return { ...parseThemeMeta(css, file), css };
    } catch {
        // Gone, or a folder that happens to end in .css
        return null;
    }
}

function broadcast(change: ThemeChange) {
    for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) wc.send(IPC.THEME_CHANGED, change);
    }
}

export function reloadTheme(file: string) {
    const previous = themes.get(file);
    const next = readTheme(file);
    // Editors touch files on save without changing them, don't restyle Discord for that
    if (previous && next && previous.css === next.css) return;

    if (!next) {
        if (previous) {
            themes.delete(file);
            broadcast({ type: "remove", file });
        }
        return;
    }
    themes.set(file, next);
    SafeMode.recordChange({ kind: "theme", id: file, action: previous ? "updated" : "installed" });
    broadcast({ type: "upsert", theme: next });
}

/** Re-reads every theme, including ones that disappeared while the watcher was down */
function rescan() {
    const files = new Set(existsSync(THEMES_DIR) ? readdirSync(THEMES_DIR) : []);
    for (const file of themes.keys()) files.add(file);
    for (const file of files) reloadTheme(file);
}

function watchThemes() {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const start = () => {
        let watcher: FSWatcher;
        try {
            // The folder may have been deleted, recreate it so there's something to watch
            mkdirSync(THEMES_DIR, { recursive: true });
            watcher = watch(THEMES_DIR, (_event, filename) => {
                // No file name means we can't tell what changed, look at everything
                const key = filename ?? "";
                clearTimeout(pending.get(key));
                pending.set(key, setTimeout(() => {
                    pending.delete(key);
                    filename ? reloadTheme(filename) : rescan();
                }, 100));
            });
        } catch {
            return void setTimeout(start, 2000);
        }

        // Same failure mode as the plugin watcher: on Windows the watcher errors for good when the
        // folder is deleted or renamed. Restart it and catch up on whatever changed meanwhile.
        watcher.on("error", err => {
            console.warn("[Delight] Theme watcher failed, restarting it", err);
            watcher.close();
            setTimeout(() => {
                rescan();
                start();
            }, 500);
        });
    };

    start();
}

/** Uses a name that's free, unless the same theme is already there (re-adding updates nothing) */
function pickFile(wanted: string, css: string) {
    const base = wanted.replace(/\.css$/i, "");
    for (let i = 1; ; i++) {
        const file = i === 1 ? wanted : `${base}-${i}.css`;
        const path = join(THEMES_DIR, file);
        if (!existsSync(path) || readFileSync(path, "utf8") === css) return file;
    }
}

export async function addThemeFromUrl(input: string): Promise<AddThemeResult> {
    const download = await downloadHttps(input, MAX_THEME_BYTES);
    if (!download.ok) return download;
    const url = new URL(input.trim());
    const { body } = download;

    let css: string;
    try {
        css = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
        return { ok: false, error: "That file isn't text" };
    }
    const problem = whyNotCss(css, download.contentType);
    if (problem) return { ok: false, error: problem };

    const file = pickFile(themeFileName(url, parseThemeMeta(css, "")), css);
    writeFileSync(join(THEMES_DIR, file), css);
    // Don't wait for the watcher, the renderer should have it by the time this resolves
    reloadTheme(file);
    console.log(`[Delight] Added theme ${file} from ${url.href}`);
    return { ok: true, file };
}

export function getThemePayloads() {
    return [...themes.values()];
}

export function initThemes() {
    for (const file of readdirSync(THEMES_DIR)) {
        const theme = readTheme(file);
        if (theme) themes.set(file, theme);
    }
    watchThemes();

    ipcMain.handle(IPC.THEME_ADD_URL, (_, url: string) => addThemeFromUrl(String(url)));
}
