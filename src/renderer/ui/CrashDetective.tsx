/**
 * Crash Detective's notice: after Discord crashed or froze, names the plugin that was busiest right
 * then and offers to turn it off. Floats over Discord like the safe mode notice, after What's New.
 * When those crashes put Evi in safe mode, the safe mode notice names the suspect instead.
 */
import { activeSuspect, CrashRecord, CrashSuspect, describeSite, isOfferable } from "@shared/crashDetective";

import { t, tNodes, useLocale } from "../i18n";
import { Logger } from "../logger";
import { Native } from "../native";
import { PluginManager } from "../plugins/manager";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { openLayer } from "../toolkit/layer";
import { React } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { whenAppReady } from "./appReady";
import { Button, Icon, useExit } from "./components";
import { ensureStyles } from "./index";
import { afterWhatsNew } from "./WhatsNew";

const logger = new Logger("CrashDetective", "#f0b232");

/** What the suspect was doing, in words: "a hook on sendMessage" */
export function describeCrashSite(site: CrashSuspect["site"]) {
    const { words, name } = describeSite(site);
    return t(`crashDetective.site.${words}`, { name });
}

export function suspectName(suspect: CrashSuspect) {
    return PluginManager.get(suspect.plugin)?.manifest.name ?? suspect.plugin;
}

/** "Right before it did, **Plugin** was busy (a hook on sendMessage)." */
export function SuspectLine({ suspect, inSafeMode }: { suspect: CrashSuspect; inSafeMode?: boolean; }) {
    const key = inSafeMode ? `crashDetective.safeMode.${suspect.why}` as const : `crashDetective.${suspect.why}` as const;
    return <>{tNodes(key, { name: <strong className="dl-safe-suspect">{suspectName(suspect)}</strong> }, { what: describeCrashSite(suspect.site) })}</>;
}

function CrashNotice({ record, suspect, onClosed }: { record: CrashRecord; suspect: CrashSuspect; onClosed(): void; }) {
    useLocale();
    const exit = useExit(onClosed);
    const [busy, setBusy] = React.useState(false);
    const name = suspectName(suspect);

    const answer = (turnOff: boolean) => async () => {
        // Seen either way: asked once, not after every reload
        Native.markCrashSeen?.();
        if (turnOff) {
            setBusy(true);
            try {
                await PluginManager.setEnabled(suspect.plugin, false);
            } catch (err) {
                logger.error(`Couldn't turn off ${name}`, err);
            }
        }
        exit.close();
    };

    return (
        <div className="dl-safe-float" {...exit.closingProps}>
            <section className="dl-safe" aria-labelledby="dl-crash-title" data-reason={record.reason}>
                <div className="dl-safe-head">
                    <span className="dl-safe-icon"><Icon name="warning" size={18} /></span>
                    <h2 className="dl-safe-title" id="dl-crash-title">
                        {t(record.reason === "unresponsive" ? "crashDetective.title.froze" : "crashDetective.title.crashed")}
                    </h2>
                </div>
                <p className="dl-safe-text"><SuspectLine suspect={suspect} /></p>
                <p className="dl-safe-text dl-safe-meta">{t("crashDetective.hint")}</p>
                <div className="dl-safe-actions">
                    <Button variant="accent" disabled={busy} onClick={answer(true)}>{t("crashDetective.disable", { name })}</Button>
                    <Button disabled={busy} onClick={answer(false)}>{t("crashDetective.keep")}</Button>
                </div>
            </section>
        </div>
    );
}

let checked = false;
/**
 * After a reload that followed a crash or freeze, asks main for the record and offers to turn the
 * suspect off, if it's still installed and on. Safe mode folds it into its own notice instead.
 */
export async function showCrashDetective() {
    if (checked || SafeMode.active) return;
    checked = true;
    // Optional: a main process older than this renderer (dev, after Ctrl+R) doesn't have it
    const record = await Native.getCrashRecord?.().catch(() => undefined);
    if (!record) return;
    const manifests = PluginManager.getSnapshot().map(p => p.manifest);
    const suspect = isOfferable(record, Date.now()) ? activeSuspect(record, Settings.data, manifests) : undefined;
    // Nothing to offer: don't bring this crash up again
    if (!suspect) return void Native.markCrashSeen?.();

    ensureStyles();
    waitFor(filters.byProps("createRoot"), () => whenAppReady(() => afterWhatsNew(() => {
        // They may have turned it off themselves in the meantime
        if (!activeSuspect(record, Settings.data, PluginManager.getSnapshot().map(p => p.manifest))) return void Native.markCrashSeen?.();
        // The notice plays its own exit (useExit), then the layer goes at once
        openLayer(close => <CrashNotice record={record} suspect={suspect} onClosed={() => close({ instant: true })} />, { className: "dl-root" });
    })));
}
