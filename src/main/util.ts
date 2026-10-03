import { webContents } from "electron";

/** Sends to every live page: each Discord window hears it, not just the one that asked */
export function broadcast(channel: string, ...args: unknown[]) {
    for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) wc.send(channel, ...args);
    }
}

export const errorOf = (err: unknown) => String((err as Error)?.message ?? err);

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Allows at most `max` calls in any `windowMs`: each call answers whether it fits, and counts if so.
 * Plugins share the page with the buttons behind these calls, so main caps them itself.
 */
export function rateLimit(max: number, windowMs: number) {
    const times: number[] = [];
    return () => {
        const now = Date.now();
        while (times.length && now - times[0] >= windowMs) times.shift();
        if (times.length >= max) return false;
        times.push(now);
        return true;
    };
}
