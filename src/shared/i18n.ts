/**
 * Evi's translations, the pure part: picking a language, filling in `{name}` placeholders and
 * choosing plural forms. English is the source: a key another language lacks falls back to it.
 *
 * A message is a string, or a plural object keyed by `Intl.PluralRules` category that must have
 * `other` (Russian and Polish need `few` and `many`, Japanese only `other`):
 *     "plugins.count": { one: "{count} plugin", other: "{count} plugins" }
 * The plural form is picked from `vars.count`.
 */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string; };
export type Message = string | PluralMessage;
export type Messages = Partial<Record<string, Message>>;
export type Vars = Record<string, string | number>;

export const FALLBACK_LOCALE = "en";

/**
 * The best of `available` for a language tag like Discord's (`en-US`, `pt-BR`, `es-ES`, `zh-CN`):
 * the exact tag, else the same language in any region. Undefined when nothing fits.
 */
export function matchLocale(requested: string | null | undefined, available: readonly string[]): string | undefined {
    if (!requested) return;
    const want = requested.trim().replace(/_/g, "-").toLowerCase();
    if (!want) return;
    const exact = available.find(l => l.toLowerCase() === want);
    if (exact) return exact;
    const base = want.split("-")[0];
    return available.find(l => l.toLowerCase() === base) ?? available.find(l => l.toLowerCase().split("-")[0] === base);
}

/** `{name}` placeholders filled from `vars`; unknown ones stay as written */
export function format(template: string, vars?: Vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars ? String(vars[name]) : whole);
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: string, count: number): Intl.LDMLPluralRule {
    let rules = pluralRules.get(locale);
    if (!rules) {
        try {
            rules = new Intl.PluralRules(locale);
        } catch {
            rules = new Intl.PluralRules(FALLBACK_LOCALE);
        }
        pluralRules.set(locale, rules);
    }
    return rules.select(count);
}

/** A plural message's form for `count`, falling back to `other` */
export function pickPlural(message: PluralMessage, locale: string, count: number) {
    return message[pluralCategory(locale, count)] ?? message.other;
}

/**
 * The text for `key` in `locale`, from `catalogs` (locale -> messages). A key the language lacks
 * uses the fallback language's; a key nobody has shows the key itself, so it's noticed.
 */
export function translate(catalogs: Record<string, Messages | undefined>, locale: string, key: string, vars?: Vars, fallback = FALLBACK_LOCALE): string {
    let lang = locale;
    let message = catalogs[locale]?.[key];
    if (message === undefined) {
        lang = fallback;
        message = catalogs[fallback]?.[key];
    }
    if (message === undefined) return key;
    const text = typeof message === "string" ? message : pickPlural(message, lang, Number(vars?.count ?? 0));
    return format(text, vars);
}

/** Keys a translation has that English lacks, and English keys it hasn't translated yet */
export function compareCatalog(source: Messages, translation: Messages) {
    return {
        extra: Object.keys(translation).filter(k => !(k in source)),
        missing: Object.keys(source).filter(k => !(k in translation)),
    };
}
