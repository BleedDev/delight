/**
 * Where plugins spend time, measured in the user's own Discord. Every hook callback, Flux handler,
 * $self call from a source patch, profile badge provider, menu callback, timer and start() runs
 * between two performance.now() reads and is charged to the plugin that registered it, at a "site"
 * (what it hooked, which action it handles...). The Performance tab (ui/PerformanceTab.tsx) shows it.
 *
 * Always on, so it has to cost next to nothing: a measured call reads the clock twice and updates a
 * few numbers on a Site resolved when the callback was registered. No lookup, no allocation.
 *
 * Time is self time. A measurement inside another one (a hook whose callback calls a function another
 * plugin hooked, an `instead` hook calling through to Discord's original) is taken out of the outer
 * one, so every millisecond is charged once, to whoever spent it. Only the synchronous part of an
 * async callback is counted: that's the part that holds up Discord.
 *
 * Outside cross-origin isolation Chromium coarsens performance.now() (to 100 µs, with jitter), so a
 * single short call often reads as 0 or 0.1 ms. Totals over many calls average that out; "worst call"
 * is only as fine as the clock.
 */

export type SiteKind = "hook" | "flux" | "patch" | "badges" | "menu" | "timer" | "start";

/** Seconds kept for "recently", one slot per second */
export const WINDOW_S = 10;
/** Calls this slow are listed one by one in a recording */
export const SLOW_CALL_MS = 1;
const MAX_SLOW_CALLS = 200;

/** One place a plugin's code runs from. Created at registration and kept, so calls never look it up. */
export class Site {
    calls = 0;
    ms = 0;
    max = 0;
    /** Per slot: the second it holds (performance.now() / 1000), and that second's numbers */
    readonly second = new Float64Array(WINDOW_S).fill(-1);
    readonly secondCalls = new Float64Array(WINDOW_S);
    readonly secondMs = new Float64Array(WINDOW_S);
    readonly secondMax = new Float64Array(WINDOW_S);
    /** Since the current recording started */
    recCalls = 0;
    recMs = 0;
    recMax = 0;

    constructor(readonly plugin: string, readonly kind: SiteKind, readonly name: string) { }
}

export interface Totals {
    calls: number;
    ms: number;
    /** The slowest single call */
    max: number;
}

export interface SiteReport extends Totals {
    kind: SiteKind;
    name: string;
    /** The last WINDOW_S seconds */
    recent: Totals;
}

export interface PluginReport extends Totals {
    plugin: string;
    recent: Totals;
    /** Slowest first: by recent time, then by time since start */
    sites: SiteReport[];
}

export interface SlowCall {
    plugin: string;
    kind: SiteKind;
    name: string;
    ms: number;
    /** Since the recording started */
    at: number;
}

export interface RecordingReport {
    /** How long it recorded */
    ms: number;
    /** Time all plugins took together */
    pluginMs: number;
    plugins: (Totals & { plugin: string; sites: (Totals & { kind: SiteKind; name: string; })[]; })[];
    /** Every call of SLOW_CALL_MS or more, in order (the first MAX_SLOW_CALLS) */
    slowCalls: SlowCall[];
    /** Tasks over 50 ms on the main thread, Discord's and ours; undefined where the browser can't tell */
    longTasks?: { count: number; ms: number; longest: number; };
}

// plugin id -> "kind name" -> site
const sites = new Map<string, Map<string, Site>>();

// ---- measuring --------------------------------------------------------------------------------

const MAX_DEPTH = 1024;
/** Time spent in measurements nested inside the one at each depth */
const nested = new Float64Array(MAX_DEPTH);
let depth = 0;

let recording = false;
let recordingStart = 0;
let slowCalls: SlowCall[] = [];

const now = () => performance.now();

/** Starts a measurement: pass what it returns to `end` (or `pass`), in a finally */
function begin() {
    if (++depth < MAX_DEPTH) nested[depth] = 0;
    return now();
}

/** Ends a measurement, charging its self time to `site` */
function end(site: Site, start: number) {
    const at = now();
    const elapsed = at - start;
    const d = depth--;
    const self = d < MAX_DEPTH ? Math.max(0, elapsed - nested[d]) : elapsed;
    if (depth < MAX_DEPTH) nested[depth] += elapsed;

    site.calls++;
    site.ms += self;
    if (self > site.max) site.max = self;

    const second = (at / 1000) | 0;
    const slot = second % WINDOW_S;
    if (site.second[slot] !== second) {
        site.second[slot] = second;
        site.secondCalls[slot] = 0;
        site.secondMs[slot] = 0;
        site.secondMax[slot] = 0;
    }
    site.secondCalls[slot]++;
    site.secondMs[slot] += self;
    if (self > site.secondMax[slot]) site.secondMax[slot] = self;

    if (recording) {
        site.recCalls++;
        site.recMs += self;
        if (self > site.recMax) site.recMax = self;
        if (self >= SLOW_CALL_MS && slowCalls.length < MAX_SLOW_CALLS) {
            slowCalls.push({ plugin: site.plugin, kind: site.kind, name: site.name, ms: self, at: start - recordingStart });
        }
    }
}

