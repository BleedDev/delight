/**
 * View Icons: download profile pictures from Discord's image viewer, and open banners in it.
 *
 * Clicking someone's avatar in their profile already opens Discord's image viewer, with only a
 * zoom button. Source patches add:
 *  - a Download button next to zoom, for avatars, banners and server icons (any Discord CDN link
 *    icons.ts recognises), saving the original through the desktop app's save dialog;
 *  - a click on a profile banner (popout and full profile) that opens it in the same viewer, with
 *    the same darkening on hover as the avatar;
 *  - a Profile details button on the banner: the profile's theme gradient, banner colour, display
 *    name style and nameplate, each colour copyable (details.ts).
 *
 * The viewer's own button component is captured when its module loads, so Download looks and
 * behaves like zoom. If Discord renames it, a plain button with the same icon stands in.
 */
import { Components, definePlugin, exitDone, filters, find, findComponent, getStore, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext, SourcePatch } from "@evi/api";
import type { MouseEvent, ReactNode } from "react";

import { t } from "./strings";
import { copyText, gradient, hasDetails, NameStyle, profileDetails, ProfileDetails, toInt } from "./details";
import { fileName, fitSize, LinkedPicture, linkedPicture, Picture, pictureFromUrl } from "./icons";

/** How long to wait for a picture's real size before going by its usual shape */
const MEASURE_WAIT_MS = 1500;

let ctx: PluginContext | undefined;
/** The image viewer's top bar button: ({ tooltipText, icon, onClick, loading }) */
let ViewerButton: ((props: any) => ReactNode) | undefined;

const openExternal = (url: string) => void window.open(url, "_blank", "noopener,noreferrer");

