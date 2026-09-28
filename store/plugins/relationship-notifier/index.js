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

// plugins/relationship-notifier/index.tsx
var exports_relationship_notifier = {};
__export(exports_relationship_notifier, {
  default: () => relationship_notifier_default
});
module.exports = __toCommonJS(exports_relationship_notifier);
var import_api2 = require("@evi/api");

// plugins/relationship-notifier/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.friendRemoved": "Friend removals",
    "settings.friendRemoved.description": "Someone removes you from their friends.",
    "settings.requestCancelled": "Declined friend requests",
    "settings.requestCancelled.description": "A friend request you sent is declined or cancelled.",
    "settings.groupRemoved": "Group DM removals",
    "settings.groupRemoved.description": "Someone removes you from a group DM. Leaving yourself isn't reported.",
    "settings.serverRemoved": "Server removals",
    "settings.serverRemoved.description": "You're kicked or banned from a server, or it's deleted. Leaving yourself isn't reported.",
    "settings.showToasts": "Show toasts",
    "settings.showToasts.description": "Pop up a toast. When off, it's only logged here and in /relationships.",
    "text.friendRemoved": "{name} removed you as a friend",
    "text.requestCancelled": "Your friend request to {name} was declined or cancelled",
    "text.groupRemoved": "You were removed from {name}",
    "text.serverRemoved": "You were removed from {name}",
    "log.recent": "Recent",
    "log.count": "{count} since Discord started. Kept in memory only.",
    "log.empty": "Nothing yet. Kept in memory only.",
    "log.clear": "Clear log",
    "command.description": "Friend, group DM and server removals since Discord started",
    "command.empty": "Nothing yet: no removals since Discord started."
  },
  de: {
    "settings.friendRemoved": "Freundschaftsbeendigungen",
    "settings.friendRemoved.description": "Jemand entfernt dich aus seinen Freunden.",
    "settings.requestCancelled": "Abgelehnte Freundschaftsanfragen",
    "settings.requestCancelled.description": "Eine von dir gesendete Freundschaftsanfrage wird abgelehnt oder zurückgezogen.",
    "settings.groupRemoved": "Entfernungen aus Gruppen-DMs",
    "settings.groupRemoved.description": "Jemand entfernt dich aus einer Gruppen-DM. Wenn du selbst gehst, wird das nicht gemeldet.",
    "settings.serverRemoved": "Entfernungen von Servern",
    "settings.serverRemoved.description": "Du wirst von einem Server gekickt oder gebannt oder er wird gelöscht. Wenn du selbst gehst, wird das nicht gemeldet.",
    "settings.showToasts": "Toasts anzeigen",
    "settings.showToasts.description": "Zeigt einen Toast an. Wenn aus, wird es nur hier und in /relationships protokolliert.",
    "text.friendRemoved": "{name} hat dich als Freund entfernt",
    "text.requestCancelled": "Deine Freundschaftsanfrage an {name} wurde abgelehnt oder zurückgezogen",
    "text.groupRemoved": "Du wurdest aus {name} entfernt",
    "text.serverRemoved": "Du wurdest aus {name} entfernt",
    "log.recent": "Zuletzt",
    "log.count": "{count} seit dem Start von Discord. Nur im Arbeitsspeicher gespeichert.",
    "log.empty": "Noch nichts. Nur im Arbeitsspeicher gespeichert.",
    "log.clear": "Protokoll leeren",
    "command.description": "Entfernungen aus Freundeslisten, Gruppen-DMs und Servern seit dem Start von Discord",
    "command.empty": "Noch nichts: keine Entfernungen seit dem Start von Discord."
  },
  es: {
    "settings.friendRemoved": "Eliminaciones de amistad",
    "settings.friendRemoved.description": "Alguien te elimina de sus amigos.",
    "settings.requestCancelled": "Solicitudes de amistad rechazadas",
    "settings.requestCancelled.description": "Una solicitud de amistad que enviaste se rechaza o se cancela.",
    "settings.groupRemoved": "Expulsiones de MD grupales",
    "settings.groupRemoved.description": "Alguien te saca de un MD grupal. Si te vas tú, no se avisa.",
    "settings.serverRemoved": "Expulsiones de servidores",
    "settings.serverRemoved.description": "Te expulsan o te banean de un servidor, o se elimina. Si te vas tú, no se avisa.",
    "settings.showToasts": "Mostrar avisos",
    "settings.showToasts.description": "Muestra un aviso emergente. Si está desactivado, solo se registra aquí y en /relationships.",
    "text.friendRemoved": "{name} te eliminó de sus amigos",
    "text.requestCancelled": "Tu solicitud de amistad a {name} fue rechazada o cancelada",
    "text.groupRemoved": "Te sacaron de {name}",
    "text.serverRemoved": "Te sacaron de {name}",
    "log.recent": "Reciente",
    "log.count": "{count} desde que se abrió Discord. Solo se guarda en memoria.",
    "log.empty": "Todavía nada. Solo se guarda en memoria.",
    "log.clear": "Borrar registro",
    "command.description": "Eliminaciones de amigos, MD grupales y servidores desde que se abrió Discord",
    "command.empty": "Todavía nada: no hay eliminaciones desde que se abrió Discord."
  },
  fr: {
    "settings.friendRemoved": "Retraits d'amis",
    "settings.friendRemoved.description": "Quelqu'un te retire de ses amis.",
    "settings.requestCancelled": "Demandes d'ami refusées",
    "settings.requestCancelled.description": "Une demande d'ami que tu as envoyée est refusée ou annulée.",
    "settings.groupRemoved": "Retraits de groupes de MP",
    "settings.groupRemoved.description": "Quelqu'un te retire d'un groupe de MP. Si tu pars toi-même, ce n'est pas signalé.",
    "settings.serverRemoved": "Retraits de serveurs",
    "settings.serverRemoved.description": "Tu es expulsé ou banni d'un serveur, ou il est supprimé. Si tu pars toi-même, ce n'est pas signalé.",
    "settings.showToasts": "Afficher les notifications",
    "settings.showToasts.description": "Affiche une notification. Désactivé, c'est seulement enregistré ici et dans /relationships.",
    "text.friendRemoved": "{name} t'a retiré de ses amis",
    "text.requestCancelled": "Ta demande d'ami à {name} a été refusée ou annulée",
    "text.groupRemoved": "Tu as été retiré de {name}",
    "text.serverRemoved": "Tu as été retiré de {name}",
    "log.recent": "Récent",
    "log.count": { one: "{count} depuis le lancement de Discord. Gardé en mémoire uniquement.", other: "{count} depuis le lancement de Discord. Gardés en mémoire uniquement." },
    "log.empty": "Rien pour le moment. Gardé en mémoire uniquement.",
    "log.clear": "Effacer le journal",
    "command.description": "Retraits d'amis, de groupes de MP et de serveurs depuis le lancement de Discord",
    "command.empty": "Rien pour le moment : aucun retrait depuis le lancement de Discord."
  },
  ja: {
    "settings.friendRemoved": "フレンド解除",
    "settings.friendRemoved.description": "誰かがあなたをフレンドから削除したとき。",
    "settings.requestCancelled": "拒否されたフレンド申請",
    "settings.requestCancelled.description": "送ったフレンド申請が拒否またはキャンセルされたとき。",
    "settings.groupRemoved": "グループDMからの削除",
    "settings.groupRemoved.description": "誰かがあなたをグループDMから削除したとき。自分で退出した場合は通知されません。",
    "settings.serverRemoved": "サーバーからの削除",
    "settings.serverRemoved.description": "サーバーからキックまたはBANされたとき、またはサーバーが削除されたとき。自分で退出した場合は通知されません。",
    "settings.showToasts": "トーストを表示",
    "settings.showToasts.description": "トースト通知を表示します。オフの場合は、ここと /relationships にのみ記録されます。",
    "text.friendRemoved": "{name}さんがあなたをフレンドから削除しました",
    "text.requestCancelled": "{name}さんへのフレンド申請が拒否またはキャンセルされました",
    "text.groupRemoved": "{name}から削除されました",
    "text.serverRemoved": "{name}から削除されました",
    "log.recent": "最近",
    "log.count": "Discord起動後 {count} 件。メモリ上にのみ保持されます。",
    "log.empty": "まだありません。メモリ上にのみ保持されます。",
    "log.clear": "ログを消去",
    "command.description": "Discord起動後のフレンド、グループDM、サーバーからの削除",
    "command.empty": "まだありません: Discord起動後の削除はありません。"
  },
  pl: {
    "settings.friendRemoved": "Usunięcia ze znajomych",
    "settings.friendRemoved.description": "Ktoś usuwa cię ze swoich znajomych.",
    "settings.requestCancelled": "Odrzucone zaproszenia do znajomych",
    "settings.requestCancelled.description": "Wysłane przez ciebie zaproszenie do znajomych zostaje odrzucone lub anulowane.",
    "settings.groupRemoved": "Usunięcia z grupowych DM",
    "settings.groupRemoved.description": "Ktoś usuwa cię z grupowej wiadomości prywatnej. Twoje własne wyjście nie jest zgłaszane.",
    "settings.serverRemoved": "Usunięcia z serwerów",
    "settings.serverRemoved.description": "Zostajesz wyrzucony lub zbanowany z serwera albo serwer zostaje usunięty. Twoje własne wyjście nie jest zgłaszane.",
    "settings.showToasts": "Pokazuj powiadomienia",
    "settings.showToasts.description": "Wyświetla powiadomienie. Gdy wyłączone, wpis trafia tylko tutaj i do /relationships.",
    "text.friendRemoved": "{name} usuwa cię ze znajomych",
    "text.requestCancelled": "Twoje zaproszenie do znajomych dla {name} zostało odrzucone lub anulowane",
    "text.groupRemoved": "Usunięto cię z {name}",
    "text.serverRemoved": "Usunięto cię z {name}",
    "log.recent": "Ostatnie",
    "log.count": "{count} od uruchomienia Discorda. Przechowywane tylko w pamięci.",
    "log.empty": "Na razie nic. Przechowywane tylko w pamięci.",
    "log.clear": "Wyczyść dziennik",
    "command.description": "Usunięcia ze znajomych, grupowych DM i serwerów od uruchomienia Discorda",
    "command.empty": "Na razie nic: brak usunięć od uruchomienia Discorda."
  },
  "pt-BR": {
    "settings.friendRemoved": "Remoções de amizade",
    "settings.friendRemoved.description": "Alguém te remove dos amigos.",
    "settings.requestCancelled": "Pedidos de amizade recusados",
    "settings.requestCancelled.description": "Um pedido de amizade que você enviou é recusado ou cancelado.",
    "settings.groupRemoved": "Remoções de DMs em grupo",
    "settings.groupRemoved.description": "Alguém te remove de uma DM em grupo. Sair por conta própria não é avisado.",
    "settings.serverRemoved": "Remoções de servidores",
    "settings.serverRemoved.description": "Você é expulso ou banido de um servidor, ou ele é excluído. Sair por conta própria não é avisado.",
    "settings.showToasts": "Mostrar avisos",
    "settings.showToasts.description": "Mostra um aviso na tela. Desativado, só fica registrado aqui e em /relationships.",
    "text.friendRemoved": "{name} te removeu dos amigos",
    "text.requestCancelled": "Seu pedido de amizade para {name} foi recusado ou cancelado",
    "text.groupRemoved": "Você foi removido de {name}",
    "text.serverRemoved": "Você foi removido de {name}",
    "log.recent": "Recentes",
    "log.count": { one: "{count} desde que o Discord abriu. Guardado só na memória.", other: "{count} desde que o Discord abriu. Guardados só na memória." },
    "log.empty": "Nada ainda. Guardado só na memória.",
    "log.clear": "Limpar registro",
    "command.description": "Remoções de amigos, DMs em grupo e servidores desde que o Discord abriu",
    "command.empty": "Nada ainda: nenhuma remoção desde que o Discord abriu."
  },
  ru: {
    "settings.friendRemoved": "Удаление из друзей",
    "settings.friendRemoved.description": "Кто-то удаляет вас из друзей.",
    "settings.requestCancelled": "Отклонённые заявки в друзья",
    "settings.requestCancelled.description": "Отправленную вами заявку в друзья отклонили или отменили.",
    "settings.groupRemoved": "Удаление из групповых ЛС",
    "settings.groupRemoved.description": "Кто-то удаляет вас из группового чата. Если вы вышли сами, уведомления не будет.",
    "settings.serverRemoved": "Удаление с серверов",
    "settings.serverRemoved.description": "Вас выгнали или забанили на сервере, либо сервер удалили. Если вы вышли сами, уведомления не будет.",
    "settings.showToasts": "Показывать уведомления",
    "settings.showToasts.description": "Показывает всплывающее уведомление. Если выключено, событие записывается только здесь и в /relationships.",
    "text.friendRemoved": "{name} удаляет вас из друзей",
    "text.requestCancelled": "Вашу заявку в друзья для {name} отклонили или отменили",
    "text.groupRemoved": "Вас удалили из {name}",
    "text.serverRemoved": "Вас удалили из {name}",
    "log.recent": "Недавнее",
    "log.count": "{count} с запуска Discord. Хранится только в памяти.",
    "log.empty": "Пока ничего. Хранится только в памяти.",
    "log.clear": "Очистить журнал",
    "command.description": "Удаления из друзей, групповых ЛС и серверов с запуска Discord",
    "command.empty": "Пока ничего: с запуска Discord удалений не было."
  },
  tr: {
    "settings.friendRemoved": "Arkadaşlıktan çıkarılma",
    "settings.friendRemoved.description": "Biri seni arkadaş listesinden çıkarır.",
    "settings.requestCancelled": "Reddedilen arkadaşlık istekleri",
    "settings.requestCancelled.description": "Gönderdiğin bir arkadaşlık isteği reddedilir veya iptal edilir.",
    "settings.groupRemoved": "Grup DM'lerinden çıkarılma",
    "settings.groupRemoved.description": "Biri seni bir grup DM'sinden çıkarır. Kendi ayrılmanın bildirimi gelmez.",
    "settings.serverRemoved": "Sunucudan çıkarılma",
    "settings.serverRemoved.description": "Bir sunucudan atılırsın veya yasaklanırsın ya da sunucu silinir. Kendi ayrılmanın bildirimi gelmez.",
    "settings.showToasts": "Bildirimleri göster",
    "settings.showToasts.description": "Açılır bildirim gösterir. Kapalıyken yalnızca burada ve /relationships içinde kaydedilir.",
    "text.friendRemoved": "{name} seni arkadaşlıktan çıkardı",
    "text.requestCancelled": "{name} kişisine gönderdiğin arkadaşlık isteği reddedildi veya iptal edildi",
    "text.groupRemoved": "{name} grubundan çıkarıldın",
    "text.serverRemoved": "{name} sunucusundan çıkarıldın",
    "log.recent": "Son olanlar",
    "log.count": "Discord açıldığından beri {count} kayıt. Yalnızca bellekte tutulur.",
    "log.empty": "Henüz bir şey yok. Yalnızca bellekte tutulur.",
    "log.clear": "Günlüğü temizle",
    "command.description": "Discord açıldığından beri arkadaşlıktan, grup DM'lerinden ve sunuculardan çıkarılmalar",
    "command.empty": "Henüz bir şey yok: Discord açıldığından beri çıkarılma olmadı."
  }
});

