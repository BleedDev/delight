/**
 * What Hover Converter finds in message text and what it shows for it: money in your currency,
 * lengths, weights, temperatures, speeds and volumes in your system, and a time with a zone in
 * yours. Pure: no Discord, no network; index.tsx hands it the rates and your preferences.
 *
 * It errs towards leaving text alone: "5m" is minutes as often as metres, "5g" is a network and
 * "5 in" is a sentence, so those need their long form ("5 metres", "5 grams", "5 inches") or a
 * shape that only a measurement has.
 */

import { zoneRegion } from "./zones";

export type System = "metric" | "imperial";

export interface Rates {
    /** Every rate is per 1 of base */
    base: string;
    rates: Record<string, number>;
}

export interface Prefs {
    locale: string;
    currency: string;
    system: System;
    /** Your IANA time zone */
    zone: string;
    now: Date;
    rates?: Rates;
    /** "{time} your time", "{time} {day}, your time" in your language */
    tr(key: "time.yours" | "time.yoursDay", vars: Record<string, string>): string;
}

export type Found =
    | { kind: "currency"; amount: number; code: string; }
    | { kind: "unit"; value: number; unit: Unit; inches?: number; }
    | { kind: "time"; hour: number; minute: number; zone: string; };

export type Unit =
    | "ft" | "in" | "yd" | "mi" | "mm" | "cm" | "m" | "km"
    | "lb" | "oz" | "g" | "kg"
    | "F" | "C"
    | "mph" | "kmh"
    | "gal" | "floz" | "ml" | "L";

export interface Match {
    start: number;
    end: number;
    found: Found;
}

// ---- Numbers ------------------------------------------------------------------------------------

