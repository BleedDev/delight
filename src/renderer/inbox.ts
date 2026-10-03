/**
 * The store's inbox (shared/notifications.ts): the account's notifications from evi.rest (for an Evi
 * linked to one) and this install's own, in one list.
 *
 * This install's own come from watching the store: a plugin or theme you hearted has a new version or
 * a beta, a plugin you have or hearted that evi.rest said was broken works again, a new Evi is out.
 * Each is told once: what was seen is kept in settings (wishlistSeen, brokenSeen).
 */
import { EviNotification, MAX_NOTIFICATIONS, mergeNotifications, NotificationKind, NotificationLink, unreadCount } from "@shared/notifications";
import { parseStarKey } from "@shared/stars";
import { compareVersions, RegistryEntry } from "@shared/store";

import { t } from "./i18n";
import { Native } from "./native";
import { Settings } from "./settings";
import { Store } from "./store";
import { Updates } from "./updates";

interface InboxState {
    /** The account's, while this Evi is linked; empty otherwise */
    server: EviNotification[];
    /** undefined until evi.rest has answered once */
    linked?: boolean;
    loading: boolean;
    error?: string;
}

const listeners = new Set<() => void>();
let state: InboxState = { server: [], loading: false };
let merged: EviNotification[] = [];

function recompute() {
    merged = mergeNotifications(state.server, Settings.data.localNotifications ?? []);
    for (const listener of listeners) listener();
}

function set(next: Partial<InboxState>) {
    state = { ...state, ...next };
    recompute();
}

/** Adds one of this install's own, unless one with the same id is there already */
function addLocal(id: string, kind: NotificationKind, title: string, body: string, link?: NotificationLink) {
    const local = Settings.data.localNotifications ?? [];
    if (local.some(n => n.id === id)) return;
    Settings.update(d => {
        d.localNotifications = [{ id, kind, title, body, ...(link && { link }), at: Date.now(), read: false }, ...local].slice(0, MAX_NOTIFICATIONS);
    });
}

/** Looks at the store for what you'd want to hear about, and remembers what it's told */
function watchStore() {
    const s = Store.getSnapshot();
    if (s.status !== "ready") return;
    const wishlist = Settings.data.wishlist ?? [];
    const seen = { ...Settings.data.wishlistSeen };
    let changed = false;

    for (const key of wishlist) {
        const item = parseStarKey(key);
        if (!item) continue;
        const entry: { name: string; version: string; beta?: RegistryEntry["beta"]; } | undefined = item.kind === "plugin"
            ? s.plugins.find(p => p.id === item.id)
            : s.themes.find(th => th.id === item.id);
        if (!entry) continue;
        const link: NotificationLink = { kind: item.kind, id: item.id };
        const was = seen[key];
        if (was && compareVersions(entry.version, was) > 0) {
            addLocal(`local:wish:${key}@${entry.version}`, "wishlist", t("inbox.wishUpdated", { name: entry.name, version: entry.version }), t("inbox.wishUpdatedBody"), link);
        }
        if (was !== entry.version) {
            seen[key] = entry.version;
            changed = true;
        }
        const beta = entry.beta;
        if (beta && seen[`${key}#beta`] !== beta.version) {
            if (seen[`${key}#beta`] !== undefined || was) addLocal(`local:wish:${key}@${beta.version}`, "wishlist", t("inbox.wishBeta", { name: entry.name, version: beta.version }), t("inbox.wishBetaBody"), link);
            seen[`${key}#beta`] = beta.version;
            changed = true;
        }
    }

    // Plugins you have or hearted: broken, then fixed (a hotfix, or evi.rest no longer seeing it broken)
    const watched = new Set([...Object.keys(s.installed), ...wishlist.flatMap(k => k.startsWith("plugin:") ? [k.slice(7)] : [])]);
    const broken = new Set(Settings.data.brokenSeen ?? []);
    let brokenChanged = false;
    if (s.health) {
        for (const id of watched) {
            const health = s.health[id];
            const isBroken = health?.state === "broken" || health?.state === "investigating";
            if (isBroken && !broken.has(id)) {
                broken.add(id);
                brokenChanged = true;
            } else if (!isBroken && broken.has(id)) {
                broken.delete(id);
                brokenChanged = true;
                const name = s.plugins.find(p => p.id === id)?.name ?? id;
                addLocal(`local:fixed:${id}:${Date.now()}`, "fixed", t("inbox.fixed", { name }), t(health?.hotfix ? "inbox.fixedByEvi" : "inbox.fixedBody"), { kind: "plugin", id });
            }
        }
    }

    if (changed || brokenChanged) {
        Settings.update(d => {
            if (changed) d.wishlistSeen = seen;
            if (brokenChanged) d.brokenSeen = [...broken];
        });
    }
}

