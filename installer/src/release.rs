//! Evi's releases on GitHub. The installer doesn't carry Evi itself: it downloads the release's
//! evi-core.json (the core and official plugins, what the CLI embeds as dist/embed.json) and checks it
//! against evi-core.json.sha256 and the release key's signature (evi-core.json.sig), the same scheme
//! as src/cli/update.ts and src/shared/releaseSignature.ts.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::time::Duration;

use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

pub const REPO: &str = "BleedDev/evi";
pub const CORE_ASSET: &str = "evi-core.json";
pub const CHECKSUM_ASSET: &str = "evi-core.json.sha256";
pub const SIGNATURE_ASSET: &str = "evi-core.json.sig";
/// Raw Ed25519 public key, base64: RELEASE_PUBLIC_KEY in src/shared/releaseSignature.ts
const RELEASE_PUBLIC_KEY: &str = "4wknmFSHVQlpnQ19IpYgq+0NKs7IacOIoEq1Ye9tgXA=";
/// GitHub's release downloads and the hosts they redirect to, like isReleaseDownloadUrl
const DOWNLOAD_HOSTS: [&str; 3] = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
const MAX_CORE_BYTES: u64 = 64 * 1024 * 1024;

/// Everything an install lays down. retired lists official plugins that became part of Evi itself.
#[derive(Deserialize)]
pub struct CorePayload {
    pub version: String,
    pub core: BTreeMap<String, String>,
    pub plugins: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)]
    pub retired: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Release {
    pub tag: String,
    pub version: String,
    pub core_url: Option<String>,
    pub checksum_url: Option<String>,
    /// Missing on releases from before 1.2.1: those can't be installed by this installer
    pub signature_url: Option<String>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

/// evi.rest's mirror of GitHub's release API: same paths and JSON, without GitHub's 60 calls an hour per address
pub const MIRROR_API: &str = "https://evi.rest/v1/github";
pub const GITHUB_API: &str = "https://api.github.com";

/// Where to ask for releases, in order: evi.rest's mirror, then GitHub itself. EVI_UPDATE_API alone
/// when set: tests serve fake releases from a local server. Like releaseApis in src/shared/release.ts.
fn apis_for(overridden: Option<&str>) -> Vec<String> {
    match overridden.map(|s| s.trim().trim_end_matches('/')).filter(|s| !s.is_empty()) {
        Some(api) => vec![api.to_string()],
        None => vec![MIRROR_API.to_string(), GITHUB_API.to_string()],
    }
}

fn apis() -> Vec<String> {
    apis_for(std::env::var("EVI_UPDATE_API").ok().as_deref())
}

fn agent(timeout: u64) -> ureq::Agent {
    let tls = ureq::tls::TlsConfig::builder().provider(ureq::tls::TlsProvider::NativeTls).build();
    ureq::Agent::config_builder()
        .tls_config(tls)
        .timeout_global(Some(Duration::from_secs(timeout)))
        .http_status_as_error(false)
        .user_agent("evi-installer")
        .build()
        .into()
}

fn host(url: &str) -> &str {
    url.split("://").nth(1).unwrap_or(url).split('/').next().unwrap_or(url)
}

fn get(url: &str, timeout: u64) -> Result<ureq::http::Response<ureq::Body>, String> {
    agent(timeout)
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("Couldn’t reach {}: {e}", host(url)))
}

/// "v1.2.3-beta.1+build" -> "1.2.3-beta.1", like cleanVersion in src/shared/release.ts
pub fn clean_version(tag: &str) -> String {
    let t = tag.trim();
    let t = t.strip_prefix('v').or_else(|| t.strip_prefix('V')).unwrap_or(t);
    t.split('+').next().unwrap_or("").to_string()
}

