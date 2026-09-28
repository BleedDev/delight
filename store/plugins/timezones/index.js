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
var import_api2 = require("@evi/api");

// src/shared/i18n.ts
function format(template, vars) {
  if (!vars)
    return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars) ? String(vars[name]) : whole);
}
var pluralRules = new Map;

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
var EN_WORDS = {
  "diff.same": "same time as you",
  "diff.ahead": "{amount} ahead of you",
  "diff.behind": "{amount} behind you",
  "amount.h": "{h}h",
  "amount.m": "{m}m",
  "amount.hm": "{h}h {m}m"
};
var english = (key, vars) => format(EN_WORDS[key], vars);
function describeDiff(theirOffset, yourOffset, tr = english) {
  const diff = theirOffset - yourOffset;
  if (!diff)
    return tr("diff.same");
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = h && m ? tr("amount.hm", { h, m }) : h ? tr("amount.h", { h }) : tr("amount.m", { m });
  return tr(diff > 0 ? "diff.ahead" : "diff.behind", { amount });
}
var uses12h = new Map;
function localeUses12h(locale) {
  const key = locale || "en-US";
  let found = uses12h.get(key);
  if (found !== undefined)
    return found;
  try {
    const o = new Intl.DateTimeFormat(key, { hour: "numeric" }).resolvedOptions();
    found = o.hourCycle ? o.hourCycle === "h11" || o.hourCycle === "h12" : !!o.hour12;
  } catch {
    found = false;
  }
  uses12h.set(key, found);
  return found;
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
function describeTime(date, zone, yourZone, o, tr) {
  const theirs = offsetMinutes(zone, date);
  const yours = offsetMinutes(yourZone, date);
  return {
    short: formatTime(date, zone, o),
    long: formatTime(date, zone, { ...o, weekday: true }),
    offset: formatOffset(theirs),
    diff: describeDiff(theirs, yours, tr)
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

// plugins/timezones/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    ...EN_WORDS,
    "settings.timeFormat": "Time format",
    "settings.timeFormat.description": "Auto follows Discord's language.",
    "settings.timeFormat.auto": "Auto",
    "settings.timeFormat.12h": "12-hour (3:42 PM)",
    "settings.timeFormat.24h": "24-hour (15:42)",
    "settings.chatTime": "Time in chat",
    "settings.chatTime.description": "Their time right now, or what their clock said when they sent the message.",
    "settings.chatTime.current": "Current time",
    "settings.chatTime.sent": "When the message was sent",
    "settings.inChat": "In chat",
    "settings.inChat.description": "After the name on each message.",
    "settings.onProfiles": "On profiles",
    "settings.onProfiles.description": "A clock next to the badges; hover it for their time.",
    "settings.inMemberList": "In the member list",
    "settings.inMemberList.description": "After each name in the member list.",
    "user.them": "them",
    "tooltip.theirs": "Their time",
    "tooltip.sent": "Their time when sent",
    "picker.title": "Set timezone for {name}",
    "picker.now": "Now {city}, {time} there.",
    "picker.hint": "Search a city, a region, an abbreviation like EST, or an offset like UTC+3.",
    "picker.close": "Close",
    "picker.search": "Search timezones",
    "picker.placeholder": "Istanbul, PST, UTC+3…",
    "picker.list": "Timezones",
    "picker.empty": "No timezone matches “{query}”.",
    "picker.you": "You",
    "toast.set": "Timezone set for {name}: {city}",
    "saved.people": "People",
    "saved.nobody": "Nobody yet. Right-click someone and choose Set Timezone.",
    "saved.change": "Change",
    "saved.remove": "Remove",
    "menu.set": "Set Timezone",
    "menu.remove": "Remove Timezone"
  },
  de: {
    "diff.same": "gleiche Zeit wie du",
    "diff.ahead": "{amount} vor dir",
    "diff.behind": "{amount} hinter dir",
    "amount.h": "{h} Std.",
    "amount.m": "{m} Min.",
    "amount.hm": "{h} Std. {m} Min.",
    "settings.timeFormat": "Zeitformat",
    "settings.timeFormat.description": "Automatisch richtet sich nach der Sprache von Discord.",
    "settings.timeFormat.auto": "Automatisch",
    "settings.timeFormat.12h": "12-Stunden (3:42 PM)",
    "settings.timeFormat.24h": "24-Stunden (15:42)",
    "settings.chatTime": "Zeit im Chat",
    "settings.chatTime.description": "Die aktuelle Uhrzeit der Person oder die, die bei ihr galt, als sie die Nachricht gesendet hat.",
    "settings.chatTime.current": "Aktuelle Uhrzeit",
    "settings.chatTime.sent": "Beim Senden der Nachricht",
    "settings.inChat": "Im Chat",
    "settings.inChat.description": "Hinter dem Namen bei jeder Nachricht.",
    "settings.onProfiles": "In Profilen",
    "settings.onProfiles.description": "Eine Uhr neben den Abzeichen. Fahre darüber, um die Uhrzeit zu sehen.",
    "settings.inMemberList": "In der Mitgliederliste",
    "settings.inMemberList.description": "Hinter jedem Namen in der Mitgliederliste.",
    "user.them": "die Person",
    "tooltip.theirs": "Ortszeit",
    "tooltip.sent": "Ortszeit beim Senden",
    "picker.title": "Zeitzone für {name} festlegen",
    "picker.now": "Dort ist es jetzt {time} ({city}).",
    "picker.hint": "Suche nach einer Stadt, einer Region, einer Abkürzung wie EST oder einem Offset wie UTC+3.",
    "picker.close": "Schließen",
    "picker.search": "Zeitzonen durchsuchen",
    "picker.placeholder": "Istanbul, PST, UTC+3…",
    "picker.list": "Zeitzonen",
    "picker.empty": "Keine Zeitzone passt zu „{query}“.",
    "picker.you": "Du",
    "toast.set": "Zeitzone für {name} festgelegt: {city}",
    "saved.people": "Personen",
    "saved.nobody": "Noch niemand. Klicke jemanden mit der rechten Maustaste an und wähle „Zeitzone festlegen“.",
    "saved.change": "Ändern",
    "saved.remove": "Entfernen",
    "menu.set": "Zeitzone festlegen",
    "menu.remove": "Zeitzone entfernen"
  },
  es: {
    "diff.same": "la misma hora que tú",
    "diff.ahead": "{amount} por delante de ti",
    "diff.behind": "{amount} por detrás de ti",
    "amount.h": "{h} h",
    "amount.m": "{m} min",
    "amount.hm": "{h} h {m} min",
    "settings.timeFormat": "Formato de hora",
    "settings.timeFormat.description": "Automático sigue el idioma de Discord.",
    "settings.timeFormat.auto": "Automático",
    "settings.timeFormat.12h": "12 horas (3:42 PM)",
    "settings.timeFormat.24h": "24 horas (15:42)",
    "settings.chatTime": "Hora en el chat",
    "settings.chatTime.description": "Su hora actual, o la que marcaba su reloj cuando envió el mensaje.",
    "settings.chatTime.current": "Hora actual",
    "settings.chatTime.sent": "Cuando se envió el mensaje",
    "settings.inChat": "En el chat",
    "settings.inChat.description": "Después del nombre en cada mensaje.",
    "settings.onProfiles": "En los perfiles",
    "settings.onProfiles.description": "Un reloj junto a las insignias; pasa el cursor por encima para ver su hora.",
    "settings.inMemberList": "En la lista de miembros",
    "settings.inMemberList.description": "Después de cada nombre en la lista de miembros.",
    "user.them": "esta persona",
    "tooltip.theirs": "Su hora",
    "tooltip.sent": "Su hora al enviarlo",
    "picker.title": "Establecer la zona horaria de {name}",
    "picker.now": "Ahora en {city} son las {time}.",
    "picker.hint": "Busca una ciudad, una región, una abreviatura como EST o un desfase como UTC+3.",
    "picker.close": "Cerrar",
    "picker.search": "Buscar zonas horarias",
    "picker.placeholder": "Estambul, PST, UTC+3…",
    "picker.list": "Zonas horarias",
    "picker.empty": "Ninguna zona horaria coincide con «{query}».",
    "picker.you": "Tú",
    "toast.set": "Zona horaria de {name} establecida: {city}",
    "saved.people": "Personas",
    "saved.nobody": "Todavía nadie. Haz clic derecho en alguien y elige Establecer zona horaria.",
    "saved.change": "Cambiar",
    "saved.remove": "Quitar",
    "menu.set": "Establecer zona horaria",
    "menu.remove": "Quitar zona horaria"
  },
  fr: {
    "diff.same": "même heure que toi",
    "diff.ahead": "{amount} d'avance sur toi",
    "diff.behind": "{amount} de retard sur toi",
    "amount.h": "{h} h",
    "amount.m": "{m} min",
    "amount.hm": "{h} h {m} min",
    "settings.timeFormat": "Format de l'heure",
    "settings.timeFormat.description": "Auto suit la langue de Discord.",
    "settings.timeFormat.auto": "Auto",
    "settings.timeFormat.12h": "12 heures (3:42 PM)",
    "settings.timeFormat.24h": "24 heures (15:42)",
    "settings.chatTime": "Heure dans le chat",
    "settings.chatTime.description": "Son heure actuelle, ou l'heure qu'il était chez cette personne quand elle a envoyé le message.",
    "settings.chatTime.current": "Heure actuelle",
    "settings.chatTime.sent": "À l'envoi du message",
    "settings.inChat": "Dans le chat",
    "settings.inChat.description": "Après le nom sur chaque message.",
    "settings.onProfiles": "Sur les profils",
    "settings.onProfiles.description": "Une horloge à côté des badges ; survole-la pour voir son heure.",
    "settings.inMemberList": "Dans la liste des membres",
    "settings.inMemberList.description": "Après chaque nom dans la liste des membres.",
    "user.them": "cette personne",
    "tooltip.theirs": "Son heure",
    "tooltip.sent": "Son heure à l'envoi",
    "picker.title": "Définir le fuseau horaire de {name}",
    "picker.now": "Là-bas ({city}), il est {time}.",
    "picker.hint": "Cherche une ville, une région, une abréviation comme EST ou un décalage comme UTC+3.",
    "picker.close": "Fermer",
    "picker.search": "Rechercher un fuseau horaire",
    "picker.placeholder": "Istanbul, PST, UTC+3…",
    "picker.list": "Fuseaux horaires",
    "picker.empty": "Aucun fuseau horaire ne correspond à « {query} ».",
    "picker.you": "Toi",
    "toast.set": "Fuseau horaire de {name} défini : {city}",
    "saved.people": "Personnes",
    "saved.nobody": "Personne pour l'instant. Fais un clic droit sur quelqu'un et choisis Définir le fuseau horaire.",
    "saved.change": "Modifier",
    "saved.remove": "Retirer",
    "menu.set": "Définir le fuseau horaire",
    "menu.remove": "Retirer le fuseau horaire"
  },
  ja: {
    "diff.same": "あなたと同じ時刻",
    "diff.ahead": "あなたより{amount}進んでいます",
    "diff.behind": "あなたより{amount}遅れています",
    "amount.h": "{h}時間",
    "amount.m": "{m}分",
    "amount.hm": "{h}時間{m}分",
    "settings.timeFormat": "時刻の形式",
    "settings.timeFormat.description": "「自動」は Discord の言語に合わせます。",
    "settings.timeFormat.auto": "自動",
    "settings.timeFormat.12h": "12時間制（3:42 PM）",
    "settings.timeFormat.24h": "24時間制（15:42）",
    "settings.chatTime": "チャットの時刻",
    "settings.chatTime.description": "相手の現在の時刻、またはメッセージを送信したときの相手の時計の時刻。",
    "settings.chatTime.current": "現在の時刻",
    "settings.chatTime.sent": "メッセージ送信時",
    "settings.inChat": "チャット",
    "settings.inChat.description": "各メッセージの名前の後ろに表示します。",
    "settings.onProfiles": "プロフィール",
    "settings.onProfiles.description": "バッジの横に時計を表示します。マウスを重ねると相手の時刻が表示されます。",
    "settings.inMemberList": "メンバーリスト",
    "settings.inMemberList.description": "メンバーリストの各名前の後ろに表示します。",
    "user.them": "この人",
    "tooltip.theirs": "相手の時刻",
    "tooltip.sent": "送信時の相手の時刻",
    "picker.title": "{name}のタイムゾーンを設定",
    "picker.now": "現在、{city}は{time}です。",
    "picker.hint": "都市名、地域名、EST などの略称、UTC+3 などのオフセットで検索できます。",
    "picker.close": "閉じる",
    "picker.search": "タイムゾーンを検索",
    "picker.placeholder": "Istanbul、PST、UTC+3…",
    "picker.list": "タイムゾーン",
    "picker.empty": "「{query}」に一致するタイムゾーンはありません。",
    "picker.you": "あなた",
    "toast.set": "{name}のタイムゾーンを設定しました：{city}",
    "saved.people": "ユーザー",
    "saved.nobody": "まだ誰も設定されていません。ユーザーを右クリックして「タイムゾーンを設定」を選んでください。",
    "saved.change": "変更",
    "saved.remove": "削除",
    "menu.set": "タイムゾーンを設定",
    "menu.remove": "タイムゾーンを削除"
  },
  pl: {
    "diff.same": "ta sama godzina co u Ciebie",
    "diff.ahead": "{amount} do przodu względem Ciebie",
    "diff.behind": "{amount} do tyłu względem Ciebie",
    "amount.h": "{h} godz.",
    "amount.m": "{m} min",
    "amount.hm": "{h} godz. {m} min",
    "settings.timeFormat": "Format czasu",
    "settings.timeFormat.description": "Automatyczny dopasowuje się do języka Discorda.",
    "settings.timeFormat.auto": "Automatyczny",
    "settings.timeFormat.12h": "12-godzinny (3:42 PM)",
    "settings.timeFormat.24h": "24-godzinny (15:42)",
    "settings.chatTime": "Czas na czacie",
    "settings.chatTime.description": "Aktualna godzina u tej osoby albo ta, którą miała na zegarze, gdy wysłała wiadomość.",
    "settings.chatTime.current": "Aktualny czas",
    "settings.chatTime.sent": "W chwili wysłania wiadomości",
    "settings.inChat": "Na czacie",
    "settings.inChat.description": "Po nazwie przy każdej wiadomości.",
    "settings.onProfiles": "W profilach",
    "settings.onProfiles.description": "Zegar obok odznak. Najedź na niego, aby zobaczyć godzinę tej osoby.",
    "settings.inMemberList": "Na liście członków",
    "settings.inMemberList.description": "Po każdej nazwie na liście członków.",
    "user.them": "ta osoba",
    "tooltip.theirs": "Czas tej osoby",
    "tooltip.sent": "Czas tej osoby w chwili wysłania",
    "picker.title": "Ustaw strefę czasową dla: {name}",
    "picker.now": "Teraz w miejscowości {city} jest {time}.",
    "picker.hint": "Wyszukaj miasto, region, skrót taki jak EST albo przesunięcie takie jak UTC+3.",
    "picker.close": "Zamknij",
    "picker.search": "Szukaj stref czasowych",
    "picker.placeholder": "Stambuł, PST, UTC+3…",
    "picker.list": "Strefy czasowe",
    "picker.empty": "Żadna strefa czasowa nie pasuje do „{query}”.",
    "picker.you": "Ty",
    "toast.set": "Ustawiono strefę czasową dla {name}: {city}",
    "saved.people": "Osoby",
    "saved.nobody": "Jeszcze nikogo. Kliknij kogoś prawym przyciskiem myszy i wybierz Ustaw strefę czasową.",
    "saved.change": "Zmień",
    "saved.remove": "Usuń",
    "menu.set": "Ustaw strefę czasową",
    "menu.remove": "Usuń strefę czasową"
  },
  "pt-BR": {
    "diff.same": "mesmo horário que o seu",
    "diff.ahead": "{amount} à frente de você",
    "diff.behind": "{amount} atrás de você",
    "amount.h": "{h}h",
    "amount.m": "{m}min",
    "amount.hm": "{h}h {m}min",
    "settings.timeFormat": "Formato de hora",
    "settings.timeFormat.description": "Automático segue o idioma do Discord.",
    "settings.timeFormat.auto": "Automático",
    "settings.timeFormat.12h": "12 horas (3:42 PM)",
    "settings.timeFormat.24h": "24 horas (15:42)",
    "settings.chatTime": "Hora no chat",
    "settings.chatTime.description": "A hora atual da pessoa, ou a que o relógio dela marcava quando ela enviou a mensagem.",
    "settings.chatTime.current": "Hora atual",
    "settings.chatTime.sent": "Quando a mensagem foi enviada",
    "settings.inChat": "No chat",
    "settings.inChat.description": "Depois do nome em cada mensagem.",
    "settings.onProfiles": "Nos perfis",
    "settings.onProfiles.description": "Um relógio ao lado das insígnias; passe o mouse por cima para ver a hora da pessoa.",
    "settings.inMemberList": "Na lista de membros",
    "settings.inMemberList.description": "Depois de cada nome na lista de membros.",
    "user.them": "essa pessoa",
    "tooltip.theirs": "Hora dela",
    "tooltip.sent": "Hora dela quando enviou",
    "picker.title": "Definir fuso horário de {name}",
    "picker.now": "Agora em {city} são {time}.",
    "picker.hint": "Pesquise uma cidade, uma região, uma abreviação como EST ou um deslocamento como UTC+3.",
    "picker.close": "Fechar",
    "picker.search": "Pesquisar fusos horários",
    "picker.placeholder": "Istambul, PST, UTC+3…",
    "picker.list": "Fusos horários",
    "picker.empty": "Nenhum fuso horário corresponde a “{query}”.",
    "picker.you": "Você",
    "toast.set": "Fuso horário de {name} definido: {city}",
    "saved.people": "Pessoas",
    "saved.nobody": "Ninguém ainda. Clique com o botão direito em alguém e escolha Definir fuso horário.",
    "saved.change": "Alterar",
    "saved.remove": "Remover",
    "menu.set": "Definir fuso horário",
    "menu.remove": "Remover fuso horário"
  },
  ru: {
    "diff.same": "то же время, что и у вас",
    "diff.ahead": "на {amount} впереди вас",
    "diff.behind": "на {amount} позади вас",
    "amount.h": "{h} ч",
    "amount.m": "{m} мин",
    "amount.hm": "{h} ч {m} мин",
    "settings.timeFormat": "Формат времени",
    "settings.timeFormat.description": "«Авто» следует языку Discord.",
    "settings.timeFormat.auto": "Авто",
    "settings.timeFormat.12h": "12-часовой (3:42 PM)",
    "settings.timeFormat.24h": "24-часовой (15:42)",
    "settings.chatTime": "Время в чате",
    "settings.chatTime.description": "Текущее время у человека или то, которое было на его часах, когда он отправил сообщение.",
    "settings.chatTime.current": "Текущее время",
    "settings.chatTime.sent": "Когда отправлено сообщение",
    "settings.inChat": "В чате",
    "settings.inChat.description": "После имени в каждом сообщении.",
    "settings.onProfiles": "В профилях",
    "settings.onProfiles.description": "Часы рядом со значками. Наведите на них курсор, чтобы увидеть время человека.",
    "settings.inMemberList": "В списке участников",
    "settings.inMemberList.description": "После каждого имени в списке участников.",
    "user.them": "этого человека",
    "tooltip.theirs": "Время у человека",
    "tooltip.sent": "Время у человека при отправке",
    "picker.title": "Часовой пояс для {name}",
    "picker.now": "Сейчас там ({city}) {time}.",
    "picker.hint": "Ищите город, регион, сокращение вроде EST или смещение вроде UTC+3.",
    "picker.close": "Закрыть",
    "picker.search": "Поиск часовых поясов",
    "picker.placeholder": "Стамбул, PST, UTC+3…",
    "picker.list": "Часовые пояса",
    "picker.empty": "Нет часовых поясов, подходящих под «{query}».",
    "picker.you": "Вы",
    "toast.set": "Часовой пояс для {name} задан: {city}",
    "saved.people": "Люди",
    "saved.nobody": "Пока никого. Нажмите правой кнопкой мыши на пользователя и выберите «Задать часовой пояс».",
    "saved.change": "Изменить",
    "saved.remove": "Удалить",
    "menu.set": "Задать часовой пояс",
    "menu.remove": "Убрать часовой пояс"
  },
  tr: {
    "diff.same": "seninle aynı saat",
    "diff.ahead": "senden {amount} ileride",
    "diff.behind": "senden {amount} geride",
    "amount.h": "{h} sa",
    "amount.m": "{m} dk",
    "amount.hm": "{h} sa {m} dk",
    "settings.timeFormat": "Saat biçimi",
    "settings.timeFormat.description": "Otomatik, Discord'un diline uyar.",
    "settings.timeFormat.auto": "Otomatik",
    "settings.timeFormat.12h": "12 saatlik (3:42 PM)",
    "settings.timeFormat.24h": "24 saatlik (15:42)",
    "settings.chatTime": "Sohbetteki saat",
    "settings.chatTime.description": "Kişinin şu anki saati veya mesajı gönderdiği andaki saati.",
    "settings.chatTime.current": "Şu anki saat",
    "settings.chatTime.sent": "Mesajın gönderildiği an",
    "settings.inChat": "Sohbette",
    "settings.inChat.description": "Her mesajda adın yanında.",
    "settings.onProfiles": "Profillerde",
    "settings.onProfiles.description": "Rozetlerin yanında bir saat; kişinin saatini görmek için üzerine gel.",
    "settings.inMemberList": "Üye listesinde",
    "settings.inMemberList.description": "Üye listesinde her adın yanında.",
    "user.them": "bu kişi",
    "tooltip.theirs": "Kişinin saati",
    "tooltip.sent": "Gönderildiği andaki saati",
    "picker.title": "{name} için saat dilimi ayarla",
    "picker.now": "Şu an {city} için saat {time}.",
    "picker.hint": "Bir şehir, bölge, EST gibi bir kısaltma veya UTC+3 gibi bir fark ara.",
    "picker.close": "Kapat",
    "picker.search": "Saat dilimlerinde ara",
    "picker.placeholder": "İstanbul, PST, UTC+3…",
    "picker.list": "Saat dilimleri",
    "picker.empty": "“{query}” ile eşleşen saat dilimi yok.",
    "picker.you": "Sen",
    "toast.set": "{name} için saat dilimi ayarlandı: {city}",
    "saved.people": "Kişiler",
    "saved.nobody": "Henüz kimse yok. Birine sağ tıkla ve Saat Dilimi Ayarla'yı seç.",
    "saved.change": "Değiştir",
    "saved.remove": "Kaldır",
    "menu.set": "Saat Dilimi Ayarla",
    "menu.remove": "Saat Dilimini Kaldır"
  }
});

