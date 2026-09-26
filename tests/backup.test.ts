import { describe, expect, test } from "bun:test";

import { backupFileName, BackupSource, buildBackup, EviBackup, MAX_BACKUP_BYTES, parseBackup, planImport } from "../src/shared/backup";
import type { PluginManifest } from "../src/shared/ipc";

const manifest = (id: string, name: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({ id, name, ...extra });

function source(): BackupSource {
    return {
        settings: {
            plugins: {
                alpha: { enabled: true, settings: { volume: 3, mode: "a" } },
                beta: { enabled: false },
            },
            quickCss: true,
            enabledThemes: ["dark.css"],
        },
        quickCss: "body { color: red; }",
        themes: [{ file: "dark.css", css: ":root { --x: dark; }" }, { file: "light.css", css: ":root { --x: light; }" }],
        plugins: [
            { manifest: manifest("alpha", "Alpha"), source: "user" },
            { manifest: manifest("beta", "Beta"), source: "user" },
            { manifest: manifest("gamma", "Gamma", { enabledByDefault: true }), source: "dev" },
        ],
    };
}

const NOW = new Date("2026-09-26T10:20:30Z");
const roundTrip = (backup: EviBackup) => {
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.backup;
};

describe("building a backup", () => {
    test("captures settings, quick css, themes and the plugin list without code", () => {
        const backup = buildBackup(source(), "1.2.3", NOW);
        expect(backup).toMatchObject({ format: "evi-backup", version: 1, createdAt: "2026-09-26T10:20:30.000Z", eviVersion: "1.2.3" });
        expect(backup.quickCss).toBe("body { color: red; }");
        expect(backup.themes.map(t => t.file)).toEqual(["dark.css", "light.css"]);
        expect(backup.plugins).toEqual([
            { id: "alpha", name: "Alpha", source: "user", enabled: true },
            { id: "beta", name: "Beta", source: "user", enabled: false },
            // Enabled by default, no settings entry
            { id: "gamma", name: "Gamma", source: "dev", enabled: true },
        ]);
        expect(JSON.stringify(backup)).not.toContain("code");
    });

    test("is a deep copy", () => {
        const state = source();
        const backup = buildBackup(state, "1", NOW);
        backup.settings.plugins.alpha.settings!.volume = 99;
        expect(state.settings.plugins.alpha.settings!.volume).toBe(3);
    });

    test("default file name uses the local date", () => {
        expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe("evi-backup-2026-01-05.json");
    });

    test("survives a round trip through validation", () => {
        const backup = buildBackup(source(), "1.2.3", NOW);
        expect(roundTrip(backup)).toEqual(backup);
        // A BOM from an editor is fine
        expect(parseBackup("\uFEFF" + JSON.stringify(backup)).ok).toBe(true);
    });
});

describe("validation", () => {
    const valid = () => JSON.parse(JSON.stringify(buildBackup(source(), "1.2.3", NOW)));
    const errorOf = (value: unknown) => {
        const result = parseBackup(typeof value === "string" ? value : JSON.stringify(value));
        return result.ok ? null : result.error;
    };

    test("rejects files that aren't backups", () => {
        expect(errorOf("not json")).toMatch(/JSON/);
        expect(errorOf([])).toMatch(/isn't a Evi backup/);
        expect(errorOf({ ...valid(), format: "vencord" })).toMatch(/isn't a Evi backup/);
    });

    test("rejects other versions", () => {
        expect(errorOf({ ...valid(), version: 2 })).toMatch(/newer Evi/);
        expect(errorOf({ ...valid(), version: 0 })).toMatch(/Unsupported/);
        expect(errorOf({ ...valid(), version: "1" })).toMatch(/version/);
    });

    test("checks every field's type", () => {
        const cases: [(b: any) => void, RegExp][] = [
            [b => b.createdAt = "yesterday", /date/],
            [b => b.eviVersion = 1, /eviVersion/],
            [b => b.quickCss = null, /quickCss/],
            [b => b.settings = [], /settings must be/],
            [b => b.settings.plugins = null, /settings.plugins/],
            [b => b.settings.plugins.alpha.enabled = "yes", /alpha.enabled/],
            [b => b.settings.plugins.alpha.settings = [1], /alpha.settings/],
            [b => b.settings.quickCss = 1, /settings.quickCss/],
            [b => b.settings.enabledThemes = "dark.css", /enabledThemes/],
            [b => b.settings.enabledThemes = [1], /enabledThemes\[0\]/],
            [b => b.themes = {}, /themes must be a list/],
            [b => b.themes[0].css = 5, /themes\[0\].css/],
            [b => b.plugins[0].source = "web", /source/],
            [b => b.plugins[0].enabled = 1, /enabled/],
        ];
        for (const [mutate, error] of cases) {
            const b = valid();
            mutate(b);
            expect(errorOf(b)).toMatch(error);
        }
    });

    test("theme file names can't leave the themes folder", () => {
        for (const file of ["../evil.css", "..\\evil.css", "C:\\x.css", "sub/x.css", ".hidden.css", "x.js", "a:b.css", "nul\0.css"]) {
            const b = valid();
            b.themes[0].file = file;
            expect(errorOf(b)).toMatch(/unsafe file name/);
        }
    });

    test("rejects duplicate theme files, case-insensitively", () => {
        const b = valid();
        b.themes[1].file = "DARK.css";
        expect(errorOf(b)).toMatch(/twice/);
    });

    test("rejects prototype keys", () => {
        const b = valid();
        const text = JSON.stringify(b).replace('"alpha":', '"__proto__":');
        expect(errorOf(text)).toMatch(/invalid name/);
        const c = valid();
        c.settings.plugins.alpha.settings = JSON.parse('{"constructor": 1}');
        expect(errorOf(c)).toMatch(/invalid name/);
    });

    test("size cap", () => {
        expect(errorOf(" ".repeat(MAX_BACKUP_BYTES + 1))).toMatch(/larger than/);
    });

    test("drops unknown keys instead of passing them through", () => {
        const b = valid();
        b.extra = 1;
        b.settings.somethingNew = true;
        b.settings.plugins.alpha.junk = 1;
        const parsed = parseBackup(JSON.stringify(b));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect("extra" in parsed.backup).toBe(false);
        expect("somethingNew" in parsed.backup.settings).toBe(false);
        expect(parsed.backup.settings.plugins.alpha).toEqual({ enabled: true, settings: { volume: 3, mode: "a" } });
    });
});

describe("import planning", () => {
    /** A backup from another machine */
    function other(): EviBackup {
        return roundTrip({
            format: "evi-backup",
            version: 1,
            createdAt: NOW.toISOString(),
            eviVersion: "1.0.0",
            settings: {
                plugins: {
                    alpha: { enabled: false, settings: { volume: 7 } },
                    beta: { enabled: true, settings: { size: 2 } },
                    remote: { enabled: true, settings: { token: "x" } },
                },
                quickCss: false,
                enabledThemes: ["Light.css", "new.css"],
            },
            quickCss: "a { color: blue; }",
            themes: [
                { file: "dark.css", css: ":root { --x: dark; }" },
                { file: "Light.css", css: ":root { --x: LIGHT; }" },
                { file: "new.css", css: ":root { --x: new; }" },
            ],
            plugins: [
                { id: "alpha", name: "Alpha", source: "user", enabled: false },
                { id: "beta", name: "Beta", source: "user", enabled: true },
                { id: "remote", name: "Remote", source: "user", enabled: true },
                { id: "devonly", name: "Dev Only", source: "dev", enabled: true },
            ],
        });
    }

    test("replace takes the backup's settings and quick css", () => {
        const plan = planImport(source(), other(), "replace");
        expect(plan.settings.plugins).toEqual(other().settings.plugins);
        expect(plan.settings.quickCss).toBe(false);
        // Mapped onto the existing file's case
        expect(plan.settings.enabledThemes).toEqual(["light.css", "new.css"]);
        expect(plan.quickCss).toBe("a { color: blue; }");
        expect(plan.themes).toEqual([{ file: "light.css", css: ":root { --x: LIGHT; }" }, { file: "new.css", css: ":root { --x: new; }" }]);

        const p = plan.preview;
        expect(p.pluginsEnabled).toEqual(["Beta"]);
        expect(p.pluginsDisabled).toEqual(["Alpha"]);
        expect(p.pluginSettingsChanged).toEqual(["Alpha", "Beta", "Remote"]);
        expect(p.missingPlugins.map(m => m.id)).toEqual(["remote", "devonly"]);
        expect(p.themesAdded).toEqual(["new.css"]);
        expect(p.themesOverwritten).toEqual(["light.css"]);
        expect(p.themesEnabled).toEqual(["light.css", "new.css"]);
        expect(p.themesDisabled).toEqual(["dark.css"]);
        expect(p.quickCss).toBe("replaced");
        expect(p.quickCssToggle).toBe(false);
        expect(p.changes).toBeGreaterThan(0);
    });

    test("merge keeps what the backup doesn't mention", () => {
        const state = source();
        state.settings.plugins.mine = { enabled: true, settings: { keep: 1 } };
        const plan = planImport(state, other(), "merge");
        expect(plan.settings.plugins.alpha).toEqual({ enabled: false, settings: { volume: 7, mode: "a" } });
        expect(plan.settings.plugins.mine).toEqual({ enabled: true, settings: { keep: 1 } });
        expect(plan.settings.plugins.remote).toEqual({ enabled: true, settings: { token: "x" } });
        expect(plan.settings.enabledThemes).toEqual(["dark.css", "light.css", "new.css"]);
        // Existing quick css isn't thrown away when merging
        expect(plan.quickCss).toBeNull();
        expect(plan.preview.quickCss).toBe("kept");
        expect(plan.preview.themesDisabled).toEqual([]);
        expect(plan.preview.pluginSettingsChanged).toEqual(["Alpha", "Beta", "Remote"]);
    });

    test("merge fills in empty quick css", () => {
        const state = source();
        state.quickCss = "  \n";
        const plan = planImport(state, other(), "merge");
        expect(plan.quickCss).toBe("a { color: blue; }");
        expect(plan.preview.quickCss).toBe("replaced");
    });

    test("never mutates the current state or the backup", () => {
        const state = source();
        const backup = other();
        const before = JSON.stringify([state, backup]);
        const plan = planImport(state, backup, "merge");
        plan.settings.plugins.alpha.settings!.volume = 0;
        planImport(state, backup, "replace").settings.plugins.beta.settings!.size = 0;
        expect(JSON.stringify([state, backup])).toBe(before);
    });

    test("restoring your own backup changes nothing", () => {
        const state = source();
        const backup = roundTrip(buildBackup(state, "1", NOW));
        for (const mode of ["merge", "replace"] as const) {
            const plan = planImport(state, backup, mode);
            expect(plan.preview.changes).toBe(0);
            expect(plan.themes).toEqual([]);
            expect(plan.quickCss).toBeNull();
        }
    });

    test("enabledByDefault plugins count as enabled", () => {
        const state = source();
        const backup = roundTrip(buildBackup(state, "1", NOW));
        backup.settings.plugins.gamma = { enabled: false };
        expect(planImport(state, backup, "merge").preview.pluginsDisabled).toEqual(["Gamma"]);
    });
});
