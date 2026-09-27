var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// plugins/view-icons/index.tsx
var exports_view_icons = {};
__export(exports_view_icons, {
  default: () => view_icons_default
});
module.exports = __toCommonJS(exports_view_icons);
var import_api = require("@evi/api");

// plugins/view-icons/icons.ts
var CDN = "https://cdn.discordapp.com";
var SIZE = 4096;
var LABELS = {
  avatar: "Avatar",
  "server-avatar": "Server Avatar",
  banner: "Banner",
  "server-banner": "Server Banner",
  icon: "Icon",
  splash: "Invite Background",
  "discovery-splash": "Discovery Background"
};
var ASPECTS = {
  avatar: 1,
  "server-avatar": 1,
  icon: 1,
  banner: 2.5,
  "server-banner": 2.5,
  splash: 16 / 9,
  "discovery-splash": 16 / 9
};
var HASH = /^(a_)?[0-9a-f]{32}$/;
var SNOWFLAKE = /^\d{1,20}$/;
var isAnimatedHash = (hash) => hash.startsWith("a_");
function cdnUrl(path, hash, allowAnimated = true) {
  if (typeof hash !== "string" || !HASH.test(hash))
    return null;
  const ext = allowAnimated && isAnimatedHash(hash) ? "gif" : "png";
  return `${CDN}/${path}/${hash}.${ext}?size=${SIZE}`;
}
var extensionOf = (url) => /\.gif(\?|$)/.test(url) ? "gif" : "png";
function defaultAvatarUrl(userId, discriminator) {
  let index = 0;
  try {
    index = discriminator && discriminator !== "0" ? Number(discriminator) % 5 : Number((BigInt(userId) >> 22n) % 6n);
  } catch {}
  return `${CDN}/embed/avatars/${Number.isFinite(index) ? index : 0}.png`;
}
function safeFileName(name) {
  const clean = name.normalize("NFKC").replace(/[\u0000-\u001f<>:"/\\|?*\u007f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80).trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? `${clean}_` : clean || "image";
}
var fileName = (picture) => `${picture.baseName}.${extensionOf(picture.url)}`;
function picture(kind, url, owner, aspect = ASPECTS[kind]) {
  if (!url)
    return null;
  return {
    kind,
    label: LABELS[kind],
    url,
    animated: extensionOf(url) === "gif",
    baseName: safeFileName(`${owner} ${LABELS[kind].toLowerCase()}`).replace(/ /g, "-"),
    aspect
  };
}
var present = (list) => list.filter((p) => !!p);
function userAvatars(u) {
  if (!SNOWFLAKE.test(u.id))
    return [];
  const inGuild = u.guildId && SNOWFLAKE.test(u.guildId) ? u.guildId : null;
  return present([
    inGuild ? picture("server-avatar", cdnUrl(`guilds/${inGuild}/users/${u.id}/avatars`, u.memberAvatar), u.name) : null,
    picture("avatar", cdnUrl(`avatars/${u.id}`, u.avatar) ?? defaultAvatarUrl(u.id, u.discriminator), u.name)
  ]);
}
function userBanners(u) {
  if (!SNOWFLAKE.test(u.id))
    return [];
  const inGuild = u.guildId && SNOWFLAKE.test(u.guildId) ? u.guildId : null;
  return present([
    inGuild ? picture("server-banner", cdnUrl(`guilds/${inGuild}/users/${u.id}/banners`, u.memberBanner), u.name) : null,
    picture("banner", cdnUrl(`banners/${u.id}`, u.banner), u.name)
  ]);
}
function guildIcons(g) {
  if (!SNOWFLAKE.test(g.id))
    return [];
  return present([picture("icon", cdnUrl(`icons/${g.id}`, g.icon), g.name)]);
}
function guildBanners(g) {
  if (!SNOWFLAKE.test(g.id))
    return [];
  return present([
    picture("banner", cdnUrl(`banners/${g.id}`, g.banner), g.name, 16 / 9),
    picture("splash", cdnUrl(`splashes/${g.id}`, g.splash, false), g.name),
    picture("discovery-splash", cdnUrl(`discovery-splashes/${g.id}`, g.discoverySplash, false), g.name)
  ]);
}
function groupDmIcons(channelId, name, icon) {
  if (!SNOWFLAKE.test(channelId))
    return [];
  return present([picture("icon", cdnUrl(`channel-icons/${channelId}`, icon, false), name)]);
}
function fitSize(aspect, maxWidth, maxHeight) {
  const width = Math.max(1, Math.round(Math.min(maxWidth, maxHeight * aspect)));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

// plugins/view-icons/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var GROUP_DM = 3;
var PROFILE_WAIT_MS = 2500;
var MEASURE_WAIT_MS = 1500;
var ctx;
var openExternal = (url) => void window.open(url, "_blank", "noopener,noreferrer");
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function userImages(user, guildId) {
  const profiles = import_api.getStore("UserProfileStore");
  const member = guildId ? import_api.getStore("GuildMemberStore")?.getMember?.(guildId, user.id) : null;
  const memberProfile = guildId ? profiles?.getGuildMemberProfile?.(user.id, guildId) : null;
  return {
    id: user.id,
    name: user.username || user.globalName || user.id,
    avatar: user.avatar,
    discriminator: user.discriminator,
    banner: profiles?.getUserProfile?.(user.id)?.banner ?? user.banner,
    guildId,
    memberAvatar: member?.avatar,
    memberBanner: memberProfile?.banner ?? member?.banner
  };
}
async function loadProfile(userId, guildId) {
  if (import_api.getStore("UserProfileStore")?.getUserProfile?.(userId))
    return;
  const fetchProfile = import_api.find(import_api.filters.byCode("USER_PROFILE_FETCH_START", "withMutualFriendsCount"));
  if (typeof fetchProfile !== "function")
    return;
  try {
    await Promise.race([Promise.resolve(fetchProfile(userId, { guildId: guildId ?? undefined })).catch(() => {}), sleep(PROFILE_WAIT_MS)]);
  } catch {}
}
function measure(url) {
  return new Promise((resolve) => {
    const img = new Image;
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
var findViewer = () => import_api.find(import_api.filters.byCode("markSessionStarted", "hasMediaOptions:!"));
async function openViewer(pictures, start = 0) {
  if (!pictures.length)
    return;
  const open = findViewer();
  if (typeof open !== "function") {
    ctx?.logger.warn("Discord's image viewer wasn't found, opening in the browser");
    return openExternal(pictures[start].url);
  }
  const aspects = await Promise.all(pictures.map((p) => measure(p.url)));
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
      contentType: p.animated ? "image/gif" : "image/png"
    };
  });
  try {
    open({ items, startingIndex: Math.min(start, items.length - 1), location: "View Icons", shouldHideMediaOptions: false });
  } catch (err) {
    ctx?.logger.error("Couldn't open Discord's image viewer", err);
    openExternal(pictures[start].url);
  }
}
async function save(data, name, type) {
  const fileManager = window.DiscordNative?.fileManager;
  if (typeof fileManager?.saveWithDialog === "function") {
    await fileManager.saveWithDialog(data, name);
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function download(picture2) {
  try {
    const res = await fetch(picture2.url);
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    await save(data, fileName(picture2), res.headers.get("content-type") ?? (picture2.animated ? "image/gif" : "image/png"));
  } catch (err) {
    ctx?.logger.error(`Downloading the ${picture2.label.toLowerCase()} failed`, err);
    ctx?.toast(`Couldn't download the ${picture2.label.toLowerCase()}, opening it in your browser`, { type: "failure" });
    openExternal(picture2.url);
  }
}
async function copyLink(picture2) {
  try {
    const native = window.DiscordNative?.clipboard;
    if (native?.copy)
      native.copy(picture2.url);
    else
      await navigator.clipboard.writeText(picture2.url);
    ctx?.toast("Link copied", { type: "success" });
  } catch {
    ctx?.toast("Couldn't copy to the clipboard", { type: "failure" });
  }
}
function viewItem(id, label, pictures, open) {
  const single = pictures.length === 1;
  return /* @__PURE__ */ jsx_runtime.jsxs(import_api.Menu.Item, {
    id,
    label,
    action: open,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: pictures.map((p) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: `${id}-download-${p.kind}`,
          label: single ? "Download" : `Download ${p.label}`,
          action: () => void download(p)
        }, p.kind))
      }),
      /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: pictures.map((p) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: `${id}-copy-${p.kind}`,
          label: single ? "Copy Link" : `Copy ${p.label} Link`,
          action: () => void copyLink(p)
        }, p.kind))
      })
    ]
  }, id);
}
function userItems(user, guildId) {
  const images = userImages(user, guildId);
  const avatars = userAvatars(images);
  const banners = userBanners(images);
  const items = [];
  if (avatars.length) {
    items.push(viewItem("evi-vi-avatar", "View Avatar", avatars, async () => {
      await loadProfile(user.id, guildId);
      const fresh = userImages(user, guildId);
      openViewer([...userAvatars(fresh), ...userBanners(fresh)], 0);
    }));
  }
  if (banners.length) {
    items.push(viewItem("evi-vi-banner", "View Banner", banners, () => void openViewer([...avatars, ...banners], avatars.length)));
  }
  return items;
}
function guildItems(guild) {
  const images = {
    id: guild.id,
    name: guild.name || guild.id,
    icon: guild.icon,
    banner: guild.banner,
    splash: guild.splash,
    discoverySplash: guild.discoverySplash ?? guild.discovery_splash
  };
  const icons = guildIcons(images);
  const banners = guildBanners(images);
  const all = [...icons, ...banners];
  const items = [];
  if (icons.length)
    items.push(viewItem("evi-vi-icon", "View Icon", icons, () => void openViewer(all, 0)));
  if (banners.length)
    items.push(viewItem("evi-vi-server-banner", banners[0].kind === "banner" ? "View Banner" : "View Backgrounds", banners, () => void openViewer(all, icons.length)));
  return items;
}
var view_icons_default = import_api.definePlugin({
  start(context) {
    ctx = context;
    context.onDispose(() => void (ctx = undefined));
    context.contextMenu("user-context", (children, props) => {
      const user = props?.user;
      if (!user?.id)
        return;
      const guildId = props.guildId ?? props.guild?.id ?? props.channel?.guild_id;
      const items = userItems(user, guildId);
      if (items.length)
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: items
        }, "evi-view-icons"));
    });
    context.contextMenu("guild-context", (children, props) => {
      const guild = props?.guild;
      if (!guild?.id)
        return;
      const items = guildItems(guild);
      if (items.length)
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: items
        }, "evi-view-icons"));
    });
    context.contextMenu("gdm-context", (children, props) => {
      const channel = props?.channel;
      if (!channel?.id || channel.type !== GROUP_DM || !channel.icon)
        return;
      const icons = groupDmIcons(channel.id, channel.name || "Group DM", channel.icon);
      if (icons.length)
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: viewItem("evi-vi-gdm-icon", "View Icon", icons, () => void openViewer(icons))
        }, "evi-view-icons"));
    });
  }
});
