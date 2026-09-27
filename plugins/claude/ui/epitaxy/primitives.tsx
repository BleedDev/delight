// Small building blocks shared by the transcript: row layouts, carets, expanding bodies, copy buttons, timers.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../cds/Icon";
import { Button } from "../cds/Button";

export const ROW_GAP075 =
    "relative group/tool flex self-start max-w-full items-center py-0 gap-0.75 text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm";
export const ROW_GAP05 =
    "relative group/tool flex self-start max-w-full items-center py-0 gap-0.5 text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm";
export const C_ACTIVE = "text-secondary group-hover/tool:text-primary";
export const C_IDLE = "text-muted group-hover/tool:text-secondary group-focus-visible/tool:text-secondary group-has-[:focus-visible]/tool:text-secondary";
export const C_SETTLED = "text-muted group-hover/tool:text-secondary";
export const GROUP_CARD = "flex flex-col epitaxy-card-outline-layer rounded-lg overflow-clip mt-pad-md divide-y [&>*]:px-2.5 [&>*]:py-md";
export const TASK_CARD = "relative isolate flex self-start min-w-[318px] max-w-[318px] items-start gap-xs rounded-lg pl-2.5 pr-xs py-sm text-left";
export const BTN_FOCUS = "group/btn cursor-pointer focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus";
export const HOVER_REVEAL_BODY =
    "transition-opacity duration-fast ease-snap group-hover/body:duration-snap group-hover/body:delay-100 group-has-[:focus-visible]/body:duration-snap focus-within:duration-snap starting:opacity-0 motion-reduce:transition-none pointer-coarse:transition-none [@media(hover:none)]:transition-none";
export const COLUMN =
    "mx-auto [.epitaxy-chat-panel_&]:[@container_tile-slot_(max-width:560px)]:[--chat-gutter:16px] [--chat-column-gutter-start:var(--chat-gutter-start,var(--chat-gutter,32px))] [--chat-column-gutter-end:var(--chat-gutter-end,var(--chat-gutter,32px))] [[data-chat-gutter-start=shave]_&]:[--chat-column-gutter-start:var(--chat-gutter-start,calc(var(--chat-gutter)-(var(--tiles-gap)-var(--tiles-padding))))] [[data-chat-gutter-end=shave]_&]:[--chat-column-gutter-end:var(--chat-gutter-end,calc(var(--chat-gutter)-(var(--tiles-gap)-var(--tiles-padding))))] [[data-chat-gutter-end=bleed]_&]:[--chat-column-gutter-end:var(--chat-gutter-end,calc(var(--chat-gutter)+var(--tiles-padding)))] max-w-[calc(var(--max-content-width)+var(--chat-column-gutter-start)+var(--chat-column-gutter-end))] ps-[var(--chat-column-gutter-start)] pe-[var(--chat-column-gutter-end)] [[data-pane-overlay]_&]:[translate:var(--epitaxy-overlay-column-shift,none)] *:[--epitaxy-overlay-column-shift:none] [[data-pane-overlay]_&]:[transition:translate_var(--tile-overlay-duration)_var(--tile-overlay-ease)] [--max-content-width:var(--chat-column-measure,768px)] [[data-transcript-width=m]_&]:[--max-content-width:var(--chat-column-measure,960px)] [[data-transcript-width=l]_&]:[--max-content-width:var(--chat-column-measure,1280px)]";
export const ROW_PAD =
    "pb-[var(--chat-turn-gap)] [@media(hover:hover)_and_(pointer:fine)]:has-[[data-hover-line]]:pb-0 has-[[data-solo-line]:not([data-hover-line])]:pb-0 [@media(hover:hover)_and_(pointer:fine)]:[&:has([data-working-row])_[data-hover-line]]:mb-[var(--chat-line-gap,22px)] [@media(hover:hover)_and_(pointer:fine)]:[&:has([data-hover-line])_[data-working-row]]:mt-0";

export const CODE_THEME: any = {
    background: "light-dark(var(--code-theme-light-bg, var(--cds-alpha-1)), var(--code-theme-dark-bg, var(--cds-alpha-1)))",
    "--code-theme-light-bg": "#ffffff",
    "--code-theme-dark-bg": "#1a1a19",
    "--code-theme-light-selection-bg": "#0073e640",
    "--code-theme-dark-selection-bg": "#0099ff4d",
    "--cds-code-text-selection-bg": "light-dark(#0073e640, #0099ff4d)",
};

