/**
 * Badges for the renderer: the list from evi.rest with every icon turned into a data: URL (Discord's
 * page can't load images from other hosts), cached on disk so badges show from the first frame even
 * when the server is slow or down.
 *
 * Admin actions (the /badge command) need evi-admin.json in the data folder, { "token": "…" }. The
 * token stays in main: the page can only ask for one of a few fixed actions.
 */
import { BadgeAdminAction, BadgeAdminResult, BadgesDocument, BadgesResult, isDiscordId, parseBadges } from "@shared/badges";
import { imageDataUrl, imageType } from "@shared/images";
import { IPC } from "@shared/ipc";
import { isPluginId } from "@shared/store";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { downloadHttps } from "./download";
import { apiRequest, apiUrl } from "./evirest";
import { DATA_DIR } from "./paths";

const CACHE_FILE = join(DATA_DIR, "cache", "badges.json");
const ADMIN_FILE = join(DATA_DIR, "evi-admin.json");
const MAX_ICON_BYTES = 1024 * 1024;

interface Cache {
    etag: string | null;
    /** As the server sent it, https icons */
    doc: BadgesDocument;
    /** Icon URL -> data URL */
    icons: Record<string, string>;
}

let cache: Cache | undefined;
let pending: Promise<BadgesResult> | undefined;

function readCache(): Cache | undefined {
    try {
        const saved = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
        const doc = parseBadges(saved?.doc);
        if (!doc) return;
        const icons: Record<string, string> = {};
        for (const [url, data] of Object.entries(saved.icons ?? {})) {
            if (typeof data === "string" && data.startsWith("data:image/")) icons[url] = data;
        }
        return { etag: typeof saved.etag === "string" ? saved.etag : null, doc, icons };
    } catch {
        return undefined;
    }
}

function writeCache(next: Cache) {
    try {
        mkdirSync(join(DATA_DIR, "cache"), { recursive: true });
        writeFileSync(CACHE_FILE + ".tmp", JSON.stringify(next));
        renameSync(CACHE_FILE + ".tmp", CACHE_FILE);
    } catch (err) {
        console.warn("[Evi] Badges: couldn't write the cache", err);
    }
}

/** Icons only from the API's own host: the server hands out URLs to its uploads, nothing else */
function sameHost(url: string) {
    try {
        return new URL(url).host === new URL(apiUrl()).host;
    } catch {
        return false;
    }
}

async function fetchIcons(doc: BadgesDocument, known: Record<string, string>) {
    const icons: Record<string, string> = {};
    await Promise.all(Object.values(doc.badges).map(async ({ icon }) => {
        if (known[icon]) return void (icons[icon] = known[icon]);
        if (!sameHost(icon)) return;
        const download = await downloadHttps(icon, MAX_ICON_BYTES, { what: "The badge icon" });
        const data = download.ok ? imageDataUrl(download.body) : undefined;
        if (data) icons[icon] = data;
        else console.warn(`[Evi] Badges: couldn't load ${icon}`, download.ok ? "not an image" : download.error);
    }));
    return icons;
}

/** The document with icons swapped for data URLs; badges whose icon failed are left out */
function forPage({ doc, icons }: Cache): BadgesResult {
    const badges: BadgesDocument["badges"] = {};
    for (const [id, b] of Object.entries(doc.badges)) if (icons[b.icon]) badges[id] = { ...b, icon: icons[b.icon] };
    const users: BadgesDocument["users"] = {};
    for (const [user, ids] of Object.entries(doc.users)) {
        const shown = ids.filter(id => id in badges);
        if (shown.length) users[user] = shown;
    }
    return { ok: true, badges, users };
}

async function refresh(): Promise<BadgesResult> {
    cache ??= readCache();
    try {
        const res = await apiRequest("GET", "/badges", { headers: cache?.etag ? { "If-None-Match": cache.etag } : {}, max: 4 * 1024 * 1024 });
        if (res.status !== 304) {
            const doc = parseBadges(res.json);
            if (!doc) throw new Error("The badges server sent something unexpected");
            const icons = await fetchIcons(doc, cache?.icons ?? {});
            cache = { etag: res.etag, doc, icons };
            writeCache(cache);
        }
    } catch (err) {
        console.warn("[Evi] Badges: using the cached list,", (err as Error).message);
        if (!cache) return { ok: false, error: (err as Error).message };
    }
    return forPage(cache!);
}

