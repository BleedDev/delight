import { starKey, StarsSnapshot } from "@shared/stars";
import { InstalledPlugin, InstalledTheme, RegistryEntry, storeAction, StoreProgress, StoreResult, ThemeEntry } from "@shared/store";

import { Logger } from "./logger";
import { Native } from "./native";
import { PluginManager } from "./plugins/manager";
import { SafeMode } from "./safeMode";
import { Settings } from "./settings";
import { Themes } from "./themes";
import { showToast } from "./toolkit/toasts";

export type StoreKind = "plugin" | "theme";

export type StoreOp =
    | { type: "busy"; label: string; }
    | { type: "done"; message: string; }
    | { type: "error"; error: string; };

export interface StoreState {
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
    registryUrl?: string;
    plugins: RegistryEntry[];
    themes: ThemeEntry[];
    /** Entries the registry listed but that failed validation */
    problems: string[];
    installed: Record<string, InstalledPlugin>;
    installedThemes: Record<string, InstalledTheme>;
    /** Latest operation per plugin id */
    ops: Record<string, StoreOp>;
    /** Latest operation per theme id */
    themeOps: Record<string, StoreOp>;
    /** Set while Update all runs */
    updatingAll?: StoreKind;
    /** Star counts and this install's stars. Missing while loading or when the server is unreachable. */
    stars?: StarsSnapshot;
}

export interface UpdateAllResult {
    updated: string[];
    failed: string[];
    /** Full-access plugins left alone because nobody confirmed them */
    skippedNative: string[];
}

const logger = new Logger("Store", "#f0a35e");
const listeners = new Set<() => void>();
let state: StoreState = { status: "idle", plugins: [], themes: [], problems: [], installed: {}, installedThemes: {}, ops: {}, themeOps: {} };
let listening = false;

