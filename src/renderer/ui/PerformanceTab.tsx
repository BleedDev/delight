/**
 * Which plugins cost time (perf.ts): every plugin's time in the last 10 seconds and since Discord
 * started, and a recording of exactly what ran while you did something slow.
 *
 * Opening settings covers Discord, so a recording has to outlive this tab: you start it, close
 * settings, do the slow thing, come back and stop it. Its state lives here at module level.
 */
import type { ReactNode } from "react";

import { GameMode } from "../gameMode";
import { I18n, t } from "../i18n";
import { Perf, PluginReport, RecordingReport, SiteKind, SLOW_CALL_MS, Totals, WINDOW_S } from "../perf";
import { PluginManager } from "../plugins/manager";
import { Settings } from "../settings";
import { React } from "../webpack/common";
import { Badge, Button, Collapse, EmptyState, IconButton, Section, Status, SwitchRow, Text, useStore } from "./components";

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
const builtIn = { "evi": true, "evi-settings": true, "evi-badges": true, "evi-devtools": true } as const;
const isBuiltIn = (id: string): id is keyof typeof builtIn => id in builtIn;

const pluginName = (id: string) => PluginManager.get(id)?.manifest.name ?? (isBuiltIn(id) ? t(`perf.builtIn.${id}`) : id);

const kindLabel = (kind: SiteKind) => t(`perf.kind.${kind}`);

