import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { join } from "path";

import { DATA_DIR } from "./paths";

/** Which modules source patch finds match on the current Discord build, see renderer/patching/findCache.ts */
const CACHE_FILE = join(DATA_DIR, "cache", "finds.json");
/** Same limit as the renderer's: it's read on every start */
const MAX_BYTES = 4 * 1024 * 1024;

export function readFindCache(): string | undefined {
    try {
        if (statSync(CACHE_FILE).size > MAX_BYTES) return;
        return readFileSync(CACHE_FILE, "utf8");
    } catch {
        return undefined;
    }
}

export function initFindCache() {
    ipcMain.on(IPC.FIND_CACHE_SAVE, (_, data: unknown) => {
        if (typeof data !== "string" || Buffer.byteLength(data) > MAX_BYTES) return;
        try {
            mkdirSync(join(DATA_DIR, "cache"), { recursive: true });
            writeFileSync(CACHE_FILE + ".tmp", data);
            renameSync(CACHE_FILE + ".tmp", CACHE_FILE);
        } catch (err) {
            console.warn("[Evi] Couldn't save the find cache", err);
        }
    });
}
