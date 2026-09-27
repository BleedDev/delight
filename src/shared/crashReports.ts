/**
 * Crash reports sent to a plugin's author (POST /v1/crash-reports), when someone presses "Send to
 * author" next to Copy crash report. The report is the same text as the copied one
 * (renderer/crashReport.ts), which holds nothing personal. The server groups identical crashes so
 * an author sees "12 installs, since Tuesday" rather than twelve copies.
 */
import { isPluginId, isVersion } from "./store";

export const MAX_REPORT_CHARS = 16_000;

export interface CrashReportInput {
    plugin: string;
    version: string;
    eviVersion: string;
    discordBuild: string;
    report: string;
}

/** A group of identical crashes, as its author sees it (GET /v1/me/crashes) */
export interface CrashGroup {
    id: string;
    plugin: string;
    version: string;
    /** The first line of the error, or what couldn't be found */
    title: string;
    count: number;
    installs: number;
    firstAt: number;
    lastAt: number;
    /** The newest report's text */
    sample: string;
    resolved: boolean;
}

const BUILD_RE = /^[0-9a-z._-]{1,64}$/i;

export function validateCrashReport(raw: unknown): { report: CrashReportInput; } | { error: string; } {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!isPluginId(e.plugin)) return { error: "plugin must be a plugin id" };
    if (!isVersion(e.version)) return { error: "version must look like 1.2.3" };
    if (typeof e.eviVersion !== "string" || e.eviVersion.length > 32) return { error: "eviVersion is missing" };
    if (typeof e.discordBuild !== "string" || !BUILD_RE.test(e.discordBuild)) return { error: "discordBuild must be Discord's build id" };
    if (typeof e.report !== "string" || !e.report.trim()) return { error: "report is empty" };
    if (e.report.length > MAX_REPORT_CHARS) return { error: `report must be at most ${MAX_REPORT_CHARS} characters` };
    if (/[\0-\x08\x0e-\x1f]/.test(e.report)) return { error: "report has control characters" };
    return { report: { plugin: e.plugin, version: e.version, eviVersion: e.eviVersion, discordBuild: e.discordBuild, report: e.report } };
}

/**
 * What makes two crashes the same, from the report text: the plugin and version, the error's first
 * line, and which parts of Discord couldn't be found or patched. Times, Discord's build and the
 * other plugins someone runs don't count. Hash it for a fingerprint.
 */
export function crashSignature(input: Pick<CrashReportInput, "plugin" | "version" | "report">): { key: string; title: string; } {
    const lines = input.report.split("\n");
    const errorAt = lines.findIndex(l => l.trim() === "Error:");
    const error = errorAt >= 0 ? lines[errorAt + 1]?.trim() ?? "" : "";
    const problems = lines.map(l => l.trim()).filter(l => /^(missing|broken|failed|partial|ambiguous)\b/.test(l)).sort();
    const cleanError = error && error !== "(none recorded)" ? error.replace(/\d{4,}/g, "#").slice(0, 300) : "";
    const title = cleanError || (problems.length ? `Can't find ${problems.length === 1 ? "a part" : `${problems.length} parts`} of Discord: ${problems[0].replace(/^\w+,?\s*/, "")}` : "Crash");
    return { key: [input.plugin, input.version, cleanError, ...problems].join("\n"), title: title.slice(0, 200) };
}
