/**
 * Backup format and the pure logic around it: building a backup, validating one read from disk,
 * and planning an import (what changes, merge vs replace). Main does the file IO, the UI shows
 * the preview. No Node or DOM APIs here, so it's unit tested directly.
 */
import { EviSettings, isPluginEnabled, PluginManifest, PluginPayload, PluginSettingsEntry } from "./ipc";
import { isThemeFile, MAX_THEME_BYTES } from "./themes";
import { englishTr, Tr } from "./tr";

export const BACKUP_FORMAT = "evi-backup";
export const BACKUP_VERSION = 1;
/** Largest backup we read. Themes are capped at 2 MB each, real backups are a few KB */
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;

export interface BackupTheme {
    file: string;
    css: string;
}

export interface BackupPlugin {
    id: string;
    name: string;
    source: PluginPayload["source"];
    enabled: boolean;
}

export interface EviBackup {
    format: typeof BACKUP_FORMAT;
    version: typeof BACKUP_VERSION;
    /** ISO timestamp */
    createdAt: string;
    eviVersion: string;
    settings: EviSettings;
    quickCss: string;
    themes: BackupTheme[];
    /** Which plugins were installed. Their code isn't included, only their settings (in `settings`). */
    plugins: BackupPlugin[];
}

export type ImportMode = "merge" | "replace";

export interface BackupSource {
    settings: EviSettings;
    quickCss: string;
    themes: BackupTheme[];
    plugins: { manifest: PluginManifest; source: PluginPayload["source"]; }[];
}

export function buildBackup(state: BackupSource, eviVersion: string, now = new Date()): EviBackup {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: now.toISOString(),
        eviVersion,
        settings: structuredClone(state.settings),
        quickCss: state.quickCss,
        themes: state.themes
            .map(({ file, css }) => ({ file, css }))
            .sort((a, b) => a.file.localeCompare(b.file)),
        plugins: state.plugins
            .map(({ manifest, source }) => ({ id: manifest.id, name: manifest.name, source, enabled: isPluginEnabled(state.settings, manifest) }))
            .sort((a, b) => a.id.localeCompare(b.id)),
    };
}

/** evi-backup-2026-09-26.json, in local time */
export function backupFileName(now = new Date()) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `evi-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ParseResult = { ok: true; backup: EviBackup; } | { ok: false; error: string; };

class Invalid extends Error { }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Keys that would reach Object.prototype when assigned with obj[key] = … */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function fail(message: string): never {
    throw new Invalid(message);
}

function expect<T>(ok: boolean, value: unknown, message: string): T {
    if (!ok) fail(message);
    return value as T;
}

function str(value: unknown, where: string, max = 256) {
    return expect<string>(typeof value === "string" && value.length <= max, value, `${where} must be text`);
}

function key(value: string, where: string) {
    if (!value || value.length > 128 || UNSAFE_KEYS.has(value)) fail(`${where} has an invalid name: ${JSON.stringify(value.slice(0, 40))}`);
    return value;
}

/** A plain file name inside the themes folder: no folders, no reserved characters */
export function isSafeThemeFile(file: string) {
    return file.length <= 200
        && isThemeFile(file)
        && !/[\\/:*?"<>|\x00-\x1f]/.test(file)
        && !/^[.\s]/.test(file)
        && !UNSAFE_KEYS.has(file);
}

function parseSettings(value: unknown): EviSettings {
    if (!isObject(value)) fail("settings must be an object");
    if (!isObject(value.plugins)) fail("settings.plugins must be an object");

    const plugins: Record<string, PluginSettingsEntry> = {};
    for (const [id, entry] of Object.entries(value.plugins)) {
        key(id, "A plugin in settings");
        if (!isObject(entry)) fail(`settings of ${id} must be an object`);
        const clean: PluginSettingsEntry = {};
        if (entry.enabled !== undefined) clean.enabled = expect(typeof entry.enabled === "boolean", entry.enabled, `${id}.enabled must be true or false`);
        if (entry.settings !== undefined) {
            if (!isObject(entry.settings)) fail(`${id}.settings must be an object`);
            for (const k of Object.keys(entry.settings)) key(k, `A setting of ${id}`);
            clean.settings = structuredClone(entry.settings);
        }
        plugins[id] = clean;
    }

    const quickCss = expect<boolean>(typeof value.quickCss === "boolean", value.quickCss, "settings.quickCss must be true or false");
    if (!Array.isArray(value.enabledThemes)) fail("settings.enabledThemes must be a list");
    const enabledThemes = value.enabledThemes.map((f, i) => str(f, `settings.enabledThemes[${i}]`));

    // Unknown keys are dropped: only what this version understands gets applied
    return { plugins, quickCss, enabledThemes };
}

function parseThemes(value: unknown): BackupTheme[] {
    if (!Array.isArray(value)) fail("themes must be a list");
    const seen = new Set<string>();
    return value.map((theme, i) => {
        if (!isObject(theme)) fail(`themes[${i}] must be an object`);
        const file = str(theme.file, `themes[${i}].file`);
        if (!isSafeThemeFile(file)) fail(`themes[${i}] has an unsafe file name: ${JSON.stringify(file.slice(0, 60))}`);
        // Windows file names are case-insensitive, two entries would write the same file
        if (seen.has(file.toLowerCase())) fail(`The theme ${file} is in the backup twice`);
        seen.add(file.toLowerCase());
        const css = str(theme.css, `themes[${i}].css`, MAX_THEME_BYTES);
        if (css.includes("\0")) fail(`The theme ${file} isn't text`);
        return { file, css };
    });
}

