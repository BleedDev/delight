/**
 * Talks to the stars API for the renderer. Main makes the requests, so the page can only ask for
 * star counts and star or unstar an item by kind and id, never reach other URLs through us.
 */
import { IPC } from "@shared/ipc";
import { DEFAULT_API_URL, isInstallId, parseStars, starKey, StarKind, StarResult, StarsResult } from "@shared/stars";
import { isPluginId, whyNotStoreUrl } from "@shared/store";
import { randomUUID } from "crypto";
import { ipcMain, net } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { readCapped } from "./download";
import { DATA_DIR } from "./paths";

const CONFIG_FILE = join(DATA_DIR, "store.json");
/** A random id for this install, so a star counts once. Nothing else is sent. */
const INSTALL_FILE = join(DATA_DIR, "install-id");

function apiUrl() {
    if (process.env.EVI_API_URL) return process.env.EVI_API_URL.replace(/\/+$/, "");
    try {
        const { apiUrl } = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
        if (typeof apiUrl === "string" && apiUrl.trim()) return apiUrl.trim().replace(/\/+$/, "");
    } catch { }
    return DEFAULT_API_URL;
}

let installId: string | undefined;
function getInstallId() {
    if (installId) return installId;
    try {
        const saved = readFileSync(INSTALL_FILE, "utf8").trim();
        if (isInstallId(saved)) return (installId = saved);
    } catch { }
    installId = randomUUID();
    try {
        writeFileSync(INSTALL_FILE, installId);
    } catch { }
    return installId;
}

async function request(method: "GET" | "PUT" | "DELETE", path: string) {
    const base = apiUrl();
    const bad = whyNotStoreUrl(base);
    if (bad) throw new Error(`The stars API URL can't be used: ${bad}`);

    const res = await net.fetch(`${base}${path}`, {
        method,
        headers: { "X-Evi-Install": getInstallId(), "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
    });
    const body = await readCapped(res, 512 * 1024);
    if (!body) throw new Error("The stars answer was too large");
    let json: any;
    try {
        json = JSON.parse(new TextDecoder().decode(body));
    } catch {
        throw new Error(`The stars server answered ${res.status} without JSON`);
    }
    if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error.slice(0, 200) : `The stars server answered ${res.status}`);
    return json;
}

async function getStars(): Promise<StarsResult> {
    try {
        const stars = parseStars(await request("GET", "/stars"));
        return stars ? { ok: true, ...stars } : { ok: false, error: "The stars server sent something unexpected" };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function setStar(kind: unknown, id: unknown, starred: unknown): Promise<StarResult> {
    if ((kind !== "plugin" && kind !== "theme") || !isPluginId(id) || typeof starred !== "boolean") return { ok: false, error: "Not a store item" };
    try {
        const json = await request(starred ? "PUT" : "DELETE", `/stars/${kind}/${id}`);
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
