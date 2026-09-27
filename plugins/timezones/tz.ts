/**
 * Pure time zone logic for the Timezones plugin: validating IANA ids, offsets, formatting with
 * Intl, "2h ahead of you", and ranking zones for the search box. No Discord code in here.
 */

export type HourCycle = "12h" | "24h";
export type ZoneMap = Record<string, string>;

// ---- Validation ---------------------------------------------------------------------------------

const valid = new Map<string, boolean>();

/** Whether Intl knows this IANA zone id ("Europe/Berlin", "UTC"...) */
export function isValidZone(zone: unknown): zone is string {
    if (typeof zone !== "string" || !zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return false;
    let ok = valid.get(zone);
    if (ok === undefined) {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: zone });
            ok = true;
        } catch {
            ok = false;
        }
        valid.set(zone, ok);
    }
    return ok;
}

const SNOWFLAKE = /^\d{5,25}$/;

/** A saved userId → zone map, keeping only entries that still make sense */
export function parseZones(raw: unknown): ZoneMap {
    const out: ZoneMap = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const [id, zone] of Object.entries(raw as Record<string, unknown>)) {
        if (SNOWFLAKE.test(id) && isValidZone(zone)) out[id] = zone;
    }
    return out;
}

export function withZone(map: ZoneMap, userId: string, zone: string): ZoneMap {
    if (!SNOWFLAKE.test(userId) || !isValidZone(zone) || map[userId] === zone) return map;
    return { ...map, [userId]: zone };
}

export function withoutZone(map: ZoneMap, userId: string): ZoneMap {
    if (!(userId in map)) return map;
    const next = { ...map };
    delete next[userId];
    return next;
}

/** Every zone Intl knows, UTC included */
export function allZones(supported?: readonly string[]): string[] {
    let zones: readonly string[] = supported ?? [];
    if (!supported) {
        try {
            zones = (Intl as any).supportedValuesOf?.("timeZone") ?? [];
        } catch { /* old engine */ }
    }
    if (!zones.length) zones = Object.values(ABBREVIATIONS).flat();
    // Etc/GMT+3 means UTC-3 (POSIX signs): only confusing next to real places
    return [...new Set(["UTC", ...zones])].filter(z => (z === "UTC" || (z.includes("/") && !z.startsWith("Etc/"))) && isValidZone(z));
}

/**
 * Renamed zones: [current IANA name, older name]. Chromium's supportedValuesOf still lists some
 * under their old names (Asia/Calcutta, Europe/Kiev), so both have to be understood.
 */
const RENAMED: [string, string][] = [
    ["Asia/Kolkata", "Asia/Calcutta"],
    ["Europe/Kyiv", "Europe/Kiev"],
    ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
    ["Asia/Kathmandu", "Asia/Katmandu"],
    ["Asia/Yangon", "Asia/Rangoon"],
    ["America/Argentina/Buenos_Aires", "America/Buenos_Aires"],
    ["America/Nuuk", "America/Godthab"],
    ["America/Indiana/Indianapolis", "America/Indianapolis"],
    ["America/Kentucky/Louisville", "America/Louisville"],
    ["Atlantic/Faroe", "Atlantic/Faeroe"],
    ["Africa/Asmara", "Africa/Asmera"],
    ["Pacific/Chuuk", "Pacific/Truk"],
    ["Pacific/Pohnpei", "Pacific/Ponape"],
    ["Pacific/Kanton", "Pacific/Enderbury"],
    ["Asia/Thimphu", "Asia/Thimbu"],
    ["Asia/Dhaka", "Asia/Dacca"],
    ["Asia/Ulaanbaatar", "Asia/Ulan_Bator"],
];
const OTHER_NAME = new Map<string, string>(RENAMED.flatMap(([a, b]) => [[a, b], [b, a]] as [string, string][]));

/** The zone's other name, if it was renamed */
export const otherName = (zone: string) => OTHER_NAME.get(zone);

/** `zone` as it appears in `known`, trying its other name; undefined if neither is there */
export function resolveIn(zone: string, known: ReadonlySet<string>): string | undefined {
    if (known.has(zone)) return zone;
    const other = OTHER_NAME.get(zone);
    return other && known.has(other) ? other : undefined;
}

/** Whether two ids name the same zone */
export const sameZone = (a: string, b: string) => a === b || OTHER_NAME.get(a) === b;

// ---- Offsets ------------------------------------------------------------------------------------

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes the zone is ahead of UTC at that moment (negative when behind) */
export function offsetMinutes(zone: string, date: Date): number {
    let f = partsFormatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
            timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
        });
        partsFormatters.set(zone, f);
    }
    const p: Record<string, number> = {};
    for (const part of f.formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    const t = Math.floor(date.getTime() / 1000) * 1000;
    return Math.round((asUtc - t) / 60_000);
}

