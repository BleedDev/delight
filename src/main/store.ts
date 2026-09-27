/**
 * The store: reads a registry over https, and installs, updates and uninstalls plugins and themes from it.
 *
 * The renderer only ever names an id. Where files come from and what they must hash to is decided
 * here, from the registry this process downloaded itself, so nothing in Discord's page can point an
 * install at other files. Every file is verified before anything touches the plugins or themes folder,
 * and a finished plugin folder is moved into place with a single rename, so the plugin watcher never
 * sees half a plugin.
 */
import { imageDataUrl } from "@shared/images";
import { cleanSwitches, StorePreviewResult } from "@shared/pluginPermissions";
import { IPC, PluginManifest } from "@shared/ipc";
import {
    compareVersions,
    DEFAULT_REGISTRY_URL,
    InstalledPlugin,
    InstalledTheme,
    isPluginId,
    MAX_FILE_BYTES,
    MAX_IMAGE_BYTES,
    MAX_REGISTRY_BYTES,
    parseRegistry,
    RegistryEntry,
    STORE_MARKER,
    StoreFileName,
    StoreImageResult,
    StoreListing,
    StoreMarker,
    StoreProgress,
    StoreResult,
    storeThemeFile,
    ThemeEntry,
    whyNotHash,
    whyNotManifest,
    whyNotStoreUrl,
} from "@shared/store";
import { MAX_THEME_BYTES, whyNotCss } from "@shared/themes";
import { ipcMain, WebContents } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";

import { downloadHttps } from "./download";
import { DATA_DIR, PLUGINS_DIR, THEMES_DIR } from "./paths";
import { hideDevPlugin, pluginLocation, refreshUserPlugin, setRemoved } from "./plugins";
import { reloadTheme } from "./themes";

/** Outside the plugins folder, so the plugin watcher never loads a half-written plugin */
const STAGING_DIR = join(DATA_DIR, "store-staging");
/** `{ "registryUrl": "https://…" }`, edited by hand. The renderer can't change it. */
const CONFIG_FILE = join(DATA_DIR, "store.json");
/** Themes are single files with no room for a marker, so the store remembers its own here */
const THEMES_RECORD = join(DATA_DIR, "store-themes.json");

let cache: { url: string; entries: Map<string, RegistryEntry>; themes: Map<string, ThemeEntry>; images: Set<string>; } | undefined;
const busy = new Set<string>();

export function getRegistryUrl() {
    if (process.env.EVI_STORE_URL) return process.env.EVI_STORE_URL;
    try {
        const { registryUrl } = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
        if (typeof registryUrl === "string" && registryUrl.trim()) return registryUrl.trim();
    } catch { }
    return DEFAULT_REGISTRY_URL;
}

function readMarker(dir: string): StoreMarker | undefined {
    try {
        const marker = JSON.parse(readFileSync(join(dir, STORE_MARKER), "utf8"));
        return marker && typeof marker.version === "string" ? marker : undefined;
    } catch {
        return undefined;
    }
}

function listInstalled(): InstalledPlugin[] {
    if (!existsSync(PLUGINS_DIR)) return [];
    const installed: InstalledPlugin[] = [];
    for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = join(PLUGINS_DIR, entry.name);
        const marker = readMarker(dir);
        if (marker?.id === entry.name) {
            installed.push({ id: entry.name, version: marker.version, fromStore: true });
            continue;
        }
        try {
            const manifest: PluginManifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
            installed.push({ id: manifest.id ?? entry.name, version: manifest.version, fromStore: false });
        } catch { }
    }
    return installed;
}

type ThemesRecord = Record<string, { version: string; file: string; }>;

function readThemesRecord(): ThemesRecord {
    try {
        const record = JSON.parse(readFileSync(THEMES_RECORD, "utf8"));
        return record && typeof record === "object" && !Array.isArray(record) ? record : {};
    } catch {
        return {};
    }
}

