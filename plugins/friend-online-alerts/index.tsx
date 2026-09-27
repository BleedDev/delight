import { Components, definePlugin, filters, find, getStore, Menu, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import {
    Alert, AlertConfig, AlertEngine, isWatched, messageFor, parseWatchList, shouldDeliver, snapshotOf, STARTUP_GRACE_MS, toggleWatch,
} from "./alerts";

/**
 * Tells you when the people you pick come online (and optionally go offline, start a game or
 * start streaming). No source patches:
 *
 * - PRESENCE_UPDATES names who changed; once the dispatch settles, PresenceStore's status and
 *   activities give the new snapshot, which alerts.ts compares with the last one. Go Live streams
 *   come from voice states, so VOICE_STATE_UPDATES re-checks watched people too.
 * - CONNECTION_OPEN (READY), its supplemental half (friend presences) and CONNECTION_RESUMED start a
 *   grace period in which snapshots only update the baseline; at its end everyone watched is
 *   re-read from PresenceStore, silently.
 * - Desktop notifications go through Discord's own notification util (the one it uses for "X is
 *   playing Y"), so they look like Discord's and clicking opens the DM. Sounds are Discord's too.
 * - Your own status: nothing is shown or played while you're on Do Not Disturb, unless you ask.
 * - The watch list lives in this plugin's settings under a key the generated panel doesn't show.
 */

const WATCH_KEY = "watched";
const LOG_SIZE = 30;

const SOUNDS = [
    { label: "No sound", value: "none" },
    { label: "Message", value: "message1" },
    { label: "Soft ping", value: "message2" },
    { label: "Chime", value: "message3" },
    { label: "Mention", value: "mention1" },
    { label: "User joined", value: "user_join" },
    { label: "Stream started", value: "stream_started" },
    { label: "Success", value: "success" },
] as const;

const settings = {
    watchAllFriends: { type: "boolean", label: "Watch all friends", description: "Alert for every friend, not only the people you pick.", default: false },
    showToast: { type: "boolean", label: "In-app toast", description: "A toast at the top of Discord.", default: true },
    showDesktop: { type: "boolean", label: "Desktop notification", description: "A Windows notification, like Discord's own. Clicking it opens the DM.", default: true },
    sound: { type: "select", label: "Sound", description: "One of Discord's sounds.", default: "message2", options: SOUNDS },
    volume: { type: "number", label: "Sound volume", description: "Percent.", default: 40, min: 0, max: 100, step: 5 },
    alertInDnd: { type: "boolean", label: "Alert even in Do Not Disturb", description: "Otherwise nothing shows or plays while your status is Do Not Disturb.", default: false },
    onOffline: { type: "boolean", label: "When they go offline", default: false },
    onGame: { type: "boolean", label: "When they start playing a game", default: false },
    onStream: { type: "boolean", label: "When they start streaming", default: false },
    flapMinutes: {
        type: "number",
        label: "Ignore reconnects (minutes)",
        description: "Coming back online this soon after going offline isn't announced. 0 announces every time.",
        default: 5,
        min: 0,
        max: 60,
    },
    cooldownMinutes: {
        type: "number",
        label: "Cooldown per person (minutes)",
        description: "At most one alert of each kind per person in this time. 0 turns it off.",
        default: 2,
        min: 0,
        max: 120,
    },
} as const;

type Ctx = PluginContext<typeof settings>;

interface LogEntry { at: number; userId: string; text: string; }

let ctx: Ctx | undefined;
let engine = new AlertEngine();
let log: LogEntry[] = [];

const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
    version++;
    listeners.forEach(l => l());
};
const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
};

// ---- Discord ------------------------------------------------------------------------------------

const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

const selfId = () => store("UserStore")?.getCurrentUser?.()?.id as string | undefined;
const isFriend = (id: string) => !!store("RelationshipStore")?.isFriend?.(id);

