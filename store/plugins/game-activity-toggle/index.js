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

// plugins/game-activity-toggle/index.tsx
var exports_game_activity_toggle = {};
__export(exports_game_activity_toggle, {
  default: () => game_activity_toggle_default
});
module.exports = __toCommonJS(exports_game_activity_toggle);
var import_api = require("@evi/api");

// plugins/game-activity-toggle/toggle.ts
function readShowCurrentGame(protoSettings) {
  const value = protoSettings?.status?.showCurrentGame?.value;
  return typeof value === "boolean" ? value : true;
}
var buttonLabel = (shown) => shown ? "Hide game activity" : "Show game activity";
var toggledMessage = (shown) => shown ? "Game activity is visible: others can see what you're playing." : "Game activity is hidden: others won't see what you're playing.";
var PATCHES = {
  setting: {
    find: '"status","showCurrentGame"',
    replace: {
      match: /(?<=(\i)=\i\("status","showCurrentGame",e=>e\?\.value\?\?!0,e=>\i\.\i\.create\(\{value:e\}\)\);)/,
      with: "$self?.captureSetting?.($1);"
    }
  },
  userPanel: {
    find: "handleOpenSettingsContextMenu",
    replace: {
      match: /children:\[(?=\(0,\i\.jsx\)\(\i,\{accountContainerRef:)/,
      with: "children:[$self?.renderButton?.(),"
    }
  }
};

// plugins/game-activity-toggle/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  showButton: { type: "boolean", label: "User panel button", description: "A gamepad button next to mute and deafen. /gameactivity works either way.", default: true },
  shortcut: { type: "keybind", label: "Shortcut", description: "Shows or hides your game activity from anywhere in Discord.", default: "" }
};
var context;
var showCurrentGame;
var protoStore = () => import_api.findStore("UserSettingsProtoStore");
function isShown() {
  try {
    const value = showCurrentGame?.getSetting();
    if (typeof value === "boolean")
      return value;
  } catch {}
  return readShowCurrentGame(protoStore()?.settings);
}
var PRELOADED = "discord_protos.discord_users.v1.PreloadedUserSettings";
async function writeFallback(value) {
  const creators = import_api.find((v) => typeof v?.updateAsync === "function" && v?.ProtoClass?.typeName === PRELOADED);
  if (!creators)
    throw new Error("Couldn't find Discord's user settings updater");
  const statusType = creators.ProtoClass.fields?.find((f) => f.name === "status")?.T?.();
  const boolType = statusType?.fields?.find((f) => f.localName === "showCurrentGame")?.T?.();
  await creators.updateAsync("status", (status) => {
    status.showCurrentGame = boolType?.create?.({ value }) ?? { value };
  }, 0);
}
var busy = false;
async function toggle() {
  if (busy)
    return;
  busy = true;
  const next = !isShown();
  try {
    if (showCurrentGame)
      await showCurrentGame.updateSetting(next);
    else
      await writeFallback(next);
    context?.toast(toggledMessage(next), { type: "success" });
  } catch (err) {
    context?.logger.error("Couldn't change the game activity setting", err);
    context?.toast("Couldn't change your game activity setting", { type: "failure" });
  } finally {
    busy = false;
  }
}
function subscribe(onChange) {
  const store = protoStore();
  store?.addChangeListener?.(onChange);
  return () => store?.removeChangeListener?.(onChange);
}
var useShown = () => import_api.React.useSyncExternalStore(subscribe, isShown);
function GamepadIcon({ off }) {
  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("mask", {
        id: "dl-game-activity-slash",
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
        mask: off ? "url(#dl-game-activity-slash)" : undefined,
        d: "M6.5 5h11a4 4 0 0 1 3.9 3.1l1.3 5.9a3 3 0 0 1-5.2 2.6l-1.9-2.1H8.4l-1.9 2.1a3 3 0 0 1-5.2-2.6l1.3-5.9A4 4 0 0 1 6.5 5Zm.25 2.75v1.25H5.5v1.5h1.25v1.25h1.5V10.5H9.5V9H8.25V7.75h-1.5ZM16 7.75a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
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
function GameActivityButton() {
  const { showButton } = context.settings.use();
  const shown = useShown();
  if (!showButton)
    return null;
  const label = buttonLabel(shown);
  const button = /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "dl-game-activity-button",
    "data-hidden": !shown || undefined,
    onClick: toggle,
    "aria-label": label,
    "aria-pressed": !shown,
    children: /* @__PURE__ */ jsx_runtime.jsx(GamepadIcon, {
      off: !shown
    })
  });
  const Tooltip = import_api.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: label,
    position: "top",
    children: button
  }) : import_api.React.cloneElement(button, { title: label });
}
var game_activity_toggle_default = import_api.definePlugin({
  settings,
  patches: [PATCHES.setting, PATCHES.userPanel],
  captureSetting(setting) {
    if (setting && typeof setting.getSetting === "function" && typeof setting.updateSetting === "function") {
      showCurrentGame = setting;
    }
  },
  renderButton() {
    if (!context)
      return null;
    return /* @__PURE__ */ jsx_runtime.jsx(GameActivityButton, {}, "evi-game-activity");
  },
  toggle,
  isShown,
  css: `
        .dl-game-activity-button { display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
            width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--radius-sm, 8px); cursor: pointer;
            background: transparent; color: var(--interactive-normal, var(--interactive-icon-default));
            transition: background-color 0.1s ease-out, color 0.1s ease-out; }
        .dl-game-activity-button:hover { background: var(--background-modifier-hover, var(--interactive-background-hover));
            color: var(--interactive-hover, var(--interactive-icon-hover)); }
        .dl-game-activity-button:active { background: var(--background-modifier-active, var(--interactive-background-active));
            color: var(--interactive-active, var(--interactive-icon-active)); }
        .dl-game-activity-button[data-hidden] { color: var(--status-danger, #da373c); }
        .dl-game-activity-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
        @media (prefers-reduced-motion: reduce) { .dl-game-activity-button { transition: none; } }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => void (context = undefined));
    ctx.keybind("shortcut", () => void toggle());
    ctx.command({
      name: "gameactivity",
      description: "Show or hide the game you're playing",
      execute: () => void toggle()
    });
  }
});
