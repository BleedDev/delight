/**
 * A required Evi version: Evi's team can make every Evi older than it update now (GET /v1/required,
 * set from the Developers page). Evis below it download the update straight away, whatever their own
 * update settings, and restart Discord once nobody's in a call. With `forcePlugins`, store plugins
 * update too (still never past a consent the user hasn't given).
 */
import { compareVersions, isVersion } from "./store";

export interface RequiredUpdate {
    version: string;
    /** Shown in the banner, may be empty */
    reason: string;
    forcePlugins: boolean;
    /** When it was set */
    at: number;
}

export const MAX_REASON = 200;

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** What evi.rest sends, or null for "nothing required" / anything malformed */
export function parseRequired(raw: unknown): RequiredUpdate | null {
    const r = (raw as any)?.required ?? raw;
    if (!r || typeof r !== "object" || !isVersion(r.version)) return null;
    return {
        version: r.version,
        reason: clean(r.reason).slice(0, MAX_REASON),
        forcePlugins: r.forcePlugins === true,
        at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
    };
}

/** An admin's request to require a version */
export function parseRequiredInput(raw: unknown): { version: string; reason: string; forcePlugins: boolean; } | { error: string; } {
    const r = raw as any;
    const version = clean(r?.version).replace(/^v/, "");
    if (!isVersion(version) || version.includes("-")) return { error: "Give a released version, like 2.0.1" };
    const reason = clean(r?.reason);
    if (reason.length > MAX_REASON) return { error: `Keep the reason under ${MAX_REASON} characters` };
    return { version, reason, forcePlugins: r?.forcePlugins === true };
}

/** Whether an Evi on `current` has to update. A beta of the required version or newer counts as there */
export function mustUpdate(required: RequiredUpdate | null | undefined, current: string): boolean {
    if (!required || !isVersion(current)) return false;
    const base = current.replace(/-.*$/, "");
    return compareVersions(base, required.version) < 0;
}
