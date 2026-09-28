import { CHANGELOG_LOCALES } from "./changelogLocales";
import { matchLocale } from "./i18n";
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
        version: "1.0.0",
        date: "2026-09-28",
        cover: "1.0.0",
        sections: {
            added: [
                "**A store front page.** What's trending, what's new this week, staff picks and collections put together by Evi's team, before the full list.",
                "**Ratings and reviews.** Rate plugins you use and say why, in a few lines. Reviews anyone can report go to Evi's team.",
                "**Plugin pages show more.** A video or GIF of it in use, what people who run it also install, known issues, and a note from its author about the version.",
                "**A wishlist and an inbox.** Heart anything in the store to hear when it updates, gets a beta or works again. Reviews of your plugins, your uploads and news from authors you follow land in the new Inbox too.",
                "**Follow authors.** Author pages have a banner, pinned plugins, how many run their plugins, and a Follow button.",
                "**Plugin betas.** Authors can publish a beta next to the stable version, and you can opt into any plugin's betas from its page.",
                "**Dynamic Wallpaper.** An image or video behind Discord, dimmed so text stays readable, and paused on battery.",
                "**Crash Detective.** When Discord crashes or freezes, Evi says which plugin was busiest right before and offers to turn it off.",
                "**Updates in the background.** Turn it on in Updates, and new versions download on their own and install when you close Discord.",
                "**Keyboard shortcuts for plugins.** Set one in a plugin's settings by pressing the keys, like Discord's keybinds. Streamer Mode+ and Game Activity Toggle have one, and the field says when two plugins want the same keys.",
                "**Supporter perks.** Your supporter badge in a colour of your own, your name in the credits if you like, and Aurora, a theme for supporters.",
                "**Who Reacted.** Small avatars of who reacted, right on each reaction next to its count.",
                "**Typing Tweaks.** See who's typing at a glance: avatars and role colours in the \"is typing\" line, and three dots on channels and DMs while someone types there.",
                "**For plugin authors:** Evi DevTools (live Flux events, stores, patch hits and timings), API docs on hover in the Patch Helper, a public plugin API changelog, anonymous install and crash numbers on your dashboard, and `bun run new-plugin` / `bun run preview-plugin` to start and check a plugin.",
            ],
            improved: [
                "**Search finds settings, not just plugins.** Searching the Plugins tab looks through every plugin's settings too, and opening one from the results takes you to the setting.",
                "**Show only what you don't have yet** with the store's new Not installed filter, and sort by rating or what's trending.",
                "Streamer Mode+ keeps the shortcut you typed in, now as a recorded one.",
                "Plugin authors see how many use their plugins: once a day Evi tells evi.rest which store plugins it has, anonymously. Turn it off in the store's settings.",
                "Quick Actions is no longer part of Evi, and is removed when Evi updates.",
                "**View Icons moved into profiles.** Click someone's banner to open it full size like their avatar, and Download sits next to zoom. The right-click menu items are gone.",
            ],
            fixed: [
                "**Message Logger keeps deleted pictures, videos and files.** Discord deletes them from its servers with the message, so they used to show broken. Edits that remove an attachment keep it with the old version too.",
            ],
        },
    },
    {
        version: "0.7.0",
        date: "2026-09-28",
        sections: {
            added: [
                "**Plugins say what they need, and Evi holds them to it.** Which sites a plugin contacts, and whether it reads your messages, sends messages or changes your settings. Evi blocks the rest of what it tries through Evi, and anything blocked shows in the plugin's Activity.",
                "**Evi fixes plugins Discord breaks, without waiting for an update.** When a Discord update breaks a plugin, Evi's team repairs it on evi.rest and every install picks up the fix within minutes. The plugin's details say what was fixed.",
                "**Make your own theme.** Pick colours in the new Editor tab and watch Discord change as you go, then save it as a theme of your own.",
                "**Community themes.** Send a theme to the Theme Store from the editor or your dashboard. Evi's team reviews each one, and community themes can't load anything from the internet, so nobody learns who uses them.",
                "**DM Categories.** Sort your DMs into collapsible categories like Friends, Work or Gaming, at the top of your DM list. Right-click a DM to add it to one.",
                "**View Icons.** Right-click someone for their avatar and banner at full size, or a server for its icon and banner, in Discord's image viewer. Download the original or copy its link.",
                "**Calm Name Effects.** Opening a chat takes half the work: Nitro name styles like Prism and Neon animate while you hover a name, instead of on every message at once.",
            ],
            improved: [
                "**An update that asks for more waits for your OK,** like full access does. Store pages, install questions and plugin details list what each plugin asks for, and older plugins that don't say are labelled.",
                "**The store knows a fix is working.** A plugin Evi fixed shows as fixed instead of broken, and goes back to broken only if installs running the fix still have problems.",
                "Themes in the store can be reported, like plugins.",
            ],
            fixed: [
                "Platform Indicators' icon no longer grows to fill a whole message in places Evi's styles don't reach, like pop-out chats.",
            ],
        },
    },
    {
        version: "0.6.1",
        date: "2026-09-27",
        sections: {
            fixed: [
                "**Smooth Typing no longer brings back a message you just sent** into the text box. Switching channels and slash commands keep the box up to date too.",
                "A plugin that Evi turned off, or that has a problem to explain, keeps its card size in the Plugins list instead of stretching across it.",
            ],
        },
    },
    {
        version: "0.6.0",
        date: "2026-09-27",
        sections: {
            improved: [
                "**No more stutters from Evi.** Finding Discord's parts used to search all of Discord's code, 10 to 20 ms at a time, and a missing one was searched again every second. Now it's found once, and every later look is instant.",
                "**Plugins do their heavy work in small pieces,** between everything else: Fast Lists, Read All, GIF Folders and Last Seen's saving no longer hold Discord up.",
                "**Show Hidden Channels remembers who can see what,** instead of asking again for every channel on every redraw.",
                "**Faster Message Logger, Inline Translate, Platform Indicators, Voice Activity Log, Relationship Notifier, Hide Blocked, Timezones, Friend Online Alerts, Streamer Mode+, Silent Typing and Snippets.**",
                "The background plugin health check is much lighter.",
            ],
            fixed: [
                "**A plugin Evi turns off everywhere goes off within seconds,** with a notice, instead of at the next half-hourly check or restart.",
            ],
        },
    },
    {
        version: "0.5.3",
        date: "2026-09-27",
        sections: {
            fixed: [
                "The Plugin Author badge opens its details when you click it, and can be hidden and moved in Customize your badges.",
            ],
        },
    },
    {
        version: "0.5.2",
        date: "2026-09-27",
        sections: {
            improved: [
                "**Update checks go through evi.rest,** so a busy network no longer runs into GitHub's limit and says Evi can't check for updates.",
                "**Installing a plugin with full access asks in a dialog,** instead of a box squeezed into its card.",
                "**Icons on every tab,** so Installed and Store are told apart at a glance.",
                "**Every release gets its dotted cover** in What's new.",
            ],
            fixed: [
                "Opening the Store no longer scrolls Discord's settings down a bit.",
            ],
        },
    },
    {
        version: "0.5.1",
        date: "2026-09-27",
        sections: {
            added: [
                "**Community plugins with a native part.** Authors can submit a native.js with their plugin. Evi's team reads all of it before it goes in, and Evi still asks you before installing anything with full access.",
            ],
            fixed: [
                "Opening Evi's pages in Discord's settings no longer crashes Discord.",
            ],
        },
    },
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

