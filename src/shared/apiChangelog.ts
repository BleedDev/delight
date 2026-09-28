/**
 * The plugin API's changes, version by version: what @evi/api, a plugin's `ctx`, its manifest and the
 * plugin tooling gained, changed, deprecated or lost. Evi's DevTools show it, and evi.rest publishes
 * it for plugin authors. Add an entry with each release that touches what plugins can use.
 */

export interface ApiChange {
    kind: "added" | "changed" | "deprecated" | "removed";
    /** What it's about, as a plugin writes it: `ctx.keybind`, `defineStrings`, `permissions` */
    symbol: string;
    description: string;
}

export interface ApiRelease {
    version: string;
    /** YYYY-MM-DD */
    date: string;
    changes: ApiChange[];
}

/** Newest first */
export const API_CHANGELOG: ApiRelease[] = [
    {
        version: "1.1.0",
        date: "2026-09-28",
        changes: [
            {
                kind: "added",
                symbol: "locales",
                description: "A manifest field with the plugin's name, description and changelog notes in other languages: { \"de\": { \"name\": \"…\", \"description\": \"…\", \"changelog\": { \"1.0.0\": [\"…\"] } } }. The Plugins tab and the store show whichever matches Discord's language, English for anything left out. Themes take the same as @name:de and @description:de header lines.",
            },
            {
                kind: "changed",
                symbol: "settings",
                description: "A setting's label, description and option labels are read each time the settings draw, so they can be getters that call your defineStrings t() and follow Discord's language.",
            },
            {
                kind: "changed",
                symbol: "new-plugin",
                description: "New plugins come with a strings.ts using defineStrings, settings that follow the language, and a locales example in the manifest.",
            },
        ],
    },
    {
        version: "1.0.0",
        date: "2026-09-28",
        changes: [
            {
                kind: "added",
                symbol: "ctx.keybind",
                description: "Runs a handler when the shortcut in one of the plugin's keybind settings is pressed, anywhere in Discord. The setting is read on every press, so a new shortcut applies at once, and the handler is removed when the plugin stops.",
            },
            {
                kind: "added",
                symbol: "type: \"keybind\"",
                description: "A setting type for a keyboard shortcut the user records by pressing the keys, stored like \"Ctrl+Shift+KeyG\" (\"\" for none). The settings field says when two plugins want the same keys.",
            },
            {
                kind: "added",
                symbol: "ctx.settings.schema",
                description: "A plugin's settings schema is readable from its context, as declared in its definition.",
            },
            {
                kind: "added",
                symbol: "new-plugin",
                description: "bun run new-plugin <id> sets up a plugin that works as it is: a manifest, an index.tsx with a setting, a keyboard shortcut and a slash command, and a pure file with its test.",
            },
            {
                kind: "added",
                symbol: "preview-plugin",
                description: "bun run preview-plugin <id> shows the plugin's store page and what the store's checks would say about it, before you upload.",
            },
        ],
    },
    {
        version: "0.7.0",
        date: "2026-09-28",
        changes: [
            {
                kind: "added",
                symbol: "permissions",
                description: "Manifests declare what a plugin needs: the network hosts it contacts, and whether it reads messages, sends messages or changes settings. Evi blocks the rest of what it tries through Evi with a PluginPermissionError, and store uploads require the declaration.",
            },
            {
                kind: "changed",
                symbol: "patches",
                description: "When a Discord update breaks a store plugin, Evi's team can hotfix its source patches and lookups without a new version. A patch is identified by its place in patches and its find, so keep patches in the same order between versions.",
            },
        ],
    },
    {
        version: "0.5.0",
        date: "2026-09-27",
        changes: [
            {
                kind: "added",
                symbol: "defineStrings",
                description: "A plugin's own translations, by Discord's locale tags. English is required and is the fallback; it returns t(key, vars) with {placeholders} and plural forms.",
            },
            {
                kind: "added",
                symbol: "useLocale",
                description: "React hook that re-renders a component when Discord's language changes.",
            },
            {
                kind: "added",
                symbol: "I18n",
                description: "I18n.locale is the language Evi uses for its own UI, I18n.discordLocale the tag Discord has.",
            },
        ],
    },
];
