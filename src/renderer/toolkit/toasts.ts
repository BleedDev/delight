/**
 * Discord's own toasts: the small status pill at the top of the window ("Copied to clipboard").
 *
 * Discord keeps them in a zustand store; its `showToast(toast)` queues one per app context. The
 * toast object shape comes from Discord's createToast: { message, id, type, options }.
 *
 * Since 2026-10-01 Discord has a second toast system next to it, with its own store and a different
 * toast shape ({ text, variant, position: "top" }), behind an experiment. Its showToast routes between
 * the two: given the old shape, it converts it for the new system when that's on and otherwise hands
 * it to the old one. That router is what Evi calls; the old showToast alone is the fallback, for
 * builds from before the router (the new system's showToast matches `.currentToastMap.has(` too, but
 * takes the other shape, so it's told apart by the old one's `appContext`).
 */
import type { ReactNode } from "react";

import { Logger } from "../logger";
import { filters, find } from "../webpack/find";

const logger = new Logger("Toasts", "#5865f2");

/** Discord's toast types. "info" is Evi's name for Discord's plain "message" toast. */
export type ToastType = "info" | "success" | "failure" | "message" | "link" | "clock" | "bookmark" | "favorite";

export interface ToastOptions {
    type?: ToastType;
    /** Milliseconds, Discord's default is 3000 */
    duration?: number;
    position?: "top" | "bottom";
}

/** Discord's router: function d(e){if(!(0,s.WD)("showToast"))return void(0,a.P0)(e);…} */
export const showToastFilter = filters.byCode('("showToast"))return');
/** The old system's showToast, for Discord builds from before the router */
export const legacyShowToastFilter = filters.byCode(".currentToastMap.has(", "appContext");

let show: ((toast: unknown) => void) | undefined;
let counter = 0;

/** Shows a toast. Returns false if Discord's toast module isn't available. */
export function showToast(message: ReactNode, options: ToastOptions = {}): boolean {
    show ??= find(showToastFilter) ?? find(legacyShowToastFilter);
    if (!show) {
        logger.warn("Discord's toast module was not found, toast not shown:", message);
        return false;
    }

    const type = options.type === "info" || !options.type ? "message" : options.type;
    show({
        message,
        id: `evi-toast-${++counter}`,
        type,
        options: {
            position: options.position === "bottom" ? 1 : 0,
            component: null,
            duration: options.duration ?? 3000,
            appContext: "APP",
        },
    });
    return true;
}
