import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "crypto";

import { isReleaseDownloadUrl, RELEASE_PUBLIC_KEY, signAsset, verifyAsset } from "../src/shared/releaseSignature";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const bytes = new TextEncoder().encode("evi-core");

describe("release signatures", () => {
    test("a signature holds for its release, asset and bytes only", () => {
        const sig = signAsset(pem, "v1.2.1", "evi-core.json", bytes);
        expect(verifyAsset("v1.2.1", "evi-core.json", bytes, sig, publicKey)).toBe(true);
        expect(verifyAsset("v1.2.1", "evi-core.json", bytes, `  ${sig}\n`, publicKey)).toBe(true);
        // An old release offered as a newer one, another asset, other bytes
        expect(verifyAsset("v1.2.2", "evi-core.json", bytes, sig, publicKey)).toBe(false);
        expect(verifyAsset("v1.2.1", "evi.exe", bytes, sig, publicKey)).toBe(false);
        expect(verifyAsset("v1.2.1", "evi-core.json", new TextEncoder().encode("evil"), sig, publicKey)).toBe(false);
    });

    test("only the release key counts", () => {
        const sig = signAsset(pem, "v1.2.1", "evi-core.json", bytes);
        // Checked against the built-in key, a signature by any other key fails
        expect(verifyAsset("v1.2.1", "evi-core.json", bytes, sig)).toBe(false);
        expect(verifyAsset("v1.2.1", "evi-core.json", bytes, "", publicKey)).toBe(false);
        expect(verifyAsset("v1.2.1", "evi-core.json", bytes, "not base64 at all", publicKey)).toBe(false);
        expect(Buffer.from(RELEASE_PUBLIC_KEY, "base64")).toHaveLength(32);
    });

    test("release files only download from GitHub", () => {
        expect(isReleaseDownloadUrl("https://github.com/BleedDev/evi/releases/download/v1.2.1/evi-core.json")).toBe(true);
        expect(isReleaseDownloadUrl("https://objects.githubusercontent.com/github-production-release-asset/x")).toBe(true);
        expect(isReleaseDownloadUrl("https://release-assets.githubusercontent.com/x")).toBe(true);
        expect(isReleaseDownloadUrl("https://evi.rest/evi-core.json")).toBe(false);
        expect(isReleaseDownloadUrl("http://github.com/x")).toBe(false);
        expect(isReleaseDownloadUrl("https://github.com.evil.example/x")).toBe(false);
        expect(isReleaseDownloadUrl("not a url")).toBe(false);
    });
});
