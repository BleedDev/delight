import { definePlugin, Dispatcher, FluxAction } from "@evi/api";

/**
 * Discord dispatches DRAFT_CHANGE on every keystroke, and everything subscribed to drafts
 * re-renders each time. Measured on a 300Hz display, 60 keystrokes per variant, interleaved:
 * worst frame after a keystroke (p90) 40ms stock -> 20ms with draft changes batched.
 *
 * The editor keeps its own text, the draft store is only the saved copy, so batching changes
 * nothing you see. Safety rules:
 *  - a newer draft for the same channel replaces the pending one
 *  - DRAFT_CLEAR (sending a message) cancels whatever is pending for that channel first
 *  - pending drafts are written immediately when the plugin stops or the page closes
 */

const DELAY = 250;

export default definePlugin({
    start(ctx) {
        const pending = new Map<string, { action: FluxAction; timer: ReturnType<typeof setTimeout>; }>();
        let dispatchOriginal: ((action: FluxAction) => unknown) | undefined;

        const keyOf = (a: FluxAction) => `${a.channelId}:${a.draftType}`;
        const flush = () => {
            for (const [key, { action, timer }] of pending) {
                clearTimeout(timer);
                pending.delete(key);
                dispatchOriginal?.(action);
            }
        };

        ctx.hook.instead(Dispatcher, "dispatch", call => {
            const action = call.args[0] as FluxAction;
            dispatchOriginal ??= (a: FluxAction) => call.original.call(call.self, a);

            if (action?.type === "DRAFT_CHANGE") {
                const key = keyOf(action);
                const previous = pending.get(key);
                if (previous) clearTimeout(previous.timer);
                pending.set(key, {
                    action,
                    timer: setTimeout(() => {
                        pending.delete(key);
                        dispatchOriginal!(action);
                    }, DELAY),
                });
                return Promise.resolve();
            }

            if (action?.type === "DRAFT_CLEAR") {
                const previous = pending.get(keyOf(action));
                if (previous) {
                    clearTimeout(previous.timer);
                    pending.delete(keyOf(action));
                }
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
