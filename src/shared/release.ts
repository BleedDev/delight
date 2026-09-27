/**
 * Evi's own releases: published on GitHub with evi.exe and evi.exe.sha256 attached. Read by the CLI's
 * `evi update` and by the app's Updates page, which installs a new release with one click.
 */
import { compareVersions } from "./store";

export const RELEASE_REPO = "BleedDev/evi";
export const EXE_ASSET = "evi.exe";
export const CHECKSUM_ASSET = "evi.exe.sha256";

/** Discord's install folders in %LOCALAPPDATA%, by flavor */
export const FLAVORS = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary",
    development: "DiscordDevelopment",
} as const;

export type Flavor = keyof typeof FLAVORS;

/** Which Discord a path belongs to: its exe lives in %LOCALAPPDATA%\<Flavor folder>\app-x.y.z\ */
export function flavorOf(execPath: string): Flavor | undefined {
    const parts = execPath.split(/[\\/]/);
    const folder = parts[parts.length - 3]?.toLowerCase();
    return (Object.keys(FLAVORS) as Flavor[]).find(f => FLAVORS[f].toLowerCase() === folder);
}

/** "v1.2.3-beta" -> "1.2.3" */
export const cleanVersion = (tag: string) => tag.trim().replace(/^v/i, "").split(/[-+]/)[0];

export const isNewerRelease = (tag: string, current: string) => compareVersions(cleanVersion(tag), cleanVersion(current)) > 0;

export interface ReleaseInfo {
    tag: string;
    version: string;
    /** The release page */
    url: string;
    /** Release notes as written on GitHub (markdown), trimmed */
    notes: string;
    publishedAt: string | null;
    exeUrl: string;
    checksumUrl: string;
}

/** GitHub's /releases/latest answer, or undefined if it isn't a usable release */
export function parseRelease(json: any): ReleaseInfo | { error: string; } | undefined {
    if (!json || typeof json !== "object" || typeof json.tag_name !== "string" || json.draft) return;
    const asset = (name: string) => Array.isArray(json.assets) ? json.assets.find((a: any) => a?.name === name)?.browser_download_url : undefined;
    const exeUrl = asset(EXE_ASSET), checksumUrl = asset(CHECKSUM_ASSET);
    if (typeof exeUrl !== "string" || typeof checksumUrl !== "string") return { error: `Release ${json.tag_name} is missing ${exeUrl ? CHECKSUM_ASSET : EXE_ASSET}` };
    return {
        tag: json.tag_name,
        version: cleanVersion(json.tag_name),
        url: typeof json.html_url === "string" ? json.html_url : `https://github.com/${RELEASE_REPO}/releases`,
        notes: typeof json.body === "string" ? json.body.trim().slice(0, 4000) : "",
        publishedAt: typeof json.published_at === "string" ? json.published_at : null,
        exeUrl,
        checksumUrl,
    };
}

export type UpdateStatus =
    /** Nothing published on GitHub yet */
    | { state: "none"; current: string; checkedAt: number; }
    | { state: "current"; current: string; latest: string; checkedAt: number; }
    /** installable is false for a dev build, which updates with git instead */
    | { state: "available"; current: string; release: ReleaseInfo; installable: boolean; checkedAt: number; }
    | { state: "error"; current: string; error: string; checkedAt: number; };

export interface UpdateProgress {
    phase: "downloading" | "verifying" | "installing";
    /** Bytes so far and in all, while downloading */
    done?: number;
    total?: number;
}

export type UpdateInstallResult = { ok: true; version: string; } | { ok: false; error: string; };
