import type { NativePlugin } from "@evi/api/native";

const TRACKING = [
    /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/v\d+\/(?:science|metrics)/,
    // The page's Sentry reports go through Discord's own proxy
    /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/error-reporting-proxy\//,
    // Sentry itself: Discord's main process reports there directly
    /^https:\/\/(?:[\w-]+\.)*sentry\.io\//,
];

export const isTracking = (url: string) => TRACKING.some(re => re.test(url));

let blocked = 0;

export default {
    start(ctx) {
        ctx.onBeforeRequest(({ url }) => {
            if (!isTracking(url)) return;
            blocked++;
            return { cancel: true };
        });
    },

    /** Called from the renderer via ctx.native.call("getBlockedCount") */
    getBlockedCount() {
        return blocked;
    },
} satisfies NativePlugin;
