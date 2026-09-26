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

// plugins/no-track/index.tsx
var exports_no_track = {};
__export(exports_no_track, {
  default: () => no_track_default
});
module.exports = __toCommonJS(exports_no_track);
var import_api = require("@delight/api");
var jsx_runtime = require("react/jsx-runtime");
function BlockedCounter({ ctx }) {
  const [count, setCount] = import_api.React.useState(null);
  import_api.React.useEffect(() => {
    let alive = true;
    const refresh = () => ctx.native.call("getBlockedCount").then((n) => alive && setCount(n));
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return /* @__PURE__ */ jsx_runtime.jsx("p", {
    className: "dl-hint",
    role: "status",
    style: { fontVariantNumeric: "tabular-nums" },
    children: count === null ? "Counting blocked requests…" : `Blocked ${count} tracking requests since Discord started.`
  });
}
var no_track_default = import_api.definePlugin({
  settingsPanel: (ctx) => /* @__PURE__ */ jsx_runtime.jsx(BlockedCounter, {
    ctx
  })
});
