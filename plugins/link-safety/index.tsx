/**
 * Checks links before they open. Discord's link click handler asks us first (see PATCH in
 * analyze.ts); links that meet the warning threshold get our dialog instead of opening, everything
 * else goes through Discord's usual flow, including its own "Leaving Discord" prompt.
 *
 * The patched handler keeps calling $self after the plugin is turned off until Discord reloads, so
 * intercept() does nothing while the plugin isn't running.
 */
import { definePlugin, openLayer, React } from "@evi/api";
import type { CloseLayer } from "@evi/api";
import type { ReactNode } from "react";

import { Analysis, analyzeLink, Finding, meetsThreshold, parseAllowlist, PATCH, RiskLevel } from "./analyze";
import { t } from "./strings";

let running = false;
let threshold: RiskLevel = "caution";
let allowlist: string[] = [];
let closeOpen: CloseLayer | undefined;

/** Plain text of React children, for the words a masked link shows */
function textOf(node: unknown): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (typeof node === "object" && "props" in (node as any)) return textOf((node as any).props?.children);
    return "";
}

function linkText(event: any, props: any): string {
    const fromDom = event?.currentTarget?.textContent ?? event?.target?.closest?.("a")?.textContent;
    if (typeof fromDom === "string" && fromDom.trim()) return fromDom;
    return textOf(props?.children);
}

/** A finding's wording in Discord's language; English from analyze.ts when it has no vars to fill in */
function say(f: Finding): string {
    return f.vars ? t(`finding.${f.key ?? f.code}` as Parameters<typeof t>[0], f.vars) : f.code === "unreadable" || f.code === "http" ? t(`finding.${f.code}`) : f.message;
}

// ---- The dialog ---------------------------------------------------------------------------------

function openWarning(analysis: Analysis, onOpen: () => void, onCancel: () => void) {
    closeOpen?.();
    let settled = false;
    const finish = (open: boolean, options?: { instant?: boolean; }) => {
        if (settled) return;
        settled = true;
        close(options);
        try {
            (open ? onOpen : onCancel)();
        } catch { /* Discord's own callbacks */ }
    };
    const cancel: CloseLayer = options => finish(false, options);
    const close = openLayer(() => <Warning analysis={analysis} onOpen={() => finish(true)} onBack={() => finish(false)} />, {
        onClosed: () => void (closeOpen === cancel && (closeOpen = undefined)),
    });
    closeOpen = cancel;
}

function Warning({ analysis, onOpen, onBack }: { analysis: Analysis; onOpen(): void; onBack(): void; }) {
    const backRef = React.useRef<HTMLButtonElement>(null);
    const danger = analysis.level === "danger";

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        backRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onBack();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    const reasons = analysis.findings.filter(f => f.level !== "info");
    const notes = analysis.findings.filter(f => f.level === "info");
    const p = analysis.parts;
    let address: ReactNode = analysis.url;
    if (p) {
        address = (
            <>
                <span className="evi-ls-dim">{p.prefix}</span>
                <span className="evi-ls-sub">{p.subdomain}</span>
                <mark className="evi-ls-domain">{p.domain}</mark>
                <span className="evi-ls-dim">{p.rest}</span>
            </>
        );
    }

    return (
        <div className="evi-ls-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && onBack()}>
            <div className="evi-ls-modal evi-modal" data-level={analysis.level} role="alertdialog" aria-modal="true" aria-labelledby="evi-ls-title" aria-describedby="evi-ls-reasons">
                <header className="evi-ls-head">
                    <span className="evi-ls-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 10v4.5M12 17.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </span>
                    <div>
                        <h2 id="evi-ls-title">{t(danger ? "title.danger" : "title.caution")}</h2>
                        <p>{t(danger ? "subtitle.danger" : "subtitle.caution")}</p>
                    </div>
                </header>
                <div className="evi-ls-body">
                    <ul className="evi-ls-reasons" id="evi-ls-reasons">
                        {reasons.map(f => <li key={f.code} data-level={f.level}>{say(f)}</li>)}
                        {notes.map(f => <li key={f.code} data-level="info">{say(f)}</li>)}
                    </ul>
                    <div className="evi-ls-label">{t("label.destination")}</div>
                    <div className="evi-ls-url">{address}</div>
                    {analysis.displayHostname !== analysis.hostname && analysis.hostname && (
                        <div className="evi-ls-hint">{t("hint.written", { host: analysis.hostname })}</div>
                    )}
                </div>
                <footer className="evi-ls-actions">
                    <button className="evi-ls-open" onClick={onOpen}>{t("button.open")}</button>
                    <button className="evi-ls-back" ref={backRef} onClick={onBack}>{t("button.back")}</button>
                </footer>
            </div>
        </div>
    );
}

