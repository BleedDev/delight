import { describe, expect, test } from "bun:test";

import { localizedRelease, Release, RELEASES, SECTION_KINDS } from "../src/shared/changelog";
import { CHANGELOG_LOCALES } from "../src/shared/changelogLocales";

const LANGUAGES = ["de", "es", "fr", "ja", "pl", "pt-BR", "ru", "tr"];
const marks = (line: string) => (line.match(/\*\*|`/g) ?? []).length;

describe("translated release notes", () => {
    test("every shipped language is there, for every release", () => {
        expect(Object.keys(CHANGELOG_LOCALES).sort()).toEqual([...LANGUAGES].sort());
        for (const lang of LANGUAGES) {
            for (const release of RELEASES) expect(CHANGELOG_LOCALES[lang][release.version]).toBeDefined();
            expect(Object.keys(CHANGELOG_LOCALES[lang]).sort()).toEqual(RELEASES.map(r => r.version).sort());
        }
    });

    test("each has the same sections and line counts as English, with the same markdown", () => {
        for (const [lang, versions] of Object.entries(CHANGELOG_LOCALES)) {
            for (const release of RELEASES) {
                const notes = versions[release.version];
                for (const kind of SECTION_KINDS) {
                    const english = release.sections[kind] ?? [];
                    const translated = notes[kind] ?? [];
                    expect([lang, release.version, kind, translated.length]).toEqual([lang, release.version, kind, english.length]);
                    english.forEach((line, i) => {
                        expect([lang, release.version, kind, i, marks(translated[i])]).toEqual([lang, release.version, kind, i, marks(line)]);
                        expect(translated[i].trim().length).toBeGreaterThan(0);
                    });
                }
            }
        }
    });
});

describe("localizedRelease", () => {
    const release: Release = { version: "1.0.0", date: "2026-09-28", cover: "1.0.0", sections: { added: ["a"], fixed: ["f"] } };
    const locales = { de: { "1.0.0": { added: ["a (de)"] } } };

    test("swaps in the translated sections and keeps the rest English", () => {
        const de = localizedRelease(release, "de", locales);
        expect(de.sections).toEqual({ added: ["a (de)"], fixed: ["f"] });
        expect(de.version).toBe("1.0.0");
        expect(de.cover).toBe("1.0.0");
    });

    test("matches locales like Discord's", () => {
        expect(localizedRelease(release, "de-AT", locales).sections.added).toEqual(["a (de)"]);
        expect(localizedRelease(release, "DE", locales).sections.added).toEqual(["a (de)"]);
        expect(localizedRelease(RELEASES[0], "pt_BR").sections).toEqual(CHANGELOG_LOCALES["pt-BR"][RELEASES[0].version]);
    });

    test("falls back to English for other languages, unknown versions and no locale", () => {
        expect(localizedRelease(release, "en-US", locales)).toBe(release);
        expect(localizedRelease(release, "zh-CN", locales)).toBe(release);
        expect(localizedRelease(release, "", locales)).toBe(release);
        expect(localizedRelease(release, undefined, locales)).toBe(release);
        expect(localizedRelease({ ...release, version: "9.9.9" }, "de", locales).sections).toEqual(release.sections);
    });
});
