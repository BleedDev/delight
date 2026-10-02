/**
 * What Search Highlight looks for in a message: the words and quoted phrases of a Discord search,
 * without its filters (from:, in:, has:, before:...), matched the way Discord's search matches:
 * case and accents don't matter, and a word matches at the start of a word ("cat" finds "cats",
 * not "concat"). A match covers the rest of its word, so "cat" lights up all of "cats".
 */

export interface Term {
    /** Folded (lowercase, no accents) words; more than one for a quoted phrase */
    words: string[];
}

/** Up to this many terms: a search is a few words, not a paragraph */
const MAX_TERMS = 20;

/** A filter: a word, a colon, then a quoted value or anything up to a space (from:"a b", has:link) */
const FILTER = /(?:^|\s)-?[\p{L}_]+:(?:"[^"]*"?|\S*)/gu;
const WORD = /[\p{L}\p{N}]/u;

/** Lowercase, without accents ("Café" -> "cafe"), one entry per character of the original */
export function fold(text: string): { folded: string; map: number[]; } {
    let folded = "";
    const map: number[] = [];
    let i = 0;
    for (const ch of text) {
        const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        for (let k = 0; k < f.length; k++) map.push(i);
        folded += f;
        i += ch.length;
    }
    map.push(i);
    return { folded, map };
}

const foldWord = (w: string) => fold(w).folded;

/** The words and "quoted phrases" a search looks for, its filters left out */
export function parseQuery(raw: string | undefined | null): Term[] {
    if (!raw) return [];
    const text = raw.replace(FILTER, " ");
    const terms: Term[] = [];
    const seen = new Set<string>();
    const add = (words: string[]) => {
        const clean = words.map(foldWord).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
        const key = clean.join(" ");
        if (!clean.length || seen.has(key) || terms.length >= MAX_TERMS) return;
        seen.add(key);
        terms.push({ words: clean });
    };
    const rest = text.replace(/"([^"]*)"?/g, (_, phrase: string) => {
        add(phrase.split(/\s+/));
        return " ";
    });
    for (const word of rest.split(/\s+/)) add([word]);
    return terms;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regex for all the terms: each at the start of a word, running to the end of its last word */
export function matcher(terms: Term[]): RegExp | undefined {
    if (!terms.length) return;
    // Longest first, so a phrase wins over one of its words
    const parts = [...terms]
        .sort((a, b) => b.words.join(" ").length - a.words.join(" ").length)
        .map(t => t.words.map(escape).join("[\\s\\p{P}]+"));
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})[\\p{L}\\p{N}]*`, "gu");
}

/** Where the terms are in `text`, as [start, end) in its own indices, sorted, not overlapping */
export function findMatches(text: string, terms: Term[] | RegExp | undefined): [number, number][] {
    const re = terms instanceof RegExp ? terms : matcher(terms ?? []);
    if (!re || !text || !WORD.test(text)) return [];
    const { folded, map } = fold(text);
    const out: [number, number][] = [];
    re.lastIndex = 0;
    for (const m of folded.matchAll(re)) {
        if (!m[0]) continue;
        const start = map[m.index!], end = map[m.index! + m[0].length];
        const last = out[out.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else out.push([start, end]);
    }
    return out;
}

/** The text of several pieces (text nodes) joined, and which piece each match starts and ends in */
export function locate(pieces: string[], matches: [number, number][]) {
    const starts: number[] = [];
    let at = 0;
    for (const p of pieces) {
        starts.push(at);
        at += p.length;
    }
    const where = (offset: number, isEnd: boolean) => {
        // An end at a piece boundary belongs to the piece before it
        let i = starts.length - 1;
        while (i > 0 && (isEnd ? starts[i] >= offset : starts[i] > offset)) i--;
        return { piece: i, offset: offset - starts[i] };
    };
    return matches.map(([s, e]) => ({ start: where(s, false), end: where(e, true) }));
}
