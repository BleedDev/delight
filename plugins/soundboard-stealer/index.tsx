/**
 * Soundboard sounds to keep: right-click one in the soundboard (or a message that shares one) to
 * download it under its own name, copy its link, or add it to one of your servers after a listen.
 *
 * Menus, checked 2026-10-02 in Discord's web build:
 * - a sound button opens <Menu navId="sound-button-context"> with { soundGuild, sound,
 *   activeCallGuildId }; sound is SoundboardStore's { soundId, guildId, name, volume, emojiId,
 *   emojiName }. Discord only opens it for a sound from one of your servers, or for Nitro users.
 *   It has its own "download-soundboard-sound" item (named by the sound's id), so ours only shows
 *   where Discord's doesn't: its built-in sounds.
 * - a message sharing sounds has <sound:guildId:soundId> in its text.
 *
 * Adding uses Discord's own creator, ({ guildId, name, sound, volume, emojiId, emojiName }) =>
 * POST /guilds/:id/soundboard-sounds with the sound as a data URI, found by that route. It falls back
 * to Discord's HTTP client if the creator moves. Its errors are Discord's HTTP errors, whose body
 * holds the reason shown in the dialog and the toast.
 */
import { definePlugin, findByCode, find, findMenuGroup, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import {
    audioKind, AudioKind, canAddSounds, describeError, emojiFor, fileName, isValidSoundName, sanitizeSoundName, Sound,
    SOUND_MAX_BYTES, SOUND_MAX_SECONDS, SOUND_NAME_MAX, soundsFromMenuProps, soundSlots, soundUrl,
} from "./sound";
import { t } from "./strings";

let context: PluginContext | undefined;

// ---- Discord ------------------------------------------------------------------------------------

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

/** Servers you can add sounds to, by name */
function eligibleGuilds(): any[] {
    const me = ownId();
    if (!me) return [];
    const gs = store("GuildStore");
    const members = store("GuildMemberStore");
    const list: any[] = gs?.getGuildsArray?.() ?? Object.values(gs?.getGuilds?.() ?? {});
    return list
        .filter(g => {
            if (!g?.id) return false;
            const member = members?.getMember?.(g.id, me);
            if (!member && g.ownerId !== me) return false;
            return canAddSounds({ guildId: g.id, ownerId: g.ownerId, userId: me, memberRoleIds: member?.roles ?? [], roles: guildRoles(g.id) });
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

const guildSounds = (guildId: string): any[] | undefined => store("SoundboardStore")?.getSoundsForGuild?.(guildId);
const knownSound = (soundId: string): any => store("SoundboardStore")?.getSoundById?.(soundId);
const emojiGuildId = (emojiId: string | null | undefined): string | undefined => emojiId ? store("EmojiStore")?.getCustomEmojiById?.(emojiId)?.guildId : undefined;

function slotsLeft(guild: any) {
    const s = soundSlots(guild, guildSounds(guild.id));
    return { ...s, summary: t("dialog.slots", { left: s.left, limit: s.limit }) };
}

type HttpClient = { post(opts: any): Promise<any>; };
/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR, and "succeeds" without reaching the API, so it's skipped.
 */
const http = (): HttpClient | undefined => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

interface Fetched { bytes: Uint8Array; kind: AudioKind; }

/** The sound file, checked to be MP3 or Ogg and within Discord's size */
async function fetchSound(soundId: string): Promise<Fetched> {
    const res = await fetch(soundUrl(soundId));
    if (!res.ok) throw new Error(t("error.download", { status: res.status }));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const kind = audioKind(bytes, res.headers.get("content-type"));
    if (!kind) throw new Error(t("error.notAudio"));
    return { bytes, kind };
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

/** How long the sound plays, or undefined when it can't be decoded here */
async function measure(bytes: Uint8Array): Promise<number | undefined> {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const audio = new Ctx();
    try {
        const buffer = await audio.decodeAudioData(bytes.slice().buffer);
        return buffer.duration;
    } catch {
        return;
    } finally {
        void audio.close?.();
    }
}

async function upload(sound: Sound, file: Fetched, guildId: string, name: string) {
    if (file.bytes.length > SOUND_MAX_BYTES) throw new Error(t("error.tooBig", { size: Math.ceil(file.bytes.length / 1024), limit: SOUND_MAX_BYTES / 1024 }));
    const data = `data:${file.kind.mime};base64,${toBase64(file.bytes)}`;
    const { emojiId, emojiName } = emojiFor(sound, guildId, emojiGuildId(sound.emojiId));
    const body = { guildId, name, sound: data, volume: sound.volume, emojiId, emojiName };

    const action = findByCode(".GUILD_SOUNDBOARD_SOUNDS(", "emoji_name:");
    if (typeof action === "function") return action(body);
    const client = http();
    if (!client) throw new Error(t("error.noUpload"));
    return (await client.post({
        url: `/guilds/${guildId}/soundboard-sounds`,
        body: { name, sound: data, volume: sound.volume, emoji_id: emojiId, emoji_name: emojiName },
        rejectWithError: true,
    }))?.body;
}

/** Saves with the desktop app's save dialog, or else a browser download */
async function save(bytes: Uint8Array, name: string, mime: string) {
    const fileManager = (window as any).DiscordNative?.fileManager;
    if (typeof fileManager?.saveWithDialog === "function") {
        await fileManager.saveWithDialog(bytes, name);
        return;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function download(sound: Sound) {
    try {
        const file = await fetchSound(sound.soundId);
        await save(file.bytes, fileName(sound.name, t("file.fallback"), file.kind.ext), file.kind.mime);
    } catch (err) {
        context?.logger.error("Downloading the sound failed", err);
        context?.toast(t("toast.downloadFailed", { message: describeError(err, t("error.failed")) }), { type: "failure" });
    }
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

// ---- The dialog ---------------------------------------------------------------------------------

let closeOpen: CloseLayer | undefined;

function openDialog(sound: Sound, guildId?: string) {
    closeOpen?.();
    const close = openLayer(close => <Dialog sound={sound} initialGuildId={guildId} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

function Dialog({ sound, initialGuildId, onClose }: { sound: Sound; initialGuildId?: string; onClose(): void; }) {
    const guilds = React.useMemo(() => eligibleGuilds().filter(g => g.id !== sound.guildId).map(g => ({ guild: g, slots: slotsLeft(g) })), [sound]);
    const firstOpen = guilds.find(g => g.slots.left > 0)?.guild.id;
    const [guildId, setGuildId] = React.useState(guilds.some(g => g.guild.id === initialGuildId) ? initialGuildId! : firstOpen ?? guilds[0]?.guild.id ?? "");
    const [name, setName] = React.useState(sanitizeSoundName(sound.name ?? t("file.fallback")));
    const [file, setFile] = React.useState<Fetched>();
    const [seconds, setSeconds] = React.useState<number>();
    const [loadError, setLoadError] = React.useState<string>();
    const [playing, setPlaying] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const ref = React.useRef<HTMLDivElement>(null);
    const player = React.useRef<HTMLAudioElement | null>(null);

    // The file, once: the preview plays it and the upload sends it
    React.useEffect(() => {
        let live = true;
        fetchSound(sound.soundId).then(async f => {
            if (!live) return;
            setFile(f);
            const d = await measure(f.bytes);
            if (live) setSeconds(d);
        }, err => live && setLoadError(describeError(err, t("error.failed"))));
        return () => {
            live = false;
            player.current?.pause();
            player.current = null;
        };
    }, [sound.soundId]);

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

    function togglePreview() {
        if (playing) {
            player.current?.pause();
            setPlaying(false);
            return;
        }
        const audio = player.current ?? new Audio(soundUrl(sound.soundId));
        player.current = audio;
        audio.volume = sound.volume;
        audio.currentTime = 0;
        audio.onended = () => setPlaying(false);
        audio.onerror = () => setPlaying(false);
        void audio.play().then(() => setPlaying(true), () => setPlaying(false));
    }

    const selected = guilds.find(g => g.guild.id === guildId);
    const nameOk = isValidSoundName(name);
    const tooLong = seconds !== undefined && seconds > SOUND_MAX_SECONDS + 0.05;
    const tooBig = !!file && file.bytes.length > SOUND_MAX_BYTES;
    const canSubmit = !busy && !!file && !!selected && selected.slots.left > 0 && nameOk && !tooLong && !tooBig;
    const dropsEmoji = !!selected && !!sound.emojiId && emojiFor(sound, selected.guild.id, emojiGuildId(sound.emojiId)).emojiId === null;

    async function submit(e?: { preventDefault(): void; }) {
        e?.preventDefault();
        if (!canSubmit || !selected || !file) return;
        setBusy(true);
        setError(undefined);
        const finalName = name.trim();
        try {
            await upload(sound, file, selected.guild.id, finalName);
            context?.toast(t("toast.added", { name: finalName, server: selected.guild.name }), { type: "success" });
            onClose();
        } catch (err) {
            context?.logger.error("Adding the sound failed", err);
            const message = describeError(err, t("error.failed"));
            setError(message);
            context?.toast(t("toast.failed", { message }), { type: "failure" });
            setBusy(false);
        }
    }

    return (
        <div className="evi-ss-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
            <div className="evi-ss-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-ss-title" ref={ref}>
                <header className="evi-ss-head">
                    <h2 id="evi-ss-title">{t("dialog.title")}</h2>
                    <button type="button" className="evi-ss-close" aria-label={t("dialog.close")} onClick={onClose} disabled={busy}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                </header>
                <form className="evi-ss-body" onSubmit={submit}>
                    <div className="evi-ss-preview">
                        <button type="button" className="evi-ss-play" onClick={togglePreview} aria-label={playing ? t("dialog.stop") : t("dialog.preview")} disabled={!!loadError}>
                            {playing
                                ? <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
                                : <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor" /></svg>}
                        </button>
                        <div className="evi-ss-meta">
                            <span className="evi-ss-name">{sound.emojiName && !sound.emojiId ? `${sound.emojiName} ` : ""}{sound.name ?? t("file.fallback")}</span>
                            <span className="evi-ss-hint" data-error={tooLong || tooBig || !!loadError || undefined}>
                                {loadError
                                    ? loadError
                                    : !file ? t("dialog.loading")
                                        : tooBig ? t("error.tooBig", { size: Math.ceil(file.bytes.length / 1024), limit: SOUND_MAX_BYTES / 1024 })
                                            : tooLong ? t("dialog.tooLong", { seconds: seconds!.toFixed(1), limit: SOUND_MAX_SECONDS })
                                                : t("dialog.details", { seconds: seconds !== undefined ? seconds.toFixed(1) : "?", size: Math.ceil(file.bytes.length / 1024), type: file.kind.ext.toUpperCase() })}
                            </span>
                        </div>
                    </div>

                    <label className="evi-ss-label" htmlFor="evi-ss-name">{t("dialog.name")}</label>
                    <input
                        id="evi-ss-name"
                        className="evi-ss-input"
                        value={name}
                        maxLength={SOUND_NAME_MAX}
                        spellCheck={false}
                        autoComplete="off"
                        disabled={busy}
                        aria-invalid={!nameOk}
                        aria-describedby="evi-ss-name-hint"
                        onChange={e => setName(e.currentTarget.value.slice(0, SOUND_NAME_MAX))}
                    />
                    <p id="evi-ss-name-hint" className="evi-ss-hint" data-error={!nameOk || undefined}>{t("dialog.nameHint")}</p>

                    <label className="evi-ss-label" htmlFor="evi-ss-guild">{t("dialog.server")}</label>
                    {guilds.length ? (
                        <select id="evi-ss-guild" className="evi-ss-input" value={guildId} disabled={busy} onChange={e => setGuildId(e.currentTarget.value)}>
                            {guilds.map(({ guild, slots }) => (
                                <option key={guild.id} value={guild.id} disabled={slots.left <= 0}>
                                    {guild.name} ({slots.left <= 0 ? t("dialog.full") : slots.summary})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <p className="evi-ss-hint" data-error>{t("dialog.noPermission")}</p>
                    )}
                    {selected && <p className="evi-ss-hint">{selected.slots.summary}</p>}
                    {dropsEmoji && <p className="evi-ss-hint">{t("dialog.emojiDropped")}</p>}

                    {error && <p className="evi-ss-error" role="alert">{error}</p>}

                    <footer className="evi-ss-foot">
                        <button type="button" className="evi-ss-button" data-variant="secondary" onClick={onClose} disabled={busy}>{t("dialog.cancel")}</button>
                        <button type="submit" className="evi-ss-button" disabled={!canSubmit}>{busy ? t("dialog.uploading") : t("dialog.submit")}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
}

const css = `
.evi-ss-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-ss-modal { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; scrollbar-width: none; border-radius: 12px;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  border: 1px solid var(--border-subtle, transparent); box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-ss-modal::-webkit-scrollbar { display: none; }
.evi-ss-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 16px 0 20px; }
.evi-ss-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-ss-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-ss-close:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-ss-body { display: flex; flex-direction: column; padding: 12px 20px 20px; }
.evi-ss-preview { display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 4px; border-radius: 12px; background: var(--background-secondary, rgba(0,0,0,.2)); }
.evi-ss-play { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; cursor: pointer;
  background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); transition: background-color .15s ease-out, transform .15s ease-out; }
.evi-ss-play:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-ss-play:active:not(:disabled) { transform: scale(.96); }
.evi-ss-play:disabled { opacity: .5; cursor: not-allowed; }
.evi-ss-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.evi-ss-name { font-size: 16px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-ss-label { margin: 12px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-ss-input { width: 100%; box-sizing: border-box; height: 40px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 15px;
  border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08))); background: var(--input-background, var(--background-tertiary, #1e1f22)); color: inherit; }
.evi-ss-input:focus { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-ss-input[aria-invalid="true"] { border-color: var(--status-danger, #f23f43); }
.evi-ss-hint { margin: 6px 0 0; font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); }
.evi-ss-meta .evi-ss-hint { margin: 0; }
.evi-ss-hint[data-error] { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
.evi-ss-error { margin: 12px 0 0; padding: 8px 12px; border-radius: 8px; font-size: 14px; color: var(--text-feedback-critical, #f23f43);
  background: color-mix(in srgb, var(--status-danger, #f23f43) 12%, transparent); }
.evi-ss-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.evi-ss-button { min-width: 96px; height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); transition: background-color .15s ease-out; }
.evi-ss-button:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-ss-button[data-variant="secondary"] { background: var(--button-secondary-background, rgba(255,255,255,.08)); color: var(--text-default, #dbdee1); }
.evi-ss-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--button-secondary-background-hover, rgba(255,255,255,.12)); }
.evi-ss-button:disabled { opacity: .5; cursor: not-allowed; }
.evi-ss-button:focus-visible, .evi-ss-close:focus-visible, .evi-ss-play:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .evi-ss-button, .evi-ss-play { transition: none; } }
`;

// ---- Menus --------------------------------------------------------------------------------------

function itemsFor(sound: Sound, children: ReactNode[], key: string): ReactNode[] {
    const items: ReactNode[] = [];
    const guilds = eligibleGuilds().filter(g => g.id !== sound.guildId);
    items.push(guilds.length ? (
        <Menu.Item key={`${key}-add`} id={`${key}-add`} label={t("menu.add")}>
            {guilds.map(g => {
                const slots = slotsLeft(g);
                return (
                    <Menu.Item
                        key={g.id}
                        id={`${key}-add-${g.id}`}
                        label={g.name}
                        subtext={slots.left > 0 ? t("menu.slots", { count: slots.left }) : t("menu.noSlots")}
                        disabled={slots.left <= 0}
                        action={() => openDialog(sound, g.id)}
                    />
                );
            })}
        </Menu.Item>
    ) : (
        <Menu.Item key={`${key}-add`} id={`${key}-add`} label={t("menu.add")} subtext={t("menu.noServers")} disabled />
    ));
    // Discord's menu already downloads its servers' sounds; its built-in ones it doesn't
    if (!findMenuGroup(children, "download-soundboard-sound")) {
        items.push(<Menu.Item key={`${key}-download`} id={`${key}-download`} label={t("menu.download")} action={() => void download(sound)} />);
    }
    items.push(<Menu.Item key={`${key}-link`} id={`${key}-link`} label={t("menu.copyLink")} action={() => copy(soundUrl(sound.soundId), t("toast.linkCopied"))} />);
    return items;
}

export default definePlugin({
    start(ctx) {
        context = ctx as PluginContext;
        ctx.addStyle(css);
        ctx.onDispose(() => {
            closeOpen?.({ instant: true });
            context = undefined;
        });

        ctx.contextMenu(["sound-button-context", "message"], (children, props) => {
            const sounds = soundsFromMenuProps(props, knownSound);
            if (!sounds.length) return;
            if (sounds.length === 1) {
                children.push(<Menu.Group key="evi-soundboard-stealer">{itemsFor(sounds[0], children, "evi-ss")}</Menu.Group>);
                return;
            }
            // Several sounds in one message: a submenu each
            children.push(
                <Menu.Group key="evi-soundboard-stealer">
                    {sounds.map((s, i) => (
                        <Menu.Item key={`evi-ss-${s.soundId}`} id={`evi-ss-${s.soundId}`} label={s.name ?? t("menu.sound", { number: i + 1 })}>
                            {itemsFor(s, children, `evi-ss-${s.soundId}`)}
                        </Menu.Item>
                    ))}
                </Menu.Group>,
            );
        });
    },

    stop() {
        closeOpen?.({ instant: true });
    },
});
