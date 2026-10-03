/**
 * Tells main whether a call keeps Discord busy and where it is, for what main does while Discord
 * sits unused (main/idle.ts). Main never trims or restarts on a stale or unknown answer: every store
 * that can start a call reports here as it changes.
 */
import { IdleReport, isBusy, isChannelPath } from "@shared/idle";

import { Logger } from "./logger";
import { Native } from "./native";
import { filters, find, findStore } from "./webpack/find";

const logger = new Logger("Idle");
const POLL_MS = 5000;
const STORES = ["SelectedChannelStore", "RTCConnectionStore", "CallStore", "ApplicationStreamingStore"];

const mb = (kb?: number) => kb === undefined ? "?" : `${Math.round(kb / 1024)} MB`;

function current(): IdleReport {
    return {
        busy: isBusy({
            selectedChannel: findStore("SelectedChannelStore"),
            rtcConnection: findStore("RTCConnectionStore"),
            call: findStore("CallStore"),
            streaming: findStore("ApplicationStreamingStore"),
        }),
        path: location.pathname,
    };
}

export function startIdleReports() {
    // Popouts have their own windows; only the main one counts
    if (!Native.reportIdle || location.pathname.startsWith("/popout")) return;

    let last = "";
    const send = () => {
        const report = current();
        const key = JSON.stringify(report);
        if (key === last) return;
        last = key;
        Native.reportIdle(report);
    };
    send();
    setInterval(send, POLL_MS);
    for (const name of STORES) {
        try {
            findStore(name)?.addChangeListener?.(send);
        } catch { }
    }

    Native.onMemoryTrim((before, after) => {
        logger.debug(`Discord was hidden a while, emptied its caches: private ${mb(before?.private)} -> ${mb(after?.private)}, resident ${mb(before?.residentSet)} -> ${mb(after?.residentSet)}`);
    });

    void Native.idleRestorePath().then(path => {
        if (!isChannelPath(path) || location.pathname === path) return;
        const go = find(filters.byCode("transitionTo - Transitioning to"));
        if (typeof go === "function") go(path);
    }).catch(() => { });
}
