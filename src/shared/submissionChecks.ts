/**
 * What evi.rest checks when an author uploads a plugin, run on your own machine first: `bun run
 * preview-plugin` (scripts/preview-plugin.ts) says what an upload would be refused for before you
 * upload it, and warns about what reviewers would ask you to change.
 *
 * Errors are the upload's own rules, in the same words. Warnings are what isn't refused but gets
 * noticed: a declaration that doesn't match the code, a version with no changelog entry.
 */
import { hostAllowed, isMessageAction, isMessageStore, readPermissions, whyNotPermissions } from "./declaredPermissions";
import { scanBundle } from "./pluginPermissions";
import { missingTranslations, PLUGIN_LANGUAGES } from "./pluginTranslations";
import { compareVersions, isPluginId, isVersion, MAX_FILE_BYTES, RETIRED_PLUGINS } from "./store";

/** The description `bun run new-plugin` writes, for the author to replace */
export const PLACEHOLDER_DESCRIPTION = "Say what someone gets from it, in a sentence or two.";

export interface Finding {
    level: "error" | "warning";
    message: string;
}

export interface SubmissionFiles {
    /** manifest.json as built, parsed */
    manifest: unknown;
    /** index.js text */
    code: string;
    /** native.js text, when there is one */
    nativeCode?: string;
}

export interface StoreContext {
    /** Ids of Evi's own plugins, which can't be uploaded */
    officialIds: ReadonlySet<string>;
    /** Their names, lowercase: a community plugin can't take one */
    officialNames: ReadonlySet<string>;
    /** The version the store has now, if it has this plugin */
    publishedVersion?: string;
}

/** Characters a reviewer can't see or that make code read differently from how it runs (as evi.rest) */
export function hiddenCharacter(code: string): { char: string; line: number; } | undefined {
    for (let i = 0; i < code.length; i++) {
        const c = code.charCodeAt(i);
        if ((c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2069) || (c === 0xfeff && i > 0)) {
            return { char: `U+${c.toString(16).toUpperCase().padStart(4, "0")}`, line: code.slice(0, i).split("\n").length };
        }
    }
}

const kb = (bytes: number) => bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024 * 10) / 10} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function checkSubmission(files: SubmissionFiles, store: StoreContext): Finding[] {
    const findings: Finding[] = [];
    const error = (message: string) => void findings.push({ level: "error", message });
    const warn = (message: string) => void findings.push({ level: "warning", message });

    const m = files.manifest as Record<string, any> | null;
    if (!m || typeof m !== "object" || Array.isArray(m)) {
        error("manifest.json isn't a JSON object");
        return findings;
    }

    for (const [name, text] of [["index.js", files.code], ["native.js", files.nativeCode]] as const) {
        if (text === undefined) continue;
        const bytes = new TextEncoder().encode(text).length;
        if (bytes > MAX_FILE_BYTES) error(`${name} is ${kb(bytes)}; community plugins can be at most ${kb(MAX_FILE_BYTES)} per file, the most a reviewer can read`);
        const hidden = hiddenCharacter(text);
        if (hidden) error(`${name} contains an invisible or text-direction character (${hidden.char}) on line ${hidden.line}. Remove it: reviewers can't see it, and it can make code read differently from how it runs.`);
    }
    if (!files.code.length) error("index.js is empty");

    if (m.native !== undefined && m.native !== "native.js") error(`manifest.json must say "native": "native.js" for its native part`);
    if (m.native && files.nativeCode === undefined) error("manifest.json has a native part, but there's no native.js");
    if (!m.native && files.nativeCode !== undefined) error(`There's a native.js, but manifest.json doesn't use it: add "native": "native.js"`);
    if (m.chromiumSwitches !== undefined && Object.keys(m.chromiumSwitches ?? {}).length) error("chromiumSwitches aren't accepted: community plugins can't change how Discord starts");

    if (!isPluginId(m.id)) error("manifest.json needs an id: lowercase letters, digits and dashes");
    else if (m.id.startsWith("evi")) error(`Plugin ids starting with "evi" are reserved for Evi`);
    else if (RETIRED_PLUGINS.includes(m.id)) error("That plugin id is reserved for Evi");
    else if (store.officialIds.has(m.id)) error("That's one of Evi's own plugins");

    if (!isVersion(m.version)) error("manifest.json needs a version like 1.0.0");
    else if (store.publishedVersion && compareVersions(m.version, store.publishedVersion) <= 0) {
        error(`Version ${m.version} isn't newer than the published ${store.publishedVersion}`);
    }

    if (typeof m.name !== "string" || !m.name.trim()) error("manifest.json needs a name");
    else if (store.officialNames.has(m.name.trim().toLowerCase())) error(`"${m.name}" is the name of one of Evi's own plugins`);

    if (m.permissions === undefined) {
        error(`manifest.json needs "permissions": what the plugin needs from Discord's page, like { "network": ["api.example.com"], "readMessages": true }, or {} for nothing. See docs/plugins.md`);
    } else {
        const bad = whyNotPermissions(m.permissions);
        if (bad) error(`manifest.json: ${bad}`);
    }

    // Every plugin speaks every language Evi does
    const untranslated = missingTranslations(m, files.code);
    if (untranslated.length) {
        error(`Translate everything into ${PLUGIN_LANGUAGES.join(", ")} too: ${untranslated.join(". ")}.`);
    }

    // Not refused, but a reviewer would ask
    if (typeof m.description !== "string" || !m.description.trim()) warn("No description: the store card would only have the name. Say what someone gets from it, in a sentence or two.");
    else if (m.description.trim() === PLACEHOLDER_DESCRIPTION) warn("The description is still the one new-plugin wrote: say what someone gets from this plugin.");
    if (!Array.isArray(m.tags) || !m.tags.length) warn(`No tags: the store's categories and search won't find it. Pick from "privacy", "messages", "social", "voice", "appearance", "developer"...`);
    if (isVersion(m.version) && !(Array.isArray(m.changelog) && m.changelog.some((c: any) => c?.version === m.version))) {
        warn(`No changelog entry for ${m.version}: installed copies show what changed from it.`);
    }

    const declared = readPermissions(m.permissions);
    if (declared) {
        const found = scanBundle(files.code);
        for (const domain of [...found.domains, ...found.discordDomains]) {
            if (found.network.length && !hostAllowed(declared, domain)) {
                warn(`The code mentions ${domain} and makes web requests, but "network" doesn't list it: Evi would block requests there.`);
            }
        }
        const messageFlux = found.flux.filter(isMessageAction);
        if (messageFlux.length && !declared.readMessages) warn(`It listens to ${messageFlux.join(", ")} without "readMessages": Evi would refuse those subscriptions.`);
        const messageStores = found.stores.filter(isMessageStore);
        if (messageStores.length && !declared.readMessages) warn(`It reads ${messageStores.join(", ")} without "readMessages": Evi would refuse those lookups.`);
        if (found.dynamicCode.length) warn(`It builds code while running (${found.dynamicCode.join(", ")}): reviewers can't check that, and its details say so.`);
    }

    return findings;
}