/** Ends a measurement without charging it anywhere: time spent in someone else's code (callOriginal) */
function pass(start: number) {
    const elapsed = now() - start;
    depth--;
    if (depth < MAX_DEPTH) nested[depth] += elapsed;
}

/** The site for a plugin's code, created on first use. Call it when registering, never per call. */
function site(plugin: string, kind: SiteKind, name: string) {
    let byName = sites.get(plugin);
    if (!byName) sites.set(plugin, byName = new Map());
    const key = `${kind} ${name}`;
    let found = byName.get(key);
    if (!found) byName.set(key, found = new Site(plugin, kind, name));
    return found;
}

/** `fn`, measured at `site` on every call */
function measure<F extends (...args: any[]) => any>(site: Site, fn: F): F {
    return function (this: unknown) {
        const start = begin();
        try {
            // `arguments` rather than a rest parameter: no array per call
            return fn.apply(this, arguments as any);
        } finally {
            end(site, start);
        }
    } as F;
}

// ---- $self --------------------------------------------------------------------------------------

const selves = new WeakMap<object, object>();

const isClass = (fn: Function) => !!fn.prototype?.isReactComponent || /^class\b/.test(Function.prototype.toString.call(fn));

/**
 * The plugin definition as source patches see it ($self): the same object, except its functions are
 * measured, each at its own site ("$self.renderButton"). A function is wrapped once and the wrapper
 * kept while the property holds it, so a component patched code renders from $self keeps its identity
 * (React would remount it otherwise), and its render time is measured too.
 */
function measuredSelf<T extends object>(plugin: string, definition: T): T {
    let proxy = selves.get(definition) as T | undefined;
    if (proxy) return proxy;
    // A frozen definition can't hand out anything but its own values (a Proxy invariant)
    if (Object.isFrozen(definition)) return definition;

    const wrapped = new Map<PropertyKey, { fn: Function; measured: Function; }>();
    const self = proxy = new Proxy(definition, {
        get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function" || typeof key === "symbol") return value;
            let entry = wrapped.get(key);
            if (entry?.fn !== value) wrapped.set(key, entry = { fn: value, measured: wrapSelf(plugin, target, self, key, value) });
            return entry.measured;
        },
    });
    selves.set(definition, proxy);
    return proxy;
}

function wrapSelf(plugin: string, definition: object, self: object, key: string, fn: Function) {
    const own = Object.getOwnPropertyDescriptor(definition, key);
    if (isClass(fn) || (own && !own.configurable && !own.writable)) return fn;

    const at = site(plugin, "patch", `$self.${key}`);
    const measured = function (this: unknown) {
        const start = begin();
        try {
            // Called as $self.method(): the method sees its real definition as `this`, like before
            return fn.apply(this === self ? definition : this, arguments);
        } finally {
            end(at, start);
        }
    };
    // Statics (displayName, defaultProps) for components
    Object.assign(measured, fn);
    Object.defineProperty(measured, "name", { value: fn.name, configurable: true });
    return measured;
}

// ---- reports ------------------------------------------------------------------------------------

const byTime = <T extends Totals & { recent?: Totals; }>(a: T, b: T) => (b.recent?.ms ?? 0) - (a.recent?.ms ?? 0) || b.ms - a.ms || b.calls - a.calls;

function recentOf(s: Site, second: number): Totals {
    const out: Totals = { calls: 0, ms: 0, max: 0 };
    for (let i = 0; i < WINDOW_S; i++) {
        if (s.second[i] <= second - WINDOW_S) continue;
        out.calls += s.secondCalls[i];
        out.ms += s.secondMs[i];
        out.max = Math.max(out.max, s.secondMax[i]);
    }
    return out;
}

function add(into: Totals, from: Totals) {
    into.calls += from.calls;
    into.ms += from.ms;
    into.max = Math.max(into.max, from.max);
}

