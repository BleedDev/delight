import { compareVersions } from "./store";

/** The sections of Discord's own changelog, in its order, each with its own heading color */
export const SECTION_KINDS = ["added", "improved", "fixed", "progress"] as const;
export type SectionKind = typeof SECTION_KINDS[number];

export const SECTION_TITLES: Record<SectionKind, string> = {
    added: "New Features",
    improved: "Improvements",
    fixed: "Fixes",
    progress: "In Progress",
};

/** Where Evi's releases are published, linked from the modal's footer */
export const RELEASES_URL = "https://github.com/BleedDev/evi/releases";

export interface Release {
    version: string;
    /** YYYY-MM-DD */
    date: string;
    /**
     * The release's picture, where Discord's changelog has its video: a blog cover, by the name of
     * its file in src/renderer/ui/covers. Usually the cover of the post announcing the release.
     */
    cover?: string;
    /** One line per change. Like Discord's, a line can open with a **bold lead-in.** */
    sections: Partial<Record<SectionKind, string[]>>;
}

/**
 * Evi's own release notes, newest first. The "What's new" modal shows the releases between the last
 * version you saw and this one, once, after Evi updates itself. Add an entry here with each release.
 */
export const RELEASES: Release[] = [
    {
        version: "0.3.1",
        date: "2026-09-27",
        sections: {
            added: [
                "**Evi on macOS and Linux.** Download the installer for your system from the release and run `evi install`. On Linux, run it with sudo.",
            ],
        },
    },
    {
        version: "0.3.0",
        date: "2026-09-27",
        sections: {
            added: [
                "**Evi badges are part of Evi.** They show on profiles and next to names for everyone using Evi, and can't be turned off by accident.",
                "**Hide and reorder your Evi badges** in Discord's own Customize your badges. Everyone sees the change within seconds.",
                "**Supporter badges that level up.** From Bronze to Prismatic the longer you support Evi, with your progress in Your badges.",
                "**Update Evi from the app.** Evi says when a new version is out, and one button installs it.",
            ],
            improved: [
                "Badges update live instead of every half hour.",
                "Every plugin can be removed, including the ones Evi comes with, and they stay removed when Evi updates.",
            ],
        },
    },
    {
        version: "0.2.0",
        date: "2026-09-26",
        cover: "store",
        sections: {
            added: [
                "**The Plugin Store now lives in the Plugins tab.** Every plugin gets its own page with screenshots, its changelog, its source and what it can access.",
                "**Theme Store.** Install and update themes right from the Themes tab.",
                "**Update all, and automatic updates if you want them.** Plugins with full access to your computer still ask first.",
                "**Crash reports.** A plugin that fails to start has a Copy crash report button for its author.",
            ],
            improved: [
                "Browse the store by category, and sort it by name or most recently updated.",
                "Update and uninstall store plugins right from the Plugins list.",
                "Turn every plugin off, or reset them all to their defaults, with one click and an undo.",
            ],
        },
    },
    {
        version: "0.1.0",
        date: "2026-09-20",
        cover: "hello",
        sections: {
            added: ["**First release.** Plugins, themes, Quick CSS, backups, safe mode and the plugin store."],
        },
    },
];

/** Releases newer than `seen`, up to and including `current`. Nothing on a first run (no `seen`). */
export function releasesSince(seen: string | undefined, current: string, releases = RELEASES) {
    if (!seen) return [];
    return releases.filter(r => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}

/** The newest release up to `current`, what the panel's "What's new" link shows */
export function latestRelease(current: string, releases = RELEASES) {
    return releases.find(r => compareVersions(r.version, current) <= 0);
}

/**
 * Several releases as one changelog, like Discord shows one per update: newest first within each
 * section, dated and pictured by the newest. For when you skipped a version or two.
 */
export function mergeReleases(releases: Release[]): Release {
    const sections: Release["sections"] = {};
    for (const kind of SECTION_KINDS) {
        const lines = releases.flatMap(r => r.sections[kind] ?? []);
        if (lines.length) sections[kind] = lines;
    }
    const cover = releases.find(r => r.cover)?.cover;
    return { version: releases[0].version, date: releases[0].date, ...cover && { cover }, sections };
}