export function Caret({ expanded, colorClassName = "text-secondary", className = "" }: { expanded?: boolean; colorClassName?: string; className?: string }) {
    return (
        <span className={`shrink-0 ${colorClassName} ${className}`}>
            <Icon name="CaretRight" size={14} className={`transition-transform duration-fast motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} />
        </span>
    );
}

export function Chevron({ center }: { center?: boolean }) {
    return (
        <span
            className={center ? "shrink-0 self-center text-muted" : "flex shrink-0 items-center self-start text-muted"}
            style={center ? undefined : { height: "var(--cds-leading-body)" }}
        >
            <Icon name="CaretRight" size="sm" />
        </span>
    );
}

// Lazy: nothing is mounted until the first open; afterwards it's kept and toggled with `hidden`.
export function ExpandingBody({ expanded, children }: { expanded: boolean; children: ReactNode }) {
    const [mounted, setMounted] = useState(expanded);
    useEffect(() => {
        if (expanded) setMounted(true);
    }, [expanded]);
    if (!mounted && !expanded) return null;
    return (
        <div className={expanded ? "epitaxy-expanding-body flow-root" : "epitaxy-expanding-body"} hidden={!expanded}>
            {children}
        </div>
    );
}

export function useCopy(ms = 1200): [boolean, (text: string) => void] {
    const [copied, setCopied] = useState(false);
    const t = useRef<any>(null);
    return [
        copied,
        (text: string) => {
            navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
            clearTimeout(t.current);
            t.current = setTimeout(() => setCopied(false), ms);
        },
    ];
}

export function CopyButton({ text, compact, alwaysVisible, label }: { text: string | (() => string); compact?: boolean; alwaysVisible?: boolean; label?: string }) {
    const [copied, copy] = useCopy();
    return (
        <div className={alwaysVisible ? "shrink-0" : "opacity-0 group-hover/body:opacity-100 focus-within:opacity-100 " + HOVER_REVEAL_BODY}>
            <Button
                variant="ghost"
                size={compact ? "xs" : "base"}
                iconOnly
                icon={copied ? "Check" : "Copy"}
                aria-label={copied ? "Copied" : (label ?? "Copy")}
                onMouseDown={e => e.preventDefault()}
                onClick={e => {
                    e.stopPropagation();
                    copy(typeof text === "function" ? text() : text);
                }}
            />
        </div>
    );
}

export function DiffCounts({ adds, dels }: { adds: number; dels: number }) {
    return (
        <span className="inline-flex">
            <span className="flex gap-0.5 items-center text-body tabular-nums shrink-0">
                <span className="text-git-added">+{adds}</span>
                <span className="text-git-removed">-{dels}</span>
            </span>
        </span>
    );
}

export function Spinner({ className = "" }: { className?: string }) {
    return (
        <span data-cds="Spinner" className={`relative inline-block shrink-0 align-middle ${className}`} aria-hidden="true" style={{ width: "1em", height: "1em" }}>
            <span className="absolute inset-0 rounded-full" style={{ border: "1.5px solid color-mix(in srgb,currentColor 25%,transparent)" }} />
            <span
                className="absolute inset-0 rounded-full animate-[spin_1s_linear_infinite]"
                style={{ border: "1.5px solid currentColor", WebkitMask: "conic-gradient(#000 0 25%, transparent 25%)", mask: "conic-gradient(#000 0 25%, transparent 25%)" }}
            />
        </span>
    );
}

export function Elapsed({ since, className = "", threshold = 0 }: { since?: number; className?: string; threshold?: number }) {
    const [, tick] = useState(0);
    useEffect(() => {
        if (!since) return;
        const t = setInterval(() => tick(x => x + 1), 1000);
        return () => clearInterval(t);
    }, [since]);
    if (!since) return null;
    const s = Math.floor((Date.now() - since) / 1000);
    if (s < threshold) return null;
    return <span className={className}>{formatDuration(s)}</span>;
}
export function formatDuration(s: number) {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
