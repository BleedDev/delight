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
var import_api5 = require("@evi/api");

// plugins/last-seen/line.tsx
var import_api2 = require("@evi/api");

// plugins/last-seen/state.ts
var import_api = require("@evi/api");

// plugins/last-seen/track.ts
var DEFAULT_CAP = 25000;
var isOnlineStatus = (status) => status === "online" || status === "idle" || status === "dnd";
function touch(tracker, id) {
  const entry = tracker.get(id) ?? {};
  tracker.delete(id);
  tracker.set(id, entry);
  return entry;
}
var PRUNE_SLACK = 500;
function prune(tracker, cap = DEFAULT_CAP, keep, slack = 0) {
  if (tracker.size <= cap + slack)
    return 0;
  const excess = tracker.size - cap;
  let removed = 0;
  const skipped = [];
  for (const [id, entry] of tracker) {
    if (removed >= excess)
      break;
    if (keep?.(id)) {
      skipped.push([id, entry]);
      continue;
    }
    tracker.delete(id);
    removed++;
  }
  for (const [id, entry] of skipped) {
    tracker.delete(id);
    tracker.set(id, entry);
  }
  for (const id of tracker.keys()) {
    if (removed >= excess)
      break;
    tracker.delete(id);
    removed++;
  }
  return removed;
}
function isIgnored(id, bot, me, ignoreBots) {
  if (!id || id === me)
    return true;
  return ignoreBots && bot === true;
}
function observePresence(tracker, id, status, now, opts = {}) {
  if (isOnlineStatus(status)) {
    const entry2 = touch(tracker, id);
    entry2.online = true;
    entry2.seen = now;
    delete entry2.approx;
    prune(tracker, opts.cap, opts.keep, opts.slack);
    return true;
  }
  const entry = tracker.get(id);
  if (!entry?.online)
    return false;
  touch(tracker, id);
  entry.online = false;
  entry.seen = now;
  delete entry.approx;
  return true;
}
function observeActivity(tracker, id, at, opts = {}) {
  const old = tracker.get(id)?.active ?? 0;
  if (at <= old)
    return false;
  touch(tracker, id).active = at;
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return true;
}
function observeMessage(tracker, id, at, where = {}, opts = {}) {
  const old = tracker.get(id)?.message ?? 0;
  if (at <= old)
    return false;
  const entry = touch(tracker, id);
  entry.message = at;
  if (where.channelId)
    entry.channelId = where.channelId;
  else
    delete entry.channelId;
  if (where.messageId)
    entry.messageId = where.messageId;
  else
    delete entry.messageId;
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return true;
}
function serialize(tracker, now) {
  const rows = [];
  for (const [id, e] of tracker) {
    rows.push([id, e.seen ?? 0, e.message ?? 0, e.online ? 1 : 0, e.active ?? 0, e.channelId ?? "", e.messageId ?? "", e.approx ? 1 : 0]);
  }
  return { v: 2, savedAt: now, rows };
}
var num = (v) => typeof v === "number" && v > 0 ? v : 0;
var str = (v) => typeof v === "string" && v ? v : undefined;
function deserialize(data, opts = {}) {
  const tracker = new Map;
  const saved = data;
  if (!saved || !Array.isArray(saved.rows))
    return tracker;
  const savedAt = num(saved.savedAt);
  for (const row of saved.rows) {
    if (!Array.isArray(row) || typeof row[0] !== "string")
      continue;
    const [id, seen, message, online, active, channelId, messageId, approx] = row;
    const entry = {};
    const s = num(seen);
    if (online && savedAt > s) {
      entry.seen = savedAt;
      entry.approx = true;
    } else if (s) {
      entry.seen = s;
      if (approx)
        entry.approx = true;
    }
    if (num(active))
      entry.active = num(active);
    if (num(message)) {
      entry.message = num(message);
      if (str(channelId))
        entry.channelId = str(channelId);
      if (str(messageId))
        entry.messageId = str(messageId);
    }
    if (entry.seen || entry.message || entry.active)
      tracker.set(id, entry);
  }
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return tracker;
}
function merge(into, from) {
  const out = { ...into };
  if (from.seen && (!out.seen || from.seen >= out.seen || from.online)) {
    out.seen = from.seen;
    out.online = from.online;
    if (from.approx)
      out.approx = true;
    else
      delete out.approx;
  }
  if (from.active && from.active > (out.active ?? 0))
    out.active = from.active;
  if (from.message && from.message > (out.message ?? 0)) {
    out.message = from.message;
    out.channelId = from.channelId;
    out.messageId = from.messageId;
    if (!out.channelId)
      delete out.channelId;
    if (!out.messageId)
      delete out.messageId;
  }
  return out;
}
var UNITS = [
  [365 * 24 * 3600000, "y"],
  [30 * 24 * 3600000, "mo"],
  [7 * 24 * 3600000, "w"],
  [24 * 3600000, "d"],
  [3600000, "h"],
  [60000, "m"]
];
function formatSpan(then, now) {
  const diff = Math.max(0, now - then);
  for (const [ms, unit] of UNITS) {
    if (diff >= ms)
      return `${Math.floor(diff / ms)}${unit}`;
  }
  return null;
}
function formatRelative(then, now) {
  const span = formatSpan(then, now);
  return span ? `${span} ago` : "just now";
}
function seenText(entry, now) {
  if (!entry.seen)
    return null;
  if (!entry.approx)
    return `Last seen ${formatRelative(entry.seen, now)}`;
  const span = formatSpan(entry.seen, now);
  return span ? `Last seen in the last ${span}` : "Last seen just now";
}
function lineText(entry, now) {
  if (!entry)
    return null;
  if (entry.active && entry.active > (entry.seen ?? 0))
    return `Active ${formatRelative(entry.active, now)}`;
  return seenText(entry, now);
}
function describe(entry, onlineNow, now, where) {
  const parts = [];
  if (onlineNow)
    parts.push("Online now");
  else if (entry?.seen)
    parts.push(seenText(entry, now));
  if (!onlineNow && entry?.active && entry.active > (entry.seen ?? 0))
    parts.push(`Active ${formatRelative(entry.active, now)}`);
  if (entry?.message)
    parts.push(`Last message ${formatRelative(entry.message, now)}${where ? ` in ${where}` : ""}`);
  return parts.length ? parts.join(" · ") : null;
}

