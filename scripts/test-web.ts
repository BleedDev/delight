/**
 * End-to-end check against the real, current Discord web client (logged out, headless Chrome).
 * Injects the built renderer with a fake EviNative, then verifies the core works on Discord's
 * actual bundle: runtime capture, finders, source patches, export hooks, hot reload, and the UI.
 *
 *   node scripts/test-web.ts [--headed]
 *
 * Runs on Node (native TS type stripping): playwright's browser transports hang under Bun on Windows.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { chromium } from "playwright-core";

import { disablePasskeys } from "./no-passkeys.ts";

import type { BootData, PluginPayload, ThemePayload } from "../src/shared/ipc";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "test-results");
mkdirSync(OUT, { recursive: true });

// CHROME_PATH overrides (CI sets it); otherwise the usual Windows install locations
const CHROME_PATHS = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const plugins: PluginPayload[] = readdirSync(join(DIST, "plugins")).map(id => {
    const dir = join(DIST, "plugins", id);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    return { manifest, code: readFileSync(join(dir, "index.js"), "utf8"), source: "dev" };
});
// An enabled plugin that uses context menus, so the menu props patch is registered at boot like it
// would be for a user with such a plugin (it's skipped entirely otherwise)
plugins.push({
    manifest: { id: "menu-user", name: "Menu User", enabledByDefault: true },
    code: "module.exports = { default: { start(ctx) { ctx.onDispose(ctx.contextMenu(\"__none__\", () => { })); } } };",
    source: "dev",
});
// Fails to start on purpose, for the crash report. Its error logs are expected, see BROKEN below.
const BROKEN = "Broken Plugin";
plugins.push({
    manifest: { id: "broken", name: BROKEN, version: "0.0.1", enabledByDefault: true },
    code: "module.exports = { default: { start() { throw new Error(\"kaboom\"); } } };",
    source: "dev",
});

const boot: BootData = {
    version: "test",
    dataDir: "C:/fake",
    settings: { quickCss: true, plugins: { experiments: { enabled: true } }, enabledThemes: [] },
    plugins,
    quickCss: "",
    themes: [{
        file: "web-test.css",
        name: "Web Test",
        description: "Paints a marker property so the test can see it",
        author: "Evi",
        version: "1.0.0",
        css: ":root { --dl-test-theme: on; }",
    } satisfies ThemePayload],
};

const renderer = readFileSync(join(DIST, "core", "renderer.js"), "utf8");

/** Runs in the page before Discord: stands in for the preload bridge */
function fakeNative(bootData: BootData) {
    if (window !== window.top) return;
    const pluginListeners: ((change: unknown) => void)[] = [];
    const themeListeners: ((change: unknown) => void)[] = [];
    (window as any).__test = { pluginListeners, themeListeners, savedSettings: null, nativeCalls: [] as unknown[], storeInstalls: [] as unknown[], themeInstalls: [] as unknown[], stars: [] as unknown[], bootOk: 0, exitedSafeMode: 0 };
    (window as any).EviNative = {
        boot: () => structuredClone(bootData),
        saveSettings: async (s: unknown) => void ((window as any).__test.savedSettings = s),
        saveSettingsSync: (s: unknown) => void ((window as any).__test.savedSettings = structuredClone(s)),
        saveQuickCss: async () => { },
        saveQuickCssSync: () => { },
        reportBootOk: () => void (window as any).__test.bootOk++,
        exitSafeMode: async () => void (window as any).__test.exitedSafeMode++,
        onQuickCssChange: () => { },
        onPluginChange: (cb: (c: unknown) => void) => void pluginListeners.push(cb),
        onThemeChange: (cb: (c: unknown) => void) => void themeListeners.push(cb),
        // Like main: refuse non-https, otherwise "download" a theme and announce it before resolving
        addThemeFromUrl: async (url: string) => {
            if (!url.startsWith("https://")) return { ok: false, error: "Only https:// links are allowed" };
            const theme = { file: "remote.css", name: "Remote Theme", css: ":root { --dl-remote-theme: on; }" };
            themeListeners.forEach(cb => cb({ type: "upsert", theme }));
            return { ok: true, file: theme.file };
        },
        // Plugin store: a small registry, one plugin installed, one with an update, one native
        storeList: async () => {
            const file = (id: string, name: string) => ({ url: `https://example.com/${id}/${name}`, sha256: "0".repeat(64) });
            const entry = (id: string, name: string, description: string, version: string, native = false, tags: string[] = [], extra: object = {}) => ({
                id, name, description, authors: ["Evi"], version, tags, native, minEviVersion: "0.1.0", screenshots: [], changelog: [],
                files: { "manifest.json": file(id, "manifest.json"), "index.js": file(id, "index.js"), ...(native ? { "native.js": file(id, "native.js") } : {}) },
                ...extra,
            });
            const theme = (id: string, name: string, description: string) => ({
                id, name, description, authors: ["Evi"], version: "1.0.0", tags: ["dark"], screenshots: [], changelog: [], file: file(id, `${id}.css`),
            });
            return {
                ok: true,
                registryUrl: "https://raw.githubusercontent.com/BleedDev/evi/main/registry.json",
                problems: [],
                plugins: [
                    entry("store-clock", "Message Clock", "Shows the exact send time next to every message.", "1.0.0", false, ["messages"], {
                        updatedAt: "2026-09-01",
                        source: "https://github.com/BleedDev/evi",
                        screenshots: ["https://example.com/store-clock/shot.png"],
                        changelog: [{ version: "1.0.0", notes: ["First release, with 12 and 24 hour clocks"] }],
                    }),
                    entry("store-quiet", "Quiet Mode", "Hides typing indicators and read states until you ask for them.", "1.3.0", false, ["privacy"], {
                        updatedAt: "2026-09-20",
                        changelog: [{ version: "1.3.0", notes: ["Read states too"] }, { version: "1.2.0", notes: ["Typing indicators"] }],
                    }),
                    entry("store-rpc", "Local RPC", "Exposes a local API so other apps can read your current channel.", "0.4.0", true, ["integration"]),
                    entry("store-theme-sync", "Theme Sync", "Follows your system's light and dark mode.", "2.1.0"),
                ],
                themes: [
                    theme("midnight", "Midnight", "True black for OLED screens."),
                    theme("paper", "Paper", "Soft light greys."),
                ],
                installed: [{ id: "store-quiet", version: "1.2.0", fromStore: true }, { id: "store-theme-sync", version: "2.1.0", fromStore: true }],
                installedThemes: [],
            };
        },
        storeInstallTheme: async (id: string) => {
            (window as any).__test.themeInstalls.push(id);
            const theme = { file: `${id}.css`, name: id[0].toUpperCase() + id.slice(1), version: "1.0.0", css: `:root { --dl-store-theme: ${id}; }` };
            themeListeners.forEach(cb => cb({ type: "upsert", theme }));
            return { ok: true, id, version: "1.0.0" };
        },
        storeUninstallTheme: async (id: string) => {
            themeListeners.forEach(cb => cb({ type: "remove", file: `${id}.css` }));
            return { ok: true, id, version: "1.0.0" };
        },
        // Stars: counts for two plugins, this install starred Quiet Mode
        getStars: async () => ({ ok: true, counts: { "plugin:store-clock": 41, "plugin:store-quiet": 7 }, mine: ["plugin:store-quiet"] }),
        setStar: async (kind: string, id: string, starred: boolean) => {
            (window as any).__test.stars.push({ kind, id, starred });
            return { ok: true, starred, count: id === "store-clock" ? (starred ? 42 : 41) : 0 };
        },
        // A 1x1 PNG, like main hands back after checking the registry lists the URL
        storeImage: async (url: string) => url.startsWith("https://example.com/")
            ? { ok: true, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
            : { ok: false, error: "That image isn't in the store" },
        storeInstall: async (id: string, options?: { allowNative?: boolean; }) => {
            (window as any).__test.storeInstalls.push({ id, options });
            if (id === "store-rpc" && !options?.allowNative) return { ok: false, error: "Needs confirmation" };
            const plugin = { source: "user", manifest: { id, name: id, version: "9.9.9" }, code: "module.exports = { default: {} };" };
            pluginListeners.forEach(cb => cb({ type: "upsert", plugin }));
            return { ok: true, id, version: id === "store-quiet" ? "1.3.0" : "1.0.0" };
        },
        storeUninstall: async (id: string) => ({ ok: true, id, version: "1.0.0" }),
        onStoreProgress: () => { },
        callNative: async (...args: unknown[]) => ((window as any).__test.nativeCalls.push(args), 42),
        setNativeRunning: async () => { },
        // Backup: main's dialogs and file IO, answered with a fixed backup that turns the test theme on
        exportBackup: async () => ({ ok: true, path: "C:\\Users\\you\\Documents\\evi-backup-2026-09-26.json" }),
        openBackup: async () => {
            const preview = (mode: string) => ({
                mode,
                pluginsEnabled: ["Toolkit Demo"],
                pluginsDisabled: mode === "replace" ? ["Clear URLs"] : [],
                pluginSettingsChanged: ["Smooth Typing"],
                missingPlugins: [{ id: "spotify-controls", name: "Spotify Controls", source: "user", enabled: true }],
                themesAdded: ["midnight.css"],
                themesOverwritten: ["web-test.css"],
                themesEnabled: ["web-test.css"],
                themesDisabled: [],
                quickCss: mode === "replace" ? "replaced" : "kept",
                changes: 7,
            });
            return {
                ok: true,
                token: "test-token",
                fileName: "evi-backup-2026-09-20.json",
                createdAt: "2026-09-20T18:42:00.000Z",
                eviVersion: "0.1.0",
                previews: { merge: preview("merge"), replace: preview("replace") },
            };
        },
        applyBackup: async (token: string, mode: string) => {
            const current = (window as any).Evi.settings.data;
            const settings = { ...structuredClone(current), enabledThemes: [...current.enabledThemes, "web-test.css"] };
            (window as any).__test.applied = { token, mode };
            return { ok: true, settings, preview: { changes: 7 } };
        },
        openPath: async () => "",
        relaunch: async () => { },
    };
}


const results: { name: string; ok: boolean; detail?: unknown; }[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
    results.push({ name, ok, detail });
    console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${name}\x1b[0m${detail !== undefined ? `  \x1b[2m${JSON.stringify(detail)}\x1b[0m` : ""}`);
}

const browser = await chromium.launch({
    executablePath: CHROME_PATHS.find(p => !!p && existsSync(p)),
    headless: !process.argv.includes("--headed"),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const eviErrors: string[] = [];
page.on("console", msg => {
    const text = msg.text();
    if (text.includes("Evi")) {
        if (msg.type() === "error") eviErrors.push(text);
        if (process.argv.includes("--verbose") || msg.type() !== "log") console.log(`  [page ${msg.type()}] ${text.replace(/%c/g, "").slice(0, 300)}`);
    }
});
page.on("pageerror", err => eviErrors.push(`pageerror: ${err.message}`));

// Before anything else: discord.com would otherwise pop a Windows passkey dialog on the desktop
await page.addInitScript(disablePasskeys);
await page.addInitScript(fakeNative, boot);
await page.addInitScript(renderer);
await page.goto("https://discord.com/login", { waitUntil: "domcontentloaded" });

// ---- core ---------------------------------------------------------------------------------------

await page.waitForFunction(() => (window as any).Evi?.plugins.getSnapshot().some((p: any) => p.running), null, { timeout: 60_000 });

const core = await page.evaluate(() => {
    const D = (window as any).Evi;
    const { api } = D;
    return {
        wreq: !!D.wreq,
        factories: Object.keys(D.wreq.m).length,
        loaded: Object.keys(D.wreq.c).length,
        react: api.React.version,
        createRoot: typeof api.createRoot,
        dispatcherSubs: Object.keys(api.Dispatcher._subscriptions ?? {}).length,
        userStore: typeof api.getStore("UserStore")?.getCurrentUser,
        running: D.plugins.getSnapshot().filter((p: any) => p.running).map((p: any) => p.manifest.id),
    };
});
check("captured __webpack_require__", core.wreq, { factories: core.factories, loaded: core.loaded });
check("found React", typeof core.react === "string", core.react);
check("found createRoot", core.createRoot === "function");
check("found Flux dispatcher", core.dispatcherSubs > 10, { subscriptions: core.dispatcherSubs });
check("found UserStore by name", core.userStore === "function");
check("enabled plugins started", ["clear-urls", "experiments", "no-track"].every(id => core.running.includes(id)), core.running);

// ---- flux ---------------------------------------------------------------------------------------

const flux = await page.evaluate(async () => {
    const { Dispatcher } = (window as any).Evi.api;
    let got: unknown = null;
    const handler = (a: any) => void (got = a.value);
    Dispatcher.subscribe("EVI_TEST", handler);
    await Dispatcher.dispatch({ type: "EVI_TEST", value: 7 });
    Dispatcher.unsubscribe("EVI_TEST", handler);
    return got;
});
check("flux subscribe + dispatch", flux === 7);

// ---- source patch -------------------------------------------------------------------------------

const patch = await page.evaluate(() => {
    const D = (window as any).Evi;
    const diag = D.diagnosePatches().find((d: any) => d.plugin === "experiments");
    let isDeveloper: unknown;
    try {
        isDeveloper = D.api.getStore("DeveloperExperimentStore").isDeveloper;
    } catch (e) {
        isDeveloper = String(e);
    }
    return { health: diag?.health, modules: diag?.modules, errors: diag?.errors, isDeveloper };
});
check("experiments source patch applied", patch.health === "applied", patch);
check("DeveloperExperimentStore.isDeveloper is true", patch.isDeveloper === true);

// ---- export hooks -------------------------------------------------------------------------------

const hooks = await page.evaluate(async () => {
    const { api, plugins } = (window as any).Evi;
    // MessageActions may be lazy on the login page, load it the way Discord would
    let actions = api.findByProps("sendMessage", "editMessage");
    if (!actions) {
        const [id] = api.findModuleIds("sendMessage(", "editMessage(");
        if (id) api.requireModule(id);
        actions = api.findByProps("sendMessage", "editMessage");
    }
    if (!actions) return { found: false };

    const hookedByPlugin = api.getUnhooked(actions.sendMessage) !== actions.sendMessage;

    // Instead-hook so nothing hits the network; clear-urls' before-hook still runs first
    let captured: any;
    const unhook = api.hook(actions, "sendMessage", "instead", (ctx: any) => {
        captured = ctx.args[1].content;
        return Promise.resolve();
    }, "test");
    await actions.sendMessage("0", { content: "look https://example.com/a?utm_source=x&id=5&si=abc ok" });
    unhook();

    await plugins.setEnabled("clear-urls", false);
    const restored = api.getUnhooked(actions.sendMessage) === actions.sendMessage;
    await plugins.setEnabled("clear-urls", true);
    const rehooked = api.getUnhooked(actions.sendMessage) !== actions.sendMessage;

    return { found: true, hookedByPlugin, captured, restored, rehooked };
});
check("clear-urls hooked sendMessage", !!hooks.found && !!hooks.hookedByPlugin, hooks);
check("before-hook rewrote the message", hooks.captured === "look https://example.com/a?id=5 ok", hooks.captured);
check("disabling restores the original function", !!hooks.restored);
check("re-enabling hooks again", !!hooks.rehooked);

// ---- hot reload ---------------------------------------------------------------------------------

const hot = await page.evaluate(async () => {
    const { plugins } = (window as any).Evi;
    const test = (window as any).__test;
    const payload = {
        source: "dev",
        manifest: { id: "hot-test", name: "Hot Test", enabledByDefault: true },
        code: `module.exports = { default: { start(ctx) { window.__hotVersion = 1; ctx.onDispose(() => window.__hotDisposed = (window.__hotDisposed || 0) + 1); } } };`,
    };
    test.pluginListeners.forEach((cb: any) => cb({ type: "upsert", plugin: payload }));
    await new Promise(r => setTimeout(r, 50));
    const v1 = (window as any).__hotVersion;

    payload.code = payload.code.replace("__hotVersion = 1", "__hotVersion = 2");
    test.pluginListeners.forEach((cb: any) => cb({ type: "upsert", plugin: payload }));
    await new Promise(r => setTimeout(r, 50));
    const v2 = (window as any).__hotVersion;
    const disposedOnReload = (window as any).__hotDisposed;

    test.pluginListeners.forEach((cb: any) => cb({ type: "remove", id: "hot-test" }));
    return { v1, v2, disposedOnReload, disposedTotal: (window as any).__hotDisposed, stillListed: !!plugins.get("hot-test") };
});
check("hot reload swaps plugin code live", hot.v1 === 1 && hot.v2 === 2, hot);
check("old instance disposed on reload and removal", hot.disposedOnReload === 1 && hot.disposedTotal === 2 && !hot.stillListed);

// ---- live module replacement --------------------------------------------------------------------

const live = await page.evaluate(async () => {
    const { plugins, api, wreq } = (window as any).Evi;
    const test = (window as any).__test;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Any loaded module that just exports a URL constant: side-effect free, safe to re-run
    let target: { id: string; key: string; url: string; } | undefined;
    for (const id in wreq.c) {
        const src = Function.prototype.toString.call(wreq.m[id]);
        const m = src.match(/^\d+\(e,t,n\)\{(?:"use strict";)?n\.d\(t,\{(\w+):\(\)=>(\w)\}\);(?:let|var|const) \2="(https:\/\/[\w.\/-]+)"\}$/);
        if (m && api.findModuleIds(`"${m[3]}"`).length === 1) {
            target = { id, key: m[1], url: m[3] };
            break;
        }
    }
    if (!target) return { found: false };

    const exportsObject = wreq.c[target.id].exports;
    const before = exportsObject[target.key];
    const payload = {
        source: "dev",
        manifest: { id: "live-test", name: "Live Test", enabledByDefault: true },
        code: `module.exports = { default: { patches: [{ find: ${JSON.stringify(`"${target.url}"`)}, replace: { match: ${JSON.stringify(target.url)}, with: "https://evi.invalid/live" } }] } };`,
    };

    test.pluginListeners.forEach((cb: any) => cb({ type: "upsert", plugin: payload }));
    await sleep(50);
    const after = exportsObject[target.key];
    const needsReload = plugins.get("live-test").needsReload;
    const sameObject = wreq.c[target.id].exports === exportsObject;

    await plugins.setEnabled("live-test", false);
    const reverted = exportsObject[target.key];
    test.pluginListeners.forEach((cb: any) => cb({ type: "remove", id: "live-test" }));

    // Unsafe module: experiments patches a Flux store, which must not be re-run
    const experiments = plugins.get("experiments");
    return { found: true, target, before, after, reverted, needsReload, sameObject, storeReason: experiments.reloadReason ?? null };
});
check("found a safe loaded module to live-patch", !!live.found, live.target);
check("source patch applied live, no reload", live.after === "https://evi.invalid/live" && live.needsReload === false && !!live.sameObject, live);
check("disabling reverts the module live", live.reverted === live.before);

// ---- smooth typing ------------------------------------------------------------------------------

// The draft store ignores drafts while logged out, so watch what reaches Discord's subscribers
const drafts = await page.evaluate(async () => {
    const { api } = (window as any).Evi;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const received: string[] = [];
    const onDraft = (a: any) => received.push(a.draft);
    api.Dispatcher.subscribe("DRAFT_CHANGE", onDraft);
    const change = (draft: string) => api.Dispatcher.dispatch({ type: "DRAFT_CHANGE", channelId: "424242", draftType: 0, draft });

    change("a");
    change("ab");
    change("abc");
    const immediately = [...received];
    await sleep(400);
    const afterPause = [...received];

    change("abcd");
    api.Dispatcher.dispatch({ type: "DRAFT_CLEAR", channelId: "424242", draftType: 0 });
    await sleep(400);
    const afterClear = [...received];
    api.Dispatcher.unsubscribe("DRAFT_CHANGE", onDraft);
    return { immediately, afterPause, afterClear };
});
check("smooth-typing batches draft updates until a pause", drafts.immediately.length === 0 && JSON.stringify(drafts.afterPause) === '["abc"]', drafts);
check("clearing a draft cancels pending updates (no stale draft after sending)", JSON.stringify(drafts.afterClear) === '["abc"]', drafts.afterClear);

// ---- native bridge ------------------------------------------------------------------------------

const native = await page.evaluate(async () => {
    const state = (window as any).Evi.plugins.get("no-track");
    return { result: await state.ctx.native.call("getBlockedCount"), calls: (window as any).__test.nativeCalls };
});
check("ctx.native.call reaches the bridge", native.result === 42 && native.calls[0]?.[0] === "no-track", native);

// ---- toolkit: toasts, context menus, slash commands ---------------------------------------------

await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://discord.com" });

const toolkit = await page.evaluate(async () => {
    const { api, plugins, toolkit, diagnosePatches } = (window as any).Evi;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    // Modules the login page may not have run yet: run them the way Discord would
    const load = (filter: any, ...code: string[]) => {
        let found = api.findExport(filter);
        if (!found) {
            for (const id of api.findModuleIds(...code)) api.requireModule(id);
            found = api.findExport(filter);
        }
        return found;
    };
    // Discord shows one toast at a time and queues the rest: dismiss each once seen
    const popToast = api.find(api.filters.byCode("queuedToastsMap.get("));
    const toastText = async (text: string) => {
        for (let i = 0; i < 30; i++) {
            const el = [...document.querySelectorAll('[role="status"]')].find(e => e.textContent?.includes(text));
            if (el) {
                popToast?.();
                return { text: el.textContent, type: el.getAttribute("data-type") };
            }
            await sleep(100);
        }
        return null;
    };

    // Toasts
    const toastModule = load(toolkit.filters.showToast, ".currentToastMap.has(");
    const shown = api.showToast("Evi toast test", { type: "success" });
    const toast = await toastText("Evi toast test");

    // Context menus: Discord's Menu, its item components, and the core navId patch
    const menu = load(toolkit.filters.menu, "Menu API only allows Items");
    const components = toolkit.resolveMenuComponents() ?? {};
    const componentKinds = Object.entries(components).filter(([, v]) => typeof v === "function").map(([k]) => k);
    // A menu module from the main bundle: loading it runs it through the navId patch
    const [menuUserId] = api.findModuleIds('navId:"clean-up-inactive-gdms"');
    if (menuUserId) api.requireModule(menuUserId);
    const navPatch = diagnosePatches().find((d: any) => d.plugin === "evi");
    // The same rewrite over every registered factory with a navId, loaded or not: it must always compile
    const rewrite = { modules: 0, injected: 0, compileErrors: [] as string[], sample: "", menuDestructuringKept: false };
    for (const id in (window as any).Evi.wreq.m) {
        const src = api.functionSource(api.getWreq().m[id]);
        if (!src.includes("navId:")) continue;
        rewrite.modules++;
        const code = src.replace(/^(?:[\w$]+|"(?:[^"\\]|\\.)*")(?=\s*\()/, "function");
        const next = toolkit.rewriteMenuArgs(code);
        if (next === code) continue;
        rewrite.injected += next.split("eviMenuArgs:arguments[0],navId:").length - 1;
        try {
            (0, eval)(`0,${next}`);
        } catch (err) {
            rewrite.compileErrors.push(`${id}: ${err}`);
        }
        if (id === menuUserId) rewrite.sample = next.match(/.{30}eviMenuArgs.{50}/)?.[0] ?? "";
        if (id === menu?.id) rewrite.menuDestructuringKept = next.includes("let{navId:t,variant:");
    }

    // Slash commands: Discord's built-in command list
    const builtIns = load(toolkit.filters.builtInCommands, '"tableflip"', '"unflip"');
    const listBefore = builtIns?.value([1], true, false).map((c: any) => c.untranslatedName) ?? [];

    await plugins.setEnabled("toolkit-demo", true);
    const running = !!plugins.get("toolkit-demo")?.running;
    const menuHooked = !!menu && api.getUnhooked(menu.exports[menu.key]) !== menu.exports[menu.key];
    const commandsHooked = !!builtIns && api.getUnhooked(builtIns.exports[builtIns.key]) !== builtIns.exports[builtIns.key];

    const list = builtIns?.exports[builtIns.key]([1], true, false) ?? [];
    const command = list.find((c: any) => c.untranslatedName === "evi");
    const shrug = list.find((c: any) => c.untranslatedName === "shrug");
    const nick = list.find((c: any) => c.untranslatedName === "nick");
    // Replies go through Discord's sendBotMessage ("Only you can see this"): capture them
    const botActions = api.findByProps("sendBotMessage", "sendMessage");
    const replies: [string, string][] = [];
    const unhookBot = botActions && api.hook(botActions, "sendBotMessage", "instead", (c: any) => void replies.push([c.args[0], c.args[1]]), "test");
    (window as any).__botReplies = replies;
    // Discord runs it as execute(options, context)
    const result = await command?.execute([{ name: "text", type: 3, value: "Command reply test" }], { channel: { id: "1" } });
    const commandToast = replies.find(r => r[1] === "Command reply test") ?? null;
    unhookBot?.();

    // Render Discord's real Menu with the context a message menu gets from the navId patch
    const root = document.createElement("div");
    document.body.appendChild(root);
    const reactRoot = api.createRoot(root);
    const Menu = menu?.exports[menu.key];
    let rendered: string[] = [];
    let copied: string | null = null;
    let copyToast = null;
    let renderError: string | null = null;
    try {
        reactRoot.render(api.React.createElement(Menu, {
            navId: "message",
            onClose: () => { },
            "aria-label": "test",
            eviMenuArgs: { message: { id: "123456789" } },
        }, api.React.createElement(components.Item, { id: "native-item", label: "Native item", action: () => { } })));
        await sleep(300);
        rendered = [...root.querySelectorAll('[role="menuitem"]')].map(e => e.textContent ?? "");
        const item = [...root.querySelectorAll('[role="menuitem"]')].find(e => e.textContent?.includes("Copy Message ID")) as HTMLElement | undefined;
        item?.click();
        copyToast = await toastText("Message ID");
        copied = await navigator.clipboard.readText().catch(e => `clipboard: ${e}`);
    } catch (err) {
        renderError = String(err);
    }
    reactRoot.unmount();
    root.remove();

    await plugins.setEnabled("toolkit-demo", false);
    const listAfter = builtIns?.exports[builtIns.key]([1], true, false).map((c: any) => c.untranslatedName) ?? [];
    const menuRestored = !!menu && api.getUnhooked(menu.exports[menu.key]) === menu.exports[menu.key];
    const commandsRestored = !!builtIns && api.getUnhooked(builtIns.exports[builtIns.key]) === builtIns.exports[builtIns.key];

    return {
        toastModule: toastModule && { id: toastModule.id, key: toastModule.key }, shown, toast,
        menu: menu && { id: menu.id, key: menu.key }, componentKinds,
        navPatch: navPatch && { health: navPatch.health, modules: navPatch.modules, errors: navPatch.errors.slice(0, 3), menuUserId },
        rewrite,
        builtIns: builtIns && { id: builtIns.id, key: builtIns.key }, listBefore,
        running, menuHooked, commandsHooked,
        command: command && { id: command.id, inputType: command.inputType, applicationId: command.applicationId, options: command.options?.length },
        shrug: shrug && { inputType: shrug.inputType, applicationId: shrug.applicationId },
        nick: nick && { inputType: nick.inputType, applicationId: nick.applicationId },
        result: result ?? null, commandToast,
        rendered, copyToast, copied, renderError,
        listAfter, menuRestored, commandsRestored,
    };
});
check("toast module found", !!toolkit.toastModule, toolkit.toastModule);
check("toast renders with Discord's toast UI", !!toolkit.shown && toolkit.toast?.type === "success", toolkit.toast);
check("Menu component found", !!toolkit.menu, toolkit.menu);
check("Menu item components resolved", ["Item", "Group", "Separator", "CheckboxItem", "RadioItem", "ControlItem"].every(k => toolkit.componentKinds.includes(k)), toolkit.componentKinds);
check("navId source patch applied, no errors", toolkit.navPatch?.health === "applied" && !!toolkit.navPatch.menuUserId && toolkit.navPatch.modules.includes(toolkit.navPatch.menuUserId) && !toolkit.navPatch.errors.length, toolkit.navPatch);
check("navId rewrite hands menus their props and compiles on every navId module", toolkit.rewrite.modules >= 5 && !toolkit.rewrite.compileErrors.length && toolkit.rewrite.sample.includes('eviMenuArgs:arguments[0],navId:"clean-up-inactive-gdms"') && toolkit.rewrite.menuDestructuringKept, toolkit.rewrite);
check("built-in commands module found", !!toolkit.builtIns && toolkit.listBefore.includes("shrug") && !toolkit.listBefore.includes("evi"), toolkit.builtIns);
check("toolkit-demo started, Menu and command list hooked", toolkit.running && toolkit.menuHooked && toolkit.commandsHooked);
check("/evi listed as a non-text built-in like /nick (Discord never sends its result)", !!toolkit.command && toolkit.command.inputType === toolkit.nick?.inputType && toolkit.command.applicationId === toolkit.nick?.applicationId && toolkit.command.inputType !== toolkit.shrug?.inputType, { command: toolkit.command, nick: toolkit.nick, shrug: toolkit.shrug });
check("/evi replies ephemerally (Only you can see this), returns nothing for Discord to send", toolkit.result == null && JSON.stringify(toolkit.commandToast) === '["1","Command reply test"]', toolkit.commandToast);
check("message menu shows the plugin's item next to Discord's", toolkit.rendered.includes("Native item") && toolkit.rendered.some((t: string) => t.includes("Copy Message ID (Evi)")), toolkit.renderError ?? toolkit.rendered);
check("menu item gets the message from menu props and copies its id", toolkit.copied === "123456789" && toolkit.copyToast?.type === "success", { copied: toolkit.copied, toast: toolkit.copyToast });
check("stopping the plugin removes its command and the command hook", !toolkit.listAfter.includes("evi") && toolkit.commandsRestored);
check("the shared Menu hook stays while another plugin still uses menus", !toolkit.menuRestored);
await page.screenshot({ path: join(OUT, "toolkit-toast.png") });

// Helpers for the plugin suites below, in the page
await page.evaluate(() => {
    const { api } = (window as any).Evi;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const popToast = api.find(api.filters.byCode("queuedToastsMap.get("));
    (window as any).__qa = {
        sleep,
        // Discord shows one toast at a time and queues the rest: dismiss each once seen
        toastText: async (text: string) => {
            for (let i = 0; i < 30; i++) {
                const el = [...document.querySelectorAll('[role="status"]')].find(e => e.textContent?.includes(text));
                if (el) {
                    popToast?.();
                    return { text: el.textContent, type: el.getAttribute("data-type") };
                }
                await sleep(100);
            }
            return null;
        },
        load: (filter: any, ...code: string[]) => {
            let found = api.findExport(filter);
            if (!found) {
                for (const id of api.findModuleIds(...code)) api.requireModule(id);
                found = api.findExport(filter);
            }
            return found;
        },
    };
});

// ---- silent-typing ------------------------------------------------------------------------------

const silent = await page.evaluate(async () => {
    const { api, plugins, toolkit, diagnosePatches } = (window as any).Evi;
    const { sleep, toastText, load } = (window as any).__qa;

    // Discord's typing actions: startTyping dispatches TYPING_START_LOCAL, whose store handler sends the request
    const typing = load(api.filters.byProps("startTyping", "stopTyping"), "TYPING_START_LOCAL", "startTyping(");
    const actions = typing?.value;
    const dispatched: string[] = [];
    const onStart = (a: any) => void dispatched.push(`start:${a.channelId}`);
    const onStop = (a: any) => void dispatched.push(`stop:${a.channelId}`);
    api.Dispatcher.subscribe("TYPING_START_LOCAL", onStart);
    api.Dispatcher.subscribe("TYPING_STOP_LOCAL", onStop);

    const untouchedBefore = !!actions && api.getUnhooked(actions.startTyping) === actions.startTyping;
    actions?.startTyping("100");
    const sentBefore = dispatched.includes("start:100");

    await plugins.setEnabled("silent-typing", true);
    const state = plugins.get("silent-typing");
    const running = !!state?.running;
    const hooked = !!actions && api.getUnhooked(actions.startTyping) !== actions.startTyping;
    actions?.startTyping("101");
    actions?.stopTyping("101");
    const blocked = !dispatched.includes("start:101");
    const stopStillSent = dispatched.includes("stop:101");

    // The "Enabled" setting lets typing through without stopping the plugin
    state?.ctx.settings.set("enabled", false);
    actions?.startTyping("102");
    const sentWhenSettingOff = dispatched.includes("start:102");
    state?.ctx.settings.set("enabled", true);

    // /silenttyping toggles the setting and says so
    const builtIns = api.findExport(toolkit.filters.builtInCommands);
    const command = builtIns?.exports[builtIns.key]([1], true, false).find((c: any) => c.untranslatedName === "silenttyping");
    const botActions = api.findByProps("sendBotMessage", "sendMessage");
    const replies: [string, string][] = [];
    const unhookBot = botActions && api.hook(botActions, "sendBotMessage", "instead", (c: any) => void replies.push([c.args[0], c.args[1]]), "test");
    const returned = await command?.execute([], { channel: { id: "1" } });
    const afterCommand = state?.ctx.settings.get("enabled");
    await command?.execute([], { channel: { id: "1" } });
    const afterSecondCommand = state?.ctx.settings.get("enabled");
    unhookBot?.();
    const commandToast = replies[0]?.[1] ?? null;
    const commandToastOn = replies[1]?.[1] ?? null;

    // Chat bar button: the source patch lands in ChannelTextAreaButtons once that module runs
    const [buttonsModule] = api.findModuleIds('"ChannelTextAreaButtons"');
    let requireError: string | null = null;
    try {
        if (buttonsModule) api.requireModule(buttonsModule);
    } catch (err) {
        requireError = String(err);
    }
    const diag = diagnosePatches().find((d: any) => d.plugin === "silent-typing");
    const self = (window as any).Evi.$("silent-typing");
    const buttons: any[] = [{ key: "emoji" }, { key: "submit" }];
    self?.injectButton(buttons, { channel: { id: "1" } });
    const injectedKeys = buttons.map(b => b?.key);

    // The button itself, with Discord's chat bar button component
    const root = document.createElement("div");
    document.body.appendChild(root);
    const reactRoot = api.createRoot(root);
    reactRoot.render(api.React.createElement(self.SilentTypingButton));
    await sleep(200);
    const button = root.querySelector('[aria-label^="Silent typing"]') as HTMLElement | null;
    const labelOn = button?.getAttribute("aria-label") ?? null;
    const discordButton = !!button && !button.classList.contains("dl-silent-typing-fallback");
    const wrapperClass = root.firstElementChild?.className ?? "";
    button?.click();
    await sleep(200);
    const labelOff = root.querySelector('[aria-label^="Silent typing"]')?.getAttribute("aria-label") ?? null;
    const settingAfterClick = state?.ctx.settings.get("enabled");
    await toastText("Silent typing");
    reactRoot.unmount();
    root.remove();

    await plugins.setEnabled("silent-typing", false);
    const restored = !!actions && api.getUnhooked(actions.startTyping) === actions.startTyping;
    actions?.startTyping("103");
    const sentAfterDisable = dispatched.includes("start:103");
    const commandRemoved = !builtIns?.exports[builtIns.key]([1], true, false).some((c: any) => c.untranslatedName === "silenttyping");
    api.Dispatcher.unsubscribe("TYPING_START_LOCAL", onStart);
    api.Dispatcher.unsubscribe("TYPING_STOP_LOCAL", onStop);

    return {
        typing: typing && { id: typing.id, key: typing.key }, untouchedBefore, sentBefore,
        running, hooked, blocked, stopStillSent, sentWhenSettingOff,
        command: !!command, afterCommand, afterSecondCommand, commandToast, commandToastOn,
        buttonsModule, requireError, patch: diag && { health: diag.health, modules: diag.modules, errors: diag.errors.slice(0, 2) }, injectedKeys,
        labelOn, labelOff, discordButton, wrapperClass, settingAfterClick,
        restored, sentAfterDisable, commandRemoved,
    };
});
check("silent-typing: Discord's typing actions found", !!silent.typing && silent.untouchedBefore && silent.sentBefore, silent.typing);
check("silent-typing: startTyping hooked and blocked while enabled, stopTyping untouched", silent.running && silent.hooked && silent.blocked && silent.stopStillSent);
check("silent-typing: the Enabled setting lets typing through when off", silent.sentWhenSettingOff);
check("silent-typing: /silenttyping toggles it and replies only to you", silent.command && silent.afterCommand === false && silent.afterSecondCommand === true && /off/.test(silent.commandToast ?? "") && /on/.test(silent.commandToastOn ?? ""), { after: [silent.afterCommand, silent.afterSecondCommand], replies: [silent.commandToast, silent.commandToastOn] });
check("silent-typing: chat bar patch applied to ChannelTextAreaButtons", !silent.requireError && silent.patch?.health === "applied" && silent.patch.modules.includes(silent.buttonsModule), { patch: silent.patch, module: silent.buttonsModule, error: silent.requireError });
check("silent-typing: button goes before the send button", JSON.stringify(silent.injectedKeys) === '["emoji","evi-silent-typing","submit"]', silent.injectedKeys);
check("silent-typing: button renders with Discord's chat button and toggles", silent.discordButton && silent.wrapperClass.startsWith("buttonContainer_") && /on/.test(silent.labelOn ?? "") && /off/.test(silent.labelOff ?? "") && silent.settingAfterClick === false, { on: silent.labelOn, off: silent.labelOff, wrapper: silent.wrapperClass });
check("silent-typing: disabling restores startTyping and removes the command", silent.restored && silent.sentAfterDisable && silent.commandRemoved);

// ---- quick-actions ------------------------------------------------------------------------------

const IMAGE_URL = "https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&is=2&hm=3";

/** Renders Discord's message menu with the props the navId patch gives it, returns the item labels */
async function renderMessageMenu(args: unknown, nativeIds: string[]) {
    return page.evaluate(async ({ args, nativeIds }) => {
        const { api, toolkit } = (window as any).Evi;
        const { sleep } = (window as any).__qa;
        const menu = api.findExport(toolkit.filters.menu);
        const Item = toolkit.resolveMenuComponents().Item;
        const Group = toolkit.resolveMenuComponents().Group;
        (window as any).__qaRoot?.unmount();
        document.getElementById("qa-root")?.remove();
        const root = document.createElement("div");
        root.id = "qa-root";
        document.body.appendChild(root);
        const reactRoot = (window as any).__qaRoot = api.createRoot(root);
        const h = api.React.createElement;
        // Discord's own items, in one group like the real message menu's Copy Text group
        reactRoot.render(h(menu.exports[menu.key], { navId: "message", onClose: () => { }, "aria-label": "test", eviMenuArgs: args },
            h(Group, null, nativeIds.map(id => h(Item, { key: id, id, label: `Native ${id}`, action: () => { } })))));
        await sleep(300);
        return [...root.querySelectorAll('[role="menuitem"]')].map(e => ({ id: e.id, text: e.textContent ?? "" }));
    }, { args, nativeIds });
}

/** Clicks a rendered menu item by label, returns the clipboard and the toast it showed */
async function clickMenuItem(label: string, toast?: string) {
    return page.evaluate(async ({ label, toast }) => {
        const { toastText } = (window as any).__qa;
        const item = [...document.querySelectorAll('#qa-root [role="menuitem"], [role="menu"] [role="menuitem"]')]
            .find(e => e.textContent === label) as HTMLElement | undefined;
        if (!item) return { clicked: false, clipboard: null, toast: null };
        item.click();
        const shown = toast ? await toastText(toast) : null;
        return { clicked: true, clipboard: await navigator.clipboard.readText().catch(e => `clipboard: ${e}`), toast: shown };
    }, { label, toast });
}

await page.evaluate(async () => {
    const w = window as any;
    w.__opened = [];
    w.__realOpen = window.open;
    window.open = ((url: string) => void w.__opened.push(url)) as any;
    await w.Evi.plugins.setEnabled("quick-actions", true);
});

const fullMessage = {
    message: {
        id: "987", channel_id: "555", content: "**hola** amigo `code`",
        attachments: [{ url: IMAGE_URL, filename: "cat.png", content_type: "image/png" }], embeds: [],
    },
    channel: { id: "555", guild_id: "444" },
};
const qaItems = await renderMessageMenu(fullMessage, ["copy-text"]);
const qaLabels = qaItems.map(i => i.text);
check("quick-actions: message menu gets all items next to Copy Text",
    ["Native copy-text", "Copy Message Link", "Copy Raw Text", "Copy Message ID", "Search Image", "Translate with Google"].every(l => qaLabels.includes(l)),
    qaLabels);

const copiedLink = await clickMenuItem("Copy Message Link", "Message link copied");
check("quick-actions: Copy Message Link copies Discord's link format", copiedLink.clipboard === "https://discord.com/channels/444/555/987" && copiedLink.toast?.type === "success", copiedLink);
const copiedRaw = await clickMenuItem("Copy Raw Text", "Raw text copied");
check("quick-actions: Copy Raw Text copies the markdown source", copiedRaw.clipboard === "**hola** amigo `code`" && copiedRaw.toast?.type === "success", copiedRaw);
const copiedId = await clickMenuItem("Copy Message ID", "Message ID copied");
check("quick-actions: Copy Message ID copies the id", copiedId.clipboard === "987" && copiedId.toast?.type === "success", copiedId);

// Search Image is a submenu: hover it to open, then pick an engine
const searchItem = qaItems.find(i => i.text === "Search Image");
await page.hover(`[id="${searchItem?.id}"]`).catch(() => { });
await page.waitForTimeout(400);
const engines = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map(e => e.textContent));
await page.screenshot({ path: join(OUT, "quick-actions-menu.png") });
// Menu re-rendered on every hover and click: items added to Discord's group must not pile up
const rawCount = await page.evaluate(() => [...document.querySelectorAll('#qa-root [role="menuitem"]')].filter(e => e.textContent === "Copy Raw Text").length);
check("quick-actions: re-renders don't duplicate items in Discord's group", rawCount === 1, rawCount);
const lens = await clickMenuItem("Google Lens");
await renderMessageMenu(fullMessage, ["copy-text"]);
await clickMenuItem("Translate with Google");
const opened: string[] = await page.evaluate(() => (window as any).__opened);
check("quick-actions: Search Image lists Google Lens, Yandex and TinEye", ["Google Lens", "Yandex", "TinEye"].every(e => engines.includes(e)), engines);
check("quick-actions: Google Lens opens the image in the browser", lens.clicked && opened[0] === `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(IMAGE_URL)}`, opened[0]);
check("quick-actions: Translate opens Google Translate with the text", !!opened[1] && new URL(opened[1]).searchParams.get("text") === "**hola** amigo `code`" && new URL(opened[1]).searchParams.get("sl") === "auto", opened[1]);

// Only what applies: no text means no raw text or translate, no image means no search, and
// Discord's own Copy Message Link / developer mode Copy Message ID aren't duplicated
const bare = (await renderMessageMenu({ message: { id: "988", channel_id: "555", content: "", attachments: [], embeds: [] }, channel: { id: "555" } }, ["copy-link", "devmode-copy-id-988"])).map(i => i.text);
check("quick-actions: items only appear when they apply", !["Copy Raw Text", "Translate with Google", "Search Image", "Copy Message Link", "Copy Message ID"].some(l => bare.includes(l)), bare);
const dm = await renderMessageMenu({ message: { id: "989", channel_id: "556", content: "", attachments: [], embeds: [] }, channel: { id: "556" } }, []);
const dmLink = await clickMenuItem("Copy Message Link", "Message link copied");
check("quick-actions: a DM message gets an @me link, in a group of its own", dm.map(i => i.text).includes("Copy Message ID") && dmLink.clipboard === "https://discord.com/channels/@me/556/989", { items: dm.map(i => i.text), link: dmLink.clipboard });

const qaStopped = await page.evaluate(async () => {
    const w = window as any;
    await w.Evi.plugins.setEnabled("quick-actions", false);
    window.open = w.__realOpen;
    return true;
});
const afterStop = (await renderMessageMenu(fullMessage, ["copy-text"])).map(i => i.text);
check("quick-actions: disabling removes its items", qaStopped && JSON.stringify(afterStop) === '["Native copy-text"]', afterStop);
await page.evaluate(() => {
    (window as any).__qaRoot?.unmount();
    document.getElementById("qa-root")?.remove();
});
// ---- message logger -----------------------------------------------------------------------------

// Logged out, MessageStore still works for a channel we "load" ourselves: dispatch Discord's own
// actions for a fake channel and check what the plugin and the store make of them
const logger = await page.evaluate(async () => {
    const { api, plugins, wreq, diagnosePatches } = (window as any).Evi;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const { Dispatcher } = api;
    const store = api.getStore("MessageStore");
    const handlersOf = () => Dispatcher._actionHandlers._dependencyGraph.getNodeData(store.getDispatchToken()).actionHandler;
    const handlers = handlersOf();
    const originals = { del: handlers.MESSAGE_DELETE, bulk: handlers.MESSAGE_DELETE_BULK, update: handlers.MESSAGE_UPDATE };

    // The accessories renderer and Discord's content renderer live in lazy chunks: load chunks until
    // both are registered, then run them the way opening a chat would: Discord's lazy "Channel"
    // route component declares the chunks it needs next to its name
    const wanted = [["channelMessageProps:{message:", "isAutomodBlockedMessage:"], ['"useMessageRenderedContent"', "hideSimpleEmbedContent"]];
    const route = /createPromise:\(\)=>Promise\.all\(\[((?:\w\.e\("\d+"\),?)+)\]\)\.then\(\w\.bind\(\w,(\d+)\)\),webpackId:\d+,name:"Channel"[,}]/;
    let chunkIds: string[] = [];
    let channelModule: string | undefined;
    for (const id of api.findModuleIds('name:"Channel"')) {
        const m = api.functionSource(wreq.m[id]).match(route);
        if (m) {
            chunkIds = [...m[1].matchAll(/"(\d+)"/g)].map((x: RegExpMatchArray) => x[1]);
            channelModule = m[2];
            break;
        }
    }
    const loadStart = performance.now();
    let chunksLoaded = 0;
    await Promise.all(chunkIds.map(id => wreq.e(id).then(() => chunksLoaded++, () => { })));
    const loadMs = Math.round(performance.now() - loadStart);
    const moduleIds = wanted.map(code => api.findModuleIds(...code)[0]);
    const requireErrors: string[] = [];
    for (const id of moduleIds) {
        try {
            if (id) api.requireModule(id);
        } catch (err) {
            requireErrors.push(String(err).slice(0, 200));
        }
    }
    const accessories = moduleIds[0] && api.findExport(api.filters.byCode(...wanted[0]));

    await plugins.setEnabled("message-logger", true);
    const state = plugins.get("message-logger");
    const log = state.definition.getLog();
    const running = !!state.running && !!log;
    const hooked = {
        del: api.getUnhooked(handlers.MESSAGE_DELETE) !== handlers.MESSAGE_DELETE,
        bulk: api.getUnhooked(handlers.MESSAGE_DELETE_BULK) !== handlers.MESSAGE_DELETE_BULK,
        update: api.getUnhooked(handlers.MESSAGE_UPDATE) !== handlers.MESSAGE_UPDATE,
        accessories: !!accessories && api.getUnhooked(accessories.exports[accessories.key]) !== accessories.exports[accessories.key],
    };

    const channelId = "777000000000000001";
    const raw = (id: string, content: string) => ({
        id, channel_id: channelId, author: { id: "555", username: "someone", discriminator: "0", avatar: null }, content,
        timestamp: new Date(Date.UTC(2026, 0, 1, 12, Number(id.slice(-2)))).toISOString(),
        edited_timestamp: null, type: 0, flags: 0, attachments: [], embeds: [], mentions: [], mention_roles: [], pinned: false, tts: false,
    });
    const ids = Array.from({ length: 15 }, (_, i) => `88800000000000${i + 10}`);
    await Dispatcher.dispatch({
        type: "LOAD_MESSAGES_SUCCESS", channelId, messages: ids.map(id => raw(id, `message ${id}`)).reverse(),
        isBefore: false, isAfter: false, hasMoreBefore: false, hasMoreAfter: false, isStale: false,
    });
    const loaded = ids.filter(id => store.getMessage(channelId, id)).length;
    const [a, b, c, d] = ids;
    const e = ids[14];

    // Other stores must still see deletes: only MessageStore keeps the message
    const seenBySubscribers: string[] = [];
    const onDelete = (x: any) => seenBySubscribers.push(x.id);
    Dispatcher.subscribe("MESSAGE_DELETE", onDelete);

    // Edit twice, then delete the same message
    await Dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: a, channel_id: channelId, content: "edited **once**", edited_timestamp: new Date().toISOString() } });
    await Dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: a, channel_id: channelId, content: "edited twice", edited_timestamp: new Date().toISOString() } });
    // An embed-only update is not an edit
    await Dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: a, channel_id: channelId, embeds: [] } });
    const edits = log.get(channelId, a)?.edits.map((x: any) => x.content);
    const storeContent = store.getMessage(channelId, a)?.content;

    await Dispatcher.dispatch({ type: "MESSAGE_DELETE", id: a, channelId });
    const keptA = { inStore: !!store.getMessage(channelId, a), deleted: log.isDeleted(channelId, a) };

    // Local deletes (ephemeral dismissals, failed sends) always go through
    await Dispatcher.dispatch({ type: "MESSAGE_DELETE", id: b, channelId, local: true });
    const localB = !!store.getMessage(channelId, b);

    // Bulk: the known one is kept, an unknown id passes through untouched
    await Dispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", ids: [c, "1"], channelId });
    const keptC = !!store.getMessage(channelId, c) && log.isDeleted(channelId, c);

    // A delete you start yourself vanishes as usual ("Ignore my own deletes" is on by default).
    // The test's instead-hook keeps the request off the network; the plugin's before-hook still runs.
    let actions = api.findByProps("deleteMessage", "editMessage", "sendMessage");
    if (!actions) {
        for (const id of api.findModuleIds("sendMessage(", "editMessage(")) api.requireModule(id);
        actions = api.findByProps("deleteMessage", "editMessage", "sendMessage");
    }
    const unhookDelete = actions && api.hook(actions, "deleteMessage", "instead", () => Promise.resolve(), "test");
    await actions?.deleteMessage(channelId, d);
    unhookDelete?.();
    await Dispatcher.dispatch({ type: "MESSAGE_DELETE", id: d, channelId });
    const selfD = { inStore: !!store.getMessage(channelId, d), logged: !!log.get(channelId, d) };
    Dispatcher.unsubscribe("MESSAGE_DELETE", onDelete);

    // Render what the accessories hook adds, inside a chat row like Discord's
    const host = document.createElement("ul");
    host.innerHTML = `<li data-list-item-id="chat-messages___chat-messages-${channelId}-${a}" id="chat-messages-${channelId}-${a}"></li>`;
    document.body.appendChild(host);
    const root = api.createRoot(host.firstElementChild);
    const render: Record<string, any> = { error: null };
    try {
        const hookedFn = accessories?.exports[accessories.key];
        const message = store.getMessage(channelId, a);
        const result = hookedFn?.({ channelMessageProps: { message, channel: { id: channelId } }, hasSpoilerEmbeds: false, hasBailedAst: false, isInteracting: false });
        const snapshot = hookedFn?.({ channelMessageProps: { message, channel: { id: channelId } }, isMessageSnapshot: true });
        const ours = result?.props?.children?.[1];
        render.appended = !!ours && result.props.children.length === 2;
        render.snapshotUntouched = !Array.isArray(snapshot?.props?.children);
        if (ours) root.render(ours);
        await sleep(300);
        const li = host.firstElementChild as HTMLElement;
        const tag = li.querySelector(".dl-ml-deleted");
        render.text = li.textContent;
        render.bold = li.querySelector(".dl-ml-version strong")?.textContent ?? null;
        render.markup = li.querySelector(".dl-ml-content")?.className ?? null;
        render.tagColor = tag && getComputedStyle(tag).color;
        render.rowBackground = getComputedStyle(li).backgroundColor;
        render.rowShadow = getComputedStyle(li).boxShadow;
    } catch (err) {
        render.error = String(err);
    }

    // Caps: 10 per channel. Deleting 10 more evicts the oldest deleted ones, which then really go
    state.ctx.settings.set("limit", 10);
    await sleep(50);
    const rest = ids.slice(4, 14);
    await Dispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", ids: rest, channelId });
    await sleep(50);
    const caps = {
        logged: log.counts(),
        evictedGoneFromStore: [a, c].map(id => !store.getMessage(channelId, id)),
        newestKept: rest.every(id => !!store.getMessage(channelId, id) && log.isDeleted(channelId, id)),
    };
    state.ctx.settings.set("limit", 50);
    // One more edit so disabling has history to hide too
    await Dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: rest[0], channel_id: channelId, content: "changed" } });
    // The first message was evicted by the cap: show a surviving one in the row instead
    const surviving = accessories?.exports[accessories.key]({ channelMessageProps: { message: store.getMessage(channelId, rest[0]), channel: { id: channelId } } });
    if (surviving) root.render(surviving.props.children[1]);
    await sleep(100);
    const beforeStop = {
        counts: log.counts(),
        rendered: !!host.querySelector(".dl-ml-deleted") && !!host.querySelector(".dl-ml-history"),
        rowBackground: getComputedStyle(host.firstElementChild!).backgroundColor,
    };

    await plugins.setEnabled("message-logger", false);
    await sleep(100);
    const handlersNow = handlersOf();
    const stopped = {
        keptGone: rest.every(id => !store.getMessage(channelId, id)),
        unhooked: handlersNow.MESSAGE_DELETE === originals.del && handlersNow.MESSAGE_DELETE_BULK === originals.bulk && handlersNow.MESSAGE_UPDATE === originals.update,
        purgeHandlerRemoved: !Object.keys(handlersNow).some(k => k.startsWith("EVI_")),
        accessoriesRestored: !!accessories && api.getUnhooked(accessories.exports[accessories.key]) === accessories.exports[accessories.key],
        logCleared: log.counts(),
        renderedGone: !host.querySelector(".dl-ml"),
        rowBackground: getComputedStyle(host.firstElementChild!).backgroundColor,
        style: !!document.getElementById("evi-plugin-message-logger"),
    };
    // With the plugin off, a delete removes the message like stock Discord
    await Dispatcher.dispatch({ type: "MESSAGE_DELETE", id: e, channelId });
    const stockDelete = !store.getMessage(channelId, e);
    root.unmount();
    host.remove();

    return {
        chunks: { total: chunkIds.length, loaded: chunksLoaded, loadMs, channelModule, moduleIds, requireErrors },
        running, hooked, loaded, first: a, edits, storeContent, keptA, localB, keptC, seenBySubscribers, selfD, render, caps, beforeStop, stopped, stockDelete,
        patches: diagnosePatches().filter((p: any) => p.plugin === "message-logger").length,
    };
});
check("message-logger: loaded the lazy accessories and content renderers", logger.chunks.moduleIds.every(Boolean) && !logger.chunks.requireErrors.length, logger.chunks);
check("message-logger: hooks MessageStore's delete/update handlers and the accessories renderer", logger.running && Object.values(logger.hooked).every(Boolean), logger.hooked);
check("message-logger: no source patches to break", logger.patches === 0);
check("MessageStore accepts a synthetic channel logged out", logger.loaded === 15, logger.loaded);
check("edits record previous versions, embed-only updates don't", JSON.stringify(logger.edits) === JSON.stringify([`message ${logger.first}`, "edited **once**"]) && logger.storeContent === "edited twice", { edits: logger.edits, store: logger.storeContent });
check("a deleted message stays in MessageStore, marked deleted", logger.keptA.inStore && logger.keptA.deleted, logger.keptA);
check("other stores and subscribers still get MESSAGE_DELETE", logger.seenBySubscribers.includes(logger.first), logger.seenBySubscribers);
check("local deletes pass through", !logger.localB);
check("bulk deletes are kept per message", logger.keptC);
check("a delete you started yourself isn't kept (Ignore my own deletes)", !logger.selfD.inStore && !logger.selfD.logged, logger.selfD);
check("accessories hook appends the log view, leaves forwarded snapshots alone", !!logger.render.appended && !!logger.render.snapshotUntouched && !logger.render.error, logger.render.error ?? undefined);
check("deleted message renders its tag, row tint and edit history", /Edited from/.test(logger.render.text ?? "") && /Deleted/.test(logger.render.text ?? "")
    && logger.render.rowBackground !== "rgba(0, 0, 0, 0)" && logger.render.rowShadow !== "none", logger.render);
check("old versions go through Discord's markdown renderer and markup class", logger.render.bold === "once" && /markup_/.test(logger.render.markup ?? ""), { bold: logger.render.bold, markup: logger.render.markup });
check("per-channel cap evicts the oldest, evicted deleted messages really go", logger.caps.logged.deleted === 10 && logger.caps.evictedGoneFromStore.every(Boolean) && logger.caps.newestKept, logger.caps);
check("disabling deletes kept messages for real and restores MessageStore's handlers", logger.stopped.keptGone && logger.stopped.unhooked && logger.stopped.purgeHandlerRemoved && logger.stopped.accessoriesRestored, logger.stopped);
check("disabling clears the log, unmounts tags and history, removes the tint", logger.beforeStop.rendered && logger.beforeStop.rowBackground !== "rgba(0, 0, 0, 0)" && logger.stopped.renderedGone && logger.stopped.logCleared.deleted + logger.stopped.logCleared.edited === 0
    && logger.stopped.rowBackground === "rgba(0, 0, 0, 0)" && !logger.stopped.style, { before: logger.beforeStop, after: logger.stopped });
check("with the plugin off, deletes behave like stock Discord", logger.stockDelete);

// ---- UI -----------------------------------------------------------------------------------------

await page.keyboard.press("Control+Shift+D");
await page.waitForSelector(".dl-panel", { timeout: 5000 });
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "ui-plugins.png") });
check("Ctrl+Shift+D opens the panel", true);

const toggled = await page.evaluate(async () => {
    // Discord's switch is a real checkbox input (checked), ours a button (aria-checked)
    const checkedOf = (el: any) => el.getAttribute("aria-checked") ?? String(el.checked);
    const sw = document.querySelector('[aria-labelledby="dl-plugin-experiments"][role="switch"]') as HTMLButtonElement;
    const before = checkedOf(sw);
    sw.click();
    await new Promise(r => setTimeout(r, 400));
    const state = (window as any).Evi.plugins.get("experiments");
    const after = checkedOf(document.querySelector('[aria-labelledby="dl-plugin-experiments"][role="switch"]'));
    return { before, after, needsReload: state.needsReload, reason: state.reloadReason, saved: (window as any).__test.savedSettings?.plugins?.experiments };
});
check("switch disables plugin and persists", toggled.before === "true" && toggled.after === "false" && toggled.saved?.enabled === false, toggled);
// Experiments patches a Flux store: re-running it would register a second store, so it must refuse
check("unsafe module (Flux store) refuses live replacement, asks for reload", toggled.needsReload && /Flux store/.test(toggled.reason ?? ""), toggled.reason);
await page.screenshot({ path: join(OUT, "ui-reload-banner.png") });

// A plugin's settings open in a dialog: the list underneath doesn't move, Escape closes only the dialog
const dialog = await page.evaluate(async () => {
    const body = document.querySelector(".dl-body") as HTMLElement;
    const row = document.querySelector('li[aria-labelledby="dl-plugin-fast-lists"]') as HTMLElement;
    body.scrollTop = row.offsetTop - 120;
    await new Promise(r => setTimeout(r, 100));
    const before = { scrollTop: body.scrollTop, rowTop: row.getBoundingClientRect().top, rowHeight: row.offsetHeight };
    (row.querySelector('[aria-label="Fast Lists settings"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 400));
    const open = document.querySelector('[role="dialog"]#dl-plugin-fast-lists-settings');
    const after = { scrollTop: body.scrollTop, rowTop: row.getBoundingClientRect().top, rowHeight: row.offsetHeight };
    return { before, after, open: !!open, fields: open?.querySelectorAll(".dl-setting, [role=switch], input").length ?? 0, focused: !!open?.contains(document.activeElement) };
});
await page.screenshot({ path: join(OUT, "ui-plugin-settings.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const afterEscape = await page.evaluate(() => ({ dialog: !!document.querySelector("#dl-plugin-fast-lists-settings"), panel: !!document.querySelector(".dl-panel") }));
check("plugin settings open in a dialog and the list doesn't move", dialog.open && dialog.fields > 0 && dialog.focused && JSON.stringify(dialog.before) === JSON.stringify(dialog.after), dialog);
check("Escape closes the settings dialog, not the Evi panel", !afterEscape.dialog && afterEscape.panel, afterEscape);

// A plugin that failed to start offers a crash report for its author
await page.locator('li[aria-labelledby="dl-plugin-broken"]').getByRole("button", { name: "Copy crash report" }).click();
await page.waitForTimeout(200);
const report = await page.evaluate(() => navigator.clipboard.readText().catch(e => `clipboard: ${e}`));
check("Copy crash report copies the error, versions and patches", report.startsWith(`Evi crash report: ${BROKEN} (broken)`) && report.includes("kaboom") && /Evi: {6}\S/.test(report) && report.includes("Other enabled plugins:"), report.slice(0, 200));
await page.locator('li[aria-labelledby="dl-plugin-broken"]').screenshot({ path: join(OUT, "ui-crash-report.png") });

// Bulk actions: everything off, then undo puts back exactly what was on
const enabledIds = () => page.evaluate(() => {
    const D = (window as any).Evi;
    return D.plugins.getSnapshot().filter((p: any) => D.settings.data.plugins[p.manifest.id]?.enabled ?? p.manifest.enabledByDefault ?? false).map((p: any) => p.manifest.id).sort();
});
const enabledBefore = await enabledIds();
await page.getByRole("group", { name: "All plugins" }).getByRole("button", { name: "Turn all off" }).click();
await page.waitForSelector("#dl-bulk-undo", { timeout: 5000 });
const enabledAfterOff = await enabledIds();
const undoText = await page.evaluate(() => document.querySelector("#dl-bulk-undo")?.closest(".dl-notice")?.textContent ?? "");
check("Turn all off turns every plugin off and offers undo", enabledAfterOff.length === 0 && enabledBefore.length > 0 && undoText.includes(`Turned off ${enabledBefore.length} plugins`), { enabledBefore, enabledAfterOff, undoText });
await page.screenshot({ path: join(OUT, "ui-bulk-undo.png") });
await page.click("#dl-bulk-undo");
await page.waitForTimeout(500);
const enabledAfterUndo = await enabledIds();
check("Undo turns the same plugins back on", JSON.stringify(enabledAfterUndo) === JSON.stringify(enabledBefore), enabledAfterUndo);

await page.click("#dl-tab-patches");
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "ui-patches.png") });

await page.click("#dl-tab-quickcss");
await page.fill("#dl-quickcss", "body { outline: 3px solid rgb(255, 0, 128) !important; }");
await page.waitForTimeout(500);
const quickCss = await page.evaluate(() => getComputedStyle(document.body).outlineColor);
check("Quick CSS applies live", quickCss === "rgb(255, 0, 128)", quickCss);
await page.screenshot({ path: join(OUT, "ui-quickcss.png") });

// Patch Helper: develop the experiments plugin's own patch live against Discord's code
await page.click("#dl-tab-patchhelper");
await page.fill("#dl-ph-find", "Object.defineProperties(this,{isDeveloper");
await page.fill("#dl-ph-match", String.raw`/(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/`);
await page.fill("#dl-ph-replace", "true");
await page.waitForFunction(() => {
    const status = document.querySelector("#dl-tabpanel [role=status]")?.textContent ?? "";
    return status.startsWith("Checked") && document.querySelector("#dl-ph-result") && !document.querySelector("[data-checking]");
}, null, { timeout: 5000 }).catch(() => { });
const helper = await page.evaluate(() => {
    const status = (id: string) => {
        const el = document.querySelector(`#${id} .dl-card-head .dl-status`);
        return { tone: el?.getAttribute("data-tone"), text: el?.textContent };
    };
    return {
        modules: status("dl-ph-modules"),
        match: status("dl-ph-match"),
        result: status("dl-ph-result"),
        after: document.querySelector("#dl-ph-result mark[data-kind=added]")?.textContent,
        snippet: document.querySelector("#dl-ph-snippet pre")?.textContent,
    };
});
check("Patch Helper: find matches exactly 1 module", helper.modules.tone === "success" && helper.modules.text === "1 module", helper.modules);
check("Patch Helper: match succeeds", helper.match.tone === "success" && /^Matched/.test(helper.match.text ?? ""), helper.match);
check("Patch Helper: patched module compiles", helper.result.tone === "success" && helper.result.text === "Compiles" && helper.after === "true", helper.result);
check("Patch Helper: copyable snippet in plugin format", !!helper.snippet?.includes(String.raw`match: /(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/,`) && !!helper.snippet?.includes('with: "true"'), helper.snippet);
await page.screenshot({ path: join(OUT, "ui-patch-helper.png") });
await page.evaluate(() => { const body = document.querySelector("#dl-tabpanel")!; body.scrollTop = body.scrollHeight; });
await page.screenshot({ path: join(OUT, "ui-patch-helper-result.png") });

