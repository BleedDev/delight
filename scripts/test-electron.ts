/**
 * Integration test of the main process + preload in real Electron, against a fake Discord install
 * that mimics the real layout. Never touches your actual Discord.
 *
 *   fake-discord/
 *     app-1.0.0/                       a copy of the Electron runtime, standing in for Discord.exe
 *     app-1.0.0/resources/_app.asar/  stand-in Discord (a folder, which Electron loads like an asar)
 *     app-1.0.0/resources/app.asar    our loader archive
 *     app-1.0.1/resources/app.asar/   a "freshly updated" version the loader should take over
 *
 *   bun scripts/test-electron.ts
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { createShimAsar, ORIGINAL_ASAR } from "../src/shared/shim";

const ROOT = resolve(import.meta.dir, "..");
const BASE = join(ROOT, "test-results", "electron");
const INSTALL = join(BASE, "fake-discord");
const DATA = join(BASE, "data");
const ELECTRON_DIST = join(ROOT, "node_modules", "electron", "dist");
// Electron derives the userData folder from the app name. Never "discord": that is the real Discord profile.
// Overridable so parallel runs (e.g. several worktrees) never share a profile. Never "discord".
const APP_NAME = process.env.DELIGHT_TEST_APP_NAME ?? "delight-integration-test";
if (APP_NAME.toLowerCase().startsWith("discord")) throw new Error("Refusing to run as a Discord app name: that is the real Discord profile");

rmSync(BASE, { recursive: true, force: true });

// Runs as Discord's main process: opens discord.com like the real client, then inspects the page
const fakeDiscordMain = String.raw`
if (process.env.FAKE_SCENARIO) return void require("./" + process.env.FAKE_SCENARIO);
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(() => {
    const win = new BrowserWindow({
        show: false,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    });
    win.loadURL("https://discord.com/login");

    // Install a plugin while running, it should appear without a reload
    setTimeout(() => {
        const dir = path.join(process.env.DELIGHT_DATA_DIR, "plugins", "late-plugin");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.js"), "module.exports = { default: { start() { window.__late = true; } } };");
        fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id: "late-plugin", name: "Late", enabledByDefault: true }));
        // And a theme, enabled in settings before it existed
        fs.writeFileSync(path.join(process.env.DELIGHT_DATA_DIR, "themes", "late.css"), "/** @name Late Theme */ :root { --delight-late-theme: live; }");
    }, 12000);

    setTimeout(async () => {
        const result = await win.webContents.executeJavaScript(${"`"}(async () => {
            const D = window.Delight;
            const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            if (!D) return { delight: false, discordNative: !!window.__fakeDiscordPreload };
            const blockedFetch = await fetch("https://discord.com/api/v9/science", { method: "POST", body: "{}" })
                .then(r => "status " + r.status, e => "blocked: " + e.message);
            const noTrack = D.plugins.get("no-track");
            // Discord's own stylesheet makes a real https CSS file to download
            const sheet = [...document.querySelectorAll("link[rel=stylesheet]")].map(l => l.href).find(h => h.startsWith("https://discord.com/assets/"));
            return {
                delight: true,
                discordNative: window.__fakeDiscordPreload?.ran === true,
                running: D.plugins.getSnapshot().filter(p => p.running).map(p => p.manifest.id),
                isDeveloper: D.api.getStore("DeveloperExperimentStore").isDeveloper,
                blockedFetch,
                blockedCount: await noTrack.ctx.native.call("getBlockedCount"),
                latePlugin: window.__late === true,
                themes: D.themes.getSnapshot().map(t => t.name),
                bootTheme: css("--delight-boot-theme"),
                offTheme: css("--delight-off-theme"),
                lateTheme: css("--delight-late-theme"),
                cssOrder: css("--delight-order"),
                styleOrder: [...document.head.querySelectorAll("style[id^=delight-theme-], #delight-quickcss")].map(s => s.id),
                addHttp: await D.themes.addFromUrl("http://example.com/theme.css"),
                addHtml: await D.themes.addFromUrl("https://discord.com/login"),
                addCss: sheet ? await D.themes.addFromUrl(sheet) : "no stylesheet on the page",
                addedStyles: [...document.head.querySelectorAll("style[id^=delight-theme-]")].length,
                // Healthy starts are reported a few seconds after plugins start, wait for it
                reportedOk: await new Promise(resolve => {
                    const deadline = Date.now() + 15000;
                    const poll = () => D.safeMode.reportedOk || Date.now() > deadline ? resolve(D.safeMode.reportedOk) : setTimeout(poll, 200);
                    poll();
                }),
            };
        })()${"`"});
        console.log("RESULT " + JSON.stringify(result));
        // Let main handle the renderer's last messages
        setTimeout(() => app.exit(0), 200);
    }, 16000);
});
`;

/**
 * Discord's main for the safe mode runs. Loads discord.com, polls FAKE_PROBE (a page expression that
 * is null until it has an answer), prints it as RESULT, then optionally runs FAKE_THEN in the page
 * (clicking a restart button). Relaunching is logged instead of done, so each start stays one process.
 */
const fakeSafeModeMain = String.raw`
const { app, BrowserWindow } = require("electron");
const path = require("path");
const log = (tag, value) => console.log(tag + " " + JSON.stringify(value));

