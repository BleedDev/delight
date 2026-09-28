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

// plugins/emoji-stealer/index.tsx
var exports_emoji_stealer = {};
__export(exports_emoji_stealer, {
  default: () => emoji_stealer_default
});
module.exports = __toCommonJS(exports_emoji_stealer);
var import_api2 = require("@evi/api");

// plugins/emoji-stealer/emoji.ts
var EMOJI_NAME_MIN = 2;
var EMOJI_NAME_MAX = 32;
var EMOJI_MAX_BYTES = 256 * 1024;
var STICKER_NAME_MIN = 2;
var STICKER_NAME_MAX = 30;
var STICKER_MAX_BYTES = 512 * 1024;
var EMOJI_SLOTS_BY_TIER = [50, 100, 150, 250];
var EMOJI_SLOTS_MORE = 200;
var STICKER_SLOTS_BY_TIER = [5, 15, 30, 60];
var STICKER_SLOTS_MORE = 120;
var StickerFormat = { PNG: 1, APNG: 2, LOTTIE: 3, GIF: 4 };
var ADMINISTRATOR = 1n << 3n;
var MANAGE_GUILD_EXPRESSIONS = 1n << 30n;
var CREATE_GUILD_EXPRESSIONS = 1n << 43n;
function sanitizeEmojiName(raw, fallback = "emoji") {
  let name = String(raw ?? "").trim().replace(/^:+|:+$/g, "").split("~")[0];
  name = name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!name)
    name = fallback;
  if (name.length < EMOJI_NAME_MIN)
    name = name.padEnd(EMOJI_NAME_MIN, "_");
  return name.slice(0, EMOJI_NAME_MAX);
}
function cleanEmojiNameInput(raw) {
  return raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, EMOJI_NAME_MAX);
}
var isValidEmojiName = (name) => /^[A-Za-z0-9_]{2,32}$/.test(name);
function sanitizeStickerName(raw, fallback = "sticker") {
  let name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name)
    name = fallback;
  if (name.length < STICKER_NAME_MIN)
    name = name.padEnd(STICKER_NAME_MIN, "_");
  return name.slice(0, STICKER_NAME_MAX);
}
var isValidStickerName = (name) => name.trim().length >= STICKER_NAME_MIN && name.trim().length <= STICKER_NAME_MAX;
var tierIndex = (tier) => Math.min(3, Math.max(0, Math.trunc(Number(tier) || 0)));
function hasFeature(features, feature) {
  if (!features)
    return false;
  if (typeof features.has === "function")
    return features.has(feature);
  for (const f of features)
    if (f === feature)
      return true;
  return false;
}
function emojiSlotLimit(guild) {
  const byTier = EMOJI_SLOTS_BY_TIER[tierIndex(guild.premiumTier)];
  const base = EMOJI_SLOTS_BY_TIER[0];
  const extra = base + (guild.premiumFeatures?.additionalEmojiSlots ?? 0);
  const floor = hasFeature(guild.features, "MORE_EMOJI") ? EMOJI_SLOTS_MORE : base;
  return Math.max(byTier, floor, extra);
}
function stickerSlotLimit(guild) {
  const tier = tierIndex(guild.premiumTier);
  const byTier = tier === 3 && hasFeature(guild.features, "MORE_STICKERS") ? STICKER_SLOTS_MORE : STICKER_SLOTS_BY_TIER[tier];
  const extra = STICKER_SLOTS_BY_TIER[0] + (guild.premiumFeatures?.additionalStickerSlots ?? 0);
  return Math.max(byTier, extra);
}
function emojiSlots(guild, emojis) {
  const limit = emojiSlotLimit(guild);
  let animatedUsed = 0, staticUsed = 0;
  for (const e of emojis ?? [])
    e?.animated ? animatedUsed++ : staticUsed++;
  return { limit, staticUsed, animatedUsed, staticLeft: Math.max(0, limit - staticUsed), animatedLeft: Math.max(0, limit - animatedUsed) };
}
function stickerSlots(guild, stickers) {
  const limit = stickerSlotLimit(guild);
  const used = stickers?.length ?? 0;
  return { limit, used, left: Math.max(0, limit - used) };
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
function canAddExpressions(input) {
  if (input.ownerId && input.ownerId === input.userId)
    return true;
  const roles = Array.isArray(input.roles) ? input.roles : Object.values(input.roles);
  const byId = new Map(roles.filter((r) => r?.id).map((r) => [r.id, r]));
  let perms = toBits(byId.get(input.guildId)?.permissions);
  for (const id of input.memberRoleIds)
    perms |= toBits(byId.get(id)?.permissions);
  return !!(perms & (ADMINISTRATOR | CREATE_GUILD_EXPRESSIONS | MANAGE_GUILD_EXPRESSIONS));
}
var SNOWFLAKE = /^\d{15,25}$/;
var MARKUP = /<(a)?:([A-Za-z0-9_~]{1,32}):(\d{15,25})>/g;
function parseEmojiMarkup(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(MARKUP))
    out.push({ kind: "emoji", id: m[3], name: m[2], animated: !!m[1] });
  return out;
}
function isAnimatedUrl(url) {
  if (!url)
    return false;
  try {
    const u = new URL(url, "https://cdn.discordapp.com");
    return /\.gif$/i.test(u.pathname) || u.searchParams.get("animated") === "true";
  } catch {
    return /\.gif(?:[?#]|$)/i.test(url) || /[?&]animated=true/i.test(url);
  }
}
function parseExpressionUrl(url) {
  if (!url)
    return;
  let path;
  try {
    path = new URL(url, "https://cdn.discordapp.com").pathname;
  } catch {
    return;
  }
  const emoji = path.match(/\/emojis\/(\d{15,25})(?:\.(\w+))?$/);
  if (emoji)
    return { kind: "emoji", id: emoji[1], animated: isAnimatedUrl(url) };
  const sticker = path.match(/\/stickers\/(\d{15,25})(?:\.(\w+))?$/);
  if (sticker) {
    const ext = sticker[2]?.toLowerCase();
    return { kind: "sticker", id: sticker[1], formatType: ext === "gif" ? StickerFormat.GIF : ext === "json" ? StickerFormat.LOTTIE : undefined };
  }
}
var attr = (el, name) => {
  try {
    return el?.getAttribute?.(name) ?? null;
  } catch {
    return null;
  }
};
function nameFromAlt(alt) {
  const name = alt?.trim().replace(/^:+|:+$/g, "");
  return name && /^[A-Za-z0-9_~]{1,32}$/.test(name) ? name : undefined;
}
function expressionFromElement(target, depth = 4) {
  let el = target;
  for (let i = 0;el && i <= depth; i++, el = el.parentNode) {
    const type = attr(el, "data-type");
    const id = attr(el, "data-id");
    if (type === "emoji" && id && SNOWFLAKE.test(id)) {
      const src2 = attr(el, "src");
      const animatedAttr = attr(el, "data-animated");
      return {
        kind: "emoji",
        id,
        name: nameFromAlt(attr(el, "data-name")) ?? nameFromAlt(attr(el, "alt")),
        animated: animatedAttr != null ? animatedAttr === "true" : isAnimatedUrl(src2)
      };
    }
    if (type === "sticker" && id && SNOWFLAKE.test(id)) {
      const format = Number(attr(el, "data-format-type"));
      return { kind: "sticker", id, name: attr(el, "data-name") ?? undefined, formatType: format || undefined };
    }
    const src = attr(el, "src");
    const fromSrc = parseExpressionUrl(src);
    if (fromSrc) {
      if (fromSrc.kind === "emoji")
        fromSrc.name = nameFromAlt(attr(el, "alt")) ?? nameFromAlt(attr(el, "data-name"));
      return fromSrc;
    }
  }
}
function completeFromMessage(found, message) {
  if (!message)
    return found;
  if (found.kind === "emoji") {
    const inText = parseEmojiMarkup(message.content).find((e) => e.id === found.id);
    const inReactions = message.reactions?.find((r) => r.emoji?.id === found.id)?.emoji;
    return {
      ...found,
      name: found.name ?? inText?.name ?? inReactions?.name ?? undefined,
      animated: found.animated || !!inText?.animated || !!inReactions?.animated
    };
  }
  const items = [...message.stickerItems ?? [], ...message.sticker_items ?? [], ...message.stickers ?? []];
  const item = items.find((s) => s.id === found.id);
  return { ...found, name: found.name ?? item?.name, formatType: found.formatType ?? item?.format_type ?? item?.formatType };
}
function expressionFromMenuProps(props) {
  if (!props)
    return;
  const target = props.target ?? props.eviMenuArgs?.target;
  let found = expressionFromElement(target);
  const favType = props.favoriteableType;
  const favId = props.favoriteableId;
  if (!found && (favType === "emoji" || favType === "sticker") && typeof favId === "string" && SNOWFLAKE.test(favId)) {
    found = favType === "emoji" ? { kind: "emoji", id: favId, name: nameFromAlt(props.favoriteableName), animated: isAnimatedUrl(props.itemSrc) } : { kind: "sticker", id: favId, name: props.favoriteableName ?? undefined };
  }
  if (!found) {
    for (const url of [props.itemSrc, props.itemSafeSrc]) {
      if (typeof url === "string" && (found = parseExpressionUrl(url)))
        break;
    }
  }
  if (!found)
    return;
  return completeFromMessage(found, props.message);
}
var emojiUrl = (id, animated, size) => `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}${size ? `?size=${size}` : ""}`;
var stickerUrl = (id, formatType) => formatType === StickerFormat.LOTTIE ? `https://discord.com/stickers/${id}.json` : `https://media.discordapp.net/stickers/${id}.${formatType === StickerFormat.GIF ? "gif" : "png"}`;
var canCopySticker = (formatType) => formatType !== StickerFormat.LOTTIE;
function stickerMime(formatType) {
  return formatType === StickerFormat.GIF ? "image/gif" : "image/png";
}
function describeError(err, fallback = "Something went wrong") {
  const body = err?.body;
  if (body && typeof body === "object") {
    if (typeof body.message === "string" && body.message && body.message !== "Invalid Form Body") {
      const detail2 = firstFieldError(body.errors);
      return detail2 ? `${body.message}: ${detail2}` : body.message;
    }
    const detail = firstFieldError(body.errors) ?? firstFieldError(body);
    if (detail)
      return detail;
    if (typeof body.message === "string" && body.message)
      return body.message;
  }
  if (typeof err === "string" && err)
    return err;
  if (typeof err?.message === "string" && err.message)
    return err.message;
  return fallback;
}
function firstFieldError(value, depth = 0) {
  if (!value || depth > 5)
    return;
  if (typeof value === "string")
    return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = typeof v === "string" ? v : typeof v?.message === "string" ? v.message : firstFieldError(v, depth + 1);
      if (found)
        return found;
    }
    return;
  }
  if (typeof value === "object") {
    if (Array.isArray(value._errors))
      return firstFieldError(value._errors, depth + 1);
    for (const key of Object.keys(value)) {
      if (key === "code")
        continue;
      const found = firstFieldError(value[key], depth + 1);
      if (found)
        return found;
    }
  }
}

