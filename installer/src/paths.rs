//! Where Evi's data lives, ported from src/cli/paths.ts.

use std::path::{Path, PathBuf};

/// Running as root through sudo: Linux installs live in root-owned folders, so that's the usual way there
pub fn is_sudo() -> bool {
    #[cfg(unix)]
    {
        let root = unsafe { libc::getuid() } == 0;
        root && matches!(std::env::var("SUDO_USER"), Ok(user) if !user.is_empty() && user != "root")
    }
    #[cfg(not(unix))]
    {
        false
    }
}

/// The home of whoever ran us, not root's under sudo: that's where their Discord keeps Evi's data
pub fn user_home() -> PathBuf {
    if is_sudo() {
        if let (Ok(user), Ok(passwd)) = (std::env::var("SUDO_USER"), std::fs::read_to_string("/etc/passwd")) {
            let prefix = format!("{user}:");
            if let Some(home) = passwd.lines().find(|l| l.starts_with(&prefix)).and_then(|l| l.split(':').nth(5)) {
                if !home.is_empty() {
                    return PathBuf::from(home);
                }
            }
        }
    }
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var).map(PathBuf::from).unwrap_or_default()
}

/// Electron's app.getPath("appData"), which the app's data folder lives in
pub fn app_data() -> PathBuf {
    if cfg!(windows) {
        return std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default();
    }
    if cfg!(target_os = "macos") {
        return user_home().join("Library").join("Application Support");
    }
    // sudo usually keeps XDG_CONFIG_HOME out, and root's would be the wrong one anyway
    match std::env::var("XDG_CONFIG_HOME") {
        Ok(dir) if !is_sudo() && !dir.is_empty() => PathBuf::from(dir),
        _ => user_home().join(".config"),
    }
}

/// %APPDATA%\Evi and its equivalents
pub fn data_dir() -> PathBuf {
    app_data().join("Evi")
}

/// Before the rename to Evi the data folder was %APPDATA%/Delight: move it over once
pub fn migrate_legacy_data_dir() {
    let app_data = app_data();
    if app_data.as_os_str().is_empty() {
        return;
    }
    let (current, legacy) = (app_data.join("Evi"), app_data.join("Delight"));
    if !current.exists() && legacy.exists() {
        let _ = std::fs::rename(legacy, current);
    }
}

/// Files we wrote as root under sudo go back to the user, or their Discord couldn't write its settings
pub fn give_back_to_user(path: &Path) {
    #[cfg(unix)]
    {
        if !is_sudo() {
            return;
        }
        let parse = |name: &str| std::env::var(name).ok().and_then(|v| v.parse::<u32>().ok());
        let (Some(uid), Some(gid)) = (parse("SUDO_UID"), parse("SUDO_GID")) else { return };
        fn walk(p: &Path, uid: u32, gid: u32) {
            if std::os::unix::fs::chown(p, Some(uid), Some(gid)).is_err() {
                return;
            }
            if std::fs::symlink_metadata(p).map(|m| m.is_dir()).unwrap_or(false) {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        walk(&entry.path(), uid, gid);
                    }
                }
            }
        }
        walk(path, uid, gid);
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// A path as Node's path.join would write it, so the loader's JSON matches the CLI's byte for byte
pub fn node_path(path: &Path) -> String {
    let s = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        s.replace('/', "\\")
    } else {
        s
    }
}
