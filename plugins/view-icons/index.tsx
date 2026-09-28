/**
 * View Icons: download profile pictures from Discord's image viewer, and open banners in it.
 *
 * Clicking someone's avatar in their profile already opens Discord's image viewer, with only a
 * zoom button. Source patches add:
 *  - a Download button next to zoom, for avatars, banners and server icons (any Discord CDN link
 *    icons.ts recognises), saving the original through the desktop app's save dialog;
 *  - a click on a profile banner (popout and full profile) that opens it in the same viewer.
 *
 * The viewer's own button component is captured when its module loads, so Download looks and
 * behaves like zoom. If Discord renames it, a plain button with the same icon stands in.
 */
import { Components, definePlugin, filters, find, getStore, React } from "@evi/api";
import type { PluginContext, SourcePatch } from "@evi/api";
import type { MouseEvent, ReactNode } from "react";

import { t } from "./strings";
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
    /** A profile banner: <Banner bannerSrc overlay …/>. Ours sits under the overlay, filling the banner */
    banner: {
        find: /pendingAccentColor:\w+,animateOnHoverOrFocusOnly:/,
        replace: {
            match: /(?<=\{user:(\i),displayProfile:[^]{0,1500}?)bannerSrc:(\i),([^]{0,300}?)overlay:(\i),(?=onInteractionStart:)/,
            with: "bannerSrc:$2,$3overlay:$self?.renderBanner?.($1,$2,$4)??$4,",
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
.evi-vi-banner {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: zoom-in;
}
.evi-vi-banner:focus-visible { outline: 2px solid var(--focus-primary); outline-offset: -2px; }
`;

export default definePlugin({
    patches: [PATCHES.viewer, PATCHES.banner],

    start(context) {
        ctx = context;
        context.onDispose(() => void (ctx = undefined));
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

    /** Called by a profile banner with what it shows; returns its overlay with our button under it */
    renderBanner(user: any, src: string | null, overlay: ReactNode) {
        const linked = ctx && pictureFromUrl(src);
        if (!linked) return overlay;
        const picture = linkedPicture(linked, user?.username || user?.globalName || ownerName(linked));
        const open = (e: MouseEvent) => {
            e.stopPropagation();
            void openViewer(picture);
        };
        return (
            <>
                <button type="button" className="evi-vi-banner" aria-label={t("viewBanner")} onClick={open} ref={fillParent} />
                {overlay}
            </>
        );
    },
});
