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

// plugins/volume-booster/index.ts
var exports_volume_booster = {};
__export(exports_volume_booster, {
  default: () => volume_booster_default
});
module.exports = __toCommonJS(exports_volume_booster);
var import_api2 = require("@evi/api");

// plugins/volume-booster/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.multiplier": "Volume limit",
    "settings.multiplier.description": "How far past Discord's 200% the slider goes: 2 is 400%, 5 is 1000%. Very high volumes clip and distort."
  },
  de: {
    "settings.multiplier": "Lautstärkegrenze",
    "settings.multiplier.description": "Wie weit der Regler über die 200 % von Discord hinausgeht: 2 sind 400 %, 5 sind 1000 %. Sehr hohe Lautstärken übersteuern und verzerren."
  },
  es: {
    "settings.multiplier": "Límite de volumen",
    "settings.multiplier.description": "Cuánto pasa el control deslizante del 200 % de Discord: 2 es 400 %, 5 es 1000 %. Los volúmenes muy altos saturan y distorsionan."
  },
  fr: {
    "settings.multiplier": "Limite de volume",
    "settings.multiplier.description": "Jusqu'où le curseur dépasse les 200 % de Discord : 2 donne 400 %, 5 donne 1000 %. Un volume très élevé sature et déforme le son."
  },
  ja: {
    "settings.multiplier": "音量の上限",
    "settings.multiplier.description": "スライダーをDiscordの200%からどこまで引き上げるか。2なら400%、5なら1000%。音量が大きすぎると音割れして歪みます。"
  },
  pl: {
    "settings.multiplier": "Limit głośności",
    "settings.multiplier.description": "O ile suwak wykracza poza 200% Discorda: 2 to 400%, 5 to 1000%. Bardzo wysoka głośność powoduje przesterowanie i zniekształcenia."
  },
  "pt-BR": {
    "settings.multiplier": "Limite de volume",
    "settings.multiplier.description": "Até onde o controle passa dos 200% do Discord: 2 é 400%, 5 é 1000%. Volumes muito altos estouram e distorcem o som."
  },
  ru: {
    "settings.multiplier": "Предел громкости",
    "settings.multiplier.description": "Насколько ползунок выходит за 200% в Discord: 2 — это 400%, 5 — 1000%. Очень высокая громкость приводит к искажениям и хрипам."
  },
  tr: {
    "settings.multiplier": "Ses sınırı",
    "settings.multiplier.description": "Kaydırıcının Discord'un %200 sınırının ne kadar ötesine geçeceği: 2, %400; 5, %1000 demektir. Çok yüksek sesler patlar ve bozulur."
  }
});

// plugins/volume-booster/volume.ts
var DISCORD_MAX = 200;
var DEFAULT_MULTIPLIER = 2;
var MIN_MULTIPLIER = 1;
var MAX_MULTIPLIER = 5;
function clampMultiplier(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n))
    return DEFAULT_MULTIPLIER;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, n));
}
function sliderMax(discordMax, multiplier) {
  if (typeof discordMax !== "number" || !Number.isFinite(discordMax))
    return discordMax;
  return Math.round(discordMax * clampMultiplier(multiplier));
}
function sliderToAmplitude(slider, base = 100) {
  if (slider === 0)
    return 0;
  const n = slider / base;
  return (n < 1 ? Math.pow(n, 2.8) : Math.pow(10, (n - 1) * 6 / 20)) * base;
}
var DISCORD_MAX_AMPLITUDE = sliderToAmplitude(DISCORD_MAX);
function clampSynced(volume) {
  return typeof volume === "number" && volume > DISCORD_MAX ? DISCORD_MAX : volume;
}
function keepBoosted(local, synced) {
  return typeof local === "number" && local > DISCORD_MAX && synced === DISCORD_MAX;
}
var guard = (fn, ...args) => `($self?.${fn}?.(${args.join(",")})??${args[0]})`;
var PATCHES = {
  userVolumeMenu: {
    find: '"user-volume",label:',
    replace: {
      match: /(?<=maxValue:\i\.isPlatformEmbedded\?)([^:,]+)(?=:)/,
      with: guard("sliderMax", "$1")
    }
  },
  streamTile: {
    find: "isPlatformEmbedded?200:100,onValueChange",
    replace: {
      match: /(?<=maxValue:\i\.isPlatformEmbedded\?)(200)(?=:100,onValueChange)/,
      with: guard("sliderMax", "$1")
    }
  },
  syncWrite: {
    find: "AudioContextSettingsMigrated",
    replace: [
      {
        match: /(?<=localVolumes\)\)\i\[\i\]=\{[^}]*?volume:)\(0,\i\.\i\)\(\i,\i\)/,
        with: guard("clampSynced", "$&")
      },
      {
        match: /(?<=isLocalMute\(\i,\i\),volume:)(\i)(?=\}\))/,
        with: guard("clampSynced", "$1")
      },
      {
        match: /(?<=\(0,\i\.\i\)\(\i,\i,\{volume:)(\i)(?=\})/,
        with: guard("clampSynced", "$1")
      }
    ]
  },
  syncRead: {
    find: "audioContextSettings??{user:{},stream:{}}",
    replace: {
      match: /(\i)\.volume!==(\i)\?(\i)\[(\i)\]=\1\.volume:delete \3\[\4\],(\i\.eachConnection\(\i=>\{\i\.setLocalVolume\(\4,)\1\.volume\)/,
      with: "($self?.keepBoosted?.($3[$4],$1.volume)||($1.volume!==$2?$3[$4]=$1.volume:delete $3[$4])),$5$3[$4]??$2)"
    }
  }
};

// plugins/volume-booster/index.ts
var audioActions = import_api2.filters.byProps("setLocalVolume", "toggleLocalMute", "toggleSelfDeaf");
var running = false;
var multiplier = DEFAULT_MULTIPLIER;
function resetBoosted() {
  try {
    const state = import_api2.getStore("MediaEngineStore")?.getState?.();
    const actions = import_api2.find(audioActions);
    if (!state?.settingsByContext || !actions)
      return;
    for (const [context, settings] of Object.entries(state.settingsByContext)) {
      for (const [userId, volume] of Object.entries(settings?.localVolumes ?? {})) {
        if (typeof volume === "number" && volume > DISCORD_MAX_AMPLITUDE)
          actions.setLocalVolume(userId, DISCORD_MAX_AMPLITUDE, context);
      }
    }
  } catch {}
}
var volume_booster_default = import_api2.definePlugin({
  settings: {
    multiplier: {
      type: "number",
      get label() {
        return t("settings.multiplier");
      },
      get description() {
        return t("settings.multiplier.description");
      },
      default: DEFAULT_MULTIPLIER,
      min: MIN_MULTIPLIER,
      max: MAX_MULTIPLIER,
      step: 0.5
    }
  },
  patches: [PATCHES.userVolumeMenu, PATCHES.streamTile, PATCHES.syncWrite, PATCHES.syncRead],
  sliderMax: (discordMax) => running ? sliderMax(discordMax, multiplier) : discordMax,
  clampSynced,
  keepBoosted: (local, synced) => running && keepBoosted(local, synced),
  start(ctx) {
    multiplier = clampMultiplier(ctx.settings.get("multiplier"));
    running = true;
    ctx.settings.onChange((values) => void (multiplier = clampMultiplier(values.multiplier)));
    ctx.onDispose(() => {
      running = false;
      resetBoosted();
    });
  }
});
