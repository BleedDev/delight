import { describe, expect, test } from "bun:test";

import { convert, currencyFor, find, offsetAt, parseNumber, regionOf, segments, systemFor } from "../plugins/hover-converter/convert";
import type { Prefs } from "../plugins/hover-converter/convert";

const rates = { base: "EUR", rates: { USD: 1.1298, GBP: 0.85373, TRY: 55.3993, PLN: 4.3735, BRL: 5.862, JPY: 178.49, RUB: 95 } };
const tr: Prefs["tr"] = (key, v) => key === "time.yours" ? `${v.time} your time` : `${v.time} ${v.day}, your time`;
const NOW = new Date("2026-10-01T12:00:00Z");

const metricEur: Prefs = { locale: "en-GB", currency: "EUR", system: "metric", zone: "Europe/Istanbul", now: NOW, rates, tr };
const imperialUsd: Prefs = { locale: "en-US", currency: "USD", system: "imperial", zone: "America/Los_Angeles", now: NOW, rates, tr };

/** What gets underlined in `text`, and what its tooltip says */
const tips = (text: string, prefs: Prefs) => (segments(text, prefs) ?? []).filter(s => typeof s !== "string");

describe("hover converter: numbers", () => {
    test("both decimal marks and thousands separators", () => {
        expect(parseNumber("1,234.56")).toBe(1234.56);
        expect(parseNumber("1.234,56")).toBe(1234.56);
        expect(parseNumber("1,500")).toBe(1500);
        expect(parseNumber("1,5")).toBe(1.5);
        expect(parseNumber("2.5")).toBe(2.5);
        expect(parseNumber("1.234.567")).toBe(1234567);
    });
});

describe("hover converter: money", () => {
    test("symbols before and after, codes, words", () => {
        expect(tips("it costs $20 now", metricEur)).toEqual([{ text: "$20", tip: "≈ €17.70" }]);
        expect(tips("50 TL", metricEur)).toEqual([{ text: "50 TL", tip: "≈ €0.90" }]);
        expect(tips("R$ 30 and US$5", metricEur).map(s => s.text)).toEqual(["R$ 30", "US$5"]);
        expect(tips("20 USD or USD 20", metricEur).map(s => s.text)).toEqual(["20 USD", "USD 20"]);
        expect(tips("5 bucks", metricEur)).toEqual([{ text: "5 bucks", tip: "≈ €4.43" }]);
        expect(tips("£1,299.99 or 20€", imperialUsd)).toEqual([{ text: "£1,299.99", tip: "≈ $1,720" }, { text: "20€", tip: "≈ $22.60" }]);
    });

    test("k, m and bn scale the amount", () => {
        expect(tips("$20k salary", metricEur)).toEqual([{ text: "$20k", tip: "≈ €17,702" }]);
    });

    test("your own currency isn't underlined", () => {
        expect(tips("$20", imperialUsd)).toEqual([]);
        expect(tips("20€", metricEur)).toEqual([]);
    });

    test("no rates, or a currency without one: nothing to show", () => {
        expect(convert({ kind: "currency", amount: 20, code: "USD" }, { ...metricEur, rates: undefined })).toBeUndefined();
        expect(convert({ kind: "currency", amount: 20, code: "ARS" }, metricEur)).toBeUndefined();
    });

    test("not money: words, versions, prices glued to letters", () => {
        expect(find("try 5 times")).toEqual([]);
        expect(find("abc$20")).toEqual([]);
    });
});

