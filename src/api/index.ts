/**
 * The module plugins import as "@evi/api". At runtime it is the live object below, handed to
 * plugins through their `require`; for type checking, tsconfig maps the import to this file.
 */
export { Badges } from "../renderer/badges";
export type { Badge } from "../renderer/badges";
export type { BadgeAdminAction } from "../shared/badges";
export { defineStrings, I18n, useLocale } from "../renderer/i18n";
export type { Message, PluralMessage, Vars } from "../shared/i18n";
export { Logger } from "../renderer/logger";
export { getUnhooked, hook } from "../renderer/patching/hooks";
export type { HookCallback, HookContext, HookKind } from "../renderer/patching/hooks";
export type { PatchRecord, Replacement, SourcePatch } from "../renderer/patching/source";
export type { PluginContext, PluginSettings } from "../renderer/plugins/context";
export type { ProfileBadge, ProfileBadgeProvider } from "../renderer/profileBadges";
export { definePlugin } from "../renderer/plugins/types";
export type * from "../renderer/plugins/types";
export { CommandOptionType, registerCommand } from "../renderer/toolkit/commands";
export type { CommandContext, CommandDefinition, CommandOption, CommandResult } from "../renderer/toolkit/commands";
export { addContextMenuPatch, findMenuGroup, Menu } from "../renderer/toolkit/contextMenu";
export type { ContextMenuCallback, MenuComponents, MenuItemProps } from "../renderer/toolkit/contextMenu";
export { exitDone, openLayer } from "../renderer/toolkit/layer";
export type { CloseLayer, LayerOptions } from "../renderer/toolkit/layer";
export { showToast } from "../renderer/toolkit/toasts";
export type { PanelIconProps, PanelToggle } from "../renderer/toolkit/panel";
export type { ToastOptions, ToastType } from "../renderer/toolkit/toasts";
export { lazy, unlazy } from "../renderer/utils/lazy";
export { findInTree } from "../renderer/utils/tree";
export { createRoot, Dispatcher, getStore, React, ReactDOM } from "../renderer/webpack/common";
export type { FluxAction, FluxDispatcher } from "../renderer/webpack/common";
export {
    filters, find, findAll, findAllExports, findByCode, findByCodeLazy, findByProps, findByPropsLazy, findComponent,
    findComponentLazy, findExport, findLazy, findModuleIds, findStore, findStoreLazy, functionSource, requireModule, waitFor,
    waitForExport,
} from "../renderer/webpack/find";
export type { CodeMatcher, Filter, FoundExport } from "../renderer/webpack/find";
export type { Module, ModuleFactory, WebpackRequire } from "../renderer/webpack/runtime";

import { wreq } from "../renderer/webpack/runtime";
import { Dropdown as EviDropdown } from "../renderer/ui/components";
import { DiscordUI } from "../renderer/ui/discord";
import { ensureStyles } from "../renderer/ui/stylesheet";
import { React } from "../renderer/webpack/common";

/**
 * Discord's own form controls for plugin settings panels (Switch, TextField, TextArea, Select,
 * Slider, Button). Each is undefined if Discord renamed it, so check before rendering.
 */
export const Components = {
    get Switch() { return DiscordUI.Switch.get; },
    get TextField() { return DiscordUI.TextField.get; },
    get TextArea() { return DiscordUI.TextArea.get; },
    get Select() { return DiscordUI.Select.get; },
    get Slider() { return DiscordUI.Slider.get; },
    get Button() { return DiscordUI.Button.get; },
    /** Discord's tooltip: <Tooltip text="…">{element}</Tooltip> */
    get Tooltip() { return DiscordUI.Tooltip.get; },
    /** Evi's own dropdown (Evi 2.0.0+), always there; see Dropdown */
    Dropdown,
};

export interface DropdownProps<V extends string> {
    /** Names the list for screen readers, and the button when there's no visible label */
    label: string;
    /** A disabled option shows greyed out and can't be picked */
    options: readonly { label: string; value: V; disabled?: boolean; }[];
    value: V;
    onChange(value: V): void;
    /** Defaults to a generated one */
    id?: string;
    /** The id of a visible label, which then names the button */
    labelledBy?: string;
    disabled?: boolean;
    /** Added to the button, e.g. to size it to your layout */
    className?: string;
}

/**
 * Evi's dropdown, the one in Evi's own settings: Discord's look and motion, a list that's never
 * cut off by a dialog, no scrollbar, keyboard and screen reader support, and a filter box once
 * there are more than 12 options. Use it instead of a <select>, whose list is the system's own.
 * Evi 2.0.0 and newer; check it's there (`Components.Dropdown`) if your plugin supports older Evi.
 */
export function Dropdown<V extends string>({ id, ...props }: DropdownProps<V>) {
    ensureStyles();
    const generated = React.useId();
    return React.createElement("div", { className: "dl-root dl-dropdown-host" },
        React.createElement(EviDropdown<V>, { ...props, id: id ?? `evi-dropdown${generated.replace(/:/g, "")}` }));
}

/** Discord's __webpack_require__, undefined until the runtime has loaded */
export function getWreq() {
    return wreq;
}