function userName(id: string): string {
    const nick = store("RelationshipStore")?.getNickname?.(id);
    if (nick) return nick;
    const user = store("UserStore")?.getUser?.(id);
    return user ? user.globalName ?? user.global_name ?? user.username ?? id : id;
}

function avatarUrl(id: string): string | undefined {
    try {
        return store("UserStore")?.getUser?.(id)?.getAvatarURL?.(undefined, 128);
    } catch {
        return undefined;
    }
}

function selfStatus(): string | undefined {
    return store("SelfPresenceStore")?.getStatus?.() ?? store("PresenceStore")?.getStatus?.(selfId());
}

function snapshot(id: string) {
    const presence = store("PresenceStore");
    let goLive = false;
    try {
        goLive = store("ApplicationStreamingStore")?.getAnyStreamForUser?.(id) != null;
    } catch { /* not loaded */ }
    return snapshotOf(presence?.getStatus?.(id), presence?.getActivities?.(id), goLive);
}

/** Whether PresenceStore knows anything about them (friends are always known after READY) */
function presenceKnown(id: string) {
    const statuses = store("PresenceStore")?.getState?.()?.statuses;
    return isFriend(id) || (statuses != null && id in statuses);
}

/** Discord's notification util: { showNotification(icon, title, body, trackingProps, options), playNotificationSound(name, volume) } */
const notificationUtil = (): any => find(filters.byProps("showNotification", "playNotificationSound", "requestPermission"));
const privateChannelActions = (): any => find(filters.byProps("openPrivateChannel", "getOrEnsurePrivateChannel"));

function openDm(userId: string) {
    try {
        privateChannelActions()?.openPrivateChannel?.({ recipientIds: userId });
    } catch (e) {
        ctx?.logger.error("Couldn't open the DM", e);
    }
}

// ---- Watch list ---------------------------------------------------------------------------------

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => ctx?.settings as unknown as Storage | undefined;

const watchList = (): string[] => parseWatchList(storage()?.get(WATCH_KEY));

function setWatchList(list: string[]) {
    storage()?.set(WATCH_KEY, list);
    bump();
}

/** `list`: the watch list, read once by callers checking many people (it's validated on each read) */
function watched(id: string, list: ReadonlySet<string> | readonly string[] = watchList()) {
    return !!ctx && isWatched(id, list, ctx.settings.get("watchAllFriends"), isFriend, selfId());
}

function toggle(id: string) {
    const list = watchList();
    const adding = !list.includes(id);
    setWatchList(toggleWatch(list, id));
    // Start from what they're doing now, so adding someone online doesn't announce them
    if (adding && presenceKnown(id)) engine.seed(id, snapshot(id), Date.now());
    else if (!watched(id)) engine.forget(id);
    ctx?.toast(adding ? `Online alerts on for ${userName(id)}` : `Online alerts off for ${userName(id)}`, { type: "success" });
}

/** Everyone watched right now */
function everyoneWatched(): string[] {
    if (!ctx) return [];
    const ids = new Set(watchList());
    if (ctx.settings.get("watchAllFriends")) {
        for (const id of store("RelationshipStore")?.getFriendIDs?.() ?? []) ids.add(id);
    }
    ids.delete(selfId() ?? "");
    return [...ids];
}

/** Re-reads everyone watched from PresenceStore without alerting */
function seedAll() {
    const now = Date.now();
    for (const id of everyoneWatched()) {
        if (presenceKnown(id)) engine.seed(id, snapshot(id), now);
    }
}

// ---- Alerts -------------------------------------------------------------------------------------

function config(): AlertConfig {
    const s = ctx!.settings;
    return {
        online: true,
        offline: s.get("onOffline"),
        game: s.get("onGame"),
        stream: s.get("onStream"),
        flapMs: Math.max(0, s.get("flapMinutes")) * 60_000,
        cooldownMs: Math.max(0, s.get("cooldownMinutes")) * 60_000,
    };
}

