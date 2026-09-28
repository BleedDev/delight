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

// plugins/hide-blocked/index.ts
var exports_hide_blocked = {};
__export(exports_hide_blocked, {
  default: () => hide_blocked_default
});
module.exports = __toCommonJS(exports_hide_blocked);
var import_api2 = require("@evi/api");

// plugins/hide-blocked/filter.ts
var BLOCKED_GROUP = "MESSAGE_GROUP_BLOCKED";
var IGNORED_GROUP = "MESSAGE_GROUP_IGNORED";
var REPLY_TYPE = 19;
function safe(fn) {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}
function hiddenKind(message, rel, options) {
  if (!message)
    return null;
  const authorId = message.author?.id;
  if (message.blocked || safe(() => rel?.isBlockedForMessage?.(message)) || authorId != null && safe(() => rel?.isBlocked?.(authorId)))
    return "blocked";
  if (!options.ignored)
    return null;
  if (message.ignored || safe(() => rel?.isIgnoredForMessage?.(message)) || authorId != null && safe(() => rel?.isIgnored?.(authorId)))
    return "ignored";
  return null;
}
function isHiddenUser(userId, rel, options) {
  if (!options.active || userId == null)
    return false;
  return safe(() => rel?.isBlocked?.(userId)) || options.ignored && safe(() => rel?.isIgnored?.(userId));
}
function repliesToHidden(message, lookups, options) {
  const ref = message.messageReference;
  if (message.type !== REPLY_TYPE || ref?.message_id == null || !lookups.referenced)
    return false;
  let target;
  try {
    target = lookups.referenced(ref)?.message;
  } catch {
    return false;
  }
  return hiddenKind(target, lookups.relationships, options) != null;
}
function shouldHideMessage(message, collapse, lookups, options) {
  if (!options.active || !message)
    return false;
  if (collapse === BLOCKED_GROUP)
    return true;
  if (collapse === IGNORED_GROUP && options.ignored)
    return true;
  return options.replies && repliesToHidden(message, lookups, options);
}
function createReplyTracker(read, max = 5000) {
  const asked = new Map;
  const targetOf = (ref) => {
    try {
      return read(ref)?.message;
    } catch {
      return;
    }
  };
  return {
    referenced(ref) {
      const result = read(ref);
      if (asked.size >= max)
        asked.clear();
      asked.set(`${ref.channel_id}:${ref.message_id}`, { ref, message: result?.message });
      return result;
    },
    changed() {
      let changed = false;
      for (const entry of asked.values()) {
        const now = targetOf(entry.ref);
        if (now === entry.message)
          continue;
        entry.message = now;
        changed = true;
      }
      return changed;
    },
    clear: () => asked.clear(),
    get size() {
      return asked.size;
    }
  };
}
function shouldHideMemberRow(row, rel, options) {
  if (row == null || typeof row !== "object")
    return false;
  const { type, user } = row;
  return type === "MEMBER" && isHiddenUser(user?.id, rel, options);
}
function filterVoiceStates(states, rel, options) {
  if (!options.active || !Array.isArray(states) || states.length === 0)
    return states;
  const kept = states.filter((s) => !isHiddenUser(s?.user?.id, rel, options));
  return kept.length === states.length ? states : kept;
}
var PATCHES = {
  stream: {
    find: '"416cc9_1"',
    replace: [
      {
        match: /(\.forEach\((\i)=>\{var \i,\i;let \i,\i,\i;)(if\(\i&&\2\.isFirstMessageInForumPost\((\i)\)\)return;[^]{0,1500}?let \i=(\i)\(\4,\2,\i&&\i\);)/,
        with: "$1if($self?.hide?.($2,$5($4,$2,!1)))return;$3"
      },
      {
        match: /(\[\i,\i,\i,\i,\i,\i,\i,\i,\i,\i,\i)(\]\);return\{messages:\i,channelStream:\i,)/,
        with: "$1,$self?.useVersion?.()$2"
      }
    ]
  },
  memberList: {
    find: "getFirstApplicationIdOccurrences",
    replace: {
      match: /(renderRow=(\i)=>\{let\{section:\i,row:\i,rowIndex:\i\}=\2,\{channel:\i\}=this\.props,(\i)=this\.getRowProps\(\2\);)/,
      with: "$1if($self?.hideMember?.($3))return null;"
    }
  },
  voiceUsers: {
    find: '"ConnectedVoiceUser"',
    replace: {
      match: /(collapsedMax:\i=6,[^]{0,200}?=\(0,\i\.\i\)\(\i\.id,)(\i\?\?\i)\)/,
      with: "$1($self?.useVoiceStates?.($2)??$2))"
    }
  }
};

// plugins/hide-blocked/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.active": "Hide blocked messages",
    "settings.active.description": `Turn off to get Discord's collapsed "blocked messages" rows back. /hideblocked flips this.`,
    "settings.ignored": "Ignored users too",
    "settings.ignored.description": "Treat users you ignored like users you blocked.",
    "settings.replies": "Hide replies to them",
    "settings.replies.description": 'Also hide messages replying to a hidden user. When off, the reply stays and its quote reads "Blocked message".',
    "settings.memberList": "Hide from the member list",
    "settings.memberList.description": "Leave them out of a server's member list. Takes effect as the list updates.",
    "settings.voice": "Hide from voice channels",
    "settings.voice.description": "Leave them out of the users listed under voice channels.",
    "command.description": "Toggle hiding blocked users' messages",
    "command.on": "Blocked users' messages are hidden.",
    "command.off": "Blocked users' messages show as Discord's collapsed rows again."
  },
  de: {
    "settings.active": "Blockierte Nachrichten ausblenden",
    "settings.active.description": "Ausschalten, um Discords eingeklappte Zeilen „blockierte Nachrichten“ zurückzubekommen. /hideblocked schaltet das um.",
    "settings.ignored": "Auch ignorierte Nutzer",
    "settings.ignored.description": "Ignorierte Nutzer wie blockierte Nutzer behandeln.",
    "settings.replies": "Antworten auf sie ausblenden",
    "settings.replies.description": "Blendet auch Nachrichten aus, die auf einen ausgeblendeten Nutzer antworten. Wenn aus, bleibt die Antwort stehen und ihr Zitat lautet „Blockierte Nachricht“.",
    "settings.memberList": "In der Mitgliederliste ausblenden",
    "settings.memberList.description": "Lässt sie in der Mitgliederliste eines Servers weg. Wirkt, sobald sich die Liste aktualisiert.",
    "settings.voice": "In Sprachkanälen ausblenden",
    "settings.voice.description": "Lässt sie in der Nutzerliste unter den Sprachkanälen weg.",
    "command.description": "Ausblenden der Nachrichten blockierter Nutzer ein- oder ausschalten",
    "command.on": "Nachrichten blockierter Nutzer werden ausgeblendet.",
    "command.off": "Nachrichten blockierter Nutzer erscheinen wieder als Discords eingeklappte Zeilen."
  },
  es: {
    "settings.active": "Ocultar mensajes bloqueados",
    "settings.active.description": "Desactívalo para recuperar las filas plegadas de «mensajes bloqueados» de Discord. /hideblocked lo activa o desactiva.",
    "settings.ignored": "También usuarios ignorados",
    "settings.ignored.description": "Trata a los usuarios que ignoraste como a los que bloqueaste.",
    "settings.replies": "Ocultar respuestas a ellos",
    "settings.replies.description": "También oculta los mensajes que responden a un usuario oculto. Si está desactivado, la respuesta se queda y su cita dice «Mensaje bloqueado».",
    "settings.memberList": "Ocultar de la lista de miembros",
    "settings.memberList.description": "Los deja fuera de la lista de miembros de un servidor. Surte efecto cuando se actualiza la lista.",
    "settings.voice": "Ocultar de los canales de voz",
    "settings.voice.description": "Los deja fuera de los usuarios que aparecen bajo los canales de voz.",
    "command.description": "Activa o desactiva la ocultación de mensajes de usuarios bloqueados",
    "command.on": "Los mensajes de usuarios bloqueados están ocultos.",
    "command.off": "Los mensajes de usuarios bloqueados vuelven a mostrarse como las filas plegadas de Discord."
  },
  fr: {
    "settings.active": "Masquer les messages bloqués",
    "settings.active.description": "Désactive pour retrouver les lignes repliées « messages bloqués » de Discord. /hideblocked l'active ou le désactive.",
    "settings.ignored": "Aussi les utilisateurs ignorés",
    "settings.ignored.description": "Traite les utilisateurs que tu as ignorés comme ceux que tu as bloqués.",
    "settings.replies": "Masquer les réponses à ces utilisateurs",
    "settings.replies.description": "Masque aussi les messages qui répondent à un utilisateur masqué. Désactivé, la réponse reste et sa citation affiche « Message bloqué ».",
    "settings.memberList": "Masquer de la liste des membres",
    "settings.memberList.description": "Les retire de la liste des membres d'un serveur. Prend effet à la mise à jour de la liste.",
    "settings.voice": "Masquer des salons vocaux",
    "settings.voice.description": "Les retire des utilisateurs listés sous les salons vocaux.",
    "command.description": "Active ou désactive le masquage des messages des utilisateurs bloqués",
    "command.on": "Les messages des utilisateurs bloqués sont masqués.",
    "command.off": "Les messages des utilisateurs bloqués s'affichent de nouveau en lignes repliées de Discord."
  },
  ja: {
    "settings.active": "ブロックしたメッセージを非表示",
    "settings.active.description": "オフにすると、Discord の折りたたまれた「ブロックしたメッセージ」の行が戻ります。/hideblocked で切り替えられます。",
    "settings.ignored": "無視したユーザーも対象にする",
    "settings.ignored.description": "無視したユーザーを、ブロックしたユーザーと同じように扱います。",
    "settings.replies": "そのユーザーへの返信を非表示",
    "settings.replies.description": "非表示のユーザーへの返信メッセージも隠します。オフの場合、返信は残り、引用部分は「ブロックしたメッセージ」と表示されます。",
    "settings.memberList": "メンバーリストから非表示",
    "settings.memberList.description": "サーバーのメンバーリストに表示しません。リストが更新されると反映されます。",
    "settings.voice": "ボイスチャンネルから非表示",
    "settings.voice.description": "ボイスチャンネルの下に並ぶユーザーに表示しません。",
    "command.description": "ブロックしたユーザーのメッセージの非表示を切り替える",
    "command.on": "ブロックしたユーザーのメッセージを非表示にしました。",
    "command.off": "ブロックしたユーザーのメッセージが、Discord の折りたたみ行として表示されるようになりました。"
  },
  pl: {
    "settings.active": "Ukrywaj zablokowane wiadomości",
    "settings.active.description": "Wyłącz, aby wróciły zwinięte wiersze „zablokowanych wiadomości” z Discorda. Przełączysz to poleceniem /hideblocked.",
    "settings.ignored": "Także ignorowani użytkownicy",
    "settings.ignored.description": "Traktuj zignorowanych użytkowników tak jak zablokowanych.",
    "settings.replies": "Ukrywaj odpowiedzi do nich",
    "settings.replies.description": "Ukrywa też wiadomości odpowiadające ukrytemu użytkownikowi. Gdy wyłączone, odpowiedź zostaje, a jej cytat brzmi „Zablokowana wiadomość”.",
    "settings.memberList": "Ukrywaj na liście członków",
    "settings.memberList.description": "Pomija ich na liście członków serwera. Działa po odświeżeniu listy.",
    "settings.voice": "Ukrywaj na kanałach głosowych",
    "settings.voice.description": "Pomija ich wśród użytkowników wyświetlanych pod kanałami głosowymi.",
    "command.description": "Włącz lub wyłącz ukrywanie wiadomości zablokowanych użytkowników",
    "command.on": "Wiadomości zablokowanych użytkowników są ukryte.",
    "command.off": "Wiadomości zablokowanych użytkowników znów pojawiają się jako zwinięte wiersze Discorda."
  },
  "pt-BR": {
    "settings.active": "Ocultar mensagens bloqueadas",
    "settings.active.description": "Desative para voltar às linhas recolhidas de “mensagens bloqueadas” do Discord. /hideblocked ativa ou desativa.",
    "settings.ignored": "Usuários ignorados também",
    "settings.ignored.description": "Trata os usuários que você ignorou como os que você bloqueou.",
    "settings.replies": "Ocultar respostas a eles",
    "settings.replies.description": "Também oculta mensagens que respondem a um usuário oculto. Desativado, a resposta continua e a citação mostra “Mensagem bloqueada”.",
    "settings.memberList": "Ocultar da lista de membros",
    "settings.memberList.description": "Deixa eles de fora da lista de membros de um servidor. Vale quando a lista for atualizada.",
    "settings.voice": "Ocultar dos canais de voz",
    "settings.voice.description": "Deixa eles de fora dos usuários listados embaixo dos canais de voz.",
    "command.description": "Ativa ou desativa a ocultação das mensagens de usuários bloqueados",
    "command.on": "As mensagens de usuários bloqueados estão ocultas.",
    "command.off": "As mensagens de usuários bloqueados voltam a aparecer como as linhas recolhidas do Discord."
  },
  ru: {
    "settings.active": "Скрывать сообщения заблокированных",
    "settings.active.description": "Выключите, чтобы вернуть свёрнутые строки Discord «заблокированные сообщения». Команда /hideblocked переключает это.",
    "settings.ignored": "И игнорируемых пользователей",
    "settings.ignored.description": "Относиться к игнорируемым пользователям так же, как к заблокированным.",
    "settings.replies": "Скрывать ответы им",
    "settings.replies.description": "Также скрывает сообщения-ответы скрытому пользователю. Если выключено, ответ остаётся, а в его цитате написано «Заблокированное сообщение».",
    "settings.memberList": "Скрывать в списке участников",
    "settings.memberList.description": "Не показывать их в списке участников сервера. Вступает в силу при обновлении списка.",
    "settings.voice": "Скрывать в голосовых каналах",
    "settings.voice.description": "Не показывать их среди пользователей под голосовыми каналами.",
    "command.description": "Включить или выключить скрытие сообщений заблокированных пользователей",
    "command.on": "Сообщения заблокированных пользователей скрыты.",
    "command.off": "Сообщения заблокированных пользователей снова показываются свёрнутыми строками Discord."
  },
  tr: {
    "settings.active": "Engellenen mesajları gizle",
    "settings.active.description": `Kapatırsan Discord'un daralmış "engellenen mesajlar" satırları geri gelir. /hideblocked bunu açıp kapatır.`,
    "settings.ignored": "Yok sayılan kullanıcılar da",
    "settings.ignored.description": "Yok saydığın kullanıcılara engellediğin kullanıcılar gibi davran.",
    "settings.replies": "Onlara verilen yanıtları gizle",
    "settings.replies.description": 'Gizlenen bir kullanıcıya yanıt veren mesajları da gizler. Kapalıyken yanıt kalır ve alıntısında "Engellenen mesaj" yazar.',
    "settings.memberList": "Üye listesinde gizle",
    "settings.memberList.description": "Bir sunucunun üye listesinde görünmezler. Liste güncellenince geçerli olur.",
    "settings.voice": "Ses kanallarında gizle",
    "settings.voice.description": "Ses kanallarının altında listelenen kullanıcılar arasında görünmezler.",
    "command.description": "Engellenen kullanıcıların mesajlarını gizlemeyi aç veya kapat",
    "command.on": "Engellenen kullanıcıların mesajları gizlendi.",
    "command.off": "Engellenen kullanıcıların mesajları yine Discord'un daralmış satırları olarak görünüyor."
  }
});

