/**
 * Updating Evi from inside Discord. Checks GitHub, through evi.rest's mirror, for the latest published
 * release (prereleases too, with betas on); installing one downloads its installer for this system (evi.exe on Windows), checks it
 * against the published SHA-256, keeps it in the data folder, and has it run `install --restart` for this
 * Discord: that writes the new core and official plugins, closes Discord and starts it again.
 *
 * The installer closes Discord, so it can't be Discord's child: on Windows it's started through WMI,
 * elsewhere in a session of its own. Its output goes to logs/update.log.
 *
 * A dev build (the loader points at a repo's dist/) updates with git; it only checks.
 */
import { IPC } from "@shared/ipc";
import { EXE_ASSET, fetchReleaseApi, flavorOf, isNewerRelease, parseRelease, pickRelease, releaseApis, ReleaseInfo, UpdateInstallResult, UpdateProgress, UpdateStatus } from "@shared/release";
import { execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { ipcMain, net, WebContents } from "electron";
import { accessSync, constants, mkdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { DATA_DIR } from "./paths";
import { settings } from "./settings";

/** evi.rest's mirror of GitHub's release API, then GitHub itself. EVI_UPDATE_API alone when set: tests serve fake releases from a local server */
const APIS = releaseApis(process.env.EVI_UPDATE_API);
const HEADERS = { "User-Agent": "evi-app", "Accept": "application/vnd.github+json" };
/** A check within this long is answered from memory: GitHub, when evi.rest can't answer, allows 60 unauthenticated calls an hour */
const FRESH_FOR = 10 * 60 * 1000;
const MAX_EXE_BYTES = 400 * 1024 * 1024;
const EXE = join(DATA_DIR, EXE_ASSET);
const LOG = join(DATA_DIR, "logs", "update.log");

let last: UpdateStatus | undefined;
/** Whether the last check counted betas */
let lastBeta = false;
let checking: Promise<UpdateStatus> | undefined;
let installing = false;

/** Running from a repo's build output rather than the core `evi install` put in the data folder */
export function isDevBuild() {
    return resolve(globalThis.__eviCoreDir ?? "") !== resolve(DATA_DIR, "core");
}

/** Why this Discord can't update itself, if it can't. Linux packages install Discord as root */
function blockedReason(): string | undefined {
    if (isDevBuild()) return "This is a dev build: update it with git pull and bun run build.";
    if (process.platform === "win32") return;
    try {
        accessSync(process.resourcesPath, constants.W_OK);
    } catch {
        return "Discord’s folder belongs to root, so Evi can’t update it from here. Run sudo evi update in a terminal.";
    }
}

/** The newest release. /releases/latest never answers with a prerelease, so betas pick from the list instead */
async function fetchLatest(beta: boolean): Promise<ReleaseInfo | null> {
    let res: Response;
    const path = beta ? "releases?per_page=30" : "releases/latest";
    try {
        res = await fetchReleaseApi(APIS, path, url => net.fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15_000) }));
    } catch (err) {
        throw new Error(`Couldn’t reach GitHub: ${(err as Error).message}`);
    }
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) throw new Error("GitHub’s rate limit was hit. Try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const json = await res.json().catch(() => null);
    const release = parseRelease(beta ? pickRelease(json, true) : json);
    if (!release) return null;
    if ("error" in release) throw new Error(release.error);
    return release;
}

export function checkForUpdate(force = false): Promise<UpdateStatus> {
    const beta = settings.betaUpdates === true;
    // Turning betas on or off makes the last answer stale
    if (!force && last && lastBeta === beta && Date.now() - last.checkedAt < FRESH_FOR) return Promise.resolve(last);
    checking ??= (async (): Promise<UpdateStatus> => {
        const current = EVI_VERSION;
        const checkedAt = Date.now();
        lastBeta = beta;
        try {
            // Only ever forward: with betas off again, someone on 0.5.0-beta.1 waits for 0.5.0 rather than going back
            const release = await fetchLatest(beta);
            if (!release) return { state: "none", current, checkedAt };
            if (!isNewerRelease(release.tag, current)) return { state: "current", current, latest: release.version, checkedAt };
            const blocked = blockedReason();
            return { state: "available", current, release, installable: !blocked, ...blocked && { blocked }, checkedAt };
        } catch (err) {
            return { state: "error", current, error: (err as Error).message, checkedAt };
        }
    })().then(status => (last = status)).finally(() => void (checking = undefined));
    return checking;
}

