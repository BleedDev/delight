import type { ThemePayload } from "@shared/ipc";

import { t } from "../i18n";
import { Native } from "../native";
import { Settings } from "../settings";
import { Store } from "../store";
import { Themes } from "../themes";
import { React } from "../webpack/common";
import { Badge, Button, EmptyState, IconButton, List, Notice, Status, Switch, Text, TextField, useStore } from "./components";
import { showTab } from "./nav";
import { SafeModeHint } from "./SafeModeNotice";
import { useStoreState } from "./Store";

type AddState =
    | { type: "idle"; }
    | { type: "busy"; }
    | { type: "done"; name: string; }
    | { type: "error"; error: string; };

function ThemeRow({ theme }: { theme: ThemePayload; }) {
    const titleId = `dl-theme-${theme.file.replace(/[^\w-]/g, "_")}`;
    const store = Store.getSnapshot();
    const storeId = Object.values(store.installedThemes).find(t => t.file === theme.file)?.id;
    const update = storeId && Store.themeAction(storeId) === "update";
    const op = storeId ? store.themeOps[storeId] : undefined;
    const busy = op?.type === "busy";

    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="text-md/semibold" color="text-strong" id={titleId}>{theme.name}</Text>
                        {theme.version && <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>v{theme.version}</Text>}
                        {storeId && <Badge>{t("common.store")}</Badge>}
                        {(update || op) && (
                            <span className="dl-row-meta" role="status">
                                {op?.type === "busy" && <Status tone="muted">{op.label}</Status>}
                                {op?.type === "error" && <Status tone="danger">{op.error}</Status>}
                                {op?.type === "done" && <Status tone="success">{op.message}</Status>}
                                {!op && update && <Status tone="warning">{t("common.updateAvailable")}</Status>}
                            </span>
                        )}
                    </div>
                    {theme.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{theme.description}</Text>}
                    <Text variant="text-xs/normal" color="text-muted" className="dl-row-meta">
                        {theme.author && <span>{t("common.by", { author: theme.author })}</span>}
                        <span className="dl-mono">{theme.file}</span>
                    </Text>
                </div>
                <div className="dl-row-controls">
                    {update && <Button variant="accent" icon="download" disabled={busy} onClick={() => Store.installTheme(storeId)}>{t("common.update")}</Button>}
                    {storeId && <IconButton icon="trash" label={t("common.uninstallName", { name: theme.name })} onClick={() => !busy && Store.uninstallTheme(storeId)} />}
                    <Switch checked={Themes.isEnabled(theme.file)} labelledBy={titleId} onChange={v => Themes.setEnabled(theme.file, v)} />
                </div>
            </div>
        </li>
    );
}

function AddFromUrl() {
    const [url, setUrl] = React.useState("");
    const [state, setState] = React.useState<AddState>({ type: "idle" });
    // Enter and the submit button both land in onSubmit; only run once at a time
    const busy = React.useRef(false);

    const submit = async () => {
        if (busy.current) return;
        if (!url.trim()) return setState({ type: "error", error: t("themes.pasteLinkFirst") });
        busy.current = true;
        setState({ type: "busy" });
        try {
            const result = await Themes.addFromUrl(url);
            if (!result.ok) return setState({ type: "error", error: result.error });
            setState({ type: "done", name: Themes.getSnapshot().find(t => t.file === result.file)?.name ?? result.file });
            setUrl("");
        } catch (err) {
            setState({ type: "error", error: String((err as Error)?.message ?? err) });
        } finally {
            busy.current = false;
        }
    };

    return (
        <form
            className="dl-stack"
            onSubmit={e => {
                e.preventDefault();
                submit();
            }}
        >
            <div className="dl-toolbar dl-toolbar-end">
                <div className="dl-grow">
                    <TextField
                        id="dl-theme-url"
                        label={t("themes.linkLabel")}
                        hideLabel
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        placeholder="https://example.com/theme.css"
                        value={url}
                        onChange={v => {
                            setUrl(v);
                            if (state.type === "error") setState({ type: "idle" });
                        }}
                    />
                </div>
                <Button size="md" variant="accent" type="submit" icon="link" disabled={state.type === "busy"}>{t("themes.addFromUrl")}</Button>
            </div>
            <div className="dl-add-status" role="status">
                {state.type === "busy" && <Status tone="muted">{t("common.downloading")}</Status>}
                {state.type === "done" && <Status tone="success">{t("themes.added", { name: state.name })}</Status>}
                {state.type === "error" && <Status tone="danger">{state.error}</Status>}
            </div>
        </form>
    );
}

/** Installed themes, with a link to add one; the Theme Store is the tab next to this one */
export function InstalledThemes() {
    const themes = useStore(Themes.subscribe, Themes.getSnapshot);
    // Rows show store badges and updates
    const store = useStoreState();
    // Switch states come from settings
    const settings = useStore(Settings.subscribe, () => Settings.data);
    const enabled = themes.filter(t => settings.enabledThemes.includes(t.file)).length;
    const updates = store.themes.filter(theme => Store.themeAction(theme.id) === "update").length;
    const openFolder = () => Native.openPath("themes");

    return (
        <div className="dl-tab dl-tab-compact">
            <SafeModeHint what="themes" />
            {updates > 0 && (
                <Notice tone="info" action={<Button id="dl-theme-see-updates" onClick={() => showTab("themes", "store")}>{t("store.seeUpdates")}</Button>}>
                    {t("themes.updatesReady", { count: updates })}
                </Notice>
            )}
            <AddFromUrl />
            <div className="dl-stack" id="dl-themes-installed">
                <div className="dl-toolbar">
                    <Text variant="text-sm/medium" color="text-subtle" tabular className="dl-grow">
                        {themes.length ? t("themes.count", { count: themes.length, enabled }) : t("themes.installedTitle")}
                    </Text>
                    <Button icon="folder" onClick={openFolder}>{t("themes.openFolder")}</Button>
                </div>
                {themes.length ? (
                    <List label={t("themes.installedTitle")}>{themes.map(theme => <ThemeRow key={theme.file} theme={theme} />)}</List>
                ) : (
                    <EmptyState icon="palette" title={t("themes.emptyTitle")}>
                        {t("themes.emptyBody")}
                    </EmptyState>
                )}
            </div>
        </div>
    );
}
