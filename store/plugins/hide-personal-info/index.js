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

// plugins/hide-personal-info/index.ts
var exports_hide_personal_info = {};
__export(exports_hide_personal_info, {
  default: () => hide_personal_info_default
});
module.exports = __toCommonJS(exports_hide_personal_info);
var import_api = require("@evi/api");

// plugins/hide-personal-info/detect.ts
var emptyKnown = () => ({ substrings: [], exact: [], phones: [] });
var EMAIL = /[\p{L}\p{N}._%+\-*•]+@[\p{L}\p{N}\-]+(?:\.[\p{L}\p{N}\-]+)*\.\p{L}{2,}/u;
var MASK = /(?:[*•●∙]{2,}[\s-]?){1,4}\d{2,4}\b/;
var ENDING_IN = /\bend(?:ing|s) in \d{4}\b/i;
var IPV4 = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.]|\.\d)/;
var IPV6_CANDIDATE = /(?<![\w:.])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
var PHONE_CANDIDATE = /(?<![\w.:/\-+])(?:\+|\b00)?\(?\d[\d\s().\-]{5,}\d(?![\w:/]|\.\d)/g;
var DATE_LIKE = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})$/;
function isIpv6(candidate) {
  const doubles = candidate.split("::").length - 1;
  if (doubles > 1)
    return false;
  const groups = candidate.split(":").filter((g) => g !== "");
  if (groups.length === 0 || groups.some((g) => g.length > 4))
    return false;
  if (doubles === 0 && groups.length !== 8)
    return false;
  if (doubles === 1 && groups.length > 7)
    return false;
  return groups.some((g) => g.length >= 3 || /[a-f]/i.test(g));
}
function isPhone(raw) {
  const candidate = raw.trim();
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15)
    return false;
  if (DATE_LIKE.test(candidate))
    return false;
  const international = /^(?:\+|00)/.test(candidate);
  if (international)
    return digits.length >= 8;
  const groups = candidate.replace(/[()]/g, " ").split(/[\s.\-]+/).filter(Boolean);
  if (groups.length < 2)
    return false;
  const separators = new Set(candidate.replace(/[\d()]/g, "").replace(/\s+/g, " ").split(""));
  if (separators.size === 1 && separators.has(".") && groups.every((g) => g.length <= 3))
    return false;
  const areaCode = /^\(\d{2,5}\)/.test(candidate);
  if (areaCode)
    return digits.length >= 7;
  return digits.length >= 10 && groups.length <= 5 && groups.every((g) => g.length >= 2 && g.length <= 5);
}
var escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function containsWord(text, value) {
  const v = value.trim();
  if (v.length < 3)
    return false;
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(v)}(?![\\p{L}\\p{N}_])`, "iu").test(text);
}
function matchesKnown(text, known) {
  if (known.substrings.some((v) => containsWord(text, v)))
    return true;
  const trimmed = text.trim().toLowerCase();
  if (trimmed && known.exact.some((v) => v.trim().length >= 2 && v.trim().toLowerCase() === trimmed))
    return true;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 7) {
    for (const phone of known.phones) {
      const p = phone.replace(/\D/g, "");
      if (p.length >= 7 && (digits.includes(p) || digits.includes(p.slice(-7))))
        return true;
    }
  }
  return false;
}
function detectSensitive(text, known = emptyKnown()) {
  if (!text || !text.trim())
    return null;
  if (matchesKnown(text, known))
    return "known";
  if (EMAIL.test(text))
    return "email";
  if (MASK.test(text) || ENDING_IN.test(text))
    return "card";
  if (IPV4.test(text))
    return "ip";
  for (const m of text.matchAll(IPV6_CANDIDATE))
    if (isIpv6(m[0]))
      return "ip";
  for (const m of text.matchAll(PHONE_CANDIDATE))
    if (isPhone(m[0]))
      return "phone";
  return null;
}
function collectKnown(src) {
  const known = emptyKnown();
  const add = (list, v) => {
    if (typeof v === "string" && v.trim() && !list.includes(v.trim()))
      list.push(v.trim());
  };
  const { user } = src;
  if (user) {
    add(known.substrings, user.email);
    add(known.phones, user.phone);
    add(known.substrings, user.username);
    if (user.username && user.discriminator && user.discriminator !== "0")
      add(known.substrings, `${user.username}#${user.discriminator}`);
  }
  for (const a of src.connectedAccounts ?? [])
    add(known.substrings, a?.name);
  for (const t of src.authorizedApps ?? [])
    add(known.exact, t?.application?.name);
  for (const s of src.sessions ?? []) {
    add(known.substrings, s?.client_info?.location);
    add(known.substrings, s?.client_info?.ip);
  }
  for (const p of Object.values(src.paymentSources ?? {})) {
    add(known.substrings, p?.email);
    for (const [key, value] of Object.entries(p?.billingAddress ?? {})) {
      if (key !== "country")
        add(known.substrings, value);
    }
  }
  return known;
}

