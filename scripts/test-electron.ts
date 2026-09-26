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

import { parseBackup } from "../src/shared/backup";
import { createShimAsar, ORIGINAL_ASAR } from "../src/shared/shim";
import { disablePasskeys } from "./no-passkeys.ts";

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

// ---- plugin store: a local fake registry over https, never the real network ----------------------

const CERT_DIR = join(BASE, "tls");
mkdirSync(CERT_DIR, { recursive: true });
// A throwaway self-signed certificate for 127.0.0.1. The fake Discord trusts it for that host only.
const openssl = Bun.spawnSync(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
    "-keyout", join(CERT_DIR, "key.pem"), "-out", join(CERT_DIR, "cert.pem"), "-days", "2",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdout: "pipe", stderr: "pipe" });
if (openssl.exitCode !== 0) throw new Error(`openssl couldn't make a test certificate: ${openssl.stderr.toString()}`);

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const storePlugin = (version: string) => ({
    manifest: JSON.stringify({ id: "store-good", name: "Store Good", version }),
    "index.js": `module.exports = { default: { start(ctx) { window.__storeGood = "${version}"; ctx.onDispose(() => window.__storeGoodDisposed = (window.__storeGoodDisposed || 0) + 1); } } };`,
});
let goodVersion = "1.0.0";
const storeFiles: Record<string, string> = {};
const registryEntry = (id: string, version: string, files: Record<string, string>, extra: object = {}, served: Record<string, string> = files) => {
    const entry = {
        id, name: id, description: `Test plugin ${id}`, authors: ["Tester"], version, tags: ["test"], native: false, ...extra,
        files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { url: "", sha256: sha256(content) }])),
    };
    for (const [name, content] of Object.entries(served)) {
        storeFiles[`/files/${id}/${version}/${name}`] = content;
        entry.files[name].url = `https://127.0.0.1:${server.port}/files/${id}/${version}/${name}`;
    }
    return entry;
};

const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: { cert: Bun.file(join(CERT_DIR, "cert.pem")), key: Bun.file(join(CERT_DIR, "key.pem")) },
    fetch(req) {
        const { pathname } = new URL(req.url);
        if (pathname === "/__publish" && req.method === "POST") {
            goodVersion = "2.0.0";
            return new Response("ok");
        }
        if (pathname === "/registry.json") {
            const good = storePlugin(goodVersion);
            const tamperedIndex = "module.exports = { default: { start() { window.__tampered = true; } } };";
            const nativeManifest = JSON.stringify({ id: "store-native", name: "Store Native", version: "1.0.0", native: "native.js" });
            return Response.json({
                schema: 1,
                plugins: [
                    registryEntry("store-good", goodVersion, { "manifest.json": good.manifest, "index.js": good["index.js"] }),
                    // The registry promises one index.js, the server sends another
                    registryEntry("store-tampered", "1.0.0",
                        { "manifest.json": JSON.stringify({ id: "store-tampered", name: "Tampered" }), "index.js": tamperedIndex },
                        {},
                        { "manifest.json": JSON.stringify({ id: "store-tampered", name: "Tampered" }), "index.js": tamperedIndex.replace("true", "\"pwned\"") }),
                    registryEntry("store-native", "1.0.0", {
                        "manifest.json": nativeManifest,
                        "index.js": "module.exports = { default: { start() { window.__storeNative = true; } } };",
                        "native.js": "module.exports = { ping: () => \"pong\" };",
                    }, { native: true }),
                    // Invalid entries are dropped, the rest still load
                    { id: "../escape", name: "Escape" },
                ],
            });
        }
        const content = storeFiles[pathname];
        return content === undefined ? new Response("not found", { status: 404 }) : new Response(content);
    },
});
const STORE_URL = `https://127.0.0.1:${server.port}/registry.json`;

