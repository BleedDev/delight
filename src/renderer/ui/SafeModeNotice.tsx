/**
 * Explains safe mode, names the most likely culprit and offers the two ways out. Shown floating over
 * Discord when safe mode starts, and on top of the Plugins tab for as long as it lasts.
 */
import type { RecentChange, SafeModeInfo } from "@shared/ipc";
import { isStillActive, pickSuspect } from "@shared/safeMode";

import { PluginManager } from "../plugins/manager";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { Themes } from "../themes";
import { createRoot, React } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { Button, Icon, IconButton, useExit, useStore } from "./components";
import { ensureStyles } from "./index";

const ACTIONS: Record<RecentChange["action"], string> = {
    enabled: "turned on",
    settings: "settings changed",
    installed: "added",
    updated: "updated",
    edited: "edited",
};

const reasons: Record<SafeModeInfo["reason"], (info: SafeModeInfo) => string> = {
    "crash-loop": info => `Discord didn’t finish starting the last ${info.failures} times, so Evi started it without plugins, themes or Quick CSS.`,
    "renderer-crash": () => "Discord crashed several times in a row, so Evi turned off plugins, themes and Quick CSS.",
    "flag": () => "Discord was started with --evi-safe, so plugins, themes and Quick CSS are off for this session.",
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(at: number) {
    const seconds = Math.round((at - Date.now()) / 1000);
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]] as const;
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return "just now";
}

function nameOf(change: RecentChange) {
    if (change.kind === "plugin") return PluginManager.get(change.id)?.manifest.name ?? change.id;
    if (change.kind === "theme") return Themes.getSnapshot().find(t => t.file === change.id)?.name ?? change.id;
    return "Quick CSS";
}

function describe(change: RecentChange) {
    const kind = change.kind === "plugin" ? "plugin" : change.kind === "theme" ? "theme" : "";
    return `${kind ? `${kind}, ` : ""}${ACTIONS[change.action]} ${ago(change.at)}`;
}

export function SafeModeNotice({ onDismiss }: { onDismiss?(): void; }) {
    const plugins = useStore(PluginManager.subscribe, PluginManager.getSnapshot);
    const settings = useStore(Settings.subscribe, () => Settings.data);
    useStore(Themes.subscribe, Themes.getSnapshot);
    const [busy, setBusy] = React.useState(false);

    const { info } = SafeMode;
    if (!info) return null;

    const manifests = plugins.map(p => p.manifest);
    const suspect = pickSuspect(info.changes, settings, manifests);
    const others = info.changes.filter(c => c !== suspect && isStillActive(c, settings, manifests)).slice(0, 3);

    const run = (action: () => Promise<unknown>) => async () => {
        setBusy(true);
        try {
            await action();
        } finally {
            // Only reached if the restart didn't happen
            setBusy(false);
        }
    };

    return (
        <section className="dl-safe" aria-labelledby="dl-safe-title" data-reason={info.reason}>
            <div className="dl-safe-head">
                <span className="dl-safe-icon"><Icon name="warning" size={18} /></span>
                <h2 className="dl-safe-title" id="dl-safe-title">Evi is in safe mode</h2>
                {onDismiss && <IconButton icon="close" label="Hide safe mode notice" onClick={onDismiss} />}
            </div>
            <p className="dl-safe-text">{reasons[info.reason](info)} Discord itself works normally.</p>
            {suspect ? (
                <p className="dl-safe-text">
                    Most recent change: <strong className="dl-safe-suspect">{nameOf(suspect)}</strong>
                    <span className="dl-safe-meta"> ({describe(suspect)})</span>
                </p>
            ) : (
                <p className="dl-safe-text">No recent plugin, theme or Quick CSS changes were recorded.</p>
            )}
            {others.length > 0 && (
                <div className="dl-safe-text">
                    Also changed recently:
                    <ul className="dl-safe-changes">
                        {others.map(c => (
                            <li key={`${c.kind}:${c.id}:${c.action}`}>
                                {nameOf(c)} <span className="dl-safe-meta">({describe(c)})</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="dl-safe-actions">
                {suspect && (
                    <Button variant="accent" disabled={busy} onClick={run(() => SafeMode.disableAndExit(suspect))}>
                        Disable {nameOf(suspect)} and restart
                    </Button>
                )}
                <Button disabled={busy} onClick={run(() => SafeMode.exit())}>Exit safe mode and restart</Button>
            </div>
        </section>
    );
}

/** One line for the Themes and Quick CSS tabs */
export function SafeModeHint({ what }: { what: string; }) {
    if (!SafeMode.active) return null;
    return (
        <div className="dl-banner" role="status">
            <Icon name="warning" />
            <span>Safe mode is on: {what} aren’t applied until you exit it from the Plugins tab.</span>
        </div>
    );
}

function FloatingNotice({ onClose }: { onClose(): void; }) {
    const exit = useExit(onClose);
    return <div className="dl-safe-float" {...exit.closingProps}><SafeModeNotice onDismiss={exit.close} /></div>;
}

function Floating() {
    const [open, setOpen] = React.useState(true);
    return open ? <FloatingNotice onClose={() => setOpen(false)} /> : null;
}

let shown = false;
export function showSafeModeNotice() {
    if (shown) return;
    shown = true;
    ensureStyles();
    const mount = () => {
        const container = document.createElement("div");
        container.className = "dl-root";
        document.body.append(container);
        createRoot(container).render(<Floating />);
    };
    // react-dom/client loads after React and Flux, which is all onCommonReady waits for
    waitFor(filters.byProps("createRoot"), () => {
        if (document.body) mount();
        else document.addEventListener("DOMContentLoaded", mount, { once: true });
    });
}
