import { find, getStore } from "@evi/api";
import type { PluginContext, SettingsValues } from "@evi/api";

export const ID = "show-hidden-channels";

export const settings = {
    showMode: {
        type: "select",
        label: "How hidden channels look",
        description: "Takes effect after a reload for voice channels.",
        default: "lock",
        options: [
            { label: "A lock instead of the channel icon", value: "lock" },
            { label: "Muted, with a crossed-out eye after the name", value: "muted" },
        ],
    },
    hideUnreads: {
        type: "boolean",
        label: "Hide unreads",
        description: "Hidden channels never show as unread.",
        default: true,
    },
    showAllowedByDefault: {
        type: "boolean",
        label: "Show who can see it",
        description: "Open the allowed users and roles list on a hidden channel's page by default.",
        default: true,
    },
} as const;

export type Settings = typeof settings;

let context: PluginContext<Settings> | undefined;
export const setContext = (ctx: PluginContext<Settings> | undefined) => void (context = ctx);
export const getContext = () => context;

/**
 * A setting's current value. Source patch predicates run when Discord's modules load, which can be
 * before the plugin starts, so this falls back to the stored settings.
 */
export function setting<K extends keyof Settings & string>(key: K): SettingsValues<Settings>[K] {
    if (context) return context.settings.get(key);
    const stored = (window as any).Evi?.settings?.plugin?.(ID)?.settings;
    return (stored && key in stored ? stored[key] : settings[key].default) as SettingsValues<Settings>[K];
}

export const Permissions = {
    VIEW_CHANNEL: 1n << 10n,
    CONNECT: 1n << 20n,
};

const stores = new Map<string, any>();

/**
 * A Flux store, found once. getStore searches every loaded module each time, and isHiddenChannel
 * runs for every channel whenever Discord lists them, so it can't look stores up per call.
 */
export function store(name: string): any {
    let found = stores.get(name);
    if (found) return found;
    try {
        found = getStore(name);
    } catch {
        return undefined;
    }
    stores.set(name, found);
    return found;
}

/**
 * Finds a webpack export once and keeps it. A miss is retried at most every few seconds instead of
 * searching every module again on each render.
 */
export function findCached<T>(search: () => T | undefined): () => T | undefined {
    let value: T | undefined;
    let lastMiss = -Infinity;
    return () => {
        if (value !== undefined) return value;
        if (performance.now() - lastMiss < 5000) return undefined;
        value = search();
        if (value === undefined) lastMiss = performance.now();
        return value;
    };
}

/** Whether you can't see a guild channel (or with checkConnect, can see it but not join it) */
export function isHiddenChannel(channel: any, checkConnect = false): boolean {
    try {
        if (channel == null || Object.hasOwn(channel, "channelId") && channel.channelId == null) return false;
        if (channel.channelId != null) channel = store("ChannelStore")?.getChannel(channel.channelId);
        if (channel == null || channel.isDM?.() || channel.isGroupDM?.() || channel.isMultiUserDM?.()) return false;
        // Discord's own pseudo channels
        if (["browse", "customize", "guide"].includes(channel.id)) return false;

        const permissions = store("PermissionStore");
        if (!permissions) return false;
        return !permissions.can(Permissions.VIEW_CHANNEL, channel) || checkConnect && !permissions.can(Permissions.CONNECT, channel);
    } catch (err) {
        context?.logger.error("isHiddenChannel threw", err);
        return false;
    }
}

/**
 * Discord's CSS modules export minified keys (`J1: "modeSelected__2ea32"`), so classes are looked up
 * by their value. Returns the full class string for each name, empty until the module is found.
 */
export function cssClasses<K extends string>(...names: K[]): () => Partial<Record<K, string>> {
    const patterns = names.map(n => [n, new RegExp(`^${n}_+[\\da-f]+(?: |$)`)] as const);
    const matches = (value: unknown, pattern: RegExp) => typeof value === "string" && pattern.test(value);
    const lookup = findCached(() => {
        const module = find(v => !!v && typeof v === "object" && !Array.isArray(v)
            && patterns.every(([, p]) => Object.values(v).some(c => matches(c, p))));
        if (!module) return undefined;
        const classes: Partial<Record<K, string>> = {};
        for (const [n, p] of patterns) classes[n] = Object.values(module).find(c => matches(c, p)) as string;
        return classes;
    });
    return () => lookup() ?? {};
}
