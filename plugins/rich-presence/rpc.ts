/**
 * Rich Presence Builder's presets and the activity each one becomes. Pure: no Discord, no DOM, so the
 * tests can check what's sent.
 *
 * A preset is what the editor shows; `toActivity` turns it into what Discord's local activity store
 * takes (the same shape a game's Rich Presence sends over RPC), with Discord's own length limits.
 * Pictures given as https links become `mp:` asset keys first, through Discord's external-assets
 * endpoint (index.tsx); `toActivity` gets those keys through `assets`.
 */

export const ACTIVITY_TYPES = ["playing", "listening", "watching", "competing", "streaming"] as const;
export type ActivityKind = typeof ACTIVITY_TYPES[number];
/** Discord's ActivityTypes */
export const TYPE_ID: Record<ActivityKind, number> = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 5 };

export const TIME_MODES = ["none", "elapsed", "localTime", "start", "end"] as const;
export type TimeMode = typeof TIME_MODES[number];

export interface Button { label: string; url: string; }

export interface Preset {
    id: string;
    /** What the preset's called in the editor, never sent */
    title: string;
    type: ActivityKind;
    name: string;
    details: string;
    state: string;
    /** Twitch or YouTube, for "streaming" */
    streamUrl: string;
    largeImage: string;
    largeText: string;
    smallImage: string;
    smallText: string;
    buttons: Button[];
    timeMode: TimeMode;
    /** For "start" and "end": a time as ms since 1970 */
    time: number;
    /** Party: "(1 of 4)" after the state. 0 for none */
    partySize: number;
    partyMax: number;
}

export interface PresetState {
    presets: Preset[];
    /** The preset shown on your profile, or "" for none */
    active: string;
}

/** Discord's limits */
export const LIMITS = { text: 128, button: 32, buttons: 2, url: 512, presets: 20, party: 999 };

export const EMPTY_STATE: PresetState = { presets: [], active: "" };

export function newPreset(id: string, title: string): Preset {
    return {
        id, title, type: "playing", name: "", details: "", state: "", streamUrl: "",
        largeImage: "", largeText: "", smallImage: "", smallText: "",
        buttons: [], timeMode: "elapsed", time: 0, partySize: 0, partyMax: 0,
    };
}

const str = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
const int = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => list.includes(v as T) ? v as T : fallback;

/** Saved state, or whatever's left of it that makes sense */
export function parseState(raw: unknown): PresetState {
    const value = typeof raw === "string" ? safeJson(raw) : raw;
    if (!value || typeof value !== "object") return EMPTY_STATE;
    const list = Array.isArray((value as any).presets) ? (value as any).presets.slice(0, LIMITS.presets) : [];
    const seen = new Set<string>();
    const presets: Preset[] = [];
    for (const p of list) {
        const id = str(p?.id, 40);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        presets.push({
            id,
            title: str(p.title, 60),
            type: oneOf(p.type, ACTIVITY_TYPES, "playing"),
            name: str(p.name, LIMITS.text),
            details: str(p.details, LIMITS.text),
            state: str(p.state, LIMITS.text),
            streamUrl: str(p.streamUrl, LIMITS.url),
            largeImage: str(p.largeImage, LIMITS.url),
            largeText: str(p.largeText, LIMITS.text),
            smallImage: str(p.smallImage, LIMITS.url),
            smallText: str(p.smallText, LIMITS.text),
            buttons: (Array.isArray(p.buttons) ? p.buttons : []).slice(0, LIMITS.buttons).map((b: any) => ({ label: str(b?.label, LIMITS.button), url: str(b?.url, LIMITS.url) })),
            timeMode: oneOf(p.timeMode, TIME_MODES, "elapsed"),
            time: typeof p.time === "number" && Number.isFinite(p.time) ? p.time : 0,
            partySize: int(p.partySize, LIMITS.party),
            partyMax: int(p.partyMax, LIMITS.party),
        });
    }
    const active = str((value as any).active, 40);
    return { presets, active: seen.has(active) ? active : "" };
}

