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

// plugins/streamer-mode-plus/index.ts
var exports_streamer_mode_plus = {};
__export(exports_streamer_mode_plus, {
  default: () => streamer_mode_plus_default
});
module.exports = __toCommonJS(exports_streamer_mode_plus);
var import_api = require("@evi/api");

// plugins/streamer-mode-plus/state.ts
function autoActive(mode, state) {
  switch (mode) {
    case "always":
      return true;
    case "streaming":
      return state.streaming;
    case "streamerMode":
      return state.streamerMode;
    case "either":
      return state.streaming || state.streamerMode;
    default:
      return false;
  }
}
function shouldActivate(mode, state, override = null) {
  if (override === "on")
    return true;
  if (override === "off")
    return false;
  return autoActive(mode, state);
}
function toggledOverride(currentlyActive) {
  return currentlyActive ? "off" : "on";
}
var PREFIX = "evi-smp";
var ACTIVE_CLASS = `${PREFIX}-active`;
var IN_DM_CLASS = `${PREFIX}-in-dm`;
var HOVER_CLASS = `${PREFIX}-hover`;
var optionClass = (key) => `${PREFIX}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
var BLUR_KEYS = ["dms", "servers", "channels", "media", "chatAvatars", "members", "dmContent"];
var ALL_CLASSES = [ACTIVE_CLASS, IN_DM_CLASS, HOVER_CLASS, ...BLUR_KEYS.map(optionClass)];
function bodyClasses(active, options, inDm) {
  if (!active)
    return [];
  const classes = [ACTIVE_CLASS];
  for (const key of BLUR_KEYS)
    if (options[key])
      classes.push(optionClass(key));
  if (options.hoverReveal)
    classes.push(HOVER_CLASS);
  if (inDm && options.dmContent)
    classes.push(IN_DM_CLASS);
  return classes;
}
var SELECTORS = {
  dms: [
    'a[data-list-item-id^="private-channels-"][href^="/channels/@me/"]',
    '[class*="privateChannels_"] li:has(a[href^="/channels/@me/"])',
    '[data-list-item-id^="guildsnav___"][href^="/channels/@me/"]'
  ],
  servers: [
    '[data-list-item-id^="guildsnav___"]:not([data-list-item-id="guildsnav___home"]):not([data-list-item-id="guildsnav___create-join-button"]):not([data-list-item-id="guildsnav___guild-discover-button"]):not([href^="/channels/@me"])',
    '[class*="guildHeader_"] [class*="name_"]',
    '[class*="guildBadgeAndName_"]',
    '[class*="bannerImage_"]',
    '[class*="communityInfo_"]'
  ],
  channels: [
    '[data-list-item-id^="channels___"]',
    'section[class*="title_"] h1',
    '[class*="titleWrapper_"]'
  ],
  media: [
    '[id^="message-accessories-"] [class*="visualMediaItemContainer_"]',
    '[id^="message-accessories-"] [class*="nonVisualMediaItemContainer_"]',
    '[id^="message-accessories-"] [class*="imageWrapper_"]',
    '[id^="message-accessories-"] [class*="embedWrapper_"]',
    '[id^="message-accessories-"] article',
    '[id^="message-accessories-"] video',
    '[id^="message-accessories-"] [class*="clickableSticker_"]',
    'img[src*="cdn.discordapp.com/attachments/"]',
    'img[src*="media.discordapp.net/attachments/"]',
    'img[src*="images-ext-"][src*=".discordapp.net/external/"]',
    'video[src*="cdn.discordapp.com/attachments/"]'
  ],
  chatAvatars: [
    'li[id^="chat-messages-"] img[class*="avatar_"]',
    'li[id^="chat-messages-"] [class*="replyAvatar_"]',
    'li[id^="chat-messages-"] [class*="avatarDecoration_"]'
  ],
  members: [
    '[data-list-item-id^="members-"]',
    '[class*="membersWrap_"] [class*="member_"]',
    '[class*="voiceUser_"]'
  ],
  dmContent: [
    '[id^="message-content-"]',
    '[id^="message-username-"]',
    '[id^="message-reply-context-"]',
    'li[id^="chat-messages-"] img[class*="avatar_"]'
  ]
};
var clampBlur = (px) => Number.isFinite(px) ? Math.min(Math.max(Math.round(px), 1), 40) : 8;
function buildCss({ blur }) {
  const px = clampBlur(blur);
  const rules = [];
  const all = [];
  for (const key of BLUR_KEYS) {
    const scope = key === "dmContent" ? `body.${ACTIVE_CLASS}.${optionClass(key)}.${IN_DM_CLASS}` : `body.${ACTIVE_CLASS}.${optionClass(key)}`;
    const group = `:is(${SELECTORS[key].join(", ")})`;
    const target = `${scope} ${group}:not(${group} *)`;
    all.push(target);
    rules.push(`${target} { filter: blur(${px}px); }`);
    rules.push(`body.${HOVER_CLASS}${scope.slice(4)} ${group}:not(${group} *):is(:hover, :focus-within) { filter: none; }`);
  }
  return [
    `/* Streamer Mode+ */`,
    `:is(${all.join(", ")}) { transition: filter 0.18s ease-out; will-change: filter; }`,
    ...rules,
    `@media (prefers-reduced-motion: reduce) { :is(${all.join(", ")}) { transition: none; } }`
  ].join(`
