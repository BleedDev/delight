import { definePlugin, filters, find, getStore } from "@delight/api";
import type { PluginContext } from "@delight/api";
import type { ComponentType } from "react";

/**
 * Discord's typing actions are one object, `{ startTyping(channelId), stopTyping(channelId) }`.
 * startTyping dispatches TYPING_START_LOCAL, and TypingStore's handler for it is what POSTs
 * /channels/{id}/typing. Skipping startTyping sends nothing; stopTyping stays untouched, so a
 * request already scheduled when you turn this on is still cancelled normally.
 *
 * The chat bar button comes from a source patch on ChannelTextAreaButtons, which builds its
 * buttons into an array `j` and returns `0===j.length?null:<div>{j}</div>`. Ours is put in
 * that array before the check, next to the send button.
 */

const typingActions = filters.byProps("startTyping", "stopTyping");
/** Discord's chat bar button (the one gift, sticker and apps use) */
const chatButtonFilter = filters.componentByCode("CHAT_INPUT_BUTTON_NOTIFICATION", "sparkle");

type Settings = typeof settings;
const settings = {
    enabled: { type: "boolean", label: "Enabled", description: "Hide your typing indicator from others. /silenttyping toggles this.", default: true },
    showButton: { type: "boolean", label: "Chat bar button", description: "A keyboard button in the chat bar that toggles it.", default: true },
} as const;

let context: PluginContext<Settings> | undefined;

/** Flips the setting and says what it is now */
function toggle() {
    if (!context) return "";
    const enabled = !context.settings.get("enabled");
    context.settings.set("enabled", enabled);
    return enabled ? "Silent typing is on: others won't see you typing." : "Silent typing is off.";
}

let containerClass: string | undefined;
/** Wrapper class of Discord's apps button, from its CSS module { buttonContainer, button, buttonActive, ... } */
function getContainerClass() {
    containerClass ??= Object.values(find(v =>
        typeof v === "object" && Object.values(v).some(c => typeof c === "string" && c.startsWith("channelAppLauncherButtonPopoutIconAnimation_")),
    ) ?? {}).find((c): c is string => typeof c === "string" && c.startsWith("buttonContainer_"));
    return containerClass;
}

let ChatButton: ComponentType<any> | undefined;

function KeyboardIcon({ off }: { off: boolean; }) {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {/* Crossed out: the slash gets a transparent gap around it, whatever the background */}
            <mask id="dl-silent-typing-slash">
                <rect width="24" height="24" fill="white" />
                <path d="M3 3 21 21" stroke="black" strokeWidth={5} />
            </mask>
            <path
                fillRule="evenodd"
                mask={off ? "url(#dl-silent-typing-slash)" : undefined}
                d="M3 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H3Zm2 3h2v2H5V9Zm4 0h2v2H9V9Zm4 0h2v2h-2V9Zm4 0h2v2h-2V9ZM5 13h2v2H5v-2Zm4 0h6v2H9v-2Zm8 0h2v2h-2v-2Z"
            />
            {off && <path d="M3 3 21 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />}
        </svg>
    );
}

function SilentTypingButton() {
    const { enabled } = context!.settings.use();
    const label = enabled ? "Silent typing on (click to turn off)" : "Silent typing off (click to turn on)";
    ChatButton ??= find(chatButtonFilter);
    const icon = <KeyboardIcon off={enabled} />;

    return (
        <div className={getContainerClass()} data-delight-silent-typing={enabled ? "on" : "off"}>
            {ChatButton
                ? <ChatButton onClick={toggle} isActive={enabled} aria-label={label} sparkle={false}>{icon}</ChatButton>
                : <button type="button" className="dl-silent-typing-fallback" onClick={toggle} aria-label={label} aria-pressed={enabled}>{icon}</button>}
        </div>
    );
}

export default definePlugin({
    settings,

    patches: [{
        find: "\"ChannelTextAreaButtons\"",
        replace: {
            match: /(?<=[,(])0===(\i)\.length(?=\)\?null:\(0,\i\.jsxs?\)\("div",\{className:\i\.\i,children:\1\}\))/,
            with: "($self?.injectButton?.($1,arguments[0]),0===$1.length)",
        },
    }],

    /** Called by the patched ChannelTextAreaButtons with its button list and props */
    injectButton(buttons: unknown[], props: any) {
        try {
            if (!context?.settings.get("showButton") || !Array.isArray(buttons) || props?.channel?.id == null) return;
            const button = <SilentTypingButton key="delight-silent-typing" />;
            // Before the send button when there is one, so that one stays last
            const submit = buttons.findIndex((b: any) => b?.key === "submit");
            if (submit < 0) buttons.push(button);
            else buttons.splice(submit, 0, button);
        } catch (err) {
            context?.logger.error("Couldn't add the chat bar button", err);
        }
    },

    SilentTypingButton,
    toggle,

    css: `
        .dl-silent-typing-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 4px;
            background: none; border: 0; cursor: pointer; color: var(--interactive-normal); }
        .dl-silent-typing-fallback:hover, .dl-silent-typing-fallback[aria-pressed="true"] { color: var(--interactive-active); }
    `,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));

        ctx.hookExport("instead", typingActions, "startTyping", call => {
            if (!ctx.settings.get("enabled")) return call.callOriginal(...call.args);
        });

        // Turning it on mid-sentence: cancel the typing request Discord may have scheduled already
        ctx.settings.onChange(({ enabled }) => {
            if (!enabled) return;
            const channelId = getStore("SelectedChannelStore")?.getChannelId?.();
            if (channelId) find(typingActions)?.stopTyping(channelId);
        });

        ctx.command({
            name: "silenttyping",
            description: "Turn silent typing on or off",
            // An "Only you can see this" reply in the channel, nothing is ever sent
            execute: () => ({ ephemeral: toggle() }),
        });
    },
});
