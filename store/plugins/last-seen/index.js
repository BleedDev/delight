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

// plugins/last-seen/index.tsx
var exports_last_seen = {};
__export(exports_last_seen, {
  default: () => last_seen_default
});
module.exports = __toCommonJS(exports_last_seen);
var import_api6 = require("@evi/api");

// plugins/last-seen/line.tsx
var import_api3 = require("@evi/api");

// plugins/last-seen/state.ts
var import_api2 = require("@evi/api");

// plugins/last-seen/track.ts
var DEFAULT_CAP = 25000;
var isOnlineStatus = (status) => status === "online" || status === "idle" || status === "dnd";
function touch(tracker, id) {
  const entry = tracker.get(id) ?? {};
  tracker.delete(id);
  tracker.set(id, entry);
  return entry;
}
var PRUNE_SLACK = 500;
function prune(tracker, cap = DEFAULT_CAP, keep, slack = 0) {
  if (tracker.size <= cap + slack)
    return 0;
  const excess = tracker.size - cap;
  let removed = 0;
  const skipped = [];
  for (const [id, entry] of tracker) {
    if (removed >= excess)
      break;
    if (keep?.(id)) {
      skipped.push([id, entry]);
      continue;
    }
    tracker.delete(id);
    removed++;
  }
  for (const [id, entry] of skipped) {
    tracker.delete(id);
    tracker.set(id, entry);
  }
  for (const id of tracker.keys()) {
    if (removed >= excess)
      break;
    tracker.delete(id);
    removed++;
  }
  return removed;
}
function isIgnored(id, bot, me, ignoreBots) {
  if (!id || id === me)
    return true;
  return ignoreBots && bot === true;
}
function observePresence(tracker, id, status, now, opts = {}) {
  if (isOnlineStatus(status)) {
    const entry2 = touch(tracker, id);
    entry2.online = true;
    entry2.seen = now;
    delete entry2.approx;
    prune(tracker, opts.cap, opts.keep, opts.slack);
    return true;
  }
  const entry = tracker.get(id);
  if (!entry?.online)
    return false;
  touch(tracker, id);
  entry.online = false;
  entry.seen = now;
  delete entry.approx;
  return true;
}
function observeActivity(tracker, id, at, opts = {}) {
  const old = tracker.get(id)?.active ?? 0;
  if (at <= old)
    return false;
  touch(tracker, id).active = at;
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return true;
}
function observeMessage(tracker, id, at, where = {}, opts = {}) {
  const old = tracker.get(id)?.message ?? 0;
  if (at <= old)
    return false;
  const entry = touch(tracker, id);
  entry.message = at;
  if (where.channelId)
    entry.channelId = where.channelId;
  else
    delete entry.channelId;
  if (where.messageId)
    entry.messageId = where.messageId;
  else
    delete entry.messageId;
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return true;
}
function serialize(tracker, now) {
  const rows = [];
  for (const [id, e] of tracker) {
    rows.push([id, e.seen ?? 0, e.message ?? 0, e.online ? 1 : 0, e.active ?? 0, e.channelId ?? "", e.messageId ?? "", e.approx ? 1 : 0]);
  }
  return { v: 2, savedAt: now, rows };
}
var num = (v) => typeof v === "number" && v > 0 ? v : 0;
var str = (v) => typeof v === "string" && v ? v : undefined;
function restore(tracker, savedAt, id, seen, message, online, active, channelId, messageId, approx) {
  const entry = {};
  const s = num(seen);
  if (online && savedAt > s) {
    entry.seen = savedAt;
    entry.approx = true;
  } else if (s) {
    entry.seen = s;
    if (approx)
      entry.approx = true;
  }
  if (num(active))
    entry.active = num(active);
  if (num(message)) {
    entry.message = num(message);
    if (str(channelId))
      entry.channelId = str(channelId);
    if (str(messageId))
      entry.messageId = str(messageId);
  }
  if (entry.seen || entry.message || entry.active)
    tracker.set(id, entry);
}
var SEP = ",";
function pack(tracker, now) {
  const n = tracker.size;
  const seen = new Float64Array(n), message = new Float64Array(n), active = new Float64Array(n), flags = new Uint8Array(n);
  const ids = [], channelIds = [], messageIds = [];
  let i = 0;
  for (const [id, e] of tracker) {
    const channelId = e.channelId ?? "", messageId = e.messageId ?? "";
    if (id.includes(SEP) || channelId.includes(SEP) || messageId.includes(SEP))
      continue;
    ids.push(id);
    channelIds.push(channelId);
    messageIds.push(messageId);
    seen[i] = e.seen ?? 0;
    message[i] = e.message ?? 0;
    active[i] = e.active ?? 0;
    flags[i] = (e.online ? 1 : 0) | (e.approx ? 2 : 0);
    i++;
  }
  return {
    v: 3,
    savedAt: now,
    ids: ids.join(SEP),
    seen: i < n ? seen.slice(0, i) : seen,
    message: i < n ? message.slice(0, i) : message,
    active: i < n ? active.slice(0, i) : active,
    flags: i < n ? flags.slice(0, i) : flags,
    channelIds: channelIds.join(SEP),
    messageIds: messageIds.join(SEP)
  };
}
function unpack(saved, tracker) {
  const { seen, message, active, flags } = saved;
  if (!(seen instanceof Float64Array) || !(message instanceof Float64Array) || !(active instanceof Float64Array) || !(flags instanceof Uint8Array))
    return;
  const n = seen.length;
  if (!n || typeof saved.ids !== "string")
    return;
  const ids = saved.ids.split(SEP);
  const channelIds = typeof saved.channelIds === "string" ? saved.channelIds.split(SEP) : [];
  const messageIds = typeof saved.messageIds === "string" ? saved.messageIds.split(SEP) : [];
  if (ids.length !== n || message.length !== n || active.length !== n || flags.length !== n)
    return;
  const savedAt = num(saved.savedAt);
  for (let i = 0;i < n; i++) {
    if (!ids[i])
      continue;
    restore(tracker, savedAt, ids[i], seen[i], message[i], flags[i] & 1, active[i], channelIds[i], messageIds[i], flags[i] & 2);
  }
}
function deserialize(data, opts = {}) {
  const tracker = new Map;
  const saved = data;
  if (saved?.v === 3)
    unpack(saved, tracker);
  else if (saved && Array.isArray(saved.rows)) {
    const savedAt = num(saved.savedAt);
    for (const row of saved.rows) {
      if (!Array.isArray(row) || typeof row[0] !== "string")
        continue;
      const [id, seen, message, online, active, channelId, messageId, approx] = row;
      restore(tracker, savedAt, id, seen, message, online, active, channelId, messageId, approx);
    }
  }
  prune(tracker, opts.cap, opts.keep, opts.slack);
  return tracker;
}
function merge(into, from) {
  const out = { ...into };
  if (from.seen && (!out.seen || from.seen >= out.seen || from.online)) {
    out.seen = from.seen;
    out.online = from.online;
    if (from.approx)
      out.approx = true;
    else
      delete out.approx;
  }
  if (from.active && from.active > (out.active ?? 0))
    out.active = from.active;
  if (from.message && from.message > (out.message ?? 0)) {
    out.message = from.message;
    out.channelId = from.channelId;
    out.messageId = from.messageId;
    if (!out.channelId)
      delete out.channelId;
    if (!out.messageId)
      delete out.messageId;
  }
  return out;
}
var ENGLISH = {
  "unit.y": "{n}y",
  "unit.mo": "{n}mo",
  "unit.w": "{n}w",
  "unit.d": "{n}d",
  "unit.h": "{n}h",
  "unit.m": "{n}m",
  ago: "{span} ago",
  justNow: "just now",
  seen: "Last seen {when}",
  seenIn: "Last seen in the last {span}",
  active: "Active {when}",
  online: "Online now",
  message: "Last message {when}",
  messageIn: "Last message {when} in {where}"
};
var english = (key, vars) => ENGLISH[key].replace(/\{(\w+)\}/g, (whole, name) => vars && (name in vars) ? String(vars[name]) : whole);
var UNITS = [
  [365 * 24 * 3600000, "y"],
  [30 * 24 * 3600000, "mo"],
  [7 * 24 * 3600000, "w"],
  [24 * 3600000, "d"],
  [3600000, "h"],
  [60000, "m"]
];
function formatSpan(then, now, say = english) {
  const diff = Math.max(0, now - then);
  for (const [ms, unit] of UNITS) {
    if (diff >= ms)
      return say(`unit.${unit}`, { n: Math.floor(diff / ms) });
  }
  return null;
}
function formatRelative(then, now, say = english) {
  const span = formatSpan(then, now, say);
  return span ? say("ago", { span }) : say("justNow");
}
function seenText(entry, now, say = english) {
  if (!entry.seen)
    return null;
  if (!entry.approx)
    return say("seen", { when: formatRelative(entry.seen, now, say) });
  const span = formatSpan(entry.seen, now, say);
  return span ? say("seenIn", { span }) : say("seen", { when: say("justNow") });
}
function lineText(entry, now, say = english) {
  if (!entry)
    return null;
  if (entry.active && entry.active > (entry.seen ?? 0))
    return say("active", { when: formatRelative(entry.active, now, say) });
  return seenText(entry, now, say);
}
function describe(entry, onlineNow, now, where, say = english) {
  const parts = [];
  if (onlineNow)
    parts.push(say("online"));
  else if (entry?.seen)
    parts.push(seenText(entry, now, say));
  if (!onlineNow && entry?.active && entry.active > (entry.seen ?? 0))
    parts.push(say("active", { when: formatRelative(entry.active, now, say) }));
  if (entry?.message) {
    const when = formatRelative(entry.message, now, say);
    parts.push(where ? say("messageIn", { when, where }) : say("message", { when }));
  }
  return parts.length ? parts.join(" · ") : null;
}

