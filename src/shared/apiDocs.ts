/**
 * @evi/api's reference, as scripts/api-docs.ts extracts it from the source (src/shared/apiDocs.json),
 * and the pure part of showing it: finding the API names in a piece of code, and searching the list.
 */
import docs from "./apiDocs.json";

export interface ApiDoc {
    /** As plugins write it: `findByProps`, `ctx.hookExport`, `ctx.settings.get`, `$self` */
    name: string;
    kind: string;
    signature: string;
    /** The JSDoc summary, "" when there's none */
    doc: string;
    example?: string;
}

export const API_DOCS: readonly ApiDoc[] = docs as ApiDoc[];

const byName = new Map(API_DOCS.map(d => [d.name, d]));

export const apiDoc = (name: string): ApiDoc | undefined => byName.get(name);

export interface CodeSegment {
    text: string;
    /** Set when the text is a known API name */
    doc?: ApiDoc;
}

/**
 * `$self` (or what it becomes in patched code, `Evi.$("plugin-id")`), a `ctx.` chain, or an identifier
 * that isn't a property access (`.find(` in Discord's code is an array's find, not ours). Identifiers
 * are only matched whole.
 */
const TOKEN = /Evi\.\$\("[^"\\]*"\)|\$self(?![\w$])|(?<![\w$.])ctx(?:\s*\.\s*[A-Za-z_$][\w$]*)+|(?<![\w$.])[A-Za-z_$][\w$]*/g;

/** Plain names too short or too common to be worth marking in minified code */
const MIN_NAME_LENGTH = 4;

/**
 * Splits `code` into plain text and known API names, in order: joined back, the segments are `code`.
 * For a `ctx.a.b.c` chain the longest documented prefix is marked (`ctx.settings.get` in
 * `ctx.settings.get("x").length`).
 */
export function highlightApi(code: string, lookup: (name: string) => ApiDoc | undefined = apiDoc): CodeSegment[] {
    const out: CodeSegment[] = [];
    let plain = "";
    let last = 0;
    const flush = () => {
        if (plain) out.push({ text: plain });
        plain = "";
    };

    for (const m of code.matchAll(TOKEN)) {
        const token = m[0];
        const at = m.index;
        let doc: ApiDoc | undefined;
        let length = token.length;

        if (token.startsWith("ctx")) {
            // Longest documented prefix of the chain, measured in the original text (it may have spaces)
            const parts = token.split(".").map(p => p.trim());
            for (let n = parts.length; n >= 2 && !doc; n--) {
                doc = lookup(parts.slice(0, n).join("."));
                if (doc) length = nthDotEnd(token, n);
            }
        } else if (token.startsWith("Evi.$(")) {
            doc = lookup("$self");
        } else if (token === "$self" || token.length >= MIN_NAME_LENGTH) {
            doc = lookup(token);
        }

        if (!doc) continue;
        plain += code.slice(last, at);
        flush();
        out.push({ text: code.slice(at, at + length), doc });
        last = at + length;
    }
    plain += code.slice(last);
    flush();
    return out;
}

/** Where the n-th dot-separated part of `chain` ends */
function nthDotEnd(chain: string, n: number) {
    let dots = 0;
    for (let i = 0; i < chain.length; i++) {
        if (chain[i] === "." && ++dots === n) return chain.slice(0, i).trimEnd().length;
    }
    return chain.length;
}

/**
 * Entries whose name has every word of `query`, or failing that whose signature or doc does: names
 * first, so "hook" lists `hook` and `ctx.hook.before` before everything that mentions hooks.
 */
export function searchApiDocs(query: string, docs: readonly ApiDoc[] = API_DOCS): ApiDoc[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [...docs];
    const byName: ApiDoc[] = [];
    const byText: ApiDoc[] = [];
    for (const d of docs) {
        const name = d.name.toLowerCase();
        if (words.every(w => name.includes(w))) byName.push(d);
        else if (words.every(w => name.includes(w) || d.signature.toLowerCase().includes(w) || d.doc.toLowerCase().includes(w))) byText.push(d);
    }
    // An exact name first, then shorter names (closer matches) first
    byName.sort((a, b) => Number(b.name.toLowerCase() === words.join(" ")) - Number(a.name.toLowerCase() === words.join(" ")) || a.name.length - b.name.length);
    return [...byName, ...byText];
}
