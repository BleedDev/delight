/**
 * Everything waiting on a developer, oldest worry first: plugin and theme uploads to publish or turn
 * down, reports about plugins, and reviews people reported. Each change asks first (common.tsx).
 */
import { parseReports, parseReviews, parseSubmissions, PluginReport, ReportedReview, Submission } from "@shared/devAdmin";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { Badge, Button, Dialog, EmptyState, List, Section, Status, Text } from "../components";
import { Confirm, LoadError } from "./common";
import { admin, Live, useAdmin } from "./data";

type Ask =
    | { kind: "approve" | "reject"; submission: Submission; }
    | { kind: "resolve" | "dismiss"; report: PluginReport; }
    | { kind: "hide" | "restore"; review: ReportedReview; }
    | { kind: "code"; submission: Submission; };

/** What reading its code found, the parts worth a look first */
function ScanLine({ s }: { s: Submission; }) {
    if (s.kind === "theme") {
        const blocked = s.hosts.filter(h => !h.allowed);
        return (
            <div className="dl-row-meta">
                {blocked.length
                    ? <Status tone="warning">{t("dev.scan.blockedHosts", { hosts: blocked.map(h => h.host).join(", ") })}</Status>
                    : <Status tone="success" quiet>{t("dev.scan.themeClean")}</Status>}
            </div>
        );
    }
    const scan = s.scan;
    return (
        <div className="dl-row-meta">
            {s.nativeCode !== undefined && <Status tone="warning">{t("dev.scan.native")}</Status>}
            {!!scan?.dynamicCode.length && <Status tone="warning">{t("dev.scan.dynamic", { what: scan.dynamicCode.join(", ") })}</Status>}
            {scan?.clipboardRead && <Status tone="warning">{t("dev.scan.clipboard")}</Status>}
            {scan && (
                <Text tag="span" variant="text-xs/normal" color="text-muted">
                    {[t("dev.scan.patches", { count: scan.patches }), scan.domains.length && t("dev.scan.domains", { domains: scan.domains.slice(0, 4).join(", ") + (scan.domains.length > 4 ? "…" : "") })].filter(Boolean).join(" · ")}
                </Text>
            )}
        </div>
    );
}

function SubmissionRow({ s, ask }: { s: Submission; ask(a: Ask): void; }) {
    return (
        <li className="dl-row">
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="text-md/semibold" color="text-strong">{s.name}</Text>
                        <Text tag="span" variant="text-sm/normal" color="text-muted" tabular>{s.published ? `${s.published} → ${s.version}` : s.version}</Text>
                        {!s.published && <Badge>{t("dev.new")}</Badge>}
                        {s.beta && <Badge>{t("dev.beta")}</Badge>}
                    </div>
                    <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{t("dev.byAuthor", { author: s.author, time: timeAgo(s.createdAt) })}</Text>
                </div>
                <div className="dl-row-controls">
                    <Button onClick={() => ask({ kind: "code", submission: s })}>{s.kind === "theme" ? t("dev.viewCss") : t("dev.viewCode")}</Button>
                    <Button onClick={() => ask({ kind: "reject", submission: s })}>{t("dev.reject")}</Button>
                    <Button variant="accent" onClick={() => ask({ kind: "approve", submission: s })}>{t("dev.approve")}</Button>
                </div>
            </div>
            <ScanLine s={s} />
        </li>
    );
}

