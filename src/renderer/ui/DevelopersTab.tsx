/**
 * Evi's developers' numbers (shared/devLive.ts): who has Discord open right now and on which Evi,
 * people per day for the last 30 days, the most used plugins and what waits in the store. Only on
 * an Evi linked to one of Evi's developers (developer.ts); evi.rest answers no one else.
 */
import { DevLive, fillDays } from "@shared/devLive";

import { I18n, t, timeAgo } from "../i18n";
import { Native } from "../native";
import { React } from "../webpack/common";
import { Button, EmptyState, Notice, Section, Text } from "./components";

const EVERY = 10_000;

const format = (n: number) => n.toLocaleString(I18n.discordLocale);

function useLive() {
    const [live, setLive] = React.useState<DevLive>();
    const [error, setError] = React.useState<string>();
    const load = React.useCallback(async () => {
        const res = await Native.devLive?.().catch((e: unknown) => ({ ok: false as const, error: String(e) }));
        if (!res) return;
        if (res.ok) {
            setLive(res.value);
            setError(undefined);
        } else setError(res.error);
    }, []);
    React.useEffect(() => {
        void load();
        // Only while the page is on screen and Discord is in front
        const timer = setInterval(() => document.visibilityState === "visible" && void load(), EVERY);
        return () => clearInterval(timer);
    }, [load]);
    return { live, error, load };
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string; }) {
    return (
        <div className="dl-dev-tile">
            <Text variant="text-xs/semibold" color="text-muted">{label}</Text>
            <Text variant="heading-xl/bold" color="text-strong" tabular>{format(value)}</Text>
            <Text variant="text-xs/normal" color="text-subtle">{hint}</Text>
        </div>
    );
}

/** People per day: one bar a day, today last. Hover or focus a bar for its numbers. */
function DailyChart({ days }: { days: DevLive["days"]; }) {
    const [hover, setHover] = React.useState<number>();
    const max = Math.max(1, ...days.map(d => d.active));
    const label = (d: DevLive["days"][number]) => t("dev.dayTooltip", {
        day: new Date(`${d.day}T00:00:00Z`).toLocaleDateString(I18n.discordLocale, { month: "short", day: "numeric", timeZone: "UTC" }),
        count: format(d.active),
        peak: format(d.peak),
    });
    const shown = hover === undefined ? undefined : days[hover];
    return (
        <div className="dl-dev-chart" onMouseLeave={() => setHover(undefined)}>
            <div className="dl-dev-chart-axis" aria-hidden="true">
                <Text tag="span" variant="text-xs/normal" color="text-muted" tabular>{format(max)}</Text>
                <Text tag="span" variant="text-xs/normal" color="text-muted" tabular>0</Text>
            </div>
            <div className="dl-dev-bars" role="list">
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
                        <div className="dl-dev-bar" style={{ height: `${Math.max(d.active ? 2 : 0, d.active / max * 100)}%` }} />
                    </div>
                ))}
                {shown && (
                    // Centred over its bar, but kept inside the chart near the ends
                    <div className="dl-dev-tooltip" style={{ left: `${(hover! + 0.5) / days.length * 100}%`, transform: `translateX(-${Math.min(100, Math.max(0, (hover! + 0.5) / days.length * 200 - 50))}%)` }} aria-hidden="true">
                        <Text tag="span" variant="text-xs/semibold" color="text-strong">{label(shown)}</Text>
                    </div>
                )}
            </div>
        </div>
    );
}

/** A name and its count, with a thin bar for the share of the biggest */
function Ranked({ rows }: { rows: { key: string; name: string; count: number; }[]; }) {
    if (!rows.length) return <Text variant="text-sm/normal" color="text-muted">{t("dev.none")}</Text>;
    const max = Math.max(1, ...rows.map(r => r.count));
    return (
        <ul className="dl-dev-ranked">
            {rows.map(r => (
                <li key={r.key}>
                    <Text tag="span" variant="text-sm/medium" color="text-default" className="dl-dev-ranked-name">{r.name}</Text>
                    <Text tag="span" variant="text-sm/semibold" color="text-strong" tabular>{format(r.count)}</Text>
                    <span className="dl-dev-ranked-bar" aria-hidden="true"><span style={{ width: `${r.count / max * 100}%` }} /></span>
                </li>
            ))}
        </ul>
    );
}

export function DevelopersTab() {
    const { live, error, load } = useLive();
    // Ticks "updated 5 seconds ago" along between loads
    const [, tick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        const timer = setInterval(tick, 5000);
        return () => clearInterval(timer);
    }, []);

    if (!live) {
        return error
            ? <Notice tone="danger" action={<Button onClick={() => void load()}>{t("common.tryAgain")}</Button>}>{t("dev.error", { error })}</Notice>
            : <EmptyState icon="analytics" title={t("dev.loading")} />;
    }

    const today = new Date(live.at || Date.now()).toISOString().slice(0, 10);
    const days = fillDays(live.days.map(d => d.day === today ? { day: d.day, active: Math.max(d.active, live.today.active), peak: Math.max(d.peak, live.today.peak) } : d), today);

    return (
        <div className="dl-dev">
            {error && <Notice tone="danger">{t("dev.error", { error })}</Notice>}
            <div className="dl-dev-tiles">
                <Tile label={t("dev.online")} value={live.now.online} hint={t("dev.onlineHint")} />
                <Tile label={t("dev.today")} value={live.today.active} hint={t("dev.todayHint", { peak: format(live.today.peak) })} />
                <Tile label={t("dev.accounts")} value={live.people.accounts} hint={t("dev.accountsHint", { linked: format(live.people.linked) })} />
                <Tile label={t("dev.store")} value={live.store.plugins} hint={t("dev.storeHint", { waiting: format(live.store.waiting), reports: format(live.store.reports) })} />
            </div>
            <Text variant="text-xs/normal" color="text-muted">{t("dev.updated", { time: timeAgo(live.at || Date.now()) })}</Text>

            <Section title={t("dev.daily")} description={t("dev.dailyHint")} id="dl-dev-daily">
                <DailyChart days={days} />
            </Section>

            <div className="dl-dev-columns">
                <Section title={t("dev.versions")} id="dl-dev-versions">
                    <Ranked rows={live.now.versions.map(v => ({ key: v.version, name: v.version, count: v.count }))} />
                </Section>
                <Section title={t("dev.topPlugins")} description={t("dev.topPluginsHint")} id="dl-dev-plugins">
                    <Ranked rows={live.topPlugins.map(p => ({ key: p.id, name: p.name, count: p.installs }))} />
                </Section>
            </div>
        </div>
    );
}