/** 1,234.56 · 1.234,56 · 1234 · 1,5 · 0.5 */
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?|\d{1,3}\.\d{3},\d+|\d+(?:[.,]\d+)?|\.\d+`;

export function parseNumber(raw: string): number {
    const s = raw.trim();
    const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
    if (comma !== -1 && dot !== -1) {
        // The later one is the decimal mark
        return comma > dot ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
    }
    if (comma !== -1) return /^\d{1,3}(?:,\d{3})+$/.test(s) ? Number(s.replace(/,/g, "")) : Number(s.replace(",", "."));
    if (dot !== -1 && /^\d{1,3}(?:\.\d{3}){2,}$/.test(s)) return Number(s.replace(/\./g, ""));
    return Number(s);
}

const SCALE: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9 };

// ---- Money --------------------------------------------------------------------------------------

const SYMBOLS: Record<string, string> = {
    "US$": "USD", "C$": "CAD", "CA$": "CAD", "A$": "AUD", "AU$": "AUD", "NZ$": "NZD", "HK$": "HKD", "R$": "BRL",
    "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₺": "TRY", "TL": "TRY", "₽": "RUB", "₹": "INR", "₩": "KRW", "zł": "PLN",
};
export const CODES = [
    "USD", "EUR", "GBP", "JPY", "TRY", "RUB", "PLN", "BRL", "CAD", "AUD", "NZD", "CHF", "CNY", "INR", "KRW", "SEK", "NOK", "DKK",
    "CZK", "HUF", "RON", "MXN", "SGD", "HKD", "ZAR", "ILS", "THB", "IDR", "PHP", "MYR", "ISK", "UAH", "TWD", "VND", "ARS",
];
const WORDS: Record<string, string> = { dollar: "USD", dollars: "USD", bucks: "USD", euro: "EUR", euros: "EUR" };

const esc = (s: string) => s.replace(/[$.*+?^()[\]{}|\\]/g, "\\$&");
const PREFIX_SYMBOLS = ["US$", "CA$", "AU$", "NZ$", "HK$", "C$", "A$", "R$", "$", "€", "£", "¥", "₺", "₽", "₹", "₩"].map(esc).join("|");
const SUFFIX_SYMBOLS = ["€", "£", "\\$", "₺", "₽", "₹", "₩", "zł", "TL"].join("|");
const CODE_ALT = CODES.join("|");

// ---- Units --------------------------------------------------------------------------------------

/** Spelled out, or a symbol nothing else uses; either may sit right after the number */
const UNIT_WORDS: [RegExp, Unit][] = [
    [/^(?:feet|foot|ft)$/i, "ft"], [/^(?:inches|inch)$/i, "in"], [/^(?:yards?|yds?)$/i, "yd"], [/^(?:miles?|mi)$/i, "mi"],
    [/^(?:millimet(?:er|re)s?|mm)$/i, "mm"], [/^(?:centimet(?:er|re)s?|cm)$/i, "cm"], [/^(?:met(?:er|re)s?)$/i, "m"], [/^(?:kilomet(?:er|re)s?|km|kms)$/i, "km"],
    [/^(?:pounds?|lbs?)$/i, "lb"], [/^(?:ounces?|oz)$/i, "oz"], [/^(?:grams?)$/i, "g"], [/^(?:kilograms?|kilos?|kgs?)$/i, "kg"],
    [/^(?:mph)$/i, "mph"], [/^(?:km\/h|kmh|kph|km\/hr)$/i, "kmh"],
    [/^(?:gallons?|gal)$/i, "gal"], [/^(?:fl\.? ?oz)$/i, "floz"], [/^(?:millilit(?:er|re)s?|ml)$/i, "ml"], [/^(?:lit(?:er|re)s?|L)$/, "L"],
    [/^(?:°\s?F|degrees? f(?:ahrenheit)?|fahrenheit)$/i, "F"], [/^(?:°\s?C|degrees? c(?:elsius)?|celsius)$/i, "C"],
];
const UNIT_ALT = [
    "km/hr", "km/h", "kmh", "kph", "mph",
    "fl\\.? ?oz", "°\\s?[FfCc]", "degrees? (?:fahrenheit|celsius|[FfCc])\\b", "fahrenheit", "celsius",
    "millimet(?:er|re)s?", "centimet(?:er|re)s?", "kilomet(?:er|re)s?", "met(?:er|re)s?", "millilit(?:er|re)s?", "lit(?:er|re)s?",
    "kilograms?", "kilos?", "grams?", "pounds?", "ounces?", "gallons?", "inches", "inch", "feet", "foot", "yards?", "miles?",
    "kms?", "kgs?", "lbs?", "oz", "ft", "yds?", "mi", "mm", "cm", "ml", "gal", "L",
].join("|");
/** Only right after a space: "5 m" is metres, "5m" is too often minutes */
const SPACED_ONLY = String.raw`m|g`;

/** Which system each unit belongs to; a found unit already in yours isn't converted */
const IMPERIAL = new Set<Unit>(["ft", "in", "yd", "mi", "lb", "oz", "F", "mph", "gal", "floz"]);

// ---- Times --------------------------------------------------------------------------------------

/** Fixed offsets, in minutes; a bare "ET" follows daylight saving through its IANA zone */
const ZONES: Record<string, number | string> = {
    UTC: 0, GMT: 0, WET: 0, WEST: 60, BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180, TRT: 180,
    IST: 330, SGT: 480, HKT: 480, AWST: 480, JST: 540, KST: 540, ACST: 570, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780,
    BRT: -180, ART: -180, AST: -240, ADT: -180,
    EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, AKDT: -480, HST: -600,
    ET: "America/New_York", CT: "America/Chicago", MT: "America/Denver", PT: "America/Los_Angeles",
};
const ZONE_ALT = Object.keys(ZONES).sort((a, b) => b.length - a.length).join("|");

// ---- Finding ------------------------------------------------------------------------------------

/** Not glued to a word or another number on either side */
const B = String.raw`(?<![\p{L}\p{N}_.,$€£¥₺₽₹₩/])`;
const E = String.raw`(?![\p{L}\p{N}_]|[.,]\d)`;

const PATTERNS: { re: RegExp; read(m: RegExpExecArray): Found | undefined; }[] = [
    // $20, €1,299.99, US$5, R$ 30, $20k
    {
        re: new RegExp(`${B}(${PREFIX_SYMBOLS}) ?(${NUM})(k|K|bn|m|M|b|B)?${E}`, "gu"),
        read: m => money(parseNumber(m[2]) * (m[3] ? SCALE[m[3]] : 1), SYMBOLS[m[1]]),
    },
    // 20€, 20 zł, 50 TL, 20$
    {
        re: new RegExp(`${B}(${NUM}) ?(${SUFFIX_SYMBOLS})(?![\\p{L}\\p{N}_])`, "gu"),
        read: m => money(parseNumber(m[1]), SYMBOLS[m[2]]),
    },
    // 20 USD, USD 20, 20 usd
    {
        re: new RegExp(`${B}(${NUM}) ?(${CODE_ALT}|usd|eur|gbp)${E}`, "gu"),
        read: m => money(parseNumber(m[1]), m[2].toUpperCase()),
    },
    {
        re: new RegExp(`(?<![\\p{L}\\p{N}_])(${CODE_ALT}) ?(${NUM})${E}`, "gu"),
        read: m => money(parseNumber(m[2]), m[1]),
    },
    // 20 dollars, 5 bucks, 10 euros
    {
        re: new RegExp(`${B}(${NUM}) (dollars?|bucks|euros?)${E}`, "giu"),
        read: m => money(parseNumber(m[1]), WORDS[m[2].toLowerCase()]),
    },
    // 6'2", 5′11″, 5 ft 11 in, and "5'11 ft" as people write it: one height, not 11 feet
    {
        re: new RegExp(`${B}(\\d)(?:'|′| ?ft ?| feet )(\\d{1,2})(?:"|″|''| ?in(?:ches)?| ?ft| feet)?(?![\\p{L}\\p{N}_'"])`, "gu"),
        read: m => Number(m[2]) < 12 ? { kind: "unit", value: Number(m[1]) + Number(m[2]) / 12, unit: "ft", inches: Number(m[1]) * 12 + Number(m[2]) } : undefined,
    },
    // 5 ft, 30°C, -4 °F, 100 km/h, 2L, 5 metres
    {
        re: new RegExp(`${B}([-−]?(?:${NUM}))(?: ?(${UNIT_ALT})| (${SPACED_ONLY}))(?![\\p{L}\\p{N}_/])`, "gu"),
        read: m => {
            const unit = unitOf(m[2] ?? m[3]);
            const value = parseNumber(m[1].replace("−", "-"));
            if (!unit || !Number.isFinite(value)) return undefined;
            // Below zero only makes sense for a temperature
            if (value < 0 && unit !== "C" && unit !== "F") return undefined;
            return { kind: "unit", value, unit };
        },
    },
    // 3pm EST, 9:30 am PT, 15:00 UTC, 8 PM GMT+3
    {
        re: new RegExp(`(?<![\\p{L}\\p{N}_:])(\\d{1,2})(?::(\\d{2}))? ?([ap]\\.?m\\.?)? ?(${ZONE_ALT})(?: ?([+\\-−]\\d{1,2})(?::?(\\d{2}))?)?(?![\\p{L}\\p{N}_])`, "giu"),
        read: m => {
            const [, h, min, ampm, zoneRaw, offH, offM] = m;
            // A bare "5 PT" could be anything: a time needs am/pm or minutes
            if (!ampm && min === undefined) return undefined;
            const zoneKey = zoneRaw.toUpperCase();
            // Lowercase zones only count after am/pm ("3pm est"), not in words
            if (zoneRaw !== zoneKey && !ampm) return undefined;
            let hour = Number(h);
            const minute = min === undefined ? 0 : Number(min);
            if (minute > 59) return undefined;
            if (ampm) {
                if (hour < 1 || hour > 12) return undefined;
                const pm = ampm[0].toLowerCase() === "p";
                hour = hour % 12 + (pm ? 12 : 0);
            } else if (hour > 23) return undefined;
            let zone: string;
            const base = ZONES[zoneKey];
            if (offH !== undefined) {
                if (base !== 0) return undefined;
                const sign = offH.startsWith("-") || offH.startsWith("−") ? -1 : 1;
                const total = sign * (Math.abs(Number(offH.slice(1))) * 60 + Number(offM ?? 0));
                if (Math.abs(total) > 14 * 60) return undefined;
                zone = `offset:${total}`;
            } else zone = typeof base === "string" ? base : `offset:${base}`;
            return { kind: "time", hour, minute, zone };
        },
    },
];