/// compareVersions from src/shared/store.ts: 0.5.0-beta.1 comes after 0.4.0 and before 0.5.0
pub fn compare_release(a: &str, b: &str) -> Ordering {
    let split = |v: &str| match v.split_once('-') {
        Some((core, pre)) => (core.to_string(), Some(pre.to_string())),
        None => (v.to_string(), None),
    };
    let ((core_a, pre_a), (core_b, pre_b)) = (split(a), split(b));
    let core = crate::discord::compare_versions(&core_a, &core_b);
    if core.is_ne() {
        return core;
    }
    let (pre_a, pre_b) = match (pre_a, pre_b) {
        (None, None) => return Ordering::Equal,
        (None, Some(_)) => return Ordering::Greater,
        (Some(_), None) => return Ordering::Less,
        (Some(a), Some(b)) => (a, b),
    };
    let (pa, pb): (Vec<&str>, Vec<&str>) = (pre_a.split('.').collect(), pre_b.split('.').collect());
    for i in 0..pa.len().max(pb.len()) {
        let (Some(x), Some(y)) = (pa.get(i), pb.get(i)) else { return pa.len().cmp(&pb.len()) };
        let order = match (x.parse::<u64>(), y.parse::<u64>()) {
            (Ok(nx), Ok(ny)) => nx.cmp(&ny),
            (Ok(_), Err(_)) => Ordering::Less,
            (Err(_), Ok(_)) => Ordering::Greater,
            _ => x.cmp(y),
        };
        if order.is_ne() {
            return order;
        }
    }
    Ordering::Equal
}

pub fn is_newer(tag: &str, current: &str) -> bool {
    compare_release(&clean_version(tag), &clean_version(current)).is_gt()
}

/// GETs `<api>/repos/BleedDev/evi/<path>` from each API in turn, moving on to the next when one can't
/// be reached, times out or answers 5xx. Anything else (a release, a 404, GitHub's 403) is the answer.
fn get_release_api(apis: &[String], path: &str) -> Result<ureq::http::Response<ureq::Body>, String> {
    let mut failure = String::from("No release API to ask");
    for (i, api) in apis.iter().enumerate() {
        let last = i + 1 == apis.len();
        match get(&format!("{api}/repos/{REPO}/{path}"), 15) {
            Ok(res) if res.status().as_u16() < 500 || last => return Ok(res),
            Ok(res) => failure = format!("{} answered {}", host(api), res.status().as_u16()),
            Err(e) => failure = e,
        }
    }
    Err(failure)
}

fn fetch_from(apis: &[String], path: &str) -> Result<Option<Release>, String> {
    let mut res = get_release_api(apis, path)?;
    let status = res.status().as_u16();
    if status == 404 {
        return Ok(None);
    }
    if status == 403 || status == 429 {
        return Err("GitHub’s rate limit was hit. Try again in a few minutes.".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!("GitHub answered {status}"));
    }
    let body = res.body_mut().with_config().limit(4 * 1024 * 1024).read_to_vec().map_err(|e| format!("Couldn’t read GitHub’s answer: {e}"))?;
    let data: GitHubRelease = serde_json::from_slice(&body).map_err(|e| format!("GitHub’s answer didn’t make sense: {e}"))?;
    if data.draft {
        return Ok(None);
    }
    let asset = |name: &str| data.assets.iter().find(|a| a.name == name).map(|a| a.browser_download_url.clone());
    Ok(Some(Release { version: clean_version(&data.tag_name), core_url: asset(CORE_ASSET), checksum_url: asset(CHECKSUM_ASSET), signature_url: asset(SIGNATURE_ASSET), tag: data.tag_name }))
}

/// The latest published release, or None if nothing has been published yet. Drafts and prereleases never show up here.
pub fn latest() -> Result<Option<Release>, String> {
    fetch_from(&apis(), "releases/latest")
}

/// A release by version, e.g. the one this installer was built for
pub fn by_version(version: &str) -> Result<Option<Release>, String> {
    fetch_from(&apis(), &format!("releases/tags/v{version}"))
}

/// Tests serve fake releases from a local server (EVI_UPDATE_API): its files count as GitHub's, and they're
/// signed with the key in EVI_RELEASE_PUBLIC_KEY. Only together, like src/shared/releaseSignature.ts.
fn test_api() -> Option<String> {
    std::env::var("EVI_UPDATE_API").ok().map(|s| s.trim().trim_end_matches('/').to_string()).filter(|s| !s.is_empty())
}

fn is_download_url(url: &str, test_api: Option<&str>) -> bool {
    if let Some(api) = test_api {
        let origin = |u: &str| format!("{}://{}", u.split("://").next().unwrap_or(""), host(u));
        if origin(url) == origin(api) {
            return true;
        }
    }
    url.starts_with("https://") && DOWNLOAD_HOSTS.contains(&host(url))
}

/// What a signature covers: the tag and asset too, so a genuine file can't pass for another release
fn signed_message(tag: &str, asset: &str, sha256: &str) -> String {
    format!("evi-release/v1\n{tag}\n{asset}\n{sha256}")
}

