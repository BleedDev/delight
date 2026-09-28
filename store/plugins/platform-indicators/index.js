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

// plugins/platform-indicators/index.tsx
var exports_platform_indicators = {};
__export(exports_platform_indicators, {
  default: () => platform_indicators_default
});
module.exports = __toCommonJS(exports_platform_indicators);
var import_api2 = require("@evi/api");

// plugins/platform-indicators/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.showOnProfiles": "On profiles",
    "settings.showOnProfiles.description": "Next to the badges on someone's profile.",
    "settings.showInChat": "In chat",
    "settings.showInChat.description": "After the name on each message.",
    "settings.showInMemberList": "In the member list",
    "settings.showInMemberList.description": "After each name in a server's member list.",
    "settings.showOwn": "Your own devices",
    "settings.showOwn.description": "Show which of your own clients are online too.",
    "status.online": "Online",
    "status.idle": "Idle",
    "status.dnd": "Do Not Disturb",
    "device.desktop": "desktop",
    "device.mobile": "mobile",
    "device.web": "the web",
    "device.embedded": "a console",
    tooltip: "{status} on {device}"
  },
  de: {
    "settings.showOnProfiles": "In Profilen",
    "settings.showOnProfiles.description": "Neben den Abzeichen im Profil einer Person.",
    "settings.showInChat": "Im Chat",
    "settings.showInChat.description": "Hinter dem Namen bei jeder Nachricht.",
    "settings.showInMemberList": "In der Mitgliederliste",
    "settings.showInMemberList.description": "Hinter jedem Namen in der Mitgliederliste eines Servers.",
    "settings.showOwn": "Deine eigenen Geräte",
    "settings.showOwn.description": "Zeigt auch, welche deiner eigenen Clients online sind.",
    "status.online": "Online",
    "status.idle": "Abwesend",
    "status.dnd": "Bitte nicht stören",
    "device.desktop": "auf dem Desktop",
    "device.mobile": "auf dem Handy",
    "device.web": "im Web",
    "device.embedded": "auf einer Konsole",
    tooltip: "{status} {device}"
  },
  es: {
    "settings.showOnProfiles": "En los perfiles",
    "settings.showOnProfiles.description": "Junto a las insignias del perfil de alguien.",
    "settings.showInChat": "En el chat",
    "settings.showInChat.description": "Después del nombre en cada mensaje.",
    "settings.showInMemberList": "En la lista de miembros",
    "settings.showInMemberList.description": "Después de cada nombre en la lista de miembros de un servidor.",
    "settings.showOwn": "Tus propios dispositivos",
    "settings.showOwn.description": "Muestra también cuáles de tus propios clientes están conectados.",
    "status.online": "En línea",
    "status.idle": "Ausente",
    "status.dnd": "No molestar",
    "device.desktop": "el escritorio",
    "device.mobile": "el móvil",
    "device.web": "la web",
    "device.embedded": "una consola",
    tooltip: "{status} en {device}"
  },
  fr: {
    "settings.showOnProfiles": "Sur les profils",
    "settings.showOnProfiles.description": "À côté des badges sur le profil de quelqu'un.",
    "settings.showInChat": "Dans le chat",
    "settings.showInChat.description": "Après le nom sur chaque message.",
    "settings.showInMemberList": "Dans la liste des membres",
    "settings.showInMemberList.description": "Après chaque nom dans la liste des membres d'un serveur.",
    "settings.showOwn": "Tes propres appareils",
    "settings.showOwn.description": "Affiche aussi lesquels de tes propres clients sont en ligne.",
    "status.online": "En ligne",
    "status.idle": "Inactif",
    "status.dnd": "Ne pas déranger",
    "device.desktop": "sur ordinateur",
    "device.mobile": "sur mobile",
    "device.web": "sur le web",
    "device.embedded": "sur console",
    tooltip: "{status} {device}"
  },
  ja: {
    "settings.showOnProfiles": "プロフィール",
    "settings.showOnProfiles.description": "ユーザープロフィールのバッジの横に表示します。",
    "settings.showInChat": "チャット",
    "settings.showInChat.description": "各メッセージの名前の後ろに表示します。",
    "settings.showInMemberList": "メンバーリスト",
    "settings.showInMemberList.description": "サーバーのメンバーリストの各名前の後ろに表示します。",
    "settings.showOwn": "自分のデバイス",
    "settings.showOwn.description": "自分のクライアントのうちオンラインのものも表示します。",
    "status.online": "オンライン",
    "status.idle": "退席中",
    "status.dnd": "取り込み中",
    "device.desktop": "デスクトップ",
    "device.mobile": "モバイル",
    "device.web": "ウェブ",
    "device.embedded": "ゲーム機",
    tooltip: "{device}で{status}"
  },
  pl: {
    "settings.showOnProfiles": "Na profilach",
    "settings.showOnProfiles.description": "Obok odznak na profilu użytkownika.",
    "settings.showInChat": "Na czacie",
    "settings.showInChat.description": "Po nazwie przy każdej wiadomości.",
    "settings.showInMemberList": "Na liście członków",
    "settings.showInMemberList.description": "Po każdej nazwie na liście członków serwera.",
    "settings.showOwn": "Twoje urządzenia",
    "settings.showOwn.description": "Pokazuje też, które z twoich klientów są online.",
    "status.online": "Online",
    "status.idle": "Zaraz wracam",
    "status.dnd": "Nie przeszkadzać",
    "device.desktop": "na komputerze",
    "device.mobile": "na telefonie",
    "device.web": "w przeglądarce",
    "device.embedded": "na konsoli",
    tooltip: "{status} {device}"
  },
  "pt-BR": {
    "settings.showOnProfiles": "Nos perfis",
    "settings.showOnProfiles.description": "Ao lado das insígnias no perfil de alguém.",
    "settings.showInChat": "No chat",
    "settings.showInChat.description": "Depois do nome em cada mensagem.",
    "settings.showInMemberList": "Na lista de membros",
    "settings.showInMemberList.description": "Depois de cada nome na lista de membros de um servidor.",
    "settings.showOwn": "Seus próprios dispositivos",
    "settings.showOwn.description": "Mostra também quais dos seus próprios clientes estão online.",
    "status.online": "Online",
    "status.idle": "Ausente",
    "status.dnd": "Não perturbe",
    "device.desktop": "no computador",
    "device.mobile": "no celular",
    "device.web": "na web",
    "device.embedded": "em um console",
    tooltip: "{status} {device}"
  },
  ru: {
    "settings.showOnProfiles": "В профилях",
    "settings.showOnProfiles.description": "Рядом со значками в профиле пользователя.",
    "settings.showInChat": "В чате",
    "settings.showInChat.description": "После имени в каждом сообщении.",
    "settings.showInMemberList": "В списке участников",
    "settings.showInMemberList.description": "После каждого имени в списке участников сервера.",
    "settings.showOwn": "Ваши устройства",
    "settings.showOwn.description": "Показывать также, какие из ваших клиентов сейчас в сети.",
    "status.online": "В сети",
    "status.idle": "Не активен",
    "status.dnd": "Не беспокоить",
    "device.desktop": "на компьютере",
    "device.mobile": "на телефоне",
    "device.web": "в браузере",
    "device.embedded": "на консоли",
    tooltip: "{status} {device}"
  },
  tr: {
    "settings.showOnProfiles": "Profillerde",
    "settings.showOnProfiles.description": "Birinin profilinde rozetlerin yanında.",
    "settings.showInChat": "Sohbette",
    "settings.showInChat.description": "Her mesajda adın yanında.",
    "settings.showInMemberList": "Üye listesinde",
    "settings.showInMemberList.description": "Bir sunucunun üye listesinde her adın yanında.",
    "settings.showOwn": "Kendi cihazların",
    "settings.showOwn.description": "Kendi istemcilerinden hangilerinin çevrimiçi olduğunu da gösterir.",
    "status.online": "Çevrimiçi",
    "status.idle": "Boşta",
    "status.dnd": "Rahatsız Etmeyin",
    "device.desktop": "Masaüstünde",
    "device.mobile": "Mobilde",
    "device.web": "Web'de",
    "device.embedded": "Konsolda",
    tooltip: "{device} {status}"
  }
});

