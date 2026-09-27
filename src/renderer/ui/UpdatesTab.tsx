/**
 * Evi's own updates: what version this is, whether a newer one is out and what's in it, and one button
 * that installs it. Installing closes Discord and opens it again on the new version.
 */
import { isPrerelease, UpdateProgress, UpdateStatus } from "@shared/release";

import { t, useLocale } from "../i18n";
import { Updates } from "../updates";
import { createRoot, React } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { whenAppReady } from "./appReady";
import { Badge, Button, Icon, IconButton, Section, Status, SwitchRow, Text, useExit, useStore } from "./components";
import { ensureStyles } from "./index";
import { DiscordContext } from "./discordContext";

type Available = Extract<UpdateStatus, { state: "available"; }>;

export function progressLabel(p: UpdateProgress) {
    if (p.phase === "downloading") return p.total ? t("updates.downloadingPercent", { percent: Math.floor((p.done ?? 0) / p.total * 100) }) : t("common.downloading");
    if (p.phase === "verifying") return t("updates.verifying");
    return t("updates.installing");
}

function StatusLine({ status, checking }: { status?: UpdateStatus; checking: boolean; }) {
    if (checking) return <Status tone="muted">{t("updates.checking")}</Status>;
    if (!status) return <Status tone="muted">{t("updates.notChecked")}</Status>;
    switch (status.state) {
        case "none": return <Status tone="success" quiet>{t("updates.noReleases")}</Status>;
        case "current": return <Status tone="success" quiet>{t("updates.upToDate")}</Status>;
        case "error": return <Status tone="danger">{status.error}</Status>;
        case "available": {
            const beta = status.release.prerelease && <Badge>{t("updates.beta")}</Badge>;
            return status.installable
                ? <Status tone="warning">{t("updates.available", { version: status.release.version })}{beta}</Status>
                : <Status tone="warning">{`${t("updates.isOut", { version: status.release.version })} ${status.blocked ?? t("updates.devBuild")}`}{beta}</Status>;
        }
    }
}

/** GitHub release notes, shown plainly: headings, list items and paragraphs */
function Notes({ text }: { text: string; }) {
    const blocks: React.ReactNode[] = [];
    let list: string[] = [];
    const flush = () => {
        if (list.length) blocks.push(<ul key={blocks.length} className="dl-update-notes-list">{list.map((item, i) => <li key={i}>{item}</li>)}</ul>);
        list = [];
    };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        if (!line) { flush(); continue; }
        const item = line.match(/^[-*]\s+(.*)$/);
        if (item) { list.push(item[1]); continue; }
        flush();
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        blocks.push(heading
            ? <Text key={blocks.length} tag="h4" variant="text-sm/semibold" color="text-strong">{heading[1]}</Text>
            : <Text key={blocks.length} tag="p" variant="text-sm/normal" color="text-default">{line}</Text>);
    }
    flush();
    return <div className="dl-update-notes">{blocks}</div>;
}