function parsePlugins(value: unknown): BackupPlugin[] {
    if (!Array.isArray(value)) fail("plugins must be a list");
    return value.map((plugin, i) => {
        if (!isObject(plugin)) fail(`plugins[${i}] must be an object`);
        const id = key(str(plugin.id, `plugins[${i}].id`), `plugins[${i}]`);
        const name = str(plugin.name, `plugins[${i}].name`);
        const source = expect<BackupPlugin["source"]>(plugin.source === "user" || plugin.source === "dev", plugin.source, `plugins[${i}].source must be "user" or "dev"`);
        const enabled = expect<boolean>(typeof plugin.enabled === "boolean", plugin.enabled, `plugins[${i}].enabled must be true or false`);
        return { id, name, source, enabled };
    });
}

/** Strictly validates a backup file's text. Everything returned is freshly built, nothing from the file is passed through. */
export function parseBackup(text: string, tr: Tr = englishTr): ParseResult {
    if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: tr("main.backup.tooLarge", { mb: MAX_BACKUP_BYTES / 1024 / 1024 }) };

    let raw: unknown;
    try {
        raw = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
        return { ok: false, error: tr("main.backup.notJson") };
    }

    try {
        if (!isObject(raw) || raw.format !== BACKUP_FORMAT) fail(tr("main.backup.notBackup"));
        if (typeof raw.version !== "number" || !Number.isInteger(raw.version)) fail(tr("main.backup.noVersion"));
        if (raw.version > BACKUP_VERSION) fail(tr("main.backup.newer", { version: raw.version }));
        if (raw.version !== BACKUP_VERSION) fail(tr("main.backup.unsupported", { version: raw.version }));

        const createdAt = str(raw.createdAt, "createdAt", 64);
        if (Number.isNaN(Date.parse(createdAt))) fail("createdAt isn't a date");

        return {
            ok: true,
            backup: {
                format: BACKUP_FORMAT,
                version: BACKUP_VERSION,
                createdAt,
                eviVersion: str(raw.eviVersion, "eviVersion", 64),
                settings: parseSettings(raw.settings),
                quickCss: str(raw.quickCss, "quickCss", MAX_BACKUP_BYTES),
                themes: parseThemes(raw.themes),
                plugins: parsePlugins(raw.plugins),
            },
        };
    } catch (err) {
        if (err instanceof Invalid) return { ok: false, error: err.message };
        throw err;
    }
}

export interface ImportPreview {
    mode: ImportMode;
    /** Names of installed plugins that get turned on / off */
    pluginsEnabled: string[];
    pluginsDisabled: string[];
    /** Names of plugins whose stored settings change */
    pluginSettingsChanged: string[];
    /** Plugins in the backup that aren't installed here. Their settings are restored anyway. */
    missingPlugins: BackupPlugin[];
    /** Theme files written: new ones, and existing ones whose contents differ */
    themesAdded: string[];
    themesOverwritten: string[];
    themesEnabled: string[];
    themesDisabled: string[];
    quickCss: "replaced" | "kept" | "unchanged";
    /** Whether the "Apply Quick CSS" switch flips */
    quickCssToggle?: boolean;
    /** Total number of changes, 0 means applying does nothing */
    changes: number;
}

