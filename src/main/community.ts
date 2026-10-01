/**
 * The store's community side on evi.rest, for the renderer: the front page, ratings, each plugin's
 * page (reviews, related plugins, known issues, the author's note), writing and reporting reviews,
 * following authors, the account's inbox and the credits. Reviews, follows and the inbox are the
 * account's: they need this Evi linked to one (Account), and say so when it isn't.
 *
 * Also the daily usage check-in (shared/analytics.ts): once a day, which store plugins this install
 * has and which are on, unless it's turned off in the store's settings.
 */
import type { CommunityResult } from "@shared/ipc";
import { IPC } from "@shared/ipc";
import { parseCredits } from "@shared/badges";
import { parseAnnouncements } from "@shared/announcements";
import { parseDevLive } from "@shared/devLive";
import { parseNotifications } from "@shared/notifications";
import { parsePluginPage, parseRatings, validateReview } from "@shared/reviews";
import { parseStoreHome } from "@shared/storeHome";
import { isPluginId } from "@shared/store";
import { ipcMain, webContents } from "electron";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { onAnnouncementsChanged, onInboxAnnounced } from "./badges";
import { apiRequest } from "./evirest";
import { DATA_DIR } from "./paths";
import { cachedGet } from "./reports";
import { settings } from "./settings";
import { storeUsage } from "./store";
import { mt } from "./locale";


const home = cachedGet("store-home.json", "/store/home", parseStoreHome);
const ratings = cachedGet("ratings.json", "/ratings", parseRatings);
const credits = cachedGet("credits.json", "/credits", parseCredits);

/** evi.rest's refusal for an Evi that isn't linked starts like this (server/src/app.ts) */
const UNLINKED = /^Link this Evi to your Discord account/;

async function call<T>(run: () => Promise<T>): Promise<CommunityResult<T>> {
    try {
        return { ok: true, value: await run() };
    } catch (err) {
        const error = (err as Error)?.message ?? String(err);
        return { ok: false, error, ...(UNLINKED.test(error) && { unlinked: true }) };
    }
}

const cached = async <T>(get: () => Promise<{ ok: true; value: T; } | { ok: false; error: string; }>): Promise<CommunityResult<T>> => get();

/** Writes from the page (reviews, reports, follows) a few at a time: no plugin can make this install spam evi.rest */
const writes: number[] = [];
function allowWrite() {
    const now = Date.now();
    while (writes.length && now - writes[0] > 60_000) writes.shift();
    if (writes.length >= 10) return false;
    writes.push(now);
    return true;
}

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function review(id: unknown, input: unknown) {
    if (!isPluginId(id)) return { ok: false as const, error: "That isn't a plugin id" };
    if (!allowWrite()) return { ok: false as const, error: mt("main.rate.write") };
    if (input === null) return call(async () => (await apiRequest("DELETE", `/plugins/${id}/review`)).json);
    const checked = validateReview(input, mt);
    if ("error" in checked) return { ok: false as const, error: checked.error };
    return call(async () => (await apiRequest("PUT", `/plugins/${id}/review`, json(checked))).json);
}

// ---- the inbox ----------------------------------------------------------------------------------

function announceInboxChange() {
    for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send(IPC.COMMUNITY_INBOX_CHANGED);
}

// ---- usage check-in -------------------------------------------------------------------------------

const CHECKIN_FILE = join(DATA_DIR, "checkin.json");
const CHECK_EVERY = 3 * 60 * 60 * 1000;
/** After startup settles, and after the registry has had a chance to load */
const FIRST_AFTER = 90_000;

const today = () => new Date().toISOString().slice(0, 10);

function lastCheckin() {
    try {
        return JSON.parse(readFileSync(CHECKIN_FILE, "utf8"))?.day as string | undefined;
    } catch {
        return undefined;
    }
}

async function checkin() {
    if (settings.shareUsage === false || lastCheckin() === today()) return;
    try {
        const plugins = await storeUsage();
        await apiRequest("POST", "/checkins", json({ plugins, eviVersion: EVI_VERSION.replace(/-.*$/, "") }));
        writeFileSync(CHECKIN_FILE + ".tmp", JSON.stringify({ day: today() }));
        renameSync(CHECKIN_FILE + ".tmp", CHECKIN_FILE);
    } catch (err) {
        // Tomorrow's is just as good: nothing depends on today's
        console.warn("[Evi] Community: usage check-in didn't go through,", (err as Error).message);
    }
}