function deliver(alert: Alert) {
    if (!ctx) return;
    const s = ctx.settings;
    const message = messageFor(alert, userName(alert.userId));
    log = [{ at: Date.now(), userId: alert.userId, text: message.text }, ...log].slice(0, LOG_SIZE);
    bump();

    if (!shouldDeliver(selfStatus(), s.get("alertInDnd"))) return;

    if (s.get("showToast")) ctx.toast(message.text, { type: "info", duration: 5000 });

    const util = notificationUtil();
    if (s.get("showDesktop")) {
        try {
            void Promise.resolve(util?.showNotification?.(avatarUrl(alert.userId), message.title, message.body, {}, {
                tag: `evi-foa-${alert.userId}-${alert.kind}`,
                isUserAvatar: true,
                omitViewTracking: true,
                omitClickTracking: true,
                onClick: () => openDm(alert.userId),
            })).catch(e => ctx?.logger.error("Desktop notification failed", e));
        } catch (e) {
            ctx.logger.error("Desktop notification failed", e);
        }
    }

    const sound = s.get("sound");
    if (sound !== "none") {
        try {
            void Promise.resolve(util?.playNotificationSound?.(sound, Math.min(1, Math.max(0, s.get("volume") / 100)))).catch(() => { });
        } catch (e) {
            ctx.logger.error("Sound failed", e);
        }
    }
}

const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** Reads PresenceStore after the dispatch has settled, so it reflects the update */
function flush() {
    flushTimer = undefined;
    if (!ctx) return pending.clear();
    const now = Date.now();
    const cfg = config();
    // A presence burst can hold thousands of people: read the list once, not once each
    const list = new Set(watchList());
    for (const id of pending) {
        if (!watched(id, list)) continue;
        for (const alert of engine.observe(id, snapshot(id), now, cfg)) deliver(alert);
    }
    pending.clear();
}

function queue(id: unknown) {
    if (typeof id !== "string" || !ctx) return;
    pending.add(id);
    flushTimer ??= setTimeout(flush, 0);
}

let graceTimer: ReturnType<typeof setTimeout> | undefined;
/** Starts (or extends) the quiet period, then re-reads everyone silently when it ends */
function grace() {
    engine.beginGrace(Date.now(), STARTUP_GRACE_MS);
    clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
        graceTimer = undefined;
        if (ctx) seedAll();
    }, STARTUP_GRACE_MS + 100);
}

// ---- Settings panel -----------------------------------------------------------------------------

function useVersion() {
    React.useSyncExternalStore(subscribe, () => version);
}

