import { describe, expect, test } from "bun:test";

import { parseThemeMeta, themeFileName, whyNotCss } from "../src/shared/themes";

describe("theme metadata", () => {
    test("reads a BetterDiscord header", () => {
        const css = `/**
 * @name Midnight
 * @description A dark theme with a mail@example.com in it
 * @author someone
 * @version 1.2.0
 * @website https://example.com
 */
:root { --x: 1; }`;
        expect(parseThemeMeta(css, "midnight.css")).toEqual({
            file: "midnight.css",
            name: "Midnight",
            description: "A dark theme with a mail@example.com in it",
            author: "someone",
            version: "1.2.0",
        });
    });

    test("tags on one line, CRLF and a BOM", () => {
        const meta = parseThemeMeta(String.fromCharCode(0xfeff) + "/** @name One Line @author A B */\r\nbody{}", "x.css");
        expect(meta.name).toBe("One Line");
        expect(meta.author).toBe("A B");
        expect(parseThemeMeta("/**\r\n * @name Crlf\r\n * @version 2\r\n */", "x.css")).toMatchObject({ name: "Crlf", version: "2" });
    });

    test("falls back to the file name", () => {
        expect(parseThemeMeta("body { color: red; }", "My Theme.CSS").name).toBe("My Theme");
        // Only the leading comment counts as a header
        expect(parseThemeMeta("body{}\n/** @name Later */", "a.css").name).toBe("a");
    });
});

describe("remote themes", () => {
    test("accepts CSS, rejects pages and binaries", () => {
        expect(whyNotCss("body { color: red }", "text/css; charset=utf-8")).toBeUndefined();
        expect(whyNotCss("@import url('https://x/y.css');", "text/plain")).toBeUndefined();
        expect(whyNotCss("<!doctype html><html>", "text/plain")).toBeDefined();
        expect(whyNotCss("body{}", "text/html")).toBeDefined();
        expect(whyNotCss("a\0b{}", "")).toBeDefined();
        expect(whyNotCss("just words", "text/plain")).toBeDefined();
    });

    test("file names are safe", () => {
        expect(themeFileName(new URL("https://x.dev/themes/Clear%20Vision.theme.css"), {})).toBe("Clear-Vision.theme.css");
        expect(themeFileName(new URL("https://x.dev/raw?id=4"), { name: "../../evil" })).toBe("evil.css");
        expect(themeFileName(new URL("https://x.dev/"), { name: "" })).toBe("x.dev.css");
    });
});
