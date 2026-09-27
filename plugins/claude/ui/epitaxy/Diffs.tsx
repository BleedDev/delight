// <diffs-container>: the code / diff renderer claude.ai Code uses (its own shadow root + the library's stylesheet),
// with the same DOM (pre[data-file|data-diff] > code[data-code] > [data-gutter] + [data-content]) and theme.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import diffsCss from "../../vendor/diffs.css" with { type: "text" };
import { highlight, langFromPath, type Token } from "./highlight";

const THEME = `@layer base, theme, rendered, unsafe;
@layer rendered { :host { color-scheme: dark; --diffs-scrollbar-gutter-measured: 0px;
  --diffs-dark:#eaecf0;--diffs-dark-bg:#1a1a19;--diffs-dark-addition-color:#32d74b;--diffs-dark-deletion-color:#ff3a30;--diffs-dark-modified-color:#0099ff;--diffs-light:#1a1a1a;--diffs-light-bg:#ffffff;--diffs-light-addition-color:#1e9e3c;--diffs-light-deletion-color:#ff3a30;--diffs-light-modified-color:#0073e6; } }`;
const UNSAFE = `@layer base, theme, rendered, unsafe;
@layer unsafe {
  :host, [data-file], [data-diff] { --diffs-bg: transparent; }:host { font-size: inherit; } [data-file], [data-diff] { --diffs-font-size: 1em; --diffs-line-height: var(--cds-leading-code); --diffs-font-family: var(--cds-font-mono); --diffs-gap-inline: 0; --diffs-gap-block: 0; letter-spacing: calc(round(up, 1ch, 1px / 64) - 1ch); font-feature-settings: "liga", "clig", "calt"; } [data-code] { overflow: clip; } [data-line] { min-height: 1lh; padding-inline: 0; line-height: var(--cds-leading-code); } [data-line]:hover { background: transparent; }
  [data-diff] [data-line] { padding-inline: 1ch; } [data-diff][data-indicators="classic"] [data-line] { padding-inline-start: 2ch; }
  [data-single-sided="added"] [data-line] { background: var(--cds-bg-git-added, color-mix(in srgb, #32d74b 20%, transparent)); }
  [data-single-sided="removed"] [data-line] { background: var(--cds-bg-git-removed, color-mix(in srgb, #ff2c56 20%, transparent)); }
  [data-single-sided="added"] [data-column-number] { color: var(--cds-text-git-added, #32d74b); }
  [data-single-sided="added"] [data-line-number-content]::before { content: "+ "; }
  [data-single-sided="removed"] [data-line-number-content]::before { content: "\\2212  "; }
  [data-separator] { color: var(--diffs-fg-number, #8a8782); padding-inline: 1ch; min-height: 1lh; opacity: .7; }
}`;

let sheets: CSSStyleSheet[] | null = null;
function diffSheets() {
    if (!sheets) {
        sheets = [diffsCss, THEME, UNSAFE].map(t => {
            const s = new CSSStyleSheet();
            s.replaceSync(t);
            return s;
        });
    }
    return sheets;
}

function DiffsContainer({ children }: { children: ReactNode }) {
    const host = useRef<HTMLElement>(null);
    const [root, setRoot] = useState<ShadowRoot | null>(null);
    useLayoutEffect(() => {
        const h = host.current as any;
        if (!h) return;
        const sr: ShadowRoot = h.shadowRoot ?? h.attachShadow({ mode: "open" });
        sr.adoptedStyleSheets = diffSheets();
        setRoot(sr);
    }, []);
    const Tag = "diffs-container" as any;
    return <Tag ref={host}>{root && createPortal(children, root as any)}</Tag>;
}

const TokenSpan = ({ t }: { t: Token }) => (t.c ? <span style={{ ["--diffs-token-light" as any]: t.l, ["--diffs-token-dark" as any]: t.c }}>{t.v}</span> : <>{t.v}</>);

