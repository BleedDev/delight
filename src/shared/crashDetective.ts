/**
 * Crash Detective: when Discord crashes or freezes, which plugin was busiest right then.
 *
 * Every couple of seconds the renderer tells main what's going on (a breadcrumb: which plugins run,
 * the plugin sites that took the most time lately, and the site running at that instant if any).
 * Main keeps the latest one, and when Discord's page dies or stops responding it writes a crash
 * record naming a suspect into safe-mode.json. After the reload the renderer offers to turn it off.
 *
 * Pure functions, no Electron: main, renderer and tests share them.
 */
import { EviSettings, isPluginEnabled, PluginManifest } from "./ipc";

/** How often the renderer sends a breadcrumb (only when it changed) */
export const BREADCRUMB_MS = 2000;
/** The breadcrumb's "busiest" window */
export const BUSY_WINDOW_S = 5;
/** Sites listed in a breadcrumb */
export const BUSIEST_SITES = 5;
/** Less than this within the window isn't busy, just running: not worth blaming */
export const MIN_BUSY_MS = 100;
/** A breadcrumb's running site only counts if the breadcrumb was sent this shortly before the crash */
export const CURRENT_FRESH_MS = 2 * BREADCRUMB_MS + 1000;
/** A crash older than this isn't worth bringing up any more */
export const RECORD_MAX_AGE_MS = 60 * 60_000;

export interface BreadcrumbSite {
    plugin: string;
    /** perf.ts SiteKind: hook, flux, patch, badges, menu, timer, keybind, start */
    kind: string;
    name: string;
    /** Time spent there within the last BUSY_WINDOW_S seconds */
    ms: number;
}

export interface Breadcrumb {
    /** Epoch ms it was sent */
    at: number;
    /** Ids of the plugins running */
    running: string[];
    /** Slowest first, at most BUSIEST_SITES, plugins only */
    busiest: BreadcrumbSite[];
    /** A plugin site that was running when the breadcrumb was taken; `since` is epoch ms */
    current?: { plugin: string; kind: string; name: string; since: number; };
}

export interface CrashSuspect {
    plugin: string;
    /** `running`: its code was running at the crash. `busiest`: it took the most time right before. */
    why: "running" | "busiest";
    site: { kind: string; name: string; ms?: number; };
}

/** Electron's render-process-gone reason ("crashed", "oom", "killed"...), or "unresponsive" for a freeze */
export interface CrashRecord {
    /** Epoch ms */
    at: number;
    reason: string;
    suspect?: CrashSuspect;
    breadcrumb?: Breadcrumb;
    /** The user saw it (or it had nothing to say): not brought up again */
    seen?: boolean;
}

/**
 * Who to blame for a crash at `crashAt`: the plugin whose code was running then (if the breadcrumb
 * is recent enough to say so), else the plugin that took the most time within the window, else no one.
 * Only plugins the breadcrumb lists as running count, never Evi itself.
 */
export function pickCrashSuspect(breadcrumb: Breadcrumb | undefined, crashAt: number): CrashSuspect | undefined {
    if (!breadcrumb) return;
    const running = new Set(breadcrumb.running);

    const { current } = breadcrumb;
    if (current && running.has(current.plugin) && crashAt - breadcrumb.at <= CURRENT_FRESH_MS) {
        return { plugin: current.plugin, why: "running", site: { kind: current.kind, name: current.name } };
    }

    // Per plugin, since one plugin's time can be spread over several sites
    const totals = new Map<string, number>();
    for (const site of breadcrumb.busiest) {
        if (running.has(site.plugin)) totals.set(site.plugin, (totals.get(site.plugin) ?? 0) + site.ms);
    }
    let best: string | undefined;
    for (const [plugin, ms] of totals) {
        if (ms >= MIN_BUSY_MS && (!best || ms > totals.get(best)!)) best = plugin;
    }
    if (!best) return;
    // busiest is sorted, so the first of its sites is its slowest
    const top = breadcrumb.busiest.find(s => s.plugin === best)!;
    return { plugin: best, why: "busiest", site: { kind: top.kind, name: top.name, ms: totals.get(best) } };
}

