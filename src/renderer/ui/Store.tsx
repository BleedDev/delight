/**
 * The store, for plugins and themes alike: a banner on top of the Plugins and Themes tabs, the
 * listing it opens (search, categories, sorting, Update all, auto-update) and a detail page per item.
 */
import { entriesBetween } from "@shared/pluginChangelog";
import { ListingInfo, ListingSort, RegistryEntry, sortListings, ThemeEntry } from "@shared/store";

import { Settings } from "../settings";
import { Store, StoreKind, StoreOp, UpdateAllResult } from "../store";
import { React } from "../webpack/common";
import { Badge, Button, Dropdown, EmptyState, FilterChips, Icon, List, Notice, SearchField, Status, SwitchRow, Text, useStore } from "./components";
import { PluginChangelogSetting } from "./PluginChangelog";
import { StorePluginPermissions } from "./PluginPermissions";

const words = {
    plugin: { one: "plugin", many: "plugins", Store: "Plugin Store", back: "Installed plugins" },
    theme: { one: "theme", many: "themes", Store: "Theme Store", back: "Installed themes" },
} as const;

const plural = (n: number, kind: StoreKind) => `${n} ${n === 1 ? words[kind].one : words[kind].many}`;

type Action = ReturnType<typeof Store.pluginAction>;

/** Everything the UI needs about one store item, whichever kind it is */
interface Item {
    kind: StoreKind;
    entry: ListingInfo & { minEviVersion?: string; };
    native: boolean;
    action: Action;
    installedVersion?: string;
    fromStore: boolean;
    op?: StoreOp;
    install(allowNative?: boolean): Promise<unknown>;
    uninstall(): Promise<unknown>;
}

function itemsOf(kind: StoreKind): Item[] {
    const state = Store.getSnapshot();
    if (kind === "plugin") {
        return state.plugins.map((entry: RegistryEntry) => {
            const installed = Store.installedPlugin(entry.id);
            return {
                kind, entry, native: entry.native,
                action: Store.pluginAction(entry.id),
                installedVersion: installed?.version,
                fromStore: !!installed?.fromStore,
                op: state.ops[entry.id],
                install: (allowNative = false) => Store.install(entry.id, { allowNative }),
                uninstall: () => Store.uninstall(entry.id),
            };
        });
    }
    return state.themes.map((entry: ThemeEntry) => {
        const installed = state.installedThemes[entry.id];
        return {
            kind, entry, native: false,
            action: Store.themeAction(entry.id),
            installedVersion: installed?.version,
            fromStore: !!installed,
            op: state.themeOps[entry.id],
            install: () => Store.installTheme(entry.id),
            uninstall: () => Store.uninstallTheme(entry.id),
        };
    });
}

