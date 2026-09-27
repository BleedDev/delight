/**
 * Pure logic for Inline Translate, unit tested in tests/inlineTranslate.test.ts. Nothing here
 * touches Discord or the network: the renderer (index.tsx) and the main process (native.ts) both use it.
 */

// --- Languages ---------------------------------------------------------------------------------

/** Codes Google still answers with, mapped to the current ISO ones users type */
const ALIASES: Record<string, string> = { iw: "he", jw: "jv", in: "id", ji: "yi", fil: "tl", nb: "no" };

/** "en-US" -> "en", "IW" -> "he", "zh-tw" -> "zh-TW", "zh" -> "zh-CN". Undefined when it isn't a language code. */
export function normalizeLanguage(code: string | undefined | null): string | undefined {
    if (!code) return;
    const m = /^([a-z]{2,3})(?:[-_]([a-z]{2,4}))?$/i.exec(code.trim());
    if (!m) return;
    const base = m[1].toLowerCase();
    if (base === "zh") {
        const region = m[2]?.toUpperCase();
        return region === "TW" || region === "HK" || region === "MO" || region === "HANT" ? "zh-TW" : "zh-CN";
    }
    return ALIASES[base] ?? base;
}

/** Google Translate's language for a Discord / browser locale ("en-US" -> "en", "zh-TW" stays) */
export function googleLanguage(locale: string | undefined | null): string {
    return normalizeLanguage(locale) ?? "en";
}

/** Same language for the purpose of "do I need this translated": zh-CN and zh-TW differ, en-GB and en-US don't */
export function sameLanguage(a: string | undefined, b: string | undefined) {
    const x = normalizeLanguage(a);
    const y = normalizeLanguage(b);
    return !!x && x === y;
}

/** "es, ja; DE  pt-BR" -> ["es", "ja", "de", "pt"]. Anything that isn't a language code is ignored. */
export function parseLanguageList(input: string | undefined | null): string[] {
    const out: string[] = [];
    for (const part of (input ?? "").split(/[\s,;|/]+/)) {
        const code = normalizeLanguage(part);
        if (code && !out.includes(code)) out.push(code);
    }
    return out;
}

/** "es" -> "Spanish" in the UI language, falling back to the code */
export function languageName(code: string, uiLocale?: string): string {
    try {
        const name = new Intl.DisplayNames(uiLocale ? [uiLocale] : undefined, { type: "language" }).of(normalizeLanguage(code) ?? code);
        if (name && name !== code) return name;
    } catch { /* unknown code or no Intl.DisplayNames */ }
    return code;
}

// --- Google's response -------------------------------------------------------------------------

export interface Translation {
    text: string;
    /** Language Google detected, normalized ("es", "zh-CN") */
    source: string;
}

/**
 * translate_a/single?client=gtx&dt=t answers
 * `[[["Hola ","Hello ",null,null,10],["mundo","world",...]], null, "en", ...]`:
 * translated segments first, the detected source language third (and again in [8][0][0]).
 */
export function parseGoogleResponse(data: unknown): Translation {
    if (!Array.isArray(data)) throw new Error("Unexpected answer from Google Translate");
    const segments = Array.isArray(data[0]) ? data[0] : [];
    const text = segments
        .map(s => (Array.isArray(s) && typeof s[0] === "string" ? s[0] : ""))
        .join("");
    const detected = typeof data[2] === "string" ? data[2] : Array.isArray(data[8]) && Array.isArray(data[8][0]) ? data[8][0][0] : undefined;
    const source = normalizeLanguage(typeof detected === "string" ? detected : undefined);
    if (!source) throw new Error("Google Translate didn't say which language it detected");
    return { text, source };
}

export const TRANSLATE_ORIGIN = "https://translate.googleapis.com";

