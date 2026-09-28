/**
 * The plugin store's registry format and the checks shared by main, the renderer, the publishing
 * script and the tests. Nothing here touches the network or the disk.
 *
 *   {
 *     "schema": 1,
 *     "plugins": [{
 *       "id": "no-track", "name": "No Track", "description": "…", "authors": ["Evi"], "authorIds": ["evi"],
 *       "version": "1.0.0", "tags": ["privacy"], "native": true, "minEviVersion": "0.1.0",
 *       "files": {
 *         "manifest.json": { "url": "https://…/manifest.json", "sha256": "<64 hex>" },
 *         "index.js":      { "url": "https://…/index.js",      "sha256": "…" },
 *         "native.js":     { "url": "https://…/native.js",     "sha256": "…" }
 *       },
 *       "updatedAt": "2026-09-26", "source": "https://github.com/…",
 *       "screenshots": ["https://…/shot.png"],
 *       "changelog": [{ "version": "1.0.0", "notes": ["First release"] }],
 *       "permissions": { "network": [], "readMessages": false, "sendMessages": false, "changeSettings": false },
 *       "preview": "https://…/demo.mp4", "supporters": false,
 *       "beta": { "version": "1.1.0-beta.1", "native": false, "files": { … }, "changelog": [ … ] }
 *     }],
 *     "themes": [{
 *       "id": "midnight", "name": "Midnight", "description": "…", "authors": ["Evi"], "version": "1.0.0",
 *       "file": { "url": "https://…/midnight.css", "sha256": "…" }
 *     }]
 *   }
 *
 * Everything after `files` is optional and `themes` may be missing: older registries stay valid,
 * and older Evi versions ignore what they don't know.
 */
import { DeclaredPermissions, readPermissions, samePermissions, whyNotPermissions } from "./declaredPermissions";
import type { PluginManifest } from "./ipc";

export const REGISTRY_SCHEMA = 1;
export const DEFAULT_REGISTRY_URL = "https://evi.rest/registry.json";

export const MAX_REGISTRY_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PLUGINS = 2000;
export const MAX_THEMES = 2000;
export const MAX_SCREENSHOTS = 6;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Marks a plugin folder as installed by the store, only those can be updated or uninstalled from it */
export const STORE_MARKER = ".evi-store.json";

/**
 * Plugins the user removed, as a JSON array of ids in the data folder. Evi ships its official plugins
 * and puts them back on every install and update; this is how a removed one stays removed. Installing
 * it from the store again takes it off the list.
 */
export const REMOVED_PLUGINS_FILE = "removed-plugins.json";

/**
 * Official plugins that are gone: part of Evi itself now (badges), never meant for people (Toolkit
 * Demo, a toolkit example the tests still use), or dropped (Quick Actions, in 1.0.0). Old copies on
 * disk are deleted, never loaded.
 */
export const RETIRED_PLUGINS: readonly string[] = ["badges", "toolkit-demo", "quick-actions"];

export function parseRemovedPlugins(text: string): Set<string> {
    try {
        const list = JSON.parse(text);
        return new Set(Array.isArray(list) ? list.filter(isPluginId) : []);
    } catch {
        return new Set();
    }
}

export const STORE_FILES = ["manifest.json", "index.js", "native.js"] as const;
export type StoreFileName = (typeof STORE_FILES)[number];

export interface StoreFile {
    url: string;
    sha256: string;
}

export interface ChangelogEntry {
    version: string;
    notes: string[];
}

/** What plugin and theme entries share: everything the store shows about an item */
export interface ListingInfo {
    id: string;
    name: string;
    description: string;
    authors: string[];
    /** The authors' profiles on evi.rest, by slug (evi.rest/author?u=<slug>), in the order of `authors` */
    authorIds?: string[];
    version: string;
    tags: string[];
    /** YYYY-MM-DD, when this version was published */
    updatedAt?: string;
    /** https link to the source code */
    source?: string;
    /** https image URLs, shown on the detail page */
    screenshots: string[];
    /** https link to a short video or GIF of it in use (mp4, webm, gif or webp), played on its page */
    preview?: string;
    /** Only for people supporting Evi: the store shows it to everyone, and supporters can install it */
    supporters?: boolean;
    /** Newest first */
    changelog: ChangelogEntry[];
}

