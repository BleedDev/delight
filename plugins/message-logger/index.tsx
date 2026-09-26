import { Components, definePlugin, Dispatcher, filters, React } from "@delight/api";
import type { Filter, FluxAction, HookContext, PluginContext } from "@delight/api";

import { LoggedMessage, MessageLog, MessageRef, PreviousVersion, shouldLog } from "./log";

/**
 * Deleted messages stay in the chat and edited ones keep their previous versions. No source patches:
 *
 * - Flux stores register one handler map per store with the dispatcher. We hook MessageStore's own
 *   MESSAGE_DELETE / MESSAGE_DELETE_BULK / MESSAGE_UPDATE entries in that map, so only MessageStore
 *   keeps a deleted message: read states, mentions, threads... all still see the delete.
 * - What we know lives in our own MessageLog. A message's accessories (embeds, attachments...) are
 *   rendered by an exported function, hooked to add our "Deleted" tag and edit history under it.
 *   The red tint is CSS on the list item that contains our tag.
 * - On stop, kept messages are really deleted from MessageStore (a private action only it handles),
 *   the log is cleared, so every tag and history unmounts, and the stylesheet goes.
 */

const PURGE_ACTION = "DELIGHT_MESSAGE_LOGGER_PURGE";
/** How long a delete you started waits for Discord's MESSAGE_DELETE */
const SELF_DELETE_WINDOW = 60_000;

const accessoriesFilter = filters.byCode("channelMessageProps:{message:", "isAutomodBlockedMessage:");
const renderedContentFilter = filters.byCode('"useMessageRenderedContent"', "hideSimpleEmbedContent");
/** The CSS module with Discord's `markup` class, which styles rendered message content */
const markupFilter: Filter = Object.assign(
    (v: any) => !!v && typeof v === "object" && !Array.isArray(v)
        && Object.values(v).some(c => typeof c === "string" && /^markup_+[\da-f]+$/.test(c))
        && Object.values(v).some(c => typeof c === "string" && /^codeContainer_+[\da-f]+$/.test(c)),
    { $code: [/"markup_+[\da-f]+"/] },
);

type RenderedContent = (message: any, options: Record<string, unknown>) => { content: React.ReactNode; };

// Found once and kept across restarts of the plugin: they're Discord's, not ours
let useRenderedContent: RenderedContent | undefined;
let markupClass = "";

const css = `
[data-list-item-id^="chat-messages___"]:has(.dl-ml-deleted) {
    background: color-mix(in srgb, var(--status-danger, #f23f43) 8%, transparent);
    box-shadow: inset 2px 0 0 var(--status-danger, #f23f43);
}
.dl-ml {
    text-indent: 0;
    padding: 0.125rem 0;
    font-family: var(--font-primary);
}
.dl-ml-history {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0.125rem 0;
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--border-subtle, rgba(151, 151, 159, 0.12));
}
.dl-ml-caption, .dl-ml-time, .dl-ml-deleted {
    font-size: 0.75rem;
    line-height: 1rem;
}
.dl-ml-caption {
    color: var(--text-muted, #949ba4);
    font-weight: 500;
}
.dl-ml-version {
    color: var(--text-muted, #949ba4);
    font-size: 0.875rem;
    line-height: 1.25rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}
.dl-ml-time {
    color: var(--text-muted, #949ba4);
    margin-inline-end: 0.375rem;
    font-variant-numeric: tabular-nums;
}
.dl-ml-content {
    display: inline;
}
.dl-ml-deleted {
    display: inline-block;
    color: var(--text-feedback-critical, var(--status-danger, #f23f43));
    font-weight: 500;
}
`;

