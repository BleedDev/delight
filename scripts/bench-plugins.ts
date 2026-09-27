/**
 * Before/after numbers for the plugin hot paths: Last Seen's lines and bookkeeping, and Inline
 * Translate's per-message block. Runs the code at a git revision (HEAD by default) and the working
 * tree against a fake @evi/api and a tiny stand-in for React that counts renders.
 *   bun scripts/bench-plugins.ts [revision]
 *
 * Stores are Map lookups here, as they are with the core's findStore cache: what's measured is
 * what the plugins themselves do per row, per message and per dispatch.
 */
import { execFileSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { plugin } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const REV = process.argv[2] ?? "HEAD";
const PLUGINS = ["last-seen", "inline-translate"];

// --- Timers and idle callbacks, run by hand ----------------------------------------------------

type Timer = { fn: (...args: any[]) => void; at: number; id: number; };
let timers: Timer[] = [];
let nextTimer = 1;
let fakeNow = 0;
const g = globalThis as any;
g.setTimeout = (fn: () => void, ms = 0) => {
    const id = nextTimer++;
    timers.push({ fn, at: fakeNow + ms, id });
    return id;
};
g.clearTimeout = (id: number) => void (timers = timers.filter(t => t.id !== id));
g.requestIdleCallback = (fn: (deadline: any) => void) => g.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 1);
g.cancelIdleCallback = g.clearTimeout;
/** Runs every timer due within `ms` */
function advance(ms: number) {
    const until = fakeNow + ms;
    for (;;) {
        const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter(t => t !== due);
        fakeNow = due.at;
        due.fn();
    }
    fakeNow = until;
}
g.window = g;
g.addEventListener = () => { };
g.removeEventListener = () => { };
g.document = { documentElement: { lang: "en" }, hasFocus: () => true };

// --- A stand-in for React: components, hooks, memo, and a render counter -----------------------

const MEMO = Symbol("memo");
const Fragment = Symbol("Fragment");
interface Instance { type: any; props: any; hooks: any[]; index: number; children: Instance[]; effects: (() => void)[]; dead?: boolean; }
let current: Instance | undefined;
const dirty = new Set<Instance>();
export const renders = new Map<string, number>();

const element = (type: any, props: any, key?: any) => ({ $el: true, type, props: props ?? {}, key });
const jsxRuntime = { jsx: element, jsxs: element, jsxDEV: element, Fragment };

const shallowEqual = (a: any, b: any) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.is(a[k], b[k]));
};
const nameOf = (type: any) => (type?.[MEMO] ?? type)?.name || "anonymous";

function collect(node: any, out: any[]) {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(n => collect(n, out));
    if (!node.$el) return;
    if (typeof node.type === "function" || node.type?.[MEMO]) out.push(node);
    else collect(node.props.children, out);
}

function renderInstance(inst: Instance) {
    dirty.delete(inst);
    const fn = inst.type[MEMO] ?? inst.type;
    const name = nameOf(inst.type);
    renders.set(name, (renders.get(name) ?? 0) + 1);
    const previous = current;
    current = inst;
    inst.index = 0;
    inst.effects = [];
    let output: any;
    try {
        output = fn(inst.props);
    } finally {
        current = previous;
    }
    const elements: any[] = [];
    collect(output, elements);
    const next: Instance[] = [];
    elements.forEach((el, i) => {
        const old = inst.children[i];
        if (old && old.type === el.type) {
            const skip = el.type[MEMO] && shallowEqual(old.props, el.props);
            old.props = el.props;
            if (!skip) renderInstance(old);
            next.push(old);
        } else {
            if (old) unmount(old);
            const child: Instance = { type: el.type, props: el.props, hooks: [], index: 0, children: [], effects: [] };
            renderInstance(child);
            next.push(child);
        }
    });
    for (const old of inst.children.slice(elements.length)) unmount(old);
    inst.children = next;
    for (const effect of inst.effects) effect();
}

function unmount(inst: Instance) {
    inst.dead = true;
    for (const hook of inst.hooks) hook?.cleanup?.();
    inst.children.forEach(unmount);
}

function mount(el: any): Instance {
    const inst: Instance = { type: () => el, props: {}, hooks: [], index: 0, children: [], effects: [] };
    renderInstance(inst);
    return inst;
}

/** Renders whatever was scheduled, like React committing an update */
function flush() {
    while (dirty.size) {
        const [inst] = dirty;
        if (inst.dead) dirty.delete(inst);
        else renderInstance(inst);
    }
}

const hook = <T>(init: () => T): T => {
    const inst = current!;
    const i = inst.index++;
    if (!(i in inst.hooks)) inst.hooks[i] = init();
    return inst.hooks[i];
};
const depsChanged = (a: any[] | undefined, b: any[] | undefined) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