// plugins/emoji-stealer/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "menu.add.emoji": "Add to Server",
    "menu.add.sticker": "Add Sticker to Server",
    "menu.noServers": "No servers you can add to",
    "menu.noSlots": "No slots left",
    "menu.slots.static": { one: "{count} static slot left", other: "{count} static slots left" },
    "menu.slots.animated": { one: "{count} animated slot left", other: "{count} animated slots left" },
    "menu.slots.sticker": { one: "{count} slot left", other: "{count} slots left" },
    "menu.copyLink.emoji": "Copy Emoji Link",
    "menu.copyLink.sticker": "Copy Sticker Link",
    "menu.copyId.emoji": "Copy Emoji ID",
    "menu.copyId.sticker": "Copy Sticker ID",
    "toast.linkCopied": "Link copied",
    "toast.idCopied": "ID copied",
    "toast.copyFailed": "Couldn't copy to the clipboard",
    "toast.added.emoji": "Added :{name}: to {server}",
    "toast.added.sticker": 'Added "{name}" to {server}',
    "toast.failed.emoji": "Couldn't add the emoji: {message}",
    "toast.failed.sticker": "Couldn't add the sticker: {message}",
    "error.failed.emoji": "Couldn't add the emoji",
    "error.failed.sticker": "Couldn't add the sticker",
    "error.download": "Couldn't download it (HTTP {status})",
    "error.tooBig": "It's {size} KB, over Discord's {limit} KB limit",
    "error.read": "Couldn't read the image",
    "error.lottie": "Lottie stickers can only be uploaded to partnered and verified servers",
    "error.noEmojiUpload": "Couldn't find Discord's emoji upload",
    "error.noStickerUpload": "Couldn't find Discord's sticker upload",
    "dialog.title.emoji": "Add Emoji to Server",
    "dialog.title.sticker": "Add Sticker to Server",
    "dialog.close": "Close",
    "dialog.animated": "Animated",
    "dialog.name": "Name",
    "dialog.hint.emoji": "2 to 32 characters: letters, numbers and underscores.",
    "dialog.hint.sticker": "2 to 30 characters.",
    "dialog.server": "Server",
    "dialog.full": "full",
    "dialog.detail.emoji": "{staticLeft} static, {animatedLeft} animated left",
    "dialog.detail.sticker": "{left} of {limit} sticker slots left",
    "dialog.summary.emoji": "{staticLeft} static, {animatedLeft} animated left. Limit {limit} of each kind at this server's boost level.",
    "dialog.summary.sticker": "{left} of {limit} sticker slots left. Limit {limit} at this server's boost level.",
    "dialog.noPermission.emoji": "You don't have permission to add emoji to any other server.",
    "dialog.noPermission.sticker": "You don't have permission to add stickers to any other server.",
    "dialog.cancel": "Cancel",
    "dialog.uploading": "Uploading…",
    "dialog.submit.emoji": "Add Emoji",
    "dialog.submit.sticker": "Add Sticker"
  },
  de: {
    "menu.add.emoji": "Zum Server hinzufügen",
    "menu.add.sticker": "Sticker zum Server hinzufügen",
    "menu.noServers": "Keine Server, zu denen du hinzufügen kannst",
    "menu.noSlots": "Keine Plätze mehr frei",
    "menu.slots.static": { one: "{count} statischer Platz frei", other: "{count} statische Plätze frei" },
    "menu.slots.animated": { one: "{count} animierter Platz frei", other: "{count} animierte Plätze frei" },
    "menu.slots.sticker": { one: "{count} Platz frei", other: "{count} Plätze frei" },
    "menu.copyLink.emoji": "Emoji-Link kopieren",
    "menu.copyLink.sticker": "Sticker-Link kopieren",
    "menu.copyId.emoji": "Emoji-ID kopieren",
    "menu.copyId.sticker": "Sticker-ID kopieren",
    "toast.linkCopied": "Link kopiert",
    "toast.idCopied": "ID kopiert",
    "toast.copyFailed": "Kopieren in die Zwischenablage fehlgeschlagen",
    "toast.added.emoji": ":{name}: wurde zu {server} hinzugefügt",
    "toast.added.sticker": "„{name}“ wurde zu {server} hinzugefügt",
    "toast.failed.emoji": "Emoji konnte nicht hinzugefügt werden: {message}",
    "toast.failed.sticker": "Sticker konnte nicht hinzugefügt werden: {message}",
    "error.failed.emoji": "Emoji konnte nicht hinzugefügt werden",
    "error.failed.sticker": "Sticker konnte nicht hinzugefügt werden",
    "error.download": "Download fehlgeschlagen (HTTP {status})",
    "error.tooBig": "Die Datei ist {size} KB groß und überschreitet Discords Limit von {limit} KB",
    "error.read": "Das Bild konnte nicht gelesen werden",
    "error.lottie": "Lottie-Sticker können nur auf Partner- und verifizierte Server hochgeladen werden",
    "error.noEmojiUpload": "Discords Emoji-Upload wurde nicht gefunden",
    "error.noStickerUpload": "Discords Sticker-Upload wurde nicht gefunden",
    "dialog.title.emoji": "Emoji zum Server hinzufügen",
    "dialog.title.sticker": "Sticker zum Server hinzufügen",
    "dialog.close": "Schließen",
    "dialog.animated": "Animiert",
    "dialog.name": "Name",
    "dialog.hint.emoji": "2 bis 32 Zeichen: Buchstaben, Zahlen und Unterstriche.",
    "dialog.hint.sticker": "2 bis 30 Zeichen.",
    "dialog.server": "Server",
    "dialog.full": "voll",
    "dialog.detail.emoji": "{staticLeft} statisch, {animatedLeft} animiert frei",
    "dialog.detail.sticker": "{left} von {limit} Sticker-Plätzen frei",
    "dialog.summary.emoji": "{staticLeft} statisch, {animatedLeft} animiert frei. Limit: {limit} pro Art bei der Boost-Stufe dieses Servers.",
    "dialog.summary.sticker": "{left} von {limit} Sticker-Plätzen frei. Limit: {limit} bei der Boost-Stufe dieses Servers.",
    "dialog.noPermission.emoji": "Du hast auf keinem anderen Server die Berechtigung, Emojis hinzuzufügen.",
    "dialog.noPermission.sticker": "Du hast auf keinem anderen Server die Berechtigung, Sticker hinzuzufügen.",
    "dialog.cancel": "Abbrechen",
    "dialog.uploading": "Wird hochgeladen …",
    "dialog.submit.emoji": "Emoji hinzufügen",
    "dialog.submit.sticker": "Sticker hinzufügen"
  },
  es: {
    "menu.add.emoji": "Añadir al servidor",
    "menu.add.sticker": "Añadir sticker al servidor",
    "menu.noServers": "No hay servidores a los que puedas añadirlo",
    "menu.noSlots": "No quedan espacios",
    "menu.slots.static": { one: "{count} espacio estático libre", other: "{count} espacios estáticos libres" },
    "menu.slots.animated": { one: "{count} espacio animado libre", other: "{count} espacios animados libres" },
    "menu.slots.sticker": { one: "{count} espacio libre", other: "{count} espacios libres" },
    "menu.copyLink.emoji": "Copiar enlace del emoji",
    "menu.copyLink.sticker": "Copiar enlace del sticker",
    "menu.copyId.emoji": "Copiar ID del emoji",
    "menu.copyId.sticker": "Copiar ID del sticker",
    "toast.linkCopied": "Enlace copiado",
    "toast.idCopied": "ID copiado",
    "toast.copyFailed": "No se pudo copiar al portapapeles",
    "toast.added.emoji": "Se añadió :{name}: a {server}",
    "toast.added.sticker": "Se añadió «{name}» a {server}",
    "toast.failed.emoji": "No se pudo añadir el emoji: {message}",
    "toast.failed.sticker": "No se pudo añadir el sticker: {message}",
    "error.failed.emoji": "No se pudo añadir el emoji",
    "error.failed.sticker": "No se pudo añadir el sticker",
    "error.download": "No se pudo descargar (HTTP {status})",
    "error.tooBig": "Pesa {size} KB, más del límite de {limit} KB de Discord",
    "error.read": "No se pudo leer la imagen",
    "error.lottie": "Los stickers Lottie solo se pueden subir a servidores asociados y verificados",
    "error.noEmojiUpload": "No se encontró la subida de emojis de Discord",
    "error.noStickerUpload": "No se encontró la subida de stickers de Discord",
    "dialog.title.emoji": "Añadir emoji al servidor",
    "dialog.title.sticker": "Añadir sticker al servidor",
    "dialog.close": "Cerrar",
    "dialog.animated": "Animado",
    "dialog.name": "Nombre",
    "dialog.hint.emoji": "De 2 a 32 caracteres: letras, números y guiones bajos.",
    "dialog.hint.sticker": "De 2 a 30 caracteres.",
    "dialog.server": "Servidor",
    "dialog.full": "lleno",
    "dialog.detail.emoji": "{staticLeft} estáticos, {animatedLeft} animados libres",
    "dialog.detail.sticker": "{left} de {limit} espacios de stickers libres",
    "dialog.summary.emoji": "{staticLeft} estáticos, {animatedLeft} animados libres. Límite de {limit} de cada tipo con el nivel de potenciación de este servidor.",
    "dialog.summary.sticker": "{left} de {limit} espacios de stickers libres. Límite de {limit} con el nivel de potenciación de este servidor.",
    "dialog.noPermission.emoji": "No tienes permiso para añadir emojis a ningún otro servidor.",
    "dialog.noPermission.sticker": "No tienes permiso para añadir stickers a ningún otro servidor.",
    "dialog.cancel": "Cancelar",
    "dialog.uploading": "Subiendo…",
    "dialog.submit.emoji": "Añadir emoji",
    "dialog.submit.sticker": "Añadir sticker"
  },
  fr: {
    "menu.add.emoji": "Ajouter au serveur",
    "menu.add.sticker": "Ajouter le sticker au serveur",
    "menu.noServers": "Aucun serveur où tu peux l'ajouter",
    "menu.noSlots": "Plus d'emplacements",
    "menu.slots.static": { one: "{count} emplacement statique restant", other: "{count} emplacements statiques restants" },
    "menu.slots.animated": { one: "{count} emplacement animé restant", other: "{count} emplacements animés restants" },
    "menu.slots.sticker": { one: "{count} emplacement restant", other: "{count} emplacements restants" },
    "menu.copyLink.emoji": "Copier le lien de l'émoji",
    "menu.copyLink.sticker": "Copier le lien du sticker",
    "menu.copyId.emoji": "Copier l'ID de l'émoji",
    "menu.copyId.sticker": "Copier l'ID du sticker",
    "toast.linkCopied": "Lien copié",
    "toast.idCopied": "ID copié",
    "toast.copyFailed": "Impossible de copier dans le presse-papiers",
    "toast.added.emoji": ":{name}: ajouté à {server}",
    "toast.added.sticker": "« {name} » ajouté à {server}",
    "toast.failed.emoji": "Impossible d'ajouter l'émoji : {message}",
    "toast.failed.sticker": "Impossible d'ajouter le sticker : {message}",
    "error.failed.emoji": "Impossible d'ajouter l'émoji",
    "error.failed.sticker": "Impossible d'ajouter le sticker",
    "error.download": "Téléchargement impossible (HTTP {status})",
    "error.tooBig": "Le fichier fait {size} Ko, au-delà de la limite de {limit} Ko de Discord",
    "error.read": "Impossible de lire l'image",
    "error.lottie": "Les stickers Lottie ne peuvent être importés que sur les serveurs partenaires et vérifiés",
    "error.noEmojiUpload": "Import d'émojis de Discord introuvable",
    "error.noStickerUpload": "Import de stickers de Discord introuvable",
    "dialog.title.emoji": "Ajouter l'émoji au serveur",
    "dialog.title.sticker": "Ajouter le sticker au serveur",
    "dialog.close": "Fermer",
    "dialog.animated": "Animé",
    "dialog.name": "Nom",
    "dialog.hint.emoji": "De 2 à 32 caractères : lettres, chiffres et tirets bas.",
    "dialog.hint.sticker": "De 2 à 30 caractères.",
    "dialog.server": "Serveur",
    "dialog.full": "plein",
    "dialog.detail.emoji": "{staticLeft} statiques, {animatedLeft} animés restants",
    "dialog.detail.sticker": "{left} emplacements de stickers restants sur {limit}",
    "dialog.summary.emoji": "{staticLeft} statiques, {animatedLeft} animés restants. Limite de {limit} de chaque type au niveau de boost de ce serveur.",
    "dialog.summary.sticker": "{left} emplacements de stickers restants sur {limit}. Limite de {limit} au niveau de boost de ce serveur.",
    "dialog.noPermission.emoji": "Tu n'as la permission d'ajouter des émojis sur aucun autre serveur.",
    "dialog.noPermission.sticker": "Tu n'as la permission d'ajouter des stickers sur aucun autre serveur.",
    "dialog.cancel": "Annuler",
    "dialog.uploading": "Import en cours…",
    "dialog.submit.emoji": "Ajouter l'émoji",
    "dialog.submit.sticker": "Ajouter le sticker"
  },
  ja: {
    "menu.add.emoji": "サーバーに追加",
    "menu.add.sticker": "ステッカーをサーバーに追加",
    "menu.noServers": "追加できるサーバーがありません",
    "menu.noSlots": "空きがありません",
    "menu.slots.static": { other: "静止画の空き: {count}" },
    "menu.slots.animated": { other: "アニメーションの空き: {count}" },
    "menu.slots.sticker": { other: "空き: {count}" },
    "menu.copyLink.emoji": "絵文字のリンクをコピー",
    "menu.copyLink.sticker": "ステッカーのリンクをコピー",
    "menu.copyId.emoji": "絵文字IDをコピー",
    "menu.copyId.sticker": "ステッカーIDをコピー",
    "toast.linkCopied": "リンクをコピーしました",
    "toast.idCopied": "IDをコピーしました",
    "toast.copyFailed": "クリップボードにコピーできませんでした",
    "toast.added.emoji": ":{name}: を{server}に追加しました",
    "toast.added.sticker": "「{name}」を{server}に追加しました",
    "toast.failed.emoji": "絵文字を追加できませんでした: {message}",
    "toast.failed.sticker": "ステッカーを追加できませんでした: {message}",
    "error.failed.emoji": "絵文字を追加できませんでした",
    "error.failed.sticker": "ステッカーを追加できませんでした",
    "error.download": "ダウンロードできませんでした (HTTP {status})",
    "error.tooBig": "{size} KBあり、Discordの上限 {limit} KBを超えています",
    "error.read": "画像を読み込めませんでした",
    "error.lottie": "Lottieステッカーは、パートナーおよび認証済みサーバーにのみアップロードできます",
    "error.noEmojiUpload": "Discordの絵文字アップロードが見つかりませんでした",
    "error.noStickerUpload": "Discordのステッカーアップロードが見つかりませんでした",
    "dialog.title.emoji": "絵文字をサーバーに追加",
    "dialog.title.sticker": "ステッカーをサーバーに追加",
    "dialog.close": "閉じる",
    "dialog.animated": "アニメーション",
    "dialog.name": "名前",
    "dialog.hint.emoji": "2〜32文字。英数字とアンダースコアが使えます。",
    "dialog.hint.sticker": "2〜30文字。",
    "dialog.server": "サーバー",
    "dialog.full": "満杯",
    "dialog.detail.emoji": "静止画 残り{staticLeft}、アニメーション 残り{animatedLeft}",
    "dialog.detail.sticker": "ステッカー枠 残り{left}/{limit}",
    "dialog.summary.emoji": "静止画 残り{staticLeft}、アニメーション 残り{animatedLeft}。このサーバーのブーストレベルでは、それぞれ最大{limit}個です。",
    "dialog.summary.sticker": "ステッカー枠 残り{left}/{limit}。このサーバーのブーストレベルでは最大{limit}個です。",
    "dialog.noPermission.emoji": "他のどのサーバーにも絵文字を追加する権限がありません。",
    "dialog.noPermission.sticker": "他のどのサーバーにもステッカーを追加する権限がありません。",
    "dialog.cancel": "キャンセル",
    "dialog.uploading": "アップロード中…",
    "dialog.submit.emoji": "絵文字を追加",
    "dialog.submit.sticker": "ステッカーを追加"
  },
  pl: {
    "menu.add.emoji": "Dodaj do serwera",
    "menu.add.sticker": "Dodaj naklejkę do serwera",
    "menu.noServers": "Brak serwerów, do których możesz dodawać",
    "menu.noSlots": "Brak wolnych miejsc",
    "menu.slots.static": { one: "{count} wolne miejsce na statyczne", few: "{count} wolne miejsca na statyczne", many: "{count} wolnych miejsc na statyczne", other: "{count} wolnego miejsca na statyczne" },
    "menu.slots.animated": { one: "{count} wolne miejsce na animowane", few: "{count} wolne miejsca na animowane", many: "{count} wolnych miejsc na animowane", other: "{count} wolnego miejsca na animowane" },
    "menu.slots.sticker": { one: "{count} wolne miejsce", few: "{count} wolne miejsca", many: "{count} wolnych miejsc", other: "{count} wolnego miejsca" },
    "menu.copyLink.emoji": "Kopiuj link do emoji",
    "menu.copyLink.sticker": "Kopiuj link do naklejki",
    "menu.copyId.emoji": "Kopiuj ID emoji",
    "menu.copyId.sticker": "Kopiuj ID naklejki",
    "toast.linkCopied": "Skopiowano link",
    "toast.idCopied": "Skopiowano ID",
    "toast.copyFailed": "Nie udało się skopiować do schowka",
    "toast.added.emoji": "Dodano :{name}: do serwera {server}",
    "toast.added.sticker": "Dodano „{name}” do serwera {server}",
    "toast.failed.emoji": "Nie udało się dodać emoji: {message}",
    "toast.failed.sticker": "Nie udało się dodać naklejki: {message}",
    "error.failed.emoji": "Nie udało się dodać emoji",
    "error.failed.sticker": "Nie udało się dodać naklejki",
    "error.download": "Nie udało się pobrać (HTTP {status})",
    "error.tooBig": "Plik ma {size} KB, czyli więcej niż limit Discorda ({limit} KB)",
    "error.read": "Nie udało się odczytać obrazu",
    "error.lottie": "Naklejki Lottie można przesyłać tylko na serwery partnerskie i zweryfikowane",
    "error.noEmojiUpload": "Nie znaleziono przesyłania emoji w Discordzie",
    "error.noStickerUpload": "Nie znaleziono przesyłania naklejek w Discordzie",
    "dialog.title.emoji": "Dodaj emoji do serwera",
    "dialog.title.sticker": "Dodaj naklejkę do serwera",
    "dialog.close": "Zamknij",
    "dialog.animated": "Animowane",
    "dialog.name": "Nazwa",
    "dialog.hint.emoji": "Od 2 do 32 znaków: litery, cyfry i podkreślenia.",
    "dialog.hint.sticker": "Od 2 do 30 znaków.",
    "dialog.server": "Serwer",
    "dialog.full": "pełny",
    "dialog.detail.emoji": "wolne: {staticLeft} statycznych, {animatedLeft} animowanych",
    "dialog.detail.sticker": "wolne miejsca na naklejki: {left} z {limit}",
    "dialog.summary.emoji": "Wolne: {staticLeft} statycznych, {animatedLeft} animowanych. Limit to {limit} każdego rodzaju przy poziomie ulepszenia tego serwera.",
    "dialog.summary.sticker": "Wolne miejsca na naklejki: {left} z {limit}. Limit to {limit} przy poziomie ulepszenia tego serwera.",
    "dialog.noPermission.emoji": "Nie masz uprawnień do dodawania emoji na żadnym innym serwerze.",
    "dialog.noPermission.sticker": "Nie masz uprawnień do dodawania naklejek na żadnym innym serwerze.",
    "dialog.cancel": "Anuluj",
    "dialog.uploading": "Przesyłanie…",
    "dialog.submit.emoji": "Dodaj emoji",
    "dialog.submit.sticker": "Dodaj naklejkę"
  },
  "pt-BR": {
    "menu.add.emoji": "Adicionar ao servidor",
    "menu.add.sticker": "Adicionar figurinha ao servidor",
    "menu.noServers": "Nenhum servidor onde você possa adicionar",
    "menu.noSlots": "Sem vagas restantes",
    "menu.slots.static": { one: "{count} vaga estática restante", other: "{count} vagas estáticas restantes" },
    "menu.slots.animated": { one: "{count} vaga animada restante", other: "{count} vagas animadas restantes" },
    "menu.slots.sticker": { one: "{count} vaga restante", other: "{count} vagas restantes" },
    "menu.copyLink.emoji": "Copiar link do emoji",
    "menu.copyLink.sticker": "Copiar link da figurinha",
    "menu.copyId.emoji": "Copiar ID do emoji",
    "menu.copyId.sticker": "Copiar ID da figurinha",
    "toast.linkCopied": "Link copiado",
    "toast.idCopied": "ID copiado",
    "toast.copyFailed": "Não foi possível copiar para a área de transferência",
    "toast.added.emoji": ":{name}: adicionado a {server}",
    "toast.added.sticker": "“{name}” adicionada a {server}",
    "toast.failed.emoji": "Não foi possível adicionar o emoji: {message}",
    "toast.failed.sticker": "Não foi possível adicionar a figurinha: {message}",
    "error.failed.emoji": "Não foi possível adicionar o emoji",
    "error.failed.sticker": "Não foi possível adicionar a figurinha",
    "error.download": "Não foi possível baixar (HTTP {status})",
    "error.tooBig": "O arquivo tem {size} KB, acima do limite de {limit} KB do Discord",
    "error.read": "Não foi possível ler a imagem",
    "error.lottie": "Figurinhas Lottie só podem ser enviadas para servidores parceiros e verificados",
    "error.noEmojiUpload": "Não foi possível encontrar o envio de emojis do Discord",
    "error.noStickerUpload": "Não foi possível encontrar o envio de figurinhas do Discord",
    "dialog.title.emoji": "Adicionar emoji ao servidor",
    "dialog.title.sticker": "Adicionar figurinha ao servidor",
    "dialog.close": "Fechar",
    "dialog.animated": "Animado",
    "dialog.name": "Nome",
    "dialog.hint.emoji": "De 2 a 32 caracteres: letras, números e underscores.",
    "dialog.hint.sticker": "De 2 a 30 caracteres.",
    "dialog.server": "Servidor",
    "dialog.full": "cheio",
    "dialog.detail.emoji": "{staticLeft} estáticos, {animatedLeft} animados restantes",
    "dialog.detail.sticker": "{left} de {limit} vagas de figurinhas restantes",
    "dialog.summary.emoji": "{staticLeft} estáticos, {animatedLeft} animados restantes. Limite de {limit} de cada tipo no nível de impulso deste servidor.",
    "dialog.summary.sticker": "{left} de {limit} vagas de figurinhas restantes. Limite de {limit} no nível de impulso deste servidor.",
    "dialog.noPermission.emoji": "Você não tem permissão para adicionar emojis a nenhum outro servidor.",
    "dialog.noPermission.sticker": "Você não tem permissão para adicionar figurinhas a nenhum outro servidor.",
    "dialog.cancel": "Cancelar",
    "dialog.uploading": "Enviando…",
    "dialog.submit.emoji": "Adicionar emoji",
    "dialog.submit.sticker": "Adicionar figurinha"
  },
  ru: {
    "menu.add.emoji": "Добавить на сервер",
    "menu.add.sticker": "Добавить стикер на сервер",
    "menu.noServers": "Нет серверов, куда можно добавить",
    "menu.noSlots": "Свободных слотов нет",
    "menu.slots.static": { one: "{count} свободный статичный слот", few: "{count} свободных статичных слота", many: "{count} свободных статичных слотов", other: "{count} свободных статичных слота" },
    "menu.slots.animated": { one: "{count} свободный анимированный слот", few: "{count} свободных анимированных слота", many: "{count} свободных анимированных слотов", other: "{count} свободных анимированных слота" },
    "menu.slots.sticker": { one: "{count} свободный слот", few: "{count} свободных слота", many: "{count} свободных слотов", other: "{count} свободных слота" },
    "menu.copyLink.emoji": "Копировать ссылку на эмодзи",
    "menu.copyLink.sticker": "Копировать ссылку на стикер",
    "menu.copyId.emoji": "Копировать ID эмодзи",
    "menu.copyId.sticker": "Копировать ID стикера",
    "toast.linkCopied": "Ссылка скопирована",
    "toast.idCopied": "ID скопирован",
    "toast.copyFailed": "Не удалось скопировать в буфер обмена",
    "toast.added.emoji": ":{name}: добавлен на сервер {server}",
    "toast.added.sticker": "Стикер «{name}» добавлен на сервер {server}",
    "toast.failed.emoji": "Не удалось добавить эмодзи: {message}",
    "toast.failed.sticker": "Не удалось добавить стикер: {message}",
    "error.failed.emoji": "Не удалось добавить эмодзи",
    "error.failed.sticker": "Не удалось добавить стикер",
    "error.download": "Не удалось скачать (HTTP {status})",
    "error.tooBig": "Размер файла {size} КБ, что больше лимита Discord в {limit} КБ",
    "error.read": "Не удалось прочитать изображение",
    "error.lottie": "Стикеры Lottie можно загружать только на серверы партнёров и верифицированные серверы",
    "error.noEmojiUpload": "Не удалось найти загрузку эмодзи в Discord",
    "error.noStickerUpload": "Не удалось найти загрузку стикеров в Discord",
    "dialog.title.emoji": "Добавить эмодзи на сервер",
    "dialog.title.sticker": "Добавить стикер на сервер",
    "dialog.close": "Закрыть",
    "dialog.animated": "Анимированный",
    "dialog.name": "Название",
    "dialog.hint.emoji": "От 2 до 32 символов: буквы, цифры и знаки подчёркивания.",
    "dialog.hint.sticker": "От 2 до 30 символов.",
    "dialog.server": "Сервер",
    "dialog.full": "заполнен",
    "dialog.detail.emoji": "свободно: статичных {staticLeft}, анимированных {animatedLeft}",
    "dialog.detail.sticker": "свободно слотов для стикеров: {left} из {limit}",
    "dialog.summary.emoji": "Свободно: статичных {staticLeft}, анимированных {animatedLeft}. Лимит на уровне буста этого сервера: {limit} каждого вида.",
    "dialog.summary.sticker": "Свободно слотов для стикеров: {left} из {limit}. Лимит на уровне буста этого сервера: {limit}.",
    "dialog.noPermission.emoji": "У вас нет прав на добавление эмодзи ни на один другой сервер.",
    "dialog.noPermission.sticker": "У вас нет прав на добавление стикеров ни на один другой сервер.",
    "dialog.cancel": "Отмена",
    "dialog.uploading": "Загрузка…",
    "dialog.submit.emoji": "Добавить эмодзи",
    "dialog.submit.sticker": "Добавить стикер"
  },
  tr: {
    "menu.add.emoji": "Sunucuya Ekle",
    "menu.add.sticker": "Çıkartmayı Sunucuya Ekle",
    "menu.noServers": "Ekleyebileceğin sunucu yok",
    "menu.noSlots": "Boş yuva kalmadı",
    "menu.slots.static": { other: "{count} sabit yuva boş" },
    "menu.slots.animated": { other: "{count} hareketli yuva boş" },
    "menu.slots.sticker": { other: "{count} yuva boş" },
    "menu.copyLink.emoji": "Emoji Bağlantısını Kopyala",
    "menu.copyLink.sticker": "Çıkartma Bağlantısını Kopyala",
    "menu.copyId.emoji": "Emoji Kimliğini Kopyala",
    "menu.copyId.sticker": "Çıkartma Kimliğini Kopyala",
    "toast.linkCopied": "Bağlantı kopyalandı",
    "toast.idCopied": "Kimlik kopyalandı",
    "toast.copyFailed": "Panoya kopyalanamadı",
    "toast.added.emoji": ":{name}: {server} sunucusuna eklendi",
    "toast.added.sticker": '"{name}" {server} sunucusuna eklendi',
    "toast.failed.emoji": "Emoji eklenemedi: {message}",
    "toast.failed.sticker": "Çıkartma eklenemedi: {message}",
    "error.failed.emoji": "Emoji eklenemedi",
    "error.failed.sticker": "Çıkartma eklenemedi",
    "error.download": "İndirilemedi (HTTP {status})",
    "error.tooBig": "Dosya {size} KB, Discord'un {limit} KB sınırını aşıyor",
    "error.read": "Görsel okunamadı",
    "error.lottie": "Lottie çıkartmaları yalnızca ortak ve doğrulanmış sunuculara yüklenebilir",
    "error.noEmojiUpload": "Discord'un emoji yüklemesi bulunamadı",
    "error.noStickerUpload": "Discord'un çıkartma yüklemesi bulunamadı",
    "dialog.title.emoji": "Emojiyi Sunucuya Ekle",
    "dialog.title.sticker": "Çıkartmayı Sunucuya Ekle",
    "dialog.close": "Kapat",
    "dialog.animated": "Hareketli",
    "dialog.name": "Ad",
    "dialog.hint.emoji": "2 ila 32 karakter: harfler, rakamlar ve alt çizgiler.",
    "dialog.hint.sticker": "2 ila 30 karakter.",
    "dialog.server": "Sunucu",
    "dialog.full": "dolu",
    "dialog.detail.emoji": "{staticLeft} sabit, {animatedLeft} hareketli boş",
    "dialog.detail.sticker": "{limit} çıkartma yuvasından {left} tanesi boş",
    "dialog.summary.emoji": "{staticLeft} sabit, {animatedLeft} hareketli boş. Bu sunucunun destek seviyesinde her türden {limit} sınırı var.",
    "dialog.summary.sticker": "{limit} çıkartma yuvasından {left} tanesi boş. Bu sunucunun destek seviyesinde sınır {limit}.",
    "dialog.noPermission.emoji": "Başka hiçbir sunucuya emoji ekleme iznin yok.",
    "dialog.noPermission.sticker": "Başka hiçbir sunucuya çıkartma ekleme iznin yok.",
    "dialog.cancel": "İptal",
    "dialog.uploading": "Yükleniyor…",
    "dialog.submit.emoji": "Emoji Ekle",
    "dialog.submit.sticker": "Çıkartma Ekle"
  }
});

