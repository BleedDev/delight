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

// plugins/last-seen/index.tsx
var exports_last_seen = {};
__export(exports_last_seen, {
  default: () => last_seen_default
});
module.exports = __toCommonJS(exports_last_seen);
var import_api = require("@evi/api");

// plugins/last-seen/track.ts
var DEFAULT_CAP = 5000;
var isOnlineStatus = (status) => status === "online" || status === "idle" || status === "dnd";
function touch(tracker, id) {
  const entry = tracker.get(id) ?? {};
  tracker.delete(id);
  tracker.set(id, entry);
  return entry;
}
function prune(tracker, cap = DEFAULT_CAP) {
  let removed = 0;
  for (const id of tracker.keys()) {
    if (tracker.size <= cap)
      break;
    tracker.delete(id);
    removed++;
  }
  return removed;
}
function observePresence(tracker, id, status, now, cap = DEFAULT_CAP) {
  if (isOnlineStatus(status)) {
    const entry2 = touch(tracker, id);
    entry2.online = true;
    entry2.seen = now;
    prune(tracker, cap);
    return true;
  }
  const entry = tracker.get(id);
  if (!entry?.online)
    return false;
  touch(tracker, id);
  entry.online = false;
  entry.seen = now;
  return true;
}
function observeMessage(tracker, id, at, cap = DEFAULT_CAP) {
  const entry = touch(tracker, id);
  entry.message = Math.max(entry.message ?? 0, at);
  prune(tracker, cap);
}
function serialize(tracker, now) {
  const rows = [];
  for (const [id, e] of tracker)
    rows.push([id, e.seen ?? 0, e.message ?? 0, e.online ? 1 : 0]);
  return { v: 1, savedAt: now, rows };
}
function deserialize(data, cap = DEFAULT_CAP) {
  const tracker = new Map;
  const saved = data;
  if (!saved || !Array.isArray(saved.rows))
    return tracker;
  const savedAt = typeof saved.savedAt === "number" ? saved.savedAt : 0;
  for (const row of saved.rows) {
    if (!Array.isArray(row) || typeof row[0] !== "string")
      continue;
    const [id, seen, message, online] = row;
    const entry = {};
    const s = typeof seen === "number" && seen > 0 ? seen : 0;
    const lastSeen = online ? Math.max(s, savedAt) : s;
    if (lastSeen)
      entry.seen = lastSeen;
    if (typeof message === "number" && message > 0)
      entry.message = message;
    if (entry.seen || entry.message)
      tracker.set(id, entry);
  }
  prune(tracker, cap);
  return tracker;
}
var UNITS = [
  [365 * 24 * 3600000, "y"],
  [30 * 24 * 3600000, "mo"],
  [7 * 24 * 3600000, "w"],
  [24 * 3600000, "d"],
  [3600000, "h"],
  [60000, "m"]
];
function formatRelative(then, now) {
  const diff = Math.max(0, now - then);
  for (const [ms, unit] of UNITS) {
    if (diff >= ms)
      return `${Math.floor(diff / ms)}${unit} ago`;
  }
  return "just now";
}
function describe(entry, onlineNow, now) {
  const parts = [];
  if (onlineNow)
    parts.push("Online now");
  else if (entry?.seen)
    parts.push(`Last seen ${formatRelative(entry.seen, now)}`);
  if (entry?.message)
    parts.push(`Last message ${formatRelative(entry.message, now)}`);
  return parts.length ? parts.join(" · ") : null;
}

