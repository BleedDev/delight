/**
 * Export hooks wrap a function living on an object (a module export, a store method, a component)
 * without touching its source. Any number of plugins can hook the same function; the original is
 * restored once the last hook is removed.
 *
 * Built for hot paths: hook lists are copy-on-write arrays split by kind, so a call never copies
 * or filters them, and a call allocates one context object (plus one per `instead` hook).
 */
import { Logger } from "../logger";

export interface HookContext<Args extends any[] = any[], Result = any> {
    /** `this` of the call */
    readonly self: any;
    /** Arguments, mutable in `before` hooks */
    args: Args;
    /** Return value, available in `after` hooks */
    result: Result;
    /** Whether the call was made with `new` */
    readonly isConstruct: boolean;
    /** The untouched function */
    readonly original: (...args: Args) => Result;
    /** In `instead` hooks: calls the next hook in the chain, or the original */
    callOriginal(...args: Args): Result;
}

export type HookKind = "before" | "after" | "instead";

/**
 * before:  runs first, may mutate ctx.args
 * after:   runs last, a non-undefined return value replaces the result
 * instead: replaces the call, use ctx.callOriginal() to continue the chain
 */
export type HookCallback<Args extends any[] = any[], Result = any> = (ctx: HookContext<Args, Result>) => any;

interface HookEntry {
    callback: HookCallback;
    owner: string;
}

interface HookedFunction {
    target: object;
    key: PropertyKey;
    original: (...args: any[]) => any;
    descriptor: PropertyDescriptor | undefined;
    wrapper: (...args: any[]) => any;
    // Replaced, never mutated: a running call keeps the snapshot it started with
    before: readonly HookEntry[];
    instead: readonly HookEntry[];
    after: readonly HookEntry[];
}

const logger = new Logger("Hooks", "#9ece6a");
const hooked = new WeakMap<object, Map<PropertyKey, HookedFunction>>();

const SYM_HOOK_ORIGINAL = Symbol("delight.hookOriginal");

function invoke(record: HookedFunction, self: any, args: any[], newTarget: Function | undefined) {
    return newTarget ? Reflect.construct(record.original, args, newTarget) : record.original.apply(self, args);
}

/** Context of one call. A class so callOriginal is a shared method, not a closure per call. */
class Call implements HookContext {
    result: any = undefined;

    constructor(
        private readonly record: HookedFunction,
        readonly self: any,
        public args: any[],
        private readonly newTarget: Function | undefined,
        private readonly insteads: readonly HookEntry[],
        /** Next instead hook to run when calling through, -1 means the original */
        private readonly next: number,
    ) { }

    get isConstruct() {
        return this.newTarget !== undefined;
    }

    get original() {
        return this.record.original;
    }

    callOriginal(...args: any[]) {
        return runInstead(this.record, this.self, args, this.newTarget, this.insteads, this.next);
    }
}

function runInstead(record: HookedFunction, self: any, args: any[], newTarget: Function | undefined, insteads: readonly HookEntry[], index: number): any {
    if (index < 0) return invoke(record, self, args, newTarget);

    const entry = insteads[index];
    try {
        return entry.callback(new Call(record, self, args, newTarget, insteads, index - 1));
    } catch (err) {
        logger.error(`instead hook of ${entry.owner} on ${String(record.key)} threw, skipping it`, err);
        return runInstead(record, self, args, newTarget, insteads, index - 1);
    }
}

function report(kind: HookKind, entry: HookEntry, record: HookedFunction, err: unknown) {
    logger.error(`${kind} hook of ${entry.owner} on ${String(record.key)} threw`, err);
}

function createWrapper(record: HookedFunction) {
    const wrapper = function (this: any, ...args: any[]) {
        const { before, instead, after } = record;
        const newTarget = new.target;
        // The most recently added instead hook is the outermost
        const ctx = new Call(record, this, args, newTarget, instead, instead.length - 1);

        for (let i = 0; i < before.length; i++) {
            try {
                before[i].callback(ctx);
            } catch (err) {
                report("before", before[i], record, err);
            }
        }

        ctx.result = instead.length
            ? runInstead(record, this, ctx.args, newTarget, instead, instead.length - 1)
            : invoke(record, this, ctx.args, newTarget);

        for (let i = 0; i < after.length; i++) {
            try {
                const value = after[i].callback(ctx);
                if (value !== undefined) ctx.result = value;
            } catch (err) {
                report("after", after[i], record, err);
            }
        }

        return ctx.result;
    };

    copyStatics(record.original, wrapper);
    return wrapper;
}

