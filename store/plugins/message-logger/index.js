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

// plugins/message-logger/index.tsx
var exports_message_logger = {};
__export(exports_message_logger, {
  default: () => message_logger_default
});
module.exports = __toCommonJS(exports_message_logger);
var import_api = require("@evi/api");

// plugins/message-logger/log.ts
var DEFAULT_LIMITS = { perChannel: 50, channels: 100, edits: 10 };
var EPHEMERAL = 1 << 6;
function shouldLog(message, filters) {
  if ((message.flags ?? 0) & EPHEMERAL)
    return false;
  if (message.state === "SENDING" || message.state === "SEND_FAILED")
    return false;
  if (filters.ignoreSelf && !!filters.currentUserId && message.author?.id === filters.currentUserId)
    return false;
  if (filters.ignoreBots && message.author?.bot)
    return false;
  return true;
}

class MessageLog {
  channels = new Map;
  listeners = new Set;
  limits;
  version = 0;
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }
  get(channelId, id) {
    return this.channels.get(channelId)?.get(id);
  }
  isDeleted(channelId, id) {
    return this.get(channelId, id)?.deletedAt !== undefined;
  }
  markDeleted(channelId, id, at = Date.now()) {
    const previous = this.get(channelId, id);
    if (previous?.deletedAt !== undefined)
      return [];
    return this.put({ channelId, id, edits: previous?.edits ?? [], deletedAt: at });
  }
  addEdit(channelId, id, version) {
    const previous = this.get(channelId, id);
    const edits = [...previous?.edits ?? [], version];
    while (edits.length > Math.max(1, this.limits.edits))
      edits.splice(1, 1);
    return this.put({ channelId, id, deletedAt: previous?.deletedAt, edits });
  }
  remove(channelId, id) {
    const channel = this.channels.get(channelId);
    if (!channel?.delete(id))
      return;
    if (!channel.size)
      this.channels.delete(channelId);
    this.changed();
  }
  setLimits(limits) {
    this.limits = { ...this.limits, ...limits };
    const evicted = [];
    for (const [channelId, channel] of this.channels) {
      for (const [id, entry] of channel) {
        if (entry.edits.length <= Math.max(1, this.limits.edits))
          continue;
        const edits = [...entry.edits];
        while (edits.length > Math.max(1, this.limits.edits))
          edits.splice(1, 1);
        channel.set(id, { ...entry, edits });
      }
      evicted.push(...this.trimChannel(channelId, channel));
    }
    evicted.push(...this.trimChannels());
    this.changed();
    return evicted;
  }
  deleted() {
    const out = new Map;
    for (const [channelId, channel] of this.channels) {
      const ids = [...channel.values()].filter((e) => e.deletedAt !== undefined).map((e) => e.id);
      if (ids.length)
        out.set(channelId, ids);
    }
    return out;
  }
  clear() {
    const deleted = [...this.deleted()].flatMap(([channelId, ids]) => ids.map((id) => ({ channelId, id })));
    const had = this.channels.size > 0;
    this.channels.clear();
    if (had)
      this.changed();
    return deleted;
  }
  clearChannels(channelIds) {
    const deleted = [];
    let had = false;
    for (const channelId of channelIds) {
      const channel = this.channels.get(channelId);
      if (!channel)
        continue;
      had = true;
      this.channels.delete(channelId);
      for (const entry of channel.values())
        if (entry.deletedAt !== undefined)
          deleted.push({ channelId, id: entry.id });
    }
    if (had)
      this.changed();
    return deleted;
  }
  channelIds() {
    return [...this.channels.keys()];
  }
  counts(channelIds) {
    let deleted = 0;
    let edited = 0;
    const channels = channelIds ? [...channelIds].flatMap((id) => this.channels.get(id) ?? []) : [...this.channels.values()];
    for (const channel of channels) {
      for (const entry of channel.values()) {
        if (entry.deletedAt !== undefined)
          deleted++;
        if (entry.edits.length)
          edited++;
      }
    }
    return { deleted, edited, channels: channels.length };
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  put(entry) {
    let channel = this.channels.get(entry.channelId);
    if (channel) {
      this.channels.delete(entry.channelId);
      channel.delete(entry.id);
    } else {
      channel = new Map;
    }
    this.channels.set(entry.channelId, channel);
    channel.set(entry.id, entry);
    const evicted = [...this.trimChannel(entry.channelId, channel), ...this.trimChannels()];
    this.changed();
    return evicted;
  }
  trimChannel(channelId, channel) {
    const evicted = [];
    for (const [id, entry] of channel) {
      if (channel.size <= Math.max(1, this.limits.perChannel))
        break;
      channel.delete(id);
      if (entry.deletedAt !== undefined)
        evicted.push({ channelId, id });
    }
    return evicted;
  }
  trimChannels() {
    const evicted = [];
    for (const [channelId, channel] of this.channels) {
      if (this.channels.size <= Math.max(1, this.limits.channels))
        break;
      this.channels.delete(channelId);
      for (const entry of channel.values())
        if (entry.deletedAt !== undefined)
          evicted.push({ channelId, id: entry.id });
    }
    return evicted;
  }
  changed() {
    this.version++;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}

// plugins/message-logger/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var PURGE_ACTION = "EVI_MESSAGE_LOGGER_PURGE";
var SELF_DELETE_WINDOW = 60000;
var accessoriesFilter = import_api.filters.byCode("channelMessageProps:{message:", "isAutomodBlockedMessage:");
var renderedContentFilter = import_api.filters.byCode('"useMessageRenderedContent"', "hideSimpleEmbedContent");
var markupFilter = Object.assign((v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((c) => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) && Object.values(v).some((c) => typeof c === "string" && /^codeContainer_+[\da-f]+$/.test(c)), { $code: [/"markup_+[\da-f]+"/] });
var useRenderedContent;
var markupClass = "";
var css = `
[data-list-item-id^="chat-messages___"]:has(.dl-ml-deleted) {
    background: color-mix(in srgb, var(--status-danger, #f23f43) 8%, transparent);
    box-shadow: inset 2px 0 0 var(--status-danger, #f23f43);
}
.dl-ml {
    text-indent: 0;
    padding: 0.125rem 0;
    font-family: var(--font-primary);
}
.dl-ml-history {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0.125rem 0;
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--border-subtle, rgba(151, 151, 159, 0.12));
}
.dl-ml-caption, .dl-ml-time, .dl-ml-deleted {
    font-size: 0.75rem;
    line-height: 1rem;
}
.dl-ml-caption {
    color: var(--text-muted, #949ba4);
    font-weight: 500;
}
.dl-ml-version {
    color: var(--text-muted, #949ba4);
    font-size: 0.875rem;
    line-height: 1.25rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}
.dl-ml-time {
    color: var(--text-muted, #949ba4);
    margin-inline-end: 0.375rem;
    font-variant-numeric: tabular-nums;
}
.dl-ml-content {
    display: inline;
}
.dl-ml-deleted {
    display: inline-block;
    color: var(--text-feedback-critical, var(--status-danger, #f23f43));
    font-weight: 500;
}
`;
function formatTime(ms) {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function Time({ ms }) {
  return /* @__PURE__ */ jsx_runtime.jsx("time", {
    className: "dl-ml-time",
    dateTime: new Date(ms).toISOString(),
    children: formatTime(ms)
  });
}
function RichContent({ message, content, render }) {
  const record = import_api.React.useMemo(() => message.set?.("content", content) ?? { ...message, content }, [message, content]);
  const rendered = render(record, {
    hideSimpleEmbedContent: false,
    formatInline: false,
    allowLinks: true,
    allowList: true,
    allowHeading: true
  });
  return /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
    children: rendered?.content ?? content
  });
}
function Version({ message, version }) {
  const render = useRenderedContent;
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-ml-version",
    children: [
      /* @__PURE__ */ jsx_runtime.jsx(Time, {
        ms: version.timestamp
      }),
      /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: `dl-ml-content ${markupClass}`,
        children: render ? /* @__PURE__ */ jsx_runtime.jsx(RichContent, {
          message,
          content: version.content,
          render
        }) : version.content
      })
    ]
  });
}
function Logged({ log, message }) {
  const entry = import_api.React.useSyncExternalStore(log.subscribe, () => log.get(message.channel_id, message.id));
  if (!entry)
    return null;
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-ml",
    children: [
      entry.edits.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-ml-history",
        role: "group",
        "aria-label": "Previous versions",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-ml-caption",
            children: "Edited from"
          }),
          entry.edits.map((version, i) => /* @__PURE__ */ jsx_runtime.jsx(Version, {
            message,
            version
          }, i))
        ]
      }),
      entry.deletedAt !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        className: "dl-ml-deleted",
        children: [
          "Deleted ",
          /* @__PURE__ */ jsx_runtime.jsx("time", {
            dateTime: new Date(entry.deletedAt).toISOString(),
            children: formatTime(entry.deletedAt)
          })
        ]
      })
    ]
  });
}
var active;
function Summary({ runtime }) {
  import_api.React.useSyncExternalStore(runtime.log.subscribe, () => runtime.log.version);
  const { deleted, edited } = runtime.log.counts();
  const Button = import_api.Components.Button;
  const empty = deleted + edited === 0;
  const label = "Clear logged messages";
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-field-row",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: "Logged right now"
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("p", {
            className: "dl-hint",
            role: "status",
            style: { fontVariantNumeric: "tabular-nums" },
            children: [
              deleted,
              " deleted, ",
              edited,
              " edited. Kept in memory only."
            ]
          })
        ]
      }),
      Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
        color: Button.Colors?.RED,
        size: Button.Sizes?.SMALL,
        disabled: empty,
        onClick: runtime.clear,
        children: label
      }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        className: "dl-button",
        disabled: empty,
        onClick: runtime.clear,
        children: label
      })
    ]
  });
}
var settings = {
  keepDeleted: { type: "boolean", label: "Keep deleted messages", description: "Deleted messages stay in the chat, tinted red and marked Deleted.", default: true },
  logEdits: { type: "boolean", label: "Keep edit history", description: "Edited messages show what they said before, under the message.", default: true },
  ignoreOwnDeletes: { type: "boolean", label: "Ignore my own deletes", description: "Messages you delete yourself disappear as usual.", default: true },
  ignoreSelf: { type: "boolean", label: "Ignore my own messages", description: "Never log your messages, whoever deletes or edits them.", default: false },
  ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't log messages from bots and apps.", default: false },
  limit: {
    type: "number",
    label: "Messages logged per channel",
    description: "Past this, the oldest are forgotten, and deleted ones among them disappear for real.",
    default: 50,
    min: 10,
    max: 200,
    step: 10
  }
};
function install(ctx, log, store) {
  const registry = import_api.Dispatcher._actionHandlers;
  const handlers = registry?._dependencyGraph?.getNodeData?.(store.getDispatchToken?.())?.actionHandler;
  if (!handlers || !["MESSAGE_DELETE", "MESSAGE_DELETE_BULK", "MESSAGE_UPDATE"].every((t) => typeof handlers[t] === "function")) {
    ctx.logger.error("Couldn't find MessageStore's action handlers, Discord changed how Flux stores register");
    return;
  }
  const invalidate = () => registry._invalidateCaches?.();
  ctx.onDispose(invalidate);
  let users;
  ctx.waitFor(import_api.filters.byStoreName("UserStore"), (s) => void (users = s));
  const logFilters = () => ({
    currentUserId: users?.getCurrentUser?.()?.id,
    ignoreSelf: ctx.settings.get("ignoreSelf"),
    ignoreBots: ctx.settings.get("ignoreBots")
  });
  const selfDeletes = new Map;
  ctx.hookExport("before", import_api.filters.byProps("deleteMessage", "editMessage", "sendMessage"), "deleteMessage", ({ args }) => {
    const now = Date.now();
    for (const [key, at] of selfDeletes)
      if (now - at > SELF_DELETE_WINDOW)
        selfDeletes.delete(key);
    selfDeletes.set(`${args[0]}:${args[1]}`, now);
  });
  const purge = (refs) => {
    const byChannel = new Map;
    for (const { channelId, id } of refs)
      byChannel.set(channelId, [...byChannel.get(channelId) ?? [], id]);
    return Promise.all([...byChannel].map(([channelId, ids]) => import_api.Dispatcher.dispatch({ type: PURGE_ACTION, channelId, ids })));
  };
  const purgeHandler = (action) => handlers.MESSAGE_DELETE_BULK({ type: "MESSAGE_DELETE_BULK", channelId: action.channelId, ids: action.ids, eviPurge: true });
  handlers[PURGE_ACTION] = purgeHandler;
  const shouldKeep = (action, channelId, id) => {
    if (log.isDeleted(channelId, id))
      return true;
    const key = `${channelId}:${id}`;
    const self = selfDeletes.delete(key);
    if (action.local || !ctx.settings.get("keepDeleted"))
      return false;
    if (self && ctx.settings.get("ignoreOwnDeletes"))
      return false;
    const message = store.getMessage(channelId, id);
    return !!message && shouldLog(message, logFilters());
  };
  ctx.hook.instead(handlers, "MESSAGE_DELETE", (call) => {
    const action = call.args[0];
    if (action.eviPurge || !shouldKeep(action, action.channelId, action.id))
      return call.callOriginal(...call.args);
    purge(log.markDeleted(action.channelId, action.id));
    return false;
  });
  ctx.hook.instead(handlers, "MESSAGE_DELETE_BULK", (call) => {
    const action = call.args[0];
    if (action.eviPurge)
      return call.callOriginal(...call.args);
    const keep = [];
    const drop = [];
    for (const id of action.ids ?? [])
      (shouldKeep(action, action.channelId, id) ? keep : drop).push(id);
    const evicted = keep.flatMap((id) => log.markDeleted(action.channelId, id));
    purge(evicted);
    return drop.length ? call.callOriginal({ ...action, ids: drop }) : false;
  });
  ctx.hook.before(handlers, "MESSAGE_UPDATE", ({ args }) => {
    const next = args[0]?.message;
    if (!ctx.settings.get("logEdits") || !next?.id || typeof next.content !== "string")
      return;
    const channelId = next.channel_id;
    const old = store.getMessage(channelId, next.id);
    if (!old || typeof old.content !== "string" || old.content === next.content || !shouldLog(old, logFilters()))
      return;
    const timestamp = Number(old.editedTimestamp ?? old.timestamp) || Date.now();
    purge(log.addEdit(channelId, next.id, { content: old.content, timestamp }));
  });
  invalidate();
  const runtime = {
    log,
    clear: () => void purge(log.clear()),
    clearChannels: (ids) => void purge(log.clearChannels(ids))
  };
  active = runtime;
  ctx.settings.onChange((values) => {
    purge(log.setLimits({ perChannel: values.limit }));
    if (!values.keepDeleted) {
      const kept = [...log.deleted()].flatMap(([channelId, ids]) => ids.map((id) => ({ channelId, id })));
      for (const { channelId, id } of kept)
        log.remove(channelId, id);
      purge(kept);
    }
  });
  ctx.onDispose(() => {
    if (active === runtime)
      active = undefined;
    purge(log.clear()).finally(() => {
      if (handlers[PURGE_ACTION] !== purgeHandler)
        return;
      delete handlers[PURGE_ACTION];
      invalidate();
    });
  });
}
function countLabel({ deleted, edited }) {
  return [deleted && `${deleted} deleted`, edited && `${edited} edited`].filter(Boolean).join(", ");
}
function clearItem(ctx, id, label, channelIds) {
  const runtime = active;
  if (!runtime || !channelIds.length)
    return;
  const counts = runtime.log.counts(channelIds);
  if (counts.deleted + counts.edited === 0)
    return;
  return /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
    children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id,
      label,
      subtext: countLabel(counts),
      color: "danger",
      action: () => {
        runtime.clearChannels(channelIds);
        ctx.toast(`Cleared ${countLabel(counts)}`, { type: "success" });
      }
    })
  }, `${id}-group`);
}
function guildChannelIds(guildId) {
  const channels = import_api.findStore("ChannelStore");
  return active?.log.channelIds().filter((id) => channels?.getChannel?.(id)?.guild_id === guildId) ?? [];
}
var message_logger_default = import_api.definePlugin({
  settings,
  start(ctx) {
    const log = new MessageLog({ perChannel: ctx.settings.get("limit") });
    ctx.addStyle(css);
    ctx.waitFor(import_api.filters.byStoreName("MessageStore"), (store) => install(ctx, log, store));
    ctx.waitFor(renderedContentFilter, (fn) => void (useRenderedContent = fn));
    ctx.waitFor(markupFilter, (classes) => {
      markupClass = Object.values(classes).find((c) => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) ?? "";
    });
    ctx.contextMenu(["channel-context", "thread-context", "gdm-context"], (children, props) => {
      const item = props.channel?.id && clearItem(ctx, "evi-ml-clear-channel", "Clear Logged Messages", [props.channel.id]);
      if (item)
        children.push(item);
    });
    ctx.contextMenu("user-context", (children, props) => {
      const channel = props.channel;
      if (!channel?.id || channel.guild_id || channel.type !== 1)
        return;
      const item = clearItem(ctx, "evi-ml-clear-dm", "Clear Logged Messages", [channel.id]);
      if (item)
        children.push(item);
    });
    ctx.contextMenu("guild-context", (children, props) => {
      const item = props.guild?.id && clearItem(ctx, "evi-ml-clear-guild", "Clear Logged Messages", guildChannelIds(props.guild.id));
      if (item)
        children.push(item);
    });
    ctx.hookExport("after", accessoriesFilter, ({ args, result }) => {
      const props = args[0];
      const message = props?.channelMessageProps?.message;
      if (result == null || props.isMessageSnapshot || !message?.id)
        return;
      return /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
        children: [
          result,
          /* @__PURE__ */ jsx_runtime.jsx(Logged, {
            log,
            message
          })
        ]
      });
    });
  },
  settingsPanel: () => active && /* @__PURE__ */ jsx_runtime.jsx(Summary, {
    runtime: active
  }),
  getLog: () => active?.log
});
