/**
 * Silent background updates: the decisions, kept free of Electron and the file system so they can be
 * tested. With the setting on, a newer release is downloaded and verified in the background ("staged"),
 * and installed by `evi install --flavor X --wait` launched when Discord quits: the installer waits for
 * Discord to be gone, swaps the files, and the next start runs the new Evi.
 */
import { Flavor, isNewerRelease, UpdateStatus } from "./release";

/** What was downloaded and verified, kept beside the installer in the data folder */
export interface StagedUpdate {
    version: string;
    /** SHA-256 of the installer, as the release published it */
    sha256: string;
}

export function parseStaged(json: unknown): StagedUpdate | undefined {
    if (!json || typeof json !== "object") return;
    const { version, sha256 } = json as Record<string, unknown>;
    if (typeof version !== "string" || !version || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) return;
    return { version, sha256 };
}

/** A staged version still worth installing: newer than the Evi running. Anything else is cleaned up */
export function isStagedRelevant(staged: StagedUpdate | undefined, running: string): staged is StagedUpdate {
    return !!staged && isNewerRelease(staged.version, running);
}

/** Whether a check's answer should start a background download */
export function shouldStage(enabled: boolean, status: UpdateStatus, staged: StagedUpdate | undefined): boolean {
    if (!enabled || status.state !== "available" || !status.installable) return false;
    return staged?.version !== status.release.version;
}

/** Whether quitting Discord should launch the staged installer. blocked is set for dev builds and read-only Discord folders */
export function shouldApplyOnQuit(opts: { enabled: boolean; staged: StagedUpdate | undefined; running: string; blocked?: string; flavor?: Flavor; }): boolean {
    return opts.enabled && !opts.blocked && !!opts.flavor && isStagedRelevant(opts.staged, opts.running);
}

/**
 * The installer's arguments. "restart" closes Discord and opens it again (Update and restart Discord);
 * "on-exit" waits for Discord to have quit, never closes it, and leaves starting it to the user.
 */
export function installerArgs(flavor: Flavor, mode: "restart" | "on-exit"): string[] {
    return ["install", "--flavor", flavor, mode === "restart" ? "--restart" : "--wait"];
}

/** The command line that runs the installer with its output in the update log */
export function installerCommandLine(exe: string, args: string[], log: string, platform: string): string {
    return platform === "win32"
        ? `cmd.exe /d /c ""${exe}" ${args.join(" ")} > "${log}" 2>&1"`
        : `"${exe}" ${args.join(" ")} > "${log}" 2>&1`;
}
