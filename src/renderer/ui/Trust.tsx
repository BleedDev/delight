/**
 * What keeps the store trustworthy, where people see it: a plugin Evi turned off on every install
 * (shared/pulls.ts), said in the Plugins list and the plugin's details, and reporting a store plugin
 * to Evi's team (shared/pluginReports.ts) from its store page or its details.
 */
import { REPORT_REASONS, ReportReason, validatePluginReport } from "@shared/pluginReports";
import type { PulledPlugin } from "@shared/pulls";
import { isVersion } from "@shared/store";

import { t } from "../i18n";
import { Native } from "../native";
import { React } from "../webpack/common";
import { Button, Dialog, Icon, Status, Text } from "./components";

// ---- pulled -----------------------------------------------------------------------------------

/**
 * Why a plugin is off and can't be turned on, and the way back when there is one: a newer version
 * that isn't pulled. Its switch stays as the user left it, so lifting the pull brings it back.
 */
export function PulledNotice({ pull, update }: {
    pull: PulledPlugin;
    /** A newer version in the store that isn't pulled */
    update?: { version: string; busy?: boolean; run(): void; };
}) {
    return (
        <section className="dl-pulled" aria-label={t("pulled.label")}>
            <Icon name="circleError" size={20} />
            <div className="dl-pulled-text">
                <Text tag="p" variant="text-sm/semibold" color="text-strong">{t("pulled.title", { reason: pull.reason })}</Text>
                <Text tag="p" variant="text-sm/normal" color="text-subtle">
                    {update
                        ? t("pulled.updateFixes", { version: update.version })
                        : t(pull.removed ? "pulled.blockedRemoved" : "pulled.blocked")}
                </Text>
            </div>
            {update && <Button variant="accent" icon="download" disabled={update.busy} onClick={update.run}>{t("common.updateTo", { version: update.version })}</Button>}
        </section>
    );
}

// ---- reporting --------------------------------------------------------------------------------

/** Plugins reported this session: the button says so instead of offering it again */
const reported = new Set<string>();

const MAX_DETAILS = 1000;

type ReportError = { field?: "reason" | "details"; message: string; };

function ReportForm({ id, version, onSent, onCancel }: { id: string; version?: string; onSent(): void; onCancel(): void; }) {
    const [reason, setReason] = React.useState<ReportReason>();
    const [details, setDetails] = React.useState("");
    const [error, setError] = React.useState<ReportError>();
    const [sending, setSending] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);
    const base = `dl-report-${id}`;
    const required = reason === "other";

    const fail = (next: ReportError) => {
        setError(next);
        // The first field that needs fixing, after React has marked it
        requestAnimationFrame(() => {
            const form = formRef.current;
            const field = next.field === "reason" ? form?.querySelector<HTMLInputElement>("input[type=radio]") : next.field === "details" ? form?.querySelector("textarea") : undefined;
            field?.focus();
        });
    };

    const submit = async () => {
        if (sending) return;
        if (!reason) return fail({ field: "reason", message: t("report.pickReason") });
        const checked = validatePluginReport(id, { reason, details, ...(isVersion(version) && { version }) });
        if ("error" in checked) return fail({ field: "details", message: checked.error });

        setSending(true);
        setError(undefined);
        const { plugin, ...input } = checked.report;
        const result = await Native.reportPlugin(plugin, input).catch(err => ({ ok: false as const, error: String((err as Error)?.message ?? err) }));
        setSending(false);
        // The server's own words: "You already reported this plugin. It's being looked at."
        if (!result.ok) return setError({ message: result.error });
        onSent();
    };

    return (
        // Checked here on Send report rather than by the browser, so every problem reads the same
        <form className="dl-stack dl-report" onSubmit={e => e.preventDefault()} ref={formRef} noValidate>
            <fieldset className="dl-report-reasons" aria-describedby={error?.field === "reason" ? `${base}-error` : undefined}>
                <legend className="dl-label">{t("report.whatsWrong")}</legend>
                {REPORT_REASONS.map(r => (
                    <label key={r.value} className="dl-check">
                        <input
                            type="radio"
                            name={`${base}-reason`}
                            value={r.value}
                            checked={reason === r.value}
                            onChange={() => {
                                setReason(r.value);
                                if (error?.field) setError(undefined);
                            }}
                        />
                        {t(`report.reason.${r.value}`)}
                    </label>
                ))}
            </fieldset>

            <div className="dl-field">
                <label className="dl-label" htmlFor={`${base}-details`}>{t(required ? "report.details" : "report.detailsOptional")}</label>
                <textarea
                    id={`${base}-details`}
                    className="dl-textarea dl-report-details"
                    rows={4}
                    maxLength={MAX_DETAILS}
                    value={details}
                    required={required}
                    aria-invalid={error?.field === "details" || undefined}
                    aria-describedby={[`${base}-count`, error?.field === "details" && `${base}-error`].filter(Boolean).join(" ")}
                    placeholder={t(required ? "report.detailsRequiredPlaceholder" : "report.detailsPlaceholder")}
                    onChange={e => {
                        setDetails(e.currentTarget.value);
                        if (error?.field === "details") setError(undefined);
                    }}
                />
                <Text variant="text-xs/normal" color="text-muted" tabular className="dl-report-count" id={`${base}-count`}>{details.length}/{MAX_DETAILS}</Text>
            </div>

            <span role="alert" id={`${base}-error`}>{error && <Status tone="danger">{error.message}</Status>}</span>

            <Text tag="p" variant="text-sm/normal" color="text-subtle">
                {t("report.privacy")}
            </Text>
            <div className="dl-toolbar">
                <Button variant="accent" disabled={sending} onClick={() => void submit()}>{sending ? t("common.sending") : t("common.sendReport")}</Button>
                <Button onClick={onCancel}>{t("common.cancel")}</Button>
            </div>
        </form>
    );
}

/**
 * A quiet line at the end of a store plugin's page and details: Report opens the form in a dialog,
 * and says Reported once it's sent.
 */
export function ReportRow({ id, name, version }: { id: string; name: string; version?: string; }) {
    const [open, setOpen] = React.useState(false);
    const [done, setDone] = React.useState(() => reported.has(id));
    const [thanks, setThanks] = React.useState(false);
    if (!Native.reportPlugin) return null;

    return (
        <div className="dl-report-row" data-report={id}>
            <Text variant="text-sm/normal" color="text-subtle">{t("report.prompt")}</Text>
            <Button disabled={done} onClick={() => setOpen(true)}>{done ? t("report.reported") : t("report.report")}</Button>
            <span role="status">{thanks && <Status tone="success">{t("report.thanks")}</Status>}</span>
            {open && (
                <Dialog id={`dl-report-${id}`} title={t("report.title", { name })} onClose={() => setOpen(false)}>
                    {close => (
                        <ReportForm
                            id={id}
                            version={version}
                            onCancel={close}
                            onSent={() => {
                                reported.add(id);
                                setDone(true);
                                setThanks(true);
                                close();
                            }}
                        />
                    )}
                </Dialog>
            )}
        </div>
    );
}
