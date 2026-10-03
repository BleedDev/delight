/**
 * Plugins' keyboard shortcuts. A plugin registers a handler for one of its `keybind` settings
 * (ctx.keybind); one capture-phase listener on the window reads each setting's current value on
 * every key press, so changing a shortcut applies at once and there's nothing to re-register.
 */
import { matchesCombo } from "@shared/keybinds";

import { Logger } from "./logger";
import { Perf } from "./perf";

interface Entry {
    pluginId: string;
    /** The setting's current value, "" when there's no shortcut */
    current(): string;
    run(): void;
}

const logger = new Logger("Keybinds");
const entries = new Set<Entry>();
let installed = false;

/** Marks the shortcut recorder: while it has focus, key presses are being recorded, not used */
export const RECORDING_ATTR = "data-dl-keybind-recording";

export const isRecording = (target: EventTarget | null) =>
    !!(target as Element | null)?.closest?.(`[${RECORDING_ATTR}]`);

function onKeyDown(e: KeyboardEvent) {
    if (e.repeat || !entries.size || isRecording(e.target)) return;
    for (const entry of entries) {
        if (!matchesCombo(e, entry.current())) continue;
        // Discord's own shortcut for the same keys, if it has one, doesn't run too
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
            entry.run();
        } catch (err) {
            logger.error(`${entry.pluginId}'s shortcut threw`, err);
        }
        return;
    }
}

export const Keybinds = {
    /** Returns the unregister function */
    add(pluginId: string, label: string, current: () => string, handler: () => void) {
        if (!installed) {
            installed = true;
            window.addEventListener("keydown", onKeyDown, true);
        }
        const entry: Entry = { pluginId, current, run: Perf.measure(Perf.site(pluginId, "keybind", label), handler) };
        entries.add(entry);
        return () => void entries.delete(entry);
    },
};