/** Runs in Discord's page: install a plugin, a tampered one, a native one with and without consent */
async function storeStepInstall() {
    const D = (window as any).Delight;
    const listing = await D.store.refresh().then(() => D.store.getSnapshot());
    const good = await D.store.install("store-good");
    const goodState = D.plugins.get("store-good");
    const tampered = await D.store.install("store-tampered");
    const nativeRefused = await D.store.install("store-native");
    const nativeRefusedListed = !!D.plugins.get("store-native");
    const native = await D.store.install("store-native", { allowNative: true });
    const nativeState = D.plugins.get("store-native");
    const manual = await D.store.uninstall("late-plugin");
    return {
        status: listing.status, ids: listing.plugins.map((p: any) => p.id), problems: listing.problems.length,
        good, goodRan: (window as any).__storeGood, goodRunning: goodState?.running === true, goodSource: goodState?.source,
        tampered, tamperedListed: !!D.plugins.get("store-tampered"), tamperedRan: "__tampered" in window,
        nativeRefused, nativeRefusedListed,
        native, nativeRunning: nativeState?.running === true, nativePing: nativeState ? await nativeState.ctx.native.call("ping") : null,
        manual, lateStillThere: !!D.plugins.get("late-plugin"),
    };
}

/** After the server published 2.0.0: update, then uninstall */
async function storeStepUpdate() {
    const D = (window as any).Delight;
    await D.store.refresh();
    const offered = D.store.getSnapshot().plugins.find((p: any) => p.id === "store-good")?.version;
    const update = await D.store.install("store-good");
    const afterUpdate = { ran: (window as any).__storeGood, disposed: (window as any).__storeGoodDisposed, running: D.plugins.get("store-good")?.running === true };
    const uninstall = await D.store.uninstall("store-good");
    return {
        offered, update, afterUpdate, uninstall,
        listedAfterUninstall: !!D.plugins.get("store-good"), disposedAfterUninstall: (window as any).__storeGoodDisposed,
        installed: Object.keys(D.store.getSnapshot().installed),
    };
}

// Runs as Discord's main process: opens discord.com like the real client, then inspects the page
const fakeDiscordMain = String.raw`
const { app, BrowserWindow, net, session } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(() => {
    // Trust the test registry's self-signed certificate, for 127.0.0.1 only
    session.defaultSession.setCertificateVerifyProc((req, cb) => cb(req.hostname === "127.0.0.1" ? 0 : -3));
    const win = new BrowserWindow({
        show: false,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    });
    win.loadURL("https://discord.com/login");
    if (process.env.DELIGHT_TEST_PHASE === "import") return importPhase(win);

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
                // Last, so the backup holds everything above. The dialog is bypassed by DELIGHT_TEST_BACKUP_PATH.
                exported: await D.backup.export(),
            };
        })()${"`"});
        console.log("RESULT " + JSON.stringify(result));

        // Plugin store, against the local fake registry. What's on disk is checked between steps.
        const plugins = path.join(process.env.DELIGHT_DATA_DIR, "plugins");
        const disk = () => ({
            good: fs.existsSync(path.join(plugins, "store-good", "index.js")) ? fs.readFileSync(path.join(plugins, "store-good", "index.js"), "utf8").match(/__storeGood = "([^"]+)"/)?.[1] : null,
            goodMarker: fs.existsSync(path.join(plugins, "store-good", ".delight-store.json")) ? JSON.parse(fs.readFileSync(path.join(plugins, "store-good", ".delight-store.json"), "utf8")).version : null,
            tampered: fs.existsSync(path.join(plugins, "store-tampered")),
            native: fs.existsSync(path.join(plugins, "store-native", "native.js")),
            late: fs.existsSync(path.join(plugins, "late-plugin")),
            staging: fs.existsSync(path.join(process.env.DELIGHT_DATA_DIR, "store-staging")) ? fs.readdirSync(path.join(process.env.DELIGHT_DATA_DIR, "store-staging")) : [],
        });
        try {
            const install = await win.webContents.executeJavaScript(${JSON.stringify(`(${storeStepInstall})()`)});
            const afterInstall = disk();
            await net.fetch(process.env.DELIGHT_STORE_URL.replace("registry.json", "__publish"), { method: "POST" });
            const update = await win.webContents.executeJavaScript(${JSON.stringify(`(${storeStepUpdate})()`)});
            console.log("STORE " + JSON.stringify({ install, afterInstall, update, afterUpdate: disk() }));
        } catch (err) {
            console.log("STORE " + JSON.stringify({ error: String(err && err.stack || err) }));
        }
        app.exit(0);
    }, 16000);
});

