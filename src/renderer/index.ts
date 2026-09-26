/**
 * Renderer entry. Runs in Discord's page before any of Discord's scripts.
 */
import * as api from "@evi/api";
import { isPluginEnabled } from "@shared/ipc";

import { Backup } from "./backup";
import { Logger } from "./logger";
import { Native } from "./native";
import { diagnosePatches } from "./patching/diagnose";
import { PluginManager } from "./plugins/manager";
import { SafeMode } from "./safeMode";
import { Settings } from "./settings";
import { Store } from "./store";
import { QuickCss } from "./styles";
import { Themes } from "./themes";
import { registerToolkitPatches, Toolkit } from "./toolkit";
import { installHotkey, SettingsUI } from "./ui";
import { showSafeModeNotice } from "./ui/SafeModeNotice";
import { installSettingsEntry } from "./ui/settingsEntry";
import { showWhatsNewIfUpdated } from "./ui/WhatsNew";
import { onCommonReady } from "./webpack/common";
import { pendingWaiters } from "./webpack/find";
import { interceptWebpack, stats, wreq } from "./webpack/runtime";

const logger = new Logger("Core");

declare global {
    interface Window {
        Evi: typeof Evi;
    }
}

const Evi = {
    version: EVI_VERSION,
    api,
    plugins: PluginManager,
    settings: Settings,
    themes: Themes,
    backup: Backup,
    store: Store,
    ui: SettingsUI,
    diagnosePatches,
    stats,
    pendingWaiters,
    toolkit: Toolkit,
    safeMode: SafeMode,
    get wreq() {
        return wreq;
    },
    /** Target of $self in source patches */
    $: PluginManager.self,
};

function boot() {
    // Only present where our preload decided to load us
    if (!window.EviNative) return;
    if (window.Evi) return logger.warn("Already loaded, skipping");
    Object.defineProperty(window, "Evi", { value: Evi, configurable: false, writable: false });

    // Must happen before Discord's runtime script executes
    interceptWebpack();

    const data = Native.boot();
    // Before anything that applies plugins or CSS, they all check it
    SafeMode.init(data.safeMode);
    Settings.init(data.settings);
    // Themes first: Quick CSS goes after them in <head>, so it wins
    Themes.init(data.themes);
    QuickCss.init(data.quickCss);
    if (!SafeMode.active) registerToolkitPatches(data.plugins.filter(p => isPluginEnabled(data.settings, p.manifest)).map(p => p.code));
    PluginManager.boot(data.plugins);
    installHotkey();
    installSettingsEntry();

    onCommonReady(() => {
        if (!SafeMode.active) logger.info("Discord core modules ready, starting plugins");
        PluginManager.startAll().then(() => SafeMode.scheduleBootOk());
        if (SafeMode.active) {
            showSafeModeNotice();
        } else {
            // Waits for a normal start: safe mode has its own notice to show, and nothing to update
            showWhatsNewIfUpdated();
            Store.scheduleAutoUpdate();
        }
    });

    if (SafeMode.active) logger.warn(`Safe mode (${data.safeMode!.reason}): ${data.plugins.length} plugins, themes and Quick CSS are off.`);
    else logger.info(`v${EVI_VERSION} loaded, ${data.plugins.length} plugins. Ctrl+Shift+D opens settings.`);
}

try {
    boot();
} catch (err) {
    logger.error("Boot failed", err);
}