export function translateUrl(text: string, target: string) {
    return `${TRANSLATE_ORIGIN}/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
}

/** URL-encoded characters per request, well under what Google accepts in a GET */
export const MAX_ENCODED_CHUNK = 6000;

const encodedLength = (s: string) => encodeURIComponent(s).length;

/**
 * Splits long text for several requests, at line breaks first, then after sentences, then
 * spaces, and only as a last resort in the middle of a word (never inside a surrogate pair).
 * Joining the chunks gives the input back.
 */
export function chunkText(text: string, maxEncoded = MAX_ENCODED_CHUNK): string[] {
    if (encodedLength(text) <= maxEncoded) return [text];
    const chunks: string[] = [];
    let rest = text;
    while (rest && encodedLength(rest) > maxEncoded) {
        // Longest prefix (by code points) that fits
        const chars = Array.from(rest);
        let fit = 0;
        let size = 0;
        while (fit < chars.length) {
            const next = encodedLength(chars[fit]);
            if (size + next > maxEncoded) break;
            size += next;
            fit++;
        }
        const prefix = chars.slice(0, Math.max(fit, 1)).join("");
        let cut = -1;
        for (const re of [/\n(?!.*\n)/s, /[.!?。！？](?=\s)(?!.*[.!?。！？]\s)/s, /\s(?!.*\s)/s]) {
            const m = re.exec(prefix);
            if (m && m.index > 0) {
                cut = m.index + m[0].length;
                break;
            }
        }
        const piece = cut > 0 ? prefix.slice(0, cut) : prefix;
        chunks.push(piece);
        rest = rest.slice(piece.length);
    }
    if (rest) chunks.push(rest);
    return chunks;
}

// --- What to translate -------------------------------------------------------------------------

/**
 * Parts of a message that must come back untouched: code, links, mentions, channels, roles,
 * custom emoji, timestamps, slash command mentions, :emoji: shortcodes, @everyone / @here.
 */
const PROTECTED = new RegExp(
    [
        "```[\\s\\S]*?```",
        "`[^`\\n]+`",
        "<https?:\\/\\/[^\\s>]+>",
        "https?:\\/\\/[^\\s<>]+",
        "<(?:@[!&]?|#)\\d+>",
        "<a?:\\w+:\\d+>",
        "<t:-?\\d+(?::[tTdDfFR])?>",
        "<\\/[\\w -]+:\\d+>",
        "<id:\\w+>",
        ":[\\w+-]+:",
        "@(?:everyone|here)\\b",
    ].join("|"),
    "g",
);

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3]/gu;
const PLACEHOLDER = (i: number) => `⟦${i}⟧`;
const PLACEHOLDER_RE = /⟦\s*(\d+)\s*⟧/g;

export interface Protected {
    text: string;
    tokens: string[];
}

/** Swaps protected parts for ⟦0⟧, ⟦1⟧… markers Google leaves alone */
export function protect(text: string): Protected {
    const tokens: string[] = [];
    const out = text.replace(PROTECTED, token => {
        tokens.push(token);
        return PLACEHOLDER(tokens.length - 1);
    });
    return { text: out, tokens };
}

/** Puts protected parts back. Any marker Google dropped is appended, so code and links are never lost. */
export function restore(translated: string, tokens: string[]): string {
    const used = new Set<number>();
    let out = translated.replace(PLACEHOLDER_RE, (whole, n) => {
        const i = Number(n);
        if (!(i in tokens)) return whole;
        used.add(i);
        return tokens[i];
    });
    const missing = tokens.filter((_, i) => !used.has(i));
    if (missing.length) out = [out.trimEnd(), ...missing].join(missing.some(t => t.startsWith("```")) ? "\n" : " ");
    return out;
}

