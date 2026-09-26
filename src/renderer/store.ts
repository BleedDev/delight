import type { InstalledPlugin, RegistryEntry, StoreProgress, StoreResult } from "@shared/store";

import { Logger } from "./logger";
import { Native } from "./native";
import { PluginManager } from "./plugins/manager";

export type StoreOp =
    | { type: "busy"; label: string; }
    | { type: "done"; message: string; }
    | { type: "error"; error: string; };

export interface StoreState {
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
    registryUrl?: string;
    plugins: RegistryEntry[];
    /** Entries the registry listed but that failed validation */
    problems: string[];
    installed: Record<string, InstalledPlugin>;
    /** Latest operation per plugin id */
    ops: Record<string, StoreOp>;
}

const logger = new Logger("Store", "#f0a35e");
const listeners = new Set<() => void>();
let state: StoreState = { status: "idle", plugins: [], problems: [], installed: {}, ops: {} };
let listening = false;

function set(next: Partial<StoreState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

function setOp(id: string, op: StoreOp | undefined) {
    const ops = { ...state.ops };
    if (op) ops[id] = op;
    else delete ops[id];
    set({ ops });
}

const phaseLabel = ({ phase, done, total }: StoreProgress) => ({
    downloading: `Downloading file ${Math.min(done + 1, total)} of ${total}…`,
    verifying: "Checking files…",
    installing: "Installing…",
    removing: "Removing…",
})[phase];

function listen() {
    if (listening) return;
    listening = true;
    Native.onStoreProgress?.(progress => {
        if (state.ops[progress.id]?.type === "busy") setOp(progress.id, { type: "busy", label: phaseLabel(progress) });
    });
}

async function run(id: string, label: string, action: () => Promise<StoreResult>) {
    listen();
    if (state.ops[id]?.type === "busy") return { ok: false, error: "Already in progress" } as StoreResult;
    setOp(id, { type: "busy", label });
    let result: StoreResult;
    try {
        result = await action();
    } catch (err) {
        result = { ok: false, error: String((err as Error)?.message ?? err) };
    }
    if (!result.ok) {
        logger.warn(`${id}: ${result.error}`);
        setOp(id, { type: "error", error: result.error });
    }
    return result;
}

export const Store = {
    /** Downloads the registry (main does the fetching and validation) */
    async refresh() {
        listen();
        set({ status: "loading", error: undefined });
        try {
            const listing = await Native.storeList();
            const installed = Object.fromEntries(listing.installed.map(p => [p.id, p]));
            if (!listing.ok) return set({ status: "error", error: listing.error, registryUrl: listing.registryUrl, installed });
            set({ status: "ready", registryUrl: listing.registryUrl, plugins: listing.plugins, problems: listing.problems, installed });
        } catch (err) {
            set({ status: "error", error: String((err as Error)?.message ?? err) });
        }
    },

    /**
     * Installs or updates a plugin and turns it on. Native plugins need `allowNative`, which the UI
     * only passes after the user confirmed they trust it with full access to their computer.
     */
    async install(id: string, options: { allowNative?: boolean; } = {}) {
        const updating = !!state.installed[id];
        const result = await run(id, "Starting…", () => Native.storeInstall(id, options));
        if (!result.ok) return result;

        set({ installed: { ...state.installed, [id]: { id, version: result.version, fromStore: true } } });
        // Main announced the plugin before answering, so the manager has it by now
        if (!updating && PluginManager.get(id)) await PluginManager.setEnabled(id, true);
        setOp(id, { type: "done", message: updating ? `Updated to v${result.version}` : "Installed and turned on" });
        return result;
    },

    async uninstall(id: string) {
        const result = await run(id, "Removing…", () => Native.storeUninstall(id));
        if (!result.ok) return result;

        const installed = { ...state.installed };
        delete installed[id];
        set({ installed });
        setOp(id, { type: "done", message: "Uninstalled" });
        return result;
    },

    getSnapshot: () => state,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
};
