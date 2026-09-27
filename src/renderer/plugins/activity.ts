/**
 * The renderer's record of what each plugin did (src/shared/pluginActivity.ts), shown in its
 * details. In memory only, since Discord started, capped per plugin, and kept across a plugin's
 * restarts and reloads.
 *
 * Network requests are seen through the `fetch`, `XMLHttpRequest` and `WebSocket` a plugin's code
 * is evaluated with (manager.ts): each plugin gets its own, which note the request and hand it to
 * the real one untouched. Code that reaches for `window.fetch` explicitly goes around them, which is
 * why its permissions still come from reading its code.
 */
import { ActivityEvent, ActivityKind, ActivityLog, scrubUrl } from "@shared/pluginActivity";

const log = new ActivityLog();
const listeners = new Set<() => void>();
/** Bumped on every change, for useSyncExternalStore */
let version = 0;
let scheduled = false;

/** Batched: a plugin firing a burst of requests re-renders an open dialog once */
function emit() {
    version++;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
        scheduled = false;
        for (const listener of listeners) listener();
    });
}

const base = () => typeof location === "undefined" ? undefined : location.href;

function record(id: string, kind: ActivityKind, method: string, url: string): ActivityEvent | undefined {
    const where = scrubUrl(url, base());
    if (!where) return undefined;
    const event = log.add(id, { kind, at: Date.now(), method: method.toUpperCase(), ...where });
    emit();
    return event;
}

function finish(event: ActivityEvent | undefined, status: number | "error") {
    if (!event) return;
    event.status = status;
    emit();
}

function urlOf(input: unknown) {
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    return String(input);
}

/** Never lets the log break the request it's watching */
function safely<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

export const PluginActivity = {
    get(id: string) {
        return log.get(id);
    },

    clear(id: string) {
        log.clear(id);
        emit();
    },

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },

    version() {
        return version;
    },

    /** A call into the plugin's full-access part. Returns what to call when it settles. */
    nativeCall(id: string, method: string) {
        const event = log.add(id, { kind: "native", at: Date.now(), target: method });
        emit();
        return (ok: boolean) => finish(event, ok ? 200 : "error");
    },

    /** The network globals a plugin's code is evaluated with, see manager.ts */
    networkScope(id: string) {
        const fetch = function fetch(input: RequestInfo | URL, init?: RequestInit) {
            const event = safely(() => {
                const method = init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
                return record(id, "request", method, urlOf(input));
            });
            const pending = globalThis.fetch(input, init);
            if (event) pending.then(r => finish(event, r.status), () => finish(event, "error"));
            return pending;
        };

        const Xhr = globalThis.XMLHttpRequest && class XMLHttpRequest extends globalThis.XMLHttpRequest {
            override open(method: string, url: string | URL, ...rest: unknown[]) {
                const event = safely(() => record(id, "request", method, urlOf(url)));
                if (event) this.addEventListener("loadend", () => finish(event, this.status || "error"), { once: true });
                return (super.open as (...args: unknown[]) => void)(method, url, ...rest);
            }
        };

        const Socket = globalThis.WebSocket && class WebSocket extends globalThis.WebSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                super(url, protocols);
                const event = safely(() => record(id, "socket", "WS", urlOf(url)));
                if (event) {
                    this.addEventListener("open", () => finish(event, 101), { once: true });
                    this.addEventListener("error", () => finish(event, "error"), { once: true });
                }
            }
        };

        return { fetch, XMLHttpRequest: Xhr, WebSocket: Socket };
    },
};
