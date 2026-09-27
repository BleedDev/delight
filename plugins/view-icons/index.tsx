/**
 * View Icons: see avatars, banners, server icons and group DM icons at full size, and download them.
 *
 * Right-click menus get "View Avatar", "View Banner" (users), "View Icon", "View Banner" (servers)
 * and "View Icon" (group DMs). Clicking one opens Discord's own media viewer (openMediaViewer, the
 * function Better Image Viewer also hooks) with its media options on, so zooming, saving, copying
 * and opening in the browser are Discord's. A person's avatars and banners open as one gallery,
 * so the arrows go from one to the next. Hovering an item shows Download and Copy Link for each
 * picture, which save the original file through the desktop app's save dialog.
 *
 * Banners come from someone's profile, which Discord only loads when it needs it. View Avatar loads
 * it first when it's missing (what opening their profile does), so their banner is in the gallery.
 * The links are built in icons.ts.
 */
import { definePlugin, filters, find, getStore, Menu } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import { fileName, fitSize, groupDmIcons, guildBanners, guildIcons, Picture, userAvatars, userBanners, UserImages } from "./icons";

const GROUP_DM = 3;
/** How long View Avatar waits for a profile to load before opening without its banner */
const PROFILE_WAIT_MS = 2500;
/** How long to wait for a picture's real size before going by its usual shape */
const MEASURE_WAIT_MS = 1500;

let ctx: PluginContext | undefined;

const openExternal = (url: string) => void window.open(url, "_blank", "noopener,noreferrer");
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ---- Pictures from Discord's stores -------------------------------------------------------------

function userImages(user: any, guildId: string | null | undefined): UserImages {
    const profiles = getStore("UserProfileStore");
    const member = guildId ? getStore("GuildMemberStore")?.getMember?.(guildId, user.id) : null;
    const memberProfile = guildId ? profiles?.getGuildMemberProfile?.(user.id, guildId) : null;
    return {
        id: user.id,
        name: user.username || user.globalName || user.id,
        avatar: user.avatar,
        discriminator: user.discriminator,
        banner: profiles?.getUserProfile?.(user.id)?.banner ?? user.banner,
        guildId,
        memberAvatar: member?.avatar,
        memberBanner: memberProfile?.banner ?? member?.banner,
    };
}

/** Loads someone's profile when Discord doesn't have it yet, for their banners. Never waits long */
async function loadProfile(userId: string, guildId: string | null | undefined) {
    if (getStore("UserProfileStore")?.getUserProfile?.(userId)) return;
    const fetchProfile = find(filters.byCode("USER_PROFILE_FETCH_START", "withMutualFriendsCount"));
    if (typeof fetchProfile !== "function") return;
    try {
        await Promise.race([Promise.resolve(fetchProfile(userId, { guildId: guildId ?? undefined })).catch(() => { }), sleep(PROFILE_WAIT_MS)]);
    } catch { /* opens without the banner */ }
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

async function openViewer(pictures: Picture[], start = 0) {
    if (!pictures.length) return;
    const open = findViewer();
    if (typeof open !== "function") {
        ctx?.logger.warn("Discord's image viewer wasn't found, opening in the browser");
        return openExternal(pictures[start].url);
    }
    const aspects = await Promise.all(pictures.map(p => measure(p.url)));
    const items = pictures.map((p, i) => {
        const { width, height } = fitSize(aspects[i] ?? p.aspect, window.innerWidth * 0.8, window.innerHeight * 0.75);
        return {
            type: "IMAGE",
            url: p.url,
            original: p.url,
            proxyUrl: p.url,
            width,
            height,
            alt: p.label,
            animated: p.animated,
            srcIsAnimated: p.animated,
            contentType: p.animated ? "image/gif" : "image/png",
        };
    });
    try {
        open({ items, startingIndex: Math.min(start, items.length - 1), location: "View Icons", shouldHideMediaOptions: false });
    } catch (err) {
        ctx?.logger.error("Couldn't open Discord's image viewer", err);
        openExternal(pictures[start].url);
    }
}

// ---- Download and copy --------------------------------------------------------------------------

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
        ctx?.toast(`Couldn't download the ${picture.label.toLowerCase()}, opening it in your browser`, { type: "failure" });
        openExternal(picture.url);
    }
}

