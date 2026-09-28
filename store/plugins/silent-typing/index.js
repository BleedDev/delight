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

// plugins/silent-typing/index.tsx
var exports_silent_typing = {};
__export(exports_silent_typing, {
  default: () => silent_typing_default
});
module.exports = __toCommonJS(exports_silent_typing);
var import_api2 = require("@evi/api");

// plugins/silent-typing/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.enabled": "Enabled",
    "settings.enabled.description": "Hide your typing indicator from others. /silenttyping toggles this.",
    "settings.showButton": "Chat bar button",
    "settings.showButton.description": "A keyboard button in the chat bar that toggles it.",
    "toast.on": "Silent typing is on: others won't see you typing.",
    "toast.off": "Silent typing is off.",
    "button.on": "Silent typing on (click to turn off)",
    "button.off": "Silent typing off (click to turn on)",
    "command.description": "Turn silent typing on or off"
  },
  de: {
    "settings.enabled": "Aktiviert",
    "settings.enabled.description": "Blendet deine Tippanzeige für andere aus. /silenttyping schaltet das um.",
    "settings.showButton": "Button in der Chatleiste",
    "settings.showButton.description": "Ein Tastatur-Button in der Chatleiste zum Umschalten.",
    "toast.on": "Leises Tippen ist an: Andere sehen nicht, dass du tippst.",
    "toast.off": "Leises Tippen ist aus.",
    "button.on": "Leises Tippen an (zum Ausschalten klicken)",
    "button.off": "Leises Tippen aus (zum Einschalten klicken)",
    "command.description": "Leises Tippen ein- oder ausschalten"
  },
  es: {
    "settings.enabled": "Activado",
    "settings.enabled.description": "Oculta tu indicador de escritura a los demás. /silenttyping lo activa o desactiva.",
    "settings.showButton": "Botón en la barra de chat",
    "settings.showButton.description": "Un botón de teclado en la barra de chat para activarlo o desactivarlo.",
    "toast.on": "Escritura silenciosa activada: los demás no verán que estás escribiendo.",
    "toast.off": "Escritura silenciosa desactivada.",
    "button.on": "Escritura silenciosa activada (clic para desactivar)",
    "button.off": "Escritura silenciosa desactivada (clic para activar)",
    "command.description": "Activa o desactiva la escritura silenciosa"
  },
  fr: {
    "settings.enabled": "Activé",
    "settings.enabled.description": "Masque votre indicateur de saisie aux autres. /silenttyping l'active ou le désactive.",
    "settings.showButton": "Bouton dans la barre de discussion",
    "settings.showButton.description": "Un bouton clavier dans la barre de discussion pour l'activer ou le désactiver.",
    "toast.on": "Saisie silencieuse activée : les autres ne verront pas que vous écrivez.",
    "toast.off": "Saisie silencieuse désactivée.",
    "button.on": "Saisie silencieuse activée (cliquez pour désactiver)",
    "button.off": "Saisie silencieuse désactivée (cliquez pour activer)",
    "command.description": "Activer ou désactiver la saisie silencieuse"
  },
  ja: {
    "settings.enabled": "有効",
    "settings.enabled.description": "入力中の表示を他の人に見せません。/silenttyping で切り替えられます。",
    "settings.showButton": "チャットバーのボタン",
    "settings.showButton.description": "チャットバーに切り替え用のキーボードボタンを表示します。",
    "toast.on": "サイレント入力をオンにしました。入力中であることは他の人に表示されません。",
    "toast.off": "サイレント入力をオフにしました。",
    "button.on": "サイレント入力オン(クリックでオフ)",
    "button.off": "サイレント入力オフ(クリックでオン)",
    "command.description": "サイレント入力のオン/オフを切り替えます"
  },
  pl: {
    "settings.enabled": "Włączone",
    "settings.enabled.description": "Ukrywa przed innymi twój wskaźnik pisania. /silenttyping przełącza tę funkcję.",
    "settings.showButton": "Przycisk na pasku czatu",
    "settings.showButton.description": "Przycisk klawiatury na pasku czatu, który to przełącza.",
    "toast.on": "Ciche pisanie włączone: inni nie zobaczą, że piszesz.",
    "toast.off": "Ciche pisanie wyłączone.",
    "button.on": "Ciche pisanie włączone (kliknij, aby wyłączyć)",
    "button.off": "Ciche pisanie wyłączone (kliknij, aby włączyć)",
    "command.description": "Włącz lub wyłącz ciche pisanie"
  },
  "pt-BR": {
    "settings.enabled": "Ativado",
    "settings.enabled.description": "Esconde seu indicador de digitação dos outros. /silenttyping liga ou desliga.",
    "settings.showButton": "Botão na barra de chat",
    "settings.showButton.description": "Um botão de teclado na barra de chat para ligar ou desligar.",
    "toast.on": "Digitação silenciosa ligada: os outros não vão ver que você está digitando.",
    "toast.off": "Digitação silenciosa desligada.",
    "button.on": "Digitação silenciosa ligada (clique para desligar)",
    "button.off": "Digitação silenciosa desligada (clique para ligar)",
    "command.description": "Liga ou desliga a digitação silenciosa"
  },
  ru: {
    "settings.enabled": "Включено",
    "settings.enabled.description": "Скрывает от других ваш индикатор набора текста. Переключается командой /silenttyping.",
    "settings.showButton": "Кнопка в строке чата",
    "settings.showButton.description": "Кнопка с клавиатурой в строке чата для переключения.",
    "toast.on": "Тихий набор включён: другие не увидят, что вы печатаете.",
    "toast.off": "Тихий набор выключен.",
    "button.on": "Тихий набор включён (нажмите, чтобы выключить)",
    "button.off": "Тихий набор выключен (нажмите, чтобы включить)",
    "command.description": "Включить или выключить тихий набор"
  },
  tr: {
    "settings.enabled": "Etkin",
    "settings.enabled.description": "Yazıyor göstergenizi başkalarından gizler. /silenttyping ile açıp kapatabilirsiniz.",
    "settings.showButton": "Sohbet çubuğu düğmesi",
    "settings.showButton.description": "Sohbet çubuğunda açıp kapatmak için bir klavye düğmesi.",
    "toast.on": "Sessiz yazma açık: diğerleri yazdığınızı görmeyecek.",
    "toast.off": "Sessiz yazma kapalı.",
    "button.on": "Sessiz yazma açık (kapatmak için tıklayın)",
    "button.off": "Sessiz yazma kapalı (açmak için tıklayın)",
    "command.description": "Sessiz yazmayı aç veya kapat"
  }
});