function formatTime(ms: number) {
    const date = new Date(ms);
    return date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function SmallButton({ children, onClick, disabled, danger, label }: { children: React.ReactNode; onClick(): void; disabled?: boolean; danger?: boolean; label?: string; }) {
    const Button = Components.Button as any;
    return Button
        ? <Button color={danger ? Button.Colors?.RED : Button.Colors?.PRIMARY} size={Button.Sizes?.SMALL} disabled={disabled} onClick={onClick} aria-label={label}>{children}</Button>
        : <button type="button" className="dl-button" disabled={disabled} onClick={onClick} aria-label={label}>{children}</button>;
}

function WatchPanel() {
    useVersion();
    const [input, setInput] = React.useState("");
    const list = watchList();
    const all = ctx?.settings.get("watchAllFriends");
    const id = input.trim();
    const valid = /^\d{15,25}$/.test(id) && id !== selfId();
    const add = () => {
        if (!valid) return;
        if (!list.includes(id)) toggle(id);
        setInput("");
    };

    return (
        <div>
            <div className="dl-field-text">
                <div className="dl-label">Watched people</div>
                <p className="dl-hint" role="status">
                    {list.length
                        ? `${list.length} ${list.length === 1 ? "person" : "people"}${all ? ", plus all your friends" : ""}.`
                        : all ? "All your friends. Right-click anyone else and pick Online Alerts to add them." : "Nobody yet. Right-click someone and pick Online Alerts, or add a user ID here."}
                </p>
            </div>
            {list.length > 0 && (
                <ul style={{ listStyle: "none", margin: "0.5rem 0", padding: 0 }}>
                    {list.map(userId => {
                        const avatar = avatarUrl(userId);
                        const name = userName(userId);
                        return (
                            <li key={userId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" }}>
                                {avatar
                                    ? <img src={avatar} alt="" width={24} height={24} style={{ borderRadius: "50%", flexShrink: 0 }} />
                                    : <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--background-modifier-accent, #4e505880)", flexShrink: 0 }} />}
                                <span className="dl-hint" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                                    {name}{name === userId ? "" : ` (${userId})`}
                                </span>
                                <SmallButton danger label={`Stop watching ${name}`} onClick={() => toggle(userId)}>Remove</SmallButton>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
                <input
                    className="dl-input"
                    style={{ flex: 1 }}
                    aria-label="User ID to watch"
                    placeholder="User ID"
                    inputMode="numeric"
                    value={input}
                    onChange={e => setInput(e.currentTarget.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") add();
                    }}
                />
                <SmallButton disabled={!valid || list.includes(id)} onClick={add}>Add</SmallButton>
            </div>

            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label">Recent</div>
                    <p className="dl-hint">{log.length ? "Since Discord started. Kept in memory only." : "No alerts yet. Kept in memory only."}</p>
                </div>
                <SmallButton danger disabled={!log.length} onClick={() => { log = []; bump(); }}>Clear</SmallButton>
            </div>
            {log.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {log.map((entry, i) => (
                        <li key={`${entry.at}-${entry.userId}-${i}`} className="dl-hint" style={{ padding: "0.125rem 0" }}>
                            <time dateTime={new Date(entry.at).toISOString()} style={{ fontVariantNumeric: "tabular-nums", marginInlineEnd: "0.5rem" }}>
                                {formatTime(entry.at)}
                            </time>
                            {entry.text}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ---- Plugin -------------------------------------------------------------------------------------

export default definePlugin({
    settings,

    flux: {
        PRESENCE_UPDATES(action: any) {
            for (const update of action?.updates ?? []) queue(update?.user?.id);
        },
        VOICE_STATE_UPDATES(action: any) {
            if (!ctx?.settings.get("onStream")) return;
            for (const state of action?.voiceStates ?? []) queue(state?.userId);
        },
        CONNECTION_OPEN() {
            if (ctx) grace();
        },
        CONNECTION_OPEN_SUPPLEMENTAL() {
            if (ctx) grace();
        },
        CONNECTION_RESUMED() {
            if (ctx) grace();
        },
    },

    start(context) {
        ctx = context;
        engine = new AlertEngine();
        log = [];
        // Whatever arrives right after start is the startup burst, not people coming online
        grace();
        seedAll();

        context.settings.onChange(() => {
            // Newly watched friends start from their current state
            const now = Date.now();
            for (const id of everyoneWatched()) if (!engine.has(id) && presenceKnown(id)) engine.seed(id, snapshot(id), now);
            bump();
        });

        context.contextMenu("user-context", (children, props) => {
            const userId: string | undefined = props.user?.id;
            if (!userId || userId === selfId()) return;
            const explicit = watchList().includes(userId);
            const viaFriends = !explicit && !!ctx?.settings.get("watchAllFriends") && isFriend(userId);
            children.push(
                <Menu.Group key="evi-foa-group">
                    <Menu.CheckboxItem
                        id="evi-foa-toggle"
                        label="Online Alerts"
                        subtext={viaFriends ? "On for all friends" : undefined}
                        checked={explicit || viaFriends}
                        disabled={viaFriends}
                        action={() => toggle(userId)}
                    />
                </Menu.Group>,
            );
        });
    },

    stop() {
        clearTimeout(flushTimer);
        clearTimeout(graceTimer);
        flushTimer = graceTimer = undefined;
        pending.clear();
        engine.clear();
        log = [];
        ctx = undefined;
        bump();
    },

    settingsPanel: () => <WatchPanel />,
});
