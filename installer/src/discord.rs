//! Finding Discord installs, telling whether Evi is in them, and closing/starting them.
//! Ported from src/cli/discord.ts.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::asar::{read_asar_file, LEGACY_SHIM_MARKERS, ORIGINAL_ASAR, SHIM_MARKER};

/// (flavor, folder in %LOCALAPPDATA% and executable name, label)
pub const FLAVORS: [(&str, &str, &str); 4] = [
    ("stable", "Discord", "Stable"),
    ("ptb", "DiscordPTB", "PTB"),
    ("canary", "DiscordCanary", "Canary"),
    ("development", "DiscordDevelopment", "Development"),
];

fn flavor_entry(flavor: &str) -> Option<&'static (&'static str, &'static str, &'static str)> {
    FLAVORS.iter().find(|f| f.0 == flavor)
}

pub fn flavor_folder(flavor: &str) -> &'static str {
    flavor_entry(flavor).map_or("Discord", |f| f.1)
}

pub fn flavor_label(flavor: &str) -> &'static str {
    flavor_entry(flavor).map_or("Discord", |f| f.2)
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum InjectionState {
    Clean,
    Evi,
    OtherMod,
}

#[derive(Clone, Debug)]
pub struct DiscordVersion {
    pub version: String,
    pub resources: PathBuf,
}

#[derive(Clone, Debug)]
pub struct DiscordInstall {
    pub flavor: &'static str,
    /// %LOCALAPPDATA%\Discord on Windows, the .app bundle on macOS, the install folder on Linux
    pub root: PathBuf,
    /// app-x.y.z folders, newest first. macOS and Linux keep a single version in place
    pub versions: Vec<DiscordVersion>,
}

pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| s.split('.').map(|p| p.parse::<f64>().unwrap_or(f64::NAN)).collect::<Vec<_>>();
    let (pa, pb) = (parse(a), parse(b));
    for i in 0..pa.len().max(pb.len()) {
        let diff = pa.get(i).copied().unwrap_or(0.0) - pb.get(i).copied().unwrap_or(0.0);
        if diff > 0.0 {
            return std::cmp::Ordering::Greater;
        }
        if diff < 0.0 {
            return std::cmp::Ordering::Less;
        }
    }
    std::cmp::Ordering::Equal
}

/// Where find_installs looks, for the "not found" message
pub fn searched_locations() -> &'static str {
    if cfg!(windows) {
        "%LOCALAPPDATA%"
    } else if cfg!(target_os = "macos") {
        "/Applications and ~/Applications"
    } else {
        "/usr/share, /usr/lib, /opt, ~/.local/share and ~ (Flatpak and Snap aren't supported)"
    }
}

#[allow(dead_code)]
fn build_version(resources: &Path) -> String {
    std::fs::read_to_string(resources.join("build_info.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| match v.get("version") {
            Some(serde_json::Value::String(s)) => Some(s.clone()),
            Some(serde_json::Value::Null) | None => None,
            Some(other) => Some(other.to_string()),
        })
        .unwrap_or_else(|| "?".into())
}

#[cfg(windows)]
pub fn find_installs() -> Vec<DiscordInstall> {
    let Some(local) = std::env::var_os("LOCALAPPDATA").filter(|v| !v.is_empty()) else { return vec![] };
    let mut installs = Vec::new();
    for (flavor, folder, _) in FLAVORS {
        let root = PathBuf::from(&local).join(folder);
        let Ok(entries) = std::fs::read_dir(&root) else { continue };
        let mut versions: Vec<DiscordVersion> = entries
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                let digit = name.strip_prefix("app-").and_then(|rest| rest.chars().next()).is_some_and(|c| c.is_ascii_digit());
                let resources = root.join(&name).join("resources");
                (digit && resources.join("app.asar").exists()).then(|| DiscordVersion { version: name[4..].to_string(), resources })
            })
            .collect();
        versions.sort_by(|a, b| compare_versions(&b.version, &a.version));
        if !versions.is_empty() {
            installs.push(DiscordInstall { flavor, root, versions });
        }
    }
    installs
}