async function download(url: string, max: number, onProgress?: (done: number, total: number) => void) {
    const res = await net.fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] }, cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
    const total = Number(res.headers.get("content-length")) || 0;
    if (total > max) throw new Error("The download is larger than expected");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let done = 0;
    while (true) {
        const { done: end, value } = await reader.read();
        if (end) break;
        done += value.length;
        if (done > max) throw new Error("The download is larger than expected");
        chunks.push(value);
        onProgress?.(done, total);
    }
    return Buffer.concat(chunks);
}

/** Starts a command line as its own process, outside Discord's, hidden. Resolves once it's running. */
function launchDetached(commandLine: string) {
    if (process.platform !== "win32") {
        return new Promise<void>((done, fail) => {
            const child = spawn("/bin/sh", ["-c", commandLine], { detached: true, stdio: "ignore" });
            child.once("error", err => fail(new Error(`Couldn’t start the installer (${err.message})`)));
            child.once("spawn", () => {
                child.unref();
                done();
            });
        });
    }
    const ps = [
        "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }",
        `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${commandLine.replace(/'/g, "''")}'; ProcessStartupInformation = $si }`,
        "exit $r.ReturnValue",
    ].join("; ");
    return new Promise<void>((done, fail) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true, timeout: 30_000 }, err => {
            if (err) fail(new Error(`Couldn’t start the installer (${(err as any).code ?? err.message})`));
            else done();
        });
    });
}

async function install(sender: WebContents): Promise<UpdateInstallResult> {
    const report = (progress: UpdateProgress) => {
        if (!sender.isDestroyed()) sender.send(IPC.UPDATE_PROGRESS, progress);
    };
    if (isDevBuild()) return { ok: false, error: "This Evi runs from a dev build. Update it with git pull and bun run build." };
    const blocked = blockedReason();
    if (blocked) return { ok: false, error: blocked };
    if (installing) return { ok: false, error: "Already updating" };
    const flavor = flavorOf(process.execPath);
    if (!flavor) return { ok: false, error: "Couldn’t tell which Discord this is" };

    installing = true;
    try {
        const status = await checkForUpdate(true);
        if (status.state !== "available") return { ok: false, error: status.state === "error" ? status.error : "There’s no newer version" };
        const { release } = status;

        report({ phase: "downloading", done: 0 });
        const checksum = (await download(release.checksumUrl, 4096)).toString("utf8").match(/\b[a-f0-9]{64}\b/i)?.[0].toLowerCase();
        if (!checksum) throw new Error("The release's checksum file has no SHA-256 in it");
        const exe = await download(release.exeUrl, MAX_EXE_BYTES, (done, total) => report({ phase: "downloading", done, total }));

        report({ phase: "verifying" });
        const actual = createHash("sha256").update(exe).digest("hex");
        if (actual !== checksum) throw new Error("The download doesn’t match the release’s checksum. Nothing was changed.");

        // Written beside, then swapped in: an evi.exe still running from an earlier update can't be overwritten
        report({ phase: "installing" });
        mkdirSync(join(DATA_DIR, "logs"), { recursive: true });
        writeFileSync(`${EXE}.new`, exe, { mode: 0o755 });
        try {
            // Still locked if the installer from the last update is somehow running: then it just stays
            rmSync(`${EXE}.old`, { force: true });
            renameSync(EXE, `${EXE}.old`);
        } catch { }
        renameSync(`${EXE}.new`, EXE);

        await launchDetached(process.platform === "win32"
            ? `cmd.exe /d /c ""${EXE}" install --flavor ${flavor} --restart > "${LOG}" 2>&1"`
            : `"${EXE}" install --flavor ${flavor} --restart > "${LOG}" 2>&1`);
        console.log(`[Evi] Updating to ${release.version}: the installer restarts Discord`);
        return { ok: true, version: release.version };
    } catch (err) {
        rmSync(`${EXE}.new`, { force: true });
        return { ok: false, error: (err as Error).message };
    } finally {
        installing = false;
    }
}

export function initUpdater() {
    ipcMain.handle(IPC.UPDATE_CHECK, (_, force: unknown) => checkForUpdate(force === true));
    ipcMain.handle(IPC.UPDATE_INSTALL, e => install(e.sender));
}
