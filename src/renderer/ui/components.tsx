/**
 * Settings UI building blocks. Controls and typography are Discord's own (see discord.tsx) so the
 * settings look and behave exactly like the rest of Discord's; Evi's versions below are only
 * fallbacks for when Discord renames one of its components. Layout (sections, lists, rows) follows
 * the measurements of Discord's own settings layout, see styles.css.
 */
import type { ButtonHTMLAttributes, ComponentType, ReactElement, ReactNode } from "react";

import type { SettingDefinition } from "../plugins/types";
import { exitDone } from "../toolkit/layer";
import { React, ReactDOM } from "../webpack/common";
import { DiscordUI } from "./discord";
import { Icon, iconComponent, IconName } from "./icons";

export { Icon, iconComponent };
export type { IconName };

export const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

// ---- typography -------------------------------------------------------------------------------

/**
 * Discord's text component: `variant` is a name from its type scale ("heading-md/medium",
 * "text-sm/normal", ...) and `color` one of its text tokens ("text-strong", "text-subtle", ...).
 */
export function Text({ variant, tag = "div", color, className, id, children, tabular, role }: {
    variant: string;
    tag?: string;
    color?: string;
    className?: string;
    id?: string;
    children?: ReactNode;
    tabular?: boolean;
    role?: string;
}) {
    const Native = DiscordUI.Text.get;
    if (Native) {
        return <Native variant={variant} tag={tag} color={color} className={className} id={id} tabularNumbers={tabular} role={role}>{children}</Native>;
    }
    const Tag = tag as "div";
    return <Tag className={cx("dl-text", tabular && "dl-tabular", className)} data-variant={variant} data-color={color} id={id} role={role}>{children}</Tag>;
}

// ---- buttons ----------------------------------------------------------------------------------

type ButtonVariant = "accent" | "secondary" | "danger" | "icon";

const manaVariant = { accent: "primary", secondary: "secondary", danger: "critical-secondary", icon: "icon-only" } as const;

/**
 * Discord's button. `children` is the label and `icon` goes before it. Variant "icon" is icon-only
 * and needs an aria-label; prefer IconButton, which adds the tooltip.
 */
export function Button({ variant = "secondary", size = "sm", icon, children, onClick, disabled, type = "button", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    icon?: IconName;
}) {
    const text = typeof children === "string" ? children : undefined;
    const Mana = DiscordUI.ManaButton.get;
    // Discord's button takes a plain-text label; anything richer uses the fallbacks below
    if (Mana && (text || (variant === "icon" && icon))) {
        return (
            <Mana
                variant={manaVariant[variant]}
                size={size}
                text={text}
                icon={icon && iconComponent(icon)}
                type={type as "button" | "submit"}
                onClick={onClick as () => void}
                disabled={disabled}
                className={className}
                id={props.id}
                aria-label={props["aria-label"]}
                aria-expanded={props["aria-expanded"] as boolean | undefined}
                aria-controls={props["aria-controls"]}
            />
        );
    }

    const Legacy = DiscordUI.Button.get;
    if (Legacy && variant !== "icon") {
        const { Colors = {}, Sizes = {} } = Legacy as any;
        return (
            <Legacy
                color={variant === "accent" ? Colors.BRAND : variant === "danger" ? Colors.RED : Colors.PRIMARY}
                size={Sizes.SMALL}
                onClick={onClick as any}
                disabled={disabled}
                aria-label={props["aria-label"]}
            >
                <span className="dl-button-content">{icon && <Icon name={icon} />}{children}</span>
            </Legacy>
        );
    }

    return (
        <button type={type} className={cx("dl-button", className)} data-variant={variant} data-size={size} onClick={onClick} disabled={disabled} {...props}>
            {icon && <Icon name={icon} />}
            {children}
        </button>
    );
}

/** Discord's tooltip on a focusable element; without it, the element's aria-label still names it */
export function Tooltip({ text, children }: { text: string; children: ReactElement; }) {
    const Native = DiscordUI.Tooltip.get;
    return Native ? <Native text={text}>{children}</Native> : children;
}

/** Icon-only button: the label is both its accessible name and its tooltip */
export function IconButton({ icon, label, onClick, className, ...props }: {
    icon: IconName;
    label: string;
    onClick(): void;
    className?: string;
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
}) {
    return (
        <Tooltip text={label}>
            <Button variant="icon" icon={icon} aria-label={label} onClick={onClick} className={className} {...props} />
        </Tooltip>
    );
}