function writeThemesRecord(record: ThemesRecord) {
    const tmp = THEMES_RECORD + ".tmp";
    writeFileSync(tmp, JSON.stringify(record, null, 4));
    renameSync(tmp, THEMES_RECORD);
}

/** Store themes whose file is still there: deleting the file by hand uninstalls it too */
function listInstalledThemes(): InstalledTheme[] {
    return Object.entries(readThemesRecord())
        .filter(([id, t]) => isPluginId(id) && typeof t?.version === "string" && t.file === storeThemeFile(id) && existsSync(join(THEMES_DIR, t.file)))
        .map(([id, t]) => ({ id, version: t.version, file: t.file, fromStore: true }));
}

async function fetchRegistry(): Promise<StoreListing> {
    const registryUrl = getRegistryUrl();
    const installed = listInstalled();
    const installedThemes = listInstalledThemes();
    const fail = (error: string): StoreListing => ({ ok: false, registryUrl, error, installed, installedThemes });

    const badUrl = whyNotStoreUrl(registryUrl);
    if (badUrl) return fail(`The registry URL can't be used: ${badUrl}`);

    const download = await downloadHttps(registryUrl, MAX_REGISTRY_BYTES, { what: "The registry", cache: "no-store" });
    if (!download.ok) return fail(download.error);

    let json: unknown;
    try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(download.body));
    } catch {
        return fail("The registry isn't valid JSON");
    }
    const parsed = parseRegistry(json);
    if ("error" in parsed) return fail(parsed.error);

    const { plugins, themes } = parsed.registry;
    cache = {
        url: registryUrl,
        entries: new Map(plugins.map(p => [p.id, p])),
        themes: new Map(themes.map(t => [t.id, t])),
        images: new Set([...plugins, ...themes].flatMap(e => e.screenshots)),
    };
    if (parsed.problems.length) console.warn(`[Evi] Store registry: skipped ${parsed.problems.length} entries`, parsed.problems);
    return { ok: true, registryUrl, plugins, themes, problems: parsed.problems, installed, installedThemes };
}

/** The registry currently configured: a stale cache from another URL doesn't count */
async function current() {
    if (!cache || cache.url !== getRegistryUrl()) {
        const listing = await fetchRegistry();
        if (!listing.ok) throw new Error(listing.error);
    }
    return cache!;
}

async function getEntry(id: string) {
    const entry = (await current()).entries.get(id);
    if (!entry) throw new Error(`${id} isn't in the store`);
    return entry;
}

const tempName = (id: string, kind: string) => join(STAGING_DIR, `${id}-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

function decodeText(name: string, data: Uint8Array) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
        throw new Error(`${name} isn't text`);
    }
}