/** One request at a time; everyone asking meanwhile gets the same answer */
function getBadges(cachedOnly = false): Promise<BadgesResult> {
    if (cachedOnly) {
        cache ??= readCache();
        if (cache) return Promise.resolve(forPage(cache));
    }
    pending ??= refresh().finally(() => void (pending = undefined));
    return pending;
}

// ---- admin ------------------------------------------------------------------------------------

function adminToken() {
    try {
        const { token } = JSON.parse(readFileSync(ADMIN_FILE, "utf8"));
        return typeof token === "string" && token.length >= 32 ? token : undefined;
    } catch {
        return undefined;
    }
}

async function admin(input: BadgeAdminAction): Promise<BadgeAdminResult> {
    const token = adminToken();
    if (!token) return { ok: false, error: "This install has no admin token (evi-admin.json in the data folder)" };
    const auth = { Authorization: `Bearer ${token}` };
    const call = (method: "GET" | "PUT" | "DELETE", path: string, body?: unknown) =>
        apiRequest(method, `/admin${path}`, { headers: { ...auth, ...(body !== undefined && { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });

    const done = (message: string) => {
        // The next look at badges should see the change, not a cached copy
        if (cache) cache.etag = null;
        return { ok: true as const, message };
    };

    try {
        switch (input?.action) {
            case "list": {
                const { json } = await call("GET", "/badges");
                const rows = (json?.badges ?? []) as { id: string; name: string; icon: string; holders: number; }[];
                if (!rows.length) return { ok: true, message: "No badges yet. Make one with /badge create." };
                return { ok: true, message: rows.map(b => `**${b.name}** \`${b.id}\`: ${b.holders} ${b.holders === 1 ? "person" : "people"}${b.icon ? "" : ", no icon yet"}`).join("\n") };
            }
            case "create": {
                if (!isPluginId(input.id)) return { ok: false, error: "Badge ids are lowercase letters, digits and dashes, like early-supporter" };
                // Check the icon before anything is created, so a bad link leaves nothing half-made
                const download = await downloadHttps(input.iconUrl, MAX_ICON_BYTES, { what: "The icon" });
                if (!download.ok) return { ok: false, error: `Icon: ${download.error}` };
                if (!imageType(download.body)) return { ok: false, error: "The icon must be a PNG, JPEG, GIF or WebP image" };
                await call("PUT", `/badges/${input.id}`, { name: input.name, description: input.description ?? "" });
                await apiRequest("PUT", `/admin/badges/${input.id}/icon`, { headers: { ...auth, "Content-Type": "application/octet-stream" }, body: download.body });
                return done(`Badge **${input.name}** (\`${input.id}\`) is ready. Give it to someone with /badge grant.`);
            }
            case "delete": {
                if (!isPluginId(input.id)) return { ok: false, error: "Not a badge id" };
                await call("DELETE", `/badges/${input.id}`);
                return done(`Deleted \`${input.id}\` and took it off everyone.`);
            }
            case "grant":
            case "revoke": {
                if (!isDiscordId(input.userId)) return { ok: false, error: "Pick a user" };
                if (!isPluginId(input.badgeId)) return { ok: false, error: "Not a badge id" };
                await call(input.action === "grant" ? "PUT" : "DELETE", `/users/${input.userId}/badges/${input.badgeId}`);
                return done(input.action === "grant" ? `Gave \`${input.badgeId}\` to <@${input.userId}>.` : `Took \`${input.badgeId}\` from <@${input.userId}>.`);
            }
            default:
                return { ok: false, error: "Unknown badge action" };
        }
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export function initBadges() {
    ipcMain.handle(IPC.BADGES_GET, (_, cachedOnly: unknown) => getBadges(cachedOnly === true));
    ipcMain.handle(IPC.BADGES_ADMIN_AVAILABLE, () => !!adminToken());
    ipcMain.handle(IPC.BADGES_ADMIN, (_, input: BadgeAdminAction) => admin(input));
}
