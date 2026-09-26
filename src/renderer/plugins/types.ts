import type { ReactNode } from "react";

import type { SourcePatch } from "../patching/source";
import type { FluxAction } from "../webpack/common";
import type { PluginContext } from "./context";

interface BaseSetting {
    label: string;
    description?: string;
}

export interface BooleanSetting extends BaseSetting {
    type: "boolean";
    default: boolean;
}

export interface StringSetting extends BaseSetting {
    type: "string";
    default: string;
    placeholder?: string;
    multiline?: boolean;
}

export interface NumberSetting extends BaseSetting {
    type: "number";
    default: number;
    min?: number;
    max?: number;
    step?: number;
}

export interface SelectSetting<V extends string = string> extends BaseSetting {
    type: "select";
    default: V;
    options: readonly { label: string; value: V; }[];
}

export type SettingDefinition = BooleanSetting | StringSetting | NumberSetting | SelectSetting;
export type SettingsSchema = Record<string, SettingDefinition>;

export type SettingValue<D extends SettingDefinition> =
    D extends BooleanSetting ? boolean
    : D extends NumberSetting ? number
    : D extends SelectSetting<infer V> ? V
    : string;

export type SettingsValues<S extends SettingsSchema> = { [K in keyof S]: SettingValue<S[K]> };

export interface PluginDefinition<S extends SettingsSchema = SettingsSchema> {
    /** User-configurable settings, rendered automatically in the plugin's settings */
    settings?: S;
    /**
     * Source patches. Registered before Discord's code runs, so enabling or changing them at
     * runtime may require a reload (Evi tells the user when).
     */
    patches?: SourcePatch[];
    /** Stylesheet applied while the plugin runs */
    css?: string;
    /** Flux action handlers, subscribed while the plugin runs */
    flux?: Record<string, (action: FluxAction) => void>;
    /** Runs once Discord's core modules are available, or when the plugin is enabled or hot-reloaded */
    start?(ctx: PluginContext<S>): void | Promise<void>;
    /** Anything registered through ctx is cleaned up automatically after this */
    stop?(ctx: PluginContext<S>): void;
    /** Extra UI rendered under the generated settings */
    settingsPanel?(ctx: PluginContext<S>): ReactNode;
    /** Anything else, reachable from source patches as $self */
    [key: string]: unknown;
}

export function definePlugin<S extends SettingsSchema = {}>(definition: PluginDefinition<S>): PluginDefinition<S> {
    return definition;
}
