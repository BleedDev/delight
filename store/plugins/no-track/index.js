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
var import_api2 = require("@evi/api");

// plugins/no-track/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "counter.loading": "Counting blocked requests…",
    "counter.blocked": {
      one: "Blocked {count} tracking request since Discord started.",
      other: "Blocked {count} tracking requests since Discord started."
    }
  },
  de: {
    "counter.loading": "Blockierte Anfragen werden gezählt …",
    "counter.blocked": {
      one: "{count} Tracking-Anfrage seit dem Start von Discord blockiert.",
      other: "{count} Tracking-Anfragen seit dem Start von Discord blockiert."
    }
  },
  es: {
    "counter.loading": "Contando solicitudes bloqueadas…",
    "counter.blocked": {
      one: "{count} solicitud de rastreo bloqueada desde que se inició Discord.",
      other: "{count} solicitudes de rastreo bloqueadas desde que se inició Discord."
    }
  },
  fr: {
    "counter.loading": "Comptage des requêtes bloquées…",
    "counter.blocked": {
      one: "{count} requête de suivi bloquée depuis le lancement de Discord.",
      other: "{count} requêtes de suivi bloquées depuis le lancement de Discord."
    }
  },
  ja: {
    "counter.loading": "ブロックしたリクエストを集計中…",
    "counter.blocked": {
      other: "Discordの起動以降、トラッキングリクエストを{count}件ブロックしました。"
    }
  },
  pl: {
    "counter.loading": "Liczenie zablokowanych żądań…",
    "counter.blocked": {
      one: "Zablokowano {count} żądanie śledzące od uruchomienia Discorda.",
      few: "Zablokowano {count} żądania śledzące od uruchomienia Discorda.",
      many: "Zablokowano {count} żądań śledzących od uruchomienia Discorda.",
      other: "Zablokowano {count} żądania śledzącego od uruchomienia Discorda."
    }
  },
  "pt-BR": {
    "counter.loading": "Contando solicitações bloqueadas…",
    "counter.blocked": {
      one: "{count} solicitação de rastreamento bloqueada desde que o Discord foi iniciado.",
      other: "{count} solicitações de rastreamento bloqueadas desde que o Discord foi iniciado."
    }
  },
  ru: {
    "counter.loading": "Подсчёт заблокированных запросов…",
    "counter.blocked": {
      one: "Заблокирован {count} запрос отслеживания с момента запуска Discord.",
      few: "Заблокировано {count} запроса отслеживания с момента запуска Discord.",
      many: "Заблокировано {count} запросов отслеживания с момента запуска Discord.",
      other: "Заблокировано {count} запроса отслеживания с момента запуска Discord."
    }
  },
  tr: {
    "counter.loading": "Engellenen istekler sayılıyor…",
    "counter.blocked": {
      one: "Discord başladığından beri {count} izleme isteği engellendi.",
      other: "Discord başladığından beri {count} izleme isteği engellendi."
    }
  }
});

// plugins/no-track/index.tsx
var jsx_runtime = require("react/jsx-runtime");
function BlockedCounter({ ctx }) {
  import_api2.useLocale();
  const [count, setCount] = import_api2.React.useState(null);
  import_api2.React.useEffect(() => {
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
    children: count === null ? t("counter.loading") : t("counter.blocked", { count })
  });
}
var no_track_default = import_api2.definePlugin({
  settingsPanel: (ctx) => /* @__PURE__ */ jsx_runtime.jsx(BlockedCounter, {
    ctx
  })
});
