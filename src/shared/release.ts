/**
 * Evi's own releases: published on GitHub with an installer per system and its .sha256 attached. Read
 * by the CLI's `evi update` and by the app's Updates page, which installs a new release with one click.
 */
import { compareVersions } from "./store";

export const RELEASE_REPO = "BleedDev/evi";

/** Every installer a release carries, each with a <name>.sha256 beside it */
export const RELEASE_ASSETS = ["evi.exe", "evi-macos-arm64", "evi-macos-x64", "evi-linux-x64", "evi-linux-arm64"] as const;

/** The installer for a system: evi.exe on Windows, evi-<macos|linux>-<arm64|x64> elsewhere */
export function exeAsset(platform: string = globalThis.process?.platform, arch: string = globalThis.process?.arch) {
    const cpu = arch === "arm64" ? "arm64" : "x64";
    if (platform === "darwin") return `evi-macos-${cpu}`;
    if (platform === "linux") return `evi-linux-${cpu}`;
    return "evi.exe";
}

export const EXE_ASSET = exeAsset();
export const CHECKSUM_ASSET = `${EXE_ASSET}.sha256`;

/** Discord's install folders in %LOCALAPPDATA%, by flavor. Also its executable's name on every system, minus spaces and .exe */
export const FLAVORS = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary",
    development: "DiscordDevelopment",
} as const;

export type Flavor = keyof typeof FLAVORS;

/**
 * Which Discord a path belongs to. On Windows its exe lives in %LOCALAPPDATA%\<Flavor folder>\app-x.y.z\;
 * on macOS it's Discord PTB.app/Contents/MacOS/Discord PTB, on Linux /usr/share/discord-ptb/DiscordPTB.
 */
export function flavorOf(execPath: string): Flavor | undefined {
    const parts = execPath.split(/[\\/]/);
    const folder = parts[parts.length - 3]?.toLowerCase();
    const byFolder = (Object.keys(FLAVORS) as Flavor[]).find(f => FLAVORS[f].toLowerCase() === folder);
    if (byFolder) return byFolder;
    const exe = parts[parts.length - 1].replace(/\.exe$/i, "").replace(/\s+/g, "").toLowerCase();
    return (Object.keys(FLAVORS) as Flavor[]).find(f => FLAVORS[f].toLowerCase() === exe);
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
    /** installable is false for a dev build, which updates with git instead, or where Discord's folder isn't ours to write; blocked says which */
    | { state: "available"; current: string; release: ReleaseInfo; installable: boolean; blocked?: string; checkedAt: number; }
    | { state: "error"; current: string; error: string; checkedAt: number; };

export interface UpdateProgress {
    phase: "downloading" | "verifying" | "installing";
    /** Bytes so far and in all, while downloading */
    done?: number;
    total?: number;
}

export type UpdateInstallResult = { ok: true; version: string; } | { ok: false; error: string; };
