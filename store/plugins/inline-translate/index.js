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

// plugins/inline-translate/index.tsx
var exports_inline_translate = {};
__export(exports_inline_translate, {
  default: () => inline_translate_default
});
module.exports = __toCommonJS(exports_inline_translate);
var import_api = require("@evi/api");

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
function googleLanguage(locale) {
  return normalizeLanguage(locale) ?? "en";
}
function sameLanguage(a, b) {
  const x = normalizeLanguage(a);
  const y = normalizeLanguage(b);
  return !!x && x === y;
}
function parseLanguageList(input) {
  const out = [];
  for (const part of (input ?? "").split(/[\s,;|/]+/)) {
    const code = normalizeLanguage(part);
    if (code && !out.includes(code))
      out.push(code);
  }
  return out;
}
function languageName(code, uiLocale) {
  try {
    const name = new Intl.DisplayNames(uiLocale ? [uiLocale] : undefined, { type: "language" }).of(normalizeLanguage(code) ?? code);
    if (name && name !== code)
      return name;
  } catch {}
  return code;
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
var EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3]/gu;
var PLACEHOLDER = (i) => `⟦${i}⟧`;
var PLACEHOLDER_RE = /⟦\s*(\d+)\s*⟧/g;
function protect(text) {
  const tokens = [];
  const out = text.replace(PROTECTED, (token) => {
    tokens.push(token);
    return PLACEHOLDER(tokens.length - 1);
  });
  return { text: out, tokens };
}
function restore(translated, tokens) {
  const used = new Set;
  let out = translated.replace(PLACEHOLDER_RE, (whole, n) => {
    const i = Number(n);
    if (!(i in tokens))
      return whole;
    used.add(i);
    return tokens[i];
  });
  const missing = tokens.filter((_, i) => !used.has(i));
  if (missing.length)
    out = [out.trimEnd(), ...missing].join(missing.some((t) => t.startsWith("```")) ? `
` : " ");
  return out;
}
function translatableText(text) {
  return text.replace(PROTECTED, " ").replace(EMOJI, " ").replace(/[^\p{L}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function isTranslatable(text) {
  if (!text)
    return false;
  return (translatableText(text).match(/\p{L}/gu)?.length ?? 0) >= 2;
}
var SCRIPT_TESTS = [
  ["japanese", /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["cjk", /\p{Script=Han}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["greek", /\p{Script=Greek}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["thai", /\p{Script=Thai}/u],
  ["devanagari", /\p{Script=Devanagari}/u]
];
var LANGUAGE_SCRIPTS = {
  ja: ["japanese", "cjk"],
  "zh-CN": ["cjk"],
  "zh-TW": ["cjk"],
  ko: ["hangul", "cjk"],
  ru: ["cyrillic"],
  uk: ["cyrillic"],
  bg: ["cyrillic"],
  be: ["cyrillic"],
  mk: ["cyrillic"],
  kk: ["cyrillic"],
  ky: ["cyrillic"],
  mn: ["cyrillic"],
  sr: ["cyrillic", "latin"],
  tg: ["cyrillic"],
  el: ["greek"],
  ar: ["arabic"],
  fa: ["arabic"],
  ur: ["arabic"],
  ps: ["arabic"],
  he: ["hebrew"],
  yi: ["hebrew"],
  th: ["thai"],
  hi: ["devanagari"],
  mr: ["devanagari"],
  ne: ["devanagari"]
};
var scriptsOf = (language) => LANGUAGE_SCRIPTS[language];
function scriptsIn(text) {
  const found = new Set;
  for (const ch of translatableText(text)) {
    if (!/\p{L}/u.test(ch))
      continue;
    if (/\p{Script=Latin}/u.test(ch))
      found.add("latin");
    else
      found.add(SCRIPT_TESTS.find(([, re]) => re.test(ch))?.[0] ?? "other");
  }
  return found;
}
function mightBeIn(text, languages) {
  const present = scriptsIn(text);
  if (!present.size)
    return false;
  return languages.some((lang) => {
    const scripts = scriptsOf(lang);
    if (!scripts)
      return present.has("latin") || present.has("other");
    return scripts.some((s) => present.has(s));
  });
}
function mightBeForeign(text, target) {
  const present = scriptsIn(text);
  if (!present.size)
    return false;
  const unique = { ko: "hangul", el: "greek", th: "thai", he: "hebrew" };
  const own = unique[normalizeLanguage(target) ?? ""];
  return !(own && present.size === 1 && present.has(own));
}
var TRANSLATABLE_TYPES = new Set([0, 19, 20, 21, 23]);
function shouldAutoTranslate(message, options) {
  if (options.mode === "off" || !message?.id)
    return false;
  if (options.mode === "list" && !options.languages.length)
    return false;
  if (typeof message.content !== "string" || !isTranslatable(message.content))
    return false;
  if (message.type != null && !TRANSLATABLE_TYPES.has(message.type))
    return false;
  const author = message.author;
  if (!author?.id || author.id === options.currentUserId)
    return false;
  if (options.ignoreBots && author.bot)
    return false;
  return options.mode === "list" ? mightBeIn(message.content, options.languages) : mightBeForeign(message.content, options.target);
}
function shouldShowAuto(result, original, options) {
  if (options.mode === "off")
    return false;
  if (sameLanguage(result.source, options.target))
    return false;
  if (options.mode === "list" && !options.languages.some((l) => sameLanguage(l, result.source)))
    return false;
  return normalizeForCompare(result.text) !== normalizeForCompare(original);
}
var normalizeForCompare = (s) => s.toLocaleLowerCase().replace(/[\s\p{P}]+/gu, "");

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
var cacheKey = (messageId, target) => `${messageId}:${target}`;

class RateQueue {
  interval;
  maxPending;
  onDrop;
  now;
  pending = [];
  running = false;
  lastStart = -Infinity;
  pausedUntil = 0;
  timer;
  stopped = false;
  constructor(interval, maxPending, onDrop = () => {}, now = Date.now) {
    this.interval = interval;
    this.maxPending = maxPending;
    this.onDrop = onDrop;
    this.now = now;
  }
  get size() {
    return this.pending.length;
  }
  has(key) {
    return this.pending.some((j) => j.key === key);
  }
  add(key, run, urgent = false) {
    if (this.stopped)
      return;
    const existing = this.pending.findIndex((j) => j.key === key);
    if (existing !== -1) {
      if (!urgent || this.pending[existing].urgent)
        return;
      this.pending.splice(existing, 1);
    }
    const job = { key, run, urgent };
    if (urgent) {
      const firstNormal = this.pending.findIndex((j) => !j.urgent);
      this.pending.splice(firstNormal === -1 ? this.pending.length : firstNormal, 0, job);
    } else {
      this.pending.push(job);
      while (this.pending.filter((j) => !j.urgent).length > this.maxPending) {
        const oldest = this.pending.findIndex((j) => !j.urgent);
        const [dropped] = this.pending.splice(oldest, 1);
        this.onDrop(dropped.key);
      }
    }
    this.schedule();
  }
  pause(ms) {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
    this.schedule();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const job of this.pending.splice(0))
      this.onDrop(job.key);
  }
  schedule() {
    if (this.stopped || this.running || !this.pending.length)
      return;
    clearTimeout(this.timer);
    const wait = Math.max(this.lastStart + this.interval, this.pausedUntil) - this.now();
    if (wait > 0) {
      this.timer = setTimeout(() => this.schedule(), wait);
      return;
    }
    const job = this.pending.shift();
    this.running = true;
    this.lastStart = this.now();
    job.run().catch(() => {}).finally(() => {
      this.running = false;
      this.schedule();
    });
  }
}

// plugins/inline-translate/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  target: {
    type: "string",
    label: "Translate to",
    description: "A language code like en, de or zh-TW. Empty uses Discord's language.",
    placeholder: "en",
    default: ""
  },
  autoMode: {
    type: "select",
    label: "Translate automatically",
    description: "Messages from others are translated as they appear. Uses a request per message.",
    default: "off",
    options: [
      { label: "Off", value: "off" },
      { label: "Only the languages I list", value: "list" },
      { label: "Any language that isn't mine", value: "foreign" }
    ]
  },
  autoLanguages: {
    type: "string",
    label: "Languages to translate automatically",
    description: 'Language codes separated by commas, like es, ja, de. Used by "Only the languages I list".',
    placeholder: "es, ja, de",
    default: ""
  },
  ignoreBots: { type: "boolean", label: "Skip bots automatically", description: "Don't translate messages from bots and apps on your behalf.", default: true },
  hoverButton: { type: "boolean", label: "Button in the message toolbar", description: "A translate button next to Reply when you hover a message.", default: true }
};
var INTERVAL = 1200;
var BACKOFF = 60000;
var MAX_QUEUED = 25;
var CACHE_SIZE = 500;
var accessoriesFilter = import_api.filters.byCode("channelMessageProps:{message:", "isAutomodBlockedMessage:");
var renderedContentFilter = import_api.filters.byCode('"useMessageRenderedContent"', "hideSimpleEmbedContent");
var markupFilter = Object.assign((v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((c) => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) && Object.values(v).some((c) => typeof c === "string" && /^codeContainer_+[\da-f]+$/.test(c)), { $code: [/"markup_+[\da-f]+"/] });
var useRenderedContent;
var markupClass = "";
var css = `
.dl-it {
    text-indent: 0;
    margin: 0.125rem 0 0.25rem;
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--brand-500, var(--brand-experiment, #5865f2));
    font-family: var(--font-primary);
    max-width: 100%;
}
.dl-it-text {
    color: var(--text-normal, #dbdee1);
    font-size: 1rem;
    line-height: 1.375rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}
.dl-it-caption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-muted, #949ba4);
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 500;
}
.dl-it-error { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
.dl-it-link {
    all: unset;
    cursor: pointer;
    color: var(--text-link, #00a8fc);
    border-radius: 3px;
}
.dl-it-link:hover { text-decoration: underline; }
.dl-it-link:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 1px; }
`;
var stores = new Map;
function store(name) {
  let found = stores.get(name);
  if (found)
    return found;
  try {
    found = import_api.getStore(name);
  } catch {
    return;
  }
  stores.set(name, found);
  return found;
}
function discordLocale() {
  return store("LocaleStore")?.locale || document.documentElement.lang || navigator.language || "en";
}
var me;
var currentUserId = () => me ??= store("UserStore")?.getCurrentUser?.()?.id;
function isOwn(message) {
  const id = currentUserId();
  return !!id && message?.author?.id === id;
}

class Runtime {
  ctx;
  cache = new LRU(CACHE_SIZE);
  views = new LRU(CACHE_SIZE);
  listeners = new Map;
  epoch = 0;
  queue;
  cachedTarget;
  cachedOptions;
  constructor(ctx) {
    this.ctx = ctx;
    this.queue = new RateQueue(INTERVAL, MAX_QUEUED, (key) => {
      if (this.cache.peek(key)?.state === "loading") {
        this.cache.delete(key);
        this.emit(key);
      }
    });
  }
  subscribe(key, fn) {
    let set = this.listeners.get(key);
    if (!set)
      this.listeners.set(key, set = new Set);
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size && this.listeners.get(key) === set)
        this.listeners.delete(key);
    };
  }
  emit(key) {
    if (key === undefined) {
      this.epoch++;
      for (const set2 of [...this.listeners.values()])
        for (const fn of [...set2])
          fn();
      return;
    }
    const set = this.listeners.get(key);
    if (set)
      for (const fn of [...set])
        fn();
  }
  invalidate() {
    this.cachedTarget = undefined;
    this.cachedOptions = undefined;
    this.emit();
  }
  target() {
    return this.cachedTarget ??= normalizeLanguage(this.ctx.settings.get("target")) ?? googleLanguage(discordLocale());
  }
  autoMode() {
    return this.ctx.settings.get("autoMode");
  }
  autoOptions() {
    const id = currentUserId();
    if (this.cachedOptions && this.cachedOptions.currentUserId === id)
      return this.cachedOptions;
    return this.cachedOptions = {
      mode: this.autoMode(),
      languages: parseLanguageList(this.ctx.settings.get("autoLanguages")),
      target: this.target(),
      currentUserId: id,
      ignoreBots: this.ctx.settings.get("ignoreBots")
    };
  }
  setView(key, view) {
    if (view)
      this.views.set(key, view);
    else
      this.views.delete(key);
    this.emit(key);
  }
  request(message, urgent) {
    const content = message.content;
    const target = this.target();
    const key = cacheKey(message.id, target);
    const cached = this.cache.get(key);
    if (cached && cached.content === content) {
      if (cached.state === "done")
        return;
      if (cached.state === "error" && !urgent)
        return;
      if (cached.state === "loading" && (!urgent || !this.queue.has(key)))
        return;
    }
    this.cache.set(key, { state: "loading", content });
    this.emit(key);
    this.queue.add(key, async () => {
      const auto = !urgent;
      try {
        const { text, tokens } = protect(content);
        const result = await this.ctx.native.call("translate", text, target);
        const translation = { source: result.source, text: restore(result.text, tokens) };
        if (this.cache.peek(key)?.content !== content)
          return;
        this.cache.set(key, { state: "done", content, result: translation });
        if (auto && !this.views.has(key) && shouldShowAuto(translation, content, this.autoOptions()))
          this.views.set(key, "shown");
      } catch (err) {
        const error = String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*(?:Error:\s*)?/, "");
        if (/\b429\b/.test(error))
          this.queue.pause(BACKOFF);
        if (this.cache.peek(key)?.content === content)
          this.cache.set(key, { state: "error", content, error });
        if (!auto)
          this.ctx.logger.warn("Translation failed", error);
      } finally {
        this.emit(key);
      }
    }, urgent);
  }
  toggle(message) {
    const key = cacheKey(message.id, this.target());
    if (this.views.peek(key) === "shown")
      return this.setView(key, "dismissed");
    this.views.set(key, "shown");
    this.request(message, true);
    this.emit(key);
  }
  isShown(message) {
    return this.views.peek(cacheKey(message.id, this.target())) === "shown";
  }
  snapshot(key) {
    return `${this.epoch}|${this.views.peek(key) ?? ""}|${this.cache.peek(key)?.state ?? ""}`;
  }
  dispose() {
    this.queue.stop();
    this.cache.clear();
    this.views.clear();
    this.emit();
  }
}
var active;
function RichText({ message, text }) {
  const render = useRenderedContent;
  const record = import_api.React.useMemo(() => message.set?.("content", text) ?? { ...message, content: text }, [message, text]);
  const rendered = render(record, { hideSimpleEmbedContent: false, formatInline: false, allowLinks: true, allowList: true, allowHeading: true });
  return /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
    children: rendered?.content ?? text
  });
}
function Caption({ children }) {
  const items = import_api.React.Children.toArray(children);
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "dl-it-caption",
    children: items.map((item, i) => /* @__PURE__ */ jsx_runtime.jsxs(import_api.React.Fragment, {
      children: [
        i > 0 && /* @__PURE__ */ jsx_runtime.jsx("span", {
          "aria-hidden": "true",
          children: "·"
        }),
        item
      ]
    }, i))
  });
}
function LinkButton({ onClick, children }) {
  return /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "dl-it-link",
    onClick,
    children
  });
}
function useMessageState(runtime, key) {
  const subscribe = import_api.React.useCallback((fn) => runtime.subscribe(key, fn), [runtime, key]);
  return import_api.React.useSyncExternalStore(subscribe, () => runtime.snapshot(key));
}
function Inline({ runtime, message }) {
  const target = runtime.target();
  const key = cacheKey(message.id, target);
  useMessageState(runtime, key);
  const entry = runtime.cache.peek(key);
  const view = runtime.views.peek(key);
  const content = typeof message.content === "string" ? message.content : "";
  import_api.React.useEffect(() => {
    if (!content)
      return;
    const shown = runtime.views.peek(key) === "shown";
    if (!shown && runtime.autoMode() === "off")
      return;
    const cached = runtime.cache.peek(key);
    if (cached && cached.content === content)
      return;
    if (shown)
      return runtime.request(message, true);
    if (runtime.views.peek(key) !== "dismissed" && shouldAutoTranslate(message, runtime.autoOptions()))
      runtime.request(message, false);
  }, [key, content, runtime.epoch]);
  if (!view || view === "dismissed" || !entry || entry.content !== content)
    return null;
  const dismiss = () => runtime.setView(key, "dismissed");
  const uiLocale = discordLocale();
  if (entry.state === "loading") {
    return /* @__PURE__ */ jsx_runtime.jsx("div", {
      className: "dl-it",
      role: "status",
      children: /* @__PURE__ */ jsx_runtime.jsx(Caption, {
        children: /* @__PURE__ */ jsx_runtime.jsx("span", {
          children: "Translating…"
        })
      })
    });
  }
  if (entry.state === "error") {
    return /* @__PURE__ */ jsx_runtime.jsx("div", {
      className: "dl-it",
      role: "alert",
      children: /* @__PURE__ */ jsx_runtime.jsxs(Caption, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "dl-it-error",
            children: "Couldn't translate this message"
          }),
          /* @__PURE__ */ jsx_runtime.jsx(LinkButton, {
            onClick: () => {
              runtime.setView(key, "shown");
              runtime.request(message, true);
            },
            children: "Retry"
          }),
          /* @__PURE__ */ jsx_runtime.jsx(LinkButton, {
            onClick: dismiss,
            children: "Dismiss"
          })
        ]
      })
    });
  }
  const from = languageName(entry.result.source, uiLocale);
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-it",
    lang: target,
    children: [
      view === "shown" && /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: `dl-it-text ${markupClass}`,
        children: useRenderedContent ? /* @__PURE__ */ jsx_runtime.jsx(RichText, {
          message,
          text: entry.result.text
        }) : entry.result.text
      }),
      /* @__PURE__ */ jsx_runtime.jsxs(Caption, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            children: [
              "Translated from ",
              from
            ]
          }),
          view === "shown" ? /* @__PURE__ */ jsx_runtime.jsx(LinkButton, {
            onClick: () => runtime.setView(key, "collapsed"),
            children: "Show original"
          }) : /* @__PURE__ */ jsx_runtime.jsx(LinkButton, {
            onClick: () => runtime.setView(key, "shown"),
            children: "Show translation"
          }),
          /* @__PURE__ */ jsx_runtime.jsx(LinkButton, {
            onClick: dismiss,
            children: "Dismiss"
          })
        ]
      })
    ]
  });
}
function TranslateIcon(props) {
  return /* @__PURE__ */ jsx_runtime.jsx("svg", {
    className: props.className,
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    fill: props.color ?? "currentColor",
    children: /* @__PURE__ */ jsx_runtime.jsx("path", {
      d: "M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"
    })
  });
}
function HoverButton({ runtime, Button, message }) {
  useMessageState(runtime, cacheKey(message.id, runtime.target()));
  const shown = runtime.isShown(message);
  return /* @__PURE__ */ jsx_runtime.jsx(Button, {
    label: shown ? "Hide Translation" : "Translate",
    icon: TranslateIcon,
    onClick: () => runtime.toggle(message)
  });
}
var canTranslate = (message) => !!message?.id && typeof message.content === "string" && isTranslatable(message.content) && !isOwn(message);
var inline_translate_default = import_api.definePlugin({
  settings,
  patches: [{
    find: '},"reply-other")',
    replace: {
      match: /(\(0,\i\.jsx\)\((\i),\{label:[^{}]*?onClick:\i=>\(0,\i\.\i\)\((\i),(\i),\i\)\},"reply-other"\):null,)/,
      with: "$1$self.hoverButton($2,$3,$4),"
    }
  }],
  hoverButton(Button, _channel, message) {
    try {
      const runtime = active;
      if (!runtime || !Button || !runtime.ctx.settings.get("hoverButton") || !canTranslate(message))
        return null;
      return /* @__PURE__ */ jsx_runtime.jsx(HoverButton, {
        runtime,
        Button,
        message
      }, "evi-translate");
    } catch {
      return null;
    }
  },
  start(ctx) {
    const runtime = new Runtime(ctx);
    active = runtime;
    ctx.onDispose(() => {
      if (active === runtime)
        active = undefined;
      runtime.dispose();
    });
    ctx.addStyle(css);
    ctx.waitFor(renderedContentFilter, (fn) => void (useRenderedContent = fn));
    ctx.waitFor(markupFilter, (classes) => {
      markupClass = Object.values(classes).find((c) => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) ?? "";
    });
    ctx.hookExport("after", accessoriesFilter, ({ args, result }) => {
      const props = args[0];
      const message = props?.channelMessageProps?.message;
      if (result == null || props.isMessageSnapshot || !message?.id || typeof message.content !== "string" || !message.content)
        return;
      return /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsx(Inline, {
            runtime,
            message
          }, "evi-translate"),
          result
        ]
      });
    });
    ctx.contextMenu("message", (children, { message }) => {
      if (!canTranslate(message))
        return;
      (import_api.findMenuGroup(children, "copy-text") ?? children).push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
        id: "evi-inline-translate",
        label: runtime.isShown(message) ? "Hide Translation" : "Translate",
        action: () => runtime.toggle(message)
      }));
    });
    ctx.settings.onChange(() => runtime.invalidate());
    const locale = store("LocaleStore");
    let lastLocale = locale?.locale;
    const onLocale = () => {
      if (locale.locale === lastLocale)
        return;
      lastLocale = locale.locale;
      runtime.invalidate();
    };
    locale?.addChangeListener?.(onLocale);
    ctx.onDispose(() => locale?.removeChangeListener?.(onLocale));
    ctx.flux.subscribe("CONNECTION_OPEN", () => {
      me = undefined;
      runtime.invalidate();
    });
    ctx.onDispose(() => void (me = undefined));
  }
});
