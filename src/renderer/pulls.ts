/**
 * Telling the user when Evi turns one of their plugins off everywhere (shared/pulls.ts): a toast,
 * once per pull, at startup or the moment it arrives. The Plugins list keeps saying it, with the
 * reason, for as long as the pull lasts.
 */
import { isPluginEnabled } from "@shared/ipc";

import { PluginManager } from "./plugins/manager";
import { PullMemory, pullKey, readPullMemory, unseenPulls } from "./pullMemory";
import { SafeMode } from "./safeMode";
import { Settings } from "./settings";
import { showToast } from "./toolkit/toasts";

const MEMORY_KEY = "evi-pull-notices";

// Discord deletes window.localStorage once it starts; Evi runs before it, so keep a reference now
const storage = (() => {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
})();
let memoryFallback: PullMemory = {};

function readMemory(): PullMemory {
    try {
        return storage ? readPullMemory(storage.getItem(MEMORY_KEY)) : memoryFallback;
    } catch {
        return memoryFallback;
    }
}

function writeMemory(memory: PullMemory) {
    memoryFallback = memory;
    try {
        storage?.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch { }
}

const pulledNow = () => PluginManager.getSnapshot()
    .filter(p => p.pulled)
    .map(p => ({ id: p.manifest.id, name: p.manifest.name, pull: p.pulled!, enabled: isPluginEnabled(Settings.data, p.manifest) }));

function announce() {
    const { due, memory } = unseenPulls(pulledNow(), readMemory(), Date.now());
    writeMemory(memory);
    for (const p of due) showToast(`${p.name} was turned off by Evi`, { type: "failure", duration: 6000 });
}

let started = false;

/** Says what's pulled now, then again whenever a pull arrives */
export function startPullNotices() {
    if (started || SafeMode.active) return;
    started = true;
    announce();
    const keys = () => pulledNow().map(p => pullKey(p.id, p.pull)).join(",");
    let before = keys();
    PluginManager.subscribe(() => {
        const now = keys();
        if (now === before) return;
        before = now;
        announce();
    });
}
