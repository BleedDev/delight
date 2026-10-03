/**
 * "Add to Server" for custom emoji and stickers: right-click one in a message, a reaction, or the
 * expression picker, pick one of your servers, check the name, upload.
 *
 * Menus: the message menu gets { favoriteableType, favoriteableId, itemSrc, message } plus, nested
 * in eviMenuArgs, the element that was right-clicked; the expression picker menu gets { target }
 * with data-type / data-id / data-name / data-animated / data-format-type. emoji.ts turns either
 * into an emoji or sticker.
 *
 * Uploading uses Discord's own action creators, found by the Flux actions they dispatch:
 * - uploadEmoji({ guildId, image, name, roles }) POSTs /guilds/:id/emojis with a data URI image
 *   ("EMOJI_UPLOAD_START")
 * - createGuildSticker({ guildId, body: FormData, platform: "web" }) POSTs /guilds/:id/stickers
 *   ("GUILD_STICKERS_CREATE_SUCCESS")
 * Both fall back to Discord's HTTP client ({ get, post, put, patch, del }) if the creator moved.
 * Their errors are Discord's HTTP errors, whose body holds the reason shown in the toast.
 */
import { definePlugin, Dropdown, find, findByCode, findMenuGroup, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import {
    canAddExpressions, canCopySticker, cleanEmojiNameInput, describeError, EMOJI_MAX_BYTES, EMOJI_NAME_MAX, emojiSlots, emojiUrl, Expression,
    expressionFromMenuProps, isValidEmojiName, isValidStickerName, ParsedEmoji, ParsedSticker, sanitizeEmojiName,
    sanitizeStickerName, STICKER_MAX_BYTES, STICKER_NAME_MAX, stickerMime, stickerSlots, stickerUrl,
} from "./emoji";
import { t } from "./strings";

let context: PluginContext | undefined;

const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

const ownId = (): string | undefined => store("UserStore")?.getCurrentUser?.()?.id;

function guildRoles(guildId: string): { id: string; permissions: unknown; }[] {
    const roleStore = store("GuildRoleStore");
    let raw: any;
    try {
        raw = roleStore?.getRolesSnapshot?.(guildId) ?? roleStore?.getRoles?.(guildId) ?? roleStore?.getSortedRoles?.(guildId);
    } catch { /* older Discord keeps roles on the guild */ }
    raw ??= store("GuildStore")?.getGuild?.(guildId)?.roles;
    return !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
}

function allGuilds(): any[] {
    const gs = store("GuildStore");
    const list: any[] = gs?.getGuildsArray?.() ?? Object.values(gs?.getGuilds?.() ?? {});
    return list.filter(g => g?.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Servers you can add expressions to */
function eligibleGuilds(): any[] {
    const me = ownId();
    if (!me) return [];
    const members = store("GuildMemberStore");
    return allGuilds().filter(g => {
        const member = members?.getMember?.(g.id, me);
        if (!member && g.ownerId !== me) return false;
        return canAddExpressions({ guildId: g.id, ownerId: g.ownerId, userId: me, memberRoleIds: member?.roles ?? [], roles: guildRoles(g.id) });
    });
}

const guildEmojis = (guildId: string): any[] => store("EmojiStore")?.getGuildEmoji?.(guildId) ?? [];
const guildStickers = (guildId: string): any[] => store("StickersStore")?.getStickersByGuildId?.(guildId) ?? [];

/** Slots left for this expression in a server */
function slotsLeft(guild: any, expression: Expression) {
    if (expression.kind === "emoji") {
        const s = emojiSlots(guild, guildEmojis(guild.id));
        const vars = { staticLeft: s.staticLeft, animatedLeft: s.animatedLeft, limit: s.limit };
        return {
            left: expression.animated ? s.animatedLeft : s.staticLeft, limit: s.limit,
            detail: t("dialog.detail.emoji", vars), summary: t("dialog.summary.emoji", vars),
        };
    }
    const s = stickerSlots(guild, guildStickers(guild.id));
    const vars = { left: s.left, limit: s.limit };
    return { left: s.left, limit: s.limit, detail: t("dialog.detail.sticker", vars), summary: t("dialog.summary.sticker", vars) };
}

/** The server the expression already lives in, if you're in it */
function sourceGuildId(expression: Expression): string | undefined {
    if (expression.kind === "emoji") return store("EmojiStore")?.getCustomEmojiById?.(expression.id)?.guildId;
    return store("StickersStore")?.getStickerById?.(expression.id)?.guild_id;
}

type HttpClient = { get(opts: any): Promise<any>; post(opts: any): Promise<any>; };
/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR: given Discord's options object it "succeeds" without ever
 * reaching the API, so it's skipped.
 */
const http = (): HttpClient | undefined => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

async function fetchBlob(url: string, maxBytes: number): Promise<Blob> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(t("error.download", { status: res.status }));
    const blob = await res.blob();
    if (blob.size > maxBytes) throw new Error(t("error.tooBig", { size: Math.ceil(blob.size / 1024), limit: maxBytes / 1024 }));
    return blob;
}

const toDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(t("error.read")));
    reader.readAsDataURL(blob);
});

