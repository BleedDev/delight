// Lightweight tokenizer producing diffs-style token colours (light / dark pairs), no dependencies.
export interface Token {
    v: string;
    c?: string; // dark colour
    l?: string; // light colour
}

const C = {
    plain: undefined,
    keyword: ["#D5246A", "#FF7AA2"],
    fn: ["#0073E6", "#70B8FF"],
    string: ["#1E9E3C", "#9BE963"],
    number: ["#C45500", "#FFB86B"],
    comment: ["#8A8F98", "#8A8F98"],
    type: ["#7B42BC", "#C3A5FF"],
    punct: ["#737373", "#D3D7DE"],
    prop: ["#1A1A1A", "#EAECF0"],
    variable: ["#B8520A", "#FFCA5F"],
} as const;
type Kind = keyof typeof C;

const EXT: Record<string, string> = {
    ts: "ts",
    tsx: "ts",
    js: "ts",
    jsx: "ts",
    mjs: "ts",
    cjs: "ts",
    json: "json",
    jsonc: "json",
    py: "py",
    rb: "rb",
    go: "go",
    rs: "rs",
    java: "java",
    kt: "java",
    swift: "swift",
    c: "c",
    h: "c",
    cc: "c",
    cpp: "c",
    hpp: "c",
    cs: "java",
    css: "css",
    scss: "css",
    html: "html",
    xml: "html",
    svg: "html",
    md: "md",
    mdx: "md",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "yaml",
    sql: "sql",
    lua: "lua",
    php: "php",
    vue: "html",
};
export function langFromPath(p?: string) {
    const ext = p?.split(".").pop()?.toLowerCase();
    return ext ? EXT[ext] : undefined;
}

const KW: Record<string, string> = {
    ts: "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface is keyof let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield",
    py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield",
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map nil package range return select struct switch type var true false",
    rs: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
    java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for fun if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true false try val var void while",
    swift: "as break case catch class continue default defer do else enum extension false for func guard if import in init let nil private protocol public return self static struct switch throw true try var where while",
    c: "auto break case char const continue default do double else enum extern float for goto if include int long return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace public private template",
    bash: "if then else elif fi for while do done case esac in function return export local unset echo cd exit set source",
    sql: "select from where and or not insert into values update delete create table drop alter join left right inner outer on group by order limit as having distinct null is in like",
    lua: "and break do else elseif end false for function if in local nil not or repeat return then true until while",
    php: "abstract and array as break case catch class const continue default do echo else elseif extends false final for foreach function global if implements include interface namespace new null or private protected public require return static switch this throw true try use var while",
    rb: "alias and begin break case class def do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield",
    yaml: "true false null yes no on off",
    css: "",
    json: "true false null",
    html: "",
    md: "",
};
const kwSets: Record<string, Set<string>> = {};
const kw = (lang: string) => (kwSets[lang] ??= new Set((KW[lang] ?? KW.ts).split(" ").filter(Boolean)));

