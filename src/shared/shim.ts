/**
 * The loader that replaces Discord's resources/app.asar. Discord's original archive is renamed to
 * _app.asar and stays untouched. Electron always prefers app.asar over an app folder, so the
 * loader has to take the archive's place.
 *
 * If the core fails to load, it boots Discord vanilla instead of leaving the user with a dead client.
 */
import { createAsar } from "./asar";

export const SHIM_MARKER = "// evi-shim";
/** Markers of loaders written before the rename to Evi, so they can be upgraded and uninstalled */
export const LEGACY_SHIM_MARKERS = ["// delight-shim"];
export const ORIGINAL_ASAR = "_app.asar";

export interface ShimOptions {
    /** Absolute path to the core main.js */
    corePath: string;
    /** Extra plugin folder to load and watch (dev builds) */
    devPluginsDir?: string;
}

export function createShim({ corePath, devPluginsDir }: ShimOptions) {
    return `${SHIM_MARKER}
"use strict";
const path = require("path");
${devPluginsDir ? `process.env.EVI_DEV_PLUGINS = ${JSON.stringify(devPluginsDir)};\n` : ""}
// The bundler inlines __dirname at build time, so the core learns its location from us
global.__eviCoreDir = path.dirname(${JSON.stringify(corePath)});
// Evi's and Discord's code compile from a cache after the first start. A short folder: nodejs/node#66438
try {
    require("module").enableCompileCache(path.join(global.__eviCoreDir, "..", "cc"));
} catch { }
try {
    require(${JSON.stringify(corePath)});
} catch (err) {
    if (global.__eviLoadedDiscord) throw err;
    console.error("[Evi] Core failed to load, starting Discord without it.", err);
    const { app } = require("electron");
    const asar = path.join(__dirname, "..", ${JSON.stringify(ORIGINAL_ASAR)});
    const pkg = require(path.join(asar, "package.json"));
    require.main.filename = path.join(asar, pkg.main);
    app.setAppPath(asar);
    require(require.main.filename);
}
`;
}

/** Electron derives the app name (and so the userData folder) from this, so it must mirror Discord's. */
export function createShimPackage(discordPkg: { name?: string; productName?: string; }) {
    return JSON.stringify({ name: discordPkg.name ?? "discord", productName: discordPkg.productName, main: "index.js" }, null, 4);
}

export function createShimAsar(options: ShimOptions, discordPkg: { name?: string; productName?: string; }) {
    return createAsar({
        "index.js": createShim(options),
        "package.json": createShimPackage(discordPkg),
    });
}
