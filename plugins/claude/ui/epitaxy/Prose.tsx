// Markdown rendering for the transcript: prose, code fences, tables, inline code and clickable file references.
import { N } from "../native";
import { Fragment, memo, type ReactNode } from "react";
import { Lexer, type Token, type Tokens } from "marked";
import { Button } from "../cds/Button";
import { useCopy, CODE_THEME } from "./primitives";
import { highlight } from "./highlight";
import { lazyMemo } from "../lazyReact";

// path-ish inline code becomes a clickable file ref (opens in the default editor)
const FILE_RE = /^(?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.[A-Za-z0-9]{1,8}(?::\d+(?:-\d+)?)?$/;
function isFileRef(s: string) {
    return FILE_RE.test(s) && !/^\d+(\.\d+)+$/.test(s) && !s.includes("://");
}

export interface ProseCtx {
    cwd?: string;
}

function openFile(ref: string, cwd?: string) {
    const path = ref.replace(/:\d+(?:-\d+)?$/, "");
    const abs = path.startsWith("/") ? path : cwd ? `${cwd}/${path.replace(/^\.\//, "")}` : path;
    N()?.agents.openPath?.(abs);
}

function InlineCode({ text, ctx }: { text: string; ctx: ProseCtx }) {
    if (isFileRef(text))
        return (
            <span
                role="button"
                tabIndex={0}
                className="inline-block prose-link focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-[3px]"
                onClick={() => openFile(text, ctx.cwd)}
                onKeyDown={e => e.key === "Enter" && openFile(text, ctx.cwd)}
                title={text}
            >
                <span data-epitaxy-inline-code="" data-epitaxy-file-ref="">
                    {text}
                </span>
            </span>
        );
    return <code data-epitaxy-inline-code="">{text}</code>;
}

const GUTTER = "calc(var(--cds-h-control)*1 + 3px*0 + var(--cds-pad-xs)*3 + 2px)";

export function CodeFence({ code, lang, streaming }: { code: string; lang?: string; streaming?: boolean }) {
    const [copied, copy] = useCopy();
    const lines = highlight(code, lang);
    const single = !code.includes("\n");
    return (
        <div className="epitaxy-codeblock relative max-w-full w-fit min-w-[min(100%,318px)]">
            <div className="relative">
                <div data-code-text={code} className="epitaxy-diff epitaxy-fence rounded-lg overflow-clip">
                    {/* long lines scroll sideways (keyboard-focusable) instead of wrapping, like claude.ai */}
                    <div className="epitaxy-code-scroll" tabIndex={0}>
                        <pre
                            className="whitespace-pre epitaxy-code-card"
                            style={{
                                ...CODE_THEME,
                                padding: `var(--cds-pad-md) calc(${GUTTER} + 1ch) var(--cds-pad-md) calc(10px + 1ch)`,
                                font: 'var(--diffs-font-size, 13px)/var(--diffs-line-height, 20px) var(--diffs-font-family, "SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace)',
                                tabSize: "var(--diffs-tab-size, 2)" as any,
                                letterSpacing: "calc(round(up, 1ch, 1px / 64) - 1ch)",
                                fontFeatureSettings: "'liga','clig','calt'",
                            }}
                        >
                            <span style={{ display: "block", contain: "content" }}>
                                {lines.map((toks, i) => (
                                    <Fragment key={i}>
                                        {toks.map((t, k) =>
                                            t.c ? (
                                                <span key={k} style={{ color: `light-dark(${t.l}, ${t.c})` }}>
                                                    {t.v}
                                                </span>
                                            ) : (
                                                <Fragment key={k}>{t.v}</Fragment>
                                            ),
                                        )}
                                        {i < lines.length - 1 && "\n"}
                                    </Fragment>
                                ))}
                            </span>
                        </pre>
                    </div>
                </div>
                {!streaming && (
                    <div className="pointer-events-none absolute inset-y-0 right-1.75">
                        <div
                            className={`pointer-events-auto sticky flex gap-0.75 top-[calc(max(var(--epitaxy-top-fade-height,0px),var(--fade-top,0px))+5px)] ${single ? "mt-[calc(var(--cds-pad-md)+var(--cds-leading-code)/2-var(--cds-h-control)/2)]" : "mt-1.25"}`}
                        >
                            <Button variant="ghost" iconOnly icon={copied ? "Check" : "Copy"} aria-label={copied ? "Copied" : "Copy code"} onClick={() => copy(code)} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function inline(tokens: Token[] | undefined, ctx: ProseCtx): ReactNode {
    return (tokens ?? []).map((t, i) => <Fragment key={i}>{inlineToken(t, ctx)}</Fragment>);
}
function inlineToken(t: Token, ctx: ProseCtx): ReactNode {
    switch (t.type) {
        case "text":
            return (t as Tokens.Text).tokens ? inline((t as Tokens.Text).tokens, ctx) : decode((t as Tokens.Text).text);
        case "escape":
            return decode((t as Tokens.Escape).text);
        case "strong":
            return <strong>{inline((t as Tokens.Strong).tokens, ctx)}</strong>;
        case "em":
            return <em>{inline((t as Tokens.Em).tokens, ctx)}</em>;
        case "del":
            return <del>{inline((t as Tokens.Del).tokens, ctx)}</del>;
        case "codespan":
            return <InlineCode text={decode((t as Tokens.Codespan).text)} ctx={ctx} />;
        case "br":
            return <br />;
        case "link": {
            const l = t as Tokens.Link;
            return (
                <a href={l.href} target="_blank" rel="noreferrer" title={l.title ?? undefined}>
                    {inline(l.tokens, ctx)}
                </a>
            );
        }
        case "image": {
            const im = t as Tokens.Image;
            return <img src={im.href} alt={im.text} className="block max-w-full h-auto rounded-[5px] border" />;
        }
        case "html":
            return decode((t as Tokens.HTML).text);
        default:
            return "raw" in t ? decode((t as any).raw) : null;
    }
}
const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, m => ENT[m]);

function block(t: Token, i: number, ctx: ProseCtx, streaming?: boolean): ReactNode {
    switch (t.type) {
        case "paragraph":
            return (
                <p key={i} dir="ltr">
                    {inline((t as Tokens.Paragraph).tokens, ctx)}
                </p>
            );
        case "heading": {
            const h = t as Tokens.Heading;
            const H = `h${h.depth}` as "h1";
            return (
                <H key={i} dir="ltr">
                    {inline(h.tokens, ctx)}
                </H>
            );
        }
        case "code": {
            const c = t as Tokens.Code;
            return <CodeFence key={i} code={c.text} lang={(c.lang || "").split(/\s/)[0] || undefined} streaming={streaming} />;
        }
        case "blockquote":
            return <blockquote key={i}>{(t as Tokens.Blockquote).tokens.map((x, k) => block(x, k, ctx, streaming))}</blockquote>;
        case "hr":
            return <hr key={i} />;
        case "list": {
            const l = t as Tokens.List;
            const L = l.ordered ? "ol" : "ul";
            return (
                <L key={i} dir="ltr" start={l.ordered && l.start !== 1 && l.start !== "" ? Number(l.start) : undefined}>
                    {l.items.map((it, k) =>
                        it.task ? (
                            <li
                                key={k}
                                className="flex items-start gap-1 decoration-1 [&:has(>[data-done])]:line-through [&:has(>[data-done])]:text-muted"
                                style={{ listStyle: "none", marginInlineStart: "-1.25em" }}
                            >
                                {it.checked ? (
                                    <span
                                        data-done=""
                                        aria-hidden="true"
                                        className="block size-[calc(0.75rem*var(--cds-rem-scale,1))] rounded-full border border-alpha-3"
                                        style={{ background: "var(--cds-text-muted)", marginTop: "0.35em", flexShrink: 0 }}
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="block size-[calc(0.75rem*var(--cds-rem-scale,1))] rounded-full border border-alpha-3"
                                        style={{ marginTop: "0.35em", flexShrink: 0 }}
                                    />
                                )}
                                <span className="sr-only">{it.checked ? "done" : "not done"}</span>
                                <span>{listItemBody(it, ctx, streaming)}</span>
                            </li>
                        ) : (
                            <li key={k}>{listItemBody(it, ctx, streaming)}</li>
                        ),
                    )}
                </L>
            );
        }
        case "table": {
            const tb = t as Tokens.Table;
            return (
                <div key={i} className="epitaxy-table-scroll prose-scroll rounded border [&>table]:rounded-none [&>table]:border-0">
                    <table className="[&_td]:min-w-24 [&_th]:min-w-24" style={streaming ? { tableLayout: "fixed" } : undefined}>
                        <thead>
                            <tr>
                                {tb.header.map((h, k) => (
                                    <th key={k} style={tb.align[k] ? { textAlign: tb.align[k]! } : undefined}>
                                        {inline(h.tokens, ctx)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tb.rows.map((r, k) => (
                                <tr key={k}>
                                    {r.map((c, j) => (
                                        <td key={j} style={tb.align[j] ? { textAlign: tb.align[j]! } : undefined}>
                                            {inline(c.tokens, ctx)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        case "html":
            return (
                <p key={i} dir="ltr">
                    {decode((t as Tokens.HTML).text)}
                </p>
            );
        case "space":
            return null;
        case "text": {
            const tx = t as Tokens.Text;
            return (
                <p key={i} dir="ltr">
                    {tx.tokens ? inline(tx.tokens, ctx) : decode(tx.text)}
                </p>
            );
        }
        default:
            return null;
    }
}
function listItemBody(it: Tokens.ListItem, ctx: ProseCtx, streaming?: boolean) {
    // tight list items hold bare text tokens; loose ones hold paragraphs
    return it.tokens.map((x, k) =>
        x.type === "text" ? (
            <Fragment key={k}>{(x as Tokens.Text).tokens ? inline((x as Tokens.Text).tokens, ctx) : decode((x as Tokens.Text).text)}</Fragment>
        ) : (
            block(x, k, ctx, streaming)
        ),
    );
}

export const Prose = lazyMemo(function Prose({ text, cwd, streaming }: { text: string; cwd?: string; streaming?: boolean }) {
    let tokens: Token[] = [];
    try {
        tokens = new Lexer({ gfm: true, breaks: false }).lex(text);
    } catch {
        tokens = [{ type: "paragraph", raw: text, text, tokens: [{ type: "text", raw: text, text }] } as any];
    }
    const ctx = { cwd };
    return (
        <div data-cds="Prose" data-prose-font="sans" className="prose">
            <div data-alluvium="true" className="contents">
                {tokens.map((t, i) => block(t, i, ctx, streaming))}
            </div>
        </div>
    );
});
