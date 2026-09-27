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
var import_api = require("@evi/api");

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

// plugins/emoji-stealer/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var context;
var store = (name) => {
  try {
    return import_api.getStore(name);
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
    return { left: expression.animated ? s2.animatedLeft : s2.staticLeft, limit: s2.limit, detail: `${s2.staticLeft} static, ${s2.animatedLeft} animated left` };
  }
  const s = stickerSlots(guild, guildStickers(guild.id));
  return { left: s.left, limit: s.limit, detail: `${s.left} of ${s.limit} sticker slots left` };
}
function sourceGuildId(expression) {
  if (expression.kind === "emoji")
    return store("EmojiStore")?.getCustomEmojiById?.(expression.id)?.guildId;
  return store("StickersStore")?.getStickerById?.(expression.id)?.guild_id;
}
var http = () => import_api.find(import_api.filters.byProps("get", "post", "put", "patch", "del"));
async function fetchBlob(url, maxBytes) {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Couldn't download it (HTTP ${res.status})`);
  const blob = await res.blob();
  if (blob.size > maxBytes)
    throw new Error(`It's ${Math.ceil(blob.size / 1024)} KB, over Discord's ${maxBytes / 1024} KB limit`);
  return blob;
}
var toDataUri = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader;
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the image"));
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
  const action = import_api.findByCode('"EMOJI_UPLOAD_START"', "GUILD_EMOJIS(");
  if (typeof action === "function")
    return action({ guildId, image, name, roles: [] });
  const client = http();
  if (!client)
    throw new Error("Couldn't find Discord's emoji upload");
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
    throw new Error("Lottie stickers can only be uploaded to partnered and verified servers");
  const blob = await fetchBlob(stickerUrl(sticker.id, formatType), STICKER_MAX_BYTES);
  const mime = stickerMime(formatType);
  const body = new FormData;
  body.append("name", name);
  body.append("tags", details.tags?.trim() || name);
  body.append("description", details.description ?? "");
  body.append("file", new File([blob], `${name}.${mime === "image/gif" ? "gif" : "png"}`, { type: mime }));
  const action = import_api.findByCode('"GUILD_STICKERS_CREATE_SUCCESS"', "GUILD_STICKER_PACKS(");
  if (typeof action === "function")
    return action({ guildId, body, platform: "web", originalMd5: null });
  const client = http();
  if (!client)
    throw new Error("Couldn't find Discord's sticker upload");
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
    context?.toast("Couldn't copy to the clipboard", { type: "failure" });
  }
}
var closeOpen;
function openDialog(expression, guildId) {
  closeOpen?.();
  const close = import_api.openLayer((close2) => /* @__PURE__ */ jsx_runtime.jsx(Dialog, {
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
  const noun = isEmoji ? "emoji" : "sticker";
  const guilds = import_api.React.useMemo(() => {
    const source = sourceGuildId(expression);
    return eligibleGuilds().filter((g) => g.id !== source).map((g) => ({ guild: g, slots: slotsLeft(g, expression) }));
  }, [expression]);
  const firstOpen = guilds.find((g) => g.slots.left > 0)?.guild.id;
  const [guildId, setGuildId] = import_api.React.useState(guilds.some((g) => g.guild.id === initialGuildId) ? initialGuildId : firstOpen ?? guilds[0]?.guild.id ?? "");
  const [name, setName] = import_api.React.useState(isEmoji ? sanitizeEmojiName(expression.name) : sanitizeStickerName(expression.name));
  const [busy, setBusy] = import_api.React.useState(false);
  const [error, setError] = import_api.React.useState();
  const ref = import_api.React.useRef(null);
  const selected = guilds.find((g) => g.guild.id === guildId);
  const nameOk = isEmoji ? isValidEmojiName(name) : isValidStickerName(name);
  const canSubmit = !busy && !!selected && selected.slots.left > 0 && nameOk;
  import_api.React.useEffect(() => {
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
      context?.toast(`Added ${isEmoji ? `:${finalName}:` : `"${finalName}"`} to ${selected.guild.name}`, { type: "success" });
      onClose();
    } catch (err) {
      context?.logger.error(`Uploading the ${noun} failed`, err);
      const message = describeError(err, `Couldn't add the ${noun}`);
      setError(message);
      context?.toast(`Couldn't add the ${noun}: ${message}`, { type: "failure" });
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
            /* @__PURE__ */ jsx_runtime.jsxs("h2", {
              id: "evi-es-title",
              children: [
                "Add ",
                isEmoji ? "Emoji" : "Sticker",
                " to Server"
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              type: "button",
              className: "evi-es-close",
              "aria-label": "Close",
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
                  children: "Animated"
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("label", {
              className: "evi-es-label",
              htmlFor: "evi-es-name",
              children: "Name"
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
              children: isEmoji ? "2 to 32 characters: letters, numbers and underscores." : "2 to 30 characters."
            }),
            /* @__PURE__ */ jsx_runtime.jsx("label", {
              className: "evi-es-label",
              htmlFor: "evi-es-guild",
              children: "Server"
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
                  slots.left <= 0 ? "full" : slots.detail,
                  ")"
                ]
              }, guild.id))
            }) : /* @__PURE__ */ jsx_runtime.jsxs("p", {
              className: "evi-es-hint",
              "data-error": true,
              children: [
                "You don't have permission to add ",
                noun,
                "s to any other server."
              ]
            }),
            selected && /* @__PURE__ */ jsx_runtime.jsxs("p", {
              className: "evi-es-hint",
              children: [
                selected.slots.detail,
                ". Limit ",
                selected.slots.limit,
                isEmoji ? " of each kind" : "",
                " at this server's boost level."
              ]
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
                  children: "Cancel"
                }),
                /* @__PURE__ */ jsx_runtime.jsx("button", {
                  type: "submit",
                  className: "evi-es-button",
                  disabled: !canSubmit,
                  children: busy ? "Uploading…" : `Add ${isEmoji ? "Emoji" : "Sticker"}`
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
    items.push(guilds.length ? /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id: "evi-es-add",
      label: isEmoji ? "Add to Server" : "Add Sticker to Server",
      children: guilds.map((g) => {
        const slots = slotsLeft(g, expression);
        return /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
          id: `evi-es-add-${g.id}`,
          label: g.name,
          subtext: slots.left > 0 ? `${slots.left} ${isEmoji ? expression.animated ? "animated " : "static " : ""}slot${slots.left === 1 ? "" : "s"} left` : "No slots left",
          disabled: slots.left <= 0,
          action: () => openDialog(expression, g.id)
        }, g.id);
      })
    }, "evi-es-add") : /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id: "evi-es-add",
      label: isEmoji ? "Add to Server" : "Add Sticker to Server",
      subtext: "No servers you can add to",
      disabled: true
    }, "evi-es-add"));
  }
  const url = isEmoji ? emojiUrl(expression.id, expression.animated) : stickerUrl(expression.id, expression.formatType);
  if (!import_api.findMenuGroup(children, "copy-image-link")) {
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id: "evi-es-copy-link",
      label: isEmoji ? "Copy Emoji Link" : "Copy Sticker Link",
      action: () => copy(url, "Link copied")
    }, "evi-es-link"));
  }
  if (!import_api.findMenuGroup(children, `devmode-copy-id-${expression.id}`)) {
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id: "evi-es-copy-id",
      label: isEmoji ? "Copy Emoji ID" : "Copy Sticker ID",
      action: () => copy(expression.id, "ID copied")
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
var emoji_stealer_default = import_api.definePlugin({
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
        children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
          children: items
        }, "evi-emoji-stealer"));
    });
  },
  stop() {
    closeOpen?.({ instant: true });
  }
});
