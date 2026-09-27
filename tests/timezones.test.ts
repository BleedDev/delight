import { describe as group, expect, test } from "bun:test";

import {
    allZones, cityOf, dayDiff, describeDiff, describeTime, formatOffset, formatTime, isValidZone, localeUses12h, normalize, offsetMinutes,
    parseOffsetQuery, parseZones, regionOf, resolveIn, sameZone, searchZones, tooltipText, withoutZone, withZone,
} from "../plugins/timezones/tz";

// Tuesday 16 January 2024, 12:42 UTC (northern winter)
const WINTER = new Date("2024-01-16T12:42:00Z");
// Monday 1 July 2024, 12:42 UTC (northern summer)
const SUMMER = new Date("2024-07-01T12:42:00Z");

const ZONES = allZones();

group("validation", () => {
    test("accepts IANA ids and UTC", () => {
        expect(isValidZone("Europe/Berlin")).toBe(true);
        expect(isValidZone("America/Argentina/Buenos_Aires")).toBe(true);
        expect(isValidZone("UTC")).toBe(true);
    });

    test("rejects junk", () => {
        for (const z of ["", "Nowhere/Special", "Europe/Berlin; drop", "../etc", 42, null, undefined, {}, "x".repeat(80)]) {
            expect(isValidZone(z)).toBe(false);
        }
    });

    test("parseZones keeps only snowflake → valid zone entries", () => {
        expect(parseZones({
            "123456789012345678": "Europe/Istanbul",
            "223456789012345678": "Mars/Olympus",
            "not-an-id": "Europe/Paris",
            "323456789012345678": 5,
        })).toEqual({ "123456789012345678": "Europe/Istanbul" });
        expect(parseZones(null)).toEqual({});
        expect(parseZones(["Europe/Paris"])).toEqual({});
        expect(parseZones("x")).toEqual({});
    });

    test("withZone / withoutZone are immutable and validate", () => {
        const a = {};
        const b = withZone(a, "123456789012345678", "Asia/Tokyo");
        expect(a).toEqual({});
        expect(b).toEqual({ "123456789012345678": "Asia/Tokyo" });
        expect(withZone(b, "123456789012345678", "Asia/Tokyo")).toBe(b);
        expect(withZone(b, "123456789012345678", "Bad/Zone")).toBe(b);
        expect(withZone(b, "nope", "Asia/Tokyo")).toBe(b);
        expect(withoutZone(b, "123456789012345678")).toEqual({});
        expect(withoutZone(b, "999999999999999999")).toBe(b);
    });

    test("allZones has UTC, real places and no Etc/GMT±N", () => {
        expect(ZONES[0]).toBe("UTC");
        expect(ZONES).toContain("Europe/Berlin");
        expect(ZONES.some(z => z.startsWith("Etc/"))).toBe(false);
        expect(allZones(["Europe/Paris", "Etc/GMT+3", "Bad/Zone", "Europe/Paris"])).toEqual(["UTC", "Europe/Paris"]);
    });

    test("renamed zones resolve to whichever name the list uses", () => {
        expect(resolveIn("Asia/Kolkata", new Set(["Asia/Calcutta"]))).toBe("Asia/Calcutta");
        expect(resolveIn("Europe/Kiev", new Set(["Europe/Kyiv"]))).toBe("Europe/Kyiv");
        expect(resolveIn("Europe/Paris", new Set(["Europe/Paris"]))).toBe("Europe/Paris");
        expect(resolveIn("Asia/Kolkata", new Set(["Europe/Paris"]))).toBeUndefined();
        expect(sameZone("Asia/Kolkata", "Asia/Calcutta")).toBe(true);
        expect(sameZone("Asia/Kolkata", "Asia/Tokyo")).toBe(false);
    });
});

group("offsets", () => {
    test("offsetMinutes follows DST", () => {
        expect(offsetMinutes("UTC", WINTER)).toBe(0);
        expect(offsetMinutes("Europe/Istanbul", WINTER)).toBe(180);
        expect(offsetMinutes("America/New_York", WINTER)).toBe(-300);
        expect(offsetMinutes("America/New_York", SUMMER)).toBe(-240);
        expect(offsetMinutes("Europe/Berlin", WINTER)).toBe(60);
        expect(offsetMinutes("Europe/Berlin", SUMMER)).toBe(120);
        expect(offsetMinutes("Asia/Kolkata", WINTER)).toBe(330);
        expect(offsetMinutes("Asia/Kathmandu", WINTER)).toBe(345);
        expect(offsetMinutes("Australia/Sydney", WINTER)).toBe(660);
    });

    test("formatOffset", () => {
        expect(formatOffset(0)).toBe("UTC");
        expect(formatOffset(180)).toBe("UTC+3");
        expect(formatOffset(-300)).toBe("UTC-5");
        expect(formatOffset(330)).toBe("UTC+5:30");
        expect(formatOffset(345)).toBe("UTC+5:45");
        expect(formatOffset(-210)).toBe("UTC-3:30");
    });

    test("describeDiff", () => {
        expect(describeDiff(180, 60)).toBe("2h ahead of you");
        expect(describeDiff(-300, 60)).toBe("6h behind you");
        expect(describeDiff(330, 0)).toBe("5h 30m ahead of you");
        expect(describeDiff(0, 30)).toBe("30m behind you");
        expect(describeDiff(60, 60)).toBe("same time as you");
    });

    test("dayDiff", () => {
        const late = new Date("2024-01-16T23:30:00Z");
        expect(dayDiff(late, 180, 0)).toBe(1);
        expect(dayDiff(late, -300, 0)).toBe(0);
        expect(dayDiff(new Date("2024-01-16T02:00:00Z"), -300, 60)).toBe(-1);
    });
});