async function uploadEmoji(emoji: ParsedEmoji, guildId: string, name: string) {
    // Big animated GIFs can go over 256 KB at 128px; smaller renditions usually fit
    let blob: Blob | undefined;
    let lastError: unknown;
    for (const size of emoji.animated ? [128, 96, 64] : [128]) {
        try {
            blob = await fetchBlob(emojiUrl(emoji.id, emoji.animated, size), EMOJI_MAX_BYTES);
            break;
        } catch (err) {
            lastError = err;
        }
    }
    if (!blob) throw lastError;
    const image = await toDataUri(blob);

    const action = findByCode("\"EMOJI_UPLOAD_START\"", "GUILD_EMOJIS(");
    if (typeof action === "function") return action({ guildId, image, name, roles: [] });
    const client = http();
    if (!client) throw new Error(t("error.noEmojiUpload"));
    return (await client.post({ url: `/guilds/${guildId}/emojis`, body: { image, name, roles: [] }, oldFormErrors: true, rejectWithError: true }))?.body;
}

/** The sticker's tags and description, from the store or the API */
async function stickerDetails(sticker: ParsedSticker): Promise<{ tags?: string; description?: string; format_type?: number; }> {
    const cached = store("StickersStore")?.getStickerById?.(sticker.id);
    if (cached) return cached;
    try {
        return (await http()?.get({ url: `/stickers/${sticker.id}`, rejectWithError: true }))?.body ?? {};
    } catch {
        return {};
    }
}