let started = false;
/** After startup settles, then every few hours: the store's own checks are enough when it's open */
const LOOK_FIRST_AFTER = 60_000;
const LOOK_EVERY = 6 * 60 * 60 * 1000;

export const Inbox = {
    /** Starts watching; safe to call more than once */
    start() {
        if (started) return;
        started = true;
        // Local ones live in settings: a change there (read, added, a backup restored) shows at once
        let lastLocal = Settings.data.localNotifications;
        Settings.subscribe(() => {
            if (Settings.data.localNotifications === lastLocal) return;
            lastLocal = Settings.data.localNotifications;
            recompute();
        });
        let lastStore = Store.getSnapshot();
        Store.subscribe(() => {
            const next = Store.getSnapshot();
            if (next.plugins !== lastStore.plugins || next.health !== lastStore.health || next.themes !== lastStore.themes) watchStore();
            lastStore = next;
        });
        Updates.onAvailable(status => {
            addLocal(`local:update:${status.release.version}`, "update", t("inbox.update", { version: status.release.version }), t("inbox.updateBody"));
        });
        Native.onInboxChange?.(() => void Inbox.refresh());
        recompute();
        void Inbox.refresh();
        // Hearted items only get news if the store is looked at now and then, opened or not
        const look = () => {
            if (!Settings.data.wishlist?.length || Store.getSnapshot().status === "loading") return;
            void Store.refresh();
        };
        setTimeout(look, LOOK_FIRST_AFTER);
        setInterval(look, LOOK_EVERY);
    },

    /** The account's inbox from evi.rest; says `linked: false` for an Evi that isn't linked */
    async refresh() {
        if (!Native.inbox) return;
        set({ loading: true });
        const result = await Native.inbox().catch(err => ({ ok: false as const, error: String(err) }));
        if (result.ok) return set({ server: result.value, linked: true, loading: false, error: undefined });
        const unlinked = "unlinked" in result && result.unlinked;
        set({ server: [], linked: unlinked ? false : state.linked, loading: false, error: unlinked ? undefined : result.error });
    },

    /** Marks everything read, here and on evi.rest */
    async markAllRead() {
        const local = Settings.data.localNotifications ?? [];
        if (local.some(n => !n.read)) Settings.update(d => void (d.localNotifications = local.map(n => ({ ...n, read: true }))));
        if (state.server.some(n => !n.read) && Native.markInboxRead) {
            // Shown read right away; evi.rest's answer replaces it
            set({ server: state.server.map(n => ({ ...n, read: true })) });
            const result = await Native.markInboxRead();
            if (result.ok) set({ server: result.value });
        }
    },

    /** Takes one of this install's own out of the list */
    dismiss(id: string) {
        if (!id.startsWith("local:")) return;
        Settings.update(d => void (d.localNotifications = (d.localNotifications ?? []).filter(n => n.id !== id)));
    },

    getSnapshot: () => merged,
    state: () => state,
    unread: () => unreadCount(merged),

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
};
