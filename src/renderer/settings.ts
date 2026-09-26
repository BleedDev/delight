import { DEFAULT_SETTINGS, DelightSettings, PluginSettingsEntry } from "@shared/ipc";

import { Native } from "./native";

type Listener = () => void;

let data: DelightSettings;
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Saves are debounced; if the page goes away first (reload, quit, crash-free close) write synchronously
addEventListener("pagehide", () => Settings.flush());

export const Settings = {
    init(initial: DelightSettings) {
        // Main fills in defaults too, this covers a main process older than the renderer
        data = { ...structuredClone(DEFAULT_SETTINGS), ...initial };
    },

    get data(): Readonly<DelightSettings> {
        return data;
    },

    /** Mutate settings, notify subscribers and persist (debounced) */
    update(mutate: (draft: DelightSettings) => void) {
        mutate(data);
        // New object identity so React's useSyncExternalStore sees a change
        data = { ...data };
        for (const listener of listeners) listener();

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = undefined;
            Native.saveSettings(data);
        }, 250);
    },

    /** Swap in settings main already saved (a restored backup) and notify subscribers, without saving again */
    replace(next: DelightSettings) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        data = { ...structuredClone(DEFAULT_SETTINGS), ...next };
        for (const listener of listeners) listener();
    },

    /** Write pending changes now, synchronously */
    flush() {
        if (saveTimer === undefined) return;
        clearTimeout(saveTimer);
        saveTimer = undefined;
        Native.saveSettingsSync(data);
    },

    plugin(id: string): PluginSettingsEntry {
        return data.plugins[id] ?? {};
    },

    subscribe(listener: Listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
};
