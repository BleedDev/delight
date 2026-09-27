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

// plugins/timezones/index.tsx
var exports_timezones = {};
__export(exports_timezones, {
  default: () => timezones_default
});
module.exports = __toCommonJS(exports_timezones);
var import_api = require("@evi/api");

// plugins/timezones/tz.ts
var valid = new Map;
function isValidZone(zone) {
  if (typeof zone !== "string" || !zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone))
    return false;
  let ok = valid.get(zone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      ok = true;
    } catch {
      ok = false;
    }
    valid.set(zone, ok);
  }
  return ok;
}
var SNOWFLAKE = /^\d{5,25}$/;
function parseZones(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return out;
  for (const [id, zone] of Object.entries(raw)) {
    if (SNOWFLAKE.test(id) && isValidZone(zone))
      out[id] = zone;
  }
  return out;
}
function withZone(map, userId, zone) {
  if (!SNOWFLAKE.test(userId) || !isValidZone(zone) || map[userId] === zone)
    return map;
  return { ...map, [userId]: zone };
}
function withoutZone(map, userId) {
  if (!(userId in map))
    return map;
  const next = { ...map };
  delete next[userId];
  return next;
}
function allZones(supported) {
  let zones = supported ?? [];
  if (!supported) {
    try {
      zones = Intl.supportedValuesOf?.("timeZone") ?? [];
    } catch {}
  }
  if (!zones.length)
    zones = Object.values(ABBREVIATIONS).flat();
  return [...new Set(["UTC", ...zones])].filter((z) => (z === "UTC" || z.includes("/") && !z.startsWith("Etc/")) && isValidZone(z));
}
var RENAMED = [
  ["Asia/Kolkata", "Asia/Calcutta"],
  ["Europe/Kyiv", "Europe/Kiev"],
  ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
  ["Asia/Kathmandu", "Asia/Katmandu"],
  ["Asia/Yangon", "Asia/Rangoon"],
  ["America/Argentina/Buenos_Aires", "America/Buenos_Aires"],
  ["America/Nuuk", "America/Godthab"],
  ["America/Indiana/Indianapolis", "America/Indianapolis"],
  ["America/Kentucky/Louisville", "America/Louisville"],
  ["Atlantic/Faroe", "Atlantic/Faeroe"],
  ["Africa/Asmara", "Africa/Asmera"],
  ["Pacific/Chuuk", "Pacific/Truk"],
  ["Pacific/Pohnpei", "Pacific/Ponape"],
  ["Pacific/Kanton", "Pacific/Enderbury"],
  ["Asia/Thimphu", "Asia/Thimbu"],
  ["Asia/Dhaka", "Asia/Dacca"],
  ["Asia/Ulaanbaatar", "Asia/Ulan_Bator"]
];
var OTHER_NAME = new Map(RENAMED.flatMap(([a, b]) => [[a, b], [b, a]]));
function resolveIn(zone, known) {
  if (known.has(zone))
    return zone;
  const other = OTHER_NAME.get(zone);
  return other && known.has(other) ? other : undefined;
}
var sameZone = (a, b) => a === b || OTHER_NAME.get(a) === b;
var partsFormatters = new Map;
function offsetMinutes(zone, date) {
  let f = partsFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    partsFormatters.set(zone, f);
  }
  const p = {};
  for (const part of f.formatToParts(date))
    if (part.type !== "literal")
      p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  const t = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - t) / 60000);
}
function formatOffset(minutes) {
  if (!minutes)
    return "UTC";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
function describeDiff(theirOffset, yourOffset) {
  const diff = theirOffset - yourOffset;
  if (!diff)
    return "same time as you";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
  return `${amount} ${diff > 0 ? "ahead of" : "behind"} you`;
}
function localeUses12h(locale) {
  try {
    const o = new Intl.DateTimeFormat(locale || "en-US", { hour: "numeric" }).resolvedOptions();
    if (o.hourCycle)
      return o.hourCycle === "h11" || o.hourCycle === "h12";
    return !!o.hour12;
  } catch {
    return false;
  }
}
var formatters = new Map;
var ODD_SPACES = new RegExp(`[${String.fromCharCode(8239, 160)}]`, "g");
var MARKS = new RegExp(`[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`, "g");
function formatter(zone, o) {
  const key = `${zone}|${o.cycle}|${o.locale ?? ""}|${o.weekday ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    const opts = {
      timeZone: zone,
      hour: o.cycle === "24h" ? "2-digit" : "numeric",
      minute: "2-digit",
      hourCycle: o.cycle === "24h" ? "h23" : "h12",
      ...o.weekday ? { weekday: "short" } : {}
    };
    try {
      f = new Intl.DateTimeFormat(o.locale || "en-US", opts);
    } catch {
      f = new Intl.DateTimeFormat("en-US", opts);
    }
    if (formatters.size > 2000)
      formatters.clear();
    formatters.set(key, f);
  }
  return f;
}
function formatTime(date, zone, o) {
  return formatter(zone, o).format(date).replace(ODD_SPACES, " ").replace(/,(?= )/, "");
}
function describeTime(date, zone, yourZone, o) {
  const theirs = offsetMinutes(zone, date);
  const yours = offsetMinutes(yourZone, date);
  return {
    short: formatTime(date, zone, o),
    long: formatTime(date, zone, { ...o, weekday: true }),
    offset: formatOffset(theirs),
    diff: describeDiff(theirs, yours)
  };
}
function tooltipText(d, label = "Their time") {
  return `${label}: ${d.long} (${d.offset}) · ${d.diff}`;
}
var ABBREVIATIONS = {
  UTC: ["UTC"],
  GMT: ["Europe/London", "UTC"],
  BST: ["Europe/London"],
  WET: ["Europe/Lisbon"],
  WEST: ["Europe/Lisbon"],
  IST: ["Asia/Kolkata", "Europe/Dublin", "Asia/Jerusalem"],
  CET: ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Vienna", "Europe/Brussels", "Europe/Prague"],
  CEST: ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Vienna", "Europe/Brussels", "Europe/Prague"],
  EET: ["Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest", "Africa/Cairo"],
  EEST: ["Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest"],
  TRT: ["Europe/Istanbul"],
  MSK: ["Europe/Moscow"],
  GST: ["Asia/Dubai"],
  PKT: ["Asia/Karachi"],
  ICT: ["Asia/Bangkok", "Asia/Ho_Chi_Minh"],
  WIB: ["Asia/Jakarta"],
  SGT: ["Asia/Singapore"],
  HKT: ["Asia/Hong_Kong"],
  PHT: ["Asia/Manila"],
  CST: ["America/Chicago", "Asia/Shanghai", "America/Mexico_City"],
  CDT: ["America/Chicago"],
  JST: ["Asia/Tokyo"],
  KST: ["Asia/Seoul"],
  AWST: ["Australia/Perth"],
  ACST: ["Australia/Adelaide", "Australia/Darwin"],
  ACDT: ["Australia/Adelaide"],
  AEST: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane"],
  AEDT: ["Australia/Sydney", "Australia/Melbourne"],
  NZST: ["Pacific/Auckland"],
  NZDT: ["Pacific/Auckland"],
  EST: ["America/New_York", "America/Toronto", "America/Detroit"],
  EDT: ["America/New_York", "America/Toronto"],
  ET: ["America/New_York"],
  MST: ["America/Denver", "America/Phoenix", "America/Edmonton"],
  MDT: ["America/Denver"],
  MT: ["America/Denver"],
  PST: ["America/Los_Angeles", "America/Vancouver", "America/Tijuana"],
  PDT: ["America/Los_Angeles"],
  PT: ["America/Los_Angeles"],
  CT: ["America/Chicago"],
  AKST: ["America/Anchorage"],
  AKDT: ["America/Anchorage"],
  HST: ["Pacific/Honolulu"],
  AST: ["America/Halifax", "Asia/Riyadh"],
  NST: ["America/St_Johns"],
  BRT: ["America/Sao_Paulo"],
  ART: ["America/Argentina/Buenos_Aires"],
  SAST: ["Africa/Johannesburg"],
  WAT: ["Africa/Lagos"],
  EAT: ["Africa/Nairobi"]
};
var ALIASES = {
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  california: "America/Los_Angeles",
  boston: "America/New_York",
  miami: "America/New_York",
  washington: "America/New_York",
  atlanta: "America/New_York",
  dallas: "America/Chicago",
  houston: "America/Chicago",
  texas: "America/Chicago",
  montreal: "America/Toronto",
  ottawa: "America/Toronto",
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  "new delhi": "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  india: "Asia/Kolkata",
  beijing: "Asia/Shanghai",
  china: "Asia/Shanghai",
  japan: "Asia/Tokyo",
  korea: "Asia/Seoul",
  turkey: "Europe/Istanbul",
  ankara: "Europe/Istanbul",
  germany: "Europe/Berlin",
  munich: "Europe/Berlin",
  france: "Europe/Paris",
  spain: "Europe/Madrid",
  barcelona: "Europe/Madrid",
  italy: "Europe/Rome",
  milan: "Europe/Rome",
  netherlands: "Europe/Amsterdam",
  england: "Europe/London",
  uk: "Europe/London",
  manchester: "Europe/London",
  ukraine: "Europe/Kyiv",
  kiev: "Europe/Kyiv",
  russia: "Europe/Moscow",
  "saint petersburg": "Europe/Moscow",
  brazil: "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  vietnam: "Asia/Ho_Chi_Minh",
  hanoi: "Asia/Bangkok",
  philippines: "Asia/Manila",
  indonesia: "Asia/Jakarta",
  uae: "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  israel: "Asia/Jerusalem",
  "tel aviv": "Asia/Jerusalem",
  egypt: "Africa/Cairo",
  canberra: "Australia/Sydney",
  "new zealand": "Pacific/Auckland",
  wellington: "Pacific/Auckland",
  hawaii: "Pacific/Honolulu",
  alaska: "America/Anchorage"
};
var normalize = (s) => s.normalize("NFD").replace(MARKS, "").toLowerCase().replace(/[_/\-.,()]+/g, " ").replace(/\s+/g, " ").trim();
var cityOf = (zone) => zone.split("/").pop().replace(/_/g, " ");
var regionOf = (zone) => zone.split("/").slice(0, -1).map((s) => s.replace(/_/g, " ")).join(" · ");
function parseOffsetQuery(q) {
  const m = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(q.trim()) ?? /^(?:utc|gmt)$/i.exec(q.trim());
  if (!m)
    return;
  if (!m[1])
    return 0;
  const h = Number(m[2]);
  const min = Number(m[3] ?? 0);
  if (h > 14 || min >= 60)
    return;
  return (m[1] === "-" ? -1 : 1) * (h * 60 + min);
}
function searchZones(query, zones, date, limit = Infinity) {
  const q = normalize(query);
  if (!q) {
    const withOffset = zones.map((z) => [z, offsetMinutes(z, date)]);
    withOffset.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    return withOffset.slice(0, limit).map(([z]) => z);
  }
  const scores = new Map;
  const offer = (zone, score) => {
    const old = scores.get(zone);
    if (old === undefined || score < old)
      scores.set(zone, score);
  };
  const { known, popular } = zoneIndex(zones);
  const rawUpper = query.trim().toUpperCase();
  const abbr = ABBREVIATIONS[rawUpper];
  abbr?.forEach((z, i) => {
    const found = resolveIn(z, known);
    if (found)
      offer(found, 100 + i);
  });
  for (const [alias, zone] of Object.entries(ALIASES)) {
    const found = resolveIn(zone, known);
    if (!found)
      continue;
    if (alias === q)
      offer(found, 200);
    else if (alias.startsWith(q) && q.length >= 3)
      offer(found, 450);
  }
  for (const zone of zones) {
    const other = OTHER_NAME.get(zone);
    const ids = other ? [normalize(zone), normalize(other)] : [normalize(zone)];
    const cities = (other ? [zone, other] : [zone]).map((z) => normalize(cityOf(z)));
    const bonus = popular.has(zone) ? 0 : 30;
    if (ids.includes(q))
      offer(zone, 0);
    else if (cities.includes(q))
      offer(zone, 300);
    else if (cities.some((c) => c.startsWith(q)))
      offer(zone, 400 + bonus + Math.min(...cities.map((c) => c.length)));
    else if (ids.some((id) => ` ${id}`.includes(` ${q}`)))
      offer(zone, 500 + bonus + ids[0].length);
    else if (ids.some((id) => id.includes(q)))
      offer(zone, 600 + bonus + ids[0].length);
  }
  const offset = parseOffsetQuery(query);
  if (offset !== undefined) {
    for (const zone of zones)
      if (offsetMinutes(zone, date) === offset)
        offer(zone, popular.has(zone) ? 700 : 730);
  } else if (!abbr && /^[a-z]{2,5}$/i.test(query.trim())) {
    for (const zone of zones) {
      if (shortName(zone, date).toUpperCase() === rawUpper)
        offer(zone, 650);
    }
  }
  return [...scores].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([z]) => z);
}
var popularCache;
function zoneIndex(zones) {
  if (popularCache?.zones === zones)
    return popularCache;
  const known = new Set(zones);
  const popular = new Set;
  for (const z of [...Object.values(ABBREVIATIONS).flat(), ...Object.values(ALIASES)]) {
    const found = resolveIn(z, known);
    if (found)
      popular.add(found);
  }
  return popularCache = { zones, known, popular };
}
var shortNames = new Map;
function shortName(zone, date) {
  let f = shortNames.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" });
    shortNames.set(zone, f);
  }
  return f.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
}
function localZone() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidZone(z) ? z : "UTC";
  } catch {
    return "UTC";
  }
}

// plugins/timezones/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var profileBadgesFilter = import_api.filters.byCode("getBadges()??[]", "hidePersonalInformation");
var usernameFilter = import_api.filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
var listRowFilter = import_api.filters.componentByCode("wrapContent:", "decorators:", "avatarClassName:");
var BADGES = 1;
var STORAGE_KEY = "zones";
var settings = {
  timeFormat: {
    type: "select",
    label: "Time format",
    description: "Auto follows Discord's language.",
    default: "auto",
    options: [
      { label: "Auto", value: "auto" },
      { label: "12-hour (3:42 PM)", value: "12h" },
      { label: "24-hour (15:42)", value: "24h" }
    ]
  },
  chatTime: {
    type: "select",
    label: "Time in chat",
    description: "Their time right now, or what their clock said when they sent the message.",
    default: "current",
    options: [
      { label: "Current time", value: "current" },
      { label: "When the message was sent", value: "sent" }
    ]
  },
  showInChat: { type: "boolean", label: "In chat", description: "After the name on each message.", default: true },
  showOnProfiles: { type: "boolean", label: "On profiles", description: "A clock next to the badges; hover it for their time.", default: true },
  showInMemberList: { type: "boolean", label: "In the member list", description: "After each name in the member list.", default: false }
};
var context;
var zones = {};
var yourZone = "UTC";
var zoneList;
var getZoneList = () => zoneList ??= allZones();
var store = (name) => {
  try {
    return import_api.getStore(name);
  } catch {
    return;
  }
};
var storage = () => context?.settings;
var version = 0;
var listeners = new Set;
var bump = () => {
  version++;
  listeners.forEach((l) => l());
};
function useVersion() {
  return import_api.React.useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  }, () => version);
}
function commit(next) {
  if (next === zones)
    return;
  zones = next;
  storage()?.set(STORAGE_KEY, zones);
  bump();
}
var locale = () => document.documentElement.lang || navigator.language || "en-US";
function cycle() {
  const f = context?.settings.get("timeFormat") ?? "auto";
  return f === "12h" || f === "24h" ? f : localeUses12h(locale()) ? "12h" : "24h";
}
var describeAt = (zone, at) => describeTime(at, zone, yourZone, { cycle: cycle(), locale: locale() });
function zoneOf(userId) {
  return userId ? zones[userId] : undefined;
}
function toDate(timestamp) {
  const ms = typeof timestamp === "number" ? timestamp : typeof timestamp === "string" ? Date.parse(timestamp) : typeof timestamp?.valueOf === "function" ? Number(timestamp.valueOf()) : NaN;
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}
function userName(userId) {
  const user = store("UserStore")?.getUser?.(userId);
  return user?.globalName || user?.username || "them";
}
function WithTooltip({ text, children }) {
  const Tooltip = import_api.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text,
    children
  }) : import_api.React.cloneElement(children, { title: text });
}
function ChatTime({ userId, sentAt }) {
  useVersion();
  const zone = zoneOf(userId);
  if (!zone || !context?.settings.get("showInChat"))
    return null;
  const sent = context.settings.get("chatTime") === "sent" && sentAt;
  const d = describeAt(zone, sent ? sentAt : new Date);
  const text = sent ? tooltipText(d, "Their time when sent") : tooltipText(d);
  return /* @__PURE__ */ jsx_runtime.jsx(WithTooltip, {
    text,
    children: /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-tz-time",
      "data-where": "chat",
      "aria-label": text,
      children: d.short
    })
  });
}
function MemberTime({ userId }) {
  useVersion();
  const zone = zoneOf(userId);
  if (!zone || !context?.settings.get("showInMemberList"))
    return null;
  const d = describeAt(zone, new Date);
  const text = tooltipText(d);
  return /* @__PURE__ */ jsx_runtime.jsx(WithTooltip, {
    text,
    children: /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-tz-time",
      "data-where": "members",
      "aria-label": text,
      children: d.short
    })
  });
}
function clockIcon(zone, at) {
  const minutes = (at.getTime() / 60000 + offsetMinutes(zone, at)) % 1440;
  const m = minutes % 60;
  const h = minutes / 60 % 12;
  const hand = (deg, len) => {
    const r = (deg - 90) * Math.PI / 180;
    return `${(12 + Math.cos(r) * len).toFixed(2)} ${(12 + Math.sin(r) * len).toFixed(2)}`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#949ba4" stroke-width="2" stroke-linecap="round">` + `<circle cx="12" cy="12" r="9.5"/><path d="M12 12L${hand(h * 30, 4.5)}"/><path d="M12 12L${hand(m * 6, 6.5)}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
var closeOpen;
function openPicker(userId) {
  closeOpen?.();
  const container = document.createElement("div");
  document.body.append(container);
  const root = import_api.createRoot(container);
  const close = () => {
    if (closeOpen !== close)
      return;
    closeOpen = undefined;
    root.unmount();
    container.remove();
  };
  closeOpen = close;
  root.render(/* @__PURE__ */ jsx_runtime.jsx(Picker, {
    userId,
    onClose: close
  }));
}
function Picker({ userId, onClose }) {
  useVersion();
  const [query, setQuery] = import_api.React.useState("");
  const [active, setActive] = import_api.React.useState(0);
  const inputRef = import_api.React.useRef(null);
  const listRef = import_api.React.useRef(null);
  const now = new Date;
  const current = zoneOf(userId);
  const name = userName(userId);
  const results = import_api.React.useMemo(() => searchZones(query, getZoneList(), new Date), [query, version]);
  const listId = "evi-tz-results";
  import_api.React.useEffect(() => setActive(0), [query]);
  import_api.React.useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape")
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  import_api.React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (zone) => {
    commit(withZone(zones, userId, zone));
    context?.toast(`Timezone set for ${name}: ${cityOf(zone)}`, { type: "success" });
    onClose();
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length)
        return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    }
  };
  const cyc = cycle();
  const loc = locale();
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-tz-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-tz-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-tz-title",
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-tz-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              children: [
                /* @__PURE__ */ jsx_runtime.jsxs("h2", {
                  id: "evi-tz-title",
                  children: [
                    "Set timezone for ",
                    name
                  ]
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  children: current ? /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
                    children: [
                      "Now ",
                      cityOf(current),
                      ", ",
                      formatTime(now, current, { cycle: cyc, locale: loc, weekday: true }),
                      " there."
                    ]
                  }) : /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
                    children: "Search a city, a region, an abbreviation like EST, or an offset like UTC+3."
                  })
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-tz-close",
              "aria-label": "Close",
              onClick: onClose,
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "20",
                height: "20",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  d: "M6 6l12 12M18 6L6 18",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round"
                })
              })
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsx("div", {
          className: "evi-tz-search",
          children: /* @__PURE__ */ jsx_runtime.jsx("input", {
            ref: inputRef,
            type: "text",
            role: "combobox",
            "aria-expanded": "true",
            "aria-controls": listId,
            "aria-activedescendant": results[active] ? `evi-tz-opt-${active}` : undefined,
            "aria-label": "Search timezones",
            placeholder: "Istanbul, PST, UTC+3…",
            spellCheck: false,
            autoComplete: "off",
            value: query,
            onChange: (e) => setQuery(e.currentTarget.value),
            onKeyDown
          })
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-tz-list",
          id: listId,
          role: "listbox",
          "aria-label": "Timezones",
          ref: listRef,
          children: [
            results.length === 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
              className: "evi-tz-empty",
              role: "status",
              children: [
                "No timezone matches “",
                query,
                "”."
              ]
            }),
            results.map((zone, i) => {
              const offset = offsetMinutes(zone, now);
              const region = regionOf(zone);
              return /* @__PURE__ */ jsx_runtime.jsxs("div", {
                id: `evi-tz-opt-${i}`,
                "data-index": i,
                role: "option",
                "aria-selected": i === active,
                "data-current": current && sameZone(zone, current) ? "true" : undefined,
                className: "evi-tz-option",
                onMouseMove: () => i !== active && setActive(i),
                onClick: () => choose(zone),
                children: [
                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
                    className: "evi-tz-place",
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
                        className: "evi-tz-city",
                        children: [
                          cityOf(zone),
                          sameZone(zone, yourZone) && /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "evi-tz-tag",
                            children: "You"
                          })
                        ]
                      }),
                      region && /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "evi-tz-region",
                        children: region
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx_runtime.jsx("span", {
                    className: "evi-tz-offset",
                    children: formatOffset(offset)
                  }),
                  /* @__PURE__ */ jsx_runtime.jsx("span", {
                    className: "evi-tz-clock",
                    children: formatTime(now, zone, { cycle: cyc, locale: loc })
                  })
                ]
              }, zone);
            })
          ]
        })
      ]
    })
  });
}
function SavedPanel() {
  useVersion();
  const entries = Object.entries(zones);
  const now = new Date;
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "evi-tz-saved",
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "dl-label",
        children: "People"
      }),
      entries.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
        className: "dl-hint",
        children: "Nobody yet. Right-click someone and choose Set Timezone."
      }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
        children: entries.map(([id, zone]) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("span", {
              className: "evi-tz-saved-name",
              children: userName(id)
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("span", {
              className: "evi-tz-saved-zone",
              children: [
                cityOf(zone),
                " · ",
                formatTime(now, zone, { cycle: cycle(), locale: locale() })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-tz-link",
              onClick: () => openPicker(id),
              children: "Change"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-tz-link",
              "data-danger": "true",
              onClick: () => commit(withoutZone(zones, id)),
              children: "Remove"
            })
          ]
        }, id))
      })
    ]
  });
}
var css = `
.evi-tz-time { display: inline-block; margin-inline-start: 6px; color: var(--text-muted, #949ba4); font-size: 12px; font-weight: 500; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: baseline; cursor: default; }
.evi-tz-time[data-where="members"] { margin-inline-start: 4px; font-size: 11px; }
.evi-tz-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-tz-modal { width: min(520px, calc(100vw - 32px)); height: min(600px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-tz-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 12px; }
.evi-tz-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); overflow-wrap: anywhere; }
.evi-tz-head p { margin: 4px 0 0; font-size: 14px; line-height: 18px; color: var(--text-muted, #949ba4); }
.evi-tz-close { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-tz-close:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-tz-close:focus-visible, .evi-tz-link:focus-visible { outline: 2px solid var(--focus-primary, #00a8fc); outline-offset: 2px; }
.evi-tz-search { padding: 0 20px 12px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-tz-search input { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--input-border, rgba(255,255,255,.08));
  background: var(--input-background, var(--background-tertiary, #1e1f22)); color: inherit; font: inherit; font-size: 16px; outline: none; }
.evi-tz-search input:focus { border-color: var(--focus-primary, #00a8fc); }
.evi-tz-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.evi-tz-option { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.evi-tz-option[aria-selected="true"] { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-tz-option[data-current="true"] { box-shadow: inset 3px 0 0 var(--brand-500, #5865f2); }
.evi-tz-place { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-tz-city { font-size: 15px; line-height: 20px; color: var(--text-strong, var(--header-primary, #f2f3f5)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-tz-region { font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-tz-tag { margin-inline-start: 6px; padding: 1px 5px; border-radius: 4px; font-size: 11px; font-weight: 600; vertical-align: 1px; background: var(--background-modifier-accent, rgba(255,255,255,.08)); color: var(--text-muted, #949ba4); }
.evi-tz-offset { flex: none; width: 72px; text-align: end; font-size: 13px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-tz-clock { flex: none; width: 72px; text-align: end; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-tz-empty { margin: 16px 12px; font-size: 14px; color: var(--text-muted, #949ba4); }
.evi-tz-saved ul { list-style: none; margin: 8px 0 0; padding: 0; }
.evi-tz-saved li { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-tz-saved-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-tz-saved-zone { color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-tz-link { border: 0; padding: 0; background: none; font: inherit; font-size: 14px; color: var(--text-link, #00a8fc); cursor: pointer; }
.evi-tz-link[data-danger="true"] { color: var(--text-danger, #f23f43); }
.evi-tz-link:hover { text-decoration: underline; }
`;
var timezones_default = import_api.definePlugin({
  settings,
  start(ctx) {
    context = ctx;
    yourZone = localZone();
    zones = parseZones(storage()?.get(STORAGE_KEY));
    ctx.addStyle(css);
    ctx.settings.onChange(bump);
    ctx.onDispose(() => closeOpen?.());
    ctx.setTimeout(() => {
      bump();
      ctx.setInterval(bump, 60000);
    }, 60000 - Date.now() % 60000 + 50);
    ctx.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      if (!userId)
        return;
      const zone = zoneOf(userId);
      children.push(/* @__PURE__ */ jsx_runtime.jsxs(import_api.Menu.Group, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
            id: "evi-tz-set",
            label: "Set Timezone",
            subtext: zone ? `${cityOf(zone)} · ${formatTime(new Date, zone, { cycle: cycle(), locale: locale() })}` : undefined,
            action: () => openPicker(userId)
          }),
          zone && /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
            id: "evi-tz-remove",
            label: "Remove Timezone",
            color: "danger",
            action: () => commit(withoutZone(zones, userId))
          })
        ]
      }, "evi-tz-group"));
    });
    ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
      if (!ctx.settings.get("showOnProfiles"))
        return;
      const zone = zoneOf(args[0]?.userId);
      if (!zone || !isValidZone(zone))
        return;
      const now = new Date;
      const badge = { id: "evi-timezone", description: tooltipText(describeAt(zone, now)), iconSrc: clockIcon(zone, now) };
      return [...Array.isArray(result) ? result : [], badge];
    });
    ctx.hookExport("before", usernameFilter, ({ args }) => {
      const props = args[0];
      const author = props?.message?.author;
      if (!author?.id || !props.decorations || !(BADGES in props.decorations))
        return;
      const existing = props.decorations[BADGES];
      const ours = /* @__PURE__ */ jsx_runtime.jsx(ChatTime, {
        userId: author.id,
        sentAt: toDate(props.message.timestamp)
      }, "evi-tz");
      args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...Array.isArray(existing) ? existing : existing != null ? [existing] : [], ours] } };
    });
    ctx.hookExport("before", listRowFilter, ({ args }) => {
      const props = args[0];
      const userId = props?.avatar?.props?.user?.id;
      if (!userId)
        return;
      args[0] = { ...props, decorators: /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
        children: [
          props.decorators,
          /* @__PURE__ */ jsx_runtime.jsx(MemberTime, {
            userId
          })
        ]
      }) };
    });
  },
  stop() {
    closeOpen?.();
    context = undefined;
    bump();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime.jsx(SavedPanel, {})
});
