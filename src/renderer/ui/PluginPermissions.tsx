/**
 * What a plugin can touch, as a short list of rows with a risk level each: in an installed plugin's
 * details (the Plugins tab) and on a store plugin's page, before it's installed. The analysis itself
 * is src/shared/pluginPermissions.ts.
 */
import { analyzePermissions, Capability, PermissionsReport, Risk, RISK_LABELS, riskSummary, StorePreviewResult } from "@shared/pluginPermissions";

import { Native } from "../native";
import type { PluginState } from "../plugins/manager";
import { PluginUsage } from "../plugins/usage";
import { React } from "../webpack/common";
import { Badge, Dialog, Icon, IconButton, IconName, Status, Text, Tone } from "./components";

const riskTone: Record<Risk, Tone> = { low: "success", medium: "warning", high: "danger" };
const riskIcon: Record<Risk, IconName> = { low: "circleCheck", medium: "info", high: "warning" };
const riskWord: Record<Risk, string> = { low: "Low", medium: "Medium", high: "High" };

function CapabilityRow({ capability: c }: { capability: Capability; }) {
    return (
        <li className="dl-perms-item" data-risk={c.risk} data-capability={c.id}>
            <Icon name={riskIcon[c.risk]} size={16} />
            <div className="dl-perms-text">
                <div className="dl-perms-title">
                    <Text variant="text-sm/semibold" color="text-strong">{c.title}</Text>
                    <span className="dl-perms-risk" data-risk={c.risk}>{riskWord[c.risk]}</span>
                </div>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{c.description}</Text>
                {c.details.length > 0 && (
                    <ul className="dl-perms-details" aria-label={`${c.title}: details`}>
                        {c.details.map(d => <li key={d} className="dl-perms-detail">{d}</li>)}
                    </ul>
                )}
            </div>
        </li>
    );
}

/** The list itself: the overall risk, then one row per capability, highest risk first */
export function PermissionsList({ report, pending, error, note }: {
    report: PermissionsReport;
    /** The code is still being fetched: what's shown so far comes from the listing */
    pending?: boolean;
    /** Why the code couldn't be read */
    error?: string;
    note?: string;
}) {
    return (
        <div className="dl-perms" data-risk={report.risk}>
            <div className="dl-perms-head">
                <Status tone={riskTone[report.risk]}>{RISK_LABELS[report.risk]}</Status>
                <Text variant="text-sm/normal" color="text-subtle">{riskSummary(report)}</Text>
            </div>
            {report.capabilities.length > 0 && (
                <ul className="dl-perms-list">
                    {report.capabilities.map(c => <CapabilityRow key={c.id} capability={c} />)}
                </ul>
            )}
            <span role="status">
                {pending && <Status tone="muted">Checking its code…</Status>}
                {error && <Status tone="muted">Couldn’t check its code ({error}), so this only shows what its store listing says.</Status>}
            </span>
            <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-perms-note">
                {note ?? "Found by reading its code. A plugin can still do things its code doesn’t spell out, so only install plugins from authors you trust."}
            </Text>
        </div>
    );
}

// ---- installed plugins ------------------------------------------------------------------------

export function reportForInstalled(state: PluginState) {
    return analyzePermissions({
        code: state.code,
        manifest: state.manifest,
        patches: state.definition?.patches,
        settings: Object.keys(state.definition?.settings ?? {}),
        runtime: PluginUsage.get(state.manifest.id),
    });
}

export function InstalledPluginPermissions({ state }: { state: PluginState; }) {
    // Scanning takes a few milliseconds: not on every settings change that re-renders the row
    const report = React.useMemo(() => reportForInstalled(state), [state.code, state.definition, state.running, state.manifest]);
    const ran = !!PluginUsage.get(state.manifest.id);
    return (
        <PermissionsList
            report={report}
            note={ran
                ? "From its code and what it registered while running. A plugin can still do things its code doesn’t spell out."
                : "Found by reading its code. Turn it on to also see exactly what it registers while it runs."}
        />
    );
}