const css = `
.evi-ls-scrim { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-ls-modal { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); --evi-ls-accent: var(--status-warning, #f0b232); }
.evi-ls-modal[data-level="danger"] { --evi-ls-accent: var(--status-danger, #f23f43); }
.evi-ls-head { display: flex; gap: 12px; align-items: flex-start; padding: 20px 20px 12px; }
.evi-ls-icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--evi-ls-accent); background: color-mix(in srgb, var(--evi-ls-accent) 16%, transparent); }
.evi-ls-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); }
.evi-ls-head p { margin: 4px 0 0; font-size: 14px; line-height: 18px; color: var(--text-muted, #949ba4); }
.evi-ls-body { overflow-y: auto; padding: 4px 20px 16px; }
.evi-ls-reasons { margin: 0 0 16px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.evi-ls-reasons li { position: relative; padding-left: 18px; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
.evi-ls-reasons li::before { content: ""; position: absolute; left: 2px; top: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--status-warning, #f0b232); }
.evi-ls-reasons li[data-level="danger"]::before { background: var(--status-danger, #f23f43); }
.evi-ls-reasons li[data-level="info"] { color: var(--text-muted, #949ba4); }
.evi-ls-reasons li[data-level="info"]::before { background: var(--text-muted, #949ba4); }
.evi-ls-label { margin-bottom: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted, #949ba4); }
.evi-ls-url { padding: 10px 12px; border-radius: 8px; font-family: var(--font-code, monospace); font-size: 13px; line-height: 18px; overflow-wrap: anywhere; max-height: 120px; overflow-y: auto;
  background: var(--background-base-lowest, var(--background-secondary, #2b2d31)); user-select: text; }
.evi-ls-dim { color: var(--text-muted, #949ba4); }
.evi-ls-sub { color: var(--text-default, #dbdee1); }
.evi-ls-domain { background: none; color: var(--evi-ls-accent); font-weight: 700; }
.evi-ls-hint { margin-top: 6px; font-size: 12px; color: var(--text-muted, #949ba4); overflow-wrap: anywhere; }
.evi-ls-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; background: var(--modal-footer-background, rgba(0,0,0,.08)); }
.evi-ls-actions button { min-height: 38px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
.evi-ls-back { background: var(--button-filled-brand-background, var(--brand-500, #5865f2)); color: var(--white, #fff); }
.evi-ls-back:hover { background: var(--button-filled-brand-background-hover, var(--brand-560, #4752c4)); }
.evi-ls-open { background: none; color: var(--text-default, #dbdee1); }
.evi-ls-open:hover { text-decoration: underline; }
.evi-ls-actions button:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 2px; }
`;

const THRESHOLDS: readonly RiskLevel[] = ["caution", "danger"];

export default definePlugin({
    settings: {
        threshold: {
            type: "select",
            get label() { return t("settings.threshold"); },
            get description() { return t("settings.threshold.description"); },
            default: "caution",
            options: [
                { get label() { return t("settings.threshold.caution"); }, value: "caution" },
                { get label() { return t("settings.threshold.danger"); }, value: "danger" },
            ],
        },
        allowlist: {
            type: "string",
            get label() { return t("settings.allowlist"); },
            get description() { return t("settings.allowlist.description"); },
            get placeholder() { return t("settings.allowlist.placeholder"); },
            default: "",
            multiline: true,
        },
    },

    patches: [PATCH],

    /** Called by Discord's link click handler. True means we took over the click. */
    intercept(url: unknown, event: any, open: () => void, cancel: () => void, props: any) {
        if (!running || typeof url !== "string" || typeof open !== "function") return false;
        try {
            const analysis = analyzeLink(url, { text: linkText(event, props), allowlist });
            if (!meetsThreshold(analysis.level, threshold)) return false;
            event?.preventDefault?.();
            openWarning(analysis, open, typeof cancel === "function" ? cancel : () => {});
            return true;
        } catch {
            // Never break links: fall back to Discord's own flow
            return false;
        }
    },

    start(ctx) {
        const apply = (values: { threshold: string; allowlist: string; }) => {
            threshold = THRESHOLDS.includes(values.threshold as RiskLevel) ? values.threshold as RiskLevel : "caution";
            allowlist = parseAllowlist(values.allowlist);
        };
        apply({ threshold: ctx.settings.get("threshold"), allowlist: ctx.settings.get("allowlist") });
        ctx.settings.onChange(apply);
        ctx.addStyle(css);
        running = true;
        ctx.onDispose(() => {
            running = false;
            closeOpen?.({ instant: true });
        });
    },
});