function formatTime(ms: number) {
    const date = new Date(ms);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function Time({ ms }: { ms: number; }) {
    return <time className="dl-ml-time" dateTime={new Date(ms).toISOString()}>{formatTime(ms)}</time>;
}

/** An old version rendered by Discord's own message renderer: markdown, mentions, emoji */
function RichContent({ message, content, render }: { message: any; content: string; render: RenderedContent; }) {
    const record = React.useMemo(() => message.set?.("content", content) ?? { ...message, content }, [message, content]);
    const rendered = render(record, {
        hideSimpleEmbedContent: false,
        formatInline: false,
        allowLinks: true,
        allowList: true,
        allowHeading: true,
    });
    return <>{rendered?.content ?? content}</>;
}

function Version({ message, version }: { message: any; version: PreviousVersion; }) {
    const render = useRenderedContent;
    return (
        <div className="dl-ml-version">
            <Time ms={version.timestamp} />
            <div className={`dl-ml-content ${markupClass}`}>
                {render ? <RichContent message={message} content={version.content} render={render} /> : version.content}
            </div>
        </div>
    );
}

function Logged({ log, message }: { log: MessageLog; message: any; }) {
    const entry: LoggedMessage | undefined = React.useSyncExternalStore(log.subscribe, () => log.get(message.channel_id, message.id));
    if (!entry) return null;
    return (
        <div className="dl-ml">
            {entry.edits.length > 0 && (
                <div className="dl-ml-history" role="group" aria-label="Previous versions">
                    <div className="dl-ml-caption">Edited from</div>
                    {entry.edits.map((version, i) => <Version key={i} message={message} version={version} />)}
                </div>
            )}
            {entry.deletedAt !== undefined && (
                <span className="dl-ml-deleted">
                    Deleted <time dateTime={new Date(entry.deletedAt).toISOString()}>{formatTime(entry.deletedAt)}</time>
                </span>
            )}
        </div>
    );
}

interface Runtime {
    log: MessageLog;
    /** Forgets everything and removes kept deleted messages from the chat */
    clear(): void;
}

let active: Runtime | undefined;

function Summary({ runtime }: { runtime: Runtime; }) {
    React.useSyncExternalStore(runtime.log.subscribe, () => runtime.log.version);
    const { deleted, edited } = runtime.log.counts();
    const Button = Components.Button as any;
    const empty = deleted + edited === 0;
    const label = "Clear logged messages";

    return (
        <div className="dl-field-row">
            <div className="dl-field-text">
                <div className="dl-label">Logged right now</div>
                <p className="dl-hint" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {deleted} deleted, {edited} edited. Kept in memory only.
                </p>
            </div>
            {Button
                ? <Button color={Button.Colors?.RED} size={Button.Sizes?.SMALL} disabled={empty} onClick={runtime.clear}>{label}</Button>
                : <button type="button" className="dl-button" disabled={empty} onClick={runtime.clear}>{label}</button>}
        </div>
    );
}

const settings = {
    keepDeleted: { type: "boolean", label: "Keep deleted messages", description: "Deleted messages stay in the chat, tinted red and marked Deleted.", default: true },
    logEdits: { type: "boolean", label: "Keep edit history", description: "Edited messages show what they said before, under the message.", default: true },
    ignoreOwnDeletes: { type: "boolean", label: "Ignore my own deletes", description: "Messages you delete yourself disappear as usual.", default: true },
    ignoreSelf: { type: "boolean", label: "Ignore my own messages", description: "Never log your messages, whoever deletes or edits them.", default: false },
    ignoreBots: { type: "boolean", label: "Ignore bots", description: "Don't log messages from bots and apps.", default: false },
    limit: {
        type: "number",
        label: "Messages logged per channel",
        description: "Past this, the oldest are forgotten, and deleted ones among them disappear for real.",
        default: 50,
        min: 10,
        max: 200,
        step: 10,
    },
} as const;

type Ctx = PluginContext<typeof settings>;

function install(ctx: Ctx, log: MessageLog, store: any) {
    const registry = (Dispatcher as any)._actionHandlers;
    const handlers = registry?._dependencyGraph?.getNodeData?.(store.getDispatchToken?.())?.actionHandler;
    if (!handlers || !["MESSAGE_DELETE", "MESSAGE_DELETE_BULK", "MESSAGE_UPDATE"].every(t => typeof handlers[t] === "function")) {
        ctx.logger.error("Couldn't find MessageStore's action handlers, Discord changed how Flux stores register");
        return;
    }
    // The dispatcher caches each action type's handler list: rebuild it whenever ours change
    const invalidate = () => registry._invalidateCaches?.();
    ctx.onDispose(invalidate);

    let users: any;
    ctx.waitFor(filters.byStoreName("UserStore"), s => void (users = s));

    const logFilters = () => ({
        currentUserId: users?.getCurrentUser?.()?.id,
        ignoreSelf: ctx.settings.get("ignoreSelf"),
        ignoreBots: ctx.settings.get("ignoreBots"),
    });

    // Deletes you start: Discord's deleteMessage(channelId, messageId, local)
    const selfDeletes = new Map<string, number>();
    ctx.hookExport("before", filters.byProps("deleteMessage", "editMessage", "sendMessage"), "deleteMessage", ({ args }) => {
        const now = Date.now();
        for (const [key, at] of selfDeletes) if (now - at > SELF_DELETE_WINDOW) selfDeletes.delete(key);
        selfDeletes.set(`${args[0]}:${args[1]}`, now);
    });

    /** Really deletes messages from MessageStore, and nowhere else: only our private action reaches it */
    const purge = (refs: MessageRef[]) => {
        const byChannel = new Map<string, string[]>();
        for (const { channelId, id } of refs) byChannel.set(channelId, [...byChannel.get(channelId) ?? [], id]);
        return Promise.all([...byChannel].map(([channelId, ids]) => Dispatcher.dispatch({ type: PURGE_ACTION, channelId, ids })));
    };
    const purgeHandler = (action: FluxAction) =>
        handlers.MESSAGE_DELETE_BULK({ type: "MESSAGE_DELETE_BULK", channelId: action.channelId, ids: action.ids, delightPurge: true });
    handlers[PURGE_ACTION] = purgeHandler;

    const shouldKeep = (action: FluxAction, channelId: string, id: string) => {
        if (log.isDeleted(channelId, id)) return true;
        const key = `${channelId}:${id}`;
        const self = selfDeletes.delete(key);
        if (action.local || !ctx.settings.get("keepDeleted")) return false;
        if (self && ctx.settings.get("ignoreOwnDeletes")) return false;
        const message = store.getMessage(channelId, id);
        return !!message && shouldLog(message, logFilters());
    };

    ctx.hook.instead(handlers, "MESSAGE_DELETE", (call: HookContext) => {
        const action = call.args[0] as FluxAction;
        if (action.delightPurge || !shouldKeep(action, action.channelId, action.id)) return call.callOriginal(...call.args);
        void purge(log.markDeleted(action.channelId, action.id));
        // Nothing changed in the store; our tag re-renders from the log
        return false;
    });

    ctx.hook.instead(handlers, "MESSAGE_DELETE_BULK", (call: HookContext) => {
        const action = call.args[0] as FluxAction;
        if (action.delightPurge) return call.callOriginal(...call.args);
        const keep: string[] = [];
        const drop: string[] = [];
        for (const id of action.ids ?? []) (shouldKeep(action, action.channelId, id) ? keep : drop).push(id);
        const evicted = keep.flatMap(id => log.markDeleted(action.channelId, id));
        void purge(evicted);
        return drop.length ? call.callOriginal({ ...action, ids: drop }) : false;
    });

    // Before MessageStore applies an edit: the old content is still there to record
    ctx.hook.before(handlers, "MESSAGE_UPDATE", ({ args }) => {
        const next = args[0]?.message;
        if (!ctx.settings.get("logEdits") || !next?.id || typeof next.content !== "string") return;
        const channelId = next.channel_id;
        const old = store.getMessage(channelId, next.id);
        if (!old || typeof old.content !== "string" || old.content === next.content || !shouldLog(old, logFilters())) return;
        const timestamp = Number(old.editedTimestamp ?? old.timestamp) || Date.now();
        void purge(log.addEdit(channelId, next.id, { content: old.content, timestamp }));
    });

    invalidate();

    const runtime: Runtime = {
        log,
        clear: () => void purge(log.clear()),
    };
    active = runtime;

    ctx.settings.onChange(values => {
        void purge(log.setLimits({ perChannel: values.limit }));
        if (!values.keepDeleted) {
            const kept = [...log.deleted()].flatMap(([channelId, ids]) => ids.map(id => ({ channelId, id })));
            for (const { channelId, id } of kept) log.remove(channelId, id);
            void purge(kept);
        }
    });

    // Runs first on stop, while our hooks are still in place (they let the purge through)
    ctx.onDispose(() => {
        if (active === runtime) active = undefined;
        purge(log.clear()).finally(() => {
            if (handlers[PURGE_ACTION] !== purgeHandler) return;
            delete handlers[PURGE_ACTION];
            invalidate();
        });
    });
}

export default definePlugin({
    settings,

    start(ctx) {
        const log = new MessageLog({ perChannel: ctx.settings.get("limit") });
        ctx.addStyle(css);

        ctx.waitFor(filters.byStoreName("MessageStore"), store => install(ctx, log, store));
        ctx.waitFor(renderedContentFilter, fn => void (useRenderedContent = fn));
        ctx.waitFor(markupFilter, classes => {
            markupClass = Object.values(classes).find((c): c is string => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) ?? "";
        });

        // Discord's renderMessageAccessories({ channelMessageProps: { message, channel }, ... })
        ctx.hookExport("after", accessoriesFilter, ({ args, result }) => {
            const props = args[0];
            const message = props?.channelMessageProps?.message;
            if (result == null || props.isMessageSnapshot || !message?.id) return;
            return <>{result}<Logged log={log} message={message} /></>;
        });
    },

    settingsPanel: () => active && <Summary runtime={active} />,

    /** The running plugin's log, for tests and debugging */
    getLog: () => active?.log,
});
