/** Pure URL builders for Quick Actions, unit tested in tests/quickActions.test.ts */

/** Discord's own format: {origin}/channels/{guild or @me}/{channel}/{message} */
export function messageLink(origin: string, guildId: string | null | undefined, channelId: string, messageId: string) {
    return `${origin}/channels/${guildId || "@me"}/${channelId}/${messageId}`;
}

/** The page's origin on discord.com, ptb.discord.com, canary.discord.com; discord.com elsewhere */
export function discordOrigin(location: { protocol: string; host: string; }) {
    return /^(?:[\w-]+\.)?discord\.com$/.test(location.host) ? `${location.protocol}//${location.host}` : "https://discord.com";
}

export interface ImageSearchEngine {
    id: string;
    name: string;
    url(imageUrl: string): string;
}

export const IMAGE_SEARCH_ENGINES: ImageSearchEngine[] = [
    { id: "google-lens", name: "Google Lens", url: u => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}` },
    { id: "yandex", name: "Yandex", url: u => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}` },
    { id: "tineye", name: "TinEye", url: u => `https://tineye.com/search?url=${encodeURIComponent(u)}` },
];

// Resizing and re-encoding options of Discord's media proxy. Search engines do better with the
// original; the signature (ex, is, hm) must stay or the link stops working.
const PROXY_SIZE_PARAMS = ["width", "height", "format", "quality"];

/** An image URL fit to hand to a search engine: http(s) only, media proxy resizing removed */
export function cleanImageUrl(raw: string): string | undefined {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (url.hostname === "media.discordapp.net") for (const p of PROXY_SIZE_PARAMS) url.searchParams.delete(p);
    return url.toString();
}

const VIDEO = /\.(?:mp4|webm|mov|m4v|mkv|avi)(?:$|[?#])/i;
const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff?)(?:$|[?#])/i;

/** Whether an attachment is an image, by content type or, without one, by file name */
export function isImageAttachment(a: { content_type?: string; contentType?: string; filename?: string; url?: string; }) {
    const type = a.content_type ?? a.contentType;
    if (type) return type.startsWith("image/");
    return IMAGE.test(a.filename ?? "") || IMAGE.test(a.url ?? "");
}

export const isVideoUrl = (url: string) => VIDEO.test(url);

/** Google Translate's language code for a Discord / browser locale ("en-US" -> "en", "zh-TW" stays) */
export function googleLanguage(locale: string | undefined) {
    if (!locale) return "en";
    const [lang, region] = locale.replace("_", "-").split("-");
    const base = lang.toLowerCase();
    if (base === "zh") return region?.toUpperCase() === "TW" || region?.toUpperCase() === "HK" ? "zh-TW" : "zh-CN";
    return base;
}

/** Google Translate refuses longer text in the URL */
export const TRANSLATE_MAX_CHARS = 5000;

export function translateUrl(text: string, targetLanguage: string) {
    // Cut by code points so an emoji or surrogate pair is never split in half
    const chars = Array.from(text);
    const clipped = chars.length > TRANSLATE_MAX_CHARS ? chars.slice(0, TRANSLATE_MAX_CHARS).join("") : text;
    return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(targetLanguage)}&text=${encodeURIComponent(clipped)}&op=translate`;
}
