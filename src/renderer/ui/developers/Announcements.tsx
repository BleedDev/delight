/**
 * Announcements to everyone using Evi (ui/Announcements.tsx shows them top and centre, live): write
 * one with a preview of the banner exactly as people will see it, and withdraw sent ones.
 */
import { MAX_BODY, MAX_TITLE, parseAnnouncementInput } from "@shared/announcements";
import { parseSentAnnouncements, SentAnnouncement } from "@shared/devAdmin";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { Badge, Button, EmptyState, Icon, List, Notice, Section, Text, TextField } from "../components";
import { Confirm, LoadError } from "./common";
import { admin, useAdmin } from "./data";

/** The banner people get, drawn in place (it doesn't close or link from here) */
function Preview({ title, body, link }: { title: string; body: string; link: string; }) {
    return (
        <div className="dl-dev-preview" aria-label={t("dev.preview")}>
            <div className="dl-announcement" data-preview="">
                <span className="dl-announcement-icon" aria-hidden="true"><Icon name="bell" size={18} /></span>
                <span className="dl-announcement-text">
                    <Text tag="span" variant="text-xs/medium" color="text-muted">{t("announcement.from")}</Text>
                    <Text tag="span" variant="text-sm/semibold" color="text-strong" className="dl-announcement-title">{title || t("dev.previewTitle")}</Text>
                    {body && <Text tag="span" variant="text-sm/normal" color="text-subtle" className="dl-announcement-body">{body}</Text>}
                </span>
                {link && <span className="dl-announcement-link">{t("announcement.open")}</span>}
            </div>
        </div>
    );
}

export function AnnouncementsTab() {
    const sent = useAdmin("/admin/announcements", parseSentAnnouncements);
    const [title, setTitle] = React.useState("");
    const [body, setBody] = React.useState("");
    const [link, setLink] = React.useState("");
    const [problem, setProblem] = React.useState<string>();
    const [confirming, setConfirming] = React.useState(false);
    const [withdrawing, setWithdrawing] = React.useState<SentAnnouncement>();

    const send = (e: React.FormEvent) => {
        e.preventDefault();
        // The same rules as evi.rest, said in the reader's language
        const checked = parseAnnouncementInput({ title, body, link });
        if ("error" in checked) {
            setProblem(!title.trim() ? t("dev.annNeedTitle") : title.trim().length > MAX_TITLE || body.trim().length > MAX_BODY ? t("dev.annTooLong") : t("dev.annBadLink"));
            return;
        }
        setProblem(undefined);
        setConfirming(true);
    };

    return (
        <div className="dl-dev">
            <Section title={t("dev.announceNew")} description={t("dev.announceHint")} id="dl-dev-announce">
                <form className="dl-dev-compose" onSubmit={send} noValidate>
                    <div className="dl-stack-loose">
                        <TextField id="dl-dev-ann-title" label={t("dev.annTitle")} description={t("dev.annLimit", { count: MAX_TITLE })} value={title} onChange={setTitle} />
                        <TextField id="dl-dev-ann-body" label={t("dev.annBody")} description={t("dev.annLimit", { count: MAX_BODY })} value={body} onChange={setBody} multiline />
                        <TextField id="dl-dev-ann-link" label={t("dev.annLink")} description={t("dev.annLinkHint")} value={link} onChange={setLink} type="url" inputMode="url" placeholder="https://" spellCheck={false} />
                        {problem && <Notice tone="danger">{problem}</Notice>}
                        <div className="dl-toolbar">
                            <Button type="submit" variant="accent" icon="bell">{t("dev.annSend")}</Button>
                        </div>
                    </div>
                    <Preview title={title.trim()} body={body.trim()} link={link.trim()} />
                </form>
            </Section>

            <Section title={t("dev.annSent")} id="dl-dev-sent">
                {sent.error && <LoadError error={sent.error} onRetry={sent.reload} />}
                {sent.value && !sent.value.length && <EmptyState icon="bell" title={t("dev.annNone")}>{t("dev.annNoneBody")}</EmptyState>}
                {!!sent.value?.length && (
                    <List>
                        {sent.value.map(a => (
                            <li key={a.id} className="dl-row">
                                <div className="dl-row-head">
                                    <div className="dl-row-text">
                                        <div className="dl-row-title">
                                            <Text tag="h3" variant="text-md/semibold" color="text-strong">{a.title}</Text>
                                            {a.withdrawnAt && <Badge>{t("dev.withdrawn")}</Badge>}
                                        </div>
                                        {a.body && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{a.body}</Text>}
                                        <Text tag="p" variant="text-xs/normal" color="text-muted">{a.by ? t("dev.sentBy", { who: a.by.name, time: timeAgo(a.at) }) : timeAgo(a.at)}</Text>
                                    </div>
                                    {!a.withdrawnAt && (
                                        <div className="dl-row-controls">
                                            <Button onClick={() => setWithdrawing(a)}>{t("dev.withdraw")}</Button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </List>
                )}
            </Section>

            {confirming && (
                <Confirm
                    id="dl-dev-ann-confirm"
                    title={t("dev.annConfirmTitle")}
                    body={t("dev.annConfirmBody")}
                    confirmLabel={t("dev.annSend")}
                    onConfirm={async () => {
                        const res = await admin("POST", "/admin/announcements", { title: title.trim(), body: body.trim(), ...link.trim() && { link: link.trim() } });
                        if (res.ok) {
                            setTitle("");
                            setBody("");
                            setLink("");
                            sent.reload();
                        }
                        return res;
                    }}
                    onClose={() => setConfirming(false)}
                />
            )}
            {withdrawing && (
                <Confirm
                    id="dl-dev-ann-withdraw"
                    title={t("dev.withdrawTitle", { title: withdrawing.title })}
                    body={t("dev.withdrawBody")}
                    confirmLabel={t("dev.withdraw")}
                    danger
                    onConfirm={async () => {
                        const res = await admin("DELETE", `/admin/announcements/${withdrawing.id}`);
                        if (res.ok) sent.reload();
                        return res;
                    }}
                    onClose={() => setWithdrawing(undefined)}
                />
            )}
        </div>
    );
}
