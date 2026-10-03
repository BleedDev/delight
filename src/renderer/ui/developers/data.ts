/**
 * What the Developers page's tabs share: the live numbers (one copy, refreshed while a tab that
 * shows them is open), calls to evi.rest's admin API, and number formatting.
 */
import type { AdminMethod } from "@shared/devAdmin";
import type { DevLive } from "@shared/devLive";

import { I18n } from "../../i18n";
import { Native } from "../../native";
import { React } from "../../webpack/common";

export const format = (n: number) => n.toLocaleString(I18n.discordLocale);

export const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(I18n.discordLocale, { month: "short", day: "numeric", timeZone: "UTC" });

const EVERY = 10_000;

let live: DevLive | undefined;
let liveError: string | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

async function load() {
    const res = await Native.devLive?.().catch((e: unknown) => ({ ok: false as const, error: String(e) }));
    if (!res) return;
    if (res.ok) {
        live = res.value;
        liveError = undefined;
    } else liveError = res.error;
    emit();
}

export const Live = {
    subscribe(cb: () => void) {
        listeners.add(cb);
        return () => void listeners.delete(cb);
    },
    get: () => live,
    error: () => liveError,
    refresh() {
        loading ??= load().finally(() => loading = undefined);
        return loading;
    },
    /** Things waiting on a developer: submissions to review and open reports (the Review tab's pill) */
    waiting() {
        if (!live && !loading && !liveError) void Live.refresh();
        return live ? live.store.waiting + live.store.reports : 0;
    },
};

/** The live numbers, refreshed every 10 seconds while the calling tab is open and Discord in front */
export function useLive() {
    const value = React.useSyncExternalStore(Live.subscribe, Live.get);
    const error = React.useSyncExternalStore(Live.subscribe, Live.error);
    React.useEffect(() => {
        void Live.refresh();
        const timer = setInterval(() => document.visibilityState === "visible" && void Live.refresh(), EVERY);
        return () => clearInterval(timer);
    }, []);
    return { live: value, error };
}

export type AdminResult<T> = { ok: true; value: T; } | { ok: false; error: string; };

export async function admin(method: AdminMethod, path: string, body?: unknown): Promise<AdminResult<unknown>> {
    if (!Native.devAdmin) return { ok: false, error: "This Evi can't reach evi.rest" };
    // evi.rest reads a JSON body on every write; an empty one is fine
    const res = await Native.devAdmin(method, path, method === "GET" ? undefined : body ?? {}).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
    return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
}

/** GET `path` when the tab opens and on reload(), read with `parse` */
export function useAdmin<T>(path: string | undefined, parse: (raw: unknown) => T) {
    const [state, setState] = React.useState<{ value?: T; error?: string; loading: boolean; }>({ loading: !!path });
    const parseRef = React.useRef(parse);
    parseRef.current = parse;
    const [nonce, setNonce] = React.useState(0);
    React.useEffect(() => {
        if (!path) return;
        let live = true;
        setState(s => ({ ...s, loading: true }));
        void admin("GET", path).then(res => {
            if (!live) return;
            setState(res.ok ? { value: parseRef.current(res.value), loading: false } : { error: res.error, loading: false });
        });
        return () => void (live = false);
    }, [path, nonce]);
    const reload = React.useCallback(() => setNonce(n => n + 1), []);
    return { ...state, reload };
}
