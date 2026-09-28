/**
 * Streamer Mode+: blurs the parts of Discord that give away who you talk to and where, while you
 * stream. It's all CSS keyed on classes on <body>, so it costs nothing per message and doesn't
 * depend on any component being patched.
 *
 * - Streaming: ApplicationStreamingStore.getCurrentUserActiveStream() is your own Go Live / screen
 *   share, null otherwise. Discord's own Streamer Mode is StreamerModeStore.enabled.
 * - Both stores emit changes, and so does SelectedChannelStore (for "message content in DMs", which
 *   only applies while a DM is open); each change re-evaluates and updates the body classes.
 * - /streamerplus and the hotkey flip it by hand. That holds until the automatic state changes
 *   (you start or stop streaming), then the activation mode takes over again.
 */
import { definePlugin, findStore } from "@evi/api";
import type { PluginContext } from "@evi/api";

import {
    ALL_CLASSES, autoActive, bodyClasses, buildCss, migrateHotkey, shouldActivate, toggledOverride,
} from "./state";
import { t } from "./strings";
import type { ActivationMode, BlurOptions, LiveState, Override } from "./state";

const settings = {
    mode: {
        type: "select",
        get label() { return t("settings.mode"); },
        get description() { return t("settings.mode.description"); },
        default: "either",
        options: [
            { get label() { return t("mode.either"); }, value: "either" },
            { get label() { return t("mode.streaming"); }, value: "streaming" },
            { get label() { return t("mode.streamerMode"); }, value: "streamerMode" },
            { get label() { return t("mode.always"); }, value: "always" },
        ],
    },
    hotkey: {
        type: "keybind",
        get label() { return t("settings.hotkey"); },
        get description() { return t("settings.hotkey.description"); },
        default: "Ctrl+Shift+KeyS",
    },
    hoverReveal: {
        type: "boolean",
        get label() { return t("settings.hoverReveal"); },
        get description() { return t("settings.hoverReveal.description"); },
        default: true,
    },
    blur: {
        type: "number",
        get label() { return t("settings.blur"); },
        get description() { return t("settings.blur.description"); },
        default: 8,
        min: 2,
        max: 30,
        step: 1,
    },
    toasts: {
        type: "boolean",
        get label() { return t("settings.toasts"); },
        get description() { return t("settings.toasts.description"); },
        default: true,
    },
    dms: {
        type: "boolean",
        get label() { return t("settings.dms"); },
        get description() { return t("settings.dms.description"); },
        default: true,
    },
    servers: {
        type: "boolean",
        get label() { return t("settings.servers"); },
        get description() { return t("settings.servers.description"); },
        default: true,
    },
    channels: {
        type: "boolean",
        get label() { return t("settings.channels"); },
        get description() { return t("settings.channels.description"); },
        default: false,
    },
    media: {
        type: "boolean",
        get label() { return t("settings.media"); },
        get description() { return t("settings.media.description"); },
        default: true,
    },
    chatAvatars: {
        type: "boolean",
        get label() { return t("settings.chatAvatars"); },
        get description() { return t("settings.chatAvatars.description"); },
        default: false,
    },
    members: {
        type: "boolean",
        get label() { return t("settings.members"); },
        get description() { return t("settings.members.description"); },
        default: false,
    },
    dmContent: {
        type: "boolean",
        get label() { return t("settings.dmContent"); },
        get description() { return t("settings.dmContent.description"); },
        default: false,
    },
} as const;

type Settings = typeof settings;

let context: PluginContext<Settings> | undefined;
let override: Override = null;
let lastAuto: boolean | undefined;
let lastActive = false;
let applied: string[] = [];

function liveState(): LiveState {
    let streaming = false;
    let streamerMode = false;
    try {
        streaming = findStore("ApplicationStreamingStore")?.getCurrentUserActiveStream?.() != null;
    } catch { }
    try {
        streamerMode = !!findStore("StreamerModeStore")?.enabled;
    } catch { }
    return { streaming, streamerMode };
}

function inDm(): boolean {
    try {
        const id = findStore("SelectedChannelStore")?.getChannelId?.();
        if (!id) return false;
        const channel = findStore("ChannelStore")?.getChannel?.(id);
        // DM = 1, GROUP_DM = 3
        return channel?.type === 1 || channel?.type === 3 || !!channel?.isPrivate?.();
    } catch {
        return false;
    }
}

