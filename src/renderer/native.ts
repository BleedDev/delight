import type { DelightNativeApi } from "../preload";

declare global {
    interface Window {
        DelightNative: DelightNativeApi;
    }
}

export const Native = window.DelightNative;
