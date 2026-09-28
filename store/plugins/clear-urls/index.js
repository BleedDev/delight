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
var import_api2 = require("@evi/api");

// plugins/clear-urls/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.extraParams": "Extra parameters to remove",
    "settings.extraParams.description": "Comma separated, on top of the built-in list of common trackers.",
    "settings.extraParams.placeholder": "ref, source"
  },
  de: {
    "settings.extraParams": "Zusätzliche Parameter entfernen",
    "settings.extraParams.description": "Durch Kommas getrennt, zusätzlich zur eingebauten Liste gängiger Tracker.",
    "settings.extraParams.placeholder": "ref, source"
  },
  es: {
    "settings.extraParams": "Parámetros adicionales que quitar",
    "settings.extraParams.description": "Separados por comas, además de la lista incluida de rastreadores comunes.",
    "settings.extraParams.placeholder": "ref, source"
  },
  fr: {
    "settings.extraParams": "Paramètres supplémentaires à retirer",
    "settings.extraParams.description": "Séparés par des virgules, en plus de la liste intégrée des traceurs courants.",
    "settings.extraParams.placeholder": "ref, source"
  },
  ja: {
    "settings.extraParams": "追加で削除するパラメーター",
    "settings.extraParams.description": "カンマ区切りで指定します。よくあるトラッカーの組み込みリストに加えて削除されます。",
    "settings.extraParams.placeholder": "ref, source"
  },
  pl: {
    "settings.extraParams": "Dodatkowe parametry do usunięcia",
    "settings.extraParams.description": "Oddzielone przecinkami, oprócz wbudowanej listy popularnych trackerów.",
    "settings.extraParams.placeholder": "ref, source"
  },
  "pt-BR": {
    "settings.extraParams": "Parâmetros extras para remover",
    "settings.extraParams.description": "Separados por vírgula, além da lista integrada de rastreadores comuns.",
    "settings.extraParams.placeholder": "ref, source"
  },
  ru: {
    "settings.extraParams": "Дополнительные параметры для удаления",
    "settings.extraParams.description": "Через запятую, помимо встроенного списка распространённых трекеров.",
    "settings.extraParams.placeholder": "ref, source"
  },
  tr: {
    "settings.extraParams": "Kaldırılacak ek parametreler",
    "settings.extraParams.description": "Virgülle ayırın; yaygın izleyicilerin yerleşik listesine ek olarak uygulanır.",
    "settings.extraParams.placeholder": "ref, source"
  }
});

// plugins/clear-urls/index.ts
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
var clear_urls_default = import_api2.definePlugin({
  settings: {
    extraParams: {
      type: "string",
      get label() {
        return t("settings.extraParams");
      },
      get description() {
        return t("settings.extraParams.description");
      },
      get placeholder() {
        return t("settings.extraParams.placeholder");
      },
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
    const actions = import_api2.filters.byProps("sendMessage", "editMessage");
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
