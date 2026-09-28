/**
 * Evi's own updates in the page: the last check, a running install and its progress. Shared by the
 * Updates tab and the notice that says a new version is out. Main does the checking and installing.
 */
import type { UpdateProgress, UpdateStatus } from "@shared/release";

import { Native } from "./native";
import { Settings } from "./settings";

/** Checks again while Discord stays open, for people who never restart it */
const CHECK_EVERY = 6 * 60 * 60 * 1000;
/** The installer closes Discord within seconds: still here after this long means it didn't */
const INSTALL_TIMEOUT = 90_000;

export interface UpdatesState {
    status?: UpdateStatus;
    checking: boolean;
    /** Set while installing; the installer restarts Discord when it's done */
    installing?: UpdateProgress;
    error?: string;
}

let state: UpdatesState = { checking: false };
const listeners = new Set<() => void>();
const availableListeners = new Set<(status: Extract<UpdateStatus, { state: "available"; }>) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function set(next: Partial<UpdatesState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

Native?.onUpdateProgress?.(progress => set({ installing: progress }));
// A silent update finished downloading in the background: it installs when Discord quits
Native?.onUpdateReady?.(version => {
    const { status } = state;
    if (status?.state === "available" && status.release.version === version) set({ status: { ...status, ready: true } });
});

export const Updates = {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },

    /** Called when a check finds a version not dismissed yet */
    onAvailable(listener: (status: Extract<UpdateStatus, { state: "available"; }>) => void) {
        availableListeners.add(listener);
        return () => void availableListeners.delete(listener);
    },

    async check(force = false) {
        if (!Native.checkForUpdate) return;
        set({ checking: true, error: undefined });
        const status = await Native.checkForUpdate(force).catch(err => ({ state: "error" as const, current: EVI_VERSION, error: String(err), checkedAt: Date.now() }));
        set({ status, checking: false });
        // With silent updates on, an installable version downloads by itself: nothing to interrupt Discord with
        const silent = Updates.silent && status.state === "available" && status.installable;
        if (status.state === "available" && !silent && Settings.data.dismissedUpdate !== status.release.version) {
            for (const listener of availableListeners) listener(status);
        }
        return status;
    },

    /** Downloads and installs the new version; Discord closes and reopens on it */
    async install() {
        if (!Native.installUpdate || state.installing) return;
        set({ installing: { phase: "downloading" }, error: undefined });
        const result = await Native.installUpdate().catch(err => ({ ok: false as const, error: String(err) }));
        // On success the installer takes it from here and restarts Discord: stay on "installing"
        if (!result.ok) set({ installing: undefined, error: result.error });
        else setTimeout(() => set({ installing: undefined, error: "The installer didn’t restart Discord. What it said is in update.log, in the logs folder of Evi’s data folder." }), INSTALL_TIMEOUT);
        return result;
    },

    /** Don't mention this version again (the Updates tab still offers it) */
    dismiss(version: string) {
        Settings.update(d => void (d.dismissedUpdate = version));
    },

    get autoCheck() {
        return Settings.data.checkEviUpdates !== false;
    },

    setAutoCheck(on: boolean) {
        Settings.update(d => void (d.checkEviUpdates = on));
        Updates.schedule();
    },

    get beta() {
        return Settings.data.betaUpdates === true;
    },

    /** Main reads the setting, so it's saved before checking again */
    async setBeta(on: boolean) {
        Settings.update(d => void (d.betaUpdates = on));
        await Settings.save().catch(() => { });
        return Updates.check(true);
    },

    get silent() {
        return Settings.data.silentUpdates === true;
    },

    /** Main reads the setting, so it's saved before checking again (which starts the download) */
    async setSilent(on: boolean) {
        Settings.update(d => void (d.silentUpdates = on));
        await Settings.save().catch(() => { });
        Updates.schedule();
        return Updates.check(true);
    },

    /** Checks after startup settles, then every few hours, unless turned off. Background updates need the checks too */
    schedule(delay = 15_000) {
        clearInterval(timer);
        timer = undefined;
        if (!Updates.autoCheck && !Updates.silent) return;
        setTimeout(() => void Updates.check(), delay);
        timer = setInterval(() => void Updates.check(), CHECK_EVERY);
    },
};
