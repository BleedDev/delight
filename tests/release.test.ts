import { describe, expect, test } from "bun:test";

import { cleanVersion, flavorOf, isNewerRelease, parseRelease } from "../src/shared/release";

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/BleedDev/evi/releases/download/v0.3.0/${name}` });

describe("Evi's releases", () => {
    test("a published release with the exe and its checksum", () => {
        const release = parseRelease({
            tag_name: "v0.3.0", html_url: "https://github.com/BleedDev/evi/releases/tag/v0.3.0", draft: false,
            body: "  ## New\n- Updates from the app  ", published_at: "2026-09-27T10:00:00Z",
            assets: [asset("evi.exe"), asset("evi.exe.sha256")],
        });
        expect(release).toEqual({
            tag: "v0.3.0", version: "0.3.0", url: "https://github.com/BleedDev/evi/releases/tag/v0.3.0",
            notes: "## New\n- Updates from the app", publishedAt: "2026-09-27T10:00:00Z",
            exeUrl: asset("evi.exe").browser_download_url, checksumUrl: asset("evi.exe.sha256").browser_download_url,
        });
    });

    test("drafts and junk aren't releases; a missing file is said plainly", () => {
        expect(parseRelease({ tag_name: "v0.3.0", draft: true, assets: [] })).toBeUndefined();
        expect(parseRelease(null)).toBeUndefined();
        expect(parseRelease({ tag_name: "v0.3.0", assets: [asset("evi.exe")] })).toEqual({ error: "Release v0.3.0 is missing evi.exe.sha256" });
        expect(parseRelease({ tag_name: "v0.3.0", assets: [] })).toEqual({ error: "Release v0.3.0 is missing evi.exe" });
    });

    test("versions", () => {
        expect(cleanVersion("v1.2.3-beta")).toBe("1.2.3");
        expect(isNewerRelease("v0.3.0", "0.2.0")).toBe(true);
        expect(isNewerRelease("v0.2.0", "0.2.0")).toBe(false);
        expect(isNewerRelease("v0.10.0", "0.9.9")).toBe(true);
    });

    test("which Discord a path is", () => {
        expect(flavorOf("C:\\Users\\a\\AppData\\Local\\Discord\\app-1.0.9259\\Discord.exe")).toBe("stable");
        expect(flavorOf("C:\\Users\\a\\AppData\\Local\\DiscordPTB\\app-1.0.1\\DiscordPTB.exe")).toBe("ptb");
        expect(flavorOf("C:/Users/a/AppData/Local/DiscordCanary/app-1.0.1/DiscordCanary.exe")).toBe("canary");
        expect(flavorOf("C:\\Program Files\\electron\\electron.exe")).toBeUndefined();
    });
});
