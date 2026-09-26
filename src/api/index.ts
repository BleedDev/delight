/**
 * The module plugins import as "@delight/api". At runtime it is the live object below, handed to
 * plugins through their `require`; for type checking, tsconfig maps the import to this file.
 */
export { Logger } from "../renderer/logger";
export { getUnhooked, hook } from "../renderer/patching/hooks";
export type { HookCallback, HookContext, HookKind } from "../renderer/patching/hooks";
export type { PatchRecord, Replacement, SourcePatch } from "../renderer/patching/source";
export type { PluginContext, PluginSettings } from "../renderer/plugins/context";
export { definePlugin } from "../renderer/plugins/types";
export type * from "../renderer/plugins/types";
export { lazy, unlazy } from "../renderer/utils/lazy";
export { findInTree } from "../renderer/utils/tree";
export { createRoot, Dispatcher, getStore, React, ReactDOM } from "../renderer/webpack/common";
export type { FluxAction, FluxDispatcher } from "../renderer/webpack/common";
export {
    filters, find, findAll, findAllExports, findByCode, findByCodeLazy, findByProps, findByPropsLazy, findComponent,
    findComponentLazy, findExport, findLazy, findModuleIds, findStore, findStoreLazy, requireModule, waitFor,
    waitForExport,
} from "../renderer/webpack/find";
export type { CodeMatcher, Filter, FoundExport } from "../renderer/webpack/find";
export type { Module, ModuleFactory, WebpackRequire } from "../renderer/webpack/runtime";

import { wreq } from "../renderer/webpack/runtime";

/** Discord's __webpack_require__, undefined until the runtime has loaded */
export function getWreq() {
    return wreq;
}
