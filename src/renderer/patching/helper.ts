/**
 * Patch Helper: evaluates a draft source patch against module sources, without applying it.
 * Uses the same matching, normalization and compile steps as source.ts, so what it reports is what
 * the patcher would do. Pure: the caller passes the module sources in (see diagnose.moduleSources).
 */
import { canonicalizeMatch, canonicalizeReplace, matchesFind, normalizeFactorySource, tryCompile } from "./source";

/** Text written as /source/flags is a RegExp, anything else a plain string */
const REGEX_LITERAL = /^\/(.+)\/([a-z]*)$/s;

/** Parses a find or match input. Throws a SyntaxError for an invalid /regex/. */
export function parsePatchValue(text: string): string | RegExp {
    const m = REGEX_LITERAL.exec(text);
    return m ? new RegExp(m[1], m[2]) : text;
}

/** A slice of source with the interesting part separated out, so the UI can highlight it */
export interface Excerpt {
    lead: string;
    mark: string;
    tail: string;
    clippedStart: boolean;
    clippedEnd: boolean;
    /** The highlighted part was too long and got shortened in the middle */
    clippedMark: boolean;
}

export interface PatchDraft {
    find: string;
    match: string;
    replace: string;
}

export interface PatchHelperResult {
    /** Input errors, per field */
    errors: { find?: string; match?: string; };
    /** Every module whose source matches `find` */
    candidates: string[];
    /** The module the rest of the result is about */
    moduleId?: string;
    /** How many times `match` occurs in that module (what String.prototype.replace would replace) */
    matchCount: number;
    /** The first match with context around it */
    match?: Excerpt;
    /** Capture groups of the first match */
    groups: (string | undefined)[];
    /** The changed region before and after the replacement */
    before?: Excerpt;
    after?: Excerpt;
    /** Whether the replacement changed anything; the patcher counts an unchanged module as a failed replacement */
    changed: boolean;
    compile?: { ok: true; } | { ok: false; error: string; };
    /** Ready to paste into a plugin's `patches` array */
    snippet?: string;
}

const CONTEXT = 160;
const MAX_MARK = 1200;
const MAX_MATCHES = 1000;

function excerpt(code: string, start: number, end: number): Excerpt {
    const from = Math.max(0, start - CONTEXT);
    const to = Math.min(code.length, end + CONTEXT);
    let mark = code.slice(start, end);
    const clippedMark = mark.length > MAX_MARK;
    if (clippedMark) mark = `${mark.slice(0, MAX_MARK / 2)} … ${mark.slice(-MAX_MARK / 2)}`;
    return {
        lead: code.slice(from, start),
        mark,
        tail: code.slice(end, to),
        clippedStart: from > 0,
        clippedEnd: to < code.length,
        clippedMark,
    };
}

/** Occurrences String.prototype.replace would act on: the first one, or all of them for a global RegExp */
function findMatches(code: string, matcher: string | RegExp) {
    if (typeof matcher === "string") {
        const index = code.indexOf(matcher);
        return index === -1 ? [] : [{ index, length: matcher.length, groups: [] as (string | undefined)[] }];
    }
    const toMatch = (m: RegExpExecArray | RegExpMatchArray) => ({ index: m.index!, length: m[0].length, groups: m.slice(1) });
    if (matcher.global) {
        const out = [];
        for (const m of code.matchAll(matcher)) {
            out.push(toMatch(m));
            if (out.length >= MAX_MATCHES) break;
        }
        return out;
    }
    const m = new RegExp(matcher.source, matcher.flags).exec(code);
    return m ? [toMatch(m)] : [];
}

/** The smallest region that differs between two strings */
function changedRegion(a: string, b: string) {
    let prefix = 0;
    const max = Math.min(a.length, b.length);
    while (prefix < max && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    return { start: prefix, endA: a.length - suffix, endB: b.length - suffix };
}

const literal = (value: string | RegExp) => typeof value === "string" ? JSON.stringify(value) : String(value);

export function formatPatchSnippet(find: string | RegExp, match: string | RegExp, replace: string) {
    return [
        "{",
        `    find: ${literal(find)},`,
        "    replace: {",
        `        match: ${literal(match)},`,
        `        with: ${JSON.stringify(replace)},`,
        "    },",
        "},",
    ].join("\n");
}

/**
 * @param sources   [id, original factory source] pairs to search
 * @param preferred module to evaluate against when `find` matches several
 * @param plugin    plugin id `$self` expands to
 */
export function evaluatePatch(
    draft: PatchDraft,
    sources: [string, string][],
    preferred?: string,
    plugin = "your-plugin",
): PatchHelperResult {
    const result: PatchHelperResult = { errors: {}, candidates: [], matchCount: 0, groups: [], changed: false };

    let find: string | RegExp | undefined;
    let match: string | RegExp | undefined;
    try {
        if (draft.find) find = parsePatchValue(draft.find);
    } catch (err) {
        result.errors.find = String(err);
    }
    try {
        if (draft.match) match = parsePatchValue(draft.match);
    } catch (err) {
        result.errors.match = String(err);
    }

    if (find !== undefined && match !== undefined) result.snippet = formatPatchSnippet(find, match, draft.replace);
    if (find === undefined) return result;

    result.candidates = sources.filter(([, src]) => matchesFind(src, find)).map(([id]) => id);
    const moduleId = preferred && result.candidates.includes(preferred) ? preferred : result.candidates[0];
    if (moduleId === undefined || match === undefined) return result;
    result.moduleId = moduleId;

    // Same steps as applySourcePatches: normalize, canonicalize, replace, compile
    const code = normalizeFactorySource(sources.find(([id]) => id === moduleId)![1]);
    const matcher = canonicalizeMatch(match);
    const matches = findMatches(code, matcher);
    result.matchCount = matches.length;
    if (!matches.length) return result;

    const [first] = matches;
    result.match = excerpt(code, first.index, first.index + first.length);
    result.groups = first.groups;

    const patched = code.replace(matcher as any, canonicalizeReplace(draft.replace, plugin) as any);
    result.changed = patched !== code;
    if (!result.changed) return result;

    const region = changedRegion(code, patched);
    result.before = excerpt(code, region.start, region.endA);
    result.after = excerpt(patched, region.start, region.endB);
    const compiled = tryCompile(patched, moduleId);
    result.compile = compiled.ok ? { ok: true } : { ok: false, error: compiled.error };
    return result;
}
