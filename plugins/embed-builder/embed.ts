/**
 * Embed Builder's message: what the editor holds, Discord's limits on it, and the JSON a webhook
 * takes. Pure, so the tests can check it without Discord.
 *
 * Imports read the plain webhook body ({ content, embeds, username, avatar_url }), Discohook's
 * share format ({ messages: [{ data: { content, embeds } }] }), a bare list of embeds, or one
 * embed. Exports are the plain webhook body, which Discohook and most bots read too.
 */

export interface Field { name: string; value: string; inline: boolean; }

export interface Embed {
    authorName: string;
    authorUrl: string;
    authorIcon: string;
    title: string;
    url: string;
    description: string;
    /** "#rrggbb", or "" for Discord's default */
    color: string;
    fields: Field[];
    image: string;
    thumbnail: string;
    footerText: string;
    footerIcon: string;
    /** ISO date, or "" for none */
    timestamp: string;
}

export interface Draft {
    content: string;
    username: string;
    avatarUrl: string;
    embeds: Embed[];
}

/** Discord's own limits (developer docs, "Embed Limits" and "Execute Webhook") */
export const LIMITS = {
    content: 2000,
    username: 80,
    embeds: 10,
    title: 256,
    description: 4096,
    fields: 25,
    fieldName: 256,
    fieldValue: 1024,
    footer: 2048,
    author: 256,
    total: 6000,
} as const;

export const emptyField = (): Field => ({ name: "", value: "", inline: false });

export const emptyEmbed = (): Embed => ({
    authorName: "", authorUrl: "", authorIcon: "",
    title: "", url: "", description: "", color: "",
    fields: [], image: "", thumbnail: "",
    footerText: "", footerIcon: "", timestamp: "",
});

export const emptyDraft = (): Draft => ({ content: "", username: "", avatarUrl: "", embeds: [emptyEmbed()] });

// ---- colours ------------------------------------------------------------------------------------

export function hexToInt(hex: string): number | undefined {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    return m ? parseInt(m[1], 16) : undefined;
}

export const intToHex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

// ---- lengths and checks -------------------------------------------------------------------------

/** What counts toward the 6000 characters an embed may hold */
export const embedLength = (e: Embed) =>
    e.title.length + e.description.length + e.authorName.length + e.footerText.length
    + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);

export const totalLength = (d: Draft) => d.embeds.reduce((n, e) => n + embedLength(e), 0);

export const isUrl = (s: string) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s.trim());

/** Image fields also take attachment://name, for files sent with the message */
const isImageUrl = (s: string) => isUrl(s) || /^attachment:\/\/[^\s/]+$/i.test(s.trim());

const hasContent = (e: Embed) =>
    !!(e.title.trim() || e.description.trim() || e.authorName.trim() || e.footerText.trim() || e.image.trim() || e.thumbnail.trim()
        || e.fields.some(f => f.name.trim() || f.value.trim()));

export type Problem =
    | { kind: "tooLong"; where: string; limit: number; length: number; }
    | { kind: "tooMany"; where: "embeds" | "fields"; limit: number; count: number; }
    | { kind: "badUrl"; where: string; }
    | { kind: "badColor"; where: string; }
    | { kind: "badTimestamp"; where: string; }
    | { kind: "emptyEmbed"; where: string; }
    | { kind: "fieldNeedsBoth"; where: string; }
    | { kind: "empty"; };

/**
 * Everything Discord would refuse, with where it is ("embed 2 field 3 value"). `where` is a path of
 * keys the editor uses to mark the input: "content", "e1.title", "e1.f2.value"...
 */