app.relaunch = options => log("RELAUNCH", options ?? null);

app.whenReady().then(() => {
    const win = new BrowserWindow({
        show: false,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    });
    win.webContents.on("render-process-gone", (_, details) => {
        log("CRASH", details.reason);
        // Like a user whose Discord just died, starting it again: the test launches the next process
        if (process.env.FAKE_ON_CRASH === "exit") setTimeout(() => app.exit(0), 300);
    });
    win.loadURL("https://discord.com/login");

    const deadline = Date.now() + 60_000;
    let lastError = null;
    const tick = async () => {
        if (Date.now() > deadline) {
            log("RESULT", { timeout: true, lastError });
            return app.exit(0);
        }
        const wc = win.webContents;
        if (!wc.isCrashed() && !wc.isLoading()) {
            const result = await Promise.race([
                wc.executeJavaScript(process.env.FAKE_PROBE).catch(err => void (lastError = String(err))),
                new Promise(r => setTimeout(r, 2000)),
            ]);
            if (result) {
                log("RESULT", result);
                if (!process.env.FAKE_THEN) return app.exit(0);
                wc.executeJavaScript(process.env.FAKE_THEN).catch(() => { });
                // The button restarts (logged, then exits); if nothing happens, give up
                return void setTimeout(() => app.exit(0), 5000);
            }
        }
        setTimeout(tick, 500);
    };
    tick();
});
`;

/** discord.com's login page asks for passkeys, which pops a Windows Hello dialog on the desktop. Refuse them. */
function noPasskeys() {
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
}

const fakeDiscordPreload = `
const { contextBridge, webFrame } = require("electron");
// Not "DiscordNative": that would switch Discord's web code into desktop mode, which needs the real native APIs
contextBridge.exposeInMainWorld("__fakeDiscordPreload", { ran: true });
webFrame.executeJavaScript(${JSON.stringify(`(${noPasskeys})()`)});
`;

function fakeVersion(version: string) {
    // Like Discord.exe: Electron boots resources/app (or app.asar) directly, no default_app
    cpSync(ELECTRON_DIST, join(INSTALL, `app-${version}`), { recursive: true, filter: src => !src.endsWith("default_app.asar") });
    const asar = join(INSTALL, `app-${version}`, "resources", "app.asar");
    mkdirSync(asar, { recursive: true });
    writeFileSync(join(asar, "package.json"), JSON.stringify({ name: APP_NAME, main: "index.js" }));
    writeFileSync(join(asar, "index.js"), fakeDiscordMain);
    writeFileSync(join(asar, "preload.js"), fakeDiscordPreload);
    writeFileSync(join(asar, "safe-mode.js"), fakeSafeModeMain);
    return join(INSTALL, `app-${version}`, "resources");
}

const resources = fakeVersion("1.0.0");
const updated = fakeVersion("1.0.1");

// Same swap the installer does: Discord's archive becomes _app.asar, our loader takes its place
renameSync(join(resources, "app.asar"), join(resources, ORIGINAL_ASAR));
const shimAsar = join(resources, "app.asar");
writeFileSync(shimAsar, createShimAsar({ corePath: join(ROOT, "dist", "core", "main.js"), devPluginsDir: join(ROOT, "dist", "plugins") }, { name: APP_NAME }));

mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, "settings.json"), JSON.stringify({
    quickCss: true,
    plugins: { experiments: { enabled: true }, "gpu-boost": { enabled: true } },
    enabledThemes: ["boot.css", "late.css"],
}));
mkdirSync(join(DATA, "themes"));
writeFileSync(join(DATA, "themes", "boot.css"), `/**
 * @name Boot Theme
 * @author Tester
 */
