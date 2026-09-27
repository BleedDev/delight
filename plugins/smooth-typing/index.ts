import { definePlugin, Dispatcher, FluxAction } from "@evi/api";

/**
 * Discord dispatches DRAFT_CHANGE on every keystroke, and everything subscribed to drafts
 * re-renders each time. Measured on a 300Hz display, 60 keystrokes per variant, interleaved:
 * worst frame after a keystroke (p90) 40ms stock -> 20ms with draft changes batched.
 *
 * The editor keeps its own text, the draft store is only the saved copy, so batching changes
 * nothing you see. Safety rules, so a held-back draft can never land after it stopped being true:
 *  - a newer draft for the same channel replaces the pending one
 *  - DRAFT_SAVE, DRAFT_CLEAR and DRAFT_COMMAND_CLEAR drop whatever is pending for that channel, of
 *    any draft type: they're newer. Sending clears the box that way.
 *  - a message you send drops a pending draft with the same text: that draft is the message itself,
 *    and landing after the send would bring the sent text back into the box
 *  - switching channels writes pending drafts at once, so the box you come back to is up to date
 *  - pending drafts are written immediately when the plugin stops or the page closes
 */

const DELAY = 250;
const CLEARS = new Set(["DRAFT_SAVE", "DRAFT_CLEAR", "DRAFT_COMMAND_CLEAR"]);
const SENT = new Set(["MESSAGE_CREATE", "LOCAL_MESSAGE_CREATE"]);

type Pending = { action: FluxAction; timer: ReturnType<typeof setTimeout>; };

export default definePlugin({
    start(ctx) {
        const pending = new Map<string, Pending>();
        let dispatchOriginal: ((action: FluxAction) => unknown) | undefined;

        const keyOf = (a: FluxAction) => `${a.channelId}:${a.draftType}`;
        const drop = (key: string) => {
            clearTimeout(pending.get(key)?.timer);
            pending.delete(key);
        };
        const dropChannel = (channelId: unknown, keep: (p: Pending) => boolean = () => false) => {
            for (const [key, p] of pending) if (p.action.channelId === channelId && !keep(p)) drop(key);
        };
        const flush = () => {
            for (const [key, { action }] of pending) {
                drop(key);
                dispatchOriginal?.(action);
            }
        };
        const text = (v: unknown) => typeof v === "string" ? v.trim() : "";

        ctx.hook.instead(Dispatcher, "dispatch", call => {
            const action = call.args[0] as FluxAction;
            dispatchOriginal ??= (a: FluxAction) => call.original.call(call.self, a);
            const type = action?.type;

            if (type === "DRAFT_CHANGE") {
                const key = keyOf(action);
                drop(key);
                pending.set(key, {
                    action,
                    timer: setTimeout(() => {
                        pending.delete(key);
                        dispatchOriginal!(action);
                    }, DELAY),
                });
                return Promise.resolve();
            }

            if (pending.size) {
                if (CLEARS.has(type)) dropChannel(action.channelId);
                else if (SENT.has(type)) {
                    // The draft that was this message: only ever the sender's own, matched by its text
                    const message = action.message as { channel_id?: string; content?: string; } | undefined;
                    const sent = text(message?.content);
                    if (sent) dropChannel(message?.channel_id ?? action.channelId, p => text((p.action as { draft?: unknown; }).draft) !== sent);
                } else if (type === "CHANNEL_SELECT") flush();
            }

            return call.callOriginal(...call.args);
        });

        addEventListener("pagehide", flush);
        ctx.onDispose(() => {
            removeEventListener("pagehide", flush);
            flush();
        });
    },
});
