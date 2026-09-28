/**
 * Text that pure shared code (checks, validators, permission reports) hands to a screen or a dialog.
 * The caller passes its own `t` (the renderer's, or main's `mt`); without one the text is English,
 * straight from the English catalog, so scripts, the server and tests get the same words as before.
 */
import { translate, Vars } from "./i18n";
import { CATALOGS, EviKey } from "./locales";

export type Tr = (key: EviKey, vars?: Vars) => string;

export const englishTr: Tr = (key, vars) => translate(CATALOGS, "en", key, vars);
