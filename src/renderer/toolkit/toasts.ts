/**
 * Discord's own toasts: the small status pill at the top of the window ("Copied to clipboard").
 *
 * Discord keeps them in a zustand store; its `showToast(toast)` queues one per app context. The
 * toast object shape comes from Discord's createToast: { message, id, type, options }.
 */
import type { ReactNode } from "react";

import { Logger } from "../logger";
import { filters, find } from "../webpack/find";

const logger = new Logger("Toasts", "#5865f2");

/** Discord's toast types. "info" is Delight's name for Discord's plain "message" toast. */
export type ToastType = "info" | "success" | "failure" | "message" | "link" | "clock" | "bookmark" | "favorite";

export interface ToastOptions {
    type?: ToastType;
    /** Milliseconds, Discord's default is 3000 */
    duration?: number;
    position?: "top" | "bottom";
}

export const showToastFilter = filters.byCode(".currentToastMap.has(");

let show: ((toast: unknown) => void) | undefined;
let counter = 0;

/** Shows a toast. Returns false if Discord's toast module isn't available. */
export function showToast(message: ReactNode, options: ToastOptions = {}): boolean {
    show ??= find(showToastFilter);
    if (!show) {
        logger.warn("Discord's toast module was not found, toast not shown:", message);
        return false;
    }

    const type = options.type === "info" || !options.type ? "message" : options.type;
    show({
        message,
        id: `delight-toast-${++counter}`,
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
