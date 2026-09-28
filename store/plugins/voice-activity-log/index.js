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

// plugins/voice-activity-log/index.tsx
var exports_voice_activity_log = {};
__export(exports_voice_activity_log, {
  default: () => voice_activity_log_default
});
module.exports = __toCommonJS(exports_voice_activity_log);
var import_api2 = require("@evi/api");

// plugins/voice-activity-log/strings.ts
var import_api = require("@evi/api");

// src/shared/i18n.ts
function format(template, vars) {
  if (!vars)
    return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars) ? String(vars[name]) : whole);
}
var pluralRules = new Map;

// plugins/voice-activity-log/log.ts
var MAX_ENTRIES = 500;
var MAX_SESSIONS = 10;
function toMemberState(voiceState) {
  return {
    muted: !!(voiceState?.selfMute || voiceState?.mute || voiceState?.suppress),
    deafened: !!(voiceState?.selfDeaf || voiceState?.deaf),
    streaming: !!voiceState?.selfStream,
    video: !!voiceState?.selfVideo
  };
}
function snapshotOf(voiceStates, selfId) {
  const out = {};
  for (const [userId, state] of Object.entries(voiceStates ?? {})) {
    if (!state || userId === selfId)
      continue;
    out[userId] = toMemberState(state);
  }
  return out;
}
var ARRIVALS = new Set(["present", "join", "moveIn"]);
var DEPARTURES = new Set(["leave", "moveOut"]);
var DEFAULT_OPTIONS = { moves: true, streams: false, muteDeafen: false };
function touchesSession(voiceStates, channelId, snapshot, selfId) {
  if (!Array.isArray(voiceStates))
    return true;
  for (const vs of voiceStates) {
    const userId = vs?.userId;
    if (!userId || userId === selfId || userId in snapshot)
      return true;
    if (vs.channelId === channelId || vs.oldChannelId === channelId)
      return true;
  }
  return false;
}
function diffSnapshots(channelId, prev, next, options = DEFAULT_OPTIONS, moveOf = () => {
  return;
}) {
  const departures = [];
  const arrivals = [];
  const changes = [];
  for (const userId of Object.keys(prev)) {
    if (userId in next)
      continue;
    const to = moveOf(userId)?.to;
    departures.push(options.moves && to && to !== channelId ? { kind: "moveOut", userId, otherChannelId: to } : { kind: "leave", userId });
  }
  for (const [userId, now] of Object.entries(next)) {
    const before = prev[userId];
    if (!before) {
      const from = moveOf(userId)?.from;
      arrivals.push(options.moves && from && from !== channelId ? { kind: "moveIn", userId, otherChannelId: from } : { kind: "join", userId });
      continue;
    }
    if (options.streams) {
      if (before.streaming !== now.streaming)
        changes.push({ kind: now.streaming ? "streamStart" : "streamStop", userId });
      if (before.video !== now.video)
        changes.push({ kind: now.video ? "videoStart" : "videoStop", userId });
    }
    if (options.muteDeafen) {
      const deafChanged = before.deafened !== now.deafened;
      if (deafChanged)
        changes.push({ kind: now.deafened ? "deafen" : "undeafen", userId });
      const muteImplied = deafChanged && now.muted === now.deafened;
      if (before.muted !== now.muted && !muteImplied)
        changes.push({ kind: now.muted ? "mute" : "unmute", userId });
    }
  }
  return [...departures, ...arrivals, ...changes];
}