/** The words of a message, without code, links, mentions, emoji, markdown and punctuation */
export function translatableText(text: string): string {
    return text
        .replace(PROTECTED, " ")
        .replace(EMOJI, " ")
        .replace(/[^\p{L}\p{M}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Worth sending: at least two letters once code blocks, links, mentions and emoji are gone */
export function isTranslatable(text: string | undefined | null): boolean {
    if (!text) return false;
    return (translatableText(text).match(/\p{L}/gu)?.length ?? 0) >= 2;
}

// --- Scripts: cheap hints before asking Google ---------------------------------------------------

type Script = "latin" | "cyrillic" | "greek" | "arabic" | "hebrew" | "cjk" | "japanese" | "hangul" | "thai" | "devanagari" | "other";

const SCRIPT_TESTS: [Exclude<Script, "latin" | "other">, RegExp][] = [
    ["japanese", /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
    ["hangul", /\p{Script=Hangul}/u],
    ["cjk", /\p{Script=Han}/u],
    ["cyrillic", /\p{Script=Cyrillic}/u],
    ["greek", /\p{Script=Greek}/u],
    ["arabic", /\p{Script=Arabic}/u],
    ["hebrew", /\p{Script=Hebrew}/u],
    ["thai", /\p{Script=Thai}/u],
    ["devanagari", /\p{Script=Devanagari}/u],
];

const LANGUAGE_SCRIPTS: Record<string, Script[]> = {
    ja: ["japanese", "cjk"], "zh-CN": ["cjk"], "zh-TW": ["cjk"], ko: ["hangul", "cjk"],
    ru: ["cyrillic"], uk: ["cyrillic"], bg: ["cyrillic"], be: ["cyrillic"], mk: ["cyrillic"], kk: ["cyrillic"], ky: ["cyrillic"], mn: ["cyrillic"], sr: ["cyrillic", "latin"], tg: ["cyrillic"],
    el: ["greek"], ar: ["arabic"], fa: ["arabic"], ur: ["arabic"], ps: ["arabic"], he: ["hebrew"], yi: ["hebrew"], th: ["thai"],
    hi: ["devanagari"], mr: ["devanagari"], ne: ["devanagari"],
};

/** Non-Latin scripts are only listed for the languages above; undefined means Latin or unknown */
const scriptsOf = (language: string): Script[] | undefined => LANGUAGE_SCRIPTS[language];

/** Which scripts the letters of a text use */
export function scriptsIn(text: string): Set<Script> {
    const found = new Set<Script>();
    for (const ch of translatableText(text)) {
        if (!/\p{L}/u.test(ch)) continue;
        if (/\p{Script=Latin}/u.test(ch)) found.add("latin");
        else found.add(SCRIPT_TESTS.find(([, re]) => re.test(ch))?.[0] ?? "other");
    }
    return found;
}

/**
 * Could this text be in one of these languages? Only says no when it certainly isn't: a list of
 * only Japanese and Korean can't match a message written in Latin letters. Languages whose script
 * isn't known (most Latin ones) always might.
 */
export function mightBeIn(text: string, languages: string[]): boolean {
    const present = scriptsIn(text);
    if (!present.size) return false;
    return languages.some(lang => {
        const scripts = scriptsOf(lang);
        if (!scripts) return present.has("latin") || present.has("other");
        return scripts.some(s => present.has(s));
    });
}

/**
 * Could this text need translating to `target`? No when every letter is in a script only the
 * target language uses (Korean for a Korean reader, Greek for a Greek one...).
 */
export function mightBeForeign(text: string, target: string): boolean {
    const present = scriptsIn(text);
    if (!present.size) return false;
    const unique: Partial<Record<string, Script>> = { ko: "hangul", el: "greek", th: "thai", he: "hebrew" };
    const own = unique[normalizeLanguage(target) ?? ""];
    return !(own && present.size === 1 && present.has(own));
}

// --- Automatic mode ----------------------------------------------------------------------------

export type AutoMode = "off" | "list" | "foreign";

export interface AutoOptions {
    mode: AutoMode;
    /** Parsed "Languages to translate" list, for mode "list" */
    languages: string[];
    target: string;
    currentUserId: string | undefined;
    ignoreBots: boolean;
}

export interface MessageLike {
    id?: string;
    content?: unknown;
    type?: number;
    author?: { id?: string; bot?: boolean; } | null;
}

/** Default messages and replies; not joins, pins, calls or other system messages */
const TRANSLATABLE_TYPES = new Set([0, 19, 20, 21, 23]);

/** Whether to ask Google about a message at all, before knowing its language */
export function shouldAutoTranslate(message: MessageLike, options: AutoOptions): boolean {
    if (options.mode === "off" || !message?.id) return false;
    if (options.mode === "list" && !options.languages.length) return false;
    if (typeof message.content !== "string" || !isTranslatable(message.content)) return false;
    if (message.type != null && !TRANSLATABLE_TYPES.has(message.type)) return false;
    const author = message.author;
    if (!author?.id || author.id === options.currentUserId) return false;
    if (options.ignoreBots && author.bot) return false;
    return options.mode === "list"
        ? mightBeIn(message.content, options.languages)
        : mightBeForeign(message.content, options.target);
}

/** Whether an automatic translation is worth showing once Google said what the language was */
export function shouldShowAuto(result: Translation, original: string, options: Pick<AutoOptions, "mode" | "languages" | "target">): boolean {
    if (options.mode === "off") return false;
    if (sameLanguage(result.source, options.target)) return false;
    if (options.mode === "list" && !options.languages.some(l => sameLanguage(l, result.source))) return false;
    // Names, laughter, "ok": Google gives the same thing back
    return normalizeForCompare(result.text) !== normalizeForCompare(original);
}

const normalizeForCompare = (s: string) => s.toLocaleLowerCase().replace(/[\s\p{P}]+/gu, "");

// --- Cache -------------------------------------------------------------------------------------

/** A Map that forgets its least recently used entries past `capacity` */
export class LRU<K, V> {
    private map = new Map<K, V>();
    constructor(readonly capacity: number) {}

    get size() {
        return this.map.size;
    }

    get(key: K): V | undefined {
        if (!this.map.has(key)) return;
        const value = this.map.get(key)!;
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }

    /** Without refreshing the entry */
    peek(key: K): V | undefined {
        return this.map.get(key);
    }

    has(key: K) {
        return this.map.has(key);
    }

    set(key: K, value: V) {
        this.map.delete(key);
        this.map.set(key, value);
        while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as K);
        return this;
    }

    delete(key: K) {
        return this.map.delete(key);
    }

    clear() {
        this.map.clear();
    }

    keys() {
        return this.map.keys();
    }
}

export const cacheKey = (messageId: string, target: string) => `${messageId}:${target}`;

// --- Queue -------------------------------------------------------------------------------------

interface Job {
    key: string;
    run: () => Promise<unknown>;
}

/**
 * Runs jobs one at a time, at most one start per `interval` ms. Past `maxPending` waiting jobs the
 * oldest is dropped (its `onDrop` is told), so scrolling through history favours what's on screen
 * now. Urgent jobs (the user clicked Translate) go first and are never dropped. A job already
 * queued under the same key isn't added twice.
 */
export class RateQueue {
    private pending: (Job & { urgent: boolean; })[] = [];
    private running = false;
    private lastStart = -Infinity;
    private pausedUntil = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private stopped = false;

    constructor(
        private readonly interval: number,
        private readonly maxPending: number,
        private readonly onDrop: (key: string) => void = () => {},
        private readonly now: () => number = Date.now,
    ) {}

    get size() {
        return this.pending.length;
    }

    has(key: string) {
        return this.pending.some(j => j.key === key);
    }

    add(key: string, run: () => Promise<unknown>, urgent = false) {
        if (this.stopped) return;
        const existing = this.pending.findIndex(j => j.key === key);
        if (existing !== -1) {
            if (!urgent || this.pending[existing].urgent) return;
            this.pending.splice(existing, 1);
        }
        const job = { key, run, urgent };
        if (urgent) {
            const firstNormal = this.pending.findIndex(j => !j.urgent);
            this.pending.splice(firstNormal === -1 ? this.pending.length : firstNormal, 0, job);
        } else {
            this.pending.push(job);
            while (this.pending.filter(j => !j.urgent).length > this.maxPending) {
                const oldest = this.pending.findIndex(j => !j.urgent);
                const [dropped] = this.pending.splice(oldest, 1);
                this.onDrop(dropped.key);
            }
        }
        this.schedule();
    }

    /** Stop starting jobs for a while, after Google said "too many requests" */
    pause(ms: number) {
        this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
        this.schedule();
    }

    /** Drops everything waiting and never runs again */
    stop() {
        this.stopped = true;
        clearTimeout(this.timer);
        for (const job of this.pending.splice(0)) this.onDrop(job.key);
    }

    private schedule() {
        if (this.stopped || this.running || !this.pending.length) return;
        clearTimeout(this.timer);
        const wait = Math.max(this.lastStart + this.interval, this.pausedUntil) - this.now();
        if (wait > 0) {
            this.timer = setTimeout(() => this.schedule(), wait);
            return;
        }
        const job = this.pending.shift()!;
        this.running = true;
        this.lastStart = this.now();
        job.run().catch(() => {}).finally(() => {
            this.running = false;
            this.schedule();
        });
    }
}
