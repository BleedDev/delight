/**
 * Plugin toolkit: toasts, context menu items and slash commands, built on Discord's own systems.
 * Plugins use them through ctx (auto-removed on stop) or @delight/api.
 */
import { registerPatches } from "../patching/source";
import { builtInCommandsFilter, getRegisteredCommands, isCommandsHooked } from "./commands";
import { isMenuHooked, menuArgsPatch, menuFilter, resolveMenuComponents } from "./contextMenu";
import { injectMenuArgs } from "./menuArgs";
import { showToastFilter } from "./toasts";

/** Owner of Delight's own source patches in patch diagnostics */
export const CORE_OWNER = "delight";

/** Registers the toolkit's source patches. Must run before Discord's modules do. */
export function registerToolkitPatches() {
    registerPatches(CORE_OWNER, [menuArgsPatch]);
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
