/**
 * Pure logic for Streamer Mode+: when to activate, which classes go on <body>, and the stylesheet.
 * Nothing here touches Discord or the DOM, so it can be tested on its own.
 */

export type ActivationMode = "streaming" | "streamerMode" | "either" | "always";

export interface LiveState {
    /** You're screen sharing / Go Live (ApplicationStreamingStore has an active stream of yours) */
    streaming: boolean;
    /** Discord's own Streamer Mode is on (StreamerModeStore.enabled) */
    streamerMode: boolean;
}

/** Set by /streamerplus or the hotkey; null means follow the activation mode */
export type Override = "on" | "off" | null;

export function autoActive(mode: ActivationMode, state: LiveState): boolean {
    switch (mode) {
        case "always": return true;
        case "streaming": return state.streaming;
        case "streamerMode": return state.streamerMode;
        case "either": return state.streaming || state.streamerMode;
        default: return false;
    }
}

export function shouldActivate(mode: ActivationMode, state: LiveState, override: Override = null): boolean {
    if (override === "on") return true;
    if (override === "off") return false;
    return autoActive(mode, state);
}

/** What the toggle sets: the opposite of what's showing now */
export function toggledOverride(currentlyActive: boolean): Override {
    return currentlyActive ? "off" : "on";
}

export interface BlurOptions {
    dms: boolean;
    servers: boolean;
    channels: boolean;
    media: boolean;
    chatAvatars: boolean;
    members: boolean;
    dmContent: boolean;
    hoverReveal: boolean;
}

export type BlurKey = Exclude<keyof BlurOptions, "hoverReveal">;

export const PREFIX = "evi-smp";
export const ACTIVE_CLASS = `${PREFIX}-active`;
export const IN_DM_CLASS = `${PREFIX}-in-dm`;
export const HOVER_CLASS = `${PREFIX}-hover`;

