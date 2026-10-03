/**
 * "What's new in <Plugin>": after installed plugins update (from the store, auto-update, or with Evi
 * itself), what changed since the version you last saw, once, in the same modal as Evi's own
 * release notes. Several updated plugins share one popup. Never on a first install, and not while
 * Evi's own "What's new" is up: it waits for that to close. The logic is src/shared/pluginChangelog.ts.
 */
import { detectPluginUpdates, mergeUpdates, PluginUpdate } from "@shared/pluginChangelog";

import { t } from "../i18n";
import { PluginManager } from "../plugins/manager";
import { Settings } from "../settings";
import { Store } from "../store";
import { onCreateRootReady, React } from "../webpack/common";
import { whenAppReady } from "./appReady";
import { Button, SwitchRow, Text, useStore } from "./components";
import { ensureStyles } from "./index";
import { afterWhatsNew, ChangelogModal, inline } from "./WhatsNew";
import { mountRoot } from "./discordContext";

export function PluginChangelogModal({ updates, onClose, onTurnOff }: { updates: PluginUpdate[]; onClose(): void; onTurnOff?(): void; }) {
    const single = updates.length === 1 ? updates[0] : undefined;
    return (
        <ChangelogModal
            className="dl-plugin-whats-new"
            titleId="dl-plugin-whats-new-title"
            eyebrow={t("pluginNotes.eyebrow")}
            title={single ? t("pluginNotes.titleOne", { name: single.name, version: single.to }) : t("pluginNotes.titleMany", { count: updates.length })}
            subtitle={single && t("pluginNotes.updatedFrom", { from: single.from, to: single.to })}
            onClose={onClose}
            footer={close => (
                <div className="dl-plugin-whats-new-footer">
                    <Text variant="text-xs/normal" color="text-muted" className="dl-grow">{t("pluginNotes.footer")}</Text>
                    {onTurnOff && (
                        <Button onClick={() => {
                            onTurnOff();
                            close();
                        }}>{t("pluginNotes.stop")}</Button>
                    )}
                    <button type="button" className="dl-notes-done" onClick={close}>{t("common.gotIt")}</button>
                </div>
            )}
        >
            <div className="dl-whats-new-notes" role="region" aria-label={t("whatsNew.contentLabel")} tabIndex={0}>
                {updates.map(u => (
                    <section key={u.id} className="dl-plugin-whats-new-plugin" data-plugin={u.id} aria-label={`${u.name} ${u.to}`}>
                        {!single && <Text tag="h2" variant="heading-md/bold" className="dl-whats-new-title dl-whats-new-improved">{u.name} {u.to}</Text>}
                        {u.entries.map(e => (
                            <React.Fragment key={e.version}>
                                {/* One version needs no heading: the title (or the plugin's heading) already names it */}
                                {u.entries.length > 1 && <Text tag="h3" variant="text-sm/semibold" color="text-muted" className="dl-plugin-whats-new-version" tabular>{t("pluginNotes.version", { version: e.version })}</Text>}
                                <ul className="dl-whats-new-list">
                                    {e.notes.map(n => <li className="dl-whats-new-item" key={n}>{inline(n)}</li>)}
                                </ul>
                            </React.Fragment>
                        ))}
                    </section>
                ))}
            </div>
        </ChangelogModal>
    );
}

let shown: PluginUpdate[] = [];
const listeners = new Set<() => void>();
let mounted = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function setShown(next: PluginUpdate[]) {
    shown = next;
    for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
};

function Popup() {
    const updates = useStore(subscribe, () => shown);
    if (!updates.length) return null;
    return (
        <PluginChangelogModal
            updates={updates}
            onClose={() => setShown([])}
            onTurnOff={() => {
                Settings.update(d => {
                    d.pluginChangelogs = false;
                });
            }}
        />
    );
}

function show(updates: PluginUpdate[]) {
    // Turned off while it waited for Evi's own "What's new" to close
    if (Settings.data.pluginChangelogs === false) return;
    setShown(mergeUpdates(shown, updates));
    if (mounted) return;
    mounted = true;
    ensureStyles();
    onCreateRootReady(() => whenAppReady(() => {
        mountRoot(<Popup />);
    }));
}

/** Compares installed versions with the ones last seen, remembers the new ones, shows what changed */
export function checkPluginUpdates() {
    timer = undefined;
    // Update all installs one plugin after another: one popup at the end, not one per plugin
    if (Store.getSnapshot().updatingAll) return scheduleCheck();

    const plugins = PluginManager.getSnapshot().map(({ manifest }) => ({
        id: manifest.id, name: manifest.name, version: manifest.version, changelog: manifest.changelog,
    }));
    const { updates, seen, changed } = detectPluginUpdates(plugins, Settings.data.pluginVersionsSeen);
    // Remembered even with popups off, so turning them back on doesn't bring up old news
    if (changed) Settings.update(d => {
        d.pluginVersionsSeen = seen;
    });
    if (updates.length && Settings.data.pluginChangelogs !== false) afterWhatsNew(() => show(updates));
}

function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(checkPluginUpdates, 1500);
}

let started = false;

/** At startup (not in safe mode), and whenever plugins change on disk after that */
export function startPluginChangelogs() {
    if (started) return;
    started = true;
    checkPluginUpdates();
    PluginManager.subscribe(scheduleCheck);
}

/** The switch for it, in the Plugin Store's settings */
export function PluginChangelogSetting() {
    const settings = useStore(Settings.subscribe, () => Settings.data);
    return (
        <li className="dl-row">
            <SwitchRow
                id="dl-plugin-changelogs"
                label={t("pluginNotes.setting")}
                description={t("pluginNotes.settingHint")}
                checked={settings.pluginChangelogs !== false}
                onChange={on => Settings.update(d => {
                    d.pluginChangelogs = on;
                })}
            />
        </li>
    );
}
