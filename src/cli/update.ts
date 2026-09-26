import { renameSync, rmSync, writeFileSync } from "fs";

import { compareVersions } from "./discord";

export const REPO = "BleedDev/evi";
export const EXE_ASSET = "evi.exe";
export const CHECKSUM_ASSET = "evi.exe.sha256";

/** Overridable so tests can serve fake releases from a local server */
const API = (process.env.EVI_UPDATE_API || "https://api.github.com").replace(/\/+$/, "");
const HEADERS = { "User-Agent": "evi-cli", Accept: "application/vnd.github+json" };

export class UpdateError extends Error { }

export interface Release {
    tag: string;
    version: string;
    url: string;
    exeUrl: string;
    checksumUrl: string;
}

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    draft: boolean;
    assets: { name: string; browser_download_url: string; }[];
}

/** True when running as the compiled evi.exe rather than `bun src/cli/index.ts` */
export const COMPILED = !/^bun(-debug)?(\.exe)?$/i.test(process.execPath.split(/[\\/]/).pop() ?? "");

/** "v1.2.3-beta" -> "1.2.3" */
export function cleanVersion(tag: string) {
    return tag.trim().replace(/^v/i, "").split(/[-+]/)[0];
}

export function isNewer(tag: string, current: string) {
    return compareVersions(cleanVersion(tag), cleanVersion(current)) > 0;
}

async function request(url: string, timeout: number) {
    try {
        return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
        throw new UpdateError(`Couldn't reach ${new URL(url).host}: ${e instanceof Error ? e.message : e}`);
    }
}

/** The latest published release, or null if nothing has been published yet. Drafts and prereleases never show up here. */
export async function fetchLatestRelease(): Promise<Release | null> {
    const res = await request(`${API}/repos/${REPO}/releases/latest`, 15_000);
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) throw new UpdateError("GitHub's API rate limit was hit. Try again in a few minutes.");
    if (!res.ok) throw new UpdateError(`GitHub answered ${res.status} ${res.statusText}`);

    const data = await res.json() as GitHubRelease;
    if (data.draft) return null;
    const asset = (name: string) => data.assets.find(a => a.name === name)?.browser_download_url;
    const exeUrl = asset(EXE_ASSET);
    const checksumUrl = asset(CHECKSUM_ASSET);
    if (!exeUrl || !checksumUrl) throw new UpdateError(`Release ${data.tag_name} is missing ${exeUrl ? CHECKSUM_ASSET : EXE_ASSET}`);

    return { tag: data.tag_name, version: cleanVersion(data.tag_name), url: data.html_url, exeUrl, checksumUrl };
}

async function download(url: string, timeout: number) {
    const res = await request(url, timeout);
    if (!res.ok) throw new UpdateError(`Download failed: ${res.status} ${res.statusText} (${url})`);
    try {
        return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
        throw new UpdateError(`Download interrupted: ${e instanceof Error ? e.message : e}`);
    }
}

/** Downloads the release's evi.exe and checks it against the published SHA-256 */
export async function downloadVerified(release: Release) {
    const checksumText = new TextDecoder().decode(await download(release.checksumUrl, 30_000));
    const expected = checksumText.match(/\b[a-f0-9]{64}\b/i)?.[0].toLowerCase();
    if (!expected) throw new UpdateError(`${CHECKSUM_ASSET} doesn't contain a SHA-256 hash`);

    const exe = await download(release.exeUrl, 10 * 60_000);
    const actual = new Bun.CryptoHasher("sha256").update(exe).digest("hex");
    if (actual !== expected) throw new UpdateError(`Checksum mismatch, the download was not installed.\n  expected ${expected}\n  got      ${actual}`);
    return exe;
}

/**
 * Windows lets a running exe be renamed but not overwritten, so the current one moves aside
 * to .old and the new one takes its name. The .old is removed on the next run.
 */
export function replaceExecutable(exe: string, bytes: Uint8Array) {
    const next = `${exe}.new`;
    const old = `${exe}.old`;
    writeFileSync(next, bytes);
    try {
        rmSync(old, { force: true });
        renameSync(exe, old);
    } catch (e) {
        rmSync(next, { force: true });
        throw new UpdateError(`Couldn't move ${exe} aside: ${e instanceof Error ? e.message : e}`);
    }
    try {
        renameSync(next, exe);
    } catch (e) {
        renameSync(old, exe);
        rmSync(next, { force: true });
        throw new UpdateError(`Couldn't put the new version in place: ${e instanceof Error ? e.message : e}`);
    }
}

/** Leftovers from a previous self-update. The .old stays locked while that older process is still running, which is fine. */
export function cleanupPreviousUpdate(exe: string) {
    for (const leftover of [`${exe}.old`, `${exe}.new`]) {
        try {
            rmSync(leftover, { force: true });
        } catch { }
    }
}
