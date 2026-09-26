import { BootData, DelightSettings, IPC, OpenPathTarget } from "@shared/ipc";
import { diffSettings } from "@shared/safeMode";
import { ORIGINAL_ASAR } from "@shared/shim";
import { app, ipcMain, Session, session, shell } from "electron";
import { existsSync, readFileSync, watch, writeFileSync } from "fs";
import { dirname, join } from "path";

import { initBackup } from "./backup";
import { DATA_DIR, PLUGINS_DIR, QUICK_CSS_FILE, THEMES_DIR } from "./paths";
import { persistAcrossUpdates } from "./persist";
import { applyChromiumSwitches, getPluginPayloads, initPlugins } from "./plugins";
import { SafeMode } from "./safeMode";
import { saveSettings, settings } from "./settings";
import { initStore } from "./store";
import { getThemePayloads, initThemes } from "./themes";

declare global {
    // eslint-disable-next-line no-var
    var __delightLoadedDiscord: boolean | undefined;
    /** Folder holding main.js, preload.js and renderer.js. Set by the loader. */
    var __delightCoreDir: string;
}

// Our loader is resources/app.asar, Discord's untouched archive was renamed to resources/_app.asar
const shimAsar = dirname(require.main!.filename);
const asarPath = join(shimAsar, "..", ORIGINAL_ASAR);

const vanilla = process.argv.includes("--vanilla") || !!process.env.DELIGHT_DISABLE;

function readQuickCss() {
    try {
        return readFileSync(QUICK_CSS_FILE, "utf8");
    } catch {
        return "";
    }
}

function registerIpc() {
    ipcMain.on(IPC.GET_RENDERER, e => {
        // Read fresh every time so Ctrl+R picks up a rebuilt renderer without restarting Discord
        e.returnValue = readFileSync(join(globalThis.__delightCoreDir, "renderer.js"), "utf8");
    });

    ipcMain.on(IPC.GET_BOOT, e => {
        const boot: BootData = {
            version: DELIGHT_VERSION,
            dataDir: DATA_DIR,
            settings,
            plugins: getPluginPayloads(),
            quickCss: readQuickCss(),
            themes: getThemePayloads(),
            safeMode: SafeMode.info,
        };
        e.returnValue = boot;
    });

    ipcMain.handle(IPC.SETTINGS_SAVE, (_, next) => saveAndRecord(next));
    ipcMain.handle(IPC.CSS_SAVE, (_, css: string) => writeFileSync(QUICK_CSS_FILE, css));
    ipcMain.on(IPC.SETTINGS_SAVE_SYNC, (e, next) => {
        saveAndRecord(next);
        e.returnValue = true;
    });
    ipcMain.on(IPC.CSS_SAVE_SYNC, (e, css: string) => {
        writeFileSync(QUICK_CSS_FILE, css);
        e.returnValue = true;
    });

    ipcMain.handle(IPC.OPEN_PATH, (_, target: OpenPathTarget) => {
        if (target === "quickCss" && !existsSync(QUICK_CSS_FILE)) writeFileSync(QUICK_CSS_FILE, "");
        const path = { data: DATA_DIR, plugins: PLUGINS_DIR, themes: THEMES_DIR, quickCss: QUICK_CSS_FILE }[target];
        return shell.openPath(path);
    });

    ipcMain.handle(IPC.RELAUNCH, () => {
        app.relaunch();
        app.exit(0);
    });

    ipcMain.on(IPC.BOOT_OK, () => SafeMode.bootOk());
    ipcMain.handle(IPC.SAFE_MODE_EXIT, () => SafeMode.exit());
}

/** Remembers what the save turned on or changed, so safe mode can name a suspect */
function saveAndRecord(next: DelightSettings) {
    for (const change of diffSettings(settings, next)) SafeMode.recordChange(change);
    saveSettings(next);
}

function watchQuickCss() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Watch the folder rather than the file: editors often save by replacing the file
    watch(DATA_DIR, (_event, filename) => {
        if (filename !== "quick.css") return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const css = readQuickCss();
            // Our own saves land here too: every edit is recorded, wherever it's made
            SafeMode.recordChange({ kind: "quickCss", id: "quick.css", action: "edited" });
            for (const wc of require("electron").webContents.getAllWebContents()) wc.send(IPC.CSS_CHANGED, css);
        }, 50);
    });
}

/**
 * Instead of replacing Discord's BrowserWindow to swap its preload, we register an additional
 * session-wide preload. It runs before Discord's own preload in every frame of the session.
 */
const preloadedSessions = new WeakSet<Session>();
function addPreload(s: Session) {
    if (preloadedSessions.has(s)) return;
    preloadedSessions.add(s);

    const filePath = join(globalThis.__delightCoreDir, "preload.js");
    if (typeof s.registerPreloadScript === "function") {
        s.registerPreloadScript({ id: "delight", type: "frame", filePath });
    } else {
        s.setPreloads([...s.getPreloads(), filePath]);
    }
}

/** Discord hides DevTools unless this setting is on. appSettings is assigned during Discord's startup. */
function enableDevTools() {
    let value: any;
    Object.defineProperty(globalThis, "appSettings", {
        configurable: true,
        get: () => value,
        set(v) {
            value = v;
            try {
                v?.set?.("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
            } catch { }
        },
    });
}

function setup() {
    console.log(`[Delight] v${DELIGHT_VERSION} starting, data at ${DATA_DIR}`);

    registerIpc();
    SafeMode.watchCrashes();
    enableDevTools();
    applyChromiumSwitches();
    app.on("session-created", addPreload);
    app.whenReady().then(() => addPreload(session.defaultSession));
    app.whenReady().then(initPlugins);
    initBackup();
    // Themes need nothing from Electron to load, have them ready for the first window's boot
    initThemes();
    initStore();
    watchQuickCss();
    persistAcrossUpdates(shimAsar);
}

if (vanilla) {
    console.log("[Delight] Vanilla mode, not loading.");
} else {
    try {
        // Counts this start, and decides whether it's safe mode (or, after repeated failures, vanilla)
        if (SafeMode.begin() !== "vanilla") setup();
    } catch (err) {
        console.error("[Delight] Setup failed, continuing with Discord only", err);
    }
}

// Hand over to Discord as if it had been launched directly
const discordPkg = require(join(asarPath, "package.json"));
require.main!.filename = join(asarPath, discordPkg.main);
(app as any).setAppPath(asarPath);
globalThis.__delightLoadedDiscord = true;
require(require.main!.filename);