/** Loads the registry the first time anything store-related shows */
function useStoreState() {
    const state = useStore(Store.subscribe, Store.getSnapshot);
    React.useEffect(() => {
        if (state.status === "idle") Store.refresh();
    }, []);
    return state;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00`));

// ---- banner -----------------------------------------------------------------------------------

/** The store's way in, on top of the Plugins and Themes tabs */
export function StoreBanner({ kind, onOpen }: { kind: StoreKind; onOpen(): void; }) {
    const state = useStoreState();
    const items = itemsOf(kind);
    const updates = items.filter(i => i.action === "update").length;
    const available = items.filter(i => i.action === "install").length;
    const titleId = `dl-${kind}-store-banner`;

    const summary = state.status === "ready"
        ? [`${plural(available, kind)} to install`, updates && `${updates} ${updates === 1 ? "update" : "updates"} ready`].filter(Boolean).join(" · ")
        : state.status === "error" ? "Couldn’t reach the store" : "Loading the store…";

    return (
        <section className="dl-store-banner" aria-labelledby={titleId}>
            <span className="dl-store-banner-icon"><Icon name={kind === "plugin" ? "store" : "palette"} size={24} /></span>
            <div className="dl-store-banner-text">
                <Text tag="h2" variant="heading-lg/bold" color="text-strong" id={titleId}>{words[kind].Store}</Text>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">
                    {kind === "plugin"
                        ? "Add more to Discord with plugins made for Evi. Every file is checked before it’s installed."
                        : "Restyle Discord in one click. Themes only change how Discord looks, they can’t run code."}
                </Text>
                <Text variant="text-xs/medium" color="text-muted" tabular role="status">{summary}</Text>
            </div>
            <div className="dl-row-controls">
                <Button size="md" icon="refresh" disabled={state.status === "loading"} onClick={() => Store.refresh()}>Refresh</Button>
                <Button variant="accent" size="md" id={`dl-open-${kind}-store`} onClick={onOpen}>{updates ? "See updates" : "Browse"}</Button>
            </div>
        </section>
    );
}

// ---- shared pieces ----------------------------------------------------------------------------

function OpStatus({ op }: { op: StoreOp | undefined; }) {
    if (!op) return null;
    if (op.type === "busy") return <Status tone="muted">{op.label}</Status>;
    if (op.type === "done") return <Status tone="success">{op.message}</Status>;
    return <Status tone="danger">{op.error}</Status>;
}

/** `short` for cards, where the footer only has room for a word or two */
function ItemStatus({ item, short }: { item: Item; short?: boolean; }) {
    const { op, action, installedVersion, entry } = item;
    if (op) return <OpStatus op={op} />;
    if (action === "installed") return <Status tone="success" quiet>Installed{!short && installedVersion && ` v${installedVersion}`}</Status>;
    if (action === "update") return <Status tone="warning">{short ? `v${installedVersion} → v${entry.version}` : `Update available, you have v${installedVersion}`}</Status>;
    if (action === "local") return <Status tone="success" quiet>{short ? "Installed" : `Installed outside the store${installedVersion ? `, v${installedVersion}` : ""}`}</Status>;
    if (action === "incompatible") return <Status tone="danger">Needs Evi {entry.minEviVersion} or newer</Status>;
    return null;
}

/** Native plugins get their own step: what full access means, and a button that repeats it */
function NativeConfirm({ item, onConfirm, onCancel }: { item: Item; onConfirm(): void; onCancel(): void; }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => ref.current?.focus(), []);
    const titleId = `dl-store-confirm-${item.entry.id}`;

    return (
        <div className="dl-store-confirm" role="group" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
            <p className="dl-store-confirm-title" id={titleId}><Icon name="warning" size={20} />{item.entry.name} runs with full access to your computer</p>
            <p className="dl-hint">
                Native plugins run code in Discord’s main process, outside the browser sandbox. They can read and change
                your files, start programs and use your network like any app you install. Only continue if you trust
                {" "}{item.entry.authors.join(", ")}.
            </p>
            <div className="dl-toolbar">
                <Button variant="accent" onClick={onConfirm}>Install with full access</Button>
                <Button onClick={onCancel}>Cancel</Button>
            </div>
        </div>
    );
}

/** Install / Update / Uninstall, with the full-access step in between for native plugins */
function useItemActions(item: Item) {
    const [confirming, setConfirming] = React.useState(false);
    const busy = item.op?.type === "busy";
    const install = () => {
        // Updates ask again: a new version may do more than the one you agreed to
        if (item.native) return setConfirming(true);
        item.install();
    };

    const buttons = (
        <>
            {item.fromStore && <Button disabled={busy} onClick={() => item.uninstall()}>Uninstall</Button>}
            {/* Plugins Evi shipped with, or put in the folder by hand: removable here too */}
            {!item.fromStore && item.kind === "plugin" && item.action === "local" && <Button disabled={busy} onClick={() => item.uninstall()}>Remove</Button>}
            {item.action === "install" && <Button variant="accent" icon="download" disabled={busy || confirming} onClick={install}>Install</Button>}
            {item.action === "update" && <Button variant="accent" icon="download" disabled={busy || confirming} onClick={install}>Update</Button>}
        </>
    );
    const confirm = confirming && (
        <NativeConfirm
            item={item}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
                setConfirming(false);
                item.install(true);
            }}
        />
    );
    return { buttons, confirm };
}

/** GitHub-style: one star per install. Hidden while the stars server can't be reached. */
function StarButton({ item, large }: { item: Item; large?: boolean; }) {
    const state = useStore(Store.subscribe, Store.getSnapshot);
    if (!state.stars) return null;
    const starred = Store.isStarred(item.kind, item.entry.id);
    const count = Store.stars(item.kind, item.entry.id);
    return (
        <button
            type="button"
            className="dl-star"
            data-size={large ? "lg" : undefined}
            aria-pressed={starred}
            aria-label={`${starred ? "Unstar" : "Star"} ${item.entry.name}, ${count} ${count === 1 ? "star" : "stars"}`}
            onClick={() => Store.toggleStar(item.kind, item.entry.id)}
        >
            <Icon name="star" size={large ? 18 : 14} />
            <span className="dl-tabular">{large ? `${starred ? "Starred" : "Star"} · ${count}` : count}</span>
        </button>
    );
}

function Glyph({ name, size }: { name: string; size?: "lg"; }) {
    return <span className="dl-store-glyph" data-size={size} aria-hidden="true">{name.charAt(0)}</span>;
}

// ---- listing ----------------------------------------------------------------------------------

function StoreCard({ item, onOpen }: { item: Item; onOpen(): void; }) {
    const { entry } = item;
    const { buttons, confirm } = useItemActions(item);
    const titleId = `dl-store-${item.kind}-${entry.id}`;

    // The whole card opens the detail page (the title's button stretches over it); the star and the
    // action buttons sit above that layer
    return (
        <li className="dl-store-card" aria-labelledby={titleId} data-store-id={entry.id}>
            <div className="dl-store-card-top">
                <Glyph name={entry.name} />
                <div className="dl-store-card-title">
                    <Text tag="h3" variant="text-md/semibold" color="text-strong" id={titleId}>
                        <button type="button" className="dl-link-button dl-store-card-link" onClick={onOpen}>{entry.name}</button>
                    </Text>
                    <Text variant="text-xs/normal" color="text-muted" tabular>v{entry.version} · {entry.authors.join(", ")}</Text>
                </div>
                <StarButton item={item} />
            </div>
            {entry.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-store-card-desc">{entry.description}</Text>}
            {(item.native || entry.tags.length > 0) && (
                <div className="dl-store-card-tags">
                    {item.native && <Badge tone="warning">Native</Badge>}
                    {entry.tags.map(t => <span key={t} className="dl-store-tag">{t}</span>)}
                </div>
            )}
            <div className="dl-store-card-foot">
                <span className="dl-store-status" role="status"><ItemStatus item={item} short /></span>
                <div className="dl-row-controls">{buttons}</div>
            </div>
            {confirm}
        </li>
    );
}

const NOTES_SHOWN = 3;

/** One pending update: what it is, old → new version, what changed, and its own Update button */
function UpdateRow({ item }: { item: Item; }) {
    const [expanded, setExpanded] = React.useState(false);
    const { entry, installedVersion } = item;
    const entries = installedVersion ? entriesBetween(entry.changelog, installedVersion, entry.version) : [];
    const notes = entries.flatMap(e => e.notes.map(note => ({ version: e.version, note })));
    const shown = expanded ? notes : notes.slice(0, NOTES_SHOWN);
    const busy = item.op?.type === "busy";
    const multiVersion = entries.length > 1;

    return (
        <li className="dl-store-update">
            <div className="dl-store-update-head">
                <Text variant="text-sm/semibold" color="text-strong">{entry.name}</Text>
                <span className="dl-store-update-version">
                    {installedVersion ? `${installedVersion} → ${entry.version}` : entry.version}
                </span>
                {item.native && <Badge tone="warning">Native</Badge>}
                <span className="dl-grow" />
                {/* Full-access plugins go through Update all, which asks first */}
                {!item.native && (
                    <Button size="sm" disabled={busy} onClick={() => void item.install()} aria-label={`Update ${entry.name}`}>
                        {busy ? "Updating…" : "Update"}
                    </Button>
                )}
            </div>
            {notes.length
                ? (
                    <ul className="dl-store-update-notes">
                        {shown.map(({ version, note }, i) => (
                            <li key={i}>
                                {multiVersion && <span className="dl-store-update-note-version">{version}</span>}
                                {note}
                            </li>
                        ))}
                    </ul>
                )
                : <p className="dl-hint">No release notes for this version.</p>}
            {notes.length > NOTES_SHOWN && (
                <button type="button" className="dl-link-button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
                    {expanded ? "Show less" : `Show ${notes.length - NOTES_SHOWN} more`}
                </button>
            )}
        </li>
    );
}

/** Update all, with one question for the full-access plugins among the updates */
function UpdateAll({ kind, items }: { kind: StoreKind; items: Item[]; }) {
    const state = useStore(Store.subscribe, Store.getSnapshot);
    const [asking, setAsking] = React.useState(false);
    const [result, setResult] = React.useState<UpdateAllResult>();
    const updates = items.filter(i => i.action === "update");
    const native = updates.filter(i => i.native);

    const run = async (includeNative: boolean) => {
        setAsking(false);
        setResult(await Store.updateAll(kind, { includeNative }));
    };

    if (result && !updates.length) {
        const text = result.failed.length
            ? `Updated ${result.updated.length}, ${result.failed.length} failed: ${result.failed.join(", ")}`
            : `Updated ${plural(result.updated.length, kind)}`;
        return <Notice tone={result.failed.length ? "danger" : "info"}>{text}</Notice>;
    }
    if (!updates.length) return null;

    return (
        <div className="dl-store-updates" role="group" aria-label="Updates">
            <div className="dl-store-updates-head">
                <Icon name="download" size={20} />
                <Text variant="text-md/semibold" color="text-strong" className="dl-grow">
                    {updates.length === 1 ? "1 update available" : `${updates.length} updates available`}
                </Text>
                <Button
                    variant="accent"
                    id={`dl-${kind}-update-all`}
                    disabled={!!state.updatingAll || asking}
                    onClick={() => native.length ? setAsking(true) : run(false)}
                >
                    {state.updatingAll === kind ? "Updating…" : "Update all"}
                </Button>
            </div>
            <ul className="dl-store-update-list" aria-label="Pending updates">
                {updates.map(item => <UpdateRow key={item.entry.id} item={item} />)}
            </ul>
            {asking && (
                <div className="dl-store-confirm" role="group" aria-label="Full access updates">
                    <p className="dl-store-confirm-title"><Icon name="warning" size={20} />{native.map(i => i.entry.name).join(", ")} {native.length === 1 ? "runs" : "run"} with full access to your computer</p>
                    <p className="dl-hint">A new version may do more than the one you agreed to. Update {native.length === 1 ? "it" : "them"} too, or only the rest?</p>
                    <div className="dl-toolbar">
                        <Button variant="accent" onClick={() => run(true)}>Update all, including full access</Button>
                        {updates.length > native.length && <Button onClick={() => run(false)}>Only the others</Button>}
                        <Button onClick={() => setAsking(false)}>Cancel</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

type Filter = "all" | "updates" | "installed" | `tag:${string}`;

const sortOptions = [
    { value: "name", label: "Name" },
    { value: "stars", label: "Most starred" },
    { value: "updated", label: "Recently updated" },
] as const satisfies readonly { value: ListingSort; label: string; }[];

export function StoreView({ kind, onBack, initialId }: { kind: StoreKind; onBack(): void; initialId?: string; }) {
    const state = useStoreState();
    const settings = useStore(Settings.subscribe, () => Settings.data);
    const [query, setQuery] = React.useState("");
    const [filter, setFilter] = React.useState<Filter>("all");
    const [sort, setSort] = React.useState<ListingSort>("name");
    const [selected, setSelected] = React.useState(initialId);
    const topRef = React.useRef<HTMLDivElement>(null);

    // Detail pages start at their top, wherever the list was scrolled to. A block body on purpose:
    // Chrome's scrollIntoView now returns a promise, and React would call it as the cleanup.
    React.useEffect(() => {
        topRef.current?.scrollIntoView?.({ block: "nearest" });
    }, [selected]);

    const items = itemsOf(kind);
    const current = selected ? items.find(i => i.entry.id === selected) : undefined;
    if (current) {
        return <div ref={topRef}><StoreDetail item={current} onBack={() => setSelected(undefined)} /></div>;
    }

    const tags = [...new Set(items.flatMap(i => i.entry.tags))].sort();
    const tests: Record<string, (i: Item) => boolean> = {
        all: () => true,
        updates: i => i.action === "update",
        installed: i => i.action === "installed" || i.action === "update" || i.action === "local",
        ...Object.fromEntries(tags.map(t => [`tag:${t}`, (i: Item) => i.entry.tags.includes(t)])),
    };
    const test = tests[filter] ?? tests.all;
    const count = (f: string) => items.filter(tests[f]).length;

    const q = query.trim().toLowerCase();
    const matches = (i: Item) => !q || [i.entry.id, i.entry.name, i.entry.description, ...i.entry.authors, ...i.entry.tags].join(" ").toLowerCase().includes(q);
    const order = new Map(sortListings(items.map(i => i.entry), sort, e => Store.stars(kind, e.id)).map((e, n) => [e.id, n]));
    const visible = items.filter(i => test(i) && matches(i)).sort((a, b) => order.get(a.entry.id)! - order.get(b.entry.id)!);

    return (
        <div className="dl-tab" ref={topRef}>
            <div className="dl-controls">
                <div>
                    <Button icon="chevronLeft" onClick={onBack}>{words[kind].back}</Button>
                </div>
                <div className="dl-toolbar">
                    <div className="dl-grow">
                        <SearchField id={`dl-${kind}-store-search`} label={`Search the ${words[kind].Store}`} placeholder={`Search ${words[kind].many}`} value={query} onChange={setQuery} />
                    </div>
                    <Button size="md" icon="refresh" disabled={state.status === "loading"} onClick={() => Store.refresh()}>Refresh</Button>
                </div>
                <div className="dl-toolbar dl-store-filters">
                    <div className="dl-grow">
                        <FilterChips<Filter>
                            label={`Show ${words[kind].many}`}
                            value={filter in tests ? filter : "all"}
                            onChange={setFilter}
                            options={[
                                { id: "all", label: "All", count: items.length },
                                { id: "updates", label: "Updates", count: count("updates") },
                                { id: "installed", label: "Installed", count: count("installed") },
                                ...tags.map(t => ({ id: `tag:${t}` as Filter, label: t[0].toUpperCase() + t.slice(1), count: count(`tag:${t}`) })),
                            ]}
                        />
                    </div>
                    <div className="dl-store-sort">
                        <Text variant="text-sm/medium" color="text-subtle" id={`dl-${kind}-store-sort-label`}>Sort</Text>
                        <Dropdown<ListingSort> id={`dl-${kind}-store-sort`} label="Sort by" labelledBy={`dl-${kind}-store-sort-label`} options={sortOptions} value={sort} onChange={setSort} />
                    </div>
                </div>
            </div>

            <UpdateAll kind={kind} items={items} />

            <div className="dl-stack">
                <div role="status" className="dl-store-registry">
                    {state.status === "loading" && <Status tone="muted">Loading the store…</Status>}
                    {state.status === "error" && <Status tone="danger">Couldn’t load the store: {state.error}</Status>}
                    {state.status === "ready" && state.problems.length > 0 && (
                        <Status tone="warning">Skipped {state.problems.length} invalid {state.problems.length === 1 ? "entry" : "entries"}</Status>
                    )}
                </div>
                {visible.length ? (
                    <ul className="dl-store-grid" aria-label={`Store ${words[kind].many}`}>
                        {visible.map(i => <StoreCard key={i.entry.id} item={i} onOpen={() => setSelected(i.entry.id)} />)}
                    </ul>
                ) : state.status === "ready" && (
                    <EmptyState
                        icon={items.length ? "search" : "store"}
                        title={!items.length ? `No ${words[kind].many} in the store yet` : q ? `No ${words[kind].many} match “${query.trim()}”` : `No ${words[kind].many} in this filter`}
                        action={items.length ? <Button onClick={() => { setQuery(""); setFilter("all"); }}>Show everything</Button> : undefined}
                    >
                        {!items.length ? "This registry doesn’t list any yet. Check back later." : "Try a name, an author or a category."}
                    </EmptyState>
                )}
            </div>

            <List label="Store settings">
                <li className="dl-row">
                    <SwitchRow
                        id="dl-store-auto-update"
                        label="Update automatically"
                        description="Installs plugin and theme updates in the background and tells you what changed. Plugins with full access to your computer still wait for your OK."
                        checked={!!settings.autoUpdate}
                        onChange={Store.setAutoUpdate}
                    />
                </li>
                {kind === "plugin" && <PluginChangelogSetting />}
            </List>

            {state.registryUrl && (
                <p className="dl-hint">
                    Everything comes from <span className="dl-mono">{state.registryUrl}</span> and is checked against the
                    registry’s sha256 before it’s installed. To use another registry, set <span className="dl-mono">registryUrl</span> in
                    {" "}<span className="dl-mono">store.json</span> in your data folder.
                </p>
            )}
        </div>
    );
}

// ---- detail -----------------------------------------------------------------------------------

function Screenshot({ url, name, index }: { url: string; name: string; index: number; }) {
    const [src, setSrc] = React.useState<string | null | undefined>();
    React.useEffect(() => {
        let live = true;
        Store.image(url).then(s => live && setSrc(s));
        return () => void (live = false);
    }, [url]);

    if (src === null) return null;
    return (
        <figure className="dl-store-shot" data-loading={src ? undefined : ""}>
            {src && <img src={src} alt={`${name} screenshot ${index + 1}`} loading="lazy" />}
        </figure>
    );
}

function Fact({ label, children }: { label: string; children: React.ReactNode; }) {
    return (
        <div className="dl-store-fact">
            <dt><Text variant="text-xs/semibold" color="text-muted">{label}</Text></dt>
            <dd><Text variant="text-sm/medium" color="text-strong">{children}</Text></dd>
        </div>
    );
}

function StoreDetail({ item, onBack }: { item: Item; onBack(): void; }) {
    const { entry, kind } = item;
    const { buttons, confirm } = useItemActions(item);
    const headingId = `dl-store-detail-${entry.id}`;

    return (
        <article className="dl-tab dl-store-detail" aria-labelledby={headingId} data-store-detail={entry.id}>
            <div>
                <Button icon="chevronLeft" onClick={onBack}>{words[kind].Store}</Button>
            </div>

            <header className="dl-store-detail-head">
                <Glyph name={entry.name} size="lg" />
                <div className="dl-store-detail-title">
                    <div className="dl-row-title">
                        <Text tag="h2" variant="heading-xl/bold" color="text-strong" id={headingId}>{entry.name}</Text>
                        {item.native && <Badge tone="warning">Native</Badge>}
                    </div>
                    <Text variant="text-sm/normal" color="text-subtle">By {entry.authors.join(", ")}</Text>
                    <span className="dl-store-status" role="status"><ItemStatus item={item} /></span>
                </div>
                <div className="dl-row-controls"><StarButton item={item} large />{buttons}</div>
            </header>
            {confirm}

            {entry.description && <Text tag="p" variant="text-md/normal" color="text-default" className="dl-store-detail-desc">{entry.description}</Text>}

            {entry.screenshots.length > 0 && (
                <div className="dl-store-shots">
                    {entry.screenshots.map((url, i) => <Screenshot key={url} url={url} name={entry.name} index={i} />)}
                </div>
            )}

            <dl className="dl-store-facts">
                <Fact label="Version">v{entry.version}{item.installedVersion && item.installedVersion !== entry.version && ` (you have v${item.installedVersion})`}</Fact>
                {entry.updatedAt && <Fact label="Updated">{formatDate(entry.updatedAt)}</Fact>}
                {entry.minEviVersion && <Fact label="Needs">Evi {entry.minEviVersion}+</Fact>}
                {entry.tags.length > 0 && <Fact label="Categories">{entry.tags.join(", ")}</Fact>}
            </dl>

            <section className="dl-store-access" data-native={item.native ? "" : undefined} aria-label="What it can access">
                <Icon name={item.native ? "warning" : "circleCheck"} size={20} />
                <div>
                    <Text variant="text-md/semibold" color="text-strong">
                        {item.native ? "Full access to your computer" : kind === "theme" ? "Looks only" : "Runs inside Discord only"}
                    </Text>
                    <Text tag="p" variant="text-sm/normal" color="text-subtle">
                        {item.native
                            ? "Runs code in Discord’s main process or changes how Discord starts. It can read and change your files, start programs and use your network."
                            : kind === "theme"
                                ? "A theme is a stylesheet: it changes how Discord looks and can’t run code."
                                : "Runs in Discord’s page like Discord’s own code. It can see and change what Discord shows, but not your files."}
                    </Text>
                </div>
            </section>
            {kind === "plugin" && <StorePluginPermissions id={entry.id} version={entry.version} native={item.native} headingId={`${headingId}-permissions`} />}

            {entry.source && (
                <div>
                    <a className="dl-store-source" href={entry.source} target="_blank" rel="noreferrer noopener">
                        <Icon name="link" size={16} />View source
                    </a>
                </div>
            )}

            <section className="dl-stack" aria-labelledby={`${headingId}-changes`}>
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={`${headingId}-changes`}>What’s new</Text>
                {entry.changelog.length ? (
                    <ol className="dl-changelog">
                        {entry.changelog.map(c => (
                            <li key={c.version}>
                                <div className="dl-row-title">
                                    <Text variant="text-sm/semibold" color="text-strong" tabular>v{c.version}</Text>
                                    {c.version === item.installedVersion && <Badge>Installed</Badge>}
                                </div>
                                <ul>{c.notes.map(n => <li key={n}><Text variant="text-sm/normal" color="text-subtle">{n}</Text></li>)}</ul>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <Text tag="p" variant="text-sm/normal" color="text-muted">No changelog published for this {words[kind].one}.</Text>
                )}
            </section>
        </article>
    );
}
