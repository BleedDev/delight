/**
 * Release signatures: every asset of a release comes with `<asset>.sig`, an Ed25519 signature made
 * by release CI (scripts/build.ts) with a key evi.rest never holds. A `.sha256` only proves a download
 * wasn't damaged, since it comes from the same place as the file; this proves Evi's release process
 * made it, whoever served it (the evi.rest mirror, GitHub, anything between).
 *
 * What's signed names the tag and the asset, so a genuine file can't be passed off as another
 * release (an old one as the newest, a downgrade) or as another asset. Node only (main, CLI, build).
 * installer/src/release.rs checks the same message with the same key.
 */
import { createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from "crypto";

/** Raw Ed25519 public key, base64. Its private half is the EVI_RELEASE_KEY secret of release CI */
export const RELEASE_PUBLIC_KEY = "4wknmFSHVQlpnQ19IpYgq+0NKs7IacOIoEq1Ye9tgXA=";

export const SIGNATURE_SUFFIX = ".sig";

/** DER prefix that makes a raw 32-byte Ed25519 key an SPKI one Node can load */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Tests serve fake releases from a local server (EVI_UPDATE_API) and sign them with a key of their
 * own (EVI_RELEASE_PUBLIC_KEY). Only together: the real release API always means the real key.
 */
const testApi = () => process.env.EVI_UPDATE_API?.trim() || undefined;

let publicKey: KeyObject | undefined;
const releaseKey = () => publicKey ??= createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from((testApi() && process.env.EVI_RELEASE_PUBLIC_KEY) || RELEASE_PUBLIC_KEY, "base64")]),
    format: "der",
    type: "spki",
});

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** What a signature covers */
export const signedMessage = (tag: string, asset: string, sha256: string) =>
    Buffer.from(`evi-release/v1\n${tag}\n${asset}\n${sha256.toLowerCase()}`, "utf8");

/** Signs `bytes` as `asset` of release `tag`, with a PKCS#8 PEM private key. Build only */
export function signAsset(privateKeyPem: string, tag: string, asset: string, bytes: Uint8Array) {
    return sign(null, signedMessage(tag, asset, sha256Hex(bytes)), createPrivateKey(privateKeyPem)).toString("base64");
}

/** True if `signature` (base64, maybe with whitespace around it) is the release key's for these bytes */
export function verifyAsset(tag: string, asset: string, bytes: Uint8Array, signature: string, key: KeyObject = releaseKey()) {
    const sig = Buffer.from(signature.trim(), "base64");
    if (sig.length !== 64) return false;
    try {
        return verify(null, signedMessage(tag, asset, sha256Hex(bytes)), key, sig);
    } catch {
        return false;
    }
}

/**
 * Where a release's files may be downloaded from: GitHub's release downloads and the hosts they
 * redirect to. The signature is what makes a file trusted; this keeps downloads off anywhere else.
 */
const DOWNLOAD_HOSTS = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];

export function isReleaseDownloadUrl(url: string) {
    try {
        const u = new URL(url);
        const api = testApi();
        if (api && u.origin === new URL(api).origin) return true;
        return u.protocol === "https:" && DOWNLOAD_HOSTS.includes(u.hostname);
    } catch {
        return false;
    }
}
