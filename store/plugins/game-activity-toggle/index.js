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
var import_api2 = require("@evi/api");

// plugins/game-activity-toggle/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.showButton": "User panel button",
    "settings.showButton.description": "A gamepad button next to mute and deafen. /gameactivity works either way.",
    "settings.shortcut": "Shortcut",
    "settings.shortcut.description": "Shows or hides your game activity from anywhere in Discord.",
    "button.hide": "Hide game activity",
    "button.show": "Show game activity",
    "toast.shown": "Game activity is visible: others can see what you're playing.",
    "toast.hidden": "Game activity is hidden: others won't see what you're playing.",
    "toast.failed": "Couldn't change your game activity setting",
    "command.description": "Show or hide the game you're playing"
  },
  de: {
    "settings.showButton": "Button in der Benutzerleiste",
    "settings.showButton.description": "Ein Controller-Button neben Stummschalten und Ton aus. /gameactivity funktioniert in beiden Fällen.",
    "settings.shortcut": "Tastenkürzel",
    "settings.shortcut.description": "Zeigt oder verbirgt deine Spielaktivität von überall in Discord aus.",
    "button.hide": "Spielaktivität ausblenden",
    "button.show": "Spielaktivität anzeigen",
    "toast.shown": "Spielaktivität ist sichtbar: Andere sehen, was du spielst.",
    "toast.hidden": "Spielaktivität ist ausgeblendet: Andere sehen nicht, was du spielst.",
    "toast.failed": "Deine Einstellung für die Spielaktivität konnte nicht geändert werden",
    "command.description": "Das Spiel, das du gerade spielst, anzeigen oder ausblenden"
  },
  es: {
    "settings.showButton": "Botón del panel de usuario",
    "settings.showButton.description": "Un botón de mando junto a silenciar y ensordecer. /gameactivity funciona con o sin él.",
    "settings.shortcut": "Atajo",
    "settings.shortcut.description": "Muestra u oculta tu actividad de juego desde cualquier parte de Discord.",
    "button.hide": "Ocultar actividad de juego",
    "button.show": "Mostrar actividad de juego",
    "toast.shown": "La actividad de juego es visible: los demás pueden ver a qué juegas.",
    "toast.hidden": "La actividad de juego está oculta: los demás no verán a qué juegas.",
    "toast.failed": "No se pudo cambiar el ajuste de actividad de juego",
    "command.description": "Muestra u oculta el juego al que estás jugando"
  },
  fr: {
    "settings.showButton": "Bouton du panneau utilisateur",
    "settings.showButton.description": "Un bouton manette à côté de muet et sourdine. /gameactivity fonctionne dans les deux cas.",
    "settings.shortcut": "Raccourci",
    "settings.shortcut.description": "Affiche ou masque ton activité de jeu depuis n'importe où dans Discord.",
    "button.hide": "Masquer l'activité de jeu",
    "button.show": "Afficher l'activité de jeu",
    "toast.shown": "L'activité de jeu est visible : les autres voient à quoi tu joues.",
    "toast.hidden": "L'activité de jeu est masquée : les autres ne voient pas à quoi tu joues.",
    "toast.failed": "Impossible de modifier le paramètre d'activité de jeu",
    "command.description": "Affiche ou masque le jeu auquel tu joues"
  },
  ja: {
    "settings.showButton": "ユーザーパネルのボタン",
    "settings.showButton.description": "ミュートとスピーカーミュートの横にゲームパッドのボタンを表示します。ボタンがなくても /gameactivity は使えます。",
    "settings.shortcut": "ショートカット",
    "settings.shortcut.description": "Discordのどこからでもゲームアクティビティの表示と非表示を切り替えます。",
    "button.hide": "ゲームアクティビティを非表示にする",
    "button.show": "ゲームアクティビティを表示する",
    "toast.shown": "ゲームアクティビティを表示中: 遊んでいるゲームが他の人に見えます。",
    "toast.hidden": "ゲームアクティビティを非表示にしました: 遊んでいるゲームは他の人に見えません。",
    "toast.failed": "ゲームアクティビティの設定を変更できませんでした",
    "command.description": "プレイ中のゲームの表示と非表示を切り替えます"
  },
  pl: {
    "settings.showButton": "Przycisk w panelu użytkownika",
    "settings.showButton.description": "Przycisk pada obok wyciszenia mikrofonu i dźwięku. /gameactivity działa tak czy inaczej.",
    "settings.shortcut": "Skrót",
    "settings.shortcut.description": "Pokazuje lub ukrywa twoją aktywność w grze z dowolnego miejsca w Discordzie.",
    "button.hide": "Ukryj aktywność w grze",
    "button.show": "Pokaż aktywność w grze",
    "toast.shown": "Aktywność w grze jest widoczna: inni widzą, w co grasz.",
    "toast.hidden": "Aktywność w grze jest ukryta: inni nie widzą, w co grasz.",
    "toast.failed": "Nie udało się zmienić ustawienia aktywności w grze",
    "command.description": "Pokaż lub ukryj grę, w którą grasz"
  },
  "pt-BR": {
    "settings.showButton": "Botão no painel do usuário",
    "settings.showButton.description": "Um botão de controle ao lado de silenciar e ensurdecer. O /gameactivity funciona de qualquer jeito.",
    "settings.shortcut": "Atalho",
    "settings.shortcut.description": "Mostra ou oculta sua atividade de jogo de qualquer lugar no Discord.",
    "button.hide": "Ocultar atividade de jogo",
    "button.show": "Mostrar atividade de jogo",
    "toast.shown": "A atividade de jogo está visível: os outros podem ver o que você está jogando.",
    "toast.hidden": "A atividade de jogo está oculta: os outros não vão ver o que você está jogando.",
    "toast.failed": "Não foi possível alterar a configuração de atividade de jogo",
    "command.description": "Mostra ou oculta o jogo que você está jogando"
  },
  ru: {
    "settings.showButton": "Кнопка в панели пользователя",
    "settings.showButton.description": "Кнопка с геймпадом рядом с кнопками отключения микрофона и звука. Команда /gameactivity работает и без неё.",
    "settings.shortcut": "Сочетание клавиш",
    "settings.shortcut.description": "Показывает или скрывает вашу игровую активность из любого места в Discord.",
    "button.hide": "Скрыть игровую активность",
    "button.show": "Показать игровую активность",
    "toast.shown": "Игровая активность видна: другие видят, во что вы играете.",
    "toast.hidden": "Игровая активность скрыта: другие не видят, во что вы играете.",
    "toast.failed": "Не удалось изменить настройку игровой активности",
    "command.description": "Показать или скрыть игру, в которую вы играете"
  },
  tr: {
    "settings.showButton": "Kullanıcı paneli düğmesi",
    "settings.showButton.description": "Mikrofonu ve sesi kapatma düğmelerinin yanında bir oyun kolu düğmesi. /gameactivity her durumda çalışır.",
    "settings.shortcut": "Kısayol",
    "settings.shortcut.description": "Discord'un herhangi bir yerinden oyun etkinliğini gösterir veya gizler.",
    "button.hide": "Oyun etkinliğini gizle",
    "button.show": "Oyun etkinliğini göster",
    "toast.shown": "Oyun etkinliği görünür: diğerleri ne oynadığını görebilir.",
    "toast.hidden": "Oyun etkinliği gizli: diğerleri ne oynadığını görmez.",
    "toast.failed": "Oyun etkinliği ayarın değiştirilemedi",
    "command.description": "Oynadığın oyunu gösterir veya gizler"
  }
});

