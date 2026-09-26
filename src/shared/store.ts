/**
 * The plugin store's registry format and the checks shared by main, the renderer, the publishing
 * script and the tests. Nothing here touches the network or the disk.
 *
 *   {
 *     "schema": 1,
 *     "plugins": [{
 *       "id": "no-track", "name": "No Track", "description": "…", "authors": ["Evi"],
 *       "version": "1.0.0", "tags": ["privacy"], "native": true, "minEviVersion": "0.1.0",
 *       "files": {
 *         "manifest.json": { "url": "https://…/manifest.json", "sha256": "<64 hex>" },
 *         "index.js":      { "url": "https://…/index.js",      "sha256": "…" },
 *         "native.js":     { "url": "https://…/native.js",     "sha256": "…" }
 *       }
 *     }]
 *   }
 */
import type { PluginManifest } from "./ipc";

export const REGISTRY_SCHEMA = 1;
export const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/BleedDev/evi/main/registry.json";

export const MAX_REGISTRY_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PLUGINS = 2000;

/** Marks a plugin folder as installed by the store, only those can be updated or uninstalled from it */
export const STORE_MARKER = ".evi-store.json";

export const STORE_FILES = ["manifest.json", "index.js", "native.js"] as const;
export type StoreFileName = (typeof STORE_FILES)[number];

export interface StoreFile {
    url: string;
    sha256: string;
}

export interface RegistryEntry {
    id: string;
    name: string;
    description: string;
    authors: string[];
    version: string;
    tags: string[];
    /** Runs code in Discord's main process (native.js) or changes how Discord starts (chromiumSwitches) */
    native: boolean;
    minEviVersion?: string;
    files: Partial<Record<StoreFileName, StoreFile>> & Record<"manifest.json" | "index.js", StoreFile>;
}

export interface Registry {
    schema: typeof REGISTRY_SCHEMA;
    plugins: RegistryEntry[];
}

/** Written into the plugin folder next to the plugin's own files */
export interface StoreMarker {
    id: string;
    version: string;
    native: boolean;
    registryUrl: string;
    files: Partial<Record<StoreFileName, string>>;
}

export interface InstalledPlugin {
    id: string;
    version?: string;
    /** false: a folder with this id exists but the store didn't put it there */
    fromStore: boolean;
}

export type StoreListing =
    | { ok: true; registryUrl: string; plugins: RegistryEntry[]; problems: string[]; installed: InstalledPlugin[]; }
    | { ok: false; registryUrl: string; error: string; installed: InstalledPlugin[]; };

export type StoreResult = { ok: true; id: string; version: string; } | { ok: false; error: string; };

export interface StoreProgress {
    id: string;
    phase: "downloading" | "verifying" | "installing" | "removing";
    done: number;
    total: number;
}

// ---- versions ---------------------------------------------------------------------------------

const VERSION_RE = /^\d{1,9}(?:\.\d{1,9}){0,3}(?:-[0-9A-Za-z.-]{1,32})?$/;

export const isVersion = (v: unknown): v is string => typeof v === "string" && VERSION_RE.test(v);

/**
 * Compares dotted versions: 1.2 == 1.2.0 < 1.10.0. A prerelease (1.0.0-beta.2) sorts before its
 * release, and prerelease parts compare numerically when both are numbers. Invalid input sorts lowest.
 */
export function compareVersions(a: string, b: string): number {
    const va = isVersion(a), vb = isVersion(b);
    if (!va || !vb) return Number(va) - Number(vb);

    const [coreA, preA] = splitPre(a);
    const [coreB, preB] = splitPre(b);
    for (let i = 0; i < Math.max(coreA.length, coreB.length); i++) {
        const diff = (coreA[i] ?? 0) - (coreB[i] ?? 0);
        if (diff) return Math.sign(diff);
    }
    if (preA === preB) return 0;
    if (preA === undefined) return 1;
    if (preB === undefined) return -1;

    const pa = preA.split("."), pb = preB.split(".");
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if (pa[i] === undefined) return -1;
        if (pb[i] === undefined) return 1;
        const na = /^\d+$/.test(pa[i]), nb = /^\d+$/.test(pb[i]);
        const diff = na && nb ? Number(pa[i]) - Number(pb[i]) : na !== nb ? (na ? -1 : 1) : pa[i].localeCompare(pb[i]);
        if (diff) return Math.sign(diff);
    }
    return 0;
}

