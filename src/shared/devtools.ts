/**
 * The pure parts of Evi's DevTools tab (src/renderer/ui/DevToolsTab.tsx): a ring buffer for the Flux
 * log, reading any value safely for the JSON tree, a store's zero-argument getters, and patch hits.
 * Nothing here touches Discord, so it's all tested directly.
 */

/** The last `capacity` items pushed, oldest dropped first. Pushing never allocates past the first lap. */
export class RingBuffer<T> {
    private items: (T | undefined)[] = [];
    private start = 0;
    private count = 0;
    /** Pushed since created or cleared, dropped ones included */
    total = 0;

    constructor(readonly capacity: number) {
        if (!(capacity > 0)) throw new RangeError("RingBuffer capacity must be positive");
    }

    get size() {
        return this.count;
    }

    push(item: T) {
        this.total++;
        if (this.count < this.capacity) {
            this.items[(this.start + this.count) % this.capacity] = item;
            this.count++;
            return;
        }
        this.items[this.start] = item;
        this.start = (this.start + 1) % this.capacity;
    }

    /** Oldest first */
    toArray(): T[] {
        const out: T[] = new Array(this.count);
        for (let i = 0; i < this.count; i++) out[i] = this.items[(this.start + i) % this.capacity] as T;
        return out;
    }

    /** Newest first, what a log shows */
    newestFirst(): T[] {
        return this.toArray().reverse();
    }

    clear() {
        // Drop the references too: a cleared log shouldn't keep old actions alive
        this.items = [];
        this.start = this.count = this.total = 0;
    }
}

export type ValueKind =
    | "string" | "number" | "boolean" | "null" | "undefined" | "bigint" | "symbol"
    | "function" | "array" | "map" | "set" | "date" | "regexp" | "error" | "element" | "object" | "circular" | "unreadable";

export interface ValueInfo {
    kind: ValueKind;
    /** One line: the value itself for primitives, a preview (`Array(3)`, `UserRecord {…}`) otherwise */
    label: string;
    /** Has children worth opening */
    expandable: boolean;
}

export interface TreeLimits {
    /** Children listed per value before "N more" */
    children: number;
    /** Levels below the root that can be opened */
    depth: number;
    /** Characters of a string shown */
    string: number;
}

export const TREE_LIMITS: TreeLimits = { children: 100, depth: 10, string: 300 };

const safe = <T>(read: () => T, fallback: T): T => {
    try {
        return read();
    } catch {
        return fallback;
    }
};

/** A class's or constructor's name, or "" for plain objects and anything that won't say */
function constructorName(value: object) {
    return safe(() => {
        const proto = Object.getPrototypeOf(value);
        if (proto === null) return "";
        const name = proto.constructor?.displayName ?? proto.constructor?.name;
        return typeof name === "string" && name !== "Object" ? name : "";
    }, "");
}

const isElement = (value: object) => safe(() => typeof Node !== "undefined" && value instanceof Node, false);