/** Whether the record is still worth a notice: unseen, recent, and naming someone */
export function isOfferable(record: CrashRecord | undefined, now: number): record is CrashRecord & { suspect: CrashSuspect; } {
    return !!record && !record.seen && !!record.suspect && now - record.at >= 0 && now - record.at <= RECORD_MAX_AGE_MS;
}

/** The record's suspect if it's still installed and on: only then is there anything to turn off */
export function activeSuspect(record: CrashRecord | undefined, settings: EviSettings, manifests: PluginManifest[]): CrashSuspect | undefined {
    const suspect = record?.suspect;
    const manifest = suspect && manifests.find(m => m.id === suspect.plugin);
    return manifest && isPluginEnabled(settings, manifest) ? suspect : undefined;
}

export type SiteWords = "hook" | "flux" | "patch" | "badges" | "menu" | "timer" | "interval" | "keybind" | "start" | "other";

/**
 * A site in words, as a locale key suffix (crashDetective.site.<words>) and the name to put in it:
 * "after sendMessage" -> a hook on sendMessage, "$self.renderButton" -> renderButton.
 */
export function describeSite(site: { kind: string; name: string; }): { words: SiteWords; name: string; } {
    const { kind, name } = site;
    switch (kind) {
        case "hook": {
            // "before|instead|after Holder.key", and hooks.ts adds " (fnName)" when the function's own name differs
            const target = name.replace(/^(before|instead|after) /, "").replace(/ \(.*\)$/, "");
            return { words: "hook", name: target };
        }
        case "patch":
            return { words: "patch", name: name.replace(/^\$self\./, "") };
        case "timer": {
            const every = /^setInterval (\d+(?:\.\d+)?) ms$/.exec(name);
            return every ? { words: "interval", name: every[1] } : { words: "timer", name };
        }
        case "flux":
        case "badges":
        case "menu":
        case "keybind":
        case "start":
            return { words: kind, name };
        default:
            return { words: "other", name };
    }
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseSite(v: unknown): BreadcrumbSite | undefined {
    if (!isObj(v) || !isStr(v.plugin) || !isStr(v.kind) || !isStr(v.name) || !isNum(v.ms)) return;
    return { plugin: v.plugin, kind: v.kind, name: v.name, ms: v.ms };
}

/** A breadcrumb from the page, or undefined if it isn't one. Main checks what the renderer sends. */
export function parseBreadcrumb(v: unknown): Breadcrumb | undefined {
    if (!isObj(v) || !isNum(v.at) || !Array.isArray(v.running) || !Array.isArray(v.busiest)) return;
    const out: Breadcrumb = {
        at: v.at,
        running: v.running.filter(isStr).slice(0, 500),
        busiest: v.busiest.map(parseSite).filter((s): s is BreadcrumbSite => !!s).slice(0, BUSIEST_SITES),
    };
    const c = v.current;
    if (isObj(c) && isStr(c.plugin) && isStr(c.kind) && isStr(c.name) && isNum(c.since)) {
        out.current = { plugin: c.plugin, kind: c.kind, name: c.name, since: c.since };
    }
    return out;
}

/** A crash record read from disk, or undefined if it's missing or damaged */
export function parseCrashRecord(v: unknown): CrashRecord | undefined {
    if (!isObj(v) || !isNum(v.at) || !isStr(v.reason)) return;
    const out: CrashRecord = { at: v.at, reason: v.reason };
    const s = v.suspect;
    if (isObj(s) && isStr(s.plugin) && (s.why === "running" || s.why === "busiest") && isObj(s.site) && isStr(s.site.kind) && isStr(s.site.name)) {
        out.suspect = { plugin: s.plugin, why: s.why, site: { kind: s.site.kind, name: s.site.name } };
        if (isNum(s.site.ms)) out.suspect.site.ms = s.site.ms;
    }
    const breadcrumb = parseBreadcrumb(v.breadcrumb);
    if (breadcrumb) out.breadcrumb = breadcrumb;
    if (v.seen === true) out.seen = true;
    return out;
}