function money(amount: number, code: string | undefined): Found | undefined {
    return code && Number.isFinite(amount) && amount > 0 ? { kind: "currency", amount, code } : undefined;
}

function unitOf(raw: string | undefined): Unit | undefined {
    if (!raw) return undefined;
    if (raw === "m") return "m";
    if (raw === "g") return "g";
    return UNIT_WORDS.find(([re]) => re.test(raw))?.[1];
}

/** Every measurement in the text, the longest where two overlap, in order */
export function find(text: string): Match[] {
    if (!/\d/.test(text)) return [];
    const all: Match[] = [];
    for (const { re, read } of PATTERNS) {
        re.lastIndex = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) {
            const found = read(m);
            if (found) all.push({ start: m.index, end: m.index + m[0].length, found });
        }
    }
    all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const out: Match[] = [];
    for (const m of all) {
        const last = out[out.length - 1];
        if (last && m.start < last.end) {
            // The longer one wins: "6'2"" over "2"", "3pm EST" over nothing
            if (m.end - m.start > last.end - last.start) out[out.length - 1] = m;
            continue;
        }
        out.push(m);
    }
    return out;
}

// ---- Converting ---------------------------------------------------------------------------------

const UNIT_INTL: Record<Unit, string> = {
    ft: "foot", in: "inch", yd: "yard", mi: "mile", mm: "millimeter", cm: "centimeter", m: "meter", km: "kilometer",
    lb: "pound", oz: "ounce", g: "gram", kg: "kilogram", F: "fahrenheit", C: "celsius",
    mph: "mile-per-hour", kmh: "kilometer-per-hour", gal: "gallon", floz: "fluid-ounce", ml: "milliliter", L: "liter",
};

