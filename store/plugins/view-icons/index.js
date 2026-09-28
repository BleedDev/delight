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
var import_api2 = require("@evi/api");

// plugins/view-icons/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    download: "Download",
    viewBanner: "View Banner",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Server Avatar",
    "kind.banner": "Banner",
    "kind.server-banner": "Server Banner",
    "kind.icon": "Icon",
    "kind.splash": "Invite Background",
    "kind.discovery-splash": "Discovery Background",
    "toast.downloadFailed": "Couldn't download the picture, opening it in your browser"
  },
  de: {
    download: "Herunterladen",
    viewBanner: "Banner ansehen",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Server-Avatar",
    "kind.banner": "Banner",
    "kind.server-banner": "Server-Banner",
    "kind.icon": "Symbol",
    "kind.splash": "Einladungshintergrund",
    "kind.discovery-splash": "Entdecken-Hintergrund",
    "toast.downloadFailed": "Das Bild konnte nicht heruntergeladen werden, es wird in deinem Browser geöffnet"
  },
  es: {
    download: "Descargar",
    viewBanner: "Ver banner",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Avatar del servidor",
    "kind.banner": "Banner",
    "kind.server-banner": "Banner del servidor",
    "kind.icon": "Icono",
    "kind.splash": "Fondo de invitación",
    "kind.discovery-splash": "Fondo de Descubrimiento",
    "toast.downloadFailed": "No se pudo descargar la imagen, se abrirá en tu navegador"
  },
  fr: {
    download: "Télécharger",
    viewBanner: "Voir la bannière",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Avatar du serveur",
    "kind.banner": "Bannière",
    "kind.server-banner": "Bannière du serveur",
    "kind.icon": "Icône",
    "kind.splash": "Arrière-plan d'invitation",
    "kind.discovery-splash": "Arrière-plan de Découverte",
    "toast.downloadFailed": "Impossible de télécharger l'image, ouverture dans ton navigateur"
  },
  ja: {
    download: "ダウンロード",
    viewBanner: "バナーを表示",
    "kind.avatar": "アバター",
    "kind.server-avatar": "サーバーアバター",
    "kind.banner": "バナー",
    "kind.server-banner": "サーバーバナー",
    "kind.icon": "アイコン",
    "kind.splash": "招待の背景",
    "kind.discovery-splash": "ディスカバリーの背景",
    "toast.downloadFailed": "画像をダウンロードできなかったため、ブラウザーで開きます"
  },
  pl: {
    download: "Pobierz",
    viewBanner: "Zobacz baner",
    "kind.avatar": "Awatar",
    "kind.server-avatar": "Awatar serwera",
    "kind.banner": "Baner",
    "kind.server-banner": "Baner serwera",
    "kind.icon": "Ikona",
    "kind.splash": "Tło zaproszenia",
    "kind.discovery-splash": "Tło odkrywania",
    "toast.downloadFailed": "Nie udało się pobrać obrazu, otwieram go w przeglądarce"
  },
  "pt-BR": {
    download: "Baixar",
    viewBanner: "Ver banner",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Avatar do servidor",
    "kind.banner": "Banner",
    "kind.server-banner": "Banner do servidor",
    "kind.icon": "Ícone",
    "kind.splash": "Plano de fundo do convite",
    "kind.discovery-splash": "Plano de fundo do Descobrir",
    "toast.downloadFailed": "Não foi possível baixar a imagem, abrindo no seu navegador"
  },
  ru: {
    download: "Скачать",
    viewBanner: "Посмотреть баннер",
    "kind.avatar": "Аватар",
    "kind.server-avatar": "Аватар сервера",
    "kind.banner": "Баннер",
    "kind.server-banner": "Баннер сервера",
    "kind.icon": "Значок",
    "kind.splash": "Фон приглашения",
    "kind.discovery-splash": "Фон в «Обзоре»",
    "toast.downloadFailed": "Не удалось скачать изображение, открываем его в браузере"
  },
  tr: {
    download: "İndir",
    viewBanner: "Banner'ı Görüntüle",
    "kind.avatar": "Avatar",
    "kind.server-avatar": "Sunucu Avatarı",
    "kind.banner": "Banner",
    "kind.server-banner": "Sunucu Banner'ı",
    "kind.icon": "Simge",
    "kind.splash": "Davet Arka Planı",
    "kind.discovery-splash": "Keşfet Arka Planı",
    "toast.downloadFailed": "Resim indirilemedi, tarayıcında açılıyor"
  }
});

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
function fitSize(aspect, maxWidth, maxHeight) {
  const width = Math.max(1, Math.round(Math.min(maxWidth, maxHeight * aspect)));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}
var CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
var HASH_FILE = /^((?:a_)?[0-9a-f]{32})\.(?:png|jpe?g|webp|gif|avif)$/;
function pictureFromUrl(link) {
  if (typeof link !== "string")
    return null;
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !CDN_HOSTS.has(url.hostname))
    return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const defaultAvatar = /^embed\/avatars\/(\d)\.png$/.exec(parts.join("/"));
  if (defaultAvatar)
    return { kind: "avatar", ownerId: null, url: `${CDN}/embed/avatars/${defaultAvatar[1]}.png` };
  const file = HASH_FILE.exec(parts[parts.length - 1] ?? "");
  if (!file)
    return null;
  const dir = parts.slice(0, -1);
  const make = (kind, ownerId, path, allowAnimated = true) => {
    const full = cdnUrl(path, file[1], allowAnimated);
    return full ? { kind, ownerId, url: full } : null;
  };
  if (dir.length === 2 && SNOWFLAKE.test(dir[1])) {
    const [type, id] = dir;
    if (type === "avatars")
      return make("avatar", id, `avatars/${id}`);
    if (type === "banners")
      return make("banner", id, `banners/${id}`);
    if (type === "icons")
      return make("icon", id, `icons/${id}`);
    if (type === "channel-icons")
      return make("icon", id, `channel-icons/${id}`, false);
    if (type === "splashes")
      return make("splash", id, `splashes/${id}`, false);
    if (type === "discovery-splashes")
      return make("discovery-splash", id, `discovery-splashes/${id}`, false);
  }
  if (dir.length === 5 && dir[0] === "guilds" && dir[2] === "users" && SNOWFLAKE.test(dir[1]) && SNOWFLAKE.test(dir[3])) {
    if (dir[4] === "avatars")
      return make("server-avatar", dir[3], dir.join("/"));
    if (dir[4] === "banners")
      return make("server-banner", dir[3], dir.join("/"));
  }
  return null;
}
function linkedPicture(linked, owner) {
  return picture(linked.kind, linked.url, owner);
}

