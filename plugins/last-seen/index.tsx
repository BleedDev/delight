/**
 * When someone was last online, last active and last sent a message, as far as this client has seen.
 *
 * - Presence: PRESENCE_UPDATES names who changed; once the dispatch settles, PresenceStore's
 *   combined status says whether they're online (online/idle/dnd) or went offline. Going offline
 *   stamps "last seen". On start and on reconnect everyone online in PresenceStore is seeded, and
 *   anyone we had online who isn't anymore is marked as gone. Someone online when Discord closed
 *   gets an approximate time ("in the last 3h").
 * - Activity: typing, joining or leaving voice and reacting stamp "last active".
 * - Messages: MESSAGE_CREATE stamps "last message" and where; LOAD_MESSAGES_SUCCESS (opening or
 *   scrolling a channel) backfills it from history.
 * - Storage: IndexedDB (Discord removes window.localStorage), one record, written at most every
 *   30 seconds and on stop/unload. Capped at 25000 people, least recently seen dropped first,
 *   friends and DM contacts last.
 * - Profiles: a clock badge through ctx.profileBadges, also listed in Discord's badge directory;
 *   hovering shows the full summary, clicking jumps to their last message.
 * - Member list, friends list, DM list: a line under offline people's names (source patches).
 */
import { definePlugin, React } from "@evi/api";

import { dmMethods, dmPatches } from "./dms";
import { friendsMethods, friendsPatches } from "./friends";
import { LastSeenLine, lineCss } from "./line";
import { SettingsPanel } from "./panel";
import { bumpNow, changed, dbGet, fullText, ignored, isOnline, opts, ownId, save, settings, state, statusOf, store } from "./state";
import { deserialize, isOnlineStatus, merge, observeActivity, observeMessage, observePresence } from "./track";

const SAVE_EVERY = 30_000;

const MUTED = "#949ba4";
const CLOCK = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`,
)}`;

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
        any = observePresence(state.tracker, id, statusOf(id), now, opts) || any;
    }
    pending.clear();
    if (any) changed();
}

/** Everyone online right now counts as seen; anyone we had online who no longer is went offline */
function seed() {
    const statuses = store("PresenceStore")?.getState?.()?.statuses as Record<string, string> | undefined;
    const now = Date.now();
    let any = false;
    if (statuses) {
        for (const id in statuses) {
            if (isOnlineStatus(statuses[id]) && !ignored(id)) any = observePresence(state.tracker, id, statuses[id], now, opts) || any;
        }
    }
    for (const [id, entry] of state.tracker) {
        if (entry.online && !isOnline(id)) any = observePresence(state.tracker, id, "offline", now, opts) || any;
    }
    if (any) changed();
}

/** Parses a message timestamp, never later than now */
function timeOf(timestamp: unknown) {
    const at = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    return Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now();
}

function message(msg: any, channelId?: string): boolean {
    const author = msg?.author;
    if (!author?.id || msg.webhook_id || ignored(author.id, author.bot)) return false;
    return observeMessage(state.tracker, author.id, timeOf(msg.timestamp), { channelId: msg.channel_id ?? channelId, messageId: msg.id }, opts);
}

function activity(id: unknown, at = Date.now()) {
    if (typeof id !== "string" || ignored(id)) return;
    if (observeActivity(state.tracker, id, at, opts)) changed();
}

/** Clicking the profile clock jumps to their last message, when we know where it was */
function messageLink(userId: string): string | undefined {
    const entry = state.tracker.get(userId);
    if (!entry?.channelId || !entry.messageId) return;
    const channel = store("ChannelStore")?.getChannel?.(entry.channelId);
    if (!channel) return;
    return `https://discord.com/channels/${channel.guild_id ?? "@me"}/${entry.channelId}/${entry.messageId}`;
}

// --- UI --------------------------------------------------------------------------------------

const css = lineCss;

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
        ...friendsPatches,
        ...dmPatches,
    ],

    memberSubText(original: unknown, user: { id?: string; bot?: boolean; } | null | undefined, status: string | undefined) {
        if (!state.context || !user?.id || isOnlineStatus(status) || ignored(user.id, user.bot)) return original;
        return <>{original}<LastSeenLine key="evi-last-seen" userId={user.id} setting="showInMemberList" /></>;
    },

    ...friendsMethods,
    ...dmMethods,

    flux: {
        PRESENCE_UPDATES(action: any) {
            if (!state.context) return;
            for (const u of action?.updates ?? []) {
                const id = u?.user?.id;
                if (typeof id === "string") pending.set(id, u.user.bot);
            }
            flushTimer ??= setTimeout(flushPresences, 0);
        },
        MESSAGE_CREATE(action: any) {
            if (!state.context || action?.optimistic) return;
            if (message(action?.message, action?.channelId)) changed();
        },
        LOAD_MESSAGES_SUCCESS(action: any) {
            if (!state.context || !Array.isArray(action?.messages)) return;
            let any = false;
            for (const msg of action.messages) any = message(msg, action.channelId) || any;
            if (any) changed();
        },
        TYPING_START(action: any) {
            if (state.context) activity(action?.userId);
        },
        MESSAGE_REACTION_ADD(action: any) {
            if (state.context && !action?.optimistic) activity(action?.userId);
        },
        VOICE_STATE_UPDATES(action: any) {
            if (!state.context) return;
            for (const vs of action?.voiceStates ?? []) activity(vs?.userId);
        },
        CONNECTION_OPEN() {
            if (state.context) setTimeout(seed, 1000);
        },
    },

    start(ctx) {
        state.context = ctx;
        state.tracker = new Map();
        state.loaded = false;
        ctx.addStyle(css);

        dbGet().then(data => {
            if (state.context !== ctx) return;
            // Merge what was seen while loading on top of the saved data
            const live = state.tracker;
            const tracker = deserialize(data, opts);
            for (const [id, entry] of live) {
                const old = tracker.get(id);
                tracker.delete(id);
                tracker.set(id, merge(old, entry));
            }
            state.tracker = tracker;
            state.loaded = true;
            seed();
            state.dirty = true;
            bumpNow();
        }).catch(e => {
            ctx.logger.error("Couldn't load saved data", e);
            state.loaded = true;
            seed();
        });

        ctx.setInterval(() => void save(), SAVE_EVERY);
        ctx.setInterval(bumpNow, 60_000);
        const onUnload = () => void save();
        window.addEventListener("beforeunload", onUnload);
        ctx.onDispose(() => window.removeEventListener("beforeunload", onUnload));
        ctx.settings.onChange(bumpNow);

        // On profiles and in Discord's badge directory, through Evi's badges
        ctx.profileBadges(userId => {
            if (!ctx.settings.get("showOnProfiles") || userId === ownId()) return;
            const description = fullText(userId);
            return description ? [{ id: "last-seen", description, iconSrc: CLOCK, link: messageLink(userId) }] : undefined;
        });
    },

    stop() {
        void save();
        clearTimeout(flushTimer);
        flushTimer = undefined;
        pending.clear();
        state.context = undefined;
        bumpNow();
    },

    settingsPanel: () => <SettingsPanel />,
});
