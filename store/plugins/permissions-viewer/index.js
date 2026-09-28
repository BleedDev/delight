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

// plugins/permissions-viewer/index.tsx
var exports_permissions_viewer = {};
__export(exports_permissions_viewer, {
  default: () => permissions_viewer_default
});
module.exports = __toCommonJS(exports_permissions_viewer);
var import_api2 = require("@evi/api");

// plugins/permissions-viewer/perms.ts
var TABLE = [
  [0, "CREATE_INSTANT_INVITE", "Create Invite"],
  [1, "KICK_MEMBERS", "Kick Members"],
  [2, "BAN_MEMBERS", "Ban Members"],
  [3, "ADMINISTRATOR", "Administrator"],
  [4, "MANAGE_CHANNELS", "Manage Channels"],
  [5, "MANAGE_GUILD", "Manage Server"],
  [6, "ADD_REACTIONS", "Add Reactions"],
  [7, "VIEW_AUDIT_LOG", "View Audit Log"],
  [8, "PRIORITY_SPEAKER", "Priority Speaker"],
  [9, "STREAM", "Video"],
  [10, "VIEW_CHANNEL", "View Channels"],
  [11, "SEND_MESSAGES", "Send Messages"],
  [12, "SEND_TTS_MESSAGES", "Send Text-to-Speech Messages"],
  [13, "MANAGE_MESSAGES", "Manage Messages"],
  [14, "EMBED_LINKS", "Embed Links"],
  [15, "ATTACH_FILES", "Attach Files"],
  [16, "READ_MESSAGE_HISTORY", "Read Message History"],
  [17, "MENTION_EVERYONE", "Mention @everyone, @here and All Roles"],
  [18, "USE_EXTERNAL_EMOJIS", "Use External Emoji"],
  [19, "VIEW_GUILD_INSIGHTS", "View Server Insights"],
  [20, "CONNECT", "Connect"],
  [21, "SPEAK", "Speak"],
  [22, "MUTE_MEMBERS", "Mute Members"],
  [23, "DEAFEN_MEMBERS", "Deafen Members"],
  [24, "MOVE_MEMBERS", "Move Members"],
  [25, "USE_VAD", "Use Voice Activity"],
  [26, "CHANGE_NICKNAME", "Change Nickname"],
  [27, "MANAGE_NICKNAMES", "Manage Nicknames"],
  [28, "MANAGE_ROLES", "Manage Roles"],
  [29, "MANAGE_WEBHOOKS", "Manage Webhooks"],
  [30, "MANAGE_GUILD_EXPRESSIONS", "Manage Expressions"],
  [31, "USE_APPLICATION_COMMANDS", "Use Application Commands"],
  [32, "REQUEST_TO_SPEAK", "Request to Speak"],
  [33, "MANAGE_EVENTS", "Manage Events"],
  [34, "MANAGE_THREADS", "Manage Threads"],
  [35, "CREATE_PUBLIC_THREADS", "Create Public Threads"],
  [36, "CREATE_PRIVATE_THREADS", "Create Private Threads"],
  [37, "USE_EXTERNAL_STICKERS", "Use External Stickers"],
  [38, "SEND_MESSAGES_IN_THREADS", "Send Messages in Threads"],
  [39, "USE_EMBEDDED_ACTIVITIES", "Use Activities"],
  [40, "MODERATE_MEMBERS", "Timeout Members"],
  [41, "VIEW_CREATOR_MONETIZATION_ANALYTICS", "View Server Subscription Insights"],
  [42, "USE_SOUNDBOARD", "Use Soundboard"],
  [43, "CREATE_GUILD_EXPRESSIONS", "Create Expressions"],
  [44, "CREATE_EVENTS", "Create Events"],
  [45, "USE_EXTERNAL_SOUNDS", "Use External Sounds"],
  [46, "SEND_VOICE_MESSAGES", "Send Voice Messages"],
  [49, "SEND_POLLS", "Create Polls"],
  [50, "USE_EXTERNAL_APPS", "Use External Apps"],
  [51, "PIN_MESSAGES", "Pin Messages"],
  [52, "BYPASS_SLOWMODE", "Bypass Slowmode"]
];
var PERMISSIONS = TABLE.map(([bit, key, name]) => ({ bit, flag: 1n << BigInt(bit), key, name }));
var Permission = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.flag]));
var ADMINISTRATOR = 1n << 3n;
var ALL_PERMISSIONS = PERMISSIONS.reduce((all, p) => all | p.flag, 0n);
function permissionsIn(bits) {
  const known = PERMISSIONS.filter((p) => bits & p.flag);
  const unknown = [];
  for (let bit = 0;bit < 64; bit++) {
    const flag = 1n << BigInt(bit);
    if (bits & flag && !(ALL_PERMISSIONS & flag))
      unknown.push({ bit, flag, key: `BIT_${bit}`, name: `Unknown (bit ${bit})` });
  }
  return [...known, ...unknown];
}
function toBits(value) {
  if (typeof value === "bigint")
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value))
    return BigInt(value);
  return 0n;
}
var list = (v) => !v ? [] : Array.isArray(v) ? v : Object.values(v);
var isMemberOverwrite = (o) => o.type === 1 || o.type === "member" || o.type === "1";
function sortRoles(roles, guildId) {
  return [...roles].sort((a, b) => (a.id === guildId ? 1 : 0) - (b.id === guildId ? 1 : 0) || (b.position ?? 0) - (a.position ?? 0));
}
function computePermissions(input) {
  const { guildId, userId } = input;
  const byId = new Map(list(input.roles).map((r) => [r.id, r]));
  const everyone = byId.get(guildId);
  const memberRoles = sortRoles(input.memberRoleIds.filter((id) => id !== guildId).flatMap((id) => byId.get(id) ?? []), guildId);
  const baseRoles = [...memberRoles, ...everyone ? [everyone] : []];
  const sources = new Map;
  let perms = 0n;
  for (const role of [...baseRoles].reverse())
    perms |= toBits(role.permissions);
  const everything = (source) => ({
    permissions: ALL_PERMISSIONS,
    entries: PERMISSIONS.map((p) => ({ ...p, granted: true, source }))
  });
  if (input.ownerId && input.ownerId === userId)
    return everything({ kind: "owner" });
  if (perms & ADMINISTRATOR) {
    const admin = baseRoles.find((r) => toBits(r.permissions) & ADMINISTRATOR);
    return everything({ kind: "administrator", roleId: admin.id });
  }
  for (const p of PERMISSIONS) {
    const role = baseRoles.find((r) => toBits(r.permissions) & p.flag);
    if (role)
      sources.set(p.flag, { kind: "role", roleId: role.id });
  }
  if (input.overwrites) {
    const overwrites = list(input.overwrites);
    const apply = (allow2, deny2, source) => {
      perms &= ~deny2;
      perms |= allow2;
      for (const p of PERMISSIONS) {
        if (allow2 & p.flag)
          sources.set(p.flag, source(p.flag, true));
        else if (deny2 & p.flag)
          sources.set(p.flag, source(p.flag, false));
      }
    };
    const everyoneOw = overwrites.find((o) => o.id === guildId && !isMemberOverwrite(o));
    if (everyoneOw)
      apply(toBits(everyoneOw.allow), toBits(everyoneOw.deny), () => ({ kind: "overwrite", target: "everyone", id: guildId }));
    const memberRoleIds = new Set(memberRoles.map((r) => r.id));
    const roleOws = sortRoles(overwrites.filter((o) => !isMemberOverwrite(o) && o.id !== guildId && memberRoleIds.has(o.id)).map((o) => ({ ...o, permissions: 0n, position: byId.get(o.id)?.position })), guildId);
    let allow = 0n, deny = 0n;
    for (const o of roleOws) {
      allow |= toBits(o.allow);
      deny |= toBits(o.deny);
    }
    apply(allow, deny, (flag, allowed) => ({
      kind: "overwrite",
      target: "role",
      id: roleOws.find((o) => toBits(allowed ? o.allow : o.deny) & flag).id
    }));
    const memberOw = overwrites.find((o) => o.id === userId && isMemberOverwrite(o));
    if (memberOw)
      apply(toBits(memberOw.allow), toBits(memberOw.deny), () => ({ kind: "overwrite", target: "member", id: userId }));
  }
  return {
    permissions: perms,
    entries: PERMISSIONS.map((p) => ({ ...p, granted: !!(perms & p.flag), source: sources.get(p.flag) ?? { kind: "none" } }))
  };
}
function summarizeOverwrites(guildId, overwrites, roles = []) {
  const position = new Map(list(roles).map((r) => [r.id, r.position ?? 0]));
  const rank = (o) => o.id === guildId && !isMemberOverwrite(o) ? 0 : isMemberOverwrite(o) ? 2 : 1;
  return list(overwrites).sort((a, b) => rank(a) - rank(b) || (position.get(b.id) ?? 0) - (position.get(a.id) ?? 0)).map((o) => ({
    id: o.id,
    target: rank(o) === 0 ? "everyone" : rank(o) === 1 ? "role" : "member",
    allowed: permissionsIn(toBits(o.allow)),
    denied: permissionsIn(toBits(o.deny))
  }));
}

