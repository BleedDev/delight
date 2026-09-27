// Small persistent UI state (drafts, last folder, view options…) kept in the plugin's own settings. Keys that aren't
// in the settings schema are stored but not shown in the settings UI.
import type { PluginContext } from "@evi/api";

let ctx: PluginContext<any> | null = null;
export function connectKv(c: PluginContext<any>) {
    ctx = c;
    c.onDispose(() => void (ctx = null));
}

export const kv = {
    get<T>(key: string, def: T): T {
        const v = (ctx?.settings as any)?.get?.(key);
        return v === undefined || (v === null && def !== null) ? def : (v as T);
    },
    set(key: string, value: unknown) {
        (ctx?.settings as any)?.set?.(key, value === undefined ? null : value);
    },
};
