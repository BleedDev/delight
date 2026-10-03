import { definePlugin, find, findStore } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { t } from "./strings";

import { PATCHES, readShowCurrentGame } from "./toggle";

/**
 * "Share my activity" is the showCurrentGame user setting (status.showCurrentGame in the
 * PreloadedUserSettings proto). A source patch captures Discord's own setting object
 * ({ getSetting, updateSetting, useSetting }) when its module defines it, so writes go through the
 * same path as the settings page.
 *
 * The switch sits in the user panel through Evi (ctx.panelToggle): a gamepad button of its own, or
 * a line in Evi's menu there when other plugins add switches too.
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

function subscribe(onChange: () => void) {
    const store = protoStore();
    store?.addChangeListener?.(onChange);
    return () => store?.removeChangeListener?.(onChange);
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

interface IconProps { width?: number; height?: number; }

/** Hidden: crossed out and red, like Discord's own mute and deafen icons */
const GamepadOff = (_: IconProps) => <span className="dl-game-activity-off"><GamepadIcon off /></span>;
const GamepadOn = (_: IconProps) => <GamepadIcon off={false} />;

/** Its switch in the user panel, while the showButton setting is on */
function panelSwitch(ctx: PluginContext<Settings>) {
    let remove: (() => void) | undefined;
    const sync = () => {
        const want = ctx.settings.get("showButton");
        if (want && !remove) {
            remove = ctx.panelToggle({
                label: () => t("panel.label"),
                tooltip: shown => t(shown ? "button.hide" : "button.show"),
                icon: shown => shown ? GamepadOn : GamepadOff,
                isChecked: isShown,
                subscribe,
                // Hidden is the state to notice, like being muted
                alert: shown => !shown,
                toggle: () => void toggle(),
            });
        } else if (!want && remove) {
            remove();
            remove = undefined;
        }
    };
    sync();
    ctx.settings.onChange(sync);
}

export default definePlugin({
    settings,

    patches: [PATCHES.setting],

    /** Called by the patched settings module with Discord's showCurrentGame setting */
    captureSetting(setting: unknown) {
        if (setting && typeof (setting as any).getSetting === "function" && typeof (setting as any).updateSetting === "function") {
            showCurrentGame = setting as DiscordSetting<boolean>;
        }
    },

    toggle,
    isShown,

    css: `
        .dl-game-activity-off { display: contents; color: var(--status-danger, #da373c); }
    `,

    start(ctx) {
        context = ctx;
        panelSwitch(ctx);
        ctx.onDispose(() => void (context = undefined));

        ctx.keybind("shortcut", () => void toggle());

        ctx.command({
            name: "gameactivity",
            get description() { return t("command.description"); },
            execute: () => void toggle(),
        });
    },
});
