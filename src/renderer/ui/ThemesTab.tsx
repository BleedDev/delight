import type { ThemePayload } from "@shared/ipc";

import { Native } from "../native";
import { Settings } from "../settings";
import { Themes } from "../themes";
import { React } from "../webpack/common";
import { Button, EmptyState, List, Section, Status, Switch, Text, TextField, useStore } from "./components";
import { SafeModeHint } from "./SafeModeNotice";

type AddState =
    | { type: "idle"; }
    | { type: "busy"; }
    | { type: "done"; name: string; }
    | { type: "error"; error: string; };

function ThemeRow({ theme }: { theme: ThemePayload; }) {
    const titleId = `dl-theme-${theme.file.replace(/[^\w-]/g, "_")}`;
    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{theme.name}</Text>
                        {theme.version && <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>v{theme.version}</Text>}
                    </div>
                    {theme.description && <Text tag="p" variant="text-sm/normal" color="text-subtle" className="dl-row-desc">{theme.description}</Text>}
                    <Text variant="text-xs/normal" color="text-muted" className="dl-row-meta">
                        {theme.author && <span>By {theme.author}</span>}
                        <span className="dl-mono">{theme.file}</span>
                    </Text>
                </div>
                <div className="dl-row-controls">
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

export function ThemesTab() {
    const themes = useStore(Themes.subscribe, Themes.getSnapshot);
    // Switch states come from settings
    const settings = useStore(Settings.subscribe, () => Settings.data);
    const enabled = themes.filter(t => settings.enabledThemes.includes(t.file)).length;
    const openFolder = () => Native.openPath("themes");

    return (
        <div className="dl-tab">
            <SafeModeHint what="themes" />
            <Section
                id="dl-themes-add"
                title="Add a theme"
                description="Paste a link to a .css file. Delight downloads it into your themes folder and turns it on."
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