const React: any = {
    Fragment,
    memo: (fn: any) => ({ [MEMO]: fn }),
    createElement: (type: any, props: any, ...children: any[]) => element(type, { ...props, children: children.length > 1 ? children : children[0] }),
    cloneElement: (el: any, props: any) => ({ ...el, props: { ...el.props, ...props } }),
    Children: { toArray: (c: any) => [c].flat(Infinity).filter(x => x != null && x !== false) },
    useId: () => hook(() => ":r1:"),
    useRef: (v: any) => hook(() => ({ current: v })),
    useState(initial: any) {
        const inst = current!;
        const slot = hook(() => ({ value: typeof initial === "function" ? initial() : initial }));
        return [slot.value, (v: any) => {
            const value = typeof v === "function" ? v(slot.value) : v;
            if (Object.is(value, slot.value)) return;
            slot.value = value;
            dirty.add(inst);
        }];
    },
    useMemo(fn: () => any, deps: any[]) {
        const slot = hook(() => ({ deps: undefined as any, value: undefined as any }));
        if (depsChanged(slot.deps, deps)) {
            slot.deps = deps;
            slot.value = fn();
        }
        return slot.value;
    },
    useCallback: (fn: any, deps: any[]) => React.useMemo(() => fn, deps),
    useEffect(fn: () => any, deps?: any[]) {
        const inst = current!;
        const slot = hook(() => ({ deps: undefined as any, cleanup: undefined as any }));
        if (deps && !depsChanged(slot.deps, deps)) return;
        slot.deps = deps;
        inst.effects.push(() => {
            slot.cleanup?.();
            const cleanup = fn();
            slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        });
    },
    useSyncExternalStore(subscribe: (cb: () => void) => () => void, getSnapshot: () => any) {
        const inst = current!;
        const slot = hook(() => ({ subscribe: undefined as any, unsubscribe: undefined as any, getSnapshot, value: undefined as any, cleanup: undefined as any }));
        slot.getSnapshot = getSnapshot;
        slot.value = getSnapshot();
        if (slot.subscribe !== subscribe) {
            slot.unsubscribe?.();
            slot.subscribe = subscribe;
            slot.unsubscribe = subscribe(() => {
                if (!Object.is(slot.getSnapshot(), slot.value)) dirty.add(inst);
            });
            slot.cleanup = () => slot.unsubscribe?.();
        }
        return slot.value;
    },
};

// --- A fake @evi/api -----------------------------------------------------------------------------

const stores = new Map<string, any>();
const settingsListeners = new Set<() => void>();
let settingsData: Record<string, Record<string, unknown>> = {};

function fakeContext(id: string, schema: Record<string, { default: unknown; }>) {
    const intervals: (() => void)[] = [];
    const hooks: any[] = [];
    const menus: any[] = [];
    const badges: any[] = [];
    const flux = new Map<string, (action: any) => void>();
    const get = (key: string) => (settingsData[id] && key in settingsData[id] ? settingsData[id][key] : schema[key]?.default);
    const ctx = {
        id,
        intervals, hooks, menus, badges, flux,
        logger: { error() { }, warn() { }, info() { } },
        settings: {
            get,
            get all() {
                return Object.fromEntries(Object.keys(schema).map(k => [k, get(k)]));
            },
            onChange(cb: () => void) {
                settingsListeners.add(cb);
            },
            use() {
                React.useSyncExternalStore((cb: () => void) => (settingsListeners.add(cb), () => settingsListeners.delete(cb)), () => settingsData);
                return ctx.settings.all;
            },
            set(key: string, value: unknown) {
                settingsData = { ...settingsData, [id]: { ...settingsData[id], [key]: value } };
                [...settingsListeners].forEach(l => l());
            },
        },
        addStyle() { },
        onDispose() { },
        waitFor() { },
        setInterval: (fn: () => void) => void intervals.push(fn),
        setTimeout: (fn: () => void, ms: number) => g.setTimeout(fn, ms),
        hookExport: (_kind: string, _filter: unknown, cb: any) => void hooks.push(cb),
        contextMenu: (_id: string, cb: any) => void menus.push(cb),
        profileBadges: (provider: any) => void badges.push(provider),
        command() { },
        toast() { },
        native: { call: async (_m: string, text: string) => ({ source: "es", text: `[${text}]` }) },
    };
    ctx.flux = flux;
    (ctx as any).flux.subscribe = (type: string, fn: any) => void flux.set(type, fn);
    return ctx;
}

