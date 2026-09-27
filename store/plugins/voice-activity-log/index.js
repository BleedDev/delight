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
var import_api = require("@evi/api");

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
var pad = (n) => String(n).padStart(2, "0");
function formatClock(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60)
    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)
    return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}
var channelLabel = (name, id) => name || (id ? `channel ${id}` : "another channel");
function describe(entry, sessionChannelName) {
  const n = entry.name;
  const stayed = entry.stayed !== undefined ? ` (stayed ${entry.sinceBefore ? "at least " : ""}${formatDuration(entry.stayed)})` : "";
  const other = channelLabel(entry.otherChannelName, entry.otherChannelId);
  switch (entry.kind) {
    case "selfJoin":
      return `You joined ${channelLabel(sessionChannelName, entry.channelId)}`;
    case "selfLeave":
      return entry.otherChannelId ? `You moved to ${other}${stayed}` : `You left${stayed}`;
    case "present":
      return `${n} was already here`;
    case "join":
      return `${n} joined`;
    case "leave":
      return `${n} left${stayed}`;
    case "moveIn":
      return `${n} moved in from ${other}`;
    case "moveOut":
      return `${n} moved to ${other}${stayed}`;
    case "streamStart":
      return `${n} started streaming`;
    case "streamStop":
      return `${n} stopped streaming`;
    case "videoStart":
      return `${n} turned on their camera`;
    case "videoStop":
      return `${n} turned off their camera`;
    case "mute":
      return `${n} muted`;
    case "unmute":
      return `${n} unmuted`;
    case "deafen":
      return `${n} deafened`;
    case "undeafen":
      return `${n} undeafened`;
  }
}
function stayNote(entry, now) {
  if (!ARRIVALS.has(entry.kind))
    return;
  if (entry.leftAt === undefined)
    return `still here · ${formatDuration(now - entry.at)}`;
  const d = formatDuration(entry.leftAt - entry.at);
  if (entry.stillThere)
    return `still there when you left · ${d}`;
  return entry.kind === "present" ? `stayed at least ${d}` : `stayed ${d}`;
}
var formatLine = (entry, sessionChannelName) => `${formatClock(entry.at)}  ${describe(entry, sessionChannelName)}`;
function formatSessions(sessions, now = Date.now()) {
  return sessions.map((s) => {
    const end = s.endedAt !== undefined ? formatClock(s.endedAt) : "now";
    const date = new Date(s.startedAt).toLocaleDateString();
    const head = `${channelLabel(s.channelName, s.channelId)} · ${date} ${formatClock(s.startedAt)}–${end} (${formatDuration((s.endedAt ?? now) - s.startedAt)})`;
    const lines = s.entries.map((e) => formatLine(e, s.channelName));
    return [head, ...lines.length ? lines : ["(nothing logged)"]].join(`
`);
  }).join(`

`);
}
var FILTERS = [
  { value: "all", label: "All" },
  { value: "people", label: "Joins & leaves" },
  { value: "streams", label: "Streams" },
  { value: "voice", label: "Mute & deafen" }
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

// plugins/voice-activity-log/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  moves: { type: "boolean", label: "Moves", description: "Log moves from and to other channels as moves, not as plain joins and leaves.", default: true },
  streams: { type: "boolean", label: "Streams and camera", description: "Log when someone starts or stops streaming or their camera.", default: false },
  muteDeafen: { type: "boolean", label: "Mutes and deafens", description: "Log when someone mutes, unmutes, deafens or undeafens.", default: false },
  toasts: { type: "boolean", label: "Toasts", description: "Pop up a toast when someone joins, leaves or moves.", default: false },
  onlyUnfocused: { type: "boolean", label: "Only when Discord isn't focused", description: "Show those toasts only while the Discord window isn't focused.", default: false },
  showButton: { type: "boolean", label: "Voice panel button", description: "A log button in the Voice Connected panel. /vclog works either way.", default: true }
};
var context;
var log;
var selectedChannels;
function store(name) {
  try {
    return import_api.findStore(name);
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
  return user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown user";
}
function channelName(channelId) {
  const channel = getChannel(channelId);
  if (channel?.name)
    return channel.name;
  return channel ? "a call" : "another channel";
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
      context.toast(describe(entry), { type: "info" });
  }
}
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
  const close = import_api.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(LogDialog, {
    log: current,
    onClose: () => close2()
  }), {
    onClosed: () => void (closeOpen === close && (closeOpen = undefined))
  });
  closeOpen = close;
}
function useNow(ms) {
  const [now, setNow] = import_api.React.useState(Date.now);
  import_api.React.useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(handle);
  }, [ms]);
  return now;
}
function sessionDetail(session, now) {
  if (session.endedAt === undefined)
    return `Now · ${formatDuration(now - session.startedAt)}`;
  return `${formatClock(session.startedAt)} · ${formatDuration(session.endedAt - session.startedAt)}`;
}
function Avatar({ entry, guildId }) {
  const [broken, setBroken] = import_api.React.useState(false);
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
  const text = describe(entry, session.channelName);
  const self = entry.kind === "selfJoin" || entry.kind === "selfLeave";
  const note = stayNote(entry, now);
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
  import_api.React.useSyncExternalStore(log2.subscribe, log2.getVersion);
  const now = useNow(15000);
  const sessions = log2.sessions;
  const [selected, setSelected] = import_api.React.useState(sessions[0]?.id);
  const [kind, setKind] = import_api.React.useState("all");
  const [query, setQuery] = import_api.React.useState("");
  const ref = import_api.React.useRef(null);
  const session = sessions.find((s) => s.id === selected) ?? sessions[0];
  const entries = session ? filterEntries(session.entries, kind, query) : [];
  import_api.React.useEffect(() => {
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
      await copy(formatSessions([{ ...session, entries }], Date.now()));
      context?.toast("Copied the log", { type: "success" });
    } catch (err) {
      context?.logger.error("Couldn't copy", err);
      context?.toast("Couldn't copy the log", { type: "failure" });
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
                  children: "Voice Activity Log"
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  id: "evi-vcl-subtitle",
                  children: "Who came and went in your voice channels. Kept until Discord restarts."
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-close",
              "aria-label": "Close",
              onClick: onClose,
              children: /* @__PURE__ */ jsx_runtime.jsx(CloseIcon, {})
            })
          ]
        }),
        !session ? /* @__PURE__ */ jsx_runtime.jsx("p", {
          className: "evi-vcl-empty",
          children: "Nothing yet. Join a voice channel and who comes and goes shows up here."
        }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-vcl-main",
          children: [
            sessions.length > 1 && /* @__PURE__ */ jsx_runtime.jsxs("nav", {
              className: "evi-vcl-nav",
              "aria-labelledby": "evi-vcl-sessions",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h3", {
                  id: "evi-vcl-sessions",
                  children: "Sessions"
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
                          "aria-label": "You're here now"
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
                          placeholder: "Filter by name",
                          "aria-label": "Filter by name",
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
                      "aria-label": "Show",
                      children: FILTERS.map((f) => /* @__PURE__ */ jsx_runtime.jsx("button", {
                        type: "button",
                        className: "evi-vcl-chip",
                        "aria-pressed": kind === f.value,
                        onClick: () => setKind(f.value),
                        children: f.label
                      }, f.value))
                    })
                  ]
                }),
                entries.length ? /* @__PURE__ */ jsx_runtime.jsx("ul", {
                  className: "evi-vcl-list",
                  "aria-label": `Activity in ${session.channelName}`,
                  children: [...entries].reverse().map((e) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
                    entry: e,
                    session,
                    now
                  }, e.id))
                }) : /* @__PURE__ */ jsx_runtime.jsx("p", {
                  className: "evi-vcl-empty",
                  children: session.entries.length ? "Nothing matches the filter." : "Nothing logged in this session yet."
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
              children: "Clear log"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-button",
              "data-variant": "primary",
              disabled: !entries.length,
              onClick: copyText,
              children: "Copy as text"
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
  const label = "Voice activity log";
  const button = /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "evi-vcl-panel-button",
    onClick: openLog,
    "aria-label": label,
    children: /* @__PURE__ */ jsx_runtime.jsx(LogIcon, {})
  });
  const Tooltip = import_api.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: label,
    position: "top",
    children: button
  }) : import_api.React.cloneElement(button, { title: label });
}
function SettingsPanel({ log: log2 }) {
  import_api.React.useSyncExternalStore(log2.subscribe, log2.getVersion);
  const Button = import_api.Components.Button;
  const label = "Open log";
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "dl-field-row",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: "Log"
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("p", {
            className: "dl-hint",
            role: "status",
            children: [
              log2.size ? `${log2.size} entries over ${log2.sessions.length} session${log2.sessions.length === 1 ? "" : "s"}.` : "Nothing yet.",
              " Kept in memory only."
            ]
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
var voice_activity_log_default = import_api.definePlugin({
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
      description: "Who joined and left your voice channel recently",
      execute() {
        const entries = current.last(15);
        if (!entries.length)
          return { ephemeral: "Nothing logged yet. Join a voice channel and who comes and goes shows up here." };
        const names = new Map(current.sessions.map((s) => [s.id, s.channelName]));
        return { ephemeral: entries.map((e) => formatLine(e, names.get(e.sessionId))).join(`
`) };
      }
    });
  },
  settingsPanel: () => log && /* @__PURE__ */ jsx_runtime.jsx(SettingsPanel, {
    log
  }),
  getLog: () => log
});
