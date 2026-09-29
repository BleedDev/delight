/**
 *   bun scripts/build.ts            build core + plugins into dist/
 *   bun scripts/build.ts --watch    rebuild on change; running Discord hot-reloads plugins, Ctrl+R picks up core
 *   bun scripts/build.ts --cli      also compile the installer into dist/evi.exe
 *   bun scripts/build.ts --release  compile the installer for every system a release carries, each with its .sha256,
 *                                   plus evi-core.json (the core and official plugins Evi Setup downloads)
 *   bun scripts/build.ts --installer  compile Evi Setup, the small window installer in installer/ (Rust + Tauri), into
 *                                   dist/Evi-Setup.exe. On its own it only does that and leaves core and plugins alone
 */
import type { BunPlugin } from "bun";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

import pkg from "../package.json";
import type { PluginManifest } from "../src/shared/ipc";
import { RELEASE_ASSETS } from "../src/shared/release";
import { signAsset, SIGNATURE_SUFFIX } from "../src/shared/releaseSignature";
import { RETIRED_PLUGINS } from "../src/shared/store";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const CORE_OUT = join(DIST, "core");
const PLUGINS_OUT = join(DIST, "plugins");
/** Plugins only the tests load (Toolkit Demo exercises the toolkit): never shipped, never in the store */
const TEST_PLUGINS_OUT = join(DIST, "test-plugins");
const TEST_PLUGIN_ROOT = join(ROOT, "tests", "fixtures", "plugins");
const PLUGIN_ROOTS = [join(ROOT, "plugins"), join(ROOT, "userplugins")];

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const RELEASE = args.has("--release");
const CLI = args.has("--cli") || RELEASE;
const INSTALLER = args.has("--installer");
const INSTALLER_ONLY = INSTALLER && !CLI && !WATCH;

/** Release assets next to the CLI's: what Evi Setup downloads, and Evi Setup itself */
const CORE_ASSET = "evi-core.json";
const INSTALLER_ASSET = process.platform === "win32" ? "Evi-Setup.exe" : `Evi-Setup-${process.platform === "darwin" ? "macos" : "linux"}-${process.arch}`;

/** Bun cross-compiles, so every installer builds from any machine */
const TARGETS: Record<typeof RELEASE_ASSETS[number], string> = {
    "evi.exe": "bun-windows-x64",
    "evi-macos-arm64": "bun-darwin-arm64",
    "evi-macos-x64": "bun-darwin-x64",
    "evi-linux-x64": "bun-linux-x64",
    "evi-linux-arm64": "bun-linux-arm64",
};

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

async function buildPlugin(dir: string, outRoot = PLUGINS_OUT) {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) return;

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.id ??= basename(dir);
    const out = join(outRoot, manifest.id);

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

/**
 * Bun's cross-compiled macOS binaries carry a signature that doesn't match their contents, and Apple
 * Silicon kills those on launch. rcodesign (github.com/indygreg/apple-platform-rs) re-signs them ad hoc
 * from any system, like `codesign -s -` would on a Mac.
 */
function adhocSign(file: string) {
    const rcodesign = process.env.RCODESIGN || Bun.which("rcodesign");
    if (!rcodesign) {
        console.error("✗ rcodesign isn't installed, and the macOS installers need re-signing. Get it from https://github.com/indygreg/apple-platform-rs/releases or set RCODESIGN.");
        process.exit(1);
    }
    const sign = Bun.spawnSync([rcodesign, "sign", "--binary-identifier", "rest.evi.installer", file], { stderr: "pipe" });
    const problem = sign.exitCode === 0 ? signatureProblem(readFileSync(file)) : sign.stderr.toString();
    if (problem) {
        console.error(`✗ Signing ${basename(file)} failed: ${problem}`);
        process.exit(1);
    }
}

/**
 * What macOS checks before running a binary: the code directory covers the whole file up to the
 * signature, and every page hashes to what it records. (rcodesign's own verify trips over ad hoc signatures.)
 */
function signatureProblem(bin: Buffer): string | undefined {
    if (bin.readUInt32LE(0) !== 0xfeedfacf) return "not a 64-bit Mach-O";
    let sigOffset = -1;
    for (let i = 0, off = 32; i < bin.readUInt32LE(16); i++, off += bin.readUInt32LE(off + 4)) {
        if (bin.readUInt32LE(off) === 0x1d) sigOffset = bin.readUInt32LE(off + 8);
    }
    if (sigOffset < 0) return "no signature";
    for (let i = 0; i < bin.readUInt32BE(sigOffset + 8); i++) {
        const cd = sigOffset + bin.readUInt32BE(sigOffset + 16 + i * 8);
        if (bin.readUInt32BE(cd) !== 0xfade0c02) continue;
        const hashOffset = bin.readUInt32BE(cd + 16), pages = bin.readUInt32BE(cd + 28), codeLimit = bin.readUInt32BE(cd + 32);
        const hashSize = bin[cd + 36], hashType = bin[cd + 37], pageSize = 2 ** bin[cd + 39];
        if (codeLimit !== sigOffset) return `signs ${codeLimit} bytes of ${sigOffset}`;
        const algorithm = hashType === 2 ? "sha256" : hashType === 1 ? "sha1" : undefined;
        if (!algorithm) return `unknown hash type ${hashType}`;
        for (let p = 0; p < pages; p++) {
            const actual = new Bun.CryptoHasher(algorithm).update(bin.subarray(p * pageSize, Math.min((p + 1) * pageSize, codeLimit))).digest();
            if (!actual.subarray(0, hashSize).equals(bin.subarray(cd + hashOffset + p * hashSize, cd + hashOffset + (p + 1) * hashSize))) return `page ${p} doesn't match its hash`;
        }
    }
}

