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

// plugins/inline-translate/native.ts
var exports_native = {};
__export(exports_native, {
  default: () => native_default
});
module.exports = __toCommonJS(exports_native);
var import_electron = require("electron");

// plugins/inline-translate/translate.ts
var ALIASES = { iw: "he", jw: "jv", in: "id", ji: "yi", fil: "tl", nb: "no" };
function normalizeLanguage(code) {
  if (!code)
    return;
  const m = /^([a-z]{2,3})(?:[-_]([a-z]{2,4}))?$/i.exec(code.trim());
  if (!m)
    return;
  const base = m[1].toLowerCase();
  if (base === "zh") {
    const region = m[2]?.toUpperCase();
    return region === "TW" || region === "HK" || region === "MO" || region === "HANT" ? "zh-TW" : "zh-CN";
  }
  return ALIASES[base] ?? base;
}
function parseGoogleResponse(data) {
  if (!Array.isArray(data))
    throw new Error("Unexpected answer from Google Translate");
  const segments = Array.isArray(data[0]) ? data[0] : [];
  const text = segments.map((s) => Array.isArray(s) && typeof s[0] === "string" ? s[0] : "").join("");
  const detected = typeof data[2] === "string" ? data[2] : Array.isArray(data[8]) && Array.isArray(data[8][0]) ? data[8][0][0] : undefined;
  const source = normalizeLanguage(typeof detected === "string" ? detected : undefined);
  if (!source)
    throw new Error("Google Translate didn't say which language it detected");
  return { text, source };
}
var TRANSLATE_ORIGIN = "https://translate.googleapis.com";
function translateUrl(text, target) {
  return `${TRANSLATE_ORIGIN}/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
}
var MAX_ENCODED_CHUNK = 6000;
var encodedLength = (s) => encodeURIComponent(s).length;
function chunkText(text, maxEncoded = MAX_ENCODED_CHUNK) {
  if (encodedLength(text) <= maxEncoded)
    return [text];
  const chunks = [];
  let rest = text;
  while (rest && encodedLength(rest) > maxEncoded) {
    const chars = Array.from(rest);
    let fit = 0;
    let size = 0;
    while (fit < chars.length) {
      const next = encodedLength(chars[fit]);
      if (size + next > maxEncoded)
        break;
      size += next;
      fit++;
    }
    const prefix = chars.slice(0, Math.max(fit, 1)).join("");
    let cut = -1;
    for (const re of [/\n(?!.*\n)/s, /[.!?。！？](?=\s)(?!.*[.!?。！？]\s)/s, /\s(?!.*\s)/s]) {
      const m = re.exec(prefix);
      if (m && m.index > 0) {
        cut = m.index + m[0].length;
        break;
      }
    }
    const piece = cut > 0 ? prefix.slice(0, cut) : prefix;
    chunks.push(piece);
    rest = rest.slice(piece.length);
  }
  if (rest)
    chunks.push(rest);
  return chunks;
}
var PROTECTED = new RegExp([
  "```[\\s\\S]*?```",
  "`[^`\\n]+`",
  "<https?:\\/\\/[^\\s>]+>",
  "https?:\\/\\/[^\\s<>]+",
  "<(?:@[!&]?|#)\\d+>",
  "<a?:\\w+:\\d+>",
  "<t:-?\\d+(?::[tTdDfFR])?>",
  "<\\/[\\w -]+:\\d+>",
  "<id:\\w+>",
  ":[\\w+-]+:",
  "@(?:everyone|here)\\b"
].join("|"), "g");
var translatable = new Map;
var TRANSLATABLE_TYPES = new Set([0, 19, 20, 21, 23]);
class LRU {
  capacity;
  map = new Map;
  constructor(capacity) {
    this.capacity = capacity;
  }
  get size() {
    return this.map.size;
  }
  get(key) {
    if (!this.map.has(key))
      return;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  peek(key) {
    return this.map.get(key);
  }
  has(key) {
    return this.map.has(key);
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity)
      this.map.delete(this.map.keys().next().value);
    return this;
  }
  delete(key) {
    return this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  keys() {
    return this.map.keys();
  }
}

// plugins/inline-translate/native.ts
var MAX_INPUT = 12000;
var TIMEOUT = 15000;
async function request(text, target) {
  const res = await import_electron.net.fetch(translateUrl(text, target), {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { Accept: "application/json" }
  });
  if (!res.ok)
    throw new Error(`Google Translate answered HTTP ${res.status}`);
  return parseGoogleResponse(await res.json());
}
var native_default = {
  async translate(text, target) {
    if (typeof text !== "string" || !text.trim())
      throw new Error("Nothing to translate");
    const tl = typeof target === "string" ? normalizeLanguage(target) : undefined;
    if (!tl)
      throw new Error(`Not a language code: ${String(target)}`);
    const parts = [];
    let source = "";
    for (const chunk of chunkText(text.slice(0, MAX_INPUT))) {
      const lead = /^\s*/.exec(chunk)[0];
      const trail = /\s*$/.exec(chunk)[0];
      if (!chunk.trim()) {
        parts.push(chunk);
        continue;
      }
      const result = await request(chunk, tl);
      source ||= result.source;
      parts.push(lead + result.text.trim() + trail);
    }
    return { text: parts.join(""), source };
  }
};