:root { --delight-boot-theme: applied; --delight-order: theme; }
`);
writeFileSync(join(DATA, "themes", "off.css"), ":root { --delight-off-theme: applied; }");
// Quick CSS sets the same property as the theme and must win
writeFileSync(join(DATA, "quick.css"), ":root { --delight-order: quick; }");

const proc = Bun.spawn([join(INSTALL, "app-1.0.0", "electron.exe")], {
    env: { ...process.env, DELIGHT_DATA_DIR: DATA, ELECTRON_ENABLE_LOGGING: "1" },
    stdout: "pipe",
    stderr: "pipe",
});
// The page checks start at 16s, theme downloads may take up to 20s, the healthy start report up to 15s
const timeout = setTimeout(() => proc.kill(), 90_000);
const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
clearTimeout(timeout);

const line = stdout.split("\n").find(l => l.startsWith("RESULT "));
if (!line) {
    console.error("No result from Electron.\n--- stdout ---\n" + stdout.slice(-3000) + "\n--- stderr ---\n" + stderr.slice(-3000));
    process.exit(1);
}
const r = JSON.parse(line.slice(7));

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
    if (!ok) failed++;
    console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${name}\x1b[0m${detail !== undefined ? `  \x1b[2m${JSON.stringify(detail)}\x1b[0m` : ""}`);
}

check("main process loaded, then handed over to Discord", stdout.includes("[Delight] v"));
check("session preload booted the renderer", r.delight === true);
check("Discord's own preload still ran", r.discordNative === true);
check("plugins from the dev build started", ["clear-urls", "experiments", "no-track"].every(id => r.running?.includes(id)), r.running);
check("source patch works in Electron", r.isDeveloper === true);
check("no-track native module blocks /science", String(r.blockedFetch).startsWith("blocked") && r.blockedCount >= 1, { fetch: r.blockedFetch, count: r.blockedCount });
check("plugin dropped into the folder loads live", r.latePlugin === true);
check("auto-injected into the updated app-1.0.1", existsSync(join(updated, ORIGINAL_ASAR, "index.js"))
    && readFileSync(join(updated, "app.asar")).equals(readFileSync(shimAsar)));
check("enabled theme applied at startup", r.bootTheme === "applied", r.bootTheme);
check("theme header parsed, disabled theme listed but not applied", ["Boot Theme", "off"].every(n => r.themes?.includes(n)) && r.offTheme === "", { themes: r.themes, off: r.offTheme });
check("Quick CSS comes after themes and wins", r.cssOrder === "quick" && r.styleOrder?.at(-1) === "delight-quickcss", { value: r.cssOrder, order: r.styleOrder });
check("theme dropped into the folder applies live", r.lateTheme === "live" && r.themes?.includes("Late Theme"), r.lateTheme);
check("remote themes: http refused, web pages refused", r.addHttp?.ok === false && /https/.test(r.addHttp.error) && r.addHtml?.ok === false && /web page|html/i.test(r.addHtml.error), { http: r.addHttp, html: r.addHtml });
check("remote theme downloaded into the themes folder and turned on", r.addCss?.ok === true && existsSync(join(DATA, "themes", r.addCss.file)) && r.addedStyles === 3, { result: r.addCss, styles: r.addedStyles });
check("settings were read from the data folder", existsSync(join(DATA, "settings.json")));
check("enabled plugin's chromium switches applied at startup", stdout.includes("gpu-boost: --enable-zero-copy"));
const firstState = JSON.parse(readFileSync(join(DATA, "safe-mode.json"), "utf8"));
check("healthy start reset the crash counter, installs were recorded", firstState.pendingStarts === 0 && firstState.changes.some((c: any) => c.id === "late-plugin" && c.action === "installed"), firstState);

if (failed) {
    const delightLines = stderr.split("\n").filter(l => /delight/i.test(l)).join("\n");
    console.log(`--- stdout ---\n${stdout.slice(-2500)}\n--- stderr (Delight lines) ---\n${delightLines.slice(-4000)}`);
}

// ---- safe mode ----------------------------------------------------------------------------------
//
// Each "start" is a new Electron process against the same data folder, like restarting Discord.
// The crasher plugin crashes the renderer from its native side as soon as it starts. Its native file is
// .cjs: test-results/ sits under this repo, whose package.json makes .js files ES modules.

