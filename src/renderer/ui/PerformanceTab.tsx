/**
 * Which plugins cost time (perf.ts): every plugin's time in the last 10 seconds and since Discord
 * started, and a recording of exactly what ran while you did something slow.
 *
 * Opening settings covers Discord, so a recording has to outlive this tab: you start it, close
 * settings, do the slow thing, come back and stop it. Its state lives here at module level.
 */
import type { ReactNode } from "react";

import { Perf, PluginReport, RecordingReport, SiteKind, SLOW_CALL_MS, Totals, WINDOW_S } from "../perf";
import { PluginManager } from "../plugins/manager";
import { React } from "../webpack/common";
import { Badge, Button, Collapse, EmptyState, IconButton, Section, Status, Text, useStore } from "./components";

/** A forgotten recording stops by itself */
const MAX_RECORDING_MS = 60_000;

let report: RecordingReport | undefined;
let autoStop: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
};

function startRecording() {
    Perf.startRecording();
    report = undefined;
    clearTimeout(autoStop);
    autoStop = setTimeout(stopRecording, MAX_RECORDING_MS);
    emit();
}

function stopRecording() {
    if (!Perf.recording) return;
    clearTimeout(autoStop);
    report = Perf.stopRecording();
    emit();
}

// Evi's own hooks are measured like any plugin's
const builtIn: Record<string, string> = {
    "evi": "Evi menus and commands",
    "evi-settings": "Evi in Discord settings",
    "evi-badges": "Evi badges",
    "evi-devtools": "Evi DevTools",
};

const pluginName = (id: string) => PluginManager.get(id)?.manifest.name ?? builtIn[id] ?? id;

const kindLabel: Record<SiteKind, string> = {
    hook: "Hook",
    flux: "Flux",
    patch: "Patch",
    badges: "Badges",
    menu: "Menu",
    timer: "Timer",
    keybind: "Shortcut",
    start: "Start",
};