// plugins/permissions-viewer/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "perm.CREATE_INSTANT_INVITE": "Create Invite",
    "perm.KICK_MEMBERS": "Kick Members",
    "perm.BAN_MEMBERS": "Ban Members",
    "perm.ADMINISTRATOR": "Administrator",
    "perm.MANAGE_CHANNELS": "Manage Channels",
    "perm.MANAGE_GUILD": "Manage Server",
    "perm.ADD_REACTIONS": "Add Reactions",
    "perm.VIEW_AUDIT_LOG": "View Audit Log",
    "perm.PRIORITY_SPEAKER": "Priority Speaker",
    "perm.STREAM": "Video",
    "perm.VIEW_CHANNEL": "View Channels",
    "perm.SEND_MESSAGES": "Send Messages",
    "perm.SEND_TTS_MESSAGES": "Send Text-to-Speech Messages",
    "perm.MANAGE_MESSAGES": "Manage Messages",
    "perm.EMBED_LINKS": "Embed Links",
    "perm.ATTACH_FILES": "Attach Files",
    "perm.READ_MESSAGE_HISTORY": "Read Message History",
    "perm.MENTION_EVERYONE": "Mention @everyone, @here and All Roles",
    "perm.USE_EXTERNAL_EMOJIS": "Use External Emoji",
    "perm.VIEW_GUILD_INSIGHTS": "View Server Insights",
    "perm.CONNECT": "Connect",
    "perm.SPEAK": "Speak",
    "perm.MUTE_MEMBERS": "Mute Members",
    "perm.DEAFEN_MEMBERS": "Deafen Members",
    "perm.MOVE_MEMBERS": "Move Members",
    "perm.USE_VAD": "Use Voice Activity",
    "perm.CHANGE_NICKNAME": "Change Nickname",
    "perm.MANAGE_NICKNAMES": "Manage Nicknames",
    "perm.MANAGE_ROLES": "Manage Roles",
    "perm.MANAGE_WEBHOOKS": "Manage Webhooks",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Manage Expressions",
    "perm.USE_APPLICATION_COMMANDS": "Use Application Commands",
    "perm.REQUEST_TO_SPEAK": "Request to Speak",
    "perm.MANAGE_EVENTS": "Manage Events",
    "perm.MANAGE_THREADS": "Manage Threads",
    "perm.CREATE_PUBLIC_THREADS": "Create Public Threads",
    "perm.CREATE_PRIVATE_THREADS": "Create Private Threads",
    "perm.USE_EXTERNAL_STICKERS": "Use External Stickers",
    "perm.SEND_MESSAGES_IN_THREADS": "Send Messages in Threads",
    "perm.USE_EMBEDDED_ACTIVITIES": "Use Activities",
    "perm.MODERATE_MEMBERS": "Timeout Members",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "View Server Subscription Insights",
    "perm.USE_SOUNDBOARD": "Use Soundboard",
    "perm.CREATE_GUILD_EXPRESSIONS": "Create Expressions",
    "perm.CREATE_EVENTS": "Create Events",
    "perm.USE_EXTERNAL_SOUNDS": "Use External Sounds",
    "perm.SEND_VOICE_MESSAGES": "Send Voice Messages",
    "perm.SEND_POLLS": "Create Polls",
    "perm.USE_EXTERNAL_APPS": "Use External Apps",
    "perm.PIN_MESSAGES": "Pin Messages",
    "perm.BYPASS_SLOWMODE": "Bypass Slowmode",
    "perm.unknown": "Unknown (bit {bit})",
    "category.General": "General",
    "category.Membership": "Membership",
    "category.Text": "Text",
    "category.Voice": "Voice",
    "category.Apps": "Apps",
    "category.Events": "Events",
    "category.Advanced": "Advanced",
    "category.Other": "Other",
    "ui.close": "Close",
    "ui.sections": "Sections",
    "ui.show": "Show",
    "ui.searchLabel": "Search permissions",
    "ui.search": "Search",
    "ui.showAll": "Show all permissions",
    "ui.nothing": "Nothing to show.",
    "filter.all": "All",
    "filter.granted": "Granted",
    "filter.notGranted": "Not granted",
    "filter.allowed": "Allowed",
    "filter.denied": "Denied",
    "empty.match.all": "No permissions match “{query}”.",
    "empty.match.granted": "No granted permissions match “{query}”.",
    "empty.match.notGranted": "No permissions that aren't granted match “{query}”.",
    "empty.match.allowed": "No allowed permissions match “{query}”.",
    "empty.match.denied": "No denied permissions match “{query}”.",
    "empty.none.granted": "No permissions are granted here.",
    "empty.none.notGranted": "Every permission is granted here.",
    "empty.none.allowed": "No permissions are allowed here.",
    "empty.none.denied": "No permissions are denied here.",
    "count.of": "{granted} of {total}",
    "count.granted": "{count} granted",
    "count.allowedDenied": "{allowed} allowed, {denied} denied",
    "chip.overwrite": "overwrite",
    "chip.owner": "Server owner",
    "chip.member": "Member",
    "chip.deletedRole": "Deleted role",
    "chip.admin": "Administrator through the {role} role",
    "chip.everyone": "Granted to @everyone",
    "chip.role": "Granted by the {role} role",
    "chip.everyone.allowed": "Allowed by this channel's @everyone overwrite",
    "chip.everyone.denied": "Denied by this channel's @everyone overwrite",
    "chip.roleOverwrite.allowed": "Allowed by this channel's {role} overwrite",
    "chip.roleOverwrite.denied": "Denied by this channel's {role} overwrite",
    "chip.memberOverwrite.allowed": "Allowed by an overwrite for this member",
    "chip.memberOverwrite.denied": "Denied by an overwrite for this member",
    "notice.owner": "Server owner: has every permission, and channel overwrites don't apply.",
    "notice.admin": "Administrator through the {role} role: has every permission, and channel overwrites don't apply.",
    "notice.adminDeleted": "Administrator through a deleted role: has every permission, and channel overwrites don't apply.",
    "notice.roleAdmin": "Administrator: this role has every permission and bypasses channel overwrites.",
    "notice.overwrite.member": "Member overwrite: anything not listed is inherited from the server.",
    "notice.overwrite.role": "Role overwrite: anything not listed is inherited from the server.",
    "empty.overwrite": "This overwrite doesn't allow or deny anything, so everything is inherited from the server.",
    "empty.noOverwrites": "This channel has no overwrites, so everyone gets their server role permissions here.",
    "section.inChannel": "In {channel}",
    "section.serverWide": "Server-wide",
    "section.you": "You",
    "section.overwrites": "Overwrites",
    "section.roles": "Roles",
    "this.channel": "this channel",
    "this.server": "this server",
    "subtitle.memberChannel": "Permissions in {channel} · {guild}",
    "subtitle.member": "Permissions in {guild}",
    "subtitle.role": "Role permissions · {guild}",
    "subtitle.channel": "Channel permissions · {overwrites} · {guild}",
    "subtitle.guild": "Server permissions · {roles}",
    "overwrites.count": { one: "{count} overwrite", other: "{count} overwrites" },
    "roles.count": { one: "{count} role", other: "{count} roles" },
    "menu.view": "View Permissions",
    "toast.fail": "Couldn't read the permissions"
  },
  de: {
    "perm.CREATE_INSTANT_INVITE": "Einladung erstellen",
    "perm.KICK_MEMBERS": "Mitglieder kicken",
    "perm.BAN_MEMBERS": "Mitglieder bannen",
    "perm.ADMINISTRATOR": "Administrator",
    "perm.MANAGE_CHANNELS": "Kanäle verwalten",
    "perm.MANAGE_GUILD": "Server verwalten",
    "perm.ADD_REACTIONS": "Reaktionen hinzufügen",
    "perm.VIEW_AUDIT_LOG": "Audit-Log anzeigen",
    "perm.PRIORITY_SPEAKER": "Vorrangiger Sprecher",
    "perm.STREAM": "Video",
    "perm.VIEW_CHANNEL": "Kanäle ansehen",
    "perm.SEND_MESSAGES": "Nachrichten senden",
    "perm.SEND_TTS_MESSAGES": "Text-zu-Sprache-Nachrichten senden",
    "perm.MANAGE_MESSAGES": "Nachrichten verwalten",
    "perm.EMBED_LINKS": "Links einbetten",
    "perm.ATTACH_FILES": "Dateien anhängen",
    "perm.READ_MESSAGE_HISTORY": "Nachrichtenverlauf anzeigen",
    "perm.MENTION_EVERYONE": "@everyone, @here und alle Rollen erwähnen",
    "perm.USE_EXTERNAL_EMOJIS": "Externe Emojis verwenden",
    "perm.VIEW_GUILD_INSIGHTS": "Server-Einblicke anzeigen",
    "perm.CONNECT": "Verbinden",
    "perm.SPEAK": "Sprechen",
    "perm.MUTE_MEMBERS": "Mitglieder stummschalten",
    "perm.DEAFEN_MEMBERS": "Mitgliedern den Ton nehmen",
    "perm.MOVE_MEMBERS": "Mitglieder verschieben",
    "perm.USE_VAD": "Sprachaktivierung verwenden",
    "perm.CHANGE_NICKNAME": "Nickname ändern",
    "perm.MANAGE_NICKNAMES": "Nicknames verwalten",
    "perm.MANAGE_ROLES": "Rollen verwalten",
    "perm.MANAGE_WEBHOOKS": "Webhooks verwalten",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Ausdrücke verwalten",
    "perm.USE_APPLICATION_COMMANDS": "Anwendungsbefehle verwenden",
    "perm.REQUEST_TO_SPEAK": "Sprechen anfragen",
    "perm.MANAGE_EVENTS": "Events verwalten",
    "perm.MANAGE_THREADS": "Threads verwalten",
    "perm.CREATE_PUBLIC_THREADS": "Öffentliche Threads erstellen",
    "perm.CREATE_PRIVATE_THREADS": "Private Threads erstellen",
    "perm.USE_EXTERNAL_STICKERS": "Externe Sticker verwenden",
    "perm.SEND_MESSAGES_IN_THREADS": "Nachrichten in Threads senden",
    "perm.USE_EMBEDDED_ACTIVITIES": "Aktivitäten verwenden",
    "perm.MODERATE_MEMBERS": "Mitglieder in Auszeit schicken",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Einblicke in Server-Abos anzeigen",
    "perm.USE_SOUNDBOARD": "Soundboard verwenden",
    "perm.CREATE_GUILD_EXPRESSIONS": "Ausdrücke erstellen",
    "perm.CREATE_EVENTS": "Events erstellen",
    "perm.USE_EXTERNAL_SOUNDS": "Externe Sounds verwenden",
    "perm.SEND_VOICE_MESSAGES": "Sprachnachrichten senden",
    "perm.SEND_POLLS": "Umfragen erstellen",
    "perm.USE_EXTERNAL_APPS": "Externe Apps verwenden",
    "perm.PIN_MESSAGES": "Nachrichten anheften",
    "perm.BYPASS_SLOWMODE": "Slowmode umgehen",
    "perm.unknown": "Unbekannt (Bit {bit})",
    "category.General": "Allgemein",
    "category.Membership": "Mitgliedschaft",
    "category.Text": "Text",
    "category.Voice": "Sprache",
    "category.Apps": "Apps",
    "category.Events": "Events",
    "category.Advanced": "Erweitert",
    "category.Other": "Sonstiges",
    "ui.close": "Schließen",
    "ui.sections": "Bereiche",
    "ui.show": "Anzeigen",
    "ui.searchLabel": "Berechtigungen durchsuchen",
    "ui.search": "Suchen",
    "ui.showAll": "Alle Berechtigungen anzeigen",
    "ui.nothing": "Nichts anzuzeigen.",
    "filter.all": "Alle",
    "filter.granted": "Erteilt",
    "filter.notGranted": "Nicht erteilt",
    "filter.allowed": "Erlaubt",
    "filter.denied": "Verweigert",
    "empty.match.all": "Keine Berechtigungen passen zu „{query}“.",
    "empty.match.granted": "Keine erteilten Berechtigungen passen zu „{query}“.",
    "empty.match.notGranted": "Keine nicht erteilten Berechtigungen passen zu „{query}“.",
    "empty.match.allowed": "Keine erlaubten Berechtigungen passen zu „{query}“.",
    "empty.match.denied": "Keine verweigerten Berechtigungen passen zu „{query}“.",
    "empty.none.granted": "Hier ist keine Berechtigung erteilt.",
    "empty.none.notGranted": "Hier sind alle Berechtigungen erteilt.",
    "empty.none.allowed": "Hier ist keine Berechtigung erlaubt.",
    "empty.none.denied": "Hier ist keine Berechtigung verweigert.",
    "count.of": "{granted} von {total}",
    "count.granted": "{count} erteilt",
    "count.allowedDenied": "{allowed} erlaubt, {denied} verweigert",
    "chip.overwrite": "Überschreibung",
    "chip.owner": "Servereigentümer",
    "chip.member": "Mitglied",
    "chip.deletedRole": "Gelöschte Rolle",
    "chip.admin": "Administrator durch die Rolle {role}",
    "chip.everyone": "An @everyone erteilt",
    "chip.role": "Von der Rolle {role} erteilt",
    "chip.everyone.allowed": "Durch die @everyone-Überschreibung dieses Kanals erlaubt",
    "chip.everyone.denied": "Durch die @everyone-Überschreibung dieses Kanals verweigert",
    "chip.roleOverwrite.allowed": "Durch die Überschreibung der Rolle {role} in diesem Kanal erlaubt",
    "chip.roleOverwrite.denied": "Durch die Überschreibung der Rolle {role} in diesem Kanal verweigert",
    "chip.memberOverwrite.allowed": "Durch eine Überschreibung für dieses Mitglied erlaubt",
    "chip.memberOverwrite.denied": "Durch eine Überschreibung für dieses Mitglied verweigert",
    "notice.owner": "Servereigentümer: hat alle Berechtigungen, Kanalüberschreibungen gelten nicht.",
    "notice.admin": "Administrator durch die Rolle {role}: hat alle Berechtigungen, Kanalüberschreibungen gelten nicht.",
    "notice.adminDeleted": "Administrator durch eine gelöschte Rolle: hat alle Berechtigungen, Kanalüberschreibungen gelten nicht.",
    "notice.roleAdmin": "Administrator: Diese Rolle hat alle Berechtigungen und ignoriert Kanalüberschreibungen.",
    "notice.overwrite.member": "Mitglieder-Überschreibung: Alles, was nicht aufgeführt ist, wird vom Server übernommen.",
    "notice.overwrite.role": "Rollen-Überschreibung: Alles, was nicht aufgeführt ist, wird vom Server übernommen.",
    "empty.overwrite": "Diese Überschreibung erlaubt oder verweigert nichts, daher wird alles vom Server übernommen.",
    "empty.noOverwrites": "Dieser Kanal hat keine Überschreibungen, daher gelten hier für alle die Berechtigungen ihrer Serverrollen.",
    "section.inChannel": "In {channel}",
    "section.serverWide": "Serverweit",
    "section.you": "Du",
    "section.overwrites": "Überschreibungen",
    "section.roles": "Rollen",
    "this.channel": "diesem Kanal",
    "this.server": "diesem Server",
    "subtitle.memberChannel": "Berechtigungen in {channel} · {guild}",
    "subtitle.member": "Berechtigungen auf {guild}",
    "subtitle.role": "Rollenberechtigungen · {guild}",
    "subtitle.channel": "Kanalberechtigungen · {overwrites} · {guild}",
    "subtitle.guild": "Serverberechtigungen · {roles}",
    "overwrites.count": { one: "{count} Überschreibung", other: "{count} Überschreibungen" },
    "roles.count": { one: "{count} Rolle", other: "{count} Rollen" },
    "menu.view": "Berechtigungen anzeigen",
    "toast.fail": "Berechtigungen konnten nicht gelesen werden"
  },
  es: {
    "perm.CREATE_INSTANT_INVITE": "Crear invitación",
    "perm.KICK_MEMBERS": "Expulsar miembros",
    "perm.BAN_MEMBERS": "Banear miembros",
    "perm.ADMINISTRATOR": "Administrador",
    "perm.MANAGE_CHANNELS": "Gestionar canales",
    "perm.MANAGE_GUILD": "Gestionar servidor",
    "perm.ADD_REACTIONS": "Añadir reacciones",
    "perm.VIEW_AUDIT_LOG": "Ver el registro de auditoría",
    "perm.PRIORITY_SPEAKER": "Prioridad de palabra",
    "perm.STREAM": "Vídeo",
    "perm.VIEW_CHANNEL": "Ver canales",
    "perm.SEND_MESSAGES": "Enviar mensajes",
    "perm.SEND_TTS_MESSAGES": "Enviar mensajes de texto a voz",
    "perm.MANAGE_MESSAGES": "Gestionar mensajes",
    "perm.EMBED_LINKS": "Insertar enlaces",
    "perm.ATTACH_FILES": "Adjuntar archivos",
    "perm.READ_MESSAGE_HISTORY": "Ver el historial de mensajes",
    "perm.MENTION_EVERYONE": "Mencionar a @everyone, @here y todos los roles",
    "perm.USE_EXTERNAL_EMOJIS": "Usar emojis externos",
    "perm.VIEW_GUILD_INSIGHTS": "Ver información del servidor",
    "perm.CONNECT": "Conectar",
    "perm.SPEAK": "Hablar",
    "perm.MUTE_MEMBERS": "Silenciar miembros",
    "perm.DEAFEN_MEMBERS": "Ensordecer miembros",
    "perm.MOVE_MEMBERS": "Mover miembros",
    "perm.USE_VAD": "Usar detección de voz",
    "perm.CHANGE_NICKNAME": "Cambiar apodo",
    "perm.MANAGE_NICKNAMES": "Gestionar apodos",
    "perm.MANAGE_ROLES": "Gestionar roles",
    "perm.MANAGE_WEBHOOKS": "Gestionar webhooks",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Gestionar expresiones",
    "perm.USE_APPLICATION_COMMANDS": "Usar comandos de aplicación",
    "perm.REQUEST_TO_SPEAK": "Solicitar hablar",
    "perm.MANAGE_EVENTS": "Gestionar eventos",
    "perm.MANAGE_THREADS": "Gestionar hilos",
    "perm.CREATE_PUBLIC_THREADS": "Crear hilos públicos",
    "perm.CREATE_PRIVATE_THREADS": "Crear hilos privados",
    "perm.USE_EXTERNAL_STICKERS": "Usar stickers externos",
    "perm.SEND_MESSAGES_IN_THREADS": "Enviar mensajes en hilos",
    "perm.USE_EMBEDDED_ACTIVITIES": "Usar actividades",
    "perm.MODERATE_MEMBERS": "Aislar temporalmente a miembros",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Ver información de suscripciones del servidor",
    "perm.USE_SOUNDBOARD": "Usar panel de sonidos",
    "perm.CREATE_GUILD_EXPRESSIONS": "Crear expresiones",
    "perm.CREATE_EVENTS": "Crear eventos",
    "perm.USE_EXTERNAL_SOUNDS": "Usar sonidos externos",
    "perm.SEND_VOICE_MESSAGES": "Enviar mensajes de voz",
    "perm.SEND_POLLS": "Crear encuestas",
    "perm.USE_EXTERNAL_APPS": "Usar aplicaciones externas",
    "perm.PIN_MESSAGES": "Fijar mensajes",
    "perm.BYPASS_SLOWMODE": "Saltarse el modo lento",
    "perm.unknown": "Desconocido (bit {bit})",
    "category.General": "General",
    "category.Membership": "Membresía",
    "category.Text": "Texto",
    "category.Voice": "Voz",
    "category.Apps": "Aplicaciones",
    "category.Events": "Eventos",
    "category.Advanced": "Avanzado",
    "category.Other": "Otros",
    "ui.close": "Cerrar",
    "ui.sections": "Secciones",
    "ui.show": "Mostrar",
    "ui.searchLabel": "Buscar permisos",
    "ui.search": "Buscar",
    "ui.showAll": "Mostrar todos los permisos",
    "ui.nothing": "No hay nada que mostrar.",
    "filter.all": "Todos",
    "filter.granted": "Concedidos",
    "filter.notGranted": "No concedidos",
    "filter.allowed": "Permitidos",
    "filter.denied": "Denegados",
    "empty.match.all": "Ningún permiso coincide con «{query}».",
    "empty.match.granted": "Ningún permiso concedido coincide con «{query}».",
    "empty.match.notGranted": "Ningún permiso no concedido coincide con «{query}».",
    "empty.match.allowed": "Ningún permiso permitido coincide con «{query}».",
    "empty.match.denied": "Ningún permiso denegado coincide con «{query}».",
    "empty.none.granted": "Aquí no hay ningún permiso concedido.",
    "empty.none.notGranted": "Aquí están concedidos todos los permisos.",
    "empty.none.allowed": "Aquí no hay ningún permiso permitido.",
    "empty.none.denied": "Aquí no hay ningún permiso denegado.",
    "count.of": "{granted} de {total}",
    "count.granted": "{count} concedidos",
    "count.allowedDenied": "{allowed} permitidos, {denied} denegados",
    "chip.overwrite": "sobrescritura",
    "chip.owner": "Propietario del servidor",
    "chip.member": "Miembro",
    "chip.deletedRole": "Rol eliminado",
    "chip.admin": "Administrador mediante el rol {role}",
    "chip.everyone": "Concedido a @everyone",
    "chip.role": "Concedido por el rol {role}",
    "chip.everyone.allowed": "Permitido por la sobrescritura de @everyone de este canal",
    "chip.everyone.denied": "Denegado por la sobrescritura de @everyone de este canal",
    "chip.roleOverwrite.allowed": "Permitido por la sobrescritura del rol {role} en este canal",
    "chip.roleOverwrite.denied": "Denegado por la sobrescritura del rol {role} en este canal",
    "chip.memberOverwrite.allowed": "Permitido por una sobrescritura para este miembro",
    "chip.memberOverwrite.denied": "Denegado por una sobrescritura para este miembro",
    "notice.owner": "Propietario del servidor: tiene todos los permisos y las sobrescrituras de canal no se aplican.",
    "notice.admin": "Administrador mediante el rol {role}: tiene todos los permisos y las sobrescrituras de canal no se aplican.",
    "notice.adminDeleted": "Administrador mediante un rol eliminado: tiene todos los permisos y las sobrescrituras de canal no se aplican.",
    "notice.roleAdmin": "Administrador: este rol tiene todos los permisos y se salta las sobrescrituras de canal.",
    "notice.overwrite.member": "Sobrescritura de miembro: lo que no aparece se hereda del servidor.",
    "notice.overwrite.role": "Sobrescritura de rol: lo que no aparece se hereda del servidor.",
    "empty.overwrite": "Esta sobrescritura no permite ni deniega nada, así que todo se hereda del servidor.",
    "empty.noOverwrites": "Este canal no tiene sobrescrituras, así que aquí todos tienen los permisos de sus roles del servidor.",
    "section.inChannel": "En {channel}",
    "section.serverWide": "En todo el servidor",
    "section.you": "Tú",
    "section.overwrites": "Sobrescrituras",
    "section.roles": "Roles",
    "this.channel": "este canal",
    "this.server": "este servidor",
    "subtitle.memberChannel": "Permisos en {channel} · {guild}",
    "subtitle.member": "Permisos en {guild}",
    "subtitle.role": "Permisos del rol · {guild}",
    "subtitle.channel": "Permisos del canal · {overwrites} · {guild}",
    "subtitle.guild": "Permisos del servidor · {roles}",
    "overwrites.count": { one: "{count} sobrescritura", other: "{count} sobrescrituras" },
    "roles.count": { one: "{count} rol", other: "{count} roles" },
    "menu.view": "Ver permisos",
    "toast.fail": "No se pudieron leer los permisos"
  },
  fr: {
    "perm.CREATE_INSTANT_INVITE": "Créer une invitation",
    "perm.KICK_MEMBERS": "Expulser des membres",
    "perm.BAN_MEMBERS": "Bannir des membres",
    "perm.ADMINISTRATOR": "Administrateur",
    "perm.MANAGE_CHANNELS": "Gérer les salons",
    "perm.MANAGE_GUILD": "Gérer le serveur",
    "perm.ADD_REACTIONS": "Ajouter des réactions",
    "perm.VIEW_AUDIT_LOG": "Voir les logs du serveur",
    "perm.PRIORITY_SPEAKER": "Voix prioritaire",
    "perm.STREAM": "Vidéo",
    "perm.VIEW_CHANNEL": "Voir les salons",
    "perm.SEND_MESSAGES": "Envoyer des messages",
    "perm.SEND_TTS_MESSAGES": "Envoyer des messages de synthèse vocale",
    "perm.MANAGE_MESSAGES": "Gérer les messages",
    "perm.EMBED_LINKS": "Intégrer des liens",
    "perm.ATTACH_FILES": "Joindre des fichiers",
    "perm.READ_MESSAGE_HISTORY": "Voir les anciens messages",
    "perm.MENTION_EVERYONE": "Mentionner @everyone, @here et tous les rôles",
    "perm.USE_EXTERNAL_EMOJIS": "Utiliser des émojis externes",
    "perm.VIEW_GUILD_INSIGHTS": "Voir les analyses du serveur",
    "perm.CONNECT": "Se connecter",
    "perm.SPEAK": "Parler",
    "perm.MUTE_MEMBERS": "Rendre des membres muets",
    "perm.DEAFEN_MEMBERS": "Mettre en sourdine des membres",
    "perm.MOVE_MEMBERS": "Déplacer des membres",
    "perm.USE_VAD": "Utiliser la détection de la voix",
    "perm.CHANGE_NICKNAME": "Changer de pseudo",
    "perm.MANAGE_NICKNAMES": "Gérer les pseudos",
    "perm.MANAGE_ROLES": "Gérer les rôles",
    "perm.MANAGE_WEBHOOKS": "Gérer les webhooks",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Gérer les expressions",
    "perm.USE_APPLICATION_COMMANDS": "Utiliser les commandes d'application",
    "perm.REQUEST_TO_SPEAK": "Demander à parler",
    "perm.MANAGE_EVENTS": "Gérer les évènements",
    "perm.MANAGE_THREADS": "Gérer les fils",
    "perm.CREATE_PUBLIC_THREADS": "Créer des fils publics",
    "perm.CREATE_PRIVATE_THREADS": "Créer des fils privés",
    "perm.USE_EXTERNAL_STICKERS": "Utiliser des stickers externes",
    "perm.SEND_MESSAGES_IN_THREADS": "Envoyer des messages dans les fils",
    "perm.USE_EMBEDDED_ACTIVITIES": "Utiliser les activités",
    "perm.MODERATE_MEMBERS": "Exclure temporairement des membres",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Voir les analyses des abonnements du serveur",
    "perm.USE_SOUNDBOARD": "Utiliser la table de mixage",
    "perm.CREATE_GUILD_EXPRESSIONS": "Créer des expressions",
    "perm.CREATE_EVENTS": "Créer des évènements",
    "perm.USE_EXTERNAL_SOUNDS": "Utiliser des sons externes",
    "perm.SEND_VOICE_MESSAGES": "Envoyer des messages vocaux",
    "perm.SEND_POLLS": "Créer des sondages",
    "perm.USE_EXTERNAL_APPS": "Utiliser des applications externes",
    "perm.PIN_MESSAGES": "Épingler des messages",
    "perm.BYPASS_SLOWMODE": "Ignorer le mode lent",
    "perm.unknown": "Inconnue (bit {bit})",
    "category.General": "Général",
    "category.Membership": "Adhésion",
    "category.Text": "Texte",
    "category.Voice": "Vocal",
    "category.Apps": "Applications",
    "category.Events": "Évènements",
    "category.Advanced": "Avancé",
    "category.Other": "Autres",
    "ui.close": "Fermer",
    "ui.sections": "Sections",
    "ui.show": "Afficher",
    "ui.searchLabel": "Rechercher des permissions",
    "ui.search": "Rechercher",
    "ui.showAll": "Afficher toutes les permissions",
    "ui.nothing": "Rien à afficher.",
    "filter.all": "Toutes",
    "filter.granted": "Accordées",
    "filter.notGranted": "Non accordées",
    "filter.allowed": "Autorisées",
    "filter.denied": "Refusées",
    "empty.match.all": "Aucune permission ne correspond à « {query} ».",
    "empty.match.granted": "Aucune permission accordée ne correspond à « {query} ».",
    "empty.match.notGranted": "Aucune permission non accordée ne correspond à « {query} ».",
    "empty.match.allowed": "Aucune permission autorisée ne correspond à « {query} ».",
    "empty.match.denied": "Aucune permission refusée ne correspond à « {query} ».",
    "empty.none.granted": "Aucune permission n'est accordée ici.",
    "empty.none.notGranted": "Toutes les permissions sont accordées ici.",
    "empty.none.allowed": "Aucune permission n'est autorisée ici.",
    "empty.none.denied": "Aucune permission n'est refusée ici.",
    "count.of": "{granted} sur {total}",
    "count.granted": "{count} accordées",
    "count.allowedDenied": "{allowed} autorisées, {denied} refusées",
    "chip.overwrite": "remplacement",
    "chip.owner": "Propriétaire du serveur",
    "chip.member": "Membre",
    "chip.deletedRole": "Rôle supprimé",
    "chip.admin": "Administrateur via le rôle {role}",
    "chip.everyone": "Accordée à @everyone",
    "chip.role": "Accordée par le rôle {role}",
    "chip.everyone.allowed": "Autorisée par le remplacement @everyone de ce salon",
    "chip.everyone.denied": "Refusée par le remplacement @everyone de ce salon",
    "chip.roleOverwrite.allowed": "Autorisée par le remplacement du rôle {role} dans ce salon",
    "chip.roleOverwrite.denied": "Refusée par le remplacement du rôle {role} dans ce salon",
    "chip.memberOverwrite.allowed": "Autorisée par un remplacement pour ce membre",
    "chip.memberOverwrite.denied": "Refusée par un remplacement pour ce membre",
    "notice.owner": "Propriétaire du serveur : a toutes les permissions, et les remplacements de salon ne s'appliquent pas.",
    "notice.admin": "Administrateur via le rôle {role} : a toutes les permissions, et les remplacements de salon ne s'appliquent pas.",
    "notice.adminDeleted": "Administrateur via un rôle supprimé : a toutes les permissions, et les remplacements de salon ne s'appliquent pas.",
    "notice.roleAdmin": "Administrateur : ce rôle a toutes les permissions et ignore les remplacements de salon.",
    "notice.overwrite.member": "Remplacement de membre : ce qui n'est pas listé est hérité du serveur.",
    "notice.overwrite.role": "Remplacement de rôle : ce qui n'est pas listé est hérité du serveur.",
    "empty.overwrite": "Ce remplacement n'autorise ni ne refuse rien, tout est donc hérité du serveur.",
    "empty.noOverwrites": "Ce salon n'a aucun remplacement, donc chacun a ici les permissions de ses rôles du serveur.",
    "section.inChannel": "Dans {channel}",
    "section.serverWide": "Sur tout le serveur",
    "section.you": "Toi",
    "section.overwrites": "Remplacements",
    "section.roles": "Rôles",
    "this.channel": "ce salon",
    "this.server": "ce serveur",
    "subtitle.memberChannel": "Permissions dans {channel} · {guild}",
    "subtitle.member": "Permissions dans {guild}",
    "subtitle.role": "Permissions du rôle · {guild}",
    "subtitle.channel": "Permissions du salon · {overwrites} · {guild}",
    "subtitle.guild": "Permissions du serveur · {roles}",
    "overwrites.count": { one: "{count} remplacement", other: "{count} remplacements" },
    "roles.count": { one: "{count} rôle", other: "{count} rôles" },
    "menu.view": "Voir les permissions",
    "toast.fail": "Impossible de lire les permissions"
  },
  ja: {
    "perm.CREATE_INSTANT_INVITE": "招待を作成",
    "perm.KICK_MEMBERS": "メンバーをキック",
    "perm.BAN_MEMBERS": "メンバーをBAN",
    "perm.ADMINISTRATOR": "管理者",
    "perm.MANAGE_CHANNELS": "チャンネルの管理",
    "perm.MANAGE_GUILD": "サーバー管理",
    "perm.ADD_REACTIONS": "リアクションの追加",
    "perm.VIEW_AUDIT_LOG": "監査ログを表示",
    "perm.PRIORITY_SPEAKER": "優先スピーカー",
    "perm.STREAM": "動画",
    "perm.VIEW_CHANNEL": "チャンネルを見る",
    "perm.SEND_MESSAGES": "メッセージを送信",
    "perm.SEND_TTS_MESSAGES": "テキスト読み上げメッセージを送信する",
    "perm.MANAGE_MESSAGES": "メッセージの管理",
    "perm.EMBED_LINKS": "埋め込みリンク",
    "perm.ATTACH_FILES": "ファイルを添付",
    "perm.READ_MESSAGE_HISTORY": "メッセージ履歴を読む",
    "perm.MENTION_EVERYONE": "@everyone、@here、全てのロールにメンション",
    "perm.USE_EXTERNAL_EMOJIS": "外部の絵文字を使用する",
    "perm.VIEW_GUILD_INSIGHTS": "サーバーインサイトを見る",
    "perm.CONNECT": "接続",
    "perm.SPEAK": "発言",
    "perm.MUTE_MEMBERS": "メンバーをミュート",
    "perm.DEAFEN_MEMBERS": "メンバーのスピーカーをミュート",
    "perm.MOVE_MEMBERS": "メンバーを移動",
    "perm.USE_VAD": "音声検出を使用",
    "perm.CHANGE_NICKNAME": "ニックネームの変更",
    "perm.MANAGE_NICKNAMES": "ニックネームの管理",
    "perm.MANAGE_ROLES": "ロールの管理",
    "perm.MANAGE_WEBHOOKS": "ウェブフックの管理",
    "perm.MANAGE_GUILD_EXPRESSIONS": "表現の管理",
    "perm.USE_APPLICATION_COMMANDS": "アプリコマンドを使う",
    "perm.REQUEST_TO_SPEAK": "スピーカー参加をリクエスト",
    "perm.MANAGE_EVENTS": "イベントの管理",
    "perm.MANAGE_THREADS": "スレッドの管理",
    "perm.CREATE_PUBLIC_THREADS": "公開スレッドの作成",
    "perm.CREATE_PRIVATE_THREADS": "プライベートスレッドの作成",
    "perm.USE_EXTERNAL_STICKERS": "外部のスタンプを使用する",
    "perm.SEND_MESSAGES_IN_THREADS": "スレッドでメッセージを送信",
    "perm.USE_EMBEDDED_ACTIVITIES": "アクティビティを使用",
    "perm.MODERATE_MEMBERS": "メンバーをタイムアウト",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "サーバーサブスクリプションのインサイトを見る",
    "perm.USE_SOUNDBOARD": "サウンドボードを使用",
    "perm.CREATE_GUILD_EXPRESSIONS": "表現の作成",
    "perm.CREATE_EVENTS": "イベントの作成",
    "perm.USE_EXTERNAL_SOUNDS": "外部のサウンドを使用",
    "perm.SEND_VOICE_MESSAGES": "ボイスメッセージを送信",
    "perm.SEND_POLLS": "投票を作成",
    "perm.USE_EXTERNAL_APPS": "外部のアプリを使用",
    "perm.PIN_MESSAGES": "メッセージをピン留め",
    "perm.BYPASS_SLOWMODE": "低速モードの影響を受けない",
    "perm.unknown": "不明（ビット {bit}）",
    "category.General": "一般",
    "category.Membership": "メンバーシップ",
    "category.Text": "テキスト",
    "category.Voice": "ボイス",
    "category.Apps": "アプリ",
    "category.Events": "イベント",
    "category.Advanced": "高度",
    "category.Other": "その他",
    "ui.close": "閉じる",
    "ui.sections": "セクション",
    "ui.show": "表示",
    "ui.searchLabel": "権限を検索",
    "ui.search": "検索",
    "ui.showAll": "すべての権限を表示",
    "ui.nothing": "表示できるものはありません。",
    "filter.all": "すべて",
    "filter.granted": "付与済み",
    "filter.notGranted": "未付与",
    "filter.allowed": "許可",
    "filter.denied": "拒否",
    "empty.match.all": "「{query}」に一致する権限はありません。",
    "empty.match.granted": "「{query}」に一致する付与済みの権限はありません。",
    "empty.match.notGranted": "「{query}」に一致する未付与の権限はありません。",
    "empty.match.allowed": "「{query}」に一致する許可された権限はありません。",
    "empty.match.denied": "「{query}」に一致する拒否された権限はありません。",
    "empty.none.granted": "ここで付与されている権限はありません。",
    "empty.none.notGranted": "ここではすべての権限が付与されています。",
    "empty.none.allowed": "ここで許可されている権限はありません。",
    "empty.none.denied": "ここで拒否されている権限はありません。",
    "count.of": "{total}件中{granted}件",
    "count.granted": "{count}件付与済み",
    "count.allowedDenied": "許可{allowed}件、拒否{denied}件",
    "chip.overwrite": "上書き",
    "chip.owner": "サーバーオーナー",
    "chip.member": "メンバー",
    "chip.deletedRole": "削除されたロール",
    "chip.admin": "{role}ロールによる管理者権限",
    "chip.everyone": "@everyone に付与",
    "chip.role": "{role}ロールが付与",
    "chip.everyone.allowed": "このチャンネルの @everyone の上書きで許可",
    "chip.everyone.denied": "このチャンネルの @everyone の上書きで拒否",
    "chip.roleOverwrite.allowed": "このチャンネルの{role}の上書きで許可",
    "chip.roleOverwrite.denied": "このチャンネルの{role}の上書きで拒否",
    "chip.memberOverwrite.allowed": "このメンバー向けの上書きで許可",
    "chip.memberOverwrite.denied": "このメンバー向けの上書きで拒否",
    "notice.owner": "サーバーオーナー：すべての権限を持ち、チャンネルの上書きは適用されません。",
    "notice.admin": "{role}ロールによる管理者：すべての権限を持ち、チャンネルの上書きは適用されません。",
    "notice.adminDeleted": "削除されたロールによる管理者：すべての権限を持ち、チャンネルの上書きは適用されません。",
    "notice.roleAdmin": "管理者：このロールはすべての権限を持ち、チャンネルの上書きを無視します。",
    "notice.overwrite.member": "メンバーの上書き：記載のないものはサーバーの設定を引き継ぎます。",
    "notice.overwrite.role": "ロールの上書き：記載のないものはサーバーの設定を引き継ぎます。",
    "empty.overwrite": "この上書きでは何も許可・拒否されていないため、すべてサーバーの設定を引き継ぎます。",
    "empty.noOverwrites": "このチャンネルには上書きがないため、ここでは全員がサーバーロールの権限を持ちます。",
    "section.inChannel": "{channel}内",
    "section.serverWide": "サーバー全体",
    "section.you": "あなた",
    "section.overwrites": "上書き",
    "section.roles": "ロール",
    "this.channel": "このチャンネル",
    "this.server": "このサーバー",
    "subtitle.memberChannel": "{channel}での権限 · {guild}",
    "subtitle.member": "{guild}での権限",
    "subtitle.role": "ロールの権限 · {guild}",
    "subtitle.channel": "チャンネルの権限 · {overwrites} · {guild}",
    "subtitle.guild": "サーバーの権限 · {roles}",
    "overwrites.count": { other: "上書き{count}件" },
    "roles.count": { other: "ロール{count}件" },
    "menu.view": "権限を表示",
    "toast.fail": "権限を読み取れませんでした"
  },
  pl: {
    "perm.CREATE_INSTANT_INVITE": "Tworzenie zaproszeń",
    "perm.KICK_MEMBERS": "Wyrzucanie członków",
    "perm.BAN_MEMBERS": "Banowanie członków",
    "perm.ADMINISTRATOR": "Administrator",
    "perm.MANAGE_CHANNELS": "Zarządzanie kanałami",
    "perm.MANAGE_GUILD": "Zarządzanie serwerem",
    "perm.ADD_REACTIONS": "Dodawanie reakcji",
    "perm.VIEW_AUDIT_LOG": "Wyświetlanie dziennika zdarzeń",
    "perm.PRIORITY_SPEAKER": "Priorytetowy rozmówca",
    "perm.STREAM": "Wideo",
    "perm.VIEW_CHANNEL": "Wyświetlanie kanałów",
    "perm.SEND_MESSAGES": "Wysyłanie wiadomości",
    "perm.SEND_TTS_MESSAGES": "Wysyłanie wiadomości zamiany tekstu na mowę",
    "perm.MANAGE_MESSAGES": "Zarządzanie wiadomościami",
    "perm.EMBED_LINKS": "Osadzanie linków",
    "perm.ATTACH_FILES": "Załączanie plików",
    "perm.READ_MESSAGE_HISTORY": "Czytanie historii wiadomości",
    "perm.MENTION_EVERYONE": "Wzmiankowanie @everyone, @here i wszystkich ról",
    "perm.USE_EXTERNAL_EMOJIS": "Używanie zewnętrznych emoji",
    "perm.VIEW_GUILD_INSIGHTS": "Wyświetlanie statystyk serwera",
    "perm.CONNECT": "Łączenie",
    "perm.SPEAK": "Mówienie",
    "perm.MUTE_MEMBERS": "Wyciszanie członków",
    "perm.DEAFEN_MEMBERS": "Ogłuszanie członków",
    "perm.MOVE_MEMBERS": "Przenoszenie członków",
    "perm.USE_VAD": "Używanie aktywacji głosowej",
    "perm.CHANGE_NICKNAME": "Zmiana pseudonimu",
    "perm.MANAGE_NICKNAMES": "Zarządzanie pseudonimami",
    "perm.MANAGE_ROLES": "Zarządzanie rolami",
    "perm.MANAGE_WEBHOOKS": "Zarządzanie webhookami",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Zarządzanie wyrażeniami",
    "perm.USE_APPLICATION_COMMANDS": "Używanie poleceń aplikacji",
    "perm.REQUEST_TO_SPEAK": "Prośba o głos",
    "perm.MANAGE_EVENTS": "Zarządzanie wydarzeniami",
    "perm.MANAGE_THREADS": "Zarządzanie wątkami",
    "perm.CREATE_PUBLIC_THREADS": "Tworzenie publicznych wątków",
    "perm.CREATE_PRIVATE_THREADS": "Tworzenie prywatnych wątków",
    "perm.USE_EXTERNAL_STICKERS": "Używanie zewnętrznych naklejek",
    "perm.SEND_MESSAGES_IN_THREADS": "Wysyłanie wiadomości w wątkach",
    "perm.USE_EMBEDDED_ACTIVITIES": "Używanie aktywności",
    "perm.MODERATE_MEMBERS": "Wyciszanie członków czasowo",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Wyświetlanie statystyk subskrypcji serwera",
    "perm.USE_SOUNDBOARD": "Używanie tablicy dźwięków",
    "perm.CREATE_GUILD_EXPRESSIONS": "Tworzenie wyrażeń",
    "perm.CREATE_EVENTS": "Tworzenie wydarzeń",
    "perm.USE_EXTERNAL_SOUNDS": "Używanie zewnętrznych dźwięków",
    "perm.SEND_VOICE_MESSAGES": "Wysyłanie wiadomości głosowych",
    "perm.SEND_POLLS": "Tworzenie ankiet",
    "perm.USE_EXTERNAL_APPS": "Używanie zewnętrznych aplikacji",
    "perm.PIN_MESSAGES": "Przypinanie wiadomości",
    "perm.BYPASS_SLOWMODE": "Pomijanie trybu powolnego",
    "perm.unknown": "Nieznane (bit {bit})",
    "category.General": "Ogólne",
    "category.Membership": "Członkostwo",
    "category.Text": "Tekst",
    "category.Voice": "Głos",
    "category.Apps": "Aplikacje",
    "category.Events": "Wydarzenia",
    "category.Advanced": "Zaawansowane",
    "category.Other": "Inne",
    "ui.close": "Zamknij",
    "ui.sections": "Sekcje",
    "ui.show": "Pokaż",
    "ui.searchLabel": "Szukaj uprawnień",
    "ui.search": "Szukaj",
    "ui.showAll": "Pokaż wszystkie uprawnienia",
    "ui.nothing": "Nie ma nic do pokazania.",
    "filter.all": "Wszystkie",
    "filter.granted": "Przyznane",
    "filter.notGranted": "Nieprzyznane",
    "filter.allowed": "Dozwolone",
    "filter.denied": "Zabronione",
    "empty.match.all": "Żadne uprawnienia nie pasują do „{query}”.",
    "empty.match.granted": "Żadne przyznane uprawnienia nie pasują do „{query}”.",
    "empty.match.notGranted": "Żadne nieprzyznane uprawnienia nie pasują do „{query}”.",
    "empty.match.allowed": "Żadne dozwolone uprawnienia nie pasują do „{query}”.",
    "empty.match.denied": "Żadne zabronione uprawnienia nie pasują do „{query}”.",
    "empty.none.granted": "Nie przyznano tu żadnych uprawnień.",
    "empty.none.notGranted": "Wszystkie uprawnienia są tu przyznane.",
    "empty.none.allowed": "Nie zezwolono tu na żadne uprawnienia.",
    "empty.none.denied": "Nie zabroniono tu żadnych uprawnień.",
    "count.of": "{granted} z {total}",
    "count.granted": "Przyznane: {count}",
    "count.allowedDenied": "Dozwolone: {allowed}, zabronione: {denied}",
    "chip.overwrite": "nadpisanie",
    "chip.owner": "Właściciel serwera",
    "chip.member": "Członek",
    "chip.deletedRole": "Usunięta rola",
    "chip.admin": "Administrator dzięki roli {role}",
    "chip.everyone": "Przyznane roli @everyone",
    "chip.role": "Przyznane przez rolę {role}",
    "chip.everyone.allowed": "Dozwolone przez nadpisanie @everyone na tym kanale",
    "chip.everyone.denied": "Zabronione przez nadpisanie @everyone na tym kanale",
    "chip.roleOverwrite.allowed": "Dozwolone przez nadpisanie roli {role} na tym kanale",
    "chip.roleOverwrite.denied": "Zabronione przez nadpisanie roli {role} na tym kanale",
    "chip.memberOverwrite.allowed": "Dozwolone przez nadpisanie dla tego członka",
    "chip.memberOverwrite.denied": "Zabronione przez nadpisanie dla tego członka",
    "notice.owner": "Właściciel serwera: ma wszystkie uprawnienia, a nadpisania kanału go nie dotyczą.",
    "notice.admin": "Administrator dzięki roli {role}: ma wszystkie uprawnienia, a nadpisania kanału go nie dotyczą.",
    "notice.adminDeleted": "Administrator dzięki usuniętej roli: ma wszystkie uprawnienia, a nadpisania kanału go nie dotyczą.",
    "notice.roleAdmin": "Administrator: ta rola ma wszystkie uprawnienia i pomija nadpisania kanału.",
    "notice.overwrite.member": "Nadpisanie dla członka: wszystko, czego tu nie ma, jest dziedziczone z serwera.",
    "notice.overwrite.role": "Nadpisanie dla roli: wszystko, czego tu nie ma, jest dziedziczone z serwera.",
    "empty.overwrite": "To nadpisanie niczego nie zezwala ani nie zabrania, więc wszystko jest dziedziczone z serwera.",
    "empty.noOverwrites": "Ten kanał nie ma nadpisań, więc każdy ma tu uprawnienia wynikające ze swoich ról na serwerze.",
    "section.inChannel": "Na kanale {channel}",
    "section.serverWide": "Na całym serwerze",
    "section.you": "Ty",
    "section.overwrites": "Nadpisania",
    "section.roles": "Role",
    "this.channel": "ten kanał",
    "this.server": "ten serwer",
    "subtitle.memberChannel": "Uprawnienia na kanale {channel} · {guild}",
    "subtitle.member": "Uprawnienia na serwerze {guild}",
    "subtitle.role": "Uprawnienia roli · {guild}",
    "subtitle.channel": "Uprawnienia kanału · {overwrites} · {guild}",
    "subtitle.guild": "Uprawnienia serwera · {roles}",
    "overwrites.count": { one: "{count} nadpisanie", few: "{count} nadpisania", many: "{count} nadpisań", other: "{count} nadpisania" },
    "roles.count": { one: "{count} rola", few: "{count} role", many: "{count} ról", other: "{count} roli" },
    "menu.view": "Wyświetl uprawnienia",
    "toast.fail": "Nie udało się odczytać uprawnień"
  },
  "pt-BR": {
    "perm.CREATE_INSTANT_INVITE": "Criar convite",
    "perm.KICK_MEMBERS": "Expulsar membros",
    "perm.BAN_MEMBERS": "Banir membros",
    "perm.ADMINISTRATOR": "Administrador",
    "perm.MANAGE_CHANNELS": "Gerenciar canais",
    "perm.MANAGE_GUILD": "Gerenciar servidor",
    "perm.ADD_REACTIONS": "Adicionar reações",
    "perm.VIEW_AUDIT_LOG": "Ver o registro de auditoria",
    "perm.PRIORITY_SPEAKER": "Voz prioritária",
    "perm.STREAM": "Vídeo",
    "perm.VIEW_CHANNEL": "Ver canais",
    "perm.SEND_MESSAGES": "Enviar mensagens",
    "perm.SEND_TTS_MESSAGES": "Enviar mensagens de texto para voz",
    "perm.MANAGE_MESSAGES": "Gerenciar mensagens",
    "perm.EMBED_LINKS": "Inserir links",
    "perm.ATTACH_FILES": "Anexar arquivos",
    "perm.READ_MESSAGE_HISTORY": "Ver histórico de mensagens",
    "perm.MENTION_EVERYONE": "Mencionar @everyone, @here e todos os cargos",
    "perm.USE_EXTERNAL_EMOJIS": "Usar emojis externos",
    "perm.VIEW_GUILD_INSIGHTS": "Ver informações do servidor",
    "perm.CONNECT": "Conectar",
    "perm.SPEAK": "Falar",
    "perm.MUTE_MEMBERS": "Silenciar membros",
    "perm.DEAFEN_MEMBERS": "Ensurdecer membros",
    "perm.MOVE_MEMBERS": "Mover membros",
    "perm.USE_VAD": "Usar detecção de voz",
    "perm.CHANGE_NICKNAME": "Alterar apelido",
    "perm.MANAGE_NICKNAMES": "Gerenciar apelidos",
    "perm.MANAGE_ROLES": "Gerenciar cargos",
    "perm.MANAGE_WEBHOOKS": "Gerenciar webhooks",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Gerenciar expressões",
    "perm.USE_APPLICATION_COMMANDS": "Usar comandos de aplicativos",
    "perm.REQUEST_TO_SPEAK": "Pedir para falar",
    "perm.MANAGE_EVENTS": "Gerenciar eventos",
    "perm.MANAGE_THREADS": "Gerenciar tópicos",
    "perm.CREATE_PUBLIC_THREADS": "Criar tópicos públicos",
    "perm.CREATE_PRIVATE_THREADS": "Criar tópicos privados",
    "perm.USE_EXTERNAL_STICKERS": "Usar figurinhas externas",
    "perm.SEND_MESSAGES_IN_THREADS": "Enviar mensagens em tópicos",
    "perm.USE_EMBEDDED_ACTIVITIES": "Usar atividades",
    "perm.MODERATE_MEMBERS": "Colocar membros em castigo",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Ver informações de assinaturas do servidor",
    "perm.USE_SOUNDBOARD": "Usar painel de sons",
    "perm.CREATE_GUILD_EXPRESSIONS": "Criar expressões",
    "perm.CREATE_EVENTS": "Criar eventos",
    "perm.USE_EXTERNAL_SOUNDS": "Usar sons externos",
    "perm.SEND_VOICE_MESSAGES": "Enviar mensagens de voz",
    "perm.SEND_POLLS": "Criar enquetes",
    "perm.USE_EXTERNAL_APPS": "Usar aplicativos externos",
    "perm.PIN_MESSAGES": "Fixar mensagens",
    "perm.BYPASS_SLOWMODE": "Ignorar o modo lento",
    "perm.unknown": "Desconhecida (bit {bit})",
    "category.General": "Geral",
    "category.Membership": "Associação",
    "category.Text": "Texto",
    "category.Voice": "Voz",
    "category.Apps": "Aplicativos",
    "category.Events": "Eventos",
    "category.Advanced": "Avançado",
    "category.Other": "Outros",
    "ui.close": "Fechar",
    "ui.sections": "Seções",
    "ui.show": "Mostrar",
    "ui.searchLabel": "Pesquisar permissões",
    "ui.search": "Pesquisar",
    "ui.showAll": "Mostrar todas as permissões",
    "ui.nothing": "Nada para mostrar.",
    "filter.all": "Todas",
    "filter.granted": "Concedidas",
    "filter.notGranted": "Não concedidas",
    "filter.allowed": "Permitidas",
    "filter.denied": "Negadas",
    "empty.match.all": "Nenhuma permissão corresponde a “{query}”.",
    "empty.match.granted": "Nenhuma permissão concedida corresponde a “{query}”.",
    "empty.match.notGranted": "Nenhuma permissão não concedida corresponde a “{query}”.",
    "empty.match.allowed": "Nenhuma permissão permitida corresponde a “{query}”.",
    "empty.match.denied": "Nenhuma permissão negada corresponde a “{query}”.",
    "empty.none.granted": "Nenhuma permissão é concedida aqui.",
    "empty.none.notGranted": "Todas as permissões são concedidas aqui.",
    "empty.none.allowed": "Nenhuma permissão é permitida aqui.",
    "empty.none.denied": "Nenhuma permissão é negada aqui.",
    "count.of": "{granted} de {total}",
    "count.granted": "{count} concedidas",
    "count.allowedDenied": "{allowed} permitidas, {denied} negadas",
    "chip.overwrite": "substituição",
    "chip.owner": "Dono do servidor",
    "chip.member": "Membro",
    "chip.deletedRole": "Cargo excluído",
    "chip.admin": "Administrador pelo cargo {role}",
    "chip.everyone": "Concedida a @everyone",
    "chip.role": "Concedida pelo cargo {role}",
    "chip.everyone.allowed": "Permitida pela substituição de @everyone deste canal",
    "chip.everyone.denied": "Negada pela substituição de @everyone deste canal",
    "chip.roleOverwrite.allowed": "Permitida pela substituição do cargo {role} neste canal",
    "chip.roleOverwrite.denied": "Negada pela substituição do cargo {role} neste canal",
    "chip.memberOverwrite.allowed": "Permitida por uma substituição para este membro",
    "chip.memberOverwrite.denied": "Negada por uma substituição para este membro",
    "notice.owner": "Dono do servidor: tem todas as permissões, e as substituições de canal não se aplicam.",
    "notice.admin": "Administrador pelo cargo {role}: tem todas as permissões, e as substituições de canal não se aplicam.",
    "notice.adminDeleted": "Administrador por um cargo excluído: tem todas as permissões, e as substituições de canal não se aplicam.",
    "notice.roleAdmin": "Administrador: este cargo tem todas as permissões e ignora as substituições de canal.",
    "notice.overwrite.member": "Substituição de membro: o que não está listado é herdado do servidor.",
    "notice.overwrite.role": "Substituição de cargo: o que não está listado é herdado do servidor.",
    "empty.overwrite": "Esta substituição não permite nem nega nada, então tudo é herdado do servidor.",
    "empty.noOverwrites": "Este canal não tem substituições, então todos têm aqui as permissões dos seus cargos no servidor.",
    "section.inChannel": "Em {channel}",
    "section.serverWide": "No servidor todo",
    "section.you": "Você",
    "section.overwrites": "Substituições",
    "section.roles": "Cargos",
    "this.channel": "este canal",
    "this.server": "este servidor",
    "subtitle.memberChannel": "Permissões em {channel} · {guild}",
    "subtitle.member": "Permissões em {guild}",
    "subtitle.role": "Permissões do cargo · {guild}",
    "subtitle.channel": "Permissões do canal · {overwrites} · {guild}",
    "subtitle.guild": "Permissões do servidor · {roles}",
    "overwrites.count": { one: "{count} substituição", other: "{count} substituições" },
    "roles.count": { one: "{count} cargo", other: "{count} cargos" },
    "menu.view": "Ver permissões",
    "toast.fail": "Não foi possível ler as permissões"
  },
  ru: {
    "perm.CREATE_INSTANT_INVITE": "Создание приглашений",
    "perm.KICK_MEMBERS": "Выгонять участников",
    "perm.BAN_MEMBERS": "Банить участников",
    "perm.ADMINISTRATOR": "Администратор",
    "perm.MANAGE_CHANNELS": "Управление каналами",
    "perm.MANAGE_GUILD": "Управление сервером",
    "perm.ADD_REACTIONS": "Добавление реакций",
    "perm.VIEW_AUDIT_LOG": "Просмотр журнала аудита",
    "perm.PRIORITY_SPEAKER": "Приоритетный режим",
    "perm.STREAM": "Видео",
    "perm.VIEW_CHANNEL": "Просмотр каналов",
    "perm.SEND_MESSAGES": "Отправлять сообщения",
    "perm.SEND_TTS_MESSAGES": "Отправлять TTS-сообщения",
    "perm.MANAGE_MESSAGES": "Управление сообщениями",
    "perm.EMBED_LINKS": "Встраивать ссылки",
    "perm.ATTACH_FILES": "Прикреплять файлы",
    "perm.READ_MESSAGE_HISTORY": "Читать историю сообщений",
    "perm.MENTION_EVERYONE": "Упоминание @everyone, @here и всех ролей",
    "perm.USE_EXTERNAL_EMOJIS": "Использовать внешние эмодзи",
    "perm.VIEW_GUILD_INSIGHTS": "Просмотр аналитики сервера",
    "perm.CONNECT": "Подключаться",
    "perm.SPEAK": "Говорить",
    "perm.MUTE_MEMBERS": "Отключать микрофон участникам",
    "perm.DEAFEN_MEMBERS": "Отключать звук участникам",
    "perm.MOVE_MEMBERS": "Перемещать участников",
    "perm.USE_VAD": "Использовать режим активации по голосу",
    "perm.CHANGE_NICKNAME": "Изменение никнейма",
    "perm.MANAGE_NICKNAMES": "Управление никнеймами",
    "perm.MANAGE_ROLES": "Управление ролями",
    "perm.MANAGE_WEBHOOKS": "Управление вебхуками",
    "perm.MANAGE_GUILD_EXPRESSIONS": "Управление выражениями",
    "perm.USE_APPLICATION_COMMANDS": "Использование команд приложений",
    "perm.REQUEST_TO_SPEAK": "Запрос на выступление",
    "perm.MANAGE_EVENTS": "Управление событиями",
    "perm.MANAGE_THREADS": "Управление ветками",
    "perm.CREATE_PUBLIC_THREADS": "Создание публичных веток",
    "perm.CREATE_PRIVATE_THREADS": "Создание приватных веток",
    "perm.USE_EXTERNAL_STICKERS": "Использовать внешние стикеры",
    "perm.SEND_MESSAGES_IN_THREADS": "Отправлять сообщения в ветках",
    "perm.USE_EMBEDDED_ACTIVITIES": "Использовать активности",
    "perm.MODERATE_MEMBERS": "Отправлять участников подумать о поведении",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Просмотр аналитики подписок сервера",
    "perm.USE_SOUNDBOARD": "Использовать звуковую панель",
    "perm.CREATE_GUILD_EXPRESSIONS": "Создание выражений",
    "perm.CREATE_EVENTS": "Создание событий",
    "perm.USE_EXTERNAL_SOUNDS": "Использовать внешние звуки",
    "perm.SEND_VOICE_MESSAGES": "Отправлять голосовые сообщения",
    "perm.SEND_POLLS": "Создание опросов",
    "perm.USE_EXTERNAL_APPS": "Использовать внешние приложения",
    "perm.PIN_MESSAGES": "Закреплять сообщения",
    "perm.BYPASS_SLOWMODE": "Обход медленного режима",
    "perm.unknown": "Неизвестно (бит {bit})",
    "category.General": "Основные",
    "category.Membership": "Участники",
    "category.Text": "Текст",
    "category.Voice": "Голос",
    "category.Apps": "Приложения",
    "category.Events": "События",
    "category.Advanced": "Расширенные",
    "category.Other": "Прочее",
    "ui.close": "Закрыть",
    "ui.sections": "Разделы",
    "ui.show": "Показать",
    "ui.searchLabel": "Поиск прав",
    "ui.search": "Поиск",
    "ui.showAll": "Показать все права",
    "ui.nothing": "Здесь пока нечего показывать.",
    "filter.all": "Все",
    "filter.granted": "Выданные",
    "filter.notGranted": "Не выданные",
    "filter.allowed": "Разрешённые",
    "filter.denied": "Запрещённые",
    "empty.match.all": "Нет прав, подходящих под «{query}».",
    "empty.match.granted": "Нет выданных прав, подходящих под «{query}».",
    "empty.match.notGranted": "Нет не выданных прав, подходящих под «{query}».",
    "empty.match.allowed": "Нет разрешённых прав, подходящих под «{query}».",
    "empty.match.denied": "Нет запрещённых прав, подходящих под «{query}».",
    "empty.none.granted": "Здесь нет выданных прав.",
    "empty.none.notGranted": "Здесь выданы все права.",
    "empty.none.allowed": "Здесь нет разрешённых прав.",
    "empty.none.denied": "Здесь нет запрещённых прав.",
    "count.of": "{granted} из {total}",
    "count.granted": "Выдано: {count}",
    "count.allowedDenied": "Разрешено: {allowed}, запрещено: {denied}",
    "chip.overwrite": "исключение",
    "chip.owner": "Владелец сервера",
    "chip.member": "Участник",
    "chip.deletedRole": "Удалённая роль",
    "chip.admin": "Администратор через роль «{role}»",
    "chip.everyone": "Выдано роли @everyone",
    "chip.role": "Выдано ролью «{role}»",
    "chip.everyone.allowed": "Разрешено исключением для @everyone в этом канале",
    "chip.everyone.denied": "Запрещено исключением для @everyone в этом канале",
    "chip.roleOverwrite.allowed": "Разрешено исключением для роли «{role}» в этом канале",
    "chip.roleOverwrite.denied": "Запрещено исключением для роли «{role}» в этом канале",
    "chip.memberOverwrite.allowed": "Разрешено исключением для этого участника",
    "chip.memberOverwrite.denied": "Запрещено исключением для этого участника",
    "notice.owner": "Владелец сервера: имеет все права, исключения каналов не действуют.",
    "notice.admin": "Администратор через роль «{role}»: имеет все права, исключения каналов не действуют.",
    "notice.adminDeleted": "Администратор через удалённую роль: имеет все права, исключения каналов не действуют.",
    "notice.roleAdmin": "Администратор: эта роль имеет все права и игнорирует исключения каналов.",
    "notice.overwrite.member": "Исключение для участника: всё, чего нет в списке, наследуется от сервера.",
    "notice.overwrite.role": "Исключение для роли: всё, чего нет в списке, наследуется от сервера.",
    "empty.overwrite": "Это исключение ничего не разрешает и не запрещает, поэтому всё наследуется от сервера.",
    "empty.noOverwrites": "В этом канале нет исключений, поэтому у всех здесь права их ролей на сервере.",
    "section.inChannel": "В канале {channel}",
    "section.serverWide": "На всём сервере",
    "section.you": "Вы",
    "section.overwrites": "Исключения",
    "section.roles": "Роли",
    "this.channel": "этот канал",
    "this.server": "этот сервер",
    "subtitle.memberChannel": "Права в канале {channel} · {guild}",
    "subtitle.member": "Права на сервере {guild}",
    "subtitle.role": "Права роли · {guild}",
    "subtitle.channel": "Права канала · {overwrites} · {guild}",
    "subtitle.guild": "Права сервера · {roles}",
    "overwrites.count": { one: "{count} исключение", few: "{count} исключения", many: "{count} исключений", other: "{count} исключения" },
    "roles.count": { one: "{count} роль", few: "{count} роли", many: "{count} ролей", other: "{count} роли" },
    "menu.view": "Посмотреть права",
    "toast.fail": "Не удалось прочитать права"
  },
  tr: {
    "perm.CREATE_INSTANT_INVITE": "Davet Oluştur",
    "perm.KICK_MEMBERS": "Üyeleri At",
    "perm.BAN_MEMBERS": "Üyeleri Yasakla",
    "perm.ADMINISTRATOR": "Yönetici",
    "perm.MANAGE_CHANNELS": "Kanalları Yönet",
    "perm.MANAGE_GUILD": "Sunucuyu Yönet",
    "perm.ADD_REACTIONS": "Tepki Ekle",
    "perm.VIEW_AUDIT_LOG": "Denetim Kaydını Görüntüle",
    "perm.PRIORITY_SPEAKER": "Öncelikli Konuşmacı",
    "perm.STREAM": "Video",
    "perm.VIEW_CHANNEL": "Kanalları Görüntüle",
    "perm.SEND_MESSAGES": "Mesaj Gönder",
    "perm.SEND_TTS_MESSAGES": "Metin Okuma Mesajı Gönder",
    "perm.MANAGE_MESSAGES": "Mesajları Yönet",
    "perm.EMBED_LINKS": "Bağlantı Yerleştir",
    "perm.ATTACH_FILES": "Dosya Ekle",
    "perm.READ_MESSAGE_HISTORY": "Mesaj Geçmişini Oku",
    "perm.MENTION_EVERYONE": "@everyone, @here ve Tüm Rollerden Bahset",
    "perm.USE_EXTERNAL_EMOJIS": "Harici Emoji Kullan",
    "perm.VIEW_GUILD_INSIGHTS": "Sunucu İstatistiklerini Görüntüle",
    "perm.CONNECT": "Bağlan",
    "perm.SPEAK": "Konuş",
    "perm.MUTE_MEMBERS": "Üyeleri Sustur",
    "perm.DEAFEN_MEMBERS": "Üyeleri Sağırlaştır",
    "perm.MOVE_MEMBERS": "Üyeleri Taşı",
    "perm.USE_VAD": "Ses Algılamayı Kullan",
    "perm.CHANGE_NICKNAME": "Takma Adı Değiştir",
    "perm.MANAGE_NICKNAMES": "Takma Adları Yönet",
    "perm.MANAGE_ROLES": "Rolleri Yönet",
    "perm.MANAGE_WEBHOOKS": "Webhook'ları Yönet",
    "perm.MANAGE_GUILD_EXPRESSIONS": "İfadeleri Yönet",
    "perm.USE_APPLICATION_COMMANDS": "Uygulama Komutlarını Kullan",
    "perm.REQUEST_TO_SPEAK": "Konuşma İsteği Gönder",
    "perm.MANAGE_EVENTS": "Etkinlikleri Yönet",
    "perm.MANAGE_THREADS": "Alt Başlıkları Yönet",
    "perm.CREATE_PUBLIC_THREADS": "Herkese Açık Alt Başlık Oluştur",
    "perm.CREATE_PRIVATE_THREADS": "Özel Alt Başlık Oluştur",
    "perm.USE_EXTERNAL_STICKERS": "Harici Çıkartma Kullan",
    "perm.SEND_MESSAGES_IN_THREADS": "Alt Başlıklarda Mesaj Gönder",
    "perm.USE_EMBEDDED_ACTIVITIES": "Etkinlikleri Kullan",
    "perm.MODERATE_MEMBERS": "Üyelere Zaman Aşımı Uygula",
    "perm.VIEW_CREATOR_MONETIZATION_ANALYTICS": "Sunucu Abonelik İstatistiklerini Görüntüle",
    "perm.USE_SOUNDBOARD": "Ses Tahtasını Kullan",
    "perm.CREATE_GUILD_EXPRESSIONS": "İfade Oluştur",
    "perm.CREATE_EVENTS": "Etkinlik Oluştur",
    "perm.USE_EXTERNAL_SOUNDS": "Harici Ses Kullan",
    "perm.SEND_VOICE_MESSAGES": "Sesli Mesaj Gönder",
    "perm.SEND_POLLS": "Anket Oluştur",
    "perm.USE_EXTERNAL_APPS": "Harici Uygulamaları Kullan",
    "perm.PIN_MESSAGES": "Mesajları Sabitle",
    "perm.BYPASS_SLOWMODE": "Yavaş Modu Atla",
    "perm.unknown": "Bilinmeyen (bit {bit})",
    "category.General": "Genel",
    "category.Membership": "Üyelik",
    "category.Text": "Metin",
    "category.Voice": "Ses",
    "category.Apps": "Uygulamalar",
    "category.Events": "Etkinlikler",
    "category.Advanced": "Gelişmiş",
    "category.Other": "Diğer",
    "ui.close": "Kapat",
    "ui.sections": "Bölümler",
    "ui.show": "Göster",
    "ui.searchLabel": "İzinleri ara",
    "ui.search": "Ara",
    "ui.showAll": "Tüm izinleri göster",
    "ui.nothing": "Gösterilecek bir şey yok.",
    "filter.all": "Tümü",
    "filter.granted": "Verilenler",
    "filter.notGranted": "Verilmeyenler",
    "filter.allowed": "İzin verilenler",
    "filter.denied": "Reddedilenler",
    "empty.match.all": "“{query}” ile eşleşen izin yok.",
    "empty.match.granted": "“{query}” ile eşleşen verilmiş izin yok.",
    "empty.match.notGranted": "“{query}” ile eşleşen verilmemiş izin yok.",
    "empty.match.allowed": "“{query}” ile eşleşen izin verilmiş izin yok.",
    "empty.match.denied": "“{query}” ile eşleşen reddedilmiş izin yok.",
    "empty.none.granted": "Burada verilmiş bir izin yok.",
    "empty.none.notGranted": "Burada tüm izinler verilmiş.",
    "empty.none.allowed": "Burada izin verilmiş bir izin yok.",
    "empty.none.denied": "Burada reddedilmiş bir izin yok.",
    "count.of": "{total} izinden {granted}",
    "count.granted": "{count} verilmiş",
    "count.allowedDenied": "{allowed} izin verilmiş, {denied} reddedilmiş",
    "chip.overwrite": "geçersiz kılma",
    "chip.owner": "Sunucu sahibi",
    "chip.member": "Üye",
    "chip.deletedRole": "Silinmiş rol",
    "chip.admin": "{role} rolü üzerinden yönetici",
    "chip.everyone": "@everyone'a verilmiş",
    "chip.role": "{role} rolü tarafından verilmiş",
    "chip.everyone.allowed": "Bu kanalın @everyone geçersiz kılması tarafından izin verilmiş",
    "chip.everyone.denied": "Bu kanalın @everyone geçersiz kılması tarafından reddedilmiş",
    "chip.roleOverwrite.allowed": "Bu kanalın {role} geçersiz kılması tarafından izin verilmiş",
    "chip.roleOverwrite.denied": "Bu kanalın {role} geçersiz kılması tarafından reddedilmiş",
    "chip.memberOverwrite.allowed": "Bu üyeye özel bir geçersiz kılma tarafından izin verilmiş",
    "chip.memberOverwrite.denied": "Bu üyeye özel bir geçersiz kılma tarafından reddedilmiş",
    "notice.owner": "Sunucu sahibi: tüm izinlere sahiptir ve kanal geçersiz kılmaları geçerli olmaz.",
    "notice.admin": "{role} rolü üzerinden yönetici: tüm izinlere sahiptir ve kanal geçersiz kılmaları geçerli olmaz.",
    "notice.adminDeleted": "Silinmiş bir rol üzerinden yönetici: tüm izinlere sahiptir ve kanal geçersiz kılmaları geçerli olmaz.",
    "notice.roleAdmin": "Yönetici: bu rol tüm izinlere sahiptir ve kanal geçersiz kılmalarını yok sayar.",
    "notice.overwrite.member": "Üye geçersiz kılması: listelenmeyen her şey sunucudan devralınır.",
    "notice.overwrite.role": "Rol geçersiz kılması: listelenmeyen her şey sunucudan devralınır.",
    "empty.overwrite": "Bu geçersiz kılma hiçbir şeye izin vermiyor veya reddetmiyor, bu yüzden her şey sunucudan devralınıyor.",
    "empty.noOverwrites": "Bu kanalda geçersiz kılma yok, bu yüzden burada herkes sunucu rollerinin izinlerine sahip.",
    "section.inChannel": "{channel} kanalında",
    "section.serverWide": "Tüm sunucuda",
    "section.you": "Sen",
    "section.overwrites": "Geçersiz kılmalar",
    "section.roles": "Roller",
    "this.channel": "bu kanal",
    "this.server": "bu sunucu",
    "subtitle.memberChannel": "{channel} kanalındaki izinler · {guild}",
    "subtitle.member": "{guild} sunucusundaki izinler",
    "subtitle.role": "Rol izinleri · {guild}",
    "subtitle.channel": "Kanal izinleri · {overwrites} · {guild}",
    "subtitle.guild": "Sunucu izinleri · {roles}",
    "overwrites.count": { one: "{count} geçersiz kılma", other: "{count} geçersiz kılma" },
    "roles.count": { one: "{count} rol", other: "{count} rol" },
    "menu.view": "İzinleri Görüntüle",
    "toast.fail": "İzinler okunamadı"
  }
});