// plugins/last-seen/state.ts
var settings = {
  showOnProfiles: { type: "boolean", label: "On profiles", description: "A clock next to the badges on someone's profile; hover it for the times.", default: true },
  showInMemberList: { type: "boolean", label: "In the member list", description: "Under the name of offline members.", default: true },
  showInFriends: { type: "boolean", label: "In the friends list", description: "Under the name of offline friends.", default: true },
  showInDms: { type: "boolean", label: "In direct messages", description: "Under the name of offline people in the DM list.", default: true },
  ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't track bots and apps.", default: true }
};
var state = {
  context: undefined,
  tracker: new Map,
  dirty: false,
  loaded: false
};
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
var refreshOwnId = () => void (me = store("UserStore")?.getCurrentUser?.()?.id);
var statusOf = (id) => store("PresenceStore")?.getStatus?.(id);
var isOnline = (id) => isOnlineStatus(statusOf(id));
var isBot = (id) => store("UserStore")?.getUser?.(id)?.bot;
var ignored = (id, bot) => isIgnored(id, bot, ownId(), !!state.context?.settings.get("ignoreBots"));
var keepIds;
var friendsListed = false;
function keepSet() {
  if (keepIds)
    return keepIds;
  const next = new Set;
  friendsListed = false;
  try {
    const friends = store("RelationshipStore")?.getFriendIDs?.();
    if (Array.isArray(friends)) {
      friendsListed = true;
      for (const id of friends)
        next.add(id);
    }
    const channels = store("PrivateChannelStore")?.getPrivateChannelIds?.();
    const channelStore = store("ChannelStore");
    for (const channelId of channels ?? []) {
      const channel = channelStore?.getChannel?.(channelId);
      if (channel?.type === 1)
        for (const id of channel.recipients ?? [])
          next.add(id);
    }
  } catch {}
  keepIds = next;
  return next;
}
var invalidateKeep = () => void (keepIds = undefined);
var keep = (id) => keepSet().has(id) || !friendsListed && !!store("RelationshipStore")?.isFriend?.(id);
var opts = { cap: DEFAULT_CAP, keep, slack: PRUNE_SLACK };
function resetLookups() {
  me = undefined;
  keepIds = undefined;
}
function channelLabel(channelId) {
  if (!channelId)
    return;
  const channel = store("ChannelStore")?.getChannel?.(channelId);
  if (!channel)
    return;
  if (channel.type === 1)
    return "your DMs";
  if (channel.type === 3)
    return channel.name ? `the group ${channel.name}` : "a group DM";
  return channel.name ? `#${channel.name}` : undefined;
}
var entryOf = (id) => state.tracker.get(id);
function fullText(id) {
  const entry = entryOf(id);
  return describe(entry, isOnline(id), Date.now(), channelLabel(entry?.channelId));
}
var userListeners = new Map;
var panelListeners = new Set;
var epoch = 0;
var userVersions = new Map;
var version = 0;
var pendingIds = new Set;
var pendingAll = false;
var bumpTimer;
var clock = Date.now();
var call = (listeners) => {
  for (const l of [...listeners])
    l();
};
function notify(ids) {
  clock = Date.now();
  version++;
  if (ids) {
    for (const id of ids) {
      userVersions.set(id, (userVersions.get(id) ?? 0) + 1);
      const listeners = userListeners.get(id);
      if (listeners)
        call(listeners);
    }
  } else {
    epoch++;
    userVersions.clear();
    for (const listeners of userListeners.values())
      call(listeners);
  }
  call(panelListeners);
}
function bumpNow() {
  clearTimeout(bumpTimer);
  bumpTimer = undefined;
  pendingIds.clear();
  pendingAll = false;
  notify();
}
var tick = () => notify();
function flushChanges() {
  bumpTimer = undefined;
  if (pendingAll)
    return bumpNow();
  const ids = [...pendingIds];
  pendingIds.clear();
  notify(ids);
}
function changed(id) {
  state.dirty = true;
  if (id === undefined)
    pendingAll = true;
  else
    pendingIds.add(id);
  bumpTimer ??= setTimeout(flushChanges, 5000);
}
var versionOf = (id) => `${epoch}:${userVersions.get(id) ?? 0}`;
function useVersion() {
  return import_api.React.useSyncExternalStore((cb) => {
    panelListeners.add(cb);
    return () => void panelListeners.delete(cb);
  }, () => version);
}
function subscribeUser(id, cb) {
  let listeners = userListeners.get(id);
  if (!listeners)
    userListeners.set(id, listeners = new Set);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (!listeners.size && userListeners.get(id) === listeners)
      userListeners.delete(id);
  };
}
function useUser(userId, read) {
  const subscribe = import_api.React.useCallback((cb) => subscribeUser(userId, cb), [userId]);
  return import_api.React.useSyncExternalStore(subscribe, read);
}
function lineOf(userId, setting) {
  if (!state.context?.settings.get(setting) || isOnline(userId))
    return "";
  return lineText(entryOf(userId), clock) ?? "";
}
var DB_NAME = "evi-last-seen";
var DB_STORE = "kv";
var DB_KEY = "data";
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
async function save() {
  if (!state.dirty || !state.loaded)
    return;
  state.dirty = false;
  try {
    await dbPut(serialize(state.tracker, Date.now()));
  } catch (e) {
    state.dirty = true;
    state.context?.logger.error("Couldn't save", e);
  }
}
function replaceAll(tracker) {
  state.tracker = tracker;
  state.dirty = true;
  state.loaded = true;
  bumpNow();
  return save();
}

