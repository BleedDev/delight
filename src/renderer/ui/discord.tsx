/**
 * Discord's own form controls, found by what their code does rather than by minified names, so the
 * settings UI looks and behaves exactly like Discord's. Each one resolves on first use; if Discord
 * ever renames or removes one, `get` returns undefined and callers fall back to Evi's own.
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
                logger.info(`${name} not loaded yet, using Evi's own until it is`);
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
    label?: string;
    hideLabel?: boolean;
    description?: string;
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

/** Discord's typography primitive: the variant sets size, weight and line height from its type scale */
export interface TextProps {
    variant: string;
    tag?: string;
    color?: string;
    className?: string;
    id?: string;
    lineClamp?: number;
    tabularNumbers?: boolean;
    children?: React.ReactNode;
    role?: string;
    title?: string;
}

/** Discord's current ("mana") button, also its icon-only button when `text` is omitted */
export interface ManaButtonProps {
    variant?: "primary" | "secondary" | "icon-only" | "critical-primary" | "critical-secondary";
    size?: "xs" | "sm" | "md";
    text?: string;
    icon?: ComponentType<any>;
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
    onClick?(): void;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
}

/** Discord's text input: renders its own label, description and focus ring through its Field wrapper */
export interface TextInputProps {
    id?: string;
    label?: string;
    hideLabel?: boolean;
    description?: string;
    value: string;
    onChange(value: string): void;
    placeholder?: string;
    type?: string;
    leading?: ComponentType<any>;
    clearable?: boolean;
    size?: "sm" | "md";
    spellCheck?: boolean;
    autoComplete?: string;
    inputMode?: string;
}

export interface TagGroupItem {
    id: string;
    label: string;
}

/** Discord's tag group; with selectionMode "single" and variant "filter" it's Discord's filter-chip row */
export interface TagGroupProps {
    label: string;
    items: TagGroupItem[];
    selectionMode?: "none" | "single" | "multiple";
    selectedKeys?: Iterable<string>;
    onSelectionChange?(keys: Set<string>): void;
    disallowEmptySelection?: boolean;
    variant?: "default" | "filter";
    size?: "sm" | "md";
}

export interface TooltipProps {
    text: string;
    position?: "top" | "bottom" | "left" | "right";
    children: React.ReactElement;
}

/** The row Discord's own settings use for a toggle: label and description left, switch right */
export interface SwitchRowProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange(checked: boolean): void;
    disabled?: boolean;
}

/** Discord's inline notice (icon, message, optional action), as shown at the top of its settings */
export interface NoticeProps {
    messageType: "warn" | "info" | "danger" | "positive";
    action?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * The component exported by a module whose source contains every snippet. For single-export
 * modules where the component's own code has nothing distinctive but its module does.
 */
function inModule(...code: string[]) {
    return Object.assign(filters.componentByCode(), { $code: code });
}

export const DiscordUI = {
    Text: native<TextProps>("Text", () => filters.componentByCode('"data-text-variant"', "scaleFontToUserSetting")),
    ManaButton: native<ManaButtonProps>("ManaButton", () => filters.componentByCode('"data-mana-component":"button"', "iconPosition")),
    TextInput: native<TextInputProps>("TextInput", () => filters.componentByCode('"data-mana-component":"text-input"', "clearable")),
    TagGroup: native<TagGroupProps>("TagGroup", () => inModule('"data-mana-component":"tag-group"')),
    Tooltip: native<TooltipProps>("Tooltip", () => filters.componentByCode("keyboardShortcut", "__unsupportedReactNodeAsText")),
    SwitchRow: native<SwitchRowProps>("SwitchRow", () => inModule("switchIconsEnabled", '"under-label"', "interactiveLabel")),
    Notice: native<NoticeProps>("Notice", () => filters.componentByCode("messageType", "iconAlign", "textColor", '"text-sm/medium"')),
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
