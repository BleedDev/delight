/**
 * Anonymous usage counts for plugin authors. Once a day an Evi says which store plugins it has and
 * which are on: plugin ids and versions, and Evi's version. No account, messages or anything about
 * the computer; the install id it's sent with (the same random one stars use) is thrown away after
 * two days, when the day's rows become plain counts. It can be turned off in the store's settings.
 */
import { isPluginId, isVersion } from "./store";

export const MAX_CHECKIN_PLUGINS = 200;

export interface CheckinPlugin {
    id: string;
    version: string;
    enabled: boolean;
}

export interface Checkin {
    plugins: CheckinPlugin[];
    eviVersion: string;
}

export function validateCheckin(raw: unknown): Checkin | { error: string; } {
    const c = (raw ?? {}) as Record<string, unknown>;
    if (!isVersion(c.eviVersion)) return { error: "eviVersion must look like 1.2.3" };
    if (!Array.isArray(c.plugins) || c.plugins.length > MAX_CHECKIN_PLUGINS) return { error: `plugins must list at most ${MAX_CHECKIN_PLUGINS}` };
    const seen = new Set<string>();
    const plugins: CheckinPlugin[] = [];
    for (const p of c.plugins) {
        const { id, version, enabled } = (p ?? {}) as Record<string, unknown>;
        if (!isPluginId(id) || !isVersion(version) || typeof enabled !== "boolean") return { error: "Each plugin is { id, version, enabled }" };
        if (seen.has(id)) continue;
        seen.add(id);
        plugins.push({ id, version, enabled });
    }
    return { plugins, eviVersion: c.eviVersion };
}

/** A UTC day as YYYY-MM-DD */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface DayCount {
    day: string;
    /** Installs that have it */
    installed: number;
    /** Installs that have it turned on */
    active: number;
}

export interface VersionStats {
    version: string;
    /** On its latest day */
    installed: number;
    active: number;
    /** Crash reports sent for this version (all time kept), and from how many installs */
    crashes: number;
    crashInstalls: number;
    /** crashInstalls / active, 0-1; null when too few run it to say */
    crashRate: number | null;
}

/** GET /v1/me/analytics?plugin=: the last 30 days, and each version seen in them */
export interface PluginAnalytics {
    plugin: string;
    days: DayCount[];
    versions: VersionStats[];
}

/** Below this many active installs a crash rate says more about luck than the plugin */
export const MIN_RATE_INSTALLS = 5;

export const crashRate = (crashInstalls: number, active: number) => active >= MIN_RATE_INSTALLS ? Math.min(1, crashInstalls / active) : null;