// plugins/last-seen/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var profileBadgesFilter = import_api.filters.byCode("getBadges()??[]", "hidePersonalInformation");
var SAVE_EVERY = 30000;
var DB_NAME = "evi-last-seen";
var DB_STORE = "kv";
var DB_KEY = "data";
var settings = {
  showOnProfiles: { type: "boolean", label: "On profiles", description: "A clock next to the badges on someone's profile; hover it for the times.", default: true },
  showInMemberList: { type: "boolean", label: "In the member list", description: "Under the name of offline members.", default: true },
  ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't track bots and apps.", default: true }
};
var MUTED = "#949ba4";
var CLOCK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`)}`;
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
async function dbPut(value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      if (value === undefined)
        tx.objectStore(DB_STORE).delete(DB_KEY);
      else
        tx.objectStore(DB_STORE).put(value, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
var context;
var tracker = new Map;
var dirty = false;
var loaded = false;
var store = (name) => {
  try {
    return import_api.getStore(name);
  } catch {
    return;
  }
};
var ownId = () => store("UserStore")?.getCurrentUser?.()?.id;
var statusOf = (id) => store("PresenceStore")?.getStatus?.(id);
function ignored(id, bot) {
  if (!id || id === ownId())
    return true;
  if (!context?.settings.get("ignoreBots"))
    return false;
  return bot ?? !!store("UserStore")?.getUser?.(id)?.bot;
}
var version = 0;
var listeners = new Set;
var bumpTimer;
var bumpNow = () => {
  clearTimeout(bumpTimer);
  bumpTimer = undefined;
  version++;
  listeners.forEach((l) => l());
};
var bumpSoon = () => {
  bumpTimer ??= setTimeout(bumpNow, 5000);
};
function useVersion() {
  import_api.React.useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  }, () => version);
}
function changed() {
  dirty = true;
  bumpSoon();
}
async function save() {
  if (!dirty || !loaded)
    return;
  dirty = false;
  try {
    await dbPut(serialize(tracker, Date.now()));
  } catch (e) {
    dirty = true;
    context?.logger.error("Couldn't save", e);
  }
}
var pending = new Map;
var flushTimer;
function flushPresences() {
  flushTimer = undefined;
  const now = Date.now();
  let any = false;
  for (const [id, bot] of pending) {
    if (ignored(id, bot))
      continue;
    any = observePresence(tracker, id, statusOf(id), now) || any;
  }
  pending.clear();
  if (any)
    changed();
}
function seed() {
  const presence = store("PresenceStore");
  const statuses = presence?.getState?.()?.statuses;
  const now = Date.now();
  let any = false;
  if (statuses) {
    for (const id in statuses) {
      if (isOnlineStatus(statuses[id]) && !ignored(id))
        any = observePresence(tracker, id, statuses[id], now) || any;
    }
  }
  for (const [id, entry] of tracker) {
    if (entry.online && !isOnlineStatus(statusOf(id)))
      any = observePresence(tracker, id, "offline", now) || any;
  }
  if (any)
    changed();
}
function text(userId) {
  return describe(tracker.get(userId), isOnlineStatus(statusOf(userId)), Date.now());
}
function MemberLastSeen({ userId }) {
  useVersion();
  if (!context?.settings.get("showInMemberList"))
    return null;
  if (isOnlineStatus(statusOf(userId)))
    return null;
  const seen = tracker.get(userId)?.seen;
  if (!seen)
    return null;
  const full = text(userId) ?? "";
  const Tooltip = import_api.Components.Tooltip;
  const line = /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-last-seen-sub",
    children: [
      "Last seen ",
      formatRelative(seen, Date.now())
    ]
  });
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: full,
    children: line
  }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
    title: full,
    children: line
  });
}
function ClearPanel() {
  useVersion();
  const Button = import_api.Components.Button;
  const count = tracker.size;
  const clear = () => {
    tracker = new Map;
    dirty = false;
    dbPut(undefined).catch((e) => context?.logger.error("Couldn't clear", e));
    bumpNow();
    context?.toast("Last Seen data cleared");
  };
  const label = "Clear data";
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-field-row",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: "Remembered"
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("p", {
            className: "dl-hint",
            role: "status",
            style: { fontVariantNumeric: "tabular-nums" },
            children: [
              count,
              " ",
              count === 1 ? "person" : "people",
              ", up to ",
              DEFAULT_CAP,
              ". Kept on this device only."
            ]
          })
        ]
      }),
      Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
        color: Button.Colors?.RED,
        size: Button.Sizes?.SMALL,
        disabled: !count,
        onClick: clear,
        children: label
      }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        className: "dl-button",
        disabled: !count,
        onClick: clear,
        children: label
      })
    ]
  });
}
var css = `
.evi-last-seen-sub { color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
var last_seen_default = import_api.definePlugin({
  settings,
  patches: [
    {
      find: "hideSubtext:",
      replace: {
        match: /subText:(\(0,\i\.jsx\)\(\i,\{hideSubtext:\i,activities:\i,status:(\i),[^}]*?user:(\i)[^}]*\}\))/,
        with: "subText:$self.memberSubText($1,$3,$2)"
      }
    }
  ],
  memberSubText(original, user, status) {
    if (!context || !user?.id || isOnlineStatus(status) || ignored(user.id, user.bot))
      return original;
    return /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
      children: [
        original,
        /* @__PURE__ */ jsx_runtime.jsx(MemberLastSeen, {
          userId: user.id
        }, "evi-last-seen")
      ]
    });
  },
  flux: {
    PRESENCE_UPDATES(action) {
      if (!context)
        return;
      for (const u of action?.updates ?? []) {
        const id = u?.user?.id;
        if (typeof id === "string")
          pending.set(id, u.user.bot);
      }
      flushTimer ??= setTimeout(flushPresences, 0);
    },
    MESSAGE_CREATE(action) {
      if (!context || action?.optimistic)
        return;
      const message = action?.message;
      const author = message?.author;
      if (!author?.id || message.webhook_id || ignored(author.id, author.bot))
        return;
      const at = Date.parse(message.timestamp);
      observeMessage(tracker, author.id, Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now());
      changed();
    },
    CONNECTION_OPEN() {
      if (context)
        setTimeout(seed, 1000);
    }
  },
  start(ctx) {
    context = ctx;
    tracker = new Map;
    loaded = false;
    ctx.addStyle(css);
    dbGet().then((data) => {
      if (context !== ctx)
        return;
      const live = tracker;
      tracker = deserialize(data);
      for (const [id, entry] of live) {
        const old = tracker.get(id);
        tracker.delete(id);
        tracker.set(id, { ...old, ...entry, message: Math.max(old?.message ?? 0, entry.message ?? 0) || undefined });
      }
      loaded = true;
      seed();
      dirty = true;
      bumpNow();
    }).catch((e) => {
      ctx.logger.error("Couldn't load saved data", e);
      loaded = true;
      seed();
    });
    ctx.setInterval(() => void save(), SAVE_EVERY);
    ctx.setInterval(bumpNow, 60000);
    const onUnload = () => void save();
    window.addEventListener("beforeunload", onUnload);
    ctx.onDispose(() => window.removeEventListener("beforeunload", onUnload));
    ctx.settings.onChange(bumpNow);
    ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
      if (!ctx.settings.get("showOnProfiles"))
        return;
      const userId = args[0]?.userId;
      if (!userId || userId === ownId())
        return;
      const description = text(userId);
      if (!description)
        return;
      return [...Array.isArray(result) ? result : [], { id: "evi-last-seen", description, iconSrc: CLOCK }];
    });
  },
  stop() {
    save();
    clearTimeout(flushTimer);
    flushTimer = undefined;
    pending.clear();
    context = undefined;
    bumpNow();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime.jsx(ClearPanel, {})
});
