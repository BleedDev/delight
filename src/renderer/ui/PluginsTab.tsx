import { isPluginEnabled } from "@shared/ipc";

import { buildCrashReport, copyText } from "../crashReport";
import { Native } from "../native";
import { getPatchRecords } from "../patching/source";
import { PluginManager, PluginState } from "../plugins/manager";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { Store } from "../store";
import { React } from "../webpack/common";
import { Badge, Button, Dialog, EmptyState, FilterChips, IconButton, List, Notice, SearchField, SettingField, Status, Switch, Text, useStore } from "./components";
import { SafeModeNotice } from "./SafeModeNotice";
import { StoreBanner, StoreView } from "./Store";

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
    !q || `${p.manifest.name} ${p.manifest.description ?? ""} ${p.manifest.id} ${(p.manifest.authors ?? []).join(" ")}`.toLowerCase().includes(q);

function PatchSummary({ id }: { id: string; }) {
    const records = getPatchRecords(id);
    if (!records.length) return null;

    const applied = records.filter(r => r.state === "applied").length;
    const failed = records.filter(r => r.state === "failed" || r.state === "partial").length;
    const text = records.length === 1
        ? applied ? "Patch applied" : failed ? "Patch failed" : "Patch waiting"
        : `${applied} of ${records.length} patches applied`;

    if (failed) return <Status tone="danger">{text}</Status>;
    return <Status tone={applied === records.length ? "success" : "muted"} quiet>{text}</Status>;
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

/** Everything needed to hand a failing plugin's problem to its author, one click to copy */
function CrashReport({ state }: { state: PluginState; }) {
    const [copied, setCopied] = React.useState<"copied" | "failed">();
    const copy = () => copyText(buildCrashReport(state)).then(() => setCopied("copied"), () => setCopied("failed"));

    return (
        <div className="dl-toolbar dl-crash">
            <Button icon="copy" onClick={copy}>Copy crash report</Button>
            <span role="status">
                {copied === "copied" && <Status tone="success">Copied. Paste it into a bug report for {state.manifest.name}.</Status>}
                {copied === "failed" && <Status tone="danger">Couldn’t reach the clipboard</Status>}
            </span>
        </div>
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
    const statuses = state.error || state.needsReload || state.running || enabled || action === "update" || op;

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
                                {!op && action === "update" && <Status tone="warning">v{entry?.version} available</Status>}
                                {state.error && <Status tone="danger">Failed to start</Status>}
                                {state.needsReload && <Status tone="warning">Reload to apply</Status>}
                                {state.running && !state.error && <Status tone="success" quiet>Running</Status>}
                                {paused && <Status tone="muted">Paused in safe mode</Status>}
                                {enabled && <PatchSummary id={manifest.id} />}
                            </span>
                        )}
                    </div>
                    {manifest.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{manifest.description}</Text>}
                </div>
                <div className="dl-row-controls">
                    {action === "update" && <Button variant="accent" icon="download" disabled={busy} onClick={update}>Update</Button>}
                    {fromStore && (
                        <IconButton
                            icon="trash"
                            label={`Uninstall ${manifest.name}`}
                            aria-expanded={confirmingUninstall}
                            onClick={() => setConfirmingUninstall(!confirmingUninstall)}
                        />
                    )}
                    {withSettings && (
                        <IconButton
                            icon="settings"
                            label={`${manifest.name} settings`}
                            aria-haspopup="dialog"
                            aria-controls={settingsOpen ? settingsId : undefined}
                            onClick={() => setSettingsOpen(true)}
                        />
                    )}
                    <Switch checked={enabled} labelledBy={titleId} onChange={v => PluginManager.setEnabled(manifest.id, v)} />
                </div>
            </div>
            {confirmingUninstall && (
                <div className="dl-store-confirm dl-uninstall" role="group" aria-label={`Uninstall ${manifest.name}`}>
                    <p className="dl-hint">Uninstall {manifest.name}? Its files are removed. Its settings stay, so reinstalling picks up where you left off.</p>
                    <div className="dl-toolbar">
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                                setConfirmingUninstall(false);
                                Store.uninstall(manifest.id);
                            }}
                        >
                            Uninstall
                        </Button>
                        <Button onClick={() => setConfirmingUninstall(false)}>Cancel</Button>
                    </div>
                </div>
            )}
            {state.error && <pre className="dl-error">{state.error}</pre>}
            {state.error && <CrashReport state={state} />}
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
    // Rows show store badges and updates
    useStore(Store.subscribe, Store.getSnapshot);
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
