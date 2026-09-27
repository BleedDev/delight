//! Evi's releases on GitHub. The installer doesn't carry Evi itself: it downloads the release's
//! evi-core.json (the core and official plugins, what the CLI embeds as dist/embed.json) and checks it
//! against evi-core.json.sha256, the same scheme as src/cli/update.ts.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest, Sha256};

pub const REPO: &str = "BleedDev/evi";
pub const CORE_ASSET: &str = "evi-core.json";
pub const CHECKSUM_ASSET: &str = "evi-core.json.sha256";
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

/// Overridable so tests can serve fake releases from a local server
fn api() -> String {
    std::env::var("EVI_UPDATE_API").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "https://api.github.com".into()).trim_end_matches('/').to_string()
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

fn fetch(path: &str) -> Result<Option<Release>, String> {
    let mut res = get(&format!("{}/repos/{REPO}/{path}", api()), 15)?;
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
    Ok(Some(Release { version: clean_version(&data.tag_name), core_url: asset(CORE_ASSET), checksum_url: asset(CHECKSUM_ASSET), tag: data.tag_name }))
}

/// The latest published release, or None if nothing has been published yet. Drafts and prereleases never show up here.
pub fn latest() -> Result<Option<Release>, String> {
    fetch("releases/latest")
}

/// A release by version, e.g. the one this installer was built for
pub fn by_version(version: &str) -> Result<Option<Release>, String> {
    fetch(&format!("releases/tags/v{version}"))
}

fn download(url: &str, max: u64, timeout: u64) -> Result<Vec<u8>, String> {
    let mut res = get(url, timeout)?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("Download failed: {status} ({url})"));
    }
    res.body_mut().with_config().limit(max).read_to_vec().map_err(|e| format!("Download interrupted: {e}"))
}

pub fn has_core(release: &Release) -> bool {
    release.core_url.is_some() && release.checksum_url.is_some()
}

/// Downloads a release's evi-core.json and checks it against the published SHA-256
pub fn download_core(release: &Release, on_verify: impl FnOnce()) -> Result<CorePayload, String> {
    let (Some(core_url), Some(checksum_url)) = (&release.core_url, &release.checksum_url) else {
        return Err(format!("Release {} doesn’t include {CORE_ASSET}", release.tag));
    };
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
}
