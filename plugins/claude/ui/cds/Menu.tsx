// Menu + Popover, anchored to a trigger and rendered in the shadow root's portal layer.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePortal } from "./shadow";
import { Icon, type IconName } from "./Icon";
import { Shortcut } from "./Controls";
import { lazyContext } from "../lazyReact";

export type Side = "top" | "bottom" | "right";
export type Align = "start" | "center" | "end";

function position(anchor: DOMRect, pop: DOMRect, side: Side, align: Align, offset: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0;
    let left = 0;
    if (side === "right") {
        left = anchor.right + offset;
        top = align === "end" ? anchor.bottom - pop.height : anchor.top;
    } else {
        const above = anchor.top - offset - pop.height;
        const below = anchor.bottom + offset;
        top = side === "top" ? (above < 8 && below + pop.height < vh ? below : above) : below + pop.height > vh - 8 && above > 8 ? above : below;
        left = align === "start" ? anchor.left : align === "end" ? anchor.right - pop.width : anchor.left + anchor.width / 2 - pop.width / 2;
    }
    left = Math.max(8, Math.min(left, vw - pop.width - 8));
    top = Math.max(8, Math.min(top, vh - pop.height - 8));
    const availH = side === "top" ? anchor.top - offset - 8 : side === "bottom" ? vh - anchor.bottom - offset - 8 : vh - 16;
    return { top, left, availH };
}

function useFloating(open: boolean, anchor: RefObject<HTMLElement | null> | (() => DOMRect | null), side: Side, align: Align, offset: number) {
    const pop = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const a = typeof anchor === "function" ? anchor() : anchor.current?.getBoundingClientRect();
            const p = pop.current?.getBoundingClientRect();
            if (!a || !p) return;
            const { top, left, availH } = position(a, p, side, align, offset);
            setStyle({ position: "fixed", top, left, ["--available-height" as any]: `${Math.max(120, availH)}px`, ["--available-width" as any]: `${window.innerWidth - 16}px` });
        };
        place();
        const ro = new ResizeObserver(place);
        if (pop.current) ro.observe(pop.current);
        window.addEventListener("resize", place);
        return () => (ro.disconnect(), window.removeEventListener("resize", place));
    }, [open, side, align, offset]);
    return { pop, style };
}

function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const path = e.composedPath();
            if (refs.some(r => r.current && path.includes(r.current))) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener("pointerdown", onDown, true);
        window.addEventListener("keydown", onKey, true);
        return () => (window.removeEventListener("pointerdown", onDown, true), window.removeEventListener("keydown", onKey, true));
    }, [open]);
}

// ---------------------------------------------------------------- Popover
export const POPOVER =
    "draggable-none max-w-[320px] max-h-[var(--available-height)] rounded-card bg-surface-3 shadow-panel cds-reset text-body font-normal text-primary outline-none focus-visible:outline-hidden";
const POPOVER_BODY =
    "[display:inherit] [flex-direction:inherit] [flex-wrap:inherit] [align-items:inherit] [justify-content:inherit] [justify-items:inherit] [gap:inherit] [grid-template-columns:inherit] [grid-template-rows:inherit] [grid-auto-flow:inherit] [grid-auto-columns:inherit] [grid-auto-rows:inherit] col-span-full row-span-full self-stretch justify-self-stretch max-h-[inherit] min-h-0 min-w-0 flex-auto overflow-y-auto rounded-[inherit] outline-none focus-visible:outline-hidden scroll-fade-y";