/** "UTC", "UTC+3", "UTC-5", "UTC+5:30" */
export function formatOffset(minutes: number): string {
    if (!minutes) return "UTC";
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `UTC${minutes < 0 ? "-" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "2h ahead of you", "3h 30m behind you", "same time as you" */
export function describeDiff(theirOffset: number, yourOffset: number): string {
    const diff = theirOffset - yourOffset;
    if (!diff) return "same time as you";
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const amount = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
    return `${amount} ${diff > 0 ? "ahead of" : "behind"} you`;
}

// ---- Formatting ---------------------------------------------------------------------------------

const uses12h = new Map<string, boolean>();

/** Whether a locale writes times with AM/PM. Remembered: a new formatter per visible time was slow. */
export function localeUses12h(locale: string | undefined): boolean {
    const key = locale || "en-US";
    let found = uses12h.get(key);
    if (found !== undefined) return found;
    try {
        const o = new Intl.DateTimeFormat(key, { hour: "numeric" }).resolvedOptions() as Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string; };
        found = o.hourCycle ? o.hourCycle === "h11" || o.hourCycle === "h12" : !!o.hour12;
    } catch {
        found = false;
    }
    uses12h.set(key, found);
    return found;
}

export interface FormatOptions {
    cycle: HourCycle;
    locale?: string;
    /** Prefix the short weekday: "Tue 3:42 PM" */
    weekday?: boolean;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Narrow no-break and no-break spaces, which newer ICU puts before AM/PM */
const ODD_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0xa0)}]`, "g");
/** Combining diacritical marks, left over after NFD */
const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

function formatter(zone: string, o: FormatOptions) {
    const key = `${zone}|${o.cycle}|${o.locale ?? ""}|${o.weekday ? 1 : 0}`;
    let f = formatters.get(key);
    if (!f) {
        const opts: Intl.DateTimeFormatOptions = {
            timeZone: zone,
            hour: o.cycle === "24h" ? "2-digit" : "numeric",
            minute: "2-digit",
            hourCycle: o.cycle === "24h" ? "h23" : "h12",
            ...o.weekday ? { weekday: "short" } : {},
        };
        try {
            f = new Intl.DateTimeFormat(o.locale || "en-US", opts);
        } catch {
            f = new Intl.DateTimeFormat("en-US", opts);
        }
        if (formatters.size > 2000) formatters.clear();
        formatters.set(key, f);
    }
    return f;
}

/** "3:42 PM" / "15:42" (plain spaces, so the output doesn't depend on the ICU version) */
export function formatTime(date: Date, zone: string, o: FormatOptions): string {
    return formatter(zone, o).format(date).replace(ODD_SPACES, " ").replace(/,(?= )/, "");
}

/** Whole days their calendar date is ahead (+1) or behind (-1) of yours */
export function dayDiff(date: Date, theirOffset: number, yourOffset: number): number {
    const day = (offset: number) => Math.floor((date.getTime() + offset * 60_000) / 86_400_000);
    return day(theirOffset) - day(yourOffset);
}

export interface Describe {
    /** "3:42 PM" */
    short: string;
    /** "Tue 3:42 PM" */
    long: string;
    /** "UTC+3" */
    offset: string;
    /** "2h ahead of you" */
    diff: string;
}

export function describeTime(date: Date, zone: string, yourZone: string, o: Omit<FormatOptions, "weekday">): Describe {
    const theirs = offsetMinutes(zone, date);
    const yours = offsetMinutes(yourZone, date);
    return {
        short: formatTime(date, zone, o),
        long: formatTime(date, zone, { ...o, weekday: true }),
        offset: formatOffset(theirs),
        diff: describeDiff(theirs, yours),
    };
}

/** "Their time: Tue 3:42 PM (UTC+3) · 2h ahead of you" */
export function tooltipText(d: Describe, label = "Their time"): string {
    return `${label}: ${d.long} (${d.offset}) · ${d.diff}`;
}

// ---- Search -------------------------------------------------------------------------------------

