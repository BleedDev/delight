import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { readAsarFile } from "../shared/asar";
import { Flavor, FLAVORS } from "../shared/release";
import { LEGACY_SHIM_MARKERS, ORIGINAL_ASAR, SHIM_MARKER } from "../shared/shim";

// Shared with the app's updater, which works out which Discord it runs in
export { FLAVORS };
export type { Flavor };

export type InjectionState = "clean" | "evi" | "other-mod";

export interface DiscordInstall {
    flavor: Flavor;
    root: string;
    /** app-x.y.z folders, newest first */
    versions: { version: string; resources: string; }[];
}

export function compareVersions(a: string, b: string) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff) return diff;
    }
    return 0;
}

export function findInstalls(): DiscordInstall[] {
    const localAppData = process.env.LOCALAPPDATA;
    if (process.platform !== "win32" || !localAppData) return [];

    const installs: DiscordInstall[] = [];
    for (const [flavor, folder] of Object.entries(FLAVORS) as [Flavor, string][]) {
        const root = join(localAppData, folder);
        if (!existsSync(root)) continue;

        const versions = readdirSync(root)
            .filter(d => /^app-\d/.test(d) && existsSync(join(root, d, "resources", "app.asar")))
            .map(d => ({ version: d.slice(4), resources: join(root, d, "resources") }))
            .sort((a, b) => compareVersions(b.version, a.version));

        if (versions.length) installs.push({ flavor, root, versions });
    }
    return installs;
}

export function isOurShim(asar: string) {
    try {
        if (!statSync(asar).isFile()) return false;
        const code = readAsarFile(asar, "index.js");
        return [SHIM_MARKER, ...LEGACY_SHIM_MARKERS].some(marker => code.startsWith(marker));
    } catch {
        return false;
    }
}

export function injectionState(resources: string): InjectionState {
    const asar = join(resources, "app.asar");
    if (isOurShim(asar)) return "evi";
    // Vencord, Equicord and friends use the same _app.asar swap, or an app folder
    if (existsSync(join(resources, ORIGINAL_ASAR)) || existsSync(join(resources, "app"))) return "other-mod";
    return "clean";
}

/** Ids of this install's running processes. Matched by path, so other installs are never touched. */
function discordProcesses(install: DiscordInstall): number[] {
    const script = `Get-Process -Name "${FLAVORS[install.flavor]}" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)|$($_.Path)" }`;
    const out = Bun.spawnSync(["powershell", "-NoProfile", "-NonInteractive", "-Command", script]).stdout.toString();
    const root = install.root.toLowerCase() + "\\";
    return out.split(/\r?\n/).flatMap(line => {
        const [id, path] = line.trim().split("|");
        return path?.toLowerCase().startsWith(root) ? [Number(id)] : [];
    });
}

export function isDiscordRunning(install: DiscordInstall) {
    return discordProcesses(install).length > 0;
}

export async function killDiscord(install: DiscordInstall) {
    for (const pid of discordProcesses(install)) Bun.spawnSync(["taskkill", "/F", "/PID", String(pid)]);
    // Wait until every process is gone, the archive stays locked until then
    for (let i = 0; i < 50 && isDiscordRunning(install); i++) await Bun.sleep(100);
}

export function startDiscord(install: DiscordInstall) {
    const updater = join(install.root, "Update.exe");
    Bun.spawn([updater, "--processStart", `${FLAVORS[install.flavor]}.exe`], { stdio: ["ignore", "ignore", "ignore"] }).unref();
}
