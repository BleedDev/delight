// Small form pieces: Shortcut keycaps, TextArea, Checkbox, TextLink.
import { type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";

const MAC = navigator.platform.toLowerCase().includes("mac");
const KEY_LABEL: Record<string, [string, string]> = {
    cmd: MAC ? ["⌘", "Command"] : ["Ctrl", "Control"],
    ctrl: ["Ctrl", "Control"],
    shift: ["⇧", "Shift"],
    alt: MAC ? ["⌥", "Option"] : ["Alt", "Alt"],
    enter: ["↵", "Enter"],
    esc: ["esc", "Escape"],
    tab: ["⇥", "Tab"],
    up: ["↑", "Up"],
    down: ["↓", "Down"],
};
const CAP =
    "inline-flex shrink-0 items-center justify-center h-[calc(1em+6px)] rounded-[var(--cds-keycap-radius,4px)] [color:var(--cds-shortcut-cap-ink)] bg-[color:var(--cds-shortcut-cap-fill)] border border-[color:var(--cds-shortcut-cap-line)] font-inherit [font-variation-settings:inherit] [line-height:1]";
const capClass = (label: string) => `${CAP} ${Array.from(label).length === 1 ? "w-[calc(1em+6px)] px-0" : "min-w-[calc(1em+6px)] px-[3px]"}`;

export function Shortcut({ keys, onFill, className = "" }: { keys: string; onFill?: boolean; className?: string }) {
    const parts = keys.split("+").map(k => KEY_LABEL[k.toLowerCase()] ?? [k.toUpperCase(), k]);
    return (
        <span
            data-cds="Shortcut"
            data-variant="keycap"
            className={`inline-flex shrink-0 items-center gap-[2px] text-caption ${onFill ? "[--cds-shortcut-cap-ink:currentColor]" : ""} ${className}`}
        >
            {parts.map(([label, spoken], i) => (
                <kbd key={i} className={capClass(label)}>
                    <span aria-hidden="true">{label}</span>
                    <span className="sr-only select-none">{spoken}</span>
                </kbd>
            ))}
        </span>
    );
}

export function TextArea({
    ref,
    className = "",
    rows = 3,
    autosize,
    bare,
    style,
    ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { autosize?: boolean; bare?: boolean; ref?: Ref<HTMLTextAreaElement> }) {
    const base = bare
        ? "block resize-none border-0 bg-transparent p-0 shadow-none"
        : "cds-input font-normal rounded bg-fill-field shadow-field-ring data-[invalid]:shadow-field-invalid px-md py-sm transition duration-fast enabled:[&:hover:not(:focus):not([data-invalid])]:shadow-field-hover focus-visible:shadow-focus resize-none";
    const auto = autosize ? "[field-sizing:content]" : "";
    const minH = autosize ? (bare ? "min-h-[calc(var(--cds-textarea-rows)*1lh)]" : "min-h-[calc(var(--cds-textarea-rows)*1lh+2*var(--cds-pad-sm))]") : "";
    return (
        <textarea
            ref={ref}
            data-cds="TextArea"
            rows={rows}
            style={autosize ? ({ ...style, "--cds-textarea-rows": rows } as any) : style}
            className={`cds-reset w-full ${base} font-sans text-body text-primary placeholder:text-muted outline-none focus-visible:outline-hidden disabled:opacity-disabled ${auto} ${minH} ${className}`}
            {...rest}
        />
    );
}

export function Checkbox({ checked, className = "" }: { checked?: boolean; className?: string }) {
    return (
        <span
            data-checked={checked ? "" : undefined}
            data-unchecked={checked ? undefined : ""}
            className={`flex shrink-0 size-[var(--cds-checkbox)] items-center justify-center rounded-[var(--cds-checkbox-radius)] border ${checked ? "bg-fill-accent border-transparent" : "border-strong bg-transparent"} ${className}`}
        >
            {checked && (
                <span className="text-on-accent">
                    <Icon name="Check" size="sm" bold style={{ fontSize: "var(--cds-checkbox-glyph)" }} />
                </span>
            )}
        </span>
    );
}

export function RadioMark({ checked, className = "" }: { checked?: boolean; className?: string }) {
    return (
        <span aria-hidden="true" data-checked={checked ? "" : undefined} data-unchecked={checked ? undefined : ""} className={`epitaxy-radio-mark ${className}`}>
            {checked && <span className="epitaxy-radio-mark-dot" />}
        </span>
    );
}

export function TextLink({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
    return (
        <span
            data-cds="TextLink"
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())}
            className={`cds-reset cds-text-link cds-text-link-underline inline cursor-pointer ${className}`}
        >
            {children}
        </span>
    );
}