/** What a value is, in one line, without ever throwing (getters, revoked proxies, hostile toString) */
export function describeValue(value: unknown, limits: TreeLimits = TREE_LIMITS): ValueInfo {
    switch (typeof value) {
        case "string": {
            const shown = value.length > limits.string ? `${value.slice(0, limits.string)}…` : value;
            return { kind: "string", label: JSON.stringify(shown), expandable: false };
        }
        case "number":
            return { kind: "number", label: Object.is(value, -0) ? "-0" : String(value), expandable: false };
        case "boolean":
            return { kind: "boolean", label: String(value), expandable: false };
        case "bigint":
            return { kind: "bigint", label: `${value}n`, expandable: false };
        case "undefined":
            return { kind: "undefined", label: "undefined", expandable: false };
        case "symbol":
            return { kind: "symbol", label: safe(() => value.toString(), "Symbol()"), expandable: false };
        case "function": {
            const name = safe(() => (value as Function).name, "") || "anonymous";
            const source = safe(() => Function.prototype.toString.call(value), "");
            return { kind: "function", label: /^class\b/.test(source) ? `class ${name}` : `ƒ ${name}()`, expandable: false };
        }
    }
    if (value === null) return { kind: "null", label: "null", expandable: false };

    const object = value as object;
    try {
        if (Array.isArray(object)) return { kind: "array", label: `Array(${object.length})`, expandable: object.length > 0 };
        if (object instanceof Map) return { kind: "map", label: `Map(${object.size})`, expandable: object.size > 0 };
        if (object instanceof Set) return { kind: "set", label: `Set(${object.size})`, expandable: object.size > 0 };
        if (object instanceof Date) return { kind: "date", label: Number.isNaN(object.getTime()) ? "Invalid Date" : object.toISOString(), expandable: false };
        if (object instanceof RegExp) return { kind: "regexp", label: String(object), expandable: false };
        if (object instanceof Error) return { kind: "error", label: `${object.name}: ${object.message}`, expandable: true };
        if (isElement(object)) {
            const tag = safe(() => (object as Element).tagName?.toLowerCase(), "") || safe(() => (object as Node).nodeName, "node");
            return { kind: "element", label: `<${tag}>`, expandable: false };
        }
        const name = constructorName(object);
        const keys = Object.keys(object).length;
        return { kind: "object", label: name ? `${name} {…}` : keys ? "{…}" : "{}", expandable: keys > 0 };
    } catch {
        return { kind: "unreadable", label: "(unreadable)", expandable: false };
    }
}

export interface TreeChild {
    key: string;
    value: unknown;
    info: ValueInfo;
    /** Can be opened: has children, isn't one of its own ancestors, and isn't past the depth limit */
    canExpand: boolean;
}

/**
 * The children of `value` for a tree view: array items, map entries, set values, an error's message
 * and stack, an object's own enumerable keys. `ancestors` are the values from the root down to
 * `value` (included), so a child that is one of them is shown as [Circular] instead of looping.
 */
export function treeChildren(value: unknown, ancestors: readonly unknown[], limits: TreeLimits = TREE_LIMITS): { children: TreeChild[]; more: number; } {
    const raw: [string, () => unknown][] = [];
    let total = 0;
    const take = (key: string, read: () => unknown) => {
        if (total++ < limits.children) raw.push([key, read]);
    };

    try {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length && i < limits.children; i++) take(String(i), () => value[i]);
            total = value.length;
        } else if (value instanceof Map) {
            for (const [k, v] of value) {
                if (total >= limits.children) {
                    total = value.size;
                    break;
                }
                take(typeof k === "string" ? k : describeValue(k, limits).label, () => v);
            }
        } else if (value instanceof Set) {
            let i = 0;
            for (const v of value) {
                if (total >= limits.children) {
                    total = value.size;
                    break;
                }
                take(String(i++), () => v);
            }
        } else if (value && (typeof value === "object" || typeof value === "function")) {
            if (value instanceof Error) {
                take("name", () => value.name);
                take("message", () => value.message);
                take("stack", () => value.stack);
            }
            for (const key of Object.keys(value)) {
                if (value instanceof Error && (key === "message" || key === "stack")) continue;
                take(key, () => (value as any)[key]);
            }
        }
    } catch {
        // A proxy that throws on iteration: what was read so far is what there is
    }

    const depth = ancestors.length;
    const children = raw.map(([key, read]): TreeChild => {
        let child: unknown;
        try {
            child = read();
        } catch (err) {
            const message = safe(() => String((err as Error)?.message ?? err), "error");
            return { key, value: undefined, info: { kind: "unreadable", label: `(threw: ${message})`, expandable: false }, canExpand: false };
        }
        if (child !== null && (typeof child === "object" || typeof child === "function") && ancestors.includes(child)) {
            return { key, value: child, info: { kind: "circular", label: "[Circular]", expandable: false }, canExpand: false };
        }
        const info = describeValue(child, limits);
        return { key, value: child, info, canExpand: info.expandable && depth < limits.depth };
    });
    return { children, more: Math.max(0, total - raw.length) };
}

/** An action's keys besides `type`, the first few, for its row in the log */
export function actionKeys(action: unknown, max = 4): { keys: string[]; more: number; } {
    const keys = safe(() => Object.keys(action as object).filter(k => k !== "type"), [] as string[]);
    return { keys: keys.slice(0, max), more: Math.max(0, keys.length - max) };
}