// ---- inputs -----------------------------------------------------------------------------------

export function Switch({ checked, onChange, label, labelledBy, disabled }: {
    checked: boolean;
    onChange(checked: boolean): void;
    /** Accessible name when there's no visible label to point at */
    label?: string;
    labelledBy?: string;
    /** Say why next to it: a disabled control's tooltip never opens for the keyboard */
    disabled?: boolean;
}) {
    const Native = DiscordUI.Switch.get;
    // Discord's switch is named through labelledBy only
    if (Native && labelledBy) return <Native checked={checked} onChange={onChange} labelledBy={labelledBy} disabled={disabled} />;
    return (
        <button
            type="button"
            role="switch"
            className="dl-switch"
            aria-checked={checked}
            aria-label={label}
            aria-labelledby={labelledBy}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        />
    );
}

/** Discord's settings toggle row: label and description on the left, switch on the right */
export function SwitchRow({ id, label, description, checked, onChange }: {
    id: string;
    label: string;
    description?: string;
    checked: boolean;
    onChange(checked: boolean): void;
}) {
    const Native = DiscordUI.SwitchRow.get;
    if (Native) return <Native label={label} description={description} checked={checked} onChange={onChange} />;
    const labelId = `${id}-label`;
    return (
        <div className="dl-switch-row">
            <div className="dl-switch-row-text">
                <Text variant="text-md/medium" color="text-strong" id={labelId}>{label}</Text>
                {description && <Text tag="p" variant="text-sm/normal" color="text-subtle">{description}</Text>}
            </div>
            <Switch checked={checked} onChange={onChange} labelledBy={labelId} />
        </div>
    );
}

/**
 * Text input with its label and description. The input is Discord's standard one (never its
 * inline-edit field, which only turns into an input on hover); the label and description around it
 * are ours, so every setting reads the same whichever input renders.
 */
export function TextField({ id, label, hideLabel, description, value, onChange, placeholder, multiline, type = "text", inputMode, spellCheck }: {
    id: string;
    label: string;
    hideLabel?: boolean;
    description?: string;
    value: string;
    onChange(value: string): void;
    placeholder?: string;
    multiline?: boolean;
    type?: string;
    inputMode?: string;
    spellCheck?: boolean;
}) {
    const hintId = description ? `${id}-hint` : undefined;
    const Area = DiscordUI.TextArea.get;
    const Input = DiscordUI.TextInput.get ?? DiscordUI.TextField.get;

    let control: ReactNode;
    if (multiline && Area) {
        control = <Area {...{ id, value, onChange, placeholder, rows: 4, autosize: true, "aria-describedby": hintId } as any} />;
    } else if (!multiline && Input) {
        control = <Input {...{ id, value, onChange, placeholder, type, inputMode, spellCheck, size: "md", "aria-describedby": hintId } as any} />;
    } else {
        const common = { id, placeholder, value, spellCheck, "aria-describedby": hintId };
        control = multiline
            ? <textarea className="dl-textarea" rows={4} {...common} onChange={e => onChange(e.currentTarget.value)} />
            : <input className="dl-input" type={type} inputMode={inputMode as any} {...common} onChange={e => onChange(e.currentTarget.value)} />;
    }

    return (
        <div className="dl-field">
            <label className={hideLabel ? "dl-sr-only" : "dl-label"} htmlFor={id}>{label}</label>
            {description && <p className="dl-hint" id={hintId}>{description}</p>}
            {control}
        </div>
    );
}

/** Search input with Discord's magnifying glass and clear button */
export function SearchField({ id, label, value, onChange, placeholder }: {
    id: string;
    label: string;
    value: string;
    onChange(value: string): void;
    placeholder?: string;
}) {
    const Input = DiscordUI.TextInput.get;
    if (Input) {
        return (
            <Input
                id={id}
                label={label}
                hideLabel
                type="search"
                leading={iconComponent("search")}
                clearable
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
            />
        );
    }
    return (
        <div className="dl-search-fallback">
            <label className="dl-sr-only" htmlFor={id}>{label}</label>
            <Icon name="search" />
            <input className="dl-input" id={id} type="search" autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={e => onChange(e.currentTarget.value)} />
        </div>
    );
}

