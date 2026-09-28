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

// plugins/who-reacted/index.tsx
var exports_who_reacted = {};
__export(exports_who_reacted, {
  default: () => who_reacted_default
});
module.exports = __toCommonJS(exports_who_reacted);
var import_api = require("@evi/api");

// plugins/who-reacted/reactors.ts
var REACTION_VOTE = 2;
var reactionKey = (messageId, emoji, type) => `${messageId}:${emoji.name ?? ""}:${emoji.id ?? ""}:${type}`;
var shownCount = (props) => (props.type === 1 ? props.burst_count : props.count) ?? 0;
function pickReactors(users, count, max, hidden) {
  const shown = [];
  let known = 0, blocked = 0;
  for (const user of users) {
    known++;
    if (hidden(user.id))
      blocked++;
    else if (shown.length < max)
      shown.push(user);
  }
  return { shown, extra: Math.max(0, Math.max(count, known) - blocked - shown.length) };
}
var extraLabel = (extra) => extra > 99 ? "+99+" : `+${extra}`;

class FetchQueue {
  gapMs;
  scheduler;
  pending = new Map;
  done = new Set;
  timer;
  constructor(gapMs, scheduler = globalThis) {
    this.gapMs = gapMs;
    this.scheduler = scheduler;
  }
  has(key) {
    return this.done.has(key);
  }
  add(key, job) {
    if (this.done.has(key) || this.pending.has(key))
      return;
    this.pending.set(key, job);
    if (this.timer === undefined)
      this.timer = this.scheduler.setTimeout(() => this.next(), 0);
  }
  remove(key) {
    this.pending.delete(key);
  }
  clear() {
    this.pending.clear();
    this.done.clear();
    if (this.timer !== undefined)
      this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }
  next() {
    this.timer = undefined;
    const first = this.pending.entries().next();
    if (first.done)
      return;
    const [key, job] = first.value;
    this.pending.delete(key);
    this.done.add(key);
    try {
      job();
    } finally {
      if (this.pending.size)
        this.timer = this.scheduler.setTimeout(() => this.next(), this.gapMs);
    }
  }
}
var PATCHES = {
  pill: {
    find: ".reactionCount,value:",
    replace: {
      match: /(?=\(0,\i\.jsx\)\(\i,\{count:\i,reactionRef:\i\}\))/,
      with: "$self?.renderUsers?.(arguments[0]),"
    }
  }
};

// plugins/who-reacted/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  max: { type: "number", label: "Avatars per reaction", description: "Past that, a reaction shows how many more reacted.", default: 5, min: 1, max: 10, step: 1 },
  showExtra: { type: "boolean", label: "Show how many more", description: "A +12 after the avatars when more people reacted than are shown.", default: true }
};
var FETCH_LIMIT = 10;
var FETCH_GAP_MS = 350;
var context;
var queue = new FetchQueue(FETCH_GAP_MS);
function store(name) {
  try {
    return import_api.findStore(name);
  } catch {
    return;
  }
}
var reactionsStore = () => store("MessageReactionsStore");
var asked = new Set;
function subscribe(onChange) {
  const s = reactionsStore();
  s?.addChangeListener?.(onChange);
  asked.add(onChange);
  return () => {
    s?.removeChangeListener?.(onChange);
    asked.delete(onChange);
  };
}
function isHidden(id) {
  const relationships = store("RelationshipStore");
  return !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id));
}
function Reactors({ message, emoji, type = 0, count }) {
  const { max, showExtra } = context.settings.use();
  const channelId = message.getChannelId();
  const key = reactionKey(message.id, emoji, type);
  import_api.React.useEffect(() => {
    queue.add(key, () => {
      reactionsStore()?.getReactions?.(channelId, message.id, emoji, FETCH_LIMIT, type);
      for (const listener of asked)
        listener();
    });
    return () => queue.remove(key);
  }, [key]);
  const ids = import_api.React.useSyncExternalStore(subscribe, () => {
    if (!queue.has(key))
      return "";
    const users2 = reactionsStore()?.getReactions?.(channelId, message.id, emoji, FETCH_LIMIT, type);
    return users2 ? [...users2.keys()].join(",") : "";
  });
  if (!ids)
    return null;
  const users = ids.split(",").map((id) => ({ id }));
  const { shown, extra } = pickReactors(users, count, max, isHidden);
  if (!shown.length)
    return null;
  const guildId = store("ChannelStore")?.getChannel?.(channelId)?.getGuildId?.();
  const userStore = store("UserStore");
  return /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-who-reacted",
    "aria-hidden": "true",
    children: [
      shown.map(({ id }) => {
        const src = userStore?.getUser?.(id)?.getAvatarURL?.(guildId ?? undefined, 32);
        return src ? /* @__PURE__ */ jsx_runtime.jsx("img", {
          className: "evi-who-reacted-avatar",
          src,
          alt: "",
          draggable: false
        }, id) : null;
      }),
      showExtra && extra > 0 && /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "evi-who-reacted-extra",
        children: extraLabel(extra)
      })
    ]
  });
}
var who_reacted_default = import_api.definePlugin({
  settings,
  patches: [PATCHES.pill],
  renderUsers(props) {
    try {
      if (!context || !props?.message?.id || !props.emoji || props.hideCount || props.type === REACTION_VOTE)
        return null;
      const count = shownCount(props);
      if (!count)
        return null;
      return /* @__PURE__ */ jsx_runtime.jsx(Reactors, {
        message: props.message,
        emoji: props.emoji,
        type: props.type,
        count
      });
    } catch (err) {
      context?.logger.error("Couldn't draw who reacted", err);
      return null;
    }
  },
  css: `
        .evi-who-reacted { display: inline-flex; align-items: center; margin-inline-start: 6px; pointer-events: none; }
        .evi-who-reacted-avatar { inline-size: 16px; block-size: 16px; border-radius: 50%; object-fit: cover;
            box-shadow: 0 0 0 1.5px var(--background-base-lower, var(--background-primary, #1e1f22)); }
        .evi-who-reacted-avatar + .evi-who-reacted-avatar { margin-inline-start: -4px; }
        .evi-who-reacted-extra { margin-inline-start: 4px; color: var(--text-muted, #949ba4); font-size: 12px; font-weight: 600;
            font-variant-numeric: tabular-nums; }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => {
      context = undefined;
      queue.clear();
    });
  }
});
