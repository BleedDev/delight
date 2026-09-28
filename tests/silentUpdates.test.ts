import { describe, expect, test } from "bun:test";

import type { ReleaseInfo, UpdateStatus } from "../src/shared/release";
import { installerArgs, installerCommandLine, isStagedRelevant, parseStaged, shouldApplyOnQuit, shouldStage } from "../src/shared/silentUpdate";

const HASH = "a".repeat(64);
const release = (version: string): ReleaseInfo => ({
    tag: `v${version}`, version, url: "", notes: "", publishedAt: null, prerelease: false, exeUrl: "", checksumUrl: "",
});
const available = (version: string, installable = true): UpdateStatus => ({ state: "available", current: "1.0.0", release: release(version), installable, checkedAt: 0 });

describe("silent updates", () => {
    test("the staged record is read only when it's whole", () => {
        expect(parseStaged({ version: "1.0.1", sha256: HASH })).toEqual({ version: "1.0.1", sha256: HASH });
        expect(parseStaged({ version: "1.0.1" })).toBeUndefined();
        expect(parseStaged({ version: "", sha256: HASH })).toBeUndefined();
        expect(parseStaged({ version: "1.0.1", sha256: "nope" })).toBeUndefined();
        expect(parseStaged(null)).toBeUndefined();
    });

    test("a staged version only matters while it's newer than the running one", () => {
        expect(isStagedRelevant({ version: "1.0.1", sha256: HASH }, "1.0.0")).toBe(true);
        // Installed: the next start runs it
        expect(isStagedRelevant({ version: "1.0.1", sha256: HASH }, "1.0.1")).toBe(false);
        // Something newer went in another way
        expect(isStagedRelevant({ version: "1.0.1", sha256: HASH }, "1.1.0")).toBe(false);
        expect(isStagedRelevant({ version: "1.1.0-beta.1", sha256: HASH }, "1.0.0")).toBe(true);
        expect(isStagedRelevant({ version: "1.1.0-beta.1", sha256: HASH }, "1.1.0")).toBe(false);
        expect(isStagedRelevant(undefined, "1.0.0")).toBe(false);
    });

    test("a newer installable release is downloaded once, only with the setting on", () => {
        expect(shouldStage(true, available("1.0.1"), undefined)).toBe(true);
        expect(shouldStage(false, available("1.0.1"), undefined)).toBe(false);
        // Dev builds and root-owned Discord folders aren't installable
        expect(shouldStage(true, available("1.0.1", false), undefined)).toBe(false);
        expect(shouldStage(true, available("1.0.1"), { version: "1.0.1", sha256: HASH })).toBe(false);
        // An even newer one replaces what's staged
        expect(shouldStage(true, available("1.0.2"), { version: "1.0.1", sha256: HASH })).toBe(true);
        expect(shouldStage(true, { state: "current", current: "1.0.0", latest: "1.0.0", checkedAt: 0 }, undefined)).toBe(false);
        expect(shouldStage(true, { state: "error", current: "1.0.0", error: "x", checkedAt: 0 }, undefined)).toBe(false);
    });

    test("quitting installs only a relevant staged update, where Evi may", () => {
        const staged = { version: "1.0.1", sha256: HASH };
        const base = { enabled: true, staged, running: "1.0.0", flavor: "stable" as const };
        expect(shouldApplyOnQuit(base)).toBe(true);
        expect(shouldApplyOnQuit({ ...base, enabled: false })).toBe(false);
        expect(shouldApplyOnQuit({ ...base, staged: undefined })).toBe(false);
        expect(shouldApplyOnQuit({ ...base, running: "1.0.1" })).toBe(false);
        expect(shouldApplyOnQuit({ ...base, blocked: "This is a dev build" })).toBe(false);
        expect(shouldApplyOnQuit({ ...base, flavor: undefined })).toBe(false);
    });

    test("the installer restarts Discord for Update now, and only waits for it on quit", () => {
        expect(installerArgs("ptb", "restart")).toEqual(["install", "--flavor", "ptb", "--restart"]);
        expect(installerArgs("stable", "on-exit")).toEqual(["install", "--flavor", "stable", "--wait"]);
        expect(installerArgs("stable", "on-exit")).not.toContain("--restart");
    });

    test("its output goes to the update log", () => {
        expect(installerCommandLine("C:\\Evi\\evi.exe", ["install", "--wait"], "C:\\Evi\\logs\\update.log", "win32"))
            .toBe(`cmd.exe /d /c ""C:\\Evi\\evi.exe" install --wait > "C:\\Evi\\logs\\update.log" 2>&1"`);
        expect(installerCommandLine("/home/a/.config/Evi/evi-linux-x64", ["install", "--wait"], "/tmp/update.log", "linux"))
            .toBe(`"/home/a/.config/Evi/evi-linux-x64" install --wait > "/tmp/update.log" 2>&1`);
    });
});