// plugins/relationship-notifier/events.ts
var RelationshipType = { NONE: 0, FRIEND: 1, BLOCKED: 2, INCOMING: 3, OUTGOING: 4, IMPLICIT: 5 };
var GROUP_DM = 3;
function storeLookup(store) {
  const cache = new Map;
  const get = (name) => {
    if (!cache.has(name))
      cache.set(name, store(name));
    return cache.get(name);
  };
  return {
    get currentUserId() {
      return get("UserStore")?.getCurrentUser?.()?.id;
    },
    relationshipType: (id) => get("RelationshipStore")?.getRelationshipType?.(id),
    userName: (id) => {
      const nick = get("RelationshipStore")?.getNickname?.(id);
      if (nick)
        return nick;
      const user = get("UserStore")?.getUser?.(id);
      return user ? user.globalName ?? user.global_name ?? user.username : undefined;
    },
    channel: (id) => {
      const channel = get("ChannelStore")?.getChannel?.(id);
      return channel ? { type: channel.type, name: channel.name, recipients: channel.recipients } : undefined;
    },
    guildName: (id) => get("GuildStore")?.getGuild?.(id)?.name
  };
}
var SELF_WINDOW = 60000;
var DEDUPE_WINDOW = 1e4;
var ALL = "*";

class Tracker {
  self = new Map;
  reported = new Map;
  markSelf(scope, id, now = Date.now()) {
    this.prune(now);
    this.self.set(`${scope}:${id}`, now);
  }
  consumeSelf(scope, id, now = Date.now()) {
    this.prune(now);
    if (this.self.delete(`${scope}:${id}`))
      return true;
    return this.self.has(`${scope}:${ALL}`);
  }
  firstReport(scope, id, now = Date.now()) {
    this.prune(now);
    const key = `${scope}:${id}`;
    if (this.reported.has(key))
      return false;
    this.reported.set(key, now);
    return true;
  }
  prune(now) {
    for (const [key, at] of this.self)
      if (now - at > SELF_WINDOW)
        this.self.delete(key);
    for (const [key, at] of this.reported)
      if (now - at > DEDUPE_WINDOW)
        this.reported.delete(key);
  }
}
var fallbackUser = (id) => `User ${id}`;
function groupName(channel, lookup) {
  if (channel.name)
    return channel.name;
  const names = (channel.recipients ?? []).map((id) => lookup.userName(id)).filter((n) => !!n);
  return names.length ? names.join(", ") : "a group DM";
}
function groupRemoved(channelId, lookup, tracker, now) {
  const channel = lookup.channel(channelId);
  if (!channel || channel.type !== GROUP_DM)
    return null;
  if (tracker.consumeSelf("channel", channelId, now))
    return null;
  if (!tracker.firstReport("channel", channelId, now))
    return null;
  const name = groupName(channel, lookup);
  return { kind: "groupRemoved", id: channelId, name, at: now, text: `You were removed from ${name}` };
}
function decide(action, lookup, tracker, now = Date.now()) {
  switch (action?.type) {
    case "RELATIONSHIP_REMOVE": {
      const rel = action.relationship;
      const id = rel?.id ?? rel?.user?.id;
      if (!id)
        return null;
      const type = lookup.relationshipType(id) ?? rel?.type;
      if (type !== RelationshipType.FRIEND && type !== RelationshipType.OUTGOING)
        return null;
      if (tracker.consumeSelf("relationship", id, now))
        return null;
      const name = lookup.userName(id) ?? rel?.user?.global_name ?? rel?.user?.username ?? fallbackUser(id);
      return type === RelationshipType.FRIEND ? { kind: "friendRemoved", id, name, at: now, text: `${name} removed you as a friend` } : { kind: "requestCancelled", id, name, at: now, text: `Your friend request to ${name} was declined or cancelled` };
    }
    case "CHANNEL_DELETE": {
      const id = action.channel?.id;
      return id ? groupRemoved(id, lookup, tracker, now) : null;
    }
    case "CHANNEL_RECIPIENT_REMOVE": {
      const userId = action.user?.id;
      if (!action.channelId || !userId || !lookup.currentUserId || userId !== lookup.currentUserId)
        return null;
      return groupRemoved(action.channelId, lookup, tracker, now);
    }
    case "GUILD_DELETE": {
      const guild = action.guild;
      const id = guild?.id;
      if (!id || guild.unavailable)
        return null;
      const known = lookup.guildName(id);
      if (known === undefined)
        return null;
      if (tracker.consumeSelf("guild", id, now))
        return null;
      if (!tracker.firstReport("guild", id, now))
        return null;
      return { kind: "serverRemoved", id, name: known, at: now, text: `You were removed from ${known}` };
    }
  }
  return null;
}