await page.fill("#dl-ph-replace", "true)");
await page.waitForFunction(() => document.querySelector("#dl-ph-result .dl-status")?.textContent === "Doesn’t compile", null, { timeout: 5000 }).catch(() => { });
const broken = await page.evaluate(() => document.querySelector("#dl-ph-result .dl-error")?.textContent ?? null);
check("Patch Helper: reports a patch that breaks compilation", !!broken?.includes("SyntaxError"), broken?.slice(0, 120));

// ---- themes -------------------------------------------------------------------------------------

await page.click("#dl-tab-themes");
await page.waitForSelector("#dl-theme-web-test_css", { timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "ui-themes.png") });

// Discord's switch is a transparent checkbox under its styled track, click it the way the plugin test does
const clickThemeSwitch = () => page.evaluate(() => (document.querySelector('[aria-labelledby="dl-theme-web-test_css"][role="switch"]') as HTMLElement).click());
const themeVar = (name: string) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const themeCard = await page.evaluate(() => document.querySelector("#dl-tabpanel")!.textContent);
check("Themes tab lists the theme with its metadata", ["Web Test", "Paints a marker", "By Evi", "web-test.css"].every(t => themeCard!.includes(t)));
check("disabled theme isn't applied", (await themeVar("--dl-test-theme")) === "");

