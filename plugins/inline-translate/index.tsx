/**
 * Translates messages in place: a "Translate" item in the message menu and a button in the message
 * hover bar put the translation right under the message, rendered with Discord's own markdown.
 *
 * - Network: Discord's CSP blocks translate.googleapis.com from the page, so native.ts makes the
 *   request in the main process (Google's free "gtx" endpoint, which also names the detected language).
 * - Rendering: the exported function that renders a message's accessories (the one Message Logger
 *   uses) is hooked to put our block first, directly under the message text.
 * - Hover bar: a source patch adds our button after Discord's Reply button.
 * - Automatic mode: when a message from someone else renders, it's queued (one request every
 *   1.2s, newest kept when scrolling floods it) and the translation only shows if the detected
 *   language is one the user listed, or anything but theirs. Results are cached per message and
 *   target language (LRU, memory only). Code, links, mentions and emoji are never sent for translation.
 */
import { definePlugin, filters, findMenuGroup, getStore, Menu, React } from "@evi/api";
import type { Filter, PluginContext } from "@evi/api";

import {
    cacheKey, googleLanguage, isTranslatable, languageName, LRU, normalizeLanguage, parseLanguageList, protect, RateQueue, restore,
    shouldAutoTranslate, shouldShowAuto,
} from "./translate";
import type { AutoMode, Translation } from "./translate";

const settings = {
    target: {
        type: "string",
        label: "Translate to",
        description: "A language code like en, de or zh-TW. Empty uses Discord's language.",
        placeholder: "en",
        default: "",
    },
    autoMode: {
        type: "select",
        label: "Translate automatically",
        description: "Messages from others are translated as they appear. Uses a request per message.",
        default: "off",
        options: [
            { label: "Off", value: "off" },
            { label: "Only the languages I list", value: "list" },
            { label: "Any language that isn't mine", value: "foreign" },
        ],
    },
    autoLanguages: {
        type: "string",
        label: "Languages to translate automatically",
        description: "Language codes separated by commas, like es, ja, de. Used by \"Only the languages I list\".",
        placeholder: "es, ja, de",
        default: "",
    },
    ignoreBots: { type: "boolean", label: "Skip bots automatically", description: "Don't translate messages from bots and apps on your behalf.", default: true },
    hoverButton: { type: "boolean", label: "Button in the message toolbar", description: "A translate button next to Reply when you hover a message.", default: true },
} as const;

type Ctx = PluginContext<typeof settings>;

/** Waits between two requests to Google, and how long to back off after "too many requests" */
const INTERVAL = 1200;
const BACKOFF = 60_000;
const MAX_QUEUED = 25;
const CACHE_SIZE = 500;

const accessoriesFilter = filters.byCode("channelMessageProps:{message:", "isAutomodBlockedMessage:");
const renderedContentFilter = filters.byCode('"useMessageRenderedContent"', "hideSimpleEmbedContent");
const markupFilter: Filter = Object.assign(
    (v: any) => !!v && typeof v === "object" && !Array.isArray(v)
        && Object.values(v).some(c => typeof c === "string" && /^markup_+[\da-f]+$/.test(c))
        && Object.values(v).some(c => typeof c === "string" && /^codeContainer_+[\da-f]+$/.test(c)),
    { $code: [/"markup_+[\da-f]+"/] },
);

type RenderedContent = (message: any, options: Record<string, unknown>) => { content: React.ReactNode; };
let useRenderedContent: RenderedContent | undefined;
let markupClass = "";

type Entry =
    | { state: "loading"; content: string; }
    | { state: "done"; content: string; result: Translation; }
    | { state: "error"; content: string; error: string; };

/** What the block under a message shows: the translation, only its caption, or nothing */
type View = "shown" | "collapsed" | "dismissed";

const css = `
.dl-it {
    text-indent: 0;
    margin: 0.125rem 0 0.25rem;
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--brand-500, var(--brand-experiment, #5865f2));
    font-family: var(--font-primary);
    max-width: 100%;
}
.dl-it-text {
    color: var(--text-normal, #dbdee1);
    font-size: 1rem;
    line-height: 1.375rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}
.dl-it-caption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-muted, #949ba4);
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 500;
}
.dl-it-error { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
.dl-it-link {
    all: unset;
    cursor: pointer;
    color: var(--text-link, #00a8fc);
    border-radius: 3px;
}
.dl-it-link:hover { text-decoration: underline; }
.dl-it-link:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 1px; }
`;

function discordLocale(): string {
    return getStore("LocaleStore")?.locale || document.documentElement.lang || navigator.language || "en";
}

const currentUserId = (): string | undefined => getStore("UserStore")?.getCurrentUser?.()?.id;

function isOwn(message: any) {
    const me = currentUserId();
    return !!me && message?.author?.id === me;
}