export function problems(d: Draft): Problem[] {
    const out: Problem[] = [];
    const long = (where: string, text: string, limit: number) => {
        if (text.length > limit) out.push({ kind: "tooLong", where, limit, length: text.length });
    };
    const url = (where: string, text: string, image = false) => {
        if (text.trim() && !(image ? isImageUrl(text) : isUrl(text))) out.push({ kind: "badUrl", where });
    };
    long("content", d.content, LIMITS.content);
    long("username", d.username, LIMITS.username);
    url("avatarUrl", d.avatarUrl, true);
    if (d.embeds.length > LIMITS.embeds) out.push({ kind: "tooMany", where: "embeds", limit: LIMITS.embeds, count: d.embeds.length });
    d.embeds.forEach((e, i) => {
        const p = `e${i + 1}`;
        long(`${p}.title`, e.title, LIMITS.title);
        long(`${p}.description`, e.description, LIMITS.description);
        long(`${p}.authorName`, e.authorName, LIMITS.author);
        long(`${p}.footerText`, e.footerText, LIMITS.footer);
        url(`${p}.url`, e.url);
        url(`${p}.authorUrl`, e.authorUrl);
        url(`${p}.authorIcon`, e.authorIcon, true);
        url(`${p}.image`, e.image, true);
        url(`${p}.thumbnail`, e.thumbnail, true);
        url(`${p}.footerIcon`, e.footerIcon, true);
        if (e.color && hexToInt(e.color) === undefined) out.push({ kind: "badColor", where: `${p}.color` });
        if (e.timestamp && Number.isNaN(Date.parse(e.timestamp))) out.push({ kind: "badTimestamp", where: `${p}.timestamp` });
        if (e.fields.length > LIMITS.fields) out.push({ kind: "tooMany", where: "fields", limit: LIMITS.fields, count: e.fields.length });
        e.fields.forEach((f, j) => {
            long(`${p}.f${j + 1}.name`, f.name, LIMITS.fieldName);
            long(`${p}.f${j + 1}.value`, f.value, LIMITS.fieldValue);
            // Discord needs both, but a field left completely empty is just dropped
            if (!!f.name.trim() !== !!f.value.trim()) out.push({ kind: "fieldNeedsBoth", where: `${p}.f${j + 1}` });
        });
        // An author icon or URL without a name, or a footer icon without text, isn't shown
        if (!hasContent(e) && (e.url || e.color || e.timestamp || e.authorIcon || e.footerIcon)) out.push({ kind: "emptyEmbed", where: p });
    });
    if (totalLength(d) > LIMITS.total) out.push({ kind: "tooLong", where: "total", limit: LIMITS.total, length: totalLength(d) });
    if (!d.content.trim() && !d.embeds.some(hasContent)) out.push({ kind: "empty" });
    return out;
}

// ---- to and from Discord's JSON -----------------------------------------------------------------

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
const opt = (s: string) => s.trim() || undefined;

export function embedPayload(e: Embed): Record<string, unknown> {
    const author = e.authorName.trim() ? clean({ name: e.authorName.trim(), url: opt(e.authorUrl), icon_url: opt(e.authorIcon) }) : undefined;
    const footer = e.footerText.trim() ? clean({ text: e.footerText.trim(), icon_url: opt(e.footerIcon) }) : undefined;
    const fields = e.fields.filter(f => f.name.trim() && f.value.trim()).map(f => ({ name: f.name, value: f.value, inline: f.inline }));
    const color = hexToInt(e.color);
    const time = e.timestamp && !Number.isNaN(Date.parse(e.timestamp)) ? new Date(e.timestamp).toISOString() : undefined;
    return clean({
        author,
        title: opt(e.title),
        url: opt(e.url),
        description: e.description.trim() ? e.description : undefined,
        color,
        fields: fields.length ? fields : undefined,
        image: opt(e.image) ? { url: e.image.trim() } : undefined,
        thumbnail: opt(e.thumbnail) ? { url: e.thumbnail.trim() } : undefined,
        footer,
        timestamp: time,
    });
}

/** The body for POST /webhooks/:id/:token (and, without username and avatar, for editing a message) */
export function payload(d: Draft, editing = false): Record<string, unknown> {
    const embeds = d.embeds.filter(hasContent).map(embedPayload);
    const body: Record<string, unknown> = {
        content: d.content,
        embeds,
        // Mentions ping as they would in a message you type
        allowed_mentions: { parse: ["users", "roles", "everyone"] },
    };
    if (!editing) {
        if (d.username.trim()) body.username = d.username.trim();
        if (d.avatarUrl.trim()) body.avatar_url = d.avatarUrl.trim();
    }
    return body;
}

const str = (v: unknown, max = 8000) => typeof v === "string" ? v.slice(0, max) : "";

export function embedFromJson(raw: any): Embed {
    const e = emptyEmbed();
    if (!raw || typeof raw !== "object") return e;
    e.authorName = str(raw.author?.name);
    e.authorUrl = str(raw.author?.url);
    e.authorIcon = str(raw.author?.icon_url);
    e.title = str(raw.title);
    e.url = str(raw.url);
    e.description = str(raw.description);
    e.color = typeof raw.color === "number" && Number.isFinite(raw.color) ? intToHex(raw.color) : typeof raw.color === "string" && hexToInt(raw.color) !== undefined ? intToHex(hexToInt(raw.color)!) : "";
    e.fields = Array.isArray(raw.fields) ? raw.fields.slice(0, 50).map((f: any) => ({ name: str(f?.name), value: str(f?.value), inline: f?.inline === true })) : [];
    e.image = str(raw.image?.url);
    e.thumbnail = str(raw.thumbnail?.url);
    e.footerText = str(raw.footer?.text);
    e.footerIcon = str(raw.footer?.icon_url);
    e.timestamp = typeof raw.timestamp === "string" && !Number.isNaN(Date.parse(raw.timestamp)) ? new Date(raw.timestamp).toISOString() : "";
    return e;
}