async function install(id: string, allowNative: boolean, report: (p: StoreProgress) => void): Promise<StoreResult> {
    const entry = await getEntry(id);
    if (entry.minEviVersion && compareVersions(EVI_VERSION, entry.minEviVersion) < 0) {
        throw new Error(`${entry.name} needs Evi ${entry.minEviVersion} or newer, this is ${EVI_VERSION}`);
    }

    const dir = join(PLUGINS_DIR, id);
    const existing = existsSync(dir);
    if (existing && readMarker(dir)?.id !== id) {
        throw new Error(`A plugin folder named ${id} is already there and wasn't installed from the store. Remove it yourself to install this one.`);
    }
    if (entry.native && !allowNative) throw new Error(`${entry.name} runs with full access to your computer. Confirm that before installing it.`);

    // Download and verify everything in memory first: any failure leaves the disk untouched
    const names = Object.keys(entry.files) as StoreFileName[];
    const files = new Map<StoreFileName, Uint8Array>();
    for (const [i, name] of names.entries()) {
        report({ id, phase: "downloading", done: i, total: names.length });
        const download = await downloadHttps(entry.files[name]!.url, MAX_FILE_BYTES, { what: name, cache: "no-store" });
        if (!download.ok) throw new Error(`${name}: ${download.error}`);
        const badHash = await whyNotHash(name, download.body, entry.files[name]!.sha256);
        if (badHash) throw new Error(badHash);
        files.set(name, download.body);
    }

    report({ id, phase: "verifying", done: names.length, total: names.length });
    let manifest: unknown;
    try {
        manifest = JSON.parse(decodeText("manifest.json", files.get("manifest.json")!));
    } catch (err) {
        throw new Error(err instanceof SyntaxError ? "manifest.json isn't valid JSON" : (err as Error).message);
    }
    const badManifest = whyNotManifest(manifest, entry);
    if (badManifest) throw new Error(badManifest);
    for (const name of names) if (name !== "manifest.json") decodeText(name, files.get(name)!);

    report({ id, phase: "installing", done: names.length, total: names.length });
    mkdirSync(STAGING_DIR, { recursive: true });
    const staged = tempName(id, "new");
    const marker: StoreMarker = {
        id,
        version: entry.version,
        native: entry.native,
        registryUrl: cache!.url,
        files: Object.fromEntries(names.map(n => [n, entry.files[n]!.sha256])),
    };
    try {
        mkdirSync(staged);
        for (const [name, data] of files) writeFileSync(join(staged, name), data);
        writeFileSync(join(staged, STORE_MARKER), JSON.stringify(marker, null, 4));

        // Replace the old version by moving it aside, so a failed move puts it straight back
        const old = existing ? tempName(id, "old") : undefined;
        if (old) renameSync(dir, old);
        try {
            renameSync(staged, dir);
        } catch (err) {
            if (old) renameSync(old, dir);
            throw err;
        }
        if (old) rmSync(old, { recursive: true, force: true });
    } finally {
        rmSync(staged, { recursive: true, force: true });
    }

    // Installing a plugin the user removed earlier brings it back for good
    setRemoved(id, false);
    // Don't wait for the watcher: the renderer has the plugin by the time this resolves
    refreshUserPlugin(id);
    console.log(`[Evi] Store: ${existing ? "updated" : "installed"} ${id} ${entry.version}`);
    return { ok: true, id, version: entry.version };
}

/**
 * Removes any plugin: from the store, one Evi ships with, or one dropped into the plugins folder.
 * Its folder is deleted, and it's remembered as removed so Evi's updates don't put it back. A plugin
 * from the dev build output (the repo's own) can't be deleted from here, so it's hidden instead.
 */
function uninstall(id: string, report: (p: StoreProgress) => void): StoreResult {
    const loaded = pluginLocation(id);
    // The folder of a plugin in the user plugins folder, whatever it's named
    const inPlugins = (dir: string) => resolve(dirname(dir)) === resolve(PLUGINS_DIR);
    const dir = loaded?.source === "user" && inPlugins(loaded.dir) ? loaded.dir
        : existsSync(join(PLUGINS_DIR, id)) ? join(PLUGINS_DIR, id) : undefined;
    if (!dir && loaded?.source !== "dev") throw new Error(`${id} isn't installed`);
    const version = (dir && readMarker(dir)?.version) || loaded?.version || "";

    report({ id, phase: "removing", done: 0, total: 1 });
    if (dir) {
        mkdirSync(STAGING_DIR, { recursive: true });
        // One rename takes the whole plugin away at once, then the leftovers are deleted at leisure
        const trash = tempName(id, "removed");
        renameSync(dir, trash);
        refreshUserPlugin(basename(dir));
        rmSync(trash, { recursive: true, force: true });
    }
    setRemoved(id, true);
    hideDevPlugin(id);
    console.log(`[Evi] Store: removed ${id}`);
    return { ok: true, id, version };
}

// ---- themes -----------------------------------------------------------------------------------

