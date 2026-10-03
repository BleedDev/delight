/**
 * Crash Detective's breadcrumbs: every couple of seconds, main hears which plugins run and which of
 * their sites took the most time lately (perf.ts), so it can name a suspect if the page crashes or
 * freezes (src/main/safeMode.ts, shared/crashDetective.ts). ui/CrashDetective.tsx brings it up after.
 */
import { Breadcrumb, BREADCRUMB_MS, BUSIEST_SITES, BUSY_WINDOW_S } from "@shared/crashDetective";

import { Native } from "./native";
import { Perf } from "./perf";
import { PluginManager } from "./plugins/manager";
import { SafeMode } from "./safeMode";

let timer: ReturnType<typeof setInterval> | undefined;
let last = "";

/** What the plugins are doing now. Only plugins: Evi's own sites are left out. */
export function takeBreadcrumb(): Breadcrumb {
    const running = PluginManager.getSnapshot().filter(p => p.running).map(p => p.manifest.id);
    const isRunning = new Set(running);
    const breadcrumb: Breadcrumb = {
        at: Date.now(),
        running,
        // Rounded: sub-millisecond noise alone shouldn't count as a change worth sending
        busiest: Perf.busiest(BUSY_WINDOW_S, BUSIEST_SITES, id => isRunning.has(id)).map(s => ({ ...s, ms: Math.round(s.ms) })).filter(s => s.ms > 0),
    };
    const current = Perf.current();
    if (current && isRunning.has(current.site.plugin)) {
        const { plugin, kind, name } = current.site;
        breadcrumb.current = { plugin, kind, name, since: Date.now() - (performance.now() - current.since) };
    }
    return breadcrumb;
}

function tick() {
    const breadcrumb = takeBreadcrumb();
    // Unchanged means the one main has still describes the last few seconds: nothing to send
    const key = JSON.stringify([breadcrumb.running, breadcrumb.busiest, breadcrumb.current]);
    if (key === last) return;
    last = key;
    Native.sendCrashBreadcrumb?.(breadcrumb);
}

let started = false;

/** Hidden, the page renders nothing and plugins mostly wait: the breadcrumb sent on hiding holds */
function follow() {
    clearInterval(timer);
    timer = undefined;
    tick();
    if (!document.hidden) timer = setInterval(tick, BREADCRUMB_MS);
}

export const CrashDetective = {
    /** Starts the breadcrumbs. Safe mode runs no plugins, so there's nothing to report. */
    start() {
        if (started || SafeMode.active) return;
        started = true;
        follow();
        document.addEventListener("visibilitychange", follow);
    },
};
