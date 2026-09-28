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

// plugins/link-safety/index.tsx
var exports_link_safety = {};
__export(exports_link_safety, {
  default: () => link_safety_default
});
module.exports = __toCommonJS(exports_link_safety);
var import_api2 = require("@evi/api");

// plugins/link-safety/analyze.ts
var RANK = { safe: 0, info: 0, caution: 1, danger: 2 };
function meetsThreshold(level, threshold) {
  return RANK[level] > 0 && RANK[level] >= RANK[threshold];
}
var MULTI_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "co.nz",
  "org.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "com.br",
  "net.br",
  "org.br",
  "com.mx",
  "com.tr",
  "com.cn",
  "net.cn",
  "com.hk",
  "com.tw",
  "co.in",
  "net.in",
  "org.in",
  "co.kr",
  "or.kr",
  "co.za",
  "com.ar",
  "com.pl",
  "com.ua",
  "com.ru",
  "com.sg",
  "com.my",
  "co.id",
  "com.ph",
  "com.vn",
  "co.il",
  "com.eg",
  "com.sa",
  "co.th",
  "com.co",
  "com.pe",
  "com.es",
  "co.at",
  "com.de"
]);
var HOSTING_SUFFIXES = new Set([
  "github.io",
  "gitlab.io",
  "pages.dev",
  "workers.dev",
  "vercel.app",
  "netlify.app",
  "herokuapp.com",
  "web.app",
  "firebaseapp.com",
  "glitch.me",
  "repl.co",
  "replit.app",
  "replit.dev",
  "blogspot.com",
  "weebly.com",
  "wixsite.com",
  "000webhostapp.com",
  "ngrok.io",
  "ngrok-free.app",
  "ngrok.app",
  "trycloudflare.com",
  "onrender.com",
  "fly.dev",
  "surge.sh",
  "webflow.io",
  "carrd.co",
  "square.site",
  "godaddysites.com",
  "azurewebsites.net",
  "js.org",
  "framer.website",
  "framer.app"
]);
var SHORTENERS = new Set([
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "v.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "rb.gy",
  "tiny.cc",
  "t.ly",
  "s.id",
  "bit.do",
  "lnkd.in",
  "adf.ly",
  "shorte.st",
  "ouo.io",
  "bl.ink",
  "qrco.de",
  "tiny.one",
  "shrtco.de",
  "clck.ru",
  "u.to",
  "linktr.ee",
  "href.li",
  "urlz.fr",
  "soo.gd",
  "short.io",
  "surl.li",
  "gg.gg",
  "rotf.lol",
  "y2u.be"
]);
function normalizeDomain(value) {
  let d = value.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\*\./, "").replace(/^\.+/, "");
  d = d.split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.+$/, "");
  return d;
}
function parseAllowlist(value) {
  if (typeof value !== "string")
    return [];
  return value.split(/[\s,;]+/).map(normalizeDomain).filter((d) => d.includes("."));
}
var isIPv4 = (host) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
var isIP = (host) => isIPv4(host) || host.startsWith("[") || host.includes(":");
function registrableDomain(host) {
  host = host.toLowerCase().replace(/\.$/, "");
  if (isIP(host))
    return host;
  const labels = host.split(".");
  if (labels.length <= 2)
    return host;
  const last2 = labels.slice(-2).join(".");
  const last3 = labels.slice(-3).join(".");
  if (HOSTING_SUFFIXES.has(last2) || MULTI_SUFFIXES.has(last2))
    return labels.length >= 3 ? last3 : host;
  if (HOSTING_SUFFIXES.has(last3))
    return labels.length >= 4 ? labels.slice(-4).join(".") : host;
  return last2;
}
function suffixOf(domain) {
  const labels = domain.split(".");
  const last2 = labels.slice(-2).join(".");
  if (labels.length >= 3 && (HOSTING_SUFFIXES.has(last2) || MULTI_SUFFIXES.has(last2)))
    return last2;
  const last3 = labels.slice(-3).join(".");
  if (labels.length >= 4 && HOSTING_SUFFIXES.has(last3))
    return last3;
  return labels[labels.length - 1];
}
var withinDomain = (host, domain) => host === domain || host.endsWith("." + domain);
var BRANDS = [
  {
    name: "Discord",
    keys: ["discord", "discordapp"],
    domains: [
      "discord.com",
      "discord.gg",
      "discord.gift",
      "discordapp.com",
      "discordapp.net",
      "discord.media",
      "discord.new",
      "discord.dev",
      "discord.co",
      "discordstatus.com",
      "discord.design",
      "discord.store",
      "discordmerch.com",
      "dis.gd",
      "discord.tools",
      "discordcdn.com",
      "discord.gifts"
    ]
  },
  {
    name: "Steam",
    keys: ["steamcommunity", "steampowered"],
    domains: [
      "steamcommunity.com",
      "steampowered.com",
      "steamstatic.com",
      "steamgames.com",
      "steamusercontent.com",
      "steamserver.net",
      "steamchina.com",
      "steamdeck.com",
      "s.team",
      "valvesoftware.com",
      "steamcontent.com",
      "steam-chat.com",
      "steam.tv"
    ]
  },
  { name: "PayPal", keys: ["paypal"], domains: ["paypal.com", "paypal.me", "paypalobjects.com"], countryTlds: true },
  {
    name: "Google",
    keys: ["google", "gmail"],
    domains: ["google.com", "gmail.com", "googleapis.com", "gstatic.com", "googleusercontent.com", "googlevideo.com", "goo.gl", "g.co", "withgoogle.com", "google.dev"],
    countryTlds: true
  },
  { name: "YouTube", keys: ["youtube"], domains: ["youtube.com", "youtu.be", "ytimg.com", "youtube-nocookie.com", "youtubekids.com", "youtube.be"], countryTlds: true },
  { name: "GitHub", keys: ["github"], domains: ["github.com", "githubusercontent.com", "githubassets.com", "github.dev", "githubstatus.com", "github.blog", "ghcr.io"] },
  { name: "Roblox", keys: ["roblox"], domains: ["roblox.com", "rbxcdn.com", "roblox.qq.com", "rbx.com", "robloxlabs.com", "roblox.cn"] },
  { name: "Epic Games", keys: ["epicgames"], domains: ["epicgames.com", "epicgames.dev", "unrealengine.com", "fortnite.com", "epicgamescdn.com"] },
  { name: "Twitch", keys: ["twitch"], domains: ["twitch.tv", "twitchcdn.net", "twitchsvc.net", "jtvnw.net", "twitch.com"] },
  { name: "X (Twitter)", keys: ["twitter"], domains: ["x.com", "twitter.com", "t.co", "twimg.com", "fxtwitter.com", "vxtwitter.com", "fixupx.com", "fixvx.com"] },
  { name: "Instagram", keys: ["instagram"], domains: ["instagram.com", "cdninstagram.com", "ig.me", "instagr.am", "ddinstagram.com"] },
  { name: "Facebook", keys: ["facebook"], domains: ["facebook.com", "fb.com", "fbcdn.net", "fb.me", "messenger.com", "facebook.net", "meta.com"] },
  {
    name: "Microsoft",
    keys: ["microsoft", "outlook", "xbox"],
    domains: ["microsoft.com", "microsoftonline.com", "live.com", "outlook.com", "office.com", "xbox.com", "azure.com", "msn.com", "bing.com", "windows.com", "office365.com", "sharepoint.com", "onedrive.com", "microsoft365.com", "xboxlive.com", "skype.com"],
    countryTlds: true
  },
  { name: "Apple", keys: ["apple", "icloud"], domains: ["apple.com", "icloud.com", "apple.news", "mzstatic.com", "me.com"] },
  { name: "Amazon", keys: ["amazon"], domains: ["amazon.com", "amazonaws.com", "amzn.to", "amzn.eu", "media-amazon.com", "ssl-images-amazon.com", "amazon.dev"], countryTlds: true },
  { name: "Netflix", keys: ["netflix"], domains: ["netflix.com", "nflxext.com", "nflximg.net", "nflxvideo.net"] },
  { name: "Spotify", keys: ["spotify"], domains: ["spotify.com", "spotify.link", "scdn.co", "spotifycdn.com", "spoti.fi"] },
  { name: "Reddit", keys: ["reddit"], domains: ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com", "reddithelp.com", "redditinc.com"] },
  { name: "TikTok", keys: ["tiktok"], domains: ["tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-us.com"] },
  { name: "Minecraft", keys: ["minecraft", "mojang"], domains: ["minecraft.net", "mojang.com", "minecraft.com", "minecraftservices.com"] },
  { name: "Riot Games", keys: ["riotgames", "leagueoflegends"], domains: ["riotgames.com", "leagueoflegends.com", "playvalorant.com", "riotcdn.net"] },
  { name: "Coinbase", keys: ["coinbase"], domains: ["coinbase.com", "cb.com"] },
  { name: "MetaMask", keys: ["metamask"], domains: ["metamask.io"] }
];
var KNOWN_SAFE = new Set([
  "steamdb.info",
  "discord.me",
  "discords.com",
  "discordbotlist.com",
  "discordservers.com",
  "discordjs.dev",
  "discordpy.readthedocs.io",
  "discordlookup.com",
  "twitchtracker.com",
  "twitchmetrics.net",
  "googleblog.com",
  "githubassets.com",
  "robloxden.com",
  "facebookmail.com",
  "spotifycharts.com",
  "discord.js.org",
  "discohook.org",
  "discordtemplates.me",
  "betterdiscord.app",
  "discordapp.page"
]);
var BRAND_DOMAINS = new Map;
for (const brand of BRANDS)
  for (const d of brand.domains)
    BRAND_DOMAINS.set(d, brand);
function officialBrand(domain) {
  const direct = BRAND_DOMAINS.get(domain);
  if (direct)
    return direct;
  for (const brand of BRANDS) {
    if (!brand.countryTlds)
      continue;
    const [name, ...rest] = domain.split(".");
    if (!brand.keys.includes(name))
      continue;
    const suffix = rest.join(".");
    if (/^[a-z]{2}$/.test(suffix) || /^(?:co|com)\.[a-z]{2}$/.test(suffix))
      return brand;
  }
  return;
}
var CONFUSABLES = {
  "а": "a",
  "в": "b",
  "е": "e",
  "ё": "e",
  "һ": "h",
  "і": "i",
  "ї": "i",
  "ј": "j",
  "к": "k",
  "ӏ": "l",
  "м": "m",
  "н": "h",
  "о": "o",
  "р": "p",
  "с": "c",
  "ѕ": "s",
  "т": "t",
  "у": "y",
  "х": "x",
  "ԁ": "d",
  "ԛ": "q",
  "ԝ": "w",
  "ү": "y",
  "ɡ": "g",
  "ց": "g",
  "ո": "n",
  "ս": "u",
  "օ": "o",
  "զ": "q",
  "հ": "h",
  "ᴠ": "v",
  "ʏ": "y",
  "ɩ": "i",
  "ı": "i",
  "ȷ": "j",
  "α": "a",
  "β": "b",
  "ε": "e",
  "η": "n",
  "ι": "i",
  "κ": "k",
  "ν": "v",
  "ο": "o",
  "ρ": "p",
  "τ": "t",
  "υ": "u",
  "χ": "x",
  "ω": "w",
  "γ": "y",
  "μ": "u",
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  $: "s",
  "@": "a",
  "|": "l",
  "!": "l"
};
function skeleton(value) {
  let s = value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = [...s].map((c) => CONFUSABLES[c] ?? c).join("");
  return s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d").replace(/i/g, "l").replace(/-/g, "");
}
function editDistance(a, b) {
  const rows = a.length + 1, cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1;i < rows; i++) {
    for (let j = 1;j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[rows - 1][cols - 1];
}
function punycodeDecode(input) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const output = [];
  let n = 128, i = 0, bias = 72;
  const basic = input.lastIndexOf("-");
  for (let j = 0;j < Math.max(basic, 0); j++) {
    if (input.charCodeAt(j) >= 128)
      return null;
    output.push(input.charCodeAt(j));
  }
  const digit = (c) => c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
  const adapt = (delta, points, first) => {
    let k = 0;
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / points);
    for (;delta > (base - tMin) * tMax >> 1; k += base)
      delta = Math.floor(delta / (base - tMin));
    return Math.floor(k + (base - tMin + 1) * delta / (delta + skew));
  };
  for (let pos = basic > 0 ? basic + 1 : 0;pos < input.length; ) {
    const oldI = i;
    for (let w = 1, k = base;; k += base) {
      if (pos >= input.length)
        return null;
      const dg = digit(input.charCodeAt(pos++));
      if (dg >= base)
        return null;
      i += dg * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (dg < t)
        break;
      w *= base - t;
      if (w > 1e9)
        return null;
    }
    bias = adapt(i - oldI, output.length + 1, oldI === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 1114111)
      return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}
function decodeHostname(host) {
  return host.split(".").map((label) => {
    if (!label.toLowerCase().startsWith("xn--"))
      return label;
    return punycodeDecode(label.slice(4).toLowerCase()) ?? label;
  }).join(".");
}
function scriptOf(char) {
  const c = char.codePointAt(0);
  if (c >= 48 && c <= 57 || c === 45 || c === 95)
    return null;
  if (c >= 97 && c <= 122 || c >= 65 && c <= 90 || c >= 192 && c <= 591 || c >= 7680 && c <= 7935)
    return "latin";
  if (c >= 1024 && c <= 1327)
    return "cyrillic";
  if (c >= 880 && c <= 1023)
    return "greek";
  if (c >= 1328 && c <= 1423)
    return "armenian";
  return "other";
}
function mixedScriptLabels(host) {
  const confusable = new Set(["cyrillic", "greek", "armenian"]);
  return host.split(".").filter((label) => {
    const scripts = new Set([...label].map(scriptOf).filter((s) => s != null && s !== "other"));
    const odd = [...scripts].filter((s) => confusable.has(s));
    return odd.length > 1 || odd.length === 1 && scripts.has("latin");
  });
}
var DOMAIN_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^\s/@:]+(?::[^\s/@]*)?@)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]\S*)?$/iu;
var DOMAIN_IN_TEXT = /(?:^|[\s(<"'])((?:https?:\/\/)?(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:com|net|org|gg|gift|io|co|app|dev|tv|me|xyz|ru|gl|ly|be|info|link|site|shop|store|online|top|click|live|pro|uk|de|fr|us)(?:[/?#][^\s)>"']*)?)(?=$|[\s)>"'.,!?:;])/iu;
function hostnameInText(text) {
  const trimmed = text.trim().replace(/^<(.*)>$/, "$1").replace(/[.,!?:;]+$/, "");
  if (!trimmed || trimmed.length > 2048)
    return null;
  const parse = (value) => {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
      return url.hostname.toLowerCase().replace(/\.$/, "") || null;
    } catch {
      return null;
    }
  };
  if (DOMAIN_LIKE.test(trimmed)) {
    const host = parse(trimmed);
    if (host)
      return { host, whole: true };
  }
  const inner = DOMAIN_IN_TEXT.exec(trimmed);
  if (inner) {
    const host = parse(inner[1]);
    if (host)
      return { host, whole: false };
  }
  return null;
}
var SCAM_WORDS = [
  "gift",
  "nitro",
  "free",
  "promo",
  "claim",
  "drop",
  "airdrop",
  "login",
  "verify",
  "verification",
  "auth",
  "oauth",
  "trade",
  "giveaway",
  "bonus",
  "reward",
  "secure",
  "account",
  "support",
  "qr",
  "wallet",
  "skins",
  "case",
  "offer",
  "event",
  "prize",
  "appeal",
  "staff"
];
var SCAM_PATTERNS = [
  { id: "free-nitro", re: /free[-_.\s]*(?:discord[-_.\s]*)?nitro/, what: "free Nitro" },
  { id: "nitro-giveaway", re: /nitro[-_.\s]*(?:gift|free|drop|claim|generator|gen)s?\b/, what: "a Nitro giveaway" },
  { id: "discord-gift", re: /discord[-_.]?(?:gift|nitro|airdrop|promo|drop|claim)s?/, what: "a Discord gift" },
  { id: "steam", re: /steam[-_.]?(?:gift|giveaway|trade[-_.]?offer|free|drop|claim|skins?)s?/, what: "a Steam gift or trade" },
  { id: "currency", re: /(?:free|claim)[-_.\s]*(?:robux|vbucks|v-bucks|skins?|cs2?[-_.]?skins?)/, what: "free in-game currency or skins" },
  { id: "crypto", re: /(?:airdrop|claim)[-_.\s]*(?:crypto|token|nft|eth|btc|usdt)/, what: "a crypto airdrop" }
];
var DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "scr",
  "bat",
  "cmd",
  "msi",
  "msp",
  "apk",
  "xapk",
  "apkm",
  "jar",
  "vbs",
  "vbe",
  "ps1",
  "psm1",
  "pif",
  "hta",
  "lnk",
  "reg",
  "dll",
  "cpl",
  "wsf",
  "wsh",
  "jse",
  "msix",
  "msixbundle",
  "appx",
  "appxbundle",
  "dmg",
  "pkg",
  "iso",
  "img",
  "vhd",
  "vhdx",
  "com",
  "gadget",
  "application",
  "run",
  "sh",
  "deb",
  "rpm",
  "ipa",
  "inf",
  "sys",
  "chm",
  "scf",
  "url",
  "xll",
  "docm",
  "xlsm",
  "pptm"
]);
var FILE_LIKE_TLDS = new Set(["zip", "mov"]);
function brandLookalike(domain, displayDomain) {
  if (officialBrand(domain) || KNOWN_SAFE.has(domain))
    return null;
  const suffix = suffixOf(displayDomain);
  const name = displayDomain.slice(0, -(suffix.length + 1)).toLowerCase();
  if (!name)
    return null;
  const flat = name.replace(/-/g, "");
  const tokens = name.split(/[-.]/).filter((t) => t.length >= 3);
  const hasScamWord = SCAM_WORDS.some((w) => name.includes(w));
  const nameSkeleton = skeleton(name);
  for (const brand of BRANDS) {
    const official = brand.domains[0];
    for (const key of brand.keys) {
      if (name === key) {
        return { level: "danger", code: "brand-tld", vars: { brand: brand.name, domain: displayDomain, official }, message: `Uses ${brand.name}'s name on a domain ${brand.name} doesn't own: this is ${displayDomain}, not ${official}.` };
      }
      if (nameSkeleton === skeleton(key)) {
        return { level: "danger", code: "lookalike", key: "lookalike-swap", vars: { brand: brand.name, domain: displayDomain, official }, message: `${displayDomain} is made to look like ${official} by swapping lookalike characters. It isn't run by ${brand.name}.` };
      }
    }
  }
  for (const brand of BRANDS) {
    const official = brand.domains[0];
    for (const key of brand.keys) {
      if (key.length < 5)
        continue;
      const keySkeleton = skeleton(key);
      if (flat.includes(key) || tokens.includes(key)) {
        return hasScamWord ? { level: "danger", code: "brand-scam", vars: { brand: brand.name, domain: displayDomain }, message: `Puts ${brand.name}'s name next to words like "gift", "free" or "login" on a site ${brand.name} doesn't run (${displayDomain}). That's how most phishing links look.` } : { level: "caution", code: "brand-mention", vars: { brand: brand.name, domain: displayDomain }, message: `Has ${brand.name}'s name in it but isn't one of ${brand.name}'s sites: ${displayDomain} is run by someone else.` };
      }
      if (nameSkeleton.includes(keySkeleton)) {
        return { level: "danger", code: "lookalike", vars: { brand: brand.name, domain: displayDomain }, message: `${displayDomain} imitates ${brand.name}'s name with lookalike characters. It isn't run by ${brand.name}.` };
      }
      if (key.length < 6)
        continue;
      const max = key.length >= 10 ? 2 : 1;
      const candidates = new Set([nameSkeleton, ...tokens.map(skeleton)]);
      for (const candidate of candidates) {
        if (Math.abs(candidate.length - keySkeleton.length) > max)
          continue;
        if (editDistance(candidate, keySkeleton) <= max) {
          return {
            level: hasScamWord || key.length >= 10 ? "danger" : "caution",
            code: "typosquat",
            vars: { domain: displayDomain, official },
            message: `${displayDomain} is one or two letters off from ${official}. Typo domains like this are often used to steal accounts.`
          };
        }
      }
    }
  }
  return null;
}
function analyzeLink(href, options = {}) {
  const findings = [];
  const add = (level, code, message, vars, key) => void findings.push({ level, code, message, ...key && { key }, ...vars && { vars } });
  const result = (url2, hostname, extra = {}) => {
    const level = findings.reduce((max, f) => RANK[f.level] > RANK[max] ? f.level : max, "safe");
    return { level, url: url2, hostname, displayHostname: decodeHostname(hostname), domain: registrableDomain(hostname), findings, ...extra };
  };
  const raw = (href ?? "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    add("caution", "unreadable", "This link couldn't be read as a normal web address.");
    return result(raw, "");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return result(url.href, url.hostname);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const displayHost = decodeHostname(host);
  const domain = registrableDomain(host);
  const displayDomain = registrableDomain(displayHost);
  const subLength = host.length - domain.length;
  const parts = {
    prefix: `${url.protocol}//${url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ""}@` : ""}`,
    subdomain: displayHost.slice(0, displayHost.length - displayDomain.length) || (subLength > 0 ? host.slice(0, subLength) : ""),
    domain: displayDomain,
    rest: `${url.port ? `:${url.port}` : ""}${url.pathname === "/" && !url.search && !url.hash && !raw.endsWith("/") ? "" : url.pathname}${url.search}${url.hash}`
  };
  const done = () => result(url.href, host, { parts, displayHostname: displayHost });
  const allowlist = (options.allowlist ?? []).map(normalizeDomain).filter(Boolean);
  if (allowlist.some((d) => withinDomain(host, d))) {
    add("info", "allowlisted", `${displayDomain} is on your allowlist.`, { domain: displayDomain });
    return done();
  }
  const brand = officialBrand(domain);
  const official = brand != null;
  if (options.text) {
    const shown = hostnameInText(options.text);
    if (shown && shown.host !== host) {
      const shownDomain = registrableDomain(shown.host);
      const shownBrand = officialBrand(shownDomain);
      const sameOwner = shownDomain === domain || shownBrand != null && shownBrand === brand;
      if (!sameOwner) {
        const shownDisplay = decodeHostname(shown.host);
        const message = `The link says ${shownDisplay} but actually goes to ${displayHost}.`;
        if (shown.whole)
          add(official ? "caution" : "danger", "masked-mismatch", message, { shown: shownDisplay, host: displayHost });
        else
          add("caution", "masked-mention", `The link text mentions ${shownDisplay}, but the link goes to ${displayHost}.`, { shown: shownDisplay, host: displayHost });
      }
    }
  }
  if (url.username || url.password) {
    const fake = decodeURIComponent(url.username);
    const looksLikeHost = /\./.test(fake) || /\./.test(url.password);
    add(looksLikeHost || !official ? "danger" : "caution", "userinfo", looksLikeHost ? `Everything before the "@" is ignored: this link starts with "${fake}" but goes to ${displayHost}.` : `The link has a hidden "name@" part before the address. It goes to ${displayHost}.`, { fake, host: displayHost }, looksLikeHost ? "userinfo-host" : "userinfo-hidden");
  }
  if (isIP(host)) {
    add("caution", "ip-address", `Goes to a bare IP address (${host}) instead of a named website. Real services almost never link like this.`, { host });
  } else {
    const mixed = mixedScriptLabels(displayHost);
    if (mixed.length) {
      add("danger", "mixed-script", `The address mixes alphabets (like Latin with Cyrillic or Greek) in "${mixed.join(".")}", a trick to make a fake domain look real.`, { labels: mixed.join(".") });
    } else if (host.split(".").some((l) => l.startsWith("xn--"))) {
      add("caution", "punycode", `The address uses international characters (${displayHost}, written ${host}). Some of these are lookalikes of normal letters.`, { display: displayHost, host });
    }
    for (const b of BRANDS) {
      if (official)
        break;
      const hit = b.domains.find((d) => host.startsWith(d + ".") && d !== domain);
      if (hit) {
        add("danger", "subdomain-trick", `Starts with ${hit} but the site is really ${displayDomain}. Everything to the left of it is just a label its owner picked.`, { hit, domain: displayDomain });
        break;
      }
    }
    const lookalike = brandLookalike(domain, displayDomain);
    if (lookalike)
      findings.push(lookalike);
    const tld = host.slice(host.lastIndexOf(".") + 1);
    if (FILE_LIKE_TLDS.has(tld))
      add("caution", "file-tld", `The address ends in .${tld}, which looks like a file name but is a website.`, { tld });
    if (SHORTENERS.has(domain) || SHORTENERS.has(host)) {
      add("info", "shortener", `${displayDomain} is a link shortener: where it really leads is hidden until you open it.`, { domain: displayDomain });
    }
    if (HOSTING_SUFFIXES.has(suffixOf(domain)) && !official) {
      add("info", "free-hosting", `Hosted on ${suffixOf(domain)}, where anyone can make a site for free.`, { suffix: suffixOf(domain) });
    }
  }
  if (!official) {
    let decodedPath = url.pathname + url.search;
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {}
    const haystacks = [displayHost, decodedPath, options.text ?? ""].map((s) => s.toLowerCase());
    const scam = SCAM_PATTERNS.find((p) => haystacks.some((h) => p.re.test(h)));
    if (scam) {
      const inHost = scam.re.test(displayHost.toLowerCase());
      add(inHost ? "danger" : "caution", "scam-words", `Mentions ${scam.what}, the most common bait in Discord scams.`, { what: scam.what }, `scam-words-${scam.id}`);
    }
  }
  let file = url.pathname.split("/").pop() ?? "";
  try {
    file = decodeURIComponent(file);
  } catch {}
  const pieces = file.toLowerCase().split(".");
  if (pieces.length >= 2) {
    const ext = pieces[pieces.length - 1];
    const isDomainRoot = url.pathname === "/" || url.pathname === "";
    if (DANGEROUS_EXTENSIONS.has(ext) && !isDomainRoot) {
      const doubled = pieces.length >= 3 && /^(?:png|jpe?g|gif|webp|mp4|mp3|pdf|txt|docx?|xlsx?|zip|rar)$/.test(pieces[pieces.length - 2]);
      add(doubled ? "danger" : "caution", "dangerous-file", doubled ? `Downloads "${file}", a program disguised as a .${pieces[pieces.length - 2]} file.` : `Downloads a .${ext} file ("${file}"), which can run code on your computer. Only open it if you trust the sender.`, doubled ? { file, fake: pieces[pieces.length - 2] } : { file, ext }, doubled ? "dangerous-file-disguised" : "dangerous-file");
    }
  }
  if (url.protocol === "http:" && findings.every((f) => f.level === "info")) {
    add("info", "http", "The connection to this site isn't encrypted (http).");
  }
  return done();
}
var PATCH = {
  find: "isProtocol:!0,contextKey:",
  replace: {
    match: /(?<=function (\i)\(\)\{\(\i&&\i\.\i\.trackAnnouncementMessageLinkClicked\([^}]*\}\),null!=\i\)\?\i\(\):\(0,\i\.\i\)\(\i\)\})(?=if\(null!==\i\.isBlockedDomain\((\i)\)\)\{(\i)\?\.preventDefault\(\),\i\.show\(\i\),(\i)\(\);return\})/,
    with: "if($self?.intercept?.($2,$3,$1,$4,arguments[0]))return;"
  }
};

// plugins/link-safety/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "title.danger": "This link looks dangerous",
    "title.caution": "This link might not be safe",
    "subtitle.danger": "It has signs of a scam or phishing link.",
    "subtitle.caution": "Something about it is unusual. Check where it goes before you open it.",
    "label.destination": "Where it really goes",
    "hint.written": "Written as {host}",
    "button.open": "Open anyway",
    "button.back": "Go back",
    "settings.threshold": "Warn me about",
    "settings.threshold.description": "Which links get a warning before they open.",
    "settings.threshold.caution": "Suspicious and dangerous links",
    "settings.threshold.danger": "Only dangerous links",
    "settings.allowlist": "Trusted domains",
    "settings.allowlist.description": "Links to these domains and their subdomains never get a warning. Separate them with commas or new lines.",
    "settings.allowlist.placeholder": "example.com, mysite.dev",
    "finding.unreadable": "This link couldn't be read as a normal web address.",
    "finding.allowlisted": "{domain} is on your allowlist.",
    "finding.masked-mismatch": "The link says {shown} but actually goes to {host}.",
    "finding.masked-mention": "The link text mentions {shown}, but the link goes to {host}.",
    "finding.userinfo-host": 'Everything before the "@" is ignored: this link starts with "{fake}" but goes to {host}.',
    "finding.userinfo-hidden": 'The link has a hidden "name@" part before the address. It goes to {host}.',
    "finding.ip-address": "Goes to a bare IP address ({host}) instead of a named website. Real services almost never link like this.",
    "finding.mixed-script": 'The address mixes alphabets (like Latin with Cyrillic or Greek) in "{labels}", a trick to make a fake domain look real.',
    "finding.punycode": "The address uses international characters ({display}, written {host}). Some of these are lookalikes of normal letters.",
    "finding.subdomain-trick": "Starts with {hit} but the site is really {domain}. Everything to the left of it is just a label its owner picked.",
    "finding.brand-tld": "Uses {brand}'s name on a domain {brand} doesn't own: this is {domain}, not {official}.",
    "finding.lookalike-swap": "{domain} is made to look like {official} by swapping lookalike characters. It isn't run by {brand}.",
    "finding.lookalike": "{domain} imitates {brand}'s name with lookalike characters. It isn't run by {brand}.",
    "finding.brand-scam": `Puts {brand}'s name next to words like "gift", "free" or "login" on a site {brand} doesn't run ({domain}). That's how most phishing links look.`,
    "finding.brand-mention": "Has {brand}'s name in it but isn't one of {brand}'s sites: {domain} is run by someone else.",
    "finding.typosquat": "{domain} is one or two letters off from {official}. Typo domains like this are often used to steal accounts.",
    "finding.file-tld": "The address ends in .{tld}, which looks like a file name but is a website.",
    "finding.shortener": "{domain} is a link shortener: where it really leads is hidden until you open it.",
    "finding.free-hosting": "Hosted on {suffix}, where anyone can make a site for free.",
    "finding.scam-words-free-nitro": "Mentions free Nitro, the most common bait in Discord scams.",
    "finding.scam-words-nitro-giveaway": "Mentions a Nitro giveaway, the most common bait in Discord scams.",
    "finding.scam-words-discord-gift": "Mentions a Discord gift, the most common bait in Discord scams.",
    "finding.scam-words-steam": "Mentions a Steam gift or trade, the most common bait in Discord scams.",
    "finding.scam-words-currency": "Mentions free in-game currency or skins, the most common bait in Discord scams.",
    "finding.scam-words-crypto": "Mentions a crypto airdrop, the most common bait in Discord scams.",
    "finding.dangerous-file-disguised": 'Downloads "{file}", a program disguised as a .{fake} file.',
    "finding.dangerous-file": 'Downloads a .{ext} file ("{file}"), which can run code on your computer. Only open it if you trust the sender.',
    "finding.http": "The connection to this site isn't encrypted (http)."
  },
  de: {
    "title.danger": "Dieser Link sieht gefährlich aus",
    "title.caution": "Dieser Link ist möglicherweise nicht sicher",
    "subtitle.danger": "Er weist Anzeichen eines Betrugs- oder Phishing-Links auf.",
    "subtitle.caution": "Etwas daran ist ungewöhnlich. Prüfe, wohin er führt, bevor du ihn öffnest.",
    "label.destination": "Wohin er wirklich führt",
    "hint.written": "Geschrieben als {host}",
    "button.open": "Trotzdem öffnen",
    "button.back": "Zurück",
    "settings.threshold": "Warnen bei",
    "settings.threshold.description": "Bei welchen Links vor dem Öffnen gewarnt wird.",
    "settings.threshold.caution": "Verdächtigen und gefährlichen Links",
    "settings.threshold.danger": "Nur gefährlichen Links",
    "settings.allowlist": "Vertrauenswürdige Domains",
    "settings.allowlist.description": "Bei Links zu diesen Domains und ihren Subdomains wird nie gewarnt. Trenne sie mit Kommas oder Zeilenumbrüchen.",
    "settings.allowlist.placeholder": "example.com, meineseite.de",
    "finding.unreadable": "Dieser Link konnte nicht als normale Webadresse gelesen werden.",
    "finding.allowlisted": "{domain} steht auf deiner Liste vertrauenswürdiger Domains.",
    "finding.masked-mismatch": "Der Link gibt {shown} an, führt aber in Wirklichkeit zu {host}.",
    "finding.masked-mention": "Der Linktext erwähnt {shown}, der Link führt aber zu {host}.",
    "finding.userinfo-host": "Alles vor dem „@“ wird ignoriert: Dieser Link beginnt mit „{fake}“, führt aber zu {host}.",
    "finding.userinfo-hidden": "Der Link hat vor der Adresse einen versteckten „Name@“-Teil. Er führt zu {host}.",
    "finding.ip-address": "Führt zu einer nackten IP-Adresse ({host}) statt zu einer Website mit Namen. Echte Dienste verlinken fast nie so.",
    "finding.mixed-script": "Die Adresse mischt Alphabete (etwa lateinisch mit kyrillisch oder griechisch) in „{labels}“, ein Trick, um eine gefälschte Domain echt aussehen zu lassen.",
    "finding.punycode": "Die Adresse enthält internationale Zeichen ({display}, geschrieben {host}). Manche davon sehen normalen Buchstaben zum Verwechseln ähnlich.",
    "finding.subdomain-trick": "Beginnt mit {hit}, die Seite ist aber in Wirklichkeit {domain}. Alles links davon ist nur eine Bezeichnung, die sich der Betreiber ausgesucht hat.",
    "finding.brand-tld": "Verwendet den Namen {brand} auf einer Domain, die {brand} nicht gehört: Das ist {domain}, nicht {official}.",
    "finding.lookalike-swap": "{domain} soll durch ähnlich aussehende Zeichen wie {official} wirken. Sie wird nicht von {brand} betrieben.",
    "finding.lookalike": "{domain} ahmt den Namen {brand} mit ähnlich aussehenden Zeichen nach. Sie wird nicht von {brand} betrieben.",
    "finding.brand-scam": "Setzt den Namen {brand} neben Wörter wie „gift“, „free“ oder „login“ auf einer Seite, die nicht von {brand} betrieben wird ({domain}). So sehen die meisten Phishing-Links aus.",
    "finding.brand-mention": "Enthält den Namen {brand}, ist aber keine Seite von {brand}: {domain} gehört jemand anderem.",
    "finding.typosquat": "{domain} unterscheidet sich nur um ein oder zwei Buchstaben von {official}. Solche Tippfehler-Domains werden oft benutzt, um Konten zu stehlen.",
    "finding.file-tld": "Die Adresse endet auf .{tld}, was wie ein Dateiname aussieht, aber eine Website ist.",
    "finding.shortener": "{domain} ist ein Link-Verkürzer: Wohin der Link wirklich führt, siehst du erst nach dem Öffnen.",
    "finding.free-hosting": "Gehostet auf {suffix}, wo jeder kostenlos eine Website erstellen kann.",
    "finding.scam-words-free-nitro": "Erwähnt kostenloses Nitro, den häufigsten Köder bei Discord-Betrug.",
    "finding.scam-words-nitro-giveaway": "Erwähnt ein Nitro-Gewinnspiel, den häufigsten Köder bei Discord-Betrug.",
    "finding.scam-words-discord-gift": "Erwähnt ein Discord-Geschenk, den häufigsten Köder bei Discord-Betrug.",
    "finding.scam-words-steam": "Erwähnt ein Steam-Geschenk oder einen Steam-Handel, den häufigsten Köder bei Discord-Betrug.",
    "finding.scam-words-currency": "Erwähnt kostenlose Spielwährung oder Skins, den häufigsten Köder bei Discord-Betrug.",
    "finding.scam-words-crypto": "Erwähnt einen Krypto-Airdrop, den häufigsten Köder bei Discord-Betrug.",
    "finding.dangerous-file-disguised": "Lädt „{file}“ herunter, ein Programm, das als .{fake}-Datei getarnt ist.",
    "finding.dangerous-file": "Lädt eine .{ext}-Datei („{file}“) herunter, die Code auf deinem Computer ausführen kann. Öffne sie nur, wenn du dem Absender vertraust.",
    "finding.http": "Die Verbindung zu dieser Seite ist nicht verschlüsselt (http)."
  },
  es: {
    "title.danger": "Este enlace parece peligroso",
    "title.caution": "Este enlace podría no ser seguro",
    "subtitle.danger": "Tiene señales de ser un enlace de estafa o phishing.",
    "subtitle.caution": "Hay algo raro en él. Comprueba adónde lleva antes de abrirlo.",
    "label.destination": "Adónde lleva realmente",
    "hint.written": "Escrito como {host}",
    "button.open": "Abrir de todos modos",
    "button.back": "Volver",
    "settings.threshold": "Avisarme de",
    "settings.threshold.description": "Qué enlaces muestran una advertencia antes de abrirse.",
    "settings.threshold.caution": "Enlaces sospechosos y peligrosos",
    "settings.threshold.danger": "Solo enlaces peligrosos",
    "settings.allowlist": "Dominios de confianza",
    "settings.allowlist.description": "Los enlaces a estos dominios y sus subdominios nunca muestran advertencia. Sepáralos con comas o saltos de línea.",
    "settings.allowlist.placeholder": "example.com, misitio.es",
    "finding.unreadable": "Este enlace no se pudo leer como una dirección web normal.",
    "finding.allowlisted": "{domain} está en tu lista de dominios de confianza.",
    "finding.masked-mismatch": "El enlace dice {shown}, pero en realidad lleva a {host}.",
    "finding.masked-mention": "El texto del enlace menciona {shown}, pero el enlace lleva a {host}.",
    "finding.userinfo-host": "Todo lo que va antes de la «@» se ignora: este enlace empieza por «{fake}», pero lleva a {host}.",
    "finding.userinfo-hidden": "El enlace tiene una parte «nombre@» oculta antes de la dirección. Lleva a {host}.",
    "finding.ip-address": "Lleva a una dirección IP sin más ({host}) en lugar de a un sitio web con nombre. Los servicios reales casi nunca enlazan así.",
    "finding.mixed-script": "La dirección mezcla alfabetos (como latino con cirílico o griego) en «{labels}», un truco para que un dominio falso parezca real.",
    "finding.punycode": "La dirección usa caracteres internacionales ({display}, escrito {host}). Algunos se parecen a letras normales.",
    "finding.subdomain-trick": "Empieza por {hit}, pero el sitio es en realidad {domain}. Todo lo que hay a su izquierda es solo una etiqueta que eligió su dueño.",
    "finding.brand-tld": "Usa el nombre de {brand} en un dominio que {brand} no posee: esto es {domain}, no {official}.",
    "finding.lookalike-swap": "{domain} está hecho para parecerse a {official} cambiando caracteres parecidos. No es de {brand}.",
    "finding.lookalike": "{domain} imita el nombre de {brand} con caracteres parecidos. No es de {brand}.",
    "finding.brand-scam": "Pone el nombre de {brand} junto a palabras como «gift», «free» o «login» en un sitio que {brand} no gestiona ({domain}). Así son la mayoría de los enlaces de phishing.",
    "finding.brand-mention": "Contiene el nombre de {brand}, pero no es un sitio de {brand}: {domain} pertenece a otra persona.",
    "finding.typosquat": "{domain} se diferencia en una o dos letras de {official}. Los dominios con erratas como este se suelen usar para robar cuentas.",
    "finding.file-tld": "La dirección termina en .{tld}, que parece el nombre de un archivo pero es un sitio web.",
    "finding.shortener": "{domain} es un acortador de enlaces: no sabrás adónde lleva realmente hasta que lo abras.",
    "finding.free-hosting": "Alojado en {suffix}, donde cualquiera puede crear un sitio gratis.",
    "finding.scam-words-free-nitro": "Menciona Nitro gratis, el cebo más común en las estafas de Discord.",
    "finding.scam-words-nitro-giveaway": "Menciona un sorteo de Nitro, el cebo más común en las estafas de Discord.",
    "finding.scam-words-discord-gift": "Menciona un regalo de Discord, el cebo más común en las estafas de Discord.",
    "finding.scam-words-steam": "Menciona un regalo o intercambio de Steam, el cebo más común en las estafas de Discord.",
    "finding.scam-words-currency": "Menciona moneda de juego o skins gratis, el cebo más común en las estafas de Discord.",
    "finding.scam-words-crypto": "Menciona un airdrop de criptomonedas, el cebo más común en las estafas de Discord.",
    "finding.dangerous-file-disguised": "Descarga «{file}», un programa disfrazado de archivo .{fake}.",
    "finding.dangerous-file": "Descarga un archivo .{ext} («{file}») que puede ejecutar código en tu ordenador. Ábrelo solo si confías en quien te lo envió.",
    "finding.http": "La conexión con este sitio no está cifrada (http)."
  },
  fr: {
    "title.danger": "Ce lien semble dangereux",
    "title.caution": "Ce lien n'est peut-être pas sûr",
    "subtitle.danger": "Il présente des signes d'arnaque ou de lien d'hameçonnage.",
    "subtitle.caution": "Quelque chose d'inhabituel. Vérifiez où il mène avant de l'ouvrir.",
    "label.destination": "Où il mène vraiment",
    "hint.written": "Écrit comme {host}",
    "button.open": "Ouvrir quand même",
    "button.back": "Retour",
    "settings.threshold": "M'avertir pour",
    "settings.threshold.description": "Les liens qui déclenchent un avertissement avant d'être ouverts.",
    "settings.threshold.caution": "Les liens suspects et dangereux",
    "settings.threshold.danger": "Uniquement les liens dangereux",
    "settings.allowlist": "Domaines de confiance",
    "settings.allowlist.description": "Les liens vers ces domaines et leurs sous-domaines n'affichent jamais d'avertissement. Séparez-les par des virgules ou des retours à la ligne.",
    "settings.allowlist.placeholder": "example.com, monsite.fr",
    "finding.unreadable": "Ce lien n'a pas pu être lu comme une adresse web normale.",
    "finding.allowlisted": "{domain} figure dans votre liste de confiance.",
    "finding.masked-mismatch": "Le lien affiche {shown} mais mène en réalité à {host}.",
    "finding.masked-mention": "Le texte du lien mentionne {shown}, mais le lien mène à {host}.",
    "finding.userinfo-host": "Tout ce qui précède le « @ » est ignoré : ce lien commence par « {fake} » mais mène à {host}.",
    "finding.userinfo-hidden": "Le lien contient une partie « nom@ » cachée avant l'adresse. Il mène à {host}.",
    "finding.ip-address": "Mène à une simple adresse IP ({host}) plutôt qu'à un site nommé. Les vrais services ne font presque jamais de liens comme ça.",
    "finding.mixed-script": "L'adresse mélange des alphabets (comme le latin avec le cyrillique ou le grec) dans « {labels} », une astuce pour qu'un faux domaine paraisse authentique.",
    "finding.punycode": "L'adresse utilise des caractères internationaux ({display}, écrit {host}). Certains ressemblent à des lettres normales.",
    "finding.subdomain-trick": "Commence par {hit} mais le site est en réalité {domain}. Tout ce qui se trouve à gauche n'est qu'une étiquette choisie par son propriétaire.",
    "finding.brand-tld": "Utilise le nom de {brand} sur un domaine qui n'appartient pas à {brand} : il s'agit de {domain}, pas de {official}.",
    "finding.lookalike-swap": "{domain} est fait pour ressembler à {official} en remplaçant des caractères par d'autres qui leur ressemblent. Ce site n'est pas géré par {brand}.",
    "finding.lookalike": "{domain} imite le nom de {brand} avec des caractères qui y ressemblent. Ce site n'est pas géré par {brand}.",
    "finding.brand-scam": "Place le nom de {brand} à côté de mots comme « gift », « free » ou « login » sur un site que {brand} ne gère pas ({domain}). C'est l'allure de la plupart des liens d'hameçonnage.",
    "finding.brand-mention": "Contient le nom de {brand} mais n'est pas un site de {brand} : {domain} appartient à quelqu'un d'autre.",
    "finding.typosquat": "{domain} diffère de {official} d'une ou deux lettres. Ces domaines avec faute de frappe servent souvent à voler des comptes.",
    "finding.file-tld": "L'adresse se termine par .{tld}, qui ressemble à un nom de fichier mais désigne un site web.",
    "finding.shortener": "{domain} est un raccourcisseur de liens : impossible de savoir où il mène avant de l'ouvrir.",
    "finding.free-hosting": "Hébergé sur {suffix}, où n'importe qui peut créer un site gratuitement.",
    "finding.scam-words-free-nitro": "Mentionne du Nitro gratuit, l'appât le plus courant des arnaques sur Discord.",
    "finding.scam-words-nitro-giveaway": "Mentionne un giveaway Nitro, l'appât le plus courant des arnaques sur Discord.",
    "finding.scam-words-discord-gift": "Mentionne un cadeau Discord, l'appât le plus courant des arnaques sur Discord.",
    "finding.scam-words-steam": "Mentionne un cadeau ou un échange Steam, l'appât le plus courant des arnaques sur Discord.",
    "finding.scam-words-currency": "Mentionne de la monnaie de jeu ou des skins gratuits, l'appât le plus courant des arnaques sur Discord.",
    "finding.scam-words-crypto": "Mentionne un airdrop de cryptomonnaie, l'appât le plus courant des arnaques sur Discord.",
    "finding.dangerous-file-disguised": "Télécharge « {file} », un programme déguisé en fichier .{fake}.",
    "finding.dangerous-file": "Télécharge un fichier .{ext} (« {file} ») qui peut exécuter du code sur votre ordinateur. Ne l'ouvrez que si vous faites confiance à l'expéditeur.",
    "finding.http": "La connexion à ce site n'est pas chiffrée (http)."
  },
  ja: {
    "title.danger": "このリンクは危険そうです",
    "title.caution": "このリンクは安全でない可能性があります",
    "subtitle.danger": "詐欺やフィッシングのリンクの特徴があります。",
    "subtitle.caution": "不審な点があります。開く前にリンク先を確認してください。",
    "label.destination": "実際のリンク先",
    "hint.written": "表記: {host}",
    "button.open": "このまま開く",
    "button.back": "戻る",
    "settings.threshold": "警告するリンク",
    "settings.threshold.description": "開く前に警告を表示するリンクを選びます。",
    "settings.threshold.caution": "不審なリンクと危険なリンク",
    "settings.threshold.danger": "危険なリンクのみ",
    "settings.allowlist": "信頼するドメイン",
    "settings.allowlist.description": "これらのドメインとそのサブドメインへのリンクには警告を表示しません。カンマまたは改行で区切ってください。",
    "settings.allowlist.placeholder": "example.com, mysite.dev",
    "finding.unreadable": "このリンクは通常のウェブアドレスとして読み取れませんでした。",
    "finding.allowlisted": "{domain} は信頼するドメインに登録されています。",
    "finding.masked-mismatch": "リンクには {shown} と表示されていますが、実際のリンク先は {host} です。",
    "finding.masked-mention": "リンクの文字列に {shown} とありますが、実際のリンク先は {host} です。",
    "finding.userinfo-host": "「@」より前の部分は無視されます。このリンクは「{fake}」で始まっていますが、実際のリンク先は {host} です。",
    "finding.userinfo-hidden": "アドレスの前に「名前@」という隠された部分があります。リンク先は {host} です。",
    "finding.ip-address": "名前のあるウェブサイトではなく、IPアドレス ({host}) に直接つながります。正規のサービスがこのようなリンクを使うことはほとんどありません。",
    "finding.mixed-script": "アドレスの「{labels}」に複数の文字体系(ラテン文字とキリル文字やギリシャ文字など)が混在しています。偽のドメインを本物に見せかける手口です。",
    "finding.punycode": "アドレスに国際文字が使われています ({display}、実際の表記は {host})。通常の文字にそっくりなものもあります。",
    "finding.subdomain-trick": "{hit} で始まっていますが、実際のサイトは {domain} です。その左側にあるのは、所有者が好きに付けたラベルにすぎません。",
    "finding.brand-tld": "{brand} 以外が所有するドメインで {brand} の名前を使っています。これは {official} ではなく {domain} です。",
    "finding.lookalike-swap": "{domain} は、似た文字に置き換えて {official} に見せかけています。{brand} が運営しているものではありません。",
    "finding.lookalike": "{domain} は、似た文字を使って {brand} の名前をまねています。{brand} が運営しているものではありません。",
    "finding.brand-scam": "{brand} が運営していないサイト ({domain}) で、{brand} の名前を「gift」「free」「login」などの言葉と並べています。フィッシングリンクによくある形です。",
    "finding.brand-mention": "{brand} の名前が含まれていますが、{brand} のサイトではありません。{domain} は別の誰かが運営しています。",
    "finding.typosquat": "{domain} は {official} と1〜2文字しか違いません。このようなタイプミスを狙ったドメインは、アカウントの乗っ取りによく使われます。",
    "finding.file-tld": "アドレスが .{tld} で終わっています。ファイル名のように見えますが、ウェブサイトです。",
    "finding.shortener": "{domain} は短縮URLサービスです。開くまで本当のリンク先はわかりません。",
    "finding.free-hosting": "誰でも無料でサイトを作れる {suffix} で公開されています。",
    "finding.scam-words-free-nitro": "無料のNitroに言及しています。Discord詐欺で最もよくある餌です。",
    "finding.scam-words-nitro-giveaway": "Nitroのプレゼント企画に言及しています。Discord詐欺で最もよくある餌です。",
    "finding.scam-words-discord-gift": "Discordのギフトに言及しています。Discord詐欺で最もよくある餌です。",
    "finding.scam-words-steam": "Steamのギフトやトレードに言及しています。Discord詐欺で最もよくある餌です。",
    "finding.scam-words-currency": "無料のゲーム内通貨やスキンに言及しています。Discord詐欺で最もよくある餌です。",
    "finding.scam-words-crypto": "暗号資産のエアドロップに言及しています。Discord詐欺で最もよくある餌です。",
    "finding.dangerous-file-disguised": "「{file}」をダウンロードします。.{fake} ファイルに偽装したプログラムです。",
    "finding.dangerous-file": ".{ext} ファイル(「{file}」)をダウンロードします。パソコン上でコードが実行される可能性があります。送信者が信頼できる場合のみ開いてください。",
    "finding.http": "このサイトとの接続は暗号化されていません (http)。"
  },
  pl: {
    "title.danger": "Ten link wygląda niebezpiecznie",
    "title.caution": "Ten link może być niebezpieczny",
    "subtitle.danger": "Ma cechy linku oszukańczego lub phishingowego.",
    "subtitle.caution": "Coś w nim jest nietypowego. Sprawdź, dokąd prowadzi, zanim go otworzysz.",
    "label.destination": "Dokąd naprawdę prowadzi",
    "hint.written": "Zapisano jako {host}",
    "button.open": "Otwórz mimo to",
    "button.back": "Wróć",
    "settings.threshold": "Ostrzegaj przed",
    "settings.threshold.description": "Które linki wyświetlają ostrzeżenie przed otwarciem.",
    "settings.threshold.caution": "Podejrzanymi i niebezpiecznymi linkami",
    "settings.threshold.danger": "Tylko niebezpiecznymi linkami",
    "settings.allowlist": "Zaufane domeny",
    "settings.allowlist.description": "Linki do tych domen i ich subdomen nigdy nie wyświetlają ostrzeżenia. Oddziel je przecinkami lub nowymi wierszami.",
    "settings.allowlist.placeholder": "example.com, mojastrona.pl",
    "finding.unreadable": "Nie udało się odczytać tego linku jako zwykłego adresu internetowego.",
    "finding.allowlisted": "{domain} jest na twojej liście zaufanych domen.",
    "finding.masked-mismatch": "Link pokazuje {shown}, ale w rzeczywistości prowadzi do {host}.",
    "finding.masked-mention": "Tekst linku wspomina o {shown}, ale link prowadzi do {host}.",
    "finding.userinfo-host": "Wszystko przed „@” jest ignorowane: ten link zaczyna się od „{fake}”, ale prowadzi do {host}.",
    "finding.userinfo-hidden": "Link ma przed adresem ukrytą część „nazwa@”. Prowadzi do {host}.",
    "finding.ip-address": "Prowadzi do samego adresu IP ({host}) zamiast do strony z nazwą. Prawdziwe usługi prawie nigdy tak nie linkują.",
    "finding.mixed-script": "Adres miesza alfabety (np. łaciński z cyrylicą lub greką) w „{labels}” — to sztuczka, by fałszywa domena wyglądała wiarygodnie.",
    "finding.punycode": "Adres zawiera znaki międzynarodowe ({display}, zapisane jako {host}). Niektóre z nich wyglądają jak zwykłe litery.",
    "finding.subdomain-trick": "Zaczyna się od {hit}, ale strona to naprawdę {domain}. Wszystko po lewej to tylko nazwa wybrana przez właściciela.",
    "finding.brand-tld": "Używa nazwy {brand} w domenie, która nie należy do {brand}: to {domain}, a nie {official}.",
    "finding.lookalike-swap": "{domain} ma udawać {official} dzięki podmienionym, podobnie wyglądającym znakom. Nie należy do {brand}.",
    "finding.lookalike": "{domain} podszywa się pod nazwę {brand} za pomocą podobnie wyglądających znaków. Nie należy do {brand}.",
    "finding.brand-scam": "Zestawia nazwę {brand} ze słowami takimi jak „gift”, „free” czy „login” na stronie, której {brand} nie prowadzi ({domain}). Tak wygląda większość linków phishingowych.",
    "finding.brand-mention": "Zawiera nazwę {brand}, ale nie jest stroną {brand}: {domain} należy do kogoś innego.",
    "finding.typosquat": "{domain} różni się od {official} o jedną lub dwie litery. Takie domeny z literówką często służą do kradzieży kont.",
    "finding.file-tld": "Adres kończy się na .{tld}, co wygląda jak nazwa pliku, ale jest stroną internetową.",
    "finding.shortener": "{domain} to skracacz linków: dokąd naprawdę prowadzi, zobaczysz dopiero po otwarciu.",
    "finding.free-hosting": "Hostowane na {suffix}, gdzie każdy może za darmo założyć stronę.",
    "finding.scam-words-free-nitro": "Wspomina o darmowym Nitro, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.scam-words-nitro-giveaway": "Wspomina o rozdaniu Nitro, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.scam-words-discord-gift": "Wspomina o prezencie od Discorda, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.scam-words-steam": "Wspomina o prezencie lub wymianie na Steamie, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.scam-words-currency": "Wspomina o darmowej walucie w grze lub skinach, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.scam-words-crypto": "Wspomina o airdropie kryptowalut, najczęstszej przynęcie w oszustwach na Discordzie.",
    "finding.dangerous-file-disguised": "Pobiera „{file}”, program udający plik .{fake}.",
    "finding.dangerous-file": "Pobiera plik .{ext} („{file}”), który może uruchomić kod na twoim komputerze. Otwieraj go tylko wtedy, gdy ufasz nadawcy.",
    "finding.http": "Połączenie z tą stroną nie jest szyfrowane (http)."
  },
  "pt-BR": {
    "title.danger": "Este link parece perigoso",
    "title.caution": "Este link pode não ser seguro",
    "subtitle.danger": "Ele tem sinais de golpe ou de link de phishing.",
    "subtitle.caution": "Tem algo estranho nele. Confira para onde ele leva antes de abrir.",
    "label.destination": "Para onde ele realmente leva",
    "hint.written": "Escrito como {host}",
    "button.open": "Abrir mesmo assim",
    "button.back": "Voltar",
    "settings.threshold": "Avisar sobre",
    "settings.threshold.description": "Quais links mostram um aviso antes de abrir.",
    "settings.threshold.caution": "Links suspeitos e perigosos",
    "settings.threshold.danger": "Só links perigosos",
    "settings.allowlist": "Domínios confiáveis",
    "settings.allowlist.description": "Links para esses domínios e seus subdomínios nunca mostram aviso. Separe-os com vírgulas ou quebras de linha.",
    "settings.allowlist.placeholder": "example.com, meusite.com.br",
    "finding.unreadable": "Não foi possível ler este link como um endereço web normal.",
    "finding.allowlisted": "{domain} está na sua lista de domínios confiáveis.",
    "finding.masked-mismatch": "O link diz {shown}, mas na verdade leva para {host}.",
    "finding.masked-mention": "O texto do link menciona {shown}, mas o link leva para {host}.",
    "finding.userinfo-host": 'Tudo antes do "@" é ignorado: este link começa com "{fake}", mas leva para {host}.',
    "finding.userinfo-hidden": 'O link tem uma parte "nome@" escondida antes do endereço. Ele leva para {host}.',
    "finding.ip-address": "Leva para um endereço IP puro ({host}) em vez de um site com nome. Serviços de verdade quase nunca usam links assim.",
    "finding.mixed-script": 'O endereço mistura alfabetos (como latino com cirílico ou grego) em "{labels}", um truque para fazer um domínio falso parecer verdadeiro.',
    "finding.punycode": "O endereço usa caracteres internacionais ({display}, escrito {host}). Alguns deles são parecidos com letras comuns.",
    "finding.subdomain-trick": "Começa com {hit}, mas o site na verdade é {domain}. Tudo que está à esquerda é só um rótulo escolhido pelo dono.",
    "finding.brand-tld": "Usa o nome {brand} em um domínio que não pertence à {brand}: este é {domain}, não {official}.",
    "finding.lookalike-swap": "{domain} foi feito para parecer {official} trocando caracteres parecidos. Ele não é da {brand}.",
    "finding.lookalike": "{domain} imita o nome {brand} com caracteres parecidos. Ele não é da {brand}.",
    "finding.brand-scam": 'Coloca o nome {brand} ao lado de palavras como "gift", "free" ou "login" em um site que a {brand} não administra ({domain}). É assim que a maioria dos links de phishing se parece.',
    "finding.brand-mention": "Tem o nome {brand} nele, mas não é um site da {brand}: {domain} pertence a outra pessoa.",
    "finding.typosquat": "{domain} tem só uma ou duas letras de diferença de {official}. Domínios com erro de digitação como esse costumam ser usados para roubar contas.",
    "finding.file-tld": "O endereço termina em .{tld}, que parece nome de arquivo, mas é um site.",
    "finding.shortener": "{domain} é um encurtador de links: só dá para saber para onde ele leva depois de abrir.",
    "finding.free-hosting": "Hospedado em {suffix}, onde qualquer pessoa pode criar um site de graça.",
    "finding.scam-words-free-nitro": "Menciona Nitro grátis, a isca mais comum nos golpes do Discord.",
    "finding.scam-words-nitro-giveaway": "Menciona um sorteio de Nitro, a isca mais comum nos golpes do Discord.",
    "finding.scam-words-discord-gift": "Menciona um presente do Discord, a isca mais comum nos golpes do Discord.",
    "finding.scam-words-steam": "Menciona um presente ou troca da Steam, a isca mais comum nos golpes do Discord.",
    "finding.scam-words-currency": "Menciona moeda de jogo ou skins grátis, a isca mais comum nos golpes do Discord.",
    "finding.scam-words-crypto": "Menciona um airdrop de criptomoedas, a isca mais comum nos golpes do Discord.",
    "finding.dangerous-file-disguised": 'Baixa "{file}", um programa disfarçado de arquivo .{fake}.',
    "finding.dangerous-file": 'Baixa um arquivo .{ext} ("{file}"), que pode executar código no seu computador. Só abra se confiar em quem enviou.',
    "finding.http": "A conexão com este site não é criptografada (http)."
  },
  ru: {
    "title.danger": "Эта ссылка выглядит опасной",
    "title.caution": "Эта ссылка может быть небезопасной",
    "subtitle.danger": "Есть признаки мошеннической или фишинговой ссылки.",
    "subtitle.caution": "В ней есть что-то необычное. Проверьте, куда она ведёт, прежде чем открывать.",
    "label.destination": "Куда она ведёт на самом деле",
    "hint.written": "Записано как {host}",
    "button.open": "Всё равно открыть",
    "button.back": "Назад",
    "settings.threshold": "Предупреждать о",
    "settings.threshold.description": "О каких ссылках предупреждать перед открытием.",
    "settings.threshold.caution": "Подозрительных и опасных ссылках",
    "settings.threshold.danger": "Только опасных ссылках",
    "settings.allowlist": "Доверенные домены",
    "settings.allowlist.description": "Для ссылок на эти домены и их поддомены предупреждение никогда не показывается. Разделяйте запятыми или переносами строк.",
    "settings.allowlist.placeholder": "example.com, mysite.ru",
    "finding.unreadable": "Эту ссылку не удалось прочитать как обычный веб-адрес.",
    "finding.allowlisted": "{domain} есть в вашем списке доверенных доменов.",
    "finding.masked-mismatch": "В ссылке написано {shown}, но на самом деле она ведёт на {host}.",
    "finding.masked-mention": "В тексте ссылки упоминается {shown}, но ведёт она на {host}.",
    "finding.userinfo-host": "Всё, что стоит перед «@», игнорируется: ссылка начинается с «{fake}», но ведёт на {host}.",
    "finding.userinfo-hidden": "Перед адресом в ссылке спрятана часть «имя@». Ведёт она на {host}.",
    "finding.ip-address": "Ведёт на голый IP-адрес ({host}), а не на сайт с названием. Настоящие сервисы почти никогда так не ссылаются.",
    "finding.mixed-script": "В адресе «{labels}» смешаны алфавиты (например, латиница с кириллицей или греческим). Так поддельный домен выдают за настоящий.",
    "finding.punycode": "В адресе есть международные символы ({display}, в записи {host}). Некоторые из них похожи на обычные буквы.",
    "finding.subdomain-trick": "Начинается с {hit}, но на самом деле сайт — {domain}. Всё, что слева, — просто название, которое выбрал владелец.",
    "finding.brand-tld": "Использует название {brand} на домене, который {brand} не принадлежит: это {domain}, а не {official}.",
    "finding.lookalike-swap": "{domain} сделан похожим на {official} с помощью подмены символов. Он не принадлежит {brand}.",
    "finding.lookalike": "{domain} подделывает название {brand} похожими символами. Он не принадлежит {brand}.",
    "finding.brand-scam": "Название {brand} стоит рядом со словами вроде «gift», «free» или «login» на сайте, который {brand} не ведёт ({domain}). Так выглядит большинство фишинговых ссылок.",
    "finding.brand-mention": "Содержит название {brand}, но это не сайт {brand}: {domain} принадлежит кому-то другому.",
    "finding.typosquat": "{domain} отличается от {official} на одну-две буквы. Домены с опечатками часто используют для кражи аккаунтов.",
    "finding.file-tld": "Адрес заканчивается на .{tld}: это похоже на имя файла, но на деле сайт.",
    "finding.shortener": "{domain} — сервис сокращения ссылок: куда она ведёт на самом деле, видно только после открытия.",
    "finding.free-hosting": "Размещён на {suffix}, где любой может бесплатно создать сайт.",
    "finding.scam-words-free-nitro": "Упоминает бесплатный Nitro — самую частую приманку в мошенничестве в Discord.",
    "finding.scam-words-nitro-giveaway": "Упоминает раздачу Nitro — самую частую приманку в мошенничестве в Discord.",
    "finding.scam-words-discord-gift": "Упоминает подарок Discord — самую частую приманку в мошенничестве в Discord.",
    "finding.scam-words-steam": "Упоминает подарок или обмен в Steam — самую частую приманку в мошенничестве в Discord.",
    "finding.scam-words-currency": "Упоминает бесплатную игровую валюту или скины — самую частую приманку в мошенничестве в Discord.",
    "finding.scam-words-crypto": "Упоминает криптоэирдроп — самую частую приманку в мошенничестве в Discord.",
    "finding.dangerous-file-disguised": "Скачивает «{file}» — программу, замаскированную под файл .{fake}.",
    "finding.dangerous-file": "Скачивает файл .{ext} («{file}»), который может выполнить код на вашем компьютере. Открывайте его, только если доверяете отправителю.",
    "finding.http": "Соединение с этим сайтом не зашифровано (http)."
  },
  tr: {
    "title.danger": "Bu bağlantı tehlikeli görünüyor",
    "title.caution": "Bu bağlantı güvenli olmayabilir",
    "subtitle.danger": "Dolandırıcılık veya kimlik avı bağlantısı belirtileri taşıyor.",
    "subtitle.caution": "Bir şeyler alışılmadık. Açmadan önce nereye gittiğini kontrol et.",
    "label.destination": "Gerçekte nereye gidiyor",
    "hint.written": "{host} olarak yazılmış",
    "button.open": "Yine de aç",
    "button.back": "Geri dön",
    "settings.threshold": "Şunlar için uyar",
    "settings.threshold.description": "Hangi bağlantılar açılmadan önce uyarı gösterir.",
    "settings.threshold.caution": "Şüpheli ve tehlikeli bağlantılar",
    "settings.threshold.danger": "Yalnızca tehlikeli bağlantılar",
    "settings.allowlist": "Güvenilen alan adları",
    "settings.allowlist.description": "Bu alan adlarına ve alt alan adlarına giden bağlantılar için asla uyarı gösterilmez. Virgül veya yeni satırla ayır.",
    "settings.allowlist.placeholder": "example.com, sitem.dev",
    "finding.unreadable": "Bu bağlantı normal bir web adresi olarak okunamadı.",
    "finding.allowlisted": "{domain} güvenilen alan adları listende.",
    "finding.masked-mismatch": "Bağlantı {shown} diyor ama aslında {host} adresine gidiyor.",
    "finding.masked-mention": "Bağlantı metni {shown} adresinden söz ediyor ama bağlantı {host} adresine gidiyor.",
    "finding.userinfo-host": '"@" işaretinden önceki her şey yok sayılır: bu bağlantı "{fake}" ile başlıyor ama {host} adresine gidiyor.',
    "finding.userinfo-hidden": 'Bağlantının adresten önce gizli bir "ad@" kısmı var. {host} adresine gidiyor.',
    "finding.ip-address": "Adı olan bir web sitesi yerine çıplak bir IP adresine ({host}) gidiyor. Gerçek hizmetler neredeyse hiç böyle bağlantı vermez.",
    "finding.mixed-script": 'Adres, "{labels}" içinde alfabeleri karıştırıyor (Latin ile Kiril veya Yunan gibi). Sahte bir alan adını gerçek gibi göstermek için kullanılan bir hile.',
    "finding.punycode": "Adres uluslararası karakterler kullanıyor ({display}, {host} olarak yazılmış). Bunların bir kısmı normal harflere çok benzer.",
    "finding.subdomain-trick": "{hit} ile başlıyor ama site aslında {domain}. Soldaki her şey, sahibinin seçtiği bir etiketten ibaret.",
    "finding.brand-tld": "{brand} adını, {brand} markasına ait olmayan bir alan adında kullanıyor: bu {official} değil, {domain}.",
    "finding.lookalike-swap": "{domain}, benzer karakterler değiştirilerek {official} gibi görünecek şekilde yapılmış. {brand} tarafından işletilmiyor.",
    "finding.lookalike": "{domain}, benzer karakterlerle {brand} adını taklit ediyor. {brand} tarafından işletilmiyor.",
    "finding.brand-scam": '{brand} adını, {brand} tarafından işletilmeyen bir sitede ({domain}) "gift", "free" veya "login" gibi sözcüklerin yanına koyuyor. Kimlik avı bağlantılarının çoğu böyle görünür.',
    "finding.brand-mention": "İçinde {brand} adı geçiyor ama {brand} sitelerinden biri değil: {domain} başkasına ait.",
    "finding.typosquat": "{domain}, {official} adresinden bir iki harf farklı. Bu tür yazım hatalı alan adları genellikle hesap çalmak için kullanılır.",
    "finding.file-tld": "Adres .{tld} ile bitiyor; bu bir dosya adına benziyor ama aslında bir web sitesi.",
    "finding.shortener": "{domain} bir bağlantı kısaltıcı: gerçekte nereye gittiği, açana kadar gizli.",
    "finding.free-hosting": "Herkesin ücretsiz site açabildiği {suffix} üzerinde barındırılıyor.",
    "finding.scam-words-free-nitro": "Bedava Nitro'dan söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.scam-words-nitro-giveaway": "Nitro çekilişinden söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.scam-words-discord-gift": "Discord hediyesinden söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.scam-words-steam": "Steam hediyesi veya takasından söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.scam-words-currency": "Bedava oyun içi para birimi veya kostümlerden söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.scam-words-crypto": "Kripto airdrop'undan söz ediyor; Discord dolandırıcılıklarında en yaygın yem.",
    "finding.dangerous-file-disguised": '"{file}" dosyasını indiriyor; .{fake} dosyası gibi görünen bir program.',
    "finding.dangerous-file": 'Bilgisayarında kod çalıştırabilen bir .{ext} dosyası ("{file}") indiriyor. Yalnızca göndereni tanıyorsan aç.',
    "finding.http": "Bu siteyle bağlantı şifrelenmemiş (http)."
  }
});