// plugins/game-activity-toggle/toggle.ts
function readShowCurrentGame(protoSettings) {
  const value = protoSettings?.status?.showCurrentGame?.value;
  return typeof value === "boolean" ? value : true;
}
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
  showButton: { type: "boolean", get label() {
    return t("settings.showButton");
  }, get description() {
    return t("settings.showButton.description");
  }, default: true },
  shortcut: { type: "keybind", get label() {
    return t("settings.shortcut");
  }, get description() {
    return t("settings.shortcut.description");
  }, default: "" }
};
var context;
var showCurrentGame;
var protoStore = () => import_api2.findStore("UserSettingsProtoStore");
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
  const creators = import_api2.find((v) => typeof v?.updateAsync === "function" && v?.ProtoClass?.typeName === PRELOADED);
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
    context?.toast(t(next ? "toast.shown" : "toast.hidden"), { type: "success" });
  } catch (err) {
    context?.logger.error("Couldn't change the game activity setting", err);
    context?.toast(t("toast.failed"), { type: "failure" });
  } finally {
    busy = false;
  }
}
function subscribe(onChange) {
  const store = protoStore();
  store?.addChangeListener?.(onChange);
  return () => store?.removeChangeListener?.(onChange);
}
var useShown = () => import_api2.React.useSyncExternalStore(subscribe, isShown);
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
  const label = t(shown ? "button.hide" : "button.show");
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
  const Tooltip = import_api2.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text: label,
    position: "top",
    children: button
  }) : import_api2.React.cloneElement(button, { title: label });
}
var game_activity_toggle_default = import_api2.definePlugin({
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
      get description() {
        return t("command.description");
      },
      execute: () => void toggle()
    });
  }
});
