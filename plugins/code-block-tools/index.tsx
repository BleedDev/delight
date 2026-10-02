/**
 * Code blocks and text files get Copy, Download, Pretty print for JSON and line numbers.
 *
 * Checked against Discord's code on 2026-10-02:
 * - Code blocks: Discord's markup rule `codeBlock:{react(e,t,r){…return <pre><div class=codeContainer>
 *   [<div class=codeActions><Copy/></div>, <highlighted code/>]…}}` (next to location:"MarkupReactRules").
 *   Our toolbar goes first in that children list; it replaces Discord's own Copy button, which CSS hides.
 *   Pretty print and the line number gutter are ours too, siblings of Discord's code, laid out by CSS.
 * - Text files Discord previews (the plaintext preview, the first 50 KB with a language picker and a
 *   ⋯ menu): Copy and Pretty print join its footer, the text it shows goes through useText (pretty
 *   printed when asked), and its `<pre>` gets the line numbers as a CSS `content:` string. Numbered
 *   lines can't wrap, so with line numbers on the preview starts with Discord's word wrap off.
 * - Text files Discord shows as a plain download card (its generic file attachment): a Preview button
 *   in the card opens our own preview of the first 512 KB under it.
 */
import { Components, definePlugin, filters, React } from "@evi/api";
import type { Filter, PluginContext } from "@evi/api";

import { PATCHES } from "./patches";
import { t } from "./strings";
import {
    codeFilename, gutterCss, gutterText, isJson, isTextFile, jsonTokens, languageOf, lineCount, MAX_FILE_BYTES, prettyJson,
} from "./tools";

const settings = {
    lineNumbers: {
        type: "boolean",
        get label() { return t("settings.lineNumbers"); },
        get description() { return t("settings.lineNumbers.description"); },
        default: true,
    },
    filePreview: {
        type: "boolean",
        get label() { return t("settings.filePreview"); },
        get description() { return t("settings.filePreview.description"); },
        default: true,
    },
} as const;

let ctx: PluginContext<typeof settings> | undefined;

/** Discord's generic file attachment card: ({ url, fileName, fileSize, onContextMenu, renderAdjacentContent }) */
const fileCardFilter = filters.byCode("renderAdjacentContent:", ".filesize(", "href:", "onContextMenu:");
/** The plaintext preview's CSS module: its download button's class makes ours look the same */
const previewClassesFilter: Filter = Object.assign(
    (v: any) => !!v && typeof v === "object" && !Array.isArray(v)
        && Object.values(v).some(c => typeof c === "string" && /^downloadAnchor_+[\da-f]+$/.test(c))
        && Object.values(v).some(c => typeof c === "string" && /^languageIcon_+[\da-f]+$/.test(c)),
    { $code: ['"downloadAnchor_', '"languageIcon_'] },
);
let footerButtonClass = "";

// ---- Which text files are pretty printed (by attachment URL), for the preview's re-render -------

const prettyFiles = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
};
function bump() {
    version++;
    listeners.forEach(l => l());
}
const useVersion = () => React.useSyncExternalStore(subscribe, () => version);

function togglePrettyFile(url: string) {
    if (prettyFiles.has(url)) prettyFiles.delete(url);
    else prettyFiles.add(url);
    bump();
}

/** Pretty printed text, cached per text: the preview re-renders on every hover */
const prettyCache = new Map<string, string | null>();
function prettyCached(text: string) {
    if (!prettyCache.has(text)) {
        if (prettyCache.size > 20) prettyCache.delete(prettyCache.keys().next().value!);
        prettyCache.set(text, prettyJson(text));
    }
    return prettyCache.get(text) ?? null;
}

/** The preview's <pre> props for a text, kept while the text stays: it re-renders on every hover */
let lastGutter: { text: string; props: { "data-dl-cbt-lines": string; style: Record<string, string>; }; } | undefined;
function gutterProps(text: string) {
    if (lastGutter?.text !== text) lastGutter = { text, props: { "data-dl-cbt-lines": "", style: { "--dl-cbt-gutter": gutterCss(text) } } };
    return lastGutter.props;
}