console.log("\nSafe mode");
const SAFE = join(BASE, "data-safe");
const crasherDir = join(SAFE, "plugins", "crasher");
mkdirSync(crasherDir, { recursive: true });
mkdirSync(join(SAFE, "themes"), { recursive: true });
writeFileSync(join(crasherDir, "manifest.json"), JSON.stringify({ id: "crasher", name: "Crasher", native: "native.cjs" }));
writeFileSync(join(crasherDir, "index.js"), `window.__crasherEvaluated = true;
module.exports = { default: { start(ctx) { ctx.native.call("crash"); } } };`);
writeFileSync(join(crasherDir, "native.cjs"), `const { webContents } = require("electron");
module.exports = {
    crash() {
        for (const wc of webContents.getAllWebContents()) if (wc.getURL().includes("discord.com")) wc.forcefullyCrashRenderer();
    },
};`);
writeFileSync(join(SAFE, "themes", "safe.css"), ":root { --delight-safe-theme: applied; }");
writeFileSync(join(SAFE, "quick.css"), ":root { --delight-safe-quick: applied; }");
writeFileSync(join(SAFE, "settings.json"), JSON.stringify({ quickCss: true, plugins: {}, enabledThemes: ["safe.css"] }));

const readJson = (file: string) => JSON.parse(readFileSync(join(SAFE, file), "utf8"));
const writeState = (patch: object) => writeFileSync(join(SAFE, "safe-mode.json"), JSON.stringify({ ...readJson("safe-mode.json"), ...patch }));

/** What the page reports once Delight says this start was healthy */
const PROBE = `(() => {
    const D = window.Delight;
    if (!D || !D.safeMode.reportedOk) return null;
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const notice = document.querySelector(".dl-safe-float .dl-safe");
    return {
        safeMode: D.safeMode.info ?? null,
        running: D.plugins.getSnapshot().filter(p => p.running).map(p => p.manifest.id),
        listed: D.plugins.getSnapshot().map(p => p.manifest.id),
        crasherEvaluated: window.__crasherEvaluated === true,
        theme: css("--delight-safe-theme"),
        quickCss: css("--delight-safe-quick"),
        notice: notice?.textContent ?? null,
        buttons: [...(notice?.querySelectorAll("button") ?? [])].map(b => b.textContent || b.getAttribute("aria-label")),
    };
})()`;
const click = (text: string) => `[...document.querySelectorAll(".dl-safe-float button")].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`;