async function installTheme(id: string, report: (p: StoreProgress) => void): Promise<StoreResult> {
    const entry = (await current()).themes.get(id);
    if (!entry) throw new Error(`${id} isn't in the store`);
    if (entry.minEviVersion && compareVersions(EVI_VERSION, entry.minEviVersion) < 0) {
        throw new Error(`${entry.name} needs Evi ${entry.minEviVersion} or newer, this is ${EVI_VERSION}`);
    }

    const file = storeThemeFile(id);
    const record = readThemesRecord();
    const path = join(THEMES_DIR, file);
    if (existsSync(path) && record[id]?.file !== file) {
        throw new Error(`A theme named ${file} is already there and wasn't installed from the store. Remove it yourself to install this one.`);
    }

    report({ id, phase: "downloading", done: 0, total: 1 });
    const download = await downloadHttps(entry.file.url, Math.min(MAX_FILE_BYTES, MAX_THEME_BYTES), { what: file, cache: "no-store" });
    if (!download.ok) throw new Error(`${file}: ${download.error}`);

    report({ id, phase: "verifying", done: 1, total: 1 });
    const badHash = await whyNotHash(file, download.body, entry.file.sha256);
    if (badHash) throw new Error(badHash);
    const badCss = whyNotCss(decodeText(file, download.body));
    if (badCss) throw new Error(badCss);

    report({ id, phase: "installing", done: 1, total: 1 });
    const updating = !!record[id];
    // Write then rename, so the theme watcher never reads half a file
    const tmp = join(THEMES_DIR, `.${file}.evi-tmp`);
    writeFileSync(tmp, download.body);
    renameSync(tmp, path);
    writeThemesRecord({ ...record, [id]: { version: entry.version, file } });

    reloadTheme(file);
    console.log(`[Evi] Store: ${updating ? "updated" : "installed"} theme ${id} ${entry.version}`);
    return { ok: true, id, version: entry.version };
}

function uninstallTheme(id: string, report: (p: StoreProgress) => void): StoreResult {
    const record = readThemesRecord();
    const installed = record[id];
    if (!installed || installed.file !== storeThemeFile(id)) throw new Error(`${id} wasn't installed from the store`);

    report({ id, phase: "removing", done: 0, total: 1 });
    rmSync(join(THEMES_DIR, installed.file), { force: true });
    delete record[id];
    writeThemesRecord(record);
    reloadTheme(installed.file);
    console.log(`[Evi] Store: uninstalled theme ${id}`);
    return { ok: true, id, version: installed.version };
}

// ---- screenshots ------------------------------------------------------------------------------

const images = new Map<string, Promise<StoreImageResult>>();

/**
 * Discord's page can't load images from arbitrary hosts, so main fetches screenshots and hands back
 * a data URL. Only URLs the registry itself lists: the page can't use this to fetch anything else.
 */
async function fetchImage(url: unknown): Promise<StoreImageResult> {
    if (typeof url !== "string") return { ok: false, error: "Not a URL" };
    try {
        if (!(await current()).images.has(url)) return { ok: false, error: "That image isn't in the store" };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }

    let pending = images.get(url);
    if (!pending) {
        pending = (async (): Promise<StoreImageResult> => {
            const download = await downloadHttps(url, MAX_IMAGE_BYTES, { what: "The image" });
            if (!download.ok) return download;
            const dataUrl = imageDataUrl(download.body);
            return dataUrl ? { ok: true, dataUrl } : { ok: false, error: "Not a PNG, JPEG, GIF or WebP image" };
        })();
        images.set(url, pending);
        // Failures aren't remembered, the next look tries again
        pending.then(r => !r.ok && images.delete(url));
    }
    return pending;
}

// ---- previews ---------------------------------------------------------------------------------

const previews = new Map<string, Promise<StorePreviewResult>>();

/**
 * A plugin's manifest and renderer code before it's installed, so its store page can say what it
 * can touch. The same download and checks as an install (registry hashes, manifest), and nothing is
 * written anywhere. Only plugins the registry lists: the page can't fetch anything else with this.
 */
