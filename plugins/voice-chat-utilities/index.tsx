import { definePlugin, filters, find, findMenuGroup, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";

import { t } from "./strings";

import { bodyFor, PERMS, runSequential, targets, toggles, VOICE_TYPES } from "./bulk";
import type { Action } from "./bulk";

/**
 * Right-click a voice or stage channel ("channel-context" menu) for a Voice Chat Utilities submenu:
 * disconnect, move, server mute or server deafen everyone in it. Only what you're allowed to do
 * in that channel shows (PermissionStore.can), and nothing shows for an empty channel.
 *
 * Each person is one PATCH /guilds/{guildId}/members/{userId} through Discord's own HTTP client,
 * the request its user menu sends, one at a time with a pause between so rate limits aren't hit.
 * You go last, so moving or disconnecting yourself doesn't cut the rest short. Disconnect and move
 * ask first; mute and deafen are easy to undo, so they don't.
 */

const DELAY_MS = 350;

let context: PluginContext | undefined;
let busy = false;

type HttpClient = { patch(opts: any): Promise<any>; };
/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR: given Discord's options object it "succeeds" without ever
 * reaching the API, so it's skipped.
 */
const http = (): HttpClient | undefined => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

const store = (name: string) => getStore(name) as any;
const can = (perm: bigint, channel: any) => {
    try {
        return !!store("PermissionStore")?.can?.(perm, channel);
    } catch {
        return false;
    }
};

const channelName = (channel: any) => channel?.name ?? channel?.id ?? "";

/** The server's other voice and stage channels you can move people into, in list order */
function moveTargets(channel: any): any[] {
    const vocal = store("GuildChannelStore")?.getChannels?.(channel.guild_id)?.VOCAL ?? [];
    return vocal
        .map((entry: any) => entry?.channel ?? entry)
        .filter((c: any) => c && c.id !== channel.id && VOICE_TYPES.has(c.type) && can(PERMS.MOVE_MEMBERS, c));
}

type ToastKey = "toast.disconnect" | "toast.move" | "toast.mute" | "toast.unmute" | "toast.deafen" | "toast.undeafen";

async function run(channel: any, action: Action, toastKey: ToastKey, target?: any) {
    const ctx = context;
    if (!ctx) return;
    if (busy) {
        ctx.toast(t("toast.busy"), { type: "failure" });
        return;
    }
    const client = http();
    if (!client) {
        ctx.logger.error("Discord's HTTP client wasn't found");
        return;
    }
    const me = store("UserStore")?.getCurrentUser?.()?.id;
    const ids = targets(store("VoiceStateStore")?.getVoiceStatesForChannel?.(channel.id), me);
    if (!ids.length) return;

    busy = true;
    try {
        const body = bodyFor(action);
        const result = await runSequential(ids, userId => client.patch({
            url: `/guilds/${channel.guild_id}/members/${userId}`,
            body,
            oldFormErrors: true,
            rejectWithError: true,
        }), DELAY_MS);
        const message = t(toastKey, { done: result.done, total: ids.length, target: channelName(target) });
        if (result.failed) ctx.toast(`${message}. ${t("toast.failedHint")}`, { type: "failure" });
        else ctx.toast(message, { type: "success" });
    } finally {
        busy = false;
    }
}

let closeOpen: CloseLayer | undefined;

function confirm(title: string, body: string, button: string, onConfirm: () => void) {
    closeOpen?.();
    const close = openLayer(close => <Confirm title={title} body={body} button={button} onCancel={() => close()} onConfirm={() => { close(); onConfirm(); }} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

function Confirm({ title, body, button, onCancel, onConfirm }: { title: string; body: string; button: string; onCancel(): void; onConfirm(): void; }) {
    const cancelRef = React.useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        cancelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onCancel();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    return (
        <div className="evi-vcu-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
            <div className="evi-vcu-modal evi-modal" role="alertdialog" aria-modal="true" aria-labelledby="evi-vcu-title" aria-describedby="evi-vcu-body">
                <div className="evi-vcu-content">
                    <h2 id="evi-vcu-title">{title}</h2>
                    <p id="evi-vcu-body">{body}</p>
                </div>
                <footer className="evi-vcu-actions">
                    <button className="evi-vcu-cancel" ref={cancelRef} onClick={onCancel}>{t("confirm.cancel")}</button>
                    <button className="evi-vcu-confirm" onClick={onConfirm}>{button}</button>
                </footer>
            </div>
        </div>
    );
}

function menuFor(channel: any) {
    if (!channel?.guild_id || !VOICE_TYPES.has(channel.type)) return;
    const states = store("VoiceStateStore")?.getVoiceStatesForChannel?.(channel.id);
    const count = targets(states, undefined).length;
    if (!count) return;

    const canMove = can(PERMS.MOVE_MEMBERS, channel);
    const canMute = can(PERMS.MUTE_MEMBERS, channel);
    const canDeafen = can(PERMS.DEAFEN_MEMBERS, channel);
    if (!canMove && !canMute && !canDeafen) return;

    const vars = { channel: channelName(channel), count };
    const items: React.ReactNode[] = [];
    if (canMove) {
        items.push(
            <Menu.Item
                key="evi-vcu-disconnect"
                id="evi-vcu-disconnect"
                label={t("menu.disconnect")}
                color="danger"
                action={() => confirm(t("confirm.disconnect.title"), t("confirm.disconnect.body", vars), t("confirm.disconnect.button"),
                    () => void run(channel, { kind: "disconnect" }, "toast.disconnect"))}
            />,
        );
        const destinations = moveTargets(channel);
        if (destinations.length) {
            items.push(
                <Menu.Item key="evi-vcu-move" id="evi-vcu-move" label={t("menu.move")}>
                    {destinations.map(target => (
                        <Menu.Item
                            key={target.id}
                            id={`evi-vcu-move-${target.id}`}
                            label={channelName(target)}
                            action={() => confirm(t("confirm.move.title"), t("confirm.move.body", { ...vars, target: channelName(target) }), t("confirm.move.button"),
                                () => void run(channel, { kind: "move", channelId: target.id }, "toast.move", target))}
                        />
                    ))}
                </Menu.Item>,
            );
        }
    }
    const state = toggles(states);
    const toggle = (key: "mute" | "unmute" | "deafen" | "undeafen", kind: "mute" | "deafen", value: boolean) => {
        if (state[key]) items.push(<Menu.Item key={`evi-vcu-${key}`} id={`evi-vcu-${key}`} label={t(`menu.${key}`)} action={() => void run(channel, { kind, value }, `toast.${key}`)} />);
    };
    if (canMute) {
        toggle("mute", "mute", true);
        toggle("unmute", "mute", false);
    }
    if (canDeafen) {
        toggle("deafen", "deafen", true);
        toggle("undeafen", "deafen", false);
    }
    if (!items.length) return;

    return (
        <Menu.Group key="evi-vcu-group">
            <Menu.Item id="evi-vcu" label={t("menu.root")}>{items}</Menu.Item>
        </Menu.Group>
    );
}

const css = `
.evi-vcu-scrim { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-vcu-modal { width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-vcu-content { padding: 20px 20px 16px; }
.evi-vcu-content h2 { margin: 0 0 8px; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-vcu-content p { margin: 0; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
.evi-vcu-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 4px 20px 20px; }
.evi-vcu-actions button { min-height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
.evi-vcu-cancel { background: none; color: var(--text-default, #dbdee1); }
.evi-vcu-cancel:hover { text-decoration: underline; }
.evi-vcu-confirm { background: var(--button-danger-background, var(--status-danger, #da373c)); color: var(--white, #fff); }
.evi-vcu-confirm:hover { background: var(--button-danger-background-hover, #a12d2f); }
.evi-vcu-actions button:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 2px; }
`;

export default definePlugin({
    start(ctx) {
        context = ctx;
        ctx.onDispose(() => {
            closeOpen?.();
            context = undefined;
        });
        ctx.addStyle(css);

        // With Discord's own voice items (Open Chat, Hide Names), not at the bottom of the menu
        ctx.contextMenu("channel-context", (children, props) => {
            const item = menuFor(props.channel);
            if (item) (findMenuGroup(children, "hide-voice-names") ?? findMenuGroup(children, "open-chat") ?? children).push(item);
        });
    },
});
