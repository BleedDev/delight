/**
 * A plugin's manifest (and its store entry) in other languages:
 *
 *   "locales": { "de": { "name": "…", "description": "…", "changelog": { "1.2.0": ["…"] } } }
 *
 * English stays in the usual fields and is the fallback for anything a locale leaves out.
 */
import { matchLocale } from "./i18n";

export interface PluginLocale {
    name?: string;
    description?: string;
    /** Notes by version, replacing that version's English notes */
    changelog?: Record<string, string[]>;
}

export type PluginLocales = Record<string, PluginLocale>;

const MAX_LOCALES = 30;
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\0-\x08\x0e-\x1f]/.test(v);

/** The locales block cleaned, or the reason it's unusable. Undefined stays undefined */
export function validateLocales(value: unknown): PluginLocales | undefined | string {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) return "locales must be an object of languages";
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_LOCALES) return `locales can list at most ${MAX_LOCALES} languages`;
    const out: PluginLocales = {};
    for (const [lang, raw] of entries) {
        if (!LOCALE_RE.test(lang)) return `locales: "${lang.slice(0, 20)}" isn't a language code like de or pt-BR`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `locales.${lang} must be an object`;
        const l = raw as Record<string, unknown>;
        const clean: PluginLocale = {};
        if (l.name !== undefined) {
            if (!isText(l.name, 80)) return `locales.${lang}.name must be 1-80 characters`;
            clean.name = l.name as string;
        }
        if (l.description !== undefined) {
            if (typeof l.description !== "string" || l.description.length > 500) return `locales.${lang}.description must be at most 500 characters`;
            clean.description = l.description;
        }
        if (l.changelog !== undefined) {
            if (!l.changelog || typeof l.changelog !== "object" || Array.isArray(l.changelog)) return `locales.${lang}.changelog must map versions to notes`;
            const versions = Object.entries(l.changelog as Record<string, unknown>);
            if (versions.length > 50) return `locales.${lang}.changelog can list at most 50 versions`;
            clean.changelog = {};
            for (const [version, notes] of versions) {
                if (!Array.isArray(notes) || notes.length > 20 || !notes.every(n => isText(n, 500))) return `locales.${lang}.changelog.${version.slice(0, 20)} must list at most 20 notes`;
                clean.changelog[version] = [...notes];
            }
        }
        out[lang] = clean;
    }
    return out;
}

interface Localizable {
    name: string;
    description?: string;
    changelog?: { version: string; notes: string[]; }[];
    locales?: PluginLocales;
}

/** The manifest or entry as `locale` reads it: translated name, description and notes where it has them */
export function localizePlugin<T extends Localizable>(item: T, locale: string | null | undefined): T {
    const locales = item.locales;
    if (!locales) return item;
    const lang = matchLocale(locale, Object.keys(locales));
    const l = lang ? locales[lang] : undefined;
    if (!l) return item;
    return {
        ...item,
        ...l.name && { name: l.name },
        ...l.description && { description: l.description },
        ...item.changelog && l.changelog && { changelog: item.changelog.map(c => l.changelog![c.version] ? { ...c, notes: l.changelog![c.version] } : c) },
    };
}