`);
}
function parseHotkey(input) {
  const parts = input.split("+").map((p) => p.trim()).filter(Boolean);
  const hotkey = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === "ctrl" || p === "control")
      hotkey.ctrl = true;
    else if (p === "shift")
      hotkey.shift = true;
    else if (p === "alt" || p === "option")
      hotkey.alt = true;
    else if (p === "meta" || p === "cmd" || p === "command" || p === "win" || p === "super")
      hotkey.meta = true;
    else if (!hotkey.key)
      hotkey.key = p === "space" ? " " : p;
    else
      return;
  }
  return hotkey.key ? hotkey : undefined;
}
function matchesHotkey(hotkey, event) {
  if (!hotkey)
    return false;
  return event.key.toLowerCase() === hotkey.key && event.ctrlKey === hotkey.ctrl && event.shiftKey === hotkey.shift && event.altKey === hotkey.alt && event.metaKey === hotkey.meta;
}
function transitionMessage(active, reason) {
  if (reason === "manual")
    return active ? "Streamer Mode+ on" : "Streamer Mode+ off";
  const why = reason === "streaming" ? "you're streaming" : "Streamer Mode is on";
  const stopped = reason === "streaming" ? "stream ended" : "Streamer Mode is off";
  return active ? `Streamer Mode+ on: ${why}` : `Streamer Mode+ off: ${stopped}`;
}

// plugins/streamer-mode-plus/index.ts
var settings = {
  mode: {
    type: "select",
    label: "Turn on",
    description: "When to blur. /streamerplus and the hotkey work in every mode.",
    default: "either",
    options: [
      { label: "While streaming or in Streamer Mode", value: "either" },
      { label: "While screen sharing or Go Live", value: "streaming" },
      { label: "While Discord's Streamer Mode is on", value: "streamerMode" },
      { label: "Always", value: "always" }
    ]
  },
  hotkey: { type: "string", label: "Hotkey", description: "Toggles blurring. Leave empty for none.", default: "Ctrl+Shift+S", placeholder: "Ctrl+Shift+S" },
  hoverReveal: { type: "boolean", label: "Reveal on hover", description: "Unblur something while the mouse is over it.", default: true },
  blur: { type: "number", label: "Blur strength", description: "In pixels.", default: 8, min: 2, max: 30, step: 1 },
  toasts: { type: "boolean", label: "Toasts", description: "A short notice when blurring turns on or off by itself.", default: true },
  dms: { type: "boolean", label: "DM list", description: "Names, avatars and message previews in your DMs.", default: true },
  servers: { type: "boolean", label: "Servers", description: "Server icons and names in the server list and header.", default: true },
  channels: { type: "boolean", label: "Channel names", description: "The channel list and channel header.", default: false },
  media: { type: "boolean", label: "Images and embeds", description: "Images, videos, embeds, stickers and attachments in chat.", default: true },
  chatAvatars: { type: "boolean", label: "Avatars in chat", description: "Profile pictures next to messages.", default: false },
  members: { type: "boolean", label: "Member list", description: "The member list and people in voice channels.", default: false },
  dmContent: { type: "boolean", label: "Messages in DMs", description: "Message text and names while a DM is open.", default: false }
};
var context;
var override = null;
var lastAuto;
var lastActive = false;
var applied = [];
function liveState() {
  let streaming = false;
  let streamerMode = false;
  try {
    streaming = import_api.findStore("ApplicationStreamingStore")?.getCurrentUserActiveStream?.() != null;
  } catch {}
  try {
    streamerMode = !!import_api.findStore("StreamerModeStore")?.enabled;
  } catch {}
  return { streaming, streamerMode };
}
function inDm() {
  try {
    const id = import_api.findStore("SelectedChannelStore")?.getChannelId?.();
    if (!id)
      return false;
    const channel = import_api.findStore("ChannelStore")?.getChannel?.(id);
    return channel?.type === 1 || channel?.type === 3 || !!channel?.isPrivate?.();
  } catch {
    return false;
  }
}
function options() {
  const s = context.settings.all;
  return {
    dms: s.dms,
    servers: s.servers,
    channels: s.channels,
    media: s.media,
    chatAvatars: s.chatAvatars,
    members: s.members,
    dmContent: s.dmContent,
    hoverReveal: s.hoverReveal
  };
}
function applyClasses(classes) {
  const body = document.body;
  for (const c of applied)
    if (!classes.includes(c))
      body.classList.remove(c);
  for (const c of classes)
    body.classList.add(c);
  applied = classes;
}
function update(manual = false, quiet = false) {
  if (!context)
    return;
  const mode = context.settings.get("mode");
  const state = liveState();
  const auto = autoActive(mode, state);
  if (lastAuto !== undefined && auto !== lastAuto)
    override = null;
  const autoChanged = lastAuto !== undefined && auto !== lastAuto;
  lastAuto = auto;
  const active = shouldActivate(mode, state, override);
  applyClasses(bodyClasses(active, options(), inDm()));
  if (active !== lastActive && !quiet) {
    if (manual)
      context.toast(transitionMessage(active, "manual"), { type: "info" });
    else if (autoChanged && context.settings.get("toasts"))
      context.toast(transitionMessage(active, reasonFor(mode, state)), { type: "info" });
  }
  lastActive = active;
}
function reasonFor(mode, state) {
  if (mode === "streaming" || mode === "streamerMode")
    return mode;
  return state.streaming || !state.streamerMode ? "streaming" : "streamerMode";
}
function toggle(quiet = false) {
  override = toggledOverride(lastActive);
  update(true, quiet);
  return lastActive;
}
var streamer_mode_plus_default = import_api.definePlugin({
  settings,
  toggle,
  start(ctx) {
    context = ctx;
    override = null;
    lastAuto = undefined;
    lastActive = false;
    const style = ctx.addStyle(buildCss({ blur: ctx.settings.get("blur") }));
    ctx.settings.onChange((values) => {
      style.update(buildCss({ blur: values.blur }));
      update();
    });
    const onChange = () => update();
    const watched = ["ApplicationStreamingStore", "StreamerModeStore", "SelectedChannelStore"].map((name) => import_api.findStore(name)).filter(Boolean);
    for (const store of watched)
      store.addChangeListener?.(onChange);
    ctx.onDispose(() => watched.forEach((store) => store.removeChangeListener?.(onChange)));
    for (const type of ["STREAM_START", "STREAM_STOP", "STREAM_DELETE", "STREAMER_MODE_UPDATE", "CHANNEL_SELECT"]) {
      ctx.flux.subscribe(type, () => queueMicrotask(onChange));
    }
    const onKey = (e) => {
      if (e.repeat || !matchesHotkey(parseHotkey(ctx.settings.get("hotkey")), e))
        return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    window.addEventListener("keydown", onKey, true);
    ctx.onDispose(() => window.removeEventListener("keydown", onKey, true));
    ctx.command({
      name: "streamerplus",
      description: "Turn Streamer Mode+ blurring on or off",
      execute() {
        const on = toggle(true);
        return { ephemeral: on ? "Streamer Mode+ is on." : "Streamer Mode+ is off." };
      }
    });
    ctx.onDispose(() => {
      for (const c of ALL_CLASSES)
        document.body.classList.remove(c);
      applied = [];
      context = undefined;
      override = null;
      lastAuto = undefined;
      lastActive = false;
    });
    update();
  }
});
