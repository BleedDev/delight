/**
 * Making everyone update (shared/required.ts): pick a version, at most the latest release, and every
 * older Evi downloads it now and restarts Discord once nobody's in a call. Optionally store plugins
 * update too. Shows what's required now, and stops requiring it.
 */
import type { DevLive } from "@shared/devLive";
import { mustUpdate, parseRequired, parseRequiredInput, RequiredUpdate } from "@shared/required";
import { isVersion } from "@shared/store";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { Button, Notice, Section, SwitchRow, Text, TextField } from "../components";
import { Confirm, LoadError } from "./common";
import { admin, format, useAdmin } from "./data";

interface State {
    required: RequiredUpdate | null;
    latest: string | null;
}

const parseState = (raw: unknown): State => {
    const r = raw as any;
    return { required: parseRequired(r), latest: isVersion(r?.latest) ? r.latest : null };
};

/** Installs online now that are older than `version`; "old" (before 1.5.0, they don't say) always is */
export function belowCount(versions: DevLive["now"]["versions"], version: string) {
    const required = { version, reason: "", forcePlugins: false, at: 0 };
    return versions.reduce((n, v) => n + (v.version === "old" || mustUpdate(required, v.version) ? v.count : 0), 0);
}

export function RequireUpdate({ live }: { live: DevLive; }) {
    const state = useAdmin("/admin/required-version", parseState);
    const [version, setVersion] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [plugins, setPlugins] = React.useState(false);
    const [problem, setProblem] = React.useState<string>();
    const [confirming, setConfirming] = React.useState<"require" | "stop">();

    const latest = state.value?.latest ?? null;
    const current = state.value?.required ?? null;
    // Defaults to the latest release once it's known
    React.useEffect(() => {
        if (latest && !version) setVersion(latest);
    }, [latest]);

    const wanted = version.trim().replace(/^v/, "");
    const below = isVersion(wanted) ? belowCount(live.now.versions, wanted) : 0;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const checked = parseRequiredInput({ version: wanted, reason, forcePlugins: plugins });
        if ("error" in checked) return setProblem(t("dev.req.badVersion"));
        setProblem(undefined);
        setConfirming("require");
    };

    if (state.error && !state.value) return <Section title={t("dev.req.title")} id="dl-dev-require"><LoadError error={state.error} onRetry={state.reload} /></Section>;

    return (
        <Section title={t("dev.req.title")} description={t("dev.req.hint")} id="dl-dev-require">
            {current && (
                <div className="dl-dev-required">
                    <span className="dl-dev-required-text">
                        <Text tag="span" variant="text-sm/semibold" color="text-strong">{t("dev.req.current", { version: current.version })}</Text>
                        <Text tag="span" variant="text-xs/normal" color="text-muted">
                            {[timeAgo(current.at), current.forcePlugins ? t("dev.req.withPlugins") : "", current.reason].filter(Boolean).join(" · ")}
                        </Text>
                    </span>
                    <Button variant="danger" onClick={() => setConfirming("stop")}>{t("dev.req.stop")}</Button>
                </div>
            )}
            <form className="dl-stack-loose" onSubmit={submit} noValidate>
                <div className="dl-dev-req-row">
                    <TextField id="dl-dev-req-version" label={t("dev.req.version")} value={version} onChange={setVersion} placeholder="2.0.1" spellCheck={false} />
                    <span className="dl-dev-req-facts">
                        <Text tag="span" variant="text-xs/normal" color="text-muted">
                            {latest ? t("dev.req.latest", { version: latest }) : state.loading ? t("dev.loading") : t("dev.req.latestUnknown")}
                        </Text>
                        {isVersion(wanted) && <Text tag="span" variant="text-xs/semibold" color="text-default">{t("dev.req.below", { count: format(below) })}</Text>}
                    </span>
                </div>
                <TextField id="dl-dev-req-reason" label={t("dev.req.reason")} value={reason} onChange={setReason} placeholder={t("dev.req.reasonPlaceholder")} />
                <SwitchRow id="dl-dev-req-plugins" label={t("dev.req.plugins")} description={t("dev.req.pluginsHint")} checked={plugins} onChange={setPlugins} />
                {problem && <Notice tone="danger">{problem}</Notice>}
                <div className="dl-toolbar">
                    <Button type="submit" variant="accent">{t("dev.req.submit")}</Button>
                </div>
            </form>

            {confirming === "require" && (
                <Confirm
                    id="dl-dev-req-confirm"
                    title={t("dev.req.confirmTitle", { version: wanted })}
                    body={t("dev.req.confirmBody", { count: format(below) })}
                    confirmLabel={t("dev.req.confirm")}
                    onConfirm={async () => {
                        const res = await admin("PUT", "/admin/required-version", { version: wanted, reason: reason.trim(), forcePlugins: plugins });
                        if (res.ok) state.reload();
                        return res;
                    }}
                    onClose={() => setConfirming(undefined)}
                />
            )}
            {confirming === "stop" && current && (
                <Confirm
                    id="dl-dev-req-stop"
                    title={t("dev.req.stopTitle", { version: current.version })}
                    body={t("dev.req.stopBody")}
                    confirmLabel={t("dev.req.stop")}
                    danger
                    onConfirm={async () => {
                        const res = await admin("DELETE", "/admin/required-version");
                        if (res.ok) state.reload();
                        return res;
                    }}
                    onClose={() => setConfirming(undefined)}
                />
            )}
        </Section>
    );
}
