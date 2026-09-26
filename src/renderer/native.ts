import type { EviNativeApi } from "../preload";

declare global {
    interface Window {
        EviNative: EviNativeApi;
    }
}

export const Native = window.EviNative;