/** Common abbreviations; the first zone of each is the best guess and ranks first */
export const ABBREVIATIONS: Record<string, string[]> = {
    UTC: ["UTC"],
    GMT: ["Europe/London", "UTC"],
    BST: ["Europe/London"],
    WET: ["Europe/Lisbon"],
    WEST: ["Europe/Lisbon"],
    IST: ["Asia/Kolkata", "Europe/Dublin", "Asia/Jerusalem"],
    CET: ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Vienna", "Europe/Brussels", "Europe/Prague"],
    CEST: ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Vienna", "Europe/Brussels", "Europe/Prague"],
    EET: ["Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest", "Africa/Cairo"],
    EEST: ["Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest"],
    TRT: ["Europe/Istanbul"],
    MSK: ["Europe/Moscow"],
    GST: ["Asia/Dubai"],
    PKT: ["Asia/Karachi"],
    ICT: ["Asia/Bangkok", "Asia/Ho_Chi_Minh"],
    WIB: ["Asia/Jakarta"],
    SGT: ["Asia/Singapore"],
    HKT: ["Asia/Hong_Kong"],
    PHT: ["Asia/Manila"],
    CST: ["America/Chicago", "Asia/Shanghai", "America/Mexico_City"],
    CDT: ["America/Chicago"],
    JST: ["Asia/Tokyo"],
    KST: ["Asia/Seoul"],
    AWST: ["Australia/Perth"],
    ACST: ["Australia/Adelaide", "Australia/Darwin"],
    ACDT: ["Australia/Adelaide"],
    AEST: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane"],
    AEDT: ["Australia/Sydney", "Australia/Melbourne"],
    NZST: ["Pacific/Auckland"],
    NZDT: ["Pacific/Auckland"],
    EST: ["America/New_York", "America/Toronto", "America/Detroit"],
    EDT: ["America/New_York", "America/Toronto"],
    ET: ["America/New_York"],
    MST: ["America/Denver", "America/Phoenix", "America/Edmonton"],
    MDT: ["America/Denver"],
    MT: ["America/Denver"],
    PST: ["America/Los_Angeles", "America/Vancouver", "America/Tijuana"],
    PDT: ["America/Los_Angeles"],
    PT: ["America/Los_Angeles"],
    CT: ["America/Chicago"],
    AKST: ["America/Anchorage"],
    AKDT: ["America/Anchorage"],
    HST: ["Pacific/Honolulu"],
    AST: ["America/Halifax", "Asia/Riyadh"],
    NST: ["America/St_Johns"],
    BRT: ["America/Sao_Paulo"],
    ART: ["America/Argentina/Buenos_Aires"],
    SAST: ["Africa/Johannesburg"],
    WAT: ["Africa/Lagos"],
    EAT: ["Africa/Nairobi"],
};

/** Places people search for that aren't the city an IANA zone is named after */
export const ALIASES: Record<string, string> = {
    "san francisco": "America/Los_Angeles",
    "seattle": "America/Los_Angeles",
    "california": "America/Los_Angeles",
    "boston": "America/New_York",
    "miami": "America/New_York",
    "washington": "America/New_York",
    "atlanta": "America/New_York",
    "dallas": "America/Chicago",
    "houston": "America/Chicago",
    "texas": "America/Chicago",
    "montreal": "America/Toronto",
    "ottawa": "America/Toronto",
    "mumbai": "Asia/Kolkata",
    "delhi": "Asia/Kolkata",
    "new delhi": "Asia/Kolkata",
    "bangalore": "Asia/Kolkata",
    "india": "Asia/Kolkata",
    "beijing": "Asia/Shanghai",
    "china": "Asia/Shanghai",
    "japan": "Asia/Tokyo",
    "korea": "Asia/Seoul",
    "turkey": "Europe/Istanbul",
    "ankara": "Europe/Istanbul",
    "germany": "Europe/Berlin",
    "munich": "Europe/Berlin",
    "france": "Europe/Paris",
    "spain": "Europe/Madrid",
    "barcelona": "Europe/Madrid",
    "italy": "Europe/Rome",
    "milan": "Europe/Rome",
    "netherlands": "Europe/Amsterdam",
    "england": "Europe/London",
    "uk": "Europe/London",
    "manchester": "Europe/London",
    "ukraine": "Europe/Kyiv",
    "kiev": "Europe/Kyiv",
    "russia": "Europe/Moscow",
    "saint petersburg": "Europe/Moscow",
    "brazil": "America/Sao_Paulo",
    "rio de janeiro": "America/Sao_Paulo",
    "vietnam": "Asia/Ho_Chi_Minh",
    "hanoi": "Asia/Bangkok",
    "philippines": "Asia/Manila",
    "indonesia": "Asia/Jakarta",
    "uae": "Asia/Dubai",
    "abu dhabi": "Asia/Dubai",
    "israel": "Asia/Jerusalem",
    "tel aviv": "Asia/Jerusalem",
    "egypt": "Africa/Cairo",
    "canberra": "Australia/Sydney",
    "new zealand": "Pacific/Auckland",
    "wellington": "Pacific/Auckland",
    "hawaii": "Pacific/Honolulu",
    "alaska": "America/Anchorage",
};

export const normalize = (s: string) => s.normalize("NFD").replace(MARKS, "").toLowerCase().replace(/[_/\-.,()]+/g, " ").replace(/\s+/g, " ").trim();

