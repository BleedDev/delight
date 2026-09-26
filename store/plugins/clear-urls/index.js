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

// plugins/clear-urls/index.ts
var exports_clear_urls = {};
__export(exports_clear_urls, {
  default: () => clear_urls_default
});
module.exports = __toCommonJS(exports_clear_urls);
var import_api = require("@evi/api");
var DEFAULT_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "igshid",
  "mc_eid",
  "si",
  "ref_src",
  "ref_url",
  "_hsenc",
  "_hsmi"
];
var URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;
var clear_urls_default = import_api.definePlugin({
  settings: {
    extraParams: {
      type: "string",
      label: "Extra parameters to remove",
      description: "Comma separated, on top of the built-in list of common trackers.",
      placeholder: "ref, source",
      default: ""
    }
  },
  start(ctx) {
    const clean = (content) => {
      if (!content?.includes("http"))
        return content;
      const extra = ctx.settings.get("extraParams").split(",").map((s) => s.trim()).filter(Boolean);
      const params = new Set([...DEFAULT_PARAMS, ...extra]);
      return content.replace(URL_REGEX, (raw) => {
        try {
          const url = new URL(raw);
          let changed = false;
          for (const key of [...url.searchParams.keys()]) {
            if (params.has(key)) {
              url.searchParams.delete(key);
              changed = true;
            }
          }
          return changed ? url.toString() : raw;
        } catch {
          return raw;
        }
      });
    };
    const actions = import_api.filters.byProps("sendMessage", "editMessage");
    ctx.hookExport("before", actions, "sendMessage", ({ args }) => {
      if (args[1]?.content)
        args[1].content = clean(args[1].content);
    });
    ctx.hookExport("before", actions, "editMessage", ({ args }) => {
      if (args[2]?.content)
        args[2].content = clean(args[2].content);
    });
  }
});