/** A number in Discord's language: "1,2" in German, "1.2" in English */
const num = (value: number, digits: number) => value.toLocaleString(I18n.discordLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const int = (value: number) => value.toLocaleString(I18n.discordLocale);

function ms(value: number) {
    if (value === 0) return t("perf.unit.ms", { n: 0 });
    if (value < 0.1) return t("perf.unit.msTiny");
    if (value < 10) return t("perf.unit.ms", { n: num(value, 1) });
    return t("perf.unit.ms", { n: int(Math.round(value)) });
}

const seconds = (value: number, digits = 0) => t("perf.unit.s", { n: num(value, digits) });
const calls = (n: number) => t("perf.calls", { count: n });

/** A plugin's busiest sites, under its row */
function Sites({ sites, recent }: { sites: (Totals & { kind: SiteKind; name: string; recent?: Totals; })[]; recent: boolean; }) {
    const top = sites.slice(0, 3);
    return (
        <ul className="dl-perf-sites">
            {top.map(s => (
                <li key={`${s.kind} ${s.name}`}>
                    <Badge>{kindLabel(s.kind)}</Badge>
                    <span className="dl-perf-site-name dl-mono">{s.name}</span>
                    <Text variant="text-xs/normal" color="text-subtle" tabular className="dl-perf-site-numbers">
                        {recent && s.recent
                            ? t("perf.siteNumbersRecent", { recent: ms(s.recent.ms), time: ms(s.ms), calls: calls(s.calls), worst: ms(s.max) })
                            : t("perf.siteNumbers", { time: ms(s.ms), calls: calls(s.calls), worst: ms(s.max) })}
                    </Text>
                </li>
            ))}
            {sites.length > top.length && (
                <li><Text variant="text-xs/normal" color="text-muted">{t("perf.moreSites", { count: sites.length - top.length })}</Text></li>
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
                            label={t("perf.whereSpends", { name })}
                            onClick={() => setOpen(o => !o)}
                            className="dl-expand"
                            aria-expanded={open}
                            aria-controls={detailsId}
                        />
                        <Text variant="text-md/medium" color="text-strong">{name}</Text>
                        {isBuiltIn(id) && <Badge>{t("perf.builtInBadge")}</Badge>}
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
                {t("perf.recorded", { time: seconds(result.ms / 1000, 1), plugins: ms(result.pluginMs) })}
                {longTasks && " "}
                {longTasks && (longTasks.count
                    ? t("perf.longTasks", { count: longTasks.count, time: ms(longTasks.ms), longest: ms(longTasks.longest) })
                    : t("perf.noLongTasks"))}
            </Text>
            {result.plugins.length ? (
                <Table label={t("perf.recTable")} columns={[t("perf.col.plugin"), t("perf.col.time"), t("perf.col.calls"), t("perf.col.worst")]}>
                    {result.plugins.map(p => (
                        <PluginRow key={p.plugin} id={p.plugin} prefix="rec" cells={[ms(p.ms), int(p.calls), ms(p.max)]}>
                            <Sites sites={p.sites} recent={false} />
                        </PluginRow>
                    ))}
                </Table>
            ) : (
                <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("perf.noneRan")}</Text>
            )}
            {slowest.length > 0 && (
                <div className="dl-stack">
                    <Text tag="h3" variant="text-sm/semibold" color="text-strong">{t("perf.slowest", { ms: SLOW_CALL_MS })}</Text>
                    <ul className="dl-perf-sites">
                        {slowest.map((c, i) => (
                            <li key={i}>
                                <Badge>{kindLabel(c.kind)}</Badge>
                                <Text variant="text-sm/medium" color="text-strong">{pluginName(c.plugin)}</Text>
                                <span className="dl-perf-site-name dl-mono">{c.name}</span>
                                <Text variant="text-xs/normal" color="text-subtle" tabular className="dl-perf-site-numbers">
                                    {t("perf.slowCall", { time: ms(c.ms), at: seconds(c.at / 1000, 2) })}
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
            <EmptyState icon="clock" title={t("perf.empty.title")}>
                {t("perf.empty.body")}
            </EmptyState>
        );
    }
    return (
        <Table label={t("perf.liveTable")} columns={[t("perf.col.plugin"), t("perf.col.last", { seconds: WINDOW_S }), t("perf.col.sinceStart"), t("perf.col.calls"), t("perf.col.worst")]}>
            {plugins.map(p => (
                <PluginRow key={p.plugin} id={p.plugin} prefix="live" cells={[ms(p.recent.ms), ms(p.ms), int(p.calls), ms(p.max)]}>
                    <Sites sites={p.sites} recent />
                </PluginRow>
            ))}
        </Table>
    );
}

/** Discord's own Game Mode, when this Discord has it (gameMode.ts) */
function GameModeSetting() {
    const settings = useStore(Settings.subscribe, () => Settings.data);
    if (!GameMode.available) return null;
    return (
        <Section id="dl-perf-game-mode" title={t("perf.gameMode.title")}>
            <SwitchRow
                id="dl-game-mode"
                label={t("perf.gameMode.switch")}
                description={t("perf.gameMode.hint")}
                checked={settings.gameMode === true}
                onChange={on => GameMode.set(on)}
            />
        </Section>
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
                title={t("perf.record.title")}
                description={t("perf.record.description")}
                action={recording
                    ? <Button icon="close" onClick={stopRecording}>{t("perf.record.stop")}</Button>
                    : <Button variant="accent" icon="clock" onClick={startRecording}>{t("perf.record.start")}</Button>}
            >
                {recording && (
                    <Status tone="warning">{t("perf.recording", { elapsed: int(elapsed), max: MAX_RECORDING_MS / 1000 })}</Status>
                )}
                {!recording && result && <Recording result={result} />}
            </Section>
            <Section
                id="dl-perf-live"
                title={t("perf.live.title")}
                description={t("perf.live.description", { seconds: WINDOW_S })}
                action={<Button icon="refresh" onClick={() => {
                    Perf.reset();
                    setPlugins(Perf.snapshot());
                }}>{t("perf.reset")}</Button>}
            >
                <LiveTable plugins={plugins} />
            </Section>
            <GameModeSetting />
            <Text tag="p" variant="text-xs/normal" color="text-muted" tabular className="dl-perf-note">
                {overhead === undefined
                    ? t("perf.note.measuring")
                    : t("perf.note.cost", { time: t("perf.unit.us", { n: num(overhead, overhead < 1 ? 2 : 1) }) })}
                {" "}
                {t("perf.note.rounding")}
            </Text>
        </div>
    );
}
