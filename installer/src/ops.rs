//! Install, uninstall and status, ported from src/cli/index.ts. The difference from the CLI: the core
//! comes from a release download instead of being embedded, and Discord is always closed and started
//! again (the GUI's buttons are the --restart).

use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::asar::{create_shim_asar, read_asar_file, ORIGINAL_ASAR};
use crate::discord::{self, DiscordInstall, InjectionState};
use crate::paths;
use crate::release::{self, CorePayload};

/// Mirrors src/shared/store.ts
const REMOVED_PLUGINS_FILE: &str = "removed-plugins.json";
const STORE_MARKER: &str = ".evi-store.json";
const RETIRED_PLUGINS: &[&str] = &["badges", "toolkit-demo"];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallInfo {
    pub flavor: &'static str,
    pub label: &'static str,
    /// "missing" when this Discord isn't installed, otherwise clean, evi or other-mod
    pub state: String,
    pub discord_version: Option<String>,
    pub evi_version: Option<String>,
    /// The loader points at a repo's build (evi install --dev) rather than the data folder
    pub dev_build: bool,
    pub running: bool,
    pub path: Option<String>,
}

pub fn status() -> Vec<InstallInfo> {
    let found = discord::find_installs();
    let core_dir = paths::data_dir().join("core");
    discord::FLAVORS
        .iter()
        .map(|&(flavor, _, label)| {
            let Some(install) = found.iter().find(|i| i.flavor == flavor) else {
                return InstallInfo { flavor, label, state: "missing".into(), discord_version: None, evi_version: None, dev_build: false, running: false, path: None };
            };
            let latest = &install.versions[0];
            let state = discord::injection_state(&latest.resources);
            let shim_core = (state == InjectionState::Evi).then(|| discord::shim_core_dir(&latest.resources)).flatten();
            let dev_build = shim_core.as_ref().is_some_and(|dir| !same_path(dir, &core_dir));
            InstallInfo {
                flavor,
                label,
                state: serde_json::to_value(state).unwrap().as_str().unwrap().to_string(),
                discord_version: Some(latest.version.clone()),
                evi_version: shim_core.as_deref().and_then(discord::core_version),
                dev_build,
                running: discord::is_discord_running(install),
                path: Some(install.root.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| paths::node_path(p).trim_end_matches(['/', '\\']).to_string();
    if cfg!(windows) {
        norm(a).eq_ignore_ascii_case(&norm(b))
    } else {
        norm(a) == norm(b)
    }
}

/// Plugin ids and file names come from a download: never let one reach outside its folder
fn safe_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':', '\0'])
}

/// src/shared/store.ts isPluginId
fn is_plugin_id(id: &str) -> bool {
    let b = id.as_bytes();
    let ok = |c: &u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    !b.is_empty() && b.len() <= 64 && ok(&b[0]) && ok(&b[b.len() - 1]) && b.iter().all(|c| ok(c) || *c == b'-')
}

fn removed_plugins(data_dir: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(data_dir.join(REMOVED_PLUGINS_FILE)) else { return vec![] };
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(serde_json::Value::Array(list)) => list.iter().filter_map(|v| v.as_str()).filter(|id| is_plugin_id(id)).map(String::from).collect(),
        _ => vec![],
    }
}