// plugins/last-seen/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.showOnProfiles": "On profiles",
    "settings.showOnProfiles.description": "A clock next to the badges on someone's profile; hover it for the times.",
    "settings.showInMemberList": "In the member list",
    "settings.showInMemberList.description": "Under the name of offline members.",
    "settings.showInFriends": "In the friends list",
    "settings.showInFriends.description": "Under the name of offline friends.",
    "settings.showInDms": "In direct messages",
    "settings.showInDms.description": "Under the name of offline people in the DM list.",
    "settings.ignoreBots": "Ignore bots",
    "settings.ignoreBots.description": "Don't track bots and apps.",
    "unit.y": "{n}y",
    "unit.mo": "{n}mo",
    "unit.w": "{n}w",
    "unit.d": "{n}d",
    "unit.h": "{n}h",
    "unit.m": "{n}m",
    ago: "{span} ago",
    justNow: "just now",
    seen: "Last seen {when}",
    seenIn: "Last seen in the last {span}",
    active: "Active {when}",
    online: "Online now",
    message: "Last message {when}",
    messageIn: "Last message {when} in {where}",
    "where.channel": "#{name}",
    "where.dms": "your DMs",
    "where.group": "the group {name}",
    "where.groupUnnamed": "a group DM",
    people: { one: "{n} person", other: "{n} people" },
    "remembered.title": "Remembered",
    "remembered.cleared": "Cleared {people}.",
    "remembered.status": "{people} of {cap}. Kept on this device only; friends and DMs are kept longest.",
    "remembered.meter": "Space used",
    "remembered.undo": "Undo",
    "remembered.cancel": "Cancel",
    "remembered.confirmClear": "Clear {people}?",
    "remembered.export": "Export",
    "remembered.import": "Import",
    "remembered.clear": "Clear data",
    "toast.restored": "Restored {people}",
    "toast.imported": "Imported {people}",
    "toast.nothingToImport": "Nothing to import in that file",
    "toast.badFile": "That file isn't a Last Seen export",
    "people.title": "People",
    "people.searchPlaceholder": "Search by name or ID",
    "people.searchLabel": "Search remembered people",
    "people.nothingRecent": "Nothing recent",
    "people.noMatch": "No one matches that.",
    "people.empty": "No one yet. People show up here as Discord tells your client about them.",
    "people.showing": "Showing {shown} of {total}. Search to find someone else."
  },
  de: {
    "settings.showOnProfiles": "In Profilen",
    "settings.showOnProfiles.description": "Eine Uhr neben den Abzeichen im Profil einer Person; fahre darüber, um die Zeiten zu sehen.",
    "settings.showInMemberList": "In der Mitgliederliste",
    "settings.showInMemberList.description": "Unter dem Namen von Offline-Mitgliedern.",
    "settings.showInFriends": "In der Freundesliste",
    "settings.showInFriends.description": "Unter dem Namen von Offline-Freunden.",
    "settings.showInDms": "In Direktnachrichten",
    "settings.showInDms.description": "Unter dem Namen von Offline-Personen in der DM-Liste.",
    "settings.ignoreBots": "Bots ignorieren",
    "settings.ignoreBots.description": "Bots und Apps nicht erfassen.",
    "unit.y": "{n} J.",
    "unit.mo": "{n} Mon.",
    "unit.w": "{n} Wo.",
    "unit.d": "{n} T.",
    "unit.h": "{n} Std.",
    "unit.m": "{n} Min.",
    ago: "vor {span}",
    justNow: "gerade eben",
    seen: "Zuletzt online {when}",
    seenIn: "Zuletzt online in den letzten {span}",
    active: "Aktiv {when}",
    online: "Jetzt online",
    message: "Letzte Nachricht {when}",
    messageIn: "Letzte Nachricht {when} in {where}",
    "where.channel": "#{name}",
    "where.dms": "deinen DMs",
    "where.group": "der Gruppe {name}",
    "where.groupUnnamed": "einer Gruppen-DM",
    people: { one: "{n} Person", other: "{n} Personen" },
    "remembered.title": "Gespeichert",
    "remembered.cleared": "{people} gelöscht.",
    "remembered.status": "{people} von {cap}. Nur auf diesem Gerät gespeichert; Freunde und DMs bleiben am längsten erhalten.",
    "remembered.meter": "Belegter Speicher",
    "remembered.undo": "Rückgängig",
    "remembered.cancel": "Abbrechen",
    "remembered.confirmClear": "{people} löschen?",
    "remembered.export": "Exportieren",
    "remembered.import": "Importieren",
    "remembered.clear": "Daten löschen",
    "toast.restored": "{people} wiederhergestellt",
    "toast.imported": "{people} importiert",
    "toast.nothingToImport": "In dieser Datei gibt es nichts zu importieren",
    "toast.badFile": "Diese Datei ist kein Last-Seen-Export",
    "people.title": "Personen",
    "people.searchPlaceholder": "Nach Name oder ID suchen",
    "people.searchLabel": "Gespeicherte Personen durchsuchen",
    "people.nothingRecent": "Nichts Aktuelles",
    "people.noMatch": "Dazu passt niemand.",
    "people.empty": "Noch niemand. Personen erscheinen hier, sobald Discord deinem Client von ihnen berichtet.",
    "people.showing": "{shown} von {total} werden angezeigt. Suche, um jemand anderen zu finden."
  },
  es: {
    "settings.showOnProfiles": "En los perfiles",
    "settings.showOnProfiles.description": "Un reloj junto a las insignias del perfil de alguien; pasa el cursor por encima para ver las horas.",
    "settings.showInMemberList": "En la lista de miembros",
    "settings.showInMemberList.description": "Debajo del nombre de los miembros desconectados.",
    "settings.showInFriends": "En la lista de amigos",
    "settings.showInFriends.description": "Debajo del nombre de los amigos desconectados.",
    "settings.showInDms": "En mensajes directos",
    "settings.showInDms.description": "Debajo del nombre de las personas desconectadas en la lista de MD.",
    "settings.ignoreBots": "Ignorar bots",
    "settings.ignoreBots.description": "No registrar bots ni aplicaciones.",
    "unit.y": "{n} a",
    "unit.mo": "{n} mes",
    "unit.w": "{n} sem",
    "unit.d": "{n} d",
    "unit.h": "{n} h",
    "unit.m": "{n} min",
    ago: "hace {span}",
    justNow: "ahora mismo",
    seen: "Última conexión {when}",
    seenIn: "Última conexión en las últimas {span}",
    active: "Activo {when}",
    online: "En línea ahora",
    message: "Último mensaje {when}",
    messageIn: "Último mensaje {when} en {where}",
    "where.channel": "#{name}",
    "where.dms": "tus MD",
    "where.group": "el grupo {name}",
    "where.groupUnnamed": "un MD de grupo",
    people: { one: "{n} persona", other: "{n} personas" },
    "remembered.title": "Guardadas",
    "remembered.cleared": "Borrado: {people}.",
    "remembered.status": "{people} de {cap}. Se guardan solo en este dispositivo; los amigos y los MD se conservan más tiempo.",
    "remembered.meter": "Espacio usado",
    "remembered.undo": "Deshacer",
    "remembered.cancel": "Cancelar",
    "remembered.confirmClear": "¿Borrar {people}?",
    "remembered.export": "Exportar",
    "remembered.import": "Importar",
    "remembered.clear": "Borrar datos",
    "toast.restored": "Restaurado: {people}",
    "toast.imported": "Importado: {people}",
    "toast.nothingToImport": "No hay nada que importar en ese archivo",
    "toast.badFile": "Ese archivo no es una exportación de Last Seen",
    "people.title": "Personas",
    "people.searchPlaceholder": "Buscar por nombre o ID",
    "people.searchLabel": "Buscar entre las personas guardadas",
    "people.nothingRecent": "Nada reciente",
    "people.noMatch": "No hay nadie que coincida.",
    "people.empty": "Todavía nadie. Las personas aparecen aquí a medida que Discord informa de ellas a tu cliente.",
    "people.showing": "Mostrando {shown} de {total}. Busca para encontrar a otra persona."
  },
  fr: {
    "settings.showOnProfiles": "Sur les profils",
    "settings.showOnProfiles.description": "Une horloge à côté des badges du profil d'une personne ; survole-la pour voir les heures.",
    "settings.showInMemberList": "Dans la liste des membres",
    "settings.showInMemberList.description": "Sous le nom des membres hors ligne.",
    "settings.showInFriends": "Dans la liste d'amis",
    "settings.showInFriends.description": "Sous le nom des amis hors ligne.",
    "settings.showInDms": "Dans les messages privés",
    "settings.showInDms.description": "Sous le nom des personnes hors ligne dans la liste des MP.",
    "settings.ignoreBots": "Ignorer les bots",
    "settings.ignoreBots.description": "Ne pas suivre les bots et les applications.",
    "unit.y": "{n} a",
    "unit.mo": "{n} mois",
    "unit.w": "{n} sem.",
    "unit.d": "{n} j",
    "unit.h": "{n} h",
    "unit.m": "{n} min",
    ago: "il y a {span}",
    justNow: "à l'instant",
    seen: "Dernière connexion {when}",
    seenIn: "Dernière connexion il y a moins de {span}",
    active: "Actif {when}",
    online: "En ligne",
    message: "Dernier message {when}",
    messageIn: "Dernier message {when} dans {where}",
    "where.channel": "#{name}",
    "where.dms": "tes MP",
    "where.group": "le groupe {name}",
    "where.groupUnnamed": "un MP de groupe",
    people: { one: "{n} personne", other: "{n} personnes" },
    "remembered.title": "Enregistrées",
    "remembered.cleared": "Effacé : {people}.",
    "remembered.status": "{people} sur {cap}. Conservées uniquement sur cet appareil ; les amis et les MP sont gardés le plus longtemps.",
    "remembered.meter": "Espace utilisé",
    "remembered.undo": "Annuler",
    "remembered.cancel": "Annuler",
    "remembered.confirmClear": "Effacer {people} ?",
    "remembered.export": "Exporter",
    "remembered.import": "Importer",
    "remembered.clear": "Effacer les données",
    "toast.restored": "Restauré : {people}",
    "toast.imported": "Importé : {people}",
    "toast.nothingToImport": "Rien à importer dans ce fichier",
    "toast.badFile": "Ce fichier n'est pas un export de Last Seen",
    "people.title": "Personnes",
    "people.searchPlaceholder": "Rechercher par nom ou ID",
    "people.searchLabel": "Rechercher parmi les personnes enregistrées",
    "people.nothingRecent": "Rien de récent",
    "people.noMatch": "Personne ne correspond.",
    "people.empty": "Personne pour l'instant. Les personnes apparaissent ici quand Discord les signale à ton client.",
    "people.showing": "{shown} affichées sur {total}. Utilise la recherche pour trouver quelqu'un d'autre."
  },
  ja: {
    "settings.showOnProfiles": "プロフィールに表示",
    "settings.showOnProfiles.description": "ユーザーのプロフィールのバッジの横に時計を表示します。ホバーすると時刻が見られます。",
    "settings.showInMemberList": "メンバーリストに表示",
    "settings.showInMemberList.description": "オフラインのメンバーの名前の下に表示します。",
    "settings.showInFriends": "フレンドリストに表示",
    "settings.showInFriends.description": "オフラインのフレンドの名前の下に表示します。",
    "settings.showInDms": "ダイレクトメッセージに表示",
    "settings.showInDms.description": "DMリストのオフラインのユーザーの名前の下に表示します。",
    "settings.ignoreBots": "Botを無視",
    "settings.ignoreBots.description": "Botやアプリは記録しません。",
    "unit.y": "{n}年",
    "unit.mo": "{n}か月",
    "unit.w": "{n}週間",
    "unit.d": "{n}日",
    "unit.h": "{n}時間",
    "unit.m": "{n}分",
    ago: "{span}前",
    justNow: "たった今",
    seen: "最終オンライン: {when}",
    seenIn: "最終オンライン: 過去{span}以内",
    active: "アクティブ: {when}",
    online: "オンライン中",
    message: "最後のメッセージ: {when}",
    messageIn: "最後のメッセージ: {when}({where})",
    "where.channel": "#{name}",
    "where.dms": "あなたのDM",
    "where.group": "グループ「{name}」",
    "where.groupUnnamed": "グループDM",
    people: { other: "{n}人" },
    "remembered.title": "記憶している人数",
    "remembered.cleared": "{people}分を消去しました。",
    "remembered.status": "{cap}人中{people}。このデバイスにのみ保存され、フレンドとDMの相手は最も長く保持されます。",
    "remembered.meter": "使用中の容量",
    "remembered.undo": "元に戻す",
    "remembered.cancel": "キャンセル",
    "remembered.confirmClear": "{people}分を消去しますか?",
    "remembered.export": "エクスポート",
    "remembered.import": "インポート",
    "remembered.clear": "データを消去",
    "toast.restored": "{people}分を復元しました",
    "toast.imported": "{people}分をインポートしました",
    "toast.nothingToImport": "このファイルにはインポートできるデータがありません",
    "toast.badFile": "このファイルはLast Seenのエクスポートではありません",
    "people.title": "ユーザー",
    "people.searchPlaceholder": "名前またはIDで検索",
    "people.searchLabel": "記憶しているユーザーを検索",
    "people.nothingRecent": "最近の記録なし",
    "people.noMatch": "一致するユーザーはいません。",
    "people.empty": "まだ誰もいません。Discordがクライアントにユーザーの情報を伝えると、ここに表示されます。",
    "people.showing": "{total}人中{shown}人を表示中。ほかのユーザーは検索で探してください。"
  },
  pl: {
    "settings.showOnProfiles": "Na profilach",
    "settings.showOnProfiles.description": "Zegar obok odznak na profilu użytkownika; najedź na niego, aby zobaczyć godziny.",
    "settings.showInMemberList": "Na liście członków",
    "settings.showInMemberList.description": "Pod nazwą członków offline.",
    "settings.showInFriends": "Na liście znajomych",
    "settings.showInFriends.description": "Pod nazwą znajomych offline.",
    "settings.showInDms": "W wiadomościach prywatnych",
    "settings.showInDms.description": "Pod nazwą osób offline na liście wiadomości prywatnych.",
    "settings.ignoreBots": "Ignoruj boty",
    "settings.ignoreBots.description": "Nie śledź botów i aplikacji.",
    "unit.y": "{n} r.",
    "unit.mo": "{n} mies.",
    "unit.w": "{n} tyg.",
    "unit.d": "{n} d.",
    "unit.h": "{n} godz.",
    "unit.m": "{n} min",
    ago: "{span} temu",
    justNow: "przed chwilą",
    seen: "Ostatnio online {when}",
    seenIn: "Ostatnio online w ciągu ostatnich {span}",
    active: "Aktywny {when}",
    online: "Teraz online",
    message: "Ostatnia wiadomość {when}",
    messageIn: "Ostatnia wiadomość {when} w {where}",
    "where.channel": "#{name}",
    "where.dms": "Twoich wiadomościach prywatnych",
    "where.group": "grupie {name}",
    "where.groupUnnamed": "grupowej wiadomości prywatnej",
    people: { one: "{n} osoba", few: "{n} osoby", many: "{n} osób", other: "{n} osoby" },
    "remembered.title": "Zapamiętane",
    "remembered.cleared": "Wyczyszczono: {people}.",
    "remembered.status": "{people} z {cap}. Przechowywane tylko na tym urządzeniu; znajomi i wiadomości prywatne są trzymane najdłużej.",
    "remembered.meter": "Zajęte miejsce",
    "remembered.undo": "Cofnij",
    "remembered.cancel": "Anuluj",
    "remembered.confirmClear": "Wyczyścić: {people}?",
    "remembered.export": "Eksportuj",
    "remembered.import": "Importuj",
    "remembered.clear": "Wyczyść dane",
    "toast.restored": "Przywrócono: {people}",
    "toast.imported": "Zaimportowano: {people}",
    "toast.nothingToImport": "W tym pliku nie ma nic do zaimportowania",
    "toast.badFile": "Ten plik nie jest eksportem Last Seen",
    "people.title": "Osoby",
    "people.searchPlaceholder": "Szukaj po nazwie lub ID",
    "people.searchLabel": "Szukaj wśród zapamiętanych osób",
    "people.nothingRecent": "Nic nowego",
    "people.noMatch": "Nikt nie pasuje.",
    "people.empty": "Na razie nikogo. Osoby pojawiają się tutaj, gdy Discord przekaże Twojemu klientowi informacje o nich.",
    "people.showing": "Wyświetlono {shown} z {total}. Użyj wyszukiwania, aby znaleźć kogoś innego."
  },
  "pt-BR": {
    "settings.showOnProfiles": "Nos perfis",
    "settings.showOnProfiles.description": "Um relógio ao lado das insígnias no perfil de alguém; passe o mouse para ver os horários.",
    "settings.showInMemberList": "Na lista de membros",
    "settings.showInMemberList.description": "Abaixo do nome dos membros offline.",
    "settings.showInFriends": "Na lista de amigos",
    "settings.showInFriends.description": "Abaixo do nome dos amigos offline.",
    "settings.showInDms": "Nas mensagens diretas",
    "settings.showInDms.description": "Abaixo do nome das pessoas offline na lista de DMs.",
    "settings.ignoreBots": "Ignorar bots",
    "settings.ignoreBots.description": "Não rastrear bots e apps.",
    "unit.y": "{n} a",
    "unit.mo": "{n} mes.",
    "unit.w": "{n} sem",
    "unit.d": "{n} d",
    "unit.h": "{n} h",
    "unit.m": "{n} min",
    ago: "há {span}",
    justNow: "agora mesmo",
    seen: "Visto por último {when}",
    seenIn: "Visto por último nas últimas {span}",
    active: "Ativo {when}",
    online: "Online agora",
    message: "Última mensagem {when}",
    messageIn: "Última mensagem {when} {where}",
    "where.channel": "em #{name}",
    "where.dms": "nas suas DMs",
    "where.group": "no grupo {name}",
    "where.groupUnnamed": "em uma DM em grupo",
    people: { one: "{n} pessoa", other: "{n} pessoas" },
    "remembered.title": "Lembradas",
    "remembered.cleared": "Apagado: {people}.",
    "remembered.status": "{people} de {cap}. Guardadas só neste dispositivo; amigos e DMs são mantidos por mais tempo.",
    "remembered.meter": "Espaço usado",
    "remembered.undo": "Desfazer",
    "remembered.cancel": "Cancelar",
    "remembered.confirmClear": "Apagar {people}?",
    "remembered.export": "Exportar",
    "remembered.import": "Importar",
    "remembered.clear": "Apagar dados",
    "toast.restored": "Restaurado: {people}",
    "toast.imported": "Importado: {people}",
    "toast.nothingToImport": "Não há nada para importar nesse arquivo",
    "toast.badFile": "Esse arquivo não é uma exportação do Last Seen",
    "people.title": "Pessoas",
    "people.searchPlaceholder": "Buscar por nome ou ID",
    "people.searchLabel": "Buscar entre as pessoas lembradas",
    "people.nothingRecent": "Nada recente",
    "people.noMatch": "Ninguém corresponde.",
    "people.empty": "Ninguém ainda. As pessoas aparecem aqui conforme o Discord informa sobre elas ao seu cliente.",
    "people.showing": "Mostrando {shown} de {total}. Use a busca para encontrar outra pessoa."
  },
  ru: {
    "settings.showOnProfiles": "В профилях",
    "settings.showOnProfiles.description": "Часы рядом со значками в профиле пользователя; наведите на них курсор, чтобы увидеть время.",
    "settings.showInMemberList": "В списке участников",
    "settings.showInMemberList.description": "Под именем участников, которые не в сети.",
    "settings.showInFriends": "В списке друзей",
    "settings.showInFriends.description": "Под именем друзей, которые не в сети.",
    "settings.showInDms": "В личных сообщениях",
    "settings.showInDms.description": "Под именем пользователей, которые не в сети, в списке ЛС.",
    "settings.ignoreBots": "Игнорировать ботов",
    "settings.ignoreBots.description": "Не отслеживать ботов и приложения.",
    "unit.y": "{n} г.",
    "unit.mo": "{n} мес.",
    "unit.w": "{n} нед.",
    "unit.d": "{n} дн.",
    "unit.h": "{n} ч",
    "unit.m": "{n} мин",
    ago: "{span} назад",
    justNow: "только что",
    seen: "Последний раз в сети: {when}",
    seenIn: "Последний раз в сети: за последние {span}",
    active: "Активность: {when}",
    online: "Сейчас в сети",
    message: "Последнее сообщение: {when}",
    messageIn: "Последнее сообщение: {when}, {where}",
    "where.channel": "в #{name}",
    "where.dms": "в личных сообщениях",
    "where.group": "в группе {name}",
    "where.groupUnnamed": "в групповом чате",
    people: { one: "{n} человек", few: "{n} человека", many: "{n} человек", other: "{n} человека" },
    "remembered.title": "Запомнено",
    "remembered.cleared": "Удалено: {people}.",
    "remembered.status": "{people} из {cap}. Хранится только на этом устройстве; друзья и собеседники из ЛС хранятся дольше всего.",
    "remembered.meter": "Занятое место",
    "remembered.undo": "Отменить",
    "remembered.cancel": "Отмена",
    "remembered.confirmClear": "Удалить: {people}?",
    "remembered.export": "Экспорт",
    "remembered.import": "Импорт",
    "remembered.clear": "Удалить данные",
    "toast.restored": "Восстановлено: {people}",
    "toast.imported": "Импортировано: {people}",
    "toast.nothingToImport": "В этом файле нечего импортировать",
    "toast.badFile": "Этот файл не является экспортом Last Seen",
    "people.title": "Люди",
    "people.searchPlaceholder": "Поиск по имени или ID",
    "people.searchLabel": "Поиск среди запомненных людей",
    "people.nothingRecent": "Ничего свежего",
    "people.noMatch": "Никто не подходит.",
    "people.empty": "Пока никого. Люди появляются здесь, когда Discord сообщает о них клиенту.",
    "people.showing": "Показано {shown} из {total}. Воспользуйтесь поиском, чтобы найти кого-то ещё."
  },
  tr: {
    "settings.showOnProfiles": "Profillerde",
    "settings.showOnProfiles.description": "Birinin profilinde rozetlerin yanında bir saat; zamanları görmek için üzerine gel.",
    "settings.showInMemberList": "Üye listesinde",
    "settings.showInMemberList.description": "Çevrimdışı üyelerin adının altında.",
    "settings.showInFriends": "Arkadaş listesinde",
    "settings.showInFriends.description": "Çevrimdışı arkadaşların adının altında.",
    "settings.showInDms": "Doğrudan mesajlarda",
    "settings.showInDms.description": "DM listesindeki çevrimdışı kişilerin adının altında.",
    "settings.ignoreBots": "Botları yok say",
    "settings.ignoreBots.description": "Botları ve uygulamaları takip etme.",
    "unit.y": "{n} yıl",
    "unit.mo": "{n} ay",
    "unit.w": "{n} hf",
    "unit.d": "{n} gn",
    "unit.h": "{n} sa",
    "unit.m": "{n} dk",
    ago: "{span} önce",
    justNow: "az önce",
    seen: "Son görülme: {when}",
    seenIn: "Son görülme: son {span} içinde",
    active: "Aktif: {when}",
    online: "Şu an çevrimiçi",
    message: "Son mesaj: {when}",
    messageIn: "Son mesaj: {when}, {where}",
    "where.channel": "#{name} kanalında",
    "where.dms": "DM'lerinde",
    "where.group": "{name} grubunda",
    "where.groupUnnamed": "bir grup DM'sinde",
    people: { one: "{n} kişi", other: "{n} kişi" },
    "remembered.title": "Hatırlananlar",
    "remembered.cleared": "{people} silindi.",
    "remembered.status": "{cap} kişiden {people}. Yalnızca bu cihazda tutulur; arkadaşlar ve DM'ler en uzun süre saklanır.",
    "remembered.meter": "Kullanılan alan",
    "remembered.undo": "Geri al",
    "remembered.cancel": "İptal",
    "remembered.confirmClear": "{people} silinsin mi?",
    "remembered.export": "Dışa aktar",
    "remembered.import": "İçe aktar",
    "remembered.clear": "Verileri temizle",
    "toast.restored": "{people} geri yüklendi",
    "toast.imported": "{people} içe aktarıldı",
    "toast.nothingToImport": "Bu dosyada içe aktarılacak bir şey yok",
    "toast.badFile": "Bu dosya bir Last Seen dışa aktarımı değil",
    "people.title": "Kişiler",
    "people.searchPlaceholder": "Ada veya kimliğe göre ara",
    "people.searchLabel": "Hatırlanan kişilerde ara",
    "people.nothingRecent": "Yakın zamanda bir şey yok",
    "people.noMatch": "Eşleşen kimse yok.",
    "people.empty": "Henüz kimse yok. Discord istemcine kişileri bildirdikçe burada görünürler.",
    "people.showing": "{total} kişiden {shown} tanesi gösteriliyor. Başka birini bulmak için ara."
  }
});
var words = (key, vars) => t(key, vars);
var people = (n) => t("people", { count: n, n: n.toLocaleString() });

