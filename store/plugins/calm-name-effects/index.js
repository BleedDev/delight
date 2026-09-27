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

// plugins/calm-name-effects/index.ts
var exports_calm_name_effects = {};
__export(exports_calm_name_effects, {
  default: () => calm_name_effects_default
});
module.exports = __toCommonJS(exports_calm_name_effects);
var import_api = require("@evi/api");
var settings = {
  animateOnHover: {
    type: "boolean",
    label: "Animate on hover",
    description: "Play a name's effect while your pointer is on it. Off keeps every name still.",
    default: true
  }
};
var stylesFilter = Object.assign((v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((c) => typeof c === "string" && /^innerContainer_+[\da-f]+$/.test(c)) && Object.values(v).some((c) => typeof c === "string" && /^prism-scroll_+[\da-f]+$/.test(c)), { $code: ['"innerContainer_', '"prism-scroll_'], $label: "display name styles CSS module" });
function buildCss(classes, onHover) {
  const cls = (name) => Object.values(classes).find((c) => typeof c === "string" && new RegExp(`^${name}_+[\\da-f]+$`).test(c));
  const animated = cls("animated"), inner = cls("innerContainer");
  if (!animated || !inner)
    return "";
  const scope = `.${animated}${onHover ? ":not(:hover)" : ""} .${inner}`;
  return `${[scope, `${scope} *`, `${scope}::before`, `${scope} *::before`, `${scope}::after`, `${scope} *::after`].join(`,
`)} {
    animation: none !important;
}`;
}
var styles;
var calm_name_effects_default = import_api.definePlugin({
  settings,
  start(ctx) {
    const style = ctx.addStyle("");
    const apply = () => {
      if (styles)
        style.update(buildCss(styles, ctx.settings.get("animateOnHover")));
    };
    if (styles)
      apply();
    else
      ctx.waitFor(stylesFilter, (classes) => {
        styles = classes;
        apply();
      });
    ctx.settings.onChange(apply);
  }
});
