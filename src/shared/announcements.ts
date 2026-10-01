/**
 * Announcements from Evi's team (server/src/announcements.ts): what an admin may send, and what an
 * Evi accepts back from evi.rest. Shared so both ends hold the same limits.
 */

export const MAX_TITLE = 120;
export const MAX_BODY = 600;

export interface Announcement {
    id: number;
    title: string;
    body: string;
    /** https only: opened in the browser from the Inbox */
    link?: string;
    at: number;
}

const clean = (v: unknown) => typeof v === "string" ? v.replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim() : "";
const isLink = (v: string) => /^https:\/\/[^\s]{1,2000}$/.test(v);

/** What an admin sent, cleaned; or why it can't go out */
export function parseAnnouncementInput(raw: unknown): { title: string; body: string; link?: string; } | { error: string; } {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const title = clean(r.title), body = clean(r.body), link = clean(r.link);
    if (!title) return { error: "An announcement needs a title" };
    if (title.length > MAX_TITLE) return { error: `Titles are at most ${MAX_TITLE} characters` };
    if (body.length > MAX_BODY) return { error: `The text is at most ${MAX_BODY} characters` };
    if (link && !isLink(link)) return { error: "The link has to be a full https:// address" };
    return { title, body, ...link && { link } };
}

/** evi.rest's list, as an Evi reads it: anything malformed is left out */
export function parseAnnouncements(raw: unknown): Announcement[] {
    const list = (raw as { announcements?: unknown; } | null)?.announcements;
    if (!Array.isArray(list)) return [];
    return list.flatMap(a => {
        if (!a || typeof a !== "object") return [];
        const { id, title, body, link, at } = a as Record<string, unknown>;
        if (!Number.isInteger(id) || typeof at !== "number") return [];
        const input = parseAnnouncementInput({ title, body, link });
        return "error" in input ? [] : [{ id: id as number, at, ...input }];
    });
}
