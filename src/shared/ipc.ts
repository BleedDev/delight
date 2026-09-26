import type { ImportMode, ImportPreview } from "./backup";

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
    /** sync: renderer bundle source */
    GET_RENDERER: "evi:get-renderer",
    /** sync: everything the renderer needs to boot, see BootData */
    GET_BOOT: "evi:get-boot",
    SETTINGS_SAVE: "evi:settings-save",
    /** sync: last-chance flush while the page unloads, async IPC may not make it */
    SETTINGS_SAVE_SYNC: "evi:settings-save-sync",
    CSS_SAVE_SYNC: "evi:css-save-sync",
    CSS_SAVE: "evi:css-save",
    /** main -> renderer: quick css file changed on disk */
    CSS_CHANGED: "evi:css-changed",
    /** main -> renderer: a plugin was added, changed or removed on disk */
    PLUGIN_CHANGED: "evi:plugin-changed",
    /** invoke a method exported by a plugin's native (main process) module */
    PLUGIN_NATIVE_CALL: "evi:plugin-native-call",
    /** start / stop a plugin's native module */
    PLUGIN_NATIVE_STATE: "evi:plugin-native-state",
    /** main -> renderer: a theme file was added, changed or removed on disk */
    THEME_CHANGED: "evi:theme-changed",
    /** download a theme from an https URL into the themes folder */
    THEME_ADD_URL: "evi:theme-add-url",
    /** save a backup file, see shared/backup.ts */
    BACKUP_EXPORT: "evi:backup-export",
    /** pick and validate a backup file, answers with what importing it would change */
    BACKUP_OPEN: "evi:backup-open",
    BACKUP_APPLY: "evi:backup-apply",
    /** plugin store: fetch the registry, install / update / uninstall from it */
    STORE_LIST: "evi:store-list",
    STORE_INSTALL: "evi:store-install",
    STORE_UNINSTALL: "evi:store-uninstall",
    STORE_THEME_INSTALL: "evi:store-theme-install",
    STORE_THEME_UNINSTALL: "evi:store-theme-uninstall",
    /** a screenshot the registry lists, as a data URL */
    STORE_IMAGE: "evi:store-image",
    /** store stars: every count plus this install's own, and starring or unstarring one item */
    STARS_GET: "evi:stars-get",
    STARS_SET: "evi:stars-set",
    /** main -> renderer: download / install progress of a store operation */
    STORE_PROGRESS: "evi:store-progress",
    OPEN_PATH: "evi:open-path",
    RELAUNCH: "evi:relaunch",
    /** renderer -> main: plugins started and the page stayed up, this start counts as healthy */
    BOOT_OK: "evi:boot-ok",
    /** leave safe mode: forget the crash history and restart Discord normally */
    SAFE_MODE_EXIT: "evi:safe-mode-exit",
} as const;

export interface PluginManifest {
    /** Folder name, kebab-case. Also the settings key. */
    id: string;
    name: string;
    description?: string;
    version?: string;
    authors?: string[];
    /** Store search keywords, also the store's categories */
    tags?: string[];
    /** https link to the source, published to the store registry */
    source?: string;
    /** https image links, published to the store registry */
    screenshots?: string[];
    /** Newest first, published to the store registry */
    changelog?: { version: string; notes: string[]; }[];
    /** Oldest Evi the plugin works with, published to the store registry */
    minEviVersion?: string;
    /** Renderer entry, relative to the plugin folder. Defaults to index.js */
    main?: string;
    /** Optional main-process entry, relative to the plugin folder */
    native?: string;
    /** Enabled on first install */
    enabledByDefault?: boolean;
    /**
     * Chromium command line switches applied when Discord starts, while the plugin is enabled.
     * `true` for flags without a value. Changes take effect after restarting Discord.
     */
    chromiumSwitches?: Record<string, string | true>;
}

export interface PluginPayload {
    manifest: PluginManifest;
    code: string;
    /** Where the plugin was loaded from: the data dir, or the dev build output */
    source: "user" | "dev";
}

export type PluginChange =
    | { type: "upsert"; plugin: PluginPayload; }
    | { type: "remove"; id: string; };

export interface ThemeMeta {
    /** File name inside the themes folder, e.g. "midnight.css". Also the settings key. */
    file: string;
    /** From the header's @name, or the file name without .css */
    name: string;
    description?: string;
    author?: string;
    version?: string;
}

export interface ThemePayload extends ThemeMeta {
    css: string;
}

export type ThemeChange =
    | { type: "upsert"; theme: ThemePayload; }
    | { type: "remove"; file: string; };

export type AddThemeResult = { ok: true; file: string; } | { ok: false; error: string; };

export interface PluginSettingsEntry {
    enabled?: boolean;
    settings?: Record<string, unknown>;
}

export interface EviSettings {
    plugins: Record<string, PluginSettingsEntry>;
    quickCss: boolean;
    /** File names of enabled themes */
    enabledThemes: string[];
    /** Update store plugins and themes in the background. Full-access plugins still ask first. */
    autoUpdate?: boolean;
    /** The Evi version whose "What's new" was last shown, to show it once after each update */
    lastSeenVersion?: string;
}

export const DEFAULT_SETTINGS: EviSettings = {
    plugins: {},
    quickCss: true,
    enabledThemes: [],
};

export interface BootData {
    version: string;
    dataDir: string;
    settings: EviSettings;
    plugins: PluginPayload[];
    quickCss: string;
    themes: ThemePayload[];
    /** Set when this start is in safe mode: no plugins, themes or Quick CSS */
    safeMode?: SafeModeInfo;
}

/**
 * Why safe mode is on. `crash-loop`: Discord failed to finish starting twice in a row. `renderer-crash`:
 * Discord's window crashed twice within a short time. `flag`: launched with --evi-safe.
 */
export type SafeModeReason = "crash-loop" | "renderer-crash" | "flag";

/** Something the user turned on or changed, a suspect when Discord starts crashing */
export interface RecentChange {
    kind: "plugin" | "theme" | "quickCss";
    /** Plugin id, theme file name, or "quick.css" */
    id: string;
    action: "enabled" | "settings" | "installed" | "updated" | "edited";
    /** Epoch ms */
    at: number;
}

export interface SafeModeInfo {
    reason: SafeModeReason;
    /** Starts that never reached a healthy boot, or crashes in a row for renderer-crash */
    failures: number;
    /** Newest first */
    changes: RecentChange[];
}

export type OpenPathTarget = "data" | "plugins" | "themes" | "quickCss";

type Failed = { ok: false; canceled?: false; error: string; } | { ok: false; canceled: true; };

export type BackupExportResult = { ok: true; path: string; } | Failed;

export type BackupOpenResult = {
    ok: true;
    /** Pass to applyBackup, the validated backup stays in main until then */
    token: string;
    fileName: string;
    createdAt: string;
    eviVersion: string;
    previews: Record<ImportMode, ImportPreview>;
} | Failed;

export type BackupApplyResult = { ok: true; settings: EviSettings; preview: ImportPreview; } | Failed;

export function isPluginEnabled(settings: EviSettings, manifest: PluginManifest) {
    return settings.plugins[manifest.id]?.enabled ?? manifest.enabledByDefault ?? false;
}
