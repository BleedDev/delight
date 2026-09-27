import { DEFAULT_SETTINGS, EviSettings, PluginSettingsEntry } from "@shared/ipc";

import { Native } from "./native";

type Listener = () => void;

let data: EviSettings;
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Saves are debounced; if the page goes away first (reload, quit, crash-free close) write synchronously
addEventListener("pagehide", () => Settings.flush());

export const Settings = {
    init(initial: EviSettings) {
        // Main fills in defaults too, this covers a main process older than the renderer
        data = { ...structuredClone(DEFAULT_SETTINGS), ...initial };
    },

    get data(): Readonly<EviSettings> {
        return data;
    },

    /** Mutate settings, notify subscribers and persist (debounced) */
    update(mutate: (draft: EviSettings) => void) {
        mutate(data);
        // New object identity so React's useSyncExternalStore sees a change
        data = { ...data };
        for (const listener of listeners) listener();

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void Settings.save(), 250);
    },

    /** Swap in settings main already saved (a restored backup) and notify subscribers, without saving again */
    replace(next: EviSettings) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        data = { ...structuredClone(DEFAULT_SETTINGS), ...next };
        for (const listener of listeners) listener();
    },

    /**
     * Writes settings now and waits for main's answer. Turning on a plugin with native code or
     * Chromium switches waits for the user's yes in a dialog main shows; the ones they said no to
     * are switched back off here, and returned.
     */
    async save(): Promise<string[]> {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        const result = await Native.saveSettings(data);
        // Mains older than this answer with nothing
        const refused = Array.isArray(result?.refused) ? result.refused : [];
        if (refused.length) Settings.update(d => {
            for (const id of refused) (d.plugins[id] ??= {}).enabled = false;
        });
        return refused;
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
