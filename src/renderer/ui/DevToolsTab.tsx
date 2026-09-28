/**
 * Evi DevTools, for plugin authors: Discord's Flux actions as they happen, its stores' current values,
 * how often patched code calls into each plugin, which plugins take time, and @evi/api's reference and
 * changes. Nothing runs while the tab is closed: the Flux hook and the timers live in the mounted
 * section, and what the log recorded goes with it.
 */
import { API_CHANGELOG, ApiChange } from "@shared/apiChangelog";
import { ApiDoc, searchApiDocs } from "@shared/apiDocs";
import { actionKeys, evaluateGetters, GetterResult, matchesType, patchHits, PatchHits, RingBuffer, treeChildren, TreeChild, describeValue, zeroArgGetters } from "@shared/devtools";
import type { EviKey } from "@shared/locales";
import type { ReactNode } from "react";

import { I18n, t, useLocale } from "../i18n";
import { hook } from "../patching/hooks";
import { getPatchRecords, PatchState } from "../patching/source";
import { Perf, PluginReport, WINDOW_S } from "../perf";
import { PluginManager } from "../plugins/manager";
import { Dispatcher, FluxAction, React } from "../webpack/common";
import { findStore, listStores } from "../webpack/find";
import {
    Badge, Button, EmptyState, FilterChips, Icon, IconButton, List, Pagination, SearchField, Section, Status, Text, Tone, usePages,
} from "./components";
import { showTab } from "./nav";

type SectionId = "flux" | "stores" | "hits" | "timings" | "api" | "changes";

/** The section you were on, kept while settings are closed */
let lastSection: SectionId = "flux";

const pluginName = (id: string) => PluginManager.get(id)?.manifest.name ?? id;

function formatMs(value: number) {
    if (value === 0) return "0 ms";
    if (value < 0.1) return "<0.1 ms";
    if (value < 10) return `${value.toFixed(1)} ms`;
    return `${Math.round(value).toLocaleString(I18n.locale)} ms`;
}

const formatCount = (n: number) => n.toLocaleString(I18n.locale);

/** Calls `fn` every `ms` while mounted */
function useInterval(fn: () => void, ms: number) {
    const latest = React.useRef(fn);
    latest.current = fn;
    React.useEffect(() => {
        const timer = setInterval(() => latest.current(), ms);
        return () => clearInterval(timer);
    }, [ms]);
}

// ---- JSON tree ------------------------------------------------------------------------------------

/** A value's children, read when its node opens */
function JsonChildren({ value, ancestors }: { value: unknown; ancestors: readonly unknown[]; }) {
    const { children, more } = React.useMemo(() => treeChildren(value, ancestors), [value]);
    return (
        <ul className="dl-json-group">
            {children.map(child => <JsonNode key={child.key} child={child} ancestors={ancestors} />)}
            {more > 0 && <li className="dl-json-more">{t("devtools.json.more", { count: more })}</li>}
        </ul>
    );
}

function JsonNode({ child, ancestors }: { child: TreeChild; ancestors: readonly unknown[]; }) {
    const [open, setOpen] = React.useState(false);
    const line = (
        <>
            <span className="dl-json-key">{child.key}</span>
            <span className="dl-json-punct">: </span>
            <span className="dl-json-value" data-kind={child.info.kind}>{child.info.label}</span>
        </>
    );
    if (!child.canExpand) return <li className="dl-json-leaf">{line}</li>;
    return (
        <li>
            <button type="button" className="dl-json-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
                <Icon name="chevronRight" size={12} className="dl-json-chevron" />
                {line}
            </button>
            {open && <JsonChildren value={child.value} ancestors={[...ancestors, child.value]} />}
        </li>
    );
}

/**
 * Any value as a tree you open level by level: nothing below a closed node is read, cycles show as
 * [Circular], long lists and strings are cut, and getters that throw say so instead of breaking it.
 */
export function JsonTree({ value, label }: { value: unknown; label: string; }) {
    const info = describeValue(value);
    return (
        <div className="dl-json" role="group" aria-label={label}>
            {info.expandable
                ? <JsonChildren value={value} ancestors={[value]} />
                : <span className="dl-json-value" data-kind={info.kind}>{info.label}</span>}
        </div>
    );
}

// ---- Flux log -------------------------------------------------------------------------------------

