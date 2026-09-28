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

// plugins/friend-online-alerts/index.tsx
var exports_friend_online_alerts = {};
__export(exports_friend_online_alerts, {
  default: () => friend_online_alerts_default
});
module.exports = __toCommonJS(exports_friend_online_alerts);
var import_api2 = require("@evi/api");

// plugins/friend-online-alerts/alerts.ts
var DEFAULT_CONFIG = {
  online: true,
  offline: false,
  game: false,
  stream: false,
  flapMs: 5 * 60000,
  cooldownMs: 2 * 60000
};
var STARTUP_GRACE_MS = 15000;
var isOnlineStatus = (status) => status === "online" || status === "idle" || status === "dnd";
var ActivityType = { PLAYING: 0, STREAMING: 1 };
function snapshotOf(status, activities, goLive = false) {
  const online = isOnlineStatus(status);
  if (!online)
    return { online: false };
  const list = Array.isArray(activities) ? activities : [];
  const game = list.find((a) => a?.type === ActivityType.PLAYING && typeof a.name === "string" && a.name.trim())?.name?.trim();
  const streaming = goLive || list.some((a) => a?.type === ActivityType.STREAMING);
  return { online, game, streaming };
}

class AlertEngine {
  states = new Map;
  lastAlert = new Map;
  graceUntil = -Infinity;
  beginGrace(now, ms = STARTUP_GRACE_MS) {
    this.graceUntil = Math.max(this.graceUntil, now + ms);
  }
  inGrace(now) {
    return now < this.graceUntil;
  }
  get graceEnd() {
    return this.graceUntil;
  }
  seed(userId, snapshot, now) {
    this.observe(userId, snapshot, now, DEFAULT_CONFIG, true);
  }
  has(userId) {
    return this.states.has(userId);
  }
  forget(userId) {
    this.states.delete(userId);
    for (const key of [...this.lastAlert.keys()])
      if (key.startsWith(`${userId}:`))
        this.lastAlert.delete(key);
  }
  clear() {
    this.states.clear();
    this.lastAlert.clear();
  }
  observe(userId, next, now, config, silent = false) {
    const state = this.states.get(userId);
    const snapshot = next.online ? { online: true, game: next.game || undefined, streaming: !!next.streaming } : { online: false };
    if (!state) {
      this.states.set(userId, { snapshot });
      return [];
    }
    const prev = state.snapshot;
    state.snapshot = snapshot;
    const quiet = silent || this.inGrace(now);
    const alerts = [];
    if (!prev.online && snapshot.online) {
      const flapped = config.flapMs > 0 && state.offlineAt !== undefined && now - state.offlineAt < config.flapMs;
      state.silent = flapped;
      if (!quiet && !flapped && config.online)
        this.push(alerts, { kind: "online", userId, game: snapshot.game }, now, config);
      return alerts;
    }
    if (prev.online && !snapshot.online) {
      state.offlineAt = now;
      const wasSilent = state.silent;
      state.silent = false;
      if (!quiet && !wasSilent && config.offline)
        this.push(alerts, { kind: "offline", userId }, now, config);
      return alerts;
    }
    if (!snapshot.online || quiet)
      return alerts;
    if (config.game && snapshot.game && snapshot.game !== prev.game)
      this.push(alerts, { kind: "game", userId, game: snapshot.game }, now, config);
    if (config.stream && snapshot.streaming && !prev.streaming)
      this.push(alerts, { kind: "stream", userId, game: snapshot.game }, now, config);
    return alerts;
  }
  push(alerts, alert, now, config) {
    const key = `${alert.userId}:${alert.kind}`;
    const last = this.lastAlert.get(key);
    if (config.cooldownMs > 0 && last !== undefined && now - last < config.cooldownMs)
      return;
    this.lastAlert.set(key, now);
    alerts.push(alert);
  }
}
var shouldDeliver = (selfStatus, alertInDnd) => alertInDnd || selfStatus !== "dnd";
function isWatched(userId, watched, watchAllFriends, isFriend, selfId) {
  if (!userId || userId === selfId)
    return false;
  const has = Array.isArray(watched) ? watched.includes(userId) : watched.has(userId);
  return has || watchAllFriends && isFriend(userId);
}
function parseWatchList(value) {
  if (!Array.isArray(value))
    return [];
  const out = [];
  for (const id of value)
    if (typeof id === "string" && /^\d{15,25}$/.test(id) && !out.includes(id))
      out.push(id);
  return out;
}
function toggleWatch(list, userId) {
  return list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId];
}

