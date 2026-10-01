/**
 * Whether this Evi is linked to one of Evi's developers: they get the Developers page (its numbers
 * come from evi.rest, which only answers them). Asked at startup and again when the account changes.
 */
import { Native } from "./native";

let dev = false;
const listeners = new Set<() => void>();

export const Developer = {
    isDev: () => dev,
    subscribe(cb: () => void) {
        listeners.add(cb);
        return () => void listeners.delete(cb);
    },
    async refresh() {
        const res = await Native.accountStatus?.().catch(() => undefined);
        const next = !!res?.ok && res.admin === true;
        if (next === dev) return;
        dev = next;
        listeners.forEach(l => l());
    },
};
