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

// plugins/relationship-notifier/index.tsx
var exports_relationship_notifier = {};
__export(exports_relationship_notifier, {
  default: () => relationship_notifier_default
});
module.exports = __toCommonJS(exports_relationship_notifier);
var import_api = require("@evi/api");

// plugins/relationship-notifier/events.ts
var RelationshipType = { NONE: 0, FRIEND: 1, BLOCKED: 2, INCOMING: 3, OUTGOING: 4, IMPLICIT: 5 };
var GROUP_DM = 3;
function storeLookup(store) {
  const cache = new Map;
  const get = (name) => {
    if (!cache.has(name))
      cache.set(name, store(name));
    return cache.get(name);
  };
  return {
    get currentUserId() {
      return get("UserStore")?.getCurrentUser?.()?.id;
    },
    relationshipType: (id) => get("RelationshipStore")?.getRelationshipType?.(id),
    userName: (id) => {
      const nick = get("RelationshipStore")?.getNickname?.(id);
      if (nick)
        return nick;
      const user = get("UserStore")?.getUser?.(id);
      return user ? user.globalName ?? user.global_name ?? user.username : undefined;
    },
    channel: (id) => {
      const channel = get("ChannelStore")?.getChannel?.(id);
      return channel ? { type: channel.type, name: channel.name, recipients: channel.recipients } : undefined;
    },
    guildName: (id) => get("GuildStore")?.getGuild?.(id)?.name
  };
}
var SELF_WINDOW = 60000;
var DEDUPE_WINDOW = 1e4;
var ALL = "*";

class Tracker {
  self = new Map;
  reported = new Map;
  markSelf(scope, id, now = Date.now()) {
    this.prune(now);
    this.self.set(`${scope}:${id}`, now);
  }
  consumeSelf(scope, id, now = Date.now()) {
    this.prune(now);
    if (this.self.delete(`${scope}:${id}`))
      return true;
    return this.self.has(`${scope}:${ALL}`);
  }
  firstReport(scope, id, now = Date.now()) {
    this.prune(now);
    const key = `${scope}:${id}`;
    if (this.reported.has(key))
      return false;
    this.reported.set(key, now);
    return true;
  }
  prune(now) {
    for (const [key, at] of this.self)
      if (now - at > SELF_WINDOW)
        this.self.delete(key);
    for (const [key, at] of this.reported)
      if (now - at > DEDUPE_WINDOW)
        this.reported.delete(key);
  }
}
var fallbackUser = (id) => `User ${id}`;
function groupName(channel, lookup) {
  if (channel.name)
    return channel.name;
  const names = (channel.recipients ?? []).map((id) => lookup.userName(id)).filter((n) => !!n);
  return names.length ? names.join(", ") : "a group DM";
}
function groupRemoved(channelId, lookup, tracker, now) {
  const channel = lookup.channel(channelId);
  if (!channel || channel.type !== GROUP_DM)
    return null;
  if (tracker.consumeSelf("channel", channelId, now))
    return null;
  if (!tracker.firstReport("channel", channelId, now))
    return null;
  const name = groupName(channel, lookup);
  return { kind: "groupRemoved", id: channelId, name, at: now, text: `You were removed from ${name}` };
}
function decide(action, lookup, tracker, now = Date.now()) {
  switch (action?.type) {
    case "RELATIONSHIP_REMOVE": {
      const rel = action.relationship;
      const id = rel?.id ?? rel?.user?.id;
      if (!id)
        return null;
      const type = lookup.relationshipType(id) ?? rel?.type;
      if (type !== RelationshipType.FRIEND && type !== RelationshipType.OUTGOING)
        return null;
      if (tracker.consumeSelf("relationship", id, now))
        return null;
      const name = lookup.userName(id) ?? rel?.user?.global_name ?? rel?.user?.username ?? fallbackUser(id);
      return type === RelationshipType.FRIEND ? { kind: "friendRemoved", id, name, at: now, text: `${name} removed you as a friend` } : { kind: "requestCancelled", id, name, at: now, text: `Your friend request to ${name} was declined or cancelled` };
    }
    case "CHANNEL_DELETE": {
      const id = action.channel?.id;
      return id ? groupRemoved(id, lookup, tracker, now) : null;
    }
    case "CHANNEL_RECIPIENT_REMOVE": {
      const userId = action.user?.id;
      if (!action.channelId || !userId || !lookup.currentUserId || userId !== lookup.currentUserId)
        return null;
      return groupRemoved(action.channelId, lookup, tracker, now);
    }
    case "GUILD_DELETE": {
      const guild = action.guild;
      const id = guild?.id;
      if (!id || guild.unavailable)
        return null;
      const known = lookup.guildName(id);
      if (known === undefined)
        return null;
      if (tracker.consumeSelf("guild", id, now))
        return null;
      if (!tracker.firstReport("guild", id, now))
        return null;
      return { kind: "serverRemoved", id, name: known, at: now, text: `You were removed from ${known}` };
    }
  }
  return null;
}