// Second run, on a different data folder: restore the backup the first run exported
function importPhase(win) {
    setTimeout(async () => {
        const result = await win.webContents.executeJavaScript(${"`"}(async () => {
            const D = window.Delight;
            if (!D) return { delight: false };
            const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const running = () => D.plugins.getSnapshot().filter(p => p.running).map(p => p.manifest.id);
            const before = { running: running(), bootTheme: css("--delight-boot-theme"), order: css("--delight-order"), mine: css("--delight-mine") };
            const opened = await D.backup.open();
            const applied = opened.ok ? await D.backup.apply(opened.token, "replace") : null;
            // Quick CSS and theme changes arrive as IPC events, give them a moment
            await new Promise(r => setTimeout(r, 500));
            const again = await D.backup.open();
            return {
                delight: true,
                before,
                opened: opened.ok ? { fileName: opened.fileName, delightVersion: opened.delightVersion, previews: opened.previews } : opened,
                applied: applied && (applied.ok ? { ok: true, changes: applied.preview.changes } : applied),
                after: {
                    running: running(),
                    settings: D.settings.data,
                    themes: D.themes.getSnapshot().map(t => t.file),
                    bootTheme: css("--delight-boot-theme"),
                    lateTheme: css("--delight-late-theme"),
                    order: css("--delight-order"),
                    mine: css("--delight-mine"),
                },
                again: again.ok ? { merge: again.previews.merge.changes, replace: again.previews.replace.changes } : again,
            };
        })()${"`"});
        console.log("RESULT " + JSON.stringify(result));
        app.exit(0);
    }, 12000);
}
`;

const fakeDiscordPreload = `
const { contextBridge } = require("electron");
// Not "DiscordNative": that would switch Discord's web code into desktop mode, which needs the real native APIs
contextBridge.exposeInMainWorld("__fakeDiscordPreload", { ran: true });
// discord.com asks for passkeys on its login page, which can pop a Windows Hello dialog: switch WebAuthn off
require("electron").webFrame.executeJavaScript(${JSON.stringify(`(${disablePasskeys})()`)});
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
// The real data folder isn't inside a "type": "module" package like this repo, native.js must load as CommonJS
writeFileSync(join(DATA, "package.json"), JSON.stringify({ type: "commonjs" }));
writeFileSync(join(DATA, "settings.json"), JSON.stringify({
    quickCss: true,
    plugins: { experiments: { enabled: true, settings: { marker: "from-a" } }, "gpu-boost": { enabled: true } },
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

// The first run exports a backup here, the second restores it. Both dialogs answer with this path.
const BACKUP_FILE = join(BASE, "backup.json");
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
    if (!ok) failed++;
    console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${name}\x1b[0m${detail !== undefined ? `  \x1b[2m${JSON.stringify(detail)}\x1b[0m` : ""}`);
}

async function launch(dataDir: string, env: Record<string, string> = {}) {
    const proc = Bun.spawn([join(INSTALL, "app-1.0.0", "electron.exe")], {
        env: { ...process.env, DELIGHT_DATA_DIR: dataDir, DELIGHT_TEST_BACKUP_PATH: BACKUP_FILE, DELIGHT_STORE_URL: STORE_URL, ELECTRON_ENABLE_LOGGING: "1", ...env },
        stdout: "pipe",
        stderr: "pipe",
    });
    const started = performance.now();
    let timedOut = false;
    const timeout = setTimeout(() => (timedOut = true, proc.kill()), 60_000);
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    clearTimeout(timeout);

    const line = stdout.split("\n").find(l => l.startsWith("RESULT "));
    if (!line) {
        console.error("No result from Electron.\n--- stdout ---\n" + stdout.slice(-3000) + "\n--- stderr ---\n" + stderr.slice(-3000));
        rmSync(join(process.env.APPDATA!, APP_NAME), { recursive: true, force: true });
        process.exit(1);
    }
    return { stdout, stderr, r: JSON.parse(line.slice(7)) };
}

function printLogs(stdout: string, stderr: string) {
    const delightLines = stderr.split("\n").filter(l => /delight/i.test(l)).join("\n");
    console.log(`--- stdout ---\n${stdout.slice(-2500)}\n--- stderr (Delight lines) ---\n${delightLines.slice(-4000)}`);
}

const { stdout, stderr, r } = await launch(DATA);

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

if (failed) printLogs(stdout, stderr);

// ---- backup: export from the first data folder, restore into a second one ------------------------

const parsed = existsSync(BACKUP_FILE) ? parseBackup(readFileSync(BACKUP_FILE, "utf8")) : null;
const backup = parsed?.ok ? parsed.backup : null;
check("backup exported through the save dialog path", r.exported?.ok === true && r.exported.path === BACKUP_FILE && !!backup, parsed && !parsed.ok ? parsed.error : r.exported);
check("backup holds settings, Quick CSS, themes and the plugin list, no plugin code", !!backup
    && backup.settings.plugins.experiments?.settings?.marker === "from-a"
    && backup.quickCss === readFileSync(join(DATA, "quick.css"), "utf8")
    && ["boot.css", "off.css", "late.css"].every(f => backup.themes.some(t => t.file === f))
    && backup.plugins.some(p => p.id === "late-plugin" && p.source === "user" && p.enabled)
    && !readFileSync(BACKUP_FILE, "utf8").includes("__late"),
{ plugins: backup?.plugins.map(p => `${p.id}:${p.source}`), themes: backup?.themes.map(t => t.file) });

const DATA_B = join(BASE, "data-restore");
mkdirSync(join(DATA_B, "themes"), { recursive: true });
writeFileSync(join(DATA_B, "settings.json"), JSON.stringify({ quickCss: true, plugins: { experiments: { enabled: false } }, enabledThemes: ["mine.css"] }));
writeFileSync(join(DATA_B, "themes", "mine.css"), ":root { --delight-mine: on; }");
// Same file name as a theme in the backup, different contents: gets overwritten
writeFileSync(join(DATA_B, "themes", "boot.css"), ":root { --delight-boot-theme: old; }");
writeFileSync(join(DATA_B, "quick.css"), ":root { --delight-order: b-quick; }");

const b = await launch(DATA_B, { DELIGHT_TEST_PHASE: "import" });
const rb = b.r;
const preview = rb.opened?.previews?.replace;
const failedBefore = failed;
check("restore: second profile starts with its own state", rb.before?.mine === "on" && rb.before.order === "b-quick" && !rb.before.running.includes("experiments"), rb.before);
check("restore: preview lists what replace changes", !!preview
    && preview.pluginsEnabled.includes("Experiments")
    && preview.themesOverwritten.includes("boot.css") && preview.themesAdded.includes("late.css")
    && preview.themesDisabled.includes("mine.css") && preview.quickCss === "replaced"
    && preview.missingPlugins.some((p: any) => p.id === "late-plugin"), preview ?? rb.opened);
check("restore: applied", rb.applied?.ok === true && rb.applied.changes > 0, rb.applied);
check("restore: settings round-trip, in memory and on disk", !!backup
    && Bun.deepEquals(rb.after?.settings, backup.settings)
    && Bun.deepEquals(JSON.parse(readFileSync(join(DATA_B, "settings.json"), "utf8")), backup.settings), rb.after?.settings);
check("restore: theme files and Quick CSS round-trip on disk", !!backup
    && backup.themes.every(t => readFileSync(join(DATA_B, "themes", t.file), "utf8") === t.css)
    && readFileSync(join(DATA_B, "quick.css"), "utf8") === backup.quickCss
    && existsSync(join(DATA_B, "themes", "mine.css")));
check("restore: applies live, no reload (plugins, themes, Quick CSS)", rb.after?.running.includes("experiments")
    && rb.after.bootTheme === "applied" && rb.after.lateTheme === "live" && rb.after.order === "quick" && rb.after.mine === "", rb.after && { ...rb.after, settings: undefined });
check("restore: opening the same backup again changes nothing", rb.again?.merge === 0 && rb.again.replace === 0, rb.again);
if (failed > failedBefore) printLogs(b.stdout, b.stderr);

const storeLine = stdout.split("\n").find(l => l.startsWith("STORE "));
const s = storeLine ? JSON.parse(storeLine.slice(6)) : { error: "no STORE line" };
if (s.error) check("store steps ran", false, s.error);
else {
    const { install: i, afterInstall: d1, update: u, afterUpdate: d2 } = s;
    check("store: registry from the env URL loads, invalid entry skipped", i.status === "ready" && ["store-good", "store-tampered", "store-native"].every(id => i.ids.includes(id)) && i.problems === 1, { status: i.status, ids: i.ids, problems: i.problems });
    check("store: install hot-loads and runs the plugin, no restart", i.good?.ok === true && i.goodRan === "1.0.0" && i.goodRunning && i.goodSource === "user" && d1.good === "1.0.0" && d1.goodMarker === "1.0.0", { result: i.good, ran: i.goodRan, disk: d1.good });
    check("store: tampered file (bad sha256) rejected, nothing written", i.tampered?.ok === false && /sha256|doesn't match/.test(i.tampered.error) && !i.tamperedListed && !i.tamperedRan && !d1.tampered && d1.staging.length === 0, { result: i.tampered, disk: d1.tampered, staging: d1.staging });
    check("store: native plugin refused without the user's confirmation", i.nativeRefused?.ok === false && /full access/.test(i.nativeRefused.error) && !i.nativeRefusedListed, i.nativeRefused);
    check("store: native plugin installs once confirmed, its native side works", i.native?.ok === true && i.nativeRunning && i.nativePing === "pong" && d1.native, { result: i.native, ping: i.nativePing });
    check("store: won't uninstall a plugin it didn't install", i.manual?.ok === false && i.lateStillThere && d1.late, i.manual);
    check("store: update replaces the plugin live", u.offered === "2.0.0" && u.update?.ok === true && u.update.version === "2.0.0" && u.afterUpdate.ran === "2.0.0" && u.afterUpdate.running && u.afterUpdate.disposed === 1, { offered: u.offered, update: u.update, after: u.afterUpdate });
    check("store: uninstall stops and removes it live", u.uninstall?.ok === true && !u.listedAfterUninstall && u.disposedAfterUninstall === 2 && !u.installed.includes("store-good") && d2.good === null && d2.staging.length === 0, { result: u.uninstall, disk: d2 });
}

if (failed) {
    const delightLines = stderr.split("\n").filter(l => /delight/i.test(l)).join("\n");
    console.log(`--- stdout ---\n${stdout.slice(-2500)}\n--- stderr (Delight lines) ---\n${delightLines.slice(-4000)}`);
}
// The test app's own profile folder, created by Electron from APP_NAME
rmSync(join(process.env.APPDATA!, APP_NAME), { recursive: true, force: true });

server.stop(true);
process.exit(failed ? 1 : 0);