export function UpdatesTab() {
    const { status, checking, installing, error } = useStore(Updates.subscribe, Updates.getSnapshot);
    const [autoCheck, setAutoCheck] = React.useState(Updates.autoCheck);
    const [beta, setBeta] = React.useState(Updates.beta);

    // Opening the tab always looks again
    React.useEffect(() => void Updates.check(true), []);

    const available = status?.state === "available" ? status : undefined;
    const canInstall = !!available?.installable;

    return (
        <div className="dl-tab dl-updates">
            <Section
                title={t("updates.title")}
                description={t("updates.description")}
            >
                <div className="dl-account-card" aria-live="polite">
                    <span className="dl-update-mark"><Icon name="download" size={20} /></span>
                    <div className="dl-account-text">
                        <div className="dl-row-title">
                            <Text variant="text-md/semibold" color="text-strong">Evi {EVI_VERSION}</Text>
                            {isPrerelease(EVI_VERSION) && <Badge>{t("updates.beta")}</Badge>}
                        </div>
                        {installing ? <Status tone="muted">{progressLabel(installing)}</Status> : <StatusLine status={status} checking={checking} />}
                        {error && <Status tone="danger">{t("updates.failed", { error })}</Status>}
                    </div>
                    {canInstall
                        ? <Button variant="accent" icon="download" disabled={!!installing} onClick={() => void Updates.install()}>{installing ? t("common.updating") : t("updates.updateAndRestart")}</Button>
                        : <Button disabled={checking || !!installing} onClick={() => void Updates.check(true)}>{checking ? t("account.checking") : t("updates.check")}</Button>}
                </div>
            </Section>

            {available && (
                <Section title={t("updates.whatsNewIn", { version: available.release.version })}>
                    <div className="dl-stack">
                        {available.release.notes ? <Notes text={available.release.notes} /> : <Text variant="text-sm/normal" color="text-subtle">{t("updates.noNotes")}</Text>}
                        <a className="dl-store-source" href={available.release.url} target="_blank" rel="noreferrer noopener">{t("updates.viewRelease")}</a>
                    </div>
                </Section>
            )}

            <Section>
                <SwitchRow
                    id="dl-update-autocheck"
                    label={t("updates.autoCheck")}
                    description={t("updates.autoCheckHint")}
                    checked={autoCheck}
                    onChange={on => {
                        setAutoCheck(on);
                        Updates.setAutoCheck(on);
                    }}
                />
                <SwitchRow
                    id="dl-update-beta"
                    label={t("updates.betaSwitch")}
                    description={t("updates.betaSwitchHint")}
                    checked={beta}
                    onChange={on => {
                        setBeta(on);
                        void Updates.setBeta(on);
                    }}
                />
            </Section>
        </div>
    );
}

// ---- the notice over Discord ------------------------------------------------------------------

function UpdateNotice({ status, onClose }: { status: Available; onClose(): void; }) {
    const { installing, error } = useStore(Updates.subscribe, Updates.getSnapshot);
    const { version } = status.release;
    return (
        <section className="dl-safe dl-update" aria-labelledby="dl-update-title">
            <div className="dl-safe-head">
                <span className="dl-update-mark"><Icon name="download" size={18} /></span>
                <h2 className="dl-safe-title" id="dl-update-title">{t("updates.available", { version })}</h2>
                {!installing && <IconButton icon="close" label={t("updates.hide")} onClick={onClose} />}
            </div>
            <p className="dl-safe-text">
                {installing ? progressLabel(installing) : t("updates.noticeBody")}
            </p>
            {error && <Status tone="danger">{t("updates.failed", { error })}</Status>}
            <div className="dl-safe-actions">
                <Button variant="accent" icon="download" disabled={!!installing} onClick={() => void Updates.install()}>{installing ? t("common.updating") : t("updates.updateNow")}</Button>
                {!installing && (
                    <Button onClick={() => {
                        Updates.dismiss(version);
                        onClose();
                    }}>{t("updates.skip")}</Button>
                )}
            </div>
        </section>
    );
}

function FloatingNotice({ status, onClose }: { status: Available; onClose(): void; }) {
    // Its own root: follow Discord's language here too
    useLocale();
    const exit = useExit(onClose);
    return <div className="dl-safe-float" {...exit.closingProps}><UpdateNotice status={status} onClose={exit.close} /></div>;
}

let root: ReturnType<typeof createRoot> | undefined;

/** Shows the notice for a version that can be installed from here */
function showUpdateNotice(status: Available) {
    if (!status.installable) return;
    ensureStyles();
    waitFor(filters.byProps("createRoot"), () => whenAppReady(() => {
        if (!root) {
            const container = document.createElement("div");
            container.className = "dl-root";
            document.body.append(container);
            root = createRoot(container);
        }
        const close = () => root?.render(null);
        root.render(<DiscordContext><FloatingNotice status={status} onClose={close} /></DiscordContext>);
    }));
}

/** Checks for Evi updates in the background and says when one is out */
export function startUpdateChecks() {
    Updates.onAvailable(showUpdateNotice);
    Updates.schedule();
}