export interface RegistryEntry extends ListingInfo {
    /** Runs code in Discord's main process (native.js) or changes how Discord starts (chromiumSwitches) */
    native: boolean;
    minEviVersion?: string;
    files: Partial<Record<StoreFileName, StoreFile>> & Record<"manifest.json" | "index.js", StoreFile>;
    /**
     * What its manifest declares it needs (shared/declaredPermissions.ts), so the store can show it
     * before anything is downloaded. Missing: it doesn't declare, and isn't held to anything.
     */
    permissions?: DeclaredPermissions;
    /**
     * A newer version the author is trying out: only installs that opted into this plugin's betas get
     * it (betaOf). Gone once a stable version catches up with it.
     */
    beta?: BetaRelease;
}

/** A plugin's beta: everything that differs between versions, the rest is the entry's */
export interface BetaRelease {
    version: string;
    native: boolean;
    minEviVersion?: string;
    files: RegistryEntry["files"];
    permissions?: DeclaredPermissions;
    /** YYYY-MM-DD */
    updatedAt?: string;
    /** This version's notes, newest first */
    changelog: ChangelogEntry[];
}

/**
 * The entry as its beta, when there is one newer than the stable version: what an install that opted
 * into betas installs and is held to
 */
export function betaOf(entry: RegistryEntry): RegistryEntry | undefined {
    const beta = entry.beta;
    if (!beta || compareVersions(beta.version, entry.version) <= 0) return;
    const { beta: _, ...stable } = entry;
    return {
        ...stable,
        version: beta.version,
        native: beta.native,
        minEviVersion: beta.minEviVersion,
        files: beta.files,
        permissions: beta.permissions,
        ...(beta.updatedAt && { updatedAt: beta.updatedAt }),
        changelog: [...beta.changelog, ...stable.changelog.filter(c => !beta.changelog.some(b => b.version === c.version))],
    };
}

/** Kinds of file a store preview can be, by extension */
export const PREVIEW_TYPES = { mp4: "video/mp4", webm: "video/webm", gif: "image/gif", webp: "image/webp" } as const;
export type PreviewType = typeof PREVIEW_TYPES[keyof typeof PREVIEW_TYPES];
export const MAX_PREVIEW_BYTES = 12 * 1024 * 1024;

/** A preview URL's kind of file, or undefined when it isn't one the store plays */
export function previewType(url: string): PreviewType | undefined {
    try {
        const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
        return ext && ext in PREVIEW_TYPES ? PREVIEW_TYPES[ext as keyof typeof PREVIEW_TYPES] : undefined;
    } catch {
        return undefined;
    }
}

export interface ThemeEntry extends ListingInfo {
    minEviVersion?: string;
    file: StoreFile;
}

