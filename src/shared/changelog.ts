import { compareVersions } from "./store";

export interface Release {
    version: string;
    /** YYYY-MM-DD */
    date: string;
    highlights: string[];
}

/**
 * Evi's own release notes, newest first. The "What's new" card shows the releases between the last
 * version you saw and this one, once, after Evi updates itself. Add an entry here with each release.
 */
export const RELEASES: Release[] = [
    {
        version: "0.2.0",
        date: "2026-09-26",
        highlights: [
            "The Plugin Store now lives in the Plugins tab, with a page for every plugin: screenshots, changelog, source and what it can access.",
            "Update all, and optional automatic updates. Plugins with full access to your computer still ask first.",
            "Browse the store by category and sort by name or most recently updated.",
            "Theme Store: install and update themes from the Themes tab.",
            "Store plugins can be updated and uninstalled right from the Plugins list.",
            "Turn every plugin off, or reset them to their defaults, with one click and an undo.",
            "A plugin that fails to start has a Copy crash report button for its author.",
        ],
    },
    {
        version: "0.1.0",
        date: "2026-09-20",
        highlights: ["First release: plugins, themes, Quick CSS, backups, safe mode and the plugin store."],
    },
];

/** Releases newer than `seen`, up to and including `current`. Nothing on a first run (no `seen`). */
export function releasesSince(seen: string | undefined, current: string, releases = RELEASES) {
    if (!seen) return [];
    return releases.filter(r => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}
