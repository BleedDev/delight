/**
 * Generates the plugin store registry from built plugins, so publishing is reproducible: the same
 * build always gives the same files, hashes and registry.json.
 *
 *   bun run build
 *   bun scripts/registry.ts [--base <url>] [--files <dir>] [--out <file>] [--only id,id]
 *
 *   --base   where the published files will be served from, https only. Each plugin's files go to
 *            <base>/<id>/<file>. Default: raw.githubusercontent.com of this repo's main branch + /store/plugins
 *   --files  folder the plugin files are copied into, ready to commit or upload. Default: store/plugins
 *   --out    registry to write. Default: registry.json
 *   --only   comma-separated plugin ids. Default: every official plugin (plugins/, not userplugins/)
 *
 * Commit (or upload) the files folder and the registry together: the registry's hashes only match
 * the files copied by the same run.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";

import pkg from "../package.json";
import type { PluginManifest } from "../src/shared/ipc";
import { parseRegistry, REGISTRY_SCHEMA, RegistryEntry, sha256Hex, STORE_FILES, whyNotManifest, whyNotStoreUrl } from "../src/shared/store";

const ROOT = resolve(import.meta.dir, "..");
const BUILT = join(ROOT, "dist", "plugins");

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        base: { type: "string", default: "https://raw.githubusercontent.com/BleedDev/delight/main/store/plugins" },
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
const entries: RegistryEntry[] = [];

for (const id of ids) {
    const dir = join(BUILT, id);
    if (!existsSync(join(dir, "manifest.json"))) fail(`${id} isn't built (no dist/plugins/${id}/manifest.json)`);
    const manifest: PluginManifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

    const files: Record<string, { url: string; sha256: string; }> = {};
    for (const name of STORE_FILES) {
        const path = join(dir, name);
        if (!existsSync(path)) continue;
        files[name] = { url: `${base}/${id}/${name}`, sha256: await sha256Hex(readFileSync(path)) };
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
        minDelightVersion: manifest.minDelightVersion ?? pkg.version,
        files,
    };
    const badManifest = whyNotManifest(manifest, entry as RegistryEntry);
    if (badManifest) fail(`${id}: ${badManifest}`);
    entries.push(entry as RegistryEntry);

    // A clean copy, so files from an older build of this plugin don't linger
    rmSync(join(filesDir, id), { recursive: true, force: true });
    mkdirSync(join(filesDir, id), { recursive: true });
    for (const name of Object.keys(files)) cpSync(join(dir, name), join(filesDir, id, name));
}

const registry = { schema: REGISTRY_SCHEMA, plugins: entries };
// The app's own validation is the final word on what we publish
const check = parseRegistry(registry);
if ("error" in check) fail(check.error);
if (check.problems.length) fail(check.problems.join("\n  "));

writeFileSync(resolve(values.out!), JSON.stringify(registry, null, 4) + "\n");
console.log(`✓ ${resolve(values.out!)}: ${entries.length} plugins (${entries.map(e => `${e.id}@${e.version}`).join(", ")})`);
console.log(`✓ files in ${filesDir}, to be served from ${base}/<id>/<file>`);