export interface Registry {
    schema: typeof REGISTRY_SCHEMA;
    plugins: RegistryEntry[];
    themes: ThemeEntry[];
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

/** A theme the store put in the themes folder */
export interface InstalledTheme {
    id: string;
    version: string;
    /** File name inside the themes folder */
    file: string;
    fromStore: true;
}

export type StoreListing =
    | { ok: true; registryUrl: string; plugins: RegistryEntry[]; themes: ThemeEntry[]; problems: string[]; installed: InstalledPlugin[]; installedThemes: InstalledTheme[]; }
    | { ok: false; registryUrl: string; error: string; installed: InstalledPlugin[]; installedThemes: InstalledTheme[]; };

export type StoreImageResult = { ok: true; dataUrl: string; } | { ok: false; error: string; };

export type StoreResult = { ok: true; id: string; version: string; } | { ok: false; error: string; };

export interface StoreProgress {
    id: string;
    /** Missing from mains older than the theme store: those only ever report plugins */
    kind?: "plugin" | "theme";
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The fields plugins and themes share, cleaned, or the reason they're unusable. The optional extras
 * are checked as strictly as the rest: a registry can't slip a non-https image or link past us.
 */
function validateInfo(e: Record<string, unknown>): { info: ListingInfo; } | { error: string; } {
    const id = isPluginId(e.id) ? e.id : undefined;
    const fail = (why: string) => ({ error: `${id ?? JSON.stringify(e.id)?.slice(0, 40) ?? "entry"}: ${why}` });

    if (!id) return fail("id must be lowercase letters, digits and dashes");
    if (!text(e.name, 80)) return fail("name must be 1-80 characters");
    if (!text(e.description, 500, false)) return fail("description must be at most 500 characters");
    if (!strings(e.authors, 10, 80) || !e.authors.length) return fail("authors must list 1-10 names");
    if (e.authorIds !== undefined && (!Array.isArray(e.authorIds) || e.authorIds.length > 10 || !e.authorIds.every(isPluginId))) {
        return fail("authorIds must list at most 10 author slugs");
    }
    if (!isVersion(e.version)) return fail("version must look like 1.2.3");
    if (e.tags !== undefined && !strings(e.tags, 10, 32)) return fail("tags must be at most 10 short strings");
    if (e.updatedAt !== undefined && (typeof e.updatedAt !== "string" || !DATE_RE.test(e.updatedAt) || isNaN(Date.parse(e.updatedAt)))) {
        return fail("updatedAt must be a date like 2026-09-26");
    }
    if (e.source !== undefined) {
        const bad = whyNotStoreUrl(e.source);
        if (bad) return fail(`source: ${bad}`);
    }
    if (e.screenshots !== undefined) {
        if (!Array.isArray(e.screenshots) || e.screenshots.length > MAX_SCREENSHOTS) return fail(`screenshots must list at most ${MAX_SCREENSHOTS} links`);
        for (const url of e.screenshots) {
            const bad = whyNotStoreUrl(url);
            if (bad) return fail(`screenshots: ${bad}`);
        }
    }
    if (e.preview !== undefined) {
        const bad = whyNotStoreUrl(e.preview);
        if (bad) return fail(`preview: ${bad}`);
        if (!previewType(e.preview as string)) return fail("preview must be an .mp4, .webm, .gif or .webp link");
    }
    if (e.supporters !== undefined && typeof e.supporters !== "boolean") return fail("supporters must be true or false");
    const changelog = validateChangelog(e.changelog);
    if (typeof changelog === "string") return fail(changelog);

    return {
        info: {
            id,
            name: e.name,
            description: e.description,
            authors: [...e.authors],
            ...(e.authorIds !== undefined && { authorIds: [...(e.authorIds as string[])] }),
            version: e.version,
            tags: e.tags ? [...(e.tags as string[])] : [],
            ...(e.updatedAt !== undefined && { updatedAt: e.updatedAt as string }),
            ...(e.source !== undefined && { source: e.source as string }),
            screenshots: e.screenshots ? [...(e.screenshots as string[])] : [],
            ...(e.preview !== undefined && { preview: e.preview as string }),
            ...(e.supporters === true && { supporters: true }),
            changelog,
        },
    };
}

function validateChangelog(raw: unknown): ChangelogEntry[] | string {
    const changelog: ChangelogEntry[] = [];
    if (raw === undefined) return changelog;
    if (!Array.isArray(raw) || raw.length > 50) return "changelog must list at most 50 versions";
    for (const item of raw) {
        const { version, notes } = (item ?? {}) as Record<string, unknown>;
        if (!isVersion(version)) return "changelog versions must look like 1.2.3";
        if (!strings(notes, 30, 300)) return `changelog ${version}: notes must be at most 30 lines of 300 characters`;
        changelog.push({ version, notes: [...notes] });
    }
    return changelog;
}

/** A plugin's files: manifest.json and index.js, and native.js only when it's native, each https with its sha256 */
function validateFiles(files: unknown, native: boolean): RegistryEntry["files"] | string {
    if (!files || typeof files !== "object" || Array.isArray(files)) return "files is missing";
    const clean: Partial<Record<StoreFileName, StoreFile>> = {};
    for (const [name, file] of Object.entries(files)) {
        if (!(STORE_FILES as readonly string[]).includes(name)) return `unexpected file ${name}`;
        if (!file || typeof file !== "object") return `${name} is not an object`;
        const { url, sha256 } = file as Record<string, unknown>;
        const bad = whyNotStoreUrl(url);
        if (bad) return `${name}: ${bad}`;
        if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return `${name}: sha256 must be 64 lowercase hex digits`;
        clean[name as StoreFileName] = { url: url as string, sha256 };
    }
    if (!clean["manifest.json"] || !clean["index.js"]) return "files must include manifest.json and index.js";
    if (clean["native.js"] && !native) return "has native.js but isn't marked native";
    return clean as RegistryEntry["files"];
}

function validateBeta(raw: unknown): BetaRelease | string {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "beta must be an object";
    const b = raw as Record<string, unknown>;
    if (!isVersion(b.version)) return "beta version must look like 1.2.3";
    if (typeof b.native !== "boolean") return "beta native must be true or false";
    if (b.minEviVersion !== undefined && !isVersion(b.minEviVersion)) return "beta minEviVersion must look like 1.2.3";
    if (b.updatedAt !== undefined && (typeof b.updatedAt !== "string" || !DATE_RE.test(b.updatedAt))) return "beta updatedAt must be a date like 2026-09-26";
    const files = validateFiles(b.files, b.native);
    if (typeof files === "string") return `beta ${files}`;
    const badPermissions = b.permissions !== undefined && whyNotPermissions(b.permissions);
    if (badPermissions) return `beta ${badPermissions}`;
    const changelog = validateChangelog(b.changelog);
    if (typeof changelog === "string") return `beta ${changelog}`;
    return {
        version: b.version,
        native: b.native,
        ...(b.minEviVersion !== undefined && { minEviVersion: b.minEviVersion as string }),
        files,
        ...(b.permissions !== undefined && { permissions: readPermissions(b.permissions) }),
        ...(b.updatedAt !== undefined && { updatedAt: b.updatedAt as string }),
        changelog,
    };
}

/** Validates one entry, returning it cleaned of unknown keys, or the reason it's unusable */
export function validateEntry(raw: unknown): { entry: RegistryEntry; } | { error: string; } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "not an object" };
    const e = raw as Record<string, unknown>;
    const shared = validateInfo(e);
    if ("error" in shared) return shared;
    const { info } = shared;
    const fail = (why: string) => ({ error: `${info.id}: ${why}` });

