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
import { parseRequired } from "@shared/required";
import { parseAnnouncements } from "@shared/announcements";
import { isAdminRoute } from "@shared/devAdmin";
import { imageType } from "@shared/images";
import { parseDevLive } from "@shared/devLive";
import { AUTHOR_LINKS, clampDays, NOT_AUTHOR, parseAuthorStats } from "@shared/authorStats";
import { parseNotifications } from "@shared/notifications";
import { parsePluginPage, parseRatings, validateReview } from "@shared/reviews";
import { parseStoreHome } from "@shared/storeHome";
import { isPluginId } from "@shared/store";
import { ipcMain, shell, webContents } from "electron";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { inlineBadgeIcons, onAnnouncementsChanged, onInboxAnnounced, onRequiredChanged } from "./badges";
import { apiRequest, apiUrl } from "./evirest";
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

/** Admin changes from the Developers page: a person reviewing, not a loop */
const adminWrites: number[] = [];
function allowAdminWrite() {
    const now = Date.now();
    while (adminWrites.length && now - adminWrites[0] > 60_000) adminWrites.shift();
    if (adminWrites.length >= 30) return false;
    adminWrites.push(now);
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
    // Only the routes the Developers page uses; evi.rest still decides whether this Evi may
    ipcMain.handle(IPC.DEV_ADMIN, (_e, method: unknown, path: unknown, body: unknown) => {
        if (!isAdminRoute(method, path)) return { ok: false, error: "Evi doesn't call that" };
        if (method !== "GET" && !allowAdminWrite()) return { ok: false, error: "Too many changes at once, wait a minute" };
        // A badge's icon goes up as the image itself (PNG, JPEG, GIF or WebP, 1 MB at most), not JSON
        if ((path as string).endsWith("/icon")) {
            if (!(body instanceof Uint8Array) || !imageType(body)) return { ok: false, error: "Pick a PNG, JPEG, GIF or WebP image" };
            if (body.length > 1024 * 1024) return { ok: false, error: "That image is over 1 MB" };
            return call(async () => (await apiRequest(method, path as string, { body, headers: { "Content-Type": imageType(body)!.type } })).json as unknown);
        }
        const payload = body === undefined ? undefined : JSON.stringify(body);
        if (payload !== undefined && payload.length > 64 * 1024) return { ok: false, error: "That's too long to send" };
        return call(async () => inlineBadgeIcons((await apiRequest(method, `${path}`, { ...payload !== undefined && json(body), max: 8 * 1024 * 1024 })).json as unknown));
    });
    // The Author page: evi.rest answers a verified author's linked Evi with their own plugins' numbers
    ipcMain.handle(IPC.AUTHOR_STATS, async (_e, days: unknown) => {
        const result = await call(async () => parseAuthorStats((await apiRequest("GET", `/me/author/stats?days=${clampDays(days)}`, { max: 2 * 1024 * 1024 })).json));
        return result.ok || !NOT_AUTHOR.test(result.error) ? result : { ...result, notAuthor: true };
    });
    ipcMain.handle(IPC.AUTHOR_OPEN, (_e, link: unknown) => {
        if (typeof link !== "string" || !Object.hasOwn(AUTHOR_LINKS, link)) return;
        const site = new URL(apiUrl());
        if (site.protocol !== "https:" && site.hostname !== "localhost") return;
        return shell.openExternal(`${site.origin}${AUTHOR_LINKS[link as keyof typeof AUTHOR_LINKS]}`);
    });
    // The Evi version everyone has to be on (shared/required.ts): public too
    ipcMain.handle(IPC.REQUIRED, () => call(async () => parseRequired((await apiRequest("GET", "/required", { max: 16 * 1024 })).json)));
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
    // Spread over half a minute: every Evi that has to update would otherwise download in the same instant
    onRequiredChanged(() => setTimeout(() => {
        for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send(IPC.REQUIRED_CHANGED);
    }, Math.random() * 30_000));
    onAnnouncementsChanged(() => setTimeout(() => {
        for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send(IPC.ANNOUNCEMENTS_CHANGED);
    }, Math.random() * 5000));

    setTimeout(() => void checkin(), FIRST_AFTER).unref?.();
    setInterval(() => void checkin(), CHECK_EVERY).unref?.();
}
