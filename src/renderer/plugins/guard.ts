/**
 * Holds a plugin to the permissions its manifest declares (shared/declaredPermissions.ts). A plugin
 * without a declaration isn't held to anything: it's from before Evi 0.7.0, and its details say so.
 *
 * Only what Evi hands the plugin can be held, because only there does Evi know which plugin is
 * asking. That's:
 *   - its fetch, XMLHttpRequest, WebSocket and EventSource (activity.ts): sites, and Discord's
 *     message and settings endpoints
 *   - its context: Flux subscriptions, hooks and slash commands (context.ts)
 *   - its own copy of @evi/api (manager.ts): store lookups by name, the Flux dispatcher's subscribe,
 *     hook, registerCommand, and Evi's badge settings
 * Plugins share one JavaScript realm with Discord and each other. Code that goes around these (window.fetch,
 * a finder by props that returns MessageStore, a source patch, Discord's own send function) isn't
 * seen here, so a determined plugin can still do more than it declares. Store plugins are reviewed
 * for that; this catches what an honest plugin forgot to declare, and what a careless one does.
 *
 * A refused call fails the way a plugin can handle: fetch rejects, everything else throws a
 * PluginPermissionError naming what to declare. Each one is noted in the plugin's activity.
 */
import * as api from "@evi/api";
import {
    checkRequest,
    DeclaredPermissions,
    isMessageAction,
    isMessageStore,
    PermissionFlag,
    PluginPermissionError,
    readPermissions,
} from "@shared/declaredPermissions";
import type { PluginManifest } from "@shared/ipc";

import type { CommandDefinition } from "../toolkit/commands";
import { lazy, unlazy } from "../utils/lazy";
import { PluginActivity } from "./activity";

/** A Flux store's name, if `value` is one */
function storeName(value: any): string | undefined {
    try {
        if (!value || typeof value !== "object" || !("_dispatchToken" in value)) return undefined;
        const name = typeof value.getName === "function" ? value.getName() : value.constructor?.displayName;
        return typeof name === "string" ? name : undefined;
    } catch {
        return undefined;
    }
}

/**
 * What hooking `key` on `target` would let a plugin see, when that's messages: the Flux dispatcher
 * (every action goes through it), a store's handler for a message action, Discord's message actions
 * (what you send and edit), or a message store.
 */
function hookReadsMessages(target: any, key: PropertyKey): string | undefined {
    const real = unlazy(target);
    if (!real || (typeof real !== "object" && typeof real !== "function")) return undefined;
    const name = String(key);
    if ((name === "dispatch" || name === "_dispatch") && typeof real.subscribe === "function" && "_actionHandlers" in real) return `Dispatcher.${name}`;
    if (typeof key === "string" && isMessageAction(key)) return key;
    // Discord's message actions: sendMessage, editMessage, deleteMessage... (not the rest of their module)
    if (typeof real.sendMessage === "function" && typeof real.editMessage === "function" && /message/i.test(name)) return name;
    const store = storeName(real);
    if (store && isMessageStore(store)) return `${store}.${name}`;
    return undefined;
}

export class PluginGuard {
    /** Undefined: it doesn't declare, nothing is checked */
    readonly declared: DeclaredPermissions | undefined;

    constructor(readonly manifest: PluginManifest) {
        this.declared = readPermissions(manifest.permissions);
    }

    get id() {
        return this.manifest.id;
    }

    /** Throws, and notes it in the plugin's activity, unless it declares `permission` */
    need(permission: PermissionFlag, target: string) {
        if (!this.declared || this.declared[permission]) return;
        PluginActivity.blocked(this.id, permission, target);
        throw new PluginPermissionError(this.id, permission, target);
    }

    /** For activity.ts's network globals: the error to fail a request with, if it's not declared */
    readonly checkRequest = (url: string, method: string, base?: string) => {
        if (!this.declared) return undefined;
        const blocked = checkRequest(this.declared, url, method, base);
        return blocked && new PluginPermissionError(this.id, blocked.permission, blocked.host);
    };

    /** A Flux subscription: message actions need readMessages */
    flux(type: string) {
        if (isMessageAction(type)) this.need("readMessages", type);
    }

    /** A store looked up by name: message stores need readMessages */
    store(name: string) {
        if (typeof name === "string" && isMessageStore(name)) this.need("readMessages", name);
    }

    /** A hook, before it's installed */
    hook(target: unknown, key: PropertyKey) {
        if (!this.declared || this.declared.readMessages) return;
        const reads = hookReadsMessages(target, key);
        if (reads) this.need("readMessages", reads);
    }

    /** A slash command whose result, when it has text, Discord sends as a message: that needs sendMessages */
    command(definition: CommandDefinition): CommandDefinition {
        if (!this.declared || this.declared.sendMessages) return definition;
        const guard = this;
        return {
            ...definition,
            async execute(args, context) {
                const result = await definition.execute.call(definition, args, context);
                if (result && "content" in result && result.content) guard.need("sendMessages", `/${definition.name}`);
                return result;
            },
        };
    }

    /**
     * The plugin's own @evi/api: the same module, with the parts that need a permission checked. A
     * plugin that doesn't declare gets the shared one, untouched.
     */
    api(): typeof api {
        if (!this.declared) return api;
        const guard = this;
        const filters = { ...api.filters, byStoreName: (name: string) => (guard.store(name), api.filters.byStoreName(name)) };
        const overrides: Partial<Record<keyof typeof api, unknown>> = {
            filters,
            getStore: (name: string) => (guard.store(name), api.getStore(name)),
            findStore: (name: string) => (guard.store(name), api.findStore(name)),
            findStoreLazy: (name: string) => (guard.store(name), api.findStoreLazy(name)),
            hook: (target: any, key: any, kind: any, callback: any, owner = guard.id) => (guard.hook(target, key), api.hook(target, key, kind, callback, owner)),
            registerCommand: (definition: CommandDefinition, owner = guard.id) => api.registerCommand(guard.command(definition), owner),
            // unlazy() still finds the real dispatcher, so hooking it hooks Discord's own
            Dispatcher: lazy(() => unlazy(api.Dispatcher), [], {
                subscribe: (type: string, handler: (action: api.FluxAction) => void) => (guard.flux(type), api.Dispatcher.subscribe(type, handler)),
            }),
            // Your Evi account's badge settings
            Badges: {
                ...api.Badges,
                setPrefs: (...args: Parameters<typeof api.Badges.setPrefs>) => (guard.need("changeSettings", "badge settings"), api.Badges.setPrefs(...args)),
                manage: (...args: Parameters<typeof api.Badges.manage>) => (guard.need("changeSettings", "badges"), api.Badges.manage(...args)),
            },
        };
        return new Proxy(api, {
            get: (target, key) => Object.hasOwn(overrides, key) ? overrides[key as keyof typeof api] : Reflect.get(target, key),
        });
    }
}
