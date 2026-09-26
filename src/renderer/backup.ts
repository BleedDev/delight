import type { ImportMode } from "@shared/backup";
import type { BackupApplyResult } from "@shared/ipc";

import { Native } from "./native";
import { PluginManager } from "./plugins/manager";
import { Settings } from "./settings";
import { QuickCss } from "./styles";
import { Themes } from "./themes";

/** Main reads settings and Quick CSS from disk, so pending debounced saves go out first */
function flush() {
    Settings.flush();
    QuickCss.flush();
}

export const Backup = {
    /** Asks where to save, then writes the backup file */
    export() {
        flush();
        return Native.exportBackup();
    },

    /** Asks for a backup file and previews what restoring it would change, in both modes */
    open() {
        flush();
        return Native.openBackup();
    },

    /** Restores the opened backup, then brings the running client in line without a reload */
    async apply(token: string, mode: ImportMode): Promise<BackupApplyResult> {
        flush();
        const result = await Native.applyBackup(token, mode);
        if (!result.ok) return result;

        const previous = Settings.data;
        Settings.replace(result.settings);
        // Theme files and Quick CSS were already announced by main, this applies the new switches
        Themes.apply();
        QuickCss.apply();
        await PluginManager.syncEnabled(previous);
        return result;
    },
};
