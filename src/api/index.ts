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
import { DiscordUI } from "../renderer/ui/discord";

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
};

/** Discord's __webpack_require__, undefined until the runtime has loaded */
export function getWreq() {
    return wreq;
}