function ReportRow({ r, ask }: { r: PluginReport; ask(a: Ask): void; }) {
    return (
        <li className="dl-row">
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="text-md/semibold" color="text-strong">{r.plugin}</Text>
                        {r.version && <Text tag="span" variant="text-sm/normal" color="text-muted" tabular>{r.version}</Text>}
                        <Badge tone="warning">{r.reason}</Badge>
                        {r.openForPlugin > 1 && <Text tag="span" variant="text-xs/medium" color="text-muted">{t("dev.moreReports", { count: r.openForPlugin })}</Text>}
                    </div>
                    {r.details && <Text tag="p" variant="text-sm/normal" color="text-default" className="dl-row-desc">{r.details}</Text>}
                    <Text tag="p" variant="text-xs/normal" color="text-muted">{t("dev.reportedBy", { who: r.reporter?.name ?? t("dev.someone"), time: timeAgo(r.createdAt) })}</Text>
                </div>
                <div className="dl-row-controls">
                    <Button onClick={() => ask({ kind: "dismiss", report: r })}>{t("dev.dismiss")}</Button>
                    <Button variant="accent" onClick={() => ask({ kind: "resolve", report: r })}>{t("dev.resolve")}</Button>
                </div>
            </div>
        </li>
    );
}

function ReviewRow({ r, ask }: { r: ReportedReview; ask(a: Ask): void; }) {
    return (
        <li className="dl-row">
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="text-md/semibold" color="text-strong">{r.user?.name ?? t("dev.someone")}</Text>
                        <Text tag="span" variant="text-sm/normal" color="text-muted" aria-label={t("dev.rating", { rating: r.rating })}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</Text>
                        <Text tag="span" variant="text-sm/normal" color="text-muted">{r.plugin}</Text>
                        {r.hidden && <Badge>{t("dev.hidden")}</Badge>}
                    </div>
                    {r.body && <Text tag="p" variant="text-sm/normal" color="text-default" className="dl-row-desc">{r.body}</Text>}
                    <Text tag="p" variant="text-xs/normal" color="text-muted">{t("dev.reviewReports", { count: r.reports })}</Text>
                </div>
                <div className="dl-row-controls">
                    <Button onClick={() => ask({ kind: "restore", review: r })}>{t("dev.keepReview")}</Button>
                    {!r.hidden && <Button variant="danger" onClick={() => ask({ kind: "hide", review: r })}>{t("dev.hideReview")}</Button>}
                </div>
            </div>
        </li>
    );
}

function CodeDialog({ s, onClose }: { s: Submission; onClose(): void; }) {
    return (
        <Dialog id="dl-dev-code" title={`${s.name} ${s.version}`} onClose={onClose}>
            <div className="dl-stack">
                {s.codeTruncated && <Text variant="text-xs/normal" color="text-muted">{t("dev.codeTruncated")}</Text>}
                {s.nativeCode !== undefined && <Text tag="h3" variant="text-sm/semibold" color="text-strong">index.js</Text>}
                <pre className="dl-dev-code" tabIndex={0}>{s.code || t("dev.none")}</pre>
                {s.nativeCode !== undefined && (
                    <>
                        <Text tag="h3" variant="text-sm/semibold" color="text-strong">{t("dev.nativeFile")}</Text>
                        <pre className="dl-dev-code" tabIndex={0}>{s.nativeCode || t("dev.none")}</pre>
                    </>
                )}
            </div>
        </Dialog>
    );
}

