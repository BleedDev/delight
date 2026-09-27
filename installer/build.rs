fn main() {
    // tauri.conf.json takes the version from here, so a version bump has to rebuild
    println!("cargo:rerun-if-changed=../package.json");
    tauri_build::build()
}