function splitPre(v: string): [number[], string | undefined] {
    const dash = v.indexOf("-");
    const core = dash === -1 ? v : v.slice(0, dash);
    return [core.split(".").map(Number), dash === -1 ? undefined : v.slice(dash + 1)];
}

// ---- validation -------------------------------------------------------------------------------

const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export const isPluginId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

/** Why a URL can't be used by the store, or undefined when it's a plain https URL */
export function whyNotStoreUrl(input: unknown): string | undefined {
    if (typeof input !== "string" || input.length > 2048) return "not a URL";
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return "not a URL";
    }
    if (url.protocol !== "https:") return "only https:// URLs are allowed";
    if (url.username || url.password) return "URLs with credentials aren't allowed";
}

function text(value: unknown, max: number, required = true): value is string {
    return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0) && !/[\0-\x08\x0e-\x1f]/.test(value);
}

function strings(value: unknown, maxItems: number, maxLength: number): value is string[] {
    return Array.isArray(value) && value.length <= maxItems && value.every(v => text(v, maxLength));
}

/** Validates one entry, returning it cleaned of unknown keys, or the reason it's unusable */
export function validateEntry(raw: unknown): { entry: RegistryEntry; } | { error: string; } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "not an object" };
    const e = raw as Record<string, unknown>;
    const id = isPluginId(e.id) ? e.id : undefined;
    const fail = (why: string) => ({ error: `${id ?? JSON.stringify(e.id)?.slice(0, 40) ?? "entry"}: ${why}` });

    if (!id) return fail("id must be lowercase letters, digits and dashes");
    if (!text(e.name, 80)) return fail("name must be 1-80 characters");
    if (!text(e.description, 500, false)) return fail("description must be at most 500 characters");
    if (!strings(e.authors, 10, 80) || !e.authors.length) return fail("authors must list 1-10 names");
    if (!isVersion(e.version)) return fail("version must look like 1.2.3");
    if (e.tags !== undefined && !strings(e.tags, 10, 32)) return fail("tags must be at most 10 short strings");
    if (typeof e.native !== "boolean") return fail("native must be true or false");
    if (e.minEviVersion !== undefined && !isVersion(e.minEviVersion)) return fail("minEviVersion must look like 1.2.3");

    const files = e.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) return fail("files is missing");
    const cleanFiles: Partial<Record<StoreFileName, StoreFile>> = {};
    for (const [name, file] of Object.entries(files)) {
        if (!(STORE_FILES as readonly string[]).includes(name)) return fail(`unexpected file ${name}`);
        if (!file || typeof file !== "object") return fail(`${name} is not an object`);
        const { url, sha256 } = file as Record<string, unknown>;
        const bad = whyNotStoreUrl(url);
        if (bad) return fail(`${name}: ${bad}`);
        if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return fail(`${name}: sha256 must be 64 lowercase hex digits`);
        cleanFiles[name as StoreFileName] = { url: url as string, sha256 };
    }
    if (!cleanFiles["manifest.json"] || !cleanFiles["index.js"]) return fail("files must include manifest.json and index.js");
    if (cleanFiles["native.js"] && !e.native) return fail("has native.js but isn't marked native");

    return {
        entry: {
            id,
            name: e.name,
            description: e.description,
            authors: [...e.authors],
            version: e.version,
            tags: e.tags ? [...(e.tags as string[])] : [],
            native: e.native,
            ...(e.minEviVersion !== undefined && { minEviVersion: e.minEviVersion as string }),
            files: cleanFiles as RegistryEntry["files"],
        },
    };
}