// plugins/permissions-viewer/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var td = (key, vars) => t(key, vars);
var permName = (p) => p.key.startsWith("BIT_") ? t("perm.unknown", { bit: p.key.slice(4) }) : td(`perm.${p.key}`);
var store = (name) => {
  try {
    return import_api2.getStore(name);
  } catch {
    return;
  }
};
function guildRoles(guildId) {
  const guild = store("GuildStore")?.getGuild?.(guildId);
  const roleStore = store("GuildRoleStore");
  let raw;
  try {
    raw = roleStore?.getRolesSnapshot?.(guildId) ?? roleStore?.getRoles?.(guildId) ?? roleStore?.getSortedRoles?.(guildId);
  } catch {}
  raw ??= guild?.roles;
  const list2 = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
  return sortRoles(list2.filter((r) => r?.id).map((r) => ({
    id: r.id,
    name: r.id === guildId ? "@everyone" : r.name ?? r.id,
    permissions: toBits(r.permissions),
    position: r.position ?? 0,
    color: r.colorString ?? undefined
  })), guildId);
}
var getGuild = (id) => id ? store("GuildStore")?.getGuild?.(id) : undefined;
var getChannel = (id) => id ? store("ChannelStore")?.getChannel?.(id) : undefined;
var memberRoleIds = (guildId, userId) => store("GuildMemberStore")?.getMember?.(guildId, userId)?.roles;
var ownId = () => store("UserStore")?.getCurrentUser?.()?.id;
function userName(guildId, userId) {
  const nick = guildId ? store("GuildMemberStore")?.getMember?.(guildId, userId)?.nick : undefined;
  const user = store("UserStore")?.getUser?.(userId);
  return nick || user?.globalName || user?.username || userId;
}
var attempt = (fn) => {
  try {
    return fn();
  } catch {
    return;
  }
};
function overwritesOf(channel) {
  const source = channel?.isThread?.() ? getChannel(channel.parent_id) ?? channel : channel;
  const raw = source?.permissionOverwrites ?? {};
  return Object.values(raw).map((o) => ({ id: o.id, type: o.type, allow: toBits(o.allow), deny: toBits(o.deny) }));
}
var channelLabel = (channel) => channel?.name ? `#${channel.name}` : t("this.channel");
var CATEGORIES = [
  ["General", ["VIEW_CHANNEL", "MANAGE_CHANNELS", "MANAGE_ROLES", "CREATE_GUILD_EXPRESSIONS", "MANAGE_GUILD_EXPRESSIONS", "VIEW_AUDIT_LOG", "VIEW_GUILD_INSIGHTS", "VIEW_CREATOR_MONETIZATION_ANALYTICS", "MANAGE_WEBHOOKS", "MANAGE_GUILD"]],
  ["Membership", ["CREATE_INSTANT_INVITE", "CHANGE_NICKNAME", "MANAGE_NICKNAMES", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"]],
  ["Text", ["SEND_MESSAGES", "SEND_MESSAGES_IN_THREADS", "CREATE_PUBLIC_THREADS", "CREATE_PRIVATE_THREADS", "EMBED_LINKS", "ATTACH_FILES", "ADD_REACTIONS", "USE_EXTERNAL_EMOJIS", "USE_EXTERNAL_STICKERS", "MENTION_EVERYONE", "MANAGE_MESSAGES", "PIN_MESSAGES", "BYPASS_SLOWMODE", "MANAGE_THREADS", "READ_MESSAGE_HISTORY", "SEND_TTS_MESSAGES", "SEND_VOICE_MESSAGES", "SEND_POLLS"]],
  ["Voice", ["CONNECT", "SPEAK", "STREAM", "USE_SOUNDBOARD", "USE_EXTERNAL_SOUNDS", "USE_VAD", "PRIORITY_SPEAKER", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "REQUEST_TO_SPEAK"]],
  ["Apps", ["USE_APPLICATION_COMMANDS", "USE_EMBEDDED_ACTIVITIES", "USE_EXTERNAL_APPS"]],
  ["Events", ["CREATE_EVENTS", "MANAGE_EVENTS"]],
  ["Advanced", ["ADMINISTRATOR"]]
];
var ORDER = new Map(CATEGORIES.flatMap(([category, keys]) => keys.map((key, i) => [key, { category, i }])));
function byCategory(items) {
  const groups = new Map([...CATEGORIES.map(([c]) => [c, []]), ["Other", []]]);
  for (const item of items)
    groups.get(ORDER.get(item.key)?.category ?? "Other").push(item);
  for (const list2 of groups.values())
    list2.sort((a, b) => (ORDER.get(a.key)?.i ?? 99) - (ORDER.get(b.key)?.i ?? 99));
  return [...groups].filter(([, list2]) => list2.length);
}
var closeOpen;
function openDialog(subject, sections) {
  closeOpen?.();
  const close = import_api2.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(Dialog, {
    subject,
    sections,
    onClose: () => close2()
  }), {
    onClosed: () => void (closeOpen === close && (closeOpen = undefined))
  });
  closeOpen = close;
}
function Dialog({ subject, sections, onClose }) {
  const [selected, setSelected] = import_api2.React.useState(sections[0]?.key);
  const [filter, setFilter] = import_api2.React.useState("all");
  const [query, setQuery] = import_api2.React.useState("");
  const ref = import_api2.React.useRef(null);
  const searchRef = import_api2.React.useRef(null);
  const current = sections.find((s) => s.key === selected) ?? sections[0];
  import_api2.React.useEffect(() => {
    const previous = document.activeElement;
    (searchRef.current ?? ref.current)?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape")
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const search = searchRef.current;
      if (search && document.activeElement === search && search.value)
        setQuery("");
      else
        onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  const items = current?.items ?? [];
  const granted = items.filter((i) => i.state === "allow").length;
  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => (filter === "all" || filter === "allow" === (i.state === "allow")) && (!q || i.name.toLowerCase().includes(q)));
  const names = current?.overwrite ? ["allowed", "denied"] : ["granted", "notGranted"];
  const filters = [["all", t("filter.all"), items.length], ["allow", td(`filter.${names[0]}`), granted], ["off", td(`filter.${names[1]}`), items.length - granted]];
  const emptyText = () => {
    const which = filter === "all" ? undefined : filter === "allow" ? names[0] : names[1];
    if (q)
      return td(`empty.match.${which ?? "all"}`, { query: query.trim() });
    return td(`empty.none.${which ?? "granted"}`);
  };
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-pv-scrim evi-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-pv-modal evi-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-pv-title",
      "aria-describedby": "evi-pv-subtitle",
      tabIndex: -1,
      ref,
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-pv-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx(SubjectIcon, {
              subject
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-pv-titles",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h2", {
                  id: "evi-pv-title",
                  children: subject.title
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  id: "evi-pv-subtitle",
                  children: subject.subtitle
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-pv-close",
              "aria-label": t("ui.close"),
              onClick: onClose,
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "18",
                height: "18",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  d: "M6 6l12 12M18 6L6 18",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round"
                })
              })
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-pv-main",
          children: [
            sections.length > 1 && /* @__PURE__ */ jsx_runtime.jsx("nav", {
              className: "evi-pv-nav",
              "aria-label": t("ui.sections"),
              children: sections.map((s, i) => /* @__PURE__ */ jsx_runtime.jsxs(import_api2.React.Fragment, {
                children: [
                  s.group && s.group !== sections[i - 1]?.group && /* @__PURE__ */ jsx_runtime.jsx("h3", {
                    className: "evi-pv-nav-group",
                    children: s.group
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "evi-pv-tab",
                    "aria-current": s.key === current?.key,
                    onClick: () => setSelected(s.key),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "evi-pv-dot",
                        style: s.color ? { background: s.color } : undefined,
                        "data-empty": !s.color || undefined
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "evi-pv-tab-label",
                        title: s.label,
                        children: s.label
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx(TabCount, {
                        section: s
                      })
                    ]
                  })
                ]
              }, s.key))
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-pv-body",
              children: [
                items.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-pv-toolbar",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("div", {
                      className: "evi-pv-seg",
                      role: "group",
                      "aria-label": t("ui.show"),
                      children: filters.map(([key, label, count]) => /* @__PURE__ */ jsx_runtime.jsxs("button", {
                        "aria-pressed": filter === key,
                        onClick: () => setFilter(key),
                        children: [
                          label,
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "evi-pv-seg-count",
                            children: count
                          })
                        ]
                      }, key))
                    }),
                    /* @__PURE__ */ jsx_runtime.jsxs("label", {
                      className: "evi-pv-search",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsxs("svg", {
                          viewBox: "0 0 24 24",
                          width: "16",
                          height: "16",
                          "aria-hidden": "true",
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsx("circle", {
                              cx: "11",
                              cy: "11",
                              r: "6.5",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2"
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx("path", {
                              d: "M16 16l4 4",
                              stroke: "currentColor",
                              strokeWidth: "2",
                              strokeLinecap: "round"
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("span", {
                          className: "evi-pv-sr",
                          children: t("ui.searchLabel")
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("input", {
                          ref: searchRef,
                          type: "search",
                          inputMode: "search",
                          placeholder: t("ui.search"),
                          autoComplete: "off",
                          spellCheck: false,
                          value: query,
                          onChange: (e) => setQuery(e.target.value)
                        })
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-pv-scroll",
                  children: [
                    current?.notice && /* @__PURE__ */ jsx_runtime.jsx(Notice, {
                      children: current.notice
                    }),
                    !items.length ? /* @__PURE__ */ jsx_runtime.jsx("p", {
                      className: "evi-pv-empty",
                      children: current?.empty ?? t("ui.nothing")
                    }) : !visible.length ? /* @__PURE__ */ jsx_runtime.jsxs("div", {
                      className: "evi-pv-empty",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsx("p", {
                          children: emptyText()
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("button", {
                          className: "evi-pv-link",
                          onClick: () => {
                            setFilter("all");
                            setQuery("");
                          },
                          children: t("ui.showAll")
                        })
                      ]
                    }) : byCategory(visible).map(([category, list2]) => {
                      const all = items.filter((i) => (ORDER.get(i.key)?.category ?? "Other") === category);
                      return /* @__PURE__ */ jsx_runtime.jsxs("section", {
                        className: "evi-pv-group",
                        "aria-label": td(`category.${category}`),
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("h3", {
                            className: "evi-pv-heading",
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: td(`category.${category}`)
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                className: "evi-pv-heading-count",
                                children: current.overwrite ? list2.length : t("count.of", { granted: all.filter((i) => i.state === "allow").length, total: all.length })
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("ul", {
                            className: "evi-pv-list",
                            children: list2.map((i) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
                              item: i
                            }, i.key))
                          })
                        ]
                      }, category);
                    })
                  ]
                }, current?.key)
              ]
            })
          ]
        })
      ]
    })
  });
}
function SubjectIcon({ subject }) {
  const [broken, setBroken] = import_api2.React.useState(false);
  if (subject.image && !broken)
    return /* @__PURE__ */ jsx_runtime.jsx("img", {
      className: "evi-pv-avatar",
      src: subject.image,
      alt: "",
      onError: () => setBroken(true)
    });
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: "evi-pv-avatar",
    "data-glyph": "",
    style: subject.color ? { "--evi-pv-tint": subject.color } : undefined,
    "aria-hidden": "true",
    children: subject.glyph
  });
}
function TabCount({ section }) {
  if (!section.items.length)
    return null;
  const allowed = section.items.filter((i) => i.state === "allow").length;
  if (!section.overwrite)
    return /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-pv-tab-count",
      title: t("count.granted", { count: allowed }),
      children: allowed
    });
  const denied = section.items.length - allowed;
  return /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-pv-tab-count",
    title: t("count.allowedDenied", { allowed, denied }),
    children: [
      allowed > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        "data-state": "allow",
        children: [
          "+",
          allowed
        ]
      }),
      denied > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        "data-state": "deny",
        children: [
          "−",
          denied
        ]
      })
    ]
  });
}
var Notice = ({ children }) => /* @__PURE__ */ jsx_runtime.jsxs("p", {
  className: "evi-pv-notice",
  children: [
    /* @__PURE__ */ jsx_runtime.jsxs("svg", {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("circle", {
          cx: "12",
          cy: "12",
          r: "9",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2"
        }),
        /* @__PURE__ */ jsx_runtime.jsx("path", {
          d: "M12 11v5M12 8h.01",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        })
      ]
    }),
    /* @__PURE__ */ jsx_runtime.jsx("span", {
      children
    })
  ]
});
var MARKS = {
  allow: [() => t("filter.granted"), "M6.5 12.5l3.5 3.5 7.5-8"],
  deny: [() => t("filter.denied"), "M8 8l8 8M16 8l-8 8"],
  none: [() => t("filter.notGranted"), "M8 12h8"]
};
function Row({ item }) {
  const [labelOf, path] = MARKS[item.state];
  const label = labelOf();
  const { chip } = item;
  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
    className: "evi-pv-row",
    "data-state": item.state,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "evi-pv-mark",
        role: "img",
        "aria-label": label,
        children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
          viewBox: "0 0 24 24",
          width: "14",
          height: "14",
          "aria-hidden": "true",
          children: /* @__PURE__ */ jsx_runtime.jsx("path", {
            d: path,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "evi-pv-name",
        children: item.name
      }),
      chip && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        className: "evi-pv-chip",
        "data-tone": chip.tone,
        title: chip.title,
        children: [
          chip.tone !== "quiet" && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-dot",
            style: chip.color ? { background: chip.color } : undefined,
            "data-empty": !chip.color || undefined
          }),
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-chip-label",
            children: chip.label
          }),
          chip.overwrite && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-chip-kind",
            children: t("chip.overwrite")
          })
        ]
      })
    ]
  });
}
function sourceChip(source, granted, guildId, roles) {
  const name = (id) => roles.get(id)?.name ?? t("chip.deletedRole");
  switch (source.kind) {
    case "owner":
      return { label: t("chip.owner"), title: t("chip.owner") };
    case "administrator":
      return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: t("chip.admin", { role: name(source.roleId) }) };
    case "none":
      return;
    case "role": {
      if (source.roleId === guildId)
        return { label: "@everyone", tone: "quiet", title: t("chip.everyone") };
      return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: t("chip.role", { role: name(source.roleId) }) };
    }
    case "overwrite": {
      const tone = granted ? undefined : "deny";
      if (source.target === "everyone")
        return { label: "@everyone", overwrite: true, tone, title: granted ? t("chip.everyone.allowed") : t("chip.everyone.denied") };
      if (source.target === "role")
        return { label: name(source.id), color: roles.get(source.id)?.color, overwrite: true, tone, title: t(granted ? "chip.roleOverwrite.allowed" : "chip.roleOverwrite.denied", { role: name(source.id) }) };
      return { label: t("chip.member"), overwrite: true, tone, title: granted ? t("chip.memberOverwrite.allowed") : t("chip.memberOverwrite.denied") };
    }
  }
}
function entrySection(entries, guildId, roles) {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const first = entries[0]?.source;
  if (first?.kind === "owner" || first?.kind === "administrator") {
    return {
      notice: first.kind === "owner" ? t("notice.owner") : byId.get(first.roleId) ? t("notice.admin", { role: byId.get(first.roleId).name }) : t("notice.adminDeleted"),
      items: entries.map((e) => ({ key: e.key, name: permName(e), state: "allow" }))
    };
  }
  return {
    items: entries.map((e) => ({
      key: e.key,
      name: permName(e),
      state: e.granted ? "allow" : e.source.kind === "overwrite" ? "deny" : "none",
      chip: sourceChip(e.source, e.granted, guildId, byId)
    }))
  };
}
function roleSection(role) {
  const bits = toBits(role.permissions);
  return {
    notice: bits & ADMINISTRATOR ? t("notice.roleAdmin") : undefined,
    items: [
      ...PERMISSIONS.map((p) => ({ key: p.key, name: permName(p), state: bits & p.flag ? "allow" : "none" })),
      ...permissionsIn(bits).filter((p) => p.key.startsWith("BIT_")).map((p) => ({ key: p.key, name: permName(p), state: "allow" }))
    ]
  };
}
function memberSections(guildId, userId, channel) {
  const guild = getGuild(guildId);
  const roleIds = memberRoleIds(guildId, userId);
  if (!guild || !roleIds)
    return;
  const roles = guildRoles(guildId);
  const compute = (overwrites) => computePermissions({ guildId, ownerId: guild.ownerId, userId, memberRoleIds: roleIds, roles, overwrites }).entries;
  const sections = [];
  if (channel)
    sections.push({ key: "channel", label: t("section.inChannel", { channel: channelLabel(channel) }), ...entrySection(compute(overwritesOf(channel)), guildId, roles) });
  sections.push({ key: "server", label: t("section.serverWide"), ...entrySection(compute(), guildId, roles) });
  return sections;
}
function viewMember(guildId, userId, channel) {
  const sections = memberSections(guildId, userId, channel);
  if (!sections)
    return false;
  const guildName = getGuild(guildId)?.name ?? t("this.server");
  const name = userName(guildId, userId);
  openDialog({
    title: name,
    subtitle: channel ? t("subtitle.memberChannel", { channel: channelLabel(channel), guild: guildName }) : t("subtitle.member", { guild: guildName }),
    image: attempt(() => store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId, 80)),
    glyph: [...name][0]?.toUpperCase() ?? "?"
  }, sections);
  return true;
}
function viewRole(guildId, role) {
  openDialog({
    title: role.name,
    subtitle: t("subtitle.role", { guild: getGuild(guildId)?.name ?? t("this.server") }),
    glyph: "@",
    color: role.color
  }, [{ key: role.id, label: role.name, color: role.color, ...roleSection(role) }]);
}
function computeYou(guildId, userId, channel) {
  const guild = getGuild(guildId);
  return computePermissions({
    guildId,
    ownerId: guild?.ownerId,
    userId,
    memberRoleIds: memberRoleIds(guildId, userId) ?? [],
    roles: guildRoles(guildId),
    overwrites: channel ? overwritesOf(channel) : undefined
  }).entries;
}
function viewChannel(channel) {
  const guildId = channel.guild_id;
  const roles = guildRoles(guildId);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const summaries = summarizeOverwrites(guildId, overwritesOf(channel), roles);
  const sections = [];
  const me = ownId();
  if (me && memberRoleIds(guildId, me))
    sections.push({ key: "you", label: t("section.you"), ...entrySection(computeYou(guildId, me, channel), guildId, roles) });
  for (const s of summaries) {
    const label = s.target === "member" ? userName(guildId, s.id) : byId.get(s.id)?.name ?? (s.target === "everyone" ? "@everyone" : t("chip.deletedRole"));
    sections.push({
      key: s.id,
      label,
      color: s.target === "role" ? byId.get(s.id)?.color : undefined,
      group: t("section.overwrites"),
      overwrite: true,
      notice: t(s.target === "member" ? "notice.overwrite.member" : "notice.overwrite.role"),
      items: [
        ...s.allowed.map((p) => ({ key: p.key, name: permName(p), state: "allow" })),
        ...s.denied.map((p) => ({ key: p.key, name: permName(p), state: "deny" }))
      ],
      empty: t("empty.overwrite")
    });
  }
  if (!summaries.length)
    sections.push({ key: "none", label: t("section.overwrites"), items: [], empty: t("empty.noOverwrites") });
  const count = t("overwrites.count", { count: summaries.length });
  openDialog({
    title: channelLabel(channel),
    subtitle: t("subtitle.channel", { overwrites: count, guild: getGuild(guildId)?.name ?? t("this.server") }),
    glyph: "#"
  }, sections);
}
function viewGuild(guild) {
  const roles = guildRoles(guild.id);
  const sections = [];
  const me = ownId();
  if (me && memberRoleIds(guild.id, me))
    sections.push({ key: "you", label: t("section.you"), ...entrySection(computeYou(guild.id, me, undefined), guild.id, roles) });
  for (const role of roles)
    sections.push({ key: role.id, label: role.name, color: role.color, group: t("section.roles"), ...roleSection(role) });
  openDialog({
    title: guild.name,
    subtitle: t("subtitle.guild", { roles: t("roles.count", { count: roles.length }) }),
    image: attempt(() => guild.getIconURL?.(80, false)),
    glyph: [...guild.name ?? "?"][0]?.toUpperCase() ?? "?"
  }, sections);
}
var css = `
.evi-pv-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-pv-modal {
  --evi-pv-muted: var(--text-muted, #949ba4);
  --evi-pv-strong: var(--text-strong, var(--header-primary, #f2f3f5));
  --evi-pv-line: var(--border-subtle, rgba(255,255,255,.07));
  --evi-pv-hover: var(--background-modifier-hover, rgba(255,255,255,.05));
  --evi-pv-selected: var(--background-modifier-selected, rgba(255,255,255,.1));
  --evi-pv-well: color-mix(in srgb, currentColor 4%, transparent);
  --evi-pv-positive: var(--status-positive, #23a55a);
  --evi-pv-danger: var(--status-danger, #f23f43);
  --evi-pv-brand: var(--brand-500, #5865f2);
  --evi-pv-focus: var(--focus-primary, #00a8fc);
  width: min(760px, calc(100vw - 32px)); height: min(680px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--evi-pv-line);
  box-shadow: var(--shadow-high, 0 12px 40px rgba(0,0,0,.45)); outline: none; font-family: var(--font-primary); font-size: 14px; line-height: 20px;
}
.evi-pv-modal ::-webkit-scrollbar { width: 12px; height: 12px; }
.evi-pv-modal ::-webkit-scrollbar-track { background: transparent; }
.evi-pv-modal ::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-thumb, rgba(255,255,255,.14)); border: 4px solid transparent; border-radius: 8px; background-clip: padding-box; min-height: 40px; }
.evi-pv-modal ::-webkit-scrollbar-corner { background: transparent; }

.evi-pv-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 16px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; outline: 1px solid rgba(255,255,255,.08); outline-offset: -1px; }
.evi-pv-avatar[data-glyph] { --evi-pv-tint: var(--evi-pv-muted); display: grid; place-items: center; border-radius: 12px; outline: none; font-size: 18px; font-weight: 700;
  color: var(--evi-pv-tint); background: color-mix(in srgb, var(--evi-pv-tint) 16%, transparent); }
.evi-pv-titles { flex: 1; min-width: 0; }
.evi-pv-titles h2 { margin: 0; font-size: 18px; line-height: 22px; font-weight: 700; color: var(--evi-pv-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-titles p { margin: 2px 0 0; font-size: 13px; line-height: 18px; color: var(--evi-pv-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-close { flex: none; align-self: flex-start; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; transition: scale 200ms ease-out; }

.evi-pv-main { flex: 1; min-height: 0; display: flex; }
.evi-pv-nav { flex: none; width: 208px; overflow-y: auto; padding: 8px; border-inline-end: 1px solid var(--evi-pv-line); display: flex; flex-direction: column; gap: 2px; }
.evi-pv-nav-group { margin: 12px 10px 4px; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-tab { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 6px 10px; border: 0; border-radius: 8px; background: none;
  color: var(--interactive-normal, #b5bac1); font: inherit; text-align: start; cursor: pointer; }
.evi-pv-tab-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-tab[aria-current="true"] { background: var(--evi-pv-selected); color: var(--interactive-active, #fff); }
.evi-pv-tab-count { flex: none; display: flex; gap: 4px; font-size: 12px; color: var(--evi-pv-muted); font-variant-numeric: tabular-nums; }
.evi-pv-tab-count [data-state="allow"] { color: var(--evi-pv-positive); }
.evi-pv-tab-count [data-state="deny"] { color: var(--evi-pv-danger); }
.evi-pv-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
.evi-pv-dot[data-empty] { background: var(--evi-pv-muted); opacity: .5; }

.evi-pv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-pv-toolbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--evi-pv-well); }
.evi-pv-seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 10px; border: 0; border-radius: 7px; background: none;
  color: var(--evi-pv-muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-seg button[aria-pressed="true"] { background: var(--evi-pv-selected); color: var(--evi-pv-strong); }
.evi-pv-seg-count { font-size: 12px; opacity: .7; font-variant-numeric: tabular-nums; }
.evi-pv-search { flex: 1 1 140px; max-width: 240px; margin-inline-start: auto; display: flex; align-items: center; gap: 8px; height: 32px; padding-inline: 10px;
  border-radius: 8px; border: 1px solid var(--evi-pv-line); background: var(--input-background, var(--evi-pv-well)); color: var(--evi-pv-muted); cursor: text; }
.evi-pv-search:focus-within { border-color: var(--evi-pv-focus); }
.evi-pv-search input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--text-default, var(--text-normal, #dbdee1)); font: inherit; }
.evi-pv-search input::placeholder { color: var(--evi-pv-muted); }

.evi-pv-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 20px; }
.evi-pv-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; padding-inline: 4px; font-size: 12px; line-height: 16px;
  font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-heading-count { font-weight: 500; text-transform: none; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.evi-pv-list { list-style: none; margin: 0; padding: 4px; border-radius: 12px; background: var(--evi-pv-well); }
.evi-pv-row { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 6px 8px; border-radius: 8px; }
.evi-pv-name { flex: 1; min-width: 0; overflow-wrap: break-word; }
.evi-pv-row[data-state="none"] .evi-pv-name { color: var(--evi-pv-muted); }
.evi-pv-mark { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
.evi-pv-row[data-state="allow"] .evi-pv-mark { color: var(--evi-pv-positive); background: color-mix(in srgb, var(--evi-pv-positive) 16%, transparent); }
.evi-pv-row[data-state="deny"] .evi-pv-mark { color: var(--evi-pv-danger); background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-row[data-state="none"] .evi-pv-mark { color: var(--evi-pv-muted); background: var(--evi-pv-well); }

.evi-pv-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 45%; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 16px;
  white-space: nowrap; color: var(--text-default, var(--text-normal, #dbdee1)); background: var(--evi-pv-selected); }
.evi-pv-chip .evi-pv-dot { width: 8px; height: 8px; }
.evi-pv-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.evi-pv-chip-kind { flex: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="quiet"] { padding-inline: 0; background: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="deny"] { background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-chip[data-tone="deny"] .evi-pv-chip-kind { color: var(--evi-pv-danger); }

.evi-pv-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 18px; text-wrap: pretty;
  background: color-mix(in srgb, var(--evi-pv-brand) 12%, transparent); }
.evi-pv-notice svg { flex: none; margin-block-start: 1px; color: var(--evi-pv-brand); }
.evi-pv-empty { margin: auto; max-width: 320px; padding: 24px 0; text-align: center; color: var(--evi-pv-muted); text-wrap: pretty; }
.evi-pv-empty p { margin: 0 0 12px; }
.evi-pv-link { padding: 6px 12px; border: 0; border-radius: 8px; background: var(--evi-pv-selected); color: var(--evi-pv-strong); font: inherit; font-weight: 500; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.evi-pv-close:active, .evi-pv-seg button:active, .evi-pv-link:active { scale: .96; }
:is(.evi-pv-close, .evi-pv-seg button, .evi-pv-link):focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: 2px; }
.evi-pv-tab:focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: -2px; }
@media (hover: hover) {
  .evi-pv-close:hover { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-tab:hover:not([aria-current="true"]) { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-seg button:hover:not([aria-pressed="true"]) { color: var(--interactive-hover, #dbdee1); }
  .evi-pv-row:hover { background: var(--evi-pv-hover); }
}
`;
var item = (id, action) => /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Group, {
  children: /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
    id,
    label: t("menu.view"),
    action
  })
}, `${id}-group`);
var permissions_viewer_default = import_api2.definePlugin({
  start(ctx) {
    ctx.addStyle(css);
    ctx.onDispose(() => closeOpen?.({ instant: true }));
    const fail = () => ctx.toast(t("toast.fail"), { type: "failure" });
    ctx.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      const guildId = props.guildId ?? props.guild?.id ?? props.channel?.guild_id;
      if (!userId || !guildId || !memberRoleIds(guildId, userId))
        return;
      let channel = props.channel?.guild_id === guildId ? props.channel : undefined;
      if (!channel) {
        const viewed = getChannel(store("SelectedChannelStore")?.getChannelId?.());
        if (viewed?.guild_id === guildId)
          channel = viewed;
      }
      children.push(item("evi-pv-user", () => {
        try {
          if (!viewMember(guildId, userId, channel))
            fail();
        } catch (err) {
          ctx.logger.error("Viewing member permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu(["dev-context", "guild-settings-role-context"], (children, props) => {
      const roleId = props.role?.id ?? props.id;
      const guildId = props.guild?.id ?? props.guildId ?? store("SelectedGuildStore")?.getGuildId?.();
      if (!roleId || !guildId)
        return;
      const role = guildRoles(guildId).find((r) => r.id === roleId);
      if (!role)
        return;
      children.push(item("evi-pv-role", () => {
        try {
          viewRole(guildId, role);
        } catch (err) {
          ctx.logger.error("Viewing role permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu(["channel-context", "thread-context"], (children, props) => {
      const channel = props.channel;
      if (!channel?.guild_id)
        return;
      children.push(item("evi-pv-channel", () => {
        try {
          viewChannel(channel);
        } catch (err) {
          ctx.logger.error("Viewing channel permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu("guild-context", (children, props) => {
      const guild = props.guild;
      if (!guild?.id)
        return;
      children.push(item("evi-pv-guild", () => {
        try {
          viewGuild(getGuild(guild.id) ?? guild);
        } catch (err) {
          ctx.logger.error("Viewing server permissions failed", err);
          fail();
        }
      }));
    });
  },
  stop() {
    closeOpen?.({ instant: true });
  }
});
