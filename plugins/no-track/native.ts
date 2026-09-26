import type { NativePlugin } from "@evi/api/native";

const TRACKING = /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/v\d+\/(?:science|metrics)/;

let blocked = 0;

export default {
    start(ctx) {
        ctx.onBeforeRequest(({ url }) => {
            if (!TRACKING.test(url)) return;
            blocked++;
            return { cancel: true };
        });
    },

    /** Called from the renderer via ctx.native.call("getBlockedCount") */
    getBlockedCount() {
        return blocked;
    },
} satisfies NativePlugin;
