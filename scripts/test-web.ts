/**
 * End-to-end check against the real, current Discord web client (logged out, headless Chrome).
 * Injects the built renderer with a fake DelightNative, then verifies the core works on Discord's
 * actual bundle: runtime capture, finders, source patches, export hooks, hot reload, and the UI.
 *
 *   node scripts/test-web.ts [--headed]
 *
 * Runs on Node (native TS type stripping): playwright's browser transports hang under Bun on Windows.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { chromium } from "playwright-core";

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
        author: "Delight",
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
    (window as any).__test = { pluginListeners, themeListeners, savedSettings: null, nativeCalls: [] as unknown[] };
    (window as any).DelightNative = {
        boot: () => structuredClone(bootData),
        saveSettings: async (s: unknown) => void ((window as any).__test.savedSettings = s),
        saveQuickCss: async () => { },
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
        callNative: async (...args: unknown[]) => ((window as any).__test.nativeCalls.push(args), 42),
        setNativeRunning: async () => { },
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

const delightErrors: string[] = [];
page.on("console", msg => {
    const text = msg.text();
    if (text.includes("Delight")) {
        if (msg.type() === "error") delightErrors.push(text);
        if (process.argv.includes("--verbose") || msg.type() !== "log") console.log(`  [page ${msg.type()}] ${text.replace(/%c/g, "").slice(0, 300)}`);
    }
});
page.on("pageerror", err => delightErrors.push(`pageerror: ${err.message}`));

// The login page calls WebAuthn, which pops a Windows Hello / passkey dialog on the desktop
await page.addInitScript(() => {
    const refuse = () => Promise.reject(new DOMException("Disabled in tests", "NotAllowedError"));
    try {
        if (navigator.credentials) {
            Object.defineProperty(navigator.credentials, "get", { value: refuse, configurable: true });
            Object.defineProperty(navigator.credentials, "create", { value: refuse, configurable: true });
        }
        const p = (window as any).PublicKeyCredential;
        if (p) {
            p.isConditionalMediationAvailable = () => Promise.resolve(false);
            p.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
        }
    } catch { }
});
await page.addInitScript(fakeNative, boot);
await page.addInitScript(renderer);
await page.goto("https://discord.com/login", { waitUntil: "domcontentloaded" });

// ---- core ---------------------------------------------------------------------------------------

await page.waitForFunction(() => (window as any).Delight?.plugins.getSnapshot().some((p: any) => p.running), null, { timeout: 60_000 });

const core = await page.evaluate(() => {
    const D = (window as any).Delight;
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
    const { Dispatcher } = (window as any).Delight.api;
    let got: unknown = null;
    const handler = (a: any) => void (got = a.value);
    Dispatcher.subscribe("DELIGHT_TEST", handler);
    await Dispatcher.dispatch({ type: "DELIGHT_TEST", value: 7 });
    Dispatcher.unsubscribe("DELIGHT_TEST", handler);
    return got;
});
check("flux subscribe + dispatch", flux === 7);

// ---- source patch -------------------------------------------------------------------------------

const patch = await page.evaluate(() => {
    const D = (window as any).Delight;
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
    const { api, plugins } = (window as any).Delight;
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
    const { plugins } = (window as any).Delight;
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
    const { plugins, api, wreq } = (window as any).Delight;
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
        code: `module.exports = { default: { patches: [{ find: ${JSON.stringify(`"${target.url}"`)}, replace: { match: ${JSON.stringify(target.url)}, with: "https://delight.invalid/live" } }] } };`,
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
check("source patch applied live, no reload", live.after === "https://delight.invalid/live" && live.needsReload === false && !!live.sameObject, live);
check("disabling reverts the module live", live.reverted === live.before);

// ---- smooth typing ------------------------------------------------------------------------------

// The draft store ignores drafts while logged out, so watch what reaches Discord's subscribers
const drafts = await page.evaluate(async () => {
    const { api } = (window as any).Delight;
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
    const state = (window as any).Delight.plugins.get("no-track");
    return { result: await state.ctx.native.call("getBlockedCount"), calls: (window as any).__test.nativeCalls };
});
check("ctx.native.call reaches the bridge", native.result === 42 && native.calls[0]?.[0] === "no-track", native);

// ---- toolkit: toasts, context menus, slash commands ---------------------------------------------

await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://discord.com" });

const toolkit = await page.evaluate(async () => {
    const { api, plugins, toolkit, diagnosePatches } = (window as any).Delight;
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
    const shown = api.showToast("Delight toast test", { type: "success" });
    const toast = await toastText("Delight toast test");

    // Context menus: Discord's Menu, its item components, and the core navId patch
    const menu = load(toolkit.filters.menu, "Menu API only allows Items");
    const components = toolkit.resolveMenuComponents() ?? {};
    const componentKinds = Object.entries(components).filter(([, v]) => typeof v === "function").map(([k]) => k);
    // A menu module from the main bundle: loading it runs it through the navId patch
    const [menuUserId] = api.findModuleIds('navId:"clean-up-inactive-gdms"');
    if (menuUserId) api.requireModule(menuUserId);
    const navPatch = diagnosePatches().find((d: any) => d.plugin === "delight");
    // The same rewrite over every registered factory with a navId, loaded or not: it must always compile
    const rewrite = { modules: 0, injected: 0, compileErrors: [] as string[], sample: "", menuDestructuringKept: false };
    for (const id in (window as any).Delight.wreq.m) {
        const src = api.functionSource(api.getWreq().m[id]);
        if (!src.includes("navId:")) continue;
        rewrite.modules++;
        const code = src.replace(/^(?:[\w$]+|"(?:[^"\\]|\\.)*")(?=\s*\()/, "function");
        const next = toolkit.rewriteMenuArgs(code);
        if (next === code) continue;
        rewrite.injected += next.split("delightMenuArgs:arguments[0],navId:").length - 1;
        try {
            (0, eval)(`0,${next}`);
        } catch (err) {
            rewrite.compileErrors.push(`${id}: ${err}`);
        }
        if (id === menuUserId) rewrite.sample = next.match(/.{30}delightMenuArgs.{50}/)?.[0] ?? "";
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
    const command = list.find((c: any) => c.untranslatedName === "delight");
    const shrug = list.find((c: any) => c.untranslatedName === "shrug");
    // Discord runs it as execute(options, context)
    const result = await command?.execute([{ name: "text", type: 3, value: "Command toast test" }], { channel: { id: "1" } });
    const commandToast = await toastText("Command toast test");

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
            delightMenuArgs: { message: { id: "123456789" } },
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
check("navId rewrite hands menus their props and compiles on every navId module", toolkit.rewrite.modules >= 5 && !toolkit.rewrite.compileErrors.length && toolkit.rewrite.sample.includes('delightMenuArgs:arguments[0],navId:"clean-up-inactive-gdms"') && toolkit.rewrite.menuDestructuringKept, toolkit.rewrite);
check("built-in commands module found", !!toolkit.builtIns && toolkit.listBefore.includes("shrug") && !toolkit.listBefore.includes("delight"), toolkit.builtIns);
check("toolkit-demo started, Menu and command list hooked", toolkit.running && toolkit.menuHooked && toolkit.commandsHooked);
check("/delight listed with Discord's built-ins", !!toolkit.command && toolkit.command.inputType === toolkit.shrug?.inputType && toolkit.command.applicationId === toolkit.shrug?.applicationId, toolkit.command);
check("/delight runs locally and shows a toast", toolkit.result === null && toolkit.commandToast?.type === "success", toolkit.commandToast);
check("message menu shows the plugin's item next to Discord's", toolkit.rendered.includes("Native item") && toolkit.rendered.some((t: string) => t.includes("Copy Message ID (Delight)")), toolkit.renderError ?? toolkit.rendered);
check("menu item gets the message from menu props and copies its id", toolkit.copied === "123456789" && toolkit.copyToast?.type === "success", { copied: toolkit.copied, toast: toolkit.copyToast });
check("stopping the plugin removes its command and the command hook", !toolkit.listAfter.includes("delight") && toolkit.commandsRestored);
check("the shared Menu hook stays while another plugin still uses menus", !toolkit.menuRestored);
await page.screenshot({ path: join(OUT, "toolkit-toast.png") });

// ---- message logger -----------------------------------------------------------------------------

// Logged out, MessageStore still works for a channel we "load" ourselves: dispatch Discord's own
// actions for a fake channel and check what the plugin and the store make of them
const logger = await page.evaluate(async () => {
    const { api, plugins, wreq, diagnosePatches } = (window as any).Delight;
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
        purgeHandlerRemoved: !Object.keys(handlersNow).some(k => k.startsWith("DELIGHT_")),
        accessoriesRestored: !!accessories && api.getUnhooked(accessories.exports[accessories.key]) === accessories.exports[accessories.key],
        logCleared: log.counts(),
        renderedGone: !host.querySelector(".dl-ml"),
        rowBackground: getComputedStyle(host.firstElementChild!).backgroundColor,
        style: !!document.getElementById("delight-plugin-message-logger"),
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
    const state = (window as any).Delight.plugins.get("experiments");
    const after = checkedOf(document.querySelector('[aria-labelledby="dl-plugin-experiments"][role="switch"]'));
    return { before, after, needsReload: state.needsReload, reason: state.reloadReason, saved: (window as any).__test.savedSettings?.plugins?.experiments };
});
check("switch disables plugin and persists", toggled.before === "true" && toggled.after === "false" && toggled.saved?.enabled === false, toggled);
// Experiments patches a Flux store: re-running it would register a second store, so it must refuse
check("unsafe module (Flux store) refuses live replacement, asks for reload", toggled.needsReload && /Flux store/.test(toggled.reason ?? ""), toggled.reason);
await page.screenshot({ path: join(OUT, "ui-reload-banner.png") });

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
check("Themes tab lists the theme with its metadata", ["Web Test", "Paints a marker", "By Delight", "web-test.css"].every(t => themeCard!.includes(t)));
check("disabled theme isn't applied", (await themeVar("--dl-test-theme")) === "");

await clickThemeSwitch();
await page.waitForTimeout(300);
const themeOn = {
    value: await themeVar("--dl-test-theme"),
    saved: await page.evaluate(() => (window as any).__test.savedSettings?.enabledThemes),
    beforeQuickCss: await page.evaluate(() => document.getElementById("delight-theme-web-test.css")?.nextElementSibling?.id),
};
check("switch applies the theme and persists it", themeOn.value === "on" && themeOn.saved?.includes("web-test.css"), themeOn);
check("theme is inserted before Quick CSS", themeOn.beforeQuickCss === "delight-quickcss", themeOn.beforeQuickCss);

await page.evaluate(() => (window as any).__test.themeListeners.forEach((cb: any) => cb({
    type: "upsert",
    theme: { file: "web-test.css", name: "Web Test", css: ":root { --dl-test-theme: edited; }" },
})));
await page.waitForTimeout(100);
check("editing the theme file restyles live", (await themeVar("--dl-test-theme")) === "edited");

await clickThemeSwitch();
await page.waitForTimeout(300);
check("switching it off removes the theme", (await themeVar("--dl-test-theme")) === "" && !(await page.$('[id="delight-theme-web-test.css"]')));

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

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes the panel", !(await page.$(".dl-panel")));

check("no Delight errors in console", delightErrors.length === 0, delightErrors.slice(0, 5));

await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in test-results/`);
process.exit(failed.length ? 1 : 0);
