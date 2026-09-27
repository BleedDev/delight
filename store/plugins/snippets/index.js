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

// plugins/snippets/index.tsx
var exports_snippets = {};
__export(exports_snippets, {
  default: () => snippets_default
});
module.exports = __toCommonJS(exports_snippets);
var import_api = require("@evi/api");

// plugins/snippets/snippets.ts
var EMPTY = { snippets: [] };
var MAX_NAME_LENGTH = 32;
var MAX_TEXT_LENGTH = 4000;
var MAX_SNIPPETS = 500;
var MAX_CHOICES = 25;
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function cleanName(name) {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
}
function cleanText(text) {
  return typeof text === "string" ? text.replace(/\r\n?/g, `
`).replace(/^\s*\n/, "").trimEnd() : "";
}
var key = (name) => cleanName(name).toLocaleLowerCase();
function nameError(state, name, exceptId) {
  if (typeof name !== "string" || !cleanName(name))
    return "Give it a name.";
  if (name.replace(/\s+/g, " ").trim().length > MAX_NAME_LENGTH)
    return `Names can be up to ${MAX_NAME_LENGTH} characters.`;
  const k = key(name);
  const taken = state.snippets.find((s) => s.id !== exceptId && key(s.name) === k);
  return taken ? `There's already a snippet called "${taken.name}".` : null;
}
function textError(text) {
  const clean = cleanText(text);
  if (!clean.trim())
    return "Write the text to insert.";
  if (clean.length > MAX_TEXT_LENGTH)
    return `Snippets can be up to ${MAX_TEXT_LENGTH} characters (this one is ${clean.length}).`;
  return null;
}
function inputError(state, input, exceptId) {
  return nameError(state, input.name, exceptId) ?? textError(input.text);
}
var count = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
function parseState(raw) {
  const list = raw?.snippets;
  if (!Array.isArray(list))
    return EMPTY;
  const ids = new Set;
  const names = new Set;
  const snippets = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || ids.has(item.id))
      continue;
    const name = cleanName(item.name);
    const text = cleanText(item.text);
    if (!name || !text.trim() || names.has(key(name)))
      continue;
    ids.add(item.id);
    names.add(key(name));
    snippets.push({
      id: item.id,
      name,
      text: text.slice(0, MAX_TEXT_LENGTH),
      createdAt: count(item.createdAt),
      uses: count(item.uses),
      lastUsed: count(item.lastUsed)
    });
    if (snippets.length >= MAX_SNIPPETS)
      break;
  }
  return { snippets };
}
function getSnippet(state, id) {
  return id ? state.snippets.find((s) => s.id === id) : undefined;
}
function findByName(state, name) {
  if (typeof name !== "string")
    return;
  const k = key(name);
  return k ? state.snippets.find((s) => key(s.name) === k) : undefined;
}
function addSnippet(state, input, now = Date.now(), id = makeId()) {
  if (state.snippets.length >= MAX_SNIPPETS)
    return { state, error: `You can keep up to ${MAX_SNIPPETS} snippets.` };
  const error = inputError(state, input);
  if (error)
    return { state, error };
  const snippet = { id, name: cleanName(input.name), text: cleanText(input.text), createdAt: now, uses: 0, lastUsed: 0 };
  return { state: { snippets: [...state.snippets, snippet] }, snippet };
}
function updateSnippet(state, id, input) {
  const current = getSnippet(state, id);
  if (!current)
    return { state, error: "That snippet no longer exists." };
  const next = { name: input.name ?? current.name, text: input.text ?? current.text };
  const error = inputError(state, next, id);
  if (error)
    return { state, error };
  const name = cleanName(next.name);
  const text = cleanText(next.text);
  if (name === current.name && text === current.text)
    return { state, snippet: current };
  const snippet = { ...current, name, text };
  return { state: { snippets: state.snippets.map((s) => s.id === id ? snippet : s) }, snippet };
}
function deleteSnippet(state, id) {
  return getSnippet(state, id) ? { snippets: state.snippets.filter((s) => s.id !== id) } : state;
}
function recordUse(state, id, now = Date.now()) {
  if (!getSnippet(state, id))
    return state;
  return { snippets: state.snippets.map((s) => s.id === id ? { ...s, uses: s.uses + 1, lastUsed: now } : s) };
}
function uniqueName(state, base) {
  const clean = cleanName(base) || "Snippet";
  if (!nameError(state, clean))
    return clean;
  for (let n = 2;; n++) {
    const suffix = ` ${n}`;
    const name = clean.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd() + suffix;
    if (!nameError(state, name))
      return name;
  }
}
function suggestName(state, text) {
  const words = cleanText(text).replace(/<a?:(\w+):\d+>/g, "$1").replace(/<[@#][!&]?\d+>/g, "").replace(/https?:\/\/\S+/g, "").replace(/[*_~`|>]/g, "").split(/\s+/).filter(Boolean);
  let name = "";
  for (const word of words) {
    const next = name ? `${name} ${word}` : word;
    if (next.length > 24)
      break;
    name = next;
    if (name.split(" ").length >= 4)
      break;
  }
  return uniqueName(state, name || words[0]?.slice(0, 24) || "Snippet");
}
var PLACEHOLDERS = [
  { key: "user", description: "The person you're replying to, or the other person in a DM" },
  { key: "me", description: "Your own display name" },
  { key: "channel", description: "The channel's name" },
  { key: "server", description: "The server's name" },
  { key: "date", description: "Today's date" },
  { key: "time", description: "The current time" },
  { key: "clipboard", description: "Whatever text you have copied" }
];
var KNOWN = new Set(PLACEHOLDERS.map((p) => p.key));
var PLACEHOLDER = /(\\?)\{([a-z]+)\}/gi;
function usedPlaceholders(text) {
  const used = new Set;
  for (const [, escape, name] of text.matchAll(PLACEHOLDER)) {
    const k = name.toLowerCase();
    if (!escape && KNOWN.has(k))
      used.add(k);
  }
  return used;
}
function expandPlaceholders(text, values) {
  return text.replace(PLACEHOLDER, (whole, escape, name) => {
    if (escape)
      return whole.slice(1);
    const k = name.toLowerCase();
    if (!KNOWN.has(k))
      return whole;
    return values[k] ?? "";
  });
}
function dateValues(now, locale) {
  return {
    date: now.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }),
    time: now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  };
}
var fold = (s) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
function isSubsequence(query, text) {
  let i = 0;
  for (const ch of text)
    if (ch === query[i] && ++i === query.length)
      return true;
  return query.length === 0;
}
function scoreSnippet(snippet, query) {
  const q = fold(query.replace(/\s+/g, " ").trim());
  if (!q)
    return 1;
  const name = fold(snippet.name);
  const text = fold(snippet.text);
  if (name === q)
    return 1000;
  if (name.startsWith(q))
    return 800;
  if (name.split(/[\s\-_.]+/).some((w) => w.startsWith(q)))
    return 600;
  if (name.includes(q))
    return 400;
  const tokens = q.split(" ");
  if (tokens.length > 1 && tokens.every((t) => name.includes(t)))
    return 300;
  if (!q.includes(" ") && q.length > 1 && isSubsequence(q, name))
    return 200;
  if (text.includes(q))
    return 150;
  if (tokens.every((t) => name.includes(t) || text.includes(t)))
    return 100;
  return 0;
}
function compareByUse(a, b) {
  return b.lastUsed - a.lastUsed || b.uses - a.uses || a.name.localeCompare(b.name);
}
function compareByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
function searchSnippets(state, query) {
  return state.snippets.map((snippet) => ({ snippet, score: scoreSnippet(snippet, query) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || compareByUse(a.snippet, b.snippet)).map((r) => r.snippet);
}
function resolveSnippet(state, input) {
  if (!state.snippets.length)
    return { error: "You have no snippets yet. Add one from the snippets button in the chat bar, or right-click a message and pick Save as Snippet." };
  const value = typeof input === "string" ? input.trim() : "";
  const list = (items) => items.slice(0, 10).map((s) => `\`${s.name}\``).join(", ") + (items.length > 10 ? `, and ${items.length - 10} more` : "");
  if (!value)
    return { error: `Which snippet? You have: ${list([...state.snippets].sort(compareByName))}` };
  const exact = getSnippet(state, value) ?? findByName(state, value);
  if (exact)
    return { snippet: exact };
  const matches = state.snippets.map((snippet) => ({ snippet, score: scoreSnippet(snippet, value) })).filter((r) => r.score >= 400).sort((a, b) => b.score - a.score || compareByUse(a.snippet, b.snippet));
  if (matches.length === 1 || matches.length > 1 && matches[0].score >= 800 && matches[1].score < 800)
    return { snippet: matches[0].snippet };
  const close = matches.length ? matches.map((m) => m.snippet) : searchSnippets(state, value);
  if (close.length)
    return { error: `No snippet is called "${value}". Did you mean: ${list(close)}?` };
  return { error: `No snippet is called "${value}". You have: ${list([...state.snippets].sort(compareByName))}` };
}
function commandChoices(state) {
  if (!state.snippets.length || state.snippets.length > MAX_CHOICES)
    return;
  return [...state.snippets].sort(compareByName).map((s) => ({ name: s.name, value: s.id }));
}
var BUTTON_PATCH = {
  find: '"ChannelTextAreaButtons"',
  replace: {
    match: /(\i)&&(\i)\.push\(\(0,\i\.jsxs?\)\(\i,\{onClick:\i,disabled:[^{}]+\},"submit"\)\)/,
    with: "$self?.injectButton?.($2,arguments[0]),$&"
  }
};

// plugins/snippets/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var STORAGE_KEY = "snippets";
var settings = {
  showButton: { type: "boolean", label: "Chat bar button", description: "A button in the chat bar that opens your snippets.", default: true },
  commandAction: {
    type: "select",
    label: "/snip does",
    description: "What /snip does with the snippet when you don't pick the send option.",
    default: "send",
    options: [
      { label: "Send it right away", value: "send" },
      { label: "Put it in the message box to edit first", value: "insert" }
    ]
  }
};
var ctx;
var panelCtx;
var state = EMPTY;
var storage = () => (ctx ?? panelCtx)?.settings;
var listeners = new Set;
var subscribe = (fn) => (listeners.add(fn), () => void listeners.delete(fn));
var useSnippets = () => import_api.React.useSyncExternalStore(subscribe, () => state);
function notify() {
  for (const fn of [...listeners])
    fn();
}
function commit(next) {
  if (next === state)
    return;
  state = next;
  storage()?.set(STORAGE_KEY, state);
  notify();
  syncCommand();
}
function load() {
  state = parseState(storage()?.get(STORAGE_KEY));
  notify();
}
var store = (name) => {
  try {
    return import_api.getStore(name);
  } catch {
    return;
  }
};
var dispatcher;
function componentDispatch() {
  const listening = (d) => {
    try {
      return d?.emitter?.listeners?.("INSERT_TEXT")?.length > 0;
    } catch {
      return false;
    }
  };
  if (listening(dispatcher))
    return dispatcher;
  const all = import_api.findAllExports(import_api.filters.byProps("dispatchToLastSubscribed", "emitter")).map((f) => f.value);
  dispatcher = all.find(listening);
  return dispatcher;
}
function insertText(text) {
  const d = componentDispatch();
  if (!d)
    return false;
  d.dispatchToLastSubscribed("INSERT_TEXT", { plainText: text, rawText: text });
  return true;
}
function displayName(user, guildId) {
  if (!user)
    return;
  const nick = guildId ? store("GuildMemberStore")?.getMember?.(guildId, user.id)?.nick : undefined;
  return nick || user.globalName || user.global_name || user.username;
}
async function readClipboard() {
  try {
    const native = window.DiscordNative?.clipboard;
    if (typeof native?.read === "function")
      return String(await native.read() ?? "");
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}
async function placeholderValues(text, channel) {
  const used = usedPlaceholders(text);
  if (!used.size)
    return {};
  channel ??= store("ChannelStore")?.getChannel?.(store("SelectedChannelStore")?.getChannelId?.());
  const guildId = channel?.guild_id ?? undefined;
  const users = store("UserStore");
  const values = { ...dateValues(new Date) };
  if (used.has("user") && channel) {
    const reply = store("PendingReplyStore")?.getPendingReply?.(channel.id);
    let user = reply?.message?.author;
    if (!user && channel.isDM?.()) {
      const id = channel.getRecipientId?.() ?? channel.recipients?.[0];
      user = id ? users?.getUser?.(id) : undefined;
    }
    values.user = displayName(user, guildId);
  }
  if (used.has("me"))
    values.me = displayName(users?.getCurrentUser?.(), guildId);
  if (used.has("channel") && channel?.name)
    values.channel = channel.name;
  if (used.has("server") && guildId)
    values.server = store("GuildStore")?.getGuild?.(guildId)?.name;
  if (used.has("clipboard"))
    values.clipboard = await readClipboard();
  return values;
}
async function expand(snippet, channel) {
  return expandPlaceholders(snippet.text, await placeholderValues(snippet.text, channel));
}
async function insertSnippet(snippet, channel) {
  const text = await expand(snippet, channel);
  if (!insertText(text)) {
    ctx?.toast("Couldn't find the message box to put the snippet in", { type: "failure" });
    return false;
  }
  commit(recordUse(state, snippet.id));
  return true;
}
var unregisterCommand;
var registeredChoices = "";
function syncCommand() {
  if (!ctx)
    return;
  const choices = commandChoices(state);
  const key2 = JSON.stringify(choices ?? null);
  if (unregisterCommand && key2 === registeredChoices)
    return;
  unregisterCommand?.();
  registeredChoices = key2;
  const plugin = ctx;
  unregisterCommand = import_api.registerCommand({
    name: "snip",
    description: "Send one of your snippets, or put it in the message box",
    options: [
      {
        name: "name",
        description: choices ? "The snippet" : "The snippet's name",
        type: "string",
        required: true,
        choices
      },
      {
        name: "send",
        description: "On: send it right away. Off: put it in the message box to edit first.",
        type: "boolean",
        required: false
      }
    ],
    async execute(args, command) {
      const found = resolveSnippet(state, args.name);
      if ("error" in found)
        return { ephemeral: found.error };
      const text = await expand(found.snippet, command.channel);
      commit(recordUse(state, found.snippet.id));
      const send = typeof args.send === "boolean" ? args.send : plugin.settings.get("commandAction") === "send";
      if (send)
        return { content: text };
      setTimeout(() => {
        if (!insertText(text))
          plugin.toast("Couldn't find the message box to put the snippet in", { type: "failure" });
      }, 50);
    }
  }, plugin.id);
}
function Editor({ snippet, initial, onDone, autoFocusText }) {
  const current = useSnippets();
  const [name, setName] = import_api.React.useState(snippet?.name ?? initial?.name ?? "");
  const [text, setText] = import_api.React.useState(snippet?.text ?? initial?.text ?? "");
  const [tried, setTried] = import_api.React.useState(false);
  const textRef = import_api.React.useRef(null);
  const nameProblem = nameError(current, name, snippet?.id);
  const textProblem = textError(text);
  const error = nameProblem ?? textProblem;
  const save = () => {
    setTried(true);
    if (error)
      return;
    const result = snippet ? updateSnippet(state, snippet.id, { name, text }) : addSnippet(state, { name, text });
    if (result.error || !result.snippet)
      return;
    commit(result.state);
    onDone(result.snippet);
  };
  const insertPlaceholder = (key2) => {
    const el = textRef.current;
    const token = `{${key2}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDone(null);
    }
  };
  return /* @__PURE__ */ jsx_runtime.jsxs("form", {
    className: "evi-snip-editor",
    onSubmit: (e) => (e.preventDefault(), save()),
    onKeyDown,
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("label", {
        className: "evi-snip-label",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            children: "Name"
          }),
          /* @__PURE__ */ jsx_runtime.jsx("input", {
            className: "evi-snip-input",
            value: name,
            maxLength: MAX_NAME_LENGTH,
            placeholder: "e.g. welcome",
            "aria-invalid": tried && !!nameProblem,
            autoFocus: !autoFocusText,
            onChange: (e) => setName(e.currentTarget.value)
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("label", {
        className: "evi-snip-label",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            children: "Text"
          }),
          /* @__PURE__ */ jsx_runtime.jsx("textarea", {
            ref: textRef,
            className: "evi-snip-input evi-snip-textarea",
            value: text,
            maxLength: MAX_TEXT_LENGTH,
            rows: 5,
            placeholder: "Hi {user}, thanks for reaching out!",
            "aria-invalid": tried && !nameProblem && !!textProblem,
            autoFocus: autoFocusText,
            onChange: (e) => setText(e.currentTarget.value)
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-snip-placeholders",
        "aria-label": "Placeholders",
        children: PLACEHOLDERS.map((p) => /* @__PURE__ */ jsx_runtime.jsx("button", {
          type: "button",
          className: "evi-snip-chip",
          title: p.description,
          onClick: () => insertPlaceholder(p.key),
          children: `{${p.key}}`
        }, p.key))
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "evi-snip-editor-foot",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-snip-error",
            role: "alert",
            children: tried && error ? error : ""
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "evi-snip-button",
            onClick: () => onDone(null),
            children: "Cancel"
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "submit",
            className: "evi-snip-button evi-snip-primary",
            children: snippet ? "Save" : "Add snippet"
          })
        ]
      })
    ]
  });
}
function Row({ snippet, active, id, onPick, onEdit, onDelete, onHover }) {
  const [confirming, setConfirming] = import_api.React.useState(false);
  import_api.React.useEffect(() => {
    if (!confirming)
      return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);
  const preview = snippet.text.replace(/\s+/g, " ").slice(0, 140);
  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
    id,
    className: "evi-snip-row",
    role: onPick ? "option" : undefined,
    "aria-selected": onPick ? !!active : undefined,
    "data-active": active || undefined,
    onMouseMove: onHover,
    onClick: onPick,
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "evi-snip-row-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-snip-name",
            children: snippet.name
          }),
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-snip-preview",
            children: preview
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-snip-actions",
        onClick: (e) => e.stopPropagation(),
        children: confirming ? /* @__PURE__ */ jsx_runtime.jsx("button", {
          type: "button",
          className: "evi-snip-button evi-snip-danger",
          tabIndex: -1,
          onClick: onDelete,
          children: "Delete"
        }) : /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-snip-icon",
              tabIndex: -1,
              "aria-label": `Edit ${snippet.name}`,
              title: "Edit",
              onClick: onEdit,
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "16",
                height: "16",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  fill: "currentColor",
                  d: "m13.96 5.46 4.58 4.58L8.58 20H4v-4.58l9.96-9.96Zm1.41-1.41 1.84-1.84a2 2 0 0 1 2.83 0l1.75 1.75a2 2 0 0 1 0 2.83l-1.84 1.84-4.58-4.58Z"
                })
              })
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-snip-icon",
              tabIndex: -1,
              "aria-label": `Delete ${snippet.name}`,
              title: "Delete",
              onClick: () => setConfirming(true),
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "16",
                height: "16",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  fill: "currentColor",
                  d: "M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9Z"
                })
              })
            })
          ]
        })
      })
    ]
  });
}
function Picker({ channel, onClose }) {
  const current = useSnippets();
  const [query, setQuery] = import_api.React.useState("");
  const [index, setIndex] = import_api.React.useState(0);
  const [view, setView] = import_api.React.useState({ kind: "list" });
  const listRef = import_api.React.useRef(null);
  const searchRef = import_api.React.useRef(null);
  const results = import_api.React.useMemo(() => searchSnippets(current, query), [current, query]);
  const active = Math.min(index, Math.max(0, results.length - 1));
  import_api.React.useEffect(() => setIndex(0), [query]);
  import_api.React.useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [active, results]);
  const pick = async (snippet) => {
    if (!snippet)
      return;
    onClose();
    await insertSnippet(snippet, channel);
  };
  const backToList = () => {
    setView({ kind: "list" });
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  if (view.kind === "edit") {
    return /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-snip-picker",
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("header", {
          className: "evi-snip-head",
          children: /* @__PURE__ */ jsx_runtime.jsx("h2", {
            className: "evi-snip-title",
            children: view.snippet ? "Edit snippet" : "New snippet"
          })
        }),
        /* @__PURE__ */ jsx_runtime.jsx(Editor, {
          snippet: view.snippet,
          initial: view.initial,
          autoFocusText: !!view.snippet,
          onDone: (saved) => {
            if (saved)
              setQuery("");
            backToList();
          }
        })
      ]
    });
  }
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length)
        return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setIndex((active + step + results.length) % results.length);
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      setIndex(Math.max(0, Math.min(results.length - 1, active + (e.key === "PageDown" ? 5 : -5))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active])
        pick(results[active]);
      else if (query.trim())
        setView({ kind: "edit", initial: { name: query.trim() } });
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "evi-snip-picker",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("header", {
        className: "evi-snip-head",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("input", {
            ref: searchRef,
            className: "evi-snip-input evi-snip-search",
            placeholder: current.snippets.length ? "Search snippets" : "Name your first snippet",
            "aria-label": "Search snippets",
            role: "combobox",
            "aria-expanded": "true",
            "aria-controls": "evi-snip-list",
            "aria-activedescendant": results[active] ? `evi-snip-${results[active].id}` : undefined,
            value: query,
            autoFocus: true,
            onChange: (e) => setQuery(e.currentTarget.value),
            onKeyDown
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "evi-snip-button evi-snip-primary",
            onClick: () => setView({ kind: "edit", initial: { name: results.length ? "" : query.trim() } }),
            children: "New"
          })
        ]
      }),
      results.length ? /* @__PURE__ */ jsx_runtime.jsx("ul", {
        id: "evi-snip-list",
        className: "evi-snip-list",
        role: "listbox",
        "aria-label": "Snippets",
        ref: listRef,
        children: results.map((s, i) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
          id: `evi-snip-${s.id}`,
          snippet: s,
          active: i === active,
          onHover: () => i !== active && setIndex(i),
          onPick: () => void pick(s),
          onEdit: () => setView({ kind: "edit", snippet: s }),
          onDelete: () => commit(deleteSnippet(state, s.id))
        }, s.id))
      }) : /* @__PURE__ */ jsx_runtime.jsx("p", {
        className: "evi-snip-empty",
        children: current.snippets.length ? /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
          children: [
            'No snippet matches "',
            query,
            '". Press Enter to create it.'
          ]
        }) : /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
          children: "Save replies you type often, then put them in the message box from here or with /snip."
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("footer", {
        className: "evi-snip-foot",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("kbd", {
                children: "↑"
              }),
              /* @__PURE__ */ jsx_runtime.jsx("kbd", {
                children: "↓"
              }),
              " choose"
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("kbd", {
                children: "Enter"
              }),
              " insert"
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsxs("span", {
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("kbd", {
                children: "Esc"
              }),
              " close"
            ]
          })
        ]
      })
    ]
  });
}
var closeOpen;
var openAnchor = null;
var openListeners = new Set;
var useOpenAnchor = () => import_api.React.useSyncExternalStore((fn) => (openListeners.add(fn), () => void openListeners.delete(fn)), () => openAnchor);
var setOpenAnchor = (el) => {
  openAnchor = el;
  for (const fn of [...openListeners])
    fn();
};
function openLayer(render, anchor) {
  closeOpen?.();
  const container = document.createElement("div");
  container.className = "evi-snip-layer";
  document.body.append(container);
  const root = import_api.createRoot(container);
  const previous = document.activeElement;
  const onPointer = (e) => {
    const target = e.target;
    if (container.contains(target) || anchor?.contains(target))
      return;
    close();
  };
  const onKey = (e) => {
    if (e.key !== "Escape" || container.contains(e.target))
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  };
  const onInnerKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape" && !e.defaultPrevented)
      close();
  };
  container.addEventListener("keydown", onInnerKey);
  const close = () => {
    if (closeOpen !== close)
      return;
    container.removeEventListener("keydown", onInnerKey);
    closeOpen = undefined;
    setOpenAnchor(null);
    window.removeEventListener("mousedown", onPointer, true);
    window.removeEventListener("keydown", onKey, true);
    root.unmount();
    container.remove();
    if (!anchor && previous?.isConnected)
      previous.focus?.();
  };
  closeOpen = close;
  window.addEventListener("mousedown", onPointer, true);
  window.addEventListener("keydown", onKey, true);
  setOpenAnchor(anchor ?? null);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right - 8);
    const bottom = Math.max(8, window.innerHeight - rect.top + 8);
    root.render(/* @__PURE__ */ jsx_runtime.jsx("div", {
      className: "evi-snip-popover",
      role: "dialog",
      "aria-label": "Snippets",
      style: { right, bottom, maxHeight: Math.max(240, rect.top - 24) },
      children: render(close)
    }));
  } else {
    root.render(/* @__PURE__ */ jsx_runtime.jsx("div", {
      className: "evi-snip-scrim",
      onMouseDown: (e) => e.target === e.currentTarget && close(),
      children: /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-snip-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Snippet",
        children: render(close)
      })
    }));
  }
  return close;
}
function openPicker(anchor, channel) {
  if (closeOpen && openAnchor === anchor)
    return closeOpen();
  openLayer((close) => /* @__PURE__ */ jsx_runtime.jsx(Picker, {
    channel,
    onClose: close
  }), anchor);
}
function openEditorDialog(initial) {
  openLayer((close) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "evi-snip-picker",
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("header", {
        className: "evi-snip-head",
        children: /* @__PURE__ */ jsx_runtime.jsx("h2", {
          className: "evi-snip-title",
          children: "Save as snippet"
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsx(Editor, {
        initial,
        autoFocusText: false,
        onDone: (saved) => {
          close();
          if (saved)
            ctx?.toast(`Saved "${saved.name}". Use it with /snip or the snippets button.`, { type: "success" });
        }
      })
    ]
  }));
}
var containerClass;
function getContainerClass() {
  containerClass ??= Object.values(import_api.find((v) => typeof v === "object" && Object.values(v).some((c) => typeof c === "string" && c.startsWith("channelAppLauncherButtonPopoutIconAnimation_"))) ?? {}).find((c) => typeof c === "string" && c.startsWith("buttonContainer_"));
  return containerClass;
}
var chatButtonFilter = import_api.filters.componentByCode("CHAT_INPUT_BUTTON_NOTIFICATION", "sparkle");
var ChatButton;
function SnippetIcon() {
  return /* @__PURE__ */ jsx_runtime.jsx("svg", {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsx_runtime.jsx("path", {
      d: "M5 3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2v3.5a.5.5 0 0 0 .85.35L11.7 18H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm2 4h10v2H7V7Zm0 4h7v2H7v-2Z"
    })
  });
}
function SnippetsButton({ channel }) {
  const { showButton } = ctx.settings.use();
  const ref = import_api.React.useRef(null);
  const anchor = useOpenAnchor();
  if (!showButton)
    return null;
  const open = !!anchor && anchor === ref.current;
  const onClick = () => ref.current && openPicker(ref.current, channel);
  const label = "Snippets";
  ChatButton ??= import_api.find(chatButtonFilter);
  const button = ChatButton ? /* @__PURE__ */ jsx_runtime.jsx(ChatButton, {
    onClick,
    isActive: open,
    "aria-label": label,
    "aria-expanded": open,
    sparkle: false,
    children: /* @__PURE__ */ jsx_runtime.jsx(SnippetIcon, {})
  }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "evi-snip-fallback",
    onClick,
    "aria-label": label,
    "aria-expanded": open,
    children: /* @__PURE__ */ jsx_runtime.jsx(SnippetIcon, {})
  });
  const Tooltip = import_api.Components.Tooltip;
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    ref,
    className: getContainerClass(),
    "data-evi-snippets": "",
    children: Tooltip && !open ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
      text: label,
      position: "top",
      children: /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-snip-tip",
        children: button
      })
    }) : button
  });
}
function ManagePanel() {
  const current = useSnippets();
  const [editing, setEditing] = import_api.React.useState(null);
  const sorted = [...current.snippets].sort(compareByName);
  const editingSnippet = editing && editing !== "new" ? getSnippet(current, editing) : undefined;
  return /* @__PURE__ */ jsx_runtime.jsxs("section", {
    className: "evi-snip-panel",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "evi-snip-panel-head",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("h3", {
            className: "evi-snip-title",
            children: [
              "Your snippets · ",
              current.snippets.length
            ]
          }),
          editing === null && /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "evi-snip-button evi-snip-primary",
            onClick: () => setEditing("new"),
            children: "New snippet"
          })
        ]
      }),
      editing !== null && (editing === "new" || editingSnippet) && /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-snip-panel-editor",
        children: /* @__PURE__ */ jsx_runtime.jsx(Editor, {
          snippet: editingSnippet,
          onDone: () => setEditing(null)
        }, editing)
      }),
      sorted.length ? /* @__PURE__ */ jsx_runtime.jsx("ul", {
        className: "evi-snip-list",
        children: sorted.map((s) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
          snippet: s,
          onEdit: () => setEditing(s.id),
          onDelete: () => commit(deleteSnippet(state, s.id))
        }, s.id))
      }) : editing === null && /* @__PURE__ */ jsx_runtime.jsx("p", {
        className: "evi-snip-empty",
        children: "No snippets yet. Add one here, from the chat bar button, or right-click a message and pick Save as Snippet."
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("p", {
        className: "evi-snip-hint",
        children: [
          "Placeholders: ",
          PLACEHOLDERS.map((p) => `{${p.key}}`).join(" "),
          ". Type ",
          /* @__PURE__ */ jsx_runtime.jsxs("code", {
            children: [
              "\\",
              "{",
              "user",
              "}"
            ]
          }),
          " to keep one as written."
        ]
      })
    ]
  });
}
var snippets_default = import_api.definePlugin({
  settings,
  patches: [BUTTON_PATCH],
  injectButton(buttons, props) {
    try {
      if (!ctx?.settings.get("showButton") || !Array.isArray(buttons) || props?.channel?.id == null)
        return;
      buttons.push(/* @__PURE__ */ jsx_runtime.jsx(SnippetsButton, {
        channel: props.channel
      }, "evi-snippets"));
    } catch (err) {
      ctx?.logger.error("Couldn't add the chat bar button", err);
    }
  },
  settingsPanel(context) {
    if (!ctx && panelCtx !== context) {
      panelCtx = context;
      load();
    }
    return /* @__PURE__ */ jsx_runtime.jsx(ManagePanel, {});
  },
  getState: () => state,
  insertText,
  css: `
.evi-snip-layer { position: fixed; inset: 0; z-index: 1002; pointer-events: none; }
.evi-snip-layer > * { pointer-events: auto; }
.evi-snip-popover, .evi-snip-dialog {
    --evi-snip-text: var(--text-default, var(--text-normal, #dbdee1));
    --evi-snip-muted: var(--text-muted, #949ba4);
    --evi-snip-bg: var(--background-surface-high, var(--background-floating, #2b2d31));
    --evi-snip-input: var(--input-background, var(--background-tertiary, #1e1f22));
    --evi-snip-hover: var(--background-mod-normal, rgba(78, 80, 88, 0.48));
    --evi-snip-border: var(--border-subtle, rgba(255, 255, 255, 0.08));
    --evi-snip-brand: var(--brand-500, #5865f2);
    color: var(--evi-snip-text);
    background: var(--evi-snip-bg);
    border: 1px solid var(--evi-snip-border);
    border-radius: 12px;
    box-shadow: var(--shadow-high, 0 8px 24px rgba(0, 0, 0, 0.35));
    font-size: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.evi-snip-popover { position: fixed; width: min(420px, calc(100vw - 16px)); animation: evi-snip-in 140ms cubic-bezier(.2, .8, .2, 1); }
.evi-snip-scrim { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.6); }
.evi-snip-dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 64px); animation: evi-snip-in 160ms cubic-bezier(.2, .8, .2, 1); }
@keyframes evi-snip-in { from { opacity: 0; transform: translateY(4px) scale(.98); } }
.evi-snip-picker { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.evi-snip-head { display: flex; gap: 8px; align-items: center; padding: 12px 12px 8px; }
.evi-snip-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--header-primary, var(--evi-snip-text)); }
.evi-snip-input {
    box-sizing: border-box; width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent;
    background: var(--evi-snip-input, var(--input-background, #1e1f22)); color: inherit; font: inherit; outline: none;
}
.evi-snip-input:focus { border-color: var(--evi-snip-brand, #5865f2); }
.evi-snip-input[aria-invalid="true"] { border-color: var(--status-danger, #da373c); }
.evi-snip-input::placeholder { color: var(--evi-snip-muted, #949ba4); }
.evi-snip-search { flex: 1; }
.evi-snip-textarea { resize: vertical; min-height: 96px; max-height: 320px; line-height: 1.4; }
.evi-snip-list { list-style: none; margin: 0; padding: 0 6px 6px; overflow-y: auto; min-height: 0; flex: 1; }
.evi-snip-row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; }
.evi-snip-panel .evi-snip-row { cursor: default; }
.evi-snip-row[data-active], .evi-snip-panel .evi-snip-row:hover { background: var(--evi-snip-hover, var(--background-mod-normal, rgba(78, 80, 88, 0.48))); }
.evi-snip-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 2px; }
.evi-snip-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-snip-preview { color: var(--evi-snip-muted, #949ba4); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-snip-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 120ms ease; }
.evi-snip-row:hover .evi-snip-actions, .evi-snip-row[data-active] .evi-snip-actions, .evi-snip-actions:focus-within { opacity: 1; }
.evi-snip-icon {
    display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none;
    color: var(--interactive-normal, #b5bac1); cursor: pointer;
}
.evi-snip-icon:hover { color: var(--interactive-active, #fff); background: var(--background-mod-strong, rgba(78, 80, 88, 0.6)); }
.evi-snip-button {
    flex-shrink: 0; height: 32px; padding: 0 14px; border: 0; border-radius: 8px; font: inherit; font-weight: 500; cursor: pointer;
    background: var(--button-secondary-background, #4e5058); color: #fff; transition: filter 120ms ease;
}
.evi-snip-button:hover { filter: brightness(1.1); }
.evi-snip-button:focus-visible, .evi-snip-icon:focus-visible, .evi-snip-chip:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 1px; }
.evi-snip-primary { background: var(--brand-500, #5865f2); }
.evi-snip-danger { background: var(--status-danger, #da373c); height: 28px; padding: 0 10px; }
.evi-snip-empty { margin: 0; padding: 16px 16px 20px; color: var(--evi-snip-muted, #949ba4); text-align: center; line-height: 1.4; }
.evi-snip-foot { display: flex; gap: 14px; padding: 8px 12px; border-top: 1px solid var(--evi-snip-border); color: var(--evi-snip-muted); font-size: 12px; }
.evi-snip-foot kbd {
    display: inline-block; min-width: 14px; margin-right: 3px; padding: 0 4px; border-radius: 4px; text-align: center;
    background: var(--evi-snip-input); font: inherit; font-size: 11px;
}
.evi-snip-editor { display: flex; flex-direction: column; gap: 10px; padding: 4px 12px 12px; overflow-y: auto; }
.evi-snip-label { display: flex; flex-direction: column; gap: 6px; }
.evi-snip-label > span { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--header-secondary, #b5bac1); }
.evi-snip-placeholders { display: flex; flex-wrap: wrap; gap: 6px; }
.evi-snip-chip {
    height: 24px; padding: 0 8px; border-radius: 12px; border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    background: var(--background-mod-subtle, rgba(78, 80, 88, 0.3)); color: var(--interactive-normal, #b5bac1);
    font-family: var(--font-code, monospace); font-size: 12px; cursor: pointer;
}
.evi-snip-chip:hover { color: var(--interactive-active, #fff); }
.evi-snip-editor-foot { display: flex; align-items: center; gap: 8px; }
.evi-snip-error { flex: 1; color: var(--text-danger, #f23f43); font-size: 13px; }
.evi-snip-fallback {
    display: flex; align-items: center; justify-content: center; height: 100%; padding: 4px; background: none; border: 0; cursor: pointer;
    color: var(--interactive-normal, #b5bac1);
}
.evi-snip-fallback:hover, .evi-snip-fallback[aria-expanded="true"] { color: var(--interactive-active, #fff); }
.evi-snip-tip { display: flex; align-items: center; height: 100%; }
.evi-snip-panel { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.evi-snip-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.evi-snip-panel .evi-snip-list { padding: 0; }
.evi-snip-panel-editor {
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding-top: 10px;
    --evi-snip-input: var(--input-background, var(--background-tertiary, #1e1f22));
    --evi-snip-brand: var(--brand-500, #5865f2);
}
.evi-snip-hint { margin: 0; color: var(--text-muted, #949ba4); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .evi-snip-popover, .evi-snip-dialog { animation: none; } .evi-snip-actions, .evi-snip-button { transition: none; } }
`,
  start(context) {
    ctx = context;
    panelCtx = undefined;
    load();
    syncCommand();
    context.contextMenu("message", (children, props) => {
      const content = typeof props?.message?.content === "string" ? props.message.content : "";
      if (!content.trim())
        return;
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: "evi-snippets-save",
          label: "Save as Snippet",
          action: () => openEditorDialog({ name: suggestName(state, content), text: content })
        })
      }, "evi-snippets"));
    });
    context.flux.subscribe("CHANNEL_SELECT", () => {
      if (openAnchor)
        closeOpen?.();
    });
    context.onDispose(() => {
      closeOpen?.();
      unregisterCommand?.();
      unregisterCommand = undefined;
      registeredChoices = "";
      ctx = undefined;
      panelCtx = context;
    });
  }
});
