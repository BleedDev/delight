/**
 * What was already sent to evi.rest, so the same thing isn't sent twice: health reports at most
 * once a day per plugin, version and Discord build, crash reports once per crash per session.
 * Plain functions, no Discord or Evi state, so they can be tested on their own.
 */
import type { HealthReportInput } from "@shared/health";

export const HEALTH_REPORT_EVERY = 24 * 60 * 60 * 1000;

/** Sent health reports: key -> epoch ms */
export type HealthMemory = Record<string, number>;

export const healthKey = (r: Pick<HealthReportInput, "plugin" | "version" | "discordBuild">) => `${r.plugin}@${r.version}#${r.discordBuild}`;

/**
 * Which reports are due, and the memory without entries older than a day. The kind isn't part of
 * the key: evi.rest keeps one report per install and build anyway.
 */
export function dueHealthReports(reports: HealthReportInput[], memory: HealthMemory, now: number) {
    const kept: HealthMemory = {};
    for (const [key, at] of Object.entries(memory)) {
        if (typeof at === "number" && now - at < HEALTH_REPORT_EVERY && at <= now) kept[key] = at;
    }
    const seen = new Set<string>();
    const due = reports.filter(r => {
        const key = healthKey(r);
        if (key in kept || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return { due, memory: kept };
}

/** Parses saved memory, anything unexpected counts as nothing sent */
export function readHealthMemory(saved: string | null | undefined): HealthMemory {
    try {
        const parsed = JSON.parse(saved ?? "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter(([, at]) => typeof at === "number")) as HealthMemory;
    } catch {
        return {};
    }
}

/**
 * The same crash: the plugin, its version and what went wrong (the error's first line, or the
 * first part of Discord it couldn't find). Times and the other plugins in the report don't count.
 */
export function crashKey(plugin: string, version: string, report: string) {
    const lines = report.split("\n").map(l => l.trim());
    const errorAt = lines.indexOf("Error:");
    const error = errorAt >= 0 ? lines[errorAt + 1] ?? "" : "";
    const problem = lines.find(l => /^(missing|broken|failed|partial|ambiguous)\b/.test(l)) ?? "";
    return [plugin, version, error && error !== "(none recorded)" ? error : problem].join("\n");
}

/** A report cut to what evi.rest takes, saying so, so what's shown before sending is what's sent */
export function fitReport(report: string, max: number) {
    if (report.length <= max) return report;
    const note = "\n… (cut here, the report was too long)";
    return report.slice(0, max - note.length) + note;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "yesterday", "just now" */
export function ago(at: number, now = Date.now()) {
    const seconds = Math.round((at - now) / 1000);
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]] as const;
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return "just now";
}