/// Discord keeps one version in place on macOS and Linux: the first candidate folder that has it wins
#[cfg(unix)]
fn find_in_place_installs(candidates: impl Fn(&str) -> Vec<PathBuf>, resources_dir: &Path) -> Vec<DiscordInstall> {
    let mut installs = Vec::new();
    for (flavor, _, _) in FLAVORS {
        let Some(found) = candidates(flavor).into_iter().find(|root| root.join(resources_dir).join("app.asar").exists()) else { continue };
        // /usr/share/discord is often a link to /opt/discord, and running processes report the real path
        let root = std::fs::canonicalize(&found).unwrap_or(found);
        let resources = root.join(resources_dir);
        installs.push(DiscordInstall { flavor, root, versions: vec![DiscordVersion { version: build_version(&resources), resources }] });
    }
    installs
}

#[cfg(target_os = "macos")]
pub fn find_installs() -> Vec<DiscordInstall> {
    let home = crate::paths::user_home();
    let app = |flavor: &str| match flavor {
        "ptb" => "Discord PTB.app",
        "canary" => "Discord Canary.app",
        "development" => "Discord Development.app",
        _ => "Discord.app",
    };
    find_in_place_installs(
        |flavor| vec![PathBuf::from("/Applications").join(app(flavor)), home.join("Applications").join(app(flavor))],
        &Path::new("Contents").join("Resources"),
    )
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn find_installs() -> Vec<DiscordInstall> {
    let home = crate::paths::user_home();
    find_in_place_installs(
        |flavor| {
            let slug = if flavor == "stable" { "discord".to_string() } else { format!("discord-{flavor}") };
            let folder = flavor_folder(flavor);
            vec![
                PathBuf::from(format!("/usr/share/{slug}")),
                PathBuf::from(format!("/usr/lib/{slug}")),
                PathBuf::from(format!("/usr/lib64/{slug}")),
                PathBuf::from(format!("/opt/{slug}")),
                PathBuf::from(format!("/opt/{folder}")),
                // The tarball unpacks to ~/Discord, ~/DiscordCanary...
                home.join(".local").join("share").join(&slug),
                home.join(folder),
            ]
        },
        Path::new("resources"),
    )
}

pub fn is_our_shim(asar: &Path) -> bool {
    if !std::fs::metadata(asar).map(|m| m.is_file()).unwrap_or(false) {
        return false;
    }
    match read_asar_file(asar, "index.js") {
        Ok(code) => std::iter::once(SHIM_MARKER).chain(LEGACY_SHIM_MARKERS.iter().copied()).any(|m| code.starts_with(m)),
        Err(_) => false,
    }
}

/// Loaders are a few KB, Discord's own archive is megabytes. On Linux a package upgrade puts Discord's
/// archive back as app.asar and leaves the old _app.asar beside it, which isn't another mod.
#[allow(dead_code)]
fn is_discord_archive(asar: &Path) -> bool {
    std::fs::metadata(asar).map(|m| m.len() > 256 * 1024).unwrap_or(false)
}

pub fn injection_state(resources: &Path) -> InjectionState {
    let asar = resources.join("app.asar");
    if is_our_shim(&asar) {
        return InjectionState::Evi;
    }
    if !cfg!(windows) && is_discord_archive(&asar) && !resources.join("app").exists() {
        return InjectionState::Clean;
    }
    // Vencord, Equicord and friends use the same _app.asar swap, or an app folder
    if resources.join(ORIGINAL_ASAR).exists() || resources.join("app").exists() {
        return InjectionState::OtherMod;
    }
    InjectionState::Clean
}

/// Which Evi the loader starts: the core folder it points at, read back from the loader's code
pub fn shim_core_dir(resources: &Path) -> Option<PathBuf> {
    let code = read_asar_file(&resources.join("app.asar"), "index.js").ok()?;
    // Every require("…") of a JSON string literal; the core's main.js is the one the loader starts
    code.match_indices("require(\"").find_map(|(i, _)| {
        let mut strings = serde_json::Deserializer::from_str(&code[i + "require(".len()..]).into_iter::<String>();
        let path = strings.next()?.ok()?;
        path.ends_with("main.js").then(|| Path::new(&path).parent().map(Path::to_path_buf)).flatten()
    })
}

/// The version of the core in a folder: the build inlines it into main.js's startup line
pub fn core_version(core_dir: &Path) -> Option<String> {
    let main = std::fs::read_to_string(core_dir.join("main.js")).ok()?;
    let marker = "[Evi] v${\"";
    let start = main.find(marker)? + marker.len();
    let len = main[start..].find('"')?;
    let version = &main[start..start + len];
    (!version.is_empty() && version.len() < 40).then(|| version.to_string())
}

#[cfg(windows)]
fn discord_processes(install: &DiscordInstall) -> Vec<u32> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};

    let exe_name = format!("{}.exe", flavor_folder(install.flavor)).to_lowercase();
    let root = format!("{}\\", install.root.to_string_lossy().to_lowercase());
    let mut pids = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return pids;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut entry);
        while ok != 0 {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
            if name == exe_name {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
                if !handle.is_null() {
                    let mut buf = [0u16; 1024];
                    let mut size = buf.len() as u32;
                    if QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size) != 0 {
                        let path = String::from_utf16_lossy(&buf[..size as usize]).to_lowercase();
                        if path.starts_with(&root) {
                            pids.push(entry.th32ProcessID);
                        }
                    }
                    CloseHandle(handle);
                }
            }
            ok = Process32NextW(snap, &mut entry);
        }
        CloseHandle(snap);
    }
    pids
}

