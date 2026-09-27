import type { EviNativeApi } from "../preload";

declare global {
    interface Window {
        /** One-shot: returns the bridge the first time, see src/preload/index.ts */
        __eviClaimNative?: () => EviNativeApi;
        /** A stand-in bridge, set by the web tests and benchmarks (scripts/test-web.ts) */
        EviNative?: EviNativeApi;
    }
}

/**
 * Takes the bridge off `window` before anything else in the page can reach it. This module runs as
 * the renderer bundle starts, long before any plugin is evaluated, so from then on plugins reach main
 * only through what Evi hands them (ctx.native, for their own native module).
 */
function claim(): EviNativeApi | undefined {
    let native: EviNativeApi | undefined;
    try {
        native = window.__eviClaimNative?.() ?? window.EviNative;
    } catch {
        // Already claimed: a second copy of the renderer in the same page doesn't boot
    }
    // The claim function deletes itself; on Electrons older than 35 it can't (it stays, spent)
    for (const key of ["__eviClaimNative", "EviNative"] as const) {
        try {
            delete window[key];
        } catch { }
    }
    return native;
}

/** Undefined where the preload didn't hand Evi a bridge: the renderer then doesn't boot */
export const Native = claim()!;
