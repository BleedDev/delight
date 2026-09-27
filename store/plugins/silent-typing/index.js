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

// plugins/silent-typing/index.tsx
var exports_silent_typing = {};
__export(exports_silent_typing, {
  default: () => silent_typing_default
});
module.exports = __toCommonJS(exports_silent_typing);
var import_api = require("@evi/api");
var jsx_runtime = require("react/jsx-runtime");
var typingActions = import_api.filters.byProps("startTyping", "stopTyping");
var chatButtonFilter = import_api.filters.componentByCode("CHAT_INPUT_BUTTON_NOTIFICATION", "sparkle");
var settings = {
  enabled: { type: "boolean", label: "Enabled", description: "Hide your typing indicator from others. /silenttyping toggles this.", default: true },
  showButton: { type: "boolean", label: "Chat bar button", description: "A keyboard button in the chat bar that toggles it.", default: true }
};
var context;
function toggle() {
  if (!context)
    return "";
  const enabled = !context.settings.get("enabled");
  context.settings.set("enabled", enabled);
  return enabled ? "Silent typing is on: others won't see you typing." : "Silent typing is off.";
}
function lookup(search) {
  let value;
  let missedAt = -Infinity;
  return () => {
    if (value !== undefined || performance.now() - missedAt < 1e4)
      return value;
    value = search();
    if (value === undefined)
      missedAt = performance.now();
    return value;
  };
}
var getContainerClass = lookup(() => Object.values(import_api.find((v) => typeof v === "object" && Object.values(v).some((c) => typeof c === "string" && c.startsWith("channelAppLauncherButtonPopoutIconAnimation_"))) ?? {}).find((c) => typeof c === "string" && c.startsWith("buttonContainer_")));
var getChatButton = lookup(() => import_api.find(chatButtonFilter));
function KeyboardIcon({ off }) {
  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("mask", {
        id: "dl-silent-typing-slash",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("rect", {
            width: "24",
            height: "24",
            fill: "white"
          }),
          /* @__PURE__ */ jsx_runtime.jsx("path", {
            d: "M3 3 21 21",
            stroke: "black",
            strokeWidth: 5
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsx("path", {
        fillRule: "evenodd",
        mask: off ? "url(#dl-silent-typing-slash)" : undefined,
        d: "M3 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H3Zm2 3h2v2H5V9Zm4 0h2v2H9V9Zm4 0h2v2h-2V9Zm4 0h2v2h-2V9ZM5 13h2v2H5v-2Zm4 0h6v2H9v-2Zm8 0h2v2h-2v-2Z"
      }),
      off && /* @__PURE__ */ jsx_runtime.jsx("path", {
        d: "M3 3 21 21",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round"
      })
    ]
  });
}
function SilentTypingButton() {
  const { enabled } = context.settings.use();
  const label = enabled ? "Silent typing on (click to turn off)" : "Silent typing off (click to turn on)";
  const ChatButton = getChatButton();
  const icon = /* @__PURE__ */ jsx_runtime.jsx(KeyboardIcon, {
    off: enabled
  });
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: getContainerClass(),
    "data-evi-silent-typing": enabled ? "on" : "off",
    children: ChatButton ? /* @__PURE__ */ jsx_runtime.jsx(ChatButton, {
      onClick: toggle,
      isActive: enabled,
      "aria-label": label,
      sparkle: false,
      children: icon
    }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
      type: "button",
      className: "dl-silent-typing-fallback",
      onClick: toggle,
      "aria-label": label,
      "aria-pressed": enabled,
      children: icon
    })
  });
}
var silent_typing_default = import_api.definePlugin({
  settings,
  patches: [{
    find: '"ChannelTextAreaButtons"',
    replace: {
      match: /(?<=[,(])0===(\i)\.length(?=\)\?null:\(0,\i\.jsxs?\)\("div",\{className:\i\.\i,children:\1\}\))/,
      with: "($self?.injectButton?.($1,arguments[0]),0===$1.length)"
    }
  }],
  injectButton(buttons, props) {
    try {
      if (!context?.settings.get("showButton") || !Array.isArray(buttons) || props?.channel?.id == null)
        return;
      const button = /* @__PURE__ */ jsx_runtime.jsx(SilentTypingButton, {}, "evi-silent-typing");
      const submit = buttons.findIndex((b) => b?.key === "submit");
      if (submit < 0)
        buttons.push(button);
      else
        buttons.splice(submit, 0, button);
    } catch (err) {
      context?.logger.error("Couldn't add the chat bar button", err);
    }
  },
  SilentTypingButton,
  toggle,
  css: `
        .dl-silent-typing-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 4px;
            background: none; border: 0; cursor: pointer; color: var(--interactive-normal); }
        .dl-silent-typing-fallback:hover, .dl-silent-typing-fallback[aria-pressed="true"] { color: var(--interactive-active); }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => void (context = undefined));
    ctx.hookExport("instead", typingActions, "startTyping", (call) => {
      if (!ctx.settings.get("enabled"))
        return call.callOriginal(...call.args);
    });
    ctx.settings.onChange(({ enabled }) => {
      if (!enabled)
        return;
      const channelId = import_api.getStore("SelectedChannelStore")?.getChannelId?.();
      if (channelId)
        import_api.find(typingActions)?.stopTyping(channelId);
    });
    ctx.command({
      name: "silenttyping",
      description: "Turn silent typing on or off",
      execute: () => ({ ephemeral: toggle() })
    });
  }
});