    if (typeof e.native !== "boolean") return fail("native must be true or false");
    if (e.minEviVersion !== undefined && !isVersion(e.minEviVersion)) return fail("minEviVersion must look like 1.2.3");

    const cleanFiles = validateFiles(e.files, e.native);
    if (typeof cleanFiles === "string") return fail(cleanFiles);
    const badPermissions = e.permissions !== undefined && whyNotPermissions(e.permissions);
    if (badPermissions) return fail(badPermissions);
    // A broken beta only loses the beta: the stable version stays installable
    const beta = e.beta === undefined ? undefined : validateBeta(e.beta);

    return {
        entry: {
            ...info,
            native: e.native,
            ...(e.minEviVersion !== undefined && { minEviVersion: e.minEviVersion as string }),
            files: cleanFiles,
            ...(e.permissions !== undefined && { permissions: readPermissions(e.permissions) }),
            ...(beta && typeof beta !== "string" && { beta }),
        },
    };
}

/** Validates one theme entry: the shared fields plus a single .css file */
export function validateThemeEntry(raw: unknown): { entry: ThemeEntry; } | { error: string; } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "not an object" };
    const e = raw as Record<string, unknown>;
    const shared = validateInfo(e);
    if ("error" in shared) return shared;
    const { info } = shared;
    const fail = (why: string) => ({ error: `${info.id}: ${why}` });

    if (e.minEviVersion !== undefined && !isVersion(e.minEviVersion)) return fail("minEviVersion must look like 1.2.3");
    const file = e.file as Record<string, unknown> | undefined;
    if (!file || typeof file !== "object" || Array.isArray(file)) return fail("file is missing");
    const bad = whyNotStoreUrl(file.url);
    if (bad) return fail(`file: ${bad}`);
    if (typeof file.sha256 !== "string" || !SHA256_RE.test(file.sha256)) return fail("file: sha256 must be 64 lowercase hex digits");

    return {
        entry: {
            ...info,
            ...(e.minEviVersion !== undefined && { minEviVersion: e.minEviVersion as string }),
            file: { url: file.url as string, sha256: file.sha256 },
        },
    };
}

