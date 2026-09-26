/**
 * Safe mode: a plugin, theme or Quick CSS that breaks Discord must never lock the user out.
 *
 * Every start bumps a counter in safe-mode.json, and the renderer resets it once plugins have started
 * and the page stayed up for a few seconds (IPC.BOOT_OK). A start that crashes, hangs, or gets closed
 * before that leaves the counter up. After CRASH_LOOP_STARTS of those in a row, the next start is in
 * safe mode: the core loads, but no plugins (renderer or native), themes, Quick CSS or plugin
 * Chromium switches. If Discord keeps failing even then, one start goes fully vanilla.
 *
 * Crashes while Discord runs are caught too: RENDERER_CRASHES renderer crashes within CRASH_WINDOW_MS
 * switch the running process into safe mode, and the reloaded window boots without plugins.
 *
 * Safe mode caused by crashes is sticky across restarts until the user leaves it from the notice.
 * `--evi-safe` is for one start only.
 */
import { RecentChange, SafeModeInfo, SafeModeReason } from "@shared/ipc";
import { addChange, CRASH_LOOP_STARTS, CRASH_WINDOW_MS, EMPTY_STATE, RENDERER_CRASHES, StartupMode, startupMode, StartupState } from "@shared/safeMode";
import { app, WebContents } from "electron";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { DATA_DIR } from "./paths";

export const SAFE_FLAG = "--evi-safe";
const STATE_FILE = join(DATA_DIR, "safe-mode.json");

function load(): StartupState {
    try {
        return { ...structuredClone(EMPTY_STATE), ...JSON.parse(readFileSync(STATE_FILE, "utf8")) };
    } catch {
        return structuredClone(EMPTY_STATE);
    }
}

let state = load();
let info: Omit<SafeModeInfo, "changes"> | undefined;
const enterListeners = new Set<() => void>();

function save() {
    try {
        // Write then rename: this file is written right before crashes, a torn write must not happen
        const tmp = STATE_FILE + ".tmp";
        writeFileSync(tmp, JSON.stringify(state, null, 4));
        renameSync(tmp, STATE_FILE);
    } catch (err) {
        console.error("[Evi] Couldn't save safe mode state", err);
    }
}

function isDiscordApp(wc: WebContents) {
    try {
        return /(^|\.)discord\.com$/.test(new URL(wc.getURL()).hostname);
    } catch {
        return false;
    }
}

function enter(reason: SafeModeReason, failures: number) {
    info = { reason, failures };
    if (reason !== "flag") state.forceSafe = reason;
    console.warn(`[Evi] Safe mode (${reason}): plugins, themes and Quick CSS are off`);
    for (const listener of enterListeners) listener();
}

export const SafeMode = {
    get active() {
        return !!info;
    },

    /** For the renderer's boot data */
    get info(): SafeModeInfo | undefined {
        return info && { ...info, changes: state.changes };
    },

    /** Decides what this start is and counts it. Runs first thing in main. */
    begin(): StartupMode {
        const flag = process.argv.includes(SAFE_FLAG);
        const failures = state.pendingStarts;
        const mode = startupMode(state, flag);

        if (mode === "vanilla") {
            console.warn(`[Evi] Discord failed to start ${failures} times in a row, even in safe mode. Starting it without Evi once.`);
            // Next start is safe mode again, with two more tries before the next vanilla one
            state.pendingStarts = CRASH_LOOP_STARTS;
            state.forceSafe ??= "crash-loop";
            save();
            return mode;
        }

        if (mode === "safe") {
            const crashed = state.forceSafe ?? (failures >= CRASH_LOOP_STARTS ? "crash-loop" : undefined);
            enter(crashed ?? "flag", failures);
        }
        state.pendingStarts++;
        save();
        return mode;
    },

    /** The renderer booted and stayed up: this start was healthy */
    bootOk() {
        if (state.pendingStarts === 0) return;
        state.pendingStarts = 0;
        save();
        console.log("[Evi] Healthy start, crash counter reset");
    },

    /** Forget the crash history and restart normally. The --evi-safe flag isn't passed on. */
    exit() {
        state.pendingStarts = 0;
        delete state.forceSafe;
        save();
        app.relaunch({ args: process.argv.slice(1).filter(a => a !== SAFE_FLAG) });
        app.exit(0);
    },

    recordChange(change: Omit<RecentChange, "at">) {
        state.changes = addChange(state.changes, { ...change, at: Date.now() });
        save();
    },

    /** Runs when a running Discord switches into safe mode */
    onEnter(listener: () => void) {
        enterListeners.add(listener);
    },

    watchCrashes() {
        let crashes: number[] = [];
        app.on("render-process-gone", (_, wc, details) => {
            if (details.reason === "clean-exit" || !isDiscordApp(wc)) return;

            const now = Date.now();
            crashes = [...crashes.filter(t => now - t < CRASH_WINDOW_MS), now];
            console.error(`[Evi] Discord's window crashed (${details.reason}), ${crashes.length} time(s) within ${CRASH_WINDOW_MS / 1000}s`);
            if (crashes.length >= RENDERER_CRASHES && !info) {
                enter("renderer-crash", crashes.length);
                save();
            }

            // Discord may reload or relaunch on its own. If the window is still dead after that, reload it:
            // after enough crashes, the reloaded page boots in safe mode.
            setTimeout(() => {
                if (!wc.isDestroyed() && wc.isCrashed()) wc.reload();
            }, 1500);
        });
    },
};
