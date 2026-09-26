/**
 * Types for a plugin's optional native module, which runs in Discord's main (Node/Electron) process.
 * Import with `import type` only; nothing here exists at runtime.
 *
 *     import type { NativePlugin } from "@delight/api/native";
 *     export default { start(ctx) { ... }, async readThing(path: string) { ... } } satisfies NativePlugin;
 *
 * Every other exported function can be called from the renderer with `ctx.native.call("name", ...args)`.
 */
import type { OnBeforeRequestListenerDetails } from "electron";

export interface NativeContext {
    readonly pluginId: string;
    readonly pluginDir: string;
    readonly dataDir: string;
    /** Cancel or redirect requests made by Discord. Removed automatically on stop. */
    onBeforeRequest(filter: (details: OnBeforeRequestListenerDetails) => { cancel?: boolean; redirectURL?: string; } | void): () => void;
    /** Run when the plugin stops or is hot-reloaded. */
    onDispose(fn: () => void): void;
}

export interface NativePlugin {
    start?(ctx: NativeContext): void;
    stop?(): void;
    [method: string]: ((...args: any[]) => unknown) | undefined;
}
