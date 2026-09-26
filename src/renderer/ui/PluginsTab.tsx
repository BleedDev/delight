import { isPluginEnabled } from "@shared/ipc";

import { Native } from "../native";
import { getPatchRecords } from "../patching/source";
import { PluginManager, PluginState } from "../plugins/manager";
import { Settings } from "../settings";
import { React } from "../webpack/common";
import { Button, Icon, SettingField, Status, Switch, useStore } from "./components";

function PatchSummary({ id }: { id: string; }) {
    const records = getPatchRecords(id);
    if (!records.length) return null;

    const applied = records.filter(r => r.state === "applied").length;
    const failed = records.filter(r => r.state === "failed" || r.state === "partial").length;
    const text = `${applied}/${records.length} patches applied`;

    return <Status tone={failed ? "danger" : applied === records.length ? "success" : "muted"}>{text}</Status>;
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
        <>
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
        </>
    );
}

function PluginCard({ state }: { state: PluginState; }) {
    const { manifest, definition } = state;
    const [expanded, setExpanded] = React.useState(false);
    const enabled = isPluginEnabled(Settings.data, manifest);
    const titleId = `dl-plugin-${manifest.id}`;
    const hasSettings = !!definition && (Object.keys(definition.settings ?? {}).length > 0 || !!definition.settingsPanel);

    return (
        <article className="dl-card" aria-labelledby={titleId}>
            <div className="dl-card-head">
                <div className="dl-card-main">
                    <h3 className="dl-card-title" id={titleId}>
                        {manifest.name}
                        {manifest.version && <span className="dl-version">v{manifest.version}</span>}
                        {state.source === "dev" && <span className="dl-badge">Dev</span>}
                        {manifest.native && <span className="dl-badge">Native</span>}
                    </h3>
                    {manifest.description && <p className="dl-card-desc">{manifest.description}</p>}
                    <div className="dl-toolbar" style={{ margin: "8px 0 0" }}>
                        {state.running && <Status tone="success">Running</Status>}
                        {state.error && <Status tone="danger">Failed</Status>}
                        {state.needsReload && <Status tone="warning">Reload to apply</Status>}
                        {enabled && <PatchSummary id={manifest.id} />}
                    </div>
                </div>
                {hasSettings && (
                    <Button
                        variant="icon"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} ${manifest.name} settings`}
                        onClick={() => setExpanded(!expanded)}
                    >
                        <span style={{ display: "inline-flex", rotate: expanded ? "90deg" : "0deg" }}><Icon name="chevron" /></span>
                    </Button>
                )}
                <Switch checked={enabled} labelledBy={titleId} onChange={v => PluginManager.setEnabled(manifest.id, v)} />
            </div>
            {(state.error || state.reloadReason || expanded) && (
                <div className="dl-card-body">
                    {state.error && <pre className="dl-error">{state.error}</pre>}
                    {state.needsReload && state.reloadReason && (
                        <p className="dl-hint">Couldn’t apply live: {state.reloadReason}.</p>
                    )}
                    {expanded && <PluginSettings state={state} />}
                </div>
            )}
        </article>
    );
}

export function PluginsTab() {
    const plugins = useStore(PluginManager.subscribe, PluginManager.getSnapshot);
    useStore(Settings.subscribe, () => Settings.data);
    const [query, setQuery] = React.useState("");

    const q = query.trim().toLowerCase();
    const visible = q
        ? plugins.filter(p => `${p.manifest.name} ${p.manifest.description ?? ""} ${p.manifest.id}`.toLowerCase().includes(q))
        : plugins;
    const needsReload = plugins.some(p => p.needsReload);

    return (
        <>
            {needsReload && (
                <div className="dl-banner" role="status">
                    <Icon name="warning" />
                    <span>Some plugin changes couldn’t be applied live. Reload Discord to apply them.</span>
                    <Button variant="accent" onClick={() => location.reload()}>Reload Discord</Button>
                </div>
            )}
            <div className="dl-toolbar">
                <label className="dl-sr-only" htmlFor="dl-plugin-search">Search plugins</label>
                <input
                    id="dl-plugin-search"
                    className="dl-input dl-search"
                    type="search"
                    inputMode="search"
                    placeholder="Search plugins"
                    value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                />
                <Button onClick={() => Native.openPath("plugins")}><Icon name="folder" />Open plugins folder</Button>
            </div>
            {visible.length ? (
                <div className="dl-stack">{visible.map(p => <PluginCard key={p.manifest.id} state={p} />)}</div>
            ) : (
                <div className="dl-empty">
                    <strong>{plugins.length ? `Nothing matches “${query}”` : "No plugins installed yet"}</strong>
                    {plugins.length
                        ? "Try a plugin’s name or part of its description."
                        : "Drop a plugin folder into your plugins folder and it shows up here instantly."}
                </div>
            )}
        </>
    );
}