function options(): BlurOptions {
    const s = context!.settings.all;
    return {
        dms: s.dms, servers: s.servers, channels: s.channels, media: s.media,
        chatAvatars: s.chatAvatars, members: s.members, dmContent: s.dmContent, hoverReveal: s.hoverReveal,
    };
}

function applyClasses(classes: string[]) {
    const body = document.body;
    for (const c of applied) if (!classes.includes(c)) body.classList.remove(c);
    // Only what's missing: re-writing <body>'s class on every channel switch or stream update made
    // the browser check the whole page's styles again for nothing
    for (const c of classes) if (!body.classList.contains(c)) body.classList.add(c);
    applied = classes;
}

/** Re-evaluates and updates <body>. `manual` means the user just toggled it. */
function update(manual = false, quiet = false) {
    if (!context) return;
    const mode = context.settings.get("mode") as ActivationMode;
    const state = liveState();
    const auto = autoActive(mode, state);

    // A manual toggle lasts until the automatic state flips
    if (lastAuto !== undefined && auto !== lastAuto) override = null;
    const autoChanged = lastAuto !== undefined && auto !== lastAuto;
    lastAuto = auto;

    const active = shouldActivate(mode, state, override);
    applyClasses(bodyClasses(active, options(), inDm()));

    if (active !== lastActive && !quiet) {
        if (manual) context.toast(transitionMessage(active, "manual"), { type: "info" });
        else if (autoChanged && context.settings.get("toasts")) context.toast(transitionMessage(active, reasonFor(mode, state)), { type: "info" });
    }
    lastActive = active;
}

/** "Streamer Mode+ on: you're streaming", in Discord's language */
function transitionMessage(active: boolean, reason: "manual" | "streaming" | "streamerMode") {
    return t(`toast.${reason}.${active ? "on" : "off"}` as const);
}

function reasonFor(mode: ActivationMode, state: LiveState): "streaming" | "streamerMode" {
    if (mode === "streaming" || mode === "streamerMode") return mode;
    // "either": credit streaming if it's what is on now (or neither is, i.e. a stream just ended)
    return state.streaming || !state.streamerMode ? "streaming" : "streamerMode";
}

/** Flips blurring by hand. `quiet` skips the toast (the slash command replies instead). */
function toggle(quiet = false) {
    override = toggledOverride(lastActive);
    update(true, quiet);
    return lastActive;
}

export default definePlugin({
    settings,

    toggle,

    start(ctx) {
        context = ctx;
        override = null;
        lastAuto = undefined;
        lastActive = false;

        const style = ctx.addStyle(buildCss({ blur: ctx.settings.get("blur") }));
        ctx.settings.onChange(values => {
            style.update(buildCss({ blur: values.blur }));
            update();
        });

        const onChange = () => update();
        const watched = ["ApplicationStreamingStore", "StreamerModeStore", "SelectedChannelStore"]
            .map(name => findStore(name))
            .filter(Boolean);
        for (const store of watched) store.addChangeListener?.(onChange);
        ctx.onDispose(() => watched.forEach(store => store.removeChangeListener?.(onChange)));
        // In case a store wasn't loaded yet at start, or didn't emit
        for (const type of ["STREAM_START", "STREAM_STOP", "STREAM_DELETE", "STREAMER_MODE_UPDATE", "CHANNEL_SELECT"]) {
            ctx.flux.subscribe(type, () => queueMicrotask(onChange));
        }

        // A shortcut typed into the old text field becomes a recorded one
        const hotkey = ctx.settings.get("hotkey");
        const migrated = migrateHotkey(hotkey);
        if (migrated !== hotkey) ctx.settings.set("hotkey", migrated);
        ctx.keybind("hotkey", () => void toggle());

        ctx.command({
            name: "streamerplus",
            get description() { return t("command.description"); },
            execute() {
                const on = toggle(true);
                return { ephemeral: on ? t("command.on") : t("command.off") };
            },
        });

        ctx.onDispose(() => {
            for (const c of ALL_CLASSES) document.body.classList.remove(c);
            applied = [];
            context = undefined;
            override = null;
            lastAuto = undefined;
            lastActive = false;
        });

        update();
    },
});