// plugins/last-seen/state.ts
var settings = {
  showOnProfiles: {
    type: "boolean",
    get label() {
      return t("settings.showOnProfiles");
    },
    get description() {
      return t("settings.showOnProfiles.description");
    },
    default: true
  },
  showInMemberList: {
    type: "boolean",
    get label() {
      return t("settings.showInMemberList");
    },
    get description() {
      return t("settings.showInMemberList.description");
    },
    default: true
  },
  showInFriends: {
    type: "boolean",
    get label() {
      return t("settings.showInFriends");
    },
    get description() {
      return t("settings.showInFriends.description");
    },
    default: true
  },
  showInDms: {
    type: "boolean",
    get label() {
      return t("settings.showInDms");
    },
    get description() {
      return t("settings.showInDms.description");
    },
    default: true
  },
  ignoreBots: {
    type: "boolean",
    get label() {
      return t("settings.ignoreBots");
    },
    get description() {
      return t("settings.ignoreBots.description");
    },
    default: true
  }
};
var state = {
  context: undefined,
  tracker: new Map,
  dirty: false,
  loaded: false
};
var stores = new Map;
var store = (name) => {
  let found = stores.get(name);
  if (found)
    return found;
  try {
    found = import_api2.getStore(name);
  } catch {
    return;
  }
  stores.set(name, found);
  return found;
};
var me;
var ownId = () => me ??= store("UserStore")?.getCurrentUser?.()?.id;
var refreshOwnId = () => void (me = store("UserStore")?.getCurrentUser?.()?.id);
var statusOf = (id) => store("PresenceStore")?.getStatus?.(id);
var isOnline = (id) => isOnlineStatus(statusOf(id));
var isBot = (id) => store("UserStore")?.getUser?.(id)?.bot;
var ignored = (id, bot) => isIgnored(id, bot, ownId(), !!state.context?.settings.get("ignoreBots"));
var keepIds;
var friendsListed = false;
function keepSet() {
  if (keepIds)
    return keepIds;
  const next = new Set;
  friendsListed = false;
  try {
    const friends = store("RelationshipStore")?.getFriendIDs?.();
    if (Array.isArray(friends)) {
      friendsListed = true;
      for (const id of friends)
        next.add(id);
    }
    const channels = store("PrivateChannelStore")?.getPrivateChannelIds?.();
    const channelStore = store("ChannelStore");
    for (const channelId of channels ?? []) {
      const channel = channelStore?.getChannel?.(channelId);
      if (channel?.type === 1)
        for (const id of channel.recipients ?? [])
          next.add(id);
    }
  } catch {}
  keepIds = next;
  return next;
}
var invalidateKeep = () => void (keepIds = undefined);
var keep = (id) => keepSet().has(id) || !friendsListed && !!store("RelationshipStore")?.isFriend?.(id);
var opts = { cap: DEFAULT_CAP, keep, slack: PRUNE_SLACK };
function resetLookups() {
  me = undefined;
  keepIds = undefined;
}
function channelLabel(channelId) {
  if (!channelId)
    return;
  const channel = store("ChannelStore")?.getChannel?.(channelId);
  if (!channel)
    return;
  if (channel.type === 1)
    return t("where.dms");
  if (channel.type === 3)
    return channel.name ? t("where.group", { name: channel.name }) : t("where.groupUnnamed");
  return channel.name ? t("where.channel", { name: channel.name }) : undefined;
}
var entryOf = (id) => state.tracker.get(id);
function fullText(id) {
  const entry = entryOf(id);
  return describe(entry, isOnline(id), Date.now(), channelLabel(entry?.channelId), words);
}
var userListeners = new Map;
var panelListeners = new Set;
var epoch = 0;
var userVersions = new Map;
var version = 0;
var pendingIds = new Set;
var pendingAll = false;
var bumpTimer;
var clock = Date.now();
var call = (listeners) => {
  for (const l of [...listeners])
    l();
};
function notify(ids) {
  clock = Date.now();
  version++;
  if (ids) {
    for (const id of ids) {
      userVersions.set(id, (userVersions.get(id) ?? 0) + 1);
      const listeners = userListeners.get(id);
      if (listeners)
        call(listeners);
    }
  } else {
    epoch++;
    userVersions.clear();
    for (const listeners of userListeners.values())
      call(listeners);
  }
  call(panelListeners);
}
function bumpNow() {
  clearTimeout(bumpTimer);
  bumpTimer = undefined;
  pendingIds.clear();
  pendingAll = false;
  notify();
}
var tick = () => notify();
function flushChanges() {
  bumpTimer = undefined;
  if (pendingAll)
    return bumpNow();
  const ids = [...pendingIds];
  pendingIds.clear();
  notify(ids);
}
function changed(id) {
  state.dirty = true;
  if (id === undefined)
    pendingAll = true;
  else
    pendingIds.add(id);
  bumpTimer ??= setTimeout(flushChanges, 5000);
}
var versionOf = (id) => `${epoch}:${userVersions.get(id) ?? 0}`;
function useVersion() {
  return import_api2.React.useSyncExternalStore((cb) => {
    panelListeners.add(cb);
    return () => void panelListeners.delete(cb);
  }, () => version);
}
function subscribeUser(id, cb) {
  let listeners = userListeners.get(id);
  if (!listeners)
    userListeners.set(id, listeners = new Set);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (!listeners.size && userListeners.get(id) === listeners)
      userListeners.delete(id);
  };
}
function useUser(userId, read) {
  const subscribe = import_api2.React.useCallback((cb) => subscribeUser(userId, cb), [userId]);
  return import_api2.React.useSyncExternalStore(subscribe, read);
}
function lineOf(userId, setting) {
  if (!state.context?.settings.get(setting) || isOnline(userId))
    return "";
  return lineText(entryOf(userId), clock, words) ?? "";
}
var DB_NAME = "evi-last-seen";
var DB_STORE = "kv";
var DB_KEY = "data";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
async function dbPut(value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      if (value === undefined)
        tx.objectStore(DB_STORE).delete(DB_KEY);
      else
        tx.objectStore(DB_STORE).put(value, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function save() {
  if (!state.dirty || !state.loaded)
    return;
  state.dirty = false;
  try {
    await dbPut(pack(state.tracker, Date.now()));
  } catch (e) {
    state.dirty = true;
    state.context?.logger.error("Couldn't save", e);
  }
}
function replaceAll(tracker) {
  state.tracker = tracker;
  state.dirty = true;
  state.loaded = true;
  bumpNow();
  return save();
}

// plugins/last-seen/line.tsx
var jsx_runtime = require("react/jsx-runtime");
var lineCss = `
.evi-last-seen-sub { display: block; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-last-seen-sub > span { display: block; overflow: hidden; text-overflow: ellipsis; }
`;
var memoized;
var lastSeenLine = () => memoized ??= import_api3.React.memo(LastSeenLine);
function LastSeenLine({ userId, setting, className }) {
  import_api3.useLocale();
  const text = useUser(userId, () => lineOf(userId, setting));
  const [hovered, setHovered] = import_api3.React.useState(false);
  if (!text)
    return null;
  const Tooltip = import_api3.Components.Tooltip;
  const full = hovered || !Tooltip ? fullText(userId) ?? text : text;
  const line = /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: className ? `evi-last-seen-sub ${className}` : "evi-last-seen-sub",
    children: /* @__PURE__ */ jsx_runtime.jsx("span", {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      children: text
    })
  });
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: full,
    children: line
  }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
    title: full,
    children: line
  });
}

