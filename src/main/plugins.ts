import type { NativeContext, NativePlugin } from "@evi/api/native";
import { IPC, isPluginEnabled, PluginChange, PluginManifest, PluginPayload } from "@shared/ipc";
import { parseRemovedPlugins, REMOVED_PLUGINS_FILE, RETIRED_PLUGINS, STORE_MARKER } from "@shared/store";
import { ipcMain, session, webContents } from "electron";
import { existsSync, FSWatcher, readdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from "fs";
import { join, resolve, sep } from "path";

import { DATA_DIR, PLUGINS_DIR } from "./paths";
import { addRequestFilter } from "./requests";
import { SafeMode } from "./safeMode";
import { settings } from "./settings";

interface LoadedPlugin extends PluginPayload {
    dir: string;
    /** Everything that makes up the plugin on disk, to skip reloads when nothing changed */
    signature: string;
}

interface NativeInstance {
    module: NativePlugin;
    running: boolean;
    disposers: (() => void)[];
}

type Source = PluginPayload["source"];

const roots: { dir: string; source: Source; }[] = [{ dir: PLUGINS_DIR, source: "user" }];
// DELIGHT_DEV_PLUGINS: set by dev loaders installed before the rename to Evi
const devPlugins = process.env.EVI_DEV_PLUGINS ?? process.env.DELIGHT_DEV_PLUGINS;
if (devPlugins) roots.push({ dir: devPlugins, source: "dev" });

const plugins = new Map<string, LoadedPlugin>();
const natives = new Map<string, NativeInstance>();

// ---- removed and retired plugins --------------------------------------------------------------

const REMOVED_FILE = join(DATA_DIR, REMOVED_PLUGINS_FILE);
let removed: Set<string> | undefined;

function removedPlugins() {
    if (!removed) {
        try {
            removed = parseRemovedPlugins(readFileSync(REMOVED_FILE, "utf8"));
        } catch {
            removed = new Set();
        }
    }
    return removed;
}

/** Remembers (or forgets) that the user removed a plugin, so Evi's updates don't bring it back */
export function setRemoved(id: string, isRemoved: boolean) {
    const list = removedPlugins();
    if (list.has(id) === isRemoved) return;
    if (isRemoved) list.add(id);
    else list.delete(id);
    try {
        writeFileSync(REMOVED_FILE + ".tmp", JSON.stringify([...list].sort(), null, 4));
        renameSync(REMOVED_FILE + ".tmp", REMOVED_FILE);
    } catch (err) {
        console.error("[Evi] Couldn't save the removed plugins list", err);
    }
}

/**
 * Whether a plugin read from disk should be skipped: an official one that's now part of Evi (unless
 * the store installed it), or, in the dev build output, one the user removed. The dev output is the
 * repo's own build, so it can't be deleted from here; it's hidden instead.
 */
function skipped(id: string, dir: string, source: Source) {
    if (RETIRED_PLUGINS.includes(id) && !existsSync(join(dir, STORE_MARKER))) return true;
    return source === "dev" && removedPlugins().has(id);
}

/** Where a loaded plugin came from, for removing it */
export function pluginLocation(id: string) {
    const plugin = plugins.get(id);
    return plugin && { dir: plugin.dir, source: plugin.source, version: plugin.manifest.version };
}

/** Takes a dev build plugin out of the page, after it's been marked removed */
export function hideDevPlugin(id: string) {
    const plugin = plugins.get(id);
    if (plugin?.source !== "dev") return;
    stopNative(id);
    natives.delete(id);
    plugins.delete(id);
    broadcast({ type: "remove", id });
}

function readPlugin(dir: string, source: Source): LoadedPlugin | null {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) return null;

    try {
        const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (skipped(manifest.id, dir, source)) return null;
        const code = readFileSync(join(dir, manifest.main ?? "index.js"), "utf8");
        const native = manifest.native ? readFileSync(join(dir, manifest.native), "utf8") : "";
        return { manifest, code, source, dir, signature: JSON.stringify(manifest) + code + native };
    } catch (err) {
        console.error(`[Evi] Failed to read plugin at ${dir}`, err);
        return null;
    }
}

