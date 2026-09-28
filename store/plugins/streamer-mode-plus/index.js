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

// plugins/streamer-mode-plus/index.ts
var exports_streamer_mode_plus = {};
__export(exports_streamer_mode_plus, {
  default: () => streamer_mode_plus_default
});
module.exports = __toCommonJS(exports_streamer_mode_plus);
var import_api2 = require("@evi/api");

// plugins/streamer-mode-plus/state.ts
function autoActive(mode, state) {
  switch (mode) {
    case "always":
      return true;
    case "streaming":
      return state.streaming;
    case "streamerMode":
      return state.streamerMode;
    case "either":
      return state.streaming || state.streamerMode;
    default:
      return false;
  }
}
function shouldActivate(mode, state, override = null) {
  if (override === "on")
    return true;
  if (override === "off")
    return false;
  return autoActive(mode, state);
}
function toggledOverride(currentlyActive) {
  return currentlyActive ? "off" : "on";
}
var PREFIX = "evi-smp";
var ACTIVE_CLASS = `${PREFIX}-active`;
var IN_DM_CLASS = `${PREFIX}-in-dm`;
var HOVER_CLASS = `${PREFIX}-hover`;
var optionClass = (key) => `${PREFIX}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
var BLUR_KEYS = ["dms", "servers", "channels", "media", "chatAvatars", "members", "dmContent"];
var ALL_CLASSES = [ACTIVE_CLASS, IN_DM_CLASS, HOVER_CLASS, ...BLUR_KEYS.map(optionClass)];
function bodyClasses(active, options, inDm) {
  if (!active)
    return [];
  const classes = [ACTIVE_CLASS];
  for (const key of BLUR_KEYS)
    if (options[key])
      classes.push(optionClass(key));
  if (options.hoverReveal)
    classes.push(HOVER_CLASS);
  if (inDm && options.dmContent)
    classes.push(IN_DM_CLASS);
  return classes;
}
var SELECTORS = {
  dms: [
    'a[data-list-item-id^="private-channels-"][href^="/channels/@me/"]',
    '[class*="privateChannels_"] li:has(a[href^="/channels/@me/"])',
    '[data-list-item-id^="guildsnav___"][href^="/channels/@me/"]'
  ],
  servers: [
    '[data-list-item-id^="guildsnav___"]:not([data-list-item-id="guildsnav___home"]):not([data-list-item-id="guildsnav___create-join-button"]):not([data-list-item-id="guildsnav___guild-discover-button"]):not([href^="/channels/@me"])',
    '[class*="guildHeader_"] [class*="name_"]',
    '[class*="guildBadgeAndName_"]',
    '[class*="bannerImage_"]',
    '[class*="communityInfo_"]'
  ],
  channels: [
    '[data-list-item-id^="channels___"]',
    'section[class*="title_"] h1',
    '[class*="titleWrapper_"]'
  ],
  media: [
    '[id^="message-accessories-"] [class*="visualMediaItemContainer_"]',
    '[id^="message-accessories-"] [class*="nonVisualMediaItemContainer_"]',
    '[id^="message-accessories-"] [class*="imageWrapper_"]',
    '[id^="message-accessories-"] [class*="embedWrapper_"]',
    '[id^="message-accessories-"] article',
    '[id^="message-accessories-"] video',
    '[id^="message-accessories-"] [class*="clickableSticker_"]',
    'img[src*="cdn.discordapp.com/attachments/"]',
    'img[src*="media.discordapp.net/attachments/"]',
    'img[src*="images-ext-"][src*=".discordapp.net/external/"]',
    'video[src*="cdn.discordapp.com/attachments/"]'
  ],
  chatAvatars: [
    'li[id^="chat-messages-"] img[class*="avatar_"]',
    'li[id^="chat-messages-"] [class*="replyAvatar_"]',
    'li[id^="chat-messages-"] [class*="avatarDecoration_"]'
  ],
  members: [
    '[data-list-item-id^="members-"]',
    '[class*="membersWrap_"] [class*="member_"]',
    '[class*="voiceUser_"]'
  ],
  dmContent: [
    '[id^="message-content-"]',
    '[id^="message-username-"]',
    '[id^="message-reply-context-"]',
    'li[id^="chat-messages-"] img[class*="avatar_"]'
  ]
};
var clampBlur = (px) => Number.isFinite(px) ? Math.min(Math.max(Math.round(px), 1), 40) : 8;
function buildCss({ blur }) {
  const px = clampBlur(blur);
  const rules = [];
  const all = [];
  for (const key of BLUR_KEYS) {
    const scope = key === "dmContent" ? `body.${ACTIVE_CLASS}.${optionClass(key)}.${IN_DM_CLASS}` : `body.${ACTIVE_CLASS}.${optionClass(key)}`;
    const group = `:is(${SELECTORS[key].join(", ")})`;
    const target = `${scope} ${group}:not(${group} *)`;
    all.push(target);
    rules.push(`${target} { filter: blur(${px}px); }`);
    rules.push(`body.${HOVER_CLASS}${scope.slice(4)} ${group}:not(${group} *):is(:hover, :focus-within) { filter: none; }`);
  }
  return [
    `/* Streamer Mode+ */`,
    `:is(${all.join(", ")}) { transition: filter 0.18s ease-out; will-change: filter; }`,
    ...rules,
    `@media (prefers-reduced-motion: reduce) { :is(${all.join(", ")}) { transition: none; } }`
  ].join(`