function digits(v: number) {
    const a = Math.abs(v);
    return a >= 100 ? 0 : a >= 10 ? 1 : 2;
}

// Building an Intl formatter costs far more than using one, and messages render over and over: keep them
const formatters = new Map<string, object>();
function cached<F extends object>(key: string, make: () => F): F {
    let f = formatters.get(key) as F | undefined;
    if (!f) {
        if (formatters.size > 500) formatters.clear();
        formatters.set(key, f = make());
    }
    return f;
}

function unit(v: number, u: Unit, locale: string, max = digits(v)) {
    return cached(`u|${locale}|${u}|${max}`, () => new Intl.NumberFormat(locale, { style: "unit", unit: UNIT_INTL[u], unitDisplay: "short", maximumFractionDigits: max })).format(v);
}

function feetInches(totalInches: number, locale: string) {
    let ft = Math.floor(totalInches / 12);
    let inch = Math.round(totalInches - ft * 12);
    if (inch === 12) {
        ft++;
        inch = 0;
    }
    return inch ? `${unit(ft, "ft", locale, 0)} ${unit(inch, "in", locale, 0)}` : unit(ft, "ft", locale, 0);
}

/** Metres to the metric unit that reads best */
function metres(m: number, locale: string) {
    if (m >= 1000) return unit(m / 1000, "km", locale);
    if (m < 3) return unit(m * 100, "cm", locale, m * 100 >= 10 ? 0 : 1);
    return unit(m, "m", locale);
}

/** Inches to the imperial unit that reads best */
function inches(i: number, locale: string) {
    if (i >= 5280 * 12) return unit(i / 63360, "mi", locale);
    if (i >= 36 && i < 96) return feetInches(i, locale);
    if (i >= 96) return unit(i / 12, "ft", locale);
    return unit(i, "in", locale);
}

