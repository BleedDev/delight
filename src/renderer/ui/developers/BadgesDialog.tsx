/**
 * The badges evi.rest gives, from the People tab: make new ones, rename them, upload their icons
 * and delete them. A badge without an icon exists but isn't shown to anyone yet.
 */
import type { AdminBadge } from "@shared/devAdmin";

import { t } from "../../i18n";
import { React } from "../../webpack/common";
import { Badge, Button, Dialog, IconButton, Notice, Text, TextField } from "../components";
import { Confirm } from "./common";
import { admin, AdminResult } from "./data";

type Catalogue = { list: AdminBadge[]; };

const BADGE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

async function readImage(file: File): Promise<Uint8Array | string> {
    if (file.size > 1024 * 1024) return t("dev.badges.tooBig");
    return new Uint8Array(await file.arrayBuffer());
}

/** Name, description and icon: a new badge, or one being edited */
function BadgeForm({ badge, onSaved, onCancel }: { badge?: AdminBadge; onSaved(): void; onCancel(): void; }) {
    const [id, setId] = React.useState(badge?.id ?? "");
    const [name, setName] = React.useState(badge?.name ?? "");
    const [description, setDescription] = React.useState(badge?.description ?? "");
    const [icon, setIcon] = React.useState<{ bytes: Uint8Array; url: string; }>();
    const [error, setError] = React.useState<string>();
    const [busy, setBusy] = React.useState(false);
    const file = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => () => void (icon && URL.revokeObjectURL(icon.url)), [icon]);

    const save = async () => {
        if (!badge && !BADGE_ID.test(id)) return setError(t("dev.badges.badId"));
        if (!name.trim()) return setError(t("dev.badges.needName"));
        setBusy(true);
        let res: AdminResult<unknown> = await admin("PUT", `/admin/badges/${id}`, { name: name.trim(), description: description.trim() });
        if (res.ok && icon) res = await admin("PUT", `/admin/badges/${id}/icon`, icon.bytes);
        setBusy(false);
        if (res.ok) onSaved();
        else setError(res.error);
    };

    const preview = icon?.url ?? badge?.icon;
    return (
        <form className="dl-dev-badge-form" onSubmit={e => { e.preventDefault(); void save(); }}>
            {!badge && <TextField id="dl-dev-badge-id" label={t("dev.badges.id")} description={t("dev.badges.idHint")} value={id} onChange={v => setId(v.toLowerCase())} spellCheck={false} />}
            <TextField id="dl-dev-badge-name" label={t("dev.badges.name")} value={name} onChange={setName} />
            <TextField id="dl-dev-badge-description" label={t("dev.badges.description")} value={description} onChange={setDescription} />
            <div className="dl-dev-badge-icon-row">
                {preview
                    ? <img onError={e => void (e.currentTarget.hidden = true)} className="dl-dev-badge" src={preview} alt="" width={40} height={40} />
                    : <span className="dl-dev-badge dl-dev-badge-empty dl-dev-badge-large" aria-hidden="true" />}
                <div className="dl-dev-granted-text">
                    <Text tag="span" variant="text-sm/semibold" color="text-strong">{t("dev.badges.icon")}</Text>
                    <Text tag="span" variant="text-xs/normal" color="text-muted">{t("dev.badges.iconHint")}</Text>
                </div>
                <input
                    ref={file}
                    type="file"
                    accept={ACCEPT}
                    hidden
                    onChange={async e => {
                        const f = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (!f) return;
                        const bytes = await readImage(f);
                        if (typeof bytes === "string") return setError(bytes);
                        setError(undefined);
                        setIcon({ bytes, url: URL.createObjectURL(f) });
                    }}
                />
                <Button icon="image" onClick={() => file.current?.click()}>{preview ? t("dev.badges.replaceIcon") : t("dev.badges.pickIcon")}</Button>
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="dl-toolbar">
                <Button type="submit" variant="accent" disabled={busy}>{badge ? t("dev.badges.save") : t("dev.badges.create")}</Button>
                <Button onClick={onCancel}>{t("common.cancel")}</Button>
            </div>
        </form>
    );
}

export function BadgesDialog({ catalogue, onChanged, onClose }: { catalogue: Catalogue; onChanged(): void; onClose(): void; }) {
    const [editing, setEditing] = React.useState<string | "new">();
    const [deleting, setDeleting] = React.useState<AdminBadge>();

    return (
        <Dialog id="dl-dev-badges" title={t("dev.badges.title")} onClose={onClose} className="dl-dev-person-dialog">
            <div className="dl-dev-person-body">
                <div className="dl-dev-inline-form">
                    <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-dev-grow">{t("dev.badges.hint")}</Text>
                    {editing !== "new" && <Button icon="star" variant="accent" onClick={() => setEditing("new")}>{t("dev.badges.new")}</Button>}
                </div>
                {editing === "new" && (
                    <div className="dl-dev-badge-card">
                        <BadgeForm onSaved={() => { setEditing(undefined); onChanged(); }} onCancel={() => setEditing(undefined)} />
                    </div>
                )}
                <ul className="dl-dev-badge-list">
                    {catalogue.list.map(b => (
                        <li key={b.id} className="dl-dev-badge-card">
                            <div className="dl-dev-badge-head">
                                {b.icon
                                    ? <img onError={e => void (e.currentTarget.hidden = true)} className="dl-dev-badge" src={b.icon} alt="" width={32} height={32} />
                                    : <span className="dl-dev-badge dl-dev-badge-empty dl-dev-badge-medium" aria-hidden="true" />}
                                <div className="dl-dev-granted-text">
                                    <span className="dl-dev-person-names">
                                        <Text tag="span" variant="text-sm/semibold" color="text-strong">{b.name}</Text>
                                        <Text tag="span" variant="text-xs/normal" color="text-muted" className="dl-dev-mono">{b.id}</Text>
                                        {b.supporter && <Badge>{t("dev.badges.supporterLevel")}</Badge>}
                                        {b.automatic && <Badge>{t("dev.badges.automatic")}</Badge>}
                                        {!b.icon && <Badge tone="warning">{t("dev.badges.noIcon")}</Badge>}
                                    </span>
                                    <Text tag="span" variant="text-xs/normal" color="text-muted">
                                        {[b.description, t("dev.badges.holders", { count: b.holders })].filter(Boolean).join(" · ")}
                                    </Text>
                                </div>
                                <span className="dl-dev-granted-actions">
                                    <IconButton icon="pencil" label={t("dev.badges.edit")} onClick={() => setEditing(editing === b.id ? undefined : b.id)} aria-expanded={editing === b.id} />
                                    {!b.supporter && <IconButton icon="trash" label={t("dev.badges.delete")} onClick={() => setDeleting(b)} />}
                                </span>
                            </div>
                            {editing === b.id && <BadgeForm badge={b} onSaved={() => { setEditing(undefined); onChanged(); }} onCancel={() => setEditing(undefined)} />}
                        </li>
                    ))}
                </ul>
            </div>
            {deleting && (
                <Confirm
                    id="dl-dev-badge-delete"
                    title={t("dev.badges.deleteTitle", { name: deleting.name })}
                    body={t("dev.badges.deleteBody")}
                    confirmLabel={t("dev.badges.delete")}
                    danger
                    onConfirm={async () => {
                        const res = await admin("DELETE", `/admin/badges/${deleting.id}`);
                        if (res.ok) onChanged();
                        return res;
                    }}
                    onClose={() => setDeleting(undefined)}
                />
            )}
        </Dialog>
    );
}
