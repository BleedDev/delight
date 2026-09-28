/**
 * Reporting a store plugin: a scam, stolen code, something harmful or badly broken. Sent from the
 * store page in Evi (POST /v1/plugins/:id/reports) and reviewed by admins in the admin console, who
 * can pull the plugin (pulls.ts) from there.
 */
import { isPluginId, isVersion } from "./store";
import { englishTr, Tr } from "./tr";

export type ReportReason = "malicious" | "scam" | "stolen" | "broken" | "other";

export const REPORT_REASONS: readonly { value: ReportReason; label: string; }[] = [
    { value: "malicious", label: "It does something harmful" },
    { value: "scam", label: "It's a scam or fake" },
    { value: "stolen", label: "It's someone else's work" },
    { value: "broken", label: "It's badly broken" },
    { value: "other", label: "Something else" },
];

export interface PluginReportInput {
    reason: ReportReason;
    /** What they saw; required for "other" */
    details: string;
    /** The version they have or looked at */
    version?: string;
}

export type ReportStatus = "open" | "resolved" | "dismissed";

/** A report as admins see it (GET /v1/admin/reports) */
export interface PluginReport {
    id: string;
    /** The plugin's id, or the theme's for a theme report */
    plugin: string;
    /** Set for reports about a store theme (POST /v1/themes/:id/reports) */
    kind?: "theme";
    version?: string;
    reason: ReportReason;
    details: string;
    status: ReportStatus;
    /** The admin's note when they closed it */
    note: string;
    /** Reports of the same plugin still open, including this one */
    openForPlugin: number;
    /** Set when the install was linked to a Discord account */
    reporter?: { id: string; username: string; globalName: string | null; };
    createdAt: number;
    closedAt?: number;
}

export function validatePluginReport(plugin: unknown, raw: unknown, tr: Tr = englishTr): { report: PluginReportInput & { plugin: string; }; } | { error: string; } {
    if (!isPluginId(plugin)) return { error: "plugin must be a plugin id" };
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!REPORT_REASONS.some(r => r.value === e.reason)) return { error: `reason must be one of ${REPORT_REASONS.map(r => r.value).join(", ")}` };
    const details = e.details ?? "";
    if (typeof details !== "string" || details.length > 1000 || /[\0-\x08\x0e-\x1f]/.test(details)) return { error: tr("check.report.details") };
    if (e.reason === "other" && !details.trim()) return { error: tr("check.report.sayWhat") };
    if (e.version !== undefined && !isVersion(e.version)) return { error: "version must look like 1.2.3" };
    return { report: { plugin, reason: e.reason as ReportReason, details: details.trim(), ...(isVersion(e.version) && { version: e.version }) } };
}