/** Keep statics (displayName, defaultProps, prototype...) so the wrapper is a drop-in replacement */
function copyStatics(original: Function, wrapper: Function) {
    for (const [prop, desc] of Object.entries(Object.getOwnPropertyDescriptors(original))) {
        try {
            Object.defineProperty(wrapper, prop, desc);
        } catch { }
    }
    Object.defineProperties(wrapper, {
        toString: { value: () => Function.prototype.toString.call(original), configurable: true },
        [SYM_HOOK_ORIGINAL]: { value: original, configurable: true },
    });
}

function install(record: HookedFunction) {
    const { target, key, descriptor, wrapper } = record;
    if (descriptor && !descriptor.configurable) {
        // Writable but not configurable, we can only assign
        (target as any)[key] = wrapper;
    } else {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: descriptor?.enumerable ?? false,
            writable: true,
            value: wrapper,
        });
    }
}

export function hook<T extends object, K extends keyof T>(
    target: T,
    key: K,
    kind: HookKind,
    callback: HookCallback,
    owner = "unknown",
): () => void {
    let byKey = hooked.get(target);
    if (!byKey) hooked.set(target, byKey = new Map());

    let record = byKey.get(key);
    if (!record) {
        const original = target[key];
        if (typeof original !== "function") {
            throw new TypeError(`Cannot hook ${String(key)}: it is ${typeof original}, not a function`);
        }

        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        if (descriptor && !descriptor.configurable && !descriptor.writable) {
            throw new TypeError(`Cannot hook ${String(key)}: property is not configurable`);
        }

        record = { target, key, original: original as any, descriptor, wrapper: null!, before: [], instead: [], after: [] };
        record.wrapper = createWrapper(record);
        install(record);
        byKey.set(key, record);
    }

    const entry: HookEntry = { callback, owner };
    const rec = record;
    rec[kind] = [...rec[kind], entry];

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;

        rec[kind] = rec[kind].filter(e => e !== entry);
        if (rec.before.length || rec.instead.length || rec.after.length) return;

        // rec.target, not target: live replacement may have moved the hook to a new object
        const current = rec.target as any;
        hooked.get(current)?.delete(rec.key);
        // Only restore if nobody replaced our wrapper in the meantime
        if (current[rec.key] !== rec.wrapper) return;
        if (!rec.descriptor) delete current[rec.key];
        else if (rec.descriptor.configurable) Object.defineProperty(current, rec.key, rec.descriptor);
        else current[rec.key] = rec.original;
    };
}

/** The unhooked version of a possibly hooked function */
export function getUnhooked<F extends Function>(fn: F): F {
    return (fn as any)?.[SYM_HOOK_ORIGINAL] ?? fn;
}

/**
 * After live module replacement put new values on an object, move every hook on it onto the new
 * functions: hooks on `obj.key` itself, and hooks on functions of objects stored in `obj.key`.
 */
export function rebaseHooks(target: object, oldValues: Map<PropertyKey, unknown>) {
    const own = hooked.get(target);
    if (own) {
        for (const record of own.values()) {
            const next = (target as any)[record.key];
            if (next === record.wrapper || typeof next !== "function") continue;
            record.original = next;
            record.descriptor = Object.getOwnPropertyDescriptor(target, record.key);
            record.wrapper = createWrapper(record);
            install(record);
        }
    }

    for (const [key, oldValue] of oldValues) {
        if (!oldValue || (typeof oldValue !== "object" && typeof oldValue !== "function")) continue;
        const nested = hooked.get(oldValue);
        const newValue = (target as any)[key];
        if (!nested || !newValue || newValue === oldValue) continue;

        // Hooks keep living on the new object, the stale one is left untouched
        for (const record of [...nested.values()]) {
            if (typeof newValue[record.key] !== "function") continue;
            nested.delete(record.key);
            let byKey = hooked.get(newValue);
            if (!byKey) hooked.set(newValue, byKey = new Map());
            record.target = newValue;
            record.original = newValue[record.key];
            record.descriptor = Object.getOwnPropertyDescriptor(newValue, record.key);
            record.wrapper = createWrapper(record);
            install(record);
            byKey.set(record.key, record);
        }
    }
}