/** "America/Argentina/Buenos_Aires" → "Buenos Aires" */
export const cityOf = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ");
/** "America/Argentina/Buenos_Aires" → "America · Argentina" */
export const regionOf = (zone: string) => zone.split("/").slice(0, -1).map(s => s.replace(/_/g, " ")).join(" · ");

/** "utc+3", "gmt-5:30", "+3", "-0530" → minutes, or undefined */
export function parseOffsetQuery(q: string): number | undefined {
    const m = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(q.trim()) ?? /^(?:utc|gmt)$/i.exec(q.trim());
    if (!m) return undefined;
    if (!m[1]) return 0;
    const h = Number(m[2]);
    const min = Number(m[3] ?? 0);
    if (h > 14 || min >= 60) return undefined;
    return (m[1] === "-" ? -1 : 1) * (h * 60 + min);
}

/**
 * Zones matching the query, best first:
 * exact id > abbreviation ("EST") > alias ("San Francisco") > city exact > city prefix
 * > word prefix in the id > substring > same current offset ("UTC+3").
 * An empty query returns every zone ordered by current offset, then name.
 */
export function searchZones(query: string, zones: readonly string[], date: Date, limit = Infinity): string[] {
    const q = normalize(query);
    if (!q) {
        const withOffset = zones.map(z => [z, offsetMinutes(z, date)] as const);
        withOffset.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
        return withOffset.slice(0, limit).map(([z]) => z);
    }

    const scores = new Map<string, number>();
    const offer = (zone: string, score: number) => {
        const old = scores.get(zone);
        if (old === undefined || score < old) scores.set(zone, score);
    };
    const { known, popular } = zoneIndex(zones);

    const rawUpper = query.trim().toUpperCase();
    const abbr = ABBREVIATIONS[rawUpper];
    abbr?.forEach((z, i) => {
        const found = resolveIn(z, known);
        if (found) offer(found, 100 + i);
    });

    for (const [alias, zone] of Object.entries(ALIASES)) {
        const found = resolveIn(zone, known);
        if (!found) continue;
        if (alias === q) offer(found, 200);
        else if (alias.startsWith(q) && q.length >= 3) offer(found, 450);
    }

    for (const zone of zones) {
        const other = OTHER_NAME.get(zone);
        const ids = other ? [normalize(zone), normalize(other)] : [normalize(zone)];
        const cities = (other ? [zone, other] : [zone]).map(z => normalize(cityOf(z)));
        const bonus = popular.has(zone) ? 0 : 30;
        if (ids.includes(q)) offer(zone, 0);
        else if (cities.includes(q)) offer(zone, 300);
        else if (cities.some(c => c.startsWith(q))) offer(zone, 400 + bonus + Math.min(...cities.map(c => c.length)));
        else if (ids.some(id => ` ${id}`.includes(` ${q}`))) offer(zone, 500 + bonus + ids[0].length);
        else if (ids.some(id => id.includes(q))) offer(zone, 600 + bonus + ids[0].length);
    }

    const offset = parseOffsetQuery(query);
    if (offset !== undefined) {
        for (const zone of zones) if (offsetMinutes(zone, date) === offset) offer(zone, popular.has(zone) ? 700 : 730);
    } else if (!abbr && /^[a-z]{2,5}$/i.test(query.trim())) {
        // Abbreviations Intl itself prints for a zone ("EST" for America/Detroit), as a last resort
        for (const zone of zones) {
            if (shortName(zone, date).toUpperCase() === rawUpper) offer(zone, 650);
        }
    }

    return [...scores].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([z]) => z);
}

let popularCache: { zones: readonly string[]; known: Set<string>; popular: Set<string>; } | undefined;

/** The zones as a set, and the ones people actually live in (named by abbreviations and aliases) */
function zoneIndex(zones: readonly string[]) {
    if (popularCache?.zones === zones) return popularCache;
    const known = new Set(zones);
    const popular = new Set<string>();
    for (const z of [...Object.values(ABBREVIATIONS).flat(), ...Object.values(ALIASES)]) {
        const found = resolveIn(z, known);
        if (found) popular.add(found);
    }
    return popularCache = { zones, known, popular };
}

const shortNames = new Map<string, Intl.DateTimeFormat>();

/** Intl's own short name for the zone at that moment: "EST", "PDT", or "GMT+3" when it has none */
export function shortName(zone: string, date: Date): string {
    let f = shortNames.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" });
        shortNames.set(zone, f);
    }
    return f.formatToParts(date).find(p => p.type === "timeZoneName")?.value ?? "";
}

/** The device's own zone, "UTC" if unknown */
export function localZone(): string {
    try {
        const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isValidZone(z) ? z : "UTC";
    } catch {
        return "UTC";
    }
}
