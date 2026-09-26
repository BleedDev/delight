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
const APP_NAME = "delight-integration-test";

rmSync(BASE, { recursive: true, force: true });

// Runs as Discord's main process: opens discord.com like the real client, then inspects the page
const fakeDiscordMain = String.raw`
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
            };
        })()${"`"});
        console.log("RESULT " + JSON.stringify(result));
        app.exit(0);
    }, 16000);
});
`;

const fakeDiscordPreload = `
const { contextBridge } = require("electron");
// Not "DiscordNative": that would switch Discord's web code into desktop mode, which needs the real native APIs
contextBridge.exposeInMainWorld("__fakeDiscordPreload", { ran: true });
`;

function fakeVersion(version: string) {
    // Like Discord.exe: Electron boots resources/app (or app.asar) directly, no default_app
    cpSync(ELECTRON_DIST, join(INSTALL, `app-${version}`), { recursive: true, filter: src => !src.endsWith("default_app.asar") });
    const asar = join(INSTALL, `app-${version}`, "resources", "app.asar");
    mkdirSync(asar, { recursive: true });
    writeFileSync(join(asar, "package.json"), JSON.stringify({ name: APP_NAME, main: "index.js" }));
    writeFileSync(join(asar, "index.js"), fakeDiscordMain);
    writeFileSync(join(asar, "preload.js"), fakeDiscordPreload);
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
const timeout = setTimeout(() => proc.kill(), 60_000);
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

if (failed) {
    const delightLines = stderr.split("\n").filter(l => /delight/i.test(l)).join("\n");
    console.log(`--- stdout ---\n${stdout.slice(-2500)}\n--- stderr (Delight lines) ---\n${delightLines.slice(-4000)}`);
}
// The test app's own profile folder, created by Electron from APP_NAME
rmSync(join(process.env.APPDATA!, APP_NAME), { recursive: true, force: true });

process.exit(failed ? 1 : 0);
