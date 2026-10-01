import type { ImportMode } from "@shared/backup";
import { AddThemeResult, AuthorsResult, BackupApplyResult, BackupExportResult, BackupOpenResult, BootData, CommunityResult, CrashReportResult, EviSettings, HealthReportResult, HealthResult, IPC, OpenPathTarget, PluginChange, PluginReportResult, PreviewMediaResult, SettingsSaveResult, ThemeChange, ThemeSaveInput, ThemeSaveResult, ThemeSubmitResult, WallpaperPickResult, WallpaperReadResult } from "@shared/ipc";
import type { AccountLinkResult, AccountStatus, AccountUser } from "@shared/account";
import type { Breadcrumb, CrashRecord } from "@shared/crashDetective";
import type { CrashReportInput } from "@shared/crashReports";
import type { HealthReportInput } from "@shared/health";
import type { Hotfix } from "@shared/hotfixes";
import type { PluginReportInput } from "@shared/pluginReports";
import type { PulledPlugins } from "@shared/pulls";
import type { BadgeAdminAction, BadgeAdminResult, BadgePrefs, BadgePrefsResult, BadgesResult, CreditsDocument } from "@shared/badges";
import type { Announcement } from "@shared/announcements";
import type { AdminMethod } from "@shared/devAdmin";
import type { DevLive } from "@shared/devLive";
import type { EviNotification } from "@shared/notifications";
import type { PluginPage, RatingSummary } from "@shared/reviews";
import type { StoreHome } from "@shared/storeHome";
import type { UpdateInstallResult, UpdateProgress, UpdateStatus } from "@shared/release";
import type { StarKind, StarResult, StarsResult } from "@shared/stars";
import type { StorePreviewResult } from "@shared/pluginPermissions";
import type { StoreImageResult, StoreListing, StoreProgress, StoreResult } from "@shared/store";
import type { ThemeSubmissionInput } from "@shared/themeSubmissions";
import { isDiscordAppUrl } from "@shared/appHosts";
import { contextBridge, ipcRenderer, webFrame } from "electron";

