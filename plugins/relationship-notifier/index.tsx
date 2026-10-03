import { Components, definePlugin, Dispatcher, filters, findStore, React } from "@evi/api";
import type { FluxAction, HookContext, PluginContext } from "@evi/api";

import { t } from "./strings";
import { decide, NotificationKind, NotificationLog, RelationshipNotification, Scope, storeLookup, Tracker } from "./events";

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
    friendRemoved: { type: "boolean", get label() { return t("settings.friendRemoved"); }, get description() { return t("settings.friendRemoved.description"); }, default: true },
    requestCancelled: { type: "boolean", get label() { return t("settings.requestCancelled"); }, get description() { return t("settings.requestCancelled.description"); }, default: true },
    groupRemoved: { type: "boolean", get label() { return t("settings.groupRemoved"); }, get description() { return t("settings.groupRemoved.description"); }, default: true },
    serverRemoved: { type: "boolean", get label() { return t("settings.serverRemoved"); }, get description() { return t("settings.serverRemoved.description"); }, default: true },
    showToasts: { type: "boolean", get label() { return t("settings.showToasts"); }, get description() { return t("settings.showToasts.description"); }, default: true },
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

/** Hooks each of `methods` that exists on the export, marking its first argument as your own action */
function markOwn(ctx: Ctx, tracker: Tracker, props: string[], methods: string[], scope: Scope) {
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

/** What the toast and log say, in Discord's language (the entry keeps its English text) */
const textOf = (entry: RelationshipNotification) => t(`text.${entry.kind}`, { name: entry.name });

function formatTime(ms: number) {
    const date = new Date(ms);
    return date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function LogPanel({ log }: { log: NotificationLog; }) {
    const entries = React.useSyncExternalStore(log.subscribe, () => log.entries);
    const Button = Components.Button as any;
    const label = t("log.clear");
    return (
        <div>
            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label">{t("log.recent")}</div>
                    <p className="dl-hint" role="status">
                        {entries.length ? t("log.count", { count: entries.length }) : t("log.empty")}
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
                            {textOf(entry)}
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
            if (ctx.settings.get("showToasts")) ctx.toast(textOf(entry), { type: "info", duration: 6000 });
        };

        // Before any store applies the action, so names are still there
        ctx.hook.before(Dispatcher, "dispatch", ({ args }: HookContext) => {
            const action = args[0] as FluxAction;
            if (!action || !TYPES.has(action.type)) return;
            try {
                const entry = decide(action, storeLookup(store), tracker);
                if (entry) report(entry);
            } catch (e) {
                ctx.logger.error("Couldn't check", action.type, e);
            }
        });

        ctx.command({
            name: "relationships",
            get description() { return t("command.description"); },
            execute() {
                const entries = log.entries;
                if (!entries.length) return { ephemeral: t("command.empty") };
                return { ephemeral: entries.slice(0, 20).map(e => `${formatTime(e.at)}  ${textOf(e)}`).join("\n") };
            },
        });
    },

    settingsPanel: () => active && <LogPanel log={active.log} />,

    /** The running plugin's log, for tests and debugging */
    getLog: () => active?.log,
});
