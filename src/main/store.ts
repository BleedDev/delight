/**
 * The plugin store: reads a registry over https, and installs, updates and uninstalls plugins from it.
 *
 * The renderer only ever names a plugin id. Where files come from and what they must hash to is
 * decided here, from the registry this process downloaded itself, so nothing in Discord's page can
 * point an install at other files. Every file is verified before anything touches the plugins folder,
 * and the finished folder is moved into place with a single rename, so the plugin watcher never sees
 * half a plugin.
 */
import { IPC, PluginManifest } from "@shared/ipc";
import {
    compareVersions,
    DEFAULT_REGISTRY_URL,
    InstalledPlugin,
    isPluginId,
    MAX_FILE_BYTES,
    MAX_REGISTRY_BYTES,
    parseRegistry,
    RegistryEntry,
    STORE_MARKER,
    StoreFileName,
    StoreListing,
    StoreMarker,
    StoreProgress,
    StoreResult,
    whyNotHash,
    whyNotManifest,
    whyNotStoreUrl,
} from "@shared/store";
import { ipcMain, WebContents } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { downloadHttps } from "./download";
import { DATA_DIR, PLUGINS_DIR } from "./paths";
import { refreshUserPlugin } from "./plugins";

/** Outside the plugins folder, so the plugin watcher never loads a half-written plugin */
const STAGING_DIR = join(DATA_DIR, "store-staging");
/** `{ "registryUrl": "https://…" }`, edited by hand. The renderer can't change it. */
const CONFIG_FILE = join(DATA_DIR, "store.json");

let cache: { url: string; entries: Map<string, RegistryEntry>; } | undefined;
const busy = new Set<string>();

export function getRegistryUrl() {
    if (process.env.DELIGHT_STORE_URL) return process.env.DELIGHT_STORE_URL;
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

async function fetchRegistry(): Promise<StoreListing> {
    const registryUrl = getRegistryUrl();
    const installed = listInstalled();
    const fail = (error: string): StoreListing => ({ ok: false, registryUrl, error, installed });

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

    cache = { url: registryUrl, entries: new Map(parsed.registry.plugins.map(p => [p.id, p])) };
    if (parsed.problems.length) console.warn(`[Delight] Store registry: skipped ${parsed.problems.length} entries`, parsed.problems);
    return { ok: true, registryUrl, plugins: parsed.registry.plugins, problems: parsed.problems, installed };
}

async function getEntry(id: string) {
    // Always the registry currently configured, a stale cache from another URL doesn't count
    if (!cache || cache.url !== getRegistryUrl()) {
        const listing = await fetchRegistry();
        if (!listing.ok) throw new Error(listing.error);
    }
    const entry = cache!.entries.get(id);
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
    if (entry.minDelightVersion && compareVersions(DELIGHT_VERSION, entry.minDelightVersion) < 0) {
        throw new Error(`${entry.name} needs Delight ${entry.minDelightVersion} or newer, this is ${DELIGHT_VERSION}`);
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

    // Don't wait for the watcher: the renderer has the plugin by the time this resolves
    refreshUserPlugin(id);
    console.log(`[Delight] Store: ${existing ? "updated" : "installed"} ${id} ${entry.version}`);
    return { ok: true, id, version: entry.version };
}

function uninstall(id: string, report: (p: StoreProgress) => void): StoreResult {
    const dir = join(PLUGINS_DIR, id);
    const marker = readMarker(dir);
    if (!existsSync(dir)) throw new Error(`${id} isn't installed`);
    if (marker?.id !== id) throw new Error(`${id} wasn't installed from the store, remove its folder yourself`);

    report({ id, phase: "removing", done: 0, total: 1 });
    mkdirSync(STAGING_DIR, { recursive: true });
    // One rename takes the whole plugin away at once, then the leftovers are deleted at leisure
    const trash = tempName(id, "removed");
    renameSync(dir, trash);
    refreshUserPlugin(id);
    rmSync(trash, { recursive: true, force: true });
    console.log(`[Delight] Store: uninstalled ${id}`);
    return { ok: true, id, version: marker.version };
}

/** Runs one operation per plugin at a time and turns thrown errors into results */
async function exclusive(id: unknown, run: (id: string) => Promise<StoreResult> | StoreResult): Promise<StoreResult> {
    if (!isPluginId(id)) return { ok: false, error: "That isn't a valid plugin id" };
    if (busy.has(id)) return { ok: false, error: `${id} is already being changed` };
    busy.add(id);
    try {
        return await run(id);
    } catch (err) {
        console.warn(`[Delight] Store: ${id} failed`, err);
        return { ok: false, error: (err as Error)?.message ?? String(err) };
    } finally {
        busy.delete(id);
    }
}

function progressTo(sender: WebContents) {
    return (progress: StoreProgress) => {
        if (!sender.isDestroyed()) sender.send(IPC.STORE_PROGRESS, progress);
    };
}

export function initStore() {
    // Leftovers of an install that was cut off (Discord quit mid-way)
    rmSync(STAGING_DIR, { recursive: true, force: true });

    ipcMain.handle(IPC.STORE_LIST, () => fetchRegistry());
    ipcMain.handle(IPC.STORE_INSTALL, (e, id: unknown, options?: { allowNative?: unknown; }) =>
        exclusive(id, id => install(id, options?.allowNative === true, progressTo(e.sender))));
    ipcMain.handle(IPC.STORE_UNINSTALL, (e, id: unknown) => exclusive(id, id => uninstall(id, progressTo(e.sender))));
}
