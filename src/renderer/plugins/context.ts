import type { PluginManifest } from "@shared/ipc";
import type { ReactNode } from "react";

import { Logger } from "../logger";
import { Native } from "../native";
import { hook, HookCallback, HookKind } from "../patching/hooks";
import { Settings } from "../settings";
import { createStyle, ManagedStyle } from "../styles";
import { CommandDefinition, registerCommand } from "../toolkit/commands";
import { addContextMenuPatch, ContextMenuCallback } from "../toolkit/contextMenu";
import { showToast, ToastOptions } from "../toolkit/toasts";
import { Dispatcher, FluxAction, React } from "../webpack/common";
import { Filter, FoundExport, waitFor } from "../webpack/find";
import type { SettingsSchema, SettingsValues } from "./types";

export class PluginSettings<S extends SettingsSchema> {
    constructor(
        private readonly id: string,
        private readonly schema: S,
        private readonly onDispose: (fn: () => void) => void = () => { },
    ) { }

    private stored() {
        return Settings.plugin(this.id).settings ?? {};
    }

    get<K extends keyof S & string>(key: K): SettingsValues<S>[K] {
        const stored = this.stored();
        return (key in stored ? stored[key] : this.schema[key]?.default) as SettingsValues<S>[K];
    }

    set<K extends keyof S & string>(key: K, value: SettingsValues<S>[K]) {
        Settings.update(d => {
            const entry = d.plugins[this.id] ??= {};
            (entry.settings ??= {})[key] = value;
        });
    }

    /** Current values with defaults filled in */
    get all(): SettingsValues<S> {
        const stored = this.stored();
        const values: Record<string, unknown> = {};
        for (const key in this.schema) values[key] = key in stored ? stored[key] : this.schema[key].default;
        return values as SettingsValues<S>;
    }

    /** Calls back with the new values whenever this plugin's settings change. Removed on stop. */
    onChange(callback: (values: SettingsValues<S>) => void) {
        let last = JSON.stringify(this.all);
        const unsubscribe = Settings.subscribe(() => {
            const now = JSON.stringify(this.all);
            if (now === last) return;
            last = now;
            callback(this.all);
        });
        this.onDispose(unsubscribe);
        return unsubscribe;
    }

    /** React hook: current values, re-renders on change */
    use(): SettingsValues<S> {
        React.useSyncExternalStore(Settings.subscribe, () => Settings.data);
        return this.all;
    }
}

/**
 * Everything a plugin registers goes through its context, which undoes all of it on stop.
 * That's what makes disabling and hot-reloading a plugin safe without a Discord reload.
 */
export class PluginContext<S extends SettingsSchema = SettingsSchema> {
    readonly logger: Logger;
    readonly settings: PluginSettings<S>;
    private disposers: (() => void)[] = [];

    constructor(readonly manifest: PluginManifest, schema: S) {
        this.logger = new Logger(manifest.name);
        this.settings = new PluginSettings(manifest.id, schema, fn => this.onDispose(fn));
    }

    get id() {
        return this.manifest.id;
    }

    /** Register cleanup to run when the plugin stops */
    onDispose(fn: () => void) {
        this.disposers.push(fn);
        return fn;
    }

    private addHook(target: any, key: PropertyKey, kind: HookKind, callback: HookCallback) {
        return this.onDispose(hook(target, key, kind, callback, this.id));
    }

    /** Hook a function on an object. Returns an unhook function (also called on stop). */
    readonly hook = {
        before: <T extends object>(target: T, key: keyof T, cb: HookCallback) => this.addHook(target, key, "before", cb),
        after: <T extends object>(target: T, key: keyof T, cb: HookCallback) => this.addHook(target, key, "after", cb),
        instead: <T extends object>(target: T, key: keyof T, cb: HookCallback) => this.addHook(target, key, "instead", cb),
    };

    /**
     * Hook a webpack export as soon as it exists, whether its module is already loaded or lazy.
     *   hookExport("after", filters.componentByCode("..."), cb)          hooks the matched export itself
     *   hookExport("before", filters.byProps("sendMessage"), "sendMessage", cb)   hooks a method on it
     */
    hookExport(kind: HookKind, filter: Filter, callback: HookCallback): void;
    hookExport(kind: HookKind, filter: Filter, method: string, callback: HookCallback): void;
    hookExport(kind: HookKind, filter: Filter, methodOrCallback: string | HookCallback, maybeCallback?: HookCallback) {
        const method = typeof methodOrCallback === "string" ? methodOrCallback : undefined;
        const callback = maybeCallback ?? methodOrCallback as HookCallback;

        this.waitFor(filter, (value, found: FoundExport) => {
            if (method) return void this.addHook(value, method, kind, callback);
            if (found.key === undefined) {
                this.logger.error("hookExport: the filter matched a whole module, pass a method name to hook one of its functions");
                return;
            }
            this.addHook(found.exports, found.key, kind, callback);
        });
    }

    /** Like webpack waitFor, cancelled on stop */
    waitFor<T = any>(filter: Filter, callback: (value: T, found: FoundExport<T>) => void) {
        let active = true;
        const unsubscribe = waitFor<T>(filter, (value, found) => {
            if (!active) return;
            try {
                callback(value, found);
            } catch (err) {
                this.logger.error("waitFor callback threw", err);
            }
        });
        return this.onDispose(() => {
            active = false;
            unsubscribe();
        });
    }

    readonly flux = {
        subscribe: (type: string, handler: (action: FluxAction) => void) => {
            const safe = (action: FluxAction) => {
                try {
                    handler(action);
                } catch (err) {
                    this.logger.error(`Flux handler for ${type} threw`, err);
                }
            };
            Dispatcher.subscribe(type, safe);
            return this.onDispose(() => Dispatcher.unsubscribe(type, safe));
        },
        dispatch: (action: FluxAction) => Dispatcher.dispatch(action),
    };

    readonly native = {
        call: <T = unknown>(method: string, ...args: unknown[]): Promise<T> => {
            if (!this.manifest.native) throw new Error(`${this.id} has no native module`);
            return Native.callNative(this.id, method, args);
        },
    };

    addStyle(css: string): ManagedStyle {
        const style = createStyle(css, `delight-plugin-${this.id}`);
        this.onDispose(style.remove);
        return style;
    }

    /** Shows one of Discord's toasts */
    toast(message: ReactNode, options?: ToastOptions) {
        return showToast(message, options);
    }

    /**
     * Adds items to Discord's menus: `callback(children, props)` runs each time the menu with this
     * navId renders ("message", "user-context", "guild-context", "channel-context"... or "*").
     * Push Menu.Item / Menu.Group elements (from @delight/api) into `children`. Removed on stop.
     */
    contextMenu(navId: string | string[], callback: ContextMenuCallback) {
        return this.onDispose(addContextMenuPatch(navId, callback));
    }

    /** Registers a slash command that runs locally, listed with Discord's built-ins. Removed on stop. */
    command(definition: CommandDefinition) {
        return this.onDispose(registerCommand(definition, this.id));
    }

    setInterval(fn: () => void, ms: number) {
        const handle = setInterval(fn, ms);
        return this.onDispose(() => clearInterval(handle));
    }

    setTimeout(fn: () => void, ms: number) {
        const handle = setTimeout(fn, ms);
        return this.onDispose(() => clearTimeout(handle));
    }

    /** @internal */
    dispose() {
        for (const fn of this.disposers.splice(0).reverse()) {
            try {
                fn();
            } catch (err) {
                this.logger.error("Cleanup threw", err);
            }
        }
    }
}
