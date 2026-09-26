import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { SettingDefinition } from "../plugins/types";
import { React } from "../webpack/common";

export function Button({ variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "accent" | "icon"; }) {
    return <button type="button" className="dl-button" data-variant={variant} {...props} />;
}

export function Switch({ checked, onChange, label, labelledBy }: {
    checked: boolean;
    onChange(checked: boolean): void;
    /** Accessible name when there's no visible label to point at */
    label?: string;
    labelledBy?: string;
}) {
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
    const describedBy = definition.description ? `${id}-hint` : undefined;

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

    let control: ReactNode;
    if (definition.type === "select") {
        control = (
            <select id={id} className="dl-select" value={String(value)} aria-describedby={describedBy} onChange={e => onChange(e.currentTarget.value)}>
                {definition.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    } else if (definition.type === "number") {
        control = (
            <input
                id={id}
                className="dl-input"
                type="number"
                inputMode="decimal"
                min={definition.min}
                max={definition.max}
                step={definition.step}
                value={Number(value)}
                aria-describedby={describedBy}
                onChange={e => {
                    const n = e.currentTarget.valueAsNumber;
                    if (!Number.isNaN(n)) onChange(n);
                }}
            />
        );
    } else if (definition.multiline) {
        control = (
            <textarea id={id} className="dl-textarea" rows={4} placeholder={definition.placeholder} value={String(value)} aria-describedby={describedBy} onChange={e => onChange(e.currentTarget.value)} />
        );
    } else {
        control = (
            <input id={id} className="dl-input" type="text" inputMode="text" placeholder={definition.placeholder} value={String(value)} aria-describedby={describedBy} onChange={e => onChange(e.currentTarget.value)} />
        );
    }

    return (
        <div className="dl-field">
            <label className="dl-label" htmlFor={id}>{definition.label}</label>
            {control}
            {hint}
        </div>
    );
}

/** Subscribes a component to an external store */
export function useStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) {
    return React.useSyncExternalStore(subscribe, getSnapshot);
}