async function uploadSticker(sticker: ParsedSticker, guildId: string, name: string) {
    const details = await stickerDetails(sticker);
    const formatType = sticker.formatType ?? details.format_type;
    if (!canCopySticker(formatType)) throw new Error(t("error.lottie"));
    const blob = await fetchBlob(stickerUrl(sticker.id, formatType), STICKER_MAX_BYTES);
    const mime = stickerMime(formatType);
    const body = new FormData();
    body.append("name", name);
    body.append("tags", details.tags?.trim() || name);
    body.append("description", details.description ?? "");
    body.append("file", new File([blob], `${name}.${mime === "image/gif" ? "gif" : "png"}`, { type: mime }));

    const action = findByCode("\"GUILD_STICKERS_CREATE_SUCCESS\"", "GUILD_STICKER_PACKS(");
    if (typeof action === "function") return action({ guildId, body, platform: "web", originalMd5: null });
    const client = http();
    if (!client) throw new Error(t("error.noStickerUpload"));
    return (await client.post({ url: `/guilds/${guildId}/stickers`, body, rejectWithError: true }))?.body;
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

let closeOpen: CloseLayer | undefined;

function openDialog(expression: Expression, guildId?: string) {
    closeOpen?.();
    const close = openLayer(close => <Dialog expression={expression} initialGuildId={guildId} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

const optionLabel = (guild: any, slots: { left: number; detail: string; }) => `${guild.name} (${slots.left <= 0 ? t("dialog.full") : slots.detail})`;

const previewUrl = (e: Expression) => e.kind === "emoji" ? emojiUrl(e.id, e.animated, 128) : stickerUrl(e.id, e.formatType);

function Dialog({ expression, initialGuildId, onClose }: { expression: Expression; initialGuildId?: string; onClose(): void; }) {
    const isEmoji = expression.kind === "emoji";
    const noun = expression.kind;
    const guilds = React.useMemo(() => {
        const source = sourceGuildId(expression);
        return eligibleGuilds().filter(g => g.id !== source).map(g => ({ guild: g, slots: slotsLeft(g, expression) }));
    }, [expression]);
    const firstOpen = guilds.find(g => g.slots.left > 0)?.guild.id;
    const [guildId, setGuildId] = React.useState(guilds.some(g => g.guild.id === initialGuildId) ? initialGuildId! : firstOpen ?? guilds[0]?.guild.id ?? "");
    const [name, setName] = React.useState(isEmoji ? sanitizeEmojiName(expression.name) : sanitizeStickerName(expression.name));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const ref = React.useRef<HTMLDivElement>(null);

    const selected = guilds.find(g => g.guild.id === guildId);
    const nameOk = isEmoji ? isValidEmojiName(name) : isValidStickerName(name);
    const canSubmit = !busy && !!selected && selected.slots.left > 0 && nameOk;

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLInputElement>("input")?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    async function submit(e?: { preventDefault(): void; }) {
        e?.preventDefault();
        if (!canSubmit || !selected) return;
        setBusy(true);
        setError(undefined);
        const finalName = isEmoji ? name : name.trim();
        try {
            if (expression.kind === "emoji") await uploadEmoji(expression, selected.guild.id, finalName);
            else await uploadSticker(expression, selected.guild.id, finalName);
            context?.toast(t(isEmoji ? "toast.added.emoji" : "toast.added.sticker", { name: finalName, server: selected.guild.name }), { type: "success" });
            onClose();
        } catch (err) {
            context?.logger.error(`Uploading the ${noun} failed`, err);
            const message = describeError(err, t(isEmoji ? "error.failed.emoji" : "error.failed.sticker"));
            setError(message);
            context?.toast(t(isEmoji ? "toast.failed.emoji" : "toast.failed.sticker", { message }), { type: "failure" });
            setBusy(false);
        }
    }

    return (
        <div className="evi-es-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
            <div className="evi-es-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-es-title" ref={ref}>
                <header className="evi-es-head">
                    <h2 id="evi-es-title">{t(isEmoji ? "dialog.title.emoji" : "dialog.title.sticker")}</h2>
                    <button type="button" className="evi-es-close" aria-label={t("dialog.close")} onClick={onClose} disabled={busy}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                </header>
                <form className="evi-es-body" onSubmit={submit}>
                    <div className="evi-es-preview" data-kind={expression.kind}>
                        <img src={previewUrl(expression)} alt="" width={isEmoji ? 64 : 120} height={isEmoji ? 64 : 120} />
                        {isEmoji && expression.animated && <span className="evi-es-badge">{t("dialog.animated")}</span>}
                    </div>

                    <label className="evi-es-label" htmlFor="evi-es-name">{t("dialog.name")}</label>
                    <input
                        id="evi-es-name"
                        className="evi-es-input"
                        value={name}
                        maxLength={isEmoji ? EMOJI_NAME_MAX : STICKER_NAME_MAX}
                        spellCheck={false}
                        autoComplete="off"
                        disabled={busy}
                        aria-invalid={!nameOk}
                        aria-describedby="evi-es-name-hint"
                        onChange={e => setName(isEmoji ? cleanEmojiNameInput(e.currentTarget.value) : e.currentTarget.value.slice(0, STICKER_NAME_MAX))}
                    />
                    <p id="evi-es-name-hint" className="evi-es-hint" data-error={!nameOk || undefined}>
                        {t(isEmoji ? "dialog.hint.emoji" : "dialog.hint.sticker")}
                    </p>

                    <label className="evi-es-label" id="evi-es-guild-label" htmlFor="evi-es-guild">{t("dialog.server")}</label>
                    {guilds.length ? (
                        // Evi 2.0.0+ has its own dropdown; older Evi gets the system's
                        Dropdown
                            ? (
                                <Dropdown
                                    id="evi-es-guild"
                                    labelledBy="evi-es-guild-label"
                                    label={t("dialog.server")}
                                    value={guildId}
                                    disabled={busy}
                                    onChange={setGuildId}
                                    options={guilds.map(({ guild, slots }) => ({ value: guild.id, label: optionLabel(guild, slots), disabled: slots.left <= 0 }))}
                                />
                            )
                            : (
                                <select id="evi-es-guild" className="evi-es-input" value={guildId} disabled={busy} onChange={e => setGuildId(e.currentTarget.value)}>
                                    {guilds.map(({ guild, slots }) => (
                                        <option key={guild.id} value={guild.id} disabled={slots.left <= 0}>{optionLabel(guild, slots)}</option>
                                    ))}
                                </select>
                            )
                    ) : (
                        <p className="evi-es-hint" data-error>{t(isEmoji ? "dialog.noPermission.emoji" : "dialog.noPermission.sticker")}</p>
                    )}
                    {selected && <p className="evi-es-hint">{selected.slots.summary}</p>}

                    {error && <p className="evi-es-error" role="alert">{error}</p>}

                    <footer className="evi-es-foot">
                        <button type="button" className="evi-es-button" data-variant="secondary" onClick={onClose} disabled={busy}>{t("dialog.cancel")}</button>
                        <button type="submit" className="evi-es-button" disabled={!canSubmit}>{busy ? t("dialog.uploading") : t(isEmoji ? "dialog.submit.emoji" : "dialog.submit.sticker")}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
}

const css = `
.evi-es-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-es-modal { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; border-radius: 12px;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  border: 1px solid var(--border-subtle, transparent); box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-es-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 16px 0 20px; }
.evi-es-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-es-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-es-close:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-es-body { display: flex; flex-direction: column; padding: 12px 20px 20px; }
.evi-es-preview { position: relative; display: grid; place-items: center; align-self: center; min-width: 96px; min-height: 96px; padding: 12px; margin-bottom: 16px;
  border-radius: 12px; background: var(--background-secondary, rgba(0,0,0,.2)); }
.evi-es-preview img { object-fit: contain; }
.evi-es-badge { position: absolute; bottom: 6px; right: 6px; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;
  background: var(--background-modifier-accent, rgba(255,255,255,.1)); color: var(--text-muted, #949ba4); }
.evi-es-label { margin: 12px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-es-input { width: 100%; box-sizing: border-box; height: 40px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 15px;
  border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08))); background: var(--input-background, var(--background-tertiary, #1e1f22)); color: inherit; }
.evi-es-input:focus { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-es-input[aria-invalid="true"] { border-color: var(--status-danger, #f23f43); }
.evi-es-hint { margin: 6px 0 0; font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); }
.evi-es-hint[data-error] { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
.evi-es-error { margin: 12px 0 0; padding: 8px 12px; border-radius: 8px; font-size: 14px; color: var(--text-feedback-critical, #f23f43);
  background: color-mix(in srgb, var(--status-danger, #f23f43) 12%, transparent); }
.evi-es-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.evi-es-button { min-width: 96px; height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); transition: background-color .15s ease-out; }
.evi-es-button:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-es-button[data-variant="secondary"] { background: var(--button-secondary-background, rgba(255,255,255,.08)); color: var(--text-default, #dbdee1); }
.evi-es-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--button-secondary-background-hover, rgba(255,255,255,.12)); }
.evi-es-button:disabled { opacity: .5; cursor: not-allowed; }
.evi-es-button:focus-visible, .evi-es-close:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .evi-es-button { transition: none; } }
`;

function menuItems(expression: Expression, children: ReactNode[]): ReactNode[] {
    const isEmoji = expression.kind === "emoji";
    const items: ReactNode[] = [];

    if (isEmoji || canCopySticker(expression.formatType)) {
        const source = sourceGuildId(expression);
        const guilds = eligibleGuilds().filter(g => g.id !== source);
        const label = t(isEmoji ? "menu.add.emoji" : "menu.add.sticker");
        items.push(guilds.length ? (
            <Menu.Item key="evi-es-add" id="evi-es-add" label={label}>
                {guilds.map(g => {
                    const slots = slotsLeft(g, expression);
                    return (
                        <Menu.Item
                            key={g.id}
                            id={`evi-es-add-${g.id}`}
                            label={g.name}
                            subtext={slots.left > 0 ? t(!isEmoji ? "menu.slots.sticker" : expression.animated ? "menu.slots.animated" : "menu.slots.static", { count: slots.left }) : t("menu.noSlots")}
                            disabled={slots.left <= 0}
                            action={() => openDialog(expression, g.id)}
                        />
                    );
                })}
            </Menu.Item>
        ) : (
            <Menu.Item key="evi-es-add" id="evi-es-add" label={label} subtext={t("menu.noServers")} disabled />
        ));
    }

    const url = isEmoji ? emojiUrl(expression.id, expression.animated) : stickerUrl(expression.id, expression.formatType);
    // Skip what Discord's menu already offers
    if (!findMenuGroup(children, "copy-image-link")) {
        items.push(<Menu.Item key="evi-es-link" id="evi-es-copy-link" label={t(isEmoji ? "menu.copyLink.emoji" : "menu.copyLink.sticker")} action={() => copy(url, t("toast.linkCopied"))} />);
    }
    if (!findMenuGroup(children, `devmode-copy-id-${expression.id}`)) {
        items.push(<Menu.Item key="evi-es-id" id="evi-es-copy-id" label={t(isEmoji ? "menu.copyId.emoji" : "menu.copyId.sticker")} action={() => copy(expression.id, t("toast.idCopied"))} />);
    }
    return items;
}

/** Fills in a name from EmojiStore when the menu didn't carry one */
function withKnownName(expression: Expression): Expression {
    if (expression.name) return expression;
    if (expression.kind === "emoji") {
        const known = store("EmojiStore")?.getCustomEmojiById?.(expression.id);
        return known ? { ...expression, name: known.name, animated: expression.animated || !!known.animated } : expression;
    }
    const known = store("StickersStore")?.getStickerById?.(expression.id);
    return known ? { ...expression, name: known.name, formatType: expression.formatType ?? known.format_type } : expression;
}

export default definePlugin({
    start(ctx) {
        context = ctx as PluginContext;
        ctx.addStyle(css);
        ctx.onDispose(() => {
            closeOpen?.({ instant: true });
            context = undefined;
        });

        ctx.contextMenu(["message", "expression-picker"], (children, props) => {
            const found = expressionFromMenuProps(props);
            if (!found) return;
            const items = menuItems(withKnownName(found), children);
            if (items.length) children.push(<Menu.Group key="evi-emoji-stealer">{items}</Menu.Group>);
        });
    },

    stop() {
        closeOpen?.({ instant: true });
    },
});