function ms(value: number) {
    if (value === 0) return "0 ms";
    if (value < 0.1) return "<0.1 ms";
    if (value < 10) return `${value.toFixed(1)} ms`;
    return `${Math.round(value).toLocaleString()} ms`;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A plugin's busiest sites, under its row */
function Sites({ sites, recent }: { sites: (Totals & { kind: SiteKind; name: string; recent?: Totals; })[]; recent: boolean; }) {
    const top = sites.slice(0, 3);
    return (
        <ul className="dl-perf-sites">
            {top.map(s => (
                <li key={`${s.kind} ${s.name}`}>
                    <Badge>{kindLabel[s.kind]}</Badge>
                    <span className="dl-perf-site-name dl-mono">{s.name}</span>
                    <Text variant="text-xs/normal" color="text-subtle" tabular className="dl-perf-site-numbers">
                        {recent && s.recent
                            ? `${ms(s.recent.ms)} recently · ${ms(s.ms)} in all · ${count(s.calls, "call", "calls")} · worst ${ms(s.max)}`
                            : `${ms(s.ms)} · ${count(s.calls, "call", "calls")} · worst ${ms(s.max)}`}
                    </Text>
                </li>
            ))}
            {sites.length > top.length && (
                <li><Text variant="text-xs/normal" color="text-muted">{`and ${count(sites.length - top.length, "more place", "more places")}`}</Text></li>
            )}
        </ul>
    );
}

/** One plugin: its numbers, and a button that shows where the time went */
function PluginRow({ id, prefix, cells, children }: { id: string; prefix: string; cells: string[]; children: ReactNode; }) {
    const [open, setOpen] = React.useState(false);
    const name = pluginName(id);
    const detailsId = `dl-perf-${prefix}-${id}-sites`;
    return (
        <>
            <tr data-plugin={id}>
                <th scope="row">
                    <span className="dl-perf-plugin">
                        <IconButton
                            icon="chevronDown"
                            label={`Where ${name} spends time`}
                            onClick={() => setOpen(o => !o)}
                            className="dl-expand"
                            aria-expanded={open}
                            aria-controls={detailsId}
                        />
                        <Text variant="text-md/medium" color="text-strong">{name}</Text>
                        {id in builtIn && <Badge>Built in</Badge>}
                    </span>
                </th>
                {cells.map((c, i) => <td key={i}><Text variant="text-sm/normal" tabular>{c}</Text></td>)}
            </tr>
            <tr className="dl-perf-details">
                <td colSpan={cells.length + 1}>
                    <Collapse open={open} id={detailsId}>{children}</Collapse>
                </td>
            </tr>
        </>
    );
}

function Table({ label, columns, children }: { label: string; columns: string[]; children: ReactNode; }) {
    return (
        <div className="dl-perf-card">
            <table className="dl-perf-table" aria-label={label}>
                <thead>
                    <tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

function Recording({ result }: { result: RecordingReport; }) {
    const { longTasks } = result;
    const slowest = [...result.slowCalls].sort((a, b) => b.ms - a.ms).slice(0, 5);
    return (
        <div className="dl-stack" id="dl-perf-recording">
            <Text tag="p" variant="text-sm/normal" color="text-subtle" tabular role="status">
                {`Recorded ${(result.ms / 1000).toFixed(1)} s. Plugins took ${ms(result.pluginMs)} of it.`}
                {longTasks && (longTasks.count
                    ? ` Discord was busy for ${ms(longTasks.ms)} in ${count(longTasks.count, "long task", "long tasks")}, the longest ${ms(longTasks.longest)}. That’s all of Discord, plugins included, and opening settings counts too.`
                    : " Nothing held Discord up for 50 ms or more.")}
            </Text>
            {result.plugins.length ? (
                <Table label="What ran while recording" columns={["Plugin", "Time", "Calls", "Worst call"]}>
                    {result.plugins.map(p => (
                        <PluginRow key={p.plugin} id={p.plugin} prefix="rec" cells={[ms(p.ms), p.calls.toLocaleString(), ms(p.max)]}>
                            <Sites sites={p.sites} recent={false} />
                        </PluginRow>
                    ))}
                </Table>
            ) : (
                <Text tag="p" variant="text-sm/normal" color="text-subtle">No plugin code ran while recording.</Text>
            )}
            {slowest.length > 0 && (
                <div className="dl-stack">
                    <Text tag="h3" variant="text-sm/semibold" color="text-strong">{`Slowest single calls (${SLOW_CALL_MS} ms or more)`}</Text>
                    <ul className="dl-perf-sites">
                        {slowest.map((c, i) => (
                            <li key={i}>
                                <Badge>{kindLabel[c.kind]}</Badge>
                                <Text variant="text-sm/medium" color="text-strong">{pluginName(c.plugin)}</Text>
                                <span className="dl-perf-site-name dl-mono">{c.name}</span>
                                <Text variant="text-xs/normal" color="text-subtle" tabular className="dl-perf-site-numbers">
                                    {`${ms(c.ms)} at ${(c.at / 1000).toFixed(2)} s`}
                                </Text>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function LiveTable({ plugins }: { plugins: PluginReport[]; }) {
    if (!plugins.length) {
        return (
            <EmptyState icon="clock" title="Nothing measured yet">
                Plugins show up here once their hooks, Flux handlers or patches run.
            </EmptyState>
        );
    }
    return (
        <Table label="Time per plugin" columns={["Plugin", `Last ${WINDOW_S} s`, "Since start", "Calls", "Worst call"]}>
            {plugins.map(p => (
                <PluginRow key={p.plugin} id={p.plugin} prefix="live" cells={[ms(p.recent.ms), ms(p.ms), p.calls.toLocaleString(), ms(p.max)]}>
                    <Sites sites={p.sites} recent />
                </PluginRow>
            ))}
        </Table>
    );
}

export function PerformanceTab() {
    const result = useStore(subscribe, () => report);
    const [plugins, setPlugins] = React.useState(Perf.snapshot);
    // Measured once, after the first paint so opening the tab isn't held up by it
    const [overhead, setOverhead] = React.useState<number>();

    React.useEffect(() => {
        const timer = setInterval(() => setPlugins(Perf.snapshot()), 1000);
        const measure = setTimeout(() => setOverhead(Perf.measureOverhead()), 300);
        return () => {
            clearInterval(timer);
            clearTimeout(measure);
        };
    }, []);

    const recording = Perf.recording;
    const elapsed = recording ? Math.round((performance.now() - Perf.recordingStart) / 1000) : 0;

    return (
        <div className="dl-tab">
            <Section
                id="dl-perf-record"
                title="Record"
                description="Start recording, switch to your DMs (or do whatever feels slow), then come back and stop. You’ll see exactly which plugins ran and for how long."
                action={recording
                    ? <Button icon="close" onClick={stopRecording}>Stop recording</Button>
                    : <Button variant="accent" icon="clock" onClick={startRecording}>Start recording</Button>}
            >
                {recording && (
                    <Status tone="warning">{`Recording for ${elapsed} s. It stops by itself after ${MAX_RECORDING_MS / 1000} s.`}</Status>
                )}
                {!recording && result && <Recording result={result} />}
            </Section>
            <Section
                id="dl-perf-live"
                title="All plugins"
                description={`How long each plugin’s code took in the last ${WINDOW_S} seconds and since Discord started. When one plugin’s code runs inside another’s, each is only charged for its own part.`}
                action={<Button icon="refresh" onClick={() => {
                    Perf.reset();
                    setPlugins(Perf.snapshot());
                }}>Start over</Button>}
            >
                <LiveTable plugins={plugins} />
            </Section>
            <Text tag="p" variant="text-xs/normal" color="text-muted" tabular className="dl-perf-note">
                {overhead === undefined
                    ? "Measuring is always on."
                    : `Measuring is always on and costs about ${overhead < 1 ? overhead.toFixed(2) : overhead.toFixed(1)} µs per call.`}
                {" Times shorter than 0.1 ms are rounded by the browser’s clock, so a single fast call reads as 0 or 0.1 ms. Over many calls that evens out."}
            </Text>
        </div>
    );
}
