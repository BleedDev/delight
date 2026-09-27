import { MAX_REPORT_CHARS } from "@shared/crashReports";
import { healthWarns } from "@shared/health";
import { isPluginEnabled } from "@shared/ipc";

import { buildCrashReport, copyText, discordBuild } from "../crashReport";
import { Native } from "../native";
import { getPatchRecords } from "../patching/source";
import { diagnoseLookups, isLookupProblem, LookupDiagnosis } from "../plugins/lookups";
import { PluginManager, PluginState } from "../plugins/manager";
import { SafeMode } from "../safeMode";
import { crashKey, fitReport } from "../sentReports";
import { Settings } from "../settings";
import { Store } from "../store";
import { React } from "../webpack/common";
import { Badge, Button, Dialog, EmptyState, FilterChips, IconButton, List, Notice, SearchField, SettingField, Status, Switch, Text, useStore } from "./components";
import { PluginDetailsButton } from "./PluginPermissions";
import { SafeModeNotice } from "./SafeModeNotice";
import { HealthPill, StoreBanner, StoreView } from "./Store";
import { PulledNotice } from "./Trust";

type Filter = "all" | "enabled" | "disabled" | "settings" | "dev";

/** A custom settings panel needs the running plugin's ctx, so it only counts while the plugin runs */
function hasSettings({ definition, ctx }: PluginState) {
    return !!definition && (Object.keys(definition.settings ?? {}).length > 0 || (!!definition.settingsPanel && !!ctx));
}

const filterTests: Record<Filter, (p: PluginState) => boolean> = {
    all: () => true,
    enabled: p => isPluginEnabled(Settings.data, p.manifest),
    disabled: p => !isPluginEnabled(Settings.data, p.manifest),
    settings: hasSettings,
    dev: p => p.source === "dev",
};

const matchesQuery = (p: PluginState, q: string) =>
    !q || `${p.manifest.name} ${p.manifest.description ?? ""} ${p.manifest.id} ${Store.authorsOf(p).join(" ")}`.toLowerCase().includes(q);

function PatchSummary({ id }: { id: string; }) {
    const records = getPatchRecords(id);
    if (!records.length) return null;

    const applied = records.filter(r => r.state === "applied").length;
    const failed = records.filter(r => r.state === "failed" || r.state === "partial").length;

    if (failed) {
        return <Status tone="danger">{records.length === 1 ? "Patch failed" : `${failed} of ${records.length} patches failed`}</Status>;
    }
    // Waiting patches target code Discord only loads when it's first needed (a voice call, a settings
    // page...). They apply right as it loads, so they're as fine as applied ones
    const waiting = records.length - applied;
    const text = records.length === 1
        ? applied ? "Patch applied" : "Patch applies when needed"
        : waiting ? `${applied} patches applied, ${waiting} when needed` : `${applied} patches applied`;
    return <Status tone="success" quiet>{text}</Status>;
}

/** Parts of Discord the plugin waited for that never showed up: it runs, but without them */
function LookupSummary({ problems }: { problems: LookupDiagnosis[]; }) {
    if (!problems.length) return null;
    const broken = problems.some(d => d.health === "broken");
    const n = problems.length;
    return <Status tone={broken ? "danger" : "warning"}>{`Can’t find ${n === 1 ? "1 part" : `${n} parts`} of Discord`}</Status>;
}

function PluginSettings({ state }: { state: PluginState; }) {
    const { definition, ctx, manifest } = state;
    const schema = definition?.settings ?? {};
    // Re-render on any settings change
    useStore(Settings.subscribe, () => Settings.data);
    const stored = Settings.plugin(manifest.id).settings ?? {};

    const set = (key: string, value: unknown) => Settings.update(d => {
        ((d.plugins[manifest.id] ??= {}).settings ??= {})[key] = value;
    });

    return (
        <div className="dl-row-settings">
            {Object.entries(schema).map(([key, def]) => (
                <SettingField
                    key={key}
                    id={`dl-setting-${manifest.id}-${key}`}
                    definition={def}
                    value={key in stored ? stored[key] : def.default}
                    onChange={v => set(key, v)}
                />
            ))}
            {ctx && definition?.settingsPanel?.(ctx)}
        </div>
    );
}

