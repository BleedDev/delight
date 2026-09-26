import { ORIGINAL_ASAR } from "@shared/shim";
import { app } from "electron";
import { dirname, join } from "path";

// Electron's fs treats .asar files as folders, original-fs sees them as the plain files they are
const fs: typeof import("fs") = require("original-fs");

/**
 * Discord's updater installs each version into a fresh app-x.y.z folder, which would silently drop
 * us. Move our loader into any sibling version that lacks it, on startup and right before the
 * updater restarts Discord.
 *
 * @param shimAsar our loader archive, resources/app.asar of the running version
 */
export function persistAcrossUpdates(shimAsar: string) {
    if (process.platform !== "win32") return;

    const installRoot = dirname(dirname(dirname(shimAsar)));

    const run = () => {
        try {
            for (const dir of fs.readdirSync(installRoot)) {
                if (!dir.startsWith("app-")) continue;
                const resources = join(installRoot, dir, "resources");
                const asar = join(resources, "app.asar");
                const original = join(resources, ORIGINAL_ASAR);
                if (!fs.existsSync(asar) || fs.existsSync(original)) continue;

                fs.renameSync(asar, original);
                fs.copyFileSync(shimAsar, asar);
                console.log("[Delight] Injected into updated Discord at", resources);
            }
        } catch (err) {
            console.error("[Delight] Failed to persist across update", err);
        }
    };

    run();
    app.on("before-quit", run);
}