// ---- Clipboard and files ---------------------------------------------------------------------

async function copyText(text: string, partOf?: number) {
    try {
        const native = (window as any).DiscordNative?.clipboard;
        if (typeof native?.copy === "function") native.copy(text);
        else await navigator.clipboard.writeText(text);
        ctx?.toast(partOf ? t("copiedPart", { size: formatBytes(partOf) }) : t("copied"), { type: "success" });
    } catch (err) {
        ctx?.logger.warn("Copying failed", err);
        ctx?.toast(t("copyFailed"), { type: "failure" });
    }
}

/** Saves text with the desktop app's save dialog, or else a browser download */
async function saveText(text: string, filename: string) {
    const data = new TextEncoder().encode(text);
    try {
        const fileManager = (window as any).DiscordNative?.fileManager;
        if (typeof fileManager?.saveWithDialog === "function") {
            await fileManager.saveWithDialog(data, filename);
            return;
        }
        const url = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
        ctx?.logger.warn("Saving failed", err);
        ctx?.toast(t("downloadFailed"), { type: "failure" });
    }
}

const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

/** Up to MAX_FILE_BYTES of an attachment, and whether there's more */
async function fetchText(url: string): Promise<{ text: string; partial: boolean; }> {
    const res = await fetch(url, { headers: { Range: `bytes=0-${MAX_FILE_BYTES - 1}`, Accept: "text/plain" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    const partial = bytes.length >= MAX_FILE_BYTES || (Number.isFinite(total) && total > bytes.length);
    // A cut can land inside a character: drop what's left of it rather than showing �
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, MAX_FILE_BYTES)).replace(/\uFFFD$/, ""), partial };
}

// ---- Buttons -----------------------------------------------------------------------------------

const PATHS = {
    copy: "M3 16a1 1 0 0 1-1-1V5a3 3 0 0 1 3-3h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 0-1 1v10a1 1 0 0 1-1 1H3Zm4-5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z",
    download: "M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z",
    // Curly braces: pretty print
    pretty: "M8 3a3 3 0 0 0-3 3v3.17c0 .53-.21 1.04-.59 1.42L3.3 11.7a1 1 0 0 0 0 1.42l1.12 1.12c.37.37.58.88.58 1.41V18a3 3 0 0 0 3 3h1a1 1 0 1 0 0-2H8a1 1 0 0 1-1-1v-2.35c0-1.06-.42-2.08-1.17-2.83L5.41 12.4l.42-.42A4 4 0 0 0 7 9.17V6a1 1 0 0 1 1-1h1a1 1 0 0 0 0-2H8Zm8 0a3 3 0 0 1 3 3v3.17c0 .53.21 1.04.59 1.42l1.12 1.11a1 1 0 0 1 0 1.42l-1.12 1.12c-.37.37-.58.88-.58 1.41V18a3 3 0 0 1-3 3h-1a1 1 0 1 1 0-2h1a1 1 0 0 0 1-1v-2.35c0-1.06.42-2.08 1.17-2.83l.42-.42-.42-.42A4 4 0 0 1 17 9.17V6a1 1 0 0 0-1-1h-1a1 1 0 1 1 0-2h1Z",
    // An eye: show the file
    preview: "M12 5C5.65 5 2.3 10.2 1.53 11.52a.98.98 0 0 0 0 .96C2.3 13.8 5.65 19 12 19s9.7-5.2 10.47-6.52a.98.98 0 0 0 0-.96C21.7 10.2 18.35 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
};

function Action({ label, icon, onClick, pressed, className }: { label: string; icon: keyof typeof PATHS; onClick(): void; pressed?: boolean; className?: string; }) {
    const button = (
        <button
            type="button"
            className={className ?? "dl-cbt-btn"}
            aria-label={label}
            aria-pressed={pressed}
            onClick={e => {
                e.stopPropagation();
                onClick();
            }}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={PATHS[icon]} /></svg>
        </button>
    );
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={label} position="top">{button}</Tooltip> : button;
}