/** The installer for this machine, or with --release for every system at once */
async function compileCli() {
    writeEmbed();
    const builds = RELEASE ? RELEASE_ASSETS.map(asset => ({ asset, target: [`--target=${TARGETS[asset]}`] })) : [{ asset: "evi.exe", target: [] }];
    const codes = await Promise.all(builds.map(({ asset, target }) =>
        Bun.spawn(["bun", "build", "--compile", "--minify", ...target, join(ROOT, "src/cli/index.ts"), "--outfile", join(DIST, asset)], {
            stdio: ["inherit", "inherit", "inherit"],
        }).exited));
    const failed = codes.find(code => code !== 0);
    if (failed !== undefined) process.exit(failed);
    for (const { asset } of builds) {
        if (RELEASE) {
            if (asset.startsWith("evi-macos-")) adhocSign(join(DIST, asset));
            writeChecksum(asset);
        }
        console.log(`✓ dist/${asset}`);
    }
}

/**
 * The release key (shared/releaseSignature.ts): the EVI_RELEASE_KEY secret in CI, or the .pem file
 * EVI_RELEASE_KEY_FILE names for a local release build. A release never goes out unsigned.
 */
function releaseKey() {
    const pem = process.env.EVI_RELEASE_KEY || (process.env.EVI_RELEASE_KEY_FILE && readFileSync(process.env.EVI_RELEASE_KEY_FILE, "utf8"));
    if (!pem) {
        console.error("✗ A release build needs the signing key: set EVI_RELEASE_KEY, or EVI_RELEASE_KEY_FILE to its .pem");
        process.exit(1);
    }
    return pem;
}

/** Its .sha256, and on a release build its .sig */
function writeChecksum(asset: string) {
    const bytes = readFileSync(join(DIST, asset));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    writeFileSync(join(DIST, `${asset}.sha256`), `${hash}  ${asset}\n`);
    if (RELEASE) writeFileSync(join(DIST, `${asset}${SIGNATURE_SUFFIX}`), `${signAsset(releaseKey(), `v${pkg.version}`, asset, bytes)}\n`);
}

/** What Evi Setup installs: the same as dist/embed.json, plus the plugins it should delete as retired */
function writeCoreAsset() {
    const embed = JSON.parse(readFileSync(join(DIST, "embed.json"), "utf8"));
    writeFileSync(join(DIST, CORE_ASSET), JSON.stringify({ ...embed, retired: RETIRED_PLUGINS }));
    writeChecksum(CORE_ASSET);
    console.log(`✓ dist/${CORE_ASSET}`);
}

/** Evi Setup (installer/): a Rust + Tauri app, built with cargo for this system */
async function compileInstaller() {
    const cargo = Bun.which("cargo");
    if (!cargo) {
        console.error("✗ Evi Setup needs Rust: install it from https://rustup.rs");
        process.exit(1);
    }
    const dir = join(ROOT, "installer");
    const code = await Bun.spawn([cargo, "build", "--release", "--locked"], { cwd: dir, stdio: ["inherit", "inherit", "inherit"] }).exited;
    if (code !== 0) process.exit(code);
    copyFileSync(join(dir, "target", "release", process.platform === "win32" ? "evi-setup.exe" : "evi-setup"), join(DIST, INSTALLER_ASSET));
    if (RELEASE) writeChecksum(INSTALLER_ASSET);
    console.log(`✓ dist/${INSTALLER_ASSET} (${(statSync(join(DIST, INSTALLER_ASSET)).size / 1024 / 1024).toFixed(1)} MB)`);
}

function debounce(fn: () => void, ms = 100) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

if (INSTALLER_ONLY) {
    mkdirSync(DIST, { recursive: true });
    await compileInstaller();
    process.exit(0);
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
await Promise.all(pluginDirs().map(dir => buildPlugin(dir)));
if (existsSync(TEST_PLUGIN_ROOT)) {
    await Promise.all(readdirSync(TEST_PLUGIN_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => buildPlugin(join(TEST_PLUGIN_ROOT, e.name), TEST_PLUGINS_OUT)));
}
writeEmbed();
if (CLI) await compileCli();
if (RELEASE) writeCoreAsset();
if (INSTALLER) await compileInstaller();

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
