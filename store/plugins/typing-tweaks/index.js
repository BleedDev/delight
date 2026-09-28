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

// plugins/typing-tweaks/index.tsx
var exports_typing_tweaks = {};
__export(exports_typing_tweaks, {
  default: () => typing_tweaks_default
});
module.exports = __toCommonJS(exports_typing_tweaks);
var import_api = require("@evi/api");

// plugins/typing-tweaks/typing.ts
function typerIds(typing, selfId, hidden, known = () => true) {
  return Object.keys(typing ?? {}).filter((id) => id !== selfId && !hidden(id) && known(id));
}
var MAX_NAMED = 3;
function nameSlots(parts) {
  const slots = [];
  parts.forEach((part, i) => {
    if (part !== null && typeof part === "object")
      slots.push(i);
  });
  return slots;
}
function typingLabel(names) {
  if (!names.length)
    return "";
  if (names.length === 1)
    return `${names[0]} is typing`;
  if (names.length === 2)
    return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3)
    return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others are typing`;
}
var PATCHES = {
  typingLine: {
    find: "Q8lUnE,{})",
    replace: {
      match: /(?<="aria-hidden":!0,children:)(\i)(?=\}\),\(0,\i\.jsx\)\("span",\{className:\i\.\i,style:\{position:"absolute",visibility:"hidden"\},"aria-hidden":!0,ref:\i,children:(\i)\}\))/,
      with: "$self?.renderTypingText?.($1,$1===$2,arguments[0])??$1"
    }
  },
  channel: {
    find: 'textVariant:"text-md/medium",channel:',
    replace: {
      match: /(?<=\(\i,\{textVariant:"text-md\/medium",channel:(\i),name:null!=\i\?\i:\i\}\)\}\),)(?=\i\.Children\.count\()/,
      with: '$self?.renderIndicator?.($1,"channel"),'
    }
  },
  thread: {
    find: "__invalid_threadMainContent",
    replace: {
      match: /(?<=children:\[)(?=\(0,\i\.jsx\)\(\i,\{thread:(\i),countInVoice:)/,
      with: '$self?.renderIndicator?.($1,"channel"),'
    }
  },
  dm: {
    find: "PrivateChannel.renderAvatar",
    replace: {
      match: /(?<=\(0,\i\.jsxs\)\("div",\{className:\i\(\)\(\i\.\i,\{\[\i\.\i\]:\i\}\),children:\[)(?=\i\?\(0,\i\.jsx\)\(\i,\{\}\):\i\?\(0,\i\.jsx\)\(\i,\{\}\):\i\?\(0,\i\.jsx\)\(\i,\{\}\):null,)/,
      with: '$self?.renderIndicator?.(arguments[0]?.channel,"dm"),'
    }
  }
};

// plugins/typing-tweaks/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  avatars: { type: "boolean", label: "Avatars in the typing line", description: "A small avatar before each name in “is typing” above the chat box.", default: true },
  roleColors: { type: "boolean", label: "Names in role colours", description: "Names in “is typing” in the colour of their top role, like in chat.", default: true },
  channels: { type: "boolean", label: "Dots on channels", description: "Three dots on a channel or thread in the channel list while someone types in it.", default: true },
  dms: { type: "boolean", label: "Dots on DMs", description: "Three dots on a DM in the DM list while someone types in it, next to the ones Discord puts on the avatar.", default: true }
};
var context;
function store(name) {
  try {
    return import_api.findStore(name);
  } catch {
    return;
  }
}
var selfId = () => store("UserStore")?.getCurrentUser?.()?.id;
function isHidden(id) {
  const relationships = store("RelationshipStore");
  return !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id));
}
function typersIn(channelId) {
  const users = store("UserStore");
  return typerIds(store("TypingStore")?.getTypingUsers?.(channelId), selfId(), isHidden, (id) => !!users?.getUser?.(id));
}
function subscribeTyping(onChange) {
  const typing = store("TypingStore");
  typing?.addChangeListener?.(onChange);
  return () => typing?.removeChangeListener?.(onChange);
}
function displayName(id, guildId) {
  const user = store("UserStore")?.getUser?.(id);
  const nick = guildId ? store("GuildMemberStore")?.getNick?.(guildId, id) : undefined;
  return nick ?? user?.globalName ?? user?.username ?? "Someone";
}
function TypingName({ userId, guildId, children }) {
  const { avatars, roleColors } = context.settings.use();
  const color = roleColors && guildId ? store("GuildMemberStore")?.getMember?.(guildId, userId)?.colorString : undefined;
  const avatar = avatars ? store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId, 32) : undefined;
  return /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-typing-name",
    style: color ? { color } : undefined,
    children: [
      avatar && /* @__PURE__ */ jsx_runtime.jsx("img", {
        className: "evi-typing-avatar",
        src: avatar,
        alt: "",
        draggable: false
      }),
      children
    ]
  });
}
function TypingIndicator({ channelId, guildId }) {
  const ids = import_api.React.useSyncExternalStore(subscribeTyping, () => typersIn(channelId).join(","));
  if (!ids)
    return null;
  const label = typingLabel(ids.split(",").map((id) => displayName(id, guildId)));
  const dots = /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-typing-dots",
    role: "img",
    "aria-label": label,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("span", {}),
      /* @__PURE__ */ jsx_runtime.jsx("span", {}),
      /* @__PURE__ */ jsx_runtime.jsx("span", {})
    ]
  });
  const Tooltip = import_api.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: label,
    position: "top",
    children: dots
  }) : dots;
}
var typing_tweaks_default = import_api.definePlugin({
  settings,
  patches: [PATCHES.typingLine, PATCHES.channel, PATCHES.thread, PATCHES.dm],
  renderTypingText(text, named, props) {
    try {
      if (!context || !named || !Array.isArray(text) || !props?.channel?.id)
        return;
      const { avatars, roleColors } = context.settings.all;
      if (!avatars && !roleColors)
        return;
      const count = props.typingUsers?.length ?? 0;
      if (!count || count > MAX_NAMED)
        return;
      const ids = typersIn(props.channel.id);
      const slots = nameSlots(text);
      if (slots.length !== ids.length || ids.length !== count)
        return;
      const guildId = props.guildId ?? props.channel.guild_id ?? undefined;
      return text.map((part, i) => {
        const slot = slots.indexOf(i);
        return slot === -1 ? /* @__PURE__ */ jsx_runtime.jsx(import_api.React.Fragment, {
          children: part
        }, i) : /* @__PURE__ */ jsx_runtime.jsx(TypingName, {
          userId: ids[slot],
          guildId,
          children: part
        }, i);
      });
    } catch (err) {
      context?.logger.error("Couldn't draw the typing line", err);
    }
  },
  renderIndicator(channel, kind) {
    try {
      if (!context || !channel?.id)
        return null;
      if (!context.settings.get(kind === "dm" ? "dms" : "channels"))
        return null;
      return /* @__PURE__ */ jsx_runtime.jsx(TypingIndicator, {
        channelId: channel.id,
        guildId: channel.guild_id ?? undefined
      }, "evi-typing");
    } catch (err) {
      context?.logger.error("Couldn't draw the typing dots", err);
      return null;
    }
  },
  css: `
        .evi-typing-name { display: inline-flex; align-items: baseline; gap: 4px; }
        .evi-typing-name > strong, .evi-typing-name > b { color: inherit; }
        .evi-typing-avatar { align-self: center; inline-size: 16px; block-size: 16px; border-radius: 50%; object-fit: cover; }
        .evi-typing-dots { display: inline-flex; flex: none; align-items: center; gap: 2px; margin-inline: 4px;
            color: var(--interactive-normal, var(--interactive-text-default, #b5bac1)); }
        .evi-typing-dots > span { inline-size: 4px; block-size: 4px; border-radius: 50%; background: currentColor; opacity: 0.4; }
        @media (prefers-reduced-motion: no-preference) {
            .evi-typing-dots > span { animation: evi-typing-dot 1.2s ease-in-out infinite; }
            .evi-typing-dots > span:nth-child(2) { animation-delay: 0.15s; }
            .evi-typing-dots > span:nth-child(3) { animation-delay: 0.3s; }
        }
        @keyframes evi-typing-dot { 0%, 60%, 100% { opacity: 0.4; transform: none; } 30% { opacity: 1; transform: translateY(-2px); } }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => void (context = undefined));
  }
});