const api = {
    React,
    definePlugin: (d: any) => d,
    getStore: (name: string) => {
        const s = stores.get(name);
        if (!s) throw new Error(`no ${name}`);
        return s;
    },
    findStore: (name: string) => stores.get(name),
    filters: new Proxy({}, { get: () => () => () => false }),
    findMenuGroup: () => undefined,
    Menu: { Item: (props: any) => props },
    Components: { Tooltip: ({ children }: any) => children, Button: undefined, TextField: undefined },
};

plugin({
    name: "evi-bench",
    setup(build) {
        build.module("@evi/api", () => ({ exports: api, loader: "object" }));
        for (const id of ["react/jsx-runtime", "react/jsx-dev-runtime"]) build.module(id, () => ({ exports: jsxRuntime, loader: "object" }));
    },
});

// --- Discord's stores, with 1000 people --------------------------------------------------------

const PEOPLE = 1000;
const ids = Array.from({ length: PEOPLE }, (_, i) => `1${String(i).padStart(17, "0")}`);
const statuses: Record<string, string> = {};
stores.set("UserStore", { getCurrentUser: () => ({ id: "me" }), getUser: (id: string) => ({ id, bot: false }) });
stores.set("PresenceStore", { getStatus: (id: string) => statuses[id] ?? "offline", getState: () => ({ statuses }), getClientStatus: () => ({}) });
stores.set("RelationshipStore", { isFriend: (id: string) => id.endsWith("7"), getFriendIDs: () => ids.filter(id => id.endsWith("7")), getNickname: () => undefined });
stores.set("PrivateChannelStore", { getPrivateChannelIds: () => [] });
stores.set("ChannelStore", { getChannel: (id: string) => ({ id, type: 0, name: "general", guild_id: "g" }) });
stores.set("LocaleStore", { locale: "en-US", addChangeListener() { }, removeChangeListener() { } });

// --- Loading the code at REV and in the working tree -------------------------------------------

const BEFORE = join(tmpdir(), `evi-bench-${process.pid}`);
function checkout() {
    for (const id of PLUGINS) {
        const dir = join(BEFORE, id);
        mkdirSync(dir, { recursive: true });
        const files = execFileSync("git", ["ls-tree", "--name-only", `${REV}:plugins/${id}`], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
        for (const file of files) writeFileSync(join(dir, file), execFileSync("git", ["show", `${REV}:plugins/${id}/${file}`], { cwd: ROOT }));
    }
}

const time = (fn: () => void) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
};
const ms = (n: number) => `${n.toFixed(2)} ms`;
const rendersOf = (name: string) => renders.get(name) ?? 0;

// --- Last Seen -----------------------------------------------------------------------------------

async function lastSeen(dir: string) {
    const index = (await import(join(dir, "last-seen/index.tsx"))).default;
    const state = await import(join(dir, "last-seen/state.ts"));
    const track = await import(join(dir, "last-seen/track.ts"));
    const ctx = fakeContext("last-seen", index.settings);
    settingsData = {};
    index.start(ctx);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    advance(10);
    // 1000 people seen offline over the last day, most recent last
    const t0 = Date.now() - 86_400_000;
    const tracker = new Map();
    ids.forEach((id, i) => tracker.set(id, { seen: t0 + i * 60_000, message: t0 + i * 30_000, channelId: "c1", messageId: "m1" }));
    state.state.tracker = tracker;
    state.state.loaded = true;

    renders.clear();
    const rows = ids.map(id => index.memberSubText("Offline", { id, bot: false }, "offline"));
    let root!: Instance;
    const mountMs = time(() => void (root = mount(element(Fragment, { children: rows }))));
    const lines = rendersOf("LastSeenLine");

    // One person starts typing ("Active just now"); lines update when the batch is flushed (5s)
    renders.clear();
    const oneMs = time(() => {
        index.flux.TYPING_START({ userId: ids[3] });
        advance(5000);
        flush();
    });
    const oneRenders = rendersOf("LastSeenLine");

    // The minute passes: relative times move on
    renders.clear();
    const tickMs = time(() => {
        (ctx.intervals.find(fn => fn.name !== "" && /bump|tick/.test(fn.name)) ?? ctx.intervals[1])();
        flush();
    });
    const tickRenders = rendersOf("LastSeenLine");

    // A presence burst: 200 people change status. Time spent inside the dispatch, then in total.
    const updates = ids.slice(0, 200).map(id => ({ user: { id } }));
    for (const id of ids.slice(0, 200)) statuses[id] = "online";
    renders.clear();
    const presenceDispatchMs = time(() => index.flux.PRESENCE_UPDATES({ updates }));
    const presenceTotalMs = presenceDispatchMs + time(() => {
        advance(6000);
        flush();
    });
    const presenceRenders = rendersOf("LastSeenLine");
    for (const id of ids.slice(0, 200)) delete statuses[id];

    // Opening a channel: 50 messages of history
    const history = Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, author: { id: ids[(i * 7) % PEOPLE] }, channel_id: "c2", timestamp: new Date(Date.now() - i * 1000).toISOString() }));
    const loadDispatchMs = time(() => index.flux.LOAD_MESSAGES_SUCCESS({ channelId: "c2", messages: history }));
    const loadTotalMs = loadDispatchMs + time(() => advance(10));

    // The profile badge, asked on every profile render
    const provider = ctx.badges[0];
    const badgeMs = time(() => {
        for (let i = 0; i < 1000; i++) provider(ids[5]);
    });

    // Pruning at the cap with 2000 friends at the front: 2000 new people come in
    const pruneTracker = new Map();
    for (let i = 0; i < 25_000; i++) pruneTracker.set(`p${i}`, { seen: i });
    const friends = new Set([...pruneTracker.keys()].slice(0, 2000));
    const opts = { cap: 25_000, keep: (id: string) => friends.has(id), slack: track.PRUNE_SLACK };
    const pruneMs = time(() => {
        for (let i = 0; i < 2000; i++) track.observeActivity(pruneTracker, `n${i}`, 1_000_000 + i, opts);
    });

    unmount(root);
    index.stop();
    return {
        "mount 1000 member rows": `${ms(mountMs)} (${lines} line renders)`,
        "one person starts typing": `${ms(oneMs)}, ${oneRenders} line re-renders`,
        "minute tick": `${ms(tickMs)}, ${tickRenders} line re-renders`,
        "200 presence updates: in dispatch": ms(presenceDispatchMs),
        "200 presence updates: total": `${ms(presenceTotalMs)}, ${presenceRenders} line re-renders`,
        "LOAD_MESSAGES_SUCCESS (50): in dispatch": ms(loadDispatchMs),
        "LOAD_MESSAGES_SUCCESS (50): total": ms(loadTotalMs),
        "profile badge x1000 (same person)": ms(badgeMs),
        "2000 new people at the cap, 2000 friends first": ms(pruneMs),
    };
}