/** Coloured like highlight.js would, so Discord's code theme styles it */
function JsonCode({ text, className }: { text: string; className?: string; }) {
    const tokens = React.useMemo(() => jsonTokens(text), [text]);
    return <code className={className}>{tokens.map((tok, i) => tok.className ? <span key={i} className={tok.className}>{tok.text}</span> : tok.text)}</code>;
}

// ---- Code blocks -------------------------------------------------------------------------------

interface CodeNode { content?: string; lang?: string; }

/** Styles of Discord's code element the gutter copies, so it lines up and looks like part of it */
const COPIED_STYLES = ["fontFamily", "fontSize", "lineHeight", "paddingTop", "paddingBottom", "backgroundColor", "borderTopWidth", "borderTopStyle", "borderTopColor", "borderBottomWidth", "borderBottomStyle", "borderBottomColor"] as const;

/** Every key CodeTools puts in the gutter's style, to compare without serialising */
const COPIED_KEYS = [...COPIED_STYLES, "borderLeftWidth", "borderLeftStyle", "borderLeftColor", "borderTopLeftRadius", "borderBottomLeftRadius"];

/** Discord's code element beside ours in the code block (not our pretty printed one) */
function discordCode(from: HTMLElement | null) {
    return [...from?.parentElement?.querySelectorAll<HTMLElement>("code") ?? []].find(c => !c.classList.contains("dl-cbt-pretty"));
}

/** A setting, re-rendering when it changes; safe after the plugin stops (it reads as off) */
function useSetting(key: keyof typeof settings) {
    useVersion();
    return !!ctx?.settings.get(key);
}

function CodeTools({ node }: { node: CodeNode; }) {
    const lineNumbers = useSetting("lineNumbers");
    const content = typeof node.content === "string" ? node.content : "";
    const [pretty, setPretty] = React.useState(false);
    const json = React.useMemo(() => isJson(content, node.lang), [content, node.lang]);
    const prettyText = React.useMemo(() => pretty && json ? prettyJson(content) : null, [pretty, json, content]);
    const shown = prettyText ?? content;

    const barRef = React.useRef<HTMLDivElement>(null);
    const [codeLook, setCodeLook] = React.useState<{ style: React.CSSProperties; className: string; }>();
    // Only the gutter and the pretty printed code wear the look: without them, no style read at all
    const needsLook = lineNumbers || !!prettyText;
    React.useLayoutEffect(() => {
        if (!needsLook) return;
        const code = discordCode(barRef.current);
        if (!code) return;
        const computed = getComputedStyle(code);
        const style: Record<string, string> = {};
        for (const key of COPIED_STYLES) style[key] = computed[key];
        // Our CSS takes the code's left edge away for the gutter: its left edge is the code's top one,
        // and its corners the code's right ones
        style.borderLeftWidth = computed.borderTopWidth;
        style.borderLeftStyle = computed.borderTopStyle;
        style.borderLeftColor = computed.borderTopColor;
        style.borderTopLeftRadius = computed.borderTopRightRadius;
        style.borderBottomLeftRadius = computed.borderBottomRightRadius;
        setCodeLook(old => old && old.className === code.className && COPIED_KEYS.every(k => (old.style as Record<string, string>)[k] === style[k]) ? old : { style, className: code.className });
    }, [lineNumbers, prettyText]);

    // The code block's container gets classes of ours instead of CSS finding it with div:has(...):
    // a :has() rule on every div made each change anywhere in Discord restyle the whole page
    React.useLayoutEffect(() => {
        const host = barRef.current?.parentElement;
        if (!host) return;
        host.classList.add("dl-cbt-host");
        host.classList.toggle("dl-cbt-has-gutter", !!lineNumbers);
        host.classList.toggle("dl-cbt-has-pretty", !!prettyText);
        return () => host.classList.remove("dl-cbt-host", "dl-cbt-has-gutter", "dl-cbt-has-pretty");
    }, [lineNumbers, prettyText]);

    const gutter = React.useMemo(() => lineNumbers ? gutterText(lineCount(shown)) : "", [lineNumbers, shown]);
    const lang = prettyText ? "json" : node.lang;
    return (
        <>
            <div className="dl-cbt-bar" role="group" ref={barRef}>
                {json && <Action label={t(pretty ? "original" : "pretty")} icon="pretty" pressed={pretty} onClick={() => setPretty(p => !p)} />}
                <Action label={t("download")} icon="download" onClick={() => void saveText(shown, codeFilename(lang))} />
                <Action label={t("copy")} icon="copy" onClick={() => void copyText(shown)} />
            </div>
            {lineNumbers && (
                <div className="dl-cbt-gutter" aria-hidden="true" style={codeLook?.style}>{gutter}</div>
            )}
            {prettyText && <JsonCode text={prettyText} className={`${codeLook?.className ?? "hljs"} dl-cbt-pretty`} />}
        </>
    );
}

