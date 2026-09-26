/**
 *   bun scripts/build.ts            build core + plugins into dist/
 *   bun scripts/build.ts --watch    rebuild on change; running Discord hot-reloads plugins, Ctrl+R picks up core
 *   bun scripts/build.ts --cli      also compile the installer into dist/evi.exe
 */
import type { BunPlugin } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

import pkg from "../package.json";
import type { PluginManifest } from "../src/shared/ipc";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const CORE_OUT = join(DIST, "core");
const PLUGINS_OUT = join(DIST, "plugins");
const PLUGIN_ROOTS = [join(ROOT, "plugins"), join(ROOT, "userplugins")];

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const CLI = args.has("--cli");

const define = {
    EVI_VERSION: JSON.stringify(pkg.version),
    "process.env.NODE_ENV": JSON.stringify(WATCH ? "development" : "production"),
};

/** Our own JSX goes through the shim that forwards to Discord's React */
const jsxShim: BunPlugin = {
    name: "evi-jsx-shim",
    setup(build) {
        build.onResolve({ filter: /^react\/jsx-(dev-)?runtime$/ }, () => ({
            path: join(ROOT, "src/renderer/react/jsx-runtime.ts"),
        }));
    },
};

async function bundle(label: string, config: Parameters<typeof Bun.build>[0]) {
    const result = await Bun.build({ define, minify: false, ...config });
    if (!result.success) {
        console.error(`✗ ${label}`);
        for (const log of result.logs) console.error(log);
        if (!WATCH) process.exit(1);
        return false;
    }
    return true;
}

async function buildCore() {
    const start = performance.now();
    const results = await Promise.all([
        bundle("main", {
            entrypoints: [join(ROOT, "src/main/index.ts")],
            outdir: CORE_OUT,
            naming: "main.js",
            target: "node",
            format: "cjs",
            external: ["electron", "original-fs"],
        }),
        bundle("preload", {
            entrypoints: [join(ROOT, "src/preload/index.ts")],
            outdir: CORE_OUT,
            naming: "preload.js",
            target: "node",
            format: "cjs",
            external: ["electron"],
        }),
        bundle("renderer", {
            entrypoints: [join(ROOT, "src/renderer/index.ts")],
            outdir: CORE_OUT,
            naming: "renderer.js",
            target: "browser",
            format: "iife",
            plugins: [jsxShim],
            sourcemap: WATCH ? "inline" : "none",
        }),
    ]);
    if (results.every(Boolean)) console.log(`✓ core (${Math.round(performance.now() - start)}ms)`);
}

function findEntry(dir: string, name: string) {
    return ["ts", "tsx", "js", "jsx"].map(ext => join(dir, `${name}.${ext}`)).find(existsSync);
}

async function buildPlugin(dir: string) {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) return;

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.id ??= basename(dir);
    const out = join(PLUGINS_OUT, manifest.id);

    const entry = findEntry(dir, "index");
    if (!entry) return console.error(`✗ ${manifest.id}: no index.ts`);

    const ok = await bundle(manifest.id, {
        entrypoints: [entry],
        outdir: out,
        naming: "index.js",
        target: "browser",
        format: "cjs",
        // Provided at runtime by Evi, see requireMap in src/renderer/plugins/manager.ts
        external: ["@evi/api", "react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
        sourcemap: WATCH ? "inline" : "none",
    });
    if (!ok) return;

    const nativeEntry = findEntry(dir, "native");
    if (nativeEntry) {
        const nativeOk = await bundle(`${manifest.id} native`, {
            entrypoints: [nativeEntry],
            outdir: out,
            naming: "native.js",
            target: "node",
            format: "cjs",
            external: ["electron"],
        });
        if (!nativeOk) return;
        manifest.native = "native.js";
    }

    manifest.main = "index.js";
    // Manifest last: the running client reloads once it changes
    writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 4));
    console.log(`✓ plugin ${manifest.id}`);
}

function pluginDirs() {
    return PLUGIN_ROOTS.filter(existsSync).flatMap(root =>
        readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(root, e.name)),
    );
}

/** Everything the compiled installer needs to lay down, as one JSON blob */
function writeEmbed() {
    const read = (dir: string) => Object.fromEntries(readdirSync(dir).map(f => [f, readFileSync(join(dir, f), "utf8")]));
    const embed = {
        version: pkg.version,
        core: read(CORE_OUT),
        plugins: Object.fromEntries(readdirSync(PLUGINS_OUT).map(id => [id, read(join(PLUGINS_OUT, id))])),
    };
    writeFileSync(join(DIST, "embed.json"), JSON.stringify(embed));
}

async function compileCli() {
    writeEmbed();
    const proc = Bun.spawnSync(["bun", "build", "--compile", "--minify", join(ROOT, "src/cli/index.ts"), "--outfile", join(DIST, "evi.exe")], {
        stdio: ["inherit", "inherit", "inherit"],
    });
    if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);
    console.log("✓ dist/evi.exe");
}

function debounce(fn: () => void, ms = 100) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

// Overwrite in place rather than wiping dist/: a running Discord watches it, and a wipe would
// briefly uninstall every plugin. Only drop plugin outputs whose source folder is gone.
mkdirSync(PLUGINS_OUT, { recursive: true });
const sourceIds = new Set(pluginDirs().map(dir => basename(dir)));
for (const id of readdirSync(PLUGINS_OUT)) {
    if (!sourceIds.has(id)) rmSync(join(PLUGINS_OUT, id), { recursive: true, force: true });
}
// The repo is "type": "module", but Electron has to load our output as CommonJS
writeFileSync(join(DIST, "package.json"), JSON.stringify({ type: "commonjs" }));

await buildCore();
await Promise.all(pluginDirs().map(buildPlugin));
writeEmbed();
if (CLI) await compileCli();

if (WATCH) {
    watch(join(ROOT, "src"), { recursive: true }, debounce(buildCore));
    for (const root of PLUGIN_ROOTS.filter(existsSync)) {
        const pending = new Map<string, () => void>();
        watch(root, { recursive: true }, (_event, filename) => {
            if (!filename) return;
            const folder = filename.split(/[\\/]/)[0];
            if (!pending.has(folder)) pending.set(folder, debounce(() => buildPlugin(join(root, folder))));
            pending.get(folder)!();
        });
    }
    console.log("Watching for changes…");
}
