import { backupFileName, BackupSource, buildBackup, DelightBackup, ImportMode, MAX_BACKUP_BYTES, parseBackup, planImport } from "@shared/backup";
import { BackupApplyResult, BackupExportResult, BackupOpenResult, IPC } from "@shared/ipc";
import { randomUUID } from "crypto";
import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, webContents } from "electron";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, join } from "path";

import { QUICK_CSS_FILE, THEMES_DIR } from "./paths";
import { getPluginPayloads } from "./plugins";
import { saveSettings, settings } from "./settings";
import { getThemePayloads, reloadTheme } from "./themes";

/**
 * Tests can't click through native dialogs: with this set, both dialogs answer with this path.
 * Only scripts/test-electron.ts sets it.
 */
const TEST_PATH = process.env.DELIGHT_TEST_BACKUP_PATH;

/** The last validated backup, applied by token so the renderer never sends file contents back */
let pending: { token: string; backup: DelightBackup; } | undefined;

function currentState(): BackupSource {
    let quickCss = "";
    try {
        quickCss = readFileSync(QUICK_CSS_FILE, "utf8");
    } catch { }
    return { settings, quickCss, themes: getThemePayloads(), plugins: getPluginPayloads() };
}

const errorOf = (err: unknown) => String((err as Error)?.message ?? err);

async function pickSavePath(e: IpcMainInvokeEvent) {
    if (TEST_PATH) return TEST_PATH;
    const win = BrowserWindow.fromWebContents(e.sender);
    const options: Electron.SaveDialogOptions = {
        title: "Save Delight backup",
        defaultPath: join(app.getPath("documents"), backupFileName()),
        filters: [{ name: "Delight backup", extensions: ["json"] }],
    };
    const { canceled, filePath } = await (win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options));
    return canceled ? undefined : filePath;
}

async function pickOpenPath(e: IpcMainInvokeEvent) {
    if (TEST_PATH) return TEST_PATH;
    const win = BrowserWindow.fromWebContents(e.sender);
    const options: Electron.OpenDialogOptions = {
        title: "Restore Delight backup",
        properties: ["openFile"],
        filters: [{ name: "Delight backup", extensions: ["json"] }, { name: "All files", extensions: ["*"] }],
    };
    const { canceled, filePaths } = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));
    return canceled ? undefined : filePaths[0];
}

export function writeBackup(path: string) {
    const backup = buildBackup(currentState(), DELIGHT_VERSION);
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(backup, null, 4));
    renameSync(tmp, path);
}

export function readBackup(path: string) {
    // Check the size before reading, a wrong pick could be a multi-GB file
    if (statSync(path).size > MAX_BACKUP_BYTES) return { ok: false as const, error: `That file is larger than ${MAX_BACKUP_BYTES / 1024 / 1024} MB` };
    const bytes = readFileSync(path);
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return { ok: false as const, error: "That file isn't text" };
    }
    return parseBackup(text);
}

/**
 * Writes every file of the plan, all or nothing: everything is staged to temp files first, then
 * renamed into place. If a rename fails, files already replaced get their old contents back.
 */
function commitFiles(writes: { path: string; data: string; }[]) {
    const staged: { path: string; tmp: string; previous: string | null; }[] = [];
    try {
        for (const { path, data } of writes) {
            const tmp = path + ".delight-import";
            writeFileSync(tmp, data);
            staged.push({ path, tmp, previous: existsSync(path) ? readFileSync(path, "utf8") : null });
        }
    } catch (err) {
        for (const { tmp } of staged) rmSync(tmp, { force: true });
        throw err;
    }

    const done: typeof staged = [];
    try {
        for (const entry of staged) {
            renameSync(entry.tmp, entry.path);
            done.push(entry);
        }
    } catch (err) {
        for (const { path, previous } of done) {
            try {
                previous === null ? rmSync(path, { force: true }) : writeFileSync(path, previous);
            } catch { }
        }
        for (const { tmp } of staged) rmSync(tmp, { force: true });
        throw err;
    }
    return () => {
        for (const { path, previous } of done) previous === null ? rmSync(path, { force: true }) : writeFileSync(path, previous);
    };
}

export function applyBackup(backup: DelightBackup, mode: ImportMode): BackupApplyResult {
    const previousSettings = structuredClone(settings);
    const plan = planImport(currentState(), backup, mode);

    const writes = plan.themes.map(t => ({ path: join(THEMES_DIR, basename(t.file)), data: t.css }));
    if (plan.quickCss !== null) writes.push({ path: QUICK_CSS_FILE, data: plan.quickCss });

    let rollback: () => void;
    try {
        rollback = commitFiles(writes);
    } catch (err) {
        return { ok: false, error: `Couldn't write the files, nothing was changed: ${errorOf(err)}` };
    }
    try {
        saveSettings(plan.settings);
    } catch (err) {
        try {
            rollback();
            saveSettings(previousSettings);
        } catch { }
        return { ok: false, error: `Couldn't save settings, nothing was changed: ${errorOf(err)}` };
    }

    // Don't wait for the watchers, the renderer should have everything when this resolves
    for (const { file } of plan.themes) reloadTheme(basename(file));
    if (plan.quickCss !== null) {
        for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send(IPC.CSS_CHANGED, plan.quickCss);
    }
    console.log(`[Delight] Restored a backup (${mode}), ${plan.preview.changes} changes`);
    return { ok: true, settings: plan.settings, preview: plan.preview };
}

export function initBackup() {
    ipcMain.handle(IPC.BACKUP_EXPORT, async (e): Promise<BackupExportResult> => {
        try {
            const path = await pickSavePath(e);
            if (!path) return { ok: false, canceled: true };
            writeBackup(path);
            console.log(`[Delight] Saved a backup to ${path}`);
            return { ok: true, path };
        } catch (err) {
            return { ok: false, error: `Couldn't save the backup: ${errorOf(err)}` };
        }
    });

    ipcMain.handle(IPC.BACKUP_OPEN, async (e): Promise<BackupOpenResult> => {
        try {
            const path = await pickOpenPath(e);
            if (!path) return { ok: false, canceled: true };
            const parsed = readBackup(path);
            if (!parsed.ok) return parsed;

            const { backup } = parsed;
            const token = randomUUID();
            pending = { token, backup };
            const state = currentState();
            return {
                ok: true,
                token,
                fileName: basename(path),
                createdAt: backup.createdAt,
                delightVersion: backup.delightVersion,
                previews: {
                    merge: planImport(state, backup, "merge").preview,
                    replace: planImport(state, backup, "replace").preview,
                },
            };
        } catch (err) {
            return { ok: false, error: `Couldn't read that file: ${errorOf(err)}` };
        }
    });

    ipcMain.handle(IPC.BACKUP_APPLY, (_, token: string, mode: ImportMode): BackupApplyResult => {
        if (!pending || pending.token !== token) return { ok: false, error: "That backup is no longer open, choose the file again" };
        if (mode !== "merge" && mode !== "replace") return { ok: false, error: "Unknown import mode" };
        const { backup } = pending;
        pending = undefined;
        // Planned again against the current state, in case something changed since the preview
        return applyBackup(backup, mode);
    });
}
