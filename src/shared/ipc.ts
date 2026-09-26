/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
    /** sync: renderer bundle source */
    GET_RENDERER: "delight:get-renderer",
    /** sync: everything the renderer needs to boot, see BootData */
    GET_BOOT: "delight:get-boot",
    SETTINGS_SAVE: "delight:settings-save",
    /** sync: last-chance flush while the page unloads, async IPC may not make it */
    SETTINGS_SAVE_SYNC: "delight:settings-save-sync",
    CSS_SAVE_SYNC: "delight:css-save-sync",
    CSS_SAVE: "delight:css-save",
    /** main -> renderer: quick css file changed on disk */
    CSS_CHANGED: "delight:css-changed",
    /** main -> renderer: a plugin was added, changed or removed on disk */
    PLUGIN_CHANGED: "delight:plugin-changed",
    /** invoke a method exported by a plugin's native (main process) module */
    PLUGIN_NATIVE_CALL: "delight:plugin-native-call",
    /** start / stop a plugin's native module */
    PLUGIN_NATIVE_STATE: "delight:plugin-native-state",
    OPEN_PATH: "delight:open-path",
    RELAUNCH: "delight:relaunch",
} as const;

export interface PluginManifest {
    /** Folder name, kebab-case. Also the settings key. */
    id: string;
    name: string;
    description?: string;
    version?: string;
    authors?: string[];
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

export interface PluginSettingsEntry {
    enabled?: boolean;
    settings?: Record<string, unknown>;
}

export interface DelightSettings {
    plugins: Record<string, PluginSettingsEntry>;
    quickCss: boolean;
}

export const DEFAULT_SETTINGS: DelightSettings = {
    plugins: {},
    quickCss: true,
};

export interface BootData {
    version: string;
    dataDir: string;
    settings: DelightSettings;
    plugins: PluginPayload[];
    quickCss: string;
}

export type OpenPathTarget = "data" | "plugins" | "quickCss";

export function isPluginEnabled(settings: DelightSettings, manifest: PluginManifest) {
    return settings.plugins[manifest.id]?.enabled ?? manifest.enabledByDefault ?? false;
}