class VoiceLog {
  maxEntries;
  maxSessions;
  sessions = [];
  version = 0;
  nextId = 1;
  nextSession = 1;
  listeners = new Set;
  constructor(maxEntries = MAX_ENTRIES, maxSessions = MAX_SESSIONS) {
    this.maxEntries = maxEntries;
    this.maxSessions = maxSessions;
  }
  get current() {
    const first = this.sessions[0];
    return first && first.endedAt === undefined ? first : undefined;
  }
  sync(input) {
    const now = input.now ?? Date.now();
    const nameOf = input.nameOf ?? ((id) => id);
    const channelName = input.channelName ?? ((id) => id);
    const added = [];
    let current = this.current;
    if (current && current.channelId !== input.channelId) {
      added.push(this.end(current, now, input.channelId, input.selfId, channelName));
      current = undefined;
    }
    if (!current && input.channelId) {
      current = {
        id: this.nextSession++,
        channelId: input.channelId,
        channelName: channelName(input.channelId),
        guildId: input.guildId,
        startedAt: now,
        entries: [],
        here: {},
        snapshot: input.snapshot
      };
      this.sessions.unshift(current);
      added.push(this.push(current, { kind: "selfJoin", userId: input.selfId ?? "", name: "You", at: now }));
      for (const userId of Object.keys(input.snapshot)) {
        current.here[userId] = now;
        added.push(this.push(current, { kind: "present", userId, name: nameOf(userId), at: now }));
      }
    } else if (current) {
      const events = diffSnapshots(current.channelId, current.snapshot, input.snapshot, input.options, input.moveOf);
      current.snapshot = input.snapshot;
      for (const event of events)
        added.push(this.apply(current, event, now, nameOf, channelName));
    }
    if (added.length) {
      this.trim();
      this.changed();
    }
    return added;
  }
  last(count) {
    const all = [];
    for (const session of this.sessions) {
      for (let i = session.entries.length - 1;i >= 0 && all.length < count; i--)
        all.push(session.entries[i]);
      if (all.length >= count)
        break;
    }
    return all.reverse();
  }
  get size() {
    return this.sessions.reduce((n, s) => n + s.entries.length, 0);
  }
  clear() {
    const current = this.current;
    if (!this.size && this.sessions.length === (current ? 1 : 0))
      return;
    this.sessions = current ? [current] : [];
    if (current)
      current.entries = [];
    this.changed();
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getVersion = () => this.version;
  push(session, entry) {
    const full = { id: this.nextId++, sessionId: session.id, channelId: session.channelId, ...entry };
    session.entries.push(full);
    return full;
  }
  arrivalOf(session, userId) {
    for (let i = session.entries.length - 1;i >= 0; i--) {
      const e = session.entries[i];
      if (e.userId === userId && ARRIVALS.has(e.kind))
        return e.leftAt === undefined ? e : undefined;
    }
  }
  apply(session, event, now, nameOf, channelName) {
    const { kind, userId, otherChannelId } = event;
    const entry = { kind, userId, name: nameOf(userId), at: now };
    if (otherChannelId) {
      entry.otherChannelId = otherChannelId;
      entry.otherChannelName = channelName(otherChannelId);
    }
    if (ARRIVALS.has(kind))
      session.here[userId] = now;
    if (DEPARTURES.has(kind)) {
      const since = session.here[userId];
      if (since !== undefined) {
        entry.stayed = now - since;
        const arrival = this.arrivalOf(session, userId);
        if (arrival) {
          arrival.leftAt = now;
          if (arrival.kind === "present")
            entry.sinceBefore = true;
        }
      }
      delete session.here[userId];
    }
    return this.push(session, entry);
  }
  end(session, now, nextChannel, selfId, channelName) {
    session.endedAt = now;
    for (const userId of Object.keys(session.here)) {
      const arrival = this.arrivalOf(session, userId);
      if (arrival) {
        arrival.leftAt = now;
        arrival.stillThere = true;
      }
    }
    session.here = {};
    const entry = { kind: "selfLeave", userId: selfId ?? "", name: "You", at: now, stayed: now - session.startedAt };
    if (nextChannel) {
      entry.otherChannelId = nextChannel;
      entry.otherChannelName = channelName(nextChannel);
    }
    return this.push(session, entry);
  }
  trim() {
    while (this.sessions.length > this.maxSessions)
      this.sessions.pop();
    let excess = this.size - this.maxEntries;
    for (let i = this.sessions.length - 1;i >= 0 && excess > 0; i--) {
      const session = this.sessions[i];
      const drop = Math.min(excess, session.entries.length);
      session.entries.splice(0, drop);
      excess -= drop;
      if (!session.entries.length && session !== this.current)
        this.sessions.splice(i, 1);
    }
  }
  changed() {
    this.version++;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}
var EN_WORDS = {
  "duration.s": "{n}s",
  "duration.m": "{n}m",
  "duration.h": "{n}h",
  "duration.hm": "{h}h {m}m",
  "channel.id": "channel {id}",
  "channel.other": "another channel",
  "stay.some": " (stayed {d})",
  "stay.atLeast": " (stayed at least {d})",
  "entry.selfJoin": "You joined {channel}",
  "entry.selfMove": "You moved to {other}{stayed}",
  "entry.selfLeave": "You left{stayed}",
  "entry.present": "{n} was already here",
  "entry.join": "{n} joined",
  "entry.leave": "{n} left{stayed}",
  "entry.moveIn": "{n} moved in from {other}",
  "entry.moveOut": "{n} moved to {other}{stayed}",
  "entry.streamStart": "{n} started streaming",
  "entry.streamStop": "{n} stopped streaming",
  "entry.videoStart": "{n} turned on their camera",
  "entry.videoStop": "{n} turned off their camera",
  "entry.mute": "{n} muted",
  "entry.unmute": "{n} unmuted",
  "entry.deafen": "{n} deafened",
  "entry.undeafen": "{n} undeafened",
  "note.here": "still here · {d}",
  "note.stillThere": "still there when you left · {d}",
  "note.atLeast": "stayed at least {d}",
  "note.stayed": "stayed {d}",
  "text.now": "now",
  "text.nothing": "(nothing logged)",
  "filter.all": "All",
  "filter.people": "Joins & leaves",
  "filter.streams": "Streams",
  "filter.voice": "Mute & deafen"
};
var english = (key, vars) => format(EN_WORDS[key], vars);
var pad = (n) => String(n).padStart(2, "0");
function formatClock(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDuration(ms, tr = english) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60)
    return tr("duration.s", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60)
    return tr("duration.m", { n: m });
  const h = Math.floor(m / 60);
  return m % 60 ? tr("duration.hm", { h, m: m % 60 }) : tr("duration.h", { n: h });
}
var channelLabel = (name, id, tr) => name || (id ? tr("channel.id", { id }) : tr("channel.other"));
function describe(entry, sessionChannelName, tr = english) {
  const n = entry.name;
  const stayed = entry.stayed !== undefined ? tr(entry.sinceBefore ? "stay.atLeast" : "stay.some", { d: formatDuration(entry.stayed, tr) }) : "";
  const other = channelLabel(entry.otherChannelName, entry.otherChannelId, tr);
  const vars = { n, other, stayed };
  switch (entry.kind) {
    case "selfJoin":
      return tr("entry.selfJoin", { channel: channelLabel(sessionChannelName, entry.channelId, tr) });
    case "selfLeave":
      return entry.otherChannelId ? tr("entry.selfMove", vars) : tr("entry.selfLeave", vars);
    default:
      return tr(`entry.${entry.kind}`, vars);
  }
}
function stayNote(entry, now, tr = english) {
  if (!ARRIVALS.has(entry.kind))
    return;
  if (entry.leftAt === undefined)
    return tr("note.here", { d: formatDuration(now - entry.at, tr) });
  const d = formatDuration(entry.leftAt - entry.at, tr);
  if (entry.stillThere)
    return tr("note.stillThere", { d });
  return tr(entry.kind === "present" ? "note.atLeast" : "note.stayed", { d });
}
var formatLine = (entry, sessionChannelName, tr = english) => `${formatClock(entry.at)}  ${describe(entry, sessionChannelName, tr)}`;
function formatSessions(sessions, now = Date.now(), tr = english) {
  return sessions.map((s) => {
    const end = s.endedAt !== undefined ? formatClock(s.endedAt) : tr("text.now");
    const date = new Date(s.startedAt).toLocaleDateString();
    const head = `${channelLabel(s.channelName, s.channelId, tr)} · ${date} ${formatClock(s.startedAt)}–${end} (${formatDuration((s.endedAt ?? now) - s.startedAt, tr)})`;
    const lines = s.entries.map((e) => formatLine(e, s.channelName, tr));
    return [head, ...lines.length ? lines : [tr("text.nothing")]].join(`
`);
  }).join(`

`);
}
var FILTERS = [
  { value: "all", label: EN_WORDS["filter.all"], key: "filter.all" },
  { value: "people", label: EN_WORDS["filter.people"], key: "filter.people" },
  { value: "streams", label: EN_WORDS["filter.streams"], key: "filter.streams" },
  { value: "voice", label: EN_WORDS["filter.voice"], key: "filter.voice" }
];
var GROUPS = {
  people: new Set(["selfJoin", "selfLeave", "present", "join", "leave", "moveIn", "moveOut"]),
  streams: new Set(["streamStart", "streamStop", "videoStart", "videoStop"]),
  voice: new Set(["mute", "unmute", "deafen", "undeafen"])
};
function filterEntries(entries, kind, query = "") {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => (kind === "all" || GROUPS[kind].has(e.kind)) && (!q || e.name.toLowerCase().includes(q)));
}
function shouldToast(entry, settings, focused) {
  if (!settings.toasts || settings.onlyUnfocused && focused)
    return false;
  return entry.kind === "join" || entry.kind === "leave" || entry.kind === "moveIn" || entry.kind === "moveOut";
}
var PATCHES = {
  rtcPanel: {
    find: ".VOICE_PANEL_INTRODUCTION)&&",
    replace: {
      match: /(grow:0,shrink:0,className:\i\.\i,children:\[)(?=\i&&!\i\?\(0,\i\.jsx\)\(\i,\{channel:(\i)\}\):null,)/,
      with: "$1$self?.renderButton?.($2),"
    }
  }
};

// plugins/voice-activity-log/strings.ts
var t = import_api.defineStrings({
  en: {
    ...EN_WORDS,
    "settings.moves": "Moves",
    "settings.moves.description": "Log moves from and to other channels as moves, not as plain joins and leaves.",
    "settings.streams": "Streams and camera",
    "settings.streams.description": "Log when someone starts or stops streaming or their camera.",
    "settings.muteDeafen": "Mutes and deafens",
    "settings.muteDeafen.description": "Log when someone mutes, unmutes, deafens or undeafens.",
    "settings.toasts": "Toasts",
    "settings.toasts.description": "Pop up a toast when someone joins, leaves or moves.",
    "settings.onlyUnfocused": "Only when Discord isn't focused",
    "settings.onlyUnfocused.description": "Show those toasts only while the Discord window isn't focused.",
    "settings.showButton": "Voice panel button",
    "settings.showButton.description": "A log button in the Voice Connected panel. /vclog works either way.",
    "user.unknown": "Unknown user",
    "channel.call": "a call",
    "dialog.title": "Voice Activity Log",
    "dialog.subtitle": "Who came and went in your voice channels. Kept until Discord restarts.",
    "dialog.close": "Close",
    "dialog.empty": "Nothing yet. Join a voice channel and who comes and goes shows up here.",
    "dialog.sessions": "Sessions",
    "dialog.live": "You're here now",
    "dialog.sessionNow": "Now · {d}",
    "dialog.filterName": "Filter by name",
    "dialog.show": "Show",
    "dialog.activityIn": "Activity in {channel}",
    "dialog.noMatch": "Nothing matches the filter.",
    "dialog.noneInSession": "Nothing logged in this session yet.",
    "dialog.clear": "Clear log",
    "dialog.copy": "Copy as text",
    "toast.copied": "Copied the log",
    "toast.copyFailed": "Couldn't copy the log",
    "button.label": "Voice activity log",
    "panel.log": "Log",
    "panel.open": "Open log",
    "panel.entries": { one: "{count} entry", other: "{count} entries" },
    "panel.sessions": { one: "{count} session", other: "{count} sessions" },
    "panel.summary": "{entries} over {sessions}. Kept in memory only.",
    "panel.nothing": "Nothing yet. Kept in memory only.",
    "command.description": "Who joined and left your voice channel recently",
    "command.empty": "Nothing logged yet. Join a voice channel and who comes and goes shows up here."
  },
  de: {
    "duration.s": "{n} s",
    "duration.m": "{n} Min.",
    "duration.h": "{n} Std.",
    "duration.hm": "{h} Std. {m} Min.",
    "channel.id": "Kanal {id}",
    "channel.other": "einem anderen Kanal",
    "stay.some": " (blieb {d})",
    "stay.atLeast": " (blieb mindestens {d})",
    "entry.selfJoin": "Du bist {channel} beigetreten",
    "entry.selfMove": "Du bist zu {other} gewechselt{stayed}",
    "entry.selfLeave": "Du hast den Kanal verlassen{stayed}",
    "entry.present": "{n} war schon da",
    "entry.join": "{n} ist beigetreten",
    "entry.leave": "{n} hat den Kanal verlassen{stayed}",
    "entry.moveIn": "{n} ist von {other} hierher gewechselt",
    "entry.moveOut": "{n} ist zu {other} gewechselt{stayed}",
    "entry.streamStart": "{n} hat einen Stream gestartet",
    "entry.streamStop": "{n} hat den Stream beendet",
    "entry.videoStart": "{n} hat die Kamera eingeschaltet",
    "entry.videoStop": "{n} hat die Kamera ausgeschaltet",
    "entry.mute": "{n} hat das Mikrofon stummgeschaltet",
    "entry.unmute": "{n} hat die Stummschaltung aufgehoben",
    "entry.deafen": "{n} hat den Ton deaktiviert",
    "entry.undeafen": "{n} hat den Ton wieder aktiviert",
    "note.here": "noch da · {d}",
    "note.stillThere": "noch da, als du gegangen bist · {d}",
    "note.atLeast": "blieb mindestens {d}",
    "note.stayed": "blieb {d}",
    "text.now": "jetzt",
    "text.nothing": "(nichts protokolliert)",
    "filter.all": "Alle",
    "filter.people": "Beitritte & Austritte",
    "filter.streams": "Streams",
    "filter.voice": "Stumm & Ton aus",
    "settings.moves": "Kanalwechsel",
    "settings.moves.description": "Wechsel aus und in andere Kanäle als Wechsel protokollieren, nicht als einfache Beitritte und Austritte.",
    "settings.streams": "Streams und Kamera",
    "settings.streams.description": "Protokollieren, wenn jemand einen Stream oder die Kamera startet oder beendet.",
    "settings.muteDeafen": "Stummschaltungen",
    "settings.muteDeafen.description": "Protokollieren, wenn jemand das Mikrofon oder den Ton ein- oder ausschaltet.",
    "settings.toasts": "Hinweise",
    "settings.toasts.description": "Einen Hinweis einblenden, wenn jemand beitritt, geht oder wechselt.",
    "settings.onlyUnfocused": "Nur wenn Discord nicht im Fokus ist",
    "settings.onlyUnfocused.description": "Diese Hinweise nur zeigen, solange das Discord-Fenster nicht im Fokus ist.",
    "settings.showButton": "Button im Sprachbereich",
    "settings.showButton.description": "Ein Protokoll-Button im Bereich „Sprache verbunden“. /vclog funktioniert in beiden Fällen.",
    "user.unknown": "Unbekannter Nutzer",
    "channel.call": "einem Anruf",
    "dialog.title": "Sprachaktivitätsprotokoll",
    "dialog.subtitle": "Wer in deinen Sprachkanälen gekommen und gegangen ist. Bleibt bis zum Neustart von Discord erhalten.",
    "dialog.close": "Schließen",
    "dialog.empty": "Noch nichts. Tritt einem Sprachkanal bei, dann erscheint hier, wer kommt und geht.",
    "dialog.sessions": "Sitzungen",
    "dialog.live": "Du bist gerade hier",
    "dialog.sessionNow": "Jetzt · {d}",
    "dialog.filterName": "Nach Namen filtern",
    "dialog.show": "Anzeigen",
    "dialog.activityIn": "Aktivität in {channel}",
    "dialog.noMatch": "Nichts passt zum Filter.",
    "dialog.noneInSession": "In dieser Sitzung wurde noch nichts protokolliert.",
    "dialog.clear": "Protokoll leeren",
    "dialog.copy": "Als Text kopieren",
    "toast.copied": "Protokoll kopiert",
    "toast.copyFailed": "Protokoll konnte nicht kopiert werden",
    "button.label": "Sprachaktivitätsprotokoll",
    "panel.log": "Protokoll",
    "panel.open": "Protokoll öffnen",
    "panel.entries": { one: "{count} Eintrag", other: "{count} Einträge" },
    "panel.sessions": { one: "{count} Sitzung", other: "{count} Sitzungen" },
    "panel.summary": "{entries} in {sessions}. Nur im Arbeitsspeicher.",
    "panel.nothing": "Noch nichts. Nur im Arbeitsspeicher.",
    "command.description": "Wer in letzter Zeit deinem Sprachkanal beigetreten ist und ihn verlassen hat",
    "command.empty": "Noch nichts protokolliert. Tritt einem Sprachkanal bei, dann erscheint hier, wer kommt und geht."
  },
  es: {
    "duration.s": "{n} s",
    "duration.m": "{n} min",
    "duration.h": "{n} h",
    "duration.hm": "{h} h {m} min",
    "channel.id": "canal {id}",
    "channel.other": "otro canal",
    "stay.some": " (estuvo {d})",
    "stay.atLeast": " (estuvo al menos {d})",
    "entry.selfJoin": "Te uniste a {channel}",
    "entry.selfMove": "Te moviste a {other}{stayed}",
    "entry.selfLeave": "Saliste{stayed}",
    "entry.present": "{n} ya estaba aquí",
    "entry.join": "{n} se unió",
    "entry.leave": "{n} salió{stayed}",
    "entry.moveIn": "{n} llegó desde {other}",
    "entry.moveOut": "{n} se movió a {other}{stayed}",
    "entry.streamStart": "{n} empezó a transmitir",
    "entry.streamStop": "{n} dejó de transmitir",
    "entry.videoStart": "{n} activó su cámara",
    "entry.videoStop": "{n} desactivó su cámara",
    "entry.mute": "{n} se silenció",
    "entry.unmute": "{n} activó su micrófono",
    "entry.deafen": "{n} se ensordeció",
    "entry.undeafen": "{n} activó su audio",
    "note.here": "sigue aquí · {d}",
    "note.stillThere": "seguía allí cuando saliste · {d}",
    "note.atLeast": "estuvo al menos {d}",
    "note.stayed": "estuvo {d}",
    "text.now": "ahora",
    "text.nothing": "(nada registrado)",
    "filter.all": "Todo",
    "filter.people": "Entradas y salidas",
    "filter.streams": "Transmisiones",
    "filter.voice": "Silencio y ensordecer",
    "settings.moves": "Movimientos",
    "settings.moves.description": "Registra los movimientos desde y hacia otros canales como movimientos, no como simples entradas y salidas.",
    "settings.streams": "Transmisiones y cámara",
    "settings.streams.description": "Registra cuando alguien empieza o deja de transmitir o de usar la cámara.",
    "settings.muteDeafen": "Silencios y ensordecimientos",
    "settings.muteDeafen.description": "Registra cuando alguien se silencia, activa su micrófono, se ensordece o activa su audio.",
    "settings.toasts": "Avisos",
    "settings.toasts.description": "Muestra un aviso cuando alguien entra, sale o se mueve.",
    "settings.onlyUnfocused": "Solo cuando Discord no está en primer plano",
    "settings.onlyUnfocused.description": "Muestra esos avisos solo mientras la ventana de Discord no está en primer plano.",
    "settings.showButton": "Botón del panel de voz",
    "settings.showButton.description": "Un botón de registro en el panel de Voz conectada. /vclog funciona de las dos formas.",
    "user.unknown": "Usuario desconocido",
    "channel.call": "una llamada",
    "dialog.title": "Registro de actividad de voz",
    "dialog.subtitle": "Quién entró y salió de tus canales de voz. Se conserva hasta que Discord se reinicie.",
    "dialog.close": "Cerrar",
    "dialog.empty": "Aún no hay nada. Únete a un canal de voz y aquí verás quién entra y sale.",
    "dialog.sessions": "Sesiones",
    "dialog.live": "Estás aquí ahora",
    "dialog.sessionNow": "Ahora · {d}",
    "dialog.filterName": "Filtrar por nombre",
    "dialog.show": "Mostrar",
    "dialog.activityIn": "Actividad en {channel}",
    "dialog.noMatch": "Nada coincide con el filtro.",
    "dialog.noneInSession": "Aún no hay nada registrado en esta sesión.",
    "dialog.clear": "Borrar registro",
    "dialog.copy": "Copiar como texto",
    "toast.copied": "Registro copiado",
    "toast.copyFailed": "No se pudo copiar el registro",
    "button.label": "Registro de actividad de voz",
    "panel.log": "Registro",
    "panel.open": "Abrir registro",
    "panel.entries": { one: "{count} entrada", other: "{count} entradas" },
    "panel.sessions": { one: "{count} sesión", other: "{count} sesiones" },
    "panel.summary": "{entries} en {sessions}. Solo se guarda en memoria.",
    "panel.nothing": "Aún no hay nada. Solo se guarda en memoria.",
    "command.description": "Quién entró y salió hace poco de tu canal de voz",
    "command.empty": "Aún no hay nada registrado. Únete a un canal de voz y aquí verás quién entra y sale."
  },
  fr: {
    "duration.s": "{n} s",
    "duration.m": "{n} min",
    "duration.h": "{n} h",
    "duration.hm": "{h} h {m} min",
    "channel.id": "salon {id}",
    "channel.other": "un autre salon",
    "stay.some": " (resté {d})",
    "stay.atLeast": " (resté au moins {d})",
    "entry.selfJoin": "Tu as rejoint {channel}",
    "entry.selfMove": "Tu es passé dans {other}{stayed}",
    "entry.selfLeave": "Tu es parti{stayed}",
    "entry.present": "{n} était déjà là",
    "entry.join": "{n} a rejoint le salon",
    "entry.leave": "{n} a quitté le salon{stayed}",
    "entry.moveIn": "{n} est arrivé depuis {other}",
    "entry.moveOut": "{n} est passé dans {other}{stayed}",
    "entry.streamStart": "{n} a lancé un stream",
    "entry.streamStop": "{n} a arrêté son stream",
    "entry.videoStart": "{n} a activé sa caméra",
    "entry.videoStop": "{n} a désactivé sa caméra",
    "entry.mute": "{n} s'est mis en sourdine",
    "entry.unmute": "{n} a réactivé son micro",
    "entry.deafen": "{n} a coupé le son",
    "entry.undeafen": "{n} a réactivé le son",
    "note.here": "toujours là · {d}",
    "note.stillThere": "encore là quand tu es parti · {d}",
    "note.atLeast": "resté au moins {d}",
    "note.stayed": "resté {d}",
    "text.now": "maintenant",
    "text.nothing": "(rien d'enregistré)",
    "filter.all": "Tout",
    "filter.people": "Arrivées et départs",
    "filter.streams": "Streams",
    "filter.voice": "Sourdine et son coupé",
    "settings.moves": "Déplacements",
    "settings.moves.description": "Enregistre les passages depuis et vers d'autres salons comme des déplacements, et non comme de simples arrivées et départs.",
    "settings.streams": "Streams et caméra",
    "settings.streams.description": "Enregistre quand quelqu'un lance ou arrête un stream ou sa caméra.",
    "settings.muteDeafen": "Sourdines et sons coupés",
    "settings.muteDeafen.description": "Enregistre quand quelqu'un coupe ou réactive son micro ou son son.",
    "settings.toasts": "Notifications",
    "settings.toasts.description": "Affiche une notification quand quelqu'un arrive, part ou change de salon.",
    "settings.onlyUnfocused": "Seulement quand Discord n'est pas au premier plan",
    "settings.onlyUnfocused.description": "N'affiche ces notifications que lorsque la fenêtre Discord n'est pas au premier plan.",
    "settings.showButton": "Bouton du panneau vocal",
    "settings.showButton.description": "Un bouton d'historique dans le panneau « Vocal connecté ». /vclog fonctionne dans les deux cas.",
    "user.unknown": "Utilisateur inconnu",
    "channel.call": "un appel",
    "dialog.title": "Journal d'activité vocale",
    "dialog.subtitle": "Qui est venu et parti dans tes salons vocaux. Conservé jusqu'au redémarrage de Discord.",
    "dialog.close": "Fermer",
    "dialog.empty": "Rien pour l'instant. Rejoins un salon vocal et tu verras ici qui arrive et qui part.",
    "dialog.sessions": "Sessions",
    "dialog.live": "Tu es ici en ce moment",
    "dialog.sessionNow": "Maintenant · {d}",
    "dialog.filterName": "Filtrer par nom",
    "dialog.show": "Afficher",
    "dialog.activityIn": "Activité dans {channel}",
    "dialog.noMatch": "Aucun résultat pour ce filtre.",
    "dialog.noneInSession": "Rien d'enregistré dans cette session pour l'instant.",
    "dialog.clear": "Effacer le journal",
    "dialog.copy": "Copier en texte",
    "toast.copied": "Journal copié",
    "toast.copyFailed": "Impossible de copier le journal",
    "button.label": "Journal d'activité vocale",
    "panel.log": "Journal",
    "panel.open": "Ouvrir le journal",
    "panel.entries": { one: "{count} entrée", other: "{count} entrées" },
    "panel.sessions": { one: "{count} session", other: "{count} sessions" },
    "panel.summary": "{entries} sur {sessions}. Gardé en mémoire uniquement.",
    "panel.nothing": "Rien pour l'instant. Gardé en mémoire uniquement.",
    "command.description": "Qui a rejoint et quitté ton salon vocal récemment",
    "command.empty": "Rien d'enregistré pour l'instant. Rejoins un salon vocal et tu verras ici qui arrive et qui part."
  },
  ja: {
    "duration.s": "{n}秒",
    "duration.m": "{n}分",
    "duration.h": "{n}時間",
    "duration.hm": "{h}時間{m}分",
    "channel.id": "チャンネル {id}",
    "channel.other": "別のチャンネル",
    "stay.some": "（{d}滞在）",
    "stay.atLeast": "（{d}以上滞在）",
    "entry.selfJoin": "{channel}に参加しました",
    "entry.selfMove": "{other}に移動しました{stayed}",
    "entry.selfLeave": "退出しました{stayed}",
    "entry.present": "{n}は最初からいました",
    "entry.join": "{n}が参加しました",
    "entry.leave": "{n}が退出しました{stayed}",
    "entry.moveIn": "{n}が{other}から移動してきました",
    "entry.moveOut": "{n}が{other}に移動しました{stayed}",
    "entry.streamStart": "{n}が配信を開始しました",
    "entry.streamStop": "{n}が配信を終了しました",
    "entry.videoStart": "{n}がカメラをオンにしました",
    "entry.videoStop": "{n}がカメラをオフにしました",
    "entry.mute": "{n}がミュートしました",
    "entry.unmute": "{n}がミュートを解除しました",
    "entry.deafen": "{n}がスピーカーミュートしました",
    "entry.undeafen": "{n}がスピーカーミュートを解除しました",
    "note.here": "まだいます · {d}",
    "note.stillThere": "あなたが退出したときもいました · {d}",
    "note.atLeast": "{d}以上滞在",
    "note.stayed": "{d}滞在",
    "text.now": "現在",
    "text.nothing": "（記録なし）",
    "filter.all": "すべて",
    "filter.people": "参加と退出",
    "filter.streams": "配信",
    "filter.voice": "ミュートとスピーカーミュート",
    "settings.moves": "移動",
    "settings.moves.description": "他のチャンネルとの行き来を、単なる参加と退出ではなく移動として記録します。",
    "settings.streams": "配信とカメラ",
    "settings.streams.description": "誰かが配信やカメラを開始または終了したときに記録します。",
    "settings.muteDeafen": "ミュートとスピーカーミュート",
    "settings.muteDeafen.description": "誰かがミュートやスピーカーミュートを切り替えたときに記録します。",
    "settings.toasts": "トースト通知",
    "settings.toasts.description": "誰かが参加、退出、移動したときにトースト通知を表示します。",
    "settings.onlyUnfocused": "Discord がアクティブでないときのみ",
    "settings.onlyUnfocused.description": "Discord のウィンドウがアクティブでない間だけ、これらのトースト通知を表示します。",
    "settings.showButton": "ボイスパネルのボタン",
    "settings.showButton.description": "「ボイス接続」パネルにログボタンを表示します。/vclog はどちらの設定でも使えます。",
    "user.unknown": "不明なユーザー",
    "channel.call": "通話",
    "dialog.title": "ボイスアクティビティログ",
    "dialog.subtitle": "ボイスチャンネルに出入りした人の記録です。Discord を再起動するまで保持されます。",
    "dialog.close": "閉じる",
    "dialog.empty": "まだ何もありません。ボイスチャンネルに参加すると、出入りした人がここに表示されます。",
    "dialog.sessions": "セッション",
    "dialog.live": "現在参加中",
    "dialog.sessionNow": "現在 · {d}",
    "dialog.filterName": "名前で絞り込む",
    "dialog.show": "表示",
    "dialog.activityIn": "{channel}のアクティビティ",
    "dialog.noMatch": "条件に一致するものはありません。",
    "dialog.noneInSession": "このセッションにはまだ記録がありません。",
    "dialog.clear": "ログを消去",
    "dialog.copy": "テキストとしてコピー",
    "toast.copied": "ログをコピーしました",
    "toast.copyFailed": "ログをコピーできませんでした",
    "button.label": "ボイスアクティビティログ",
    "panel.log": "ログ",
    "panel.open": "ログを開く",
    "panel.entries": { other: "{count} 件の記録" },
    "panel.sessions": { other: "{count} 件のセッション" },
    "panel.summary": "{sessions}で{entries}。メモリ内にのみ保持されます。",
    "panel.nothing": "まだ何もありません。メモリ内にのみ保持されます。",
    "command.description": "最近ボイスチャンネルに参加・退出した人",
    "command.empty": "まだ記録がありません。ボイスチャンネルに参加すると、出入りした人がここに表示されます。"
  },
  pl: {
    "duration.s": "{n} s",
    "duration.m": "{n} min",
    "duration.h": "{n} godz.",
    "duration.hm": "{h} godz. {m} min",
    "channel.id": "kanał {id}",
    "channel.other": "inny kanał",
    "stay.some": " (był(a) {d})",
    "stay.atLeast": " (był(a) co najmniej {d})",
    "entry.selfJoin": "Dołączasz do: {channel}",
    "entry.selfMove": "Przenosisz się do: {other}{stayed}",
    "entry.selfLeave": "Wychodzisz{stayed}",
    "entry.present": "{n} był(a) tu już wcześniej",
    "entry.join": "{n} dołączył(a)",
    "entry.leave": "{n} wyszedł/wyszła{stayed}",
    "entry.moveIn": "{n} przeszedł/przeszła tu z: {other}",
    "entry.moveOut": "{n} przeszedł/przeszła do: {other}{stayed}",
    "entry.streamStart": "{n} rozpoczął(-ęła) transmisję",
    "entry.streamStop": "{n} zakończył(a) transmisję",
    "entry.videoStart": "{n} włączył(a) kamerę",
    "entry.videoStop": "{n} wyłączył(a) kamerę",
    "entry.mute": "{n} wyciszył(a) mikrofon",
    "entry.unmute": "{n} włączył(a) mikrofon",
    "entry.deafen": "{n} wyłączył(a) dźwięk",
    "entry.undeafen": "{n} włączył(a) dźwięk",
    "note.here": "nadal jest · {d}",
    "note.stillThere": "nadal był(a), gdy wyszedłeś(-łaś) · {d}",
    "note.atLeast": "był(a) co najmniej {d}",
    "note.stayed": "był(a) {d}",
    "text.now": "teraz",
    "text.nothing": "(nic nie zapisano)",
    "filter.all": "Wszystko",
    "filter.people": "Dołączenia i wyjścia",
    "filter.streams": "Transmisje",
    "filter.voice": "Wyciszenia",
    "settings.moves": "Przenosiny",
    "settings.moves.description": "Zapisuj przejścia z innych kanałów i do nich jako przenosiny, a nie zwykłe dołączenia i wyjścia.",
    "settings.streams": "Transmisje i kamera",
    "settings.streams.description": "Zapisuj, gdy ktoś rozpoczyna lub kończy transmisję albo włącza lub wyłącza kamerę.",
    "settings.muteDeafen": "Wyciszenia",
    "settings.muteDeafen.description": "Zapisuj, gdy ktoś wycisza lub włącza mikrofon albo dźwięk.",
    "settings.toasts": "Powiadomienia",
    "settings.toasts.description": "Pokazuj powiadomienie, gdy ktoś dołącza, wychodzi lub się przenosi.",
    "settings.onlyUnfocused": "Tylko gdy Discord nie jest na wierzchu",
    "settings.onlyUnfocused.description": "Pokazuj te powiadomienia tylko wtedy, gdy okno Discorda nie jest aktywne.",
    "settings.showButton": "Przycisk w panelu głosowym",
    "settings.showButton.description": "Przycisk dziennika w panelu „Połączono z kanałem głosowym”. Polecenie /vclog działa tak czy inaczej.",
    "user.unknown": "Nieznany użytkownik",
    "channel.call": "rozmowa",
    "dialog.title": "Dziennik aktywności głosowej",
    "dialog.subtitle": "Kto przychodził i wychodził z Twoich kanałów głosowych. Przechowywane do zrestartowania Discorda.",
    "dialog.close": "Zamknij",
    "dialog.empty": "Na razie nic. Dołącz do kanału głosowego, a tutaj pojawi się, kto przychodzi i wychodzi.",
    "dialog.sessions": "Sesje",
    "dialog.live": "Jesteś tu teraz",
    "dialog.sessionNow": "Teraz · {d}",
    "dialog.filterName": "Filtruj według nazwy",
    "dialog.show": "Pokaż",
    "dialog.activityIn": "Aktywność na kanale {channel}",
    "dialog.noMatch": "Nic nie pasuje do filtra.",
    "dialog.noneInSession": "W tej sesji nic jeszcze nie zapisano.",
    "dialog.clear": "Wyczyść dziennik",
    "dialog.copy": "Kopiuj jako tekst",
    "toast.copied": "Skopiowano dziennik",
    "toast.copyFailed": "Nie udało się skopiować dziennika",
    "button.label": "Dziennik aktywności głosowej",
    "panel.log": "Dziennik",
    "panel.open": "Otwórz dziennik",
    "panel.entries": { one: "{count} wpis", few: "{count} wpisy", many: "{count} wpisów", other: "{count} wpisu" },
    "panel.sessions": { one: "{count} sesja", few: "{count} sesje", many: "{count} sesji", other: "{count} sesji" },
    "panel.summary": "{entries} w {sessions}. Tylko w pamięci.",
    "panel.nothing": "Na razie nic. Tylko w pamięci.",
    "command.description": "Kto ostatnio dołączał do Twojego kanału głosowego i z niego wychodził",
    "command.empty": "Nic jeszcze nie zapisano. Dołącz do kanału głosowego, a tutaj pojawi się, kto przychodzi i wychodzi."
  },
  "pt-BR": {
    "duration.s": "{n}s",
    "duration.m": "{n}min",
    "duration.h": "{n}h",
    "duration.hm": "{h}h {m}min",
    "channel.id": "canal {id}",
    "channel.other": "outro canal",
    "stay.some": " (ficou {d})",
    "stay.atLeast": " (ficou pelo menos {d})",
    "entry.selfJoin": "Você entrou em {channel}",
    "entry.selfMove": "Você foi para {other}{stayed}",
    "entry.selfLeave": "Você saiu{stayed}",
    "entry.present": "{n} já estava aqui",
    "entry.join": "{n} entrou",
    "entry.leave": "{n} saiu{stayed}",
    "entry.moveIn": "{n} veio de {other}",
    "entry.moveOut": "{n} foi para {other}{stayed}",
    "entry.streamStart": "{n} começou a transmitir",
    "entry.streamStop": "{n} parou de transmitir",
    "entry.videoStart": "{n} ligou a câmera",
    "entry.videoStop": "{n} desligou a câmera",
    "entry.mute": "{n} se silenciou",
    "entry.unmute": "{n} ativou o microfone",
    "entry.deafen": "{n} desativou o áudio",
    "entry.undeafen": "{n} reativou o áudio",
    "note.here": "ainda está aqui · {d}",
    "note.stillThere": "ainda estava lá quando você saiu · {d}",
    "note.atLeast": "ficou pelo menos {d}",
    "note.stayed": "ficou {d}",
    "text.now": "agora",
    "text.nothing": "(nada registrado)",
    "filter.all": "Tudo",
    "filter.people": "Entradas e saídas",
    "filter.streams": "Transmissões",
    "filter.voice": "Silenciar e ensurdecer",
    "settings.moves": "Movimentações",
    "settings.moves.description": "Registra idas e vindas de outros canais como movimentações, e não como simples entradas e saídas.",
    "settings.streams": "Transmissões e câmera",
    "settings.streams.description": "Registra quando alguém começa ou para de transmitir ou de usar a câmera.",
    "settings.muteDeafen": "Silenciamentos e ensurdecimentos",
    "settings.muteDeafen.description": "Registra quando alguém se silencia, ativa o microfone, desativa ou reativa o áudio.",
    "settings.toasts": "Avisos",
    "settings.toasts.description": "Mostra um aviso quando alguém entra, sai ou muda de canal.",
    "settings.onlyUnfocused": "Só quando o Discord não está em foco",
    "settings.onlyUnfocused.description": "Mostra esses avisos apenas enquanto a janela do Discord não está em foco.",
    "settings.showButton": "Botão no painel de voz",
    "settings.showButton.description": "Um botão de registro no painel de Voz conectada. O /vclog funciona nos dois casos.",
    "user.unknown": "Usuário desconhecido",
    "channel.call": "uma chamada",
    "dialog.title": "Registro de atividade de voz",
    "dialog.subtitle": "Quem entrou e saiu dos seus canais de voz. Guardado até o Discord reiniciar.",
    "dialog.close": "Fechar",
    "dialog.empty": "Nada por enquanto. Entre em um canal de voz e quem entra e sai aparece aqui.",
    "dialog.sessions": "Sessões",
    "dialog.live": "Você está aqui agora",
    "dialog.sessionNow": "Agora · {d}",
    "dialog.filterName": "Filtrar por nome",
    "dialog.show": "Mostrar",
    "dialog.activityIn": "Atividade em {channel}",
    "dialog.noMatch": "Nada corresponde ao filtro.",
    "dialog.noneInSession": "Nada registrado nesta sessão ainda.",
    "dialog.clear": "Limpar registro",
    "dialog.copy": "Copiar como texto",
    "toast.copied": "Registro copiado",
    "toast.copyFailed": "Não foi possível copiar o registro",
    "button.label": "Registro de atividade de voz",
    "panel.log": "Registro",
    "panel.open": "Abrir registro",
    "panel.entries": { one: "{count} entrada", other: "{count} entradas" },
    "panel.sessions": { one: "{count} sessão", other: "{count} sessões" },
    "panel.summary": "{entries} em {sessions}. Guardado apenas na memória.",
    "panel.nothing": "Nada por enquanto. Guardado apenas na memória.",
    "command.description": "Quem entrou e saiu do seu canal de voz recentemente",
    "command.empty": "Nada registrado ainda. Entre em um canal de voz e quem entra e sai aparece aqui."
  },
  ru: {
    "duration.s": "{n} с",
    "duration.m": "{n} мин",
    "duration.h": "{n} ч",
    "duration.hm": "{h} ч {m} мин",
    "channel.id": "канал {id}",
    "channel.other": "другой канал",
    "stay.some": " (пробыл(а) {d})",
    "stay.atLeast": " (пробыл(а) не менее {d})",
    "entry.selfJoin": "Вы подключились к каналу {channel}",
    "entry.selfMove": "Вы перешли в канал {other}{stayed}",
    "entry.selfLeave": "Вы вышли{stayed}",
    "entry.present": "{n} уже был(а) здесь",
    "entry.join": "{n} подключился(-ась)",
    "entry.leave": "{n} вышел(-ла){stayed}",
    "entry.moveIn": "{n} перешёл(-ла) сюда из канала {other}",
    "entry.moveOut": "{n} перешёл(-ла) в канал {other}{stayed}",
    "entry.streamStart": "{n} начал(а) трансляцию",
    "entry.streamStop": "{n} завершил(а) трансляцию",
    "entry.videoStart": "{n} включил(а) камеру",
    "entry.videoStop": "{n} выключил(а) камеру",
    "entry.mute": "{n} выключил(а) микрофон",
    "entry.unmute": "{n} включил(а) микрофон",
    "entry.deafen": "{n} выключил(а) звук",
    "entry.undeafen": "{n} включил(а) звук",
    "note.here": "всё ещё здесь · {d}",
    "note.stillThere": "был(а) здесь, когда вы вышли · {d}",
    "note.atLeast": "пробыл(а) не менее {d}",
    "note.stayed": "пробыл(а) {d}",
    "text.now": "сейчас",
    "text.nothing": "(ничего не записано)",
    "filter.all": "Все",
    "filter.people": "Входы и выходы",
    "filter.streams": "Трансляции",
    "filter.voice": "Микрофон и звук",
    "settings.moves": "Переходы",
    "settings.moves.description": "Записывать переходы из других каналов и в них как переходы, а не как обычные входы и выходы.",
    "settings.streams": "Трансляции и камера",
    "settings.streams.description": "Записывать, когда кто-то начинает или завершает трансляцию либо включает или выключает камеру.",
    "settings.muteDeafen": "Отключения микрофона и звука",
    "settings.muteDeafen.description": "Записывать, когда кто-то выключает или включает микрофон или звук.",
    "settings.toasts": "Уведомления",
    "settings.toasts.description": "Показывать уведомление, когда кто-то заходит, выходит или переходит в другой канал.",
    "settings.onlyUnfocused": "Только когда Discord не в фокусе",
    "settings.onlyUnfocused.description": "Показывать эти уведомления, только пока окно Discord не в фокусе.",
    "settings.showButton": "Кнопка на голосовой панели",
    "settings.showButton.description": "Кнопка журнала на панели «Голосовая связь подключена». Команда /vclog работает в любом случае.",
    "user.unknown": "Неизвестный пользователь",
    "channel.call": "звонок",
    "dialog.title": "Журнал голосовой активности",
    "dialog.subtitle": "Кто заходил в ваши голосовые каналы и выходил из них. Хранится до перезапуска Discord.",
    "dialog.close": "Закрыть",
    "dialog.empty": "Пока ничего нет. Подключитесь к голосовому каналу, и здесь появится, кто заходит и выходит.",
    "dialog.sessions": "Сеансы",
    "dialog.live": "Вы здесь сейчас",
    "dialog.sessionNow": "Сейчас · {d}",
    "dialog.filterName": "Фильтр по имени",
    "dialog.show": "Показать",
    "dialog.activityIn": "Активность в канале {channel}",
    "dialog.noMatch": "Ничего не подходит под фильтр.",
    "dialog.noneInSession": "В этом сеансе пока ничего не записано.",
    "dialog.clear": "Очистить журнал",
    "dialog.copy": "Копировать как текст",
    "toast.copied": "Журнал скопирован",
    "toast.copyFailed": "Не удалось скопировать журнал",
    "button.label": "Журнал голосовой активности",
    "panel.log": "Журнал",
    "panel.open": "Открыть журнал",
    "panel.entries": { one: "{count} запись", few: "{count} записи", many: "{count} записей", other: "{count} записи" },
    "panel.sessions": { one: "{count} сеанс", few: "{count} сеанса", many: "{count} сеансов", other: "{count} сеанса" },
    "panel.summary": "{entries} за {sessions}. Хранится только в памяти.",
    "panel.nothing": "Пока ничего нет. Хранится только в памяти.",
    "command.description": "Кто недавно заходил в ваш голосовой канал и выходил из него",
    "command.empty": "Пока ничего не записано. Подключитесь к голосовому каналу, и здесь появится, кто заходит и выходит."
  },
  tr: {
    "duration.s": "{n} sn",
    "duration.m": "{n} dk",
    "duration.h": "{n} sa",
    "duration.hm": "{h} sa {m} dk",
    "channel.id": "{id} kanalı",
    "channel.other": "başka bir kanal",
    "stay.some": " ({d} kaldı)",
    "stay.atLeast": " (en az {d} kaldı)",
    "entry.selfJoin": "{channel} kanalına katıldın",
    "entry.selfMove": "{other} kanalına geçtin{stayed}",
    "entry.selfLeave": "Ayrıldın{stayed}",
    "entry.present": "{n} zaten buradaydı",
    "entry.join": "{n} katıldı",
    "entry.leave": "{n} ayrıldı{stayed}",
    "entry.moveIn": "{n}, {other} kanalından buraya geçti",
    "entry.moveOut": "{n}, {other} kanalına geçti{stayed}",
    "entry.streamStart": "{n} yayın başlattı",
    "entry.streamStop": "{n} yayını bitirdi",
    "entry.videoStart": "{n} kamerasını açtı",
    "entry.videoStop": "{n} kamerasını kapattı",
    "entry.mute": "{n} mikrofonunu kapattı",
    "entry.unmute": "{n} mikrofonunu açtı",
    "entry.deafen": "{n} sesi kapattı",
    "entry.undeafen": "{n} sesi açtı",
    "note.here": "hâlâ burada · {d}",
    "note.stillThere": "sen ayrıldığında hâlâ oradaydı · {d}",
    "note.atLeast": "en az {d} kaldı",
    "note.stayed": "{d} kaldı",
    "text.now": "şimdi",
    "text.nothing": "(kayıt yok)",
    "filter.all": "Tümü",
    "filter.people": "Katılma ve ayrılma",
    "filter.streams": "Yayınlar",
    "filter.voice": "Mikrofon ve ses",
    "settings.moves": "Kanal geçişleri",
    "settings.moves.description": "Başka kanallardan gelenleri ve oralara gidenleri düz katılma ve ayrılma olarak değil, geçiş olarak kaydet.",
    "settings.streams": "Yayınlar ve kamera",
    "settings.streams.description": "Biri yayın veya kamerasını başlattığında ya da bitirdiğinde kaydet.",
    "settings.muteDeafen": "Susturmalar ve sağırlaştırmalar",
    "settings.muteDeafen.description": "Biri mikrofonunu veya sesini kapattığında ya da açtığında kaydet.",
    "settings.toasts": "Bildirimler",
    "settings.toasts.description": "Biri katıldığında, ayrıldığında veya kanal değiştirdiğinde bildirim göster.",
    "settings.onlyUnfocused": "Yalnızca Discord odakta değilken",
    "settings.onlyUnfocused.description": "Bu bildirimleri yalnızca Discord penceresi odakta değilken göster.",
    "settings.showButton": "Ses paneli düğmesi",
    "settings.showButton.description": "Ses Bağlı panelinde bir kayıt düğmesi. /vclog her iki durumda da çalışır.",
    "user.unknown": "Bilinmeyen kullanıcı",
    "channel.call": "bir arama",
    "dialog.title": "Ses Etkinliği Kaydı",
    "dialog.subtitle": "Ses kanallarına kimlerin girip çıktığı. Discord yeniden başlatılana kadar saklanır.",
    "dialog.close": "Kapat",
    "dialog.empty": "Henüz bir şey yok. Bir ses kanalına katıl, kimlerin girip çıktığı burada görünsün.",
    "dialog.sessions": "Oturumlar",
    "dialog.live": "Şu an buradasın",
    "dialog.sessionNow": "Şimdi · {d}",
    "dialog.filterName": "Ada göre filtrele",
    "dialog.show": "Göster",
    "dialog.activityIn": "{channel} kanalındaki etkinlik",
    "dialog.noMatch": "Filtreyle eşleşen bir şey yok.",
    "dialog.noneInSession": "Bu oturumda henüz bir şey kaydedilmedi.",
    "dialog.clear": "Kaydı temizle",
    "dialog.copy": "Metin olarak kopyala",
    "toast.copied": "Kayıt kopyalandı",
    "toast.copyFailed": "Kayıt kopyalanamadı",
    "button.label": "Ses etkinliği kaydı",
    "panel.log": "Kayıt",
    "panel.open": "Kaydı aç",
    "panel.entries": { one: "{count} giriş", other: "{count} giriş" },
    "panel.sessions": { one: "{count} oturum", other: "{count} oturum" },
    "panel.summary": "{sessions} içinde {entries}. Yalnızca bellekte tutulur.",
    "panel.nothing": "Henüz bir şey yok. Yalnızca bellekte tutulur.",
    "command.description": "Ses kanalına son zamanlarda kimlerin katılıp ayrıldığı",
    "command.empty": "Henüz kayıt yok. Bir ses kanalına katıl, kimlerin girip çıktığı burada görünsün."
  }
});

// plugins/voice-activity-log/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  moves: {
    type: "boolean",
    get label() {
      return t("settings.moves");
    },
    get description() {
      return t("settings.moves.description");
    },
    default: true
  },
  streams: {
    type: "boolean",
    get label() {
      return t("settings.streams");
    },
    get description() {
      return t("settings.streams.description");
    },
    default: false
  },
  muteDeafen: {
    type: "boolean",
    get label() {
      return t("settings.muteDeafen");
    },
    get description() {
      return t("settings.muteDeafen.description");
    },
    default: false
  },
  toasts: {
    type: "boolean",
    get label() {
      return t("settings.toasts");
    },
    get description() {
      return t("settings.toasts.description");
    },
    default: false
  },
  onlyUnfocused: {
    type: "boolean",
    get label() {
      return t("settings.onlyUnfocused");
    },
    get description() {
      return t("settings.onlyUnfocused.description");
    },
    default: false
  },
  showButton: {
    type: "boolean",
    get label() {
      return t("settings.showButton");
    },
    get description() {
      return t("settings.showButton.description");
    },
    default: true
  }
};
var context;
var log;
var selectedChannels;
function store(name) {
  try {
    return import_api2.findStore(name);
  } catch {
    return;
  }
}
var selfId = () => store("UserStore")?.getCurrentUser?.()?.id;
var getChannel = (id) => id ? store("ChannelStore")?.getChannel?.(id) : undefined;
var guildOf = (channel) => channel?.guild_id ?? channel?.getGuildId?.() ?? null;
function nameOf(userId, guildId) {
  const nick = guildId ? store("GuildMemberStore")?.getNick?.(guildId, userId) ?? store("GuildMemberStore")?.getMember?.(guildId, userId)?.nick : undefined;
  if (nick)
    return nick;
  const friendNick = store("RelationshipStore")?.getNickname?.(userId);
  if (friendNick)
    return friendNick;
  const user = store("UserStore")?.getUser?.(userId);
  return user?.globalName ?? user?.global_name ?? user?.username ?? t("user.unknown");
}
function channelName(channelId) {
  const channel = getChannel(channelId);
  if (channel?.name)
    return channel.name;
  return channel ? t("channel.call") : t("channel.other");
}
function avatarOf(userId, guildId) {
  try {
    return store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId ?? undefined, 32);
  } catch {
    return;
  }
}
function sync(moves) {
  if (!log || !context)
    return;
  const voiceChannelId = (selectedChannels ??= store("SelectedChannelStore"))?.getVoiceChannelId?.() ?? null;
  if (!voiceChannelId && !log.current)
    return;
  const voice = store("VoiceStateStore");
  const channel = getChannel(voiceChannelId);
  const guildId = guildOf(channel);
  const me = selfId();
  const s = context.settings.all;
  const added = log.sync({
    channelId: voiceChannelId,
    guildId,
    snapshot: voiceChannelId ? snapshotOf(voice?.getVoiceStatesForChannel?.(voiceChannelId), me) : {},
    selfId: me,
    options: { moves: s.moves, streams: s.streams, muteDeafen: s.muteDeafen },
    moveOf: (userId) => moves?.get(userId) ?? { to: voice?.getVoiceState?.(guildId, userId)?.channelId ?? null },
    nameOf: (userId) => nameOf(userId, guildId),
    channelName
  });
  const focused = typeof document !== "undefined" && document.hasFocus();
  for (const entry of added) {
    if (shouldToast(entry, s, focused))
      context.toast(describe(entry, undefined, tr), { type: "info" });
  }
}
var tr = (key, vars) => t(key, vars);
function movesOf(action) {
  const moves = new Map;
  for (const vs of action.voiceStates ?? []) {
    if (vs?.userId)
      moves.set(vs.userId, { from: vs.oldChannelId ?? null, to: vs.channelId ?? null });
  }
  return moves;
}
async function copy(text) {
  const native = window.DiscordNative?.clipboard;
  if (native?.copy)
    native.copy(text);
  else
    await navigator.clipboard.writeText(text);
}
var closeOpen;
function openLog() {
  if (!log)
    return;
  closeOpen?.();
  const current = log;
  const close = import_api2.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(LogDialog, {
    log: current,
    onClose: () => close2()
  }), {
    onClosed: () => void (closeOpen === close && (closeOpen = undefined))
  });
  closeOpen = close;
}
function useNow(ms) {
  const [now, setNow] = import_api2.React.useState(Date.now);
  import_api2.React.useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(handle);
  }, [ms]);
  return now;
}
function sessionDetail(session, now) {
  if (session.endedAt === undefined)
    return t("dialog.sessionNow", { d: formatDuration(now - session.startedAt, tr) });
  return `${formatClock(session.startedAt)} · ${formatDuration(session.endedAt - session.startedAt, tr)}`;
}
function Avatar({ entry, guildId }) {
  const [broken, setBroken] = import_api2.React.useState(false);
  const src = entry.userId ? avatarOf(entry.userId, guildId) : undefined;
  if (!src || broken)
    return /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-vcl-avatar",
      "aria-hidden": "true",
      children: entry.name.slice(0, 1).toUpperCase()
    });
  return /* @__PURE__ */ jsx_runtime.jsx("img", {
    className: "evi-vcl-avatar",
    src,
    alt: "",
    width: 32,
    height: 32,
    onError: () => setBroken(true)
  });
}
function Row({ entry, session, now }) {
  const text = describe(entry, session.channelName, tr);
  const self = entry.kind === "selfJoin" || entry.kind === "selfLeave";
  const note = stayNote(entry, now, tr);
  const named = !self && text.startsWith(entry.name);
  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
    className: "evi-vcl-row",
    "data-kind": entry.kind,
    "data-self": self || undefined,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx(Avatar, {
        entry,
        guildId: session.guildId
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("span", {
        className: "evi-vcl-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            children: named ? /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("strong", {
                  children: entry.name
                }),
                text.slice(entry.name.length)
              ]
            }) : text
          }),
          note && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-vcl-note",
            children: note
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsx("time", {
        className: "evi-vcl-time",
        dateTime: new Date(entry.at).toISOString(),
        title: new Date(entry.at).toLocaleString(),
        children: formatClock(entry.at)
      })
    ]
  });
}
var CloseIcon = () => /* @__PURE__ */ jsx_runtime.jsx("svg", {
  viewBox: "0 0 24 24",
  width: "24",
  height: "24",
  "aria-hidden": "true",
  children: /* @__PURE__ */ jsx_runtime.jsx("path", {
    fill: "currentColor",
    d: "M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z"
  })
});
var SearchIcon = () => /* @__PURE__ */ jsx_runtime.jsx("svg", {
  className: "evi-vcl-search-icon",
  viewBox: "0 0 24 24",
  width: "16",
  height: "16",
  "aria-hidden": "true",
  children: /* @__PURE__ */ jsx_runtime.jsx("path", {
    fill: "currentColor",
    fillRule: "evenodd",
    d: "M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
  })
});
function LogDialog({ log: log2, onClose }) {
  import_api2.React.useSyncExternalStore(log2.subscribe, log2.getVersion);
  const now = useNow(15000);
  const sessions = log2.sessions;
  const [selected, setSelected] = import_api2.React.useState(sessions[0]?.id);
  const [kind, setKind] = import_api2.React.useState("all");
  const [query, setQuery] = import_api2.React.useState("");
  const ref = import_api2.React.useRef(null);
  const session = sessions.find((s) => s.id === selected) ?? sessions[0];
  const entries = session ? filterEntries(session.entries, kind, query) : [];
  import_api2.React.useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
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
  const copyText = async () => {
    if (!session)
      return;
    try {
      await copy(formatSessions([{ ...session, entries }], Date.now(), tr));
      context?.toast(t("toast.copied"), { type: "success" });
    } catch (err) {
      context?.logger.error("Couldn't copy", err);
      context?.toast(t("toast.copyFailed"), { type: "failure" });
    }
  };
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-vcl-scrim evi-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-vcl-modal evi-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-vcl-title",
      "aria-describedby": "evi-vcl-subtitle",
      tabIndex: -1,
      ref,
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-vcl-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h2", {
                  id: "evi-vcl-title",
                  children: t("dialog.title")
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  id: "evi-vcl-subtitle",
                  children: t("dialog.subtitle")
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-close",
              "aria-label": t("dialog.close"),
              onClick: onClose,
              children: /* @__PURE__ */ jsx_runtime.jsx(CloseIcon, {})
            })
          ]
        }),
        !session ? /* @__PURE__ */ jsx_runtime.jsx("p", {
          className: "evi-vcl-empty",
          children: t("dialog.empty")
        }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-vcl-main",
          children: [
            sessions.length > 1 && /* @__PURE__ */ jsx_runtime.jsxs("nav", {
              className: "evi-vcl-nav",
              "aria-labelledby": "evi-vcl-sessions",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h3", {
                  id: "evi-vcl-sessions",
                  children: t("dialog.sessions")
                }),
                sessions.map((s) => /* @__PURE__ */ jsx_runtime.jsxs("button", {
                  type: "button",
                  className: "evi-vcl-tab",
                  "aria-current": s.id === session.id,
                  title: s.channelName,
                  onClick: () => setSelected(s.id),
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsxs("span", {
                      className: "evi-vcl-tab-name",
                      children: [
                        s.endedAt === undefined && /* @__PURE__ */ jsx_runtime.jsx("span", {
                          className: "evi-vcl-live",
                          role: "img",
                          "aria-label": t("dialog.live")
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("span", {
                          children: s.channelName
                        })
                      ]
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("small", {
                      children: sessionDetail(s, now)
                    })
                  ]
                }, s.id))
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-vcl-body",
              children: [
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-vcl-tools",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsxs("label", {
                      className: "evi-vcl-search",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsx(SearchIcon, {}),
                        /* @__PURE__ */ jsx_runtime.jsx("input", {
                          type: "search",
                          inputMode: "search",
                          placeholder: t("dialog.filterName"),
                          "aria-label": t("dialog.filterName"),
                          autoComplete: "off",
                          spellCheck: false,
                          value: query,
                          onChange: (e) => setQuery(e.currentTarget.value)
                        })
                      ]
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("div", {
                      className: "evi-vcl-chips",
                      role: "group",
                      "aria-label": t("dialog.show"),
                      children: FILTERS.map((f) => /* @__PURE__ */ jsx_runtime.jsx("button", {
                        type: "button",
                        className: "evi-vcl-chip",
                        "aria-pressed": kind === f.value,
                        onClick: () => setKind(f.value),
                        children: t(f.key)
                      }, f.value))
                    })
                  ]
                }),
                entries.length ? /* @__PURE__ */ jsx_runtime.jsx("ul", {
                  className: "evi-vcl-list",
                  "aria-label": t("dialog.activityIn", { channel: session.channelName }),
                  children: [...entries].reverse().map((e) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
                    entry: e,
                    session,
                    now
                  }, e.id))
                }) : /* @__PURE__ */ jsx_runtime.jsx("p", {
                  className: "evi-vcl-empty",
                  children: session.entries.length ? t("dialog.noMatch") : t("dialog.noneInSession")
                })
              ]
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("footer", {
          className: "evi-vcl-foot",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-button",
              "data-variant": "danger",
              disabled: !log2.size,
              onClick: () => log2.clear(),
              children: t("dialog.clear")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-button",
              "data-variant": "primary",
              disabled: !entries.length,
              onClick: copyText,
              children: t("dialog.copy")
            })
          ]
        })
      ]
    })
  });
}
function LogIcon() {
  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("path", {
        d: "M9 6h11M9 12h11M9 18h11"
      }),
      /* @__PURE__ */ jsx_runtime.jsx("circle", {
        cx: 4.5,
        cy: 6,
        r: 1,
        fill: "currentColor",
        stroke: "none"
      }),
      /* @__PURE__ */ jsx_runtime.jsx("circle", {
        cx: 4.5,
        cy: 12,
        r: 1,
        fill: "currentColor",
        stroke: "none"
      }),
      /* @__PURE__ */ jsx_runtime.jsx("circle", {
        cx: 4.5,
        cy: 18,
        r: 1,
        fill: "currentColor",
        stroke: "none"
      })
    ]
  });
}
function LogButton() {
  const { showButton } = context.settings.use();
  if (!showButton)
    return null;
  const label = t("button.label");
  const button = /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "evi-vcl-panel-button",
    onClick: openLog,
    "aria-label": label,
    children: /* @__PURE__ */ jsx_runtime.jsx(LogIcon, {})
  });
  const Tooltip = import_api2.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: label,
    position: "top",
    children: button
  }) : import_api2.React.cloneElement(button, { title: label });
}
function SettingsPanel({ log: log2 }) {
  import_api2.React.useSyncExternalStore(log2.subscribe, log2.getVersion);
  const Button = import_api2.Components.Button;
  const label = t("panel.open");
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-field-row",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: t("panel.log")
          }),
          /* @__PURE__ */ jsx_runtime.jsx("p", {
            className: "dl-hint",
            role: "status",
            children: log2.size ? t("panel.summary", { entries: t("panel.entries", { count: log2.size }), sessions: t("panel.sessions", { count: log2.sessions.length }) }) : t("panel.nothing")
          })
        ]
      }),
      Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
        size: Button.Sizes?.SMALL,
        onClick: openLog,
        children: label
      }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        className: "dl-button",
        onClick: openLog,
        children: label
      })
    ]
  });
}
var css = `
.evi-vcl-panel-button { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 32px; height: 32px; padding: 0; border: 0;
  border-radius: var(--radius-sm, 8px); cursor: pointer; background: transparent; color: var(--interactive-normal, var(--interactive-icon-default));
  transition: background-color .1s ease-out, color .1s ease-out; }
.evi-vcl-panel-button:hover { background: var(--background-modifier-hover, var(--interactive-background-hover)); color: var(--interactive-hover, var(--interactive-icon-hover)); }
.evi-vcl-panel-button:active { background: var(--background-modifier-active, var(--interactive-background-active)); color: var(--interactive-active, var(--interactive-icon-active)); }
.evi-vcl-panel-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }

.evi-vcl-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 32px 16px; background: var(--opacity-black-72, rgb(0 0 0 / 0.72)); }
.evi-vcl-modal {
  --evi-vcl-muted: var(--text-muted, #949ba4);
  --evi-vcl-strong: var(--text-strong, var(--header-primary, #f2f3f5));
  --evi-vcl-line: var(--border-subtle, rgb(255 255 255 / 0.08));
  --evi-vcl-hover: var(--background-mod-subtle, var(--background-modifier-hover, rgb(255 255 255 / 0.06)));
  --evi-vcl-selected: var(--background-mod-normal, var(--background-modifier-selected, rgb(255 255 255 / 0.1)));
  --evi-vcl-focus: var(--focus-primary, #00a8fc);
  inline-size: min(720px, 100%); block-size: min(620px, 100%); display: flex; flex-direction: column; overflow: hidden;
  border-radius: var(--radius-md, 12px); border: 1px solid var(--border-subtle, transparent);
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  box-shadow: var(--shadow-high, 0 12px 24px rgb(0 0 0 / 0.24)); outline: none; font-family: var(--font-primary); font-size: 14px; line-height: 18px; }

.evi-vcl-head { display: flex; align-items: flex-start; gap: 16px; padding: 24px 24px 16px; }
.evi-vcl-head > div { flex: 1; min-width: 0; }
.evi-vcl-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--evi-vcl-strong); text-wrap: balance; }
.evi-vcl-head p { margin: 4px 0 0; color: var(--evi-vcl-muted); text-wrap: pretty; }
.evi-vcl-close { flex: none; display: grid; place-items: center; width: 32px; height: 32px; margin: -4px -8px 0 0; padding: 0; border: 0; border-radius: var(--radius-sm, 8px);
  background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }

.evi-vcl-main { flex: 1; min-height: 0; display: flex; border-block-start: 1px solid var(--evi-vcl-line); }
.evi-vcl-nav { flex: none; inline-size: 196px; overflow-y: auto; padding: 16px 8px; display: flex; flex-direction: column; gap: 2px;
  border-inline-end: 1px solid var(--evi-vcl-line); background: var(--background-base-lower, transparent); }
.evi-vcl-nav h3 { margin: 0 0 6px; padding-inline: 10px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--evi-vcl-muted); }
.evi-vcl-tab { display: flex; flex-direction: column; gap: 2px; inline-size: 100%; padding: 8px 10px; border: 0; border-radius: var(--radius-sm, 8px);
  background: none; color: var(--interactive-normal, #b5bac1); font: inherit; text-align: start; cursor: pointer; }
.evi-vcl-tab-name { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; }
.evi-vcl-tab-name > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-vcl-tab small { font-size: 12px; line-height: 16px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-vcl-tab[aria-current="true"] { background: var(--evi-vcl-selected); color: var(--interactive-active, #fff); }
.evi-vcl-live { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--status-positive, var(--green-360, #23a55a)); }

.evi-vcl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-vcl-tools { display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 12px; }
.evi-vcl-search { position: relative; display: flex; align-items: center; }
.evi-vcl-search-icon { position: absolute; inset-inline-start: 10px; color: var(--icon-subtle, var(--evi-vcl-muted)); pointer-events: none; }
.evi-vcl-search input { inline-size: 100%; block-size: 36px; padding: 0 12px 0 34px; border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--input-border-default, var(--input-border, var(--evi-vcl-line)));
  background: var(--input-background-default, var(--input-background, var(--background-base-lowest, #1e1f22)));
  color: var(--text-default, inherit); font: inherit; font-size: 14px; outline: none; }
.evi-vcl-search input::placeholder { color: var(--input-placeholder-text-default, var(--text-muted, #949ba4)); }
.evi-vcl-search input:focus-visible { border-color: var(--evi-vcl-focus); }
.evi-vcl-search input::-webkit-search-cancel-button { cursor: pointer; }
.evi-vcl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.evi-vcl-chip { block-size: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--evi-vcl-hover); color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.evi-vcl-chip[aria-pressed="true"] { background: var(--control-primary-background-default, var(--brand-500, #5865f2)); color: var(--control-primary-text-default, #fff); }

.evi-vcl-list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0 8px 8px; }
/* Discord's thin scrollbar instead of Windows' grey one with arrows: a slim rounded thumb, no track */
.evi-vcl-list, .evi-vcl-nav { scrollbar-width: auto; scrollbar-color: auto; }
.evi-vcl-list::-webkit-scrollbar, .evi-vcl-nav::-webkit-scrollbar { width: 8px; }
.evi-vcl-list::-webkit-scrollbar-track, .evi-vcl-nav::-webkit-scrollbar-track, .evi-vcl-list::-webkit-scrollbar-corner { background: transparent; }
.evi-vcl-list::-webkit-scrollbar-button, .evi-vcl-nav::-webkit-scrollbar-button { display: none; }
.evi-vcl-list::-webkit-scrollbar-thumb, .evi-vcl-nav::-webkit-scrollbar-thumb { min-height: 40px; border: 2px solid transparent; border-radius: 4px; background-clip: padding-box;
  background-color: var(--scrollbar-auto-thumb, rgb(151 151 159 / 0.4)); }
.evi-vcl-list::-webkit-scrollbar-thumb:hover, .evi-vcl-nav::-webkit-scrollbar-thumb:hover { background-color: rgb(151 151 159 / 0.6); }
.evi-vcl-row { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: var(--radius-sm, 8px); }
.evi-vcl-row[data-self] { color: var(--evi-vcl-muted); }
.evi-vcl-row[data-kind="leave"] .evi-vcl-avatar, .evi-vcl-row[data-kind="moveOut"] .evi-vcl-avatar { opacity: .5; }
.evi-vcl-avatar { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; object-fit: cover; font-size: 14px; font-weight: 600;
  background: var(--background-mod-normal, rgb(255 255 255 / 0.08)); color: var(--evi-vcl-muted); outline: 1px solid rgb(255 255 255 / 0.08); outline-offset: -1px; }
.evi-vcl-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.evi-vcl-text strong { font-weight: 600; color: var(--evi-vcl-strong); }
.evi-vcl-note { font-size: 12px; line-height: 16px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; }
.evi-vcl-time { flex: none; font-size: 12px; color: var(--evi-vcl-muted); font-variant-numeric: tabular-nums; }
.evi-vcl-empty { margin: 8px 24px 24px; color: var(--evi-vcl-muted); text-wrap: pretty; }

.evi-vcl-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-block-start: 1px solid var(--evi-vcl-line); }
.evi-vcl-button { block-size: 36px; padding: 0 16px; border: 0; border-radius: var(--radius-sm, 8px); font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.evi-vcl-button[data-variant="primary"] { background: var(--control-primary-background-default, var(--brand-500, #5865f2)); color: var(--control-primary-text-default, #fff); }
.evi-vcl-button[data-variant="danger"] { background: none; color: var(--control-critical-secondary-text-default, var(--text-feedback-critical, #f23f43)); }
.evi-vcl-button:disabled { opacity: .5; cursor: not-allowed; }

@media (hover: hover) {
  .evi-vcl-close:hover { background: var(--evi-vcl-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-tab:hover:not([aria-current="true"]) { background: var(--evi-vcl-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-chip:hover:not([aria-pressed="true"]) { background: var(--evi-vcl-selected); color: var(--interactive-hover, #dbdee1); }
  .evi-vcl-row:hover { background: var(--evi-vcl-hover); }
  .evi-vcl-button[data-variant="primary"]:hover:not(:disabled) { background: var(--control-primary-background-hover, var(--brand-560, #4752c4)); }
  .evi-vcl-button[data-variant="danger"]:hover:not(:disabled) { background: var(--evi-vcl-hover); }
}
.evi-vcl-close:focus-visible, .evi-vcl-tab:focus-visible, .evi-vcl-chip:focus-visible, .evi-vcl-button:focus-visible { outline: 2px solid var(--evi-vcl-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  :root:not(.reduce-motion) .evi-vcl-button { transition: scale 200ms ease-out; }
  :root:not(.reduce-motion) .evi-vcl-button:active:not(:disabled) { scale: .97; }
}
@media (prefers-reduced-motion: reduce) { .evi-vcl-panel-button { transition: none; } }
`;
var voice_activity_log_default = import_api2.definePlugin({
  settings,
  patches: [PATCHES.rtcPanel],
  css,
  renderButton(_channel) {
    if (!context)
      return null;
    return /* @__PURE__ */ jsx_runtime.jsx(LogButton, {}, "evi-voice-activity-log");
  },
  openLog,
  start(ctx) {
    const current = new VoiceLog;
    context = ctx;
    log = current;
    ctx.onDispose(() => {
      closeOpen?.({ instant: true });
      if (log === current)
        log = undefined;
      context = undefined;
    });
    const settled = () => {
      const session = current.current;
      const channelId = (selectedChannels ??= store("SelectedChannelStore"))?.getVoiceChannelId?.() ?? null;
      return session && session.channelId === channelId ? session : undefined;
    };
    const onVoiceStates = (action) => {
      const session = settled();
      if (session && !touchesSession(action.voiceStates, session.channelId, session.snapshot, selfId()))
        return;
      sync(movesOf(action));
    };
    ctx.flux.subscribe("VOICE_STATE_UPDATES", onVoiceStates);
    ctx.flux.subscribe("PASSIVE_UPDATE_V2", (action) => {
      const session = settled();
      if (session && session.guildId && action.guildId && action.guildId !== session.guildId)
        return;
      sync();
    });
    const selected = selectedChannels = store("SelectedChannelStore");
    const onSelected = () => {
      const id = selected?.getVoiceChannelId?.() ?? null;
      if (id !== (current.current?.channelId ?? null))
        sync();
    };
    selected?.addChangeListener?.(onSelected);
    ctx.onDispose(() => selected?.removeChangeListener?.(onSelected));
    sync();
    ctx.command({
      name: "vclog",
      get description() {
        return t("command.description");
      },
      execute() {
        const entries = current.last(15);
        if (!entries.length)
          return { ephemeral: t("command.empty") };
        const names = new Map(current.sessions.map((s) => [s.id, s.channelName]));
        return { ephemeral: entries.map((e) => formatLine(e, names.get(e.sessionId), tr)).join(`
`) };
      }
    });
  },
  settingsPanel: () => log && /* @__PURE__ */ jsx_runtime.jsx(SettingsPanel, {
    log
  }),
  getLog: () => log
});
