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

// plugins/quick-actions/index.tsx
var exports_quick_actions = {};
__export(exports_quick_actions, {
  default: () => quick_actions_default
});
module.exports = __toCommonJS(exports_quick_actions);
var import_api = require("@evi/api");

// plugins/quick-actions/urls.ts
function messageLink(origin, guildId, channelId, messageId) {
  return `${origin}/channels/${guildId || "@me"}/${channelId}/${messageId}`;
}
function discordOrigin(location2) {
  return /^(?:[\w-]+\.)?discord\.com$/.test(location2.host) ? `${location2.protocol}//${location2.host}` : "https://discord.com";
}
var IMAGE_SEARCH_ENGINES = [
  { id: "google-lens", name: "Google Lens", url: (u) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}` },
  { id: "yandex", name: "Yandex", url: (u) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}` },
  { id: "tineye", name: "TinEye", url: (u) => `https://tineye.com/search?url=${encodeURIComponent(u)}` }
];
var PROXY_SIZE_PARAMS = ["width", "height", "format", "quality"];
function cleanImageUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return;
  if (url.hostname === "media.discordapp.net")
    for (const p of PROXY_SIZE_PARAMS)
      url.searchParams.delete(p);
  return url.toString();
}
var VIDEO = /\.(?:mp4|webm|mov|m4v|mkv|avi)(?:$|[?#])/i;
var IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff?)(?:$|[?#])/i;
function isImageAttachment(a) {
  const type = a.content_type ?? a.contentType;
  if (type)
    return type.startsWith("image/");
  return IMAGE.test(a.filename ?? "") || IMAGE.test(a.url ?? "");
}
var isVideoUrl = (url) => VIDEO.test(url);
function googleLanguage(locale) {
  if (!locale)
    return "en";
  const [lang, region] = locale.replace("_", "-").split("-");
  const base = lang.toLowerCase();
  if (base === "zh")
    return region?.toUpperCase() === "TW" || region?.toUpperCase() === "HK" ? "zh-TW" : "zh-CN";
  return base;
}
var TRANSLATE_MAX_CHARS = 5000;
function translateUrl(text, targetLanguage) {
  const chars = Array.from(text);
  const clipped = chars.length > TRANSLATE_MAX_CHARS ? chars.slice(0, TRANSLATE_MAX_CHARS).join("") : text;
  return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(targetLanguage)}&text=${encodeURIComponent(clipped)}&op=translate`;
}

// plugins/quick-actions/index.tsx
var jsx_runtime = require("react/jsx-runtime");
async function copy(text) {
  const native = window.DiscordNative?.clipboard;
  if (native?.copy)
    native.copy(text);
  else
    await navigator.clipboard.writeText(text);
}
var openExternal = (url) => void window.open(url, "_blank", "noopener,noreferrer");
function findImage(message, props) {
  const target = props.itemSafeSrc || props.itemSrc;
  if (typeof target === "string" && !isVideoUrl(target))
    return cleanImageUrl(target);
  const attachment = (message.attachments ?? []).find(isImageAttachment);
  if (attachment?.url)
    return cleanImageUrl(attachment.url);
  for (const embed of message.embeds ?? []) {
    const url = embed?.image?.url ?? embed?.thumbnail?.url;
    if (url && !isVideoUrl(url))
      return cleanImageUrl(url);
  }
}
var quick_actions_default = import_api.definePlugin({
  settings: {
    translateTo: {
      type: "string",
      label: "Translate to",
      description: "Google Translate language code, like en, de or zh-TW. Empty uses Discord's language.",
      placeholder: "en",
      default: ""
    }
  },
  start(ctx) {
    const copyItem = (id, label, text, done) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id,
      label,
      action: async () => {
        try {
          await copy(text);
          ctx.toast(done, { type: "success" });
        } catch {
          ctx.toast("Couldn't copy to the clipboard", { type: "failure" });
        }
      }
    }, id);
    ctx.contextMenu("message", (children, props) => {
      const { message } = props;
      if (!message?.id)
        return;
      const channelId = message.channel_id ?? props.channel?.id;
      const content = typeof message.content === "string" ? message.content : "";
      const has = (id) => !!import_api.findMenuGroup(children, id);
      const copies = [];
      if (channelId && !has("copy-link")) {
        const guildId = props.channel?.guild_id ?? import_api.getStore("ChannelStore")?.getChannel?.(channelId)?.guild_id;
        copies.push(copyItem("dl-qa-copy-link", "Copy Message Link", messageLink(discordOrigin(location), guildId, channelId, message.id), "Message link copied"));
      }
      if (content.trim())
        copies.push(copyItem("dl-qa-copy-raw", "Copy Raw Text", content, "Raw text copied"));
      if (!has(`devmode-copy-id-${message.id}`))
        copies.push(copyItem("dl-qa-copy-id", "Copy Message ID", message.id, "Message ID copied"));
      const extras = [];
      const image = findImage(message, props);
      if (image) {
        extras.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: "dl-qa-search-image",
          label: "Search Image",
          children: IMAGE_SEARCH_ENGINES.map((engine) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
            id: `dl-qa-search-${engine.id}`,
            label: engine.name,
            action: () => openExternal(engine.url(image))
          }, engine.id))
        }, "dl-qa-search-image"));
      }
      if (content.trim()) {
        const target = ctx.settings.get("translateTo").trim() || googleLanguage(import_api.getStore("LocaleStore")?.locale ?? navigator.language);
        extras.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: "dl-qa-translate",
          label: "Translate with Google",
          action: () => openExternal(translateUrl(content, target))
        }, "dl-qa-translate"));
      }
      const group = import_api.findMenuGroup(children, "copy-text");
      if (group)
        group.push(...copies, ...extras);
      else if (copies.length || extras.length)
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: [...copies, ...extras]
        }, "dl-quick-actions"));
    });
  }
});