await clickThemeSwitch();
await page.waitForTimeout(300);
const themeOn = {
    value: await themeVar("--dl-test-theme"),
    saved: await page.evaluate(() => (window as any).__test.savedSettings?.enabledThemes),
    beforeQuickCss: await page.evaluate(() => document.getElementById("evi-theme-web-test.css")?.nextElementSibling?.id),
};
check("switch applies the theme and persists it", themeOn.value === "on" && themeOn.saved?.includes("web-test.css"), themeOn);
check("theme is inserted before Quick CSS", themeOn.beforeQuickCss === "evi-quickcss", themeOn.beforeQuickCss);

await page.evaluate(() => (window as any).__test.themeListeners.forEach((cb: any) => cb({
    type: "upsert",
    theme: { file: "web-test.css", name: "Web Test", css: ":root { --dl-test-theme: edited; }" },
})));
await page.waitForTimeout(100);
check("editing the theme file restyles live", (await themeVar("--dl-test-theme")) === "edited");

await clickThemeSwitch();
await page.waitForTimeout(300);
check("switching it off removes the theme", (await themeVar("--dl-test-theme")) === "" && !(await page.$('[id="evi-theme-web-test.css"]')));

await page.fill("#dl-theme-url", "http://example.com/theme.css");
await page.getByRole("button", { name: "Add from URL" }).click();
await page.waitForTimeout(200);
const refused = await page.evaluate(() => document.querySelector(".dl-add-status")?.textContent);
check("Add from URL shows why a link was refused", refused === "Only https:// links are allowed", refused);