// plugins/last-seen/dms.tsx
var jsx_runtime2 = require("react/jsx-runtime");
var dmPatches = [
  {
    find: "PrivateChannel.renderAvatar: Invalid prop",
    replace: {
      match: /(subText:(\i)\.isSystemDM\(\)\?.{0,600}?:\(0,\i\.\i\)\(\{activities:\i,status:(\i),applicationStream:\i,voiceChannel:\i\}\)\?.{0,300}?):null,name:/,
      with: "$1:$self?.dmSubText?.($2,$3)??null,name:"
    }
  }
];
var dmMethods = {
  dmSubText(channel, status) {
    try {
      if (!state.context?.settings.get("showInDms") || isOnlineStatus(status))
        return null;
      const id = channel?.getRecipientId?.();
      if (!id || !lineText(entryOf(id), Date.now()) || ignored(id, isBot(id)))
        return null;
      const Line = lastSeenLine();
      return /* @__PURE__ */ jsx_runtime2.jsx(Line, {
        userId: id,
        setting: "showInDms"
      });
    } catch (e) {
      state.context?.logger.error("DM subtext failed", e);
      return null;
    }
  }
};

// plugins/last-seen/friends.tsx
var import_api4 = require("@evi/api");
var jsx_runtime3 = require("react/jsx-runtime");
var friendsPatches = [
  {
    find: "peopleListItemRef",
    replace: {
      match: /subText:(\(0,\i\.jsx\)\(\i,\{hovered:\i,activities:\i,applicationStream:\i,status:(\i),user:(\i),userIgnored:[^}]*\}\))/,
      with: "subText:$self?.friendSubText?.($1,$3,$2)??$1"
    }
  }
];
function FriendSubText({ original, userId }) {
  import_api4.useLocale();
  const show = useUser(userId, () => !!lineOf(userId, "showInFriends"));
  const Line = lastSeenLine();
  return show ? /* @__PURE__ */ jsx_runtime3.jsx(Line, {
    userId,
    setting: "showInFriends"
  }) : /* @__PURE__ */ jsx_runtime3.jsx(jsx_runtime3.Fragment, {
    children: original
  });
}
var memoized2;
var friendsMethods = {
  friendSubText(original, user, status) {
    try {
      if (!state.context || !user?.id || isOnlineStatus(status) || original?.props?.userIgnored || ignored(user.id, user.bot))
        return original;
      const SubText = memoized2 ??= import_api4.React.memo(FriendSubText);
      return /* @__PURE__ */ jsx_runtime3.jsx(SubText, {
        original,
        userId: user.id
      });
    } catch (e) {
      state.context?.logger.error("Friends list line failed", e);
      return original;
    }
  }
};

