/**
 * "What's new in Evi": a copy of Discord's own changelog modal (layout, type and section colors
 * measured from its CSS). Shown once after Evi updates itself, and on demand from the Evi panel.
 * Discord's modal itself can't be used: it renders in Discord's modal layer, under Evi's panel.
 */
import { latestRelease, mergeReleases, Release, RELEASES_URL, releasesSince, SECTION_KINDS, SECTION_TITLES } from "@shared/changelog";

import { Settings } from "../settings";
import { createRoot, React, ReactDOM } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { Button, cx, Icon, Text, useModal } from "./components";
import { coverUrl } from "./covers";
import { ensureStyles } from "./index";

// Discord's changelog subtitle is the date, written out: "September 26, 2026"
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

/** The part of Discord's changelog markdown Evi's notes use: **bold** lead-ins */
function inline(text: string) {
    return text.split(/\*\*(.+?)\*\*/g).map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part);
}

export function WhatsNewModal({ releases, onClose }: { releases: Release[]; onClose(): void; }) {
    const { ref, onKeyDown } = useModal(onClose);
    const notes = mergeReleases(releases);
    const cover = coverUrl(notes.cover);
    const scrollerRef = React.useRef<HTMLDivElement>(null);
    const innerRef = React.useRef<HTMLElement>(null);
    // Like Discord's modal: dividers above and below the body only when it has to scroll
    const [scrolls, setScrolls] = React.useState(false);

    React.useLayoutEffect(() => {
        const scroller = scrollerRef.current, inner = innerRef.current;
        if (!scroller || !inner) return;
        const observer = new ResizeObserver(() => setScrolls(inner.getBoundingClientRect().height > scroller.getBoundingClientRect().height));
        observer.observe(scroller);
        observer.observe(inner);
        return () => observer.disconnect();
    }, []);

    return ReactDOM.createPortal(
        <div className="dl-root">
            <div className="dl-scrim dl-dialog-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
                <div className="dl-modal dl-whats-new" role="dialog" aria-modal="true" aria-labelledby="dl-whats-new-title" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
                    <header className="dl-modal-section dl-modal-header">
                        <div className="dl-modal-header-layout">
                            <div className="dl-modal-header-main">
                                <Text tag="h1" variant="heading-lg/semibold" color="text-strong" id="dl-whats-new-title">What’s New in Evi</Text>
                            </div>
                            <div className="dl-modal-header-trailing">
                                <Button variant="icon" size="md" icon="closeLarge" aria-label="Close" onClick={onClose} />
                            </div>
                        </div>
                        <Text variant="text-md/normal" color="text-subtle">{dateFormat.format(new Date(`${notes.date}T00:00:00`))}</Text>
                    </header>
                    <div className={cx("dl-modal-spacer-top", scrolls && "dl-modal-divided")} />
                    <div className="dl-modal-body" ref={scrollerRef}>
                        <main className={cx("dl-modal-body-inner", scrolls && "dl-modal-body-scrolls")} ref={innerRef}>
                            <div className="dl-whats-new-notes" role="region" aria-label="Changelog content" tabIndex={0}>
                                {cover && <img className="dl-whats-new-cover" src={cover} alt="" width={1200} height={675} />}
                                {SECTION_KINDS.filter(kind => notes.sections[kind]?.length).map(kind => (
                                    <React.Fragment key={kind}>
                                        <Text tag="h2" variant="heading-md/bold" className={`dl-whats-new-title dl-whats-new-${kind}`}>{SECTION_TITLES[kind]}</Text>
                                        <ul className="dl-whats-new-list">
                                            {notes.sections[kind]!.map(line => <li className="dl-whats-new-item" key={line}>{inline(line)}</li>)}
                                        </ul>
                                    </React.Fragment>
                                ))}
                            </div>
                        </main>
                    </div>
                    <div className={cx("dl-modal-spacer-bottom", scrolls && "dl-modal-divided")} />
                    <footer className="dl-modal-section dl-modal-action-bar">
                        <div className="dl-whats-new-footer">
                            <a className="dl-whats-new-social" href={RELEASES_URL} target="_blank" rel="noreferrer noopener" aria-label="Evi on GitHub">
                                <Icon name="github" size={16} />
                            </a>
                            <Text variant="text-xs/normal">Follow us for more updates!</Text>
                        </div>
                    </footer>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** The newest release notes up to this version, for the panel's "What's new" link */
export const currentRelease = () => latestRelease(EVI_VERSION);

function Startup({ releases }: { releases: Release[]; }) {
    const [open, setOpen] = React.useState(true);
    return open ? <WhatsNewModal releases={releases} onClose={() => setOpen(false)} /> : null;
}

/**
 * After an update, shows what changed since the version last seen, once. A first install only
 * remembers the version: there's nothing "new" to someone who just got Evi.
 */
export function showWhatsNewIfUpdated() {
    const seen = Settings.data.lastSeenVersion;
    if (seen === EVI_VERSION) return;
    const releases = releasesSince(seen, EVI_VERSION);
    Settings.update(d => {
        d.lastSeenVersion = EVI_VERSION;
    });
    if (!releases.length) return;

    ensureStyles();
    waitFor(filters.byProps("createRoot"), () => {
        const mount = () => {
            const container = document.createElement("div");
            document.body.append(container);
            createRoot(container).render(<Startup releases={releases} />);
        };
        if (document.body) mount();
        else document.addEventListener("DOMContentLoaded", mount, { once: true });
    });
}
