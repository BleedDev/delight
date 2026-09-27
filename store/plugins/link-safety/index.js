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
var import_api = require("@evi/api");

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
  { re: /free[-_.\s]*(?:discord[-_.\s]*)?nitro/, what: "free Nitro" },
  { re: /nitro[-_.\s]*(?:gift|free|drop|claim|generator|gen)s?\b/, what: "a Nitro giveaway" },
  { re: /discord[-_.]?(?:gift|nitro|airdrop|promo|drop|claim)s?/, what: "a Discord gift" },
  { re: /steam[-_.]?(?:gift|giveaway|trade[-_.]?offer|free|drop|claim|skins?)s?/, what: "a Steam gift or trade" },
  { re: /(?:free|claim)[-_.\s]*(?:robux|vbucks|v-bucks|skins?|cs2?[-_.]?skins?)/, what: "free in-game currency or skins" },
  { re: /(?:airdrop|claim)[-_.\s]*(?:crypto|token|nft|eth|btc|usdt)/, what: "a crypto airdrop" }
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
        return { level: "danger", code: "brand-tld", message: `Uses ${brand.name}'s name on a domain ${brand.name} doesn't own: this is ${displayDomain}, not ${official}.` };
      }
      if (nameSkeleton === skeleton(key)) {
        return { level: "danger", code: "lookalike", message: `${displayDomain} is made to look like ${official} by swapping lookalike characters. It isn't run by ${brand.name}.` };
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
        return hasScamWord ? { level: "danger", code: "brand-scam", message: `Puts ${brand.name}'s name next to words like "gift", "free" or "login" on a site ${brand.name} doesn't run (${displayDomain}). That's how most phishing links look.` } : { level: "caution", code: "brand-mention", message: `Has ${brand.name}'s name in it but isn't one of ${brand.name}'s sites: ${displayDomain} is run by someone else.` };
      }
      if (nameSkeleton.includes(keySkeleton)) {
        return { level: "danger", code: "lookalike", message: `${displayDomain} imitates ${brand.name}'s name with lookalike characters. It isn't run by ${brand.name}.` };
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
  const add = (level, code, message) => void findings.push({ level, code, message });
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
    add("info", "allowlisted", `${displayDomain} is on your allowlist.`);
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
          add(official ? "caution" : "danger", "masked-mismatch", message);
        else
          add("caution", "masked-mention", `The link text mentions ${shownDisplay}, but the link goes to ${displayHost}.`);
      }
    }
  }
  if (url.username || url.password) {
    const fake = decodeURIComponent(url.username);
    const looksLikeHost = /\./.test(fake) || /\./.test(url.password);
    add(looksLikeHost || !official ? "danger" : "caution", "userinfo", looksLikeHost ? `Everything before the "@" is ignored: this link starts with "${fake}" but goes to ${displayHost}.` : `The link has a hidden "name@" part before the address. It goes to ${displayHost}.`);
  }
  if (isIP(host)) {
    add("caution", "ip-address", `Goes to a bare IP address (${host}) instead of a named website. Real services almost never link like this.`);
  } else {
    const mixed = mixedScriptLabels(displayHost);
    if (mixed.length) {
      add("danger", "mixed-script", `The address mixes alphabets (like Latin with Cyrillic or Greek) in "${mixed.join(".")}", a trick to make a fake domain look real.`);
    } else if (host.split(".").some((l) => l.startsWith("xn--"))) {
      add("caution", "punycode", `The address uses international characters (${displayHost}, written ${host}). Some of these are lookalikes of normal letters.`);
    }
    for (const b of BRANDS) {
      if (official)
        break;
      const hit = b.domains.find((d) => host.startsWith(d + ".") && d !== domain);
      if (hit) {
        add("danger", "subdomain-trick", `Starts with ${hit} but the site is really ${displayDomain}. Everything to the left of it is just a label its owner picked.`);
        break;
      }
    }
    const lookalike = brandLookalike(domain, displayDomain);
    if (lookalike)
      findings.push(lookalike);
    const tld = host.slice(host.lastIndexOf(".") + 1);
    if (FILE_LIKE_TLDS.has(tld))
      add("caution", "file-tld", `The address ends in .${tld}, which looks like a file name but is a website.`);
    if (SHORTENERS.has(domain) || SHORTENERS.has(host)) {
      add("info", "shortener", `${displayDomain} is a link shortener: where it really leads is hidden until you open it.`);
    }
    if (HOSTING_SUFFIXES.has(suffixOf(domain)) && !official) {
      add("info", "free-hosting", `Hosted on ${suffixOf(domain)}, where anyone can make a site for free.`);
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
      add(inHost ? "danger" : "caution", "scam-words", `Mentions ${scam.what}, the most common bait in Discord scams.`);
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
      add(doubled ? "danger" : "caution", "dangerous-file", doubled ? `Downloads "${file}", a program disguised as a .${pieces[pieces.length - 2]} file.` : `Downloads a .${ext} file ("${file}"), which can run code on your computer. Only open it if you trust the sender.`);
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
function openWarning(analysis, onOpen, onCancel) {
  closeOpen?.();
  const container = document.createElement("div");
  document.body.append(container);
  const root = import_api.createRoot(container);
  let settled = false;
  const close = () => {
    if (closeOpen === close)
      closeOpen = undefined;
    root.unmount();
    container.remove();
  };
  const finish = (open) => {
    if (settled)
      return;
    settled = true;
    close();
    try {
      (open ? onOpen : onCancel)();
    } catch {}
  };
  closeOpen = () => finish(false);
  root.render(/* @__PURE__ */ jsx_runtime.jsx(Warning, {
    analysis,
    onOpen: () => finish(true),
    onBack: () => finish(false)
  }));
}
function Warning({ analysis, onOpen, onBack }) {
  const backRef = import_api.React.useRef(null);
  const danger = analysis.level === "danger";
  import_api.React.useEffect(() => {
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
    className: "evi-ls-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onBack(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-ls-modal",
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
                  children: danger ? "This link looks dangerous" : "This link might not be safe"
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  children: danger ? "It has signs of a scam or phishing link." : "Something about it is unusual. Check where it goes before you open it."
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
                  children: f.message
                }, f.code)),
                notes.map((f) => /* @__PURE__ */ jsx_runtime.jsx("li", {
                  "data-level": "info",
                  children: f.message
                }, f.code))
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-ls-label",
              children: "Where it really goes"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-ls-url",
              children: address
            }),
            analysis.displayHostname !== analysis.hostname && analysis.hostname && /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-ls-hint",
              children: [
                "Written as ",
                analysis.hostname
              ]
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("footer", {
          className: "evi-ls-actions",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-ls-open",
              onClick: onOpen,
              children: "Open anyway"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-ls-back",
              ref: backRef,
              onClick: onBack,
              children: "Go back"
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
var link_safety_default = import_api.definePlugin({
  settings: {
    threshold: {
      type: "select",
      label: "Warn me about",
      description: "Which links get a warning before they open.",
      default: "caution",
      options: [
        { label: "Suspicious and dangerous links", value: "caution" },
        { label: "Only dangerous links", value: "danger" }
      ]
    },
    allowlist: {
      type: "string",
      label: "Trusted domains",
      description: "Links to these domains and their subdomains never get a warning. Separate them with commas or new lines.",
      placeholder: "example.com, mysite.dev",
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
      closeOpen?.();
    });
  }
});
