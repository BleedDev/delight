import type { ImportMode } from "@shared/backup";
import { AddThemeResult, BackupApplyResult, BackupExportResult, BackupOpenResult, BootData, EviSettings, IPC, OpenPathTarget, PluginChange, ThemeChange } from "@shared/ipc";
import type { AccountLinkResult, AccountStatus } from "@shared/account";
import type { BadgeAdminAction, BadgeAdminResult, BadgesResult } from "@shared/badges";
import type { StarKind, StarResult, StarsResult } from "@shared/stars";
import type { StoreImageResult, StoreListing, StoreProgress, StoreResult } from "@shared/store";
import { contextBridge, ipcRenderer, webFrame } from "electron";

/** The bridge the renderer uses to reach the main process. Mirrored by src/renderer/native.ts */
const EviNative = {
    boot: (): BootData => ipcRenderer.sendSync(IPC.GET_BOOT),
    saveSettings: (settings: EviSettings) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
    saveQuickCss: (css: string) => ipcRenderer.invoke(IPC.CSS_SAVE, css),
    saveSettingsSync: (settings: EviSettings) => void ipcRenderer.sendSync(IPC.SETTINGS_SAVE_SYNC, settings),
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
    storeInstallTheme: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_THEME_INSTALL, id),
    storeUninstallTheme: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_THEME_UNINSTALL, id),
    storeImage: (url: string): Promise<StoreImageResult> => ipcRenderer.invoke(IPC.STORE_IMAGE, url),
    getStars: (): Promise<StarsResult> => ipcRenderer.invoke(IPC.STARS_GET),
    setStar: (kind: StarKind, id: string, starred: boolean): Promise<StarResult> => ipcRenderer.invoke(IPC.STARS_SET, kind, id, starred),
    getBadges: (cachedOnly = false): Promise<BadgesResult> => ipcRenderer.invoke(IPC.BADGES_GET, cachedOnly),
    accountStatus: (): Promise<AccountStatus> => ipcRenderer.invoke(IPC.ACCOUNT_STATUS),
    linkAccount: (): Promise<AccountLinkResult> => ipcRenderer.invoke(IPC.ACCOUNT_LINK),
    openDashboard: (): Promise<void> => ipcRenderer.invoke(IPC.ACCOUNT_DASHBOARD),
    badgeAdminAvailable: (): Promise<boolean> => ipcRenderer.invoke(IPC.BADGES_ADMIN_AVAILABLE),
    badgeAdmin: (input: BadgeAdminAction): Promise<BadgeAdminResult> => ipcRenderer.invoke(IPC.BADGES_ADMIN, input),
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
    reportBootOk: () => ipcRenderer.send(IPC.BOOT_OK),
    exitSafeMode: () => ipcRenderer.invoke(IPC.SAFE_MODE_EXIT),
};

export type EviNativeApi = typeof EviNative;

// Session preloads run in every frame of every window, only boot in Discord's app frame
const isDiscordApp =
    window === window.top
    && location.protocol === "https:"
    && /(^|\.)discord\.com$/.test(location.hostname);

if (isDiscordApp) {
    contextBridge.exposeInMainWorld("EviNative", EviNative);
    // Runs in the page's world, ahead of Discord's scripts
    webFrame.executeJavaScript(ipcRenderer.sendSync(IPC.GET_RENDERER));
}
