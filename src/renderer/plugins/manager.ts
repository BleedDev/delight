import * as api from "@delight/api";
import { isPluginEnabled, PluginChange, PluginManifest, PluginPayload } from "@shared/ipc";

import { Logger } from "../logger";
import { Native } from "../native";
import { loadedModulesMatching, replaceLive } from "../patching/live";
import { getPatchRecords, registerPatches, SourcePatch, unregisterPatches } from "../patching/source";
import * as JsxRuntime from "../react/jsx-runtime";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { React, ReactDOM } from "../webpack/common";
import { wreq } from "../webpack/runtime";
import { PluginContext } from "./context";
import type { PluginDefinition } from "./types";

export interface PluginState {
    manifest: PluginManifest;
    source: PluginPayload["source"];
    definition?: PluginDefinition;
    ctx?: PluginContext;
    running: boolean;
    /** Evaluation or start error */
    error?: string;
    /** Source patch changes that couldn't be applied live, see patching/live.ts */
    needsReload: boolean;
    reloadReason?: string;
    patchesRegistered: boolean;
}

const logger = new Logger("Plugins", "#ff6fae");
const plugins = new Map<string, PluginState>();
const listeners = new Set<() => void>();
let snapshot: PluginState[] = [];
let ready = false;

function emit() {
    snapshot = [...plugins.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    for (const listener of listeners) listener();
}

// ---- evaluation -------------------------------------------------------------------------------

const requireMap: Record<string, unknown> = {
    "@delight/api": api,
    "react": React,
    "react-dom": ReactDOM,
    "react/jsx-runtime": JsxRuntime,
    "react/jsx-dev-runtime": JsxRuntime,
};

function evaluate({ manifest, code }: PluginPayload): PluginDefinition {
    const module = { exports: {} as any };
    const require = (name: string) => {
        if (name in requireMap) return requireMap[name];
        throw new Error(`${manifest.id} tried to require "${name}". Only @delight/api and react are provided, bundle anything else.`);
    };

    const fn = new Function("module", "exports", "require", `${code}\n//# sourceURL=delight://plugins/${manifest.id}.js`);
    fn(module, module.exports, require);

    const definition = module.exports?.default ?? module.exports;
    if (!definition || typeof definition !== "object") throw new Error("Plugin has no default export");
    return definition;
}

// ---- source patches ---------------------------------------------------------------------------

function patchesSignature(patches: SourcePatch[] | undefined) {
    return JSON.stringify(patches ?? [], (_, v) => v instanceof RegExp || typeof v === "function" ? String(v) : v);
}

/**
 * Swaps a plugin's registered source patches for `next` (undefined = none), then live-replaces every
 * already-loaded module that the old or new patches touch, in a single re-run per module.
 */
function setPatches(state: PluginState, next: SourcePatch[] | undefined) {
    const { id } = state.manifest;
    const previouslyPatched = state.patchesRegistered ? getPatchRecords(id).flatMap(r => r.modules) : [];

    if (state.patchesRegistered) unregisterPatches(id);
    state.patchesRegistered = !!next?.length;
    if (next?.length) registerPatches(id, next);

    // Before webpack exists (boot) nothing has run yet, patches simply apply as modules load
    if (!wreq) return;
    const affected = new Set([...previouslyPatched.filter(m => wreq!.c[m]), ...loadedModulesMatching(next ?? [])]);
    if (!affected.size) return;

    const failures = replaceLive(affected).filter(o => !o.ok);
    if (failures.length) {
        state.needsReload = true;
        state.reloadReason = [...new Set(failures.map(f => f.reason))].join(", ");
        logger.warn(`${state.manifest.name} needs a reload`, failures);
    }
}

function enablePatches(state: PluginState) {
    if (!state.patchesRegistered) setPatches(state, state.definition?.patches);
}

function disablePatches(state: PluginState) {
    if (state.patchesRegistered) setPatches(state, undefined);
}

// ---- lifecycle --------------------------------------------------------------------------------

async function start(state: PluginState) {
    const { definition } = state;
    if (!definition || state.running) return;

    const ctx = new PluginContext(state.manifest, definition.settings ?? {});
    state.ctx = ctx;
    state.running = true;
    state.error = undefined;

    try {
        if (definition.css) ctx.addStyle(definition.css);
        for (const [type, handler] of Object.entries(definition.flux ?? {})) ctx.flux.subscribe(type, handler.bind(definition));
        await definition.start?.(ctx);
        logger.info(`Started ${state.manifest.name}`);
    } catch (err) {
        logger.error(`Failed to start ${state.manifest.name}`, err);
        state.error = String(err);
        stop(state);
    }
    emit();
}

function stop(state: PluginState) {
    const { definition, ctx } = state;
    if (!ctx) return;

    try {
        definition?.stop?.(ctx);
    } catch (err) {
        logger.error(`${state.manifest.name} threw while stopping`, err);
    }
    ctx.dispose();
    state.ctx = undefined;
    state.running = false;
}

function load(payload: PluginPayload): PluginState {
    const state: PluginState = {
        manifest: payload.manifest,
        source: payload.source,
        running: false,
        needsReload: false,
        patchesRegistered: false,
    };

    // Safe mode lists plugins so they can be turned off, but never runs their code, not even top-level
    if (SafeMode.active) {
        plugins.set(payload.manifest.id, state);
        return state;
    }

    try {
        state.definition = evaluate(payload);
    } catch (err) {
        logger.error(`Failed to evaluate ${payload.manifest.id}`, err);
        state.error = String(err);
    }

    plugins.set(payload.manifest.id, state);
    if (isPluginEnabled(Settings.data, state.manifest)) enablePatches(state);
    return state;
}

function upsert(payload: PluginPayload) {
    const { id } = payload.manifest;
    const previous = plugins.get(id);
    const enabled = isPluginEnabled(Settings.data, payload.manifest);

    if (SafeMode.active) {
        if (previous) previous.manifest = payload.manifest;
        else load(payload);
        return emit();
    }

    if (!previous) {
        const state = load(payload);
        if (ready && enabled) start(state);
        return emit();
    }

    stop(previous);
    const sameShape = patchesSignature(previous.definition?.patches);
    const hadPatches = previous.patchesRegistered;

    let definition: PluginDefinition | undefined;
    try {
        definition = evaluate(payload);
    } catch (err) {
        logger.error(`Failed to reload ${id}`, err);
        previous.error = String(err);
        return emit();
    }

    previous.manifest = payload.manifest;
    previous.definition = definition;
    previous.error = undefined;

    // Unchanged patches keep their records; modules patched earlier call $self, which now resolves to the new definition
    if (patchesSignature(definition.patches) !== sameShape && (hadPatches || enabled)) {
        setPatches(previous, enabled ? definition.patches : undefined);
    }

    if (ready && enabled) start(previous);
    logger.info(`Hot reloaded ${payload.manifest.name}`);
    emit();
}

function remove(id: string) {
    const state = plugins.get(id);
    if (!state) return;
    stop(state);
    disablePatches(state);
    plugins.delete(id);
    emit();
}

// ---- public -----------------------------------------------------------------------------------

export const PluginManager = {
    /** Evaluate every plugin and register source patches of enabled ones. Runs before Discord's code. */
    boot(payloads: PluginPayload[]) {
        for (const payload of payloads) load(payload);
        Native.onPluginChange((change: PluginChange) => {
            if (change.type === "upsert") upsert(change.plugin);
            else remove(change.id);
        });
        emit();
    },

    /** Start enabled plugins, once Discord's core modules exist */
    async startAll() {
        ready = true;
        if (SafeMode.active) return emit();
        for (const state of plugins.values()) {
            if (isPluginEnabled(Settings.data, state.manifest)) await start(state);
        }
        emit();
    },

    async setEnabled(id: string, enabled: boolean) {
        const state = plugins.get(id);
        if (!state) return;

        Settings.update(d => void ((d.plugins[id] ??= {}).enabled = enabled));
        // Only remembered in safe mode, it applies once the user leaves it
        if (SafeMode.active) return emit();
        if (state.manifest.native) Native.setNativeRunning(id, enabled);

        if (enabled) {
            // On disk before any of its code runs: if it crashes Discord, safe mode can name it
            Settings.flush();
            enablePatches(state);
            if (ready) await start(state);
        } else {
            stop(state);
            disablePatches(state);
        }
        emit();
    },

    get(id: string) {
        return plugins.get(id);
    },

    /** Stable snapshot for React's useSyncExternalStore */
    getSnapshot: () => snapshot,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },

    /** Target of $self in source patches */
    self(id: string) {
        return plugins.get(id)?.definition;
    },
};
