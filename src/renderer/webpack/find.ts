import { getUnhooked } from "../patching/hooks";
import { lazy } from "../utils/lazy";
import { getOriginalFactory, moduleListeners, stats, WebpackRequire, wreq } from "./runtime";

export type Filter = ((value: any) => boolean) & {
    /**
     * Snippets the defining module's source must contain. A function's source is part of its
     * module's source, so waitFor can skip every other module with one string search instead of
     * stringifying each exported function.
     */
    $code?: CodeMatcher[];
};
export type CodeMatcher = string | RegExp;

export interface FoundExport<T = any> {
    /** Module id */
    id: string;
    /** The module's exports object */
    exports: any;
    /** The export key holding `value`, or undefined when `value` is the exports object itself */
    key: string | undefined;
    value: T;
}

const sourceCache = new WeakMap<Function, string>();

export function functionSource(fn: Function) {
    // A hooked function is our wrapper: finders must see the code of what it wraps, otherwise
    // hooking an export makes it unfindable by code for every other plugin
    fn = getUnhooked(fn);
    let src = sourceCache.get(fn);
    if (src === undefined) {
        try {
            src = Function.prototype.toString.call(fn);
        } catch {
            src = "";
        }
        sourceCache.set(fn, src);
    }
    return src;
}

function matchesAll(source: string, code: CodeMatcher[]) {
    return code.every(c => typeof c === "string" ? source.includes(c) : c.test(source));
}

/** Unwraps React.memo / forwardRef / lazy wrappers down to the render function */
function unwrapComponent(value: any): Function | undefined {
    if (typeof value === "function") return value;
    if (value?.$$typeof) return unwrapComponent(value.render ?? value.type);
}

const withCode = (code: CodeMatcher[], filter: Filter): Filter => Object.assign(filter, { $code: code });

export const filters = {
    /** Objects that have every one of these properties */
    byProps: (...props: string[]): Filter => v => props.every(p => v[p] !== undefined),
    /** Functions whose source contains every snippet */
    byCode: (...code: CodeMatcher[]): Filter => withCode(code, v => typeof v === "function" && matchesAll(functionSource(v), code)),
    /** React components (including memo / forwardRef) whose render source contains every snippet */
    componentByCode: (...code: CodeMatcher[]): Filter => withCode(code, v => {
        const fn = unwrapComponent(v);
        return !!fn && matchesAll(functionSource(fn), code);
    }),
    /** Flux stores by name, e.g. "UserStore" */
    byStoreName: (name: string): Filter => v =>
        v?.constructor?.displayName === name || (typeof v?.getName === "function" && "_dispatchToken" in v && v.getName() === name),
};

// Some Discord exports are Proxies that answer every property access; they'd match any byProps filter
const CANARY = "__eviCanary__";

function isSearchable(value: any) {
    if (value == null) return false;
    if (typeof value !== "object" && typeof value !== "function") return false;
    if (value === window || value === document || value === document.documentElement) return false;
    try {
        return value[CANARY] === undefined;
    } catch {
        return false;
    }
}

function test(filter: Filter, value: any) {
    try {
        return filter(value);
    } catch {
        return false;
    }
}

/** Exports worth testing: the exports object itself, then each export value */
function collectCandidates(exports: any): [value: any, key: string | undefined][] {
    if (!isSearchable(exports)) return [];
    const out: [any, string | undefined][] = [[exports, undefined]];
    if (typeof exports !== "object") return out;
    for (const key in exports) {
        let value;
        try {
            value = exports[key];
        } catch {
            continue;
        }
        if (isSearchable(value)) out.push([value, key]);
    }
    return out;
}

function searchExports<T>(id: string, exports: any, filter: Filter): FoundExport<T> | undefined {
    if (!isSearchable(exports)) return;
    if (test(filter, exports)) return { id, exports, key: undefined, value: exports };
    if (typeof exports !== "object") return;

    for (const key in exports) {
        let value;
        try {
            value = exports[key];
        } catch {
            continue;
        }
        if (isSearchable(value) && test(filter, value)) return { id, exports, key, value };
    }
}

function requireWreq() {
    if (!wreq) throw new Error("Webpack is not ready yet. Use waitFor or a lazy finder.");
    return wreq;
}

/** Whether module `id` can contain what a code filter looks for, without touching its exports */
function mayContain(wreq: WebpackRequire, id: string, filter: Filter) {
    if (!filter.$code) return true;
    const factory = getOriginalFactory(wreq.m[id]);
    return !factory || matchesAll(functionSource(factory), filter.$code);
}

