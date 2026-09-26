/**
 * "What's new in Evi": shown once after Evi updates itself, floating over Discord like the safe mode
 * notice, and on demand from the Evi panel's footer.
 */
import { Release, RELEASES, releasesSince } from "@shared/changelog";
import { compareVersions } from "@shared/store";

import { Settings } from "../settings";
import { createRoot, React } from "../webpack/common";
import { filters, waitFor } from "../webpack/find";
import { Button, IconButton, Text } from "./components";
import { ensureStyles } from "./index";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function ReleaseNotes({ releases }: { releases: Release[]; }) {
    return (
        <ol className="dl-changelog">
            {releases.map(r => (
                <li key={r.version}>
                    <div className="dl-row-title">
                        <Text variant="text-sm/semibold" color="text-strong" tabular>Evi {r.version}</Text>
                        <Text variant="text-xs/normal" color="text-muted">{dateFormat.format(new Date(`${r.date}T00:00:00`))}</Text>
                    </div>
                    <ul>{r.highlights.map(h => <li key={h}><Text variant="text-sm/normal" color="text-subtle">{h}</Text></li>)}</ul>
                </li>
            ))}
        </ol>
    );
}

export function WhatsNewCard({ releases, onClose }: { releases: Release[]; onClose(): void; }) {
    return (
        <section className="dl-whats-new" aria-labelledby="dl-whats-new-title" role="dialog">
            <div className="dl-whats-new-head">
                <Text tag="h2" variant="heading-lg/bold" color="text-strong" id="dl-whats-new-title">What’s new in Evi</Text>
                <IconButton icon="close" label="Close what’s new" onClick={onClose} />
            </div>
            <div className="dl-whats-new-body">
                <ReleaseNotes releases={releases} />
            </div>
            <div className="dl-toolbar">
                <Button variant="accent" onClick={onClose}>Got it</Button>
            </div>
        </section>
    );
}

/** Every release up to this one, for the panel's "What's new" link */
export const releasesSoFar = () => RELEASES.filter(r => compareVersions(r.version, EVI_VERSION) <= 0);

function Floating({ releases }: { releases: Release[]; }) {
    const [open, setOpen] = React.useState(true);
    return open ? <div className="dl-safe-float"><WhatsNewCard releases={releases} onClose={() => setOpen(false)} /></div> : null;
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
            container.className = "dl-root";
            document.body.append(container);
            createRoot(container).render(<Floating releases={releases} />);
        };
        if (document.body) mount();
        else document.addEventListener("DOMContentLoaded", mount, { once: true });
    });
}
