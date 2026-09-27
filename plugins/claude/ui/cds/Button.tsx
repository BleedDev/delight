// Button: the plugin's button (variants, sizes, icon-only, keyboard shortcut hint, busy state).
// (button > squish > paint, then the content span).
import { type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { Icon, type IconName, type IconSize } from "./Icon";
import { Shortcut } from "./Controls";

export type ButtonVariant = "ghost" | "ghost-subtle" | "primary" | "secondary" | "danger" | "outline";
export type ButtonSize = "xs" | "sm" | "base" | "lg";

const BASE =
    "cds-reset group/btn relative isolate inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none cursor-[var(--cds-cursor-interactive)] aria-disabled:cursor-default data-[disabled]:cursor-default border-0 outline-none focus-visible:outline-hidden [&[data-initial-focus]:focus]:outline-hidden rounded h-control font-sans text-body [&:disabled:not([aria-busy])]:opacity-disabled disabled:pointer-events-none transition-shadow duration-fast";
const FOCUS = "focus-visible:shadow-focus [&[data-initial-focus]:focus]:shadow-focus";
const PAINT_BASE =
    "absolute inset-0 rounded-[inherit] transition-[background-color,box-shadow,color] duration-fast ease-out group-focus-visible/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)] group-[[data-initial-focus]:focus]/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)]";

const TEXT: Record<ButtonVariant, string> = {
    ghost: "text-primary font-normal aria-pressed:text-accent",
    "ghost-subtle": "text-primary font-normal aria-pressed:text-accent",
    primary: "text-on-primary font-medium [--cds-shortcut-cap-ink:currentColor]",
    secondary: "text-primary font-normal aria-pressed:text-accent",
    outline: "text-primary font-medium",
    danger: "text-on-danger font-medium [--cds-shortcut-cap-ink:currentColor]",
};
const PAINT: Record<ButtonVariant, string> = {
    ghost: "bg-transparent group-hover/btn:bg-fill-ghost-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-ghost-hover group-aria-pressed/btn:bg-accent group-hover/btn:group-aria-pressed/btn:bg-accent ",
    "ghost-subtle": "bg-transparent group-hover/btn:bg-fill-ghost",
    primary:
        "bg-fill-primary group-hover/btn:bg-fill-primary-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-primary-hover group-aria-pressed/btn:bg-accent group-hover/btn:group-aria-pressed/btn:bg-accent",
    secondary:
        "bg-fill-secondary group-hover/btn:bg-fill-secondary-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-secondary-hover group-aria-pressed/btn:bg-accent group-hover/btn:group-aria-pressed/btn:bg-accent shadow-field group-aria-pressed/btn:shadow-field-pressed group-focus-visible/btn:group-aria-pressed/btn:shadow-[inset_0_0_0_1px_var(--cds-page-bg)]",
    outline: "bg-transparent group-hover/btn:bg-fill-ghost-hover shadow-[inset_0_0_0_1px_var(--cds-border)]",
    danger: "bg-fill-danger group-hover/btn:bg-fill-danger-hover group-[[aria-haspopup][aria-expanded=true]]/btn:bg-fill-danger-hover",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconName;
    iconEnd?: IconName;
    iconSize?: IconSize | number;
    iconClassName?: string;
    iconOnly?: boolean;
    shrink?: boolean;
    squish?: boolean;
    pressed?: boolean;
    shortcut?: string;
    busy?: boolean;
    children?: ReactNode;
    cds?: string;
}

const ICON_FOR: Record<ButtonSize, IconSize | number> = { xs: "xs", sm: "sm", base: "sm", lg: "md" };

export function Button({
    ref,
    variant = "ghost",
    size = "base",
    icon,
    iconEnd,
    iconSize,
    iconClassName,
    iconOnly,
    shrink = true,
    squish = true,
    pressed,
    shortcut,
    busy,
    className = "",
    children,
    cds = "Button",
    type = "button",
    ...rest
}: ButtonProps & { ref?: Ref<HTMLButtonElement> }) {
    const ghost = variant === "ghost" || variant === "ghost-subtle";
    const layout = iconOnly ? "aspect-square w-control px-0" : "px-md min-w-0";
    const focus = variant === "danger" ? "focus-visible:shadow-focus-danger [&[data-initial-focus]:focus]:shadow-focus-danger" : FOCUS;
    const cls = [
        BASE.replace("inline-flex items-center", shrink ? "inline-flex shrink-0 items-center" : "inline-flex items-center"),
        TEXT[variant],
        focus,
        layout,
        busy ? "pointer-events-none" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");
    const solid = variant === "primary" || variant === "danger";
    const is = iconSize ?? ICON_FOR[size];
    return (
        <button
            ref={ref}
            type={type}
            data-cds={cds}
            data-cds-icon-only={iconOnly ? "" : undefined}
            data-cds-ghost={ghost ? "" : undefined}
            data-size={size === "base" ? undefined : size}
            aria-pressed={pressed}
            aria-busy={busy || undefined}
            className={cls}
            {...rest}
        >
            <span aria-hidden="true" className={`absolute -z-[1] rounded-[inherit] ${solid ? "inset-[0.5px]" : "inset-0"} ${squish ? "cds-btn-squish" : ""}`}>
                <span data-cds-part="paint" className={`${PAINT_BASE} ${PAINT[variant]}`} />
            </span>
            <span className={`inline-flex min-w-0 items-center gap-1 ${busy ? "opacity-0" : ""}`}>
                {icon && <Icon name={icon} size={is} className={iconOnly ? iconClassName : `-ms-1 ${iconClassName ?? ""}`} />}
                {children}
                {iconEnd && <Icon name={iconEnd} size="xs" className="text-muted" />}
                {shortcut && <Shortcut keys={shortcut} className="pointer-coarse:hidden ms-1 me-[calc((var(--cds-h-control)-1em-6px)/2-var(--cds-pad-md))]" />}
            </span>
        </button>
    );
}
