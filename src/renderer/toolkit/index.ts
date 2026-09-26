/**
 * Plugin toolkit: toasts, context menu items and slash commands, built on Discord's own systems.
 * Plugins use them through ctx (auto-removed on stop) or @evi/api.
 */
import { builtInCommandsFilter, getRegisteredCommands, isCommandsHooked } from "./commands";
import { ensureMenuArgsPatch, isMenuHooked, menuFilter, resolveMenuComponents } from "./contextMenu";
import { injectMenuArgs } from "./menuArgs";
import { showToastFilter } from "./toasts";

/**
 * Registers the toolkit's source patches before Discord's modules run, but only those an enabled
 * plugin will use: the menu props patch touches ~190 modules and costs nothing when skipped.
 */
export function registerToolkitPatches(enabledPluginCode: string[]) {
    if (enabledPluginCode.some(code => /\bcontextMenu\(|addContextMenuPatch\(/.test(code))) ensureMenuArgsPatch();
}

/** For tests and debugging */
export const Toolkit = {
    filters: { showToast: showToastFilter, menu: menuFilter, builtInCommands: builtInCommandsFilter },
    isMenuHooked,
    isCommandsHooked,
    resolveMenuComponents,
    getRegisteredCommands,
    /** What the navId patch does to a module's source */
    rewriteMenuArgs: (code: string) => code.replace(/(?<=[{,])navId:/g, injectMenuArgs),
};
