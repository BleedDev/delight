import type { ThemePayload } from "@shared/ipc";

import { Native } from "../native";
import { Settings } from "../settings";
import { Store } from "../store";
import { Themes } from "../themes";
import { React } from "../webpack/common";
import { Badge, Button, EmptyState, IconButton, List, Section, Status, Switch, Text, TextField, useStore } from "./components";
import { SafeModeHint } from "./SafeModeNotice";
import { StoreBanner, StoreView } from "./Store";

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
                        {storeId && <Badge>Store</Badge>}
                        {(update || op) && (
                            <span className="dl-row-meta" role="status">
                                {op?.type === "busy" && <Status tone="muted">{op.label}</Status>}
                                {op?.type === "error" && <Status tone="danger">{op.error}</Status>}
                                {op?.type === "done" && <Status tone="success">{op.message}</Status>}
                                {!op && update && <Status tone="warning">Update available</Status>}
                            </span>
                        )}
                    </div>
                    {theme.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{theme.description}</Text>}
                    <Text variant="text-xs/normal" color="text-muted" className="dl-row-meta">
                        {theme.author && <span>By {theme.author}</span>}
                        <span className="dl-mono">{theme.file}</span>
                    </Text>
                </div>
                <div className="dl-row-controls">
                    {update && <Button variant="accent" icon="download" disabled={busy} onClick={() => Store.installTheme(storeId)}>Update</Button>}
                    {storeId && <IconButton icon="trash" label={`Uninstall ${theme.name}`} onClick={() => !busy && Store.uninstallTheme(storeId)} />}
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
        if (!url.trim()) return setState({ type: "error", error: "Paste a link to a .css file first" });
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
                        label="Theme link"
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
                <Button size="md" variant="accent" type="submit" icon="link" disabled={state.type === "busy"}>Add from URL</Button>
            </div>
            <div className="dl-add-status" role="status">
                {state.type === "busy" && <Status tone="muted">Downloading…</Status>}
                {state.type === "done" && <Status tone="success">Added and turned on {state.name}</Status>}
                {state.type === "error" && <Status tone="danger">{state.error}</Status>}
            </div>
        </form>
    );
}

/** Installed themes, with the Theme Store one click away inside the same tab */
export function ThemesTab() {
    const [browsing, setBrowsing] = React.useState(false);
    return browsing ? <StoreView kind="theme" onBack={() => setBrowsing(false)} /> : <InstalledThemes onOpenStore={() => setBrowsing(true)} />;
}

function InstalledThemes({ onOpenStore }: { onOpenStore(): void; }) {
    const themes = useStore(Themes.subscribe, Themes.getSnapshot);
    // Rows show store badges and updates
    useStore(Store.subscribe, Store.getSnapshot);
    // Switch states come from settings
    const settings = useStore(Settings.subscribe, () => Settings.data);
    const enabled = themes.filter(t => settings.enabledThemes.includes(t.file)).length;
    const openFolder = () => Native.openPath("themes");

    return (
        <div className="dl-tab">
            <SafeModeHint what="themes" />
            <StoreBanner kind="theme" onOpen={onOpenStore} />
            <Section
                id="dl-themes-add"
                title="Add a theme"
                description="Paste a link to a .css file. Evi downloads it into your themes folder and turns it on."
            >
                <AddFromUrl />
            </Section>

            <Section
                id="dl-themes-installed"
                title="Installed themes"
                description="Each theme is a .css file in your themes folder. Edits apply the moment you save, and Quick CSS still goes on top."
                action={<Button icon="folder" onClick={openFolder}>Open themes folder</Button>}
            >
                {themes.length ? (
                    <div className="dl-stack">
                        <Text variant="text-sm/medium" color="text-subtle" tabular>{`${themes.length} ${themes.length === 1 ? "theme" : "themes"}, ${enabled} on`}</Text>
                        <List label="Installed themes">{themes.map(t => <ThemeRow key={t.file} theme={t} />)}</List>
                    </div>
                ) : (
                    <EmptyState icon="palette" title="No themes yet" action={<Button icon="folder" onClick={openFolder}>Open themes folder</Button>}>
                        Drop a .css file into your themes folder or add one from a link above. It shows up here right away.
                    </EmptyState>
                )}
            </Section>
        </div>
    );
}
