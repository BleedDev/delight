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

// plugins/friend-online-alerts/index.tsx
var exports_friend_online_alerts = {};
__export(exports_friend_online_alerts, {
  default: () => friend_online_alerts_default
});
module.exports = __toCommonJS(exports_friend_online_alerts);
var import_api = require("@evi/api");

// plugins/friend-online-alerts/alerts.ts
var DEFAULT_CONFIG = {
  online: true,
  offline: false,
  game: false,
  stream: false,
  flapMs: 5 * 60000,
  cooldownMs: 2 * 60000
};
var STARTUP_GRACE_MS = 15000;
var isOnlineStatus = (status) => status === "online" || status === "idle" || status === "dnd";
var ActivityType = { PLAYING: 0, STREAMING: 1 };
function snapshotOf(status, activities, goLive = false) {
  const online = isOnlineStatus(status);
  if (!online)
    return { online: false };
  const list = Array.isArray(activities) ? activities : [];
  const game = list.find((a) => a?.type === ActivityType.PLAYING && typeof a.name === "string" && a.name.trim())?.name?.trim();
  const streaming = goLive || list.some((a) => a?.type === ActivityType.STREAMING);
  return { online, game, streaming };
}

class AlertEngine {
  states = new Map;
  lastAlert = new Map;
  graceUntil = -Infinity;
  beginGrace(now, ms = STARTUP_GRACE_MS) {
    this.graceUntil = Math.max(this.graceUntil, now + ms);
  }
  inGrace(now) {
    return now < this.graceUntil;
  }
  get graceEnd() {
    return this.graceUntil;
  }
  seed(userId, snapshot, now) {
    this.observe(userId, snapshot, now, DEFAULT_CONFIG, true);
  }
  has(userId) {
    return this.states.has(userId);
  }
  forget(userId) {
    this.states.delete(userId);
    for (const key of [...this.lastAlert.keys()])
      if (key.startsWith(`${userId}:`))
        this.lastAlert.delete(key);
  }
  clear() {
    this.states.clear();
    this.lastAlert.clear();
  }
  observe(userId, next, now, config, silent = false) {
    const state = this.states.get(userId);
    const snapshot = next.online ? { online: true, game: next.game || undefined, streaming: !!next.streaming } : { online: false };
    if (!state) {
      this.states.set(userId, { snapshot });
      return [];
    }
    const prev = state.snapshot;
    state.snapshot = snapshot;
    const quiet = silent || this.inGrace(now);
    const alerts = [];
    if (!prev.online && snapshot.online) {
      const flapped = config.flapMs > 0 && state.offlineAt !== undefined && now - state.offlineAt < config.flapMs;
      state.silent = flapped;
      if (!quiet && !flapped && config.online)
        this.push(alerts, { kind: "online", userId, game: snapshot.game }, now, config);
      return alerts;
    }
    if (prev.online && !snapshot.online) {
      state.offlineAt = now;
      const wasSilent = state.silent;
      state.silent = false;
      if (!quiet && !wasSilent && config.offline)
        this.push(alerts, { kind: "offline", userId }, now, config);
      return alerts;
    }
    if (!snapshot.online || quiet)
      return alerts;
    if (config.game && snapshot.game && snapshot.game !== prev.game)
      this.push(alerts, { kind: "game", userId, game: snapshot.game }, now, config);
    if (config.stream && snapshot.streaming && !prev.streaming)
      this.push(alerts, { kind: "stream", userId, game: snapshot.game }, now, config);
    return alerts;
  }
  push(alerts, alert, now, config) {
    const key = `${alert.userId}:${alert.kind}`;
    const last = this.lastAlert.get(key);
    if (config.cooldownMs > 0 && last !== undefined && now - last < config.cooldownMs)
      return;
    this.lastAlert.set(key, now);
    alerts.push(alert);
  }
}
var shouldDeliver = (selfStatus, alertInDnd) => alertInDnd || selfStatus !== "dnd";
function isWatched(userId, watched, watchAllFriends, isFriend, selfId) {
  if (!userId || userId === selfId)
    return false;
  const has = Array.isArray(watched) ? watched.includes(userId) : watched.has(userId);
  return has || watchAllFriends && isFriend(userId);
}
function parseWatchList(value) {
  if (!Array.isArray(value))
    return [];
  const out = [];
  for (const id of value)
    if (typeof id === "string" && /^\d{15,25}$/.test(id) && !out.includes(id))
      out.push(id);
  return out;
}
function toggleWatch(list, userId) {
  return list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId];
}
function messageFor(alert, name) {
  const who = name.trim() || "Someone";
  let body;
  switch (alert.kind) {
    case "online":
      body = alert.game ? `is online, playing ${alert.game}` : "is online";
      break;
    case "offline":
      body = "went offline";
      break;
    case "game":
      body = `started playing ${alert.game ?? "a game"}`;
      break;
    case "stream":
      body = alert.game ? `started streaming ${alert.game}` : "started streaming";
      break;
  }
  return { title: who, body, text: `${who} ${body}` };
}

