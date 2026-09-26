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

// plugins/toolkit-demo/index.tsx
var exports_toolkit_demo = {};
__export(exports_toolkit_demo, {
  default: () => toolkit_demo_default
});
module.exports = __toCommonJS(exports_toolkit_demo);
var import_api = require("@delight/api");
var jsx_runtime = require("react/jsx-runtime");
async function copy(text) {
  const native = window.DiscordNative?.clipboard;
  if (native?.copy)
    native.copy(text);
  else
    await navigator.clipboard.writeText(text);
}
var toolkit_demo_default = import_api.definePlugin({
  start(ctx) {
    ctx.command({
      name: "delight",
      description: "Say hi from Delight",
      options: [{ name: "text", description: "What the toast says", type: "string" }],
      execute(args) {
        ctx.toast(args.text || `Delight ${window.Delight?.version ?? ""} is running`, { type: "success" });
      }
    });
    ctx.contextMenu("message", (children, { message }) => {
      if (!message?.id)
        return;
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: "delight-copy-message-id",
          label: "Copy Message ID (Delight)",
          action: async () => {
            try {
              await copy(message.id);
              ctx.toast("Message ID copied", { type: "success" });
            } catch {
              ctx.toast("Couldn't copy the message ID", { type: "failure" });
            }
          }
        })
      }));
    });
  }
});