describe("hover converter: units", () => {
    test("imperial to metric", () => {
        expect(tips(`he is 6'2" tall`, metricEur)).toEqual([{ text: `6'2"`, tip: "≈ 188 cm" }]);
        expect(tips("5 ft 11 in", metricEur)).toEqual([{ text: "5 ft 11 in", tip: "≈ 180 cm" }]);
        expect(tips("5ft", metricEur)).toEqual([{ text: "5ft", tip: "≈ 152 cm" }]);
        expect(tips("-4°F", metricEur)).toEqual([{ text: "-4°F", tip: "≈ -20°C" }]);
        expect(tips("60 mph", metricEur)).toEqual([{ text: "60 mph", tip: "≈ 97 km/h" }]);
        expect(tips("5 lbs", metricEur)).toEqual([{ text: "5 lbs", tip: "≈ 2.27 kg" }]);
        expect(tips("10 miles", metricEur)).toEqual([{ text: "10 miles", tip: "≈ 16.1 km" }]);
        expect(tips("3 oz", metricEur)).toEqual([{ text: "3 oz", tip: "≈ 85 g" }]);
        expect(tips("10 inches", metricEur)).toEqual([{ text: "10 inches", tip: "≈ 25 cm" }]);
    });

    test("metric to imperial", () => {
        expect(tips("30°C", imperialUsd)).toEqual([{ text: "30°C", tip: "≈ 86°F" }]);
        expect(tips("100 km/h", imperialUsd)).toEqual([{ text: "100 km/h", tip: "≈ 62 mph" }]);
        expect(tips("2L of water", imperialUsd)).toEqual([{ text: "2L", tip: "≈ 0.53 gal" }]);
        expect(tips("12 kg", imperialUsd)).toEqual([{ text: "12 kg", tip: "≈ 26.5 lb" }]);
        expect(tips("500 g", imperialUsd)).toEqual([{ text: "500 g", tip: "≈ 1.1 lb" }]);
        expect(tips("1,5 km", imperialUsd)).toEqual([{ text: "1,5 km", tip: "≈ 0.93 mi" }]);
        expect(tips("180 cm", imperialUsd)).toEqual([{ text: "180 cm", tip: "≈ 5 ft 11 in" }]);
    });

    test("already in your system: no underline", () => {
        expect(tips("30°C and 12 kg", metricEur)).toEqual([]);
        expect(tips("86 °F", imperialUsd)).toEqual([]);
    });

    test("too ambiguous to touch", () => {
        // Minutes, a phone network, a sentence, a version number
        for (const text of ["brb 5m", "5g network", "5 in a row", "v1.5 m", "5 games", "5 l"]) expect(find(text)).toEqual([]);
        // Spaced "m" and "g" are metres and grams
        expect(find("5 m")[0]?.found).toEqual({ kind: "unit", value: 5, unit: "m" });
        expect(find("500 g")[0]?.found).toEqual({ kind: "unit", value: 500, unit: "g" });
    });

    test("negative only for temperatures", () => {
        expect(find("-5 kg")).toEqual([]);
        expect(find("−5 °C")[0]?.found).toEqual({ kind: "unit", value: -5, unit: "C" });
    });
});

describe("hover converter: times", () => {
    test("a time with a zone, in yours", () => {
        expect(tips("3pm EST", metricEur)).toEqual([{ text: "3pm EST", tip: "23:00 your time" }]);
        expect(tips("9:30 am PT", metricEur)).toEqual([{ text: "9:30 am PT", tip: "19:30 your time" }]);
        expect(tips("15:00 UTC", imperialUsd)).toEqual([{ text: "15:00 UTC", tip: "8:00 AM your time" }]);
        expect(tips("8 PM GMT+3", imperialUsd)).toEqual([{ text: "8 PM GMT+3", tip: "10:00 AM your time" }]);
    });

    test("another day says so", () => {
        expect(tips("11pm EST", metricEur)).toEqual([{ text: "11pm EST", tip: "07:00 tomorrow, your time" }]);
        expect(tips("1am JST", imperialUsd)).toEqual([{ text: "1am JST", tip: "9:00 AM yesterday, your time" }]);
    });

    test("bare ET/PT follow daylight saving", () => {
        expect(offsetAt("America/New_York", new Date("2026-07-01T12:00:00Z"))).toBe(-240);
        expect(offsetAt("America/New_York", new Date("2026-12-01T12:00:00Z"))).toBe(-300);
    });

    test("your own zone, or no am/pm and no minutes: nothing", () => {
        expect(tips("8 PM GMT+3", metricEur)).toEqual([]);
        expect(tips("15:00 TRT", metricEur)).toEqual([]);
        expect(find("5 PT")).toEqual([]);
        expect(find("at 5 est")).toEqual([]);
        expect(find("25:00 UTC")).toEqual([]);
        expect(find("13pm EST")).toEqual([]);
    });

    test("lowercase zones only after am/pm", () => {
        expect(find("3pm est")).toHaveLength(1);
        expect(find("10:30 est")).toEqual([]);
    });
});

describe("hover converter: turning kinds off", () => {
    test("each kind can be left alone", () => {
        const off = { currency: false, units: true, times: false };
        expect((segments("$20, 5 ft, 3pm EST", metricEur, off) ?? []).filter(s => typeof s !== "string").map(s => typeof s === "string" ? s : s.text)).toEqual(["5 ft"]);
    });

    test("plain text around the matches is kept", () => {
        expect(segments("costs $20 now", metricEur)).toEqual(["costs ", { text: "$20", tip: "≈ €17.70" }, " now"]);
        expect(segments("nothing here", metricEur)).toBeUndefined();
    });
});

describe("hover converter: defaults from your language", () => {
    test("region, currency and units", () => {
        expect(regionOf(["en-US"])).toBe("US");
        expect(regionOf(["tr"])).toBe("TR");
        expect(regionOf(["pt-BR", "en-US"])).toBe("BR");
        expect(regionOf(["de", "en-GB"])).toBe("GB");
        expect(currencyFor("TR")).toBe("TRY");
        expect(currencyFor("BG")).toBe("EUR");
        expect(currencyFor("??")).toBe("USD");
        expect(systemFor("US")).toBe("imperial");
        expect(systemFor("GB")).toBe("metric");
    });
});