// plugins/last-seen/line.tsx
var jsx_runtime = require("react/jsx-runtime");
var lineCss = `
.evi-last-seen-sub { display: block; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-last-seen-sub > span { display: block; overflow: hidden; text-overflow: ellipsis; }
`;
var memoized;
var lastSeenLine = () => memoized ??= import_api2.React.memo(LastSeenLine);
function LastSeenLine({ userId, setting, className }) {
  const text = useUser(userId, () => lineOf(userId, setting));
  const [hovered, setHovered] = import_api2.React.useState(false);
  if (!text)
    return null;
  const Tooltip = import_api2.Components.Tooltip;
  const full = hovered || !Tooltip ? fullText(userId) ?? text : text;
  const line = /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: className ? `evi-last-seen-sub ${className}` : "evi-last-seen-sub",
    children: /* @__PURE__ */ jsx_runtime.jsx("span", {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      children: text
    })
  });
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: full,
    children: line
  }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
    title: full,
    children: line
  });
}

// plugins/last-seen/dms.tsx
var jsx_runtime2 = require("react/jsx-runtime");
var dmPatches = [
  {
    find: "PrivateChannel.renderAvatar: Invalid prop",
    replace: {
      match: /(subText:(\i)\.isSystemDM\(\)\?.{0,600}?:\(0,\i\.\i\)\(\{activities:\i,status:(\i),applicationStream:\i,voiceChannel:\i\}\)\?.{0,300}?):null,name:/,
      with: "$1:$self?.dmSubText?.($2,$3)??null,name:"
    }
  }
];
var dmMethods = {
  dmSubText(channel, status) {
    try {
      if (!state.context?.settings.get("showInDms") || isOnlineStatus(status))
        return null;
      const id = channel?.getRecipientId?.();
      if (!id || !lineText(entryOf(id), Date.now()) || ignored(id, isBot(id)))
        return null;
      const Line = lastSeenLine();
      return /* @__PURE__ */ jsx_runtime2.jsx(Line, {
        userId: id,
        setting: "showInDms"
      });
    } catch (e) {
      state.context?.logger.error("DM subtext failed", e);
      return null;
    }
  }
};

