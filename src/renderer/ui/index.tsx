import { Native } from "../native";
import { createStyle } from "../styles";
import { createRoot, React } from "../webpack/common";
import { BackupTab } from "./BackupTab";
import { Button, Icon, useStore } from "./components";
import { PatchesTab } from "./PatchesTab";
import { PatchHelperTab } from "./PatchHelperTab";
import { PluginsTab } from "./PluginsTab";
import { QuickCssTab } from "./QuickCssTab";
import { StoreTab } from "./StoreTab";
import { ThemesTab } from "./ThemesTab";
import css from "./styles.css" with { type: "text" };

type View = "closed" | "open" | "closing";

let view: View = "closed";
const listeners = new Set<() => void>();
const setView = (next: View) => {
    view = next;
    listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
};

const CLOSE_MS = 150;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function close() {
    if (view !== "open") return;
    if (reducedMotion()) return setView("closed");
    setView("closing");
    setTimeout(() => view === "closing" && setView("closed"), CLOSE_MS);
}

const tabs = [
    { id: "plugins", label: "Plugins", Component: PluginsTab },
    { id: "store", label: "Store", Component: StoreTab },
    { id: "themes", label: "Themes", Component: ThemesTab },
    { id: "quickcss", label: "Quick CSS", Component: QuickCssTab },
    { id: "backup", label: "Backup", Component: BackupTab },
    { id: "patches", label: "Patches", Component: PatchesTab },
    { id: "patchhelper", label: "Patch Helper", Component: PatchHelperTab },
] as const;

function Panel() {
    const [tab, setTab] = React.useState<(typeof tabs)[number]["id"]>("plugins");
    const panelRef = React.useRef<HTMLDivElement>(null);
    const current = tabs.find(t => t.id === tab)!;

    React.useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => previouslyFocused?.focus?.();
    }, []);

    return (
        <div className="dl-scrim" data-closing={view === "closing" ? "" : undefined} onMouseDown={e => e.target === e.currentTarget && close()}>
            <div className="dl-panel" role="dialog" aria-modal="true" aria-labelledby="dl-title" tabIndex={-1} ref={panelRef}>
                <header className="dl-header">
                    <h2 className="dl-title" id="dl-title">Delight</h2>
                    <span className="dl-version">v{DELIGHT_VERSION}</span>
                    <div className="dl-header-actions">
                        <Button onClick={() => Native.openPath("data")}><Icon name="folder" />Open data folder</Button>
                        <Button variant="icon" aria-label="Close Delight settings" onClick={close}><Icon name="cross" /></Button>
                    </div>
                </header>
                <div className="dl-tabs" role="tablist" aria-label="Delight sections">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            className="dl-tab"
                            id={`dl-tab-${t.id}`}
                            aria-selected={t.id === tab}
                            aria-controls="dl-tabpanel"
                            onClick={() => setTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="dl-body" role="tabpanel" id="dl-tabpanel" aria-labelledby={`dl-tab-${tab}`}>
                    <current.Component />
                </div>
            </div>
        </div>
    );
}

function Root() {
    const current = useStore(subscribe, () => view);
    return current === "closed" ? null : <Panel />;
}

let styled = false;
/** Our stylesheet, shared by the floating panel and the tabs embedded in Discord settings */
export function ensureStyles() {
    if (styled) return;
    styled = true;
    createStyle(css, "delight-ui");
}

let mounted = false;
function mount() {
    if (mounted) return;
    mounted = true;
    ensureStyles();
    const container = document.createElement("div");
    container.className = "dl-root";
    document.body.append(container);
    createRoot(container).render(<Root />);
}

export const SettingsUI = {
    open() {
        mount();
        setView("open");
    },
    close,
    toggle() {
        view === "open" ? close() : SettingsUI.open();
    },
};

export function installHotkey() {
    // Capture phase, so Discord's own key handlers never see our shortcut
    window.addEventListener("keydown", e => {
        const toggle = e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyD";
        const escape = e.key === "Escape" && view === "open";
        if (!toggle && !escape) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        toggle ? SettingsUI.toggle() : close();
    }, true);
}
