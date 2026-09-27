/**
 * What an installed plugin actually did since Discord started, in its details under Permissions:
 * the hosts it contacted, the full-access calls it made and what Evi blocked because it doesn't
 * declare it, grouped, most recent first. A host its code doesn't name (or, when it declares, one it
 * doesn't declare) stands out. The record itself is src/renderer/plugins/activity.ts.
 */
import { PermissionFlag, readPermissions } from "@shared/declaredPermissions";
import { ActivityGroup, groupActivity } from "@shared/pluginActivity";
import { scanBundle } from "@shared/pluginPermissions";

import { PluginActivity } from "../plugins/activity";
import type { PluginState } from "../plugins/manager";
import { t, timeAgo } from "../i18n";
import { React } from "../webpack/common";
import { Button, Icon, Text, useStore } from "./components";

function when(at: number) {
    return Date.now() - at < 60_000 ? t("common.justNow") : t("activity.last", { when: timeAgo(at) });
}

function title(g: ActivityGroup) {
    if (g.kind === "native") return t("activity.native", { method: g.target });
    if (g.kind === "permission") return t(`activity.tried.${g.target as PermissionFlag}`);
    // Every attempt refused: it never reached the host
    if (g.blocked === g.count) return t("activity.blockedHost", { host: g.target });
    if (g.kind === "socket") return t("activity.socket", { host: g.target });
    return t("activity.contacted", { host: g.target });
}

function ActivityRow({ group: g }: { group: ActivityGroup; }) {
    const meta = [
        t("activity.times", { count: g.count }),
        when(g.lastAt),
        g.errors > 0 && t("activity.failed", { count: g.errors }),
        g.blocked > 0 && g.blocked < g.count && t("activity.blockedCount", { count: g.blocked }),
    ].filter(Boolean).join(" · ");
    const blocked = g.blocked > 0;
    // Blocked says more than "not in its code": nothing was sent
    const unexpected = g.unexpected && !blocked;
    const host = g.kind === "request" || g.kind === "socket" ? g.target : undefined;
    return (
        <li className="dl-perms-item dl-activity-item" data-kind={g.kind} data-unexpected={unexpected ? "" : undefined} data-blocked={blocked ? "" : undefined} data-host={host}>
            <Icon name={blocked ? "circleError" : unexpected ? "warning" : g.kind === "native" ? "code" : "link"} size={16} />
            <div className="dl-perms-text">
                <div className="dl-perms-title">
                    <Text variant="text-sm/semibold" color="text-strong">{title(g)}</Text>
                    {blocked && <span className="dl-perms-risk" data-risk="high">{t("activity.blocked")}</span>}
                    {unexpected && <span className="dl-perms-risk" data-risk="medium">{t("activity.notInCode")}</span>}
                </div>
                <Text variant="text-sm/normal" color="text-subtle" tabular>{meta}</Text>
                {g.recent.length > 0 && (
                    <ul className="dl-perms-details" aria-label={host ? t("activity.latestLabel", { host }) : title(g)}>
                        {g.recent.map(line => <li key={line} className="dl-perms-detail">{line}</li>)}
                    </ul>
                )}
            </div>
        </li>
    );
}

export function PluginActivitySection({ state, headingId }: { state: PluginState; headingId: string; }) {
    const { manifest } = state;
    // The log grows in place: its version says when to regroup
    const version = useStore(PluginActivity.subscribe, PluginActivity.version);
    const events = PluginActivity.get(manifest.id);
    // The hosts it declares, or else the hosts its code names: the same lists its permissions show
    const named = React.useMemo(() => {
        const declared = readPermissions(manifest.permissions);
        if (declared) return declared.network;
        if (!state.code) return [];
        const found = scanBundle(state.code);
        return [...found.domains, ...found.discordDomains];
    }, [state.code, manifest.permissions]);
    const groups = React.useMemo(() => groupActivity(events, named), [events, version, named]);

    // Keeps "2 minutes ago" true while the dialog stays open
    const [, tick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        const handle = setInterval(tick, 30_000);
        return () => clearInterval(handle);
    }, []);

    return (
        <section className="dl-stack dl-activity" aria-labelledby={headingId} data-plugin-activity={manifest.id}>
            <div className="dl-activity-head">
                <Text tag="h3" variant="heading-md/semibold" color="text-strong" id={headingId}>{t("activity.title")}</Text>
                {events.length > 0 && <Button onClick={() => PluginActivity.clear(manifest.id)}>{t("activity.clear")}</Button>}
            </div>
            {groups.length ? (
                <ul className="dl-perms-list dl-activity-list" aria-label={t("activity.listLabel", { name: manifest.name })}>
                    {groups.map(g => <ActivityRow key={g.key} group={g} />)}
                </ul>
            ) : (
                <Text tag="p" variant="text-sm/normal" color="text-muted" className="dl-activity-empty">{t("activity.empty")}</Text>
            )}
            <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-perms-note">
                {t(manifest.native ? "activity.noteNative" : "activity.note")}
            </Text>
        </section>
    );
}
