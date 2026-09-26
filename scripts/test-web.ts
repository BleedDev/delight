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