// plugins/friend-online-alerts/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.watchAllFriends": "Watch all friends",
    "settings.watchAllFriends.description": "Alert for every friend, not only the people you pick.",
    "settings.showToast": "In-app toast",
    "settings.showToast.description": "A toast at the top of Discord.",
    "settings.showDesktop": "Desktop notification",
    "settings.showDesktop.description": "A Windows notification, like Discord's own. Clicking it opens the DM.",
    "settings.sound": "Sound",
    "settings.sound.description": "One of Discord's sounds.",
    "sound.none": "No sound",
    "sound.message1": "Message",
    "sound.message2": "Soft ping",
    "sound.message3": "Chime",
    "sound.mention1": "Mention",
    "sound.user_join": "User joined",
    "sound.stream_started": "Stream started",
    "sound.success": "Success",
    "settings.volume": "Sound volume",
    "settings.volume.description": "Percent.",
    "settings.alertInDnd": "Alert even in Do Not Disturb",
    "settings.alertInDnd.description": "Otherwise nothing shows or plays while your status is Do Not Disturb.",
    "settings.onOffline": "When they go offline",
    "settings.onGame": "When they start playing a game",
    "settings.onStream": "When they start streaming",
    "settings.flapMinutes": "Ignore reconnects (minutes)",
    "settings.flapMinutes.description": "Coming back online this soon after going offline isn't announced. 0 announces every time.",
    "settings.cooldownMinutes": "Cooldown per person (minutes)",
    "settings.cooldownMinutes.description": "At most one alert of each kind per person in this time. 0 turns it off.",
    "menu.alerts": "Online Alerts",
    "menu.alerts.subtext": "On for all friends",
    "toast.on": "Online alerts on for {name}",
    "toast.off": "Online alerts off for {name}",
    "alert.someone": "Someone",
    "alert.online": "is online",
    "alert.online.text": "{name} is online",
    "alert.onlineGame": "is online, playing {game}",
    "alert.onlineGame.text": "{name} is online, playing {game}",
    "alert.offline": "went offline",
    "alert.offline.text": "{name} went offline",
    "alert.game": "started playing {game}",
    "alert.game.text": "{name} started playing {game}",
    "alert.gameUnknown": "started playing a game",
    "alert.gameUnknown.text": "{name} started playing a game",
    "alert.stream": "started streaming",
    "alert.stream.text": "{name} started streaming",
    "alert.streamGame": "started streaming {game}",
    "alert.streamGame.text": "{name} started streaming {game}",
    "panel.watched": "Watched people",
    "panel.count": { one: "{count} person.", other: "{count} people." },
    "panel.countAll": { one: "{count} person, plus all your friends.", other: "{count} people, plus all your friends." },
    "panel.allFriends": "All your friends. Right-click anyone else and pick Online Alerts to add them.",
    "panel.nobody": "Nobody yet. Right-click someone and pick Online Alerts, or add a user ID here.",
    "panel.stop": "Stop watching {name}",
    "panel.remove": "Remove",
    "panel.userIdLabel": "User ID to watch",
    "panel.userIdPlaceholder": "User ID",
    "panel.add": "Add",
    "panel.recent": "Recent",
    "panel.recent.some": "Since Discord started. Kept in memory only.",
    "panel.recent.none": "No alerts yet. Kept in memory only.",
    "panel.clear": "Clear"
  },
  de: {
    "settings.watchAllFriends": "Alle Freunde beobachten",
    "settings.watchAllFriends.description": "Bei jedem Freund benachrichtigen, nicht nur bei den Leuten, die du auswählst.",
    "settings.showToast": "Hinweis in der App",
    "settings.showToast.description": "Ein Hinweis oben in Discord.",
    "settings.showDesktop": "Desktop-Benachrichtigung",
    "settings.showDesktop.description": "Eine Windows-Benachrichtigung wie bei Discord selbst. Ein Klick darauf öffnet die DM.",
    "settings.sound": "Sound",
    "settings.sound.description": "Einer der Discord-Sounds.",
    "sound.none": "Kein Sound",
    "sound.message1": "Nachricht",
    "sound.message2": "Sanfter Ping",
    "sound.message3": "Glockenspiel",
    "sound.mention1": "Erwähnung",
    "sound.user_join": "Nutzer beigetreten",
    "sound.stream_started": "Stream gestartet",
    "sound.success": "Erfolg",
    "settings.volume": "Lautstärke",
    "settings.volume.description": "Prozent.",
    "settings.alertInDnd": "Auch bei „Nicht stören“ benachrichtigen",
    "settings.alertInDnd.description": "Sonst wird nichts angezeigt oder abgespielt, solange dein Status „Nicht stören“ ist.",
    "settings.onOffline": "Wenn sie offline gehen",
    "settings.onGame": "Wenn sie ein Spiel starten",
    "settings.onStream": "Wenn sie einen Stream starten",
    "settings.flapMinutes": "Wiederverbindungen ignorieren (Minuten)",
    "settings.flapMinutes.description": "Wer kurz nach dem Offlinegehen wieder online kommt, wird nicht gemeldet. Bei 0 wird jedes Mal gemeldet.",
    "settings.cooldownMinutes": "Abklingzeit pro Person (Minuten)",
    "settings.cooldownMinutes.description": "Höchstens eine Benachrichtigung jeder Art pro Person in dieser Zeit. 0 schaltet das ab.",
    "menu.alerts": "Online-Benachrichtigungen",
    "menu.alerts.subtext": "Für alle Freunde aktiv",
    "toast.on": "Online-Benachrichtigungen für {name} aktiviert",
    "toast.off": "Online-Benachrichtigungen für {name} deaktiviert",
    "alert.someone": "Jemand",
    "alert.online": "ist online",
    "alert.online.text": "{name} ist online",
    "alert.onlineGame": "ist online und spielt {game}",
    "alert.onlineGame.text": "{name} ist online und spielt {game}",
    "alert.offline": "ist jetzt offline",
    "alert.offline.text": "{name} ist jetzt offline",
    "alert.game": "spielt jetzt {game}",
    "alert.game.text": "{name} spielt jetzt {game}",
    "alert.gameUnknown": "hat ein Spiel gestartet",
    "alert.gameUnknown.text": "{name} hat ein Spiel gestartet",
    "alert.stream": "streamt jetzt",
    "alert.stream.text": "{name} streamt jetzt",
    "alert.streamGame": "streamt jetzt {game}",
    "alert.streamGame.text": "{name} streamt jetzt {game}",
    "panel.watched": "Beobachtete Personen",
    "panel.count": { one: "{count} Person.", other: "{count} Personen." },
    "panel.countAll": { one: "{count} Person, dazu alle deine Freunde.", other: "{count} Personen, dazu alle deine Freunde." },
    "panel.allFriends": "Alle deine Freunde. Klicke andere mit der rechten Maustaste an und wähle „Online-Benachrichtigungen“, um sie hinzuzufügen.",
    "panel.nobody": "Noch niemand. Klicke jemanden mit der rechten Maustaste an und wähle „Online-Benachrichtigungen“ oder füge hier eine Nutzer-ID hinzu.",
    "panel.stop": "{name} nicht mehr beobachten",
    "panel.remove": "Entfernen",
    "panel.userIdLabel": "Zu beobachtende Nutzer-ID",
    "panel.userIdPlaceholder": "Nutzer-ID",
    "panel.add": "Hinzufügen",
    "panel.recent": "Zuletzt",
    "panel.recent.some": "Seit dem Start von Discord. Nur im Arbeitsspeicher gespeichert.",
    "panel.recent.none": "Noch keine Benachrichtigungen. Nur im Arbeitsspeicher gespeichert.",
    "panel.clear": "Leeren"
  },
  es: {
    "settings.watchAllFriends": "Vigilar a todos los amigos",
    "settings.watchAllFriends.description": "Avisar de cada amigo, no solo de las personas que elijas.",
    "settings.showToast": "Aviso en la app",
    "settings.showToast.description": "Un aviso en la parte superior de Discord.",
    "settings.showDesktop": "Notificación de escritorio",
    "settings.showDesktop.description": "Una notificación de Windows, como las de Discord. Al hacer clic se abre el MD.",
    "settings.sound": "Sonido",
    "settings.sound.description": "Uno de los sonidos de Discord.",
    "sound.none": "Sin sonido",
    "sound.message1": "Mensaje",
    "sound.message2": "Ping suave",
    "sound.message3": "Campanilla",
    "sound.mention1": "Mención",
    "sound.user_join": "Usuario se ha unido",
    "sound.stream_started": "Directo iniciado",
    "sound.success": "Éxito",
    "settings.volume": "Volumen del sonido",
    "settings.volume.description": "Porcentaje.",
    "settings.alertInDnd": "Avisar incluso en No molestar",
    "settings.alertInDnd.description": "Si no, no se muestra ni suena nada mientras tu estado sea No molestar.",
    "settings.onOffline": "Cuando se desconecten",
    "settings.onGame": "Cuando empiecen a jugar",
    "settings.onStream": "Cuando empiecen a hacer un directo",
    "settings.flapMinutes": "Ignorar reconexiones (minutos)",
    "settings.flapMinutes.description": "No se avisa si vuelven a conectarse poco después de desconectarse. Con 0 se avisa siempre.",
    "settings.cooldownMinutes": "Tiempo de espera por persona (minutos)",
    "settings.cooldownMinutes.description": "Como máximo un aviso de cada tipo por persona en este tiempo. 0 lo desactiva.",
    "menu.alerts": "Avisos de conexión",
    "menu.alerts.subtext": "Activado para todos los amigos",
    "toast.on": "Avisos de conexión activados para {name}",
    "toast.off": "Avisos de conexión desactivados para {name}",
    "alert.someone": "Alguien",
    "alert.online": "está en línea",
    "alert.online.text": "{name} está en línea",
    "alert.onlineGame": "está en línea, jugando a {game}",
    "alert.onlineGame.text": "{name} está en línea, jugando a {game}",
    "alert.offline": "se ha desconectado",
    "alert.offline.text": "{name} se ha desconectado",
    "alert.game": "ha empezado a jugar a {game}",
    "alert.game.text": "{name} ha empezado a jugar a {game}",
    "alert.gameUnknown": "ha empezado a jugar",
    "alert.gameUnknown.text": "{name} ha empezado a jugar",
    "alert.stream": "ha empezado un directo",
    "alert.stream.text": "{name} ha empezado un directo",
    "alert.streamGame": "ha empezado un directo de {game}",
    "alert.streamGame.text": "{name} ha empezado un directo de {game}",
    "panel.watched": "Personas vigiladas",
    "panel.count": { one: "{count} persona.", other: "{count} personas." },
    "panel.countAll": { one: "{count} persona, más todos tus amigos.", other: "{count} personas, más todos tus amigos." },
    "panel.allFriends": "Todos tus amigos. Haz clic derecho en cualquier otra persona y elige Avisos de conexión para añadirla.",
    "panel.nobody": "Nadie todavía. Haz clic derecho en alguien y elige Avisos de conexión, o añade un ID de usuario aquí.",
    "panel.stop": "Dejar de vigilar a {name}",
    "panel.remove": "Quitar",
    "panel.userIdLabel": "ID de usuario que vigilar",
    "panel.userIdPlaceholder": "ID de usuario",
    "panel.add": "Añadir",
    "panel.recent": "Recientes",
    "panel.recent.some": "Desde que se abrió Discord. Solo se guarda en la memoria.",
    "panel.recent.none": "Aún no hay avisos. Solo se guarda en la memoria.",
    "panel.clear": "Borrar"
  },
  fr: {
    "settings.watchAllFriends": "Surveiller tous les amis",
    "settings.watchAllFriends.description": "Alerter pour chaque ami, pas seulement pour les personnes que tu choisis.",
    "settings.showToast": "Notification dans l'app",
    "settings.showToast.description": "Une notification en haut de Discord.",
    "settings.showDesktop": "Notification de bureau",
    "settings.showDesktop.description": "Une notification Windows, comme celles de Discord. Un clic dessus ouvre le MP.",
    "settings.sound": "Son",
    "settings.sound.description": "Un des sons de Discord.",
    "sound.none": "Aucun son",
    "sound.message1": "Message",
    "sound.message2": "Ping discret",
    "sound.message3": "Carillon",
    "sound.mention1": "Mention",
    "sound.user_join": "Utilisateur arrivé",
    "sound.stream_started": "Stream démarré",
    "sound.success": "Succès",
    "settings.volume": "Volume du son",
    "settings.volume.description": "Pourcentage.",
    "settings.alertInDnd": "Alerter même en mode Ne pas déranger",
    "settings.alertInDnd.description": "Sinon, rien ne s'affiche ni ne retentit tant que ton statut est Ne pas déranger.",
    "settings.onOffline": "Quand ils se déconnectent",
    "settings.onGame": "Quand ils lancent un jeu",
    "settings.onStream": "Quand ils lancent un stream",
    "settings.flapMinutes": "Ignorer les reconnexions (minutes)",
    "settings.flapMinutes.description": "Un retour en ligne peu après une déconnexion n'est pas signalé. Avec 0, c'est signalé à chaque fois.",
    "settings.cooldownMinutes": "Délai par personne (minutes)",
    "settings.cooldownMinutes.description": "Au plus une alerte de chaque type par personne pendant ce délai. 0 désactive cette limite.",
    "menu.alerts": "Alertes de connexion",
    "menu.alerts.subtext": "Activées pour tous les amis",
    "toast.on": "Alertes de connexion activées pour {name}",
    "toast.off": "Alertes de connexion désactivées pour {name}",
    "alert.someone": "Quelqu'un",
    "alert.online": "est en ligne",
    "alert.online.text": "{name} est en ligne",
    "alert.onlineGame": "est en ligne et joue à {game}",
    "alert.onlineGame.text": "{name} est en ligne et joue à {game}",
    "alert.offline": "s'est déconnecté(e)",
    "alert.offline.text": "{name} s'est déconnecté(e)",
    "alert.game": "a commencé à jouer à {game}",
    "alert.game.text": "{name} a commencé à jouer à {game}",
    "alert.gameUnknown": "a commencé à jouer à un jeu",
    "alert.gameUnknown.text": "{name} a commencé à jouer à un jeu",
    "alert.stream": "a lancé un stream",
    "alert.stream.text": "{name} a lancé un stream",
    "alert.streamGame": "a lancé un stream de {game}",
    "alert.streamGame.text": "{name} a lancé un stream de {game}",
    "panel.watched": "Personnes surveillées",
    "panel.count": { one: "{count} personne.", other: "{count} personnes." },
    "panel.countAll": { one: "{count} personne, plus tous tes amis.", other: "{count} personnes, plus tous tes amis." },
    "panel.allFriends": "Tous tes amis. Fais un clic droit sur quelqu'un d'autre et choisis Alertes de connexion pour l'ajouter.",
    "panel.nobody": "Personne pour l'instant. Fais un clic droit sur quelqu'un et choisis Alertes de connexion, ou ajoute un ID d'utilisateur ici.",
    "panel.stop": "Ne plus surveiller {name}",
    "panel.remove": "Retirer",
    "panel.userIdLabel": "ID d'utilisateur à surveiller",
    "panel.userIdPlaceholder": "ID d'utilisateur",
    "panel.add": "Ajouter",
    "panel.recent": "Récentes",
    "panel.recent.some": "Depuis le lancement de Discord. Gardées en mémoire uniquement.",
    "panel.recent.none": "Aucune alerte pour l'instant. Gardées en mémoire uniquement.",
    "panel.clear": "Effacer"
  },
  ja: {
    "settings.watchAllFriends": "すべてのフレンドを対象にする",
    "settings.watchAllFriends.description": "選んだ人だけでなく、すべてのフレンドについて通知します。",
    "settings.showToast": "アプリ内トースト",
    "settings.showToast.description": "Discordの上部にトーストを表示します。",
    "settings.showDesktop": "デスクトップ通知",
    "settings.showDesktop.description": "Discord本体と同じWindows通知です。クリックするとDMが開きます。",
    "settings.sound": "サウンド",
    "settings.sound.description": "Discordのサウンドから選べます。",
    "sound.none": "サウンドなし",
    "sound.message1": "メッセージ",
    "sound.message2": "やさしいピン",
    "sound.message3": "チャイム",
    "sound.mention1": "メンション",
    "sound.user_join": "ユーザーの参加",
    "sound.stream_started": "配信開始",
    "sound.success": "成功",
    "settings.volume": "サウンドの音量",
    "settings.volume.description": "パーセントで指定します。",
    "settings.alertInDnd": "取り込み中でも通知する",
    "settings.alertInDnd.description": "オフの場合、ステータスが取り込み中の間は何も表示も再生もされません。",
    "settings.onOffline": "オフラインになったとき",
    "settings.onGame": "ゲームを始めたとき",
    "settings.onStream": "配信を始めたとき",
    "settings.flapMinutes": "再接続を無視する (分)",
    "settings.flapMinutes.description": "オフラインになってからこの時間内にオンラインに戻っても通知しません。0にすると毎回通知します。",
    "settings.cooldownMinutes": "1人あたりのクールダウン (分)",
    "settings.cooldownMinutes.description": "この時間内は、1人につき種類ごとに最大1回だけ通知します。0でオフになります。",
    "menu.alerts": "オンライン通知",
    "menu.alerts.subtext": "すべてのフレンドでオン",
    "toast.on": "{name}のオンライン通知をオンにしました",
    "toast.off": "{name}のオンライン通知をオフにしました",
    "alert.someone": "誰か",
    "alert.online": "オンラインになりました",
    "alert.online.text": "{name}さんがオンラインになりました",
    "alert.onlineGame": "{game}をプレイ中でオンラインになりました",
    "alert.onlineGame.text": "{name}さんが{game}をプレイ中でオンラインになりました",
    "alert.offline": "オフラインになりました",
    "alert.offline.text": "{name}さんがオフラインになりました",
    "alert.game": "{game}を始めました",
    "alert.game.text": "{name}さんが{game}を始めました",
    "alert.gameUnknown": "ゲームを始めました",
    "alert.gameUnknown.text": "{name}さんがゲームを始めました",
    "alert.stream": "配信を始めました",
    "alert.stream.text": "{name}さんが配信を始めました",
    "alert.streamGame": "{game}の配信を始めました",
    "alert.streamGame.text": "{name}さんが{game}の配信を始めました",
    "panel.watched": "通知の対象",
    "panel.count": { other: "{count}人。" },
    "panel.countAll": { other: "{count}人と、すべてのフレンド。" },
    "panel.allFriends": "すべてのフレンド。ほかの人を追加するには、その人を右クリックして「オンライン通知」を選びます。",
    "panel.nobody": "まだ誰もいません。誰かを右クリックして「オンライン通知」を選ぶか、ここにユーザーIDを追加してください。",
    "panel.stop": "{name}の通知をやめる",
    "panel.remove": "削除",
    "panel.userIdLabel": "通知の対象にするユーザーID",
    "panel.userIdPlaceholder": "ユーザーID",
    "panel.add": "追加",
    "panel.recent": "最近の通知",
    "panel.recent.some": "Discordの起動後のものです。メモリ内にのみ保存されます。",
    "panel.recent.none": "まだ通知はありません。メモリ内にのみ保存されます。",
    "panel.clear": "クリア"
  },
  pl: {
    "settings.watchAllFriends": "Obserwuj wszystkich znajomych",
    "settings.watchAllFriends.description": "Powiadamiaj o każdym znajomym, nie tylko o wybranych osobach.",
    "settings.showToast": "Powiadomienie w aplikacji",
    "settings.showToast.description": "Powiadomienie u góry okna Discorda.",
    "settings.showDesktop": "Powiadomienie na pulpicie",
    "settings.showDesktop.description": "Powiadomienie Windows, takie jak od samego Discorda. Kliknięcie otwiera DM.",
    "settings.sound": "Dźwięk",
    "settings.sound.description": "Jeden z dźwięków Discorda.",
    "sound.none": "Bez dźwięku",
    "sound.message1": "Wiadomość",
    "sound.message2": "Cichy sygnał",
    "sound.message3": "Dzwonek",
    "sound.mention1": "Wzmianka",
    "sound.user_join": "Użytkownik dołączył",
    "sound.stream_started": "Transmisja rozpoczęta",
    "sound.success": "Sukces",
    "settings.volume": "Głośność dźwięku",
    "settings.volume.description": "Procenty.",
    "settings.alertInDnd": "Powiadamiaj nawet w trybie Nie przeszkadzać",
    "settings.alertInDnd.description": "W przeciwnym razie nic się nie wyświetli ani nie zagra, gdy masz status Nie przeszkadzać.",
    "settings.onOffline": "Gdy przejdą w tryb offline",
    "settings.onGame": "Gdy zaczną grać w grę",
    "settings.onStream": "Gdy zaczną transmisję",
    "settings.flapMinutes": "Ignoruj ponowne połączenia (minuty)",
    "settings.flapMinutes.description": "Powrót online krótko po przejściu w tryb offline nie jest zgłaszany. Przy 0 zgłaszany jest za każdym razem.",
    "settings.cooldownMinutes": "Przerwa dla każdej osoby (minuty)",
    "settings.cooldownMinutes.description": "Najwyżej jedno powiadomienie każdego rodzaju na osobę w tym czasie. 0 wyłącza limit.",
    "menu.alerts": "Powiadomienia o dostępności",
    "menu.alerts.subtext": "Włączone dla wszystkich znajomych",
    "toast.on": "Włączono powiadomienia o dostępności dla: {name}",
    "toast.off": "Wyłączono powiadomienia o dostępności dla: {name}",
    "alert.someone": "Ktoś",
    "alert.online": "jest online",
    "alert.online.text": "{name} jest online",
    "alert.onlineGame": "jest online i gra w {game}",
    "alert.onlineGame.text": "{name} jest online i gra w {game}",
    "alert.offline": "przeszedł(-ła) w tryb offline",
    "alert.offline.text": "{name} przeszedł(-ła) w tryb offline",
    "alert.game": "zaczął(-ęła) grać w {game}",
    "alert.game.text": "{name} zaczął(-ęła) grać w {game}",
    "alert.gameUnknown": "zaczął(-ęła) grać w grę",
    "alert.gameUnknown.text": "{name} zaczął(-ęła) grać w grę",
    "alert.stream": "rozpoczął(-ęła) transmisję",
    "alert.stream.text": "{name} rozpoczął(-ęła) transmisję",
    "alert.streamGame": "rozpoczął(-ęła) transmisję z {game}",
    "alert.streamGame.text": "{name} rozpoczął(-ęła) transmisję z {game}",
    "panel.watched": "Obserwowane osoby",
    "panel.count": { one: "{count} osoba.", few: "{count} osoby.", many: "{count} osób.", other: "{count} osoby." },
    "panel.countAll": { one: "{count} osoba oraz wszyscy twoi znajomi.", few: "{count} osoby oraz wszyscy twoi znajomi.", many: "{count} osób oraz wszyscy twoi znajomi.", other: "{count} osoby oraz wszyscy twoi znajomi." },
    "panel.allFriends": "Wszyscy twoi znajomi. Kliknij prawym przyciskiem inną osobę i wybierz Powiadomienia o dostępności, aby ją dodać.",
    "panel.nobody": "Na razie nikogo. Kliknij kogoś prawym przyciskiem i wybierz Powiadomienia o dostępności albo dodaj tutaj ID użytkownika.",
    "panel.stop": "Przestań obserwować: {name}",
    "panel.remove": "Usuń",
    "panel.userIdLabel": "ID użytkownika do obserwowania",
    "panel.userIdPlaceholder": "ID użytkownika",
    "panel.add": "Dodaj",
    "panel.recent": "Ostatnie",
    "panel.recent.some": "Od uruchomienia Discorda. Przechowywane tylko w pamięci.",
    "panel.recent.none": "Na razie brak powiadomień. Przechowywane tylko w pamięci.",
    "panel.clear": "Wyczyść"
  },
  "pt-BR": {
    "settings.watchAllFriends": "Acompanhar todos os amigos",
    "settings.watchAllFriends.description": "Avisar sobre todos os amigos, não só as pessoas que você escolher.",
    "settings.showToast": "Aviso no app",
    "settings.showToast.description": "Um aviso no topo do Discord.",
    "settings.showDesktop": "Notificação da área de trabalho",
    "settings.showDesktop.description": "Uma notificação do Windows, como as do próprio Discord. Clicar nela abre a DM.",
    "settings.sound": "Som",
    "settings.sound.description": "Um dos sons do Discord.",
    "sound.none": "Sem som",
    "sound.message1": "Mensagem",
    "sound.message2": "Ping suave",
    "sound.message3": "Sino",
    "sound.mention1": "Menção",
    "sound.user_join": "Usuário entrou",
    "sound.stream_started": "Transmissão iniciada",
    "sound.success": "Sucesso",
    "settings.volume": "Volume do som",
    "settings.volume.description": "Porcentagem.",
    "settings.alertInDnd": "Avisar mesmo em Não perturbe",
    "settings.alertInDnd.description": "Caso contrário, nada aparece nem toca enquanto seu status for Não perturbe.",
    "settings.onOffline": "Quando ficarem offline",
    "settings.onGame": "Quando começarem a jogar",
    "settings.onStream": "Quando começarem a transmitir",
    "settings.flapMinutes": "Ignorar reconexões (minutos)",
    "settings.flapMinutes.description": "Voltar a ficar online pouco depois de ficar offline não é avisado. Com 0, avisa sempre.",
    "settings.cooldownMinutes": "Intervalo por pessoa (minutos)",
    "settings.cooldownMinutes.description": "No máximo um aviso de cada tipo por pessoa nesse tempo. 0 desativa.",
    "menu.alerts": "Avisos de online",
    "menu.alerts.subtext": "Ativado para todos os amigos",
    "toast.on": "Avisos de online ativados para {name}",
    "toast.off": "Avisos de online desativados para {name}",
    "alert.someone": "Alguém",
    "alert.online": "está online",
    "alert.online.text": "{name} está online",
    "alert.onlineGame": "está online, jogando {game}",
    "alert.onlineGame.text": "{name} está online, jogando {game}",
    "alert.offline": "ficou offline",
    "alert.offline.text": "{name} ficou offline",
    "alert.game": "começou a jogar {game}",
    "alert.game.text": "{name} começou a jogar {game}",
    "alert.gameUnknown": "começou a jogar",
    "alert.gameUnknown.text": "{name} começou a jogar",
    "alert.stream": "começou a transmitir",
    "alert.stream.text": "{name} começou a transmitir",
    "alert.streamGame": "começou a transmitir {game}",
    "alert.streamGame.text": "{name} começou a transmitir {game}",
    "panel.watched": "Pessoas acompanhadas",
    "panel.count": { one: "{count} pessoa.", other: "{count} pessoas." },
    "panel.countAll": { one: "{count} pessoa, mais todos os seus amigos.", other: "{count} pessoas, mais todos os seus amigos." },
    "panel.allFriends": "Todos os seus amigos. Clique com o botão direito em qualquer outra pessoa e escolha Avisos de online para adicioná-la.",
    "panel.nobody": "Ninguém ainda. Clique com o botão direito em alguém e escolha Avisos de online, ou adicione um ID de usuário aqui.",
    "panel.stop": "Parar de acompanhar {name}",
    "panel.remove": "Remover",
    "panel.userIdLabel": "ID de usuário a acompanhar",
    "panel.userIdPlaceholder": "ID de usuário",
    "panel.add": "Adicionar",
    "panel.recent": "Recentes",
    "panel.recent.some": "Desde que o Discord foi iniciado. Guardados apenas na memória.",
    "panel.recent.none": "Nenhum aviso ainda. Guardados apenas na memória.",
    "panel.clear": "Limpar"
  },
  ru: {
    "settings.watchAllFriends": "Следить за всеми друзьями",
    "settings.watchAllFriends.description": "Уведомлять о каждом друге, а не только о выбранных людях.",
    "settings.showToast": "Уведомление в приложении",
    "settings.showToast.description": "Всплывающее уведомление в верхней части Discord.",
    "settings.showDesktop": "Уведомление на рабочем столе",
    "settings.showDesktop.description": "Уведомление Windows, как у самого Discord. По клику открывается ЛС.",
    "settings.sound": "Звук",
    "settings.sound.description": "Один из звуков Discord.",
    "sound.none": "Без звука",
    "sound.message1": "Сообщение",
    "sound.message2": "Тихий сигнал",
    "sound.message3": "Звонок",
    "sound.mention1": "Упоминание",
    "sound.user_join": "Пользователь присоединился",
    "sound.stream_started": "Трансляция началась",
    "sound.success": "Успех",
    "settings.volume": "Громкость звука",
    "settings.volume.description": "В процентах.",
    "settings.alertInDnd": "Уведомлять даже в режиме «Не беспокоить»",
    "settings.alertInDnd.description": "Иначе ничего не показывается и не воспроизводится, пока у вас статус «Не беспокоить».",
    "settings.onOffline": "Когда они выходят из сети",
    "settings.onGame": "Когда они запускают игру",
    "settings.onStream": "Когда они начинают трансляцию",
    "settings.flapMinutes": "Игнорировать переподключения (минуты)",
    "settings.flapMinutes.description": "Если человек снова появился в сети вскоре после выхода, уведомления не будет. При значении 0 уведомляем каждый раз.",
    "settings.cooldownMinutes": "Пауза для каждого человека (минуты)",
    "settings.cooldownMinutes.description": "Не больше одного уведомления каждого вида на человека за это время. 0 отключает ограничение.",
    "menu.alerts": "Уведомления о появлении в сети",
    "menu.alerts.subtext": "Включены для всех друзей",
    "toast.on": "Уведомления о появлении в сети для {name} включены",
    "toast.off": "Уведомления о появлении в сети для {name} выключены",
    "alert.someone": "Кто-то",
    "alert.online": "в сети",
    "alert.online.text": "{name} в сети",
    "alert.onlineGame": "в сети, играет в {game}",
    "alert.onlineGame.text": "{name} в сети, играет в {game}",
    "alert.offline": "вышел(-ла) из сети",
    "alert.offline.text": "{name} вышел(-ла) из сети",
    "alert.game": "начал(а) играть в {game}",
    "alert.game.text": "{name} начал(а) играть в {game}",
    "alert.gameUnknown": "начал(а) играть в игру",
    "alert.gameUnknown.text": "{name} начал(а) играть в игру",
    "alert.stream": "начал(а) трансляцию",
    "alert.stream.text": "{name} начал(а) трансляцию",
    "alert.streamGame": "начал(а) трансляцию {game}",
    "alert.streamGame.text": "{name} начал(а) трансляцию {game}",
    "panel.watched": "Отслеживаемые люди",
    "panel.count": { one: "{count} человек.", few: "{count} человека.", many: "{count} человек.", other: "{count} человека." },
    "panel.countAll": { one: "{count} человек и все ваши друзья.", few: "{count} человека и все ваши друзья.", many: "{count} человек и все ваши друзья.", other: "{count} человека и все ваши друзья." },
    "panel.allFriends": "Все ваши друзья. Чтобы добавить кого-то ещё, нажмите на него правой кнопкой мыши и выберите «Уведомления о появлении в сети».",
    "panel.nobody": "Пока никого. Нажмите на кого-нибудь правой кнопкой мыши и выберите «Уведомления о появлении в сети» или добавьте ID пользователя здесь.",
    "panel.stop": "Перестать следить за {name}",
    "panel.remove": "Убрать",
    "panel.userIdLabel": "ID пользователя для отслеживания",
    "panel.userIdPlaceholder": "ID пользователя",
    "panel.add": "Добавить",
    "panel.recent": "Недавние",
    "panel.recent.some": "С момента запуска Discord. Хранятся только в памяти.",
    "panel.recent.none": "Уведомлений пока нет. Хранятся только в памяти.",
    "panel.clear": "Очистить"
  },
  tr: {
    "settings.watchAllFriends": "Tüm arkadaşları izle",
    "settings.watchAllFriends.description": "Yalnızca seçtiğin kişiler için değil, her arkadaş için bildirim gönder.",
    "settings.showToast": "Uygulama içi bildirim",
    "settings.showToast.description": "Discord'un üst kısmında çıkan bir bildirim.",
    "settings.showDesktop": "Masaüstü bildirimi",
    "settings.showDesktop.description": "Discord'un kendi bildirimleri gibi bir Windows bildirimi. Tıklayınca DM açılır.",
    "settings.sound": "Ses",
    "settings.sound.description": "Discord seslerinden biri.",
    "sound.none": "Ses yok",
    "sound.message1": "Mesaj",
    "sound.message2": "Hafif bip",
    "sound.message3": "Zil",
    "sound.mention1": "Bahsetme",
    "sound.user_join": "Kullanıcı katıldı",
    "sound.stream_started": "Yayın başladı",
    "sound.success": "Başarılı",
    "settings.volume": "Ses düzeyi",
    "settings.volume.description": "Yüzde olarak.",
    "settings.alertInDnd": "Rahatsız Etmeyin modunda da bildir",
    "settings.alertInDnd.description": "Aksi halde durumun Rahatsız Etmeyin iken hiçbir şey gösterilmez veya çalınmaz.",
    "settings.onOffline": "Çevrimdışı olduklarında",
    "settings.onGame": "Bir oyun oynamaya başladıklarında",
    "settings.onStream": "Yayın açtıklarında",
    "settings.flapMinutes": "Yeniden bağlanmaları yoksay (dakika)",
    "settings.flapMinutes.description": "Çevrimdışı olduktan kısa süre sonra tekrar çevrimiçi olmak bildirilmez. 0 olursa her seferinde bildirilir.",
    "settings.cooldownMinutes": "Kişi başına bekleme süresi (dakika)",
    "settings.cooldownMinutes.description": "Bu süre içinde kişi başına her türden en fazla bir bildirim gelir. 0 kapatır.",
    "menu.alerts": "Çevrimiçi Bildirimleri",
    "menu.alerts.subtext": "Tüm arkadaşlar için açık",
    "toast.on": "{name} için çevrimiçi bildirimleri açıldı",
    "toast.off": "{name} için çevrimiçi bildirimleri kapatıldı",
    "alert.someone": "Biri",
    "alert.online": "çevrimiçi oldu",
    "alert.online.text": "{name} çevrimiçi oldu",
    "alert.onlineGame": "çevrimiçi oldu, {game} oynuyor",
    "alert.onlineGame.text": "{name} çevrimiçi oldu, {game} oynuyor",
    "alert.offline": "çevrimdışı oldu",
    "alert.offline.text": "{name} çevrimdışı oldu",
    "alert.game": "{game} oynamaya başladı",
    "alert.game.text": "{name} {game} oynamaya başladı",
    "alert.gameUnknown": "bir oyun oynamaya başladı",
    "alert.gameUnknown.text": "{name} bir oyun oynamaya başladı",
    "alert.stream": "yayın açtı",
    "alert.stream.text": "{name} yayın açtı",
    "alert.streamGame": "{game} yayını açtı",
    "alert.streamGame.text": "{name} {game} yayını açtı",
    "panel.watched": "İzlenen kişiler",
    "panel.count": { other: "{count} kişi." },
    "panel.countAll": { other: "{count} kişi ve tüm arkadaşların." },
    "panel.allFriends": "Tüm arkadaşların. Başkalarını eklemek için onlara sağ tıkla ve Çevrimiçi Bildirimleri'ni seç.",
    "panel.nobody": "Henüz kimse yok. Birine sağ tıklayıp Çevrimiçi Bildirimleri'ni seç ya da buraya bir kullanıcı kimliği ekle.",
    "panel.stop": "{name} kişisini izlemeyi bırak",
    "panel.remove": "Kaldır",
    "panel.userIdLabel": "İzlenecek kullanıcı kimliği",
    "panel.userIdPlaceholder": "Kullanıcı kimliği",
    "panel.add": "Ekle",
    "panel.recent": "Son bildirimler",
    "panel.recent.some": "Discord açıldığından beri. Yalnızca bellekte tutulur.",
    "panel.recent.none": "Henüz bildirim yok. Yalnızca bellekte tutulur.",
    "panel.clear": "Temizle"
  }
});

