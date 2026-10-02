/**
 * Hover Converter: "$20", "5 ft", "30°C" or "3pm EST" in a message get a dotted underline; hover or
 * focus one for it in your currency, your units or your time zone.
 *
 * - Where: an after hook on Discord's markdown `parse` (the object that also has parseTopic), which
 *   renders message content, embeds and topics. Its React output is walked and plain text runs
 *   are cut around what convert.ts finds. Code, links and spoilers (rendered later, from a
 *   function) are left alone.
 * - Rates: per euro, from Frankfurter (the European Central Bank's) with ExchangeRate-API filling
 *   the currencies the ECB doesn't publish, kept for 12 hours under this plugin's settings.
 * - Each underline works out its text when it renders, so rates arriving or a setting changing
 *   update what's on screen without Discord re-parsing anything.
 */
import { Components, definePlugin, filters, I18n, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { CODES, convert, currencyFor, find, regionOf, systemFor } from "./convert";
import type { Found, Kinds, Prefs, Rates } from "./convert";
import { t } from "./strings";

const RATES_KEY = "rates";
const RATES_TTL = 12 * 60 * 60 * 1000;
const FRANKFURTER = "https://api.frankfurter.dev/v1/latest?base=EUR";
const EXCHANGE_RATE_API = "https://open.er-api.com/v6/latest/EUR";
/** How deep into Discord's output to look: messages nest a few levels (lists, quotes, bold) */
const MAX_DEPTH = 12;

const region = () => regionOf([...(navigator.languages ?? []), navigator.language, I18n.discordLocale].filter(Boolean));
const autoCurrency = () => currencyFor(region());

function currencyName(code: string) {
    try {
        return new Intl.DisplayNames([I18n.discordLocale], { type: "currency" }).of(code) ?? code;
    } catch {
        return code;
    }
}

const settings = {
    currency: {
        type: "select",
        get label() { return t("settings.currency"); },
        get description() { return t("settings.currency.description"); },
        default: "auto",
        options: [
            { get label() { return t("settings.currency.auto", { currency: autoCurrency() }); }, value: "auto" },
            ...CODES.map(code => ({ get label() { return `${code} · ${currencyName(code)}`; }, value: code })),
        ],
    },
    units: {
        type: "select",
        get label() { return t("settings.units"); },
        get description() { return t("settings.units.description"); },
        default: "auto",
        options: [
            { get label() { return t("settings.units.auto"); }, value: "auto" },
            { get label() { return t("settings.units.metric"); }, value: "metric" },
            { get label() { return t("settings.units.imperial"); }, value: "imperial" },
        ],
    },
    money: {
        type: "boolean",
        get label() { return t("settings.money"); },
        get description() { return t("settings.money.description"); },
        default: true,
    },
    measures: {
        type: "boolean",
        get label() { return t("settings.measures"); },
        get description() { return t("settings.measures.description"); },
        default: true,
    },
    times: {
        type: "boolean",
        get label() { return t("settings.times"); },
        get description() { return t("settings.times.description"); },
        default: true,
    },
} as const;

let context: PluginContext<typeof settings> | undefined;
let rates: Rates | undefined;

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => context?.settings as unknown as Storage | undefined;

// ---- Re-render signal ---------------------------------------------------------------------------

let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
    version++;
    listeners.forEach(l => l());
};
function useVersion() {
    return React.useSyncExternalStore(cb => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
    }, () => version);
}

// ---- Preferences --------------------------------------------------------------------------------

const tr: Prefs["tr"] = (key, vars) => t(key, vars);

/**
 * Everything but the clock, worked out once: Discord parses markdown for every message it draws, and
 * the region and time zone lookups cost more than the parse. Redone when a setting or rates change
 * (bump), Discord's language changes, or after a minute (the time zone may have moved).
 */
let base: { at: number; version: number; locale: string; currency: string; system: Prefs["system"]; zone: string; } | undefined;

