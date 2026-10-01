/**
 * The Developers page's first tab: who's online right now, people per day, which Evi versions are
 * out there and the most used plugins. Quiet on purpose: four numbers, then one thing per section.
 */
import { DevLive, fillDays } from "@shared/devLive";
import { compareVersions } from "@shared/store";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { EmptyState, Icon, Section, Text, Tooltip } from "../components";
import { showTab } from "../nav";
import { LoadError } from "./common";
import { dayLabel, format, Live, useLive } from "./data";

/** A big number with a short label; what it counts is in its tooltip */
function Stat({ label, value, hint, live }: { label: string; value: number; hint: string; live?: boolean; }) {
    return (
        <Tooltip text={hint}>
            <div className="dl-dev-stat" tabIndex={0} aria-label={`${label}: ${format(value)}. ${hint}`}>
                <span className="dl-dev-stat-label">
                    {live && <span className="dl-dev-live" aria-hidden="true" />}
                    <Text tag="span" variant="text-xs/semibold" color="text-muted">{label}</Text>
                </span>
                <Text tag="span" variant="heading-xl/semibold" color="text-strong" tabular>{format(value)}</Text>
            </div>
        </Tooltip>
    );
}

/** One bar a day since tracking began, today last; hover or focus a bar for its numbers */
function DailyChart({ days }: { days: DevLive["days"]; }) {
    const [hover, setHover] = React.useState<number>();
    const max = Math.max(1, ...days.map(d => d.active));
    const label = (d: DevLive["days"][number]) => t("dev.dayTooltip", { day: dayLabel(d.day), count: format(d.active), peak: format(d.peak) });
    const shown = hover === undefined ? undefined : days[hover];
    const at = hover === undefined ? 0 : (hover + 0.5) / days.length;
    return (
        <div className="dl-dev-chart">
            <div className="dl-dev-bars" role="list" aria-label={t("dev.daily")} onMouseLeave={() => setHover(undefined)}>
                <Text tag="span" variant="text-xs/normal" color="text-muted" tabular className="dl-dev-max" aria-hidden="true">{format(max)}</Text>
                {days.map((d, i) => (
                    <div
                        key={d.day}
                        role="listitem"
                        tabIndex={0}
                        aria-label={label(d)}
                        className="dl-dev-bar-hit"
                        data-active={hover === i ? "" : undefined}
                        onMouseEnter={() => setHover(i)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(undefined)}
                    >
                        {d.active > 0 && <div className="dl-dev-bar" style={{ blockSize: `${Math.max(3, d.active / max * 100)}%` }} />}
                    </div>
                ))}
                {shown && (
                    // Centred over its bar, kept inside the chart near the ends
                    <div className="dl-dev-tooltip" style={{ insetInlineStart: `${at * 100}%`, translate: `-${Math.min(100, Math.max(0, at * 200 - 50))}% 0` }} aria-hidden="true">
                        <Text tag="span" variant="text-xs/semibold" color="text-strong">{label(shown)}</Text>
                    </div>
                )}
            </div>
            <div className="dl-dev-axis" aria-hidden="true">
                <Text tag="span" variant="text-xs/normal" color="text-muted">{dayLabel(days[0].day)}</Text>
                <Text tag="span" variant="text-xs/normal" color="text-muted">{t("dev.todayShort")}</Text>
            </div>
        </div>
    );
}

/** Newest first, then Evis from before 1.5.0 */
const byVersion = (a: string, b: string) => a === "old" ? 1 : b === "old" ? -1 : compareVersions(b, a);
const versionName = (v: string) => v === "old" ? t("dev.versionOld") : v;