/** A draft from pasted or loaded JSON; throws when it's none of the shapes above */
export function draftFromJson(text: string): Draft {
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error("not-json");
    }
    // Discohook: { messages: [{ data: {...} }] }, the first message
    if (Array.isArray(raw?.messages)) raw = raw.messages[0]?.data ?? raw.messages[0];
    // Discohook's older backup: { message: {...} }
    else if (raw?.message && typeof raw.message === "object" && !Array.isArray(raw.message)) raw = raw.message;
    if (Array.isArray(raw)) raw = { embeds: raw };
    if (!raw || typeof raw !== "object") throw new Error("not-message");
    const looksLikeEmbed = !("embeds" in raw) && !("content" in raw) && ["title", "description", "fields", "author", "footer", "image"].some(k => k in raw);
    if (looksLikeEmbed) raw = { embeds: [raw] };
    if (!("embeds" in raw) && !("content" in raw)) throw new Error("not-message");
    const embeds = Array.isArray(raw.embeds) ? raw.embeds.slice(0, 20).map(embedFromJson) : [];
    return {
        content: str(raw.content),
        username: str(raw.username, 200),
        avatarUrl: str(raw.avatar_url, 2000),
        embeds,
    };
}

export const draftToJson = (d: Draft) => JSON.stringify(payload(d), null, 2);

/**
 * Where each field sits in Discord's 12-column field grid: a field that isn't inline takes the
 * whole row; inline ones share a row, `perRow` at most (3, or 2 next to a thumbnail), evenly.
 */
export function fieldColumns(inline: boolean[], perRow: number): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < inline.length) {
        if (!inline[i]) {
            out.push("1 / 13");
            i++;
            continue;
        }
        let run = 0;
        while (i + run < inline.length && inline[i + run] && run < perRow) run++;
        const span = 12 / run;
        for (let k = 0; k < run; k++) out.push(`${1 + k * span} / ${1 + (k + 1) * span}`);
        i += run;
    }
    return out;
}

// ---- links --------------------------------------------------------------------------------------

/** https://discord.com/channels/<guild>/<channel>/<message>, from any Discord host */
export function parseMessageLink(link: string): { guildId: string; channelId: string; messageId: string; } | undefined {
    const m = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{15,22}|@me)\/(\d{15,22})\/(\d{15,22})\/?$/i.exec(link.trim());
    return m ? { guildId: m[1], channelId: m[2], messageId: m[3] } : undefined;
}

/** A webhook's execute URL, with the thread it posts in and the message it edits */
export function webhookUrl(id: string, token: string, options: { threadId?: string; messageId?: string; wait?: boolean; } = {}) {
    const base = `https://discord.com/api/v10/webhooks/${id}/${encodeURIComponent(token)}`;
    const path = options.messageId ? `${base}/messages/${options.messageId}` : base;
    const query = new URLSearchParams();
    if (options.wait) query.set("wait", "true");
    if (options.threadId) query.set("thread_id", options.threadId);
    const q = query.toString();
    return q ? `${path}?${q}` : path;
}

/** Channel types webhooks post in: text, announcement, and threads (through their parent's webhook) */
export const THREAD_TYPES = new Set([10, 11, 12]);
export const WEBHOOK_TYPES = new Set([0, 5, ...THREAD_TYPES]);

/** Incoming webhooks this channel can use: ones with a token (type 1); channel-follower and app webhooks have none */
export function usableWebhooks(list: unknown): { id: string; name: string; token: string; avatar: string | null; channelId: string; }[] {
    if (!Array.isArray(list)) return [];
    return list
        .filter((w: any) => w && w.type === 1 && typeof w.id === "string" && typeof w.token === "string" && w.token)
        .map((w: any) => ({ id: w.id, name: typeof w.name === "string" && w.name ? w.name : "Webhook", token: w.token, avatar: typeof w.avatar === "string" ? w.avatar : null, channelId: String(w.channel_id ?? "") }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