// plugins/platform-indicators/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var usernameFilter = import_api2.filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
var BADGES = 1;
var PLATFORMS = ["desktop", "mobile", "web", "embedded"];
var COLORS = { online: "#23a55a", idle: "#f0b232", dnd: "#f23f43" };
var MUTED = "#949ba4";
var GLYPHS = {
  desktop: `<rect x="2.5" y="3.5" width="19" height="12.5" rx="2.5"/><path d="M12 16v4.5M8 20.5h8"/>`,
  mobile: `<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 18.5h3"/>`,
  web: `<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5Z"/>`,
  embedded: `<path d="M7.5 6.5h9a5 5 0 0 1 4.9 4l.9 4.6a3.2 3.2 0 0 1-5.6 2.6L15 15.5H9l-1.7 2.2a3.2 3.2 0 0 1-5.6-2.6l.9-4.6a5 5 0 0 1 4.9-4Z"/><path d="M7.5 10v3M6 11.5h3"/><path d="M15.5 11h.01M17.5 13h.01"/>`
};
function svg(p, s, glyph, maskId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">` + `<mask id="${maskId}"><rect width="24" height="24" fill="white"/><circle cx="19.5" cy="19.5" r="6" fill="black"/></mask>` + `<g mask="url(#${maskId})" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[p]}</g>` + `<circle cx="19.5" cy="19.5" r="4" fill="${COLORS[s]}"/></svg>`;
}
var iconSrcs = new Map;
var iconSrc = (p, s) => {
  const key = `${p}:${s}`;
  let src = iconSrcs.get(key);
  if (!src)
    iconSrcs.set(key, src = `data:image/svg+xml,${encodeURIComponent(svg(p, s, MUTED, "m"))}`);
  return src;
};
var settings = {
  showOnProfiles: { type: "boolean", get label() {
    return t("settings.showOnProfiles");
  }, get description() {
    return t("settings.showOnProfiles.description");
  }, default: true },
  showInChat: { type: "boolean", get label() {
    return t("settings.showInChat");
  }, get description() {
    return t("settings.showInChat.description");
  }, default: true },
  showInMemberList: { type: "boolean", get label() {
    return t("settings.showInMemberList");
  }, get description() {
    return t("settings.showInMemberList.description");
  }, default: true },
  showOwn: { type: "boolean", get label() {
    return t("settings.showOwn");
  }, get description() {
    return t("settings.showOwn.description");
  }, default: true }
};
var context;
var stores = new Map;
var store = (name) => {
  let found = stores.get(name);
  if (found)
    return found;
  try {
    found = import_api2.getStore(name);
  } catch {
    return;
  }
  stores.set(name, found);
  return found;
};
var me;
var ownId = () => me ??= store("UserStore")?.getCurrentUser?.()?.id;
var PRESENCE = { online: 2, dnd: 2, idle: 1 };
function deviceOf(statuses) {
  let best;
  for (const p of PLATFORMS) {
    const s = statuses?.[p];
    if (s !== "online" && s !== "idle" && s !== "dnd")
      continue;
    if (!best || PRESENCE[s] > PRESENCE[best[1]])
      best = [p, s];
  }
  return best;
}
function devicesOf(userId) {
  if (!userId)
    return [];
  let statuses;
  if (userId === ownId()) {
    if (!context?.settings.get("showOwn"))
      return [];
    const status = store("PresenceStore")?.getStatus?.(userId) ?? "online";
    const sessions = Object.values(store("SessionsStore")?.getSessions?.() ?? {});
    const live = sessions.filter((s) => s?.active !== false && s?.status !== "invisible" && s?.status !== "offline");
    statuses = {};
    for (const s of live.length ? live : sessions) {
      const client = s?.clientInfo?.client;
      if (typeof client === "string")
        statuses[client] = s.status === "idle" ? "idle" : status;
    }
  } else {
    statuses = store("PresenceStore")?.getClientStatus?.(userId);
  }
  const device = deviceOf(statuses);
  return device ? [device] : [];
}
function deviceKey(userId) {
  const [device] = devicesOf(userId);
  return device ? `${device[0]}:${device[1]}` : "";
}
var tooltip = (p, s) => t("tooltip", { status: t(`status.${s}`), device: t(`device.${p}`) });
var listeners = new Map;
var lastKeys = new Map;
var diffTimer;
function subscribe(userId, cb) {
  let set = listeners.get(userId);
  if (!set) {
    listeners.set(userId, set = new Set);
    lastKeys.set(userId, deviceKey(userId));
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size || listeners.get(userId) !== set)
      return;
    listeners.delete(userId);
    lastKeys.delete(userId);
  };
}
function diff(all = false) {
  clearTimeout(diffTimer);
  diffTimer = undefined;
  for (const [userId, set] of [...listeners]) {
    const key = deviceKey(userId);
    if (!all && lastKeys.get(userId) === key)
      continue;
    lastKeys.set(userId, key);
    for (const cb of [...set])
      cb();
  }
}
var DIFF_DELAY_MS = 250;
var diffSoon = () => {
  if (!listeners.size)
    return;
  diffTimer ??= setTimeout(diff, DIFF_DELAY_MS);
};
function useDevice(userId) {
  const sub = import_api2.React.useCallback((cb) => subscribe(userId, cb), [userId]);
  return import_api2.React.useSyncExternalStore(sub, () => lastKeys.get(userId) ?? deviceKey(userId));
}
function Icon({ platform, status }) {
  const id = `evi-platform-${import_api2.React.useId().replace(/:/g, "")}`;
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: "evi-platform-icon",
    style: { width: 16, height: 16 },
    "aria-label": tooltip(platform, status),
    role: "img",
    dangerouslySetInnerHTML: { __html: svg(platform, status, "currentColor", id) }
  });
}
var memoized;
var indicators = () => memoized ??= import_api2.React.memo(Indicators);
function Indicators({ userId, where }) {
  const key = useDevice(userId);
  if (!key || !context?.settings.get(where === "chat" ? "showInChat" : "showInMemberList"))
    return null;
  const [p, s] = key.split(":");
  const Tooltip = import_api2.Components.Tooltip;
  const icon = /* @__PURE__ */ jsx_runtime.jsx(Icon, {
    platform: p,
    status: s
  });
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: "evi-platforms",
    "data-where": where,
    children: Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
      text: tooltip(p, s),
      children: /* @__PURE__ */ jsx_runtime.jsx("span", {
        children: icon
      })
    }, p) : /* @__PURE__ */ jsx_runtime.jsx("span", {
      title: tooltip(p, s),
      children: icon
    }, p)
  });
}
var css = `
.evi-platforms { display: inline-flex; align-items: center; gap: 3px; margin-inline-start: 4px; color: var(--icon-muted, #949ba4); vertical-align: -3px; }
.evi-platforms[data-where="members"] { vertical-align: middle; }
.evi-platforms > span { display: inline-flex; }
.evi-platform-icon { display: inline-flex; width: 16px; height: 16px; }
.evi-platform-icon svg { width: 100%; height: 100%; }
`;
var platform_indicators_default = import_api2.definePlugin({
  settings,
  patches: [
    {
      find: "lostPermissionTooltipText",
      replace: {
        match: /decorators:(\(0,\i\.jsx\)\(\i,\{user:(\i),isOwner:[^}]*\}\))/,
        with: "decorators:[$1,$self.memberIndicators($2)]"
      }
    }
  ],
  memberIndicators(user) {
    if (!user?.id || user.bot || !context?.settings.get("showInMemberList"))
      return null;
    const Icons = indicators();
    return /* @__PURE__ */ jsx_runtime.jsx(Icons, {
      userId: user.id,
      where: "members"
    }, "evi-platforms");
  },
  start(ctx) {
    context = ctx;
    ctx.addStyle(css);
    const watched = ["PresenceStore", "SessionsStore"].map(store).filter(Boolean);
    for (const s of watched)
      s.addChangeListener?.(diffSoon);
    ctx.onDispose(() => watched.forEach((s) => s.removeChangeListener?.(diffSoon)));
    ctx.settings.onChange(() => diff(true));
    ctx.flux.subscribe("CONNECTION_OPEN", () => {
      me = undefined;
      diff(true);
    });
    diff(true);
    ctx.profileBadges((userId) => ctx.settings.get("showOnProfiles") ? devicesOf(userId).map(([p, s]) => ({ id: `platform-${p}`, name: tooltip(p, s), description: tooltip(p, s), iconSrc: iconSrc(p, s) })) : []);
    ctx.hookExport("before", usernameFilter, ({ args }) => {
      const props = args[0];
      const userId = props?.message?.author?.id;
      if (!userId || !props.decorations || !(BADGES in props.decorations) || props.message?.author?.bot)
        return;
      if (!ctx.settings.get("showInChat"))
        return;
      const existing = props.decorations[BADGES];
      const Icons = indicators();
      const ours = /* @__PURE__ */ jsx_runtime.jsx(Icons, {
        userId,
        where: "chat"
      }, "evi-platforms");
      args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...Array.isArray(existing) ? existing : existing != null ? [existing] : [], ours] } };
    });
  },
  stop() {
    context = undefined;
    me = undefined;
    diff(true);
  }
});
