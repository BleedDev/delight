import { Components, definePlugin, find, findStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { t } from "./strings";

import { PATCHES, readShowCurrentGame } from "./toggle";

/**
 * "Share my activity" is the showCurrentGame user setting (status.showCurrentGame in the
 * PreloadedUserSettings proto). Source patches:
 *  - capture Discord's own setting object ({ getSetting, updateSetting, useSetting }) when its
 *    module defines it, so writes go through the same path as the settings page;
 *  - put a gamepad button first in the user panel's button row, left of mute and deafen.
 *
 * The button reads the setting on every UserSettingsProtoStore change, so flipping it in
 * Discord's settings (or on another device) updates the icon too. If the setting object wasn't
 * captured (module already ran), it falls back to the store for reads and to the
 * PreloadedUserSettings action creator for writes.
 */

interface DiscordSetting<T> {
    getSetting(): T;
    updateSetting(value: T): Promise<unknown>;
}

type Settings = typeof settings;
const settings = {
    showButton: { type: "boolean", get label() { return t("settings.showButton"); }, get description() { return t("settings.showButton.description"); }, default: true },
    shortcut: { type: "keybind", get label() { return t("settings.shortcut"); }, get description() { return t("settings.shortcut.description"); }, default: "" },
} as const;

let context: PluginContext<Settings> | undefined;
/** Discord's showCurrentGame setting object, handed over by the source patch */
let showCurrentGame: DiscordSetting<boolean> | undefined;

const protoStore = () => findStore("UserSettingsProtoStore");

function isShown(): boolean {
    try {
        const value = showCurrentGame?.getSetting();
        if (typeof value === "boolean") return value;
    } catch { /* fall through to the store */ }
    return readShowCurrentGame(protoStore()?.settings);
}

const PRELOADED = "discord_protos.discord_users.v1.PreloadedUserSettings";

/** Writes the proto directly, like Discord's setting object would */
async function writeFallback(value: boolean) {
    const creators = find(v => typeof v?.updateAsync === "function" && v?.ProtoClass?.typeName === PRELOADED);
    if (!creators) throw new Error("Couldn't find Discord's user settings updater");
    const statusType = creators.ProtoClass.fields?.find((f: any) => f.name === "status")?.T?.();
    const boolType = statusType?.fields?.find((f: any) => f.localName === "showCurrentGame")?.T?.();
    await creators.updateAsync("status", (status: any) => {
        status.showCurrentGame = boolType?.create?.({ value }) ?? { value };
    }, 0);
}

let busy = false;
/** Flips the setting and toasts the result */
async function toggle() {
    if (busy) return;
    busy = true;
    const next = !isShown();
    try {
        if (showCurrentGame) await showCurrentGame.updateSetting(next);
        else await writeFallback(next);
        context?.toast(t(next ? "toast.shown" : "toast.hidden"), { type: "success" });
    } catch (err) {
        context?.logger.error("Couldn't change the game activity setting", err);
        context?.toast(t("toast.failed"), { type: "failure" });
    } finally {
        busy = false;
    }
}

function subscribe(onChange: () => void) {
    const store = protoStore();
    store?.addChangeListener?.(onChange);
    return () => store?.removeChangeListener?.(onChange);
}

const useShown = () => React.useSyncExternalStore(subscribe, isShown);

function GamepadIcon({ off }: { off: boolean; }) {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {/* Crossed out: the slash gets a transparent gap around it, whatever the background */}
            <mask id="dl-game-activity-slash">
                <rect width="24" height="24" fill="white" />
                <path d="M3 3 21 21" stroke="black" strokeWidth={5} />
            </mask>
            <path
                fillRule="evenodd"
                mask={off ? "url(#dl-game-activity-slash)" : undefined}
                d="M6.5 5h11a4 4 0 0 1 3.9 3.1l1.3 5.9a3 3 0 0 1-5.2 2.6l-1.9-2.1H8.4l-1.9 2.1a3 3 0 0 1-5.2-2.6l1.3-5.9A4 4 0 0 1 6.5 5Zm.25 2.75v1.25H5.5v1.5h1.25v1.25h1.5V10.5H9.5V9H8.25V7.75h-1.5ZM16 7.75a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
            />
            {off && <path d="M3 3 21 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />}
        </svg>
    );
}

function GameActivityButton() {
    const { showButton } = context!.settings.use();
    const shown = useShown();
    if (!showButton) return null;

    const label = t(shown ? "button.hide" : "button.show");
    const button = (
        <button
            type="button"
            className="dl-game-activity-button"
            data-hidden={!shown || undefined}
            onClick={toggle}
            aria-label={label}
            aria-pressed={!shown}
        >
            <GamepadIcon off={!shown} />
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={label} position="top">{button}</Tooltip> : React.cloneElement(button, { title: label });
}

export default definePlugin({
    settings,

    patches: [PATCHES.setting, PATCHES.userPanel],

    /** Called by the patched settings module with Discord's showCurrentGame setting */
    captureSetting(setting: unknown) {
        if (setting && typeof (setting as any).getSetting === "function" && typeof (setting as any).updateSetting === "function") {
            showCurrentGame = setting as DiscordSetting<boolean>;
        }
    },

    /** Called by the patched user panel, first in its button row */
    renderButton() {
        if (!context) return null;
        return <GameActivityButton key="evi-game-activity" />;
    },

    toggle,
    isShown,

    css: `
        .dl-game-activity-button { display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
            width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--radius-sm, 8px); cursor: pointer;
            background: transparent; color: var(--interactive-normal, var(--interactive-icon-default));
            transition: background-color 0.1s ease-out, color 0.1s ease-out; }
        .dl-game-activity-button:hover { background: var(--background-modifier-hover, var(--interactive-background-hover));
            color: var(--interactive-hover, var(--interactive-icon-hover)); }
        .dl-game-activity-button:active { background: var(--background-modifier-active, var(--interactive-background-active));
            color: var(--interactive-active, var(--interactive-icon-active)); }
        .dl-game-activity-button[data-hidden] { color: var(--status-danger, #da373c); }
        .dl-game-activity-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
        @media (prefers-reduced-motion: reduce) { .dl-game-activity-button { transition: none; } }
    `,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));

        ctx.keybind("shortcut", () => void toggle());

        ctx.command({
            name: "gameactivity",
            get description() { return t("command.description"); },
            execute: () => void toggle(),
        });
    },
});