// plugins/silent-typing/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var typingActions = import_api2.filters.byProps("startTyping", "stopTyping");
var chatButtonFilter = import_api2.filters.componentByCode("CHAT_INPUT_BUTTON_NOTIFICATION", "sparkle");
var settings = {
  enabled: {
    type: "boolean",
    get label() {
      return t("settings.enabled");
    },
    get description() {
      return t("settings.enabled.description");
    },
    default: true
  },
  showButton: {
    type: "boolean",
    get label() {
      return t("settings.showButton");
    },
    get description() {
      return t("settings.showButton.description");
    },
    default: true
  }
};
var context;
function toggle() {
  if (!context)
    return "";
  const enabled = !context.settings.get("enabled");
  context.settings.set("enabled", enabled);
  return t(enabled ? "toast.on" : "toast.off");
}
function lookup(search) {
  let value;
  let missedAt = -Infinity;
  return () => {
    if (value !== undefined || performance.now() - missedAt < 1e4)
      return value;
    value = search();
    if (value === undefined)
      missedAt = performance.now();
    return value;
  };
}
var getContainerClass = lookup(() => Object.values(import_api2.find((v) => typeof v === "object" && Object.values(v).some((c) => typeof c === "string" && c.startsWith("channelAppLauncherButtonPopoutIconAnimation_"))) ?? {}).find((c) => typeof c === "string" && c.startsWith("buttonContainer_")));
var getChatButton = lookup(() => import_api2.find(chatButtonFilter));
function KeyboardIcon({ off }) {
  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("mask", {
        id: "dl-silent-typing-slash",
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
        mask: off ? "url(#dl-silent-typing-slash)" : undefined,
        d: "M3 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H3Zm2 3h2v2H5V9Zm4 0h2v2H9V9Zm4 0h2v2h-2V9Zm4 0h2v2h-2V9ZM5 13h2v2H5v-2Zm4 0h6v2H9v-2Zm8 0h2v2h-2v-2Z"
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
function SilentTypingButton() {
  const { enabled } = context.settings.use();
  const label = t(enabled ? "button.on" : "button.off");
  const ChatButton = getChatButton();
  const icon = /* @__PURE__ */ jsx_runtime.jsx(KeyboardIcon, {
    off: enabled
  });
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: getContainerClass(),
    "data-evi-silent-typing": enabled ? "on" : "off",
    children: ChatButton ? /* @__PURE__ */ jsx_runtime.jsx(ChatButton, {
      onClick: toggle,
      isActive: enabled,
      "aria-label": label,
      sparkle: false,
      children: icon
    }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
      type: "button",
      className: "dl-silent-typing-fallback",
      onClick: toggle,
      "aria-label": label,
      "aria-pressed": enabled,
      children: icon
    })
  });
}
var silent_typing_default = import_api2.definePlugin({
  settings,
  patches: [{
    find: '"ChannelTextAreaButtons"',
    replace: {
      match: /(?<=[,(])0===(\i)\.length(?=\)\?null:\(0,\i\.jsxs?\)\("div",\{className:\i\.\i,children:\1\}\))/,
      with: "($self?.injectButton?.($1,arguments[0]),0===$1.length)"
    }
  }],
  injectButton(buttons, props) {
    try {
      if (!context?.settings.get("showButton") || !Array.isArray(buttons) || props?.channel?.id == null)
        return;
      const button = /* @__PURE__ */ jsx_runtime.jsx(SilentTypingButton, {}, "evi-silent-typing");
      const submit = buttons.findIndex((b) => b?.key === "submit");
      if (submit < 0)
        buttons.push(button);
      else
        buttons.splice(submit, 0, button);
    } catch (err) {
      context?.logger.error("Couldn't add the chat bar button", err);
    }
  },
  SilentTypingButton,
  toggle,
  css: `
        .dl-silent-typing-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 4px;
            background: none; border: 0; cursor: pointer; color: var(--interactive-normal); }
        .dl-silent-typing-fallback:hover, .dl-silent-typing-fallback[aria-pressed="true"] { color: var(--interactive-active); }
    `,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => void (context = undefined));
    ctx.hookExport("instead", typingActions, "startTyping", (call) => {
      if (!ctx.settings.get("enabled"))
        return call.callOriginal(...call.args);
    });
    ctx.settings.onChange(({ enabled }) => {
      if (!enabled)
        return;
      const channelId = import_api2.getStore("SelectedChannelStore")?.getChannelId?.();
      if (channelId)
        import_api2.find(typingActions)?.stopTyping(channelId);
    });
    ctx.command({
      name: "silenttyping",
      get description() {
        return t("command.description");
      },
      execute: () => ({ ephemeral: toggle() })
    });
  }
});
