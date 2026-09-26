import { RegistryEntry, storeAction } from "@shared/store";

import { Store, StoreOp } from "../store";
import { React } from "../webpack/common";
import { Button, Icon, Status, TextField, useStore } from "./components";

function OpStatus({ op }: { op: StoreOp | undefined; }) {
    if (!op) return null;
    if (op.type === "busy") return <Status tone="muted">{op.label}</Status>;
    if (op.type === "done") return <Status tone="success">{op.message}</Status>;
    return <Status tone="danger">{op.error}</Status>;
}

/** Native plugins get their own step: what full access means, and a button that repeats it */
function NativeConfirm({ entry, onConfirm, onCancel }: { entry: RegistryEntry; onConfirm(): void; onCancel(): void; }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => ref.current?.focus(), []);
    const titleId = `dl-store-confirm-${entry.id}`;

    return (
        <div className="dl-store-confirm" role="group" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
            <p className="dl-store-confirm-title" id={titleId}><Icon name="warning" />{entry.name} runs with full access to your computer</p>
            <p className="dl-hint">
                Native plugins run code in Discord’s main process, outside the browser sandbox. They can read and change
                your files, start programs and use your network like any app you install. Only continue if you trust
                {" "}{entry.authors.join(", ")}.
            </p>
            <div className="dl-toolbar dl-toolbar-flush">
                <Button variant="accent" onClick={onConfirm}>Install with full access</Button>
                <Button onClick={onCancel}>Cancel</Button>
            </div>
        </div>
    );
}

function StoreCard({ entry }: { entry: RegistryEntry; }) {
    const { installed, ops } = useStore(Store.subscribe, Store.getSnapshot);
    const [confirming, setConfirming] = React.useState(false);
    const current = installed[entry.id];
    const op = ops[entry.id];
    const busy = op?.type === "busy";
    const action = storeAction(entry, current, DELIGHT_VERSION);
    const titleId = `dl-store-${entry.id}`;

    const install = () => {
        // Updates ask again: a new version may do more than the one you agreed to
        if (entry.native) return setConfirming(true);
        Store.install(entry.id);
    };

    return (
        <article className="dl-card" aria-labelledby={titleId} data-store-id={entry.id}>
            <div className="dl-card-head">
                <div className="dl-card-main">
                    <h3 className="dl-card-title" id={titleId}>
                        {entry.name}
                        <span className="dl-version">v{entry.version}</span>
                        {entry.native && <span className="dl-badge" data-tone="warning">Native</span>}
                    </h3>
                    {entry.description && <p className="dl-card-desc">{entry.description}</p>}
                    <p className="dl-card-desc">
                        By {entry.authors.join(", ")}
                        {entry.tags.length > 0 && <> · {entry.tags.join(", ")}</>}
                    </p>
                    <div className="dl-toolbar dl-store-status" role="status">
                        {!op && action === "installed" && <Status tone="success">Installed{current?.version && ` v${current.version}`}</Status>}
                        {!op && action === "update" && <Status tone="warning">Update available, you have v{current?.version}</Status>}
                        {!op && action === "local" && <Status tone="muted">Installed outside the store{current?.version && `, v${current.version}`}</Status>}
                        {!op && action === "incompatible" && <Status tone="danger">Needs Delight {entry.minDelightVersion} or newer</Status>}
                        <OpStatus op={op} />
                    </div>
                </div>
                <div className="dl-store-actions">
                    {action === "install" && <Button variant="accent" disabled={busy || confirming} onClick={install}>Install</Button>}
                    {action === "update" && <Button variant="accent" disabled={busy || confirming} onClick={install}>Update</Button>}
                    {current?.fromStore && <Button disabled={busy} onClick={() => Store.uninstall(entry.id)}>Uninstall</Button>}
                </div>
            </div>
            {confirming && (
                <div className="dl-card-body">
                    <NativeConfirm
                        entry={entry}
                        onCancel={() => setConfirming(false)}
                        onConfirm={() => {
                            setConfirming(false);
                            Store.install(entry.id, { allowNative: true });
                        }}
                    />
                </div>
            )}
        </article>
    );
}

export function StoreTab() {
    const state = useStore(Store.subscribe, Store.getSnapshot);
    const [query, setQuery] = React.useState("");

    React.useEffect(() => {
        if (state.status === "idle") Store.refresh();
    }, []);

    const q = query.trim().toLowerCase();
    const visible = q
        ? state.plugins.filter(p => [p.id, p.name, p.description, ...p.authors, ...p.tags].join(" ").toLowerCase().includes(q))
        : state.plugins;

    return (
        <div className="dl-stack" style={{ gap: 16 }}>
            <div className="dl-toolbar dl-toolbar-flush">
                <div className="dl-search">
                    <TextField id="dl-store-search" label="Search the store" hideLabel placeholder="Search the store" value={query} onChange={setQuery} />
                </div>
                <Button disabled={state.status === "loading"} onClick={() => Store.refresh()}><Icon name="reload" />Refresh</Button>
            </div>

            <div role="status" className="dl-store-registry">
                {state.status === "loading" && <Status tone="muted">Loading the store…</Status>}
                {state.status === "error" && <Status tone="danger">Couldn’t load the store: {state.error}</Status>}
                {state.status === "ready" && state.problems.length > 0 && (
                    <Status tone="warning">Skipped {state.problems.length} invalid {state.problems.length === 1 ? "entry" : "entries"}</Status>
                )}
            </div>

            {visible.length ? (
                <div className="dl-stack">{visible.map(p => <StoreCard key={p.id} entry={p} />)}</div>
            ) : state.status === "ready" && (
                <div className="dl-empty">
                    <strong>{state.plugins.length ? `Nothing matches “${query}”` : "The store is empty"}</strong>
                    {state.plugins.length ? "Try a plugin’s name, an author or a tag." : "This registry doesn’t list any plugins yet."}
                </div>
            )}

            {state.registryUrl && (
                <p className="dl-hint">
                    Plugins come from <span className="dl-mono">{state.registryUrl}</span>. Every file is checked against the
                    registry’s sha256 before it’s installed. To use another registry, set <span className="dl-mono">registryUrl</span> in
                    {" "}<span className="dl-mono">store.json</span> in your data folder.
                </p>
            )}
        </div>
    );
}
