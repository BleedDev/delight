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

// plugins/read-all/index.tsx
var exports_read_all = {};
__export(exports_read_all, {
  default: () => read_all_default
});
module.exports = __toCommonJS(exports_read_all);
var import_api = require("@evi/api");

// plugins/read-all/collect.ts
var CHANNEL_READ_STATE = 0;
var BULK_ACK_LIMIT = 100;
function guildIds(store) {
  const ids = store.getGuildIds?.();
  if (Array.isArray(ids))
    return ids;
  const guilds = store.getGuilds();
  if (Array.isArray(guilds))
    return guilds.map((g) => g?.id).filter((id) => typeof id === "string");
  return Object.keys(guilds ?? {});
}
function channelOf(value) {
  const channel = value?.channel ?? value;
  return typeof channel?.id === "string" ? channel : undefined;
}
function collectUnread(stores, options = {}) {
  const { ReadStateStore: rs } = stores;
  const seen = new Set;
  const out = [];
  const consider = (channel, guildId) => {
    if (!channel || seen.has(channel.id))
      return;
    seen.add(channel.id);
    if (!rs.hasUnread(channel.id) && !(rs.getMentionCount(channel.id) > 0))
      return;
    out.push({ guildId, channelId: channel.id, messageId: rs.lastMessageId(channel.id) ?? null, readStateType: CHANNEL_READ_STATE });
  };
  for (const guildId of guildIds(stores.GuildStore)) {
    const groups = stores.GuildChannelStore.getChannels(guildId) ?? {};
    for (const group of Object.values(groups)) {
      if (Array.isArray(group))
        group.forEach((item) => consider(channelOf(item), guildId));
    }
    const threads = stores.ActiveJoinedThreadsStore?.getActiveJoinedThreadsForGuild(guildId) ?? {};
    for (const byId of Object.values(threads)) {
      for (const thread of Object.values(byId ?? {}))
        consider(channelOf(thread), guildId);
    }
  }
  if (options.includeDms)
    stores.ChannelStore?.getSortedPrivateChannels?.()?.forEach((channel) => consider(channel, null));
  return out;
}
function chunk(items, size = BULK_ACK_LIMIT) {
  if (!(size >= 1))
    throw new RangeError("chunk size must be at least 1");
  const out = [];
  for (let i = 0;i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
var toAck = ({ channelId, messageId, readStateType }) => ({ channelId, messageId, readStateType });
var countGuilds = (entries) => new Set(entries.map((e) => e.guildId).filter((id) => id != null)).size;
function summary(count, guilds) {
  if (count === 0)
    return "Nothing to mark: everything is already read";
  const channels = `${count} channel${count === 1 ? "" : "s"}`;
  return guilds > 0 ? `Marked ${channels} in ${guilds} server${guilds === 1 ? "" : "s"} as read` : `Marked ${channels} as read`;
}

// plugins/read-all/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  includeDms: { type: "boolean", label: "Include DMs", description: "Also mark direct messages and group DMs as read.", default: false },
  showButton: { type: "boolean", label: "Server list button", description: "A button above your servers, shown while anything is unread.", default: true },
  contextMenu: { type: "boolean", label: "Server menu item", description: '"Mark All Servers as Read" when you right-click a server.', default: true }
};
var context;
function stores() {
  const GuildStore = import_api.findStore("GuildStore");
  const GuildChannelStore = import_api.findStore("GuildChannelStore");
  const ReadStateStore = import_api.findStore("ReadStateStore");
  if (!GuildStore || !GuildChannelStore || !ReadStateStore)
    return;
  return {
    GuildStore,
    GuildChannelStore,
    ReadStateStore,
    ActiveJoinedThreadsStore: import_api.findStore("ActiveJoinedThreadsStore"),
    ChannelStore: import_api.findStore("ChannelStore")
  };
}
async function readAll() {
  const s = stores();
  if (!s)
    return { message: "Couldn't find Discord's read state stores", ok: false };
  const unread = collectUnread(s, { includeDms: context?.settings.get("includeDms") ?? false });
  for (const batch of chunk(unread.map(toAck))) {
    await import_api.Dispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels: batch });
  }
  return { message: summary(unread.length, countGuilds(unread)), ok: true };
}
var busy = false;
async function readAllWithToast() {
  if (busy)
    return;
  busy = true;
  try {
    const { message, ok } = await readAll();
    context?.toast(message, { type: ok ? "success" : "failure" });
  } catch (err) {
    context?.logger.error("Marking all as read failed", err);
    context?.toast("Couldn't mark everything as read", { type: "failure" });
  } finally {
    busy = false;
  }
}
var unreadCount = 0;
var listeners = new Set;
var recountTimer;
function recount() {
  recountTimer = undefined;
  const s = stores();
  const next = s && context ? collectUnread(s, { includeDms: context.settings.get("includeDms") }).length : 0;
  if (next === unreadCount)
    return;
  unreadCount = next;
  listeners.forEach((l) => l());
}
var scheduleRecount = () => void (recountTimer ??= setTimeout(recount, 250));
function useUnreadCount() {
  return import_api.React.useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  }, () => unreadCount);
}
var CheckIcon = () => /* @__PURE__ */ jsx_runtime.jsx("svg", {
  width: "20",
  height: "20",
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": "true",
  children: /* @__PURE__ */ jsx_runtime.jsx("path", {
    d: "M2 12.5l4.5 4.5L15 8.5M11.5 16l1 1L22 7.5",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })
});
function ReadAllButton() {
  const { showButton } = context.settings.use();
  const count = useUnreadCount();
  if (!showButton || count === 0)
    return null;
  const label = `Mark ${count} ${count === 1 ? "channel" : "channels"} as read`;
  const button = /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "dl-read-all-button",
    onClick: readAllWithToast,
    "aria-label": label,
    children: /* @__PURE__ */ jsx_runtime.jsx(CheckIcon, {})
  });
  const Tooltip = import_api.Components.Tooltip;
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "dl-read-all",
    children: Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
      text: label,
      position: "right",
      children: button
    }) : import_api.React.cloneElement(button, { title: label })
  });
}
var read_all_default = import_api.definePlugin({
  settings,
  patches: [{
    find: '"guildsnav"',
    replace: {
      match: /(?<=lurkingGuildIds:\i\}\),\(0,\i\.jsx\)\(\i,\{\}\),)(?=\(0,\i\.jsx\)\(\i,\{guildDiscoveryButton:)/,
      with: "$self.renderButton(),"
    }
  }],
  renderButton() {
    if (!context)
      return null;
    return /* @__PURE__ */ jsx_runtime.jsx(ReadAllButton, {}, "evi-read-all");
  },
  readAll,
  css: `
        .dl-read-all { display: flex; justify-content: center; width: 100%; margin-bottom: 8px;
            animation: dl-read-all-in 0.2s ease-out; }
        .dl-read-all-button { display: flex; align-items: center; justify-content: center;
            width: var(--guildbar-avatar-size, 40px); height: var(--guildbar-avatar-size, 40px);
            padding: 0; border: 0; border-radius: 50%; cursor: pointer;
            color: var(--status-positive, #23a55a); background: var(--background-surface-high, var(--background-secondary));
            transition: border-radius 0.15s ease-out, background-color 0.15s ease-out, color 0.15s ease-out; }
        .dl-read-all-button:hover { border-radius: 30%; color: var(--white, #fff); background: var(--status-positive, #23a55a); }
        .dl-read-all-button:active { transform: translateY(1px); }
        .dl-read-all-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 2px; }
        @keyframes dl-read-all-in { from { opacity: 0; transform: scale(0.8); } }
        @media (prefers-reduced-motion: reduce) { .dl-read-all, .dl-read-all-button { animation: none; transition: none; } }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => {
      context = undefined;
      clearTimeout(recountTimer);
      recountTimer = undefined;
      unreadCount = 0;
      listeners.forEach((l) => l());
    });
    const watched = ["ReadStateStore", "GuildStore"].map((name) => import_api.findStore(name)).filter(Boolean);
    for (const store of watched)
      store.addChangeListener?.(scheduleRecount);
    ctx.onDispose(() => watched.forEach((store) => store.removeChangeListener?.(scheduleRecount)));
    ctx.settings.onChange(scheduleRecount);
    recount();
    ctx.command({
      name: "readall",
      description: "Mark every server as read",
      async execute() {
        const { message } = await readAll();
        return { ephemeral: message };
      }
    });
    ctx.contextMenu("guild-context", (children, props) => {
      if (!ctx.settings.get("contextMenu") || !props.guild?.id || unreadCount === 0)
        return;
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: "dl-read-all",
          label: "Mark All Servers as Read",
          action: readAllWithToast
        })
      }, "dl-read-all"));
    });
  }
});
