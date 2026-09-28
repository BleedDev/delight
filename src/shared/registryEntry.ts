/**
 * Building a plugin's registry entry from its files. Shared by the publishing script
 * (scripts/registry.ts, official plugins built from this repo) and evi.rest (server/, third-party
 * plugins published from an approved submission), so both write entries the same way.
 * Nothing here touches the disk or the network.
 */
import { readPermissions } from "./declaredPermissions";
import type { PluginManifest } from "./ipc";
import { parseRegistry, REGISTRY_SCHEMA, RegistryEntry, sha256Hex, STORE_FILES, StoreFileName, ThemeEntry, whyNotManifest } from "./store";

/**
 * Each version of a file gets its own address: a CDN in front of the store (Cloudflare) caches files
 * for hours, and would otherwise keep serving the old version under the new hash, failing installs.
 * The server ignores the query.
 */
export const versionedUrl = (url: string, sha256: string) => `${url}?v=${sha256.slice(0, 12)}`;

export interface EntryOptions {
    /** Where the plugin's files are served from: <base>/<id>/<file>, or <base>/<id>/<folder>/<file> */
    base: string;
    /** A folder of its own for this version's files (evi.rest: 12 hex digits of their hash) */
    folder?: string;
    /** The entry this one replaces, to keep its publish date while the version doesn't change */
    previous?: { version: string; updatedAt?: string; };
    /** YYYY-MM-DD */
    today: string;
    /** minEviVersion when the manifest doesn't set one */
    eviVersion: string;
    /** The source link when the manifest doesn't give one */
    source?: string;
    /** Overrides the manifest's authors: an author's verified name on evi.rest */
    authors?: string[];
    /** Author profiles on evi.rest, by slug */
    authorIds?: string[];
}

/** The entry for a plugin's files (manifest.json and index.js, maybe native.js), or why it can't be one */
export async function buildEntry(files: Partial<Record<StoreFileName, Uint8Array>>, options: EntryOptions): Promise<{ entry: RegistryEntry; } | { error: string; }> {
    const manifestBytes = files["manifest.json"];
    if (!manifestBytes || !files["index.js"]) return { error: "manifest.json and index.js are both needed" };
    let manifest: PluginManifest;
    try {
        manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    } catch {
        return { error: "manifest.json isn't valid JSON" };
    }
    if (!manifest || typeof manifest !== "object") return { error: "manifest.json isn't a JSON object" };

    const listed: RegistryEntry["files"] = {} as RegistryEntry["files"];
    for (const name of STORE_FILES) {
        const data = files[name];
        if (!data) continue;
        const sha256 = await sha256Hex(data);
        listed[name] = { url: versionedUrl(`${options.base}/${manifest.id}/${options.folder ? `${options.folder}/` : ""}${name}`, sha256), sha256 };
    }

    const version = manifest.version ?? "0.0.0";
    const entry = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description ?? "",
        authors: options.authors ?? (manifest.authors?.length ? manifest.authors : ["Unknown"]),
        ...options.authorIds?.length && { authorIds: options.authorIds },
        version,
        tags: manifest.tags ?? [],
        // Anything that runs outside Discord's page needs the user's explicit trust
        native: !!manifest.native || Object.keys(manifest.chromiumSwitches ?? {}).length > 0,
        minEviVersion: manifest.minEviVersion ?? options.eviVersion,
        files: listed,
        updatedAt: options.previous?.version === version && options.previous.updatedAt ? options.previous.updatedAt : options.today,
        ...(manifest.source ?? options.source) && { source: manifest.source ?? options.source },
        screenshots: manifest.screenshots ?? [],
        ...manifest.preview && { preview: manifest.preview },
        changelog: manifest.changelog ?? [],
        // Checked strictly below (whyNotManifest): an entry never shows a declaration its manifest doesn't make
        ...manifest.permissions !== undefined && { permissions: readPermissions(manifest.permissions) },
    } as RegistryEntry;

    // The app's own checks are the final word on what gets published
    const bad = whyNotManifest(manifest, entry);
    if (bad) return { error: bad };
    const check = parseRegistry({ schema: REGISTRY_SCHEMA, plugins: [entry] });
    if ("error" in check) return { error: check.error };
    if (check.problems.length) return { error: check.problems[0] };
    return { entry };
}

/**
 * A registry with `entries` put in: each replaces the plugin with the same id, new ones go in
 * alphabetically. Everything else, other plugins and all themes, stays as it was.
 */
export function spliceRegistry(registry: { schema?: number; plugins?: RegistryEntry[]; themes?: ThemeEntry[]; }, entries: RegistryEntry[]) {
    const byId = new Map(entries.map(e => [e.id, e]));
    const plugins = (registry.plugins ?? []).map(p => byId.get(p.id) ?? p);
    for (const e of entries) if (!plugins.some(p => p.id === e.id)) plugins.push(e);
    plugins.sort((a, b) => a.id.localeCompare(b.id));
    return { schema: registry.schema ?? REGISTRY_SCHEMA, plugins, themes: registry.themes ?? [] };
}
