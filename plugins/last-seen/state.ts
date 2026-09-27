/**
 * Shared state for Last Seen: the tracker, storage, re-render signal and Discord store lookups.
 * index.tsx fills it; the UI modules (member list, friends, DMs, settings panel) read it.
 */
import { getStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { DEFAULT_CAP, describe, isOnlineStatus, serialize } from "./track";
import type { Entry, Options, Tracker } from "./track";

export const settings = {
    showOnProfiles: { type: "boolean", label: "On profiles", description: "A clock next to the badges on someone's profile; hover it for the times.", default: true },
    showInMemberList: { type: "boolean", label: "In the member list", description: "Under the name of offline members.", default: true },
    showInFriends: { type: "boolean", label: "In the friends list", description: "Under the name of offline friends.", default: true },
    showInDms: { type: "boolean", label: "In direct messages", description: "Under the name of offline people in the DM list.", default: true },
    ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't track bots and apps.", default: true },
} as const;

export type Settings = typeof settings;

export const state = {
    context: undefined as PluginContext<Settings> | undefined,
    tracker: new Map() as Tracker,
    dirty: false,
    /** False until the saved data has loaded; saving waits for it so nothing is overwritten */
    loaded: false,
};

// --- Discord stores --------------------------------------------------------------------------

export const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

export const ownId = () => store("UserStore")?.getCurrentUser?.()?.id as string | undefined;
export const statusOf = (id: string) => store("PresenceStore")?.getStatus?.(id) as string | undefined;
export const isOnline = (id: string) => isOnlineStatus(statusOf(id));

export function ignored(id: string, bot?: boolean) {
    if (!id || id === ownId()) return true;
    if (!state.context?.settings.get("ignoreBots")) return false;
    return bot ?? !!store("UserStore")?.getUser?.(id)?.bot;
}

/** DM recipients, refreshed at most once a minute: checked on every prune */
let dmIds = new Set<string>();
let dmIdsAt = 0;
function dmRecipients(): Set<string> {
    const now = Date.now();
    if (now - dmIdsAt < 60_000) return dmIds;
    dmIdsAt = now;
    const next = new Set<string>();
    try {
        const channels = store("PrivateChannelStore")?.getPrivateChannelIds?.() as string[] | undefined;
        const channelStore = store("ChannelStore");
        for (const channelId of channels ?? []) {
            const channel = channelStore?.getChannel?.(channelId);
            // Only 1:1 DMs: group DMs can have strangers in them
            if (channel?.type === 1) for (const id of channel.recipients ?? []) next.add(id);
        }
    } catch { }
    dmIds = next;
    return dmIds;
}

/** Friends and DM contacts are dropped last when the tracker is full */
export const keep = (id: string) => !!store("RelationshipStore")?.isFriend?.(id) || dmRecipients().has(id);

export const opts: Options = { cap: DEFAULT_CAP, keep };

/** "#general", "@name" for a DM, or undefined */
export function channelLabel(channelId: string | undefined): string | undefined {
    if (!channelId) return;
    const channel = store("ChannelStore")?.getChannel?.(channelId);
    if (!channel) return;
    if (channel.type === 1) return "your DMs";
    if (channel.type === 3) return channel.name ? `the group ${channel.name}` : "a group DM";
    return channel.name ? `#${channel.name}` : undefined;
}

export const entryOf = (id: string): Entry | undefined => state.tracker.get(id);

/** The full hover text for someone, or null when nothing is known */
export function fullText(id: string): string | null {
    const entry = entryOf(id);
    return describe(entry, isOnline(id), Date.now(), channelLabel(entry?.channelId));
}

// --- Re-rendering ----------------------------------------------------------------------------

/** Re-renders every Last Seen line: on data changes (throttled) and once a minute for the relative times */
let version = 0;
const listeners = new Set<() => void>();
let bumpTimer: ReturnType<typeof setTimeout> | undefined;

export function bumpNow() {
    clearTimeout(bumpTimer);
    bumpTimer = undefined;
    version++;
    listeners.forEach(l => l());
}

const bumpSoon = () => {
    bumpTimer ??= setTimeout(bumpNow, 5000);
};

export function useVersion() {
    return React.useSyncExternalStore(
        cb => {
            listeners.add(cb);
            return () => void listeners.delete(cb);
        },
        () => version,
    );
}

export function changed() {
    state.dirty = true;
    bumpSoon();
}

// --- Storage ---------------------------------------------------------------------------------

const DB_NAME = "evi-last-seen";
const DB_STORE = "kv";
const DB_KEY = "data";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function dbGet(): Promise<unknown> {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

/** Writes `value`, or deletes the record when it's undefined */
export async function dbPut(value: unknown): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            if (value === undefined) tx.objectStore(DB_STORE).delete(DB_KEY);
            else tx.objectStore(DB_STORE).put(value, DB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

export async function save() {
    if (!state.dirty || !state.loaded) return;
    state.dirty = false;
    try {
        await dbPut(serialize(state.tracker, Date.now()));
    } catch (e) {
        state.dirty = true;
        state.context?.logger.error("Couldn't save", e);
    }
}

/** Replaces all data (clear, undo, import) and saves right away */
export function replaceAll(tracker: Tracker) {
    state.tracker = tracker;
    state.dirty = true;
    state.loaded = true;
    bumpNow();
    return save();
}