// --- Inline Translate ----------------------------------------------------------------------------

async function inlineTranslate(dir: string) {
    const index = (await import(join(dir, "inline-translate/index.tsx"))).default;
    const ctx = fakeContext("inline-translate", index.settings);
    settingsData = {};
    index.start(ctx);
    const accessories = ctx.hooks[0];
    const messages = ids.map((id, i) => ({ id: `msg${i}`, content: `Hola, ¿cómo estás? número ${i}`, author: { id, bot: false }, type: 0, channel_id: "c1" }));
    const blocks = () => messages.map(message => accessories({ args: [{ channelMessageProps: { message } }], result: "accessories" }));

    renders.clear();
    let root!: Instance;
    const mountOff = time(() => void (root = mount(element(Fragment, { children: blocks() }))));
    const mountedOff = rendersOf("Inline");

    // Translating one message from the menu, with 1000 on screen: its request, then its result
    renders.clear();
    const items: any[] = [];
    ctx.menus[0](items, { message: messages[10] });
    const toggleMs = time(() => {
        items[0].props.action();
        flush();
    });
    // The queue sends it (timers are faked), then the answer comes back
    advance(2000);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    flush();
    const toggleRenders = rendersOf("Inline");
    unmount(root);

    // Automatic mode on: every message is checked as it mounts
    ctx.settings.set("autoMode", "foreign");
    renders.clear();
    const mountAuto = time(() => void (root = mount(element(Fragment, { children: blocks() }))));
    unmount(root);
    return {
        "mount 1000 messages, automatic off": `${ms(mountOff)} (${mountedOff} renders)`,
        "translate one of 1000 on screen": `${ms(toggleMs)}, ${toggleRenders} message re-renders`,
        "mount 1000 messages, automatic on": ms(mountAuto),
    };
}

// --- Run -------------------------------------------------------------------------------------------

checkout();
try {
    const rows: Record<string, { before: string; after: string; }> = {};
    const add = (group: string, before: Record<string, string>, after: Record<string, string>) => {
        for (const key of Object.keys(after)) rows[`${group}: ${key}`] = { before: before[key] ?? "-", after: after[key] };
    };
    // Warm up once, then measure: the first run pays for compiling
    await lastSeen(BEFORE);
    await lastSeen(join(ROOT, "plugins"));
    add("Last Seen", await lastSeen(BEFORE), await lastSeen(join(ROOT, "plugins")));
    await inlineTranslate(BEFORE);
    await inlineTranslate(join(ROOT, "plugins"));
    add("Inline Translate", await inlineTranslate(BEFORE), await inlineTranslate(join(ROOT, "plugins")));
    console.log(`before = ${REV}, after = working tree\n`);
    console.table(rows);
} finally {
    rmSync(BEFORE, { recursive: true, force: true });
}