export function convertUnit(found: Extract<Found, { kind: "unit"; }>, prefs: Pick<Prefs, "system" | "locale">): string | undefined {
    const { value: v, unit: u } = found;
    const imperial = IMPERIAL.has(u);
    if ((prefs.system === "imperial") === imperial) return undefined;
    const L = prefs.locale;
    switch (u) {
        // To metric
        case "ft": return metres((found.inches ?? v * 12) * 0.0254, L);
        case "in": return metres(v * 0.0254, L);
        case "yd": return metres(v * 0.9144, L);
        case "mi": return unit(v * 1.609344, "km", L);
        case "lb": return v * 0.45359237 < 1 ? unit(v * 453.59237, "g", L) : unit(v * 0.45359237, "kg", L);
        case "oz": return unit(v * 28.349523125, "g", L);
        case "F": return unit((v - 32) * 5 / 9, "C", L, 0);
        case "mph": return unit(v * 1.609344, "kmh", L, 0);
        case "gal": return unit(v * 3.785411784, "L", L);
        case "floz": return unit(v * 29.5735295625, "ml", L, 0);
        // To imperial
        case "mm": return inches(v / 25.4, L);
        case "cm": return inches(v / 2.54, L);
        case "m": return inches(v / 0.0254, L);
        case "km": return unit(v / 1.609344, "mi", L);
        case "kg": return unit(v / 0.45359237, "lb", L);
        case "g": return v >= 453.59237 ? unit(v / 453.59237, "lb", L) : unit(v / 28.349523125, "oz", L);
        case "C": return unit(v * 9 / 5 + 32, "F", L, 0);
        case "kmh": return unit(v / 1.609344, "mph", L, 0);
        case "L": return v < 1 ? unit(v * 1000 / 29.5735295625, "floz", L, 0) : unit(v / 3.785411784, "gal", L);
        case "ml": return unit(v / 29.5735295625, "floz", L);
    }
}

export function convertMoney(found: Extract<Found, { kind: "currency"; }>, prefs: Pick<Prefs, "currency" | "locale" | "rates">): string | undefined {
    const { amount, code } = found;
    const to = prefs.currency;
    if (code === to || !prefs.rates) return undefined;
    const rate = (c: string) => c === prefs.rates!.base ? 1 : prefs.rates!.rates[c];
    const from = rate(code), into = rate(to);
    if (!from || !into) return undefined;
    const value = amount / from * into;
    const big = Math.abs(value) >= 1000;
    try {
        return cached(`c|${prefs.locale}|${to}|${big}`, () => new Intl.NumberFormat(prefs.locale, { style: "currency", currency: to, ...(big ? { maximumFractionDigits: 0 } : {}) })).format(value);
    } catch {
        return undefined;
    }
}

/** A zone's UTC offset in minutes at an instant */
export function offsetAt(zone: string, at: Date): number {
    if (zone.startsWith("offset:")) return Number(zone.slice(7));
    try {
        const name = cached(`z|${zone}`, () => new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })).formatToParts(at).find(p => p.type === "timeZoneName")?.value ?? "GMT";
        const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
        return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
    } catch {
        return 0;
    }
}

/** The calendar day an instant falls on, at an offset, as days since 1970 */
const dayAt = (ms: number, offset: number) => Math.floor((ms + offset * 60_000) / 86_400_000);

export function convertTime(found: Extract<Found, { kind: "time"; }>, prefs: Pick<Prefs, "zone" | "locale" | "now" | "tr">): string | undefined {
    const now = prefs.now.getTime();
    // Today, as the zone it was written in sees it
    const sourceOffsetNow = offsetAt(found.zone, prefs.now);
    const sourceDay = dayAt(now, sourceOffsetNow);
    let at = sourceDay * 86_400_000 + (found.hour * 60 + found.minute - sourceOffsetNow) * 60_000;
    // Daylight saving may differ between now and then: settle on the offset at that time
    const sourceOffset = offsetAt(found.zone, new Date(at));
    at += (sourceOffsetNow - sourceOffset) * 60_000;
    const yours = offsetAt(prefs.zone, new Date(at));
    if (yours === sourceOffset) return undefined;
    // 24-hour clocks write 07:00, 12-hour ones 7:00 AM
    const cycle = cached(`h|${prefs.locale}`, () => new Intl.DateTimeFormat(prefs.locale, { hour: "numeric" })).resolvedOptions().hourCycle;
    const hour = cycle === "h23" || cycle === "h24" ? "2-digit" : "numeric";
    const time = cached(`t|${prefs.locale}|${hour}|${prefs.zone}`, () => new Intl.DateTimeFormat(prefs.locale, { hour, minute: "2-digit", timeZone: prefs.zone })).format(new Date(at));
    const diff = dayAt(at, yours) - sourceDay;
    if (!diff) return prefs.tr("time.yours", { time });
    const day = cached(`r|${prefs.locale}`, () => new Intl.RelativeTimeFormat(prefs.locale, { numeric: "auto" })).format(diff, "day");
    return prefs.tr("time.yoursDay", { time, day });
}

