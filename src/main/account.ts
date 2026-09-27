/**
 * Linking this install to an Evi account. Main asks the API for a code and opens the website to
 * confirm it in the browser; the page only ever gets back the code and who it's linked to.
 */
import { AccountLinkResult, AccountStatus, parseAccountUser } from "@shared/account";
import { IPC } from "@shared/ipc";
import { ipcMain, shell } from "electron";

import { apiRequest, apiUrl } from "./evirest";

const CODE_RE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

async function status(): Promise<AccountStatus> {
    try {
        return { ok: true, user: parseAccountUser((await apiRequest("GET", "/link", { max: 16 * 1024 })).json), site: new URL(apiUrl()).origin };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function link(): Promise<AccountLinkResult> {
    try {
        const { json } = await apiRequest("POST", "/link/start", { max: 16 * 1024 });
        const code = json?.code, url = json?.url;
        if (typeof code !== "string" || !CODE_RE.test(code) || typeof url !== "string") return { ok: false, error: "The server sent something unexpected" };
        // Only ever a web page, never another kind of link the server could slip in
        const page = new URL(url);
        if (page.protocol !== "https:" && page.hostname !== "localhost") return { ok: false, error: "The server sent a link that isn't https" };
        await shell.openExternal(page.toString());
        return { ok: true, code };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

/** The dashboard on the website the API belongs to */
function openDashboard() {
    const site = new URL(apiUrl());
    if (site.protocol !== "https:" && site.hostname !== "localhost") return;
    return shell.openExternal(`${site.origin}/dashboard`);
}

export function initAccount() {
    ipcMain.handle(IPC.ACCOUNT_STATUS, () => status());
    ipcMain.handle(IPC.ACCOUNT_LINK, () => link());
    ipcMain.handle(IPC.ACCOUNT_DASHBOARD, () => openDashboard());
}
