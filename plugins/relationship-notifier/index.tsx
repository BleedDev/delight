import { Components, definePlugin, Dispatcher, filters, findStore, React } from "@evi/api";
import type { FluxAction, HookContext, PluginContext } from "@evi/api";

import { decide, Lookup, NotificationKind, NotificationLog, RelationshipNotification, Tracker } from "./events";

/**
 * Tells you when someone removes you as a friend, declines your friend request, or removes you
 * from a group DM or server. No source patches:
 *
 * - A "before" hook on Dispatcher.dispatch sees each action before any store applies it, so the
 *   friend, group or server is still in the stores and its name can be shown.
 * - Things you do yourself go through Discord's action creators (removeFriend, leaveGuild,
 *   closePrivateChannel...). Those are hooked to mark the id as yours, and never reported.
 * - The log is memory only, like Message Logger: gone when Discord restarts or the plugin stops.
 */

const settings = {
    friendRemoved: { type: "boolean", label: "Friend removals", description: "Someone removes you from their friends.", default: true },
    requestCancelled: { type: "boolean", label: "Declined friend requests", description: "A friend request you sent is declined or cancelled.", default: true },
    groupRemoved: { type: "boolean", label: "Group DM removals", description: "Someone removes you from a group DM. Leaving yourself isn't reported.", default: true },
    serverRemoved: { type: "boolean", label: "Server removals", description: "You're kicked or banned from a server, or it's deleted. Leaving yourself isn't reported.", default: true },
    showToasts: { type: "boolean", label: "Show toasts", description: "Pop up a toast. When off, it's only logged here and in /relationships.", default: true },
} as const satisfies Record<NotificationKind | "showToasts", unknown>;

type Ctx = PluginContext<typeof settings>;

const TYPES = new Set(["RELATIONSHIP_REMOVE", "CHANNEL_DELETE", "CHANNEL_RECIPIENT_REMOVE", "GUILD_DELETE"]);

let active: { log: NotificationLog; } | undefined;

function store(name: string): any {
    try {
        return findStore(name);
    } catch {
        return undefined;
    }
}

function createLookup(): Lookup {
    const users = store("UserStore");
    const relationships = store("RelationshipStore");
    const channels = store("ChannelStore");
    const guilds = store("GuildStore");
    const userName = (id: string): string | undefined => {
        const nick = relationships?.getNickname?.(id);
        if (nick) return nick;
        const user = users?.getUser?.(id);
        return user ? user.globalName ?? user.global_name ?? user.username : undefined;
    };
    return {
        currentUserId: users?.getCurrentUser?.()?.id,
        relationshipType: id => relationships?.getRelationshipType?.(id),
        userName,
        channel: id => {
            const channel = channels?.getChannel?.(id);
            return channel ? { type: channel.type, name: channel.name, recipients: channel.recipients } : undefined;
        },
        guildName: id => guilds?.getGuild?.(id)?.name,
    };
}

/** Hooks each of `methods` that exists on the export, marking its first argument as your own action */
function markOwn(ctx: Ctx, tracker: Tracker, props: string[], methods: string[], scope: "relationship" | "channel" | "guild") {
    ctx.waitFor(filters.byProps(...props), module => {
        for (const method of methods) {
            if (typeof module?.[method] !== "function") continue;
            ctx.hook.before(module, method, ({ args }: HookContext) => {
                const id = args[0];
                if (typeof id === "string") tracker.markSelf(scope, id);
            });
        }
    });
}

function formatTime(ms: number) {
    const date = new Date(ms);
    return date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function LogPanel({ log }: { log: NotificationLog; }) {
    const entries = React.useSyncExternalStore(log.subscribe, () => log.entries);
    const Button = Components.Button as any;
    const label = "Clear log";
    return (
        <div>
            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label">Recent</div>
                    <p className="dl-hint" role="status">
                        {entries.length ? `${entries.length} since Discord started. Kept in memory only.` : "Nothing yet. Kept in memory only."}
                    </p>
                </div>
                {Button
                    ? <Button color={Button.Colors?.RED} size={Button.Sizes?.SMALL} disabled={!entries.length} onClick={() => log.clear()}>{label}</Button>
                    : <button type="button" className="dl-button" disabled={!entries.length} onClick={() => log.clear()}>{label}</button>}
            </div>
            {entries.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {entries.map((entry, i) => (
                        <li key={`${entry.at}-${entry.id}-${i}`} className="dl-hint" style={{ padding: "0.125rem 0" }}>
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

export default definePlugin({
    settings,

    start(ctx) {
        const log = new NotificationLog();
        const tracker = new Tracker();
        const runtime = { log };
        active = runtime;
        ctx.onDispose(() => {
            if (active === runtime) active = undefined;
            log.clear();
        });

        markOwn(ctx, tracker, ["removeRelationship", "addRelationship"], ["removeRelationship", "removeFriend", "cancelFriendRequest", "blockUser"], "relationship");
        markOwn(ctx, tracker, ["leaveGuild"], ["leaveGuild", "deleteGuild"], "guild");
        markOwn(ctx, tracker, ["closePrivateChannel"], ["closePrivateChannel"], "channel");

        const report = (entry: RelationshipNotification) => {
            if (!ctx.settings.get(entry.kind)) return;
            log.add(entry);
            if (ctx.settings.get("showToasts")) ctx.toast(entry.text, { type: "info", duration: 6000 });
        };

        // Before any store applies the action, so names are still there
        ctx.hook.before(Dispatcher, "dispatch", ({ args }: HookContext) => {
            const action = args[0] as FluxAction;
            if (!action || !TYPES.has(action.type)) return;
            try {
                const entry = decide(action, createLookup(), tracker);
                if (entry) report(entry);
            } catch (e) {
                ctx.logger.error("Couldn't check", action.type, e);
            }
        });

        ctx.command({
            name: "relationships",
            description: "Friend, group DM and server removals since Discord started",
            execute() {
                const entries = log.entries;
                if (!entries.length) return { ephemeral: "Nothing yet: no removals since Discord started." };
                return { ephemeral: entries.slice(0, 20).map(e => `${formatTime(e.at)}  ${e.text}`).join("\n") };
            },
        });
    },

    settingsPanel: () => active && <LogPanel log={active.log} />,

    /** The running plugin's log, for tests and debugging */
    getLog: () => active?.log,
});