// plugins/friend-online-alerts/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var WATCH_KEY = "watched";
var LOG_SIZE = 30;
var SOUNDS = [
  { get label() {
    return t("sound.none");
  }, value: "none" },
  { get label() {
    return t("sound.message1");
  }, value: "message1" },
  { get label() {
    return t("sound.message2");
  }, value: "message2" },
  { get label() {
    return t("sound.message3");
  }, value: "message3" },
  { get label() {
    return t("sound.mention1");
  }, value: "mention1" },
  { get label() {
    return t("sound.user_join");
  }, value: "user_join" },
  { get label() {
    return t("sound.stream_started");
  }, value: "stream_started" },
  { get label() {
    return t("sound.success");
  }, value: "success" }
];
var settings = {
  watchAllFriends: {
    type: "boolean",
    get label() {
      return t("settings.watchAllFriends");
    },
    get description() {
      return t("settings.watchAllFriends.description");
    },
    default: false
  },
  showToast: {
    type: "boolean",
    get label() {
      return t("settings.showToast");
    },
    get description() {
      return t("settings.showToast.description");
    },
    default: true
  },
  showDesktop: {
    type: "boolean",
    get label() {
      return t("settings.showDesktop");
    },
    get description() {
      return t("settings.showDesktop.description");
    },
    default: true
  },
  sound: {
    type: "select",
    get label() {
      return t("settings.sound");
    },
    get description() {
      return t("settings.sound.description");
    },
    default: "message2",
    options: SOUNDS
  },
  volume: {
    type: "number",
    get label() {
      return t("settings.volume");
    },
    get description() {
      return t("settings.volume.description");
    },
    default: 40,
    min: 0,
    max: 100,
    step: 5
  },
  alertInDnd: {
    type: "boolean",
    get label() {
      return t("settings.alertInDnd");
    },
    get description() {
      return t("settings.alertInDnd.description");
    },
    default: false
  },
  onOffline: { type: "boolean", get label() {
    return t("settings.onOffline");
  }, default: false },
  onGame: { type: "boolean", get label() {
    return t("settings.onGame");
  }, default: false },
  onStream: { type: "boolean", get label() {
    return t("settings.onStream");
  }, default: false },
  flapMinutes: {
    type: "number",
    get label() {
      return t("settings.flapMinutes");
    },
    get description() {
      return t("settings.flapMinutes.description");
    },
    default: 5,
    min: 0,
    max: 60
  },
  cooldownMinutes: {
    type: "number",
    get label() {
      return t("settings.cooldownMinutes");
    },
    get description() {
      return t("settings.cooldownMinutes.description");
    },
    default: 2,
    min: 0,
    max: 120
  }
};
var ctx;
var engine = new AlertEngine;
var log = [];
var listeners = new Set;
var version = 0;
var bump = () => {
  version++;
  listeners.forEach((l) => l());
};
var subscribe = (cb) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
var store = (name) => {
  try {
    return import_api2.getStore(name);
  } catch {
    return;
  }
};
var selfId = () => store("UserStore")?.getCurrentUser?.()?.id;
var isFriend = (id) => !!store("RelationshipStore")?.isFriend?.(id);
function userName(id) {
  const nick = store("RelationshipStore")?.getNickname?.(id);
  if (nick)
    return nick;
  const user = store("UserStore")?.getUser?.(id);
  return user ? user.globalName ?? user.global_name ?? user.username ?? id : id;
}
function avatarUrl(id) {
  try {
    return store("UserStore")?.getUser?.(id)?.getAvatarURL?.(undefined, 128);
  } catch {
    return;
  }
}
function selfStatus() {
  return store("SelfPresenceStore")?.getStatus?.() ?? store("PresenceStore")?.getStatus?.(selfId());
}
function snapshot(id) {
  const presence = store("PresenceStore");
  let goLive = false;
  try {
    goLive = store("ApplicationStreamingStore")?.getAnyStreamForUser?.(id) != null;
  } catch {}
  return snapshotOf(presence?.getStatus?.(id), presence?.getActivities?.(id), goLive);
}
function presenceKnown(id) {
  const statuses = store("PresenceStore")?.getState?.()?.statuses;
  return isFriend(id) || statuses != null && id in statuses;
}
var notificationUtil = () => import_api2.find(import_api2.filters.byProps("showNotification", "playNotificationSound", "requestPermission"));
var privateChannelActions = () => import_api2.find(import_api2.filters.byProps("openPrivateChannel", "getOrEnsurePrivateChannel"));
function openDm(userId) {
  try {
    privateChannelActions()?.openPrivateChannel?.({ recipientIds: userId });
  } catch (e) {
    ctx?.logger.error("Couldn't open the DM", e);
  }
}
var storage = () => ctx?.settings;
var watchList = () => parseWatchList(storage()?.get(WATCH_KEY));
function setWatchList(list) {
  storage()?.set(WATCH_KEY, list);
  bump();
}
function watched(id, list = watchList()) {
  return !!ctx && isWatched(id, list, ctx.settings.get("watchAllFriends"), isFriend, selfId());
}
function toggle(id) {
  const list = watchList();
  const adding = !list.includes(id);
  setWatchList(toggleWatch(list, id));
  if (adding && presenceKnown(id))
    engine.seed(id, snapshot(id), Date.now());
  else if (!watched(id))
    engine.forget(id);
  ctx?.toast(t(adding ? "toast.on" : "toast.off", { name: userName(id) }), { type: "success" });
}
function everyoneWatched() {
  if (!ctx)
    return [];
  const ids = new Set(watchList());
  if (ctx.settings.get("watchAllFriends")) {
    for (const id of store("RelationshipStore")?.getFriendIDs?.() ?? [])
      ids.add(id);
  }
  ids.delete(selfId() ?? "");
  return [...ids];
}
function seedAll() {
  const now = Date.now();
  for (const id of everyoneWatched()) {
    if (presenceKnown(id))
      engine.seed(id, snapshot(id), now);
  }
}
function messageFor(alert, name) {
  const who = name.trim() || t("alert.someone");
  const game = alert.game;
  const key = alert.kind === "online" ? game ? "alert.onlineGame" : "alert.online" : alert.kind === "offline" ? "alert.offline" : alert.kind === "game" ? game ? "alert.game" : "alert.gameUnknown" : game ? "alert.streamGame" : "alert.stream";
  const vars = { name: who, game: game ?? "" };
  return { title: who, body: t(key, vars), text: t(`${key}.text`, vars) };
}
function config() {
  const s = ctx.settings;
  return {
    online: true,
    offline: s.get("onOffline"),
    game: s.get("onGame"),
    stream: s.get("onStream"),
    flapMs: Math.max(0, s.get("flapMinutes")) * 60000,
    cooldownMs: Math.max(0, s.get("cooldownMinutes")) * 60000
  };
}
function deliver(alert) {
  if (!ctx)
    return;
  const s = ctx.settings;
  const message = messageFor(alert, userName(alert.userId));
  log = [{ at: Date.now(), userId: alert.userId, text: message.text }, ...log].slice(0, LOG_SIZE);
  bump();
  if (!shouldDeliver(selfStatus(), s.get("alertInDnd")))
    return;
  if (s.get("showToast"))
    ctx.toast(message.text, { type: "info", duration: 5000 });
  const util = notificationUtil();
  if (s.get("showDesktop")) {
    try {
      Promise.resolve(util?.showNotification?.(avatarUrl(alert.userId), message.title, message.body, {}, {
        tag: `evi-foa-${alert.userId}-${alert.kind}`,
        isUserAvatar: true,
        omitViewTracking: true,
        omitClickTracking: true,
        onClick: () => openDm(alert.userId)
      })).catch((e) => ctx?.logger.error("Desktop notification failed", e));
    } catch (e) {
      ctx.logger.error("Desktop notification failed", e);
    }
  }
  const sound = s.get("sound");
  if (sound !== "none") {
    try {
      Promise.resolve(util?.playNotificationSound?.(sound, Math.min(1, Math.max(0, s.get("volume") / 100)))).catch(() => {});
    } catch (e) {
      ctx.logger.error("Sound failed", e);
    }
  }
}
var pending = new Set;
var flushTimer;
function flush() {
  flushTimer = undefined;
  if (!ctx)
    return pending.clear();
  const now = Date.now();
  const cfg = config();
  const list = new Set(watchList());
  for (const id of pending) {
    if (!watched(id, list))
      continue;
    for (const alert of engine.observe(id, snapshot(id), now, cfg))
      deliver(alert);
  }
  pending.clear();
}
function queue(id) {
  if (typeof id !== "string" || !ctx)
    return;
  pending.add(id);
  flushTimer ??= setTimeout(flush, 0);
}
var graceTimer;
function grace() {
  engine.beginGrace(Date.now(), STARTUP_GRACE_MS);
  clearTimeout(graceTimer);
  graceTimer = setTimeout(() => {
    graceTimer = undefined;
    if (ctx)
      seedAll();
  }, STARTUP_GRACE_MS + 100);
}
function useVersion() {
  import_api2.React.useSyncExternalStore(subscribe, () => version);
}
function formatTime(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function SmallButton({ children, onClick, disabled, danger, label }) {
  const Button = import_api2.Components.Button;
  return Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
    color: danger ? Button.Colors?.RED : Button.Colors?.PRIMARY,
    size: Button.Sizes?.SMALL,
    disabled,
    onClick,
    "aria-label": label,
    children
  }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
    type: "button",
    className: "dl-button",
    disabled,
    onClick,
    "aria-label": label,
    children
  });
}
function WatchPanel() {
  useVersion();
  const [input, setInput] = import_api2.React.useState("");
  const list = watchList();
  const all = ctx?.settings.get("watchAllFriends");
  const id = input.trim();
  const valid = /^\d{15,25}$/.test(id) && id !== selfId();
  const add = () => {
    if (!valid)
      return;
    if (!list.includes(id))
      toggle(id);
    setInput("");
  };
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-text",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("div", {
            className: "dl-label",
            children: t("panel.watched")
          }),
          /* @__PURE__ */ jsx_runtime.jsx("p", {
            className: "dl-hint",
            role: "status",
            children: list.length ? t(all ? "panel.countAll" : "panel.count", { count: list.length }) : t(all ? "panel.allFriends" : "panel.nobody")
          })
        ]
      }),
      list.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: "0.5rem 0", padding: 0 },
        children: list.map((userId) => {
          const avatar = avatarUrl(userId);
          const name = userName(userId);
          return /* @__PURE__ */ jsx_runtime.jsxs("li", {
            style: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" },
            children: [
              avatar ? /* @__PURE__ */ jsx_runtime.jsx("img", {
                src: avatar,
                alt: "",
                width: 24,
                height: 24,
                style: { borderRadius: "50%", flexShrink: 0 }
              }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
                "aria-hidden": "true",
                style: { width: 24, height: 24, borderRadius: "50%", background: "var(--background-modifier-accent, #4e505880)", flexShrink: 0 }
              }),
              /* @__PURE__ */ jsx_runtime.jsxs("span", {
                className: "dl-hint",
                style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 },
                children: [
                  name,
                  name === userId ? "" : ` (${userId})`
                ]
              }),
              /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
                danger: true,
                label: t("panel.stop", { name }),
                onClick: () => toggle(userId),
                children: t("panel.remove")
              })
            ]
          }, userId);
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        style: { display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" },
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("input", {
            className: "dl-input",
            style: { flex: 1 },
            "aria-label": t("panel.userIdLabel"),
            placeholder: t("panel.userIdPlaceholder"),
            inputMode: "numeric",
            value: input,
            onChange: (e) => setInput(e.currentTarget.value),
            onKeyDown: (e) => {
              if (e.key === "Enter")
                add();
            }
          }),
          /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
            disabled: !valid || list.includes(id),
            onClick: add,
            children: t("panel.add")
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-row",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "dl-field-text",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("div", {
                className: "dl-label",
                children: t("panel.recent")
              }),
              /* @__PURE__ */ jsx_runtime.jsx("p", {
                className: "dl-hint",
                children: t(log.length ? "panel.recent.some" : "panel.recent.none")
              })
            ]
          }),
          /* @__PURE__ */ jsx_runtime.jsx(SmallButton, {
            danger: true,
            disabled: !log.length,
            onClick: () => {
              log = [];
              bump();
            },
            children: t("panel.clear")
          })
        ]
      }),
      log.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: 0, padding: 0 },
        children: log.map((entry, i) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
          className: "dl-hint",
          style: { padding: "0.125rem 0" },
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("time", {
              dateTime: new Date(entry.at).toISOString(),
              style: { fontVariantNumeric: "tabular-nums", marginInlineEnd: "0.5rem" },
              children: formatTime(entry.at)
            }),
            entry.text
          ]
        }, `${entry.at}-${entry.userId}-${i}`))
      })
    ]
  });
}
var friend_online_alerts_default = import_api2.definePlugin({
  settings,
  flux: {
    PRESENCE_UPDATES(action) {
      for (const update of action?.updates ?? [])
        queue(update?.user?.id);
    },
    VOICE_STATE_UPDATES(action) {
      if (!ctx?.settings.get("onStream"))
        return;
      for (const state of action?.voiceStates ?? [])
        queue(state?.userId);
    },
    CONNECTION_OPEN() {
      if (ctx)
        grace();
    },
    CONNECTION_OPEN_SUPPLEMENTAL() {
      if (ctx)
        grace();
    },
    CONNECTION_RESUMED() {
      if (ctx)
        grace();
    }
  },
  start(context) {
    ctx = context;
    engine = new AlertEngine;
    log = [];
    grace();
    seedAll();
    context.settings.onChange(() => {
      const now = Date.now();
      for (const id of everyoneWatched())
        if (!engine.has(id) && presenceKnown(id))
          engine.seed(id, snapshot(id), now);
      bump();
    });
    context.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      if (!userId || userId === selfId())
        return;
      const explicit = watchList().includes(userId);
      const viaFriends = !explicit && !!ctx?.settings.get("watchAllFriends") && isFriend(userId);
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Group, {
        children: /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.CheckboxItem, {
          id: "evi-foa-toggle",
          label: t("menu.alerts"),
          subtext: viaFriends ? t("menu.alerts.subtext") : undefined,
          checked: explicit || viaFriends,
          disabled: viaFriends,
          action: () => toggle(userId)
        })
      }, "evi-foa-group"));
    });
  },
  stop() {
    clearTimeout(flushTimer);
    clearTimeout(graceTimer);
    flushTimer = graceTimer = undefined;
    pending.clear();
    engine.clear();
    log = [];
    ctx = undefined;
    bump();
  },
  settingsPanel: () => /* @__PURE__ */ jsx_runtime.jsx(WatchPanel, {})
});