/** Whether an action type matches the log's filter: every word, in any case */
export function matchesType(type: string, filter: string) {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    const lower = type.toLowerCase();
    return words.every(w => lower.includes(w));
}

const GETTER = /^(?:get|is|has|can|should|are|was)(?:[A-Z_]|$)/;

/**
 * A store's getters that take no arguments (`getCurrentUser`, `isConnected`, `hasLoaded`...), found on
 * the store and its prototype chain, sorted. Anything that takes arguments is left out: calling it
 * without them would only throw or mislead.
 */
export function zeroArgGetters(store: object): string[] {
    const names = new Set<string>();
    let proto: object | null = store;
    while (proto && proto !== Object.prototype) {
        for (const key of safe(() => Object.getOwnPropertyNames(proto), [] as string[])) {
            if (!GETTER.test(key) || names.has(key)) continue;
            const desc = safe(() => Object.getOwnPropertyDescriptor(proto, key), undefined);
            // Accessors aren't called here: only plain methods
            if (typeof desc?.value === "function" && desc.value.length === 0) names.add(key);
        }
        proto = safe(() => Object.getPrototypeOf(proto), null);
    }
    return [...names].sort();
}

export type GetterResult = { name: string; value: unknown; error?: undefined; } | { name: string; value?: undefined; error: string; };

/** Calls each getter on `store`, catching what throws */
export function evaluateGetters(store: object, names: readonly string[]): GetterResult[] {
    return names.map(name => {
        try {
            return { name, value: (store as any)[name]() };
        } catch (err) {
            return { name, error: safe(() => String((err as Error)?.message ?? err), "error") };
        }
    });
}

/** What perf.ts reports per plugin (Perf.snapshot()), as far as patch hits need it */
export interface SiteNumbers {
    kind: string;
    name: string;
    calls: number;
    ms: number;
    max: number;
    recent?: { calls: number; ms: number; };
}

/** What patching/source.ts records per patch (getPatchRecords()) */
export interface PatchRecordLike {
    plugin: string;
    index: number;
    state: string;
    modules: readonly string[];
    errors: readonly string[];
}

export interface PatchHits {
    plugin: string;
    /** Every patch it registered, in order, with how it went */
    patches: { index: number; state: string; modules: number; errors: number; }[];
    /** Each $self function patched code called, busiest first */
    functions: { name: string; calls: number; ms: number; max: number; recentCalls: number; }[];
    calls: number;
    ms: number;
}

/**
 * Patch hits per plugin: the calls its patched code made into it ($self.fn, measured by perf.ts as
 * "patch" sites), next to its patches' health. Busiest plugins first, then plugins whose patches
 * haven't called in yet.
 */
export function patchHits(reports: readonly { plugin: string; sites: readonly SiteNumbers[]; }[], records: readonly PatchRecordLike[]): PatchHits[] {
    const byPlugin = new Map<string, PatchHits>();
    const get = (plugin: string) => {
        let hits = byPlugin.get(plugin);
        if (!hits) byPlugin.set(plugin, hits = { plugin, patches: [], functions: [], calls: 0, ms: 0 });
        return hits;
    };

    for (const r of records) {
        get(r.plugin).patches.push({ index: r.index, state: r.state, modules: r.modules.length, errors: r.errors.length });
    }
    for (const report of reports) {
        for (const site of report.sites) {
            if (site.kind !== "patch") continue;
            const hits = get(report.plugin);
            hits.functions.push({ name: site.name, calls: site.calls, ms: site.ms, max: site.max, recentCalls: site.recent?.calls ?? 0 });
            hits.calls += site.calls;
            hits.ms += site.ms;
        }
    }

    for (const hits of byPlugin.values()) {
        hits.patches.sort((a, b) => a.index - b.index);
        hits.functions.sort((a, b) => b.calls - a.calls || b.ms - a.ms);
    }
    return [...byPlugin.values()].sort((a, b) => b.calls - a.calls || b.ms - a.ms || a.plugin.localeCompare(b.plugin));
}