async function start(name: string, options: { then?: string; onCrash?: "exit"; args?: string[]; probe?: string; } = {}) {
    const run = Bun.spawn([join(INSTALL, "app-1.0.0", "electron.exe"), ...options.args ?? []], {
        env: {
            ...process.env,
            DELIGHT_DATA_DIR: SAFE,
            ELECTRON_ENABLE_LOGGING: "1",
            FAKE_SCENARIO: "safe-mode.js",
            FAKE_PROBE: options.probe ?? PROBE,
            FAKE_THEN: options.then ?? "",
            FAKE_ON_CRASH: options.onCrash ?? "",
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    const kill = setTimeout(() => run.kill(), 90_000);
    const [out, err] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
    clearTimeout(kill);
    const tagged = (tag: string) => out.split("\n").filter(l => l.startsWith(tag + " ")).map(l => JSON.parse(l.slice(tag.length + 1)));
    const result = {
        // Missing result: empty lists so the checks fail instead of throwing
        result: tagged("RESULT")[0] ?? { missing: true, running: [], listed: [], buttons: [] },
        crashes: tagged("CRASH"),
        relaunch: tagged("RELAUNCH")[0],
        state: readJson("safe-mode.json"),
        log: `${out.slice(-1500)}\n${err.split("\n").filter(l => /delight/i.test(l) && !l.includes("INFO:CONSOLE")).join("\n").slice(-2500)}`,
    };
    console.log(`  \x1b[2m${name}: ${result.crashes.length} crash(es), pendingStarts ${result.state.pendingStarts}${result.state.forceSafe ? `, sticky ${result.state.forceSafe}` : ""}\x1b[0m`);
    return result;
}

// 1. Healthy start, then the user turns the crasher on: Discord dies right away
const s1 = await start("turn crasher on", { then: `Delight.plugins.setEnabled("crasher", true)`, onCrash: "exit" });
check("healthy start in normal mode: plugins, theme and Quick CSS on", s1.result?.safeMode === null && s1.result.running.includes("no-track") && s1.result.theme === "applied" && s1.result.quickCss === "applied", s1.result);
check("turning the crasher on was saved and recorded before it ran, then it crashed", s1.crashes.length === 1 && readJson("settings.json").plugins.crasher?.enabled === true
    && s1.state.changes[0]?.id === "crasher" && s1.state.changes[0]?.action === "enabled" && s1.state.pendingStarts === 0, { crashes: s1.crashes, changes: s1.state.changes });

// 2 + 3. Two starts that crash before they're healthy
const s2 = await start("crash on start 1", { onCrash: "exit" });
const s3 = await start("crash on start 2", { onCrash: "exit" });
check("starts that crash before a healthy boot are counted", s2.crashes.length === 1 && s3.crashes.length === 1 && s3.state.pendingStarts === 2, { s2: s2.state.pendingStarts, s3: s3.state.pendingStarts });

// 4. Safe mode
const s4 = await start("safe mode", { then: click("Disable Crasher and restart") });
const safe = s4.result;
check("third start is in safe mode after two failed ones", safe?.safeMode?.reason === "crash-loop" && safe.safeMode.failures === 2 && s4.crashes.length === 0, safe?.safeMode ?? safe);
check("safe mode: no plugin runs or is even evaluated, crasher still listed", safe?.running.length === 0 && !safe.crasherEvaluated && safe.listed.includes("crasher"), { running: safe?.running, evaluated: safe?.crasherEvaluated });
check("safe mode: themes and Quick CSS aren't applied", safe?.theme === "" && safe.quickCss === "", { theme: safe?.theme, quickCss: safe?.quickCss });
check("safe mode notice names the crasher and offers both ways out", /safe mode/i.test(safe?.notice ?? "") && /Most recent change: Crasher/.test(safe?.notice ?? "")
    && ["Disable Crasher and restart", "Exit safe mode and restart"].every(b => safe?.buttons.includes(b)), { notice: safe?.notice, buttons: safe?.buttons });
check("\"Disable Crasher and restart\" turns it off, leaves safe mode and restarts", s4.relaunch !== undefined && readJson("settings.json").plugins.crasher?.enabled === false
    && s4.state.pendingStarts === 0 && s4.state.forceSafe === undefined, { relaunch: s4.relaunch, state: s4.state });

// 5. Back to normal. A leftover failed start is forgotten once this one is healthy.
writeState({ pendingStarts: 1 });
const s5 = await start("normal again");
check("next start is normal and healthy, resetting the counter", s5.result?.safeMode === null && s5.result.running.includes("no-track") && !s5.result.running.includes("crasher") && s5.state.pendingStarts === 0, { safeMode: s5.result?.safeMode, pending: s5.state.pendingStarts });

// 6. --delight-safe, left with "Exit safe mode and restart"
const s6 = await start("--delight-safe", { args: ["--delight-safe"], then: click("Exit safe mode and restart") });
check("--delight-safe starts in safe mode", s6.result?.safeMode?.reason === "flag" && s6.result.running.length === 0 && s6.result.theme === "", s6.result?.safeMode);
check("the flag is for one start: not sticky, and not passed on when restarting", s6.state.forceSafe === undefined && Array.isArray(s6.relaunch?.args) && !s6.relaunch.args.includes("--delight-safe"), { relaunch: s6.relaunch, state: s6.state });

// 7. Crashes while running: the crasher is on and Discord doesn't restart, only the window dies
const settingsNow = readJson("settings.json");
writeFileSync(join(SAFE, "settings.json"), JSON.stringify({ ...settingsNow, plugins: { ...settingsNow.plugins, crasher: { enabled: true } } }));
const s7 = await start("renderer crashes while running");
check("two renderer crashes in a row switch the running Discord into safe mode", s7.crashes.length === 2 && s7.result?.safeMode?.reason === "renderer-crash" && s7.result.running.length === 0 && !!s7.result.notice, { crashes: s7.crashes, safeMode: s7.result?.safeMode });
check("that safe mode is saved for the next start", s7.state.forceSafe === "renderer-crash" && s7.state.pendingStarts === 0, s7.state);

const s8 = await start("start after the crashes");
check("next start is still in safe mode, nothing crashes", s8.result?.safeMode?.reason === "renderer-crash" && s8.crashes.length === 0 && s8.result.running.length === 0, s8.result?.safeMode);

// 8. Failing even in safe mode: one start without Delight at all
writeState({ pendingStarts: 4 });
const vanillaProbe = `(() => document.readyState === "complete" && document.querySelector("#app-mount") ? { delight: !!window.Delight, bridge: !!window.DelightNative } : null)()`;
const s9 = await start("failing even in safe mode", { probe: vanillaProbe });
check("after 4 failed starts, one start is vanilla, then safe mode again", s9.result?.delight === false && s9.result.bridge === false && s9.state.pendingStarts === 2 && s9.state.forceSafe === "renderer-crash", { result: s9.result, state: s9.state });

if (failed) {
    for (const [name, s] of Object.entries({ s1, s2, s3, s4, s5, s6, s7, s8, s9 })) console.log(`--- ${name} ---\n${s.log.slice(-1500)}`);
}
// The test app's own profile folder, created by Electron from APP_NAME
rmSync(join(process.env.APPDATA!, APP_NAME), { recursive: true, force: true });

process.exit(failed ? 1 : 0);
