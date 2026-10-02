/**
 * Embed Builder: compose a webhook message (content, up to 10 embeds) with a live preview, then
 * send it through one of the channel's webhooks, or edit a message a webhook sent before.
 *
 * - Where: right-click a text channel or thread you can manage webhooks in, or /embed there.
 * - Webhooks: GET /channels/:id/webhooks with Discord's own API client (threads use their parent's
 *   and post with ?thread_id). "New webhook" makes one named "Evi Embeds".
 * - Sending: the webhook's own URL (it carries its token, so no account token is involved), with the
 *   plugin's fetch, which Evi limits to discord.com. Webhook tokens are never logged or saved.
 * - Drafts: the open message is kept per channel while you work, and named drafts are kept in the
 *   plugin's settings.
 */
import { definePlugin, filters, find, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import {
    Draft, draftFromJson, draftToJson, Embed, emptyDraft, emptyEmbed, emptyField, embedLength, Field, fieldColumns, hexToInt, LIMITS, parseMessageLink,
    payload, Problem, problems, THREAD_TYPES, totalLength, usableWebhooks, WEBHOOK_TYPES, webhookUrl,
} from "./embed";
import { t } from "./strings";

let context: PluginContext | undefined;

const MANAGE_WEBHOOKS = 1n << 29n;
const DRAFTS_KEY = "drafts";
const OPEN_KEY = "open";
const MAX_DRAFTS = 30;
const WEBHOOK_NAME = "Evi Embeds";

// ---- Discord ------------------------------------------------------------------------------------

const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

type HttpClient = { get(opts: any): Promise<any>; post(opts: any): Promise<any>; };
/** Discord's API client ({ get, post, put, patch, del }), not the superagent under it (see Emoji Stealer) */
const http = (): HttpClient | undefined => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

const markdown = (): any => find(filters.byProps("parse", "parseTopic"));

/** The channel webhooks live in: a thread's parent */
const webhookChannelId = (channel: any): string => THREAD_TYPES.has(channel?.type) ? channel.parent_id ?? channel.parentId : channel.id;

function canUse(channel: any): boolean {
    if (!channel?.guild_id || !WEBHOOK_TYPES.has(channel.type)) return false;
    try {
        const target = THREAD_TYPES.has(channel.type) ? store("ChannelStore")?.getChannel?.(webhookChannelId(channel)) : channel;
        return !!target && !!store("PermissionStore")?.can?.(MANAGE_WEBHOOKS, target);
    } catch {
        return false;
    }
}

function errorText(err: any, fallback: string): string {
    const body = err?.body;
    if (body && typeof body === "object") {
        if (typeof body.message === "string" && body.message && body.message !== "Invalid Form Body") return body.message;
        const first = firstError(body.errors ?? body);
        if (first) return first;
        if (typeof body.message === "string" && body.message) return body.message;
    }
    if (typeof err?.message === "string" && err.message) return err.message;
    return fallback;
}

function firstError(node: any, path = ""): string | undefined {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node._errors) && node._errors[0]?.message) return path ? `${path}: ${node._errors[0].message}` : node._errors[0].message;
    for (const [k, v] of Object.entries(node)) {
        const found = firstError(v, path ? `${path}.${k}` : k);
        if (found) return found;
    }
    return undefined;
}

interface Webhook { id: string; name: string; token: string; avatar: string | null; channelId: string; }

async function listWebhooks(channel: any): Promise<Webhook[]> {
    const client = http();
    if (!client) throw new Error(t("error.noClient"));
    const res = await client.get({ url: `/channels/${webhookChannelId(channel)}/webhooks`, rejectWithError: true });
    return usableWebhooks(res?.body);
}

async function createWebhook(channel: any): Promise<Webhook> {
    const client = http();
    if (!client) throw new Error(t("error.noClient"));
    const res = await client.post({ url: `/channels/${webhookChannelId(channel)}/webhooks`, body: { name: WEBHOOK_NAME }, rejectWithError: true });
    const [hook] = usableWebhooks([res?.body]);
    if (!hook) throw new Error(t("error.createFailed"));
    return hook;
}

/** Calls a webhook URL; Discord's error message on failure */
async function callWebhook(url: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<any> {
    const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any;
    try {
        json = text ? JSON.parse(text) : undefined;
    } catch { /* not JSON */ }
    if (!res.ok) {
        if (res.status === 429) throw new Error(t("error.rateLimited", { seconds: Math.ceil(Number(json?.retry_after) || 1) }));
        if (res.status === 404) throw new Error(t("error.notFound"));
        throw new Error(errorText({ body: json }, t("error.status", { status: res.status })));
    }
    return json;
}

async function copy(text: string, done: string) {
    try {
        const native = (window as any).DiscordNative?.clipboard;
        if (native?.copy) native.copy(text);
        else await navigator.clipboard.writeText(text);
        context?.toast(done, { type: "success" });
    } catch {
        context?.toast(t("toast.copyFailed"), { type: "failure" });
    }
}

// ---- Drafts -------------------------------------------------------------------------------------

interface SavedDraft { name: string; savedAt: number; draft: Draft; }

const storage = () => context?.settings as unknown as { get(key: string): any; set(key: string, value: unknown): void; } | undefined;

function savedDrafts(): SavedDraft[] {
    const raw = storage()?.get(DRAFTS_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(d => d && typeof d.name === "string" && d.draft).map(d => {
        try {
            return { name: d.name, savedAt: Number(d.savedAt) || 0, draft: draftFromJson(JSON.stringify(d.draft)) };
        } catch {
            return undefined;
        }
    }).filter((d): d is SavedDraft => !!d);
}

/** Drafts are kept in the webhook body shape, so they survive changes to the editor */
const storeDrafts = (list: SavedDraft[]) => storage()?.set(DRAFTS_KEY, list.slice(0, MAX_DRAFTS).map(d => ({ name: d.name, savedAt: d.savedAt, draft: payload(d.draft) })));

function openDrafts(): Record<string, unknown> {
    const raw = storage()?.get(OPEN_KEY);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function loadOpen(channelId: string): Draft | undefined {
    const raw = openDrafts()[channelId];
    if (!raw) return undefined;
    try {
        return draftFromJson(JSON.stringify(raw));
    } catch {
        return undefined;
    }
}

function saveOpen(channelId: string, draft: Draft | undefined) {
    const all = { ...openDrafts() };
    if (draft) all[channelId] = payload(draft);
    else delete all[channelId];
    // Only the last few channels
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 10))) delete all[k];
    storage()?.set(OPEN_KEY, all);
}