export interface ImportPlan {
    settings: EviSettings;
    /** null leaves quick.css alone */
    quickCss: string | null;
    /** Files to write, with names already matched to existing files of different case */
    themes: BackupTheme[];
    preview: ImportPreview;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * What importing `backup` over `current` does.
 *
 * - replace: settings become the backup's, Quick CSS is replaced, themes not in the backup are
 *   turned off (their files stay).
 * - merge: the backup's plugin states and settings win key by key, everything else is kept,
 *   enabled themes are combined, Quick CSS is only filled in if yours is empty.
 *
 * Both write every theme from the backup that's new or different. Nothing is ever deleted.
 */
export function planImport(current: BackupSource, backup: EviBackup, mode: ImportMode): ImportPlan {
    // Theme names as they exist on disk, case-insensitively (Windows)
    const existing = new Map(current.themes.map(t => [t.file.toLowerCase(), t]));
    const onDisk = (file: string) => existing.get(file.toLowerCase())?.file ?? file;

    const themes: BackupTheme[] = [];
    const themesAdded: string[] = [];
    const themesOverwritten: string[] = [];
    for (const theme of backup.themes) {
        const have = existing.get(theme.file.toLowerCase());
        if (!have) themesAdded.push(theme.file);
        else if (have.css !== theme.css) themesOverwritten.push(have.file);
        else continue;
        themes.push({ file: onDisk(theme.file), css: theme.css });
    }

    const incoming = backup.settings;
    const enabledFromBackup = incoming.enabledThemes.map(onDisk);
    let settings: EviSettings;
    if (mode === "replace") {
        // Keys a backup doesn't carry (auto-update, the last seen version) are this device's own and stay
        settings = { ...structuredClone(current.settings), ...structuredClone(incoming), enabledThemes: [...new Set(enabledFromBackup)].slice(-1) };
    } else {
        const plugins = structuredClone(current.settings.plugins);
        for (const [id, entry] of Object.entries(incoming.plugins)) {
            const mine = plugins[id] ?? {};
            const merged: PluginSettingsEntry = { ...mine };
            if (entry.enabled !== undefined) merged.enabled = entry.enabled;
            if (entry.settings || mine.settings) merged.settings = { ...mine.settings, ...structuredClone(entry.settings) };
            plugins[id] = merged;
        }
        settings = {
            ...structuredClone(current.settings),
            plugins,
            quickCss: incoming.quickCss,
            // One theme at a time: the backup's wins
            enabledThemes: [...new Set([...current.settings.enabledThemes, ...enabledFromBackup])].slice(-1),
        };
    }

    const installed = new Map(current.plugins.map(p => [p.manifest.id, p.manifest]));
    const pluginsEnabled: string[] = [];
    const pluginsDisabled: string[] = [];
    for (const manifest of installed.values()) {
        const before = isPluginEnabled(current.settings, manifest);
        const after = isPluginEnabled(settings, manifest);
        if (after && !before) pluginsEnabled.push(manifest.name);
        if (before && !after) pluginsDisabled.push(manifest.name);
    }

    const nameOf = (id: string) => installed.get(id)?.name ?? backup.plugins.find(p => p.id === id)?.name ?? id;
    const ids = new Set([...Object.keys(current.settings.plugins), ...Object.keys(settings.plugins)]);
    const pluginSettingsChanged = [...ids]
        .filter(id => !sameJson(current.settings.plugins[id]?.settings, settings.plugins[id]?.settings))
        .map(nameOf);

    const missingPlugins = backup.plugins.filter(p => !installed.has(p.id));

    const wasOn = new Set(current.settings.enabledThemes);
    const isOn = new Set(settings.enabledThemes);
    const themesEnabled = [...isOn].filter(f => !wasOn.has(f));
    const themesDisabled = [...wasOn].filter(f => !isOn.has(f));

    let quickCss: string | null = null;
    let quickCssChange: ImportPreview["quickCss"] = "unchanged";
    if (backup.quickCss !== current.quickCss) {
        if (mode === "replace" || !current.quickCss.trim()) {
            quickCss = backup.quickCss;
            quickCssChange = "replaced";
        } else {
            quickCssChange = "kept";
        }
    }
    const quickCssToggle = settings.quickCss !== current.settings.quickCss ? settings.quickCss : undefined;

    const sort = (list: string[]) => list.sort((a, b) => a.localeCompare(b));
    const listed = pluginsEnabled.length + pluginsDisabled.length + pluginSettingsChanged.length + themes.length
        + themesEnabled.length + themesDisabled.length + (quickCss !== null ? 1 : 0) + (quickCssToggle !== undefined ? 1 : 0);
    const preview: ImportPreview = {
        mode,
        pluginsEnabled: sort(pluginsEnabled),
        pluginsDisabled: sort(pluginsDisabled),
        pluginSettingsChanged: sort(pluginSettingsChanged),
        missingPlugins,
        themesAdded: sort(themesAdded),
        themesOverwritten: sort(themesOverwritten),
        themesEnabled: sort(themesEnabled),
        themesDisabled: sort(themesDisabled),
        quickCss: quickCssChange,
        quickCssToggle,
        // Settings can still differ with nothing listed, e.g. the on/off state of a plugin that isn't installed
        changes: listed || (sameJson(current.settings, settings) ? 0 : 1),
    };

    return { settings, quickCss, themes, preview };
}