// plugins/last-seen/friends.tsx
var import_api3 = require("@evi/api");
var jsx_runtime3 = require("react/jsx-runtime");
var friendsPatches = [
  {
    find: "peopleListItemRef",
    replace: {
      match: /subText:(\(0,\i\.jsx\)\(\i,\{hovered:\i,activities:\i,applicationStream:\i,status:(\i),user:(\i),userIgnored:[^}]*\}\))/,
      with: "subText:$self?.friendSubText?.($1,$3,$2)??$1"
    }
  }
];
function FriendSubText({ original, userId }) {
  const show = useUser(userId, () => !!lineOf(userId, "showInFriends"));
  const Line = lastSeenLine();
  return show ? /* @__PURE__ */ jsx_runtime3.jsx(Line, {
    userId,
    setting: "showInFriends"
  }) : /* @__PURE__ */ jsx_runtime3.jsx(jsx_runtime3.Fragment, {
    children: original
  });
}
var memoized2;
var friendsMethods = {
  friendSubText(original, user, status) {
    try {
      if (!state.context || !user?.id || isOnlineStatus(status) || original?.props?.userIgnored || ignored(user.id, user.bot))
        return original;
      const SubText = memoized2 ??= import_api3.React.memo(FriendSubText);
      return /* @__PURE__ */ jsx_runtime3.jsx(SubText, {
        original,
        userId: user.id
      });
    } catch (e) {
      state.context?.logger.error("Friends list line failed", e);
      return original;
    }
  }
};