const FLUX_CAPACITY = 500;
/** Rows drawn at once; the rest stay in the buffer for the filter */
const FLUX_SHOWN = 200;
/** New actions show at most this often, so a burst of dispatches is one render */
const FLUX_RENDER_MS = 250;

interface FluxEntry {
    id: number;
    at: number;
    type: string;
    action: FluxAction;
}

const timeFormat = () => new Intl.DateTimeFormat(I18n.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false });

function FluxLog() {
    const buffer = React.useRef<RingBuffer<FluxEntry>>(null);
    buffer.current ??= new RingBuffer(FLUX_CAPACITY);
    const [paused, setPaused] = React.useState(false);
    const [filter, setFilter] = React.useState("");
    const [selected, setSelected] = React.useState<FluxEntry>();
    const [error, setError] = React.useState<string>();
    const [, setVersion] = React.useState(0);

    React.useEffect(() => {
        if (paused) return;
        const log = buffer.current!;
        let seq = log.total;
        let pending: ReturnType<typeof setTimeout> | undefined;
        let unhook: (() => void) | undefined;
        try {
            unhook = hook(Dispatcher, "dispatch", "before", ({ args }) => {
                const action = args[0] as FluxAction;
                log.push({ id: ++seq, at: Date.now(), type: typeof action?.type === "string" ? action.type : "?", action });
                pending ??= setTimeout(() => {
                    pending = undefined;
                    setVersion(v => v + 1);
                }, FLUX_RENDER_MS);
            }, "evi-devtools");
            setError(undefined);
        } catch (err) {
            setError(String((err as Error)?.message ?? err));
        }
        return () => {
            unhook?.();
            clearTimeout(pending);
        };
    }, [paused]);

    // Leaving the tab forgets what was recorded: actions carry messages and other private data
    React.useEffect(() => () => buffer.current?.clear(), []);

    const log = buffer.current;
    const matching = log.newestFirst().filter(e => matchesType(e.type, filter));
    const shown = matching.slice(0, FLUX_SHOWN);
    const time = timeFormat();

    const clear = () => {
        log.clear();
        setSelected(undefined);
        setVersion(v => v + 1);
    };

    return (
        <Section
            id="dl-dt-flux"
            title={t("devtools.flux.title")}
            description={t("devtools.flux.description")}
            action={(
                <div className="dl-toolbar">
                    <Button onClick={() => setPaused(p => !p)}>{paused ? t("devtools.flux.resume") : t("devtools.flux.pause")}</Button>
                    <Button icon="trash" onClick={clear} disabled={!log.size}>{t("devtools.flux.clear")}</Button>
                </div>
            )}
        >
            {error && <pre className="dl-error">{t("devtools.flux.hookFailed", { error })}</pre>}
            <SearchField id="dl-dt-flux-filter" label={t("devtools.flux.filter")} placeholder={t("devtools.flux.filter")} value={filter} onChange={setFilter} />
            <Text tag="p" variant="text-sm/normal" color="text-subtle" tabular>
                {paused ? `${t("devtools.flux.paused")} ` : ""}
                {t("devtools.flux.summary", { count: log.size })}
                {matching.length > shown.length ? ` ${t("devtools.flux.shown", { shown: shown.length })}` : ""}
            </Text>
            {!log.size ? (
                <EmptyState icon="terminal" title={t("devtools.flux.emptyTitle")}>{t("devtools.flux.emptyBody")}</EmptyState>
            ) : !shown.length ? (
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("devtools.flux.noMatch", { filter })}</Text>
            ) : (
                <ul className="dl-list dl-dt-log" aria-label={t("devtools.flux.actions")}>
                    {shown.map(entry => {
                        const { keys, more } = actionKeys(entry.action);
                        return (
                            <li key={entry.id}>
                                <button type="button" className="dl-dt-log-row" aria-pressed={selected?.id === entry.id} onClick={() => setSelected(entry)}>
                                    <span className="dl-dt-log-time">{time.format(entry.at)}</span>
                                    <span className="dl-dt-log-type">{entry.type}</span>
                                    <span className="dl-dt-log-keys">
                                        {keys.join(", ")}
                                        {more > 0 && ` ${t("devtools.flux.moreKeys", { count: more })}`}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {selected && (
                <section className="dl-card" aria-labelledby="dl-dt-flux-detail-title">
                    <div className="dl-card-head">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id="dl-dt-flux-detail-title" className="dl-grow dl-mono">{selected.type}</Text>
                        <IconButton icon="close" label={t("devtools.flux.closeDetails")} onClick={() => setSelected(undefined)} />
                    </div>
                    <div className="dl-card-body">
                        <JsonTree value={selected.action} label={t("devtools.flux.details")} />
                    </div>
                </section>
            )}
        </Section>
    );
}

// ---- stores ---------------------------------------------------------------------------------------

/** A store changes as often as Discord does: its getters run again at most this often */
const STORE_REFRESH_MS = 500;

interface FluxStore {
    addChangeListener?(fn: () => void): void;
    removeChangeListener?(fn: () => void): void;
}

function StoreGetters({ name }: { name: string; }) {
    const store = React.useMemo(() => {
        try {
            return findStore<FluxStore & object>(name);
        } catch {
            return undefined;
        }
    }, [name]);
    const getters = React.useMemo(() => store ? zeroArgGetters(store) : [], [store]);
    const read = () => store ? evaluateGetters(store, getters) : [];
    const [results, setResults] = React.useState<GetterResult[]>(read);

    React.useEffect(() => {
        setResults(read());
        if (!store?.addChangeListener) return;
        let pending: ReturnType<typeof setTimeout> | undefined;
        const onChange = () => {
            pending ??= setTimeout(() => {
                pending = undefined;
                setResults(read());
            }, STORE_REFRESH_MS);
        };
        store.addChangeListener(onChange);
        return () => {
            store.removeChangeListener?.(onChange);
            clearTimeout(pending);
        };
    }, [store]);

    return (
        <section className="dl-card dl-dt-store" aria-labelledby="dl-dt-store-title">
            <div className="dl-card-head">
                <Text tag="h3" variant="heading-md/medium" color="text-strong" id="dl-dt-store-title" className="dl-grow dl-mono">{name}</Text>
                <Button icon="refresh" onClick={() => setResults(read())}>{t("devtools.stores.refresh")}</Button>
            </div>
            <div className="dl-card-body">
                {!results.length ? (
                    <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("devtools.stores.noGetters")}</Text>
                ) : (
                    <div className="dl-json" role="group" aria-label={name}>
                        <ul className="dl-json-group">
                            {results.map(r => {
                                const info = r.error !== undefined
                                    ? { kind: "unreadable" as const, label: `(threw: ${r.error})`, expandable: false }
                                    : describeValue(r.value);
                                const child: TreeChild = { key: `${r.name}()`, value: r.value, info, canExpand: info.expandable };
                                return <JsonNode key={r.name} child={child} ancestors={[store]} />;
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}

function StoreInspector() {
    const [names, setNames] = React.useState<string[] | undefined>(() => {
        try {
            return listStores();
        } catch {
            return undefined;
        }
    });
    const [query, setQuery] = React.useState("");
    const [selected, setSelected] = React.useState<string>();

    if (!names) {
        return (
            <Section id="dl-dt-stores" title={t("devtools.stores.title")} description={t("devtools.stores.description")}>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("devtools.stores.notReady")}</Text>
            </Section>
        );
    }
    const matching = names.filter(n => matchesType(n, query));

    return (
        <Section
            id="dl-dt-stores"
            title={t("devtools.stores.title")}
            description={t("devtools.stores.description")}
            action={<Button icon="refresh" onClick={() => setNames(listStores())}>{t("devtools.stores.refresh")}</Button>}
        >
            <SearchField id="dl-dt-store-search" label={t("devtools.stores.search")} placeholder={t("devtools.stores.search")} value={query} onChange={setQuery} />
            <div className="dl-dt-split">
                <div className="dl-stack">
                    <Text tag="p" variant="text-sm/normal" color="text-subtle" tabular>{t("devtools.stores.count", { count: matching.length })}</Text>
                    {matching.length ? (
                        <ul className="dl-list dl-dt-store-list" aria-label={t("devtools.stores.list")}>
                            {matching.map(name => (
                                <li key={name}>
                                    <button type="button" className="dl-dt-store-row" aria-pressed={name === selected} onClick={() => setSelected(name)}>{name}</button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("devtools.stores.noMatch", { query })}</Text>
                    )}
                </div>
                {selected
                    ? <StoreGetters key={selected} name={selected} />
                    : <EmptyState icon="search" title={t("devtools.stores.pickTitle")}>{t("devtools.stores.pickBody")}</EmptyState>}
            </div>
        </Section>
    );
}

// ---- patch hits -----------------------------------------------------------------------------------

const patchState: Record<PatchState, { tone: Tone; label: EviKey; }> = {
    applied: { tone: "success", label: "patches.applied" },
    pending: { tone: "muted", label: "patches.waiting" },
    partial: { tone: "danger", label: "patches.partial" },
    failed: { tone: "danger", label: "patches.failed" },
};

const readHits = () => patchHits(Perf.snapshot(), getPatchRecords());

function HitsRow({ hits }: { hits: PatchHits; }) {
    const titleId = `dl-dt-hits-${hits.plugin}`;
    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{pluginName(hits.plugin)}</Text>
                        <Text variant="text-xs/medium" color="text-muted" tabular>{t("devtools.hits.total", { count: hits.calls })}</Text>
                    </div>
                    {hits.patches.length > 0 && (
                        <div className="dl-row-meta">
                            {hits.patches.map(p => {
                                const state = patchState[p.state as PatchState] ?? patchState.pending;
                                return (
                                    <Status key={p.index} tone={state.tone} quiet={state.tone === "success"}>
                                        {`${t("patches.patchNumber", { n: p.index + 1 })} · ${t(state.label)}`}
                                    </Status>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            {hits.functions.length ? (
                <div className="dl-perf-card">
                    <table className="dl-perf-table dl-dt-table" aria-label={t("devtools.hits.function")}>
                        <thead>
                            <tr>
                                <th scope="col">{t("devtools.hits.function")}</th>
                                <th scope="col">{t("devtools.hits.calls")}</th>
                                <th scope="col">{t("devtools.hits.recent", { seconds: WINDOW_S })}</th>
                                <th scope="col">{t("devtools.hits.time")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hits.functions.map(f => (
                                <tr key={f.name}>
                                    <th scope="row"><span className="dl-mono dl-dt-fn">{f.name}</span></th>
                                    <td>{formatCount(f.calls)}</td>
                                    <td>{formatCount(f.recentCalls)}</td>
                                    <td>{formatMs(f.ms)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("devtools.hits.noCalls")}</Text>
            )}
        </li>
    );
}

function PatchHitsView() {
    const [hits, setHits] = React.useState(readHits);
    useInterval(() => setHits(readHits()), 1000);
    return (
        <Section id="dl-dt-hits" title={t("devtools.hits.title")} description={t("devtools.hits.description")}>
            {hits.length ? (
                <List label={t("devtools.hits.title")}>{hits.map(h => <HitsRow key={h.plugin} hits={h} />)}</List>
            ) : (
                <EmptyState icon="wrench" title={t("devtools.hits.emptyTitle")}>{t("devtools.hits.emptyBody")}</EmptyState>
            )}
        </Section>
    );
}

// ---- timings --------------------------------------------------------------------------------------

const TOP_PLUGINS = 8;

function Timings() {
    const [plugins, setPlugins] = React.useState<PluginReport[]>(Perf.snapshot);
    useInterval(() => setPlugins(Perf.snapshot()), 1000);
    const top = plugins.slice(0, TOP_PLUGINS);
    return (
        <Section
            id="dl-dt-timings"
            title={t("devtools.timings.title")}
            description={t("devtools.timings.description", { seconds: WINDOW_S })}
            action={<Button icon="clock" onClick={() => showTab("advanced", "performance")}>{t("devtools.timings.open")}</Button>}
        >
            {top.length ? (
                <div className="dl-perf-card">
                    <table className="dl-perf-table dl-dt-table" aria-label={t("devtools.timings.title")}>
                        <thead>
                            <tr>
                                <th scope="col">{t("devtools.timings.plugin")}</th>
                                <th scope="col">{t("devtools.timings.recent", { seconds: WINDOW_S })}</th>
                                <th scope="col">{t("devtools.timings.total")}</th>
                                <th scope="col">{t("devtools.timings.calls")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {top.map(p => (
                                <tr key={p.plugin}>
                                    <th scope="row"><Text variant="text-md/medium" color="text-strong">{pluginName(p.plugin)}</Text></th>
                                    <td>{formatMs(p.recent.ms)}</td>
                                    <td>{formatMs(p.ms)}</td>
                                    <td>{formatCount(p.calls)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyState icon="clock" title={t("devtools.timings.emptyTitle")}>{t("devtools.timings.emptyBody")}</EmptyState>
            )}
        </Section>
    );
}

// ---- API reference --------------------------------------------------------------------------------

const API_PAGE = 20;

function ApiEntry({ doc }: { doc: ApiDoc; }) {
    return (
        <li className="dl-row">
            <div className="dl-row-text">
                <div className="dl-row-title">
                    <Text tag="h3" variant="heading-md/medium" color="text-strong" className="dl-mono">{doc.name}</Text>
                    <Badge>{doc.kind}</Badge>
                </div>
                <pre className="dl-code dl-dt-signature">{doc.signature}</pre>
                {doc.doc && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-dt-doc">{doc.doc}</Text>}
                {doc.example && (
                    <figure className="dl-code-figure">
                        <figcaption className="dl-code-label">{t("devtools.api.example")}</figcaption>
                        <pre className="dl-code">{doc.example}</pre>
                    </figure>
                )}
            </div>
        </li>
    );
}

function ApiReference() {
    const [query, setQuery] = React.useState("");
    const results = React.useMemo(() => searchApiDocs(query), [query]);
    const { items, page, count, setPage } = usePages(results, API_PAGE, query);
    return (
        <Section id="dl-dt-api" title={t("devtools.api.title")} description={t("devtools.api.description")}>
            <SearchField id="dl-dt-api-search" label={t("devtools.api.search")} placeholder={t("devtools.api.search")} value={query} onChange={setQuery} />
            <Text tag="p" variant="text-sm/normal" color="text-subtle" tabular role="status">
                {results.length ? t("devtools.api.count", { count: results.length }) : t("devtools.api.noMatch", { query })}
            </Text>
            {items.length > 0 && <List label={t("devtools.api.title")}>{items.map(d => <ApiEntry key={d.name} doc={d} />)}</List>}
            <Pagination page={page} count={count} onChange={setPage} label={t("devtools.api.pages")} />
        </Section>
    );
}

// ---- API changes ----------------------------------------------------------------------------------

const changeLabel: Record<ApiChange["kind"], EviKey> = {
    added: "devtools.changes.added",
    changed: "devtools.changes.changed",
    deprecated: "devtools.changes.deprecated",
    removed: "devtools.changes.removed",
};

const formatDate = (date: string) => {
    try {
        return new Intl.DateTimeFormat(I18n.locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
    } catch {
        return date;
    }
};

function ApiChanges() {
    return (
        <Section id="dl-dt-changes" title={t("devtools.changes.title")} description={t("devtools.changes.description")}>
            {API_CHANGELOG.map(release => (
                <div key={release.version} className="dl-stack">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/semibold" color="text-strong">{t("devtools.changes.version", { version: release.version })}</Text>
                        <Text variant="text-xs/medium" color="text-muted" tabular>{formatDate(release.date)}</Text>
                    </div>
                    <List label={t("devtools.changes.version", { version: release.version })}>
                        {release.changes.map(change => (
                            <li key={`${change.kind} ${change.symbol}`} className="dl-row">
                                <div className="dl-row-text">
                                    <div className="dl-row-title">
                                        <Badge tone={change.kind === "deprecated" || change.kind === "removed" ? "warning" : undefined}>{t(changeLabel[change.kind])}</Badge>
                                        <code className="dl-mono dl-dt-symbol">{change.symbol}</code>
                                    </div>
                                    <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{change.description}</Text>
                                </div>
                            </li>
                        ))}
                    </List>
                </div>
            ))}
        </Section>
    );
}

// ---- the tab --------------------------------------------------------------------------------------

const sections: { id: SectionId; label: EviKey; View: () => ReactNode; }[] = [
    { id: "flux", label: "devtools.section.flux", View: FluxLog },
    { id: "stores", label: "devtools.section.stores", View: StoreInspector },
    { id: "hits", label: "devtools.section.hits", View: PatchHitsView },
    { id: "timings", label: "devtools.section.timings", View: Timings },
    { id: "api", label: "devtools.section.api", View: ApiReference },
    { id: "changes", label: "devtools.section.changes", View: ApiChanges },
];

export function DevToolsTab() {
    useLocale();
    const [current, setCurrent] = React.useState(lastSection);
    const section = sections.find(s => s.id === current) ?? sections[0];
    const pick = (id: SectionId) => {
        lastSection = id;
        setCurrent(id);
    };
    return (
        <div className="dl-tab">
            <FilterChips label={t("devtools.sections")} options={sections.map(s => ({ id: s.id, label: t(s.label) }))} value={section.id} onChange={pick} />
            <section.View />
        </div>
    );
}
