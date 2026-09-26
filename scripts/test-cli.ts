/**
 * Runs the installer against a fake %LOCALAPPDATA% / %APPDATA%, never your real Discord.
 *
 *   bun scripts/test-cli.ts          test the source CLI
 *   bun scripts/test-cli.ts --exe    test the compiled dist/delight.exe
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { createAsar, readAsarFile } from "../src/shared/asar";
import { ORIGINAL_ASAR, SHIM_MARKER } from "../src/shared/shim";

const ROOT = resolve(import.meta.dir, "..");
const BASE = join(ROOT, "test-results", "cli");
const LOCAL = join(BASE, "local");
const ROAMING = join(BASE, "roaming");
const RESOURCES = join(LOCAL, "Discord", "app-1.0.9259", "resources");
const EXE = process.argv.includes("--exe");

rmSync(BASE, { recursive: true, force: true });
mkdirSync(RESOURCES, { recursive: true });
mkdirSync(ROAMING, { recursive: true });

const discordAsar = createAsar({
    "package.json": JSON.stringify({ name: "discord", productName: "Discord", main: "app_bootstrap/index.js" }),
    "app_bootstrap/index.js": "// discord",
});
writeFileSync(join(RESOURCES, "app.asar"), discordAsar);

function cli(...args: string[]) {
    const cmd = EXE ? [join(ROOT, "dist", "delight.exe"), ...args] : ["bun", join(ROOT, "src", "cli", "index.ts"), ...args];
    const proc = Bun.spawnSync(cmd, { env: { ...process.env, LOCALAPPDATA: LOCAL, APPDATA: ROAMING, NO_COLOR: "1" } });
    return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
}

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
    if (!ok) failed++;
    console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${name}\x1b[0m${!ok && detail !== undefined ? `\n  ${String(detail).trim()}` : ""}`);
}

const asar = join(RESOURCES, "app.asar");
const original = join(RESOURCES, ORIGINAL_ASAR);
const shim = () => readAsarFile(asar, "index.js");

let r = cli("status");
check("status sees the clean install", r.out.includes("not installed"), r.out);

if (!EXE) {
    r = cli("install", "--dev");
    check("install --dev succeeds", r.code === 0 && r.out.includes("Installed"), r.out);
    check("Discord's archive moved to _app.asar untouched", readFileSync(original).equals(discordAsar));
    check("app.asar is our loader pointing at the repo build", shim().startsWith(SHIM_MARKER) && shim().includes(JSON.stringify(join(ROOT, "dist", "core", "main.js"))), shim());
    check("loader keeps Discord's app name", JSON.parse(readAsarFile(asar, "package.json")).name === "discord");
}

r = cli("install");
check("install (bundled core) succeeds", r.code === 0 && /Installed|Updated/.test(r.out), r.out);
const coreDir = join(ROAMING, "Delight", "core");
check("core written to the data folder", ["main.js", "preload.js", "renderer.js"].every(f => existsSync(join(coreDir, f))));
check("core marked as CommonJS", JSON.parse(readFileSync(join(coreDir, "package.json"), "utf8")).type === "commonjs");
check("official plugins installed", ["clear-urls", "experiments", "no-track"].every(id => existsSync(join(ROAMING, "Delight", "plugins", id, "manifest.json"))));
check("loader points at the installed core", shim().includes(JSON.stringify(join(coreDir, "main.js"))) && !shim().includes("DELIGHT_DEV_PLUGINS"), shim());
check("Discord's archive still intact after reinstall", readFileSync(original).equals(discordAsar));

r = cli("status");
check("status reports installed", r.out.includes("installed") && !r.out.includes("not installed"), r.out);

r = cli("uninstall");
check("uninstall succeeds", r.code === 0 && r.out.includes("Removed"), r.out);
check("original app.asar restored byte for byte", readFileSync(asar).equals(discordAsar) && !existsSync(original));

// Another mod's layout: _app.asar exists and app.asar isn't ours
writeFileSync(original, discordAsar);
writeFileSync(asar, createAsar({ "index.js": "// vencord", "package.json": "{}" }));
r = cli("install");
check("refuses to install over another client mod", r.out.includes("another client mod"), r.out);
check("other mod's files left alone", readAsarFile(asar, "index.js") === "// vencord");

process.exit(failed ? 1 : 0);
