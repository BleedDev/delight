import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { LOCALES } from "../src/shared/locales";
import { missingTranslations, PLUGIN_LANGUAGES, stringTables } from "../src/shared/pluginTranslations";

const DIST = join(import.meta.dir, "..", "dist", "plugins");
const all = (value: object) => Object.fromEntries(["en", ...PLUGIN_LANGUAGES].map(l => [l, value]));
const manifest = (extra: object = {}) => ({
    id: "x", name: "X", description: "Does a thing.", version: "1.0.0",
    changelog: [{ version: "1.0.0", notes: ["First release."] }],
    locales: Object.fromEntries(PLUGIN_LANGUAGES.map(l => [l, { name: "X", description: "…", changelog: { "1.0.0": ["…"] } }])),
    ...extra,
});

describe("every plugin speaks every language", () => {
    test("the list is Evi's own languages besides English", () => {
        expect([...PLUGIN_LANGUAGES].sort() as string[]).toEqual(LOCALES.filter(l => l !== "en").sort());
    });

    test("reads defineStrings tables from built code, quotes, getters, templates and comments included", () => {
        const code = `var t = (0, import_api.defineStrings)({
  en: { "a.b": "One, two", c: \`x \${"}"} y\`, /* d: "no" */ get e() { return "{"; }, "f": 'it\\'s' },
  de: { "a.b": "Eins", c: "x" },
});`;
        const [table] = stringTables(code);
        expect([...table.get("en")!]).toEqual(["a.b", "c", "f"]);
        expect([...table.get("de")!]).toEqual(["a.b", "c"]);
    });

    test("a missing key, language or manifest translation is named", () => {
        const strings = all({ hi: "Hi", bye: "Bye" });
        const ok = `defineStrings(${JSON.stringify(strings)})`;
        expect(missingTranslations(manifest(), ok)).toEqual([]);
        const noBye = `defineStrings(${JSON.stringify({ ...strings, ja: { hi: "やあ" } })})`;
        expect(missingTranslations(manifest(), noBye)).toEqual(["defineStrings ja is missing bye"]);
        const noTr = `defineStrings(${JSON.stringify({ ...strings, tr: undefined })})`;
        expect(missingTranslations(manifest(), noTr)).toEqual(["defineStrings has no tr table"]);
        const { ru, ...locales } = manifest().locales;
        expect(missingTranslations(manifest({ locales }), ok)[0]).toBe('manifest.json "locales" is missing ru (name, description, 1.0.0 notes)');
    });

    test("English-only settings text counts as untranslated; a plugin with no text needs none", () => {
        expect(missingTranslations(manifest(), `const settings = { a: { type: "boolean", label: "Show the button" } };`)[0]).toContain("English only");
        expect(missingTranslations(manifest(), `module.exports = { patches: [] };`)).toEqual([]);
    });

    test.skipIf(!existsSync(DIST))("Evi's own plugins, as built, translate everything", () => {
        for (const id of readdirSync(DIST)) {
            const m = JSON.parse(readFileSync(join(DIST, id, "manifest.json"), "utf8"));
            expect({ id, problems: missingTranslations(m, readFileSync(join(DIST, id, "index.js"), "utf8")) }).toEqual({ id, problems: [] });
        }
    });
});