/** Everything that lives while the plugin runs */
class Runtime {
    readonly cache = new LRU<string, Entry>(CACHE_SIZE);
    readonly views = new LRU<string, View>(CACHE_SIZE);
    private listeners = new Set<() => void>();
    version = 0;
    readonly queue: RateQueue;

    constructor(readonly ctx: Ctx) {
        // A dropped auto job forgets its "loading" entry, so it's queued again when it renders next
        this.queue = new RateQueue(INTERVAL, MAX_QUEUED, key => {
            if (this.cache.peek(key)?.state === "loading") {
                this.cache.delete(key);
                this.emit();
            }
        });
    }

    subscribe = (fn: () => void) => {
        this.listeners.add(fn);
        return () => void this.listeners.delete(fn);
    };

    emit() {
        this.version++;
        for (const fn of this.listeners) fn();
    }

    target() {
        return normalizeLanguage(this.ctx.settings.get("target")) ?? googleLanguage(discordLocale());
    }

    autoOptions() {
        return {
            mode: this.ctx.settings.get("autoMode") as AutoMode,
            languages: parseLanguageList(this.ctx.settings.get("autoLanguages")),
            target: this.target(),
            currentUserId: currentUserId(),
            ignoreBots: this.ctx.settings.get("ignoreBots"),
        };
    }

    setView(key: string, view: View | undefined) {
        if (view) this.views.set(key, view);
        else this.views.delete(key);
        this.emit();
    }

    /** Queues a translation unless an up-to-date one is cached or on its way */
    request(message: any, urgent: boolean) {
        const content: string = message.content;
        const target = this.target();
        const key = cacheKey(message.id, target);
        const cached = this.cache.get(key);
        if (cached && cached.content === content) {
            if (cached.state === "done") return;
            if (cached.state === "error" && !urgent) return;
            // Already running, or queued: only a click moves it to the front
            if (cached.state === "loading" && (!urgent || !this.queue.has(key))) return;
        }

        this.cache.set(key, { state: "loading", content });
        this.emit();

        this.queue.add(key, async () => {
            const auto = !urgent;
            try {
                const { text, tokens } = protect(content);
                const result = await this.ctx.native.call<Translation>("translate", text, target);
                const translation = { source: result.source, text: restore(result.text, tokens) };
                if (this.cache.peek(key)?.content !== content) return;
                this.cache.set(key, { state: "done", content, result: translation });
                if (auto && !this.views.has(key) && shouldShowAuto(translation, content, this.autoOptions())) this.views.set(key, "shown");
            } catch (err) {
                const error = String((err as Error)?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*(?:Error:\s*)?/, "");
                if (/\b429\b/.test(error)) this.queue.pause(BACKOFF);
                if (this.cache.peek(key)?.content === content) this.cache.set(key, { state: "error", content, error });
                if (!auto) this.ctx.logger.warn("Translation failed", error);
            } finally {
                this.emit();
            }
        }, urgent);
    }

    /** Menu item and hover button: show, or hide when already showing */
    toggle(message: any) {
        const key = cacheKey(message.id, this.target());
        if (this.views.peek(key) === "shown") return this.setView(key, "dismissed");
        this.views.set(key, "shown");
        this.request(message, true);
        this.emit();
    }

    isShown(message: any) {
        return this.views.peek(cacheKey(message.id, this.target())) === "shown";
    }

    dispose() {
        this.queue.stop();
        this.cache.clear();
        this.views.clear();
        this.emit();
    }
}

let active: Runtime | undefined;

function RichText({ message, text }: { message: any; text: string; }) {
    const render = useRenderedContent!;
    const record = React.useMemo(() => message.set?.("content", text) ?? { ...message, content: text }, [message, text]);
    const rendered = render(record, { hideSimpleEmbedContent: false, formatInline: false, allowLinks: true, allowList: true, allowHeading: true });
    return <>{rendered?.content ?? text}</>;
}

function Caption({ children }: { children: React.ReactNode; }) {
    const items = React.Children.toArray(children);
    return (
        <div className="dl-it-caption">
            {items.map((item, i) => <React.Fragment key={i}>{i > 0 && <span aria-hidden="true">·</span>}{item}</React.Fragment>)}
        </div>
    );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode; }) {
    return <button type="button" className="dl-it-link" onClick={onClick}>{children}</button>;
}