/**
 * Validates a registry document. A malformed document is rejected as a whole; individual bad or
 * duplicate entries are dropped and reported in `problems`, so one broken entry can't hide the rest.
 */
export function parseRegistry(json: unknown): { registry: Registry; problems: string[]; } | { error: string; } {
    if (!json || typeof json !== "object" || Array.isArray(json)) return { error: "The registry isn't a JSON object" };
    const { schema, plugins, themes = [] } = json as Record<string, unknown>;
    if (schema !== REGISTRY_SCHEMA) return { error: `Unsupported registry schema ${JSON.stringify(schema)}, this Evi reads schema ${REGISTRY_SCHEMA}` };
    if (!Array.isArray(plugins)) return { error: "The registry has no plugins list" };
    if (plugins.length > MAX_PLUGINS) return { error: `The registry lists more than ${MAX_PLUGINS} plugins` };
    if (!Array.isArray(themes)) return { error: "The registry's themes isn't a list" };
    if (themes.length > MAX_THEMES) return { error: `The registry lists more than ${MAX_THEMES} themes` };

    const problems: string[] = [];
    const collect = <T extends { id: string; }>(list: unknown[], validate: (raw: unknown) => { entry: T; } | { error: string; }, label = "") => {
        const seen = new Set<string>();
        const entries: T[] = [];
        for (const raw of list) {
            const result = validate(raw);
            if ("error" in result) {
                problems.push(label + result.error);
            } else if (seen.has(result.entry.id)) {
                problems.push(`${label}${result.entry.id}: listed twice, kept the first`);
            } else {
                seen.add(result.entry.id);
                entries.push(result.entry);
            }
        }
        return entries;
    };

    return {
        registry: {
            schema: REGISTRY_SCHEMA,
            plugins: collect(plugins, validateEntry),
            themes: collect(themes, validateThemeEntry, "theme "),
        },
        problems,
    };
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
    // What the store showed (and an update was agreed to) is what it's held to
    const badPermissions = m.permissions !== undefined && whyNotPermissions(m.permissions);
    if (badPermissions) return `manifest.json: ${badPermissions}`;
    if (!samePermissions(readPermissions(m.permissions), entry.permissions)) return "manifest.json's permissions don't match the registry's";
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

/**
 * Whether this Evi is new enough for something needing `min`. A beta counts as the version it leads
 * up to: 0.5.0-beta.1 runs plugins made for 0.5.0, which is what its testers are there to try.
 */
export const meetsMinEvi = (eviVersion: string, min: string | undefined) =>
    !min || compareVersions(eviVersion.replace(/-.*$/, ""), min) >= 0;

/** What the store should offer for an entry, plugin or theme */
export function storeAction(entry: { version: string; minEviVersion?: string; }, installed: { id?: string; version?: string; fromStore: boolean; } | undefined, eviVersion: string):
    "install" | "update" | "installed" | "local" | "incompatible" {
    if (installed && !installed.fromStore) return "local";
    if (!meetsMinEvi(eviVersion, entry.minEviVersion)) return installed ? "installed" : "incompatible";
    if (!installed) return "install";
    return compareVersions(entry.version, installed.version ?? "0") > 0 ? "update" : "installed";
}

/** Where the store keeps a theme inside the themes folder */
export const storeThemeFile = (id: string) => `${id}.css`;

export type ListingSort = "name" | "updated" | "stars" | "rating" | "trending";

/**
 * By name, newest first (undated last), or highest `score` first: stars, rating or how much it's
 * trending, whichever the sort is. Ties go by name.
 */
export function sortListings<T extends ListingInfo>(items: T[], by: ListingSort, score: (item: T) => number = () => 0) {
    const byName = (a: T, b: T) => a.name.localeCompare(b.name);
    if (by === "name") return [...items].sort(byName);
    if (by === "stars" || by === "rating" || by === "trending") return [...items].sort((a, b) => score(b) - score(a) || byName(a, b));
    return [...items].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || byName(a, b));
}
