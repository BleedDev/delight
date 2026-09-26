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

// plugins/smooth-typing/index.ts
var exports_smooth_typing = {};
__export(exports_smooth_typing, {
  default: () => smooth_typing_default
});
module.exports = __toCommonJS(exports_smooth_typing);
var import_api = require("@delight/api");
var DELAY = 250;
var smooth_typing_default = import_api.definePlugin({
  start(ctx) {
    const pending = new Map;
    let dispatchOriginal;
    const keyOf = (a) => `${a.channelId}:${a.draftType}`;
    const flush = () => {
      for (const [key, { action, timer }] of pending) {
        clearTimeout(timer);
        pending.delete(key);
        dispatchOriginal?.(action);
      }
    };
    ctx.hook.instead(import_api.Dispatcher, "dispatch", (call) => {
      const action = call.args[0];
      dispatchOriginal ??= (a) => call.original.call(call.self, a);
      if (action?.type === "DRAFT_CHANGE") {
        const key = keyOf(action);
        const previous = pending.get(key);
        if (previous)
          clearTimeout(previous.timer);
        pending.set(key, {
          action,
          timer: setTimeout(() => {
            pending.delete(key);
            dispatchOriginal(action);
          }, DELAY)
        });
        return Promise.resolve();
      }
      if (action?.type === "DRAFT_CLEAR") {
        const previous = pending.get(keyOf(action));
        if (previous) {
          clearTimeout(previous.timer);
          pending.delete(keyOf(action));
        }
      }
      return call.callOriginal(...call.args);
    });
    addEventListener("pagehide", flush);
    ctx.onDispose(() => {
      removeEventListener("pagehide", flush);
      flush();
    });
  }
});