group("formatting", () => {
    test("12h and 24h", () => {
        expect(formatTime(WINTER, "Europe/Istanbul", { cycle: "12h" })).toBe("3:42 PM");
        expect(formatTime(WINTER, "Europe/Istanbul", { cycle: "24h" })).toBe("15:42");
        expect(formatTime(WINTER, "America/New_York", { cycle: "24h" })).toBe("07:42");
        expect(formatTime(WINTER, "America/New_York", { cycle: "12h" })).toBe("7:42 AM");
        expect(formatTime(new Date("2024-01-16T00:05:00Z"), "UTC", { cycle: "24h" })).toBe("00:05");
        expect(formatTime(new Date("2024-01-16T00:05:00Z"), "UTC", { cycle: "12h" })).toBe("12:05 AM");
    });

    test("with weekday", () => {
        expect(formatTime(WINTER, "Europe/Istanbul", { cycle: "12h", weekday: true })).toBe("Tue 3:42 PM");
        // Already Wednesday in Tokyo
        expect(formatTime(new Date("2024-01-16T20:00:00Z"), "Asia/Tokyo", { cycle: "24h", weekday: true })).toBe("Wed 05:00");
    });

    test("respects the locale and survives a bad one", () => {
        expect(formatTime(WINTER, "Europe/Berlin", { cycle: "24h", locale: "de-DE" })).toBe("13:42");
        expect(formatTime(WINTER, "Europe/Berlin", { cycle: "24h", locale: "not a locale!!" })).toBe("13:42");
    });

    test("localeUses12h", () => {
        expect(localeUses12h("en-US")).toBe(true);
        expect(localeUses12h("de-DE")).toBe(false);
        expect(localeUses12h("en-GB")).toBe(false);
    });

    test("describeTime and tooltipText", () => {
        const d = describeTime(WINTER, "Europe/Istanbul", "Europe/Berlin", { cycle: "12h" });
        expect(d).toEqual({ short: "3:42 PM", long: "Tue 3:42 PM", offset: "UTC+3", diff: "2h ahead of you" });
        expect(tooltipText(d)).toBe("Their time: Tue 3:42 PM (UTC+3) · 2h ahead of you");
        const ny = describeTime(SUMMER, "America/New_York", "Europe/Berlin", { cycle: "24h" });
        expect(tooltipText(ny)).toBe("Their time: Mon 08:42 (UTC-4) · 6h behind you");
    });
});

group("search", () => {
    const top = (q: string, n = 1, date = WINTER) => searchZones(q, ZONES, date, n);

    test("helpers", () => {
        expect(cityOf("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
        expect(regionOf("America/Argentina/Buenos_Aires")).toBe("America · Argentina");
        expect(normalize("  São_Paulo/ ")).toBe("sao paulo");
        expect(parseOffsetQuery("UTC+3")).toBe(180);
        expect(parseOffsetQuery("gmt-5:30")).toBe(-330);
        expect(parseOffsetQuery("+0545")).toBe(345);
        expect(parseOffsetQuery("utc")).toBe(0);
        expect(parseOffsetQuery("+25")).toBeUndefined();
        expect(parseOffsetQuery("berlin")).toBeUndefined();
    });

    test("exact ids and cities", () => {
        expect(top("Europe/Berlin")).toEqual(["Europe/Berlin"]);
        expect(top("berlin")).toEqual(["Europe/Berlin"]);
        expect(top("new york")).toEqual(["America/New_York"]);
        expect(top("new_york")).toEqual(["America/New_York"]);
        expect(top("buenos aires")[0]).toMatch(/Buenos_Aires$/);
    });

    test("prefixes rank popular places first", () => {
        expect(top("sao")).toEqual(["America/Sao_Paulo"]);
        expect(top("istan")).toEqual(["Europe/Istanbul"]);
        expect(top("tok")).toEqual(["Asia/Tokyo"]);
    });

    test("abbreviations", () => {
        expect(top("EST")).toEqual(["America/New_York"]);
        expect(top("est")).toEqual(["America/New_York"]);
        expect(top("PST")).toEqual(["America/Los_Angeles"]);
        expect(top("CET")).toEqual(["Europe/Paris"]);
        expect(top("CET", 5)).toContain("Europe/Berlin");
        expect(top("JST")).toEqual(["Asia/Tokyo"]);
        expect(sameZone(top("IST")[0], "Asia/Kolkata")).toBe(true);
    });

    test("aliases and renamed cities", () => {
        expect(top("San Francisco")).toEqual(["America/Los_Angeles"]);
        expect(sameZone(top("mumbai")[0], "Asia/Kolkata")).toBe(true);
        expect(sameZone(top("kolkata")[0], "Asia/Kolkata")).toBe(true);
        expect(sameZone(top("kyiv")[0], "Europe/Kyiv")).toBe(true);
        expect(sameZone(top("kiev")[0], "Europe/Kyiv")).toBe(true);
    });

    test("offsets match zones at that offset right now", () => {
        const plus3 = top("UTC+3", 50);
        expect(plus3).toContain("Europe/Istanbul");
        expect(plus3.every(z => offsetMinutes(z, WINTER) === 180)).toBe(true);
        expect(top("UTC-4", 50, SUMMER)).toContain("America/New_York");
        expect(top("UTC-4", 50, WINTER)).not.toContain("America/New_York");
    });

    test("nothing for nonsense, everything by offset for empty", () => {
        expect(top("qqqzzz", 10)).toEqual([]);
        const all = searchZones("", ZONES, WINTER);
        expect(all.length).toBe(ZONES.length);
        const offsets = all.map(z => offsetMinutes(z, WINTER));
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    });
});