await page.fill("#dl-theme-url", "https://example.com/theme.css");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const added = {
    status: await page.evaluate(() => document.querySelector(".dl-add-status")?.textContent),
    value: await themeVar("--dl-remote-theme"),
    listed: !!(await page.$("#dl-theme-remote_css")),
};
check("Add from URL lists the theme and turns it on", added.value === "on" && added.listed && /Remote Theme/.test(added.status ?? ""), added);
await page.screenshot({ path: join(OUT, "ui-themes-added.png") });

// ---- backup -------------------------------------------------------------------------------------

await page.click("#dl-tab-backup");
await page.getByRole("button", { name: "Export backup" }).click();
await page.waitForTimeout(200);
const exportStatus = await page.evaluate(() => document.querySelector("#dl-tabpanel [role=status]")?.textContent);
check("Backup: export reports where it saved", exportStatus === "Saved to C:\\Users\\you\\Documents\\evi-backup-2026-09-26.json", exportStatus);

await page.getByRole("button", { name: "Choose backup file" }).click();
await page.waitForSelector(".dl-backup-preview", { timeout: 5000 });
await page.waitForTimeout(200);
const backupPreview = await page.evaluate(() => document.querySelector(".dl-backup-preview")?.textContent ?? "");
check("Backup: preview shows the file and what changes", [
    "evi-backup-2026-09-20.json", "with Evi v0.1.0", "Turns on 1 plugin: Toolkit Demo", "Overwrites 1 theme",
    "Keeps your Quick CSS", "Spotify Controls", "plugins/spotify-controls", "Merge backup",
].every(t => backupPreview.includes(t)), backupPreview.slice(0, 300));
await page.screenshot({ path: join(OUT, "ui-backup.png") });