/** The bridge the renderer uses to reach the main process. Mirrored by src/renderer/native.ts */
const EviNative = {
    boot: (): BootData => ipcRenderer.sendSync(IPC.GET_BOOT),
    setLocale: (locale: string) => void ipcRenderer.send(IPC.SET_LOCALE, locale),
    saveSettings: (settings: EviSettings): Promise<SettingsSaveResult | void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
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
    deleteTheme: (file: string): Promise<{ ok: true; } | { ok: false; error: string; }> => ipcRenderer.invoke(IPC.THEME_DELETE, file),
    saveTheme: (input: ThemeSaveInput): Promise<ThemeSaveResult> => ipcRenderer.invoke(IPC.THEME_SAVE, input),
    submitTheme: (input: ThemeSubmissionInput): Promise<ThemeSubmitResult> => ipcRenderer.invoke(IPC.THEME_SUBMIT, input),
    reportTheme: (id: string, input: PluginReportInput): Promise<PluginReportResult> => ipcRenderer.invoke(IPC.THEME_REPORT, id, input),
    storeList: (): Promise<StoreListing> => ipcRenderer.invoke(IPC.STORE_LIST),
    storeInstall: (id: string, options?: { allowNative?: boolean; allowMore?: boolean; }): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_INSTALL, id, options),
    storeUninstall: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_UNINSTALL, id),
    storeInstallTheme: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_THEME_INSTALL, id),
    storeUninstallTheme: (id: string): Promise<StoreResult> => ipcRenderer.invoke(IPC.STORE_THEME_UNINSTALL, id),
    storeImage: (url: string): Promise<StoreImageResult> => ipcRenderer.invoke(IPC.STORE_IMAGE, url),
    storePreview: (id: string): Promise<StorePreviewResult> => ipcRenderer.invoke(IPC.STORE_PREVIEW, id),
    getStars: (): Promise<StarsResult> => ipcRenderer.invoke(IPC.STARS_GET),
    setStar: (kind: StarKind, id: string, starred: boolean): Promise<StarResult> => ipcRenderer.invoke(IPC.STARS_SET, kind, id, starred),
    getAuthors: (): Promise<AuthorsResult> => ipcRenderer.invoke(IPC.AUTHORS_GET),
    getHealth: (): Promise<HealthResult> => ipcRenderer.invoke(IPC.HEALTH_GET),
    sendCrashReport: (input: CrashReportInput): Promise<CrashReportResult> => ipcRenderer.invoke(IPC.CRASH_REPORT_SEND, input),
    reportHealth: (input: HealthReportInput): Promise<HealthReportResult> => ipcRenderer.invoke(IPC.HEALTH_REPORT, input),
    onPullsChange(cb: (pulled: PulledPlugins) => void) {
        ipcRenderer.on(IPC.PULLS_CHANGED, (_, pulled) => cb(pulled));
    },
    onHotfixesChange(cb: (hotfixes: Hotfix[]) => void) {
        ipcRenderer.on(IPC.HOTFIXES_CHANGED, (_, hotfixes) => cb(hotfixes));
    },
    reportPlugin: (id: string, input: PluginReportInput): Promise<PluginReportResult> => ipcRenderer.invoke(IPC.PLUGIN_REPORT, id, input),
    getBadges: (cachedOnly = false): Promise<BadgesResult> => ipcRenderer.invoke(IPC.BADGES_GET, cachedOnly),
    onBadgesChange(cb: (badges: BadgesResult) => void) {
        ipcRenderer.on(IPC.BADGES_CHANGED, (_, badges) => cb(badges));
    },
    accountStatus: (): Promise<AccountStatus> => ipcRenderer.invoke(IPC.ACCOUNT_STATUS),
    linkAccount: (): Promise<AccountLinkResult> => ipcRenderer.invoke(IPC.ACCOUNT_LINK),
    openDashboard: (): Promise<void> => ipcRenderer.invoke(IPC.ACCOUNT_DASHBOARD),
    /** Tells evi.rest the linked account's current Discord name and avatar; quietly does nothing when not linked */
    syncProfile: (profile: AccountUser): Promise<void> => ipcRenderer.invoke(IPC.ACCOUNT_SYNC_PROFILE, profile),
    badgeAdminAvailable: (): Promise<boolean> => ipcRenderer.invoke(IPC.BADGES_ADMIN_AVAILABLE),
    badgeAdmin: (input: BadgeAdminAction): Promise<BadgeAdminResult> => ipcRenderer.invoke(IPC.BADGES_ADMIN, input),
    setBadgePrefs: (userId: string, prefs: Partial<BadgePrefs>): Promise<BadgePrefsResult> => ipcRenderer.invoke(IPC.BADGES_SET_PREFS, userId, prefs),
    checkForUpdate: (force = false): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK, force),
    installUpdate: (): Promise<UpdateInstallResult> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    onUpdateProgress(cb: (progress: UpdateProgress) => void) {
        ipcRenderer.on(IPC.UPDATE_PROGRESS, (_, progress) => cb(progress));
    },
    onUpdateReady(cb: (version: string) => void) {
        ipcRenderer.on(IPC.UPDATE_READY, (_, version) => cb(version));
    },
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
    // One-way and fire-and-forget: sent every few seconds, nothing waits on an answer
    sendCrashBreadcrumb: (breadcrumb: Breadcrumb) => ipcRenderer.send(IPC.CRASH_BREADCRUMB, breadcrumb),
    getCrashRecord: (): Promise<CrashRecord | undefined> => ipcRenderer.invoke(IPC.CRASH_RECORD_GET),
    markCrashSeen: () => ipcRenderer.send(IPC.CRASH_RECORD_SEEN),
    pickWallpaper: (): Promise<WallpaperPickResult> => ipcRenderer.invoke(IPC.WALLPAPER_PICK),
    readWallpaper: (): Promise<WallpaperReadResult> => ipcRenderer.invoke(IPC.WALLPAPER_READ),
    removeWallpaper: (): Promise<void> => ipcRenderer.invoke(IPC.WALLPAPER_REMOVE),
    onBattery: (): Promise<boolean> => ipcRenderer.invoke(IPC.POWER_ON_BATTERY),
    onPowerChange(cb: (onBattery: boolean) => void) {
        ipcRenderer.on(IPC.POWER_CHANGED, (_, onBattery) => cb(onBattery));
    },
    storeHome: (): Promise<CommunityResult<StoreHome>> => ipcRenderer.invoke(IPC.COMMUNITY_HOME),
    storeRatings: (): Promise<CommunityResult<Record<string, RatingSummary>>> => ipcRenderer.invoke(IPC.COMMUNITY_RATINGS),
    pluginPage: (id: string): Promise<CommunityResult<PluginPage>> => ipcRenderer.invoke(IPC.COMMUNITY_PAGE, id),
    /** null takes your review back */
    setReview: (id: string, review: { rating: number; body: string; version: string; } | null): Promise<CommunityResult<unknown>> => ipcRenderer.invoke(IPC.COMMUNITY_REVIEW, id, review),
    reportReview: (reviewId: number): Promise<CommunityResult<unknown>> => ipcRenderer.invoke(IPC.COMMUNITY_REVIEW_REPORT, reviewId),
    follow: (slug: string, on: boolean): Promise<CommunityResult<{ following: boolean; followers: number; }>> => ipcRenderer.invoke(IPC.COMMUNITY_FOLLOW, slug, on),
    following: (): Promise<CommunityResult<string[]>> => ipcRenderer.invoke(IPC.COMMUNITY_FOLLOWING),
    inbox: (): Promise<CommunityResult<EviNotification[]>> => ipcRenderer.invoke(IPC.COMMUNITY_INBOX),
    announcements: (): Promise<CommunityResult<Announcement[]>> => ipcRenderer.invoke(IPC.ANNOUNCEMENTS),
    devLive: (): Promise<CommunityResult<DevLive>> => ipcRenderer.invoke(IPC.DEV_LIVE),
    /** The Developers page's calls to evi.rest's admin API; main allows only shared/devAdmin.ts's routes */
    devAdmin: (method: AdminMethod, path: string, body?: unknown): Promise<CommunityResult<unknown>> => ipcRenderer.invoke(IPC.DEV_ADMIN, method, path, body),
    onAnnouncementsChange: (cb: () => void) => {
        ipcRenderer.on(IPC.ANNOUNCEMENTS_CHANGED, () => cb());
    },
    markInboxRead: (ids?: string[]): Promise<CommunityResult<EviNotification[]>> => ipcRenderer.invoke(IPC.COMMUNITY_INBOX_READ, ids),
    onInboxChange(cb: () => void) {
        ipcRenderer.on(IPC.COMMUNITY_INBOX_CHANGED, () => cb());
    },
    credits: (): Promise<CommunityResult<CreditsDocument>> => ipcRenderer.invoke(IPC.COMMUNITY_CREDITS),
    credited: (): Promise<CommunityResult<boolean | null>> => ipcRenderer.invoke(IPC.COMMUNITY_CREDITED),
    setCredited: (on: boolean): Promise<CommunityResult<boolean>> => ipcRenderer.invoke(IPC.COMMUNITY_SET_CREDITED, on),
    storePreviewMedia: (url: string): Promise<PreviewMediaResult> => ipcRenderer.invoke(IPC.STORE_PREVIEW_MEDIA, url),
};

