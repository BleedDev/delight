/**
 * The theme editor's way to the Theme Store: sending a theme to evi.rest for review as the account
 * this install is linked to, and reporting a store theme to Evi's team. Both are checked here the
 * way the server will, so a problem shows before anything leaves, and both are capped per hour:
 * plugins share the page with the buttons that send them.
 */
import { IPC, PluginReportResult, ThemeSubmitResult } from "@shared/ipc";
import { validatePluginReport } from "@shared/pluginReports";
import { validateThemeSubmission, whyNotCommunityCss } from "@shared/themeSubmissions";
import { ipcMain } from "electron";

import { apiRequest } from "./evirest";
import { mt } from "./locale";

const HOUR = 60 * 60 * 1000;

/** At most `max` in any hour */
function hourly(max: number) {
    const times: number[] = [];
    return () => {
        const now = Date.now();
        while (times.length && times[0] <= now - HOUR) times.shift();
        if (times.length >= max) return false;
        times.push(now);
        return true;
    };
}

const submitAllowed = hourly(10);
const reportAllowed = hourly(5);

async function submitTheme(raw: unknown): Promise<ThemeSubmitResult> {
    const checked = validateThemeSubmission(raw, mt);
    if ("error" in checked) return { ok: false, error: checked.error };
    const problem = whyNotCommunityCss(checked.input.css, mt);
    if (problem) return { ok: false, error: problem };
    if (!submitAllowed()) return { ok: false, error: mt("main.rate.uploads") };
    try {
        const { json } = await apiRequest("POST", "/me/theme-submissions", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(checked.input),
            max: 64 * 1024,
        });
        const s = json?.submission;
        if (typeof s?.id !== "number" || typeof s?.version !== "string") return { ok: false, error: "The server sent something unexpected" };
        return { ok: true, submission: { id: s.id, version: s.version } };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function reportTheme(id: unknown, input: unknown): Promise<PluginReportResult> {
    const checked = validatePluginReport(id, input, mt);
    if ("error" in checked) return { ok: false, error: checked.error };
    if (!reportAllowed()) return { ok: false, error: mt("main.rate.reports") };
    const { plugin, ...report } = checked.report;
    try {
        await apiRequest("POST", `/themes/${plugin}/reports`, { headers: { "Content-Type": "application/json" }, body: JSON.stringify(report), max: 16 * 1024 });
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export function initThemeSubmit() {
    ipcMain.handle(IPC.THEME_SUBMIT, (_, input: unknown) => submitTheme(input));
    ipcMain.handle(IPC.THEME_REPORT, (_, id: unknown, input: unknown) => reportTheme(id, input));
}
