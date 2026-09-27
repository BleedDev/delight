import { describe, expect, test } from "bun:test";

import type { HealthReportInput } from "../src/shared/health";
import { ago, crashKey, dueHealthReports, fitReport, HEALTH_REPORT_EVERY, healthKey, readHealthMemory } from "../src/renderer/sentReports";

const report = (plugin: string, version = "1.0.0", discordBuild = "abc123", kind: HealthReportInput["kind"] = "lookups"): HealthReportInput => ({ plugin, version, discordBuild, kind });

describe("dueHealthReports", () => {
    test("reports something new, then not again the same day", () => {
        const first = dueHealthReports([report("a")], {}, 1000);
        expect(first.due).toEqual([report("a")]);
        const memory = { ...first.memory, [healthKey(report("a"))]: 1000 };
        expect(dueHealthReports([report("a")], memory, 1000 + HEALTH_REPORT_EVERY - 1).due).toEqual([]);
        expect(dueHealthReports([report("a")], memory, 1000 + HEALTH_REPORT_EVERY).due).toEqual([report("a")]);
    });

    test("a new version or Discord build is a new report; a different kind isn't", () => {
        const memory = { [healthKey(report("a"))]: 1000 };
        expect(dueHealthReports([report("a", "1.0.1")], memory, 2000).due).toHaveLength(1);
        expect(dueHealthReports([report("a", "1.0.0", "def456")], memory, 2000).due).toHaveLength(1);
        expect(dueHealthReports([report("a", "1.0.0", "abc123", "patches")], memory, 2000).due).toHaveLength(0);
    });

    test("the same plugin twice in one look goes once", () => {
        expect(dueHealthReports([report("a"), report("a", "1.0.0", "abc123", "start")], {}, 0).due).toEqual([report("a")]);
    });

    test("drops entries older than a day, and ones from the future", () => {
        const now = 10 * HEALTH_REPORT_EVERY;
        const { memory } = dueHealthReports([], { old: now - HEALTH_REPORT_EVERY - 1, fresh: now - 5, future: now + 60_000 }, now);
        expect(memory).toEqual({ fresh: now - 5 });
    });
});

describe("readHealthMemory", () => {
    test("reads what was saved, anything else is nothing sent", () => {
        expect(readHealthMemory('{"a@1.0.0#b":5,"bad":"x"}')).toEqual({ "a@1.0.0#b": 5 });
        expect(readHealthMemory(null)).toEqual({});
        expect(readHealthMemory("not json")).toEqual({});
        expect(readHealthMemory("[1,2]")).toEqual({});
    });
});

describe("crashKey", () => {
    const text = (error: string, when: string, others = "none") => [
        "Evi crash report: A (a)", "", `When:     ${when}`, "", "Error:", `  ${error}`, "  at start (evi://plugins/a.js:1:2)", "",
        "Lookups (waitFor, hookExport):", "  missing, props foo", "", `Other enabled store plugins: ${others}`,
    ].join("\n");

    test("the same error is the same crash, whenever it happened and whatever else runs", () => {
        expect(crashKey("a", "1.0.0", text("Error: kaboom", "2026-09-01"))).toBe(crashKey("a", "1.0.0", text("Error: kaboom", "2026-09-27", "b@1.0.0")));
    });

    test("another error or version is another crash", () => {
        expect(crashKey("a", "1.0.0", text("Error: kaboom", "x"))).not.toBe(crashKey("a", "1.0.0", text("Error: bang", "x")));
        expect(crashKey("a", "1.0.0", text("Error: kaboom", "x"))).not.toBe(crashKey("a", "1.0.1", text("Error: kaboom", "x")));
    });

    test("without an error, the first part of Discord it couldn't find names it", () => {
        expect(crashKey("a", "1.0.0", text("(none recorded)", "x"))).toBe("a\n1.0.0\nmissing, props foo");
    });
});

describe("fitReport", () => {
    test("leaves short reports alone and cuts long ones to the limit, saying so", () => {
        expect(fitReport("short", 100)).toBe("short");
        const cut = fitReport("x".repeat(500), 100);
        expect(cut).toHaveLength(100);
        expect(cut).toEndWith("(cut here, the report was too long)");
    });
});

describe("ago", () => {
    test("says how long ago in words", () => {
        const now = Date.UTC(2026, 8, 27, 12);
        expect(ago(now - 10_000, now)).toBe("just now");
        expect(ago(now - 5 * 60_000, now)).toBe("5 minutes ago");
        expect(ago(now - 3 * 3600_000, now)).toBe("3 hours ago");
        expect(ago(now - 26 * 3600_000, now)).toBe("yesterday");
    });
});