function toPayload({ dir: _, signature: __, ...payload }: LoadedPlugin): PluginPayload {
    return payload;
}

// ---- native modules ---------------------------------------------------------------------------

function loadNative(plugin: LoadedPlugin) {
    if (!plugin.manifest.native) return;

    const existing = natives.get(plugin.manifest.id);
    if (existing) return existing;

    const file = resolve(plugin.dir, plugin.manifest.native);
    delete require.cache[file];
    try {
        const mod = require(file);
        const instance: NativeInstance = { module: mod.default ?? mod, running: false, disposers: [] };
        natives.set(plugin.manifest.id, instance);
        return instance;
    } catch (err) {
        console.error(`[Evi] Failed to load native module of ${plugin.manifest.id}`, err);
    }
}

function startNative(id: string) {
    // Plugins are listed in safe mode, but none of their code runs
    if (SafeMode.active) return;
    const plugin = plugins.get(id);
    const native = plugin && loadNative(plugin);
    if (!plugin || !native || native.running) return;

    const ctx: NativeContext = {
        pluginId: id,
        pluginDir: plugin.dir,
        dataDir: DATA_DIR,
        onBeforeRequest: filter => {
            const remove = addRequestFilter(session.defaultSession, filter);
            native.disposers.push(remove);
            return remove;
        },
        onDispose: fn => void native.disposers.push(fn),
    };

    native.running = true;
    try {
        native.module.start?.(ctx);
    } catch (err) {
        console.error(`[Evi] Native start of ${id} failed`, err);
        stopNative(id);
    }
}

function stopNative(id: string) {
    const native = natives.get(id);
    if (!native?.running) return;

    native.running = false;
    try {
        native.module.stop?.();
    } catch (err) {
        console.error(`[Evi] Native stop of ${id} failed`, err);
    }
    for (const dispose of native.disposers.splice(0).reverse()) {
        try { dispose(); } catch { }
    }
}

// ---- hot reload -------------------------------------------------------------------------------

function broadcast(change: PluginChange) {
    for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) wc.send(IPC.PLUGIN_CHANGED, change);
    }
}

function reloadFolder(root: string, source: Source, folder: string) {
    const dir = join(root, folder);
    const previous = [...plugins.values()].find(p => p.dir === dir);
    const next = readPlugin(dir, source);
    // Editors and builds touch files without changing them, don't restart plugins for that
    if (previous && next && previous.signature === next.signature) return;

    let restartNative = false;
    if (previous) {
        const { id } = previous.manifest;
        restartNative = natives.get(id)?.running ?? false;
        stopNative(id);
        natives.delete(id);
        plugins.delete(id);
        if (next?.manifest.id !== id) broadcast({ type: "remove", id });
    }

    if (!next) return;
    plugins.set(next.manifest.id, next);
    SafeMode.recordChange({ kind: "plugin", id: next.manifest.id, action: previous ? "updated" : "installed" });
    // Plugins added or re-enabled while Discord runs need their native side started too
    if (restartNative || isPluginEnabled(settings, next.manifest)) startNative(next.manifest.id);
    broadcast({ type: "upsert", plugin: toPayload(next) });
}

/** Re-reads every plugin folder under a root, including ones that disappeared */
function rescanRoot(root: string, source: Source) {
    const folders = new Set(existsSync(root) ? readdirSync(root) : []);
    for (const plugin of plugins.values()) {
        if (plugin.dir.startsWith(root + sep)) folders.add(plugin.dir.slice(root.length + 1).split(sep)[0]);
    }
    for (const folder of folders) reloadFolder(root, source, folder);
}

