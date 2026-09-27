/**
 * Main-process side of the Claude plugin. Everything lives in host/hub.ts; the renderer reaches it through two calls:
 *   invoke(channel, args)  a request (start a session, answer an approval, git status…)
 *   poll(cursor)           the event stream, as a long poll (resolves when there are new events, or after ~25 s)
 */
import type { NativeContext, NativePlugin } from "@evi/api/native";
import { createHub } from "./host/hub";

let hub: ReturnType<typeof createHub> | null = null;

export default {
    start(ctx: NativeContext) {
        hub = createHub(ctx.dataDir);
        ctx.onDispose(() => {
            hub?.dispose();
            hub = null;
        });
    },
    stop() {
        hub?.dispose();
        hub = null;
    },
    invoke(channel: unknown, args: unknown) {
        if (!hub) throw new Error("The Claude plugin isn't running");
        return hub.invoke(channel, args);
    },
    poll(cursor: unknown) {
        if (!hub) throw new Error("The Claude plugin isn't running");
        return hub.poll(typeof cursor === "number" && cursor >= 0 ? cursor : 0);
    },
} satisfies NativePlugin;