/** Crash reports sent this session, to who: the same crash isn't sent twice */
const sentCrashes = new Map<string, string>();

/** Everything needed to hand a failing plugin's problem to its author, one click to copy */
function CrashReport({ state }: { state: PluginState; }) {
    const [copied, setCopied] = React.useState<"copied" | "failed">();
    const copy = () => copyText(buildCrashReport(state)).then(() => setCopied("copied"), () => setCopied("failed"));
    // Store plugins only: evi.rest finds their author from the registry
    const installed = Store.installedPlugin(state.manifest.id);
    const entry = Store.getSnapshot().plugins.find(p => p.id === state.manifest.id);
    const version = installed?.version ?? state.manifest.version;
    const canSend = !!installed?.fromStore && !!entry && !!version && !!Native.sendCrashReport;

    return (
        <div className="dl-toolbar dl-crash">
            <Button icon="copy" onClick={copy}>Copy crash report</Button>
            {canSend && <SendToAuthor state={state} version={version!} author={entry!.authors.join(", ")} />}
            <span role="status">
                {copied === "copied" && <Status tone="success">Copied. Paste it into a bug report for {state.manifest.name}.</Status>}
                {copied === "failed" && <Status tone="danger">Couldn’t reach the clipboard</Status>}
            </span>
        </div>
    );
}

/** The same report as Copy, sent to the plugin's author through evi.rest after showing exactly what goes */
function SendToAuthor({ state, version, author }: { state: PluginState; version: string; author: string; }) {
    const { id } = state.manifest;
    const [asking, setAsking] = React.useState<string>();
    const [dontAsk, setDontAsk] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const report = () => fitReport(buildCrashReport(state), MAX_REPORT_CHARS);
    const sentTo = sentCrashes.get(crashKey(id, version, report()));

    const send = async (text: string) => {
        setAsking(undefined);
        if (dontAsk) Settings.update(d => void (d.crashReportConsent = true));
        setSending(true);
        setError(undefined);
        const result = await Native.sendCrashReport({ plugin: id, version, eviVersion: EVI_VERSION, discordBuild: discordBuild(), report: text })
            .catch(err => ({ ok: false as const, error: String(err) }));
        if (result.ok) sentCrashes.set(crashKey(id, version, text), result.author ?? author);
        else setError(result.error);
        setSending(false);
    };
    const start = () => {
        const text = report();
        if (Settings.data.crashReportConsent) void send(text);
        else setAsking(text);
    };

    return (
        <>
            <Button disabled={sending || !!sentTo} onClick={start}>{sentTo ? "Sent" : sending ? "Sending…" : "Send to author"}</Button>
            <span role="status">
                {sentTo && <Status tone="success">Sent to {sentTo}</Status>}
                {!sentTo && error && <Status tone="danger">Couldn’t send it: {error}</Status>}
            </span>
            {asking !== undefined && (
                <Dialog id={`dl-crash-send-${id}`} title={`Send this crash report to ${author}?`} onClose={() => setAsking(undefined)}>
                    <div className="dl-stack">
                        <pre className="dl-crash-text" tabIndex={0} aria-label="The crash report">{asking}</pre>
                        <Text tag="p" variant="text-sm/normal" color="text-subtle">
                            It goes to {author} through evi.rest. It has no messages, tokens or account details.
                        </Text>
                        <label className="dl-check">
                            <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.currentTarget.checked)} />
                            Don’t ask again
                        </label>
                        <div className="dl-toolbar">
                            <Button variant="accent" onClick={() => void send(asking)}>Send report</Button>
                            <Button onClick={() => setAsking(undefined)}>Cancel</Button>
                        </div>
                    </div>
                </Dialog>
            )}
        </>
    );
}