// plugins/last-seen/panel.tsx
var import_api5 = require("@evi/api");
var jsx_runtime4 = require("react/jsx-runtime");
var SHOWN = 100;
var UNDO_FOR = 1e4;
var css = `
.evi-ls-panel { display: flex; flex-direction: column; gap: 16px; }
.evi-ls-row { display: flex; align-items: center; gap: 12px; }
.evi-ls-row > .dl-field-text { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 4px; }
.evi-ls-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.evi-ls-meter { block-size: 4px; margin-block-start: 4px; border-radius: 999px; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); overflow: hidden; }
.evi-ls-meter > span { display: block; block-size: 100%; border-radius: inherit; background: var(--dl-text-muted, #949ba4); }
.evi-ls-meter[data-full] > span { background: var(--dl-text-warning, #f0b232); }
.evi-ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.evi-ls-person { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: var(--dl-radius-control, 8px); }
@media (hover: hover) { .evi-ls-person:hover { background: var(--dl-bg-hover, rgb(151 151 159 / 0.12)); } }
.evi-ls-avatar { flex: none; inline-size: 32px; block-size: 32px; border-radius: 50%; object-fit: cover; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); display: grid; place-items: center; color: var(--dl-text-subtle, #b5bac1); font-size: 14px; font-weight: 600; }
.evi-ls-text { min-inline-size: 0; display: flex; flex-direction: column; }
.evi-ls-name { color: var(--dl-text-strong, #f2f3f5); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-times { color: var(--dl-text-muted, #949ba4); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-id { font-family: var(--dl-font-code, ui-monospace, Consolas, monospace); }
`;
function SmallButton({ children, onClick, disabled, danger, label }) {
  const Button = import_api5.Components.Button;
  return Button ? /* @__PURE__ */ jsx_runtime4.jsx(Button, {
    color: danger ? Button.Colors?.RED : Button.Colors?.PRIMARY,
    size: Button.Sizes?.SMALL,
    disabled,
    onClick,
    "aria-label": label,
    children
  }) : /* @__PURE__ */ jsx_runtime4.jsx("button", {
    type: "button",
    className: "dl-button",
    "data-variant": danger ? "danger" : undefined,
    disabled,
    onClick,
    "aria-label": label,
    children
  });
}
var latest = (e) => Math.max(e.seen ?? 0, e.active ?? 0, e.message ?? 0);
function nameOf(id) {
  const user = store("UserStore")?.getUser?.(id);
  const nick = store("RelationshipStore")?.getNickname?.(id);
  const name = nick || user?.globalName || user?.global_name || user?.username;
  const search = [nick, user?.globalName ?? user?.global_name, user?.username, id].filter(Boolean).join(" ").toLowerCase();
  return { name: name ?? id, known: !!name, search, user };
}
function download(data) {
  const date = new Date;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `evi-last-seen-${day}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Remembered() {
  import_api5.useLocale();
  useVersion();
  const count = state.tracker.size;
  const [confirming, setConfirming] = import_api5.React.useState(false);
  const [undo, setUndo] = import_api5.React.useState();
  const fileRef = import_api5.React.useRef(null);
  import_api5.React.useEffect(() => {
    if (!undo)
      return;
    const timer = setTimeout(() => setUndo(undefined), UNDO_FOR);
    return () => clearTimeout(timer);
  }, [undo]);
  const clear = () => {
    setConfirming(false);
    setUndo({ tracker: state.tracker, count });
    replaceAll(new Map);
  };
  const restore2 = () => {
    if (!undo)
      return;
    const tracker = new Map(undo.tracker);
    for (const [id, entry] of state.tracker) {
      const old = tracker.get(id);
      tracker.delete(id);
      tracker.set(id, merge(old, entry));
    }
    setUndo(undefined);
    replaceAll(tracker);
    state.context?.toast(t("toast.restored", { people: people(tracker.size) }), { type: "success" });
  };
  const importFile = async (file) => {
    try {
      const imported = deserialize(JSON.parse(await file.text()), opts);
      if (!imported.size) {
        state.context?.toast(t("toast.nothingToImport"), { type: "failure" });
        return;
      }
      const tracker = new Map(state.tracker);
      for (const [id, entry] of imported) {
        const current = tracker.get(id);
        tracker.delete(id);
        tracker.set(id, current ? merge(entry, current) : entry);
      }
      await replaceAll(tracker);
      state.context?.toast(t("toast.imported", { people: people(imported.size) }), { type: "success" });
    } catch (e) {
      state.context?.logger.error("Couldn't import", e);
      state.context?.toast(t("toast.badFile"), { type: "failure" });
    }
  };
  const ratio = Math.min(1, count / DEFAULT_CAP);
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "evi-ls-row",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime4.jsx("div", {
            className: "dl-label",
            children: t("remembered.title")
          }),
          /* @__PURE__ */ jsx_runtime4.jsx("p", {
            className: "dl-hint",
            role: "status",
            style: { fontVariantNumeric: "tabular-nums" },
            children: undo ? t("remembered.cleared", { people: people(undo.count) }) : t("remembered.status", { people: people(count), cap: DEFAULT_CAP.toLocaleString() })
          }),
          !undo && /* @__PURE__ */ jsx_runtime4.jsx("div", {
            className: "evi-ls-meter",
            "data-full": ratio >= 0.9 || undefined,
            role: "meter",
            "aria-label": t("remembered.meter"),
            "aria-valuemin": 0,
            "aria-valuemax": DEFAULT_CAP,
            "aria-valuenow": count,
            children: /* @__PURE__ */ jsx_runtime4.jsx("span", {
              style: { inlineSize: `${ratio * 100}%` }
            })
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime4.jsxs("div", {
        className: "evi-ls-actions",
        children: [
          undo ? /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
            onClick: restore2,
            children: t("remembered.undo")
          }) : confirming ? /* @__PURE__ */ jsx_runtime4.jsxs(jsx_runtime4.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                onClick: () => setConfirming(false),
                children: t("remembered.cancel")
              }),
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                danger: true,
                onClick: clear,
                children: t("remembered.confirmClear", { people: people(count) })
              })
            ]
          }) : /* @__PURE__ */ jsx_runtime4.jsxs(jsx_runtime4.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                disabled: !count,
                onClick: () => download(serialize(state.tracker, Date.now())),
                children: t("remembered.export")
              }),
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                onClick: () => fileRef.current?.click(),
                children: t("remembered.import")
              }),
              /* @__PURE__ */ jsx_runtime4.jsx(SmallButton, {
                danger: true,
                disabled: !count,
                onClick: () => setConfirming(true),
                children: t("remembered.clear")
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime4.jsx("input", {
            ref: fileRef,
            type: "file",
            accept: "application/json,.json",
            hidden: true,
            onChange: (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file)
                importFile(file);
            }
          })
        ]
      })
    ]
  });
}
function Avatar({ user, name }) {
  const [broken, setBroken] = import_api5.React.useState(false);
  let src;
  try {
    src = user?.getAvatarURL?.(undefined, 32);
  } catch {}
  if (!src || broken)
    return /* @__PURE__ */ jsx_runtime4.jsx("span", {
      className: "evi-ls-avatar",
      "aria-hidden": "true",
      children: name.slice(0, 1).toUpperCase()
    });
  return /* @__PURE__ */ jsx_runtime4.jsx("img", {
    className: "evi-ls-avatar",
    src,
    alt: "",
    width: 32,
    height: 32,
    onError: () => setBroken(true)
  });
}
function People() {
  import_api5.useLocale();
  const [query, setQuery] = import_api5.React.useState("");
  const q = query.trim().toLowerCase();
  const version2 = useVersion();
  const sorted = import_api5.React.useMemo(() => [...state.tracker].sort((a, b) => latest(b[1]) - latest(a[1])).map(([id]) => id), [version2, state.tracker]);
  const matches = [];
  let total = 0;
  for (const id of sorted) {
    if (!q) {
      if (matches.length < SHOWN)
        matches.push({ id, name: nameOf(id) });
      continue;
    }
    const name = nameOf(id);
    if (!name.search.includes(q))
      continue;
    total++;
    if (matches.length < SHOWN)
      matches.push({ id, name });
  }
  if (!q)
    total = sorted.length;
  const TextField = import_api5.Components.TextField;
  const label = t("people.searchLabel");
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "dl-field",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsx("div", {
        className: "dl-label",
        children: t("people.title")
      }),
      TextField ? /* @__PURE__ */ jsx_runtime4.jsx(TextField, {
        value: query,
        onChange: (v) => setQuery(v),
        placeholder: t("people.searchPlaceholder"),
        "aria-label": label
      }) : /* @__PURE__ */ jsx_runtime4.jsx("input", {
        className: "dl-input",
        type: "search",
        autoComplete: "off",
        spellCheck: false,
        placeholder: t("people.searchPlaceholder"),
        "aria-label": label,
        value: query,
        onChange: (e) => setQuery(e.currentTarget.value)
      }),
      matches.length ? /* @__PURE__ */ jsx_runtime4.jsx("ul", {
        className: "evi-ls-list",
        children: matches.map(({ id, name }) => /* @__PURE__ */ jsx_runtime4.jsxs("li", {
          className: "evi-ls-person",
          children: [
            /* @__PURE__ */ jsx_runtime4.jsx(Avatar, {
              user: name.user,
              name: name.name
            }),
            /* @__PURE__ */ jsx_runtime4.jsxs("span", {
              className: "evi-ls-text",
              children: [
                /* @__PURE__ */ jsx_runtime4.jsx("span", {
                  className: name.known ? "evi-ls-name" : "evi-ls-name evi-ls-id",
                  children: name.name
                }),
                /* @__PURE__ */ jsx_runtime4.jsx("span", {
                  className: "evi-ls-times",
                  children: fullText(id) ?? t("people.nothingRecent")
                })
              ]
            })
          ]
        }, id))
      }) : /* @__PURE__ */ jsx_runtime4.jsx("p", {
        className: "dl-hint",
        children: state.tracker.size ? t("people.noMatch") : t("people.empty")
      }),
      total > matches.length && /* @__PURE__ */ jsx_runtime4.jsx("p", {
        className: "dl-hint",
        style: { fontVariantNumeric: "tabular-nums" },
        children: t("people.showing", { shown: matches.length.toLocaleString(), total: total.toLocaleString() })
      })
    ]
  });
}
function SettingsPanel() {
  return /* @__PURE__ */ jsx_runtime4.jsxs("div", {
    className: "evi-ls-panel",
    children: [
      /* @__PURE__ */ jsx_runtime4.jsx("style", {
        children: css
      }),
      /* @__PURE__ */ jsx_runtime4.jsx(Remembered, {}),
      /* @__PURE__ */ jsx_runtime4.jsx(People, {})
    ]
  });
}

// plugins/last-seen/index.tsx
var jsx_runtime5 = require("react/jsx-runtime");
var SAVE_EVERY = 30000;
var MUTED = "#949ba4";
var CLOCK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`)}`;
var pendingPresences = new Map;
var pendingPages = [];
var cancelFlush;
var IDLE_TIMEOUT = 1000;
function whenIdle(fn) {
  if (typeof requestIdleCallback === "function") {
    const handle2 = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT });
    return () => cancelIdleCallback(handle2);
  }
  const handle = setTimeout(fn, 50);
  return () => clearTimeout(handle);
}
var scheduleFlush = () => void (cancelFlush ??= whenIdle(flush));
function flush(deadline) {
  cancelFlush = undefined;
  if (!state.context)
    return;
  const now = Date.now();
  for (const [id, bot] of pendingPresences) {
    if (!ignored(id, bot) && observePresence(state.tracker, id, statusOf(id), now, opts))
      changed(id);
  }
  pendingPresences.clear();
  while (pendingPages.length) {
    const page = pendingPages.shift();
    for (const msg of page.messages) {
      const id = message(msg, page.channelId);
      if (id)
        changed(id);
    }
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 1)
      break;
  }
  if (pendingPages.length)
    scheduleFlush();
}
function seed() {
  const statuses = store("PresenceStore")?.getState?.()?.statuses;
  const now = Date.now();
  let any = false;
  if (statuses) {
    for (const id in statuses) {
      if (isOnlineStatus(statuses[id]) && !ignored(id, isBot(id)))
        any = observePresence(state.tracker, id, statuses[id], now, opts) || any;
    }
  }
  for (const [id, entry] of state.tracker) {
    if (entry.online && !isOnline(id))
      any = observePresence(state.tracker, id, "offline", now, opts) || any;
  }
  if (any)
    changed();
}
function timeOf(timestamp) {
  const at = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now();
}
function message(msg, channelId) {
  const author = msg?.author;
  if (!author?.id || msg.webhook_id || ignored(author.id, author.bot))
    return;
  if (observeMessage(state.tracker, author.id, timeOf(msg.timestamp), { channelId: msg.channel_id ?? channelId, messageId: msg.id }, opts))
    return author.id;
}
function activity(id, at = Date.now()) {
  if (typeof id !== "string" || ignored(id))
    return;
  if (observeActivity(state.tracker, id, at, opts))
    changed(id);
}
function messageLink(userId) {
  const entry = state.tracker.get(userId);
  if (!entry?.channelId || !entry.messageId)
    return;
  const channel = store("ChannelStore")?.getChannel?.(entry.channelId);
  if (!channel)
    return;
  return `https://discord.com/channels/${channel.guild_id ?? "@me"}/${entry.channelId}/${entry.messageId}`;
}
var css2 = lineCss;
var last_seen_default = import_api6.definePlugin({
  settings,
  patches: [
    {
      find: "hideSubtext:",
      replace: {
        match: /subText:(\(0,\i\.jsx\)\(\i,\{hideSubtext:\i,activities:\i,status:(\i),[^}]*?user:(\i)[^}]*\}\))/,
        with: "subText:$self.memberSubText($1,$3,$2)"
      }
    },
    ...friendsPatches,
    ...dmPatches
  ],
  memberSubText(original, user, status) {
    if (!state.context || !user?.id || isOnlineStatus(status) || ignored(user.id, user.bot))
      return original;
    const Line = lastSeenLine();
    return /* @__PURE__ */ jsx_runtime5.jsxs(jsx_runtime5.Fragment, {
      children: [
        original,
        /* @__PURE__ */ jsx_runtime5.jsx(Line, {
          userId: user.id,
          setting: "showInMemberList"
        }, "evi-last-seen")
      ]
    });
  },
  ...friendsMethods,
  ...dmMethods,
  flux: {
    PRESENCE_UPDATES(action) {
      if (!state.context)
        return;
      for (const u of action?.updates ?? []) {
        const id = u?.user?.id;
        if (typeof id === "string")
          pendingPresences.set(id, u.user.bot);
      }
      scheduleFlush();
    },
    MESSAGE_CREATE(action) {
      if (!state.context || action?.optimistic)
        return;
      const id = message(action?.message, action?.channelId);
      if (id)
        changed(id);
    },
    LOAD_MESSAGES_SUCCESS(action) {
      if (!state.context || !Array.isArray(action?.messages) || !action.messages.length)
        return;
      pendingPages.push({ messages: action.messages, channelId: action.channelId });
      scheduleFlush();
    },
    TYPING_START(action) {
      if (state.context)
        activity(action?.userId);
    },
    MESSAGE_REACTION_ADD(action) {
      if (state.context && !action?.optimistic)
        activity(action?.userId);
    },
    VOICE_STATE_UPDATES(action) {
      if (!state.context)
        return;
      for (const vs of action?.voiceStates ?? [])
        activity(vs?.userId);
    },
    CONNECTION_OPEN() {
      if (!state.context)
        return;
      refreshOwnId();
      invalidateKeep();
      setTimeout(() => whenIdle(() => void (state.context && seed())), 1000);
    },
    RELATIONSHIP_ADD: invalidateKeep,
    RELATIONSHIP_REMOVE: invalidateKeep,
    RELATIONSHIP_UPDATE: invalidateKeep,
    CHANNEL_CREATE: invalidateKeep,
    CHANNEL_DELETE: invalidateKeep
  },
  start(ctx) {
    state.context = ctx;
    state.tracker = new Map;
    state.loaded = false;
    ctx.addStyle(css2);
    dbGet().then((data) => {
      if (state.context !== ctx)
        return;
      const live = state.tracker;
      const tracker = deserialize(data, opts);
      for (const [id, entry] of live) {
        const old = tracker.get(id);
        tracker.delete(id);
        tracker.set(id, merge(old, entry));
      }
      state.tracker = tracker;
      state.loaded = true;
      seed();
      state.dirty = true;
      bumpNow();
    }).catch((e) => {
      ctx.logger.error("Couldn't load saved data", e);
      state.loaded = true;
      seed();
    });
    ctx.setInterval(() => void (state.dirty && whenIdle(() => void save())), SAVE_EVERY);
    ctx.setInterval(tick, 60000);
    const onUnload = () => void save();
    window.addEventListener("beforeunload", onUnload);
    ctx.onDispose(() => window.removeEventListener("beforeunload", onUnload));
    ctx.settings.onChange(bumpNow);
    const badges = new Map;
    ctx.profileBadges((userId) => {
      if (!ctx.settings.get("showOnProfiles") || ignored(userId, isBot(userId)))
        return;
      const key = `${versionOf(userId)}:${statusOf(userId)}`;
      const cached = badges.get(userId);
      if (cached?.key === key)
        return cached.badges;
      const description = fullText(userId);
      const result = description ? [{ id: "last-seen", description, iconSrc: CLOCK, link: messageLink(userId) }] : undefined;
      if (badges.size >= 500)
        badges.clear();
      badges.set(userId, { key, badges: result });
      return result;
    });
  },
  stop() {
    save();
    cancelFlush?.();
    cancelFlush = undefined;
    pendingPresences.clear();
    pendingPages = [];
    state.context = undefined;
    resetLookups();
    bumpNow();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime5.jsx(SettingsPanel, {})
});
