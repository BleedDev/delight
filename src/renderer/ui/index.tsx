import type { KeyboardEvent, ReactNode } from "react";

import { Native } from "../native";
import { createStyle } from "../styles";
import { createRoot, React } from "../webpack/common";
import { AccountTab } from "./AccountTab";
import { BackupTab } from "./BackupTab";
import { Button, ErrorBoundary, Icon, IconName, openDialogs, Text, useStore } from "./components";
import { PatchesTab } from "./PatchesTab";
import { PatchHelperTab } from "./PatchHelperTab";
import { PluginsTab } from "./PluginsTab";
import { QuickCssTab } from "./QuickCssTab";
import { ThemesTab } from "./ThemesTab";
import { UpdatesTab } from "./UpdatesTab";
import { currentRelease, WhatsNewModal } from "./WhatsNew";
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
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");

function close() {
    if (view !== "open") return;
    if (reducedMotion()) return setView("closed");
    setView("closing");
    setTimeout(() => view === "closing" && setView("closed"), CLOSE_MS);
}

// `icon` is optional so a section added without one still fits; its label stays aligned with the rest
const tabs: readonly { id: string; label: string; icon?: IconName; Component: () => ReactNode; }[] = [
    { id: "plugins", label: "Plugins", icon: "puzzle", Component: PluginsTab },
    { id: "themes", label: "Themes", icon: "palette", Component: ThemesTab },
    { id: "quickcss", label: "Quick CSS", icon: "code", Component: QuickCssTab },
    { id: "backup", label: "Backup", icon: "download", Component: BackupTab },
    { id: "account", label: "Account", icon: "link", Component: AccountTab },
    { id: "updates", label: "Updates", icon: "download", Component: UpdatesTab },
    { id: "patches", label: "Patches", icon: "wrench", Component: PatchesTab },
    { id: "patchhelper", label: "Patch Helper", icon: "beaker", Component: PatchHelperTab },
];

// Remembered across closing and reopening, like Discord's settings remember their last page
let lastTab = tabs[0].id;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Panel() {
    const [tab, setTabState] = React.useState(lastTab);
    const [whatsNew, setWhatsNew] = React.useState(false);
    const release = currentRelease();
    const panelRef = React.useRef<HTMLDivElement>(null);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    const current = tabs.find(t => t.id === tab) ?? tabs[0];

    const setTab = (id: string) => {
        lastTab = id;
        setTabState(id);
        bodyRef.current?.scrollTo({ top: 0 });
    };

    React.useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => previouslyFocused?.focus?.();
    }, []);

    // Vertical tablist: arrows move between sections, Home and End jump to the ends
    const onTabKey = (e: KeyboardEvent) => {
        const index = tabs.findIndex(t => t.id === tab);
        const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const target = tabs[(next + tabs.length) % tabs.length];
        setTab(target.id);
        document.getElementById(`dl-tab-${target.id}`)?.focus();
    };

    // Keep Tab inside the dialog while it's open
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Tab" || !panelRef.current) return;
        const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="dl-scrim" data-closing={view === "closing" ? "" : undefined} onMouseDown={e => e.target === e.currentTarget && close()}>
            <div className="dl-panel" role="dialog" aria-modal="true" aria-labelledby="dl-title" tabIndex={-1} ref={panelRef} onKeyDown={onKeyDown}>
                <nav className="dl-sidebar" aria-label="Evi">
                    <div className="dl-sidebar-head">
                        <Text tag="h2" variant="text-xs/semibold" color="text-muted" id="dl-title" className="dl-sidebar-title">Evi</Text>
                    </div>
                    <div className="dl-nav" role="tablist" aria-label="Evi sections" aria-orientation="vertical" onKeyDown={onTabKey}>
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                className="dl-nav-item"
                                id={`dl-tab-${t.id}`}
                                aria-selected={t.id === tab}
                                aria-controls="dl-tabpanel"
                                tabIndex={t.id === tab ? 0 : -1}
                                onClick={() => setTab(t.id)}
                            >
                                {t.icon ? <Icon name={t.icon} size={20} /> : <span className="dl-nav-icon-space" />}
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="dl-sidebar-foot">
                        <Button icon="folder" onClick={() => Native.openPath("data")}>Open data folder</Button>
                        <button type="button" className="dl-link-button dl-version-link" onClick={() => setWhatsNew(true)}>
                            <Text variant="text-xs/normal" color="text-muted" tabular>{`Evi ${EVI_VERSION} · What’s new`}</Text>
                        </button>
                    </div>
                </nav>
                <div className="dl-content">
                    <header className="dl-content-head">
                        <Text tag="h1" variant="heading-xl/semibold" color="text-strong" className="dl-content-title">{current.label}</Text>
                        <div className="dl-close">
                            <button type="button" className="dl-close-button" aria-label="Close Evi settings" onClick={close}>
                                <Icon name="closeLarge" size={18} />
                            </button>
                            <span className="dl-close-hint" aria-hidden="true">ESC</span>
                        </div>
                    </header>
                    <div className="dl-body" role="tabpanel" id="dl-tabpanel" aria-labelledby={`dl-tab-${current.id}`} ref={bodyRef}>
                        <ErrorBoundary resetKey={current.id}><current.Component /></ErrorBoundary>
                    </div>
                </div>
                {whatsNew && release && <WhatsNewModal releases={[release]} onClose={() => setWhatsNew(false)} />}
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
    createStyle(css, "evi-ui");
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
        // An open dialog closes first, with its own Escape handler
        const escape = e.key === "Escape" && view === "open" && !openDialogs;
        if (!toggle && !escape) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        toggle ? SettingsUI.toggle() : close();
    }, true);
}
