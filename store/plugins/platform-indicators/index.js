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
var import_api = require("@evi/api");
var jsx_runtime = require("react/jsx-runtime");
var usernameFilter = import_api.filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
var BADGES = 1;
var PLATFORMS = ["desktop", "mobile", "web", "embedded"];
var NAMES = { desktop: "desktop", mobile: "mobile", web: "the web", embedded: "a console" };
var STATUS_NAMES = { online: "Online", idle: "Idle", dnd: "Do Not Disturb" };
var COLORS = { online: "#23a55a", idle: "#f0b232", dnd: "#f23f43" };
var MUTED = "#949ba4";
var GLYPHS = {
  desktop: `<rect x="2.5" y="3.5" width="19" height="12.5" rx="2.5"/><path d="M12 16v4.5M8 20.5h8"/>`,
  mobile: `<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 18.5h3"/>`,
  web: `<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5Z"/>`,
  embedded: `<path d="M7.5 6.5h9a5 5 0 0 1 4.9 4l.9 4.6a3.2 3.2 0 0 1-5.6 2.6L15 15.5H9l-1.7 2.2a3.2 3.2 0 0 1-5.6-2.6l.9-4.6a5 5 0 0 1 4.9-4Z"/><path d="M7.5 10v3M6 11.5h3"/><path d="M15.5 11h.01M17.5 13h.01"/>`
};
function svg(p, s, glyph, maskId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` + `<mask id="${maskId}"><rect width="24" height="24" fill="white"/><circle cx="19.5" cy="19.5" r="6" fill="black"/></mask>` + `<g mask="url(#${maskId})" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[p]}</g>` + `<circle cx="19.5" cy="19.5" r="4" fill="${COLORS[s]}"/></svg>`;
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
  showOnProfiles: { type: "boolean", label: "On profiles", description: "Next to the badges on someone's profile.", default: true },
  showInChat: { type: "boolean", label: "In chat", description: "After the name on each message.", default: true },
  showInMemberList: { type: "boolean", label: "In the member list", description: "After each name in a server's member list.", default: true },
  showOwn: { type: "boolean", label: "Your own devices", description: "Show which of your own clients are online too.", default: true }
};
var context;
var stores = new Map;
var store = (name) => {
  let found = stores.get(name);
  if (found)
    return found;
  try {
    found = import_api.getStore(name);
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
var tooltip = (p, s) => `${STATUS_NAMES[s]} on ${NAMES[p]}`;
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
var diffSoon = () => void (diffTimer ??= setTimeout(diff, 0));
function useDevice(userId) {
  const sub = import_api.React.useCallback((cb) => subscribe(userId, cb), [userId]);
  return import_api.React.useSyncExternalStore(sub, () => lastKeys.get(userId) ?? deviceKey(userId));
}
function Icon({ platform, status }) {
  const id = `evi-platform-${import_api.React.useId().replace(/:/g, "")}`;
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: "evi-platform-icon",
    "aria-label": tooltip(platform, status),
    role: "img",
    dangerouslySetInnerHTML: { __html: svg(platform, status, "currentColor", id) }
  });
}
var memoized;
var indicators = () => memoized ??= import_api.React.memo(Indicators);
function Indicators({ userId, where }) {
  const key = useDevice(userId);
  if (!key || !context?.settings.get(where === "chat" ? "showInChat" : "showInMemberList"))
    return null;
  const [p, s] = key.split(":");
  const Tooltip = import_api.Components.Tooltip;
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
var platform_indicators_default = import_api.definePlugin({
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
    ctx.profileBadges((userId) => ctx.settings.get("showOnProfiles") ? devicesOf(userId).map(([p, s]) => ({ id: `platform-${p}`, name: `${STATUS_NAMES[s]} on ${NAMES[p]}`, description: tooltip(p, s), iconSrc: iconSrc(p, s) })) : []);
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
