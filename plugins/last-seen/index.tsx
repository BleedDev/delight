/**
 * When someone was last online and when they last sent a message, as far as this client has seen.
 *
 * - Presence: PRESENCE_UPDATES names who changed; once the dispatch settles, PresenceStore's
 *   combined status says whether they're online (online/idle/dnd) or went offline. Going offline
 *   stamps "last seen". On start and on reconnect everyone online in PresenceStore is seeded, and
 *   anyone we had online who isn't anymore is marked as gone.
 * - Messages: MESSAGE_CREATE stamps "last message" on the author.
 * - Storage: IndexedDB (Discord removes window.localStorage), one record, written at most every
 *   30 seconds and on stop/unload. Capped at 5000 people, least recently seen dropped first.
 * - Profiles: a clock badge through Discord's profile badges hook (the one Badges and Platform
 *   Indicators use); hovering shows "Last seen 3h ago · Last message 2d ago".
 * - Member list: a source patch wraps the row's subtext, so offline members get "Last seen 3h ago".
 */
import { Components, definePlugin, filters, getStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { DEFAULT_CAP, describe, deserialize, formatRelative, isOnlineStatus, observeMessage, observePresence, serialize } from "./track";
import type { Tracker } from "./track";

/** Discord's `(displayProfile, hideLegacyUsername?) => ProfileBadge[]` */
const profileBadgesFilter = filters.byCode("getBadges()??[]", "hidePersonalInformation");

const SAVE_EVERY = 30_000;
const DB_NAME = "evi-last-seen";
const DB_STORE = "kv";
const DB_KEY = "data";

const settings = {
    showOnProfiles: { type: "boolean", label: "On profiles", description: "A clock next to the badges on someone's profile; hover it for the times.", default: true },
    showInMemberList: { type: "boolean", label: "In the member list", description: "Under the name of offline members.", default: true },
    ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't track bots and apps.", default: true },
} as const;

const MUTED = "#949ba4";
const CLOCK = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`,
)}`;

// --- Storage ---------------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGet(): Promise<unknown> {
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

async function dbPut(value: unknown): Promise<void> {
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

// --- State -----------------------------------------------------------------------------------

let context: PluginContext<typeof settings> | undefined;
let tracker: Tracker = new Map();
let dirty = false;
/** Observations made before the saved data finished loading, merged in afterwards */
let loaded = false;

const store = (name: string) => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

const ownId = () => store("UserStore")?.getCurrentUser?.()?.id as string | undefined;
const statusOf = (id: string) => store("PresenceStore")?.getStatus?.(id) as string | undefined;

function ignored(id: string, bot?: boolean) {
    if (!id || id === ownId()) return true;
    if (!context?.settings.get("ignoreBots")) return false;
    return bot ?? !!store("UserStore")?.getUser?.(id)?.bot;
}

/** Re-renders the member list lines: on data changes (throttled) and once a minute for the relative times */
let version = 0;
const listeners = new Set<() => void>();
let bumpTimer: ReturnType<typeof setTimeout> | undefined;
const bumpNow = () => {
    clearTimeout(bumpTimer);
    bumpTimer = undefined;
    version++;
    listeners.forEach(l => l());
};
const bumpSoon = () => {
    bumpTimer ??= setTimeout(bumpNow, 5000);
};

function useVersion() {
    React.useSyncExternalStore(
        cb => {
            listeners.add(cb);
            return () => void listeners.delete(cb);
        },
        () => version,
    );
}

function changed() {
    dirty = true;
    bumpSoon();
}

async function save() {
    if (!dirty || !loaded) return;
    dirty = false;
    try {
        await dbPut(serialize(tracker, Date.now()));
    } catch (e) {
        dirty = true;
        context?.logger.error("Couldn't save", e);
    }
}

// --- Observing -------------------------------------------------------------------------------

const pending = new Map<string, boolean | undefined>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** Reads PresenceStore after the dispatch has settled, so it reflects the update */
function flushPresences() {
    flushTimer = undefined;
    const now = Date.now();
    let any = false;
    for (const [id, bot] of pending) {
        if (ignored(id, bot)) continue;
        any = observePresence(tracker, id, statusOf(id), now) || any;
    }
    pending.clear();
    if (any) changed();
}

/** Everyone online right now counts as seen; anyone we had online who no longer is went offline */
function seed() {
    const presence = store("PresenceStore");
    const statuses = presence?.getState?.()?.statuses as Record<string, string> | undefined;
    const now = Date.now();
    let any = false;
    if (statuses) {
        for (const id in statuses) {
            if (isOnlineStatus(statuses[id]) && !ignored(id)) any = observePresence(tracker, id, statuses[id], now) || any;
        }
    }
    for (const [id, entry] of tracker) {
        if (entry.online && !isOnlineStatus(statusOf(id))) any = observePresence(tracker, id, "offline", now) || any;
    }
    if (any) changed();
}

function text(userId: string) {
    return describe(tracker.get(userId), isOnlineStatus(statusOf(userId)), Date.now());
}

// --- UI --------------------------------------------------------------------------------------

function MemberLastSeen({ userId }: { userId: string; }) {
    useVersion();
    if (!context?.settings.get("showInMemberList")) return null;
    if (isOnlineStatus(statusOf(userId))) return null;
    const seen = tracker.get(userId)?.seen;
    if (!seen) return null;
    const full = text(userId) ?? "";
    const Tooltip = Components.Tooltip;
    const line = <span className="evi-last-seen-sub">Last seen {formatRelative(seen, Date.now())}</span>;
    return Tooltip ? <Tooltip text={full}>{line}</Tooltip> : <span title={full}>{line}</span>;
}

function ClearPanel() {
    useVersion();
    const Button = Components.Button as any;
    const count = tracker.size;
    const clear = () => {
        tracker = new Map();
        dirty = false;
        dbPut(undefined).catch(e => context?.logger.error("Couldn't clear", e));
        bumpNow();
        context?.toast("Last Seen data cleared");
    };
    const label = "Clear data";
    return (
        <div className="dl-field-row">
            <div className="dl-field-text">
                <div className="dl-label">Remembered</div>
                <p className="dl-hint" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {count} {count === 1 ? "person" : "people"}, up to {DEFAULT_CAP}. Kept on this device only.
                </p>
            </div>
            {Button
                ? <Button color={Button.Colors?.RED} size={Button.Sizes?.SMALL} disabled={!count} onClick={clear}>{label}</Button>
                : <button type="button" className="dl-button" disabled={!count} onClick={clear}>{label}</button>}
        </div>
    );
}

const css = `
.evi-last-seen-sub { color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

export default definePlugin({
    settings,

    patches: [
        {
            // The member row: subText:(0,r.jsx)(ed,{hideSubtext:U,activities:T,status:S,…,user:h,…})
            find: "hideSubtext:",
            replace: {
                match: /subText:(\(0,\i\.jsx\)\(\i,\{hideSubtext:\i,activities:\i,status:(\i),[^}]*?user:(\i)[^}]*\}\))/,
                with: "subText:$self.memberSubText($1,$3,$2)",
            },
        },
    ],

    memberSubText(original: unknown, user: { id?: string; bot?: boolean; } | null | undefined, status: string | undefined) {
        if (!context || !user?.id || isOnlineStatus(status) || ignored(user.id, user.bot)) return original;
        return <>{original}<MemberLastSeen key="evi-last-seen" userId={user.id} /></>;
    },

    flux: {
        PRESENCE_UPDATES(action: any) {
            if (!context) return;
            for (const u of action?.updates ?? []) {
                const id = u?.user?.id;
                if (typeof id === "string") pending.set(id, u.user.bot);
            }
            flushTimer ??= setTimeout(flushPresences, 0);
        },
        MESSAGE_CREATE(action: any) {
            if (!context || action?.optimistic) return;
            const message = action?.message;
            const author = message?.author;
            if (!author?.id || message.webhook_id || ignored(author.id, author.bot)) return;
            const at = Date.parse(message.timestamp);
            observeMessage(tracker, author.id, Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now());
            changed();
        },
        CONNECTION_OPEN() {
            if (context) setTimeout(seed, 1000);
        },
    },

    start(ctx) {
        context = ctx;
        tracker = new Map();
        loaded = false;
        ctx.addStyle(css);

        dbGet().then(data => {
            if (context !== ctx) return;
            // Merge what was seen while loading on top of the saved data
            const live = tracker;
            tracker = deserialize(data);
            for (const [id, entry] of live) {
                const old = tracker.get(id);
                tracker.delete(id);
                tracker.set(id, { ...old, ...entry, message: Math.max(old?.message ?? 0, entry.message ?? 0) || undefined });
            }
            loaded = true;
            seed();
            dirty = true;
            bumpNow();
        }).catch(e => {
            ctx.logger.error("Couldn't load saved data", e);
            loaded = true;
            seed();
        });

        ctx.setInterval(() => void save(), SAVE_EVERY);
        ctx.setInterval(bumpNow, 60_000);
        const onUnload = () => void save();
        window.addEventListener("beforeunload", onUnload);
        ctx.onDispose(() => window.removeEventListener("beforeunload", onUnload));
        ctx.settings.onChange(bumpNow);

        ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
            if (!ctx.settings.get("showOnProfiles")) return;
            const userId = args[0]?.userId as string | undefined;
            if (!userId || userId === ownId()) return;
            const description = text(userId);
            if (!description) return;
            return [...(Array.isArray(result) ? result : []), { id: "evi-last-seen", description, iconSrc: CLOCK }];
        });
    },

    stop() {
        void save();
        clearTimeout(flushTimer);
        flushTimer = undefined;
        pending.clear();
        context = undefined;
        bumpNow();
    },

    settingsPanel: () => <ClearPanel />,
});