class NotificationLog {
  limit;
  items = [];
  listeners = new Set;
  constructor(limit = 100) {
    this.limit = limit;
  }
  add(entry) {
    this.items = [entry, ...this.items].slice(0, Math.max(1, this.limit));
    this.changed();
  }
  get entries() {
    return this.items;
  }
  clear() {
    if (!this.items.length)
      return;
    this.items = [];
    this.changed();
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  changed() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}

// plugins/relationship-notifier/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  friendRemoved: { type: "boolean", label: "Friend removals", description: "Someone removes you from their friends.", default: true },
  requestCancelled: { type: "boolean", label: "Declined friend requests", description: "A friend request you sent is declined or cancelled.", default: true },
  groupRemoved: { type: "boolean", label: "Group DM removals", description: "Someone removes you from a group DM. Leaving yourself isn't reported.", default: true },
  serverRemoved: { type: "boolean", label: "Server removals", description: "You're kicked or banned from a server, or it's deleted. Leaving yourself isn't reported.", default: true },
  showToasts: { type: "boolean", label: "Show toasts", description: "Pop up a toast. When off, it's only logged here and in /relationships.", default: true }
};
var TYPES = new Set(["RELATIONSHIP_REMOVE", "CHANNEL_DELETE", "CHANNEL_RECIPIENT_REMOVE", "GUILD_DELETE"]);
var active;
function store(name) {
  try {
    return import_api.findStore(name);
  } catch {
    return;
  }
}
function markOwn(ctx, tracker, props, methods, scope) {
  ctx.waitFor(import_api.filters.byProps(...props), (module2) => {
    for (const method of methods) {
      if (typeof module2?.[method] !== "function")
        continue;
      ctx.hook.before(module2, method, ({ args }) => {
        const id = args[0];
        if (typeof id === "string")
          tracker.markSelf(scope, id);
      });
    }
  });
}
function formatTime(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function LogPanel({ log }) {
  const entries = import_api.React.useSyncExternalStore(log.subscribe, () => log.entries);
  const Button = import_api.Components.Button;
  const label = "Clear log";
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    children: [
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
                role: "status",
                children: entries.length ? `${entries.length} since Discord started. Kept in memory only.` : "Nothing yet. Kept in memory only."
              })
            ]
          }),
          Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
            color: Button.Colors?.RED,
            size: Button.Sizes?.SMALL,
            disabled: !entries.length,
            onClick: () => log.clear(),
            children: label
          }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "dl-button",
            disabled: !entries.length,
            onClick: () => log.clear(),
            children: label
          })
        ]
      }),
      entries.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: 0, padding: 0 },
        children: entries.map((entry, i) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
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
        }, `${entry.at}-${entry.id}-${i}`))
      })
    ]
  });
}
var relationship_notifier_default = import_api.definePlugin({
  settings,
  start(ctx) {
    const log = new NotificationLog;
    const tracker = new Tracker;
    const runtime = { log };
    active = runtime;
    ctx.onDispose(() => {
      if (active === runtime)
        active = undefined;
      log.clear();
    });
    markOwn(ctx, tracker, ["removeRelationship", "addRelationship"], ["removeRelationship", "removeFriend", "cancelFriendRequest", "blockUser"], "relationship");
    markOwn(ctx, tracker, ["leaveGuild"], ["leaveGuild", "deleteGuild"], "guild");
    markOwn(ctx, tracker, ["closePrivateChannel"], ["closePrivateChannel"], "channel");
    const report = (entry) => {
      if (!ctx.settings.get(entry.kind))
        return;
      log.add(entry);
      if (ctx.settings.get("showToasts"))
        ctx.toast(entry.text, { type: "info", duration: 6000 });
    };
    ctx.hook.before(import_api.Dispatcher, "dispatch", ({ args }) => {
      const action = args[0];
      if (!action || !TYPES.has(action.type))
        return;
      try {
        const entry = decide(action, storeLookup(store), tracker);
        if (entry)
          report(entry);
      } catch (e) {
        ctx.logger.error("Couldn't check", action.type, e);
      }
    });
    ctx.command({
      name: "relationships",
      description: "Friend, group DM and server removals since Discord started",
      execute() {
        const entries = log.entries;
        if (!entries.length)
          return { ephemeral: "Nothing yet: no removals since Discord started." };
        return { ephemeral: entries.slice(0, 20).map((e) => `${formatTime(e.at)}  ${e.text}`).join(`
`) };
      }
    });
  },
  settingsPanel: () => active && /* @__PURE__ */ jsx_runtime.jsx(LogPanel, {
    log: active.log
  }),
  getLog: () => active?.log
});