// plugins/last-seen/panel.tsx
var import_api4 = require("@evi/api");
var jsx_runtime4 = require("react/jsx-runtime");
var SHOWN = 100;
var UNDO_FOR = 1e4;
var css = `
.evi-ls-panel { display: flex; flex-direction: column; gap: 16px; }
.evi-ls-row { display: flex; align-items: center; gap: 12px; }
.evi-ls-row > .dl-field-text { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 4px; }
.evi-ls-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.evi-ls-meter { block-size: 4px; margin-block-start: 4px; border-radius: 999px; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); overflow: hidden; }
.evi-ls-meter > span { display: block; block-size: 100%; border-radius: inherit; background: var(--dl-text-muted, #949ba4); }
.evi-ls-meter[data-full] > span { background: var(--dl-text-warning, #f0b232); }
.evi-ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.evi-ls-person { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: var(--dl-radius-control, 8px); }
@media (hover: hover) { .evi-ls-person:hover { background: var(--dl-bg-hover, rgb(151 151 159 / 0.12)); } }
.evi-ls-avatar { flex: none; inline-size: 32px; block-size: 32px; border-radius: 50%; object-fit: cover; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); display: grid; place-items: center; color: var(--dl-text-subtle, #b5bac1); font-size: 14px; font-weight: 600; }
.evi-ls-text { min-inline-size: 0; display: flex; flex-direction: column; }
.evi-ls-name { color: var(--dl-text-strong, #f2f3f5); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-times { color: var(--dl-text-muted, #949ba4); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-id { font-family: var(--dl-font-code, ui-monospace, Consolas, monospace); }
`;
function SmallButton({ children, onClick, disabled, danger, label }) {
  const Button = import_api4.Components.Button;
  return Button ? /* @__PURE__ */ jsx_runtime4.jsx(Button, {
    color: danger ? Button.Colors?.RED : Button.Colors?.PRIMARY,
    size: Button.Sizes?.SMALL,
    disabled,
    onClick,
    "aria-label": label,
    children
  }) : /* @__PURE__ */ jsx_runtime4.jsx("button", {
    type: "button",
    className: "dl-button",
    "data-variant": danger ? "danger" : undefined,
    disabled,
    onClick,
    "aria-label": label,
    children
  });
}
var people = (n) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"}`;
var latest = (e) => Math.max(e.seen ?? 0, e.active ?? 0, e.message ?? 0);
function nameOf(id) {
  const user = store("UserStore")?.getUser?.(id);
  const nick = store("RelationshipStore")?.getNickname?.(id);
  const name = nick || user?.globalName || user?.global_name || user?.username;
  const search = [nick, user?.globalName ?? user?.global_name, user?.username, id].filter(Boolean).join(" ").toLowerCase();
  return { name: name ?? id, known: !!name, search, user };
}
function download(data) {
  const date = new Date;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `evi-last-seen-${day}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Remembered() {
  useVersion();
  const count = state.tracker.size;
  const [confirming, setConfirming] = import_api4.React.useState(false);
  const [undo, setUndo] = import_api4.React.useState();
  const fileRef = import_api4.React.useRef(null);
  import_api4.React.useEffect(() => {
    if (!undo)
      return;
    const timer = setTimeout(() => setUndo(undefined), UNDO_FOR);
    return () => clearTimeout(timer);
  }, [undo]);
  const clear = () => {
    setConfirming(false);
    setUndo({ tracker: state.tracker, count });
    replaceAll(new Map);
  };
  const restore = () => {
    if (!undo)
      return;
    const tracker = new Map(undo.tracker);
    for (const [id, entry] of state.tracker) {
      const old = tracker.get(id);
      tracker.delete(id);
      tracker.set(id, merge(old, entry));
    }
    setUndo(undefined);
    replaceAll(tracker);
    state.context?.toast(`Restored ${people(tracker.size)}`, { type: "success" });
  };
  const importFile = async (file) => {
    try {
      const imported = deserialize(JSON.parse(await file.text()), opts);
      if (!imported.size) {
        state.context?.toast("Nothing to import in that file", { type: "failure" });
        return;
      }
      const tracker = new Map(state.tracker);
      for (const [id, entry] of imported) {
        const current = tracker.get(id);
        tracker.delete(id);
        tracker.set(id, current ? merge(entry, current) : entry);
      }
      await replaceAll(tracker);
      state.context?.toast(`Imported ${people(imported.size)}`, { type: "success" });
    } catch (e) {
      state.context?.logger.error("Couldn't import", e);
      state.context?.toast("That file isn't a Last Seen export", { type: "failure" });
    }
  };
  const ratio = Math.min(1, count / DEFAULT_CAP);
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "evi-ls-row",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime4.jsx("div", {
            className: "dl-label",
            children: "Remembered"
          }),
          /* @__PURE__ */ jsx_runtime4.jsx("p", {
            className: "dl-hint",
            role: "status",
            style: { fontVariantNumeric: "tabular-nums" },
            children: undo ? `Cleared ${people(undo.count)}.` : `${people(count)} of ${DEFAULT_CAP.toLocaleString()}. Kept on this device only; friends and DMs are kept longest.`
          }),
          !undo && /* @__PURE__ */ jsx_runtime4.jsx("div", {
            className: "evi-ls-meter",
            "data-full": ratio >= 0.9 || undefined,
            role: "meter",
            "aria-label": "Space used",
            "aria-valuemin": 0,
            "aria-valuemax": DEFAULT_CAP,
            "aria-valuenow": count,
            children: /* @__PURE__ */ jsx_runtime4.jsx("span", {
              style: { inlineSize: `${ratio * 100}%` }
            })
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime4.jsxs("div", {
        className: "evi-ls-actions",
        children: [
          undo ? /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
            onClick: restore,
            children: "Undo"
          }) : confirming ? /* @__PURE__ */ jsx_runtime4.jsxs(jsx_runtime4.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                onClick: () => setConfirming(false),
                children: "Cancel"
              }),
              /* @__PURE__ */ jsx_runtime4.jsxs(SmallButton, {
                danger: true,
                onClick: clear,
                children: [
                  "Clear ",
                  people(count),
                  "?"
                ]
              })
            ]
          }) : /* @__PURE__ */ jsx_runtime4.jsxs(jsx_runtime4.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                disabled: !count,
                onClick: () => download(serialize(state.tracker, Date.now())),
                children: "Export"
              }),
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                onClick: () => fileRef.current?.click(),
                children: "Import"
              }),
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                danger: true,
                disabled: !count,
                onClick: () => setConfirming(true),
                children: "Clear data"
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime4.jsx("input", {
            ref: fileRef,
            type: "file",
            accept: "application/json,.json",
            hidden: true,
            onChange: (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file)
                importFile(file);
            }
          })
        ]
      })
    ]
  });
}
function Avatar({ user, name }) {
  const [broken, setBroken] = import_api4.React.useState(false);
  let src;
  try {
    src = user?.getAvatarURL?.(undefined, 32);
  } catch {}
  if (!src || broken)
    return /* @__PURE__ */ jsx_runtime4.jsx("span", {
      className: "evi-ls-avatar",
      "aria-hidden": "true",
      children: name.slice(0, 1).toUpperCase()
    });
  return /* @__PURE__ */ jsx_runtime4.jsx("img", {
    className: "evi-ls-avatar",
    src,
    alt: "",
    width: 32,
    height: 32,
    onError: () => setBroken(true)
  });
}
function People() {
  const [query, setQuery] = import_api4.React.useState("");
  const q = query.trim().toLowerCase();
  const version2 = useVersion();
  const sorted = import_api4.React.useMemo(() => [...state.tracker].sort((a, b) => latest(b[1]) - latest(a[1])).map(([id]) => id), [version2, state.tracker]);
  const matches = [];
  let total = 0;
  for (const id of sorted) {
    if (!q) {
      if (matches.length < SHOWN)
        matches.push({ id, name: nameOf(id) });
      continue;
    }
    const name = nameOf(id);
    if (!name.search.includes(q))
      continue;
    total++;
    if (matches.length < SHOWN)
      matches.push({ id, name });
  }
  if (!q)
    total = sorted.length;
  const TextField = import_api4.Components.TextField;
  const label = "Search remembered people";
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "dl-field",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsx("div", {
        className: "dl-label",
        children: "People"
      }),
      TextField ? /* @__PURE__ */ jsx_runtime4.jsx(TextField, {
        value: query,
        onChange: (v) => setQuery(v),
        placeholder: "Search by name or ID",
        "aria-label": label
      }) : /* @__PURE__ */ jsx_runtime4.jsx("input", {
        className: "dl-input",
        type: "search",
        autoComplete: "off",
        spellCheck: false,
        placeholder: "Search by name or ID",
        "aria-label": label,
        value: query,
        onChange: (e) => setQuery(e.currentTarget.value)
      }),
      matches.length ? /* @__PURE__ */ jsx_runtime4.jsx("ul", {
        className: "evi-ls-list",
        children: matches.map(({ id, name }) => /* @__PURE__ */ jsx_runtime4.jsxs("li", {
          className: "evi-ls-person",
          children: [
            /* @__PURE__ */ jsx_runtime4.jsx(Avatar, {
              user: name.user,
              name: name.name
            }),
            /* @__PURE__ */ jsx_runtime4.jsxs("span", {
              className: "evi-ls-text",
              children: [
                /* @__PURE__ */ jsx_runtime4.jsx("span", {
                  className: name.known ? "evi-ls-name" : "evi-ls-name evi-ls-id",
                  children: name.name
                }),
                /* @__PURE__ */ jsx_runtime4.jsx("span", {
                  className: "evi-ls-times",
                  children: fullText(id) ?? "Nothing recent"
                })
              ]
            })
          ]
        }, id))
      }) : /* @__PURE__ */ jsx_runtime4.jsx("p", {
        className: "dl-hint",
        children: state.tracker.size ? "No one matches that." : "No one yet. People show up here as Discord tells your client about them."
      }),
      total > matches.length && /* @__PURE__ */ jsx_runtime4.jsxs("p", {
        className: "dl-hint",
        style: { fontVariantNumeric: "tabular-nums" },
        children: [
          "Showing ",
          matches.length.toLocaleString(),
          " of ",
          total.toLocaleString(),
          ". Search to find someone else."
        ]
      })
    ]
  });
}
function SettingsPanel() {
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "evi-ls-panel",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsx("style", {
        children: css
      }),
      /* @__PURE__ */ jsx_runtime4.jsx(Remembered, {}),
      /* @__PURE__ */ jsx_runtime4.jsx(People, {})
    ]
  });
}

// plugins/last-seen/index.tsx
var jsx_runtime5 = require("react/jsx-runtime");
var SAVE_EVERY = 30000;
var MUTED = "#949ba4";
var CLOCK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`)}`;
var pendingPresences = new Map;
var pendingPages = [];
var cancelFlush;
var IDLE_TIMEOUT = 1000;
function whenIdle(fn) {
  if (typeof requestIdleCallback === "function") {
    const handle2 = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT });
    return () => cancelIdleCallback(handle2);
  }
  const handle = setTimeout(fn, 50);
  return () => clearTimeout(handle);
}
var scheduleFlush = () => void (cancelFlush ??= whenIdle(flush));
function flush(deadline) {
  cancelFlush = undefined;
  if (!state.context)
    return;
  const now = Date.now();
  for (const [id, bot] of pendingPresences) {
    if (!ignored(id, bot) && observePresence(state.tracker, id, statusOf(id), now, opts))
      changed(id);
  }
  pendingPresences.clear();
  while (pendingPages.length) {
    const page = pendingPages.shift();
    for (const msg of page.messages) {
      const id = message(msg, page.channelId);
      if (id)
        changed(id);
    }
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 1)
      break;
  }
  if (pendingPages.length)
    scheduleFlush();
}
function seed() {
  const statuses = store("PresenceStore")?.getState?.()?.statuses;
  const now = Date.now();
  let any = false;
  if (statuses) {
    for (const id in statuses) {
      if (isOnlineStatus(statuses[id]) && !ignored(id, isBot(id)))
        any = observePresence(state.tracker, id, statuses[id], now, opts) || any;
    }
  }
  for (const [id, entry] of state.tracker) {
    if (entry.online && !isOnline(id))
      any = observePresence(state.tracker, id, "offline", now, opts) || any;
  }
  if (any)
    changed();
}
function timeOf(timestamp) {
  const at = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now();
}
function message(msg, channelId) {
  const author = msg?.author;
  if (!author?.id || msg.webhook_id || ignored(author.id, author.bot))
    return;
  if (observeMessage(state.tracker, author.id, timeOf(msg.timestamp), { channelId: msg.channel_id ?? channelId, messageId: msg.id }, opts))
    return author.id;
}
function activity(id, at = Date.now()) {
  if (typeof id !== "string" || ignored(id))
    return;
  if (observeActivity(state.tracker, id, at, opts))
    changed(id);
}
function messageLink(userId) {
  const entry = state.tracker.get(userId);
  if (!entry?.channelId || !entry.messageId)
    return;
  const channel = store("ChannelStore")?.getChannel?.(entry.channelId);
  if (!channel)
    return;
  return `https://discord.com/channels/${channel.guild_id ?? "@me"}/${entry.channelId}/${entry.messageId}`;
}
var css2 = lineCss;
var last_seen_default = import_api5.definePlugin({
  settings,
  patches: [
    {
      find: "hideSubtext:",
      replace: {
        match: /subText:(\(0,\i\.jsx\)\(\i,\{hideSubtext:\i,activities:\i,status:(\i),[^}]*?user:(\i)[^}]*\}\))/,
        with: "subText:$self.memberSubText($1,$3,$2)"
      }
    },
    ...friendsPatches,
    ...dmPatches
  ],
  memberSubText(original, user, status) {
    if (!state.context || !user?.id || isOnlineStatus(status) || ignored(user.id, user.bot))
      return original;
    const Line = lastSeenLine();
    return /* @__PURE__ */ jsx_runtime5.jsxs(jsx_runtime5.Fragment, {
      children: [
        original,
        /* @__PURE__ */ jsx_runtime5.jsx(Line, {
          userId: user.id,
          setting: "showInMemberList"
        }, "evi-last-seen")
      ]
    });
  },
  ...friendsMethods,
  ...dmMethods,
  flux: {
    PRESENCE_UPDATES(action) {
      if (!state.context)
        return;
      for (const u of action?.updates ?? []) {
        const id = u?.user?.id;
        if (typeof id === "string")
          pendingPresences.set(id, u.user.bot);
      }
      scheduleFlush();
    },
    MESSAGE_CREATE(action) {
      if (!state.context || action?.optimistic)
        return;
      const id = message(action?.message, action?.channelId);
      if (id)
        changed(id);
    },
    LOAD_MESSAGES_SUCCESS(action) {
      if (!state.context || !Array.isArray(action?.messages) || !action.messages.length)
        return;
      pendingPages.push({ messages: action.messages, channelId: action.channelId });
      scheduleFlush();
    },
    TYPING_START(action) {
      if (state.context)
        activity(action?.userId);
    },
    MESSAGE_REACTION_ADD(action) {
      if (state.context && !action?.optimistic)
        activity(action?.userId);
    },
    VOICE_STATE_UPDATES(action) {
      if (!state.context)
        return;
      for (const vs of action?.voiceStates ?? [])
        activity(vs?.userId);
    },
    CONNECTION_OPEN() {
      if (!state.context)
        return;
      refreshOwnId();
      invalidateKeep();
      setTimeout(seed, 1000);
    },
    RELATIONSHIP_ADD: invalidateKeep,
    RELATIONSHIP_REMOVE: invalidateKeep,
    RELATIONSHIP_UPDATE: invalidateKeep,
    CHANNEL_CREATE: invalidateKeep,
    CHANNEL_DELETE: invalidateKeep
  },
  start(ctx) {
    state.context = ctx;
    state.tracker = new Map;
    state.loaded = false;
    ctx.addStyle(css2);
    dbGet().then((data) => {
      if (state.context !== ctx)
        return;
      const live = state.tracker;
      const tracker = deserialize(data, opts);
      for (const [id, entry] of live) {
        const old = tracker.get(id);
        tracker.delete(id);
        tracker.set(id, merge(old, entry));
      }
      state.tracker = tracker;
      state.loaded = true;
      seed();
      state.dirty = true;
      bumpNow();
    }).catch((e) => {
      ctx.logger.error("Couldn't load saved data", e);
      state.loaded = true;
      seed();
    });
    ctx.setInterval(() => void save(), SAVE_EVERY);
    ctx.setInterval(tick, 60000);
    const onUnload = () => void save();
    window.addEventListener("beforeunload", onUnload);
    ctx.onDispose(() => window.removeEventListener("beforeunload", onUnload));
    ctx.settings.onChange(bumpNow);
    const badges = new Map;
    ctx.profileBadges((userId) => {
      if (!ctx.settings.get("showOnProfiles") || ignored(userId, isBot(userId)))
        return;
      const key = `${versionOf(userId)}:${statusOf(userId)}`;
      const cached = badges.get(userId);
      if (cached?.key === key)
        return cached.badges;
      const description = fullText(userId);
      const result = description ? [{ id: "last-seen", description, iconSrc: CLOCK, link: messageLink(userId) }] : undefined;
      if (badges.size >= 500)
        badges.clear();
      badges.set(userId, { key, badges: result });
      return result;
    });
  },
  stop() {
    save();
    cancelFlush?.();
    cancelFlush = undefined;
    pendingPresences.clear();
    pendingPages = [];
    state.context = undefined;
    resetLookups();
    bumpNow();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime5.jsx(SettingsPanel, {})
});
