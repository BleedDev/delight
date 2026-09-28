/**
 * What a plugin can touch: what it declares it needs (shared/declaredPermissions.ts), which Evi holds
 * it to, then a short list of rows with a risk level each, read from its code. In an installed
 * plugin's details (the Plugins tab), on a store plugin's page before it's installed, and in the
 * store's install and update questions. The analysis itself is src/shared/pluginPermissions.ts.
 */
import { DeclaredPermissions, PERMISSION_FLAGS, PermissionFlag, PermissionGrowth, readPermissions } from "@shared/declaredPermissions";
import { analyzePermissions, Capability, PermissionsReport, Risk, riskSummary, StorePreviewResult } from "@shared/pluginPermissions";

import { t, useLocale } from "../i18n";
import { Native } from "../native";
import type { PluginState } from "../plugins/manager";
import { PluginUsage } from "../plugins/usage";
import { Store } from "../store";
import { React } from "../webpack/common";
import { Badge, Dialog, Icon, IconButton, IconName, Status, Text, Tone } from "./components";
import { PluginActivitySection } from "./PluginActivity";
import { HotfixNote, PulledNotice, ReportRow } from "./Trust";

const riskTone: Record<Risk, Tone> = { low: "success", medium: "warning", high: "danger" };
const riskIcon: Record<Risk, IconName> = { low: "circleCheck", medium: "info", high: "warning" };

// ---- declared ---------------------------------------------------------------------------------

const flagIcon: Record<PermissionFlag, IconName> = { readMessages: "search", sendMessages: "pencil", changeSettings: "settings" };

function DeclaredRow({ icon, title, hint, details, risk, permission }: {
    icon: IconName;
    title: string;
    hint: string;
    details?: string[];
    risk?: Risk;
    permission: string;
}) {
    return (
        <li className="dl-perms-item dl-declared-item" data-risk={risk} data-permission={permission}>
            <Icon name={icon} size={16} />
            <div className="dl-perms-text">
                <Text variant="text-sm/semibold" color="text-strong">{title}</Text>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{hint}</Text>
                {details && details.length > 0 && (
                    <ul className="dl-perms-details" aria-label={title}>
                        {details.map(d => <li key={d} className="dl-perms-detail">{d}</li>)}
                    </ul>
                )}
            </div>
        </li>
    );
}

/** One row per thing it asks for: its sites (as chips), then each yes, then full access */
function DeclaredRows({ hosts, flags, native }: { hosts: string[]; flags: readonly PermissionFlag[]; native?: boolean; }) {
    return (
        <ul className="dl-perms-list">
            {native && <DeclaredRow permission="native" icon="warning" risk="high" title={t("store.access.native")} hint={t("declared.nativeHint")} />}
            {hosts.length > 0 && <DeclaredRow permission="network" icon="link" title={t("declared.network", { count: hosts.length })} hint={t("declared.networkHint")} details={hosts} />}
            {flags.map(f => <DeclaredRow key={f} permission={f} icon={flagIcon[f]} title={t(`declared.${f}`)} hint={t(`declared.${f}Hint`)} />)}
        </ul>
    );
}

/**
 * What a plugin declares it needs, in plain words, and what that means: Evi blocks the rest of what
 * it does through Evi. A plugin that doesn't declare is labelled so, since nothing holds it.
 */
export function DeclaredPermissionsList({ permissions, native }: { permissions: DeclaredPermissions | undefined; native: boolean; }) {
    if (!permissions) {
        return (
            <div className="dl-declared" data-declared="none">
                <Status tone="warning">{t("declared.undeclared")}</Status>
                <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-perms-note">{t("declared.undeclaredHint")}</Text>
            </div>
        );
    }
    const flags = PERMISSION_FLAGS.filter(f => permissions[f]);
    const asksForSomething = native || flags.length > 0 || permissions.network.length > 0;
    return (
        <div className="dl-declared" data-declared="">
            <Text tag="h4" variant="text-sm/semibold" color="text-strong">{t("declared.title")}</Text>
            {asksForSomething
                ? <DeclaredRows hosts={permissions.network} flags={flags} native={native} />
                : <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("declared.nothing")}</Text>}
            <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-perms-note">{t("declared.note")}</Text>
        </div>
    );
}