function Asking({ ask, onClose, onDone }: { ask: Ask; onClose(): void; onDone(): void; }) {
    const after = async (res: Awaited<ReturnType<typeof admin>>) => {
        if (res.ok) {
            onDone();
            void Live.refresh();
        }
        return res;
    };
    switch (ask.kind) {
        case "code":
            return <CodeDialog s={ask.submission} onClose={onClose} />;
        case "approve":
        case "reject": {
            const s = ask.submission;
            const base = s.kind === "theme" ? "theme-submissions" : "submissions";
            const approve = ask.kind === "approve";
            return (
                <Confirm
                    id="dl-dev-confirm"
                    title={approve ? t("dev.approveTitle", { name: s.name, version: s.version }) : t("dev.rejectTitle", { name: s.name, version: s.version })}
                    body={approve ? t("dev.approveBody") : t("dev.rejectBody")}
                    confirmLabel={approve ? t("dev.approveConfirm") : t("dev.rejectConfirm")}
                    danger={!approve}
                    noteLabel={approve ? undefined : t("dev.noteForAuthor")}
                    onConfirm={note => admin("POST", `/admin/${base}/${s.id}/${ask.kind}`, approve ? {} : { note }).then(after)}
                    onClose={onClose}
                />
            );
        }
        case "resolve":
        case "dismiss": {
            const r = ask.report;
            return (
                <Confirm
                    id="dl-dev-confirm"
                    title={ask.kind === "resolve" ? t("dev.resolveTitle", { plugin: r.plugin }) : t("dev.dismissTitle", { plugin: r.plugin })}
                    body={ask.kind === "resolve" ? t("dev.resolveBody") : t("dev.dismissBody")}
                    confirmLabel={ask.kind === "resolve" ? t("dev.resolveConfirm") : t("dev.dismissConfirm")}
                    noteLabel={t("dev.noteForReporter")}
                    onConfirm={note => admin("POST", `/admin/reports/${r.id}/${ask.kind}`, { note }).then(after)}
                    onClose={onClose}
                />
            );
        }
        case "hide":
        case "restore": {
            const r = ask.review;
            const hide = ask.kind === "hide";
            return (
                <Confirm
                    id="dl-dev-confirm"
                    title={hide ? t("dev.hideTitle") : t("dev.keepTitle")}
                    body={hide ? t("dev.hideBody") : t("dev.keepBody")}
                    confirmLabel={hide ? t("dev.hideReview") : t("dev.keepReview")}
                    danger={hide}
                    noteLabel={t("dev.noteInternal")}
                    onConfirm={note => admin("POST", `/admin/reviews/${r.id}/${ask.kind}`, { note }).then(after)}
                    onClose={onClose}
                />
            );
        }
    }
}

export function ReviewTab() {
    const plugins = useAdmin("/admin/submissions?status=pending", raw => parseSubmissions(raw, "plugin"));
    const themes = useAdmin("/admin/theme-submissions?status=pending", raw => parseSubmissions(raw, "theme"));
    const reports = useAdmin("/admin/reports?status=open", parseReports);
    const reviews = useAdmin("/admin/reviews?status=reported", parseReviews);
    const [ask, setAsk] = React.useState<Ask>();

    const all = [plugins, themes, reports, reviews];
    const failed = all.find(s => s.error);
    const loading = all.some(s => s.loading && s.value === undefined);
    const reloadAll = () => all.forEach(s => s.reload());
    const uploads = [...plugins.value ?? [], ...themes.value ?? []].sort((a, b) => a.createdAt - b.createdAt);
    const nothing = !loading && !failed && !uploads.length && !reports.value?.length && !reviews.value?.length;

    return (
        <div className="dl-dev">
            {failed && <LoadError error={failed.error!} onRetry={reloadAll} />}
            {loading && <EmptyState icon="clock" title={t("dev.loading")} />}
            {nothing && <EmptyState icon="circleCheck" title={t("dev.allClear")}>{t("dev.allClearBody")}</EmptyState>}

            {!!uploads.length && (
                <Section title={t("dev.uploads")} description={t("dev.uploadsHint")} id="dl-dev-uploads">
                    <List>{uploads.map(s => <SubmissionRow key={`${s.kind}:${s.id}`} s={s} ask={setAsk} />)}</List>
                </Section>
            )}
            {!!reports.value?.length && (
                <Section title={t("dev.reports")} id="dl-dev-reports">
                    <List>{reports.value.map(r => <ReportRow key={r.id} r={r} ask={setAsk} />)}</List>
                </Section>
            )}
            {!!reviews.value?.length && (
                <Section title={t("dev.reportedReviews")} id="dl-dev-reviews">
                    <List>{reviews.value.map(r => <ReviewRow key={r.id} r={r} ask={setAsk} />)}</List>
                </Section>
            )}

            {ask && <Asking ask={ask} onClose={() => setAsk(undefined)} onDone={reloadAll} />}
        </div>
    );
}