`);
}
function parseHotkey(input) {
  const parts = input.split("+").map((p) => p.trim()).filter(Boolean);
  const hotkey = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === "ctrl" || p === "control")
      hotkey.ctrl = true;
    else if (p === "shift")
      hotkey.shift = true;
    else if (p === "alt" || p === "option")
      hotkey.alt = true;
    else if (p === "meta" || p === "cmd" || p === "command" || p === "win" || p === "super")
      hotkey.meta = true;
    else if (!hotkey.key)
      hotkey.key = p === "space" ? " " : p;
    else
      return;
  }
  return hotkey.key ? hotkey : undefined;
}
function migrateHotkey(value) {
  if (typeof value !== "string" || !value.trim())
    return "";
  const parts = value.split("+");
  const code = parts.at(-1);
  const modifiers = ["Ctrl", "Alt", "Shift", "Meta"];
  if (code.length > 1 && /^[A-Z]/.test(code) && !modifiers.includes(code) && parts.slice(0, -1).every((m) => modifiers.includes(m)))
    return value;
  const old = parseHotkey(value);
  if (!old)
    return "";
  let key;
  if (/^[a-z]$/.test(old.key))
    key = `Key${old.key.toUpperCase()}`;
  else if (/^[0-9]$/.test(old.key))
    key = `Digit${old.key}`;
  else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(old.key))
    key = old.key.toUpperCase();
  else if (old.key === " ")
    key = "Space";
  if (!key)
    return "";
  return [old.ctrl && "Ctrl", old.alt && "Alt", old.shift && "Shift", old.meta && "Meta", key].filter(Boolean).join("+");
}

// plugins/streamer-mode-plus/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.mode": "Turn on",
    "settings.mode.description": "When to blur. /streamerplus and the hotkey work in every mode.",
    "mode.either": "While streaming or in Streamer Mode",
    "mode.streaming": "While screen sharing or Go Live",
    "mode.streamerMode": "While Discord's Streamer Mode is on",
    "mode.always": "Always",
    "settings.hotkey": "Shortcut",
    "settings.hotkey.description": "Turns blurring on or off, anywhere in Discord.",
    "settings.hoverReveal": "Reveal on hover",
    "settings.hoverReveal.description": "Unblur something while the mouse is over it.",
    "settings.blur": "Blur strength",
    "settings.blur.description": "In pixels.",
    "settings.toasts": "Toasts",
    "settings.toasts.description": "A short notice when blurring turns on or off by itself.",
    "settings.dms": "DM list",
    "settings.dms.description": "Names, avatars and message previews in your DMs.",
    "settings.servers": "Servers",
    "settings.servers.description": "Server icons and names in the server list and header.",
    "settings.channels": "Channel names",
    "settings.channels.description": "The channel list and channel header.",
    "settings.media": "Images and embeds",
    "settings.media.description": "Images, videos, embeds, stickers and attachments in chat.",
    "settings.chatAvatars": "Avatars in chat",
    "settings.chatAvatars.description": "Profile pictures next to messages.",
    "settings.members": "Member list",
    "settings.members.description": "The member list and people in voice channels.",
    "settings.dmContent": "Messages in DMs",
    "settings.dmContent.description": "Message text and names while a DM is open.",
    "toast.manual.on": "Streamer Mode+ on",
    "toast.manual.off": "Streamer Mode+ off",
    "toast.streaming.on": "Streamer Mode+ on: you're streaming",
    "toast.streaming.off": "Streamer Mode+ off: stream ended",
    "toast.streamerMode.on": "Streamer Mode+ on: Streamer Mode is on",
    "toast.streamerMode.off": "Streamer Mode+ off: Streamer Mode is off",
    "command.description": "Turn Streamer Mode+ blurring on or off",
    "command.on": "Streamer Mode+ is on.",
    "command.off": "Streamer Mode+ is off."
  },
  de: {
    "settings.mode": "Einschalten",
    "settings.mode.description": "Wann verwischt wird. /streamerplus und das Tastenkürzel funktionieren in jedem Modus.",
    "mode.either": "Beim Streamen oder im Streamer-Modus",
    "mode.streaming": "Beim Bildschirmteilen oder bei „Live gehen“",
    "mode.streamerMode": "Solange der Streamer-Modus von Discord an ist",
    "mode.always": "Immer",
    "settings.hotkey": "Tastenkürzel",
    "settings.hotkey.description": "Schaltet das Verwischen überall in Discord ein oder aus.",
    "settings.hoverReveal": "Beim Darüberfahren aufdecken",
    "settings.hoverReveal.description": "Hebt die Unschärfe auf, solange die Maus darüber ist.",
    "settings.blur": "Stärke der Unschärfe",
    "settings.blur.description": "In Pixeln.",
    "settings.toasts": "Hinweise",
    "settings.toasts.description": "Ein kurzer Hinweis, wenn sich das Verwischen von selbst ein- oder ausschaltet.",
    "settings.dms": "DM-Liste",
    "settings.dms.description": "Namen, Avatare und Nachrichtenvorschauen in deinen Direktnachrichten.",
    "settings.servers": "Server",
    "settings.servers.description": "Servericons und -namen in der Serverliste und der Kopfzeile.",
    "settings.channels": "Kanalnamen",
    "settings.channels.description": "Die Kanalliste und die Kanalkopfzeile.",
    "settings.media": "Bilder und Einbettungen",
    "settings.media.description": "Bilder, Videos, Einbettungen, Sticker und Anhänge im Chat.",
    "settings.chatAvatars": "Avatare im Chat",
    "settings.chatAvatars.description": "Profilbilder neben Nachrichten.",
    "settings.members": "Mitgliederliste",
    "settings.members.description": "Die Mitgliederliste und Leute in Sprachkanälen.",
    "settings.dmContent": "Nachrichten in DMs",
    "settings.dmContent.description": "Nachrichtentext und Namen, während eine DM geöffnet ist.",
    "toast.manual.on": "Streamer Mode+ an",
    "toast.manual.off": "Streamer Mode+ aus",
    "toast.streaming.on": "Streamer Mode+ an: Du streamst",
    "toast.streaming.off": "Streamer Mode+ aus: Stream beendet",
    "toast.streamerMode.on": "Streamer Mode+ an: Streamer-Modus ist an",
    "toast.streamerMode.off": "Streamer Mode+ aus: Streamer-Modus ist aus",
    "command.description": "Verwischen von Streamer Mode+ ein- oder ausschalten",
    "command.on": "Streamer Mode+ ist an.",
    "command.off": "Streamer Mode+ ist aus."
  },
  es: {
    "settings.mode": "Activar",
    "settings.mode.description": "Cuándo difuminar. /streamerplus y el atajo funcionan en todos los modos.",
    "mode.either": "Al transmitir o en modo streamer",
    "mode.streaming": "Al compartir pantalla o transmitir en directo",
    "mode.streamerMode": "Mientras el modo streamer de Discord esté activado",
    "mode.always": "Siempre",
    "settings.hotkey": "Atajo",
    "settings.hotkey.description": "Activa o desactiva el difuminado en cualquier parte de Discord.",
    "settings.hoverReveal": "Mostrar al pasar el ratón",
    "settings.hoverReveal.description": "Quita el difuminado mientras el ratón está encima.",
    "settings.blur": "Intensidad del difuminado",
    "settings.blur.description": "En píxeles.",
    "settings.toasts": "Avisos",
    "settings.toasts.description": "Un aviso breve cuando el difuminado se activa o desactiva solo.",
    "settings.dms": "Lista de MD",
    "settings.dms.description": "Nombres, avatares y vistas previas de mensajes en tus MD.",
    "settings.servers": "Servidores",
    "settings.servers.description": "Iconos y nombres de servidores en la lista de servidores y el encabezado.",
    "settings.channels": "Nombres de canales",
    "settings.channels.description": "La lista de canales y el encabezado del canal.",
    "settings.media": "Imágenes y contenido incrustado",
    "settings.media.description": "Imágenes, vídeos, contenido incrustado, stickers y archivos adjuntos en el chat.",
    "settings.chatAvatars": "Avatares en el chat",
    "settings.chatAvatars.description": "Las fotos de perfil junto a los mensajes.",
    "settings.members": "Lista de miembros",
    "settings.members.description": "La lista de miembros y las personas en canales de voz.",
    "settings.dmContent": "Mensajes en MD",
    "settings.dmContent.description": "El texto y los nombres de los mensajes mientras hay un MD abierto.",
    "toast.manual.on": "Streamer Mode+ activado",
    "toast.manual.off": "Streamer Mode+ desactivado",
    "toast.streaming.on": "Streamer Mode+ activado: estás transmitiendo",
    "toast.streaming.off": "Streamer Mode+ desactivado: la transmisión terminó",
    "toast.streamerMode.on": "Streamer Mode+ activado: el modo streamer está activado",
    "toast.streamerMode.off": "Streamer Mode+ desactivado: el modo streamer está desactivado",
    "command.description": "Activa o desactiva el difuminado de Streamer Mode+",
    "command.on": "Streamer Mode+ está activado.",
    "command.off": "Streamer Mode+ está desactivado."
  },
  fr: {
    "settings.mode": "Activer",
    "settings.mode.description": "Quand flouter. /streamerplus et le raccourci fonctionnent dans tous les modes.",
    "mode.either": "Pendant un stream ou en mode streamer",
    "mode.streaming": "Pendant un partage d'écran ou un Go Live",
    "mode.streamerMode": "Quand le mode streamer de Discord est activé",
    "mode.always": "Toujours",
    "settings.hotkey": "Raccourci",
    "settings.hotkey.description": "Active ou désactive le floutage, partout dans Discord.",
    "settings.hoverReveal": "Afficher au survol",
    "settings.hoverReveal.description": "Retire le flou tant que la souris est dessus.",
    "settings.blur": "Intensité du flou",
    "settings.blur.description": "En pixels.",
    "settings.toasts": "Notifications",
    "settings.toasts.description": "Une courte notification quand le floutage s'active ou se désactive tout seul.",
    "settings.dms": "Liste des MP",
    "settings.dms.description": "Noms, avatars et aperçus des messages dans tes MP.",
    "settings.servers": "Serveurs",
    "settings.servers.description": "Icônes et noms des serveurs dans la liste des serveurs et l'en-tête.",
    "settings.channels": "Noms des salons",
    "settings.channels.description": "La liste des salons et l'en-tête du salon.",
    "settings.media": "Images et intégrations",
    "settings.media.description": "Images, vidéos, intégrations, stickers et pièces jointes dans le chat.",
    "settings.chatAvatars": "Avatars dans le chat",
    "settings.chatAvatars.description": "Les photos de profil à côté des messages.",
    "settings.members": "Liste des membres",
    "settings.members.description": "La liste des membres et les personnes dans les salons vocaux.",
    "settings.dmContent": "Messages dans les MP",
    "settings.dmContent.description": "Le texte et les noms des messages quand un MP est ouvert.",
    "toast.manual.on": "Streamer Mode+ activé",
    "toast.manual.off": "Streamer Mode+ désactivé",
    "toast.streaming.on": "Streamer Mode+ activé : tu es en stream",
    "toast.streaming.off": "Streamer Mode+ désactivé : le stream est terminé",
    "toast.streamerMode.on": "Streamer Mode+ activé : le mode streamer est activé",
    "toast.streamerMode.off": "Streamer Mode+ désactivé : le mode streamer est désactivé",
    "command.description": "Active ou désactive le floutage de Streamer Mode+",
    "command.on": "Streamer Mode+ est activé.",
    "command.off": "Streamer Mode+ est désactivé."
  },
  ja: {
    "settings.mode": "オンにするタイミング",
    "settings.mode.description": "ぼかしを有効にするタイミングです。/streamerplus とショートカットはどのモードでも使えます。",
    "mode.either": "配信中、または配信者モードのとき",
    "mode.streaming": "画面共有または Go Live 中",
    "mode.streamerMode": "Discord の配信者モードがオンのとき",
    "mode.always": "常に",
    "settings.hotkey": "ショートカット",
    "settings.hotkey.description": "Discord のどこからでもぼかしをオン・オフします。",
    "settings.hoverReveal": "カーソルを合わせて表示",
    "settings.hoverReveal.description": "マウスを重ねているあいだ、ぼかしを解除します。",
    "settings.blur": "ぼかしの強さ",
    "settings.blur.description": "ピクセル単位です。",
    "settings.toasts": "通知",
    "settings.toasts.description": "ぼかしが自動でオン・オフになったときに短く知らせます。",
    "settings.dms": "DM リスト",
    "settings.dms.description": "DM の名前、アバター、メッセージのプレビュー。",
    "settings.servers": "サーバー",
    "settings.servers.description": "サーバーリストとヘッダーのサーバーアイコンと名前。",
    "settings.channels": "チャンネル名",
    "settings.channels.description": "チャンネルリストとチャンネルのヘッダー。",
    "settings.media": "画像と埋め込み",
    "settings.media.description": "チャット内の画像、動画、埋め込み、スタンプ、添付ファイル。",
    "settings.chatAvatars": "チャットのアバター",
    "settings.chatAvatars.description": "メッセージの横のプロフィール画像。",
    "settings.members": "メンバーリスト",
    "settings.members.description": "メンバーリストと、ボイスチャンネルにいる人。",
    "settings.dmContent": "DM のメッセージ",
    "settings.dmContent.description": "DM を開いているときのメッセージ本文と名前。",
    "toast.manual.on": "Streamer Mode+ をオンにしました",
    "toast.manual.off": "Streamer Mode+ をオフにしました",
    "toast.streaming.on": "Streamer Mode+ をオンにしました：配信中です",
    "toast.streaming.off": "Streamer Mode+ をオフにしました：配信が終わりました",
    "toast.streamerMode.on": "Streamer Mode+ をオンにしました：配信者モードがオンです",
    "toast.streamerMode.off": "Streamer Mode+ をオフにしました：配信者モードがオフです",
    "command.description": "Streamer Mode+ のぼかしをオン・オフする",
    "command.on": "Streamer Mode+ はオンです。",
    "command.off": "Streamer Mode+ はオフです。"
  },
  pl: {
    "settings.mode": "Włączaj",
    "settings.mode.description": "Kiedy rozmywać. /streamerplus i skrót działają w każdym trybie.",
    "mode.either": "Podczas streamowania lub w trybie streamera",
    "mode.streaming": "Podczas udostępniania ekranu lub Go Live",
    "mode.streamerMode": "Gdy włączony jest tryb streamera Discorda",
    "mode.always": "Zawsze",
    "settings.hotkey": "Skrót",
    "settings.hotkey.description": "Włącza lub wyłącza rozmywanie w dowolnym miejscu Discorda.",
    "settings.hoverReveal": "Odsłaniaj po najechaniu",
    "settings.hoverReveal.description": "Usuwa rozmycie, gdy kursor jest nad elementem.",
    "settings.blur": "Siła rozmycia",
    "settings.blur.description": "W pikselach.",
    "settings.toasts": "Powiadomienia",
    "settings.toasts.description": "Krótka informacja, gdy rozmywanie włączy się lub wyłączy samo.",
    "settings.dms": "Lista wiadomości prywatnych",
    "settings.dms.description": "Nazwy, awatary i podglądy wiadomości w Twoich wiadomościach prywatnych.",
    "settings.servers": "Serwery",
    "settings.servers.description": "Ikony i nazwy serwerów na liście serwerów i w nagłówku.",
    "settings.channels": "Nazwy kanałów",
    "settings.channels.description": "Lista kanałów i nagłówek kanału.",
    "settings.media": "Obrazy i osadzone treści",
    "settings.media.description": "Obrazy, filmy, osadzone treści, naklejki i załączniki na czacie.",
    "settings.chatAvatars": "Awatary na czacie",
    "settings.chatAvatars.description": "Zdjęcia profilowe obok wiadomości.",
    "settings.members": "Lista członków",
    "settings.members.description": "Lista członków i osoby na kanałach głosowych.",
    "settings.dmContent": "Wiadomości prywatne",
    "settings.dmContent.description": "Treść wiadomości i nazwy, gdy otwarta jest wiadomość prywatna.",
    "toast.manual.on": "Streamer Mode+ włączony",
    "toast.manual.off": "Streamer Mode+ wyłączony",
    "toast.streaming.on": "Streamer Mode+ włączony: streamujesz",
    "toast.streaming.off": "Streamer Mode+ wyłączony: stream się zakończył",
    "toast.streamerMode.on": "Streamer Mode+ włączony: tryb streamera jest włączony",
    "toast.streamerMode.off": "Streamer Mode+ wyłączony: tryb streamera jest wyłączony",
    "command.description": "Włącz lub wyłącz rozmywanie Streamer Mode+",
    "command.on": "Streamer Mode+ jest włączony.",
    "command.off": "Streamer Mode+ jest wyłączony."
  },
  "pt-BR": {
    "settings.mode": "Ativar",
    "settings.mode.description": "Quando desfocar. /streamerplus e o atalho funcionam em todos os modos.",
    "mode.either": "Ao transmitir ou no modo streamer",
    "mode.streaming": "Ao compartilhar a tela ou transmitir ao vivo",
    "mode.streamerMode": "Enquanto o modo streamer do Discord estiver ativado",
    "mode.always": "Sempre",
    "settings.hotkey": "Atalho",
    "settings.hotkey.description": "Ativa ou desativa o desfoque em qualquer lugar do Discord.",
    "settings.hoverReveal": "Revelar ao passar o mouse",
    "settings.hoverReveal.description": "Tira o desfoque enquanto o mouse estiver em cima.",
    "settings.blur": "Intensidade do desfoque",
    "settings.blur.description": "Em pixels.",
    "settings.toasts": "Avisos",
    "settings.toasts.description": "Um aviso rápido quando o desfoque ativa ou desativa sozinho.",
    "settings.dms": "Lista de DMs",
    "settings.dms.description": "Nomes, avatares e prévias de mensagens nas suas DMs.",
    "settings.servers": "Servidores",
    "settings.servers.description": "Ícones e nomes de servidores na lista de servidores e no cabeçalho.",
    "settings.channels": "Nomes de canais",
    "settings.channels.description": "A lista de canais e o cabeçalho do canal.",
    "settings.media": "Imagens e incorporações",
    "settings.media.description": "Imagens, vídeos, incorporações, figurinhas e anexos no chat.",
    "settings.chatAvatars": "Avatares no chat",
    "settings.chatAvatars.description": "As fotos de perfil ao lado das mensagens.",
    "settings.members": "Lista de membros",
    "settings.members.description": "A lista de membros e as pessoas nos canais de voz.",
    "settings.dmContent": "Mensagens nas DMs",
    "settings.dmContent.description": "O texto e os nomes das mensagens enquanto uma DM estiver aberta.",
    "toast.manual.on": "Streamer Mode+ ativado",
    "toast.manual.off": "Streamer Mode+ desativado",
    "toast.streaming.on": "Streamer Mode+ ativado: você está transmitindo",
    "toast.streaming.off": "Streamer Mode+ desativado: a transmissão terminou",
    "toast.streamerMode.on": "Streamer Mode+ ativado: o modo streamer está ativado",
    "toast.streamerMode.off": "Streamer Mode+ desativado: o modo streamer está desativado",
    "command.description": "Ativa ou desativa o desfoque do Streamer Mode+",
    "command.on": "O Streamer Mode+ está ativado.",
    "command.off": "O Streamer Mode+ está desativado."
  },
  ru: {
    "settings.mode": "Когда включать",
    "settings.mode.description": "Когда размывать. Команда /streamerplus и сочетание клавиш работают в любом режиме.",
    "mode.either": "Во время стрима или в режиме стримера",
    "mode.streaming": "Во время демонстрации экрана или Go Live",
    "mode.streamerMode": "Пока включён режим стримера Discord",
    "mode.always": "Всегда",
    "settings.hotkey": "Сочетание клавиш",
    "settings.hotkey.description": "Включает или выключает размытие в любом месте Discord.",
    "settings.hoverReveal": "Показывать при наведении",
    "settings.hoverReveal.description": "Убирает размытие, пока курсор находится над элементом.",
    "settings.blur": "Сила размытия",
    "settings.blur.description": "В пикселях.",
    "settings.toasts": "Уведомления",
    "settings.toasts.description": "Короткое уведомление, когда размытие включается или выключается само.",
    "settings.dms": "Список личных сообщений",
    "settings.dms.description": "Имена, аватары и превью сообщений в ваших личных сообщениях.",
    "settings.servers": "Серверы",
    "settings.servers.description": "Значки и названия серверов в списке серверов и в заголовке.",
    "settings.channels": "Названия каналов",
    "settings.channels.description": "Список каналов и заголовок канала.",
    "settings.media": "Изображения и вложения",
    "settings.media.description": "Изображения, видео, встраиваемое содержимое, стикеры и вложения в чате.",
    "settings.chatAvatars": "Аватары в чате",
    "settings.chatAvatars.description": "Фото профиля рядом с сообщениями.",
    "settings.members": "Список участников",
    "settings.members.description": "Список участников и люди в голосовых каналах.",
    "settings.dmContent": "Сообщения в личных сообщениях",
    "settings.dmContent.description": "Текст сообщений и имена, пока открыт личный чат.",
    "toast.manual.on": "Streamer Mode+ включён",
    "toast.manual.off": "Streamer Mode+ выключен",
    "toast.streaming.on": "Streamer Mode+ включён: вы стримите",
    "toast.streaming.off": "Streamer Mode+ выключен: стрим закончился",
    "toast.streamerMode.on": "Streamer Mode+ включён: включён режим стримера",
    "toast.streamerMode.off": "Streamer Mode+ выключен: режим стримера выключен",
    "command.description": "Включить или выключить размытие Streamer Mode+",
    "command.on": "Streamer Mode+ включён.",
    "command.off": "Streamer Mode+ выключен."
  },
  tr: {
    "settings.mode": "Açılma zamanı",
    "settings.mode.description": "Ne zaman bulanıklaştırılacağı. /streamerplus ve kısayol her modda çalışır.",
    "mode.either": "Yayın yaparken veya Yayıncı Modu'nda",
    "mode.streaming": "Ekran paylaşırken veya Canlı Yayın'dayken",
    "mode.streamerMode": "Discord'un Yayıncı Modu açıkken",
    "mode.always": "Her zaman",
    "settings.hotkey": "Kısayol",
    "settings.hotkey.description": "Discord'un her yerinde bulanıklaştırmayı açar veya kapatır.",
    "settings.hoverReveal": "Üzerine gelince göster",
    "settings.hoverReveal.description": "Fare üzerindeyken bulanıklığı kaldırır.",
    "settings.blur": "Bulanıklık gücü",
    "settings.blur.description": "Piksel cinsinden.",
    "settings.toasts": "Bildirimler",
    "settings.toasts.description": "Bulanıklaştırma kendiliğinden açılıp kapandığında kısa bir bildirim.",
    "settings.dms": "DM listesi",
    "settings.dms.description": "DM'lerindeki adlar, avatarlar ve mesaj önizlemeleri.",
    "settings.servers": "Sunucular",
    "settings.servers.description": "Sunucu listesindeki ve başlıktaki sunucu simgeleri ve adları.",
    "settings.channels": "Kanal adları",
    "settings.channels.description": "Kanal listesi ve kanal başlığı.",
    "settings.media": "Görseller ve gömülü içerikler",
    "settings.media.description": "Sohbetteki görseller, videolar, gömülü içerikler, çıkartmalar ve ekler.",
    "settings.chatAvatars": "Sohbetteki avatarlar",
    "settings.chatAvatars.description": "Mesajların yanındaki profil resimleri.",
    "settings.members": "Üye listesi",
    "settings.members.description": "Üye listesi ve ses kanallarındaki kişiler.",
    "settings.dmContent": "DM'lerdeki mesajlar",
    "settings.dmContent.description": "Bir DM açıkken mesaj metni ve adlar.",
    "toast.manual.on": "Streamer Mode+ açık",
    "toast.manual.off": "Streamer Mode+ kapalı",
    "toast.streaming.on": "Streamer Mode+ açık: yayın yapıyorsun",
    "toast.streaming.off": "Streamer Mode+ kapalı: yayın bitti",
    "toast.streamerMode.on": "Streamer Mode+ açık: Yayıncı Modu açık",
    "toast.streamerMode.off": "Streamer Mode+ kapalı: Yayıncı Modu kapalı",
    "command.description": "Streamer Mode+ bulanıklaştırmasını aç veya kapat",
    "command.on": "Streamer Mode+ açık.",
    "command.off": "Streamer Mode+ kapalı."
  }
});

// plugins/streamer-mode-plus/index.ts
var settings = {
  mode: {
    type: "select",
    get label() {
      return t("settings.mode");
    },
    get description() {
      return t("settings.mode.description");
    },
    default: "either",
    options: [
      { get label() {
        return t("mode.either");
      }, value: "either" },
      { get label() {
        return t("mode.streaming");
      }, value: "streaming" },
      { get label() {
        return t("mode.streamerMode");
      }, value: "streamerMode" },
      { get label() {
        return t("mode.always");
      }, value: "always" }
    ]
  },
  hotkey: {
    type: "keybind",
    get label() {
      return t("settings.hotkey");
    },
    get description() {
      return t("settings.hotkey.description");
    },
    default: "Ctrl+Shift+KeyS"
  },
  hoverReveal: {
    type: "boolean",
    get label() {
      return t("settings.hoverReveal");
    },
    get description() {
      return t("settings.hoverReveal.description");
    },
    default: true
  },
  blur: {
    type: "number",
    get label() {
      return t("settings.blur");
    },
    get description() {
      return t("settings.blur.description");
    },
    default: 8,
    min: 2,
    max: 30,
    step: 1
  },
  toasts: {
    type: "boolean",
    get label() {
      return t("settings.toasts");
    },
    get description() {
      return t("settings.toasts.description");
    },
    default: true
  },
  dms: {
    type: "boolean",
    get label() {
      return t("settings.dms");
    },
    get description() {
      return t("settings.dms.description");
    },
    default: true
  },
  servers: {
    type: "boolean",
    get label() {
      return t("settings.servers");
    },
    get description() {
      return t("settings.servers.description");
    },
    default: true
  },
  channels: {
    type: "boolean",
    get label() {
      return t("settings.channels");
    },
    get description() {
      return t("settings.channels.description");
    },
    default: false
  },
  media: {
    type: "boolean",
    get label() {
      return t("settings.media");
    },
    get description() {
      return t("settings.media.description");
    },
    default: true
  },
  chatAvatars: {
    type: "boolean",
    get label() {
      return t("settings.chatAvatars");
    },
    get description() {
      return t("settings.chatAvatars.description");
    },
    default: false
  },
  members: {
    type: "boolean",
    get label() {
      return t("settings.members");
    },
    get description() {
      return t("settings.members.description");
    },
    default: false
  },
  dmContent: {
    type: "boolean",
    get label() {
      return t("settings.dmContent");
    },
    get description() {
      return t("settings.dmContent.description");
    },
    default: false
  }
};
var context;
var override = null;
var lastAuto;
var lastActive = false;
var applied = [];
function liveState() {
  let streaming = false;
  let streamerMode = false;
  try {
    streaming = import_api2.findStore("ApplicationStreamingStore")?.getCurrentUserActiveStream?.() != null;
  } catch {}
  try {
    streamerMode = !!import_api2.findStore("StreamerModeStore")?.enabled;
  } catch {}
  return { streaming, streamerMode };
}
function inDm() {
  try {
    const id = import_api2.findStore("SelectedChannelStore")?.getChannelId?.();
    if (!id)
      return false;
    const channel = import_api2.findStore("ChannelStore")?.getChannel?.(id);
    return channel?.type === 1 || channel?.type === 3 || !!channel?.isPrivate?.();
  } catch {
    return false;
  }
}
function options() {
  const s = context.settings.all;
  return {
    dms: s.dms,
    servers: s.servers,
    channels: s.channels,
    media: s.media,
    chatAvatars: s.chatAvatars,
    members: s.members,
    dmContent: s.dmContent,
    hoverReveal: s.hoverReveal
  };
}
function applyClasses(classes) {
  const body = document.body;
  for (const c of applied)
    if (!classes.includes(c))
      body.classList.remove(c);
  for (const c of classes)
    if (!body.classList.contains(c))
      body.classList.add(c);
  applied = classes;
}
function update(manual = false, quiet = false) {
  if (!context)
    return;
  const mode = context.settings.get("mode");
  const state = liveState();
  const auto = autoActive(mode, state);
  if (lastAuto !== undefined && auto !== lastAuto)
    override = null;
  const autoChanged = lastAuto !== undefined && auto !== lastAuto;
  lastAuto = auto;
  const active = shouldActivate(mode, state, override);
  applyClasses(bodyClasses(active, options(), inDm()));
  if (active !== lastActive && !quiet) {
    if (manual)
      context.toast(transitionMessage(active, "manual"), { type: "info" });
    else if (autoChanged && context.settings.get("toasts"))
      context.toast(transitionMessage(active, reasonFor(mode, state)), { type: "info" });
  }
  lastActive = active;
}
function transitionMessage(active, reason) {
  return t(`toast.${reason}.${active ? "on" : "off"}`);
}
function reasonFor(mode, state) {
  if (mode === "streaming" || mode === "streamerMode")
    return mode;
  return state.streaming || !state.streamerMode ? "streaming" : "streamerMode";
}
function toggle(quiet = false) {
  override = toggledOverride(lastActive);
  update(true, quiet);
  return lastActive;
}
var streamer_mode_plus_default = import_api2.definePlugin({
  settings,
  toggle,
  start(ctx) {
    context = ctx;
    override = null;
    lastAuto = undefined;
    lastActive = false;
    const style = ctx.addStyle(buildCss({ blur: ctx.settings.get("blur") }));
    ctx.settings.onChange((values) => {
      style.update(buildCss({ blur: values.blur }));
      update();
    });
    const onChange = () => update();
    const watched = ["ApplicationStreamingStore", "StreamerModeStore", "SelectedChannelStore"].map((name) => import_api2.findStore(name)).filter(Boolean);
    for (const store of watched)
      store.addChangeListener?.(onChange);
    ctx.onDispose(() => watched.forEach((store) => store.removeChangeListener?.(onChange)));
    for (const type of ["STREAM_START", "STREAM_STOP", "STREAM_DELETE", "STREAMER_MODE_UPDATE", "CHANNEL_SELECT"]) {
      ctx.flux.subscribe(type, () => queueMicrotask(onChange));
    }
    const hotkey = ctx.settings.get("hotkey");
    const migrated = migrateHotkey(hotkey);
    if (migrated !== hotkey)
      ctx.settings.set("hotkey", migrated);
    ctx.keybind("hotkey", () => void toggle());
    ctx.command({
      name: "streamerplus",
      get description() {
        return t("command.description");
      },
      execute() {
        const on = toggle(true);
        return { ephemeral: on ? t("command.on") : t("command.off") };
      }
    });
    ctx.onDispose(() => {
      for (const c of ALL_CLASSES)
        document.body.classList.remove(c);
      applied = [];
      context = undefined;
      override = null;
      lastAuto = undefined;
      lastActive = false;
    });
    update();
  }
});