const RULES: [RegExp, Kind | ((m: string, lang: string) => Kind)][] = [
    [/^(\/\/[^\n]*|#(?![!{])[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)/, "comment"],
    [/^("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/, "string"],
    [/^\$\{?[A-Za-z_][\w]*\}?/, "variable"],
    [/^(0x[\da-fA-F]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)\b/, "number"],
    [/^[A-Za-z_][\w$-]*(?=\s*\()/, "fn"],
    [/^[A-Za-z_$][\w$]*/, (m, lang) => (kw(lang).has(lang === "sql" ? m.toLowerCase() : m) ? "keyword" : /^[A-Z]/.test(m) && lang !== "bash" ? "type" : "plain")],
    [/^[{}()[\];,.:<>=+\-*/%!&|^~?@]+/, "punct"],
    [/^\s+/, "plain"],
    [/^./, "plain"],
];

function tokenizeLine(line: string, lang: string, state: { inBlock: boolean }): Token[] {
    const out: Token[] = [];
    let s = line;
    const push = (v: string, k: Kind) => {
        const c = C[k] as readonly [string, string] | undefined;
        const last = out[out.length - 1];
        if (last && last.c === c?.[1]) last.v += v;
        else out.push(c ? { v, l: c[0], c: c[1] } : { v });
    };
    if (state.inBlock) {
        const end = s.indexOf("*/");
        if (end < 0) return [{ v: s, l: C.comment[0], c: C.comment[1] }];
        push(s.slice(0, end + 2), "comment");
        s = s.slice(end + 2);
        state.inBlock = false;
    }
    let first = true;
    while (s) {
        if (s.startsWith("/*") && !s.includes("*/") && commentsFor(lang).block) {
            push(s, "comment");
            state.inBlock = true;
            break;
        }
        let matched = false;
        for (const [re, kind] of RULES) {
            const m = re.exec(s);
            if (!m) continue;
            let k = typeof kind === "function" ? kind(m[0], lang) : kind;
            // shell: the first word of a command is a function-coloured command name, flags/args are strings
            if (lang === "bash" && k === "plain" && /\w/.test(m[0])) k = first ? "fn" : "string";
            if (k === "comment") {
                const cs = commentsFor(lang);
                const isBlock = m[0].startsWith("/*");
                const ok = isBlock ? cs.block : cs.line.some(p => m[0].startsWith(p));
                if (!ok) {
                    // not a comment in this language: consume just the first punctuation char and keep going
                    const one = m[0][0];
                    push(one, lang === "bash" && /[-#]/.test(one) ? "string" : "punct");
                    s = s.slice(1);
                    matched = true;
                    break;
                }
            }
            if ((lang === "json" || lang === "yaml") && k === "string" && /^\s*:/.test(s.slice(m[0].length))) k = "prop";
            push(m[0], k);
            if (/\S/.test(m[0])) first = lang === "bash" && /^(\||&&|;|\|\|)$/.test(m[0].trim());
            s = s.slice(m[0].length);
            matched = true;
            break;
        }
        if (!matched) break;
    }
    return out;
}

const ALIAS: Record<string, string> = {
    python: "py",
    python3: "py",
    py3: "py",
    javascript: "ts",
    js: "ts",
    jsx: "ts",
    typescript: "ts",
    tsx: "ts",
    mjs: "ts",
    cjs: "ts",
    node: "ts",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    console: "bash",
    shellscript: "bash",
    terminal: "bash",
    golang: "go",
    rust: "rs",
    kotlin: "java",
    kt: "java",
    csharp: "java",
    cs: "java",
    "c++": "c",
    cpp: "c",
    objc: "c",
    ruby: "rb",
    yml: "yaml",
    toml: "yaml",
    ini: "yaml",
    jsonc: "json",
    json5: "json",
    htm: "html",
    xml: "html",
    svg: "html",
    vue: "html",
    svelte: "html",
    markdown: "md",
    scss: "css",
    less: "css",
    postgres: "sql",
    mysql: "sql",
    sqlite: "sql",
    diff: "diff",
    patch: "diff",
};
// which comment syntaxes a language has
const COMMENTS: Record<string, { line: string[]; block: boolean }> = {
    py: { line: ["#"], block: false },
    bash: { line: ["#"], block: false },
    rb: { line: ["#"], block: false },
    yaml: { line: ["#"], block: false },
    sql: { line: ["--"], block: true },
    lua: { line: ["--"], block: false },
    css: { line: [], block: true },
    json: { line: [], block: false },
    html: { line: [], block: false },
    php: { line: ["//", "#"], block: true },
};
const commentsFor = (lang: string) => COMMENTS[lang] ?? { line: ["//"], block: true };

export function highlight(code: string, lang?: string): Token[][] {
    const lines = code.split("\n");
    lang = lang ? (ALIAS[lang.toLowerCase()] ?? lang.toLowerCase()) : lang;
    if (lang === "diff")
        return lines.map(l => {
            const c = l.startsWith("+") ? C.string : l.startsWith("-") ? C.keyword : l.startsWith("@@") ? C.type : null;
            return l ? [c ? { v: l, l: c[0], c: c[1] } : { v: l }] : [];
        });
    if (!lang || lang === "md" || code.length > 200_000) return lines.map(l => (l ? [{ v: l }] : []));
    const state = { inBlock: false };
    return lines.map(l => tokenizeLine(l, lang, state));
}