// ---- Text files Discord previews -----------------------------------------------------------------

function PreviewTools({ url, text, bytesLeft }: { url: string; fileName: string; text: string | null; bytesLeft: number; }) {
    useVersion();
    // Pretty printing needs the whole file, and Discord reads only the first 50 KB. Parsed once per
    // text: the preview re-renders on every hover.
    const json = React.useMemo(() => text != null && bytesLeft === 0 && isJson(text, "json"), [text, bytesLeft]);
    if (text == null) return null;
    const pretty = prettyFiles.has(url);
    const copy = async () => {
        if (bytesLeft === 0) return copyText(text);
        try {
            const whole = await fetchText(url);
            return copyText(whole.text, whole.partial ? MAX_FILE_BYTES : undefined);
        } catch (err) {
            ctx?.logger.warn("Reading the file failed", err);
            ctx?.toast(t("copyFailed"), { type: "failure" });
        }
    };
    const className = footerButtonClass ? `${footerButtonClass} dl-cbt-footer-btn` : "dl-cbt-btn dl-cbt-footer-btn";
    return (
        <>
            {json && <Action className={className} label={t(pretty ? "original" : "pretty")} icon="pretty" pressed={pretty} onClick={() => togglePrettyFile(url)} />}
            <Action className={className} label={t("copy")} icon="copy" onClick={() => void copy()} />
        </>
    );
}

// ---- Text files Discord shows only as a download card -------------------------------------------

type Loaded = { state: "loading"; } | { state: "error"; } | { state: "done"; text: string; partial: boolean; };

function FilePane({ url, fileName }: { url: string; fileName: string; }) {
    const lineNumbers = useSetting("lineNumbers");
    const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" });
    const [pretty, setPretty] = React.useState(false);
    React.useEffect(() => {
        let live = true;
        fetchText(url).then(r => live && setLoaded({ state: "done", ...r }), err => {
            ctx?.logger.warn("Reading the file failed", err);
            if (live) setLoaded({ state: "error" });
        });
        return () => void (live = false);
    }, [url]);

    // Up to 512 KB: parsed, pretty printed and numbered once, not on every render
    const text = loaded.state === "done" ? loaded.text : "";
    const partial = loaded.state === "done" && loaded.partial;
    const json = React.useMemo(() => !!text && !partial && isJson(text, languageOf(fileName)), [text, partial, fileName]);
    const prettyText = React.useMemo(() => pretty && json ? prettyJson(text) : null, [pretty, json, text]);
    const shown = prettyText ?? text;
    const gutter = React.useMemo(() => lineNumbers ? gutterCss(shown) : "", [lineNumbers, shown]);

    if (loaded.state === "loading") return <div className="dl-cbt-pane dl-cbt-note">{t("preview.loading")}</div>;
    if (loaded.state === "error") return <div className="dl-cbt-pane dl-cbt-note dl-cbt-error">{t("preview.error")}</div>;

    return (
        <div className="dl-cbt-pane">
            <div className="dl-cbt-bar" role="group">
                {json && <Action label={t(pretty ? "original" : "pretty")} icon="pretty" pressed={pretty} onClick={() => setPretty(p => !p)} />}
                <Action label={t("copy")} icon="copy" onClick={() => void copyText(shown, loaded.partial ? MAX_FILE_BYTES : undefined)} />
            </div>
            <pre className="dl-cbt-file-pre" {...(lineNumbers ? { "data-dl-cbt-lines": "", style: { "--dl-cbt-gutter": gutter } as React.CSSProperties } : {})}>
                {prettyText ? <JsonCode text={prettyText} /> : <code>{shown}</code>}
            </pre>
            {loaded.partial && <div className="dl-cbt-note">{t("preview.partial", { size: formatBytes(MAX_FILE_BYTES) })}</div>}
        </div>
    );
}