export type EviNativeApi = typeof EviNative;

// Session preloads run in every frame of every window, only boot in Discord's app frame
const isDiscordApp = window === window.top && isDiscordAppUrl(location.href);

/**
 * Hands the bridge to Evi's renderer, and to nothing else in the page.
 *
 * Plugins run in the same world as the renderer, so a bridge left on `window` would let any of them
 * call main directly (install, save settings, relaunch...). Instead the page gets a one-shot
 * `window.__eviClaimNative()`: the renderer calls it first thing (src/renderer/native.ts), before any
 * plugin code is evaluated, and it's gone after that.
 *
 * contextBridge.exposeInMainWorld defines non-configurable properties (checked in Electron 37: delete
 * returns false and they stay on `window` for good), so where it exists the claim function is defined
 * by a function run in the page's world with executeInMainWorld (Electron 35+), as a configurable
 * property that deletes itself when called. Older Electrons fall back to exposeInMainWorld: the
 * function then stays on `window`, but only its first call returns the bridge.
 */
function handOver() {
    let claimed = false;
    const claim = () => {
        if (claimed) throw new Error("Evi's bridge was already claimed");
        claimed = true;
        return EviNative;
    };

    if (typeof contextBridge.executeInMainWorld === "function") {
        contextBridge.executeInMainWorld({
            func: (claim: () => unknown) => {
                Object.defineProperty(window, "__eviClaimNative", {
                    configurable: true,
                    value() {
                        delete (window as any).__eviClaimNative;
                        return claim();
                    },
                });
            },
            args: [claim],
        });
    } else {
        contextBridge.exposeInMainWorld("__eviClaimNative", claim);
    }
    return () => {
        claimed = true;
        contextBridge.executeInMainWorld?.({ func: () => void delete (window as any).__eviClaimNative });
    };
}

if (isDiscordApp) {
    const lock = handOver();
    // Runs in the page's world, ahead of Discord's scripts. Whatever happened in there (a renderer
    // that failed before claiming it), nothing after it gets the bridge.
    webFrame.executeJavaScript(ipcRenderer.sendSync(IPC.GET_RENDERER)).finally(lock);
}