// plugins/link-safety/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var running = false;
var threshold = "caution";
var allowlist = [];
var closeOpen;
function textOf(node) {
  if (node == null || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number")
    return String(node);
  if (Array.isArray(node))
    return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node)
    return textOf(node.props?.children);
  return "";
}
function linkText(event, props) {
  const fromDom = event?.currentTarget?.textContent ?? event?.target?.closest?.("a")?.textContent;
  if (typeof fromDom === "string" && fromDom.trim())
    return fromDom;
  return textOf(props?.children);
}
function say(f) {
  return f.vars ? t(`finding.${f.key ?? f.code}`, f.vars) : f.code === "unreadable" || f.code === "http" ? t(`finding.${f.code}`) : f.message;
}
function openWarning(analysis, onOpen, onCancel) {
  closeOpen?.();
  let settled = false;
  const finish = (open, options) => {
    if (settled)
      return;
    settled = true;
    close(options);
    try {
      (open ? onOpen : onCancel)();
    } catch {}
  };
  const cancel = (options) => finish(false, options);
  const close = import_api2.openLayer(() => /* @__PURE__ */ jsx_runtime.jsx(Warning, {
    analysis,
    onOpen: () => finish(true),
    onBack: () => finish(false)
  }), {
    onClosed: () => void (closeOpen === cancel && (closeOpen = undefined))
  });
  closeOpen = cancel;
}
function Warning({ analysis, onOpen, onBack }) {
  const backRef = import_api2.React.useRef(null);
  const danger = analysis.level === "danger";
  import_api2.React.useEffect(() => {
    const previous = document.activeElement;
    backRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape")
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onBack();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  const reasons = analysis.findings.filter((f) => f.level !== "info");
  const notes = analysis.findings.filter((f) => f.level === "info");
  const p = analysis.parts;
  let address = analysis.url;
  if (p) {
    address = /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("span", {
          className: "evi-ls-dim",
          children: p.prefix
        }),
        /* @__PURE__ */ jsx_runtime.jsx("span", {
          className: "evi-ls-sub",
          children: p.subdomain
        }),
        /* @__PURE__ */ jsx_runtime.jsx("mark", {
          className: "evi-ls-domain",
          children: p.domain
        }),
        /* @__PURE__ */ jsx_runtime.jsx("span", {
          className: "evi-ls-dim",
          children: p.rest
        })
      ]
    });
  }
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-ls-scrim evi-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onBack(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-ls-modal evi-modal",
      "data-level": analysis.level,
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-ls-title",
      "aria-describedby": "evi-ls-reasons",
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-ls-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("span", {
              className: "evi-ls-icon",
              "aria-hidden": "true",
              children: /* @__PURE__ */ jsx_runtime.jsxs("svg", {
                viewBox: "0 0 24 24",
                width: "22",
                height: "22",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsx("path", {
                    d: "M12 3 2 20h20L12 3Z",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinejoin: "round"
                  }),
                  /* @__PURE__ */ jsx_runtime.jsx("path", {
                    d: "M12 10v4.5M12 17.5v.01",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinecap: "round"
                  })
                ]
              })
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h2", {
                  id: "evi-ls-title",
                  children: t(danger ? "title.danger" : "title.caution")
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  children: t(danger ? "subtitle.danger" : "subtitle.caution")
                })
              ]
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-ls-body",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("ul", {
              className: "evi-ls-reasons",
              id: "evi-ls-reasons",
              children: [
                reasons.map((f) => /* @__PURE__ */ jsx_runtime.jsx("li", {
                  "data-level": f.level,
                  children: say(f)
                }, f.code)),
                notes.map((f) => /* @__PURE__ */ jsx_runtime.jsx("li", {
                  "data-level": "info",
                  children: say(f)
                }, f.code))
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-ls-label",
              children: t("label.destination")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-ls-url",
              children: address
            }),
            analysis.displayHostname !== analysis.hostname && analysis.hostname && /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-ls-hint",
              children: t("hint.written", { host: analysis.hostname })
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("footer", {
          className: "evi-ls-actions",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-ls-open",
              onClick: onOpen,
              children: t("button.open")
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-ls-back",
              ref: backRef,
              onClick: onBack,
              children: t("button.back")
            })
          ]
        })
      ]
    })
  });
}
var css = `
.evi-ls-scrim { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-ls-modal { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); --evi-ls-accent: var(--status-warning, #f0b232); }
.evi-ls-modal[data-level="danger"] { --evi-ls-accent: var(--status-danger, #f23f43); }
.evi-ls-head { display: flex; gap: 12px; align-items: flex-start; padding: 20px 20px 12px; }
.evi-ls-icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--evi-ls-accent); background: color-mix(in srgb, var(--evi-ls-accent) 16%, transparent); }
.evi-ls-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-ls-head p { margin: 4px 0 0; font-size: 14px; line-height: 18px; color: var(--text-muted, #949ba4); }
.evi-ls-body { overflow-y: auto; padding: 4px 20px 16px; }
.evi-ls-reasons { margin: 0 0 16px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.evi-ls-reasons li { position: relative; padding-left: 18px; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
.evi-ls-reasons li::before { content: ""; position: absolute; left: 2px; top: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--status-warning, #f0b232); }
.evi-ls-reasons li[data-level="danger"]::before { background: var(--status-danger, #f23f43); }
.evi-ls-reasons li[data-level="info"] { color: var(--text-muted, #949ba4); }
.evi-ls-reasons li[data-level="info"]::before { background: var(--text-muted, #949ba4); }
.evi-ls-label { margin-bottom: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-ls-url { padding: 10px 12px; border-radius: 8px; font-family: var(--font-code, monospace); font-size: 13px; line-height: 18px; overflow-wrap: anywhere; max-height: 120px; overflow-y: auto;
  background: var(--background-base-lowest, var(--background-secondary, #2b2d31)); user-select: text; }
.evi-ls-dim { color: var(--text-muted, #949ba4); }
.evi-ls-sub { color: var(--text-default, #dbdee1); }
.evi-ls-domain { background: none; color: var(--evi-ls-accent); font-weight: 700; }
.evi-ls-hint { margin-top: 6px; font-size: 12px; color: var(--text-muted, #949ba4); overflow-wrap: anywhere; }
.evi-ls-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; background: var(--modal-footer-background, rgba(0,0,0,.08)); }
.evi-ls-actions button { min-height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
.evi-ls-back { background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); }
.evi-ls-back:hover { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-ls-open { background: none; color: var(--text-default, #dbdee1); }
.evi-ls-open:hover { text-decoration: underline; }
.evi-ls-actions button:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 2px; }
`;
var THRESHOLDS = ["caution", "danger"];
var link_safety_default = import_api2.definePlugin({
  settings: {
    threshold: {
      type: "select",
      get label() {
        return t("settings.threshold");
      },
      get description() {
        return t("settings.threshold.description");
      },
      default: "caution",
      options: [
        { get label() {
          return t("settings.threshold.caution");
        }, value: "caution" },
        { get label() {
          return t("settings.threshold.danger");
        }, value: "danger" }
      ]
    },
    allowlist: {
      type: "string",
      get label() {
        return t("settings.allowlist");
      },
      get description() {
        return t("settings.allowlist.description");
      },
      get placeholder() {
        return t("settings.allowlist.placeholder");
      },
      default: "",
      multiline: true
    }
  },
  patches: [PATCH],
  intercept(url, event, open, cancel, props) {
    if (!running || typeof url !== "string" || typeof open !== "function")
      return false;
    try {
      const analysis = analyzeLink(url, { text: linkText(event, props), allowlist });
      if (!meetsThreshold(analysis.level, threshold))
        return false;
      event?.preventDefault?.();
      openWarning(analysis, open, typeof cancel === "function" ? cancel : () => {});
      return true;
    } catch {
      return false;
    }
  },
  start(ctx) {
    const apply = (values) => {
      threshold = THRESHOLDS.includes(values.threshold) ? values.threshold : "caution";
      allowlist = parseAllowlist(values.allowlist);
    };
    apply({ threshold: ctx.settings.get("threshold"), allowlist: ctx.settings.get("allowlist") });
    ctx.settings.onChange(apply);
    ctx.addStyle(css);
    running = true;
    ctx.onDispose(() => {
      running = false;
      closeOpen?.({ instant: true });
    });
  }
});