function PluginRow({ state, onOpenStore }: { state: PluginState; onOpenStore(id: string): void; }) {
    const { manifest } = state;
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [confirmingUninstall, setConfirmingUninstall] = React.useState(false);
    const enabled = isPluginEnabled(Settings.data, manifest);
    const titleId = `dl-plugin-${manifest.id}`;
    const settingsId = `dl-plugin-${manifest.id}-settings`;
    const withSettings = hasSettings(state);
    const paused = SafeMode.active && enabled;

    const fromStore = !!Store.installedPlugin(manifest.id)?.fromStore;
    const action = Store.pluginAction(manifest.id);
    const entry = Store.getSnapshot().plugins.find(p => p.id === manifest.id);
    const op = Store.getSnapshot().ops[manifest.id];
    const busy = op?.type === "busy";
    const lookupProblems = state.running ? diagnoseLookups(manifest.id).filter(d => isLookupProblem(d.health)) : [];
    // What evi.rest knows about this version (dev builds aren't the store's)
    const known = state.source === "dev" ? undefined : Store.healthOf(manifest.id);
    const health = healthWarns(known, Store.installedPlugin(manifest.id)?.version ?? manifest.version) ? known : undefined;
    // Evi turned this version off everywhere: it can't run, and says why instead
    const { pulled } = state;
    const statuses = state.error || state.needsReload || state.running || enabled || action === "update" || op || health || pulled;

    // Full-access updates go through the plugin's store page, which asks first
    const update = () => entry?.native ? onOpenStore(manifest.id) : Store.install(manifest.id);

    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="text-md/semibold" color="text-strong" id={titleId}>{manifest.name}</Text>
                        {manifest.version && <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>v{manifest.version}</Text>}
                        {state.source === "dev" && <Badge>Dev</Badge>}
                        {fromStore && <Badge>Store</Badge>}
                        {manifest.native && <Badge>Native</Badge>}
                        {statuses && (
                            <span className="dl-row-meta" role="status">
                                {op?.type === "busy" && <Status tone="muted">{op.label}</Status>}
                                {op?.type === "error" && <Status tone="danger">{op.error}</Status>}
                                {op?.type === "done" && <Status tone="success">{op.message}</Status>}
                                {pulled && <Status tone="danger">Turned off by Evi</Status>}
                                {!op && !pulled && action === "update" && <Status tone="warning">v{entry?.version} available</Status>}
                                {state.error && <Status tone="danger">Failed to start</Status>}
                                {state.needsReload && <Status tone="warning">Reload to apply</Status>}
                                {state.running && !state.error && <Status tone="success" quiet>Running</Status>}
                                {paused && !pulled && <Status tone="muted">Paused in safe mode</Status>}
                                {enabled && !pulled && <PatchSummary id={manifest.id} />}
                                <LookupSummary problems={lookupProblems} />
                                {health && <HealthPill health={health} />}
                            </span>
                        )}
                    </div>
                    {manifest.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{manifest.description}</Text>}
                </div>
                <div className="dl-row-controls">
                    {action === "update" && !pulled && <Button variant="accent" icon="download" disabled={busy} onClick={update}>Update</Button>}
                    <IconButton
                        icon="trash"
                        label={`${fromStore ? "Uninstall" : "Remove"} ${manifest.name}`}
                        aria-expanded={confirmingUninstall}
                        onClick={() => setConfirmingUninstall(!confirmingUninstall)}
                    />
                    <PluginDetailsButton state={state} />
                    {withSettings && (
                        <IconButton
                            icon="settings"
                            label={`${manifest.name} settings`}
                            aria-haspopup="dialog"
                            aria-controls={settingsOpen ? settingsId : undefined}
                            onClick={() => setSettingsOpen(true)}
                        />
                    )}
                    {/* Off while pulled, whatever it's set to; the notice below says why */}
                    <Switch checked={enabled && !pulled} disabled={!!pulled} labelledBy={titleId} onChange={v => PluginManager.setEnabled(manifest.id, v)} />
                </div>
            </div>
            {pulled && <PulledNotice pull={pulled} update={action === "update" && entry ? { version: entry.version, busy, run: update } : undefined} />}
            {confirmingUninstall && (
                <div className="dl-store-confirm dl-uninstall" role="group" aria-label={`${fromStore ? "Uninstall" : "Remove"} ${manifest.name}`}>
                    <p className="dl-hint">
                        {fromStore
                            ? <>Uninstall {manifest.name}? Its files are removed. Its settings stay, so reinstalling picks up where you left off.</>
                            : <>
                                Remove {manifest.name}? {state.source === "dev" ? "It’s part of the dev build, so it’s hidden rather than deleted." : "Its files are deleted."}{" "}
                                Evi won’t bring it back when it updates. Its settings stay{entry ? ", and you can install it again from the Store" : ""}.
                            </>}
                    </p>
                    <div className="dl-toolbar">
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                                setConfirmingUninstall(false);
                                Store.uninstall(manifest.id);
                            }}
                        >
                            {fromStore ? "Uninstall" : "Remove"}
                        </Button>
                        <Button onClick={() => setConfirmingUninstall(false)}>Cancel</Button>
                    </div>
                </div>
            )}
            {state.error && <pre className="dl-error">{state.error}</pre>}
            {!state.error && lookupProblems.length > 0 && (
                <>
                    <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-note">
                        {health && "Others are seeing this too. "}
                        {lookupProblems.some(d => d.health === "broken")
                            ? "Discord probably changed these after an update. The plugin still runs, but the parts that need them won’t work:"
                            : "Not found in what Discord has loaded so far. If you’ve already used the parts of Discord this plugin changes, Discord probably changed them:"}
                    </Text>
                    {lookupProblems.map((d, i) => <pre key={i} className="dl-error">{d.target}</pre>)}
                </>
            )}
            {health?.message && (
                <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-note">{health.setBy ? `${health.setBy}: ` : ""}{health.message}</Text>
            )}
            {(state.error || lookupProblems.length > 0) && <CrashReport state={state} />}
            {state.needsReload && state.reloadReason && (
                <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-note">Couldn’t apply live because {state.reloadReason}.</Text>
            )}
            {withSettings && settingsOpen && (
                <Dialog id={settingsId} title={`${manifest.name} settings`} onClose={() => setSettingsOpen(false)}>
                    <PluginSettings state={state} />
                </Dialog>
            )}
        </li>
    );
}

