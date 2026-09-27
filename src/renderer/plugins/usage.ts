/**
 * What each plugin actually registered through its context while it ran: the runtime half of its
 * permissions (see src/shared/pluginPermissions.ts). Kept after the plugin stops, so turning it off
 * doesn't blank its details; cleared when it starts again, so a new version isn't blamed for the old.
 */
import type { RuntimeUsage } from "@shared/pluginPermissions";

const usage = new Map<string, RuntimeUsage>();

const empty = (): RuntimeUsage => ({ hooks: [], flux: [], menus: [], commands: [], styles: 0 });

type ListKey = "hooks" | "flux" | "menus" | "commands";

export const PluginUsage = {
    reset(id: string) {
        usage.set(id, empty());
    },

    add(id: string, key: ListKey, value: string) {
        const entry = usage.get(id) ?? empty();
        if (!entry[key].includes(value)) entry[key] = [...entry[key], value];
        usage.set(id, entry);
    },

    addStyle(id: string) {
        const entry = usage.get(id) ?? empty();
        entry.styles++;
        usage.set(id, entry);
    },

    get(id: string): RuntimeUsage | undefined {
        return usage.get(id);
    },
};