/** Every plugin that ran anything, slowest first */
function snapshot(): PluginReport[] {
    const second = (now() / 1000) | 0;
    const out: PluginReport[] = [];
    for (const [plugin, byName] of sites) {
        const report: PluginReport = { plugin, calls: 0, ms: 0, max: 0, recent: { calls: 0, ms: 0, max: 0 }, sites: [] };
        for (const s of byName.values()) {
            if (!s.calls) continue;
            const recent = recentOf(s, second);
            report.sites.push({ kind: s.kind, name: s.name, calls: s.calls, ms: s.ms, max: s.max, recent });
            add(report, s);
            add(report.recent, recent);
        }
        if (!report.calls) continue;
        report.sites.sort(byTime);
        out.push(report);
    }
    return out.sort(byTime);
}

// ---- recording ----------------------------------------------------------------------------------

let longTasks: PerformanceEntry[] = [];
let observer: PerformanceObserver | undefined;

const canSeeLongTasks = () => typeof PerformanceObserver !== "undefined" && !!PerformanceObserver.supportedEntryTypes?.includes("longtask");

/** Starts collecting what runs until `stopRecording`. Starting again while recording restarts it. */
function startRecording() {
    for (const byName of sites.values()) {
        for (const s of byName.values()) s.recCalls = s.recMs = s.recMax = 0;
    }
    slowCalls = [];
    longTasks = [];
    recordingStart = now();
    recording = true;

    observer?.disconnect();
    observer = undefined;
    if (canSeeLongTasks()) {
        observer = new PerformanceObserver(list => void longTasks.push(...list.getEntries()));
        observer.observe({ type: "longtask" });
    }
}

function stopRecording(): RecordingReport {
    const ms = now() - recordingStart;
    const wasRecording = recording;
    recording = false;

    let tasks: RecordingReport["longTasks"];
    if (observer) {
        longTasks.push(...observer.takeRecords());
        observer.disconnect();
        observer = undefined;
        const inWindow = longTasks.filter(t => t.startTime + t.duration >= recordingStart);
        tasks = {
            count: inWindow.length,
            ms: inWindow.reduce((sum, t) => sum + t.duration, 0),
            longest: inWindow.reduce((max, t) => Math.max(max, t.duration), 0),
        };
    }

    const plugins: RecordingReport["plugins"] = [];
    let pluginMs = 0;
    for (const [plugin, byName] of sites) {
        const report: RecordingReport["plugins"][number] = { plugin, calls: 0, ms: 0, max: 0, sites: [] };
        for (const s of byName.values()) {
            if (!s.recCalls) continue;
            const totals = { calls: s.recCalls, ms: s.recMs, max: s.recMax };
            report.sites.push({ kind: s.kind, name: s.name, ...totals });
            add(report, totals);
        }
        if (!report.calls) continue;
        report.sites.sort(byTime);
        plugins.push(report);
        pluginMs += report.ms;
    }

    return { ms: wasRecording ? ms : 0, pluginMs, plugins: plugins.sort(byTime), slowCalls, longTasks: tasks };
}

// ---- overhead -----------------------------------------------------------------------------------

let overhead: number | undefined;

/**
 * What one measurement costs, in microseconds: the average of many begin/end pairs on a scratch site.
 * Measured once and remembered.
 */
function measureOverhead(iterations = 200_000) {
    if (overhead !== undefined) return overhead;
    const scratch = new Site("", "hook", "");
    const wasRecording = recording;
    recording = false;
    const start = now();
    for (let i = 0; i < iterations; i++) end(scratch, begin());
    const took = now() - start;
    recording = wasRecording;
    return overhead = took / iterations * 1000;
}

// ---- public -------------------------------------------------------------------------------------

export const Perf = {
    begin,
    end,
    pass,
    site,
    measure,
    measuredSelf,
    snapshot,
    startRecording,
    stopRecording,
    get recording() {
        return recording;
    },
    /** When the current recording started, in performance.now() time */
    get recordingStart() {
        return recordingStart;
    },
    canSeeLongTasks,
    measureOverhead,
    /** Records for `ms` milliseconds, then reports what ran (window.Evi.perf.record(5000) in DevTools) */
    record(ms = 5000): Promise<RecordingReport> {
        startRecording();
        return new Promise(resolve => setTimeout(() => resolve(stopRecording()), ms));
    },
    /** Forgets everything measured so far. Sites stay: registered callbacks keep theirs. */
    reset() {
        for (const byName of sites.values()) {
            for (const s of byName.values()) {
                s.calls = s.ms = s.max = s.recCalls = s.recMs = s.recMax = 0;
                s.second.fill(-1);
            }
        }
        slowCalls = [];
    },
};
