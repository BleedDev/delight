/**
 * Generates the store registry from built plugins and the repo's themes/ folder, so publishing is
 * reproducible: the same build always gives the same files, hashes and registry.json.
 *
 *   bun run build
 *   bun scripts/registry.ts [--base <url>] [--files <dir>] [--out <file>] [--only id,id]
 *
 *   --base   where the published files will be served from, https only. Each plugin's files go to
 *            <base>/<id>/<file>, themes to <base>/../themes/<id>.css.
 *            Default: https://evi.rest/store/plugins
 *   --files  folder the plugin files are copied into, ready to commit or upload. Themes go next to it
 *            in ../themes. Default: store/plugins
 *   --out    registry to write. Default: registry.json
 *   --only   comma-separated plugin ids. Default: every official plugin (plugins/, not userplugins/)
 *
 * Themes are themes/<id>.css with a BetterDiscord-style header (@name, @description, @author,
 * @version, @tags a, b). Changelogs, screenshots and source links come from plugin manifests;
 * updatedAt is kept from the previous registry while a version doesn't change, and set to today when
 * it does.
 *
 * Commit (or upload) the files folder and the registry together: the registry's hashes only match
 * the files copied by the same run.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { parseArgs } from "util";

import pkg from "../package.json";
import type { PluginManifest } from "../src/shared/ipc";
import { parseRegistry, REGISTRY_SCHEMA, RegistryEntry, sha256Hex, STORE_FILES, storeThemeFile, ThemeEntry, whyNotManifest, whyNotStoreUrl } from "../src/shared/store";
import { parseThemeMeta, whyNotCss } from "../src/shared/themes";

const ROOT = resolve(import.meta.dir, "..");
const BUILT = join(ROOT, "dist", "plugins");

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        base: { type: "string", default: "https://evi.rest/store/plugins" },
        files: { type: "string", default: join(ROOT, "store", "plugins") },
        out: { type: "string", default: join(ROOT, "registry.json") },
        only: { type: "string" },
    },
});

function fail(message: string): never {
    console.error(`✗ ${message}`);
    process.exit(1);
}

const base = values.base!.replace(/\/+$/, "");
const badBase = whyNotStoreUrl(base);
if (badBase) fail(`--base ${base}: ${badBase}`);
if (!existsSync(BUILT)) fail("dist/plugins is missing, run `bun run build` first");

const official = new Set(readdirSync(join(ROOT, "plugins"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name));
const ids = values.only ? values.only.split(",").map(s => s.trim()).filter(Boolean) : readdirSync(BUILT).filter(id => official.has(id)).sort();

const filesDir = resolve(values.files!);
const themesBase = base.replace(/\/[^/]+$/, "/themes");
const themesDir = join(dirname(filesDir), "themes");
const SOURCE = "https://github.com/BleedDev/evi/tree/main";
const today = new Date().toISOString().slice(0, 10);

/**
 * Each version of a file gets its own address: a CDN in front of the store (Cloudflare) caches files
 * for hours, and would otherwise keep serving the old version under the new hash, failing installs.
 * The server ignores the query.
 */
const versioned = (url: string, sha256: string) => `${url}?v=${sha256.slice(0, 12)}`;

// Publish dates survive a rebuild: only a new version gets a new date
const previous = new Map<string, { version: string; updatedAt?: string; }>();
try {
    const old = JSON.parse(readFileSync(resolve(values.out!), "utf8"));
    for (const e of old.plugins ?? []) previous.set(`plugin:${e.id}`, e);
    for (const e of old.themes ?? []) previous.set(`theme:${e.id}`, e);
} catch { }
const dateFor = (key: string, version: string) => {
    const old = previous.get(key);
    return old?.version === version && old.updatedAt ? old.updatedAt : today;
};

const entries: RegistryEntry[] = [];