/** First loaded export matching the filter, with where it lives */
export function findExport<T = any>(filter: Filter): FoundExport<T> | undefined {
    const wreq = requireWreq();
    const { c } = wreq;
    for (const id in c) {
        if (!mayContain(wreq, id, filter)) continue;
        const found = searchExports<T>(id, c[id]?.exports, filter);
        if (found) return found;
    }
}

export function findAllExports<T = any>(filter: Filter): FoundExport<T>[] {
    const wreq = requireWreq();
    const { c } = wreq;
    const results: FoundExport<T>[] = [];
    for (const id in c) {
        if (!mayContain(wreq, id, filter)) continue;
        const found = searchExports<T>(id, c[id]?.exports, filter);
        if (found) results.push(found);
    }
    return results;
}

export const find = <T = any>(filter: Filter) => findExport<T>(filter)?.value;
export const findAll = <T = any>(filter: Filter) => findAllExports<T>(filter).map(f => f.value);
export const findByProps = <T = any>(...props: string[]) => find<T>(filters.byProps(...props));
export const findByCode = <T = any>(...code: CodeMatcher[]) => find<T>(filters.byCode(...code));
export const findComponent = <T = any>(...code: CodeMatcher[]) => find<T>(filters.componentByCode(...code));
export const findStore = <T = any>(name: string) => find<T>(filters.byStoreName(name));

interface Waiter {
    filter: Filter;
    callback: (value: any, found: FoundExport) => void;
}

const waiters = new Set<Waiter>();
/** Pending waitFor filters, for diagnostics */
export const pendingWaiters = () => [...waiters].map(w => w.filter.$code ? `code: ${w.filter.$code.join(", ")}` : String(w.filter).slice(0, 80));

/**
 * One listener serves every waiter: each new module's exports are read once, and code-based
 * waiters skip modules whose source can't contain their target.
 */
moduleListeners.add((exports, id, source) => {
    if (!waiters.size) return;
    let candidates: ReturnType<typeof collectCandidates> | undefined;

    for (const waiter of waiters) {
        const { $code } = waiter.filter;
        if ($code && !matchesAll(source(), $code)) continue;

        candidates ??= collectCandidates(exports);
        for (const [value, key] of candidates) {
            if (!test(waiter.filter, value)) continue;
            waiters.delete(waiter);
            const t = performance.now();
            try {
                waiter.callback(value, { id, exports, key, value });
            } catch (err) {
                console.error("[Evi] waitFor callback threw", err);
            }
            // Callback work (plugin startup, hooking) isn't per-module overhead, account for it separately
            stats.callbackMs += performance.now() - t;
            break;
        }
    }
});

/**
 * Calls back once a matching export exists, immediately if it's already loaded.
 * Returns an unsubscribe function.
 */
export function waitFor<T = any>(filter: Filter, callback: (value: T, found: FoundExport<T>) => void): () => void {
    const existing = wreq && findExport<T>(filter);
    if (existing) {
        callback(existing.value, existing);
        return () => { };
    }

    const waiter: Waiter = { filter, callback };
    waiters.add(waiter);
    return () => void waiters.delete(waiter);
}

export function waitForExport<T = any>(filter: Filter): Promise<FoundExport<T>> {
    return new Promise(resolve => waitFor<T>(filter, (_, found) => resolve(found)));
}

/** A proxy that resolves the export on first use. Safe to create before webpack is ready. */
export function findLazy<T = any>(filter: Filter, description = "export"): T {
    return lazy(() => {
        const value = wreq && find<T>(filter);
        if (value == null) throw new Error(`Evi: could not find ${description}`);
        return value;
    });
}

export const findByPropsLazy = <T = any>(...props: string[]) => findLazy<T>(filters.byProps(...props), `props ${props.join(", ")}`);
export const findByCodeLazy = <T = any>(...code: CodeMatcher[]) => findLazy<T>(filters.byCode(...code), `code ${code.join(", ")}`);
export const findComponentLazy = <T = any>(...code: CodeMatcher[]) => findLazy<T>(filters.componentByCode(...code), `component ${code.join(", ")}`);
export const findStoreLazy = <T = any>(name: string) => findLazy<T>(filters.byStoreName(name), `store ${name}`);

/** Ids of module factories whose source contains every snippet, loaded or not */
export function findModuleIds(...code: CodeMatcher[]) {
    const { m } = requireWreq();
    const ids: string[] = [];
    for (const id in m) {
        const factory = getOriginalFactory(m[id]);
        if (factory && matchesAll(functionSource(factory), code)) ids.push(id);
    }
    return ids;
}

/** Runs (if needed) and returns a module's exports by id */
export function requireModule<T = any>(id: PropertyKey): T {
    return requireWreq()(id);
}