/** Who's on which Evi, as one bar: the newest version in Evi's colour, older ones paler */
function Versions({ versions }: { versions: DevLive["now"]["versions"]; }) {
    const total = versions.reduce((sum, v) => sum + v.count, 0);
    if (!total) return <Text variant="text-sm/normal" color="text-muted">{t("dev.nobodyOnline")}</Text>;
    const sorted = [...versions].sort((a, b) => byVersion(a.version, b.version));
    const shade = (v: string, i: number) => v === "old" ? undefined : `${Math.max(30, 100 - i * 22)}%`;
    return (
        <div className="dl-dev-versions">
            <div className="dl-dev-stack" aria-hidden="true">
                {sorted.map((v, i) => (
                    <span key={v.version} data-old={v.version === "old" ? "" : undefined} style={{ flexGrow: v.count, ["--dl-dev-shade" as string]: shade(v.version, i) }} />
                ))}
            </div>
            <ul className="dl-dev-legend">
                {sorted.map((v, i) => (
                    <li key={v.version}>
                        <span className="dl-dev-swatch" data-old={v.version === "old" ? "" : undefined} style={{ ["--dl-dev-shade" as string]: shade(v.version, i) }} aria-hidden="true" />
                        <Text tag="span" variant="text-sm/medium" color="text-default">{versionName(v.version)}</Text>
                        <Text tag="span" variant="text-sm/normal" color="text-muted" tabular>{format(v.count)} · {Math.round(v.count / total * 100)}%</Text>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TopPlugins({ plugins }: { plugins: DevLive["topPlugins"]; }) {
    if (!plugins.length) return <Text variant="text-sm/normal" color="text-muted">{t("dev.none")}</Text>;
    return (
        <ol className="dl-dev-top">
            {plugins.map((p, i) => (
                <li key={p.id}>
                    <Text tag="span" variant="text-sm/normal" color="text-muted" tabular className="dl-dev-rank">{i + 1}</Text>
                    <Text tag="span" variant="text-sm/medium" color="text-default" className="dl-dev-name">{p.name}</Text>
                    <Text tag="span" variant="text-sm/semibold" color="text-strong" tabular>{format(p.installs)}</Text>
                </li>
            ))}
        </ol>
    );
}

export function OverviewTab() {
    const { live, error } = useLive();
    // Ticks the live dot's "updated 5 seconds ago" along between loads
    const [, tick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        const timer = setInterval(tick, 5000);
        return () => clearInterval(timer);
    }, []);

    if (!live) {
        return error
            ? <LoadError error={error} onRetry={() => void Live.refresh()} />
            : <EmptyState icon="analytics" title={t("dev.loading")} />;
    }

    const today = new Date(live.at || Date.now()).toISOString().slice(0, 10);
    const merged = live.days.map(d => d.day === today ? { ...d, active: Math.max(d.active, live.today.active), peak: Math.max(d.peak, live.today.peak) } : d);
    if (!merged.some(d => d.day === today)) merged.push({ day: today, active: live.today.active, peak: live.today.peak });
    const tracked = merged.filter(d => d.active > 0);
    const since = tracked[0]?.day ?? today;
    // From the first tracked day, at least two weeks wide so a few days don't make giant bars
    const span = Math.min(30, Math.max(14, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1));
    const days = fillDays(merged, today, span);
    const waiting = live.store.waiting, reports = live.store.reports;

    return (
        <div className="dl-dev">
            <div className="dl-dev-stats">
                <Stat live label={t("dev.online")} value={live.now.online} hint={t("dev.onlineHint", { time: timeAgo(live.at || Date.now()) })} />
                <Stat label={t("dev.today")} value={live.today.active} hint={t("dev.todayHint")} />
                <Stat label={t("dev.peak")} value={live.today.peak} hint={t("dev.peakHint")} />
                <Stat label={t("dev.accounts")} value={live.people.accounts} hint={t("dev.accountsHint", { linked: format(live.people.linked) })} />
            </div>

            {waiting + reports > 0 && (
                <button type="button" className="dl-dev-waiting" onClick={() => showTab("developers", "review")}>
                    <Icon name="bell" size={16} />
                    <Text tag="span" variant="text-sm/medium" color="text-default">{t("dev.waitingLine", { waiting: format(waiting), reports: format(reports) })}</Text>
                    <Icon name="chevronRight" size={16} />
                </button>
            )}

            <Section title={t("dev.daily")} id="dl-dev-daily">
                {tracked.length >= 2
                    ? <DailyChart days={days} />
                    : <Text variant="text-sm/normal" color="text-muted" className="dl-dev-placeholder">{t("dev.trackingSince", { day: dayLabel(since) })}</Text>}
            </Section>

            <Section title={t("dev.versions")} id="dl-dev-versions">
                <Versions versions={live.now.versions} />
            </Section>

            <Section title={t("dev.topPlugins")} description={t("dev.topPluginsHint")} id="dl-dev-plugins">
                <TopPlugins plugins={live.topPlugins} />
            </Section>
        </div>
    );
}