/** What an update asks for beyond what the installed version declares, for the store's question */
export function PermissionGrowthList({ growth }: { growth: PermissionGrowth; }) {
    if (growth.undeclared) return <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("declared.growthUndeclared")}</Text>;
    return <DeclaredRows hosts={growth.hosts} flags={growth.flags} />;
}

/** Whether a manifest reaches beyond Discord's page: native code or Chromium switches */
const reachesBeyondPage = (manifest: PluginState["manifest"]) => !!manifest.native || Object.keys(manifest.chromiumSwitches ?? {}).length > 0;


function CapabilityRow({ capability: c }: { capability: Capability; }) {
    return (
        <li className="dl-perms-item" data-risk={c.risk} data-capability={c.id}>
            <Icon name={riskIcon[c.risk]} size={16} />
            <div className="dl-perms-text">
                <div className="dl-perms-title">
                    <Text variant="text-sm/semibold" color="text-strong">{c.title}</Text>
                    <span className="dl-perms-risk" data-risk={c.risk}>{t(`perms.risk.${c.risk}`)}</span>
                </div>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{c.description}</Text>
                {c.details.length > 0 && (
                    <ul className="dl-perms-details" aria-label={t("perms.detailsLabel", { title: c.title })}>
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
                <Status tone={riskTone[report.risk]}>{t(`perms.riskLabel.${report.risk}`)}</Status>
                <Text variant="text-sm/normal" color="text-subtle">{riskSummary(report, t)}</Text>
            </div>
            {report.capabilities.length > 0 && (
                <ul className="dl-perms-list">
                    {report.capabilities.map(c => <CapabilityRow key={c.id} capability={c} />)}
                </ul>
            )}
            <span role="status">
                {pending && <Status tone="muted">{t("perms.checking")}</Status>}
                {error && <Status tone="muted">{t("perms.checkFailed", { error })}</Status>}
            </span>
            <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-perms-note">
                {note ?? t("perms.note")}
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
    }, t);
}

export function InstalledPluginPermissions({ state }: { state: PluginState; }) {
    // Scanning takes a few milliseconds: not on every settings change that re-renders the row
    const locale = useLocale();
    const report = React.useMemo(() => reportForInstalled(state), [state.code, state.definition, state.running, state.manifest, locale]);
    const ran = !!PluginUsage.get(state.manifest.id);
    return (
        <PermissionsList
            report={report}
            note={t(ran ? "perms.noteRan" : "perms.noteNotRan")}
        />
    );
}

/**
 * An installed plugin's details: what it can touch and its full changelog (the "View all" of its
 * popups). Store plugins can be reported to Evi's team from here.
 */
function PluginDetails({ state }: { state: PluginState; }) {
    const { manifest } = state;
    const headingId = `dl-plugin-${manifest.id}-details`;
    const changelog = manifest.changelog ?? [];
    const fromStore = state.source !== "dev" && !!Store.installedPlugin(manifest.id)?.fromStore;
    // A store plugin's reviewed names, not what its manifest claims
    const authors = Store.authorsOf(state);
    // A pulled plugin's way back: the store's newer version (full-access ones, and ones that ask for more,
    // update from their store page, which asks first)
    const entry = Store.getSnapshot().plugins.find(p => p.id === manifest.id);
    const update = state.pulled && entry && !entry.native && Store.pluginAction(manifest.id) === "update" && !Store.growthOf(manifest.id)
        ? { version: entry.version, busy: Store.getSnapshot().ops[manifest.id]?.type === "busy", run: () => void Store.install(manifest.id) }
        : undefined;
    return (
        <div className="dl-stack dl-plugin-details">
            {state.pulled && <PulledNotice pull={state.pulled} update={update} />}
            {manifest.description && <Text tag="p" variant="text-md/normal" color="text-default">{manifest.description}</Text>}
            {state.hotfix && state.running && <HotfixNote hotfix={state.hotfix} />}
            <Text variant="text-sm/normal" color="text-subtle" tabular>
                {[manifest.version && `v${manifest.version}`, authors.length > 0 && t("common.by", { author: authors.join(", ") })].filter(Boolean).join(" · ")}
            </Text>

            <section className="dl-stack" aria-labelledby={`${headingId}-access`}>
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={`${headingId}-access`}>{t("perms.title")}</Text>
                <DeclaredPermissionsList permissions={readPermissions(manifest.permissions)} native={reachesBeyondPage(manifest)} />
                <Text tag="h4" variant="text-sm/semibold" color="text-strong">{t("declared.codeTitle")}</Text>
                <InstalledPluginPermissions state={state} />
            </section>

            <PluginActivitySection state={state} headingId={`${headingId}-activity`} />

            <section className="dl-stack" aria-labelledby={`${headingId}-changes`}>
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={`${headingId}-changes`}>{t("store.whatsNew")}</Text>
                {changelog.length ? (
                    <ol className="dl-changelog">
                        {changelog.map(c => (
                            <li key={c.version}>
                                <div className="dl-row-title">
                                    <Text variant="text-sm/semibold" color="text-strong" tabular>v{c.version}</Text>
                                    {c.version === manifest.version && <Badge>{t("store.installed")}</Badge>}
                                </div>
                                <ul>{c.notes.map(n => <li key={n}><Text variant="text-sm/normal" color="text-subtle">{n}</Text></li>)}</ul>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <Text tag="p" variant="text-sm/normal" color="text-muted">{t("perms.noChangelog", { name: manifest.name })}</Text>
                )}
            </section>

            {fromStore && <ReportRow id={manifest.id} name={manifest.name} version={Store.installedPlugin(manifest.id)?.version ?? manifest.version} />}
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
            <IconButton icon="info" label={t("perms.detailsOf", { name: manifest.name })} aria-controls={open ? id : undefined} onClick={() => setOpen(true)} />
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
        pending = (Native.storePreview?.(id) ?? Promise.resolve<StorePreviewResult>({ ok: false, error: t("perms.cantFetch") }))
            .catch(err => ({ ok: false as const, error: String((err as Error)?.message ?? err) }));
        previews.set(key, pending);
        pending.then(r => !r.ok && previews.delete(key));
    }
    return pending;
}

/**
 * On a store plugin's page: what it declares, from the registry, then what its code can reach, from the
 * registry right away and from its code once main fetched it
 */
export function StorePluginPermissions({ id, version, native, permissions, headingId }: {
    id: string;
    version: string;
    native: boolean;
    permissions: DeclaredPermissions | undefined;
    headingId: string;
}) {
    const [result, setResult] = React.useState<StorePreviewResult>();
    React.useEffect(() => {
        let live = true;
        setResult(undefined);
        preview(id, version).then(r => live && setResult(r));
        return () => void (live = false);
    }, [id, version]);

    const locale = useLocale();
    const report = React.useMemo(() => result?.ok
        ? analyzePermissions({ code: result.code, manifest: result.manifest, native }, t)
        : analyzePermissions({ native }, t), [result, native, locale]);

    return (
        <section className="dl-stack" aria-labelledby={headingId} data-store-permissions={id}>
            <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={headingId}>{t("perms.title")}</Text>
            <DeclaredPermissionsList permissions={permissions} native={native} />
            <Text tag="h4" variant="text-sm/semibold" color="text-strong">{t("declared.codeTitle")}</Text>
            <PermissionsList report={report} pending={!result} error={result && !result.ok ? result.error : undefined} />
        </section>
    );
}
