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
        version: "0.5.0",
        date: "2026-09-27",
        sections: {
            added: [
                "**Evi Setup.** A small installer with a window: pick your Discord, click Install Evi or Uninstall Evi. It checks for a newer Evi first and downloads it, so it's a few MB instead of over 100.",
                "**Evi in your language.** Evi's menus follow Discord's language: Spanish, Portuguese, French, German, Turkish, Russian, Polish and Japanese. Plugins can be translated too.",
                "**See what a plugin did.** A plugin's details list the sites it contacted and when, and point out ones its code never mentions.",
                "**Beta versions.** Turn on Get beta versions in Updates to get new Evi versions a few days early.",
                "**Plugin Author badge.** Anyone whose plugin makes it into the store gets it on their profile.",
            ],
            improved: [
                "Turning a plugin on or off no longer freezes Discord for a moment.",
                "**Supporter levels come monthly.** A new badge every month for your first six months, from Silver at one month to Ruby at six, then Prismatic at one year.",
            ],
            fixed: [
                "Clicking a plugin's switch no longer scrolls Discord's settings away from it.",
            ],
        },
    },
    {
        version: "0.4.0",
        date: "2026-09-27",
        cover: "0.4.0",
        sections: {
            added: [
                "**Community plugins in the store.** Plugin authors can now publish their own plugins on evi.rest. Evi's team reads every version before it goes in, and community plugins are labelled so you always know who made what.",
                "**Verified authors.** Every plugin shows who made it, with a check for verified authors. Click a name to see their other plugins.",
                "**Send a crash report to the author.** Next to Copy crash report. You see exactly what's sent before it goes, and nothing personal is in it.",
                "**Know when a plugin is broken.** If a plugin stops working for lots of people after a Discord update, the store and your Plugins list say so, often with a note from its author about the fix.",
                "**Report a plugin.** Something harmful, fake or broken? Report it from its store page. Reports go to Evi's team.",
                "**Evi can turn off a bad plugin everywhere.** If a plugin turns out to be harmful, Evi switches it off on every install and tells you why.",
            ],
            improved: [
                "**A What's new that looks like Evi.** The release's cover across the top, and each kind of change under its own label.",
                "**Popups wait for Discord.** What's new, plugin changelogs and the update notice show once Discord has loaded, not over its loading screen.",
                "**Supporter badges level up faster.** Prismatic is now one year of support instead of five.",
                "**Plugin badges in Your badges.** Badges plugins add to profiles, like Last Seen's clock and Platform Indicators' device, are listed in Discord's badge directory too.",
                "**Safer by design.** Turning on a plugin with full access to your computer always asks you in a system dialog that no plugin can answer for you.",
            ],
            fixed: [
                "Installing a plugin from the store always turns it on. It used to say it had, and sometimes hadn't.",
                "Dropdowns in a plugin's settings open on the first click. In Discord's settings they often closed again right away.",
            ],
        },
    },
    {
        version: "0.3.2",
        date: "2026-09-27",
        cover: "0.3.2",
        sections: {
            improved: [
                "**Dialogs and menus move like Discord's.** Evi's dialogs, notices and plugin menus now spring open and fade away instead of popping in and vanishing.",
                "**A cleaner Voice Activity Log**, with sessions listed by channel and a proper search field.",
            ],
        },
    },
    {
        version: "0.3.1",
        date: "2026-09-27",
        cover: "0.3.1",
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
                "**Evi badges are part of Evi.** They show on profiles for everyone using Evi, and can't be turned off by accident.",
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