await page.getByRole("button", { name: "Merge backup" }).click();
await page.waitForTimeout(300);
const restored = {
    applied: await page.evaluate(() => (window as any).__test.applied),
    status: await page.evaluate(() => [...document.querySelectorAll("#dl-tabpanel [role=status]")].map(e => e.textContent).join(" | ")),
    theme: await themeVar("--dl-test-theme"),
    previewGone: !(await page.$(".dl-backup-preview")),
};
check("Backup: restoring applies the new settings live", restored.applied?.mode === "merge" && restored.theme === "edited" && restored.previewGone && restored.status.includes("Restored evi-backup-2026-09-20.json, 7 changes applied"), restored);
await page.screenshot({ path: join(OUT, "ui-backup-restored.png") });
// ---- store --------------------------------------------------------------------------------------

await page.click("#dl-tab-plugins");
await page.waitForSelector("#dl-open-plugin-store", { timeout: 5000 });
const bannerText = await page.evaluate(() => document.querySelector(".dl-store-banner")?.textContent ?? "");
check("Plugins tab shows the store banner with what's new", bannerText.includes("Plugin Store") && /update/.test(bannerText), bannerText);
await page.click("#dl-open-plugin-store");
await page.waitForSelector('[data-store-id="store-rpc"]', { timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "ui-store.png") });
const storeCard = (id: string) => page.evaluate(i => document.querySelector(`[data-store-id="${i}"]`)?.textContent ?? "", id);
const storeList = {
    clock: await storeCard("store-clock"),
    quiet: await storeCard("store-quiet"),
    rpc: await storeCard("store-rpc"),
    sync: await storeCard("store-theme-sync"),
};
check("Store view lists plugins with description, authors and version", storeList.clock.includes("Message Clock") && storeList.clock.includes("exact send time") && storeList.clock.includes("v1.0.0 · Evi"), storeList.clock);
check("Store shows Install, Update + Uninstall, and Installed states", /Install$/.test(storeList.clock) && storeList.quiet.includes("v1.2.0 → v1.3.0") && storeList.quiet.includes("Uninstall") && storeList.sync.includes("Installed"), storeList);

