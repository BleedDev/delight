/**
 * Discord's context menus build their <Menu navId="..."> from closure variables (the message, the
 * user...) that the Menu itself never sees. To hand those to plugins, a source patch adds
 * `delightMenuArgs:arguments[0]` next to every `navId:` in an object literal: that is the props of
 * the component (or the argument of the helper) that renders the menu.
 *
 * Not every `navId:` can take it: destructuring patterns (`let{navId:t}=e`) must stay as they are,
 * `arguments` is a syntax error in class fields, and at module level it would be the module object.
 * This scans the module source once, tracking what each `{` opens, to decide per occurrence.
 */

export const MENU_ARGS_KEY = "delightMenuArgs";

type Frame =
    | "function" // body of a non-arrow function or method: has its own `arguments`
    | "factory"  // the module factory itself
    | "class"    // class body
    | "arrow"    // arrow function body
    | "other";   // object literal, block, parens, brackets

const BLOCK_KEYWORD = /(?:^|[^\w$.])(?:if|for|while|switch|catch|with)\s*$/;
const CLASS_HEAD = /\bclass\b[^{};]*$/;
const REGEX_PRECEDER = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|void|in|of|delete|throw|new|else|do|yield|await))\s*$/;

/** Index just past the `}` closing the object whose content starts at `from`, or -1 */
function closingBrace(code: string, from: number) {
    let depth = 0;
    for (let i = from; i < code.length; i++) {
        const c = code[i];
        if (c === "\"" || c === "'" || c === "`") {
            i = skipString(code, i);
            continue;
        }
        if (c === "{" || c === "(" || c === "[") depth++;
        else if (c === "}" || c === ")" || c === "]") {
            if (depth-- === 0) return c === "}" ? i + 1 : -1;
        }
    }
    return -1;
}

/** Index of the closing quote of the string starting at `start` (template expressions are skipped roughly) */
function skipString(code: string, start: number) {
    const quote = code[start];
    let depth = 0;
    for (let i = start + 1; i < code.length; i++) {
        const c = code[i];
        if (c === "\\") {
            i++;
        } else if (quote === "`" && c === "$" && code[i + 1] === "{") {
            depth++;
            i++;
        } else if (depth && c === "}") {
            depth--;
        } else if (!depth && c === quote) {
            return i;
        }
    }
    return code.length;
}

function skipRegex(code: string, start: number) {
    let inClass = false;
    for (let i = start + 1; i < code.length; i++) {
        const c = code[i];
        if (c === "\\") i++;
        else if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
            while (/[a-z]/.test(code[i + 1] ?? "")) i++;
            return i;
        } else if (c === "\n") return i;
    }
    return code.length;
}

function isDestructuring(code: string, braceContentStart: number) {
    const end = closingBrace(code, braceContentStart);
    if (end < 0) return true;
    const next = code.slice(end, end + 3);
    return /^=(?![=>])/.test(next) || next.startsWith(")=>") || next.startsWith("){");
}

/** Offsets of `navId:` occurrences where `delightMenuArgs:arguments[0],` can be inserted */
export function findMenuArgSites(code: string): Set<number> {
    const sites = new Set<number>();
    const stack: { kind: Frame; brace: boolean; start: number; }[] = [];
    const parenOpenAt = new Map<number, number>();
    let seenFactory = false;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];

        if (c === "\"" || c === "'" || c === "`") {
            i = skipString(code, i);
        } else if (c === "/" && code[i + 1] !== "/" && code[i + 1] !== "*" && REGEX_PRECEDER.test(code.slice(Math.max(0, i - 8), i))) {
            i = skipRegex(code, i);
        } else if (c === "(" || c === "[") {
            stack.push({ kind: "other", brace: false, start: i });
        } else if (c === ")" || c === "]") {
            const frame = stack.pop();
            if (frame && c === ")") parenOpenAt.set(i, frame.start);
        } else if (c === "{") {
            stack.push({ kind: classify(i), brace: true, start: i });
        } else if (c === "}") {
            stack.pop();
        } else if (c === "n" && code.startsWith("navId:", i) && (code[i - 1] === "{" || code[i - 1] === ",")) {
            const top = stack[stack.length - 1];
            if (!top?.brace || top.kind !== "other" || isDestructuring(code, top.start + 1)) continue;
            // `arguments` belongs to the innermost non-arrow function
            for (let f = stack.length - 1; f >= 0; f--) {
                const { kind } = stack[f];
                if (kind === "arrow" || kind === "other") continue;
                if (kind === "function") sites.add(i);
                break;
            }
        }
    }
    return sites;

    function classify(at: number): Frame {
        let j = at - 1;
        while (j >= 0 && /\s/.test(code[j])) j--;
        if (code[j] === ">" && code[j - 1] === "=") return "arrow";
        if (code[j] === ")") {
            const open = parenOpenAt.get(j);
            if (open === undefined) return "other";
            const head = code.slice(Math.max(0, open - 12), open);
            if (BLOCK_KEYWORD.test(head)) return "other";
            if (!seenFactory) {
                seenFactory = true;
                return "factory";
            }
            return "function";
        }
        return CLASS_HEAD.test(code.slice(Math.max(0, at - 200), at)) ? "class" : "other";
    }
}

let lastCode: string | undefined;
let lastSites: Set<number> | undefined;

/** Replacement callback for /(?<=[{,])navId:/g, analyses each module source once */
export function injectMenuArgs(match: string, offset: number, code: string) {
    if (code !== lastCode) {
        lastCode = code;
        lastSites = findMenuArgSites(code);
    }
    return lastSites!.has(offset) ? `${MENU_ARGS_KEY}:arguments[0],${match}` : match;
}