/// Every process's executable: /proc on Linux, ps on macOS (where the comm column is the full path)
#[cfg(unix)]
fn unix_processes() -> Vec<(u32, String)> {
    if cfg!(target_os = "linux") {
        let Ok(entries) = std::fs::read_dir("/proc") else { return vec![] };
        return entries
            .flatten()
            .filter_map(|e| {
                let pid = e.file_name().to_string_lossy().parse::<u32>().ok()?;
                let exe = std::fs::read_link(e.path().join("exe")).ok()?;
                Some((pid, exe.to_string_lossy().into_owned()))
            })
            .collect();
    }
    let Ok(out) = std::process::Command::new("ps").args(["-axww", "-o", "pid=,comm="]).output() else { return vec![] };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim_start();
            let (pid, exe) = line.split_once(char::is_whitespace)?;
            Some((pid.parse().ok()?, exe.trim().to_string()))
        })
        .collect()
}

/// Ids of this install's running processes. Matched by path, so other installs are never touched.
#[cfg(unix)]
fn discord_processes(install: &DiscordInstall) -> Vec<u32> {
    let root = format!("{}/", install.root.to_string_lossy());
    let me = std::process::id();
    unix_processes().into_iter().filter(|(pid, exe)| *pid != me && exe.starts_with(&root)).map(|(pid, _)| pid).collect()
}

pub fn is_discord_running(install: &DiscordInstall) -> bool {
    !discord_processes(install).is_empty()
}

fn wait_until_closed(install: &DiscordInstall, tries: u32) {
    for _ in 0..tries {
        if !is_discord_running(install) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

pub fn kill_discord(install: &DiscordInstall) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
        for pid in discord_processes(install) {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if !handle.is_null() {
                TerminateProcess(handle, 1);
                CloseHandle(handle);
            }
        }
    }
    #[cfg(unix)]
    {
        let signal = |sig: i32| {
            for pid in discord_processes(install) {
                unsafe { libc::kill(pid as i32, sig) };
            }
        };
        // A chance to quit cleanly first, like the tray's Quit
        signal(libc::SIGTERM);
        wait_until_closed(install, 30);
        signal(libc::SIGKILL);
    }
    // Wait until every process is gone, the archive stays locked until then
    wait_until_closed(install, 50);
}

/// False when Discord has to be started by hand: under sudo it would run as root
pub fn start_discord(install: &DiscordInstall) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        std::process::Command::new(install.root.join("Update.exe"))
            .args(["--processStart", &format!("{}.exe", flavor_folder(install.flavor))])
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn()
            .is_ok()
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        use std::process::Stdio;
        if crate::paths::is_sudo() {
            return false;
        }
        let mut cmd = if cfg!(target_os = "macos") {
            let mut c = std::process::Command::new("open");
            c.arg(&install.root);
            c
        } else {
            std::process::Command::new(install.root.join(flavor_folder(install.flavor)))
        };
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).process_group(0).spawn().is_ok()
    }
}
