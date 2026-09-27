/**
 * Adds a "Evi" section to Discord's own settings sidebar.
 *
 * Discord describes its settings as a tree of layout nodes (ROOT > SECTION > SIDEBAR_ITEM > PANEL >
 * CATEGORY > CUSTOM), each with a lazy `buildLayout()`. We wrap the `$Root` node's buildLayout to
 * insert our section, using export hooks only, no source patches.
 */
import type { ComponentType } from "react";

import { Logger } from "../logger";
import { hook } from "../patching/hooks";
import { findExport, filters, waitFor } from "../webpack/find";
import { AccountTab } from "./AccountTab";
import { BackupTab } from "./BackupTab";
import { ErrorBoundary } from "./components";
import { ensureStyles } from "./index";
import { PatchesTab } from "./PatchesTab";
import { PatchHelperTab } from "./PatchHelperTab";
import { PluginsTab } from "./PluginsTab";
import { QuickCssTab } from "./QuickCssTab";
import { ThemesTab } from "./ThemesTab";

interface LayoutNode {
    key: string;
    type: number;
    buildLayout?(): LayoutNode[];
    [prop: string]: unknown;
}

type NodeTypes = Record<"SECTION" | "SIDEBAR_ITEM" | "PANEL" | "CATEGORY" | "CUSTOM", number>;

const logger = new Logger("SettingsEntry", "#8ab4f8");
const SECTION_KEY = "evi_section";
/** Our section goes right above this one */
const ANCHOR_KEY = "billing_section";
const SYM_WRAPPED = Symbol("evi.rootWrapped");

const iconPaths = {
    plugins: "M10 3a2 2 0 0 1 4 0v2h3a2 2 0 0 1 2 2v3h-2a2 2 0 0 0 0 4h2v3a2 2 0 0 1-2 2h-3v-2a2 2 0 0 0-4 0v2H7a2 2 0 0 1-2-2v-3h2a2 2 0 0 0 0-4H5V7a2 2 0 0 1 2-2h3z",
    themes: "M7 14a3 3 0 0 0-3 3c0 1.3-1.2 2-2 2 .9 1.2 2.5 2 4 2a4 4 0 0 0 4-4 3 3 0 0 0-3-3zm13.7-9.4-1.3-1.3a1 1 0 0 0-1.4 0L9 12.3l2.8 2.7 8.9-8.9a1 1 0 0 0 0-1.4z",
    css: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
    // Code brackets
    patchHelper: "M8.7 6.3a1 1 0 0 1 0 1.4L4.4 12l4.3 4.3a1 1 0 1 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0zm6.6 0a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4z",
    // Archive box
    backup: "M5 3h14a2 2 0 0 1 2 2v3H3V5a2 2 0 0 1 2-2zm-1 7h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zm5 3a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H9z",
    // Person
    account: "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 11c4.4 0 8 2.2 8 5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1c0-2.8 3.6-5 8-5z",
    patches: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z",
};

function makeIcon(path: string) {
    return function EviIcon({ className, width, height, size }: { className?: string; width?: number; height?: number; size?: unknown; }) {
        const px = width ?? height ?? (typeof size === "number" ? size : 20);
        return (
            <svg className={className} width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={path} />
            </svg>
        );
    };
}

function Embedded({ Tab }: { Tab: ComponentType; }) {
    return <div className="dl-root dl-embedded"><ErrorBoundary><Tab /></ErrorBoundary></div>;
}

function buildSection(types: NodeTypes): LayoutNode {
    const entry = (key: string, title: string, iconPath: string, Tab: ComponentType): LayoutNode => {
        const Component = () => <Embedded Tab={Tab} />;
        const custom: LayoutNode = { key: `evi_${key}_custom`, type: types.CUSTOM, Component, useSearchTerms: () => ["Evi", title] };
        const category: LayoutNode = { key: `evi_${key}_category`, type: types.CATEGORY, buildLayout: () => [custom] };
        const panel: LayoutNode = { key: `evi_${key}_panel`, type: types.PANEL, useTitle: () => title, buildLayout: () => [category] };
        return {
            key: `evi_${key}_sidebar_item`,
            type: types.SIDEBAR_ITEM,
            useTitle: () => title,
            icon: makeIcon(iconPath),
            buildLayout: () => [panel],
        };
    };

    const items = [
        entry("plugins", "Plugins", iconPaths.plugins, PluginsTab),
        entry("themes", "Themes", iconPaths.themes, ThemesTab),
        entry("quickcss", "Quick CSS", iconPaths.css, QuickCssTab),
        entry("backup", "Backup", iconPaths.backup, BackupTab),
        entry("account", "Account", iconPaths.account, AccountTab),
        entry("patches", "Patches", iconPaths.patches, PatchesTab),
        entry("patchhelper", "Patch Helper", iconPaths.patchHelper, PatchHelperTab),
    ];

    return { key: SECTION_KEY, type: types.SECTION, useTitle: () => "Evi", buildLayout: () => items };
}

function wrapRoot(root: LayoutNode, types: NodeTypes) {
    if ((root as any)[SYM_WRAPPED] || typeof root.buildLayout !== "function") return;
    (root as any)[SYM_WRAPPED] = true;

    const section = buildSection(types);
    hook(root, "buildLayout", "after", ({ result }) => {
        if (!Array.isArray(result) || result.some(n => n?.key === SECTION_KEY)) return;
        const anchor = result.findIndex(n => n?.key === ANCHOR_KEY);
        const layout = [...result];
        layout.splice(anchor === -1 ? 1 : anchor, 0, section);
        return layout;
    }, "evi-settings");
    logger.info("Added Evi to Discord settings");
}

const isRoot = (v: any) => v?.key === "$Root" && typeof v.buildLayout === "function";

export function installSettingsEntry() {
    ensureStyles();
    waitFor<NodeTypes>(filters.byProps("SECTION", "SIDEBAR_ITEM", "PANEL", "CATEGORY", "CUSTOM"), types => {
        // Discord doesn't export the root node, but passes it through this tree builder every time settings open
        waitFor(filters.byCode('"buildLayout"in', ".buildLayout().map("), (_, found) => {
            if (!found.key) return;
            hook(found.exports, found.key, "before", ({ args }) => {
                if (isRoot(args[0])) wrapRoot(args[0], types);
            }, "evi-settings");
        });
    });

    // Tell us if Discord reshaped its settings, instead of failing silently
    setTimeout(() => {
        if (!findExport(filters.byProps("SECTION", "SIDEBAR_ITEM", "PANEL", "CUSTOM"))) {
            logger.warn("Settings layout types not found, Evi isn't in Discord settings. Ctrl+Shift+D still works.");
        }
    }, 30_000);
}
