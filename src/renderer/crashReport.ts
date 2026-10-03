/**
 * A plain-text report for a plugin that failed: everything a plugin author needs to reproduce it,
 * and nothing personal (no messages, tokens, user ids or file paths beyond the plugin's own id).
 * Copy crash report and Send to author both use it, so what's sent is exactly what can be copied.
 */
import { isPluginEnabled } from "@shared/ipc";

import { getPatchRecords } from "./patching/source";
import { diagnoseLookups } from "./plugins/lookups";
import { PluginManager, PluginState } from "./plugins/manager";
import { SafeMode } from "./safeMode";
import { Settings } from "./settings";
import { Store } from "./store";

/** Discord's build id, "unknown" where Discord doesn't say (it always does in the app) */
export function discordBuild(): string {
    const id = (window as any).GLOBAL_ENV?.SENTRY_TAGS?.buildId;
    return typeof id === "string" && /^[0-9a-z._-]{1,64}$/i.test(id) ? id : "unknown";
}

export function buildCrashReport(state: PluginState, now = new Date()) {
    const { manifest } = state;
    const env = (window as any).GLOBAL_ENV ?? {};
    const installed = Store.installedPlugin(manifest.id);
    const origin = state.source === "dev" ? "dev build" : installed?.fromStore ? "store" : "plugins folder";

    const lines = [
        `Evi crash report: ${manifest.name} (${manifest.id})`,
        "",
        `Plugin:   ${manifest.id} v${manifest.version ?? "?"}, from the ${origin}${manifest.native ? ", native" : ""}`,
        `Evi:      ${EVI_VERSION}${SafeMode.active ? " (safe mode)" : ""}`,
        `Discord:  ${env.RELEASE_CHANNEL ?? "unknown channel"}${env.SENTRY_TAGS?.buildId ? `, build ${env.SENTRY_TAGS.buildId}` : ""}`,
        `Browser:  ${navigator.userAgent}`,
        `When:     ${now.toISOString()}`,
        "",
        "Error:",
        indent(state.error ?? "(none recorded)"),
    ];

    const patches = getPatchRecords(manifest.id);
    if (patches.length) {
        lines.push("", "Source patches:");
        for (const r of patches) {
            const find = r.patch.find instanceof RegExp ? String(r.patch.find) : JSON.stringify(r.patch.find);
            lines.push(`  #${r.index} ${r.state}, find ${find}${r.modules.length ? `, modules ${r.modules.join(", ")}` : ""}`);
            for (const e of r.errors) lines.push(`      ${e}`);
        }
    }

    const lookups = diagnoseLookups(manifest.id);
    if (lookups.length) {
        lines.push("", "Lookups (waitFor, hookExport):");
        for (const d of lookups) {
            lines.push(`  ${d.health}, ${d.target}${d.candidates.length ? `, candidate modules ${d.candidates.join(", ")}` : ""}`);
        }
    }

    // Store plugins only: anything else may be someone's own, and its name is theirs to share
    const others = PluginManager.getSnapshot()
        .filter(p => p.manifest.id !== manifest.id && isPluginEnabled(Settings.data, p.manifest) && Store.installedPlugin(p.manifest.id)?.fromStore)
        .map(p => `${p.manifest.id}@${p.manifest.version ?? "?"}`);
    lines.push("", `Other enabled store plugins: ${others.length ? others.join(", ") : "none"}`);

    return lines.join("\n");
}

const indent = (text: string) => text.split("\n").map(l => `  ${l}`).join("\n");

/** Discord's own clipboard where it has one (the desktop app), the browser's otherwise */
export async function copyText(text: string) {
    const native = (window as any).DiscordNative?.clipboard;
    if (native?.copy) native.copy(text);
    else await navigator.clipboard.writeText(text);
}