// plugins/friend-online-alerts/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var WATCH_KEY = "watched";
var LOG_SIZE = 30;
var SOUNDS = [
  { label: "No sound", value: "none" },
  { label: "Message", value: "message1" },
  { label: "Soft ping", value: "message2" },
  { label: "Chime", value: "message3" },
  { label: "Mention", value: "mention1" },
  { label: "User joined", value: "user_join" },
  { label: "Stream started", value: "stream_started" },
  { label: "Success", value: "success" }
];
var settings = {
  watchAllFriends: { type: "boolean", label: "Watch all friends", description: "Alert for every friend, not only the people you pick.", default: false },
  showToast: { type: "boolean", label: "In-app toast", description: "A toast at the top of Discord.", default: true },
  showDesktop: { type: "boolean", label: "Desktop notification", description: "A Windows notification, like Discord's own. Clicking it opens the DM.", default: true },
  sound: { type: "select", label: "Sound", description: "One of Discord's sounds.", default: "message2", options: SOUNDS },
  volume: { type: "number", label: "Sound volume", description: "Percent.", default: 40, min: 0, max: 100, step: 5 },
  alertInDnd: { type: "boolean", label: "Alert even in Do Not Disturb", description: "Otherwise nothing shows or plays while your status is Do Not Disturb.", default: false },
  onOffline: { type: "boolean", label: "When they go offline", default: false },
  onGame: { type: "boolean", label: "When they start playing a game", default: false },
  onStream: { type: "boolean", label: "When they start streaming", default: false },
  flapMinutes: {
    type: "number",
    label: "Ignore reconnects (minutes)",
    description: "Coming back online this soon after going offline isn't announced. 0 announces every time.",
    default: 5,
    min: 0,
    max: 60
  },
  cooldownMinutes: {
    type: "number",
    label: "Cooldown per person (minutes)",
    description: "At most one alert of each kind per person in this time. 0 turns it off.",
    default: 2,
    min: 0,
    max: 120
  }
};
var ctx;
var engine = new AlertEngine;
var log = [];
var listeners = new Set;
var version = 0;
var bump = () => {
  version++;
  listeners.forEach((l) => l());
};
var subscribe = (cb) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
var store = (name) => {
  try {
    return import_api.getStore(name);
  } catch {
    return;
  }
};
var selfId = () => store("UserStore")?.getCurrentUser?.()?.id;
var isFriend = (id) => !!store("RelationshipStore")?.isFriend?.(id);
function userName(id) {
  const nick = store("RelationshipStore")?.getNickname?.(id);
  if (nick)
    return nick;
  const user = store("UserStore")?.getUser?.(id);
  return user ? user.globalName ?? user.global_name ?? user.username ?? id : id;
}
function avatarUrl(id) {
  try {
    return store("UserStore")?.getUser?.(id)?.getAvatarURL?.(undefined, 128);
  } catch {
    return;
  }
}
function selfStatus() {
  return store("SelfPresenceStore")?.getStatus?.() ?? store("PresenceStore")?.getStatus?.(selfId());
}
function snapshot(id) {
  const presence = store("PresenceStore");
  let goLive = false;
  try {
    goLive = store("ApplicationStreamingStore")?.getAnyStreamForUser?.(id) != null;
  } catch {}
  return snapshotOf(presence?.getStatus?.(id), presence?.getActivities?.(id), goLive);
}
function presenceKnown(id) {
  const statuses = store("PresenceStore")?.getState?.()?.statuses;
  return isFriend(id) || statuses != null && id in statuses;
}
var notificationUtil = () => import_api.find(import_api.filters.byProps("showNotification", "playNotificationSound", "requestPermission"));
var privateChannelActions = () => import_api.find(import_api.filters.byProps("openPrivateChannel", "getOrEnsurePrivateChannel"));
function openDm(userId) {
  try {
    privateChannelActions()?.openPrivateChannel?.({ recipientIds: userId });
  } catch (e) {
    ctx?.logger.error("Couldn't open the DM", e);
  }
}
var storage = () => ctx?.settings;
var watchList = () => parseWatchList(storage()?.get(WATCH_KEY));
function setWatchList(list) {
  storage()?.set(WATCH_KEY, list);
  bump();
}
function watched(id, list = watchList()) {
  return !!ctx && isWatched(id, list, ctx.settings.get("watchAllFriends"), isFriend, selfId());
}
function toggle(id) {
  const list = watchList();
  const adding = !list.includes(id);
  setWatchList(toggleWatch(list, id));
  if (adding && presenceKnown(id))
    engine.seed(id, snapshot(id), Date.now());
  else if (!watched(id))
    engine.forget(id);
  ctx?.toast(adding ? `Online alerts on for ${userName(id)}` : `Online alerts off for ${userName(id)}`, { type: "success" });
}
function everyoneWatched() {
  if (!ctx)
    return [];
  const ids = new Set(watchList());
  if (ctx.settings.get("watchAllFriends")) {
    for (const id of store("RelationshipStore")?.getFriendIDs?.() ?? [])
      ids.add(id);
  }
  ids.delete(selfId() ?? "");
  return [...ids];
}
function seedAll() {
  const now = Date.now();
  for (const id of everyoneWatched()) {
    if (presenceKnown(id))
      engine.seed(id, snapshot(id), now);
  }
}
function config() {
  const s = ctx.settings;
  return {
    online: true,
    offline: s.get("onOffline"),
    game: s.get("onGame"),
    stream: s.get("onStream"),
    flapMs: Math.max(0, s.get("flapMinutes")) * 60000,
    cooldownMs: Math.max(0, s.get("cooldownMinutes")) * 60000
  };
}
function deliver(alert) {
  if (!ctx)
    return;
  const s = ctx.settings;
  const message = messageFor(alert, userName(alert.userId));
  log = [{ at: Date.now(), userId: alert.userId, text: message.text }, ...log].slice(0, LOG_SIZE);
  bump();
  if (!shouldDeliver(selfStatus(), s.get("alertInDnd")))
    return;
  if (s.get("showToast"))
    ctx.toast(message.text, { type: "info", duration: 5000 });
  const util = notificationUtil();
  if (s.get("showDesktop")) {
    try {
      Promise.resolve(util?.showNotification?.(avatarUrl(alert.userId), message.title, message.body, {}, {
        tag: `evi-foa-${alert.userId}-${alert.kind}`,
        isUserAvatar: true,
        omitViewTracking: true,
        omitClickTracking: true,
        onClick: () => openDm(alert.userId)
      })).catch((e) => ctx?.logger.error("Desktop notification failed", e));
    } catch (e) {
      ctx.logger.error("Desktop notification failed", e);
    }
  }
  const sound = s.get("sound");
  if (sound !== "none") {
    try {
      Promise.resolve(util?.playNotificationSound?.(sound, Math.min(1, Math.max(0, s.get("volume") / 100)))).catch(() => {});
    } catch (e) {
      ctx.logger.error("Sound failed", e);
    }
  }
}
var pending = new Set;
var flushTimer;
function flush() {
  flushTimer = undefined;
  if (!ctx)
    return pending.clear();
  const now = Date.now();
  const cfg = config();
  const list = new Set(watchList());
  for (const id of pending) {
    if (!watched(id, list))
      continue;
    for (const alert of engine.observe(id, snapshot(id), now, cfg))
      deliver(alert);
  }
  pending.clear();
}
function queue(id) {
  if (typeof id !== "string" || !ctx)
    return;
  pending.add(id);
  flushTimer ??= setTimeout(flush, 0);
}
var graceTimer;
function grace() {
  engine.beginGrace(Date.now(), STARTUP_GRACE_MS);
  clearTimeout(graceTimer);
  graceTimer = setTimeout(() => {
    graceTimer = undefined;
    if (ctx)
      seedAll();
  }, STARTUP_GRACE_MS + 100);
}
function useVersion() {
  import_api.React.useSyncExternalStore(subscribe, () => version);
}
function formatTime(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function SmallButton({ children, onClick, disabled, danger, label }) {
  const Button = import_api.Components.Button;
  return Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
    color: danger ? Button.Colors?.RED : Button.Colors?.PRIMARY,
    size: Button.Sizes?.SMALL,
    disabled,
    onClick,
    "aria-label": label,
    children
  }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "dl-button",
    disabled,
    onClick,
    "aria-label": label,
    children
  });
}
function WatchPanel() {
  useVersion();
  const [input, setInput] = import_api.React.useState("");
  const list = watchList();
  const all = ctx?.settings.get("watchAllFriends");
  const id = input.trim();
  const valid = /^\d{15,25}$/.test(id) && id !== selfId();
  const add = () => {
    if (!valid)
      return;
    if (!list.includes(id))
      toggle(id);
    setInput("");
  };
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: "Watched people"
          }),
          /* @__PURE__ */ jsx_runtime.jsx("p", {
            className: "dl-hint",
            role: "status",
            children: list.length ? `${list.length} ${list.length === 1 ? "person" : "people"}${all ? ", plus all your friends" : ""}.` : all ? "All your friends. Right-click anyone else and pick Online Alerts to add them." : "Nobody yet. Right-click someone and pick Online Alerts, or add a user ID here."
          })
        ]
      }),
      list.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: "0.5rem 0", padding: 0 },
        children: list.map((userId) => {
          const avatar = avatarUrl(userId);
          const name = userName(userId);
          return /* @__PURE__ */ jsx_runtime.jsxs("li", {
            style: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" },
            children: [
              avatar ? /* @__PURE__ */ jsx_runtime.jsx("img", {
                src: avatar,
                alt: "",
                width: 24,
                height: 24,
                style: { borderRadius: "50%", flexShrink: 0 }
              }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
                "aria-hidden": "true",
                style: { width: 24, height: 24, borderRadius: "50%", background: "var(--background-modifier-accent, #4e505880)", flexShrink: 0 }
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("span", {
                className: "dl-hint",
                style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 },
                children: [
                  name,
                  name === userId ? "" : ` (${userId})`
                ]
              }),
              /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
                danger: true,
                label: `Stop watching ${name}`,
                onClick: () => toggle(userId),
                children: "Remove"
              })
            ]
          }, userId);
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        style: { display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" },
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("input", {
            className: "dl-input",
            style: { flex: 1 },
            "aria-label": "User ID to watch",
            placeholder: "User ID",
            inputMode: "numeric",
            value: input,
            onChange: (e) => setInput(e.currentTarget.value),
            onKeyDown: (e) => {
              if (e.key === "Enter")
                add();
            }
          }),
          /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
            disabled: !valid || list.includes(id),
            onClick: add,
            children: "Add"
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-row",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "dl-field-text",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("div", {
                className: "dl-label",
                children: "Recent"
              }),
              /* @__PURE__ */ jsx_runtime.jsx("p", {
                className: "dl-hint",
                children: log.length ? "Since Discord started. Kept in memory only." : "No alerts yet. Kept in memory only."
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
            danger: true,
            disabled: !log.length,
            onClick: () => {
              log = [];
              bump();
            },
            children: "Clear"
          })
        ]
      }),
      log.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: 0, padding: 0 },
        children: log.map((entry, i) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
          className: "dl-hint",
          style: { padding: "0.125rem 0" },
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("time", {
              dateTime: new Date(entry.at).toISOString(),
              style: { fontVariantNumeric: "tabular-nums", marginInlineEnd: "0.5rem" },
              children: formatTime(entry.at)
            }),
            entry.text
          ]
        }, `${entry.at}-${entry.userId}-${i}`))
      })
    ]
  });
}
var friend_online_alerts_default = import_api.definePlugin({
  settings,
  flux: {
    PRESENCE_UPDATES(action) {
      for (const update of action?.updates ?? [])
        queue(update?.user?.id);
    },
    VOICE_STATE_UPDATES(action) {
      if (!ctx?.settings.get("onStream"))
        return;
      for (const state of action?.voiceStates ?? [])
        queue(state?.userId);
    },
    CONNECTION_OPEN() {
      if (ctx)
        grace();
    },
    CONNECTION_OPEN_SUPPLEMENTAL() {
      if (ctx)
        grace();
    },
    CONNECTION_RESUMED() {
      if (ctx)
        grace();
    }
  },
  start(context) {
    ctx = context;
    engine = new AlertEngine;
    log = [];
    grace();
    seedAll();
    context.settings.onChange(() => {
      const now = Date.now();
      for (const id of everyoneWatched())
        if (!engine.has(id) && presenceKnown(id))
          engine.seed(id, snapshot(id), now);
      bump();
    });
    context.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      if (!userId || userId === selfId())
        return;
      const explicit = watchList().includes(userId);
      const viaFriends = !explicit && !!ctx?.settings.get("watchAllFriends") && isFriend(userId);
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.CheckboxItem, {
          id: "evi-foa-toggle",
          label: "Online Alerts",
          subtext: viaFriends ? "On for all friends" : undefined,
          checked: explicit || viaFriends,
          disabled: viaFriends,
          action: () => toggle(userId)
        })
      }, "evi-foa-group"));
    });
  },
  stop() {
    clearTimeout(flushTimer);
    clearTimeout(graceTimer);
    flushTimer = graceTimer = undefined;
    pending.clear();
    engine.clear();
    log = [];
    ctx = undefined;
    bump();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime.jsx(WatchPanel, {})
});