/**
 * Validates a registry document. A malformed document is rejected as a whole; individual bad or
 * duplicate entries are dropped and reported in `problems`, so one broken entry can't hide the rest.
 */
export function parseRegistry(json: unknown): { registry: Registry; problems: string[]; } | { error: string; } {
    if (!json || typeof json !== "object" || Array.isArray(json)) return { error: "The registry isn't a JSON object" };
    const { schema, plugins } = json as Record<string, unknown>;
    if (schema !== REGISTRY_SCHEMA) return { error: `Unsupported registry schema ${JSON.stringify(schema)}, this Evi reads schema ${REGISTRY_SCHEMA}` };
    if (!Array.isArray(plugins)) return { error: "The registry has no plugins list" };
    if (plugins.length > MAX_PLUGINS) return { error: `The registry lists more than ${MAX_PLUGINS} plugins` };

    const problems: string[] = [];
    const seen = new Set<string>();
    const entries: RegistryEntry[] = [];
    for (const raw of plugins) {
        const result = validateEntry(raw);
        if ("error" in result) {
            problems.push(result.error);
        } else if (seen.has(result.entry.id)) {
            problems.push(`${result.entry.id}: listed twice, kept the first`);
        } else {
            seen.add(result.entry.id);
            entries.push(result.entry);
        }
    }
    return { registry: { schema: REGISTRY_SCHEMA, plugins: entries }, problems };
}

/**
 * Checks a downloaded manifest against its registry entry: same id, the standard file names, and
 * nothing that runs outside the renderer unless the entry says so (and the user agreed to that).
 */
export function whyNotManifest(manifest: unknown, entry: RegistryEntry): string | undefined {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return "manifest.json isn't a JSON object";
    const m = manifest as PluginManifest;
    if (m.id !== entry.id) return `manifest.json is for "${String(m.id)}", not "${entry.id}"`;
    if (!text(m.name, 80)) return "manifest.json has no name";
    if (m.main !== undefined && m.main !== "index.js") return "manifest.json must use index.js as its main file";
    if (m.native !== undefined && m.native !== "native.js") return "manifest.json must use native.js as its native file";
    if (m.native && !entry.files["native.js"]) return "manifest.json wants native.js but the registry doesn't list it";
    if (!m.native && entry.files["native.js"]) return "the registry lists native.js but manifest.json doesn't use it";
    const runsOutsideRenderer = !!m.native || (m.chromiumSwitches !== undefined && Object.keys(m.chromiumSwitches).length > 0);
    if (runsOutsideRenderer && !entry.native) return "the plugin runs outside Discord's page but the registry doesn't mark it native";
}

// ---- hashes -----------------------------------------------------------------------------------

export async function sha256Hex(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves with an error message when the bytes don't hash to what the registry promised */
export async function whyNotHash(name: string, data: Uint8Array, expected: string): Promise<string | undefined> {
    const actual = await sha256Hex(data);
    if (actual !== expected.toLowerCase()) return `${name} doesn't match the registry (sha256 ${actual.slice(0, 12)}…, expected ${expected.slice(0, 12)}…). Nothing was installed.`;
}

/** What the Store tab should offer for an entry */
export function storeAction(entry: RegistryEntry, installed: InstalledPlugin | undefined, eviVersion: string):
    "install" | "update" | "installed" | "local" | "incompatible" {
    if (installed && !installed.fromStore) return "local";
    if (entry.minEviVersion && compareVersions(eviVersion, entry.minEviVersion) < 0) return installed ? "installed" : "incompatible";
    if (!installed) return "install";
    return compareVersions(entry.version, installed.version ?? "0") > 0 ? "update" : "installed";
}
