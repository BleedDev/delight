import { describe, expect, test } from "bun:test";

import { localizePlugin, validateLocales } from "../src/shared/pluginLocales";
import { parseRegistry } from "../src/shared/store";

const manifest = {
    name: "View Icons",
    description: "Download avatars.",
    changelog: [{ version: "2.0.0", notes: ["New."] }, { version: "1.0.0", notes: ["First release."] }],
    locales: {
        "de": { name: "Bilder ansehen", description: "Avatare herunterladen.", changelog: { "2.0.0": ["Neu."] } },
        "pt-BR": { description: "Baixe avatares." },
    },
};

describe("plugin locales", () => {
    test("Discord's language picks the translation, English fills what it leaves out", () => {
        const de = localizePlugin(manifest, "de");
        expect([de.name, de.description]).toEqual(["Bilder ansehen", "Avatare herunterladen."]);
        expect(de.changelog.map(c => c.notes[0])).toEqual(["Neu.", "First release."]);
        const pt = localizePlugin(manifest, "pt-BR");
        expect([pt.name, pt.description]).toEqual(["View Icons", "Baixe avatares."]);
        expect(localizePlugin(manifest, "de-AT").name).toBe("Bilder ansehen");
        expect(localizePlugin(manifest, "ja")).toBe(manifest);
        expect(localizePlugin(manifest, "en-US")).toBe(manifest);
    });

    test("bad blocks are refused with a reason", () => {
        expect(validateLocales(undefined)).toBeUndefined();
        expect(validateLocales(manifest.locales)).toEqual(manifest.locales);
        expect(validateLocales([])).toBeString();
        expect(validateLocales({ "../x": {} })).toBeString();
        expect(validateLocales({ de: { name: "" } })).toBeString();
        expect(validateLocales({ de: { description: "x".repeat(501) } })).toBeString();
        expect(validateLocales({ de: { changelog: { "1.0.0": "not a list" } } })).toBeString();
    });

    test("the registry keeps them, and refuses an entry with a broken block", () => {
        const entry = (locales: unknown) => ({
            id: "view-icons", name: "View Icons", description: "d", authors: ["Evi"], version: "2.0.0", tags: [], native: false,
            files: {
                "manifest.json": { url: "https://evi.rest/m.json", sha256: "a".repeat(64) },
                "index.js": { url: "https://evi.rest/i.js", sha256: "b".repeat(64) },
            },
            locales,
        });
        const ok = parseRegistry({ schema: 1, plugins: [entry(manifest.locales)] });
        if ("error" in ok) throw new Error(ok.error);
        expect(ok.registry.plugins[0].locales).toEqual(manifest.locales);
        const bad = parseRegistry({ schema: 1, plugins: [entry({ de: { name: 5 } })] });
        if ("error" in bad) throw new Error(bad.error);
        expect(bad.registry.plugins).toEqual([]);
        expect(bad.problems.length).toBe(1);
    });
});
