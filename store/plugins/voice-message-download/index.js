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

// plugins/voice-message-download/index.tsx
var exports_voice_message_download = {};
__export(exports_voice_message_download, {
  default: () => voice_message_download_default
});
module.exports = __toCommonJS(exports_voice_message_download);
var import_api = require("@evi/api");

// plugins/voice-message-download/voice.ts
var IS_VOICE_MESSAGE = 1 << 13;
var AUDIO_NAME = /\.(?:ogg|oga|opus|mp3|m4a|wav|webm)(?:$|[?#])/i;
function isAudioAttachment(a) {
  if (!a)
    return false;
  const type = a.content_type ?? a.contentType;
  if (type)
    return type.startsWith("audio/");
  return a.waveform != null || a.duration_secs != null || AUDIO_NAME.test(a.filename ?? "") || AUDIO_NAME.test(a.url ?? "");
}
function voiceAttachment(message) {
  if (!message || ((message.flags ?? 0) & IS_VOICE_MESSAGE) === 0)
    return;
  const audio = (message.attachments ?? []).find(isAudioAttachment);
  return audio?.url || audio?.proxy_url ? audio : undefined;
}
function sanitizeFilePart(text) {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+|[_.]+$/g, "").slice(0, 64);
}
function toDate(value) {
  if (value == null)
    return;
  const candidate = value instanceof Date ? value : typeof value.toDate === "function" ? value.toDate() : typeof value === "string" || typeof value === "number" ? new Date(value) : undefined;
  return candidate instanceof Date && !isNaN(candidate.getTime()) ? candidate : undefined;
}
var pad = (n) => String(n).padStart(2, "0");
function formatStamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
function audioExtension(a) {
  const match = /\.(ogg|oga|opus|mp3|m4a|wav|webm)(?:$|[?#])/i.exec(a?.filename ?? "") ?? /\.(ogg|oga|opus|mp3|m4a|wav|webm)(?:$|[?#])/i.exec(a?.url ?? "");
  return match ? match[1].toLowerCase() : "ogg";
}
function voiceFilename(author, timestamp, extension = "ogg", now = () => new Date) {
  const name = sanitizeFilePart(author ?? "") || "unknown";
  return `voice-${name}-${formatStamp(toDate(timestamp) ?? now())}.${extension}`;
}

// plugins/voice-message-download/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var openExternal = (url) => void window.open(url, "_blank", "noopener,noreferrer");
async function save(data, filename, type) {
  const fileManager = window.DiscordNative?.fileManager;
  if (typeof fileManager?.saveWithDialog === "function") {
    await fileManager.saveWithDialog(data, filename);
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
var voice_message_download_default = import_api.definePlugin({
  start(ctx) {
    async function download(message) {
      const attachment = voiceAttachment(message);
      const url = attachment?.url || attachment?.proxy_url;
      if (!attachment || !url)
        return;
      const author = message.author?.username ?? message.author?.globalName ?? message.author?.global_name;
      const filename = voiceFilename(author, message.timestamp, audioExtension(attachment));
      try {
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        await save(data, filename, attachment.content_type ?? res.headers.get("content-type") ?? "audio/ogg");
      } catch (e) {
        ctx.logger.error("Voice message download failed", e);
        ctx.toast("Couldn't download the voice message, opening it in the browser", { type: "failure" });
        openExternal(url);
      }
    }
    ctx.contextMenu("message", (children, props) => {
      const { message } = props;
      if (!voiceAttachment(message))
        return;
      const item = /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
        id: "dl-vmd-download",
        label: "Download Voice Message",
        action: () => void download(message)
      }, "dl-vmd-download");
      const group = import_api.findMenuGroup(children, "copy-text");
      if (group)
        group.push(item);
      else
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: item
        }, "dl-voice-message-download"));
    });
  }
});