/** Large code textarea (Quick CSS), Discord's when available. The label names it for screen readers. */
export function CodeArea({ id, value, onChange, placeholder, label }: {
    id: string;
    value: string;
    onChange(value: string): void;
    placeholder?: string;
    label?: string;
}) {
    const Native = DiscordUI.TextArea.get;
    if (Native) {
        return (
            <div className="dl-code-native">
                <Native id={id} label={label} hideLabel value={value} onChange={onChange} placeholder={placeholder} rows={22} spellCheck={false} />
            </div>
        );
    }
    return (
        <div className="dl-field">
            {label && <label className="dl-sr-only" htmlFor={id}>{label}</label>}
            <textarea id={id} className="dl-textarea dl-code-editor" spellCheck={false} placeholder={placeholder} value={value} onChange={e => onChange(e.currentTarget.value)} />
        </div>
    );
}

/** A row of single-choice filter chips, Discord's filter tags when available */
export function FilterChips<K extends string>({ label, options, value, onChange }: {
    label: string;
    options: { id: K; label: string; count?: number; }[];
    value: K;
    onChange(value: K): void;
}) {
    const Native = DiscordUI.TagGroup.get;
    if (Native) {
        return (
            <div className="dl-chips-native">
                <Native
                    label={label}
                    items={options.map(o => ({ id: o.id, label: o.count === undefined ? o.label : `${o.label} ${o.count}` }))}
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[value]}
                    onSelectionChange={keys => {
                        const [next] = keys;
                        if (next) onChange(next as K);
                    }}
                    variant="filter"
                    size="sm"
                />
            </div>
        );
    }
    return (
        <div className="dl-chips" role="group" aria-label={label}>
            {options.map(o => (
                <button key={o.id} type="button" className="dl-chip" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
                    {o.label}
                    {o.count !== undefined && <span className="dl-tabular">{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

// ---- status -----------------------------------------------------------------------------------

export type Tone = "success" | "warning" | "danger" | "muted";

const toneIcon = { success: "circleCheck", warning: "warning", danger: "circleError", muted: "clock" } as const;

/** Status is always icon + words, never color alone */
export function Status({ tone, children, quiet }: {
    tone: Tone;
    children: ReactNode;
    /** Only the icon takes the tone's color: for the expected state, which shouldn't draw the eye */
    quiet?: boolean;
}) {
    return (
        <span className="dl-status" data-tone={tone} data-quiet={quiet ? "" : undefined}>
            <Icon name={toneIcon[tone]} size={14} />
            {children}
        </span>
    );
}

/** A small label next to a title, styled like Discord's badges */
export function Badge({ children, tone }: { children: ReactNode; tone?: "warning"; }) {
    return <span className="dl-badge" data-tone={tone}>{children}</span>;
}

/** Discord's inline notice with an optional action; Evi's banner when it isn't available */
export function Notice({ tone, action, children }: { tone: "warning" | "danger" | "info"; action?: ReactNode; children: ReactNode; }) {
    const Native = DiscordUI.Notice.get;
    const messageType = ({ warning: "warn", danger: "danger", info: "info" } as const)[tone];
    const body = Native
        ? <Native messageType={messageType} action={action}>{children}</Native>
        : (
            <div className="dl-banner" data-tone={tone}>
                <Icon name={tone === "info" ? "info" : tone === "danger" ? "circleError" : "warning"} size={20} />
                <span className="dl-banner-text">{children}</span>
                {action}
            </div>
        );
    return <div className="dl-notice" role={tone === "danger" ? "alert" : "status"}>{body}</div>;
}

// ---- layout -----------------------------------------------------------------------------------

/** A titled group of settings, like one of Discord's settings categories */
export function Section({ title, description, action, children, id }: {
    title?: string;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    /** Id for the title, which labels the section */
    id?: string;
}) {
    const titleId = title && id ? `${id}-title` : undefined;
    return (
        <section className="dl-section" id={id} aria-labelledby={titleId}>
            {(title || action) && (
                <div className="dl-section-head">
                    <div className="dl-section-text">
                        {title && <Text tag="h2" variant="heading-xl/normal" color="text-strong" id={titleId}>{title}</Text>}
                        {description && <Text tag="p" variant="text-sm/normal" color="text-subtle">{description}</Text>}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

/** Rows in one bordered group with dividers between them, like Discord's settings cards */
export function List({ children, label }: { children: ReactNode; label?: string; }) {
    return <ul className="dl-list" aria-label={label}>{children}</ul>;
}

/** Orients the reader when a list is empty and offers the one next step */
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode; }) {
    return (
        <div className="dl-empty">
            <span className="dl-empty-icon"><Icon name={icon} size={24} /></span>
            <Text tag="h3" variant="heading-md/semibold" color="text-strong">{title}</Text>
            {children && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-empty-text">{children}</Text>}
            {action}
        </div>
    );
}

/**
 * Expands and collapses its content with an interruptible height transition. The content mounts on
 * first open and then stays, hidden from focus and screen readers while collapsed.
 */
export function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode; }) {
    const [mounted, setMounted] = React.useState(open);
    if (open && !mounted) setMounted(true);
    return (
        <div className="dl-collapse" id={id} data-open={open ? "" : undefined}>
            <div className="dl-collapse-clip">{(open || mounted) && children}</div>
        </div>
    );
}

// ---- plugin settings --------------------------------------------------------------------------

/** Discord's dropdown, or a native <select> when it isn't available */
export function Dropdown<V extends string>({ id, label, labelledBy, options, value, onChange }: {
    id: string;
    label: string;
    labelledBy?: string;
    options: readonly { label: string; value: V; }[];
    value: V;
    onChange(value: V): void;
}) {
    const Select = DiscordUI.Select.get;
    if (Select) {
        return (
            <Select
                options={options.map(o => ({ label: o.label, value: o.value }))}
                select={v => onChange(v as V)}
                isSelected={v => v === value}
                serialize={String}
                closeOnSelect
                aria-label={label}
            />
        );
    }
    return (
        <select id={id} className="dl-select" value={value} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} onChange={e => onChange(e.currentTarget.value as V)}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

export function SettingField({ id, definition, value, onChange }: {
    id: string;
    definition: SettingDefinition;
    value: unknown;
    onChange(value: unknown): void;
}) {
    const labelId = `${id}-label`;

    if (definition.type === "boolean") {
        return <SwitchRow id={id} label={definition.label} description={definition.description} checked={!!value} onChange={onChange} />;
    }

    if (definition.type === "string") {
        return (
            <TextField
                id={id}
                label={definition.label}
                description={definition.description}
                value={String(value ?? "")}
                onChange={onChange}
                placeholder={definition.placeholder}
                multiline={definition.multiline}
            />
        );
    }

    let control: ReactNode;
    const Slider = DiscordUI.Slider.get;

    if (definition.type === "select") {
        control = <Dropdown id={id} labelledBy={labelId} label={definition.label} options={definition.options} value={value as string} onChange={onChange} />;
    } else {
        const { min, max, step = 1 } = definition;
        const ranged = min !== undefined && max !== undefined && (max - min) / step <= 20;
        if (ranged && Slider) {
            const markers = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
            control = (
                <Slider
                    initialValue={Number(value)}
                    minValue={min}
                    maxValue={max}
                    markers={markers}
                    stickToMarkers
                    keyboardStep={step}
                    onValueChange={onChange}
                    onMarkerRender={String}
                    onValueRender={v => String(Math.round(v / step) * step)}
                />
            );
        } else {
            return (
                <TextField
                    id={id}
                    label={definition.label}
                    description={definition.description}
                    value={String(value ?? "")}
                    type="number"
                    inputMode="decimal"
                    onChange={v => {
                        const n = Number(v);
                        if (v.trim() && !Number.isNaN(n)) onChange(n);
                    }}
                />
            );
        }
    }

    return (
        <div className="dl-field">
            <Text variant="text-md/medium" color="text-strong" id={labelId}>{definition.label}</Text>
            {definition.description && <Text tag="p" variant="text-sm/normal" color="text-subtle">{definition.description}</Text>}
            {control}
        </div>
    );
}

/** Subscribes a component to an external store */
export function useStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) {
    return React.useSyncExternalStore(subscribe, getSnapshot);
}

// ---- errors -----------------------------------------------------------------------------------

type BoundaryProps = { children: ReactNode; resetKey?: unknown; };
let Boundary: ComponentType<BoundaryProps> | undefined;

/**
 * Keeps a view that throws while rendering from taking the whole panel down with it: shows what
 * went wrong in its place instead. `resetKey` changing (another tab) tries again.
 */
export function ErrorBoundary(props: BoundaryProps) {
    // React is only there once Discord's modules load, so the class is made on first use
    Boundary ??= class extends React.Component<BoundaryProps, { error?: Error; key?: unknown; }> {
        override state: { error?: Error; key?: unknown; } = {};

        static getDerivedStateFromError(error: Error) {
            return { error };
        }

        static getDerivedStateFromProps(props: BoundaryProps, state: { error?: Error; key?: unknown; }) {
            return props.resetKey !== state.key ? { error: undefined, key: props.resetKey } : null;
        }

        override componentDidCatch(error: Error) {
            console.error("[Evi] A settings view crashed", error);
        }

        override render() {
            const { error } = this.state;
            if (!error) return this.props.children;
            return (
                <div className="dl-stack" role="alert">
                    <Notice tone="danger">This view crashed. The rest of Evi still works.</Notice>
                    <pre className="dl-error">{String(error.stack ?? error)}</pre>
                </div>
            );
        }
    };
    return <Boundary {...props} />;
}

// ---- dialogs ----------------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How many Evi dialogs are open: Escape closes the top one instead of the whole panel */
export let openDialogs = 0;
/** Open dialogs, newest last: with one opened from another, Escape closes only the newest */
const dialogStack: object[] = [];

/**
 * What every Evi dialog does: focus moves in on open and back where it was on close, Tab stays
 * inside, and Escape closes it. Put `ref` and `onKeyDown` on the dialog element.
 */
export function useModal(onClose: () => void) {
    const ref = React.useRef<HTMLDivElement>(null);
    const closeRef = React.useRef(onClose);
    closeRef.current = onClose;

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.focus();
        openDialogs++;
        const self = {};
        dialogStack.push(self);
        // Capture phase on window, so Discord's own Escape handling (closing settings) never sees it
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || dialogStack.at(-1) !== self) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            closeRef.current();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            openDialogs--;
            dialogStack.splice(dialogStack.indexOf(self), 1);
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    const trapTab = (e: React.KeyboardEvent) => {
        if (e.key !== "Tab" || !ref.current) return;
        const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return { ref, onKeyDown: trapTab };
}

/**
 * Our dialogs are rendered into <body>, outside Discord's settings screen, which pulls focus back
 * whenever it leaves (Discord's focus layers). Inside it, a dropdown lost focus as it opened and
 * closed again. As its own layer on top, like Discord's nested modals, focus may stay in the dialog.
 */
export function FocusLayer({ containerRef, children }: { containerRef: React.RefObject<HTMLElement | null>; children: ReactNode; }) {
    // Resolved once, so the tree under it never remounts when Discord's module turns up later
    const [Lock] = React.useState(() => DiscordUI.FocusLock.get);
    return Lock ? <Lock containerRef={containerRef}>{children}</Lock> : <>{children}</>;
}

/**
 * Plays an exit before `onClose` unmounts what's closing: spread `closingProps` on an element
 * around the animated parts (they animate by class, see toolkit/layer.ts), and call `close`
 * instead of `onClose`.
 */
export function useExit(onClose: () => void) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [closing, setClosing] = React.useState(false);
    const closeRef = React.useRef(onClose);
    closeRef.current = onClose;

    React.useLayoutEffect(() => {
        if (!closing) return;
        let live = true;
        void exitDone(ref.current).then(() => live && closeRef.current());
        return () => void (live = false);
    }, [closing]);

    const close = React.useCallback(() => setClosing(true), []);
    return { close, closing, closingProps: { ref, "data-closing": closing ? "" : undefined } };
}

/**
 * A dialog over everything, so opening it never moves the page underneath. Rendered into <body>,
 * which also gets it out of Discord's settings scroller when the tab is embedded there.
 * Escape and clicking beside it close it; focus stays inside and goes back where it was after.
 * `children` can be a function of `close`, for content that closes the dialog itself (with its exit).
 */
export function Dialog({ title, onClose, children, id }: { title: ReactNode; onClose(): void; children: ReactNode | ((close: () => void) => ReactNode); id: string; }) {
    const exit = useExit(onClose);
    const { ref, onKeyDown } = useModal(exit.close);

    return ReactDOM.createPortal(
        <div className="dl-root" {...exit.closingProps}>
            <div className="dl-scrim dl-dialog-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && exit.close()}>
                <div className="dl-dialog evi-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} ref={ref} onKeyDown={onKeyDown} id={id}>
                    <FocusLayer containerRef={ref}>
                        <header className="dl-dialog-head">
                            <Text tag="h2" variant="heading-lg/semibold" color="text-strong" id={`${id}-title`}>{title}</Text>
                            <IconButton icon="close" label="Close" onClick={exit.close} />
                        </header>
                        <div className="dl-dialog-body">{typeof children === "function" ? children(exit.close) : children}</div>
                    </FocusLayer>
                </div>
            </div>
        </div>,
        document.body,
    );
}