// plugins/hide-blocked/index.ts
var settings = {
  active: {
    type: "boolean",
    get label() {
      return t("settings.active");
    },
    get description() {
      return t("settings.active.description");
    },
    default: true
  },
  ignored: {
    type: "boolean",
    get label() {
      return t("settings.ignored");
    },
    get description() {
      return t("settings.ignored.description");
    },
    default: true
  },
  replies: {
    type: "boolean",
    get label() {
      return t("settings.replies");
    },
    get description() {
      return t("settings.replies.description");
    },
    default: false
  },
  memberList: {
    type: "boolean",
    get label() {
      return t("settings.memberList");
    },
    get description() {
      return t("settings.memberList.description");
    },
    default: true
  },
  voice: {
    type: "boolean",
    get label() {
      return t("settings.voice");
    },
    get description() {
      return t("settings.voice.description");
    },
    default: false
  }
};
var options;
var relationships;
var referencedStore;
var replies = createReplyTracker((ref) => referencedStore?.getMessageByReference?.(ref));
var lookups = {
  get relationships() {
    return relationships;
  },
  referenced: replies.referenced
};
var version = 0;
var listeners = new Set;
function bump() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(cb) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
function useVersion() {
  return import_api2.React.useSyncExternalStore(subscribe, () => version);
}
var voiceCache = new WeakMap;
var hide_blocked_default = import_api2.definePlugin({
  settings,
  patches: [PATCHES.stream, PATCHES.memberList, PATCHES.voiceUsers],
  hide(message, collapse) {
    return !!options && shouldHideMessage(message, collapse, lookups, options);
  },
  useVersion,
  hideMember(row) {
    return !!options?.memberList && shouldHideMemberRow(row, relationships, options);
  },
  useVoiceStates(states) {
    const v = useVersion();
    if (!options?.voice || !Array.isArray(states))
      return states;
    const cached = voiceCache.get(states);
    if (cached?.version === v)
      return cached.out;
    const out = filterVoiceStates(states, relationships, options);
    voiceCache.set(states, { version: v, out });
    return out;
  },
  start(ctx) {
    relationships = import_api2.findStore("RelationshipStore");
    referencedStore = import_api2.findStore("ReferencedMessageStore");
    options = { ...ctx.settings.all };
    if (!relationships)
      ctx.logger.warn("RelationshipStore not found, only Discord's own blocked flags are used");
    const onRelationships = () => void (options?.active && bump());
    const onReferenced = () => void (options?.active && options.replies && replies.changed() && bump());
    relationships?.addChangeListener?.(onRelationships);
    referencedStore?.addChangeListener?.(onReferenced);
    ctx.settings.onChange((values) => {
      options = { ...values };
      bump();
    });
    ctx.command({
      name: "hideblocked",
      get description() {
        return t("command.description");
      },
      execute() {
        const next = !ctx.settings.get("active");
        ctx.settings.set("active", next);
        return { ephemeral: next ? t("command.on") : t("command.off") };
      }
    });
    ctx.onDispose(() => {
      relationships?.removeChangeListener?.(onRelationships);
      referencedStore?.removeChangeListener?.(onReferenced);
      options = undefined;
      relationships = undefined;
      referencedStore = undefined;
      replies.clear();
      bump();
    });
    bump();
  }
});
