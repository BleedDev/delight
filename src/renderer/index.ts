/**
 * Renderer entry. Runs in Discord's page before any of Discord's scripts.
 */
import * as api from "@delight/api";
import { isPluginEnabled } from "@shared/ipc";

import { Backup } from "./backup";
import { Logger } from "./logger";
import { Native } from "./native";
import { diagnosePatches } from "./patching/diagnose";
import { PluginManager } from "./plugins/manager";
import { Settings } from "./settings";
import { QuickCss } from "./styles";
import { Themes } from "./themes";
import { registerToolkitPatches, Toolkit } from "./toolkit";
import { installHotkey, SettingsUI } from "./ui";
import { installSettingsEntry } from "./ui/settingsEntry";
import { onCommonReady } from "./webpack/common";
import { pendingWaiters } from "./webpack/find";
import { interceptWebpack, stats, wreq } from "./webpack/runtime";

const logger = new Logger("Core");

declare global {
    interface Window {
        Delight: typeof Delight;
    }
}

const Delight = {
    version: DELIGHT_VERSION,
    api,
    plugins: PluginManager,
    settings: Settings,
    themes: Themes,
    backup: Backup,
    ui: SettingsUI,
    diagnosePatches,
    stats,
    pendingWaiters,
    toolkit: Toolkit,
    get wreq() {
        return wreq;
    },
    /** Target of $self in source patches */
    $: PluginManager.self,
};

function boot() {
    // Only present where our preload decided to load us
    if (!window.DelightNative) return;
    if (window.Delight) return logger.warn("Already loaded, skipping");
    Object.defineProperty(window, "Delight", { value: Delight, configurable: false, writable: false });

    // Must happen before Discord's runtime script executes
    interceptWebpack();

    const data = Native.boot();
    Settings.init(data.settings);
    // Themes first: Quick CSS goes after them in <head>, so it wins
    Themes.init(data.themes);
    QuickCss.init(data.quickCss);
    registerToolkitPatches(data.plugins.filter(p => isPluginEnabled(data.settings, p.manifest)).map(p => p.code));
    PluginManager.boot(data.plugins);
    installHotkey();
    installSettingsEntry();

    onCommonReady(() => {
        logger.info("Discord core modules ready, starting plugins");
        PluginManager.startAll();
    });

    logger.info(`v${DELIGHT_VERSION} loaded, ${data.plugins.length} plugins. Ctrl+Shift+D opens settings.`);
}

try {
    boot();
} catch (err) {
    logger.error("Boot failed", err);
}
