/**
 * Evi speaks Discord's language. The language comes from Discord's LocaleStore (the one picked in
 * Discord's Language settings), else the `lang` Discord puts on <html>, else English, and follows
 * changes live: components re-render through useLocale().
 */
import { FALLBACK_LOCALE, matchLocale, Message, translate, Vars } from "@shared/i18n";
import type { ReactNode } from "react";
import { CATALOGS, EviKey, LOCALES } from "@shared/locales";

import { React } from "./webpack/common";
import { filters, findStore, waitFor } from "./webpack/find";

interface LocaleStore {
    locale?: string;
    addChangeListener?(fn: () => void): void;
}

let discordLocale = "";
let locale = FALLBACK_LOCALE;
let started = false;
const listeners = new Set<() => void>();

function read() {
    let store: LocaleStore | undefined;
    try {
        store = findStore<LocaleStore>("LocaleStore");
    } catch {
        // Webpack isn't up yet
    }
    return store?.locale || (typeof document !== "undefined" ? document.documentElement?.lang : "") || "";
}

function refresh() {
    const next = read();
    if (next === discordLocale) return;
    discordLocale = next;
    const matched = matchLocale(next, LOCALES) ?? FALLBACK_LOCALE;
    locale = matched;
    listeners.forEach(l => l());
}

function start() {
    if (started) return;
    started = true;
    if (typeof document === "undefined") return;
    refresh();
    // Discord updates <html lang> when its language changes, even before its stores exist
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    waitFor<LocaleStore>(filters.byStoreName("LocaleStore"), store => {
        store.addChangeListener?.(refresh);
        refresh();
    });
}

export const I18n = {
    /** Evi's language, one of its locales */
    get locale() {
        start();
        return locale;
    },
    /** Discord's own language tag, like `en-US` or `pt-BR` */
    get discordLocale() {
        start();
        return discordLocale || FALLBACK_LOCALE;
    },
    subscribe(fn: () => void) {
        start();
        listeners.add(fn);
        return () => void listeners.delete(fn);
    },
};

/** Evi's UI text for `key` in Discord's language, `{name}` placeholders filled from `vars` */
export function t(key: EviKey, vars?: Vars): string {
    return translate(CATALOGS, I18n.locale, key, vars);
}

/**
 * Like t(), for text with React elements in it: each `{name}` whose value is in `nodes` becomes that
 * node, so a translation can move it around ("By {authors}" / "{authors} tarafından").
 */
export function tNodes(key: EviKey, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode[] {
    return t(key, vars).split(/\{(\w+)\}/g).map((part, i) => i % 2 ? React.createElement(React.Fragment, { key: i }, nodes[part] ?? `{${part}}`) : part);
}

/** "5 minutes ago", "yesterday", in Discord's language */
export function timeAgo(at: number, now = Date.now()) {
    const relative = new Intl.RelativeTimeFormat(I18n.discordLocale, { numeric: "auto" });
    const seconds = Math.round((at - now) / 1000);
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]] as const;
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return t("common.justNow");
}

/** React hook: the current language. Call it at a tree's root so the tree re-renders when it changes. */
export function useLocale() {
    return React.useSyncExternalStore(I18n.subscribe, () => I18n.locale);
}

/**
 * A plugin's own strings, by locale: `{ en: {...}, es: {...}, "pt-BR": {...} }`. English is the
 * fallback and the source of the keys. Returns a `t(key, vars)` that follows Discord's language.
 */
export function defineStrings<const E extends Record<string, Message>>(strings: { en: E; } & Record<string, Partial<Record<keyof E, Message>>>) {
    const catalogs = strings as Record<string, Record<string, Message>>;
    const locales = Object.keys(catalogs);
    return (key: keyof E & string, vars?: Vars): string => {
        const lang = matchLocale(I18n.discordLocale, locales) ?? "en";
        return translate(catalogs, lang, key, vars, "en");
    };
}
