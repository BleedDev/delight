import { DEFAULT_SETTINGS, EviSettings } from "@shared/ipc";
import { readFileSync, renameSync, writeFileSync } from "fs";

import { SETTINGS_FILE } from "./paths";

function load(): EviSettings {
    try {
        // Files from older versions lack newer keys, defaults fill them in
        return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) };
    } catch {
        return structuredClone(DEFAULT_SETTINGS);
    }
}

export let settings = load();

export function saveSettings(next: EviSettings) {
    settings = next;
    // Write then rename so a crash mid-write can't leave a truncated file behind
    const tmp = SETTINGS_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(next, null, 4));
    renameSync(tmp, SETTINGS_FILE);
}