export function initCommunity() {
    ipcMain.handle(IPC.COMMUNITY_HOME, () => cached(home));
    ipcMain.handle(IPC.COMMUNITY_RATINGS, () => cached(ratings));
    ipcMain.handle(IPC.COMMUNITY_CREDITS, () => cached(credits));
    ipcMain.handle(IPC.COMMUNITY_PAGE, (_, id: unknown) => {
        if (!isPluginId(id)) return { ok: false, error: "That isn't a plugin id" };
        return call(async () => parsePluginPage((await apiRequest("GET", `/plugins/${id}/page`)).json));
    });
    ipcMain.handle(IPC.COMMUNITY_REVIEW, (_, id: unknown, input: unknown) => review(id, input));
    ipcMain.handle(IPC.COMMUNITY_REVIEW_REPORT, (_, reviewId: unknown) => {
        if (!Number.isSafeInteger(reviewId) || (reviewId as number) < 1) return { ok: false, error: "That isn't a review" };
        if (!allowWrite()) return { ok: false, error: mt("main.rate.write") };
        return call(async () => (await apiRequest("POST", `/reviews/${reviewId}/report`)).json);
    });
    ipcMain.handle(IPC.COMMUNITY_FOLLOW, (_, slug: unknown, on: unknown) => {
        if (typeof slug !== "string" || !/^[a-z0-9-]{1,64}$/.test(slug) || typeof on !== "boolean") return { ok: false, error: "That isn't an author" };
        if (!allowWrite()) return { ok: false, error: mt("main.rate.write") };
        return call(async () => (await apiRequest(on ? "PUT" : "DELETE", `/authors/${slug}/follow`)).json as { following: boolean; followers: number; });
    });
    ipcMain.handle(IPC.COMMUNITY_FOLLOWING, () => call(async () => {
        const authors = (await apiRequest("GET", "/me/following")).json?.authors;
        return Array.isArray(authors) ? authors.filter((s): s is string => typeof s === "string").slice(0, 500) : [];
    }));
    // The Developers page: evi.rest only answers an Evi linked to one of Evi's developers
    ipcMain.handle(IPC.DEV_LIVE, () => call(async () => parseDevLive((await apiRequest("GET", "/admin/live", { max: 256 * 1024 })).json)));
    // Evi's team to everyone: public, so it works without a linked account
    ipcMain.handle(IPC.ANNOUNCEMENTS, () => call(async () => parseAnnouncements((await apiRequest("GET", "/announcements", { max: 256 * 1024 })).json)));
    ipcMain.handle(IPC.COMMUNITY_INBOX, () => call(async () => parseNotifications((await apiRequest("GET", "/me/notifications")).json?.notifications)));
    ipcMain.handle(IPC.COMMUNITY_INBOX_READ, (_, ids: unknown) => call(async () => {
        const clean = Array.isArray(ids) ? ids.filter(id => typeof id === "string" && /^\d{1,15}$/.test(id)).slice(0, 100) : undefined;
        return parseNotifications((await apiRequest("POST", "/me/notifications/read", json(clean ? { ids: clean } : {}))).json?.notifications);
    }));
    ipcMain.handle(IPC.COMMUNITY_CREDITED, () => call(async () => {
        const credited = (await apiRequest("GET", "/me/credits")).json?.credited;
        return typeof credited === "boolean" ? credited : null;
    }));
    ipcMain.handle(IPC.COMMUNITY_SET_CREDITED, (_, credited: unknown) => {
        if (typeof credited !== "boolean") return { ok: false, error: "Say yes or no" };
        return call(async () => (await apiRequest("PUT", "/me/credits", json({ credited }))).json?.credited === true);
    });

    // The stream says the inbox changed (or it reconnected and something may have): the page asks again
    onInboxAnnounced(announceInboxChange);
    // Spread out: every running Evi hears it in the same instant
    onAnnouncementsChanged(() => setTimeout(() => {
        for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send(IPC.ANNOUNCEMENTS_CHANGED);
    }, Math.random() * 5000));

    setTimeout(() => void checkin(), FIRST_AFTER).unref?.();
    setInterval(() => void checkin(), CHECK_EVERY).unref?.();
}