function safeJson(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** An https link, or undefined */
export function httpsUrl(value: string): string | undefined {
    const text = value.trim();
    if (!text || text.length > LIMITS.url) return undefined;
    try {
        const url = new URL(text);
        return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

const STREAM_HOSTS = /^(?:www\.|m\.)?(?:twitch\.tv|youtube\.com|youtu\.be)$/i;
/** Discord only shows "Streaming" with a Twitch or YouTube link */
export const isStreamUrl = (value: string) => {
    const url = httpsUrl(value);
    return !!url && STREAM_HOSTS.test(new URL(url).hostname);
};

/**
 * A picture is either an https link (turned into an `mp:` key through Discord's external assets) or
 * the key of an art asset uploaded to the application (Rich Presence → Art Assets), sent as its id.
 */
export type ImageRef = { kind: "url"; url: string; } | { kind: "key"; key: string; };

const ASSET_KEY = /^(?:mp:\S{1,250}|[\w.-]{1,256})$/;

export function imageRef(value: string): ImageRef | undefined {
    const text = value.trim();
    if (!text) return undefined;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        const url = httpsUrl(text);
        return url ? { kind: "url", url } : undefined;
    }
    return ASSET_KEY.test(text) ? { kind: "key", key: text } : undefined;
}

/** Application IDs are snowflakes */
export const isAppId = (value: string) => /^\d{17,20}$/.test(value.trim());

export type Problem =
    | "noAppId" | "noName" | "badLargeImage" | "badSmallImage" | "badStreamUrl"
    | "buttonLabel" | "buttonUrl" | "badParty" | "noTime";

/** What's wrong with a preset, first problem first; nothing means it can be shown */
export function problems(p: Preset, appId: string, appName = ""): Problem[] {
    const out: Problem[] = [];
    if (!isAppId(appId)) out.push("noAppId");
    // Left empty, the application's own name shows, as for games
    if (!p.name.trim() && !appName.trim()) out.push("noName");
    if (p.largeImage.trim() && !imageRef(p.largeImage)) out.push("badLargeImage");
    if (p.smallImage.trim() && !imageRef(p.smallImage)) out.push("badSmallImage");
    if (p.type === "streaming" && !isStreamUrl(p.streamUrl)) out.push("badStreamUrl");
    for (const b of p.buttons) {
        if (!b.label.trim() && !b.url.trim()) continue;
        if (!b.label.trim()) out.push("buttonLabel");
        if (!httpsUrl(b.url)) out.push("buttonUrl");
    }
    if (p.partyMax > 0 && (p.partySize < 1 || p.partySize > p.partyMax)) out.push("badParty");
    if ((p.timeMode === "start" || p.timeMode === "end") && !p.time) out.push("noTime");
    return [...new Set(out)];
}

/** The https pictures a preset needs asset keys for (art asset keys need nothing) */
export const imageUrls = (p: Preset) => [p.largeImage, p.smallImage]
    .map(imageRef)
    .flatMap(ref => ref?.kind === "url" ? [ref.url] : []);

/** The art asset keys a preset uses: Discord sends their ids, looked up in the application's assets */
export const imageKeys = (p: Preset) => [p.largeImage, p.smallImage]
    .map(imageRef)
    .flatMap(ref => ref?.kind === "key" && !ref.key.startsWith("mp:") ? [ref.key] : []);

/** Where `assets` keeps an art asset key's id, next to the links' `mp:` keys */
export const keySlot = (key: string) => `key:${key.toLowerCase()}`;

/**
 * What to send for a picture, as Discord's RPC server does for games: a link becomes its `mp:` key,
 * an art asset key becomes that asset's id. One that couldn't be resolved is left out.
 */
function assetFor(value: string, assets: Record<string, string>): string | undefined {
    const ref = imageRef(value);
    if (!ref) return undefined;
    if (ref.kind === "url") return assets[ref.url] || undefined;
    return ref.key.startsWith("mp:") ? ref.key : assets[keySlot(ref.key)] || undefined;
}

/** Start of today, local time: "elapsed" from midnight reads as the time of day */
export function startOfDay(now: number) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

export interface ActivityTimes {
    /** When the preset went on: "elapsed" counts from here */
    since: number;
    now: number;
}

/**
 * What Discord's local activity store takes for `p`. `assets` maps each https picture to its asset
 * key (`mp:external/…`); a picture without one is left out rather than sent as a link Discord can't show.
 * With no name, the application's own (`appName`) shows, like Discord's RPC server does for games.
 */
export function toActivity(p: Preset, appId: string, times: ActivityTimes, assets: Record<string, string>, appName = ""): Record<string, unknown> {
    const text = (v: string) => v.trim().slice(0, LIMITS.text) || undefined;
    const activity: Record<string, unknown> = {
        application_id: appId.trim(),
        name: text(p.name) ?? text(appName),
        type: TYPE_ID[p.type],
        flags: 1, // INSTANCE, like a game's own presence
    };
    const details = text(p.details), state = text(p.state);
    if (details) activity.details = details;
    if (state) activity.state = state;
    if (p.type === "streaming" && isStreamUrl(p.streamUrl)) activity.url = httpsUrl(p.streamUrl);

    const timestamps = timesFor(p, times);
    if (timestamps) activity.timestamps = timestamps;

    const large = assetFor(p.largeImage, assets), small = assetFor(p.smallImage, assets);
    const assetsOut: Record<string, string> = {};
    if (large) {
        assetsOut.large_image = large;
        const largeText = text(p.largeText);
        if (largeText) assetsOut.large_text = largeText;
    }
    if (small) {
        assetsOut.small_image = small;
        const smallText = text(p.smallText);
        if (smallText) assetsOut.small_text = smallText;
    }
    if (Object.keys(assetsOut).length) activity.assets = assetsOut;

    const buttons = p.buttons
        .map(b => ({ label: b.label.trim().slice(0, LIMITS.button), url: httpsUrl(b.url) }))
        .filter((b): b is Button => !!b.label && !!b.url)
        .slice(0, LIMITS.buttons);
    if (buttons.length) {
        activity.buttons = buttons.map(b => b.label);
        activity.metadata = { button_urls: buttons.map(b => b.url) };
    }

    if (p.partyMax > 0 && p.partySize >= 1 && p.partySize <= p.partyMax) {
        activity.party = { id: `evi-${p.id}`, size: [p.partySize, p.partyMax] };
    }
    return activity;
}

function timesFor(p: Preset, { since, now }: ActivityTimes): { start?: number; end?: number; } | undefined {
    switch (p.timeMode) {
        case "elapsed": return { start: since };
        case "localTime": return { start: startOfDay(now) };
        case "start": return p.time ? { start: p.time } : undefined;
        // A countdown that's over shows nothing rather than a negative time
        case "end": return p.time > now ? { end: p.time } : undefined;
        default: return undefined;
    }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "1:02:03" or "02:03", like Discord's activity timer */
export function formatTimer(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The value for an <input type="datetime-local">, in local time */
export function toLocalInput(ms: number) {
    if (!ms) return "";
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string) {
    const ms = value ? new Date(value).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
}