function watchRoot(root: string, source: Source) {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const start = () => {
        let watcher: FSWatcher;
        try {
            watcher = watch(root, { recursive: true }, (_event, filename) => {
                if (!filename) return;
                const folder = filename.split(sep)[0];
                // Builds write several files in a row, reload once they settle
                clearTimeout(pending.get(folder));
                pending.set(folder, setTimeout(() => {
                    pending.delete(folder);
                    reloadFolder(root, source, folder);
                }, 150));
            });
        } catch {
            return void setTimeout(start, 2000);
        }

        // On Windows, deleting a watched subfolder errors the watcher and it stops for good.
        // Without this handler the error was swallowed and hot reload silently died.
        watcher.on("error", err => {
            console.warn("[Evi] Plugin watcher failed, restarting it", err);
            watcher.close();
            setTimeout(() => {
                rescanRoot(root, source);
                start();
            }, 500);
        });
    };

    start();
}

// ---- chromium switches ------------------------------------------------------------------------

/**
 * Runs before Electron is ready, the only time command line switches still apply.
 * Reads manifests directly since the plugin host starts later.
 */
export function applyChromiumSwitches() {
    if (SafeMode.active) return;
    const { app } = require("electron") as typeof import("electron");
    for (const { dir } of roots) {
        if (!existsSync(dir)) continue;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            try {
                const manifest: PluginManifest = JSON.parse(readFileSync(join(dir, entry.name, "manifest.json"), "utf8"));
                if (!manifest.chromiumSwitches || !isPluginEnabled(settings, manifest)) continue;
                for (const [name, value] of Object.entries(manifest.chromiumSwitches)) {
                    if (value === true) app.commandLine.appendSwitch(name);
                    else app.commandLine.appendSwitch(name, value);
                    console.log(`[Evi] ${manifest.id}: --${name}${value === true ? "" : "=" + value}`);
                }
            } catch { }
        }
    }
}

// ---- setup ------------------------------------------------------------------------------------

/** Picks up a change to a folder in the user plugins dir now, without waiting for the watcher */
export function refreshUserPlugin(folder: string) {
    reloadFolder(PLUGINS_DIR, "user", folder);
}

export function getPluginPayloads() {
    return [...plugins.values()].map(toPayload);
}

export function initPlugins() {
    // Left over from before these became part of Evi; a store-installed copy stays
    for (const id of RETIRED_PLUGINS) {
        const dir = join(PLUGINS_DIR, id);
        if (existsSync(dir) && !existsSync(join(dir, STORE_MARKER))) rmSync(dir, { recursive: true, force: true });
    }

    for (const { dir, source } of roots) {
        if (!existsSync(dir)) continue;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            // Later roots (dev) win over earlier ones (user) for the same id
            const plugin = readPlugin(join(dir, entry.name), source);
            if (plugin) plugins.set(plugin.manifest.id, plugin);
        }
        watchRoot(dir, source);
    }

    // Natives of enabled plugins start immediately so things like request blocking cover startup
    for (const plugin of plugins.values()) {
        if (isPluginEnabled(settings, plugin.manifest)) startNative(plugin.manifest.id);
    }
    // Discord crashed repeatedly while running: whatever native code is running goes too
    SafeMode.onEnter(() => {
        for (const id of natives.keys()) stopNative(id);
    });

    ipcMain.handle(IPC.PLUGIN_NATIVE_STATE, (_, id: string, running: boolean) => {
        running ? startNative(id) : stopNative(id);
    });

    ipcMain.handle(IPC.PLUGIN_NATIVE_CALL, (_, id: string, method: string, args: unknown[]) => {
        const plugin = plugins.get(id);
        if (SafeMode.active) throw new Error(`Plugin ${id} can't run in safe mode`);
        const native = plugin && loadNative(plugin);
        const fn = native?.module[method];
        if (!native || typeof fn !== "function" || method === "start" || method === "stop") {
            throw new Error(`Plugin ${id} has no native method ${method}`);
        }
        return fn.apply(native.module, args);
    });
}