export interface Kinds {
    currency: boolean;
    units: boolean;
    times: boolean;
}

export function convert(found: Found, prefs: Prefs, kinds: Kinds = { currency: true, units: true, times: true }): string | undefined {
    switch (found.kind) {
        case "currency": {
            if (!kinds.currency) return undefined;
            const v = convertMoney(found, prefs);
            return v && `≈ ${v}`;
        }
        case "unit": {
            if (!kinds.units) return undefined;
            const v = convertUnit(found, prefs);
            return v && `≈ ${v}`;
        }
        case "time": return kinds.times ? convertTime(found, prefs) : undefined;
    }
}

export type Segment = string | { text: string; tip: string; };

/** The text cut into plain runs and the measurements to underline, each with its tooltip */
export function segments(text: string, prefs: Prefs, kinds?: Kinds): Segment[] | undefined {
    const matches = find(text);
    if (!matches.length) return undefined;
    const out: Segment[] = [];
    let last = 0;
    for (const m of matches) {
        const tip = convert(m.found, prefs, kinds);
        if (!tip) continue;
        if (m.start > last) out.push(text.slice(last, m.start));
        out.push({ text: text.slice(m.start, m.end), tip });
        last = m.end;
    }
    if (!last) return undefined;
    if (last < text.length) out.push(text.slice(last));
    return out;
}

// ---- Defaults from where you are ----------------------------------------------------------------

const REGION_CURRENCY: Record<string, string> = {
    US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", IE: "EUR", DE: "EUR", AT: "EUR", FR: "EUR", BE: "EUR", NL: "EUR", ES: "EUR",
    IT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", SK: "EUR", SI: "EUR", LT: "EUR", LV: "EUR", EE: "EUR", HR: "EUR", BG: "EUR", LU: "EUR",
    MT: "EUR", CY: "EUR", PL: "PLN", TR: "TRY", RU: "RUB", JP: "JPY", KR: "KRW", CN: "CNY", TW: "TWD", HK: "HKD", BR: "BRL", MX: "MXN",
    AR: "ARS", IN: "INR", SE: "SEK", NO: "NOK", DK: "DKK", CZ: "CZK", HU: "HUF", RO: "RON", UA: "UAH", CH: "CHF", ZA: "ZAR",
    IL: "ILS", TH: "THB", ID: "IDR", PH: "PHP", MY: "MYR", SG: "SGD", VN: "VND", IS: "ISK",
};
/** For a language without a region (Discord's "de", "tr") */
const LANGUAGE_REGION: Record<string, string> = {
    en: "US", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL", pt: "PT", fi: "FI", el: "GR", lt: "LT", hr: "HR", bg: "BG",
    pl: "PL", tr: "TR", ru: "RU", ja: "JP", ko: "KR", zh: "CN", sv: "SE", no: "NO", nb: "NO", da: "DK", cs: "CZ", hu: "HU",
    ro: "RO", uk: "UA", hi: "IN", th: "TH", vi: "VN", id: "ID",
};

export function regionOf(locales: readonly string[]): string {
    for (const l of locales) {
        const region = /^[a-z]{2,3}[-_]([A-Z]{2})\b/i.exec(l)?.[1]?.toUpperCase();
        if (region) return region;
    }
    for (const l of locales) {
        const lang = l.slice(0, 2).toLowerCase();
        if (LANGUAGE_REGION[lang]) return LANGUAGE_REGION[lang];
    }
    return "US";
}

/**
 * Where you are: your time zone's country first, since most people leave Discord and their browser
 * in "English (US)" wherever they live, then your languages
 */
export function regionFor(zone: string, locales: readonly string[]): string {
    return zoneRegion(zone) ?? regionOf(locales);
}

export const currencyFor = (region: string) => REGION_CURRENCY[region] ?? "USD";
/** Miles and pounds are home in the US, Liberia and Myanmar */
export const systemFor = (region: string): System => ["US", "LR", "MM"].includes(region) ? "imperial" : "metric";