// ---------------------------------------------------------------- file view (code card)
export function FileCode({
    code,
    lang,
    lineNumbers = true,
    startLine = 1,
    wrap = true,
    sided,
}: {
    code: string;
    lang?: string;
    lineNumbers?: boolean;
    startLine?: number;
    wrap?: boolean;
    sided?: "added" | "removed";
}) {
    const lines = highlight(code.replace(/\n$/, ""), lang);
    const w = String(startLine + lines.length - 1).length;
    return (
        <DiffsContainer>
            <pre
                data-file=""
                data-disable-line-numbers={lineNumbers ? undefined : ""}
                data-overflow={wrap ? "wrap" : "scroll"}
                data-single-sided={sided}
                style={{ ["--diffs-min-number-column-width-default" as any]: `${w}ch` }}
            >
                <code data-code="">
                    <div data-gutter="" style={{ gridRow: `span ${lines.length}` }}>
                        {lines.map((_, i) => (
                            <div key={i} data-line-type="context" data-column-number={startLine + i} data-line-index={i}>
                                <span data-line-number-content="">{startLine + i}</span>
                            </div>
                        ))}
                    </div>
                    <div data-content="" style={{ gridRow: `span ${lines.length}` }}>
                        {lines.map((toks, i) => (
                            <div key={i} data-line={startLine + i} data-line-type="context" data-line-index={i}>
                                {toks.map((t, k) => (
                                    <TokenSpan key={k} t={t} />
                                ))}
                                {!toks.length && "\n"}
                            </div>
                        ))}
                    </div>
                </code>
            </pre>
        </DiffsContainer>
    );
}

// ---------------------------------------------------------------- unified diff
type Row = { t: "context" | "change-addition" | "change-deletion" | "sep"; s: string; o?: number; n?: number; hidden?: number; gap?: number };

function lineDiff(a: string[], b: string[]): Row[] {
    const n = a.length;
    const m = b.length;
    if (n * m > 4_000_000) return [...a.map((s, i) => ({ t: "change-deletion" as const, s, o: i + 1 })), ...b.map((s, i) => ({ t: "change-addition" as const, s, n: i + 1 }))];
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const rows: Row[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) rows.push({ t: "context", s: a[i], o: ++i, n: ++j });
        else if (dp[i + 1][j] >= dp[i][j + 1]) rows.push({ t: "change-deletion", s: a[i], o: ++i });
        else rows.push({ t: "change-addition", s: b[j], n: ++j });
    }
    while (i < n) rows.push({ t: "change-deletion", s: a[i], o: ++i });
    while (j < m) rows.push({ t: "change-addition", s: b[j], n: ++j });
    return rows;
}

// Keep 3 context lines around changes, collapse the rest into "simple" separators.
function hunks(rows: Row[], ctx = 3, open: Set<number> = new Set()): Row[] {
    const keep = rows.map(() => false);
    rows.forEach((r, i) => {
        if (r.t !== "context") for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) keep[k] = true;
    });
    // a gap is identified by the index of its first hidden row; opened gaps show their lines
    const base = [...keep];
    rows.forEach((_, i) => {
        if (base[i]) return;
        let g = i;
        while (g > 0 && !base[g - 1]) g--;
        if (open.has(g)) keep[i] = true;
    });
    const out: Row[] = [];
    let skipped = 0;
    let gap = -1;
    rows.forEach((r, i) => {
        if (keep[i]) {
            if (skipped) out.push({ t: "sep", s: "", hidden: skipped, gap });
            skipped = 0;
            out.push(r);
        } else {
            if (!skipped) gap = i;
            skipped++;
        }
    });
    if (skipped && out.length) out.push({ t: "sep", s: "", hidden: skipped, gap });
    return out;
}

// word-level emphasis: a deleted line followed by its replacement gets the changed middle marked ([data-diff-span])
function pairEmphasis(rows: Row[]): Map<number, [number, number]> {
    const out = new Map<number, [number, number]>();
    for (let i = 0; i < rows.length;) {
        if (rows[i].t !== "change-deletion") {
            i++;
            continue;
        }
        let d = i;
        while (d < rows.length && rows[d].t === "change-deletion") d++;
        let a = d;
        while (a < rows.length && rows[a].t === "change-addition") a++;
        const pairs = Math.min(d - i, a - d);
        for (let k = 0; k < pairs; k++) {
            const x = rows[i + k].s;
            const y = rows[d + k].s;
            let p = 0;
            while (p < x.length && p < y.length && x[p] === y[p]) p++;
            let q = 0;
            while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
            // only when the lines are mostly alike; a rewritten line stays plain
            if (p + q >= Math.min(x.length, y.length) * 0.3 && (x.length - q > p || y.length - q > p)) {
                if (x.length - q > p) out.set(i + k, [p, x.length - q]);
                if (y.length - q > p) out.set(d + k, [p, y.length - q]);
            }
        }
        i = a;
    }
    return out;
}
// split highlighted tokens so the [from, to) character range is wrapped in a diff span
function emphasize(toks: Token[], range?: [number, number]) {
    if (!range) return toks.map((t, k) => <TokenSpan key={k} t={t} />);
    const [from, to] = range;
    const out: ReactNode[] = [];
    let pos = 0;
    let span: ReactNode[] = [];
    const flush = () =>
        span.length &&
        (out.push(
            <span key={"s" + out.length} data-diff-span="">
                {span}
            </span>,
        ),
        (span = []));
    toks.forEach((t, k) => {
        const v = t.v;
        const cuts = [0, Math.max(0, Math.min(v.length, from - pos)), Math.max(0, Math.min(v.length, to - pos)), v.length];
        for (let c = 0; c < 3; c++) {
            const part = v.slice(cuts[c], cuts[c + 1]);
            if (!part) continue;
            const node = <TokenSpan key={`${k}:${c}`} t={{ ...t, v: part }} />;
            if (c === 1) span.push(node);
            else (flush(), out.push(node));
        }
        pos += v.length;
    });
    flush();
    return out;
}