export const optionClass = (key: BlurKey) => `${PREFIX}-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

const BLUR_KEYS: BlurKey[] = ["dms", "servers", "channels", "media", "chatAvatars", "members", "dmContent"];

/** Every class this plugin may put on <body>, for cleanup */
export const ALL_CLASSES = [ACTIVE_CLASS, IN_DM_CLASS, HOVER_CLASS, ...BLUR_KEYS.map(optionClass)];

/** The classes <body> should have right now */
export function bodyClasses(active: boolean, options: BlurOptions, inDm: boolean): string[] {
    if (!active) return [];
    const classes = [ACTIVE_CLASS];
    for (const key of BLUR_KEYS) if (options[key]) classes.push(optionClass(key));
    if (options.hoverReveal) classes.push(HOVER_CLASS);
    if (inDm && options.dmContent) classes.push(IN_DM_CLASS);
    return classes;
}

/**
 * Selectors per option. Mostly attributes Discord's own code sets and doesn't hash: list navigator
 * ids (`${listId}___${itemId}`), element ids built from message ids, and hrefs. Class prefixes
 * (Discord's CSS modules are `name_hash`) are the fallback, matched with [class*="name_"].
 */
export const SELECTORS: Record<BlurKey, string[]> = {
    // DM rows (avatar, name, last-message preview). Friends/Nitro/Shop links go to /channels/@me or
    // elsewhere, so only rows linking to a specific DM match.
    dms: [
        "a[data-list-item-id^=\"private-channels-\"][href^=\"/channels/@me/\"]",
        "[class*=\"privateChannels_\"] li:has(a[href^=\"/channels/@me/\"])",
        // Voice call and ringing DM avatars at the top of the server list
        "[data-list-item-id^=\"guildsnav___\"][href^=\"/channels/@me/\"]",
    ],
    servers: [
        "[data-list-item-id^=\"guildsnav___\"]:not([data-list-item-id=\"guildsnav___home\"]):not([data-list-item-id=\"guildsnav___create-join-button\"]):not([data-list-item-id=\"guildsnav___guild-discover-button\"]):not([href^=\"/channels/@me\"])",
        "[class*=\"guildHeader_\"] [class*=\"name_\"]",
        "[class*=\"guildBadgeAndName_\"]",
        "[class*=\"bannerImage_\"]",
        "[class*=\"communityInfo_\"]",
    ],
    channels: [
        "[data-list-item-id^=\"channels___\"]",
        "section[class*=\"title_\"] h1",
        "[class*=\"titleWrapper_\"]",
    ],
    media: [
        "[id^=\"message-accessories-\"] [class*=\"visualMediaItemContainer_\"]",
        "[id^=\"message-accessories-\"] [class*=\"nonVisualMediaItemContainer_\"]",
        "[id^=\"message-accessories-\"] [class*=\"imageWrapper_\"]",
        "[id^=\"message-accessories-\"] [class*=\"embedWrapper_\"]",
        "[id^=\"message-accessories-\"] article",
        "[id^=\"message-accessories-\"] video",
        "[id^=\"message-accessories-\"] [class*=\"clickableSticker_\"]",
        "img[src*=\"cdn.discordapp.com/attachments/\"]",
        "img[src*=\"media.discordapp.net/attachments/\"]",
        "img[src*=\"images-ext-\"][src*=\".discordapp.net/external/\"]",
        "video[src*=\"cdn.discordapp.com/attachments/\"]",
    ],
    chatAvatars: [
        "li[id^=\"chat-messages-\"] img[class*=\"avatar_\"]",
        "li[id^=\"chat-messages-\"] [class*=\"replyAvatar_\"]",
        "li[id^=\"chat-messages-\"] [class*=\"avatarDecoration_\"]",
    ],
    members: [
        "[data-list-item-id^=\"members-\"]",
        "[class*=\"membersWrap_\"] [class*=\"member_\"]",
        "[class*=\"voiceUser_\"]",
    ],
    // Only while a DM is open (body.evi-smp-in-dm), so server chat stays readable
    dmContent: [
        "[id^=\"message-content-\"]",
        "[id^=\"message-username-\"]",
        "[id^=\"message-reply-context-\"]",
        "li[id^=\"chat-messages-\"] img[class*=\"avatar_\"]",
    ],
};

export interface CssOptions {
    /** Blur radius in px */
    blur: number;
}

const clampBlur = (px: number) => Number.isFinite(px) ? Math.min(Math.max(Math.round(px), 1), 40) : 8;

/**
 * The whole stylesheet. It's inert until <body> has evi-smp-active, and each option's rules only
 * apply with that option's class, so toggling is a class change, not a stylesheet rewrite.
 */
export function buildCss({ blur }: CssOptions): string {
    const px = clampBlur(blur);
    const rules: string[] = [];
    const all: string[] = [];

    for (const key of BLUR_KEYS) {
        const scope = key === "dmContent"
            ? `body.${ACTIVE_CLASS}.${optionClass(key)}.${IN_DM_CLASS}`
            : `body.${ACTIVE_CLASS}.${optionClass(key)}`;
        const group = `:is(${SELECTORS[key].join(", ")})`;
        // Skip elements inside another blurred element of the same group, so blurs don't stack
        const target = `${scope} ${group}:not(${group} *)`;
        all.push(target);
        rules.push(`${target} { filter: blur(${px}px); }`);
        rules.push(`body.${HOVER_CLASS}${scope.slice(4)} ${group}:not(${group} *):is(:hover, :focus-within) { filter: none; }`);
    }

    return [
        `/* Streamer Mode+ */`,
        `:is(${all.join(", ")}) { transition: filter 0.18s ease-out; will-change: filter; }`,
        ...rules,
        `@media (prefers-reduced-motion: reduce) { :is(${all.join(", ")}) { transition: none; } }`,
    ].join("\n");
}

export interface Hotkey {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
    key: string;
}

/** Parses the "Ctrl+Shift+S" typed into the old Hotkey text field. Undefined for an empty or modifier-only one. */
export function parseHotkey(input: string): Hotkey | undefined {
    const parts = input.split("+").map(p => p.trim()).filter(Boolean);
    const hotkey: Hotkey = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
    for (const part of parts) {
        const p = part.toLowerCase();
        if (p === "ctrl" || p === "control") hotkey.ctrl = true;
        else if (p === "shift") hotkey.shift = true;
        else if (p === "alt" || p === "option") hotkey.alt = true;
        else if (p === "meta" || p === "cmd" || p === "command" || p === "win" || p === "super") hotkey.meta = true;
        else if (!hotkey.key) hotkey.key = p === "space" ? " " : p;
        else return undefined;
    }
    return hotkey.key ? hotkey : undefined;
}

/**
 * The shortcut setting before 1.1.0 was typed in ("Ctrl+Shift+S", "alt+f9"); Evi's shortcut field
 * stores physical keys ("Ctrl+Shift+KeyS"). Returns the stored form of an old value, the value itself
 * if it's already one, and "" for what can't be carried over.
 */
export function migrateHotkey(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return "";
    // Already recorded: every key code is longer than one character, and modifiers are spelled Evi's way
    const parts = value.split("+");
    const code = parts.at(-1)!;
    const modifiers = ["Ctrl", "Alt", "Shift", "Meta"];
    if (code.length > 1 && /^[A-Z]/.test(code) && !modifiers.includes(code) && parts.slice(0, -1).every(m => modifiers.includes(m))) return value;

    const old = parseHotkey(value);
    if (!old) return "";
    let key: string | undefined;
    if (/^[a-z]$/.test(old.key)) key = `Key${old.key.toUpperCase()}`;
    else if (/^[0-9]$/.test(old.key)) key = `Digit${old.key}`;
    else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(old.key)) key = old.key.toUpperCase();
    else if (old.key === " ") key = "Space";
    if (!key) return "";
    return [old.ctrl && "Ctrl", old.alt && "Alt", old.shift && "Shift", old.meta && "Meta", key].filter(Boolean).join("+");
}

/** The toast when blurring turns on or off by itself */
export function transitionMessage(active: boolean, reason: "streaming" | "streamerMode" | "manual"): string {
    if (reason === "manual") return active ? "Streamer Mode+ on" : "Streamer Mode+ off";
    const why = reason === "streaming" ? "you're streaming" : "Streamer Mode is on";
    const stopped = reason === "streaming" ? "stream ended" : "Streamer Mode is off";
    return active ? `Streamer Mode+ on: ${why}` : `Streamer Mode+ off: ${stopped}`;
}
