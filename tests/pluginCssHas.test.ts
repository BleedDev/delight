import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * A :has() rule whose subject is a bare element or * (div:has(...), *:has(...)) makes Chrome check
 * every such element again on each DOM change anywhere: in Discord, every message, hover and typing
 * restyled the whole app and it stuttered (Code Block Tools did this with div:has, 2026-10-02). A
 * subject with a class or attribute keeps it to the few elements that can match.
 */
const BROAD = /(^|[\s,{>~+(])(?:\*|[a-z]+[0-9]?)(?::(?:hover|focus|focus-within|focus-visible|active))?:has\(/m;

/** Rules that are only on in a narrow state, with why */
const ALLOWED = [
    // Only while Streamer Mode is on: every selector is scoped under its active class (state.ts)
    "privateChannels_\\\"] li:has(a[href^=",
];

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
        return /\.(tsx?|css)$/.test(name) ? [path] : [];
    });
}

describe("plugin and Evi CSS", () => {
    test("no :has() on a bare element or *", () => {
        const offenders: string[] = [];
        for (const file of [...sources("plugins"), "src/renderer/ui/styles.css"]) {
            const text = readFileSync(file, "utf8");
            text.split("\n").forEach((line, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
                if (BROAD.test(line) && !ALLOWED.some(a => line.includes(a))) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