/** Installed plugins, with the store one click away inside the same tab */
export function PluginsTab() {
    // undefined: the installed list. Otherwise the store, opened on a plugin's page when there's an id.
    const [store, setStore] = React.useState<{ id?: string; }>();
    return store
        ? <StoreView kind="plugin" initialId={store.id} onBack={() => setStore(undefined)} />
        : <InstalledPlugins onOpenStore={id => setStore({ id })} />;
}

interface Undo {
    message: string;
    previous: Record<string, boolean>;
}

/** Turn everything off, or back to each plugin's default, with one-click undo */
function BulkActions({ plugins, onDone }: { plugins: PluginState[]; onDone(undo: Undo): void; }) {
    const [busy, setBusy] = React.useState(false);
    const enabledNow = plugins.filter(p => isPluginEnabled(Settings.data, p.manifest));
    const offDefault = plugins.filter(p => isPluginEnabled(Settings.data, p.manifest) !== (p.manifest.enabledByDefault ?? false));

    const apply = async (changes: [PluginState, boolean][], message: string) => {
        setBusy(true);
        const previous = Object.fromEntries(changes.map(([p]) => [p.manifest.id, isPluginEnabled(Settings.data, p.manifest)]));
        try {
            for (const [p, on] of changes) await PluginManager.setEnabled(p.manifest.id, on);
        } finally {
            setBusy(false);
        }
        onDone({ message, previous });
    };

    return (
        <div className="dl-bulk" role="group" aria-label="All plugins">
            <Button
                disabled={busy || !enabledNow.length}
                onClick={() => apply(enabledNow.map(p => [p, false]), `Turned off ${enabledNow.length} ${enabledNow.length === 1 ? "plugin" : "plugins"}`)}
            >
                Turn all off
            </Button>
            <Button
                disabled={busy || !offDefault.length}
                onClick={() => apply(offDefault.map(p => [p, p.manifest.enabledByDefault ?? false]), `Reset ${offDefault.length} ${offDefault.length === 1 ? "plugin" : "plugins"} to their defaults`)}
            >
                Reset to defaults
            </Button>
        </div>
    );
}