fn verify_signature(key_b64: &str, message: &[u8], signature_b64: &str) -> bool {
    let b64 = base64::engine::general_purpose::STANDARD;
    let (Ok(key), Ok(sig)) = (b64.decode(key_b64.trim()), b64.decode(signature_b64.trim())) else {
        return false;
    };
    let (Ok(key), Ok(sig)) = (<[u8; 32]>::try_from(key.as_slice()), <[u8; 64]>::try_from(sig.as_slice())) else {
        return false;
    };
    let Ok(key) = VerifyingKey::from_bytes(&key) else {
        return false;
    };
    key.verify_strict(message, &Signature::from_bytes(&sig)).is_ok()
}

fn release_key() -> String {
    test_api().and_then(|_| std::env::var("EVI_RELEASE_PUBLIC_KEY").ok()).unwrap_or_else(|| RELEASE_PUBLIC_KEY.to_string())
}

fn download(url: &str, max: u64, timeout: u64) -> Result<Vec<u8>, String> {
    if !is_download_url(url, test_api().as_deref()) {
        return Err(format!("Refusing to download from {}: releases only come from GitHub", host(url)));
    }
    let mut res = get(url, timeout)?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("Download failed: {status} ({url})"));
    }
    res.body_mut().with_config().limit(max).read_to_vec().map_err(|e| format!("Download interrupted: {e}"))
}

pub fn has_core(release: &Release) -> bool {
    release.core_url.is_some() && release.checksum_url.is_some() && release.signature_url.is_some()
}

/// Downloads a release's evi-core.json and checks it against the published SHA-256 and the release key's signature
pub fn download_core(release: &Release, on_verify: impl FnOnce()) -> Result<CorePayload, String> {
    let (Some(core_url), Some(checksum_url)) = (&release.core_url, &release.checksum_url) else {
        return Err(format!("Release {} doesn’t include {CORE_ASSET}", release.tag));
    };
    let Some(signature_url) = &release.signature_url else {
        return Err(format!("Evi {} isn’t signed, so it wasn’t installed.", release.version));
    };
    let signature = String::from_utf8_lossy(&download(signature_url, 4096, 30)?).into_owned();
    let checksum_text = String::from_utf8_lossy(&download(checksum_url, 4096, 30)?).into_owned();
    let expected = checksum_text
        .split(|c: char| !c.is_ascii_hexdigit())
        .find(|word| word.len() == 64)
        .map(str::to_lowercase)
        .ok_or_else(|| format!("{CHECKSUM_ASSET} doesn’t contain a SHA-256 hash"))?;
    let bytes = download(core_url, MAX_CORE_BYTES, 10 * 60)?;
    on_verify();
    let actual = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect::<String>();
    if actual != expected {
        return Err("The download doesn’t match the release’s checksum. Nothing was changed.".into());
    }
    if !verify_signature(&release_key(), signed_message(&release.tag, CORE_ASSET, &actual).as_bytes(), &signature) {
        return Err("The download isn’t signed by Evi’s release key. Nothing was changed.".into());
    }
    parse_core(&bytes)
}