/// Writes the core into the data folder and refreshes official plugins already there. Returns the path the loader points at.
pub fn prepare_core(payload: &CorePayload) -> io::Result<PathBuf> {
    let data_dir = paths::data_dir();
    let bad = |what: &str| io::Error::new(io::ErrorKind::InvalidData, format!("{} has an unsafe {what}", release::CORE_ASSET));
    if payload.core.keys().any(|f| !safe_name(f)) {
        return Err(bad("core file name"));
    }
    if payload.plugins.iter().any(|(id, files)| !safe_name(id) || files.keys().any(|f| !safe_name(f))) {
        return Err(bad("plugin file name"));
    }

    let core_dir = data_dir.join("core");
    let _ = std::fs::remove_dir_all(&core_dir);
    std::fs::create_dir_all(&core_dir)?;
    for (file, content) in &payload.core {
        std::fs::write(core_dir.join(file), content)?;
    }
    std::fs::write(core_dir.join("package.json"), r#"{"type":"commonjs"}"#)?;

    // Evi comes with no plugins: they're added from the store. Official plugins someone already has
    // (from before, when every install laid them all down) are kept up to date; ones they removed or
    // installed from the store are left alone, and nothing new is added.
    let removed = removed_plugins(&data_dir);
    for (id, files) in &payload.plugins {
        let dir = data_dir.join("plugins").join(id);
        if removed.contains(id) || !dir.join("manifest.json").exists() || dir.join(STORE_MARKER).exists() {
            continue;
        }
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        for (file, content) in files {
            std::fs::write(dir.join(file), content)?;
        }
    }

    // Official plugins that are now part of Evi itself would show up twice
    let retired = RETIRED_PLUGINS.iter().map(|s| s.to_string()).chain(payload.retired.iter().filter(|id| safe_name(id)).cloned());
    for id in retired {
        let dir = data_dir.join("plugins").join(&id);
        if !dir.join(STORE_MARKER).exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
    paths::give_back_to_user(&data_dir);

    Ok(core_dir.join("main.js"))
}

/// Why the archives couldn't be swapped, in plain words with what to do about it
fn explain(install: &DiscordInstall, err: &io::Error) -> String {
    let root = install.root.display();
    // Windows: access denied, file in use. Elsewhere: EPERM, EACCES
    let codes: &[i32] = if cfg!(windows) { &[5, 32] } else { &[1, 13] };
    if err.kind() == io::ErrorKind::PermissionDenied || err.raw_os_error().is_some_and(|c| codes.contains(&c)) {
        if cfg!(target_os = "macos") {
            return format!("macOS didn’t let the installer change {root}. Allow it in System Settings > Privacy & Security > App Management, then try again.");
        }
        if cfg!(windows) {
            return format!("Windows didn’t let the installer change {root}. Quit Discord fully (tray icon > Quit) and try again.");
        }
        if !paths::is_sudo() {
            return format!("{root} belongs to root. Install from a terminal instead: sudo ./evi-linux-x64 install (see the README).");
        }
    }
    format!("Couldn’t change {root}: {err}")
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub flavor: &'static str,
    pub label: &'static str,
    pub ok: bool,
    pub message: String,
}

pub struct Progress<'a>(pub &'a dyn Fn(&str));

/// Closes Discord if it's running (the archive is locked while it is), runs the swap, and reports
/// whether Discord was running. Starting it again is up to the caller.
fn with_discord_closed(install: &DiscordInstall, progress: &Progress, action: impl FnOnce() -> io::Result<()>) -> Result<bool, String> {
    let running = discord::is_discord_running(install);
    if running {
        (progress.0)(&format!("Closing Discord {}…", discord::flavor_label(install.flavor)));
        discord::kill_discord(install);
    }
    action().map(|_| running).map_err(|e| explain(install, &e))
}

pub struct RunResult {
    pub outcomes: Vec<Outcome>,
    /// Discords we closed or installed into, to start again
    pub restart: Vec<DiscordInstall>,
}

pub fn install(flavors: &[String], payload: &CorePayload, progress: &Progress) -> Result<RunResult, String> {
    let installs = selected(flavors)?;
    (progress.0)("Writing Evi’s files…");
    let core_path = prepare_core(payload).map_err(|e| format!("Couldn’t write Evi’s files to {}: {e}", paths::data_dir().display()))?;
    let core_path = paths::node_path(&core_path);

    let mut result = RunResult { outcomes: vec![], restart: vec![] };
    for discord in installs {
        let label = discord::flavor_label(discord.flavor);
        let latest = &discord.versions[0];
        let state = discord::injection_state(&latest.resources);
        let asar = latest.resources.join("app.asar");
        let original = latest.resources.join(ORIGINAL_ASAR);
        let outcome = |ok, message: String| Outcome { flavor: discord.flavor, label, ok, message };

        if state == InjectionState::OtherMod {
            result.outcomes.push(outcome(false, format!("Another client mod (Vencord, Equicord, …) is installed in Discord {label}. Uninstall it first.")));
            continue;
        }
        (progress.0)(&format!("Installing into Discord {label}…"));
        let swapped = with_discord_closed(&discord, progress, || {
            if state == InjectionState::Clean {
                std::fs::rename(&asar, &original)?;
            }
            let pkg: serde_json::Value = serde_json::from_str(&read_asar_file(&original, "package.json")?)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("Discord’s package.json is broken: {e}")))?;
            std::fs::write(&asar, create_shim_asar(&core_path, &pkg))
        });
        match swapped {
            Ok(_) => {
                let verb = if state == InjectionState::Evi { "Updated" } else { "Installed" };
                result.outcomes.push(outcome(true, format!("{verb} Evi {} in Discord {label} {}", payload.version, latest.version)));
                result.restart.push(discord.clone());
            }
            Err(message) => result.outcomes.push(outcome(false, message)),
        }
    }
    Ok(result)
}

pub fn uninstall(flavors: &[String], progress: &Progress) -> Result<RunResult, String> {
    let mut result = RunResult { outcomes: vec![], restart: vec![] };
    for discord in selected(flavors)? {
        let label = discord::flavor_label(discord.flavor);
        (progress.0)(&format!("Removing Evi from Discord {label}…"));
        let mut removed = 0;
        // Every version folder, the auto-repair may have injected older ones too
        let swapped = with_discord_closed(&discord, progress, || {
            for v in &discord.versions {
                if discord::injection_state(&v.resources) != InjectionState::Evi {
                    continue;
                }
                let asar = v.resources.join("app.asar");
                std::fs::remove_file(&asar)?;
                std::fs::rename(v.resources.join(ORIGINAL_ASAR), &asar)?;
                removed += 1;
            }
            Ok(())
        });
        let outcome = |ok, message: String| Outcome { flavor: discord.flavor, label, ok, message };
        match swapped {
            Ok(was_running) => {
                if was_running {
                    result.restart.push(discord.clone());
                }
                let message = if removed > 0 { format!("Removed Evi from Discord {label}") } else { format!("Evi wasn’t installed in Discord {label}") };
                result.outcomes.push(outcome(true, message));
            }
            Err(message) => result.outcomes.push(outcome(false, message)),
        }
    }
    Ok(result)
}

fn selected(flavors: &[String]) -> Result<Vec<DiscordInstall>, String> {
    let installs = discord::find_installs();
    if installs.is_empty() {
        return Err(format!("No Discord installation found in {}.", discord::searched_locations()));
    }
    let all = flavors.iter().any(|f| f == "all");
    let picked: Vec<_> = installs.into_iter().filter(|i| all || flavors.iter().any(|f| f == i.flavor)).collect();
    if picked.is_empty() {
        return Err("None of the chosen Discord installs were found.".into());
    }
    Ok(picked)
}

/// Starts the Discords again. Returns the labels that have to be started by hand (under sudo).
pub fn restart(installs: &[DiscordInstall]) -> Vec<&'static str> {
    installs.iter().filter(|i| !discord::start_discord(i)).map(|i| discord::flavor_label(i.flavor)).collect()
}