export function Popover({
    open,
    onClose,
    anchor,
    side = "bottom",
    align = "center",
    offset = 6,
    padding = "p-lg",
    className = "",
    cds = "Popover",
    style: extra,
    children,
}: {
    open: boolean;
    onClose: () => void;
    anchor: RefObject<HTMLElement | null> | (() => DOMRect | null);
    side?: Side;
    align?: Align;
    offset?: number;
    padding?: string;
    className?: string;
    cds?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    const portal = usePortal();
    const { pop, style } = useFloating(open, anchor, side, align, offset);
    useDismiss(open, onClose, [pop, typeof anchor === "function" ? { current: null } : anchor]);
    if (!open || !portal) return null;
    return createPortal(
        <div ref={pop} role="dialog" data-cds={cds} className={`${POPOVER} ${className}`} style={{ ...style, ...extra }}>
            <div tabIndex={-1} data-cds-popover-body="" className={`${POPOVER_BODY} ${padding}`}>
                {children}
            </div>
        </div>,
        portal,
    );
}

// ---------------------------------------------------------------- Menu
const MENU_POPUP =
    "cds-reset draggable-none group/menu-popup relative flex flex-col min-w-[128px] max-w-[320px] max-h-[var(--available-height)] rounded-card bg-surface-3 shadow-panel text-body font-normal text-primary outline-none focus-visible:outline-hidden";
export const MENU_ITEM =
    "cds-reset flex w-full items-center gap-xs compact:px-2 comfortable:px-2.5 py-[calc((var(--cds-h-control)-var(--cds-leading-body))/2)] rounded text-body font-normal [--cds-shortcut-cap-ink:var(--cds-text-muted)] select-none outline-none focus-visible:outline-hidden data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none";
const ITEM_DEFAULT = "text-primary data-[highlighted]:bg-fill-ghost-hover";
const ITEM_DANGER = "group/menu-danger text-danger data-[highlighted]:bg-fill-danger data-[highlighted]:text-on-danger data-[highlighted]:[--cds-shortcut-cap-ink:currentColor]";
const ITEM_DESC_PAD = "pb-[calc((var(--cds-h-control)-var(--cds-font-size-body)-var(--cds-leading-footnote)+var(--cds-font-size-footnote))/2)]";

interface MenuCtxT {
    close: () => void;
    highlight: number;
    setHighlight: (i: number) => void;
}
const MenuCtx = lazyContext<MenuCtxT | null>(null);
const MenuProvider = (p: { value: MenuCtxT; children: ReactNode }) => {
    const P = MenuCtx().Provider;
    return <P value={p.value}>{p.children}</P>;
};

export function Menu({
    open,
    onClose,
    anchor,
    side = "top",
    align = "start",
    offset = 6,
    className = "",
    cds = "Menu",
    header,
    children,
    onDigit,
}: {
    open: boolean;
    onClose: () => void;
    anchor: RefObject<HTMLElement | null>;
    side?: Side;
    align?: Align;
    offset?: number;
    className?: string;
    cds?: string;
    header?: ReactNode;
    children: ReactNode;
    onDigit?: (n: number) => void;
}) {
    const portal = usePortal();
    const { pop, style } = useFloating(open, anchor, side, align, offset);
    const [highlight, setHighlight] = useState(-1);
    useDismiss(open, onClose, [pop, anchor]);
    useEffect(() => {
        if (!open) return setHighlight(-1);
        const onKey = (e: KeyboardEvent) => {
            const items = Array.from(pop.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([data-disabled])") ?? []);
            if (!items.length) return;
            const cur = items.findIndex(x => x.hasAttribute("data-highlighted"));
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
                items.forEach((x, i) => (i === next ? x.setAttribute("data-highlighted", "") : x.removeAttribute("data-highlighted")));
                items[next].focus();
            } else if ((e.key === "Enter" || e.key === " ") && cur >= 0) {
                e.preventDefault();
                e.stopPropagation();
                items[cur].click();
            } else if (onDigit && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onDigit(Number(e.key));
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open]);
    if (!open || !portal) return null;
    return createPortal(
        <MenuProvider value={{ close: onClose, highlight, setHighlight }}>
            <div ref={pop} role="menu" data-cds={cds} className={`${MENU_POPUP} epitaxy-root break-words ${className}`} style={style}>
                {header ? (
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-[inherit]">
                        <div className="shrink-0 px-1 pt-1">{header}</div>
                        <div className="min-h-0 flex-1 overflow-y-auto scroll-fade-y border-b-[length:var(--cds-ring-inner)] border-transparent p-1 pt-0">{children}</div>
                    </div>
                ) : (
                    <div className="min-h-0 overflow-y-auto scroll-fade-y rounded-[inherit] border-b-[length:var(--cds-ring-inner)] border-transparent p-1">{children}</div>
                )}
            </div>
        </MenuProvider>,
        portal,
    );
}

export function MenuItem({
    icon,
    iconNode,
    label,
    description,
    checked,
    checkedRole,
    danger,
    disabled,
    shortcut,
    hint,
    trailing,
    keepOpen,
    onSelect,
    title,
}: {
    icon?: IconName;
    iconNode?: ReactNode;
    label: ReactNode;
    description?: ReactNode;
    checked?: boolean;
    checkedRole?: "radio" | "checkbox";
    danger?: boolean;
    disabled?: boolean;
    shortcut?: string;
    hint?: ReactNode;
    trailing?: ReactNode;
    keepOpen?: boolean;
    onSelect?: () => void;
    title?: string;
}) {
    const ctx = useContext(MenuCtx());
    const role = checkedRole === "radio" ? "menuitemradio" : checkedRole === "checkbox" ? "menuitemcheckbox" : "menuitem";
    return (
        <div
            role={role}
            tabIndex={-1}
            title={title}
            aria-checked={checkedRole ? !!checked : undefined}
            aria-disabled={disabled || undefined}
            data-disabled={disabled ? "" : undefined}
            data-cds-icon-row={icon || iconNode ? "" : undefined}
            className={`${MENU_ITEM} ${danger ? ITEM_DANGER : ITEM_DEFAULT} ${description ? ITEM_DESC_PAD : ""}`}
            onPointerMove={e => {
                const el = e.currentTarget;
                el.parentElement?.querySelectorAll("[data-highlighted]").forEach(x => x !== el && x.removeAttribute("data-highlighted"));
                el.setAttribute("data-highlighted", "");
            }}
            onPointerLeave={e => e.currentTarget.removeAttribute("data-highlighted")}
            onClick={() => {
                if (disabled) return;
                onSelect?.();
                if (!keepOpen) ctx?.close();
            }}
        >
            {(icon || iconNode) && <span className="flex size-icon shrink-0 items-center justify-center">{iconNode ?? <Icon name={icon!} size="sm" />}</span>}
            {description ? (
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{label}</span>
                    <span className="truncate py-[0.125em] -my-[0.125em] text-footnote text-muted group-data-[highlighted]/menu-danger:text-on-danger">{description}</span>
                </span>
            ) : (
                <span className="min-w-0 flex-1 truncate">{label}</span>
            )}
            {(trailing || checked || hint || shortcut) && (
                <span className="ml-md flex shrink-0 items-center gap-xs">
                    {trailing}
                    {checked && checkedRole === "radio" && (
                        <span className="flex size-icon shrink-0 items-center justify-center -mr-1" style={{ color: "var(--cds-fill-accent)" }}>
                            <Icon name="Check" size="sm" bold />
                        </span>
                    )}
                    {hint && <span className="max-w-[160px] shrink-0 truncate py-[0.125em] -my-[0.125em] text-footnote text-muted">{hint}</span>}
                    {shortcut && (
                        <span
                            data-cds="Shortcut"
                            data-variant="text"
                            aria-hidden="true"
                            className="inline-flex shrink-0 items-baseline gap-[0.3em] text-caption pointer-coarse:hidden text-footnote tabular-nums"
                        >
                            <kbd className="font-inherit [font-variation-settings:inherit] [color:var(--cds-shortcut-cap-ink)]">{shortcut}</kbd>
                        </span>
                    )}
                </span>
            )}
        </div>
    );
}

export const MenuSeparator = () => <div role="separator" className="compact:mx-2 comfortable:mx-2.5 my-1 h-px bg-border" />;
export const MenuLabel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <div role="presentation" className={`compact:px-2 comfortable:px-2.5 py-1 text-footnote font-medium text-muted ${className}`}>
        {children}
    </div>
);

export function Switch({ checked, size = "sm" }: { checked?: boolean; size?: "xs" | "sm" }) {
    const w = size === "xs" ? 22 : 26;
    const h = size === "xs" ? 12 : 14;
    return (
        <span
            data-cds="Switch"
            data-checked={checked ? "" : undefined}
            className="relative inline-flex shrink-0 items-center rounded-full transition-colors duration-fast"
            style={{ width: w, height: h, background: checked ? "var(--cds-fill-accent)" : "var(--cds-alpha-3)" }}
        >
            <span
                className="absolute rounded-full transition-transform duration-fast"
                style={{ width: h - 4, height: h - 4, left: 2, background: "var(--cds-surface-1)", transform: checked ? `translateX(${w - h}px)` : "none" }}
            />
        </span>
    );
}

export { Shortcut };
