/**
 * Captures Discord's bundler runtime (rspack, webpack 5 compatible).
 *
 * The runtime ends with
 *     (I = self.webpackChunkdiscord_app = self.webpackChunkdiscord_app || []).forEach(h.bind(null, 0)),
 *     I.push = h.bind(null, I.push.bind(I))
 * so we trap the chunk array global, then its `push` assignment. At that moment every inline module
 * and every chunk loaded so far is registered, but the entry module has not run yet. We push one
 * fake chunk whose runtime callback hands us __webpack_require__, then wrap each factory so source
 * patches are applied lazily, right before a module first executes.
 *
 * Several runtimes share the chunk global (libdiscore, fast-connect, sentry and the main app), each
 * chaining its push onto the previous one, and every one of them receives every chunk. We capture all
 * of them and treat the one that executes the most modules as Discord's main runtime.
 */
import { Logger } from "../logger";
import { applySourcePatches } from "../patching/source";

export interface Module {
    id: PropertyKey;
    loaded: boolean;
    exports: any;
}

export type ModuleFactory = (this: unknown, module: Module, exports: any, require: WebpackRequire) => void;

export interface WebpackRequire {
    (id: PropertyKey): any;
    /** Module factories by id */
    m: Record<PropertyKey, ModuleFactory>;
    /** Module cache by id */
    c: Record<PropertyKey, Module>;
    /** Defines getter exports */
    d(exports: object, definition: Record<string, () => unknown>): void;
    /** Loads a chunk */
    e(chunkId: PropertyKey): Promise<unknown>;
    o(object: object, key: PropertyKey): boolean;
    p: string;
}

const CHUNK_GLOBAL = "webpackChunkdiscord_app";
const SYM_WRAPPED = Symbol("evi.wrappedFactory");
const SYM_ORIGINAL = Symbol("evi.originalFactory");

const logger = new Logger("Webpack", "#8ab4f8");

/** Discord's main runtime */
export let wreq: WebpackRequire | undefined;
/** Every runtime sharing the chunk global */
export const allRuntimes = new Set<WebpackRequire>();
const executions = new Map<WebpackRequire, number>();

function countExecution(require: WebpackRequire) {
    const n = (executions.get(require) ?? 0) + 1;
    executions.set(require, n);
    if (require !== wreq && n > (executions.get(wreq!) ?? 0)) {
        wreq = require;
        if (n > 1) logger.info("Main runtime changed");
    }
}

/** Time Evi adds to module loading, see Evi.stats */
export const stats = { modules: 0, patchMs: 0, listenerMs: 0, callbackMs: 0, patchedModules: 0 };

/** `source` returns the module factory's source, computed once per module and shared by all consumers */
type ModuleListener = (exports: any, id: string, source: () => string) => void;
/** Called after every module finishes executing */
export const moduleListeners = new Set<ModuleListener>();

/** The untouched factory, whether or not we wrapped it. */
export function getOriginalFactory(factory: ModuleFactory | undefined): ModuleFactory | undefined {
    return (factory as any)?.[SYM_ORIGINAL] ?? factory;
}

function wrapFactory(id: string, original: ModuleFactory): ModuleFactory {
    if (typeof original !== "function" || (original as any)[SYM_WRAPPED]) return original;

    const wrapped = function (this: unknown, module: Module, exports: any, require: WebpackRequire) {
        // A module runs once. Put the original back so nothing keeps the patched closure alive
        if (require.m[id] === wrapped) require.m[id] = original;
        countExecution(require);

        stats.modules++;
        let src: string | undefined;
        const source = () => src ??= Function.prototype.toString.call(original);

        const t0 = performance.now();
        const { factory, patchedBy } = applySourcePatches(id, original, source);
        stats.patchMs += performance.now() - t0;
        if (patchedBy.length) stats.patchedModules++;
        try {
            factory.call(this, module, exports, require);
        } catch (err) {
            if (patchedBy.length) logger.error(`Module ${id} threw. It was patched by: ${patchedBy.join(", ")}`, err);
            throw err;
        }

        const t1 = performance.now();
        if (moduleListeners.size) for (const listener of moduleListeners) {
            try {
                listener(module.exports, id, source);
            } catch (err) {
                logger.error("Module listener threw", err);
            }
        }
        stats.listenerMs += performance.now() - t1;
    } as ModuleFactory;

    Object.defineProperties(wrapped, {
        [SYM_WRAPPED]: { value: true },
        [SYM_ORIGINAL]: { value: original },
        // Finders search factory source, they should always see Discord's original code
        toString: { value: () => Function.prototype.toString.call(original) },
    });
    return wrapped;
}

function wrapChunk(chunk: unknown) {
    const modules = Array.isArray(chunk) ? chunk[1] : undefined;
    if (!modules || typeof modules !== "object") return;
    for (const id in modules) modules[id] = wrapFactory(id, modules[id]);
}

function captureRequire(require: WebpackRequire) {
    // Pushing into the newest runtime also runs every older one in the chain
    if (allRuntimes.has(require)) return;
    allRuntimes.add(require);

    // Exports are non-configurable getters by default. Making them configurable lets hooks replace them.
    require.d = (exports, definition) => {
        for (const key in definition) {
            if (require.o(definition, key) && !require.o(exports, key)) {
                Object.defineProperty(exports, key, { enumerable: true, configurable: true, get: definition[key] });
            }
        }
    };

    // Inline modules of the runtime file, plus chunks registered before the runtime ran.
    // Assigned in place: the runtime calls factories through this same object.
    for (const id in require.m) require.m[id] = wrapFactory(id, require.m[id]);

    wreq ??= require;
    logger.info(`Captured runtime #${allRuntimes.size}`);
}

function hookChunkArray(chunks: unknown[]) {
    chunks.forEach(wrapChunk);

    // Before any runtime loads, chunks are plain array pushes
    const plainPush = function (this: unknown[], ...items: unknown[]) {
        items.forEach(wrapChunk);
        return Array.prototype.push.apply(this, items);
    };
    let current = plainPush;

    Object.defineProperty(chunks, "push", {
        configurable: true,
        get: () => current,
        set(runtimePush: (...items: unknown[]) => number) {
            // Each runtime binds whatever `push` was before it as its parent, so every wrapper must
            // close over its own runtime. A shared wrapper would make the chain call itself.
            current = function (this: unknown[], ...items: unknown[]) {
                items.forEach(wrapChunk);
                return runtimePush.apply(this, items);
            };
            // Unique chunk id, a runtime only runs the callback of chunks it hasn't installed yet
            runtimePush.call(chunks, [[Symbol("evi")], {}, captureRequire]);
        },
    });
}

export function interceptWebpack() {
    let value: unknown;
    Object.defineProperty(window, CHUNK_GLOBAL, {
        configurable: true,
        get: () => value,
        set(next) {
            if (Array.isArray(next) && next !== value) hookChunkArray(next);
            value = next;
        },
    });
}
