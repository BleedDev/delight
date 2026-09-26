/**
 * Settings UI building blocks. Controls are Discord's own (see discord.tsx) so they look and behave
 * exactly like the rest of Discord's settings; Delight's versions below are only fallbacks for when
 * Discord renames one of its components.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { SettingDefinition } from "../plugins/types";
import { React } from "../webpack/common";
import { DiscordUI } from "./discord";

export function Button({ variant, children, onClick, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "accent" | "icon"; }) {
    const Native = DiscordUI.Button.get;
    // Icon-only buttons stay ours: Discord's button has no icon-only size that fits these rows
    if (Native && variant !== "icon") {
        const { Colors = {}, Sizes = {} } = Native as any;
        return (
            <Native
                color={variant === "accent" ? Colors.BRAND : Colors.PRIMARY}
                size={Sizes.SMALL}
                onClick={onClick as any}
                disabled={disabled}
                aria-label={props["aria-label"]}
            >
                <span className="dl-button-content">{children}</span>
            </Native>
        );
    }
    return <button type="button" className="dl-button" data-variant={variant} onClick={onClick} disabled={disabled} {...props}>{children}</button>;
}

export function Switch({ checked, onChange, label, labelledBy }: {
    checked: boolean;
    onChange(checked: boolean): void;
    /** Accessible name when there's no visible label to point at */
    label?: string;
    labelledBy?: string;
}) {
    const Native = DiscordUI.Switch.get;
    // Discord's switch is named through labelledBy only
    if (Native && labelledBy) return <Native checked={checked} onChange={onChange} labelledBy={labelledBy} />;
    return (
        <button
            type="button"
            role="switch"
            className="dl-switch"
            aria-checked={checked}
            aria-label={label}
            aria-labelledby={labelledBy}
            onClick={() => onChange(!checked)}
        />
    );
}

/** Single-line text input, Discord's when available */
export function TextField({ id, label, hideLabel, description, value, onChange, placeholder, multiline, type = "text" }: {
    id: string;
    label: string;
    hideLabel?: boolean;
    description?: string;
    value: string;
    onChange(value: string): void;
    placeholder?: string;
    multiline?: boolean;
    type?: string;
}) {
    const Native = DiscordUI.TextField.get;
    if (Native) {
        return (
            <Native
                id={id}
                label={label}
                hideLabel={hideLabel}
                description={description}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                multiline={multiline}
                maxRows={multiline ? 8 : undefined}
                type={type}
            />
        );
    }
    const hint = description && <p className="dl-hint" id={`${id}-hint`}>{description}</p>;
    const common = { id, placeholder, value, "aria-describedby": description ? `${id}-hint` : undefined };
    return (
        <div className="dl-field">
            <label className={hideLabel ? "dl-sr-only" : "dl-label"} htmlFor={id}>{label}</label>
            {multiline
                ? <textarea className="dl-textarea" rows={4} {...common} onChange={e => onChange(e.currentTarget.value)} />
                : <input className="dl-input" type={type} {...common} onChange={e => onChange(e.currentTarget.value)} />}
            {hint}
        </div>
    );
}

/** Large code textarea (Quick CSS), Discord's when available */
export function CodeArea({ id, value, onChange, placeholder }: { id: string; value: string; onChange(value: string): void; placeholder?: string; }) {
    const Native = DiscordUI.TextArea.get;
    if (Native) {
        return (
            <div className="dl-code-native">
                <Native id={id} value={value} onChange={onChange} placeholder={placeholder} rows={22} spellCheck={false} />
            </div>
        );
    }
    return <textarea id={id} className="dl-textarea dl-code-editor" spellCheck={false} placeholder={placeholder} value={value} onChange={e => onChange(e.currentTarget.value)} />;
}

const icons = {
    check: "M5 12.5l4.5 4.5L19 7.5",
    warning: "M12 4l9 16H3l9-16zm0 6v4m0 3v.5",
    cross: "M6 6l12 12M18 6L6 18",
    clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
    folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
    reload: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
    chevron: "M9 6l6 6-6 6",
};

export function Icon({ name, size = 16 }: { name: keyof typeof icons; size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icons[name]} />
        </svg>
    );
}

export type Tone = "success" | "warning" | "danger" | "muted";

/** Status is always icon + words, never color alone */
export function Status({ tone, children }: { tone: Tone; children: ReactNode; }) {
    const icon = ({ success: "check", warning: "warning", danger: "cross", muted: "clock" } as const)[tone];
    return <span className="dl-status" data-tone={tone}><Icon name={icon} size={14} />{children}</span>;
}

export function SettingField({ id, definition, value, onChange }: {
    id: string;
    definition: SettingDefinition;
    value: unknown;
    onChange(value: unknown): void;
}) {
    const labelId = `${id}-label`;
    const hint = definition.description && <p className="dl-hint" id={`${id}-hint`}>{definition.description}</p>;

    if (definition.type === "boolean") {
        return (
            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label" id={labelId}>{definition.label}</div>
                    {hint}
                </div>
                <Switch checked={!!value} onChange={onChange} labelledBy={labelId} />
            </div>
        );
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
    const Select = DiscordUI.Select.get;
    const Slider = DiscordUI.Slider.get;

    if (definition.type === "select") {
        control = Select
            ? <Select
                options={definition.options.map(o => ({ label: o.label, value: o.value }))}
                select={onChange}
                isSelected={v => v === value}
                serialize={String}
                closeOnSelect
                aria-label={definition.label}
            />
            : (
                <select id={id} className="dl-select" value={String(value)} onChange={e => onChange(e.currentTarget.value)}>
                    {definition.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
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
            <div className="dl-label" id={labelId}>{definition.label}</div>
            {hint}
            {control}
        </div>
    );
}

/** Subscribes a component to an external store */
export function useStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) {
    return React.useSyncExternalStore(subscribe, getSnapshot);
}
