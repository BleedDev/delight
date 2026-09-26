import { RegistryEntry, storeAction } from "@shared/store";

import { Store, StoreOp } from "../store";
import { React } from "../webpack/common";
import { Badge, Button, EmptyState, Icon, List, SearchField, Status, Text, useStore } from "./components";

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
            <p className="dl-store-confirm-title" id={titleId}><Icon name="warning" size={20} />{entry.name} runs with full access to your computer</p>
            <p className="dl-hint">
                Native plugins run code in Discord’s main process, outside the browser sandbox. They can read and change
                your files, start programs and use your network like any app you install. Only continue if you trust
                {" "}{entry.authors.join(", ")}.
            </p>
            <div className="dl-toolbar">
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
        <li className="dl-row" aria-labelledby={titleId} data-store-id={entry.id}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{entry.name}</Text>
                        <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>v{entry.version}</Text>
                        {entry.native && <Badge tone="warning">Native</Badge>}
                    </div>
                    {entry.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{entry.description}</Text>}
                    <Text tag="p" variant="text-xs/normal" color="text-muted">
                        By {entry.authors.join(", ")}
                        {entry.tags.length > 0 && <> · {entry.tags.join(", ")}</>}
                    </Text>
                    <div className="dl-row-meta dl-store-status" role="status">
                        {!op && action === "installed" && <Status tone="success" quiet>Installed{current?.version && ` v${current.version}`}</Status>}
                        {!op && action === "update" && <Status tone="warning">Update available, you have v{current?.version}</Status>}
                        {!op && action === "local" && <Status tone="muted">Installed outside the store{current?.version && `, v${current.version}`}</Status>}
                        {!op && action === "incompatible" && <Status tone="danger">Needs Delight {entry.minDelightVersion} or newer</Status>}
                        <OpStatus op={op} />
                    </div>
                </div>
                <div className="dl-row-controls">
                    {current?.fromStore && <Button disabled={busy} onClick={() => Store.uninstall(entry.id)}>Uninstall</Button>}
                    {action === "install" && <Button variant="accent" icon="download" disabled={busy || confirming} onClick={install}>Install</Button>}
                    {action === "update" && <Button variant="accent" icon="download" disabled={busy || confirming} onClick={install}>Update</Button>}
                </div>
            </div>
            {confirming && (
                <NativeConfirm
                    entry={entry}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => {
                        setConfirming(false);
                        Store.install(entry.id, { allowNative: true });
                    }}
                />
            )}
        </li>
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
        <div className="dl-tab">
            <div className="dl-toolbar">
                <div className="dl-grow">
                    <SearchField id="dl-store-search" label="Search the store" placeholder="Search the store" value={query} onChange={setQuery} />
                </div>
                <Button size="md" icon="refresh" disabled={state.status === "loading"} onClick={() => Store.refresh()}>Refresh</Button>
            </div>

            <div className="dl-stack">
                <div role="status" className="dl-store-registry">
                    {state.status === "loading" && <Status tone="muted">Loading the store…</Status>}
                    {state.status === "error" && <Status tone="danger">Couldn’t load the store: {state.error}</Status>}
                    {state.status === "ready" && state.problems.length > 0 && (
                        <Status tone="warning">Skipped {state.problems.length} invalid {state.problems.length === 1 ? "entry" : "entries"}</Status>
                    )}
                </div>
                {visible.length ? (
                    <List label="Store plugins">{visible.map(p => <StoreCard key={p.id} entry={p} />)}</List>
                ) : state.status === "ready" && (
                    <EmptyState
                        icon={state.plugins.length ? "search" : "store"}
                        title={state.plugins.length ? `No plugins match “${query.trim()}”` : "The store is empty"}
                        action={state.plugins.length ? <Button onClick={() => setQuery("")}>Clear search</Button> : undefined}
                    >
                        {state.plugins.length ? "Try a plugin’s name, an author or a tag." : "This registry doesn’t list any plugins yet."}
                    </EmptyState>
                )}
            </div>

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
