import { Components, definePlugin, filters, find, getStore, Menu, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import {
    Alert, AlertConfig, AlertEngine, isWatched, parseWatchList, shouldDeliver, snapshotOf, STARTUP_GRACE_MS, toggleWatch,
} from "./alerts";
import { t } from "./strings";

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
    { get label() { return t("sound.none"); }, value: "none" },
    { get label() { return t("sound.message1"); }, value: "message1" },
    { get label() { return t("sound.message2"); }, value: "message2" },
    { get label() { return t("sound.message3"); }, value: "message3" },
    { get label() { return t("sound.mention1"); }, value: "mention1" },
    { get label() { return t("sound.user_join"); }, value: "user_join" },
    { get label() { return t("sound.stream_started"); }, value: "stream_started" },
    { get label() { return t("sound.success"); }, value: "success" },
] as const;

const settings = {
    watchAllFriends: {
        type: "boolean",
        get label() { return t("settings.watchAllFriends"); },
        get description() { return t("settings.watchAllFriends.description"); },
        default: false,
    },
    showToast: {
        type: "boolean",
        get label() { return t("settings.showToast"); },
        get description() { return t("settings.showToast.description"); },
        default: true,
    },
    showDesktop: {
        type: "boolean",
        get label() { return t("settings.showDesktop"); },
        get description() { return t("settings.showDesktop.description"); },
        default: true,
    },
    sound: {
        type: "select",
        get label() { return t("settings.sound"); },
        get description() { return t("settings.sound.description"); },
        default: "message2",
        options: SOUNDS,
    },
    volume: {
        type: "number",
        get label() { return t("settings.volume"); },
        get description() { return t("settings.volume.description"); },
        default: 40,
        min: 0,
        max: 100,
        step: 5,
    },
    alertInDnd: {
        type: "boolean",
        get label() { return t("settings.alertInDnd"); },
        get description() { return t("settings.alertInDnd.description"); },
        default: false,
    },
    onOffline: { type: "boolean", get label() { return t("settings.onOffline"); }, default: false },
    onGame: { type: "boolean", get label() { return t("settings.onGame"); }, default: false },
    onStream: { type: "boolean", get label() { return t("settings.onStream"); }, default: false },
    flapMinutes: {
        type: "number",
        get label() { return t("settings.flapMinutes"); },
        get description() { return t("settings.flapMinutes.description"); },
        default: 5,
        min: 0,
        max: 60,
    },
    cooldownMinutes: {
        type: "number",
        get label() { return t("settings.cooldownMinutes"); },
        get description() { return t("settings.cooldownMinutes.description"); },
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
    ctx?.toast(t(adding ? "toast.on" : "toast.off", { name: userName(id) }), { type: "success" });
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

/** What an alert says, in Discord's language: a title (the person), the rest of the sentence, and the whole sentence */
function messageFor(alert: Alert, name: string) {
    const who = name.trim() || t("alert.someone");
    const game = alert.game;
    const key = alert.kind === "online" ? (game ? "alert.onlineGame" : "alert.online")
        : alert.kind === "offline" ? "alert.offline"
        : alert.kind === "game" ? (game ? "alert.game" : "alert.gameUnknown")
        : game ? "alert.streamGame" : "alert.stream";
    const vars = { name: who, game: game ?? "" };
    return { title: who, body: t(key, vars), text: t(`${key}.text` as `${typeof key}.text`, vars) };
}

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
                <div className="dl-label">{t("panel.watched")}</div>
                <p className="dl-hint" role="status">
                    {list.length
                        ? t(all ? "panel.countAll" : "panel.count", { count: list.length })
                        : t(all ? "panel.allFriends" : "panel.nobody")}
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
                                <SmallButton danger label={t("panel.stop", { name })} onClick={() => toggle(userId)}>{t("panel.remove")}</SmallButton>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
                <input
                    className="dl-input"
                    style={{ flex: 1 }}
                    aria-label={t("panel.userIdLabel")}
                    placeholder={t("panel.userIdPlaceholder")}
                    inputMode="numeric"
                    value={input}
                    onChange={e => setInput(e.currentTarget.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") add();
                    }}
                />
                <SmallButton disabled={!valid || list.includes(id)} onClick={add}>{t("panel.add")}</SmallButton>
            </div>

            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label">{t("panel.recent")}</div>
                    <p className="dl-hint">{t(log.length ? "panel.recent.some" : "panel.recent.none")}</p>
                </div>
                <SmallButton danger disabled={!log.length} onClick={() => { log = []; bump(); }}>{t("panel.clear")}</SmallButton>
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
                        label={t("menu.alerts")}
                        subtext={viaFriends ? t("menu.alerts.subtext") : undefined}
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
