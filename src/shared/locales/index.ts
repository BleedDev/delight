/**
 * Evi's languages. English (en.ts) is the source: every other file translates some or all of its
 * keys, and a key a language lacks shows in English. Languages are matched to Discord's by tag
 * (`pt-BR`), then by language (`es-ES` -> `es`).
 */
import type { Message } from "../i18n";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { pl } from "./pl";
import { ptBR } from "./pt-BR";
import { ru } from "./ru";
import { tr } from "./tr";

export type EviKey = keyof typeof en;
/** A translation: any of English's keys, and only those */
export type Translation = Partial<Record<EviKey, Message>>;

export const CATALOGS: Record<string, Partial<Record<string, Message>>> = {
    en,
    es,
    "pt-BR": ptBR,
    fr,
    de,
    tr,
    ru,
    pl,
    ja,
};

export const LOCALES = Object.keys(CATALOGS);