// Stars: counts on every card, one click stars, and it's sent to main
const starLabel = (id: string) => page.evaluate(i => document.querySelector(`[data-store-id="${i}"] .dl-star`)?.getAttribute("aria-label") ?? "", id);
const starsBefore = { clock: await starLabel("store-clock"), quiet: await starLabel("store-quiet") };
await page.locator('[data-store-id="store-clock"] .dl-star').click();
await page.waitForTimeout(200);
const starsAfter = { clock: await starLabel("store-clock"), calls: await page.evaluate(() => (window as any).__test.stars) };
check("Stars: cards show counts, and starring counts once and is sent to main",
    starsBefore.clock === "Star Message Clock, 41 stars" && starsBefore.quiet === "Unstar Quiet Mode, 7 stars"
    && starsAfter.clock === "Unstar Message Clock, 42 stars" && JSON.stringify(starsAfter.calls) === '[{"kind":"plugin","id":"store-clock","starred":true}]', { starsBefore, starsAfter });
await page.screenshot({ path: join(OUT, "ui-store-grid.png") });
check("native plugins carry a badge", storeList.rpc.includes("Native") && !storeList.clock.includes("Native"));

const filters = await page.evaluate(() => document.querySelector(".dl-store-filters")?.textContent ?? "");
check("Store filters by updates, installed and category, and sorts", ["All", "Updates", "Installed", "Messages", "Privacy", "Sort"].every(t => filters.includes(t)), filters);

