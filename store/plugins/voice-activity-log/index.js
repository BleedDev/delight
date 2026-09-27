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
      return `${n} was here`;
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
  const voiceChannelId = store("SelectedChannelStore")?.getVoiceChannelId?.() ?? null;
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
  root.render(/* @__PURE__ */ jsx_runtime.jsx(LogDialog, {
    log,
    onClose: close
  }));
}
function useNow(ms) {
  const [now, setNow] = import_api.React.useState(Date.now);
  import_api.React.useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(handle);
  }, [ms]);
  return now;
}
function sessionLabel(session, now) {
  const live = session.endedAt === undefined;
  const time = live ? "Now" : formatClock(session.startedAt);
  return { title: `${time} · ${session.channelName}`, detail: live ? `since ${formatClock(session.startedAt)}` : formatDuration((session.endedAt ?? now) - session.startedAt) };
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
    width: 24,
    height: 24,
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
          named ? /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("strong", {
                children: entry.name
              }),
              text.slice(entry.name.length)
            ]
          }) : text,
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
    className: "evi-vcl-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-vcl-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-vcl-title",
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
                /* @__PURE__ */ jsx_runtime.jsxs("p", {
                  children: [
                    "Kept in memory until Discord restarts. Last ",
                    sessions.length === 1 ? "session" : `${sessions.length} sessions`,
                    "."
                  ]
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-icon",
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
        !session ? /* @__PURE__ */ jsx_runtime.jsx("p", {
          className: "evi-vcl-empty",
          children: "Nothing yet. Join a voice channel and who comes and goes shows up here."
        }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-vcl-main",
          children: [
            sessions.length > 1 && /* @__PURE__ */ jsx_runtime.jsx("nav", {
              className: "evi-vcl-nav",
              "aria-label": "Sessions",
              children: sessions.map((s) => {
                const { title, detail } = sessionLabel(s, now);
                return /* @__PURE__ */ jsx_runtime.jsxs("button", {
                  type: "button",
                  className: "evi-vcl-tab",
                  "aria-current": s.id === session.id,
                  onClick: () => setSelected(s.id),
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("span", {
                      children: title
                    }),
                    /* @__PURE__ */ jsx_runtime.jsx("small", {
                      children: detail
                    })
                  ]
                }, s.id);
              })
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-vcl-body",
              children: [
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-vcl-tools",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("input", {
                      className: "evi-vcl-search",
                      type: "search",
                      placeholder: "Filter by name",
                      "aria-label": "Filter by name",
                      value: query,
                      onChange: (e) => setQuery(e.currentTarget.value)
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
                  children: [...entries].reverse().map((e) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
                    entry: e,
                    session,
                    now
                  }, e.id))
                }) : /* @__PURE__ */ jsx_runtime.jsx("p", {
                  className: "evi-vcl-empty",
                  children: session.entries.length ? "Nothing matches the filter." : "Nothing logged in this session."
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
              children: "Clear"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-vcl-button",
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
.evi-vcl-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-vcl-modal { width: min(680px, calc(100vw - 32px)); height: min(600px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); outline: none; font-family: var(--font-primary); }
.evi-vcl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-vcl-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-vcl-head p { margin: 4px 0 0; font-size: 14px; color: var(--text-muted, #949ba4); }
.evi-vcl-icon { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-vcl-icon:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-vcl-main { flex: 1; min-height: 0; display: flex; }
.evi-vcl-nav { flex: none; width: 180px; overflow-y: auto; padding: 8px; border-right: 1px solid var(--border-subtle, rgba(255,255,255,.06)); display: flex; flex-direction: column; gap: 2px; }
.evi-vcl-tab { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: none; color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 14px; text-align: start; cursor: pointer; }
.evi-vcl-tab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-vcl-tab > small { font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-tab:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-vcl-tab[aria-current="true"] { background: var(--background-modifier-selected, rgba(255,255,255,.1)); color: var(--interactive-active, #fff); }
.evi-vcl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-vcl-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-vcl-search { flex: 1 1 160px; min-width: 0; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08)));
  background: var(--input-background, var(--background-base-lowest, #1e1f22)); color: inherit; font: inherit; font-size: 14px; }
.evi-vcl-search:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-vcl-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.evi-vcl-chip { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--border-subtle, rgba(255,255,255,.08)); background: none; color: var(--interactive-normal, #b5bac1);
  font: inherit; font-size: 13px; cursor: pointer; }
.evi-vcl-chip:hover { color: var(--interactive-hover, #dbdee1); background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-vcl-chip[aria-pressed="true"] { background: var(--background-modifier-selected, rgba(255,255,255,.1)); color: var(--interactive-active, #fff); border-color: transparent; }
.evi-vcl-chip:focus-visible, .evi-vcl-tab:focus-visible, .evi-vcl-button:focus-visible, .evi-vcl-icon:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
.evi-vcl-list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 4px 20px 12px; }
.evi-vcl-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-vcl-row[data-self] { color: var(--text-muted, #949ba4); }
.evi-vcl-row[data-kind="leave"] .evi-vcl-avatar, .evi-vcl-row[data-kind="moveOut"] .evi-vcl-avatar { opacity: .5; }
.evi-vcl-avatar { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; object-fit: cover; font-size: 12px; font-weight: 600;
  background: var(--background-modifier-accent, rgba(255,255,255,.08)); color: var(--text-muted, #949ba4); }
.evi-vcl-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.evi-vcl-text strong { font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-vcl-note { display: block; font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-time { flex: none; font-size: 12px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-vcl-empty { margin: 16px 20px; color: var(--text-muted, #949ba4); font-size: 14px; }
.evi-vcl-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-vcl-button { height: 32px; padding: 0 14px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  background: var(--control-brand-foreground, var(--brand-500, #5865f2)); color: var(--white, #fff); }
.evi-vcl-button[data-variant="danger"] { background: none; color: var(--text-danger, var(--status-danger, #f23f43)); }
.evi-vcl-button[data-variant="danger"]:hover:not(:disabled) { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-vcl-button:disabled { opacity: .5; cursor: not-allowed; }
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
      closeOpen?.();
      if (log === current)
        log = undefined;
      context = undefined;
    });
    const onVoiceStates = (action) => sync(movesOf(action));
    ctx.flux.subscribe("VOICE_STATE_UPDATES", onVoiceStates);
    ctx.flux.subscribe("PASSIVE_UPDATE_V2", () => sync());
    const selected = store("SelectedChannelStore");
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
