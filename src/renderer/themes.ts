import type { AddThemeResult, ThemeChange, ThemePayload } from "@shared/ipc";

import { Logger } from "./logger";
import { Native } from "./native";
import { SafeMode } from "./safeMode";
import { Settings } from "./settings";
import { createStyle, ManagedStyle, QUICK_CSS_ID } from "./styles";

const logger = new Logger("Themes", "#c58af9");

const themes = new Map<string, ThemePayload>();
/** One <style> per enabled theme, keyed by file name */
const styles = new Map<string, ManagedStyle>();
const listeners = new Set<() => void>();
let snapshot: ThemePayload[] = [];

const styleId = (file: string) => `delight-theme-${file.replace(/[^\w.-]/g, "_")}`;

function notify() {
    snapshot = [...themes.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const listener of listeners) listener();
}

function onChange(change: ThemeChange) {
    if (change.type === "upsert") {
        themes.set(change.theme.file, change.theme);
        logger.info(`Theme ${change.theme.file} changed on disk`);
    } else {
        themes.delete(change.file);
    }
    Themes.apply();
    notify();
}

export const Themes = {
    init(initial: ThemePayload[] = []) {
        for (const theme of initial) themes.set(theme.file, theme);
        // Before Quick CSS is created, so enabled themes land ahead of it with no unstyled frame
        Themes.apply();
        notify();
        Native.onThemeChange?.(onChange);
    },

    isEnabled: (file: string) => Settings.data.enabledThemes.includes(file),

    /** Syncs the <style> elements with the enabled, existing themes. None in safe mode. */
    apply() {
        const applies = (file: string) => !SafeMode.active && Themes.isEnabled(file);
        for (const [file, style] of styles) {
            if (!themes.has(file) || !applies(file)) {
                style.remove();
                styles.delete(file);
            }
        }
        for (const theme of themes.values()) {
            if (!applies(theme.file)) continue;
            const style = styles.get(theme.file);
            if (style) style.update(theme.css);
            else styles.set(theme.file, createStyle(theme.css, styleId(theme.file), QUICK_CSS_ID));
        }
    },

    setEnabled(file: string, enabled: boolean) {
        Settings.update(d => {
            const rest = d.enabledThemes.filter(f => f !== file);
            d.enabledThemes = enabled ? [...rest, file] : rest;
        });
        Themes.apply();
        notify();
    },

    /** Downloads a theme into the themes folder and turns it on */
    async addFromUrl(url: string): Promise<AddThemeResult> {
        const result = await Native.addThemeFromUrl(url);
        if (result.ok) Themes.setEnabled(result.file, true);
        return result;
    },

    getSnapshot: () => snapshot,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
};
