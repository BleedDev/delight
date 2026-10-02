import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { findMatches, fold, locate, matcher, parseQuery } from "../plugins/search-highlight/highlight";
import { whyNotPermissions } from "../src/shared/declaredPermissions";
import { missingTranslations } from "../src/shared/pluginTranslations";

const words = (raw: string) => parseQuery(raw).map(t => t.words.join(" "));
const marked = (text: string, raw: string) => findMatches(text, parseQuery(raw)).map(([s, e]) => text.slice(s, e));

describe("Search Highlight: the query", () => {
    test("filters are left out, words and quoted phrases kept", () => {
        expect(words("from:kaz in:#general has:link patch notes")).toEqual(["patch", "notes"]);
        expect(words('before:2026-01-01 after:2025-12-01 during:2025 mentions:@evi pinned:true "release notes" beta')).toEqual(["release notes", "beta"]);
        expect(words('from:"Some Name" hello')).toEqual(["hello"]);
        expect(words("von:kaz hallo")).toEqual(["hallo"]);
    });

    test("case and accents don't matter, duplicates and punctuation drop", () => {
        expect(words("Café CAFE cafe!")).toEqual(["cafe"]);
        expect(words("  ")).toEqual([]);
        expect(words("")).toEqual([]);
        expect(parseQuery(undefined)).toEqual([]);
    });
});

describe("Search Highlight: matching", () => {
    test("a word matches at the start of a word, and covers the rest of it", () => {
        expect(marked("cats and a concatenated cat", "cat")).toEqual(["cats", "cat"]);
        expect(marked("No match here", "cat")).toEqual([]);
    });

    test("accents and case in the message don't matter", () => {
        expect(marked("Le CAFÉ est fermé", "cafe ferme")).toEqual(["CAFÉ", "fermé"]);
        expect(marked("İstanbul'da", "istanbul")).toEqual(["İstanbul"]);
    });

    test("a phrase matches its words in order, across spaces and punctuation", () => {
        expect(marked("read the release - notes today", '"release notes"')).toEqual(["release - notes"]);
        expect(marked("notes about release", '"release notes"')).toEqual([]);
    });

    test("overlapping matches merge, the phrase wins over its word", () => {
        expect(marked("big release notes", '"release notes" release')).toEqual(["release notes"]);
    });

    test("offsets are in the original text, emoji and accents included", () => {
        const text = "👋 Café time";
        const [[s, e]] = findMatches(text, parseQuery("cafe"));
        expect(text.slice(s, e)).toBe("Café");
        const { map } = fold("é👋");
        // One entry per folded UTF-16 unit: the emoji is two, both pointing at where it starts
        expect(map).toEqual([0, 1, 1, 3]);
    });

    test("one regex can be reused across messages", () => {
        const re = matcher(parseQuery("evi"))!;
        expect(findMatches("Evi rocks", re)).toEqual([[0, 3]]);
        expect(findMatches("evi again, evi", re)).toEqual([[0, 3], [11, 14]]);
    });

    test("matches are placed in the right text nodes", () => {
        const pieces = ["hello ", "wor", "ld again"];
        const text = pieces.join("");
        const where = locate(pieces, findMatches(text, parseQuery("world again")));
        expect(where).toEqual([
            { start: { piece: 1, offset: 0 }, end: { piece: 2, offset: 2 } },
            { start: { piece: 2, offset: 3 }, end: { piece: 2, offset: 8 } },
        ]);
        // An end right at a boundary stays in the piece it ends
        expect(locate(["abc", "def"], [[0, 3]])).toEqual([{ start: { piece: 0, offset: 0 }, end: { piece: 0, offset: 3 } }]);
    });
});

describe("Search Highlight: the store's checks", () => {
    const dir = join(import.meta.dir, "../plugins/search-highlight");
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    const code = ["index.tsx", "strings.ts", "highlight.ts"].map(f => readFileSync(join(dir, f), "utf8")).join("\n");

    test("every string in every language, permissions valid", () => {
        expect(missingTranslations(manifest, code)).toEqual([]);
        expect(whyNotPermissions(manifest.permissions)).toBeUndefined();
        expect(manifest.enabledByDefault).toBe(false);
    });
});
