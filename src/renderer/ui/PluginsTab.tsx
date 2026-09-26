import { isPluginEnabled } from "@shared/ipc";

import { Native } from "../native";
import { getPatchRecords } from "../patching/source";
import { PluginManager, PluginState } from "../plugins/manager";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { React } from "../webpack/common";
import { Badge, Button, Collapse, EmptyState, FilterChips, IconButton, List, Notice, SearchField, SettingField, Status, Switch, Text, useStore } from "./components";
import { SafeModeNotice } from "./SafeModeNotice";

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

function PluginRow({ state }: { state: PluginState; }) {
    const { manifest } = state;
    const [expanded, setExpanded] = React.useState(false);
    const enabled = isPluginEnabled(Settings.data, manifest);
    const titleId = `dl-plugin-${manifest.id}`;
    const settingsId = `dl-plugin-${manifest.id}-settings`;
    const withSettings = hasSettings(state);
    const paused = SafeMode.active && enabled;
    const statuses = state.error || state.needsReload || state.running || enabled;

    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{manifest.name}</Text>
                        {manifest.version && <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>v{manifest.version}</Text>}
                        {state.source === "dev" && <Badge>Dev</Badge>}
                        {manifest.native && <Badge>Native</Badge>}
                    </div>
                    {manifest.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{manifest.description}</Text>}
                    {statuses && (
                        <div className="dl-row-meta">
                            {state.error && <Status tone="danger">Failed to start</Status>}
                            {state.needsReload && <Status tone="warning">Reload to apply</Status>}
                            {state.running && !state.error && <Status tone="success" quiet>Running</Status>}
                            {paused && <Status tone="muted">Paused in safe mode</Status>}
                            {enabled && <PatchSummary id={manifest.id} />}
                        </div>
                    )}
                </div>
                <div className="dl-row-controls">
                    {withSettings && (
                        <IconButton
                            icon="chevronDown"
                            className="dl-expand"
                            label={`${expanded ? "Hide" : "Show"} ${manifest.name} settings`}
                            aria-expanded={expanded}
                            aria-controls={settingsId}
                            onClick={() => setExpanded(!expanded)}
                        />
                    )}
                    <Switch checked={enabled} labelledBy={titleId} onChange={v => PluginManager.setEnabled(manifest.id, v)} />
                </div>
            </div>
            {state.error && <pre className="dl-error">{state.error}</pre>}
            {state.needsReload && state.reloadReason && (
                <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-note">Couldn’t apply live because {state.reloadReason}.</Text>
            )}
            {withSettings && <Collapse open={expanded} id={settingsId}><PluginSettings state={state} /></Collapse>}
        </li>
    );
}

export function PluginsTab() {
    const plugins = useStore(PluginManager.subscribe, PluginManager.getSnapshot);
    useStore(Settings.subscribe, () => Settings.data);
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
                <Text variant="text-sm/medium" color="text-subtle" role="status" tabular>
                    {!plugins.length
                        ? "No plugins installed"
                        : filtered
                            ? `Showing ${visible.length} of ${plugins.length} plugins`
                            : `${plugins.length} plugins, ${enabledCount} enabled`}
                </Text>
                {visible.length ? (
                    <List label="Plugins">{visible.map(p => <PluginRow key={p.manifest.id} state={p} />)}</List>
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