async function previewPlugin(id: unknown): Promise<StorePreviewResult> {
    if (!isPluginId(id)) return { ok: false, error: "That isn't a valid plugin id" };
    let entry: RegistryEntry;
    try {
        entry = await getEntry(id);
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }

    const key = `${id}:${entry.files["manifest.json"].sha256}:${entry.files["index.js"].sha256}`;
    let pending = previews.get(key);
    if (!pending) {
        const text = async (name: "manifest.json" | "index.js") => {
            const file = entry.files[name];
            const download = await downloadHttps(file.url, MAX_FILE_BYTES, { what: name, cache: "no-store" });
            if (!download.ok) throw new Error(`${name}: ${download.error}`);
            const badHash = await whyNotHash(name, download.body, file.sha256);
            if (badHash) throw new Error(badHash);
            return decodeText(name, download.body);
        };
        pending = (async (): Promise<StorePreviewResult> => {
            try {
                const [manifestText, code] = await Promise.all([text("manifest.json"), text("index.js")]);
                let manifest: any;
                try {
                    manifest = JSON.parse(manifestText);
                } catch {
                    throw new Error("manifest.json isn't valid JSON");
                }
                const badManifest = whyNotManifest(manifest, entry);
                if (badManifest) throw new Error(badManifest);
                return { ok: true, code, manifest: { native: entry.native, chromiumSwitches: cleanSwitches(manifest.chromiumSwitches) } };
            } catch (err) {
                return { ok: false, error: (err as Error)?.message ?? String(err) };
            }
        })();
        // A few recent ones: going back and forth between store pages doesn't download again
        if (previews.size >= 20) previews.delete(previews.keys().next().value!);
        previews.set(key, pending);
        pending.then(r => !r.ok && previews.delete(key));
    }
    return pending;
}

/** Runs one operation per item at a time and turns thrown errors into results */
async function exclusive(id: unknown, run: (id: string) => Promise<StoreResult> | StoreResult, kind = "plugin"): Promise<StoreResult> {
    if (!isPluginId(id)) return { ok: false, error: `That isn't a valid ${kind} id` };
    const key = `${kind}:${id}`;
    if (busy.has(key)) return { ok: false, error: `${id} is already being changed` };
    busy.add(key);
    try {
        return await run(id);
    } catch (err) {
        console.warn(`[Evi] Store: ${kind} ${id} failed`, err);
        return { ok: false, error: (err as Error)?.message ?? String(err) };
    } finally {
        busy.delete(key);
    }
}

function progressTo(sender: WebContents, kind: StoreProgress["kind"] = "plugin") {
    return (progress: StoreProgress) => {
        if (!sender.isDestroyed()) sender.send(IPC.STORE_PROGRESS, { ...progress, kind });
    };
}

export function initStore() {
    // Leftovers of an install that was cut off (Discord quit mid-way)
    rmSync(STAGING_DIR, { recursive: true, force: true });

    ipcMain.handle(IPC.STORE_LIST, () => fetchRegistry());
    ipcMain.handle(IPC.STORE_INSTALL, (e, id: unknown, options?: { allowNative?: unknown; }) =>
        exclusive(id, id => install(id, options?.allowNative === true, progressTo(e.sender))));
    ipcMain.handle(IPC.STORE_UNINSTALL, (e, id: unknown) => exclusive(id, id => uninstall(id, progressTo(e.sender))));
    ipcMain.handle(IPC.STORE_THEME_INSTALL, (e, id: unknown) => exclusive(id, id => installTheme(id, progressTo(e.sender, "theme")), "theme"));
    ipcMain.handle(IPC.STORE_THEME_UNINSTALL, (e, id: unknown) => exclusive(id, id => uninstallTheme(id, progressTo(e.sender, "theme")), "theme"));
    ipcMain.handle(IPC.STORE_IMAGE, (_, url: unknown) => fetchImage(url));
    ipcMain.handle(IPC.STORE_PREVIEW, (_, id: unknown) => previewPlugin(id));
}