// plugins/timezones/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var profileBadgesFilter = import_api2.filters.byCode("getBadges()??[]", "hidePersonalInformation");
var usernameFilter = import_api2.filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
var listRowFilter = import_api2.filters.componentByCode("wrapContent:", "decorators:", "avatarClassName:");
var BADGES = 1;
var STORAGE_KEY = "zones";
var settings = {
  timeFormat: {
    type: "select",
    get label() {
      return t("settings.timeFormat");
    },
    get description() {
      return t("settings.timeFormat.description");
    },
    default: "auto",
    options: [
      { get label() {
        return t("settings.timeFormat.auto");
      }, value: "auto" },
      { get label() {
        return t("settings.timeFormat.12h");
      }, value: "12h" },
      { get label() {
        return t("settings.timeFormat.24h");
      }, value: "24h" }
    ]
  },
  chatTime: {
    type: "select",
    get label() {
      return t("settings.chatTime");
    },
    get description() {
      return t("settings.chatTime.description");
    },
    default: "current",
    options: [
      { get label() {
        return t("settings.chatTime.current");
      }, value: "current" },
      { get label() {
        return t("settings.chatTime.sent");
      }, value: "sent" }
    ]
  },
  showInChat: {
    type: "boolean",
    get label() {
      return t("settings.inChat");
    },
    get description() {
      return t("settings.inChat.description");
    },
    default: true
  },
  showOnProfiles: {
    type: "boolean",
    get label() {
      return t("settings.onProfiles");
    },
    get description() {
      return t("settings.onProfiles.description");
    },
    default: true
  },
  showInMemberList: {
    type: "boolean",
    get label() {
      return t("settings.inMemberList");
    },
    get description() {
      return t("settings.inMemberList.description");
    },
    default: false
  }
};
var context;
var zones = {};
var yourZone = "UTC";
var zoneList;
var getZoneList = () => zoneList ??= allZones();
var store = (name) => {
  try {
    return import_api2.getStore(name);
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
  return import_api2.React.useSyncExternalStore((cb) => {
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
var tr = (key, vars) => t(key, vars);
var describeAt = (zone, at) => describeTime(at, zone, yourZone, { cycle: cycle(), locale: locale() }, tr);
function zoneOf(userId) {
  return userId ? zones[userId] : undefined;
}
function toDate(timestamp) {
  const ms = typeof timestamp === "number" ? timestamp : typeof timestamp === "string" ? Date.parse(timestamp) : typeof timestamp?.valueOf === "function" ? Number(timestamp.valueOf()) : NaN;
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}
function userName(userId) {
  const user = store("UserStore")?.getUser?.(userId);
  return user?.globalName || user?.username || t("user.them");
}
function WithTooltip({ text, children }) {
  const Tooltip = import_api2.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text,
    children
  }) : import_api2.React.cloneElement(children, { title: text });
}
function ChatTime({ userId, sentAt }) {
  useVersion();
  const zone = zoneOf(userId);
  if (!zone || !context?.settings.get("showInChat"))
    return null;
  const sent = context.settings.get("chatTime") === "sent" && sentAt;
  const d = describeAt(zone, sent ? sentAt : new Date);
  const text = sent ? tooltipText(d, t("tooltip.sent")) : tooltipText(d, t("tooltip.theirs"));
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
  const text = tooltipText(d, t("tooltip.theirs"));
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
  const close = import_api2.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(Picker, {
    userId,
    onClose: () => close2()
  }), {
    onClosed: () => void (closeOpen === close && (closeOpen = undefined))
  });
  closeOpen = close;
}
function Picker({ userId, onClose }) {
  useVersion();
  const [query, setQuery] = import_api2.React.useState("");
  const [active, setActive] = import_api2.React.useState(0);
  const inputRef = import_api2.React.useRef(null);
  const listRef = import_api2.React.useRef(null);
  const now = new Date;
  const current = zoneOf(userId);
  const name = userName(userId);
  const results = import_api2.React.useMemo(() => searchZones(query, getZoneList(), new Date), [query, version]);
  const listId = "evi-tz-results";
  import_api2.React.useEffect(() => setActive(0), [query]);
  import_api2.React.useEffect(() => {
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
  import_api2.React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (zone) => {
    commit(withZone(zones, userId, zone));
    context?.toast(t("toast.set", { name, city: cityOf(zone) }), { type: "success" });
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
    className: "evi-tz-scrim evi-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-tz-modal evi-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-tz-title",
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-tz-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h2", {
                  id: "evi-tz-title",
                  children: t("picker.title", { name })
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  children: current ? /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
                    children: t("picker.now", { city: cityOf(current), time: formatTime(now, current, { cycle: cyc, locale: loc, weekday: true }) })
                  }) : /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
                    children: t("picker.hint")
                  })
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-tz-close",
              "aria-label": t("picker.close"),
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
            "aria-label": t("picker.search"),
            placeholder: t("picker.placeholder"),
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
          "aria-label": t("picker.list"),
          ref: listRef,
          children: [
            results.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("p", {
              className: "evi-tz-empty",
              role: "status",
              children: t("picker.empty", { query })
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
                            children: t("picker.you")
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
        children: t("saved.people")
      }),
      entries.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
        className: "dl-hint",
        children: t("saved.nobody")
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
              children: t("saved.change")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-tz-link",
              "data-danger": "true",
              onClick: () => commit(withoutZone(zones, id)),
              children: t("saved.remove")
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
var timezones_default = import_api2.definePlugin({
  settings,
  start(ctx) {
    context = ctx;
    yourZone = localZone();
    zones = parseZones(storage()?.get(STORAGE_KEY));
    ctx.addStyle(css);
    ctx.settings.onChange(bump);
    ctx.onDispose(() => closeOpen?.({ instant: true }));
    ctx.setTimeout(() => {
      bump();
      ctx.setInterval(bump, 60000);
    }, 60000 - Date.now() % 60000 + 50);
    ctx.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      if (!userId)
        return;
      const zone = zoneOf(userId);
      children.push(/* @__PURE__ */ jsx_runtime.jsxs(import_api2.Menu.Group, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
            id: "evi-tz-set",
            label: t("menu.set"),
            subtext: zone ? `${cityOf(zone)} · ${formatTime(new Date, zone, { cycle: cycle(), locale: locale() })}` : undefined,
            action: () => openPicker(userId)
          }),
          zone && /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
            id: "evi-tz-remove",
            label: t("menu.remove"),
            color: "danger",
            action: () => commit(withoutZone(zones, userId))
          })
        ]
      }, "evi-tz-group"));
    });
    const badgeLists = new Map;
    ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
      if (!ctx.settings.get("showOnProfiles"))
        return;
      const userId = args[0]?.userId;
      const zone = zoneOf(userId);
      if (!userId || !zone || !isValidZone(zone))
        return;
      const now = new Date;
      const description = tooltipText(describeAt(zone, now), t("tooltip.theirs"));
      const iconSrc = clockIcon(zone, now);
      const cached = badgeLists.get(userId);
      if (cached && cached.result === result && cached.description === description && cached.iconSrc === iconSrc)
        return cached.list;
      const list = [...Array.isArray(result) ? result : [], { id: "evi-timezone", description, iconSrc }];
      if (badgeLists.size >= 100)
        badgeLists.clear();
      badgeLists.set(userId, { result, description, iconSrc, list });
      return list;
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
    closeOpen?.({ instant: true });
    context = undefined;
    bump();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime.jsx(SavedPanel, {})
});
