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

// plugins/hide-blocked/index.ts
var exports_hide_blocked = {};
__export(exports_hide_blocked, {
  default: () => hide_blocked_default
});
module.exports = __toCommonJS(exports_hide_blocked);
var import_api = require("@evi/api");

// plugins/hide-blocked/filter.ts
var BLOCKED_GROUP = "MESSAGE_GROUP_BLOCKED";
var IGNORED_GROUP = "MESSAGE_GROUP_IGNORED";
var REPLY_TYPE = 19;
function safe(fn) {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}
function hiddenKind(message, rel, options) {
  if (!message)
    return null;
  const authorId = message.author?.id;
  if (message.blocked || safe(() => rel?.isBlockedForMessage?.(message)) || authorId != null && safe(() => rel?.isBlocked?.(authorId)))
    return "blocked";
  if (!options.ignored)
    return null;
  if (message.ignored || safe(() => rel?.isIgnoredForMessage?.(message)) || authorId != null && safe(() => rel?.isIgnored?.(authorId)))
    return "ignored";
  return null;
}
function isHiddenUser(userId, rel, options) {
  if (!options.active || userId == null)
    return false;
  return safe(() => rel?.isBlocked?.(userId)) || options.ignored && safe(() => rel?.isIgnored?.(userId));
}
function repliesToHidden(message, lookups, options) {
  const ref = message.messageReference;
  if (message.type !== REPLY_TYPE || ref?.message_id == null || !lookups.referenced)
    return false;
  let target;
  try {
    target = lookups.referenced(ref)?.message;
  } catch {
    return false;
  }
  return hiddenKind(target, lookups.relationships, options) != null;
}
function shouldHideMessage(message, collapse, lookups, options) {
  if (!options.active || !message)
    return false;
  if (collapse === BLOCKED_GROUP)
    return true;
  if (collapse === IGNORED_GROUP && options.ignored)
    return true;
  return options.replies && repliesToHidden(message, lookups, options);
}
function shouldHideMemberRow(row, rel, options) {
  if (row == null || typeof row !== "object")
    return false;
  const { type, user } = row;
  return type === "MEMBER" && isHiddenUser(user?.id, rel, options);
}
function filterVoiceStates(states, rel, options) {
  if (!options.active || !Array.isArray(states) || states.length === 0)
    return states;
  const kept = states.filter((s) => !isHiddenUser(s?.user?.id, rel, options));
  return kept.length === states.length ? states : kept;
}
var PATCHES = {
  stream: {
    find: '"416cc9_1"',
    replace: [
      {
        match: /(\.forEach\((\i)=>\{var \i,\i;let \i,\i,\i;)(if\(\i&&\2\.isFirstMessageInForumPost\((\i)\)\)return;[^]{0,1500}?let \i=(\i)\(\4,\2,\i&&\i\);)/,
        with: "$1if($self?.hide?.($2,$5($4,$2,!1)))return;$3"
      },
      {
        match: /(\[\i,\i,\i,\i,\i,\i,\i,\i,\i,\i,\i)(\]\);return\{messages:\i,channelStream:\i,)/,
        with: "$1,$self?.useVersion?.()$2"
      }
    ]
  },
  memberList: {
    find: "getFirstApplicationIdOccurrences",
    replace: {
      match: /(renderRow=(\i)=>\{let\{section:\i,row:\i,rowIndex:\i\}=\2,\{channel:\i\}=this\.props,(\i)=this\.getRowProps\(\2\);)/,
      with: "$1if($self?.hideMember?.($3))return null;"
    }
  },
  voiceUsers: {
    find: '"ConnectedVoiceUser"',
    replace: {
      match: /(collapsedMax:\i=6,[^]{0,200}?=\(0,\i\.\i\)\(\i\.id,)(\i\?\?\i)\)/,
      with: "$1($self?.useVoiceStates?.($2)??$2))"
    }
  }
};

// plugins/hide-blocked/index.ts
var settings = {
  active: {
    type: "boolean",
    label: "Hide blocked messages",
    description: `Turn off to get Discord's collapsed "blocked messages" rows back. /hideblocked flips this.`,
    default: true
  },
  ignored: {
    type: "boolean",
    label: "Ignored users too",
    description: "Treat users you ignored like users you blocked.",
    default: true
  },
  replies: {
    type: "boolean",
    label: "Hide replies to them",
    description: 'Also hide messages replying to a hidden user. When off, the reply stays and its quote reads "Blocked message".',
    default: false
  },
  memberList: {
    type: "boolean",
    label: "Hide from the member list",
    description: "Leave them out of a server's member list. Takes effect as the list updates.",
    default: true
  },
  voice: {
    type: "boolean",
    label: "Hide from voice channels",
    description: "Leave them out of the users listed under voice channels.",
    default: false
  }
};
var options;
var relationships;
var referencedStore;
var lookups = {
  get relationships() {
    return relationships;
  },
  referenced: (ref) => referencedStore?.getMessageByReference?.(ref)
};
var version = 0;
var listeners = new Set;
function bump() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(cb) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
function useVersion() {
  return import_api.React.useSyncExternalStore(subscribe, () => version);
}
var voiceCache = new WeakMap;
var hide_blocked_default = import_api.definePlugin({
  settings,
  patches: [PATCHES.stream, PATCHES.memberList, PATCHES.voiceUsers],
  hide(message, collapse) {
    return !!options && shouldHideMessage(message, collapse, lookups, options);
  },
  useVersion,
  hideMember(row) {
    return !!options?.memberList && shouldHideMemberRow(row, relationships, options);
  },
  useVoiceStates(states) {
    const v = useVersion();
    if (!options?.voice || !Array.isArray(states))
      return states;
    const cached = voiceCache.get(states);
    if (cached?.version === v)
      return cached.out;
    const out = filterVoiceStates(states, relationships, options);
    voiceCache.set(states, { version: v, out });
    return out;
  },
  start(ctx) {
    relationships = import_api.findStore("RelationshipStore");
    referencedStore = import_api.findStore("ReferencedMessageStore");
    options = { ...ctx.settings.all };
    if (!relationships)
      ctx.logger.warn("RelationshipStore not found, only Discord's own blocked flags are used");
    const onRelationships = () => void (options?.active && bump());
    const onReferenced = () => void (options?.active && options.replies && bump());
    relationships?.addChangeListener?.(onRelationships);
    referencedStore?.addChangeListener?.(onReferenced);
    ctx.settings.onChange((values) => {
      options = { ...values };
      bump();
    });
    ctx.command({
      name: "hideblocked",
      description: "Toggle hiding blocked users' messages",
      execute() {
        const next = !ctx.settings.get("active");
        ctx.settings.set("active", next);
        return { ephemeral: next ? "Blocked users' messages are hidden." : "Blocked users' messages show as Discord's collapsed rows again." };
      }
    });
    ctx.onDispose(() => {
      relationships?.removeChangeListener?.(onRelationships);
      referencedStore?.removeChangeListener?.(onReferenced);
      options = undefined;
      relationships = undefined;
      referencedStore = undefined;
      bump();
    });
    bump();
  }
});