for (const id of ids) {
    const dir = join(BUILT, id);
    if (!existsSync(join(dir, "manifest.json"))) fail(`${id} isn't built (no dist/plugins/${id}/manifest.json)`);
    const manifest: PluginManifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

    const files: Record<string, { url: string; sha256: string; }> = {};
    for (const name of STORE_FILES) {
        const path = join(dir, name);
        if (!existsSync(path)) continue;
        const sha256 = await sha256Hex(readFileSync(path));
        files[name] = { url: versioned(`${base}/${id}/${name}`, sha256), sha256 };
    }

    const entry = {
        id,
        name: manifest.name,
        description: manifest.description ?? "",
        authors: manifest.authors?.length ? manifest.authors : ["Unknown"],
        version: manifest.version ?? "0.0.0",
        tags: manifest.tags ?? [],
        // Anything that runs outside Discord's page needs the user's explicit trust
        native: !!manifest.native || Object.keys(manifest.chromiumSwitches ?? {}).length > 0,
        minEviVersion: manifest.minEviVersion ?? pkg.version,
        files,
        updatedAt: dateFor(`plugin:${id}`, manifest.version ?? "0.0.0"),
        source: manifest.source ?? (official.has(id) ? `${SOURCE}/plugins/${id}` : undefined),
        screenshots: manifest.screenshots ?? [],
        changelog: manifest.changelog ?? [],
    };
    const badManifest = whyNotManifest(manifest, entry as RegistryEntry);
    if (badManifest) fail(`${id}: ${badManifest}`);
    entries.push(entry as RegistryEntry);

    // A clean copy, so files from an older build of this plugin don't linger
    rmSync(join(filesDir, id), { recursive: true, force: true });
    mkdirSync(join(filesDir, id), { recursive: true });
    for (const name of Object.keys(files)) cpSync(join(dir, name), join(filesDir, id, name));
}

// ---- themes ---------------------------------------------------------------------------------------

const themeEntries: ThemeEntry[] = [];
const themesSrc = join(ROOT, "themes");
const themeFiles = values.only || !existsSync(themesSrc) ? [] : readdirSync(themesSrc).filter(f => f.endsWith(".css")).sort();
// --only publishes some plugins and leaves the themes as they were
if (!values.only) rmSync(themesDir, { recursive: true, force: true });
if (themeFiles.length) mkdirSync(themesDir, { recursive: true });

for (const name of themeFiles) {
    const id = name.replace(/\.css$/, "");
    const raw = readFileSync(join(themesSrc, name));
    const css = raw.toString("utf8");
    const bad = whyNotCss(css);
    if (bad) fail(`themes/${name}: ${bad}`);
    const meta = parseThemeMeta(css, name);
    const tags = css.match(/^\s*\/\*[\s\S]*?@tags[ \t]+(.+)/)?.[1].split(",").map(t => t.trim()).filter(Boolean) ?? [];
    const version = meta.version ?? "1.0.0";

    themeEntries.push({
        id,
        name: meta.name,
        description: meta.description ?? "",
        authors: meta.author ? meta.author.split(",").map(a => a.trim()) : ["Unknown"],
        version,
        tags,
        updatedAt: dateFor(`theme:${id}`, version),
        source: `${SOURCE}/themes/${name}`,
        screenshots: [],
        changelog: [],
        minEviVersion: pkg.version,
        file: { url: versioned(`${themesBase}/${storeThemeFile(id)}`, await sha256Hex(raw)), sha256: await sha256Hex(raw) },
    });
    cpSync(join(themesSrc, name), join(themesDir, storeThemeFile(id)));
}

const registry = { schema: REGISTRY_SCHEMA, plugins: entries, themes: themeEntries };
// The app's own validation is the final word on what we publish
const check = parseRegistry(registry);
if ("error" in check) fail(check.error);
if (check.problems.length) fail(check.problems.join("\n  "));

writeFileSync(resolve(values.out!), JSON.stringify(registry, null, 4) + "\n");
console.log(`✓ ${resolve(values.out!)}: ${entries.length} plugins (${entries.map(e => `${e.id}@${e.version}`).join(", ")}), ${themeEntries.length} themes`);
console.log(`✓ files in ${filesDir}, to be served from ${base}/<id>/<file>`);