/** An installed plugin's details: what it can touch and its full changelog (the "View all" of its popups) */
function PluginDetails({ state }: { state: PluginState; }) {
    const { manifest } = state;
    const headingId = `dl-plugin-${manifest.id}-details`;
    const changelog = manifest.changelog ?? [];
    return (
        <div className="dl-stack dl-plugin-details">
            {manifest.description && <Text tag="p" variant="text-md/normal" color="text-default">{manifest.description}</Text>}
            <Text variant="text-sm/normal" color="text-subtle" tabular>
                {[manifest.version && `v${manifest.version}`, manifest.authors?.length && `By ${manifest.authors.join(", ")}`].filter(Boolean).join(" · ")}
            </Text>

            <section className="dl-stack" aria-labelledby={`${headingId}-access`}>
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={`${headingId}-access`}>Permissions</Text>
                <InstalledPluginPermissions state={state} />
            </section>

            <section className="dl-stack" aria-labelledby={`${headingId}-changes`}>
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={`${headingId}-changes`}>What’s new</Text>
                {changelog.length ? (
                    <ol className="dl-changelog">
                        {changelog.map(c => (
                            <li key={c.version}>
                                <div className="dl-row-title">
                                    <Text variant="text-sm/semibold" color="text-strong" tabular>v{c.version}</Text>
                                    {c.version === manifest.version && <Badge>Installed</Badge>}
                                </div>
                                <ul>{c.notes.map(n => <li key={n}><Text variant="text-sm/normal" color="text-subtle">{n}</Text></li>)}</ul>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <Text tag="p" variant="text-sm/normal" color="text-muted">{manifest.name} doesn’t publish a changelog.</Text>
                )}
            </section>
        </div>
    );
}

/** The info button in a plugin's row, opening its details */
export function PluginDetailsButton({ state }: { state: PluginState; }) {
    const [open, setOpen] = React.useState(false);
    const { manifest } = state;
    const id = `dl-plugin-${manifest.id}-info`;
    return (
        <>
            <IconButton icon="info" label={`${manifest.name} details`} aria-controls={open ? id : undefined} onClick={() => setOpen(true)} />
            {open && (
                <Dialog id={id} title={manifest.name} onClose={() => setOpen(false)}>
                    <PluginDetails state={state} />
                </Dialog>
            )}
        </>
    );
}

// ---- store plugins ----------------------------------------------------------------------------

const previews = new Map<string, Promise<StorePreviewResult>>();

/** The plugin's code from the store, verified by main like an install. Failures aren't remembered. */
function preview(id: string, version: string) {
    const key = `${id}@${version}`;
    let pending = previews.get(key);
    if (!pending) {
        pending = (Native.storePreview?.(id) ?? Promise.resolve<StorePreviewResult>({ ok: false, error: "this Evi can’t fetch it yet" }))
            .catch(err => ({ ok: false as const, error: String((err as Error)?.message ?? err) }));
        previews.set(key, pending);
        pending.then(r => !r.ok && previews.delete(key));
    }
    return pending;
}

/** On a store plugin's page: from the registry right away, then from its code once main fetched it */
export function StorePluginPermissions({ id, version, native, headingId }: { id: string; version: string; native: boolean; headingId: string; }) {
    const [result, setResult] = React.useState<StorePreviewResult>();
    React.useEffect(() => {
        let live = true;
        setResult(undefined);
        preview(id, version).then(r => live && setResult(r));
        return () => void (live = false);
    }, [id, version]);

    const report = React.useMemo(() => result?.ok
        ? analyzePermissions({ code: result.code, manifest: result.manifest, native })
        : analyzePermissions({ native }), [result, native]);

    return (
        <section className="dl-stack" aria-labelledby={headingId} data-store-permissions={id}>
            <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={headingId}>Permissions</Text>
            <PermissionsList report={report} pending={!result} error={result && !result.ok ? result.error : undefined} />
        </section>
    );
}
