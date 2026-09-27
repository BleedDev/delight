/**
 * Stars for the renderer. Main makes the requests, so the page can only ask for star counts and
 * star or unstar an item by kind and id, never reach other URLs through us.
 */
import { IPC } from "@shared/ipc";
import { parseStars, starKey, StarKind, StarResult, StarsResult } from "@shared/stars";
import { isPluginId } from "@shared/store";
import { ipcMain } from "electron";

import { apiRequest } from "./evirest";

async function getStars(): Promise<StarsResult> {
    try {
        const stars = parseStars((await apiRequest("GET", "/stars", { max: 512 * 1024 })).json);
        return stars ? { ok: true, ...stars } : { ok: false, error: "The stars server sent something unexpected" };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function setStar(kind: unknown, id: unknown, starred: unknown): Promise<StarResult> {
    if ((kind !== "plugin" && kind !== "theme") || !isPluginId(id) || typeof starred !== "boolean") return { ok: false, error: "Not a store item" };
    try {
        const { json } = await apiRequest(starred ? "PUT" : "DELETE", `/stars/${kind}/${id}`);
        const count = json?.count;
        if (!Number.isSafeInteger(count) || count < 0) return { ok: false, error: "The stars server sent something unexpected" };
        return { ok: true, count, starred };
    } catch (err) {
        console.warn(`[Evi] Stars: couldn't ${starred ? "star" : "unstar"} ${starKey(kind as StarKind, id)}`, err);
        return { ok: false, error: (err as Error).message };
    }
}

export function initStars() {
    ipcMain.handle(IPC.STARS_GET, () => getStars());
    ipcMain.handle(IPC.STARS_SET, (_, kind: unknown, id: unknown, starred: unknown) => setStar(kind, id, starred));
}