/**
 * The release as `locale` reads it: each section in that language where there's a translation,
 * in English where there isn't. Locales match like Evi's menus (`pt-BR`, `de-AT` -> `de`).
 */
export function localizedRelease(release: Release, locale: string | null | undefined, locales = CHANGELOG_LOCALES): Release {
    const lang = matchLocale(locale, Object.keys(locales));
    const notes = lang ? locales[lang]?.[release.version] : undefined;
    if (!notes) return release;
    const sections: Release["sections"] = { ...release.sections };
    for (const kind of SECTION_KINDS) if (notes[kind]?.length) sections[kind] = notes[kind];
    return { ...release, sections };
}

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

const NOTES_HEADINGS: Record<SectionKind, string> = { added: "New", improved: "Improved", fixed: "Fixed", progress: "In progress" };

/**
 * A release's notes as the markdown on its GitHub release, which Evi's Updates tab, `evi update` and
 * evi.rest's releases page all show. Written by the release workflow (scripts/release-notes.ts), so
 * the entry here is the only place a release's notes are written.
 */
export function releaseMarkdown(release: Release) {
    return SECTION_KINDS
        .filter(kind => release.sections[kind]?.length)
        .map(kind => `## ${NOTES_HEADINGS[kind]}\n${release.sections[kind]!.map(line => `- ${line}`).join("\n")}`)
        .join("\n\n") + "\n";
}