// The card itself opens the page: click its middle, not the title
// force: the card's stretched link is what takes the click, on purpose
await page.locator('[data-store-id="store-clock"] .dl-store-card-desc').click({ force: true });
await page.waitForSelector('[data-store-detail="store-clock"]', { timeout: 2000 });
await page.getByRole("button", { name: "Plugin Store", exact: true }).click();
await page.waitForSelector('[data-store-id="store-clock"]', { timeout: 2000 });

// The detail page: description, screenshots, access, source and changelog
await page.locator('[data-store-id="store-clock"] .dl-link-button').click();
await page.waitForSelector('[data-store-detail="store-clock"] .dl-store-shot img', { timeout: 5000 });
const detail = await page.evaluate(() => document.querySelector('[data-store-detail="store-clock"]')?.textContent ?? "");
check("Store detail page shows screenshots, access, source and changelog", ["Message Clock", "exact send time", "Runs inside Discord only", "View source", "What’s new", "12 and 24 hour clocks", "Updated"].every(t => detail.includes(t)), detail.slice(0, 300));
await page.screenshot({ path: join(OUT, "ui-store-detail.png") });
await page.getByRole("button", { name: "Plugin Store", exact: true }).click();
await page.waitForSelector('[data-store-id="store-clock"]', { timeout: 2000 });