export function diffStats(oldText: string, newText: string) {
    const rows = lineDiff((oldText ?? "").split("\n"), (newText ?? "").split("\n"));
    return { adds: rows.filter(r => r.t === "change-addition").length, dels: rows.filter(r => r.t === "change-deletion").length };
}

export function FileDiff({ oldText, newText, lang, startLine = 1 }: { oldText: string; newText: string; lang?: string; startLine?: number }) {
    const [opened, setOpened] = useState<Set<number>>(new Set());
    const [force, setForce] = useState(false);
    const la = (oldText ?? "").split("\n").length;
    const lb = (newText ?? "").split("\n").length;
    // the line diff is quadratic: very large changes get a summary until asked for
    if (la * lb > 4_000_000 && !force)
        return (
            <div className="flex items-center gap-sm p-md text-footnote text-muted">
                <span className="flex-1">
                    Too large to preview: −{la} / +{lb} lines
                </span>
                <button type="button" className="cds-reset cds-text-link text-footnote text-secondary hover:text-primary cursor-pointer" onClick={() => setForce(true)}>
                    Show anyway
                </button>
            </div>
        );
    const rows = hunks(lineDiff((oldText ?? "").split("\n"), (newText ?? "").split("\n")), 3, opened);
    const hlOld = highlight(oldText ?? "", lang);
    const hlNew = highlight(newText ?? "", lang);
    const toks = (r: Row) => (r.t === "change-addition" || (r.t === "context" && r.n) ? hlNew[(r.n ?? 1) - 1] : hlOld[(r.o ?? 1) - 1]) ?? [{ v: r.s }];
    const num = (r: Row) => (r.t === "change-deletion" ? r.o : r.n)! + startLine - 1;
    const emph = pairEmphasis(rows);
    return (
        <DiffsContainer>
            <pre
                data-diff=""
                data-diff-type="single"
                data-indicators="classic"
                data-overflow="wrap"
                data-background=""
                style={{ ["--diffs-gap-inline" as any]: "var(--cds-pad-md)", ["--diffs-gap-block" as any]: "var(--cds-pad-xs)" }}
            >
                <code data-code="" data-unified="">
                    <div data-gutter="" style={{ gridRow: `span ${rows.length}` }}>
                        {rows.map((r, i) =>
                            r.t === "sep" ? (
                                <div key={i} data-separator="simple" data-line-index={i} />
                            ) : (
                                <div key={i} data-line-type={r.t} data-column-number={num(r)} data-line-index={i}>
                                    <span data-line-number-content="">{num(r)}</span>
                                </div>
                            ),
                        )}
                    </div>
                    <div data-content="" style={{ gridRow: `span ${rows.length}` }}>
                        {rows.map((r, i) =>
                            r.t === "sep" ? (
                                <div
                                    key={i}
                                    data-separator="simple"
                                    data-line-index={i}
                                    role="button"
                                    tabIndex={0}
                                    title="Show the unchanged lines"
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setOpened(o => new Set(o).add(r.gap!))}
                                    onKeyDown={e => e.key === "Enter" && setOpened(o => new Set(o).add(r.gap!))}
                                >
                                    ⋯ {r.hidden} unchanged line{r.hidden === 1 ? "" : "s"}
                                </div>
                            ) : (
                                <div key={i} data-line={num(r)} data-line-type={r.t} data-line-index={i}>
                                    {emphasize(toks(r), emph.get(i))}
                                    {!r.s && "\n"}
                                </div>
                            ),
                        )}
                    </div>
                </code>
            </pre>
        </DiffsContainer>
    );
}

export { langFromPath };
