/**
 * Share links for store plugins: https://evi.rest/p/<id>. evi.rest serves a page with the plugin's
 * name and description for Discord's embed, so anyone sees what it is; Evi recognises the link in
 * chat and draws an install card instead.
 *
 * Pure: shared by the renderer, the server and the tests.
 */
import { isPluginId } from "./store";

export const SHARE_ORIGIN = "https://evi.rest";

export const sharePluginUrl = (id: string) => `${SHARE_ORIGIN}/p/${id}`;

const LINK_RE = /https?:\/\/(?:www\.)?evi\.rest\/p\/([a-z0-9][a-z0-9-]*)(?![\w-])\/?/gi;
/** Cards under one message, at most */
export const MAX_SHARED = 3;

/** The plugin ids linked in `text`, in order, without repeats */
export function sharedPluginIds(text: string): string[] {
    if (!text || !text.includes("evi.rest/p/")) return [];
    const ids: string[] = [];
    for (const match of text.matchAll(LINK_RE)) {
        const id = match[1].toLowerCase();
        if (isPluginId(id) && !ids.includes(id)) ids.push(id);
        if (ids.length >= MAX_SHARED) break;
    }
    return ids;
}

/** Whether a URL (an embed's) is a share link, so Discord's own embed for it can be left out */
export function isShareUrl(url: unknown): boolean {
    return typeof url === "string" && sharedPluginIds(url).length > 0;
}