const draftName = (d: Draft) => {
    const e = d.embeds[0];
    const text = (e?.title || e?.description || d.content || e?.authorName || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 48) : t("drafts.untitled");
};

// ---- Preview ------------------------------------------------------------------------------------

/** Discord's own markdown: its embed title rules for titles, its message rules for the rest */
function Markdown({ text, channelId, inline }: { text: string; channelId: string; inline?: boolean; }) {
    let nodes: ReactNode = text;
    try {
        const md = markdown();
        if (inline && typeof md?.parseEmbedTitle === "function") nodes = md.parseEmbedTitle(text, true, { channelId });
        else if (md?.parse) nodes = md.parse(text, true, { channelId, allowLinks: true, allowHeading: !inline, allowList: !inline, allowEmojiLinks: true });
    } catch { /* plain text */ }
    return <>{nodes}</>;
}

const shown = (url: string) => /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;

function EmbedPreview({ e, channelId }: { e: Embed; channelId: string; }) {
    const color = hexToInt(e.color);
    const fields = e.fields.filter(f => f.name.trim() || f.value.trim());
    const thumb = shown(e.thumbnail);
    const image = shown(e.image);
    const time = e.timestamp && !Number.isNaN(Date.parse(e.timestamp)) ? new Date(e.timestamp) : undefined;
    const columns = fieldColumns(fields.map(f => f.inline), thumb ? 2 : 3);
    return (
        <article className="evi-eb-embed" style={{ borderInlineStartColor: color === undefined ? undefined : `#${color.toString(16).padStart(6, "0")}` }}>
            <div className="evi-eb-embed-grid" data-thumb={thumb ? "" : undefined}>
                {e.authorName.trim() && (
                    <div className="evi-eb-embed-author">
                        {shown(e.authorIcon) && <img src={shown(e.authorIcon)} alt="" />}
                        {shown(e.authorUrl) ? <a href={shown(e.authorUrl)} target="_blank" rel="noreferrer">{e.authorName}</a> : <span>{e.authorName}</span>}
                    </div>
                )}
                {e.title.trim() && (
                    <div className="evi-eb-embed-title">
                        {shown(e.url)
                            ? <a href={shown(e.url)} target="_blank" rel="noreferrer"><Markdown text={e.title} channelId={channelId} inline /></a>
                            : <Markdown text={e.title} channelId={channelId} inline />}
                    </div>
                )}
                {e.description.trim() && <div className="evi-eb-embed-description"><Markdown text={e.description} channelId={channelId} /></div>}
                {fields.length > 0 && (
                    <div className="evi-eb-embed-fields">
                        {fields.map((f, i) => (
                            <div key={i} className="evi-eb-embed-field" style={{ gridColumn: columns[i] }}>
                                <div className="evi-eb-embed-field-name"><Markdown text={f.name} channelId={channelId} inline /></div>
                                <div className="evi-eb-embed-field-value"><Markdown text={f.value} channelId={channelId} /></div>
                            </div>
                        ))}
                    </div>
                )}
                {image && <img className="evi-eb-embed-image" src={image} alt="" />}
                {thumb && <img className="evi-eb-embed-thumb" src={thumb} alt="" />}
                {(e.footerText.trim() || time) && (
                    <div className="evi-eb-embed-footer">
                        {shown(e.footerIcon) && e.footerText.trim() && <img src={shown(e.footerIcon)} alt="" />}
                        <span>
                            {e.footerText.trim()}
                            {e.footerText.trim() && time && <span className="evi-eb-dot">•</span>}
                            {time && time.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                    </div>
                )}
            </div>
        </article>
    );
}

function MessagePreview({ draft, webhook, channelId }: { draft: Draft; webhook?: Webhook; channelId: string; }) {
    const name = draft.username.trim() || webhook?.name || WEBHOOK_NAME;
    const avatar = shown(draft.avatarUrl)
        ?? (webhook?.avatar ? `https://cdn.discordapp.com/avatars/${webhook.id}/${webhook.avatar}.png?size=80` : "https://cdn.discordapp.com/embed/avatars/0.png");
    const now = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return (
        <div className="evi-eb-message">
            <img className="evi-eb-avatar" src={avatar} alt="" />
            <div className="evi-eb-message-body">
                <div className="evi-eb-message-head">
                    <span className="evi-eb-username">{name}</span>
                    <span className="evi-eb-tag">{t("preview.app")}</span>
                    <span className="evi-eb-time">{t("preview.today", { time: now })}</span>
                </div>
                {draft.content.trim() && <div className="evi-eb-content"><Markdown text={draft.content} channelId={channelId} /></div>}
                {draft.embeds.map((e, i) => <EmbedPreview key={i} e={e} channelId={channelId} />)}
            </div>
        </div>
    );
}

// ---- Editor pieces ------------------------------------------------------------------------------

function problemText(p: Problem): string {
    switch (p.kind) {
        case "tooLong": return t("problem.tooLong", { where: whereText(p.where), length: p.length, limit: p.limit });
        case "tooMany": return t(p.where === "embeds" ? "problem.tooManyEmbeds" : "problem.tooManyFields", { limit: p.limit });
        case "badUrl": return t("problem.badUrl", { where: whereText(p.where) });
        case "badColor": return t("problem.badColor", { where: whereText(p.where) });
        case "badTimestamp": return t("problem.badTimestamp", { where: whereText(p.where) });
        case "emptyEmbed": return t("problem.emptyEmbed", { where: whereText(p.where) });
        case "fieldNeedsBoth": return t("problem.fieldNeedsBoth", { where: whereText(p.where) });
        case "empty": return t("problem.empty");
    }
}

/** "e2.f3.value" → "Embed 2, field 3, value" */
function whereText(where: string): string {
    if (where === "total") return t("where.total");
    const parts: string[] = [];
    for (const part of where.split(".")) {
        const e = /^e(\d+)$/.exec(part);
        const f = /^f(\d+)$/.exec(part);
        if (e) parts.push(t("where.embed", { n: e[1] }));
        else if (f) parts.push(t("where.field", { n: f[1] }));
        else parts.push(t(`where.${part}` as any));
    }
    return parts.join(", ");
}

function Counter({ length, limit }: { length: number; limit: number; }) {
    if (length < limit * 0.8) return null;
    return <span className="evi-eb-counter" data-over={length > limit ? "" : undefined}>{limit - length}</span>;
}

function TextInput({ label, value, onChange, limit, placeholder, multiline, invalid, rows }: {
    label: string; value: string; onChange(v: string): void; limit?: number; placeholder?: string; multiline?: boolean; invalid?: boolean; rows?: number;
}) {
    const id = React.useId();
    return (
        <div className="evi-eb-input">
            <label htmlFor={id}>
                <span>{label}</span>
                {limit !== undefined && <Counter length={value.length} limit={limit} />}
            </label>
            {multiline
                ? <textarea id={id} value={value} rows={rows ?? 3} placeholder={placeholder} aria-invalid={invalid || (limit !== undefined && value.length > limit) ? true : undefined} onChange={e => onChange(e.currentTarget.value)} />
                : <input id={id} type="text" value={value} placeholder={placeholder} aria-invalid={invalid || (limit !== undefined && value.length > limit) ? true : undefined} onChange={e => onChange(e.currentTarget.value)} />}
        </div>
    );
}

const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Icon({ d, size = 16 }: { d: string; size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={d} /></svg>;
}
const ICON = {
    up: "M12 7.4 5.7 13.7a1 1 0 1 0 1.4 1.4L12 10.2l4.9 4.9a1 1 0 0 0 1.4-1.4L12 7.4Z",
    down: "M12 16.6l6.3-6.3a1 1 0 1 0-1.4-1.4L12 13.8 7.1 8.9a1 1 0 0 0-1.4 1.4l6.3 6.3Z",
    trash: "M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z",
    close: "M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z",
    chevron: "M9.3 5.3a1 1 0 0 0 0 1.4l5.29 5.3-5.3 5.3a1 1 0 1 0 1.42 1.4l6-6a1 1 0 0 0 0-1.4l-6-6a1 1 0 0 0-1.42 0Z",
    copy: "M8 3h10a3 3 0 0 1 3 3v10h-2V6a1 1 0 0 0-1-1H8V3Zm-3 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
};

function IconButton({ label, icon, onClick, disabled, danger }: { label: string; icon: keyof typeof ICON; onClick(): void; disabled?: boolean; danger?: boolean; }) {
    return (
        <button type="button" className="evi-eb-icon" aria-label={label} title={label} disabled={disabled} data-danger={danger ? "" : undefined} onClick={onClick}>
            <Icon d={ICON[icon]} />
        </button>
    );
}

function FieldEditor({ field, index, count, onChange, onMove, onRemove }: {
    field: Field; index: number; count: number; onChange(f: Field): void; onMove(by: number): void; onRemove(): void;
}) {
    return (
        <div className="evi-eb-field">
            <div className="evi-eb-row-head">
                <span>{t("field.title", { n: index + 1 })}</span>
                <label className="evi-eb-check">
                    <input type="checkbox" checked={field.inline} onChange={e => onChange({ ...field, inline: e.currentTarget.checked })} />
                    {t("field.inline")}
                </label>
                <IconButton label={t("action.moveUp")} icon="up" disabled={index === 0} onClick={() => onMove(-1)} />
                <IconButton label={t("action.moveDown")} icon="down" disabled={index === count - 1} onClick={() => onMove(1)} />
                <IconButton label={t("action.removeField")} icon="trash" danger onClick={onRemove} />
            </div>
            <TextInput label={t("field.name")} value={field.name} limit={LIMITS.fieldName} onChange={name => onChange({ ...field, name })} />
            <TextInput label={t("field.value")} value={field.value} limit={LIMITS.fieldValue} multiline rows={2} onChange={value => onChange({ ...field, value })} />
        </div>
    );
}

function EmbedEditor({ embed, index, count, open, onToggle, onChange, onMove, onRemove, onDuplicate, bad }: {
    embed: Embed; index: number; count: number; open: boolean; onToggle(): void; onChange(e: Embed): void; onMove(by: number): void; onRemove(): void; onDuplicate(): void; bad: Set<string>;
}) {
    const set = <K extends keyof Embed>(key: K) => (value: Embed[K]) => onChange({ ...embed, [key]: value });
    const p = `e${index + 1}`;
    const colorValue = hexToInt(embed.color) === undefined ? "#5865f2" : embed.color;
    const fields = embed.fields;
    const setField = (i: number, f: Field) => set("fields")(fields.map((x, j) => j === i ? f : x));
    const moveField = (i: number, by: number) => {
        const next = [...fields];
        const [f] = next.splice(i, 1);
        next.splice(i + by, 0, f);
        set("fields")(next);
    };
    const summary = embed.title.trim() || embed.authorName.trim() || embed.description.trim().slice(0, 40);
    return (
        <section className="evi-eb-card" data-open={open ? "" : undefined}>
            <header className="evi-eb-card-head">
                <button type="button" className="evi-eb-card-toggle" aria-expanded={open} onClick={onToggle}>
                    <span className="evi-eb-chevron"><Icon d={ICON.chevron} /></span>
                    <span className="evi-eb-swatch" style={{ background: hexToInt(embed.color) === undefined ? undefined : embed.color }} />
                    <span className="evi-eb-card-title">{t("embed.title", { n: index + 1 })}</span>
                    {summary && <span className="evi-eb-card-summary">{summary}</span>}
                </button>
                <span className="evi-eb-counter-quiet">{embedLength(embed)}</span>
                <IconButton label={t("action.moveUp")} icon="up" disabled={index === 0} onClick={() => onMove(-1)} />
                <IconButton label={t("action.moveDown")} icon="down" disabled={index === count - 1} onClick={() => onMove(1)} />
                <IconButton label={t("action.duplicate")} icon="copy" disabled={count >= LIMITS.embeds} onClick={onDuplicate} />
                <IconButton label={t("action.removeEmbed")} icon="trash" danger onClick={onRemove} />
            </header>
            {open && (
                <div className="evi-eb-card-body">
                    <h4>{t("group.author")}</h4>
                    <TextInput label={t("embed.authorName")} value={embed.authorName} limit={LIMITS.author} onChange={set("authorName")} />
                    <div className="evi-eb-pair">
                        <TextInput label={t("embed.authorUrl")} value={embed.authorUrl} placeholder="https://" invalid={bad.has(`${p}.authorUrl`)} onChange={set("authorUrl")} />
                        <TextInput label={t("embed.authorIcon")} value={embed.authorIcon} placeholder="https://" invalid={bad.has(`${p}.authorIcon`)} onChange={set("authorIcon")} />
                    </div>

                    <h4>{t("group.body")}</h4>
                    <TextInput label={t("embed.titleField")} value={embed.title} limit={LIMITS.title} onChange={set("title")} />
                    <TextInput label={t("embed.url")} value={embed.url} placeholder="https://" invalid={bad.has(`${p}.url`)} onChange={set("url")} />
                    <TextInput label={t("embed.description")} value={embed.description} limit={LIMITS.description} multiline rows={4} onChange={set("description")} />
                    <div className="evi-eb-input">
                        <label><span>{t("embed.color")}</span></label>
                        <div className="evi-eb-color">
                            <input type="color" aria-label={t("embed.color")} value={colorValue} onChange={e => set("color")(e.currentTarget.value)} />
                            <input type="text" value={embed.color} placeholder="#5865F2" aria-invalid={bad.has(`${p}.color`) || undefined} onChange={e => set("color")(e.currentTarget.value.trim())} />
                            {embed.color && <button type="button" className="evi-eb-link" onClick={() => set("color")("")}>{t("action.clear")}</button>}
                        </div>
                    </div>

                    <h4>{t("group.fields", { count: fields.length, limit: LIMITS.fields })}</h4>
                    {fields.map((f, i) => (
                        <FieldEditor
                            key={i}
                            field={f}
                            index={i}
                            count={fields.length}
                            onChange={next => setField(i, next)}
                            onMove={by => moveField(i, by)}
                            onRemove={() => set("fields")(fields.filter((_, j) => j !== i))}
                        />
                    ))}
                    <button type="button" className="evi-eb-add" disabled={fields.length >= LIMITS.fields} onClick={() => set("fields")([...fields, emptyField()])}>{t("action.addField")}</button>

                    <h4>{t("group.images")}</h4>
                    <div className="evi-eb-pair">
                        <TextInput label={t("embed.image")} value={embed.image} placeholder="https://" invalid={bad.has(`${p}.image`)} onChange={set("image")} />
                        <TextInput label={t("embed.thumbnail")} value={embed.thumbnail} placeholder="https://" invalid={bad.has(`${p}.thumbnail`)} onChange={set("thumbnail")} />
                    </div>

                    <h4>{t("group.footer")}</h4>
                    <TextInput label={t("embed.footerText")} value={embed.footerText} limit={LIMITS.footer} onChange={set("footerText")} />
                    <TextInput label={t("embed.footerIcon")} value={embed.footerIcon} placeholder="https://" invalid={bad.has(`${p}.footerIcon`)} onChange={set("footerIcon")} />
                    <div className="evi-eb-input">
                        <label><span>{t("embed.timestamp")}</span></label>
                        <div className="evi-eb-color">
                            <input
                                type="datetime-local"
                                value={embed.timestamp ? toLocalInput(embed.timestamp) : ""}
                                onChange={e => {
                                    const v = e.currentTarget.value;
                                    set("timestamp")(v ? new Date(v).toISOString() : "");
                                }}
                            />
                            <button type="button" className="evi-eb-link" onClick={() => set("timestamp")(new Date().toISOString())}>{t("action.now")}</button>
                            {embed.timestamp && <button type="button" className="evi-eb-link" onClick={() => set("timestamp")("")}>{t("action.clear")}</button>}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

// ---- The dialog ---------------------------------------------------------------------------------

type Panel = "none" | "import" | "edit" | "drafts";

function Builder({ channel, onClose }: { channel: any; onClose(): void; }) {
    const [draft, setDraftState] = React.useState<Draft>(() => loadOpen(channel.id) ?? emptyDraft());
    const [open, setOpen] = React.useState<Set<number>>(() => new Set([0]));
    const [webhooks, setWebhooks] = React.useState<Webhook[] | undefined>();
    const [hookId, setHookId] = React.useState("");
    const [loadError, setLoadError] = React.useState<string>();
    const [busy, setBusy] = React.useState<string>();
    const [error, setError] = React.useState<string>();
    const [panel, setPanel] = React.useState<Panel>("none");
    const [importText, setImportText] = React.useState("");
    const [editLink, setEditLink] = React.useState("");
    const [editing, setEditing] = React.useState<{ messageId: string; }>();
    const [drafts, setDrafts] = React.useState<SavedDraft[]>(() => savedDrafts());
    const [showProblems, setShowProblems] = React.useState(false);

    const threadId = THREAD_TYPES.has(channel.type) ? channel.id : undefined;
    const webhook = webhooks?.find(w => w.id === hookId);

    const setDraft = (next: Draft) => {
        setDraftState(next);
        setError(undefined);
    };

    // Kept while you work, so closing by accident loses nothing
    React.useEffect(() => {
        const timer = setTimeout(() => saveOpen(channel.id, draft), 400);
        return () => clearTimeout(timer);
    }, [draft]);

    React.useEffect(() => {
        let gone = false;
        listWebhooks(channel).then(list => {
            if (gone) return;
            setWebhooks(list);
            setHookId(list.find(w => w.name === WEBHOOK_NAME)?.id ?? list[0]?.id ?? "");
        }, err => !gone && setLoadError(errorText(err, t("error.loadWebhooks"))));
        return () => void (gone = true);
    }, [channel.id]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (panel !== "none") setPanel("none");
            else if (!busy) onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [panel, busy]);

    const found = problems(draft);
    const bad = new Set(found.flatMap(p => "where" in p ? [p.where] : []));
    const total = totalLength(draft);

    const setEmbed = (i: number, e: Embed) => setDraft({ ...draft, embeds: draft.embeds.map((x, j) => j === i ? e : x) });
    const moveEmbed = (i: number, by: number) => {
        const embeds = [...draft.embeds];
        const [e] = embeds.splice(i, 1);
        embeds.splice(i + by, 0, e);
        setDraft({ ...draft, embeds });
        setOpen(new Set([i + by]));
    };
    const toggle = (i: number) => setOpen(prev => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
    });

    async function newWebhook() {
        setBusy("create");
        setError(undefined);
        try {
            const hook = await createWebhook(channel);
            setWebhooks(list => [...(list ?? []), hook].sort((a, b) => a.name.localeCompare(b.name)));
            setHookId(hook.id);
            setLoadError(undefined);
        } catch (err) {
            setError(errorText(err, t("error.createFailed")));
        } finally {
            setBusy(undefined);
        }
    }

    async function send() {
        if (found.length) {
            setShowProblems(true);
            return;
        }
        if (!webhook) {
            setError(t("error.pickWebhook"));
            return;
        }
        setBusy("send");
        setError(undefined);
        try {
            if (editing) {
                await callWebhook(webhookUrl(webhook.id, webhook.token, { messageId: editing.messageId, threadId }), "PATCH", payload(draft, true));
                context?.toast(t("toast.edited"), { type: "success" });
            } else {
                await callWebhook(webhookUrl(webhook.id, webhook.token, { wait: true, threadId }), "POST", payload(draft));
                context?.toast(t("toast.sent", { channel: channel.name ?? "" }), { type: "success" });
            }
            saveOpen(channel.id, undefined);
            onClose();
        } catch (err) {
            setError(errorText(err, t("error.sendFailed")));
        } finally {
            setBusy(undefined);
        }
    }

    async function loadMessage() {
        const link = parseMessageLink(editLink);
        if (!link) {
            setError(t("error.badLink"));
            return;
        }
        if (!webhook) {
            setError(t("error.pickWebhook"));
            return;
        }
        setBusy("load");
        setError(undefined);
        try {
            const message = await callWebhook(webhookUrl(webhook.id, webhook.token, { messageId: link.messageId, threadId: link.channelId !== webhookChannelId(channel) ? link.channelId : threadId }), "GET");
            const loaded = draftFromJson(JSON.stringify({ content: message?.content ?? "", embeds: message?.embeds ?? [] }));
            setDraft({ ...loaded, username: "", avatarUrl: "", embeds: loaded.embeds.length ? loaded.embeds : [emptyEmbed()] });
            setOpen(new Set([0]));
            setEditing({ messageId: link.messageId });
            setPanel("none");
        } catch (err) {
            setError(errorText(err, t("error.loadMessage")));
        } finally {
            setBusy(undefined);
        }
    }

    function importJson() {
        try {
            const next = draftFromJson(importText);
            setDraft({ ...next, embeds: next.embeds.length ? next.embeds : [emptyEmbed()] });
            setOpen(new Set([0]));
            setPanel("none");
            setImportText("");
        } catch (err: any) {
            setError(t(err?.message === "not-json" ? "error.notJson" : "error.notMessage"));
        }
    }

    function saveDraft() {
        const next = [{ name: draftName(draft), savedAt: Date.now(), draft }, ...drafts].slice(0, MAX_DRAFTS);
        setDrafts(next);
        storeDrafts(next);
        context?.toast(t("toast.draftSaved"), { type: "success" });
    }

    function deleteDraft(i: number) {
        const next = drafts.filter((_, j) => j !== i);
        setDrafts(next);
        storeDrafts(next);
    }

    const sendLabel = busy === "send" ? t("action.sending") : editing ? t("action.saveEdit") : t("action.send");

    return (
        <div className="evi-eb-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
            <div className="evi-eb-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-eb-title">
                <header className="evi-eb-head">
                    <div>
                        <h2 id="evi-eb-title">{t("dialog.title")}</h2>
                        <p>{editing ? t("dialog.editing") : t("dialog.subtitle", { channel: channel.name ?? "" })}</p>
                    </div>
                    <button type="button" className="evi-eb-close" aria-label={t("action.close")} onClick={onClose} disabled={!!busy}><Icon d={ICON.close} size={20} /></button>
                </header>

                <div className="evi-eb-columns">
                    <div className="evi-eb-editor">
                        <div className="evi-eb-section">
                            <div className="evi-eb-input">
                                <label htmlFor="evi-eb-webhook"><span>{t("webhook.label")}</span></label>
                                <div className="evi-eb-color">
                                    {webhooks === undefined && !loadError && <span className="evi-eb-muted">{t("webhook.loading")}</span>}
                                    {loadError && <span className="evi-eb-muted" data-error="">{loadError}</span>}
                                    {webhooks && webhooks.length > 0 && (
                                        <select id="evi-eb-webhook" value={hookId} onChange={e => setHookId(e.currentTarget.value)}>
                                            {webhooks.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    )}
                                    {webhooks && webhooks.length === 0 && <span className="evi-eb-muted">{t("webhook.none")}</span>}
                                    <button type="button" className="evi-eb-button" data-variant="secondary" disabled={!!busy} onClick={() => void newWebhook()}>
                                        {busy === "create" ? t("webhook.creating") : t("webhook.create")}
                                    </button>
                                </div>
                            </div>
                            {!editing && (
                                <div className="evi-eb-pair">
                                    <TextInput label={t("message.username")} value={draft.username} placeholder={webhook?.name ?? WEBHOOK_NAME} limit={LIMITS.username} onChange={username => setDraft({ ...draft, username })} />
                                    <TextInput label={t("message.avatar")} value={draft.avatarUrl} placeholder="https://" invalid={bad.has("avatarUrl")} onChange={avatarUrl => setDraft({ ...draft, avatarUrl })} />
                                </div>
                            )}
                            <TextInput label={t("message.content")} value={draft.content} limit={LIMITS.content} multiline rows={3} onChange={content => setDraft({ ...draft, content })} />
                        </div>

                        {draft.embeds.map((e, i) => (
                            <EmbedEditor
                                key={i}
                                embed={e}
                                index={i}
                                count={draft.embeds.length}
                                open={open.has(i)}
                                bad={bad}
                                onToggle={() => toggle(i)}
                                onChange={next => setEmbed(i, next)}
                                onMove={by => moveEmbed(i, by)}
                                onDuplicate={() => {
                                    const embeds = [...draft.embeds];
                                    embeds.splice(i + 1, 0, JSON.parse(JSON.stringify(e)));
                                    setDraft({ ...draft, embeds });
                                    setOpen(new Set([i + 1]));
                                }}
                                onRemove={() => {
                                    setDraft({ ...draft, embeds: draft.embeds.filter((_, j) => j !== i) });
                                    setOpen(new Set());
                                }}
                            />
                        ))}
                        <button
                            type="button"
                            className="evi-eb-add"
                            disabled={draft.embeds.length >= LIMITS.embeds}
                            onClick={() => {
                                setDraft({ ...draft, embeds: [...draft.embeds, emptyEmbed()] });
                                setOpen(new Set([draft.embeds.length]));
                            }}
                        >
                            {t("action.addEmbed", { count: draft.embeds.length, limit: LIMITS.embeds })}
                        </button>
                        <p className="evi-eb-muted evi-eb-total" data-error={total > LIMITS.total ? "" : undefined}>{t("message.total", { length: total, limit: LIMITS.total })}</p>
                    </div>

                    <div className="evi-eb-preview" aria-label={t("preview.label")}>
                        <h3>{t("preview.label")}</h3>
                        <MessagePreview draft={draft} webhook={webhook} channelId={channel.id} />
                    </div>
                </div>

                {panel !== "none" && (
                    <div className="evi-eb-panel">
                        {panel === "import" && (
                            <>
                                <TextInput label={t("import.label")} value={importText} multiline rows={6} placeholder={'{ "content": "", "embeds": [ … ] }'} onChange={setImportText} />
                                <div className="evi-eb-panel-actions">
                                    <button type="button" className="evi-eb-button" data-variant="secondary" onClick={() => setPanel("none")}>{t("action.cancel")}</button>
                                    <button type="button" className="evi-eb-button" disabled={!importText.trim()} onClick={importJson}>{t("import.load")}</button>
                                </div>
                            </>
                        )}
                        {panel === "edit" && (
                            <>
                                <TextInput label={t("edit.label")} value={editLink} placeholder="https://discord.com/channels/…" onChange={setEditLink} />
                                <p className="evi-eb-muted">{t("edit.hint")}</p>
                                <div className="evi-eb-panel-actions">
                                    <button type="button" className="evi-eb-button" data-variant="secondary" onClick={() => setPanel("none")}>{t("action.cancel")}</button>
                                    <button type="button" className="evi-eb-button" disabled={!editLink.trim() || !!busy} onClick={() => void loadMessage()}>{busy === "load" ? t("edit.loading") : t("edit.load")}</button>
                                </div>
                            </>
                        )}
                        {panel === "drafts" && (
                            <>
                                <div className="evi-eb-row-head">
                                    <span>{t("drafts.title")}</span>
                                    <button type="button" className="evi-eb-button" data-variant="secondary" onClick={saveDraft}>{t("drafts.save")}</button>
                                </div>
                                {drafts.length === 0 && <p className="evi-eb-muted">{t("drafts.none")}</p>}
                                <ul className="evi-eb-drafts">
                                    {drafts.map((d, i) => (
                                        <li key={`${d.savedAt}-${i}`}>
                                            <button type="button" className="evi-eb-draft" onClick={() => {
                                                setDraft({ ...d.draft, embeds: d.draft.embeds.length ? d.draft.embeds : [emptyEmbed()] });
                                                setOpen(new Set([0]));
                                                setPanel("none");
                                            }}>
                                                <span>{d.name}</span>
                                                <span className="evi-eb-muted">{new Date(d.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                                            </button>
                                            <IconButton label={t("drafts.delete")} icon="trash" danger onClick={() => deleteDraft(i)} />
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}

                {showProblems && found.length > 0 && (
                    <ul className="evi-eb-problems" role="alert">
                        {found.slice(0, 6).map((p, i) => <li key={i}>{problemText(p)}</li>)}
                        {found.length > 6 && <li>{t("problem.more", { count: found.length - 6 })}</li>}
                    </ul>
                )}
                {error && <p className="evi-eb-error" role="alert">{error}</p>}

                <footer className="evi-eb-foot">
                    <div className="evi-eb-foot-left">
                        <button type="button" className="evi-eb-link" onClick={() => setPanel(panel === "drafts" ? "none" : "drafts")}>{t("drafts.button")}</button>
                        <button type="button" className="evi-eb-link" onClick={() => setPanel(panel === "import" ? "none" : "import")}>{t("import.button")}</button>
                        <button type="button" className="evi-eb-link" onClick={() => void copy(draftToJson(draft), t("toast.jsonCopied"))}>{t("action.copyJson")}</button>
                        {editing
                            ? <button type="button" className="evi-eb-link" onClick={() => setEditing(undefined)}>{t("edit.stop")}</button>
                            : <button type="button" className="evi-eb-link" onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>{t("edit.button")}</button>}
                        <button type="button" className="evi-eb-link" onClick={() => {
                            setDraft(emptyDraft());
                            setEditing(undefined);
                            setOpen(new Set([0]));
                        }}>{t("action.clearAll")}</button>
                    </div>
                    <button type="button" className="evi-eb-button" data-variant="secondary" onClick={onClose} disabled={!!busy}>{t("action.cancel")}</button>
                    <button type="button" className="evi-eb-button" disabled={!!busy || !webhook} onClick={() => void send()}>{sendLabel}</button>
                </footer>
            </div>
        </div>
    );
}

// ---- Opening it ---------------------------------------------------------------------------------

let closeOpen: CloseLayer | undefined;

function openBuilder(channel: any) {
    closeOpen?.({ instant: true });
    const close = openLayer(close => <Builder channel={channel} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

const css = `
.evi-eb-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.7); }
.evi-eb-modal { display: flex; flex-direction: column; width: min(1120px, 100%); max-height: calc(100vh - 48px); border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  border: 1px solid var(--border-subtle, transparent); box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-eb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 16px 12px 20px; }
.evi-eb-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-eb-head p { margin: 2px 0 0; font-size: 14px; color: var(--text-muted, #949ba4); }
.evi-eb-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-eb-close:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-eb-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 0; flex: 1; border-block: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-eb-editor, .evi-eb-preview { min-height: 0; overflow-y: auto; scrollbar-width: none; overscroll-behavior: contain; padding: 16px 20px 20px; }
.evi-eb-editor::-webkit-scrollbar, .evi-eb-preview::-webkit-scrollbar { display: none; }
.evi-eb-preview { background: var(--background-base-lower, var(--background-primary, #313338)); border-inline-start: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-eb-preview h3, .evi-eb-card-body h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-eb-card-body h4 { margin: 16px 0 8px; }
.evi-eb-card-body h4:first-child { margin-top: 4px; }
.evi-eb-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.evi-eb-input { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; min-width: 0; }
.evi-eb-input label { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 600; color: var(--text-muted, #949ba4); }
.evi-eb-input input[type="text"], .evi-eb-input input[type="datetime-local"], .evi-eb-input textarea, .evi-eb-input select {
  width: 100%; box-sizing: border-box; min-height: 36px; padding: 8px 10px; border-radius: 8px; font: inherit; font-size: 14px; color: inherit;
  border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08))); background: var(--input-background, var(--background-tertiary, #1e1f22)); }
.evi-eb-input textarea { resize: vertical; line-height: 1.375; scrollbar-width: none; }
.evi-eb-input :is(input, textarea, select):focus { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-eb-input [aria-invalid="true"] { border-color: var(--status-danger, #f23f43); }
.evi-eb-input input[type="color"] { flex: none; width: 36px; height: 36px; padding: 2px; border: 1px solid var(--border-subtle, rgba(255,255,255,.08)); border-radius: 8px; background: none; cursor: pointer; }
.evi-eb-color { display: flex; align-items: center; gap: 8px; min-width: 0; }
.evi-eb-color > input[type="text"], .evi-eb-color > select { flex: 1; }
.evi-eb-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.evi-eb-counter { font-weight: 500; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-eb-counter[data-over] { color: var(--text-feedback-critical, #f23f43); }
.evi-eb-counter-quiet { font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-eb-card { margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,.06)); background: var(--background-base-lower, rgba(0,0,0,.12)); }
.evi-eb-card-head { display: flex; align-items: center; gap: 2px; padding: 4px 6px 4px 4px; }
.evi-eb-card-toggle { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; min-height: 36px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; cursor: pointer; text-align: start; }
.evi-eb-card-toggle:hover { background: var(--background-modifier-hover, rgba(255,255,255,.04)); }
.evi-eb-chevron { display: grid; color: var(--interactive-normal, #b5bac1); transition: rotate .2s ease-out; }
.evi-eb-card[data-open] .evi-eb-chevron { rotate: 90deg; }
.evi-eb-swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--background-modifier-accent, #4e5058); }
.evi-eb-card-title { font-size: 14px; font-weight: 600; color: var(--text-strong, #f2f3f5); }
.evi-eb-card-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text-muted, #949ba4); }
.evi-eb-card-body { padding: 4px 12px 12px; }
.evi-eb-field { padding: 8px 10px 2px; margin-bottom: 8px; border-radius: 8px; background: var(--background-modifier-hover, rgba(255,255,255,.03)); }
.evi-eb-row-head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.evi-eb-row-head > span:first-child { flex: 1; }
.evi-eb-check { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: 6px; font-size: 13px; font-weight: 500; color: var(--text-muted, #949ba4); cursor: pointer; }
.evi-eb-icon { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-eb-icon:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-eb-icon[data-danger]:hover:not(:disabled) { color: var(--text-feedback-critical, #f23f43); }
.evi-eb-icon:disabled { opacity: .35; cursor: default; }
.evi-eb-add { width: 100%; min-height: 36px; margin: 4px 0 8px; border: 1px dashed var(--border-strong, rgba(255,255,255,.16)); border-radius: 8px; background: none;
  color: var(--text-default, #dbdee1); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color .15s ease-out; }
.evi-eb-add:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.04)); }
.evi-eb-add:disabled { opacity: .5; cursor: default; }
.evi-eb-muted { font-size: 13px; color: var(--text-muted, #949ba4); }
.evi-eb-muted[data-error] { color: var(--text-feedback-critical, #f23f43); }
.evi-eb-total { margin: 4px 0 0; text-align: end; font-variant-numeric: tabular-nums; }
.evi-eb-panel { padding: 12px 20px; border-block-end: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-eb-panel-actions { display: flex; justify-content: flex-end; gap: 8px; }
.evi-eb-drafts { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; scrollbar-width: none; }
.evi-eb-drafts li { display: flex; align-items: center; gap: 4px; }
.evi-eb-draft { display: flex; justify-content: space-between; gap: 12px; flex: 1; min-width: 0; padding: 8px 10px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; font-size: 14px; text-align: start; cursor: pointer; }
.evi-eb-draft:hover { background: var(--background-modifier-hover, rgba(255,255,255,.04)); }
.evi-eb-draft > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-eb-problems { margin: 0; padding: 10px 20px 10px 36px; font-size: 13px; color: var(--text-feedback-critical, #f23f43); background: color-mix(in srgb, var(--status-danger, #f23f43) 10%, transparent); }
.evi-eb-error { margin: 0; padding: 10px 20px; font-size: 14px; color: var(--text-feedback-critical, #f23f43); background: color-mix(in srgb, var(--status-danger, #f23f43) 10%, transparent); }
.evi-eb-foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px 12px 12px; }
.evi-eb-foot-left { display: flex; flex-wrap: wrap; gap: 2px; flex: 1; }
.evi-eb-link { min-height: 32px; padding: 0 8px; border: 0; border-radius: 6px; background: none; font: inherit; font-size: 14px; font-weight: 500; color: var(--text-link, #00a8fc); cursor: pointer; }
.evi-eb-link:hover { background: var(--background-modifier-hover, rgba(255,255,255,.04)); }
.evi-eb-button { min-width: 88px; height: 36px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; flex: none;
  background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); transition: background-color .15s ease-out; }
.evi-eb-button:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-eb-button[data-variant="secondary"] { background: var(--button-secondary-background, rgba(255,255,255,.08)); color: var(--text-default, #dbdee1); }
.evi-eb-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--button-secondary-background-hover, rgba(255,255,255,.12)); }
.evi-eb-button:disabled { opacity: .5; cursor: not-allowed; }
:is(.evi-eb-button, .evi-eb-link, .evi-eb-icon, .evi-eb-close, .evi-eb-card-toggle, .evi-eb-add, .evi-eb-draft):focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 2px; }

/* The preview, after Discord's own message and embed */
.evi-eb-message { display: flex; gap: 16px; padding: 4px 0; }
.evi-eb-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; }
.evi-eb-message-body { min-width: 0; flex: 1; }
.evi-eb-message-head { display: flex; align-items: center; gap: 4px; line-height: 22px; }
.evi-eb-username { font-size: 16px; font-weight: 500; color: var(--header-primary, var(--text-strong, #f2f3f5)); }
.evi-eb-tag { padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 600; line-height: 15px; color: var(--white, #fff); background: var(--brand-500, #5865f2); }
.evi-eb-time { margin-inline-start: 4px; font-size: 12px; color: var(--text-muted, #949ba4); }
.evi-eb-content { font-size: 16px; line-height: 1.375; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-default, #dbdee1); }
.evi-eb-embed { box-sizing: border-box; max-width: 516px; margin-top: 4px; border-radius: 4px; border-inline-start: 4px solid var(--background-modifier-accent, #1e1f22);
  background: var(--background-mod-subtle, var(--background-secondary, #2b2d31)); }
.evi-eb-embed-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: 8px 16px 16px 12px; }
.evi-eb-embed-grid > * { grid-column: 1; min-width: 0; margin-top: 8px; }
.evi-eb-embed-author { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--header-primary, #f2f3f5); }
.evi-eb-embed-author img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
.evi-eb-embed-author a, .evi-eb-embed-title a { color: inherit; }
.evi-eb-embed-title { font-size: 16px; font-weight: 600; color: var(--header-primary, #f2f3f5); }
.evi-eb-embed-title a { color: var(--text-link, #00a8fc); }
.evi-eb-embed-description, .evi-eb-embed-field-value { font-size: 14px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-default, #dbdee1); }
.evi-eb-embed-fields { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px; }
.evi-eb-embed-field { min-width: 0; }
.evi-eb-embed-field-name { margin-bottom: 2px; font-size: 14px; font-weight: 600; color: var(--header-primary, #f2f3f5); }
.evi-eb-embed-image { grid-column: 1 / -1 !important; max-width: 100%; max-height: 300px; border-radius: 4px; object-fit: contain; justify-self: start; }
.evi-eb-embed-thumb { grid-column: 2 !important; grid-row: 1 / 8; width: 80px; height: 80px; margin-inline-start: 16px; border-radius: 4px; object-fit: contain; justify-self: end; }
.evi-eb-embed-footer { display: flex; align-items: center; gap: 8px; grid-column: 1 / -1 !important; font-size: 12px; font-weight: 500; color: var(--text-muted, #949ba4); }
.evi-eb-embed-footer img { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
.evi-eb-dot { margin: 0 4px; }

@media (max-width: 760px) {
  .evi-eb-columns { grid-template-columns: 1fr; }
  .evi-eb-preview { border-inline-start: 0; border-block-start: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
  .evi-eb-pair { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .evi-eb-chevron, .evi-eb-button, .evi-eb-add { transition: none; } }
`;

export default definePlugin({
    start(ctx) {
        context = ctx;
        ctx.addStyle(css);
        ctx.onDispose(() => {
            closeOpen?.({ instant: true });
            context = undefined;
        });

        ctx.contextMenu(["channel-context", "thread-context"], (children, props) => {
            const channel = props?.channel;
            if (!canUse(channel)) return;
            children.push(
                <Menu.Group key="evi-embed-builder">
                    <Menu.Item id="evi-embed-builder" label={t("menu.open")} action={() => openBuilder(channel)} />
                </Menu.Group>,
            );
        });

        ctx.command({
            name: "embed",
            get description() { return t("command.description"); },
            predicate: ({ channel }) => canUse(channel),
            execute: (_args, { channel }) => void openBuilder(channel),
        });
    },
});