function Inline({ runtime, message }: { runtime: Runtime; message: any; }) {
    React.useSyncExternalStore(runtime.subscribe, () => runtime.version);
    const values = runtime.ctx.settings.use();
    const target = runtime.target();
    const key = cacheKey(message.id, target);
    const entry = runtime.cache.peek(key);
    const view = runtime.views.peek(key);
    const content: string = typeof message.content === "string" ? message.content : "";

    // Automatic mode, and manual translations that went stale after an edit
    React.useEffect(() => {
        if (!content) return;
        const cached = runtime.cache.peek(key);
        if (cached && cached.content === content) return;
        if (runtime.views.peek(key) === "shown") return runtime.request(message, true);
        if (runtime.views.peek(key) !== "dismissed" && shouldAutoTranslate(message, runtime.autoOptions())) runtime.request(message, false);
    }, [key, content, values.autoMode, values.autoLanguages, values.ignoreBots]);

    if (!view || view === "dismissed" || !entry || entry.content !== content) return null;
    const dismiss = () => runtime.setView(key, "dismissed");
    const uiLocale = discordLocale();

    if (entry.state === "loading") {
        return <div className="dl-it" role="status"><Caption><span>Translating…</span></Caption></div>;
    }
    if (entry.state === "error") {
        return (
            <div className="dl-it" role="alert">
                <Caption>
                    <span className="dl-it-error">Couldn't translate this message</span>
                    <LinkButton onClick={() => { runtime.setView(key, "shown"); runtime.request(message, true); }}>Retry</LinkButton>
                    <LinkButton onClick={dismiss}>Dismiss</LinkButton>
                </Caption>
            </div>
        );
    }

    const from = languageName(entry.result.source, uiLocale);
    return (
        <div className="dl-it" lang={target}>
            {view === "shown" && (
                <div className={`dl-it-text ${markupClass}`}>
                    {useRenderedContent ? <RichText message={message} text={entry.result.text} /> : entry.result.text}
                </div>
            )}
            <Caption>
                <span>Translated from {from}</span>
                {view === "shown"
                    ? <LinkButton onClick={() => runtime.setView(key, "collapsed")}>Show original</LinkButton>
                    : <LinkButton onClick={() => runtime.setView(key, "shown")}>Show translation</LinkButton>}
                <LinkButton onClick={dismiss}>Dismiss</LinkButton>
            </Caption>
        </div>
    );
}

/** Material Symbols "translate", sized by Discord's hover bar icon class */
function TranslateIcon(props: { className?: string; color?: string; }) {
    return (
        <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={props.color ?? "currentColor"}>
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
        </svg>
    );
}

function HoverButton({ runtime, Button, message }: { runtime: Runtime; Button: React.ComponentType<any>; message: any; }) {
    React.useSyncExternalStore(runtime.subscribe, () => runtime.version);
    const shown = runtime.isShown(message);
    return <Button label={shown ? "Hide Translation" : "Translate"} icon={TranslateIcon} onClick={() => runtime.toggle(message)} />;
}

const canTranslate = (message: any) => !!message?.id && typeof message.content === "string" && isTranslatable(message.content) && !isOwn(message);

export default definePlugin({
    settings,

    patches: [{
        // The message hover bar: (0,a.jsx)(nl,{label:…,icon:…,onClick:e=>(0,tC.$b)(t,n,e)},"reply-other"):null,
        find: '},"reply-other")',
        replace: {
            match: /(\(0,\i\.jsx\)\((\i),\{label:[^{}]*?onClick:\i=>\(0,\i\.\i\)\((\i),(\i),\i\)\},"reply-other"\):null,)/,
            with: "$1$self.hoverButton($2,$3,$4),",
        },
    }],

    /** Called by the hover bar for every message: our button, or nothing */
    hoverButton(Button: React.ComponentType<any>, _channel: unknown, message: any) {
        try {
            const runtime = active;
            if (!runtime || !Button || !runtime.ctx.settings.get("hoverButton") || !canTranslate(message)) return null;
            return <HoverButton key="evi-translate" runtime={runtime} Button={Button} message={message} />;
        } catch {
            return null;
        }
    },

    start(ctx) {
        const runtime = new Runtime(ctx);
        active = runtime;
        ctx.onDispose(() => {
            if (active === runtime) active = undefined;
            runtime.dispose();
        });

        ctx.addStyle(css);
        ctx.waitFor(renderedContentFilter, fn => void (useRenderedContent = fn));
        ctx.waitFor(markupFilter, classes => {
            markupClass = Object.values(classes).find((c): c is string => typeof c === "string" && /^markup_+[\da-f]+$/.test(c)) ?? "";
        });

        // Discord's renderMessageAccessories({ channelMessageProps: { message }, ... }): our block goes first
        ctx.hookExport("after", accessoriesFilter, ({ args, result }) => {
            const props = args[0];
            const message = props?.channelMessageProps?.message;
            if (result == null || props.isMessageSnapshot || !message?.id || typeof message.content !== "string" || !message.content) return;
            return <><Inline key="evi-translate" runtime={runtime} message={message} />{result}</>;
        });

        ctx.contextMenu("message", (children, { message }) => {
            if (!canTranslate(message)) return;
            (findMenuGroup(children, "copy-text") ?? children).push(
                <Menu.Item
                    id="evi-inline-translate"
                    label={runtime.isShown(message) ? "Hide Translation" : "Translate"}
                    action={() => runtime.toggle(message)}
                />,
            );
        });

        // Settings changes re-render every block (target language, automatic mode)
        ctx.settings.onChange(() => runtime.emit());
    },
});