// plugins/view-icons/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var MEASURE_WAIT_MS = 1500;
var ctx;
var ViewerButton;
var openExternal = (url) => void window.open(url, "_blank", "noopener,noreferrer");
var PATCHES = {
  viewer: {
    find: ".SAVE_MEDIA_PRESSED)",
    group: true,
    replace: [
      {
        match: /function (\i)\((\i)\)\{let\{tooltipText:\i,\.\.\.\i\}=\2;/,
        with: "$self?.captureButton?.($1);$&"
      },
      {
        match: /"IMAGE"===(\i)\.type&&\(0,\i\.jsx\)\(\i,\{\}\),(?=!(\i)&&)/,
        with: "$&$self?.renderDownload?.($1,$2),"
      }
    ]
  },
  banner: {
    find: /pendingAccentColor:\w+,animateOnHoverOrFocusOnly:/,
    replace: {
      match: /(?<=\{user:(\i),displayProfile:[^]{0,1500}?)bannerSrc:(\i),([^]{0,300}?)overlay:(\i),(?=onInteractionStart:)/,
      with: "bannerSrc:$2,$3overlay:$self?.renderBanner?.($1,$2,$4)??$4,"
    }
  }
};
function ownerName(linked) {
  const id = linked.ownerId;
  if (!id)
    return "discord";
  const user = import_api2.getStore("UserStore")?.getUser?.(id);
  if (user)
    return user.username || user.globalName || id;
  return import_api2.getStore("GuildStore")?.getGuild?.(id)?.name || import_api2.getStore("ChannelStore")?.getChannel?.(id)?.name || id;
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
var findViewer = () => import_api2.find(import_api2.filters.byCode("markSessionStarted", "hasMediaOptions:!"));
async function openViewer(picture2) {
  const open = findViewer();
  if (typeof open !== "function") {
    ctx?.logger.warn("Discord's image viewer wasn't found, opening in the browser");
    return openExternal(picture2.url);
  }
  const { width, height } = fitSize(await measure(picture2.url) ?? picture2.aspect, window.innerWidth * 0.8, window.innerHeight * 0.75);
  const item = {
    type: "IMAGE",
    url: picture2.url,
    original: picture2.url,
    proxyUrl: picture2.url,
    width,
    height,
    alt: t(`kind.${picture2.kind}`),
    animated: picture2.animated,
    srcIsAnimated: picture2.animated,
    contentType: picture2.animated ? "image/gif" : "image/png"
  };
  try {
    open({ items: [item], startingIndex: 0, location: "View Icons", shouldHideMediaOptions: true });
  } catch (err) {
    ctx?.logger.error("Couldn't open Discord's image viewer", err);
    openExternal(picture2.url);
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
    ctx?.toast(t("toast.downloadFailed"), { type: "failure" });
    openExternal(picture2.url);
  }
}
function DownloadIcon(props) {
  const Native = import_api2.find(import_api2.filters.byProps("DownloadIcon"))?.DownloadIcon;
  if (Native)
    return /* @__PURE__ */ jsx_runtime.jsx(Native, {
      ...props
    });
  return /* @__PURE__ */ jsx_runtime.jsx("svg", {
    className: props.className,
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsx_runtime.jsx("path", {
      fill: "currentColor",
      d: "M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z"
    })
  });
}
function DownloadButton({ picture: picture2 }) {
  const [saving, setSaving] = import_api2.React.useState(false);
  const onClick = () => {
    if (saving)
      return;
    setSaving(true);
    download(picture2).finally(() => setSaving(false));
  };
  if (ViewerButton)
    return /* @__PURE__ */ jsx_runtime.jsx(ViewerButton, {
      tooltipText: t("download"),
      icon: DownloadIcon,
      loading: saving,
      onClick
    });
  const button = /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "evi-vi-download",
    "aria-label": t("download"),
    "aria-busy": saving || undefined,
    onClick,
    children: /* @__PURE__ */ jsx_runtime.jsx(DownloadIcon, {})
  });
  const Tooltip = import_api2.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: t("download"),
    position: "bottom",
    children: button
  }) : button;
}
function fillParent(button) {
  const banner = button?.parentElement;
  if (banner && getComputedStyle(banner).position === "static")
    banner.style.position = "relative";
}
var css = `
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
var view_icons_default = import_api2.definePlugin({
  patches: [PATCHES.viewer, PATCHES.banner],
  start(context) {
    ctx = context;
    context.onDispose(() => void (ctx = undefined));
    context.addStyle(css);
  },
  captureButton(component) {
    if (typeof component === "function")
      ViewerButton = component;
  },
  renderDownload(item, hideMediaOptions) {
    if (!ctx || !hideMediaOptions || item?.type !== "IMAGE")
      return null;
    const linked = pictureFromUrl(item.original ?? item.url);
    if (!linked)
      return null;
    return /* @__PURE__ */ jsx_runtime.jsx(DownloadButton, {
      picture: linkedPicture(linked, ownerName(linked))
    }, "evi-vi-download");
  },
  renderBanner(user, src, overlay) {
    const linked = ctx && pictureFromUrl(src);
    if (!linked)
      return overlay;
    const picture2 = linkedPicture(linked, user?.username || user?.globalName || ownerName(linked));
    const open = (e) => {
      e.stopPropagation();
      openViewer(picture2);
    };
    return /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("button", {
          type: "button",
          className: "evi-vi-banner",
          "aria-label": t("viewBanner"),
          onClick: open,
          ref: fillParent
        }),
        overlay
      ]
    });
  }
});