function FileCard({ card, url, fileName }: { card: React.ReactElement<any>; url: string; fileName: string; }) {
    const [open, setOpen] = React.useState(false);
    const button = <Action key="dl-cbt-preview" label={t(open ? "preview.hide" : "preview.show")} icon="preview" pressed={open} onClick={() => setOpen(o => !o)} />;
    const children = React.Children.toArray(card.props?.children);
    return (
        <div className="dl-cbt-file">
            {React.cloneElement(card, undefined, ...children, button)}
            {open && <FilePane url={url} fileName={fileName} />}
        </div>
    );
}

// ---- Styles --------------------------------------------------------------------------------------

const css = `
/* The code block's container, marked by our component (see CodeTools) */
.dl-cbt-host { position: relative; }
.dl-cbt-host > [class*="codeActions_"] { display: none; }
.dl-cbt-bar {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 6px;
    background: var(--background-floating, var(--background-surface-highest, #111214));
    box-shadow: var(--shadow-low, 0 1px 3px rgb(0 0 0 / 0.3));
    opacity: 0;
    transition: opacity 0.12s ease;
}
.dl-cbt-host:hover > .dl-cbt-bar,
.dl-cbt-pane:hover > .dl-cbt-bar,
.dl-cbt-bar:focus-within { opacity: 1; }
.dl-cbt-btn {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    color: var(--interactive-normal, #b5bac1);
    cursor: pointer;
}
.dl-cbt-btn:hover { color: var(--interactive-hover, #dbdee1); background: var(--background-modifier-hover, rgb(78 80 88 / 0.3)); }
.dl-cbt-btn[aria-pressed="true"] { color: var(--interactive-active, #fff); background: var(--background-modifier-selected, rgb(78 80 88 / 0.6)); }
.dl-cbt-btn:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: -2px; }
.dl-cbt-footer-btn { all: unset; display: grid; place-items: center; cursor: pointer; color: var(--interactive-normal, #b5bac1); }
.dl-cbt-footer-btn:hover { color: var(--interactive-hover, #dbdee1); }
.dl-cbt-footer-btn[aria-pressed="true"] { color: var(--interactive-active, #fff); }

/* Line numbers beside a code block: a column of their own, styled like Discord's code (copied in) */
.dl-cbt-has-gutter { display: grid; grid-template-columns: auto minmax(0, 1fr); }
.dl-cbt-has-gutter > :not(.dl-cbt-bar, .dl-cbt-gutter) { grid-column: 2; grid-row: 1; min-width: 0; }
.dl-cbt-has-gutter code {
    white-space: pre !important;
    overflow-x: auto;
    border-top-left-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
    border-left-width: 0 !important;
}
.dl-cbt-gutter {
    grid-column: 1;
    grid-row: 1;
    box-sizing: border-box;
    padding-inline: 0.75em 0.5em;
    white-space: pre;
    text-align: right;
    color: var(--text-muted, #949ba4);
    border-right: 0 !important;
    user-select: none;
    font-variant-numeric: tabular-nums;
}
/* Pretty printed: ours shows instead of Discord's */
.dl-cbt-has-pretty > :not(.dl-cbt-bar, .dl-cbt-gutter, .dl-cbt-pretty) { display: none; }
.dl-cbt-pretty { display: block; white-space: pre; overflow-x: auto; }

/* Line numbers beside a text file preview, from a CSS string the <pre> carries */
pre[data-dl-cbt-lines] { display: grid !important; grid-template-columns: auto minmax(0, 1fr); }
pre[data-dl-cbt-lines]::before {
    content: var(--dl-cbt-gutter);
    white-space: pre;
    text-align: right;
    padding: 8px 0.75em 8px 0.5em;
    color: var(--text-muted, #949ba4);
    user-select: none;
    font-variant-numeric: tabular-nums;
}
pre[data-dl-cbt-lines]::before,
pre[data-dl-cbt-lines] code {
    font-family: var(--font-code, monospace) !important;
    font-size: 0.875rem !important;
    line-height: 1.125rem !important;
}
pre[data-dl-cbt-lines] code { padding-block: 8px !important; white-space: pre !important; overflow-x: auto; min-width: 0; }

/* Our preview of a text file under its download card */
.dl-cbt-file { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
.dl-cbt-pane {
    position: relative;
    max-width: min(100%, 640px);
    border-radius: 8px;
    border: 1px solid var(--border-subtle, var(--background-modifier-accent, rgb(78 80 88 / 0.48)));
    background: var(--background-secondary, #2b2d31);
    overflow: hidden;
}
.dl-cbt-file-pre { margin: 0; max-height: 400px; overflow: auto; }
.dl-cbt-file-pre code {
    display: block;
    padding: 8px 12px;
    font-family: var(--font-code, monospace);
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: var(--text-normal, #dbdee1);
    white-space: pre;
}
.dl-cbt-note { padding: 6px 12px; font-size: 0.75rem; line-height: 1rem; color: var(--text-muted, #949ba4); }
.dl-cbt-error { color: var(--text-feedback-critical, var(--status-danger, #f23f43)); }
`;

