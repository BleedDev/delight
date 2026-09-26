/**
 * Discord's own form controls, found by what their code does rather than by minified names, so the
 * settings UI looks and behaves exactly like Discord's. Each one resolves on first use; if Discord
 * ever renames or removes one, `get` returns undefined and callers fall back to Delight's own.
 */
import type { ComponentType } from "react";

import { Logger } from "../logger";
import { filters, find, waitFor } from "../webpack/find";
import { wreq } from "../webpack/runtime";

const logger = new Logger("DiscordUI", "#5865f2");

function native<P>(name: string, filter: () => any): { readonly get: ComponentType<P> | undefined; } {
    let resolved: ComponentType<P> | undefined;
    let waiting = false;
    return {
        get get() {
            if (resolved || !wreq) return resolved;
            resolved = find(filter());
            // Discord loads some controls lazily: use ours until its chunk arrives, then switch over
            if (!resolved && !waiting) {
                waiting = true;
                logger.info(`${name} not loaded yet, using Delight's own until it is`);
                waitFor(filter(), value => void (resolved = value));
            }
            return resolved;
        },
    };
}

export interface SwitchProps {
    checked: boolean;
    onChange(checked: boolean): void;
    disabled?: boolean;
    id?: string;
    labelledBy?: string;
    describedBy?: string;
}

export interface TextFieldProps {
    value: string;
    onChange(value: string): void;
    label?: string;
    hideLabel?: boolean;
    description?: string;
    placeholder?: string;
    multiline?: boolean;
    maxRows?: number;
    maxLength?: number;
    type?: string;
    disabled?: boolean;
    id?: string;
}

export interface TextAreaProps {
    value: string;
    onChange(value: string): void;
    placeholder?: string;
    rows?: number;
    className?: string;
    autosize?: boolean;
    id?: string;
    spellCheck?: boolean;
}

export interface SelectProps<V = string> {
    options: { label: string; value: V; }[];
    select(value: V): void;
    isSelected(value: V): boolean;
    serialize(value: V): string;
    placeholder?: string;
    closeOnSelect?: boolean;
    "aria-label"?: string;
}

export interface SliderProps {
    initialValue: number;
    minValue: number;
    maxValue: number;
    markers?: number[];
    stickToMarkers?: boolean;
    onValueChange(value: number): void;
    onValueRender?(value: number): string;
    onMarkerRender?(value: number): string;
    keyboardStep?: number;
}

export interface ButtonProps {
    onClick?(): void;
    color?: string;
    size?: string;
    look?: string;
    disabled?: boolean;
    children?: React.ReactNode;
    "aria-label"?: string;
}

export const DiscordUI = {
    Switch: native<SwitchProps>("Switch", () => filters.componentByCode("SWITCH_BACKGROUND_SELECTED_DEFAULT", "labelledBy")),
    // Discord's standard settings input. Not the component with "preview"/"onCommit": that one is an
    // inline-edit field that only turns into an input on hover.
    TextField: native<TextFieldProps>("TextField", () => filters.componentByCode("validateOn", "showCharacterCount", "clearable")),
    TextArea: native<TextAreaProps>("TextArea", () => filters.componentByCode("showCharacterCount", "autosize", "rows")),
    Select: native<SelectProps<any>>("Select", () => filters.componentByCode("renderOptionLabel", "isSelected", "serialize")),
    Slider: native<SliderProps>("Slider", () => filters.componentByCode("stickToMarkers", "grabberRef")),
    Button: native<ButtonProps & { Colors?: Record<string, string>; Sizes?: Record<string, string>; Looks?: Record<string, string>; }>(
        "Button", () => filters.byProps("Looks", "Colors", "Sizes"),
    ),
};
