import type { ImportMode } from "@shared/backup";
import { AddThemeResult, BackupApplyResult, BackupExportResult, BackupOpenResult, BootData, DelightSettings, IPC, OpenPathTarget, PluginChange, ThemeChange } from "@shared/ipc";
import type { StoreListing, StoreProgress, StoreResult } from "@shared/store";
import { contextBridge, ipcRenderer, webFrame } from "electron";

/** The bridge the renderer uses to reach the main process. Mirrored by src/renderer/native.ts */
const DelightNative = {
    boot: (): BootData => ipcRenderer.sendSync(IPC.GET_BOOT),
    saveSettings: (settings: DelightSettings) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
    saveQuickCss: (css: string) => ipcRenderer.invoke(IPC.CSS_SAVE, css),
    saveSettingsSync: (settings: DelightSettings) => void ipcRenderer.sendSync(IPC.SETTINGS_SAVE_SYNC, settings),
    saveQuickCssSync: (css: string) => void ipcRenderer.sendSync(IPC.CSS_SAVE_SYNC, css),
    onQuickCssChange(cb: (css: string) => void) {
        ipcRenderer.on(IPC.CSS_CHANGED, (_, css) => cb(css));
    },
    onPluginChange(cb: (change: PluginChange) => void) {
        ipcRenderer.on(IPC.PLUGIN_CHANGED, (_, change) => cb(change));
    },
    onThemeChange(cb: (change: ThemeChange) => void) {
        ipcRenderer.on(IPC.THEME_CHANGED, (_, change) => cb(change));
    },
    addThemeFromUrl: (url: string): Promise<AddThemeResult> => ipcRenderer.invoke(IPC.THEME_ADD_URL, url),
    storeList: (): Promise<StoreListing> => ipcRenderer.invoke(IPC.STORE_LIST),
    storeInstall: (id: string, options?: { allowNative?: boolean; }): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_INSTALL, id, options),
    storeUninstall: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_UNINSTALL, id),
    onStoreProgress(cb: (progress: StoreProgress) => void) {
        ipcRenderer.on(IPC.STORE_PROGRESS, (_, progress) => cb(progress));
    },
    callNative: (id: string, method: string, args: unknown[]) => ipcRenderer.invoke(IPC.PLUGIN_NATIVE_CALL, id, method, args),
    setNativeRunning: (id: string, running: boolean) => ipcRenderer.invoke(IPC.PLUGIN_NATIVE_STATE, id, running),
    exportBackup: (): Promise<BackupExportResult> => ipcRenderer.invoke(IPC.BACKUP_EXPORT),
    openBackup: (): Promise<BackupOpenResult> => ipcRenderer.invoke(IPC.BACKUP_OPEN),
    applyBackup: (token: string, mode: ImportMode): Promise<BackupApplyResult> => ipcRenderer.invoke(IPC.BACKUP_APPLY, token, mode),
    openPath: (target: OpenPathTarget) => ipcRenderer.invoke(IPC.OPEN_PATH, target),
    relaunch: () => ipcRenderer.invoke(IPC.RELAUNCH),
};

export type DelightNativeApi = typeof DelightNative;

// Session preloads run in every frame of every window, only boot in Discord's app frame
const isDiscordApp =
    window === window.top
    && location.protocol === "https:"
    && /(^|\.)discord\.com$/.test(location.hostname);

if (isDiscordApp) {
    contextBridge.exposeInMainWorld("DelightNative", DelightNative);
    // Runs in the page's world, ahead of Discord's scripts
    webFrame.executeJavaScript(ipcRenderer.sendSync(IPC.GET_RENDERER));
}