const PATCHES = {
    /**
     * The image viewer's top bar: [zoom (images only), then forward, save, open and more unless
     * media options are hidden]. Profile pictures open with them hidden, so only zoom shows.
     * Download goes right after zoom.
     */
    viewer: {
        find: ".SAVE_MEDIA_PRESSED)",
        group: true,
        // The viewer is in a chunk Discord loads when it first opens: until then nothing matches, and
        // that isn't broken. If it doesn't fit once loaded, it still counts as failed.
        optional: true,
        replace: [
            {
                match: /function (\i)\((\i)\)\{let\{tooltipText:\i,\.\.\.\i\}=\2;/,
                with: "$self?.captureButton?.($1);$&",
            },
            {
                match: /"IMAGE"===(\i)\.type&&\(0,\i\.jsx\)\(\i,\{\}\),(?=!(\i)&&)/,
                with: "$&$self?.renderDownload?.($1,$2),",
            },
        ],
    },
    /**
     * A profile banner, checked 2026-10-01:
     *   function N(e){let{user:t,displayProfile:n,…}=e;…return(0,i.jsx)(T.A,{…,bannerSrc:B,…,overlay:N,onInteractionStart:…})}
     * Ours sits under the overlay, filling the banner, with the Profile details button.
     */
    banner: {
        find: /pendingAccentColor:\w+,animateOnHoverOrFocusOnly:/,
        replace: {
            match: /(?<=\{user:(\i),displayProfile:(\i),[^]{0,1500}?)bannerSrc:(\i),([^]{0,300}?)overlay:(\i),(?=onInteractionStart:)/,
            with: "bannerSrc:$3,$4overlay:$self?.renderBanner?.($1,$3,$5,$2)??$5,",
        },
    },
} satisfies Record<string, SourcePatch>;

// ---- Whose picture it is ------------------------------------------------------------------------

function ownerName(linked: LinkedPicture): string {
    const id = linked.ownerId;
    if (!id) return "discord";
    const user = getStore("UserStore")?.getUser?.(id);
    if (user) return user.username || user.globalName || id;
    return getStore("GuildStore")?.getGuild?.(id)?.name || getStore("ChannelStore")?.getChannel?.(id)?.name || id;
}

// ---- The viewer ---------------------------------------------------------------------------------

/** A picture's real width / height once it loads (which also has it ready for the viewer) */
function measure(url: string): Promise<number | null> {
    return new Promise(resolve => {
        const img = new Image();
        const timer = setTimeout(() => resolve(null), MEASURE_WAIT_MS);
        img.onload = () => {
            clearTimeout(timer);
            resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = url;
    });
}

/** Discord's openMediaViewer({ items, startingIndex, location, shouldHideMediaOptions }) */
const findViewer = (): ((options: any) => void) | undefined => find(filters.byCode("markSessionStarted", "hasMediaOptions:!"));

/** Opens a picture the way Discord opens an avatar: media options hidden, so zoom and our Download show */
async function openViewer(picture: Picture) {
    const open = findViewer();
    if (typeof open !== "function") {
        ctx?.logger.warn("Discord's image viewer wasn't found, opening in the browser");
        return openExternal(picture.url);
    }
    const { width, height } = fitSize((await measure(picture.url)) ?? picture.aspect, window.innerWidth * 0.8, window.innerHeight * 0.75);
    const item = {
        type: "IMAGE",
        url: picture.url,
        original: picture.url,
        proxyUrl: picture.url,
        width,
        height,
        alt: t(`kind.${picture.kind}`),
        animated: picture.animated,
        srcIsAnimated: picture.animated,
        contentType: picture.animated ? "image/gif" : "image/png",
    };
    try {
        open({ items: [item], startingIndex: 0, location: "View Icons", shouldHideMediaOptions: true });
    } catch (err) {
        ctx?.logger.error("Couldn't open Discord's image viewer", err);
        openExternal(picture.url);
    }
}

// ---- Download -----------------------------------------------------------------------------------

/** Saves bytes with the desktop app's save dialog, or else a browser download */
async function save(data: Uint8Array, name: string, type: string): Promise<void> {
    const fileManager = (window as any).DiscordNative?.fileManager;
    if (typeof fileManager?.saveWithDialog === "function") {
        await fileManager.saveWithDialog(data, name);
        return;
    }
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function download(picture: Picture) {
    try {
        const res = await fetch(picture.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        await save(data, fileName(picture), res.headers.get("content-type") ?? (picture.animated ? "image/gif" : "image/png"));
    } catch (err) {
        ctx?.logger.error(`Downloading the ${picture.label.toLowerCase()} failed`, err);
        ctx?.toast(t("toast.downloadFailed"), { type: "failure" });
        openExternal(picture.url);
    }
}

/** Discord's download arrow when it has one, else the same shape */
function DownloadIcon(props: { size?: string; color?: string; className?: string; }) {
    const Native = find(filters.byProps("DownloadIcon"))?.DownloadIcon;
    if (Native) return <Native {...props} />;
    return (
        <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" />
        </svg>
    );
}

function DownloadButton({ picture }: { picture: Picture; }) {
    const [saving, setSaving] = React.useState(false);
    const onClick = () => {
        if (saving) return;
        setSaving(true);
        void download(picture).finally(() => setSaving(false));
    };
    if (ViewerButton) return <ViewerButton tooltipText={t("download")} icon={DownloadIcon} loading={saving} onClick={onClick} />;

    const button = (
        <button type="button" className="evi-vi-download" aria-label={t("download")} aria-busy={saving || undefined} onClick={onClick}>
            <DownloadIcon />
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={t("download")} position="bottom">{button}</Tooltip> : button;
}

// ---- Profile details ----------------------------------------------------------------------------

let closeDetails: CloseLayer | undefined;

async function copy(color: string) {
    const text = copyText(color);
    try {
        const native = (window as any).DiscordNative?.clipboard;
        if (typeof native?.copy === "function") native.copy(text);
        else await navigator.clipboard.writeText(text);
        ctx?.toast(t("details.copied", { value: text }), { type: "success" });
    } catch (err) {
        ctx?.logger.warn("Copying failed", err);
    }
}

/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR, and never reaches the API given Discord's options: skipped.
 */
const http = (): any => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

/** Saves a change to your own profile the way Discord's profile editor does */
async function applyToProfile(url: "/users/@me/profile" | "/users/@me", body: Record<string, unknown>) {
    const client = http();
    if (!client) {
        ctx?.logger.error("Discord's HTTP client wasn't found");
        return void ctx?.toast(t("details.applyFailed"), { type: "failure" });
    }
    try {
        await client.patch({ url, body });
        ctx?.toast(t("details.applied"), { type: "success" });
    } catch (err: any) {
        ctx?.logger.warn("Applying to your profile failed", err);
        // Profile themes and name styles are Nitro's
        const nitro = err?.status === 403 || err?.body?.code === 50035;
        ctx?.toast(t(nitro ? "details.needsNitro" : "details.applyFailed"), { type: "failure" });
    }
}

interface Action { label: string; run(): void; }

/** A colour: clicking it opens what you can do with it, copy first */
function Swatch({ color, label, actions = [] }: { color: string; label: string; actions?: Action[]; }) {
    const [open, setOpen] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const close = () => {
        if (!open || closing) return;
        setClosing(true);
        void exitDone(menuRef.current).then(() => {
            setOpen(false);
            setClosing(false);
        });
    };
    React.useEffect(() => {
        if (!open) return;
        const outside = (e: Event) => {
            if (!wrapRef.current?.contains(e.target as Node)) close();
        };
        const key = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            close();
        };
        document.addEventListener("mousedown", outside, true);
        window.addEventListener("keydown", key, true);
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => {
            document.removeEventListener("mousedown", outside, true);
            window.removeEventListener("keydown", key, true);
        };
    }, [open, closing]);
    const items: Action[] = [{ label: t("details.copy", { value: copyText(color) }), run: () => void copy(color) }, ...actions];

    return (
        <div className="evi-vi-chip-wrap" ref={wrapRef}>
            <button type="button" className="evi-vi-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
                <span className="evi-vi-chip-dot" style={{ background: color }} aria-hidden="true" />
                <span className="evi-vi-chip-label">{label}</span>
                <span className="evi-vi-chip-value">{copyText(color)}</span>
                <svg className="evi-vi-chip-caret" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42Z" /></svg>
            </button>
            {open && (
                <div ref={menuRef} className="evi-vi-menu evi-popout" role="menu" data-closing={closing || undefined}>
                    {items.map(item => (
                        <button key={item.label} type="button" role="menuitem" className="evi-vi-menu-item" onClick={() => { item.run(); close(); }}>{item.label}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** The name as Discord draws it in profiles: its font, effect and colours, animated */
function StyledName({ name, style }: { name: string; style: NameStyle; }) {
    const Discord = findComponent('"UserNameWithEffects"');
    const fallback = <p className="evi-vi-name" style={{ backgroundImage: gradient(style.colors.length > 1 ? style.colors : [style.colors[0] ?? "currentColor", style.colors[0] ?? "currentColor"], 90) }}>{name}</p>;
    if (!Discord) return fallback;
    // effectDisplayType 2: animated, as on a profile you're looking at
    return <div className="evi-vi-styled-name"><Discord userName={name} displayNameStyles={style.raw} effectDisplayType={2} inProfile loop /></div>;
}

/** Opens a nameplate in Discord's Shop */
function openShop(skuId: string) {
    const go = find(filters.byCode("transitionTo - Transitioning to"));
    if (typeof go === "function") go(`/shop#itemSkuId=${skuId}`);
    else window.open(`https://discord.com/shop#itemSkuId=${skuId}`, "_blank", "noopener,noreferrer");
}

function Row({ title, children }: { title: string; children: ReactNode; }) {
    return (
        <section className="evi-vi-row">
            <h3 className="evi-vi-row-title">{title}</h3>
            {children}
        </section>
    );
}

function DetailsDialog({ name, username, details, onClose }: { name: string; username: string; details: ProfileDetails; onClose(): void; }) {
    const closeRef = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
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
    const { theme, bannerColor, nameStyle, nameplate } = details;
    // Your own profile's colours: changing one end of the theme keeps the other
    const mine = () => {
        const me = getStore("UserStore")?.getCurrentUser?.();
        return me ? profileDetails(me, getStore("UserProfileStore")?.getUserProfile?.(me.id)) : undefined;
    };
    const nameColors = nameStyle?.colors ?? [];

    return (
        // Mouse downs stay in here: Discord would take one for a click outside its profile popout and close it
        <div className="evi-vi-scrim evi-scrim" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
            <div className="evi-vi-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-vi-details-title">
                <header className="evi-vi-head">
                    <div>
                        <h2 id="evi-vi-details-title">{t("details.title")}</h2>
                        <p>{name !== username ? `${name} · @${username}` : `@${username}`}</p>
                    </div>
                    <button type="button" ref={closeRef} className="evi-vi-close" aria-label={t("details.close")} onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z" /></svg>
                    </button>
                </header>
                <div className="evi-vi-body">
                    {theme && (
                        <Row title={t("details.theme")}>
                            <div className="evi-vi-preview evi-vi-theme" style={{ background: gradient([theme.primary, theme.accent]) }} aria-hidden="true" />
                            <div className="evi-vi-chips">
                                <Swatch color={theme.primary} label={t("details.primary")} actions={[
                                    { label: t("details.useTop"), run: () => void applyToProfile("/users/@me/profile", { theme_colors: [toInt(theme.primary), toInt(mine()?.theme?.accent ?? theme.accent)] }) },
                                    { label: t("details.useTheme"), run: () => void applyToProfile("/users/@me/profile", { theme_colors: [toInt(theme.primary), toInt(theme.accent)] }) },
                                ]} />
                                <Swatch color={theme.accent} label={t("details.accent")} actions={[
                                    { label: t("details.useBottom"), run: () => void applyToProfile("/users/@me/profile", { theme_colors: [toInt(mine()?.theme?.primary ?? theme.primary), toInt(theme.accent)] }) },
                                    { label: t("details.useTheme"), run: () => void applyToProfile("/users/@me/profile", { theme_colors: [toInt(theme.primary), toInt(theme.accent)] }) },
                                ]} />
                            </div>
                        </Row>
                    )}
                    {bannerColor && (
                        <Row title={t("details.bannerColor")}>
                            <div className="evi-vi-chips"><Swatch color={bannerColor} label={t("kind.banner")} actions={[
                                { label: t("details.useBanner"), run: () => void applyToProfile("/users/@me/profile", { accent_color: toInt(bannerColor) }) },
                            ]} /></div>
                        </Row>
                    )}
                    {nameStyle && (
                        <Row title={t("details.nameStyle")}>
                            <StyledName name={name} style={nameStyle} />
                            <dl className="evi-vi-facts">
                                {nameStyle.effect && <><dt>{t("details.effect")}</dt><dd>{nameStyle.effect}</dd></>}
                                {nameStyle.font && <><dt>{t("details.font")}</dt><dd>{nameStyle.font}</dd></>}
                            </dl>
                            {nameColors.length > 0 && (
                                <div className="evi-vi-chips">
                                    {nameColors.map((c, i) => <Swatch key={i} color={c} label={t("details.color", { n: i + 1 })} actions={[
                                        { label: t("details.useNameStyle"), run: () => void applyToProfile("/users/@me", { display_name_font_id: nameStyle.raw.fontId, display_name_effect_id: nameStyle.raw.effectId, display_name_colors: nameStyle.raw.colors }) },
                                    ]} />)}
                                </div>
                            )}
                        </Row>
                    )}
                    {nameplate && (
                        <Row title={t("details.nameplate")}>
                            <div className="evi-vi-plate">
                                <p className="evi-vi-plain">{nameplate.name}</p>
                                {nameplate.skuId && (
                                    <button type="button" className="evi-vi-shop" onClick={() => { onClose(); openShop(nameplate.skuId!); }}>{t("details.inShop")}</button>
                                )}
                            </div>
                        </Row>
                    )}
                    {!hasDetails(details) && <p className="evi-vi-plain evi-vi-empty">{t("details.none")}</p>}
                </div>
            </div>
        </div>
    );
}

function openDetails(user: any, displayProfile: any) {
    closeDetails?.();
    const details = profileDetails(user, displayProfile);
    const username = String(user?.username ?? "");
    const name = String(user?.globalName || username);
    const close = openLayer(close => <DetailsDialog name={name} username={username} details={details} onClose={() => close()} />, {
        onClosed: () => void (closeDetails === close && (closeDetails = undefined)),
    });
    closeDetails = close;
}

function DetailsButton({ user, displayProfile }: { user: any; displayProfile: any; }) {
    const button = (
        <button
            type="button"
            className="evi-vi-details"
            aria-label={t("details.open")}
            aria-haspopup="dialog"
            ref={fillParent}
            onClick={e => {
                e.stopPropagation();
                openDetails(user, displayProfile);
            }}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10.8C22 5.9 17.5 2 12 2ZM6.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
            </svg>
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={t("details.open")} position="bottom">{button}</Tooltip> : button;
}

/** The button fills the banner, so the banner has to be what it's positioned against */
function fillParent(button: HTMLButtonElement | null) {
    const banner = button?.parentElement;
    if (banner && getComputedStyle(banner).position === "static") banner.style.position = "relative";
}

const css = `
.evi-vi-download {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--interactive-normal);
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
}
.evi-vi-download:hover { background: var(--background-modifier-hover); color: var(--interactive-hover); }
.evi-vi-download:focus-visible { outline: 2px solid var(--focus-primary); }
.evi-vi-download[aria-busy] { opacity: .6; cursor: progress; }
/* Like the avatar's in the same profile: a pointer, and black at 40% fading in over it */
.evi-vi-banner {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: none;
    cursor: pointer;
}
.evi-vi-banner::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-color: var(--opacity-black-40, rgb(0 0 0 / .4));
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
}
.evi-vi-banner:hover::after, .evi-vi-banner:focus-visible::after { opacity: 1; }
.evi-vi-banner:focus-visible { outline: 2px solid var(--focus-primary); outline-offset: -2px; }

.evi-vi-details {
    position: absolute;
    inset-block-start: 12px;
    inset-inline-start: 12px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / .48);
    color: var(--white, #fff);
    cursor: pointer;
    transition: background-color .15s ease-out, scale .2s ease-out;
}
@media (hover: hover) { .evi-vi-details:hover { background: rgb(0 0 0 / .64); } }
.evi-vi-details:active { scale: .96; }
.evi-vi-details:focus-visible { outline: 2px solid var(--focus-primary); outline-offset: 2px; }

.evi-vi-scrim { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; background: rgb(0 0 0 / .7); }
.evi-vi-modal { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
    background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, #dbdee1); border: 1px solid var(--border-subtle, transparent);
    box-shadow: var(--shadow-high, 0 8px 24px rgb(0 0 0 / .4)); font-family: var(--font-primary); }
.evi-vi-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 8px; }
.evi-vi-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, #f2f3f5); }
.evi-vi-head p { margin: 4px 0 0; font-size: 14px; line-height: 18px; color: var(--text-muted, #949ba4); overflow-wrap: anywhere; }
.evi-vi-close { flex: none; display: grid; place-items: center; width: 32px; height: 32px; margin: -4px -6px 0 0; padding: 0; border: 0; border-radius: 8px; background: none;
    color: var(--interactive-icon-default, var(--interactive-normal)); cursor: pointer; }
@media (hover: hover) { .evi-vi-close:hover { background: var(--background-mod-subtle, var(--background-modifier-hover)); color: var(--interactive-icon-hover, var(--interactive-hover)); } }
.evi-vi-close:focus-visible { outline: 2px solid var(--focus-primary); }
.evi-vi-body { overflow-y: auto; padding: 8px 20px 20px; display: flex; flex-direction: column; gap: 20px; }
.evi-vi-row-title { margin: 0 0 8px; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-vi-preview { height: 72px; border-radius: 8px; outline: 1px solid rgb(255 255 255 / .08); outline-offset: -1px; margin-bottom: 8px; }
.evi-vi-name { margin: 0 0 8px; font-size: 24px; line-height: 30px; font-weight: 700; -webkit-background-clip: text; background-clip: text; color: transparent; overflow-wrap: anywhere; }
.evi-vi-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 8px; font-size: 14px; line-height: 18px; }
.evi-vi-facts dt { color: var(--text-muted, #949ba4); }
.evi-vi-facts dd { margin: 0; color: var(--text-default, #dbdee1); }
.evi-vi-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.evi-vi-chip-wrap { position: relative; }
.evi-vi-chip-caret { color: var(--text-muted, #949ba4); margin-inline-start: -2px; }
.evi-vi-menu { position: absolute; z-index: 2; inset-block-start: calc(100% + 4px); inset-inline-start: 0; min-width: 220px; display: flex; flex-direction: column; padding: 6px;
    border-radius: 8px; background: var(--background-surface-higher, var(--background-floating, #111214)); border: 1px solid var(--border-subtle, rgb(255 255 255 / .08));
    box-shadow: var(--shadow-high, 0 8px 16px rgb(0 0 0 / .24)); }
.evi-vi-menu-item { padding: 8px 10px; border: 0; border-radius: 4px; background: none; color: var(--interactive-text-default, var(--text-default, #dbdee1)); font: inherit; font-size: 14px; line-height: 18px; text-align: start; cursor: pointer; }
.evi-vi-menu-item:hover, .evi-vi-menu-item:focus-visible { background: var(--background-mod-subtle, var(--background-modifier-hover)); color: var(--interactive-text-hover, #fff); outline: none; }
.evi-vi-styled-name { margin: 0 0 8px; font-size: 24px; line-height: 30px; font-weight: 700; }
.evi-vi-plate { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.evi-vi-shop { flex: none; min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff);
    font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: scale .2s ease-out; }
@media (hover: hover) { .evi-vi-shop:hover { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); } }
.evi-vi-shop:active { scale: .97; }
.evi-vi-shop:focus-visible { outline: 2px solid var(--focus-primary); outline-offset: 2px; }
.evi-vi-chip { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px 0 6px; border: 1px solid var(--border-subtle, rgb(255 255 255 / .08)); border-radius: 8px;
    background: var(--background-base-lower, rgb(0 0 0 / .12)); color: var(--text-default, #dbdee1); font: inherit; font-size: 13px; cursor: pointer; transition: scale .2s ease-out; }
@media (hover: hover) { .evi-vi-chip:hover { background: var(--background-mod-subtle, var(--background-modifier-hover)); } }
.evi-vi-chip:active { scale: .97; }
.evi-vi-chip:focus-visible { outline: 2px solid var(--focus-primary); outline-offset: 2px; }
.evi-vi-chip-dot { width: 20px; height: 20px; border-radius: 50%; outline: 1px solid rgb(255 255 255 / .16); outline-offset: -1px; }
.evi-vi-chip-label { color: var(--text-muted, #949ba4); white-space: nowrap; }
.evi-vi-chip-value { font-family: var(--font-code, monospace); text-transform: uppercase; }
.evi-vi-plain { margin: 0; font-size: 14px; line-height: 18px; }
.evi-vi-empty { color: var(--text-muted, #949ba4); }
`;

export default definePlugin({
    patches: [PATCHES.viewer, PATCHES.banner],

    start(context) {
        ctx = context;
        context.onDispose(() => {
            closeDetails?.({ instant: true });
            ctx = undefined;
        });
        context.addStyle(css);
    },

    /** Called by the viewer's module with its top bar button component */
    captureButton(component: unknown) {
        if (typeof component === "function") ViewerButton = component as (props: any) => ReactNode;
    },

    /** Called by the viewer's top bar, right after zoom */
    renderDownload(item: any, hideMediaOptions: boolean) {
        // With media options on, Discord's own save button is there
        if (!ctx || !hideMediaOptions || item?.type !== "IMAGE") return null;
        const linked = pictureFromUrl(item.original ?? item.url);
        if (!linked) return null;
        return <DownloadButton key="evi-vi-download" picture={linkedPicture(linked, ownerName(linked))} />;
    },

    /** Called by a profile banner with what it shows; returns its overlay with our buttons under it */
    renderBanner(user: any, src: string | null, overlay: ReactNode, displayProfile?: any) {
        // A banner being edited (a data: or blob: preview in the profile editor) gets nothing of ours
        if (!ctx || !user || (typeof src === "string" && /^(data|blob):/.test(src))) return overlay;
        const linked = pictureFromUrl(src);
        const picture = linked && linkedPicture(linked, user?.username || user?.globalName || ownerName(linked));
        const open = (e: MouseEvent) => {
            e.stopPropagation();
            if (picture) void openViewer(picture);
        };
        return (
            <>
                {picture && <button type="button" className="evi-vi-banner" aria-label={t("viewBanner")} onClick={open} ref={fillParent} />}
                {overlay}
                <DetailsButton user={user} displayProfile={displayProfile} />
            </>
        );
    },
});