pub fn parse_core(bytes: &[u8]) -> Result<CorePayload, String> {
    let payload: CorePayload = serde_json::from_slice(bytes).map_err(|e| format!("{CORE_ASSET} is broken: {e}"))?;
    if !payload.core.contains_key("main.js") {
        return Err(format!("{CORE_ASSET} has no main.js"));
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_releases_like_the_app() {
        assert!(is_newer("v0.5.1", "0.5.0"));
        assert!(is_newer("v0.5.0", "0.5.0-beta.1"));
        assert!(is_newer("v0.5.0-beta.2", "0.5.0-beta.1"));
        assert!(is_newer("v0.5.0-beta.1", "0.4.0"));
        assert!(!is_newer("v0.5.0", "0.5.0"));
        assert!(!is_newer("v0.4.0", "0.5.0"));
        assert!(!is_newer("v0.5.0-beta.1", "0.5.0"));
        assert_eq!(clean_version("v1.2.3-beta.1+x"), "1.2.3-beta.1");
    }

    /// Signed by src/shared/releaseSignature.ts (Node) with a throwaway key: both sides sign the same message
    #[test]
    fn checks_signatures_like_the_app() {
        const KEY: &str = "vJKceAzJL2MRXRSYzgA4+L+6AfG87O7Qvn6kz8s+ank=";
        const SIG: &str = "ASPyN1PwLslaoBZ4FiUnf+OMt186rTrG3sKiUkX6p/Y1Ek7mxtFCMuxs9Ex8wXu2cG1mI4V5niloFrh1UtAhDg==";
        let sha = "a".repeat(64);
        assert!(verify_signature(KEY, signed_message("v1.2.1", CORE_ASSET, &sha).as_bytes(), SIG));
        assert!(!verify_signature(KEY, signed_message("v1.2.2", CORE_ASSET, &sha).as_bytes(), SIG));
        assert!(!verify_signature(KEY, signed_message("v1.2.1", "evi.exe", &sha).as_bytes(), SIG));
        assert!(!verify_signature(KEY, signed_message("v1.2.1", CORE_ASSET, &"b".repeat(64)).as_bytes(), SIG));
        assert!(!verify_signature(RELEASE_PUBLIC_KEY, signed_message("v1.2.1", CORE_ASSET, &sha).as_bytes(), SIG));
        assert!(!verify_signature(KEY, b"anything", "not base64"));
    }

    #[test]
    fn downloads_only_from_github() {
        assert!(is_download_url("https://github.com/BleedDev/evi/releases/download/v1.2.1/evi-core.json", None));
        assert!(is_download_url("https://objects.githubusercontent.com/x", None));
        assert!(!is_download_url("https://evi.rest/evi-core.json", None));
        assert!(!is_download_url("http://github.com/x", None));
        assert!(!is_download_url("https://github.com.evil.example/x", None));
        assert!(is_download_url("http://127.0.0.1:5000/download/x", Some("http://127.0.0.1:5000")));
        assert!(!is_download_url("http://127.0.0.1:6000/download/x", Some("http://127.0.0.1:5000")));
    }

    #[test]
    fn asks_the_mirror_then_github_unless_overridden() {
        assert_eq!(apis_for(None), vec![MIRROR_API.to_string(), GITHUB_API.to_string()]);
        assert_eq!(apis_for(Some("")), vec![MIRROR_API.to_string(), GITHUB_API.to_string()]);
        assert_eq!(apis_for(Some("http://127.0.0.1:9/api/")), vec!["http://127.0.0.1:9/api".to_string()]);
    }

    /// A local HTTP server answering `times` requests with one status and body
    fn serve(status: u16, body: &'static str, times: usize) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(times) {
                let mut stream = stream.unwrap();
                let (mut buf, mut req) = ([0u8; 4096], Vec::new());
                while !req.windows(4).any(|w| w == b"\r\n\r\n") {
                    let n = stream.read(&mut buf).unwrap();
                    if n == 0 {
                        break;
                    }
                    req.extend_from_slice(&buf[..n]);
                }
                let res = format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                stream.write_all(res.as_bytes()).unwrap();
            }
        });
        format!("http://{addr}")
    }

    /// An address nothing listens on
    fn closed() -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        format!("http://{}", listener.local_addr().unwrap())
    }

    const RELEASE: &str = r#"{"tag_name":"v0.6.0","draft":false,"assets":[{"name":"evi-core.json","browser_download_url":"https://x/evi-core.json"},{"name":"evi-core.json.sha256","browser_download_url":"https://x/evi-core.json.sha256"},{"name":"evi-core.json.sig","browser_download_url":"https://x/evi-core.json.sig"}]}"#;

    #[test]
    fn falls_back_to_github_when_the_mirror_fails() {
        // A 5xx from the mirror: GitHub answers
        let release = fetch_from(&[serve(502, "{}", 1), serve(200, RELEASE, 1)], "releases/latest").unwrap().unwrap();
        assert_eq!(release.version, "0.6.0");
        assert!(has_core(&release));
        // The mirror can't be reached
        assert_eq!(fetch_from(&[closed(), serve(200, RELEASE, 1)], "releases/latest").unwrap().unwrap().tag, "v0.6.0");
        // A 404 is an answer: nothing published, and GitHub (unreachable here) isn't asked
        assert!(fetch_from(&[serve(404, r#"{"message":"Not Found"}"#, 1), closed()], "releases/latest").unwrap().is_none());
        // Both failing says what the last one answered
        assert_eq!(fetch_from(&[serve(503, "{}", 1), serve(500, "{}", 1)], "releases/latest").unwrap_err(), "GitHub answered 500");
        assert!(fetch_from(&[serve(503, "{}", 1), closed()], "releases/latest").unwrap_err().starts_with("Couldn’t reach 127.0.0.1"));
    }
}