export default definePlugin({
    settings,
    css,

    patches: Object.values(PATCHES),

    renderCodeTools(node: CodeNode) {
        if (!ctx || typeof node?.content !== "string") return null;
        return <CodeTools key="dl-cbt" node={node} />;
    },

    /** The text a plaintext preview shows: pretty printed when asked. A hook, called on every render. */
    useText(url: string, text: string | null) {
        useVersion();
        if (!ctx || typeof text !== "string" || !prettyFiles.has(url)) return text;
        return prettyCached(text) ?? text;
    },

    renderPreviewTools(props: { url: string; fileName: string; text: string | null; bytesLeft: number; }) {
        if (!ctx || typeof props?.url !== "string") return null;
        return <PreviewTools key="dl-cbt" {...props} />;
    },

    /** Whether a plaintext preview starts without word wrap: numbered lines can't wrap */
    numbersFirst() {
        return !!ctx?.settings.get("lineNumbers");
    },

    preProps(text: unknown, className: unknown) {
        if (!ctx?.settings.get("lineNumbers") || typeof text !== "string") return undefined;
        // Word wrap on (Discord's ⋯ menu): wrapped lines can't be numbered
        if (typeof className === "string" && /\bwordWrap_/.test(className)) return undefined;
        return gutterProps(text);
    },

    start(context) {
        ctx = context;
        if (!footerButtonClass) context.waitFor(previewClassesFilter, (classes: Record<string, unknown>) => {
            footerButtonClass = Object.values(classes).find((c): c is string => typeof c === "string" && /^downloadAnchor_+[\da-f]+$/.test(c)) ?? "";
        });
        context.hookExport("after", fileCardFilter, ({ args, result }) => {
            const props = args[0];
            if (!ctx?.settings.get("filePreview") || !React.isValidElement(result) || typeof props?.url !== "string") return;
            if (!isTextFile(props.fileName)) return;
            return <FileCard card={result} url={props.url} fileName={props.fileName} />;
        });
        context.settings.onChange(bump);
    },

    stop() {
        ctx = undefined;
        prettyFiles.clear();
        prettyCache.clear();
        lastGutter = undefined;
        bump();
    },
});