class NotificationLog {
  limit;
  items = [];
  listeners = new Set;
  constructor(limit = 100) {
    this.limit = limit;
  }
  add(entry) {
    this.items = [entry, ...this.items].slice(0, Math.max(1, this.limit));
    this.changed();
  }
  get entries() {
    return this.items;
  }
  clear() {
    if (!this.items.length)
      return;
    this.items = [];
    this.changed();
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  changed() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}

// plugins/relationship-notifier/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var settings = {
  friendRemoved: { type: "boolean", get label() {
    return t("settings.friendRemoved");
  }, get description() {
    return t("settings.friendRemoved.description");
  }, default: true },
  requestCancelled: { type: "boolean", get label() {
    return t("settings.requestCancelled");
  }, get description() {
    return t("settings.requestCancelled.description");
  }, default: true },
  groupRemoved: { type: "boolean", get label() {
    return t("settings.groupRemoved");
  }, get description() {
    return t("settings.groupRemoved.description");
  }, default: true },
  serverRemoved: { type: "boolean", get label() {
    return t("settings.serverRemoved");
  }, get description() {
    return t("settings.serverRemoved.description");
  }, default: true },
  showToasts: { type: "boolean", get label() {
    return t("settings.showToasts");
  }, get description() {
    return t("settings.showToasts.description");
  }, default: true }
};
var TYPES = new Set(["RELATIONSHIP_REMOVE", "CHANNEL_DELETE", "CHANNEL_RECIPIENT_REMOVE", "GUILD_DELETE"]);
var active;
function store(name) {
  try {
    return import_api2.findStore(name);
  } catch {
    return;
  }
}
function markOwn(ctx, tracker, props, methods, scope) {
  ctx.waitFor(import_api2.filters.byProps(...props), (module2) => {
    for (const method of methods) {
      if (typeof module2?.[method] !== "function")
        continue;
      ctx.hook.before(module2, method, ({ args }) => {
        const id = args[0];
        if (typeof id === "string")
          tracker.markSelf(scope, id);
      });
    }
  });
}
var textOf = (entry) => t(`text.${entry.kind}`, { name: entry.name });
function formatTime(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function LogPanel({ log }) {
  const entries = import_api2.React.useSyncExternalStore(log.subscribe, () => log.entries);
  const Button = import_api2.Components.Button;
  const label = t("log.clear");
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "dl-field-row",
        children: [
          /* @__PURE__ */ jsx_runtime.jsxs("div", {
            className: "dl-field-text",
            children: [
              /* @__PURE__ */ jsx_runtime.jsx("div", {
                className: "dl-label",
                children: t("log.recent")
              }),
              /* @__PURE__ */ jsx_runtime.jsx("p", {
                className: "dl-hint",
                role: "status",
                children: entries.length ? t("log.count", { count: entries.length }) : t("log.empty")
              })
            ]
          }),
          Button ? /* @__PURE__ */ jsx_runtime.jsx(Button, {
            color: Button.Colors?.RED,
            size: Button.Sizes?.SMALL,
            disabled: !entries.length,
            onClick: () => log.clear(),
            children: label
          }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "dl-button",
            disabled: !entries.length,
            onClick: () => log.clear(),
            children: label
          })
        ]
      }),
      entries.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
        style: { listStyle: "none", margin: 0, padding: 0 },
        children: entries.map((entry, i) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
          className: "dl-hint",
          style: { padding: "0.125rem 0" },
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("time", {
              dateTime: new Date(entry.at).toISOString(),
              style: { fontVariantNumeric: "tabular-nums", marginInlineEnd: "0.5rem" },
              children: formatTime(entry.at)
            }),
            textOf(entry)
          ]
        }, `${entry.at}-${entry.id}-${i}`))
      })
    ]
  });
}
var relationship_notifier_default = import_api2.definePlugin({
  settings,
  start(ctx) {
    const log = new NotificationLog;
    const tracker = new Tracker;
    const runtime = { log };
    active = runtime;
    ctx.onDispose(() => {
      if (active === runtime)
        active = undefined;
      log.clear();
    });
    markOwn(ctx, tracker, ["removeRelationship", "addRelationship"], ["removeRelationship", "removeFriend", "cancelFriendRequest", "blockUser"], "relationship");
    markOwn(ctx, tracker, ["leaveGuild"], ["leaveGuild", "deleteGuild"], "guild");
    markOwn(ctx, tracker, ["closePrivateChannel"], ["closePrivateChannel"], "channel");
    const report = (entry) => {
      if (!ctx.settings.get(entry.kind))
        return;
      log.add(entry);
      if (ctx.settings.get("showToasts"))
        ctx.toast(textOf(entry), { type: "info", duration: 6000 });
    };
    ctx.hook.before(import_api2.Dispatcher, "dispatch", ({ args }) => {
      const action = args[0];
      if (!action || !TYPES.has(action.type))
        return;
      try {
        const entry = decide(action, storeLookup(store), tracker);
        if (entry)
          report(entry);
      } catch (e) {
        ctx.logger.error("Couldn't check", action.type, e);
      }
    });
    ctx.command({
      name: "relationships",
      get description() {
        return t("command.description");
      },
      execute() {
        const entries = log.entries;
        if (!entries.length)
          return { ephemeral: t("command.empty") };
        return { ephemeral: entries.slice(0, 20).map((e) => `${formatTime(e.at)}  ${textOf(e)}`).join(`
`) };
      }
    });
  },
  settingsPanel: () => active && /* @__PURE__ */ jsx_runtime.jsx(LogPanel, {
    log: active.log
  }),
  getLog: () => active?.log
});