function InstalledPlugins({ onOpenStore }: { onOpenStore(id?: string): void; }) {
    const plugins = useStore(PluginManager.subscribe, PluginManager.getSnapshot);
    useStore(Settings.subscribe, () => Settings.data);
    // Rows show store badges, updates and known problems
    useStore(Store.subscribe, Store.getSnapshot);
    React.useEffect(() => Store.loadReports(), []);
    const [undo, setUndo] = React.useState<Undo>();
    const [query, setQuery] = React.useState("");
    const [filter, setFilter] = React.useState<Filter>("all");
    const q = query.trim().toLowerCase();

    // Which plugins a filter shows is decided when the filter or search changes, not on every toggle:
    // switching a plugin off under "Enabled" leaves it in place instead of pulling it from under the cursor
    const ids = plugins.map(p => p.manifest.id).join("\n");
    const shown = React.useMemo(
        () => new Set(plugins.filter(p => filterTests[filter](p) && matchesQuery(p, q)).map(p => p.manifest.id)),
        [filter, q, ids],
    );
    const visible = plugins.filter(p => shown.has(p.manifest.id));

    const count = (f: Filter) => plugins.filter(filterTests[f]).length;
    const enabledCount = count("enabled");
    const needsReload = plugins.some(p => p.needsReload);
    const filtered = filter !== "all" || !!q;

    const clear = () => {
        setQuery("");
        setFilter("all");
    };

    return (
        <div className="dl-tab">
            {SafeMode.active && <SafeModeNotice />}
            {needsReload && (
                <Notice tone="warning" action={<Button variant="accent" onClick={() => location.reload()}>Reload Discord</Button>}>
                    Some plugin changes couldn’t be applied live. Reload Discord to finish applying them.
                </Notice>
            )}

            <StoreBanner kind="plugin" onOpen={() => onOpenStore()} />

            <div className="dl-controls">
                <div className="dl-toolbar">
                    <div className="dl-grow">
                        <SearchField id="dl-plugin-search" label="Search plugins" placeholder="Search plugins" value={query} onChange={setQuery} />
                    </div>
                    <Button size="md" icon="folder" onClick={() => Native.openPath("plugins")}>Open plugins folder</Button>
                </div>
                <FilterChips<Filter>
                    label="Show plugins"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { id: "all", label: "All", count: plugins.length },
                        { id: "enabled", label: "Enabled", count: enabledCount },
                        { id: "disabled", label: "Disabled", count: plugins.length - enabledCount },
                        { id: "settings", label: "Has settings", count: count("settings") },
                        { id: "dev", label: "Dev", count: count("dev") },
                    ]}
                />
            </div>

            <div className="dl-stack">
                <div className="dl-toolbar">
                    <Text variant="text-sm/medium" color="text-subtle" role="status" tabular className="dl-grow">
                        {!plugins.length
                            ? "No plugins installed"
                            : filtered
                                ? `Showing ${visible.length} of ${plugins.length} plugins`
                                : `${plugins.length} plugins, ${enabledCount} enabled`}
                    </Text>
                    {plugins.length > 0 && <BulkActions plugins={plugins} onDone={setUndo} />}
                </div>
                {undo && (
                    <Notice
                        tone="info"
                        action={
                            <Button
                                id="dl-bulk-undo"
                                onClick={async () => {
                                    setUndo(undefined);
                                    for (const [id, on] of Object.entries(undo.previous)) await PluginManager.setEnabled(id, on);
                                }}
                            >
                                Undo
                            </Button>
                        }
                    >
                        {undo.message}.
                    </Notice>
                )}
                {visible.length ? (
                    <List label="Plugins">{visible.map(p => <PluginRow key={p.manifest.id} state={p} onOpenStore={onOpenStore} />)}</List>
                ) : plugins.length ? (
                    <EmptyState
                        icon="search"
                        title={q ? `No plugins match “${query.trim()}”` : "No plugins in this filter"}
                        action={<Button onClick={clear}>Show all plugins</Button>}
                    >
                        {q ? "Try part of a plugin’s name or description." : "Pick another filter above to see the rest."}
                    </EmptyState>
                ) : (
                    <EmptyState icon="puzzle" title="No plugins installed yet" action={<Button icon="folder" onClick={() => Native.openPath("plugins")}>Open plugins folder</Button>}>
                        Drop a plugin folder into your plugins folder and it shows up here right away.
                    </EmptyState>
                )}
            </div>
        </div>
    );
}
