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

// plugins/better-image-viewer/index.tsx
var exports_better_image_viewer = {};
__export(exports_better_image_viewer, {
  default: () => better_image_viewer_default
});
module.exports = __toCommonJS(exports_better_image_viewer);
var import_api = require("@evi/api");

// plugins/better-image-viewer/gallery.ts
var MAX_AROUND = 100;
var IS_SPOILER = 1 << 3;
var CONTAINS_EXPLICIT_MEDIA = 1 << 4;
var IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff?)(?:$|[?#])/i;
function isImageAttachment(a) {
  const type = a.content_type ?? a.contentType;
  if (type)
    return type.startsWith("image/");
  return IMAGE_EXT.test(a.filename ?? "") || IMAGE_EXT.test(a.url ?? "");
}
function isHiddenAttachment(a) {
  return !!a.spoiler || /^SPOILER_/.test(a.filename ?? "") || ((a.flags ?? 0) & (IS_SPOILER | CONTAINS_EXPLICIT_MEDIA)) !== 0;
}
var isHttp = (url) => typeof url === "string" && /^https?:\/\//i.test(url);
var attachmentItem = (a, message) => ({
  type: "IMAGE",
  url: a.url,
  proxyUrl: a.proxy_url ?? a.proxyUrl,
  width: a.width,
  height: a.height,
  contentType: a.content_type,
  placeholder: a.placeholder,
  placeholderVersion: a.placeholder_version,
  alt: a.description || undefined,
  sourceMetadata: { message, identifier: { type: "attachment", attachmentId: a.id, filename: a.filename, size: a.size } }
});
function embedItem(media, message, embedIndex) {
  const proxyUrl = media?.proxyURL ?? media?.proxy_url;
  if (!isHttp(media?.url) && !isHttp(proxyUrl))
    return;
  return {
    type: "IMAGE",
    url: media.url ?? proxyUrl,
    proxyUrl,
    width: media.width,
    height: media.height,
    placeholder: media.placeholder,
    placeholderVersion: media.placeholderVersion,
    contentType: media.contentType,
    sourceMetadata: { message, identifier: { type: "embed", embedIndex } }
  };
}
function imagesOfMessage(message, toItem = attachmentItem) {
  const out = [];
  if (!message)
    return out;
  const seen = new Set;
  const add = (item) => {
    const key = item?.url?.split("?")[0];
    if (!item || item.type !== "IMAGE" || !key || seen.has(key))
      return;
    seen.add(key);
    out.push(item);
  };
  for (const a of message.attachments ?? []) {
    if (a && isImageAttachment(a) && !isHiddenAttachment(a))
      add(toItem(a, message));
  }
  if (typeof message.content === "string" && message.content.includes("||"))
    return out;
  (message.embeds ?? []).forEach((embed, i) => {
    if (!embed || embed.type === "gifv" || embed.video || (embed.flags ?? 0) & CONTAINS_EXPLICIT_MEDIA)
      return;
    const media = [];
    if (embed.image)
      media.push(embed.image);
    if (Array.isArray(embed.images))
      media.push(...embed.images.filter((m) => m !== embed.image));
    if (!media.length && embed.type === "image" && embed.thumbnail)
      media.push(embed.thumbnail);
    for (const m of media)
      add(embedItem(m, message, i));
  });
  return out;
}
function channelGallery(messages, clickedMessageId, items, startingIndex, toItem = attachmentItem, skip = () => false) {
  const at = messages.findIndex((m) => m?.id === clickedMessageId);
  if (at === -1)
    return;
  const before = messages.slice(0, at).filter((m) => !skip(m)).flatMap((m) => imagesOfMessage(m, toItem));
  const after = messages.slice(at + 1).filter((m) => !skip(m)).flatMap((m) => imagesOfMessage(m, toItem));
  const kept = before.slice(Math.max(0, before.length - MAX_AROUND));
  return {
    items: [...kept, ...items, ...after.slice(0, MAX_AROUND)],
    startingIndex: kept.length + startingIndex
  };
}

// plugins/better-image-viewer/index.tsx
var toItem = attachmentItem;
function channelMessages(channelId) {
  const channel = import_api.findStore("MessageStore")?.getMessages?.(channelId);
  if (!channel)
    return [];
  return channel.toArray?.() ?? channel._array ?? (Array.isArray(channel) ? channel : []);
}
function hiddenAuthors() {
  const relationships = import_api.findStore("RelationshipStore");
  return (message) => {
    const id = message?.author?.id;
    if (!id)
      return false;
    return !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id));
  };
}
function widen(options) {
  const items = Array.isArray(options?.items) ? options.items : [];
  const start = options?.startingIndex ?? 0;
  const message = items[start]?.sourceMetadata?.message;
  if (items[start]?.type !== "IMAGE" || !message?.id || !message.channel_id)
    return;
  if (!items.every((i) => i?.sourceMetadata?.message?.id === message.id))
    return;
  const gallery = channelGallery(channelMessages(message.channel_id), message.id, items, start, toItem, hiddenAuthors());
  if (!gallery || gallery.items.length === items.length)
    return;
  return { ...options, ...gallery };
}
var better_image_viewer_default = import_api.definePlugin({
  start(ctx) {
    ctx.waitFor(import_api.filters.byCode('"VIDEO":"INVALID",alt:', 'identifier:{type:"attachment",attachmentId:'), (helper) => toItem = helper);
    ctx.onDispose(() => toItem = attachmentItem);
    ctx.hookExport("before", import_api.filters.byCode("markSessionStarted", "hasMediaOptions:!"), (call) => {
      try {
        const widened = widen(call.args[0]);
        if (widened)
          call.args = [widened, ...call.args.slice(1)];
      } catch (err) {
        ctx.logger.error("Couldn't add the channel's images, opening the viewer as is", err);
      }
    });
  }
});
