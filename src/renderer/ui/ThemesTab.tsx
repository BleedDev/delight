import type { ThemePayload } from "@shared/ipc";

import { Native } from "../native";
import { Settings } from "../settings";
import { Themes } from "../themes";
import { React } from "../webpack/common";
import { Button, Icon, Status, Switch, TextField, useStore } from "./components";
import { SafeModeHint } from "./SafeModeNotice";

type AddState =
    | { type: "idle"; }
    | { type: "busy"; }
    | { type: "done"; name: string; }
    | { type: "error"; error: string; };

function ThemeCard({ theme }: { theme: ThemePayload; }) {
    const titleId = `dl-theme-${theme.file.replace(/[^\w-]/g, "_")}`;
    return (
        <article className="dl-card" aria-labelledby={titleId}>
            <div className="dl-card-head">
                <div className="dl-card-main">
                    <h3 className="dl-card-title" id={titleId}>
                        {theme.name}
                        {theme.version && <span className="dl-version">v{theme.version}</span>}
                    </h3>
                    {theme.description && <p className="dl-card-desc">{theme.description}</p>}
                    <p className="dl-card-desc">
                        {theme.author && <>By {theme.author} · </>}
                        <span className="dl-mono">{theme.file}</span>
                    </p>
                </div>
                <Switch checked={Themes.isEnabled(theme.file)} labelledBy={titleId} onChange={v => Themes.setEnabled(theme.file, v)} />
            </div>
        </article>
    );
}

function AddFromUrl() {
    const [url, setUrl] = React.useState("");
    const [state, setState] = React.useState<AddState>({ type: "idle" });
    // Enter submits the form and Discord's button may be a submit button too, only run once
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
            className="dl-field"
            onSubmit={e => {
                e.preventDefault();
                submit();
            }}
        >
            <div className="dl-toolbar dl-toolbar-flush">
                <div className="dl-search">
                    <TextField
                        id="dl-theme-url"
                        label="Theme URL"
                        hideLabel
                        type="url"
                        placeholder="https://example.com/theme.css"
                        value={url}
                        onChange={v => {
                            setUrl(v);
                            if (state.type === "error") setState({ type: "idle" });
                        }}
                    />
                </div>
                <Button variant="accent" onClick={submit} disabled={state.type === "busy"}>Add from URL</Button>
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
    useStore(Settings.subscribe, () => Settings.data);

    return (
        <div className="dl-stack" style={{ gap: 16 }}>
            <SafeModeHint what="themes" />
            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label">Themes</div>
                    <p className="dl-hint">Each theme is a .css file in your themes folder. Edits apply the moment you save. Quick CSS still goes on top.</p>
                </div>
                <Button onClick={() => Native.openPath("themes")}><Icon name="folder" />Open themes folder</Button>
            </div>
            <AddFromUrl />
            {themes.length ? (
                <div className="dl-stack">{themes.map(t => <ThemeCard key={t.file} theme={t} />)}</div>
            ) : (
                <div className="dl-empty">
                    <strong>No themes yet</strong>
                    Drop a .css file into your themes folder, or paste a link above. It shows up here instantly.
                </div>
            )}
        </div>
    );
}