async function copyLink(picture: Picture) {
    try {
        const native = (window as any).DiscordNative?.clipboard;
        if (native?.copy) native.copy(picture.url);
        else await navigator.clipboard.writeText(picture.url);
        ctx?.toast("Link copied", { type: "success" });
    } catch {
        ctx?.toast("Couldn't copy to the clipboard", { type: "failure" });
    }
}

// ---- Menus --------------------------------------------------------------------------------------

/** "View X": clicking opens the viewer, hovering lists Download and Copy Link for each picture */
function viewItem(id: string, label: string, pictures: Picture[], open: () => void): ReactNode {
    const single = pictures.length === 1;
    return (
        <Menu.Item key={id} id={id} label={label} action={open}>
            <Menu.Group>
                {pictures.map(p => (
                    <Menu.Item key={p.kind} id={`${id}-download-${p.kind}`} label={single ? "Download" : `Download ${p.label}`} action={() => void download(p)} />
                ))}
            </Menu.Group>
            <Menu.Group>
                {pictures.map(p => (
                    <Menu.Item key={p.kind} id={`${id}-copy-${p.kind}`} label={single ? "Copy Link" : `Copy ${p.label} Link`} action={() => void copyLink(p)} />
                ))}
            </Menu.Group>
        </Menu.Item>
    );
}

function userItems(user: any, guildId: string | null | undefined): ReactNode[] {
    const images = userImages(user, guildId);
    const avatars = userAvatars(images);
    const banners = userBanners(images);
    const items: ReactNode[] = [];
    if (avatars.length) {
        items.push(viewItem("evi-vi-avatar", "View Avatar", avatars, async () => {
            await loadProfile(user.id, guildId);
            const fresh = userImages(user, guildId);
            void openViewer([...userAvatars(fresh), ...userBanners(fresh)], 0);
        }));
    }
    if (banners.length) {
        items.push(viewItem("evi-vi-banner", "View Banner", banners, () => void openViewer([...avatars, ...banners], avatars.length)));
    }
    return items;
}

function guildItems(guild: any): ReactNode[] {
    const images = {
        id: guild.id,
        name: guild.name || guild.id,
        icon: guild.icon,
        banner: guild.banner,
        splash: guild.splash,
        discoverySplash: guild.discoverySplash ?? guild.discovery_splash,
    };
    const icons = guildIcons(images);
    const banners = guildBanners(images);
    const all = [...icons, ...banners];
    const items: ReactNode[] = [];
    if (icons.length) items.push(viewItem("evi-vi-icon", "View Icon", icons, () => void openViewer(all, 0)));
    if (banners.length) items.push(viewItem("evi-vi-server-banner", banners[0].kind === "banner" ? "View Banner" : "View Backgrounds", banners, () => void openViewer(all, icons.length)));
    return items;
}

export default definePlugin({
    start(context) {
        ctx = context;
        context.onDispose(() => void (ctx = undefined));

        context.contextMenu("user-context", (children, props) => {
            const user = props?.user;
            if (!user?.id) return;
            const guildId: string | undefined = props.guildId ?? props.guild?.id ?? props.channel?.guild_id;
            const items = userItems(user, guildId);
            if (items.length) children.push(<Menu.Group key="evi-view-icons">{items}</Menu.Group>);
        });

        context.contextMenu("guild-context", (children, props) => {
            const guild = props?.guild;
            if (!guild?.id) return;
            const items = guildItems(guild);
            if (items.length) children.push(<Menu.Group key="evi-view-icons">{items}</Menu.Group>);
        });

        context.contextMenu("gdm-context", (children, props) => {
            const channel = props?.channel;
            if (!channel?.id || channel.type !== GROUP_DM || !channel.icon) return;
            const icons = groupDmIcons(channel.id, channel.name || "Group DM", channel.icon);
            if (icons.length) children.push(<Menu.Group key="evi-view-icons">{viewItem("evi-vi-gdm-icon", "View Icon", icons, () => void openViewer(icons))}</Menu.Group>);
        });
    },
});