await page.fill("#dl-plugin-store-search", "privacy");
await page.waitForTimeout(150);
const searched = await page.evaluate(() => [...document.querySelectorAll("[data-store-id]")].map(e => e.getAttribute("data-store-id")));
check("Store search matches tags", JSON.stringify(searched) === '["store-quiet"]', searched);
await page.fill("#dl-plugin-store-search", "");

const storeButton = (id: string, name: string) => page.locator(`[data-store-id="${id}"]`).getByRole("button", { name, exact: true });
await storeButton("store-rpc", "Install").click();
await page.waitForSelector('[data-store-id="store-rpc"] .dl-store-confirm', { timeout: 2000 });
await page.screenshot({ path: join(OUT, "ui-store-native-confirm.png") });
const confirmText = await page.evaluate(() => document.querySelector(".dl-store-confirm")?.textContent ?? "");
const installsBeforeConfirm = await page.evaluate(() => (window as any).__test.storeInstalls.length);
check("installing a native plugin asks first, explaining full access", /full access to your computer/.test(confirmText) && installsBeforeConfirm === 0, confirmText.slice(0, 120));
await storeButton("store-rpc", "Install with full access").click();
await page.waitForTimeout(300);
const nativeInstall = {
    calls: await page.evaluate(() => (window as any).__test.storeInstalls),
    card: await storeCard("store-rpc"),
};
check("confirming installs with allowNative and shows the result", nativeInstall.calls.at(-1)?.options?.allowNative === true && nativeInstall.card.includes("Installed and turned on"), nativeInstall);

const autoUpdate = await page.evaluate(() => document.querySelector(".dl-tab")?.textContent?.includes("Update automatically"));
check("Store offers automatic updates", !!autoUpdate);
await page.click("#dl-plugin-update-all");
await page.waitForTimeout(400);
const updated = await storeCard("store-quiet");
check("Update all installs the new version", updated.includes("Updated to v1.3.0") && !updated.includes("Update available"), updated);
await page.screenshot({ path: join(OUT, "ui-store-after.png") });

// Back in the installed list, store plugins carry a badge and can be uninstalled
await page.getByRole("button", { name: "Installed plugins" }).click();
await page.waitForSelector('li[aria-labelledby="dl-plugin-store-rpc"]', { timeout: 2000 });
const rpcRow = await page.evaluate(() => document.querySelector('li[aria-labelledby="dl-plugin-store-rpc"]')?.textContent ?? "");
const rpcUninstall = await page.locator('li[aria-labelledby="dl-plugin-store-rpc"]').getByRole("button", { name: "Uninstall store-rpc" }).count();
check("store plugins show a Store badge and an uninstall button in the list", rpcRow.includes("Store") && rpcUninstall === 1, rpcRow);

// ---- theme store --------------------------------------------------------------------------------

await page.click("#dl-tab-themes");
await page.waitForSelector("#dl-open-theme-store", { timeout: 5000 });
await page.click("#dl-open-theme-store");
await page.waitForSelector('[data-store-id="midnight"]', { timeout: 5000 });
await page.screenshot({ path: join(OUT, "ui-theme-store.png") });
await page.locator('[data-store-id="midnight"]').getByRole("button", { name: "Install", exact: true }).click();
await page.waitForTimeout(400);
const themeInstall = await page.evaluate(() => ({
    calls: (window as any).__test.themeInstalls,
    card: document.querySelector('[data-store-id="midnight"]')?.textContent ?? "",
    enabled: (window as any).Evi.themes.isEnabled("midnight.css"),
    applied: getComputedStyle(document.documentElement).getPropertyValue("--dl-store-theme").trim(),
}));
check("Theme Store installs a theme and turns it on", JSON.stringify(themeInstall.calls) === '["midnight"]' && themeInstall.card.includes("Installed and turned on") && themeInstall.enabled && themeInstall.applied === "midnight", themeInstall);
await page.getByRole("button", { name: "Installed themes" }).click();
await page.waitForTimeout(200);
const themeRow = await page.evaluate(() => document.querySelector('li[aria-labelledby="dl-theme-midnight_css"]')?.textContent ?? "");
check("store themes show a Store badge in the Themes tab", themeRow.includes("Midnight") && themeRow.includes("Store"), themeRow);

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes the panel", !(await page.$(".dl-panel")));

check("healthy start reported once plugins ran for a while", await page.evaluate(() => (window as any).__test.bootOk === 1));
// The broken plugin's start failures are the point of it
const unexpected = eviErrors.filter(e => !e.includes(BROKEN));
check("no Evi errors in console", unexpected.length === 0, unexpected.slice(0, 5));

// ---- safe mode ----------------------------------------------------------------------------------

// A fresh page that main booted in safe mode, after a crash loop with a few recorded changes
const now = Date.now();
const safeBoot: BootData = {
    ...boot,
    settings: { quickCss: true, plugins: { experiments: { enabled: true } }, enabledThemes: ["web-test.css"] },
    quickCss: "body { outline: 3px solid rgb(255, 0, 128) !important; }",
    safeMode: {
        reason: "crash-loop",
        failures: 2,
        changes: [
            { kind: "plugin", id: "experiments", action: "enabled", at: now - 3 * 60_000 },
            { kind: "theme", id: "web-test.css", action: "updated", at: now - 2 * 3600_000 },
            { kind: "quickCss", id: "quick.css", action: "edited", at: now - 2 * 86400_000 },
        ],
    },
};
const safePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
safePage.on("console", msg => msg.type() === "error" && msg.text().includes("Evi") && eviErrors.push(`safe mode: ${msg.text()}`));
safePage.on("pageerror", err => eviErrors.push(`safe mode pageerror: ${err.message}`));
await safePage.addInitScript(disablePasskeys);
await safePage.addInitScript(fakeNative, safeBoot);
await safePage.addInitScript(renderer);
await safePage.goto("https://discord.com/login", { waitUntil: "domcontentloaded" });
await safePage.waitForFunction(() => (window as any).Evi?.safeMode.reportedOk && document.querySelector(".dl-safe-float"), null, { timeout: 60_000 });
await safePage.waitForTimeout(300);
await safePage.screenshot({ path: join(OUT, "safe-mode-notice.png") });

const safe = await safePage.evaluate(() => {
    const D = (window as any).Evi;
    const css = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop).trim();
    const notice = document.querySelector(".dl-safe-float .dl-safe")!;
    return {
        active: D.safeMode.active,
        running: D.plugins.getSnapshot().filter((p: any) => p.running).map((p: any) => p.manifest.id),
        evaluated: D.plugins.getSnapshot().filter((p: any) => p.definition).map((p: any) => p.manifest.id),
        listed: D.plugins.getSnapshot().length,
        patches: D.diagnosePatches().filter((d: any) => d.plugin !== "evi").length,
        theme: css(document.documentElement, "--dl-test-theme"),
        outline: css(document.body, "outline-color"),
        bootOk: (window as any).__test.bootOk,
        text: notice.textContent,
        buttons: [...notice.querySelectorAll("button")].map(b => b.textContent || b.getAttribute("aria-label")),
        labelled: document.getElementById(notice.getAttribute("aria-labelledby")!)?.textContent,
    };
});
check("safe mode: no plugin evaluated, started or patching, all still listed", safe.active && !safe.running.length && !safe.evaluated.length && !safe.patches && safe.listed === plugins.length, safe);
check("safe mode: enabled theme and Quick CSS not applied", safe.theme === "" && safe.outline !== "rgb(255, 0, 128)", { theme: safe.theme, outline: safe.outline });
check("safe mode start is still reported healthy", safe.bootOk === 1);
check("notice explains why and names the newest change that's still on", safe.labelled === "Evi is in safe mode" && safe.text.includes("last 2 times")
    && /Most recent change: Experiments \(plugin, turned on 3 minutes ago\)/.test(safe.text) && /Also changed recently:Web Test \(theme, updated 2 hours ago\)Quick CSS \(edited 2 days ago\)/.test(safe.text), safe.text);
check("notice offers disabling it and leaving safe mode", ["Disable Experiments and restart", "Exit safe mode and restart", "Hide safe mode notice"].every(b => safe.buttons.includes(b)), safe.buttons);

await safePage.getByRole("button", { name: "Hide safe mode notice" }).click();
await safePage.waitForTimeout(100);
check("notice can be hidden", !(await safePage.$(".dl-safe-float")));

await safePage.keyboard.press("Control+Shift+D");
await safePage.waitForSelector(".dl-panel .dl-safe", { timeout: 5000 });
await safePage.waitForTimeout(300);
await safePage.screenshot({ path: join(OUT, "safe-mode-plugins.png") });
const paused = await safePage.evaluate(() => document.querySelector('[aria-labelledby="dl-plugin-experiments"]')?.textContent ?? "");
check("Plugins tab repeats the notice, enabled plugins show as paused", paused.includes("Paused in safe mode"), paused);

await safePage.click("#dl-tab-themes");
await safePage.waitForTimeout(200);
const themesHint = await safePage.evaluate(() => document.querySelector("#dl-tabpanel .dl-banner")?.textContent ?? "");
check("Themes tab says themes are off in safe mode", themesHint.includes("Safe mode is on: themes aren’t applied"), themesHint);
await safePage.click("#dl-tab-plugins");
await safePage.waitForTimeout(200);

await safePage.evaluate(() => [...document.querySelectorAll(".dl-panel .dl-safe button")].find(b => b.textContent?.includes("Disable Experiments"))!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await safePage.waitForTimeout(200);
const disabled = await safePage.evaluate(() => ({ saved: (window as any).__test.savedSettings, exited: (window as any).__test.exitedSafeMode }));
check("\"Disable Experiments and restart\" saves it off right away, then leaves safe mode", disabled.saved?.plugins?.experiments?.enabled === false && disabled.exited === 1, disabled);
const unexpectedInSafeMode = eviErrors.filter(e => !e.includes(BROKEN));
check("no Evi errors in safe mode", unexpectedInSafeMode.length === 0, unexpectedInSafeMode.slice(0, 5));

await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in test-results/`);
process.exit(failed.length ? 1 : 0);