// plugins/hide-personal-info/index.ts
var BLUR = "evi-hpi-blur";
var REVEALED = "evi-hpi-revealed";
var MODE_ATTR = "data-evi-hpi";
var CLASSIC_ROOT = '[class*="standardSidebarView_"]';
var DIALOG_ROOT = '[role="dialog"], [aria-modal="true"]';
var SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SVG", "CODE"]);
var settings = {
  enabled: { type: "boolean", label: "Enabled", description: "Blur personal info in User Settings. /hidepersonal toggles this.", default: true },
  onlyStreamerMode: { type: "boolean", label: "Only in Streamer Mode", description: "Only blur while Discord's Streamer Mode is on, instead of always.", default: false },
  reveal: {
    type: "select",
    label: "Reveal",
    description: "How to see a blurred value.",
    default: "hover",
    options: [
      { label: "Hover to reveal", value: "hover" },
      { label: "Click to reveal", value: "click" },
      { label: "Never", value: "never" }
    ]
  }
};
var context;
var modalOpen = false;
var observer;
var observedRoots = [];
var pending = new Set;
var flushTimer;
var tagged = new Set;
function isActive() {
  if (!context?.settings.get("enabled"))
    return false;
  if (!context.settings.get("onlyStreamerMode"))
    return true;
  return !!import_api.findStore("StreamerModeStore")?.enabled;
}
function findRoots() {
  const roots = [...document.querySelectorAll(CLASSIC_ROOT)];
  if (modalOpen)
    roots.push(...document.querySelectorAll(DIALOG_ROOT));
  return roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
}
function known() {
  const get = (name) => {
    try {
      return import_api.findStore(name);
    } catch {
      return;
    }
  };
  const call = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  };
  return collectKnown({
    user: call(() => get("UserStore")?.getCurrentUser?.()),
    connectedAccounts: call(() => get("ConnectedAccountsStore")?.getAccounts?.()),
    authorizedApps: call(() => get("AuthorizedAppsStore")?.getNewestTokens?.()),
    sessions: call(() => get("AuthSessionsStore")?.getSessions?.()),
    paymentSources: call(() => get("PaymentSourceStore")?.paymentSources)
  });
}
function tag(el) {
  if (el.classList.contains(BLUR))
    return;
  el.classList.add(BLUR);
  tagged.add(el);
}
function untag(el) {
  el.classList.remove(BLUR, REVEALED);
  tagged.delete(el);
}
function checkText(node, values) {
  const el = node.parentElement;
  if (!el || SKIP.has(el.tagName.toUpperCase()) || el.closest('[contenteditable="true"]'))
    return;
  if (detectSensitive(node.data, values))
    tag(el);
}
function scan(node, values) {
  if (node.nodeType === Node.TEXT_NODE)
    return checkText(node, values);
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
    return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode();t; t = walker.nextNode())
    checkText(t, values);
}
function recheckTagged(values) {
  for (const el of tagged) {
    if (!el.isConnected)
      tagged.delete(el);
    else if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && detectSensitive(n.data, values)))
      untag(el);
  }
}
function flush() {
  flushTimer = undefined;
  if (!observer)
    return pending.clear();
  if (!observedRoots.some((r) => r.isConnected)) {
    pending.clear();
    return refresh();
  }
  const values = known();
  recheckTagged(values);
  for (const node of pending)
    if (node.isConnected)
      scan(node, values);
  pending.clear();
}
function schedule() {
  flushTimer ??= setTimeout(flush, 150);
}
function disconnect() {
  observer?.disconnect();
  observer = undefined;
  observedRoots = [];
  pending.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
}
function cleanAll() {
  for (const el of document.querySelectorAll(`.${BLUR}, .${REVEALED}`))
    el.classList.remove(BLUR, REVEALED);
  tagged.clear();
}
function refresh() {
  disconnect();
  if (!context || !isActive()) {
    cleanAll();
    return;
  }
  const roots = findRoots();
  if (!roots.length)
    return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData")
        pending.add(r.target);
      else if (r.type === "attributes") {
        if (tagged.has(r.target) && !r.target.classList.contains(BLUR))
          r.target.classList.add(BLUR);
        continue;
      } else
        r.addedNodes.forEach((n) => pending.add(n));
    }
    if (pending.size)
      schedule();
  });
  for (const root of roots) {
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    pending.add(root);
  }
  observedRoots = roots;
  schedule();
}
function applyMode() {
  const mode = context?.settings.get("reveal") ?? "hover";
  document.documentElement.setAttribute(MODE_ATTR, mode);
  if (mode !== "click")
    for (const el of document.querySelectorAll(`.${REVEALED}`))
      el.classList.remove(REVEALED);
}
function onClick(e) {
  if (context?.settings.get("reveal") !== "click")
    return;
  const el = e.target?.closest?.(`.${BLUR}`);
  if (el)
    el.classList.toggle(REVEALED);
}
function toggle() {
  if (!context)
    return "";
  const enabled = !context.settings.get("enabled");
  context.settings.set("enabled", enabled);
  return enabled ? "Personal info in User Settings is now blurred." : "Personal info is no longer blurred.";
}
var hide_personal_info_default = import_api.definePlugin({
  settings,
  toggle,
  detectSensitive,
  css: `
        .${BLUR} { filter: blur(6px); transition: filter 0.15s ease-out; }
        html[${MODE_ATTR}="hover"] .${BLUR}:hover,
        html[${MODE_ATTR}="click"] .${BLUR}.${REVEALED} { filter: none; }
        html[${MODE_ATTR}="click"] .${BLUR} { cursor: pointer; }
        html[${MODE_ATTR}="never"] .${BLUR} { user-select: none; }
        @media (prefers-reduced-motion: reduce) { .${BLUR} { transition: none; } }
    `,
  start(ctx) {
    context = ctx;
    modalOpen = false;
    applyMode();
    document.addEventListener("click", onClick, true);
    ctx.onDispose(() => {
      document.removeEventListener("click", onClick, true);
      disconnect();
      cleanAll();
      document.documentElement.removeAttribute(MODE_ATTR);
      context = undefined;
      modalOpen = false;
    });
    const openSoon = () => {
      refresh();
      ctx.setTimeout(() => !observer && refresh(), 300);
      ctx.setTimeout(() => !observer && refresh(), 1000);
    };
    ctx.flux.subscribe("USER_SETTINGS_MODAL_OPEN", () => {
      modalOpen = true;
      openSoon();
    });
    for (const type of ["USER_SETTINGS_MODAL_CLOSE", "LOGOUT"]) {
      ctx.flux.subscribe(type, () => {
        modalOpen = false;
        refresh();
      });
    }
    ctx.setInterval(() => {
      if (!observer && isActive() && document.querySelector(CLASSIC_ROOT))
        refresh();
    }, 1500);
    ctx.settings.onChange(() => {
      applyMode();
      refresh();
    });
    const streamerMode = import_api.findStore("StreamerModeStore");
    if (streamerMode?.addChangeListener) {
      let last = !!streamerMode.enabled;
      const onStreamerMode = () => {
        if (!!streamerMode.enabled === last)
          return;
        last = !!streamerMode.enabled;
        refresh();
      };
      streamerMode.addChangeListener(onStreamerMode);
      ctx.onDispose(() => streamerMode.removeChangeListener?.(onStreamerMode));
    }
    ctx.command({
      name: "hidepersonal",
      description: "Toggle blurring your personal info in User Settings",
      execute: () => ({ ephemeral: toggle() })
    });
    refresh();
  }
});