function set(next: Partial<StoreState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

const opsKey = (kind: StoreKind) => kind === "theme" ? "themeOps" : "ops";

function setOp(kind: StoreKind, id: string, op: StoreOp | undefined) {
    const ops = { ...state[opsKey(kind)] };
    if (op) ops[id] = op;
    else delete ops[id];
    set({ [opsKey(kind)]: ops });
}

const phaseLabel = ({ phase, done, total }: StoreProgress) => ({
    downloading: total > 1 ? `Downloading file ${Math.min(done + 1, total)} of ${total}…` : "Downloading…",
    verifying: "Checking files…",
    installing: "Installing…",
    removing: "Removing…",
})[phase];

function listen() {
    if (listening) return;
    listening = true;
    Native.onStoreProgress?.(progress => {
        const kind = progress.kind ?? "plugin";
        if (state[opsKey(kind)][progress.id]?.type === "busy") setOp(kind, progress.id, { type: "busy", label: phaseLabel(progress) });
    });
}

async function run(kind: StoreKind, id: string, label: string, action: () => Promise<StoreResult>) {
    listen();
    if (state[opsKey(kind)][id]?.type === "busy") return { ok: false, error: "Already in progress" } as StoreResult;
    setOp(kind, id, { type: "busy", label });
    let result: StoreResult;
    try {
        result = await action();
    } catch (err) {
        result = { ok: false, error: String((err as Error)?.message ?? err) };
    }
    if (!result.ok) {
        logger.warn(`${kind} ${id}: ${result.error}`);
        setOp(kind, id, { type: "error", error: result.error });
    }
    return result;
}

/**
 * What's installed under a plugin id. Main only looks in the plugins folder, so a plugin loaded from
 * somewhere else (a dev build) counts as installed outside the store instead of being offered again.
 */
function installedPlugin(id: string): InstalledPlugin | undefined {
    const listed = state.installed[id];
    if (listed) return listed;
    const loaded = PluginManager.get(id);
    return loaded ? { id, version: loaded.manifest.version, fromStore: false } : undefined;
}

const images = new Map<string, Promise<string | null>>();
let autoTimer: ReturnType<typeof setInterval> | undefined;
const AUTO_UPDATE_EVERY = 6 * 60 * 60 * 1000;

export const Store = {
    /** Downloads the registry (main does the fetching and validation) */
    async refresh() {
        listen();
        set({ status: "loading", error: undefined });
        try {
            const listing = await Native.storeList();
            const installed = Object.fromEntries(listing.installed.map(p => [p.id, p]));
            // Mains older than the theme store don't send these
            const installedThemes = Object.fromEntries((listing.installedThemes ?? []).map(t => [t.id, t]));
            if (!listing.ok) return set({ status: "error", error: listing.error, registryUrl: listing.registryUrl, installed, installedThemes });
            set({ status: "ready", registryUrl: listing.registryUrl, plugins: listing.plugins, themes: listing.themes ?? [], problems: listing.problems, installed, installedThemes });
            void Store.refreshStars();
        } catch (err) {
            set({ status: "error", error: String((err as Error)?.message ?? err) });
        }
    },

    installedPlugin,

    /** Loads star counts. Stars are extra: when the server is down the store works without them. */
    async refreshStars() {
        const result = await Native.getStars?.().catch(() => undefined);
        if (result?.ok) set({ stars: { counts: result.counts, mine: result.mine } });
        else if (result) logger.warn(`Stars unavailable: ${result.error}`);
    },

    stars: (kind: StoreKind, id: string) => state.stars?.counts[starKey(kind, id)] ?? 0,

    isStarred: (kind: StoreKind, id: string) => !!state.stars?.mine.includes(starKey(kind, id)),

    /** Stars or unstars right away, and puts it back if the server says no */
    async toggleStar(kind: StoreKind, id: string) {
        const stars = state.stars;
        if (!stars || !Native.setStar) return;
        const key = starKey(kind, id);
        const starred = !stars.mine.includes(key);
        const apply = (on: boolean, count: number) => {
            const current = state.stars ?? stars;
            set({
                stars: {
                    counts: { ...current.counts, [key]: Math.max(0, count) },
                    mine: on ? [...new Set([...current.mine, key])] : current.mine.filter(k => k !== key),
                },
            });
        };
        const before = stars.counts[key] ?? 0;
        apply(starred, before + (starred ? 1 : -1));
        const result = await Native.setStar(kind, id, starred).catch(err => ({ ok: false as const, error: String(err) }));
        if (result.ok) apply(result.starred, result.count);
        else {
            logger.warn(`Couldn't ${starred ? "star" : "unstar"} ${key}: ${result.error}`);
            apply(!starred, before);
        }
    },

    /** What the store offers for a plugin id, or undefined when the registry doesn't list it */
    pluginAction(id: string) {
        const entry = state.plugins.find(p => p.id === id);
        return entry && storeAction(entry, installedPlugin(id), EVI_VERSION);
    },

    themeAction(id: string) {
        const entry = state.themes.find(t => t.id === id);
        return entry && storeAction(entry, state.installedThemes[id], EVI_VERSION);
    },

    /**
     * Installs or updates a plugin and turns it on. Native plugins need `allowNative`, which the UI
     * only passes after the user confirmed they trust it with full access to their computer.
     */
    async install(id: string, options: { allowNative?: boolean; } = {}) {
        const updating = !!state.installed[id];
        const result = await run("plugin", id, "Starting…", () => Native.storeInstall(id, options));
        if (!result.ok) return result;

        set({ installed: { ...state.installed, [id]: { id, version: result.version, fromStore: true } } });
        // Main announced the plugin before answering, so the manager has it by now
        if (!updating && PluginManager.get(id)) await PluginManager.setEnabled(id, true);
        setOp("plugin", id, { type: "done", message: updating ? `Updated to v${result.version}` : "Installed and turned on" });
        return result;
    },

    async uninstall(id: string) {
        const result = await run("plugin", id, "Removing…", () => Native.storeUninstall(id));
        if (!result.ok) return result;

        const installed = { ...state.installed };
        delete installed[id];
        set({ installed });
        setOp("plugin", id, { type: "done", message: "Uninstalled" });
        return result;
    },

    /** Installs or updates a theme; a new one is turned on straight away */
    async installTheme(id: string) {
        const updating = !!state.installedThemes[id];
        const result = await run("theme", id, "Starting…", () => Native.storeInstallTheme(id));
        if (!result.ok) return result;

        const file = `${id}.css`;
        set({ installedThemes: { ...state.installedThemes, [id]: { id, version: result.version, file, fromStore: true } } });
        if (!updating) Themes.setEnabled(file, true);
        setOp("theme", id, { type: "done", message: updating ? `Updated to v${result.version}` : "Installed and turned on" });
        return result;
    },

    async uninstallTheme(id: string) {
        const file = state.installedThemes[id]?.file;
        const result = await run("theme", id, "Removing…", () => Native.storeUninstallTheme(id));
        if (!result.ok) return result;

        const installedThemes = { ...state.installedThemes };
        delete installedThemes[id];
        set({ installedThemes });
        // Don't leave a dangling "on" behind for a file that's gone
        if (file && Themes.isEnabled(file)) Themes.setEnabled(file, false);
        setOp("theme", id, { type: "done", message: "Uninstalled" });
        return result;
    },

    /** Everything with an update, one at a time. Full-access plugins only with `includeNative`. */
    async updateAll(kind: StoreKind, { includeNative = false } = {}): Promise<UpdateAllResult> {
        const result: UpdateAllResult = { updated: [], failed: [], skippedNative: [] };
        if (state.updatingAll) return result;
        set({ updatingAll: kind });
        try {
            if (kind === "plugin") {
                for (const entry of state.plugins) {
                    if (Store.pluginAction(entry.id) !== "update") continue;
                    if (entry.native && !includeNative) {
                        result.skippedNative.push(entry.name);
                        continue;
                    }
                    const r = await Store.install(entry.id, { allowNative: entry.native });
                    (r.ok ? result.updated : result.failed).push(entry.name);
                }
            } else {
                for (const entry of state.themes) {
                    if (Store.themeAction(entry.id) !== "update") continue;
                    const r = await Store.installTheme(entry.id);
                    (r.ok ? result.updated : result.failed).push(entry.name);
                }
            }
        } finally {
            set({ updatingAll: undefined });
        }
        return result;
    },

    /** Checks the store and quietly installs updates, saying what changed in a toast */
    async autoUpdate() {
        if (!Settings.data.autoUpdate || SafeMode.active) return;
        await Store.refresh();
        if (state.status !== "ready") return;

        const plugins = await Store.updateAll("plugin");
        const themes = await Store.updateAll("theme");
        const updated = [...plugins.updated, ...themes.updated];
        if (updated.length) {
            logger.info(`Auto-updated ${updated.join(", ")}`);
            showToast(updated.length === 1 ? `Evi updated ${updated[0]}` : `Evi updated ${updated.length} plugins and themes`, { type: "success" });
        }
        if (plugins.skippedNative.length) {
            showToast(`${plugins.skippedNative.join(", ")} ${plugins.skippedNative.length === 1 ? "has an update" : "have updates"} waiting for your OK in Evi's Plugins`, { duration: 6000 });
        }
    },

    /** Runs auto-update now (after startup settles) and every few hours while it's on */
    scheduleAutoUpdate(delay = 20_000) {
        clearInterval(autoTimer);
        autoTimer = undefined;
        if (!Settings.data.autoUpdate) return;
        setTimeout(() => void Store.autoUpdate(), delay);
        autoTimer = setInterval(() => void Store.autoUpdate(), AUTO_UPDATE_EVERY);
    },

    setAutoUpdate(on: boolean) {
        Settings.update(d => {
            d.autoUpdate = on;
        });
        Store.scheduleAutoUpdate(1000);
    },

    /** A screenshot from the registry as a data URL, or null when it can't be shown */
    image(url: string) {
        let pending = images.get(url);
        if (!pending) {
            pending = (Native.storeImage?.(url) ?? Promise.resolve({ ok: false as const, error: "Not supported" }))
                .then(r => r.ok ? r.dataUrl : null, () => null);
            images.set(url, pending);
            pending.then(r => r === null && images.delete(url));
        }
        return pending;
    },

    getSnapshot: () => state,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
};