// plugins/emoji-stealer/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var context;
var store = (name) => {
  try {
    return import_api2.getStore(name);
  } catch {
    return;
  }
};
var ownId = () => store("UserStore")?.getCurrentUser?.()?.id;
function guildRoles(guildId) {
  const roleStore = store("GuildRoleStore");
  let raw;
  try {
    raw = roleStore?.getRolesSnapshot?.(guildId) ?? roleStore?.getRoles?.(guildId) ?? roleStore?.getSortedRoles?.(guildId);
  } catch {}
  raw ??= store("GuildStore")?.getGuild?.(guildId)?.roles;
  return !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
}
function allGuilds() {
  const gs = store("GuildStore");
  const list = gs?.getGuildsArray?.() ?? Object.values(gs?.getGuilds?.() ?? {});
  return list.filter((g) => g?.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function eligibleGuilds() {
  const me = ownId();
  if (!me)
    return [];
  const members = store("GuildMemberStore");
  return allGuilds().filter((g) => {
    const member = members?.getMember?.(g.id, me);
    if (!member && g.ownerId !== me)
      return false;
    return canAddExpressions({ guildId: g.id, ownerId: g.ownerId, userId: me, memberRoleIds: member?.roles ?? [], roles: guildRoles(g.id) });
  });
}
var guildEmojis = (guildId) => store("EmojiStore")?.getGuildEmoji?.(guildId) ?? [];
var guildStickers = (guildId) => store("StickersStore")?.getStickersByGuildId?.(guildId) ?? [];
function slotsLeft(guild, expression) {
  if (expression.kind === "emoji") {
    const s2 = emojiSlots(guild, guildEmojis(guild.id));
    const vars2 = { staticLeft: s2.staticLeft, animatedLeft: s2.animatedLeft, limit: s2.limit };
    return {
      left: expression.animated ? s2.animatedLeft : s2.staticLeft,
      limit: s2.limit,
      detail: t("dialog.detail.emoji", vars2),
      summary: t("dialog.summary.emoji", vars2)
    };
  }
  const s = stickerSlots(guild, guildStickers(guild.id));
  const vars = { left: s.left, limit: s.limit };
  return { left: s.left, limit: s.limit, detail: t("dialog.detail.sticker", vars), summary: t("dialog.summary.sticker", vars) };
}
function sourceGuildId(expression) {
  if (expression.kind === "emoji")
    return store("EmojiStore")?.getCustomEmojiById?.(expression.id)?.guildId;
  return store("StickersStore")?.getStickerById?.(expression.id)?.guild_id;
}
var http = () => import_api2.find(import_api2.filters.byProps("get", "post", "put", "patch", "del"));
async function fetchBlob(url, maxBytes) {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(t("error.download", { status: res.status }));
  const blob = await res.blob();
  if (blob.size > maxBytes)
    throw new Error(t("error.tooBig", { size: Math.ceil(blob.size / 1024), limit: maxBytes / 1024 }));
  return blob;
}
var toDataUri = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader;
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error(t("error.read")));
  reader.readAsDataURL(blob);
});
async function uploadEmoji(emoji, guildId, name) {
  let blob;
  let lastError;
  for (const size of emoji.animated ? [128, 96, 64] : [128]) {
    try {
      blob = await fetchBlob(emojiUrl(emoji.id, emoji.animated, size), EMOJI_MAX_BYTES);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!blob)
    throw lastError;
  const image = await toDataUri(blob);
  const action = import_api2.findByCode('"EMOJI_UPLOAD_START"', "GUILD_EMOJIS(");
  if (typeof action === "function")
    return action({ guildId, image, name, roles: [] });
  const client = http();
  if (!client)
    throw new Error(t("error.noEmojiUpload"));
  return (await client.post({ url: `/guilds/${guildId}/emojis`, body: { image, name, roles: [] }, oldFormErrors: true, rejectWithError: true }))?.body;
}
async function stickerDetails(sticker) {
  const cached = store("StickersStore")?.getStickerById?.(sticker.id);
  if (cached)
    return cached;
  try {
    return (await http()?.get({ url: `/stickers/${sticker.id}`, rejectWithError: true }))?.body ?? {};
  } catch {
    return {};
  }
}
async function uploadSticker(sticker, guildId, name) {
  const details = await stickerDetails(sticker);
  const formatType = sticker.formatType ?? details.format_type;
  if (!canCopySticker(formatType))
    throw new Error(t("error.lottie"));
  const blob = await fetchBlob(stickerUrl(sticker.id, formatType), STICKER_MAX_BYTES);
  const mime = stickerMime(formatType);
  const body = new FormData;
  body.append("name", name);
  body.append("tags", details.tags?.trim() || name);
  body.append("description", details.description ?? "");
  body.append("file", new File([blob], `${name}.${mime === "image/gif" ? "gif" : "png"}`, { type: mime }));
  const action = import_api2.findByCode('"GUILD_STICKERS_CREATE_SUCCESS"', "GUILD_STICKER_PACKS(");
  if (typeof action === "function")
    return action({ guildId, body, platform: "web", originalMd5: null });
  const client = http();
  if (!client)
    throw new Error(t("error.noStickerUpload"));
  return (await client.post({ url: `/guilds/${guildId}/stickers`, body, rejectWithError: true }))?.body;
}
async function copy(text, done) {
  try {
    const native = window.DiscordNative?.clipboard;
    if (native?.copy)
      native.copy(text);
    else
      await navigator.clipboard.writeText(text);
    context?.toast(done, { type: "success" });
  } catch {
    context?.toast(t("toast.copyFailed"), { type: "failure" });
  }
}
var closeOpen;
function openDialog(expression, guildId) {
  closeOpen?.();
  const close = import_api2.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(Dialog, {
    expression,
    initialGuildId: guildId,
    onClose: () => close2()
  }), {
    onClosed: () => void (closeOpen === close && (closeOpen = undefined))
  });
  closeOpen = close;
}
var previewUrl = (e) => e.kind === "emoji" ? emojiUrl(e.id, e.animated, 128) : stickerUrl(e.id, e.formatType);
function Dialog({ expression, initialGuildId, onClose }) {
  const isEmoji = expression.kind === "emoji";
  const noun = expression.kind;
  const guilds = import_api2.React.useMemo(() => {
    const source = sourceGuildId(expression);
    return eligibleGuilds().filter((g) => g.id !== source).map((g) => ({ guild: g, slots: slotsLeft(g, expression) }));
  }, [expression]);
  const firstOpen = guilds.find((g) => g.slots.left > 0)?.guild.id;
  const [guildId, setGuildId] = import_api2.React.useState(guilds.some((g) => g.guild.id === initialGuildId) ? initialGuildId : firstOpen ?? guilds[0]?.guild.id ?? "");
  const [name, setName] = import_api2.React.useState(isEmoji ? sanitizeEmojiName(expression.name) : sanitizeStickerName(expression.name));
  const [busy, setBusy] = import_api2.React.useState(false);
  const [error, setError] = import_api2.React.useState();
  const ref = import_api2.React.useRef(null);
  const selected = guilds.find((g) => g.guild.id === guildId);
  const nameOk = isEmoji ? isValidEmojiName(name) : isValidStickerName(name);
  const canSubmit = !busy && !!selected && selected.slots.left > 0 && nameOk;
  import_api2.React.useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("input")?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape")
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit || !selected)
      return;
    setBusy(true);
    setError(undefined);
    const finalName = isEmoji ? name : name.trim();
    try {
      if (expression.kind === "emoji")
        await uploadEmoji(expression, selected.guild.id, finalName);
      else
        await uploadSticker(expression, selected.guild.id, finalName);
      context?.toast(t(isEmoji ? "toast.added.emoji" : "toast.added.sticker", { name: finalName, server: selected.guild.name }), { type: "success" });
      onClose();
    } catch (err) {
      context?.logger.error(`Uploading the ${noun} failed`, err);
      const message = describeError(err, t(isEmoji ? "error.failed.emoji" : "error.failed.sticker"));
      setError(message);
      context?.toast(t(isEmoji ? "toast.failed.emoji" : "toast.failed.sticker", { message }), { type: "failure" });
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-es-scrim evi-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && !busy && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-es-modal evi-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-es-title",
      ref,
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-es-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("h2", {
              id: "evi-es-title",
              children: t(isEmoji ? "dialog.title.emoji" : "dialog.title.sticker")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-es-close",
              "aria-label": t("dialog.close"),
              onClick: onClose,
              disabled: busy,
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "20",
                height: "20",
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
        /* @__PURE__ */ jsx_runtime.jsxs("form", {
          className: "evi-es-body",
          onSubmit: submit,
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-es-preview",
              "data-kind": expression.kind,
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("img", {
                  src: previewUrl(expression),
                  alt: "",
                  width: isEmoji ? 64 : 120,
                  height: isEmoji ? 64 : 120
                }),
                isEmoji && expression.animated && /* @__PURE__ */ jsx_runtime.jsx("span", {
                  className: "evi-es-badge",
                  children: t("dialog.animated")
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("label", {
              className: "evi-es-label",
              htmlFor: "evi-es-name",
              children: t("dialog.name")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("input", {
              id: "evi-es-name",
              className: "evi-es-input",
              value: name,
              maxLength: isEmoji ? EMOJI_NAME_MAX : STICKER_NAME_MAX,
              spellCheck: false,
              autoComplete: "off",
              disabled: busy,
              "aria-invalid": !nameOk,
              "aria-describedby": "evi-es-name-hint",
              onChange: (e) => setName(isEmoji ? cleanEmojiNameInput(e.currentTarget.value) : e.currentTarget.value.slice(0, STICKER_NAME_MAX))
            }),
            /* @__PURE__ */ jsx_runtime.jsx("p", {
              id: "evi-es-name-hint",
              className: "evi-es-hint",
              "data-error": !nameOk || undefined,
              children: t(isEmoji ? "dialog.hint.emoji" : "dialog.hint.sticker")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("label", {
              className: "evi-es-label",
              htmlFor: "evi-es-guild",
              children: t("dialog.server")
            }),
            guilds.length ? /* @__PURE__ */ jsx_runtime.jsx("select", {
              id: "evi-es-guild",
              className: "evi-es-input",
              value: guildId,
              disabled: busy,
              onChange: (e) => setGuildId(e.currentTarget.value),
              children: guilds.map(({ guild, slots }) => /* @__PURE__ */ jsx_runtime.jsxs("option", {
                value: guild.id,
                disabled: slots.left <= 0,
                children: [
                  guild.name,
                  " (",
                  slots.left <= 0 ? t("dialog.full") : slots.detail,
                  ")"
                ]
              }, guild.id))
            }) : /* @__PURE__ */ jsx_runtime.jsx("p", {
              className: "evi-es-hint",
              "data-error": true,
              children: t(isEmoji ? "dialog.noPermission.emoji" : "dialog.noPermission.sticker")
            }),
            selected && /* @__PURE__ */ jsx_runtime.jsx("p", {
              className: "evi-es-hint",
              children: selected.slots.summary
            }),
            error && /* @__PURE__ */ jsx_runtime.jsx("p", {
              className: "evi-es-error",
              role: "alert",
              children: error
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("footer", {
              className: "evi-es-foot",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("button", {
                  type: "button",
                  className: "evi-es-button",
                  "data-variant": "secondary",
                  onClick: onClose,
                  disabled: busy,
                  children: t("dialog.cancel")
                }),
                /* @__PURE__ */ jsx_runtime.jsx("button", {
                  type: "submit",
                  className: "evi-es-button",
                  disabled: !canSubmit,
                  children: busy ? t("dialog.uploading") : t(isEmoji ? "dialog.submit.emoji" : "dialog.submit.sticker")
                })
              ]
            })
          ]
        })
      ]
    })
  });
}
var css = `
.evi-es-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-es-modal { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; border-radius: 12px;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1));
  border: 1px solid var(--border-subtle, transparent); box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-es-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 16px 0 20px; }
.evi-es-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-es-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-es-close:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-es-body { display: flex; flex-direction: column; padding: 12px 20px 20px; }
.evi-es-preview { position: relative; display: grid; place-items: center; align-self: center; min-width: 96px; min-height: 96px; padding: 12px; margin-bottom: 16px;
  border-radius: 12px; background: var(--background-secondary, rgba(0,0,0,.2)); }
.evi-es-preview img { object-fit: contain; }
.evi-es-badge { position: absolute; bottom: 6px; right: 6px; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;
  background: var(--background-modifier-accent, rgba(255,255,255,.1)); color: var(--text-muted, #949ba4); }
.evi-es-label { margin: 12px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-es-input { width: 100%; box-sizing: border-box; height: 40px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 15px;
  border: 1px solid var(--input-border, var(--border-subtle, rgba(255,255,255,.08))); background: var(--input-background, var(--background-tertiary, #1e1f22)); color: inherit; }
.evi-es-input:focus { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -1px; }
.evi-es-input[aria-invalid="true"] { border-color: var(--status-danger, #f23f43); }
.evi-es-hint { margin: 6px 0 0; font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); }
.evi-es-hint[data-error] { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
.evi-es-error { margin: 12px 0 0; padding: 8px 12px; border-radius: 8px; font-size: 14px; color: var(--text-feedback-critical, #f23f43);
  background: color-mix(in srgb, var(--status-danger, #f23f43) 12%, transparent); }
.evi-es-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.evi-es-button { min-width: 96px; height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); transition: background-color .15s ease-out; }
.evi-es-button:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-es-button[data-variant="secondary"] { background: var(--button-secondary-background, rgba(255,255,255,.08)); color: var(--text-default, #dbdee1); }
.evi-es-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--button-secondary-background-hover, rgba(255,255,255,.12)); }
.evi-es-button:disabled { opacity: .5; cursor: not-allowed; }
.evi-es-button:focus-visible, .evi-es-close:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .evi-es-button { transition: none; } }
`;
function menuItems(expression, children) {
  const isEmoji = expression.kind === "emoji";
  const items = [];
  if (isEmoji || canCopySticker(expression.formatType)) {
    const source = sourceGuildId(expression);
    const guilds = eligibleGuilds().filter((g) => g.id !== source);
    items.push(guilds.length ? /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
      id: "evi-es-add",
      label: t(isEmoji ? "menu.add.emoji" : "menu.add.sticker"),
      children: guilds.map((g) => {
        const slots = slotsLeft(g, expression);
        return /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
          id: `evi-es-add-${g.id}`,
          label: g.name,
          subtext: slots.left > 0 ? t(!isEmoji ? "menu.slots.sticker" : expression.animated ? "menu.slots.animated" : "menu.slots.static", { count: slots.left }) : t("menu.noSlots"),
          disabled: slots.left <= 0,
          action: () => openDialog(expression, g.id)
        }, g.id);
      })
    }, "evi-es-add") : /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
      id: "evi-es-add",
      label: t(isEmoji ? "menu.add.emoji" : "menu.add.sticker"),
      subtext: t("menu.noServers"),
      disabled: true
    }, "evi-es-add"));
  }
  const url = isEmoji ? emojiUrl(expression.id, expression.animated) : stickerUrl(expression.id, expression.formatType);
  if (!import_api2.findMenuGroup(children, "copy-image-link")) {
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
      id: "evi-es-copy-link",
      label: t(isEmoji ? "menu.copyLink.emoji" : "menu.copyLink.sticker"),
      action: () => copy(url, t("toast.linkCopied"))
    }, "evi-es-link"));
  }
  if (!import_api2.findMenuGroup(children, `devmode-copy-id-${expression.id}`)) {
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
      id: "evi-es-copy-id",
      label: t(isEmoji ? "menu.copyId.emoji" : "menu.copyId.sticker"),
      action: () => copy(expression.id, t("toast.idCopied"))
    }, "evi-es-id"));
  }
  return items;
}
function withKnownName(expression) {
  if (expression.name)
    return expression;
  if (expression.kind === "emoji") {
    const known2 = store("EmojiStore")?.getCustomEmojiById?.(expression.id);
    return known2 ? { ...expression, name: known2.name, animated: expression.animated || !!known2.animated } : expression;
  }
  const known = store("StickersStore")?.getStickerById?.(expression.id);
  return known ? { ...expression, name: known.name, formatType: expression.formatType ?? known.format_type } : expression;
}
var emoji_stealer_default = import_api2.definePlugin({
  start(ctx) {
    context = ctx;
    ctx.addStyle(css);
    ctx.onDispose(() => {
      closeOpen?.({ instant: true });
      context = undefined;
    });
    ctx.contextMenu(["message", "expression-picker"], (children, props) => {
      const found = expressionFromMenuProps(props);
      if (!found)
        return;
      const items = menuItems(withKnownName(found), children);
      if (items.length)
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Group, {
          children: items
        }, "evi-emoji-stealer"));
    });
  },
  stop() {
    closeOpen?.({ instant: true });
  }
});
