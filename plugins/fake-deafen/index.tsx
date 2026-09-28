import { Components, definePlugin, filters, getStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { t } from "./strings";

import { fakeState, PATCHES } from "./voice";
import type { ResendResult, VoiceState } from "./voice";

/**
 * Appear deafened (and muted) to everyone else while still hearing them.
 *
 *  - A `before` hook on the gateway socket's voiceStateUpdate (GatewayConnectionStore.getSocket(),
 *    one socket for the whole session) rewrites selfDeaf/selfMute while fake deafen is on.
 *  - Toggling resends the real state through that hook right away: through Discord's own voice
 *    state committer (captured by a source patch) when it has it, or by repeating the last call the
 *    hook saw. The committer's module runs at startup, so after turning the plugin on mid-session
 *    only the second works, and only once Discord has sent something (mute, deafen, join).
 *  - A source patch puts a headphones button right of Discord's deafen button.
 *
 * Fake deafen itself isn't saved: it starts off with every Discord launch, so nobody stays
 * "deafened" by accident. Stopping the plugin resends the real state.
 */

interface GatewaySocket {
    voiceStateUpdate(state: VoiceState): void;
}

interface VoiceCommitter {
    readonly channelId: string | null;
    forceUpdate(): void;
}

type Settings = typeof settings;
const settings = {
    deafen: { type: "boolean", get label() { return t("settings.deafen"); }, get description() { return t("settings.deafen.description"); }, default: true },
    mute: { type: "boolean", get label() { return t("settings.mute"); }, get description() { return t("settings.mute.description"); }, default: true },
    showButton: { type: "boolean", get label() { return t("settings.showButton"); }, get description() { return t("settings.showButton.description"); }, default: true },
    shortcut: { type: "keybind", get label() { return t("settings.shortcut"); }, get description() { return t("settings.shortcut.description"); }, default: "" },
} as const;

let context: PluginContext<Settings> | undefined;
let socket: GatewaySocket | undefined;
/** Discord's voice state committer, handed over by the source patch */
let committer: VoiceCommitter | undefined;
/** The last voice state Discord sent, before our rewrite */
let lastReal: VoiceState | undefined;
let enabled = false;

const listeners = new Set<() => void>();
function setEnabled(value: boolean) {
    enabled = value;
    for (const listener of listeners) listener();
}

/** Sends the real voice state again, through our hook */
function resend(): ResendResult {
    if (committer && socket) {
        if (committer.channelId == null) return "idle";
        committer.forceUpdate();
        return "sent";
    }
    if (socket && lastReal?.channelId != null) {
        socket.voiceStateUpdate({ ...lastReal });
        return "sent";
    }
    return getStore("SelectedChannelStore")?.getVoiceChannelId?.() ? "pending" : "idle";
}

const TOASTS = { sent: "toast.on", idle: "toast.onIdle", pending: "toast.onPending" } as const;

function toggle() {
    if (!context) return;
    if (!socket) {
        context.toast(t("toast.failed"), { type: "failure" });
        return;
    }
    setEnabled(!enabled);
    let result: ResendResult;
    try {
        result = resend();
    } catch (err) {
        context.logger.error("Couldn't resend the voice state", err);
        context.toast(t("toast.failed"), { type: "failure" });
        return;
    }
    context.toast(t(enabled ? TOASTS[result] : "toast.off"), { type: "success" });
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => void listeners.delete(onChange);
}

const useEnabled = () => React.useSyncExternalStore(subscribe, () => enabled);

function HeadphonesIcon({ on }: { on: boolean; }) {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {/* Crossed out: the slash gets a transparent gap around it, whatever the background */}
            <mask id="dl-fake-deafen-slash">
                <rect width="24" height="24" fill="white" />
                <path d="M3 3 21 21" stroke="black" strokeWidth={5} />
            </mask>
            <path
                mask={on ? "url(#dl-fake-deafen-slash)" : undefined}
                d="M12 3a9 9 0 0 0-9 9v6.5A2.5 2.5 0 0 0 5.5 21H7a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1.5a2.5 2.5 0 0 0 2.5-2.5V12a9 9 0 0 0-9-9Z"
            />
            {on && <path d="M3 3 21 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="3 2.2" />}
        </svg>
    );
}

function FakeDeafenButton() {
    const { showButton } = context!.settings.use();
    const on = useEnabled();
    if (!showButton) return null;

    const label = t(on ? "button.off" : "button.on");
    const button = (
        <button
            type="button"
            className="dl-fake-deafen-button"
            data-on={on || undefined}
            onClick={toggle}
            aria-label={label}
            aria-pressed={on}
        >
            <HeadphonesIcon on={on} />
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={label} position="top">{button}</Tooltip> : React.cloneElement(button, { title: label });
}

export default definePlugin({
    settings,

    patches: [PATCHES.committer, PATCHES.userPanel],

    /** Called by the patched voice state committer's constructor */
    captureCommitter(value: unknown) {
        if (value && typeof (value as any).forceUpdate === "function") committer = value as VoiceCommitter;
    },

    /** Called by the patched user panel, right after the deafen button */
    renderButton() {
        if (!context) return null;
        return <FakeDeafenButton key="evi-fake-deafen" />;
    },

    toggle,
    isEnabled: () => enabled,

    css: `
        .dl-fake-deafen-button { display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
            width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--radius-sm, 8px); cursor: pointer;
            background: transparent; color: var(--interactive-normal, var(--interactive-icon-default));
            transition: background-color 0.1s ease-out, color 0.1s ease-out; }
        .dl-fake-deafen-button:hover { background: var(--background-modifier-hover, var(--interactive-background-hover));
            color: var(--interactive-hover, var(--interactive-icon-hover)); }
        .dl-fake-deafen-button:active { background: var(--background-modifier-active, var(--interactive-background-active));
            color: var(--interactive-active, var(--interactive-icon-active)); }
        .dl-fake-deafen-button[data-on] { color: var(--status-danger, #da373c); }
        .dl-fake-deafen-button:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: -2px; }
        @media (prefers-reduced-motion: reduce) { .dl-fake-deafen-button { transition: none; } }
    `,

    start(ctx) {
        context = ctx;

        ctx.waitFor<{ getSocket(): GatewaySocket | undefined; }>(filters.byStoreName("GatewayConnectionStore"), store => {
            const found = store.getSocket?.();
            if (typeof found?.voiceStateUpdate !== "function") {
                ctx.logger.error("GatewayConnectionStore has no socket with voiceStateUpdate");
                return;
            }
            socket = found;
            ctx.hook.before(found, "voiceStateUpdate", call => {
                const real = call.args[0] as VoiceState | undefined;
                if (!real || typeof real !== "object") return;
                lastReal = { ...real };
                if (enabled) call.args[0] = fakeState(real, { deafen: ctx.settings.get("deafen"), mute: ctx.settings.get("mute") });
            });
        });

        // Changing what to fake while it's on applies at once
        ctx.settings.onChange(() => {
            if (enabled) resend();
        });

        ctx.onDispose(() => {
            const wasOn = enabled;
            setEnabled(false);
            // Let the server see the real state again. Runs whether or not our hook is still installed.
            if (wasOn) {
                try { resend(); } catch { /* the socket is gone with Discord */ }
            }
            context = undefined;
            socket = undefined;
            lastReal = undefined;
            // committer stays: its module only runs once, and a restarted plugin needs it again
        });

        ctx.keybind("shortcut", toggle);

        ctx.command({
            name: "fakedeafen",
            get description() { return t("command.description"); },
            execute: () => void toggle(),
        });
    },
});
