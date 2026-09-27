/**
 * Evi's own updates: what version this is, whether a newer one is out and what's in it, and one button
 * that installs it. Installing closes Discord and opens it again on the new version.
 */
import type { UpdateProgress, UpdateStatus } from "@shared/release";

import { Updates } from "../updates";
import { createRoot, React } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { Button, Icon, IconButton, Section, Status, SwitchRow, Text, useExit, useStore } from "./components";
import { ensureStyles } from "./index";

type Available = Extract<UpdateStatus, { state: "available"; }>;

export function progressLabel(p: UpdateProgress) {
    if (p.phase === "downloading") return p.total ? `Downloading… ${Math.floor((p.done ?? 0) / p.total * 100)}%` : "Downloading…";
    if (p.phase === "verifying") return "Checking the download…";
    return "Installing. Discord restarts in a moment…";
}

function StatusLine({ status, checking }: { status?: UpdateStatus; checking: boolean; }) {
    if (checking) return <Status tone="muted">Checking for updates…</Status>;
    if (!status) return <Status tone="muted">Not checked yet</Status>;
    switch (status.state) {
        case "none": return <Status tone="success" quiet>Up to date. No release has been published yet.</Status>;
        case "current": return <Status tone="success" quiet>Up to date</Status>;
        case "error": return <Status tone="danger">{status.error}</Status>;
        case "available": return status.installable
            ? <Status tone="warning">{`Evi ${status.release.version} is available`}</Status>
            : <Status tone="warning">{`Evi ${status.release.version} is out. ${status.blocked ?? "This is a dev build: update it with git pull and bun run build."}`}</Status>;
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

    // Opening the tab always looks again
    React.useEffect(() => void Updates.check(true), []);

    const available = status?.state === "available" ? status : undefined;
    const canInstall = !!available?.installable;

    return (
        <div className="dl-tab dl-updates">
            <Section
                title="Evi updates"
                description="New versions of Evi come from its releases on GitHub. Updating closes Discord and opens it again on the new version. Your plugins, themes and settings stay."
            >
                <div className="dl-account-card" aria-live="polite">
                    <span className="dl-update-mark"><Icon name="download" size={20} /></span>
                    <div className="dl-account-text">
                        <Text variant="text-md/semibold" color="text-strong">Evi {EVI_VERSION}</Text>
                        {installing ? <Status tone="muted">{progressLabel(installing)}</Status> : <StatusLine status={status} checking={checking} />}
                        {error && <Status tone="danger">{`Couldn’t update: ${error}`}</Status>}
                    </div>
                    {canInstall
                        ? <Button variant="accent" icon="download" disabled={!!installing} onClick={() => void Updates.install()}>{installing ? "Updating…" : "Update and restart Discord"}</Button>
                        : <Button disabled={checking || !!installing} onClick={() => void Updates.check(true)}>{checking ? "Checking…" : "Check for updates"}</Button>}
                </div>
            </Section>

            {available && (
                <Section title={`What’s new in ${available.release.version}`}>
                    <div className="dl-stack">
                        {available.release.notes ? <Notes text={available.release.notes} /> : <Text variant="text-sm/normal" color="text-subtle">This release has no notes.</Text>}
                        <a className="dl-store-source" href={available.release.url} target="_blank" rel="noreferrer noopener">View the release on GitHub</a>
                    </div>
                </Section>
            )}

            <Section>
                <SwitchRow
                    id="dl-update-autocheck"
                    label="Check for updates when Discord starts"
                    description="Tells you when a new version of Evi is out. Nothing installs until you say so."
                    checked={autoCheck}
                    onChange={on => {
                        setAutoCheck(on);
                        Updates.setAutoCheck(on);
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
                <h2 className="dl-safe-title" id="dl-update-title">Evi {version} is available</h2>
                {!installing && <IconButton icon="close" label="Hide for now" onClick={onClose} />}
            </div>
            <p className="dl-safe-text">
                {installing ? progressLabel(installing) : "Updating closes Discord and opens it again on the new version. Your plugins, themes and settings stay."}
            </p>
            {error && <Status tone="danger">{`Couldn’t update: ${error}`}</Status>}
            <div className="dl-safe-actions">
                <Button variant="accent" icon="download" disabled={!!installing} onClick={() => void Updates.install()}>{installing ? "Updating…" : "Update now"}</Button>
                {!installing && (
                    <Button onClick={() => {
                        Updates.dismiss(version);
                        onClose();
                    }}>Skip this version</Button>
                )}
            </div>
        </section>
    );
}

function FloatingNotice({ status, onClose }: { status: Available; onClose(): void; }) {
    const exit = useExit(onClose);
    return <div className="dl-safe-float" {...exit.closingProps}><UpdateNotice status={status} onClose={exit.close} /></div>;
}

let root: ReturnType<typeof createRoot> | undefined;

/** Shows the notice for a version that can be installed from here */
function showUpdateNotice(status: Available) {
    if (!status.installable) return;
    ensureStyles();
    waitFor(filters.byProps("createRoot"), () => {
        if (!root) {
            const container = document.createElement("div");
            container.className = "dl-root";
            document.body.append(container);
            root = createRoot(container);
        }
        const close = () => root?.render(null);
        root.render(<FloatingNotice status={status} onClose={close} />);
    });
}

/** Checks for Evi updates in the background and says when one is out */
export function startUpdateChecks() {
    Updates.onAvailable(showUpdateNotice);
    Updates.schedule();
}