function prefs(): Prefs {
    const locale = I18n.discordLocale;
    const at = Date.now();
    if (!base || base.version !== version || base.locale !== locale || at - base.at > 60_000) {
        const s = context?.settings;
        const currency = s?.get("currency") ?? "auto";
        const units = s?.get("units") ?? "auto";
        const r = currency === "auto" || units === "auto" ? region() : "";
        base = {
            at, version, locale,
            currency: currency === "auto" ? currencyFor(r) : currency,
            system: units === "auto" ? systemFor(r) : units,
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
    }
    return { locale, currency: base.currency, system: base.system, zone: base.zone, now: new Date(at), rates, tr };
}

function kinds(): Kinds {
    const s = context?.settings;
    return { currency: s?.get("money") ?? true, units: s?.get("measures") ?? true, times: s?.get("times") ?? true };
}

/** Worth an underline: it converts, or it's money waiting on the rates */
function worth(found: Found, p: Prefs, k: Kinds) {
    if (convert(found, p, k)) return true;
    return found.kind === "currency" && k.currency && !p.rates && found.code !== p.currency;
}

// ---- Rates --------------------------------------------------------------------------------------

async function json(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return res.json();
}

async function loadRates() {
    const saved = storage()?.get(RATES_KEY) as (Rates & { at: number; }) | undefined;
    if (saved?.rates && saved.base) {
        rates = { base: saved.base, rates: saved.rates };
        bump();
        if (Date.now() - saved.at < RATES_TTL) return;
    }
    const merged: Record<string, number> = {};
    // ExchangeRate-API first, then the ECB's on top: the ECB's where it has one
    const [other, ecb] = await Promise.allSettled([json(EXCHANGE_RATE_API), json(FRANKFURTER)]);
    if (other.status === "fulfilled" && other.value?.rates) Object.assign(merged, other.value.rates);
    if (ecb.status === "fulfilled" && ecb.value?.rates) Object.assign(merged, ecb.value.rates);
    const clean = Object.fromEntries(Object.entries(merged).filter(([code, v]) => /^[A-Z]{3}$/.test(code) && typeof v === "number" && v > 0));
    if (!Object.keys(clean).length) {
        context?.logger.warn("Couldn't load exchange rates", ecb.status === "rejected" ? ecb.reason : other);
        return;
    }
    rates = { base: "EUR", rates: { ...clean, EUR: 1 } };
    storage()?.set(RATES_KEY, { ...rates, at: Date.now() });
    bump();
}

// ---- The underline ------------------------------------------------------------------------------

function Converted({ text, found }: { text: string; found: Found; }) {
    useVersion();
    const tip = context ? convert(found, prefs(), kinds()) : undefined;
    if (!tip) return <>{text}</>;
    const span = <span className="evi-hc" tabIndex={0} aria-description={tip}>{text}</span>;
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={tip}>{span}</Tooltip> : React.cloneElement(span, { title: tip });
}

function cut(text: string, p: Prefs, k: Kinds, keyBase: string): React.ReactNode {
    const matches = find(text).filter(m => worth(m.found, p, k));
    if (!matches.length) return text;
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of matches) {
        if (m.start > last) out.push(text.slice(last, m.start));
        out.push(<Converted key={`${keyBase}-${m.start}`} text={text.slice(m.start, m.end)} found={m.found} />);
        last = m.end;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

const SKIP_TAGS = new Set(["code", "pre", "a", "textarea", "input"]);

/** Discord's rendered markdown, with measurements in plain text underlined; the same node if none */
function walk(node: any, p: Prefs, k: Kinds, depth: number, key: string): any {
    if (typeof node === "string") return /\d/.test(node) ? cut(node, p, k, key) : node;
    if (Array.isArray(node)) {
        let changed = false;
        const next = node.map((child, i) => {
            // Most children are text without a digit: skip them before building a key
            if (typeof child === "string" && !/\d/.test(child)) return child;
            const v = walk(child, p, k, depth + 1, `${key}.${i}`);
            if (v !== child) changed = true;
            return v;
        });
        return changed ? next : node;
    }
    if (!node || typeof node !== "object" || !node.$$typeof || !node.props || depth > MAX_DEPTH) return node;
    const { props, type } = node;
    if (typeof type === "string" && SKIP_TAGS.has(type)) return node;
    if (props.href != null || typeof props.className === "string" && /code|hljs|mention/i.test(props.className)) return node;
    if (props.children == null || typeof props.children === "function") return node;
    const children = walk(props.children, p, k, depth + 1, `${key}c`);
    return children === props.children ? node : React.cloneElement(node, { children });
}

const css = `
.evi-hc {
    text-decoration: underline dotted;
    text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
    cursor: help;
    border-radius: 2px;
}
.evi-hc:hover { text-decoration-color: currentColor; }
.evi-hc:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 1px; }
`;

/** Discord's markdown: parse, parseTopic, parseEmbedTitle... */
const markdownFilter = filters.byProps("parse", "parseTopic");

export default definePlugin({
    settings,

    start(ctx) {
        context = ctx;
        ctx.addStyle(css);
        void loadRates().catch(err => ctx.logger.warn("Couldn't load exchange rates", err));
        ctx.setInterval(() => void loadRates().catch(() => { }), RATES_TTL);
        // Settings change what converts and how: redraw the underlines
        ctx.settings.onChange(bump);

        ctx.hookExport("after", markdownFilter, "parse", ({ result }) => {
            if (!context || result == null) return;
            const p = prefs(), k = kinds();
            if (!k.currency && !k.units && !k.times) return;
            const next = walk(result, p, k, 0, "evi-hc");
            return next === result ? undefined : next;
        });
    },

    stop() {
        context = undefined;
        rates = undefined;
        base = undefined;
    },
});
