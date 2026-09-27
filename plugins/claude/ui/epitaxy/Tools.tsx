// Transcript tool calls: single rows, coalesced runs and multi-tool groups, with per-tool bodies.
import { N } from "../native";
import { Fragment, useState, type ReactNode } from "react";
import type { Item, TaskInfo } from "../store";
import { Icon } from "../cds/Icon";
import { ShimmerText } from "../cds/ShimmerText";
import { toolLabel, groupSummary } from "./labels";
import { FileCode, FileDiff, diffStats, langFromPath } from "./Diffs";
import { Prose } from "./Prose";
import { useLightbox } from "./Lightbox";
import {
    ROW_GAP075,
    ROW_GAP05,
    C_ACTIVE,
    C_IDLE,
    C_SETTLED,
    GROUP_CARD,
    TASK_CARD,
    BTN_FOCUS,
    CODE_THEME,
    Caret,
    Chevron,
    ExpandingBody,
    CopyButton,
    DiffCounts,
    Spinner,
    Elapsed,
} from "./primitives";

export type ToolItem = Extract<Item, { kind: "tool" }>;

export interface ToolCtx {
    cwd?: string;
    busy: boolean;
    summaries: Record<string, string>;
    verbose?: boolean; // view options → Verbose: tool rows start expanded
    tasks: Record<string, TaskInfo>;
    children: Record<string, Item[]>; // parent tool id -> subagent items
    awaiting: Set<string>; // tool ids waiting for approval
    stopped: boolean;
}

// ---------------------------------------------------------------- result helpers
export function resultText(content: any): string {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(c => (c.type === "text" ? c.text : "")).join("\n");
    return JSON.stringify(content, null, 2);
}
const resultImages = (content: any): { mime: string; data: string }[] =>
    Array.isArray(content) ? content.filter(c => c.type === "image" && c.source?.data).map(c => ({ mime: c.source.media_type, data: c.source.data })) : [];
const INTERRUPT_RE = /^\s*(\[Request interrupted by user[^\]]*\]|Tool execution was interrupted\.?|Tool execution stopped by user\.?)\s*$/;
const stripReminders = (s: string) => s.replace(/\n?<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, "").replace(/\s+$/, "");
function readOutput(s: string) {
    const t = stripReminders(s);
    const lines = t.split("\n");
    const numbered = /^ *\d+(?:[:|] ?|→|\t)/;
    return lines.every(l => !l || numbered.test(l)) ? lines.map(l => l.replace(numbered, "")).join("\n") : t;
}
// minimal ANSI stripping (colour codes)
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
// SGR colours in command output → styled spans (basic 16 colours, bold, dim); other escapes are dropped
const ANSI_FG = ["#6e6e6e", "#e5534b", "#57ab5a", "#c69026", "#539bf5", "#b083f0", "#39c5cf", "#d0d0d0"];
const ANSI_BRIGHT = ["#8b8b8b", "#ff7b72", "#7ee787", "#e3b341", "#79c0ff", "#d2a8ff", "#56d4dd", "#ffffff"];
function ansiSpans(src: string): ReactNode {
    if (!src.includes("\x1b[")) return src;
    const out: ReactNode[] = [];
    let style: Record<string, any> = {};
    let last = 0;
    const re = /\x1b\[([0-9;?]*)([ -/]*[@-~])/g;
    let m: RegExpExecArray | null;
    const push = (text: string) =>
        text &&
        out.push(
            Object.keys(style).length ? (
                <span key={out.length} style={{ ...style }}>
                    {text}
                </span>
            ) : (
                text
            ),
        );
    while ((m = re.exec(src))) {
        push(src.slice(last, m.index));
        last = re.lastIndex;
        if (m[2] !== "m") continue;
        for (const c of (m[1] || "0").split(";").map(Number)) {
            if (c === 0) style = {};
            else if (c === 1) style.fontWeight = 600;
            else if (c === 2) style.opacity = 0.7;
            else if (c === 3) style.fontStyle = "italic";
            else if (c === 4) style.textDecoration = "underline";
            else if (c === 22) (delete style.fontWeight, delete style.opacity);
            else if (c === 39) delete style.color;
            else if (c >= 30 && c <= 37) style.color = ANSI_FG[c - 30];
            else if (c >= 90 && c <= 97) style.color = ANSI_BRIGHT[c - 90];
        }
    }
    push(src.slice(last));
    return out;
}

type Status = "running" | "awaiting" | "done" | "error" | "stopped" | "denied";
function statusOf(t: ToolItem, ctx: ToolCtx): Status {
    if (ctx.awaiting.has(t.id)) return "awaiting";
    // subagents: the task's own final status (a killed or failed agent mustn't look successful)
    const task = ctx.tasks?.[t.id];
    if ((task?.status as string) === "failed") return "error";
    if ((task?.status as string) === "stopped") return "stopped";
    if (!t.result) return ctx.busy ? "running" : ctx.stopped ? "stopped" : "stopped";
    const out = resultText(t.result.content);
    if (t.result.isError) {
        if (INTERRUPT_RE.test(out)) return "stopped";
        if (/user (doesn't|does not) want to proceed|was rejected|denied|The user declined/i.test(out)) return "denied";
        return "error";
    }
    return "done";
}
const pathKey = (t: ToolItem) => `${t.name === "MultiEdit" ? "Edit" : t.name} ${t.input?.file_path ?? t.input?.notebook_path ?? t.input?.path ?? ""}`;

function adds(t: ToolItem) {
    const i = t.input ?? {};
    if (t.name === "Edit") return diffStats(i.old_string ?? "", i.new_string ?? "");
    if (t.name === "MultiEdit")
        return (i.edits ?? []).reduce(
            (a: any, e: any) => {
                const s = diffStats(e.old_string ?? "", e.new_string ?? "");
                return { adds: a.adds + s.adds, dels: a.dels + s.dels };
            },
            { adds: 0, dels: 0 },
        );
    if (t.name === "Write") return { adds: (i.content ?? "").split("\n").length, dels: 0 };
    if (t.name === "ApplyPatch") return patchCounts(i.changes ?? []);
    return null;
}

export function patchCounts(changes: any[]) {
    let adds = 0;
    let dels = 0;
    for (const c of changes)
        for (const l of String(c.diff ?? "").split("\n")) {
            if (l.startsWith("+") && !l.startsWith("+++")) adds++;
            else if (l.startsWith("-") && !l.startsWith("---")) dels++;
        }
    return { adds, dels };
}

// ---------------------------------------------------------------- tools item: one run -> ToolRow, many runs -> group
export function ToolsItem({ tools, ctx }: { tools: ToolItem[]; ctx: ToolCtx }) {
    const runs: ToolItem[][] = [];
    for (const t of tools) {
        const last = runs[runs.length - 1];
        if (last && pathKey(last[0]) === pathKey(t) && t.name !== "Task" && t.name !== "Agent") last.push(t);
        else runs.push([t]);
    }
    return (
        <div data-tool-anchor={tools[0].id} className="contents">
            <div className="flex flex-col gap-[var(--chat-item-gap)]">
                <div className="contents" data-find-omitted="">
                    {runs.length === 1 ? <ToolRow run={runs[0]} ctx={ctx} /> : <GroupRow runs={runs} ctx={ctx} />}
                </div>
            </div>
            {runs.flat().map(t => (
                <ToolImages key={t.id} tool={t} />
            ))}
        </div>
    );
}

function GroupRow({ runs, ctx }: { runs: ToolItem[][]; ctx: ToolCtx }) {
    const all = runs.flat();
    const statuses = all.map(t => statusOf(t, ctx));
    const running = statuses.includes("running");
    const awaiting = statuses.includes("awaiting");
    const [open, setOpen] = useState(() => !!ctx.verbose);
    const current = all[statuses.lastIndexOf("running")];
    const curLabel = current ? toolLabel(current.name, current.input, current.result) : null;
    const parts = groupSummary(all.map((t, i) => ({ name: t.name, result: t.result, failed: statuses[i] === "error", stopped: statuses[i] === "stopped" })));
    const diff = all.map(adds).filter(Boolean) as { adds: number; dels: number }[];
    const COLOR = running || awaiting ? C_ACTIVE : open ? "text-secondary" : C_IDLE;
    // once settled, the model's own one-line summary of the group (tool_use_summary) replaces the verb list
    const modelSummary = !running && !awaiting && !parts.some(p => p.isError) ? ctx.summaries?.[all[all.length - 1].id] : undefined;
    return (
        <div className="flex flex-col w-full">
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={ROW_GAP05}>
                {running && <span className="sr-only">running</span>}
                <span className="group/morph inline-grid items-center justify-items-start data-[gliding]:overflow-x-clip min-w-0">
                    <span className={`col-start-1 row-start-1 min-w-0 max-w-full group-data-[gliding]/morph:max-w-none inline-flex items-center gap-1 ${COLOR}`}>
                        {running && curLabel ? (
                            curLabel.runningLabel ? (
                                <ShimmerText active className="text-body truncate min-w-0">
                                    {curLabel.runningLabel}
                                </ShimmerText>
                            ) : (
                                <>
                                    <ShimmerText active className="text-body shrink-0">
                                        {curLabel.runningVerb}
                                    </ShimmerText>
                                    {curLabel.meta && <span className="text-body truncate min-w-0">{curLabel.meta}</span>}
                                </>
                            )
                        ) : (
                            <>
                                <span className="text-body truncate min-w-0" title={modelSummary ? parts.map(p => p.verb + (p.meta ? " " + p.meta : "")).join(", ") : undefined}>
                                    {modelSummary ??
                                        parts.map((p, i) => (
                                            <Fragment key={i}>
                                                {i > 0 && <span>, </span>}
                                                <span className={p.isError ? "text-body text-danger" : "text-body"}>
                                                    {i === 0 ? p.verb.charAt(0).toUpperCase() + p.verb.slice(1) : p.verb}
                                                </span>
                                                {p.meta && <span> {p.meta}</span>}
                                            </Fragment>
                                        ))}
                                </span>
                                {diff.length > 0 && <DiffCounts adds={diff.reduce((a, d) => a + d.adds, 0)} dels={diff.reduce((a, d) => a + d.dels, 0)} />}
                                {awaiting && <span className="text-body text-warning shrink-0">Needs approval</span>}
                            </>
                        )}
                    </span>
                </span>
                <Caret expanded={open} colorClassName={COLOR} />
            </button>
            <ExpandingBody expanded={open}>
                <div className={GROUP_CARD}>
                    {runs.map(run => (
                        <ToolRow key={run[0].id} run={run} ctx={ctx} inCard />
                    ))}
                </div>
            </ExpandingBody>
        </div>
    );
}

export function ToolRow({ run, ctx, inCard }: { run: ToolItem[]; ctx: ToolCtx; inCard?: boolean }) {
    const tool = run[run.length - 1];
    const statuses = run.map(t => statusOf(t, ctx));
    const status: Status = statuses.includes("awaiting") ? "awaiting" : statuses.includes("running") ? "running" : statuses[statuses.length - 1];
    const running = status === "running";
    const awaiting = status === "awaiting";
    const failed = status === "error";
    const settled = !(running || awaiting || failed);
    const allFailed = statuses.every(s => s === "error");
    const summary = toolLabel(tool.name, tool.input, tool.result);
    const [open, setOpen] = useState(() => !!ctx.verbose && tool.name !== "Read");
    const agent = tool.name === "Task" || tool.name === "Agent";
    const empty = (running || awaiting) && (!tool.input || !Object.keys(tool.input).length);
    const hasBody = !empty && !(tool.name === "TodoWrite" && !(tool.input?.todos ?? []).length);

    // AskUserQuestion answered -> receipt card in place of the row
    if (tool.name === "AskUserQuestion" && tool.result && !tool.result.isError) return <QuestionReceipt tool={tool} />;

    const fullLabel = running ? summary.runningLabel : failed ? (allFailed ? summary.failedLabel : undefined) : summary.doneLabel;
    const text = fullLabel ?? (running || awaiting ? summary.runningVerb : failed && allFailed ? summary.failedVerb : summary.verb);
    const LABEL_COLOR = settled ? C_SETTLED : C_ACTIVE;
    const CARET_COLOR = settled ? (open ? "text-secondary" : C_IDLE) : C_ACTIVE;
    const readRanges = tool.name === "Read" && run.length > 1 && run.every(t => t.input?.offset || t.input?.limit);
    const annotation = readRanges
        ? `(${run.map(t => `${t.input.offset ?? 1}–${(t.input.offset ?? 1) + (t.input.limit ?? 0) - 1}`).join(", ")})`
        : run.length > 1
          ? `×${run.length}`
          : undefined;
    const counts = run.map(adds).filter(Boolean) as { adds: number; dels: number }[];
    const task = ctx.tasks[tool.id];
    const outcome = status === "stopped" ? "Stopped" : status === "denied" ? "Denied" : undefined;
    const toggle = () => hasBody && setOpen(!open);

    return (
        <div className="flex flex-col w-full">
            <div
                role="button"
                tabIndex={0}
                aria-expanded={hasBody ? open : undefined}
                aria-disabled={!hasBody || undefined}
                onClick={toggle}
                onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
                className={ROW_GAP075 + " cursor-pointer"}
            >
                <span className={`group/morph inline-grid items-center justify-items-start data-[gliding]:overflow-x-clip ${fullLabel ? "min-w-0" : "shrink-0"}`}>
                    <span
                        data-morph-key={running ? "running" : "settled"}
                        className={`col-start-1 row-start-1 min-w-0 max-w-full group-data-[gliding]/morph:max-w-none ${fullLabel ? "truncate" : "whitespace-nowrap"} ${running ? "text-body" : failed ? "text-body text-danger" : "text-body " + LABEL_COLOR}`}
                    >
                        <ShimmerText active={running} className={fullLabel ? "block truncate" : "inline-block"}>
                            {text}
                        </ShimmerText>
                    </span>
                </span>
                {agent && running && task && (
                    <span className="text-body text-secondary truncate min-w-0">
                        {task.lastToolName ?? ""}
                        {task.usage ? ` · ${task.usage.tool_uses}` : ""}
                    </span>
                )}
                {awaiting && <span className="text-body text-warning shrink-0">Needs approval</span>}
                {summary.meta && !fullLabel && <Meta label={summary} settled={settled} cwd={ctx.cwd} />}
                {annotation && <span className={`text-body truncate min-w-0 ${LABEL_COLOR} ${readRanges ? "" : "-ms-0.75"}`}>{readRanges ? annotation : `, ${annotation}`}</span>}
                {outcome && <span className="shrink-0 text-body text-secondary">{outcome}</span>}
                {running && <span className="sr-only">running</span>}
                {settled && counts.length > 0 && <DiffCounts adds={counts.reduce((a, d) => a + d.adds, 0)} dels={counts.reduce((a, d) => a + d.dels, 0)} />}
                {hasBody && <Caret expanded={open} colorClassName={CARET_COLOR} />}
            </div>
            {hasBody && (
                <ExpandingBody expanded={open}>
                    {run.map(t => (
                        <ToolBody key={t.id} tool={t} ctx={ctx} inCard={inCard} status={statusOf(t, ctx)} />
                    ))}
                </ExpandingBody>
            )}
        </div>
    );
}

function Meta({ label, settled, cwd }: { label: ReturnType<typeof toolLabel>; settled: boolean; cwd?: string }) {
    const color = settled ? C_SETTLED : C_ACTIVE;
    if (label.metaIsFile)
        return (
            <span className="contents" onClick={e => e.stopPropagation()}>
                <button
                    type="button"
                    className="text-body text-primary truncate min-w-0 hover:underline underline-offset-[3px] focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus"
                    title={label.metaIsFile}
                    onClick={() => N().agents.openPath(label.metaIsFile!.startsWith("/") ? label.metaIsFile! : `${cwd}/${label.metaIsFile}`)}
                >
                    {label.meta}
                </button>
            </span>
        );
    if (label.metaIsCode) return <span className="text-body text-primary truncate min-w-0">{label.meta}</span>;
    return <span className={"text-body truncate min-w-0 " + color}>{label.meta}</span>;
}

// ---------------------------------------------------------------- bodies
function Card({ children }: { children: ReactNode }) {
    return (
        <div className="group/body py-md">
            <div className="epitaxy-card-outline-inset rounded-lg flex flex-col">{children}</div>
        </div>
    );
}
function TextBody({ standalone, contentClassName, copy, children }: { standalone?: boolean; contentClassName: string; copy?: ReactNode; children: ReactNode }) {
    const inner = (
        <div className={standalone ? "relative flex w-full px-md py-sm" : "group/body relative flex w-full pt-xs"}>
            <div className={"flex-1 min-w-0 flex flex-col " + contentClassName}>{children}</div>
            {copy}
        </div>
    );
    return standalone ? <Card>{inner}</Card> : inner;
}
const Scroll = ({ label = "Tool output", className = "", children }: { label?: string; className?: string; children: ReactNode }) => (
    <div tabIndex={0} role="group" aria-label={label} className={`max-h-[400px] overflow-y-auto ${className}`}>
        {children}
    </div>
);
const shortPath = (p: string, cwd?: string) => (cwd && p?.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p?.replace(/^\/Users\/[^/]+/, "~"));

// Grep / Glob output: each path (or path:line: match) opens the file
function PathList({ out, ctx }: { out: string; ctx: ToolCtx }) {
    const [all, setAll] = useState(false);
    const lines = out.split("\n").filter(l => l.trim() && !/^Found \d+ /.test(l));
    const shown = all ? lines : lines.slice(0, 40);
    const open = (p: string) => N().agents.openPath(p.startsWith("/") ? p : `${ctx.cwd}/${p}`);
    const rel = (p: string) => (ctx.cwd && p.startsWith(ctx.cwd + "/") ? p.slice(ctx.cwd.length + 1) : p);
    return (
        <div className="flex flex-col pt-xs font-mono text-footnote max-h-[320px] overflow-y-auto">
            {shown.map((l, k) => {
                const m = /^(.+?\.[\w-]+|[^:]+?)(?::(\d+)[:-](.*))?$/.exec(l);
                const path = m?.[1] ?? l;
                return (
                    <div key={k} className="flex min-w-0 items-baseline gap-sm">
                        <button
                            type="button"
                            className="cds-reset shrink-0 max-w-[60%] truncate text-left text-accent hover:underline cursor-pointer"
                            title={path}
                            onClick={() => open(path)}
                        >
                            {rel(path)}
                            {m?.[2] ? `:${m[2]}` : ""}
                        </button>
                        {m?.[3] != null && <span className="min-w-0 truncate text-secondary">{m[3]}</span>}
                    </div>
                );
            })}
            {lines.length > 40 && !all && (
                <button type="button" className="cds-reset self-start pt-xs text-muted hover:text-primary cursor-pointer font-sans" onClick={() => setAll(true)}>
                    Show all {lines.length}
                </button>
            )}
        </div>
    );
}

// WebSearch results: "Links: [{title,url},…]" then the model-facing summary
function searchLinks(out: string): { title: string; url: string }[] {
    const m = out.match(/Links:\s*(\[[\s\S]*?\])(?:\s*\n|$)/);
    try {
        return m ? (JSON.parse(m[1]) as any[]).filter(l => l?.url).slice(0, 12) : [];
    } catch {
        return [...out.matchAll(/https?:\/\/[^\s)"'\]]+/g)].slice(0, 12).map(x => ({ title: x[0], url: x[0] }));
    }
}
function WebLinks({ links, text, ctx }: { links: { title: string; url: string }[]; text: string; ctx: ToolCtx }) {
    const [more, setMore] = useState(false);
    return (
        <div className="flex flex-col gap-sm pt-xs">
            {links.length > 0 && (
                <div className="flex flex-wrap gap-xs">
                    {links.map((l, k) => {
                        const host = (() => {
                            try {
                                return new URL(l.url).hostname.replace(/^www\./, "");
                            } catch {
                                return l.url;
                            }
                        })();
                        return (
                            <a
                                key={k}
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                title={l.title}
                                className="epitaxy-link-chip inline-flex max-w-[260px] items-center gap-xs rounded bg-alpha-1 hover:bg-alpha-2 px-sm py-0.5 text-footnote text-secondary hover:text-primary no-underline"
                            >
                                <Icon name="Globe" size="xs" className="shrink-0 text-muted" />
                                <span className="truncate">{l.title && l.title !== l.url ? l.title : host}</span>
                            </a>
                        );
                    })}
                </div>
            )}
            {text && (
                <div className={`text-body text-secondary ${more ? "" : "max-h-[calc(6*var(--cds-leading-body))] overflow-hidden"}`}>
                    <Prose text={text} cwd={ctx.cwd} />
                </div>
            )}
            {text && text.length > 600 && (
                <button type="button" className="cds-reset self-start cds-text-link text-footnote text-muted hover:text-primary cursor-pointer" onClick={() => setMore(!more)}>
                    {more ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
}

function ToolBody({ tool, ctx, inCard, status }: { tool: ToolItem; ctx: ToolCtx; inCard?: boolean; status: Status }) {
    const i = tool.input ?? {};
    const raw = stripReminders(resultText(tool.result?.content));
    const out = stripAnsi(raw);
    const isError = status === "error";
    switch (tool.name) {
        case "Grep":
        case "Glob": {
            if (isError || !out.trim()) break;
            return <PathList out={out} ctx={ctx} />;
        }
        case "WebSearch": {
            if (isError || !out) break;
            return (
                <WebLinks
                    links={searchLinks(out)}
                    text={out
                        .replace(/Links:\s*\[[\s\S]*?\]\s*/, "")
                        .replace(/^Web search results for query:.*\n?/, "")
                        .trim()}
                    ctx={ctx}
                />
            );
        }
        case "WebFetch": {
            if (isError || !out) break;
            return <WebLinks links={i.url ? [{ title: i.url.replace(/^https?:\/\//, ""), url: i.url }] : []} text={out} ctx={ctx} />;
        }
        case "Bash":
        case "BashTool":
        case "PowerShell":
            return (
                <BashBody
                    tool={tool}
                    out={INTERRUPT_RE.test(out) ? "" : out}
                    colored={INTERRUPT_RE.test(out) ? "" : raw}
                    isError={isError}
                    running={status === "running"}
                    inCard={inCard}
                />
            );
        case "Read":
            if (isError) break;
            return (
                <FileCard path={i.file_path} cwd={ctx.cwd} copyText={readOutput(out)} inCard={inCard}>
                    <FileCode code={readOutput(out)} lang={langFromPath(i.file_path)} startLine={i.offset ?? 1} />
                </FileCard>
            );
        case "Write":
            return (
                <FileCard path={i.file_path} cwd={ctx.cwd} copyText={i.content ?? ""} inCard={inCard}>
                    <FileCode code={i.content ?? ""} lang={langFromPath(i.file_path)} sided="added" />
                </FileCard>
            );
        case "Edit":
            return (
                <FileCard path={i.file_path} cwd={ctx.cwd} copyText={i.new_string ?? ""} inCard={inCard}>
                    <DiffOrLarge oldText={i.old_string ?? ""} newText={i.new_string ?? ""} path={i.file_path} />
                </FileCard>
            );
        case "MultiEdit":
            return (
                <FileCard path={i.file_path} cwd={ctx.cwd} copyText={(i.edits ?? []).map((e: any) => e.new_string).join("\n")} inCard={inCard}>
                    {(i.edits ?? []).map((e: any, k: number) => (
                        <DiffOrLarge key={k} oldText={e.old_string ?? ""} newText={e.new_string ?? ""} path={i.file_path} />
                    ))}
                </FileCard>
            );
        case "NotebookEdit":
            return (
                <FileCard path={i.notebook_path} cwd={ctx.cwd} copyText={i.new_source ?? ""} inCard={inCard}>
                    <FileCode code={i.new_source ?? ""} lang={i.cell_type === "markdown" ? "md" : "py"} sided={i.edit_mode === "delete" ? "removed" : "added"} />
                </FileCard>
            );
        case "ApplyPatch":
            return (
                <>
                    {(i.changes ?? []).map((c: any, k: number) => (
                        <FileCard key={k} path={c.path} cwd={ctx.cwd} copyText={c.diff ?? ""} inCard={inCard}>
                            <FileCode code={String(c.diff ?? "").replace(/^(---|\+\+\+) .*\n/gm, "")} lang="diff" lineNumbers={false} />
                        </FileCard>
                    ))}
                </>
            );
        case "TodoWrite":
            return <TodoList todos={i.todos ?? []} />;
        case "ExitPlanMode":
            return status === "done" ? (
                <div className="flex flex-col gap-1 py-xs">
                    <div data-find-omitted="" className="flex items-center gap-1 text-body text-success">
                        <Icon name="CheckCircle" size="sm" />
                        <span>Plan approved</span>
                    </div>
                    {i.plan && (
                        <div className="epitaxy-markdown-inherit-color text-secondary pl-md border-l-2">
                            <Prose text={i.plan} cwd={ctx.cwd} />
                        </div>
                    )}
                </div>
            ) : i.plan ? (
                <div className="epitaxy-markdown-inherit-color text-secondary pl-md border-l-2 py-xs">
                    <Prose text={i.plan} cwd={ctx.cwd} />
                </div>
            ) : null;
        case "AskUserQuestion":
            return (
                <div className="flex flex-col gap-1 pt-xs">
                    {(i.questions ?? []).map((q: any, k: number) => (
                        <div key={k} className="text-body text-secondary [overflow-wrap:anywhere]">
                            {q.question}
                        </div>
                    ))}
                </div>
            );
        case "Task":
        case "Agent":
            return <AgentBody tool={tool} ctx={ctx} out={out} />;
    }
    return <GenericBody tool={tool} out={out} isError={isError} standalone={!inCard && tool.name.startsWith("mcp__")} cwd={ctx.cwd} />;
}

function BashBody({ tool, out, colored, isError, running, inCard }: { tool: ToolItem; out: string; colored?: string; isError: boolean; running: boolean; inCard?: boolean }) {
    const cmd: string = tool.input?.command ?? "";
    const ps = tool.name === "PowerShell";
    const content = (
        <>
            {cmd && (
                <div className="epitaxy-diff epitaxy-code-card rounded-lg flex overflow-clip px-md py-xs" style={CODE_THEME}>
                    <span aria-hidden="true" data-find-omitted="" className="select-none text-secondary">
                        {ps ? "> " : "$ "}
                    </span>
                    <div className="min-w-0 flex-1">
                        <FileCode code={cmd} lang={ps ? undefined : "bash"} lineNumbers={false} />
                    </div>
                    <div className="flex h-[1lh] shrink-0 items-center">
                        <CopyButton compact text={`${ps ? "> " : "$ "}${cmd}\n${out}`} />
                    </div>
                </div>
            )}
            {out && (
                <div
                    tabIndex={0}
                    role="group"
                    aria-label="Tool output"
                    className={`max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all ${isError ? "text-danger" : "text-secondary"}`}
                >
                    {colored ? ansiSpans(colored) : out}
                </div>
            )}
            {running && (
                <div data-find-omitted="" className="flex min-h-control items-center gap-1.25 font-sans text-body text-secondary">
                    <span className="flex items-center gap-1 whitespace-nowrap leading-none">
                        <span>Running</span>
                        <Elapsed since={tool.startedAt} className="tabular-nums" threshold={10} />
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                        <CopyButton compact alwaysVisible text={`$ ${cmd}\n${out}`} />
                    </div>
                </div>
            )}
        </>
    );
    if (inCard)
        return (
            <div className="group/body relative flex w-full pt-xs">
                <div className="flex-1 min-w-0 flex flex-col gap-md text-code">{content}</div>
            </div>
        );
    return (
        <Card>
            <div data-find-omitted="" className="flex items-center px-md py-sm">
                <span className="flex-1 text-body text-secondary">{ps ? "PowerShell" : "Bash"}</span>
                {!cmd && out && <CopyButton text={out} />}
            </div>
            <div className="flex flex-col gap-md px-md pb-lg text-code">{content}</div>
        </Card>
    );
}

function FileCard({ path, cwd, copyText, inCard, children }: { path?: string; cwd?: string; copyText: string; inCard?: boolean; children: ReactNode }) {
    const header = (
        <div data-find-omitted="" className={inCard ? "flex items-center gap-1 pb-xs" : "flex items-center gap-1 px-md py-sm"}>
            <button
                type="button"
                className="flex flex-1 min-w-0 text-left text-footnote text-secondary focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus hover:underline underline-offset-[3px]"
                onClick={() => path && N().agents.openPath(path)}
                title={path}
            >
                <span className="truncate">{shortPath(path ?? "", cwd)}</span>
            </button>
            <CopyButton text={copyText} />
        </div>
    );
    if (inCard)
        return (
            <div className="group/body flex w-full flex-col pt-xs" style={CODE_THEME}>
                {header}
                <div className="epitaxy-diff epitaxy-code-card rounded-lg overflow-clip" style={{ background: CODE_THEME.background }}>
                    {children}
                </div>
            </div>
        );
    return (
        <div className="group/body py-md">
            <div className="epitaxy-code-card epitaxy-card-outline-layer rounded-lg overflow-clip flex flex-col" style={CODE_THEME}>
                {header}
                <div tabIndex={0} role="group" aria-label="Code" className="max-h-[400px] overflow-y-auto epitaxy-diff">
                    {children}
                </div>
            </div>
        </div>
    );
}

function DiffOrLarge({ oldText, newText, path }: { oldText: string; newText: string; path?: string }) {
    if (oldText.length + newText.length > 200_000)
        return (
            <>
                <p data-find-omitted="" className="px-md py-xs font-sans text-caption text-secondary">
                    Too many changes to show as a diff. Showing the removed and added text separately.
                </p>
                <div tabIndex={0} role="group" aria-label="Removed text" className="max-h-[200px] overflow-y-auto">
                    <FileCode code={oldText} sided="removed" />
                </div>
                <div tabIndex={0} role="group" aria-label="Added text" className="max-h-[200px] overflow-y-auto">
                    <FileCode code={newText} sided="added" />
                </div>
            </>
        );
    if (!oldText) return <FileCode code={newText} lang={langFromPath(path)} sided="added" />;
    if (!newText) return <FileCode code={oldText} lang={langFromPath(path)} sided="removed" />;
    return <FileDiff oldText={oldText} newText={newText} lang={langFromPath(path)} />;
}

const CODE_KEYS = ["command", "cmd", "script", "shell", "code", "pattern", "regex", "glob"];
function GenericBody({ tool, out, isError, standalone, cwd }: { tool: ToolItem; out: string; isError: boolean; standalone?: boolean; cwd?: string }) {
    const input = tool.input ?? {};
    const inputs = (
        <div className="text-secondary flex flex-col gap-0.75">
            {Object.keys(input).map(k => {
                const v = input[k];
                return (
                    <div key={k} className="break-words">
                        <span className="text-code opacity-70">{k}:</span>{" "}
                        {k === "file_path" || k === "notebook_path" ? (
                            <span
                                className="rounded-[4px] focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus"
                                role="button"
                                onClick={() => N().agents.openPath(v)}
                            >
                                <code className="epitaxy-code-chip">{shortPath(v, cwd)}</code>
                            </span>
                        ) : typeof v === "string" ? (
                            CODE_KEYS.includes(k) ? (
                                <span className="text-code whitespace-pre-wrap break-all">{v}</span>
                            ) : (
                                v
                            )
                        ) : (
                            <span className="text-code">{JSON.stringify(v)}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
    const copy = <CopyButton text={JSON.stringify(input, null, 2) + (out ? "\n\n" + out : "")} />;
    if (isError)
        return (
            <TextBody standalone={standalone} contentClassName="gap-1.25 text-body whitespace-pre-wrap break-words" copy={copy}>
                <Scroll label="Tool call details" className="flex flex-col gap-1.25">
                    <div className="text-danger">{out}</div>
                    {inputs}
                </Scroll>
            </TextBody>
        );
    return (
        <TextBody standalone={standalone} contentClassName="gap-1.25 text-body text-secondary whitespace-pre-wrap break-words" copy={copy}>
            <Scroll label="Tool call details" className="flex flex-col gap-1.25">
                {inputs}
                {out && <div>{out}</div>}
            </Scroll>
        </TextBody>
    );
}

export function TodoList({ todos, mutedDone, spin, unpadded }: { todos: any[]; mutedDone?: boolean; spin?: boolean; unpadded?: boolean }) {
    return (
        <ul className={`flex flex-col gap-xs text-body select-text ${unpadded ? "" : "py-xs"}`}>
            {todos.map((t, k) => (
                <li
                    key={k}
                    className={`flex items-start gap-1 ${t.status === "completed" ? (mutedDone ? "text-secondary [--code-chip-ink:currentColor]" : "line-through decoration-1 text-secondary") : "text-primary"}`}
                >
                    <span
                        data-find-omitted=""
                        className={`epitaxy-markdown-first-line shrink-0 w-[calc(1rem*var(--cds-rem-scale,1))] flex items-center justify-center ${t.status === "completed" ? (mutedDone ? "text-secondary" : "text-primary") : t.status === "in_progress" ? "text-primary" : ""}`}
                    >
                        {t.status === "completed" ? (
                            <>
                                <Icon name={mutedDone ? "CheckCircleFilled" : "Check"} size="sm" />
                                <span className="sr-only select-none">done</span>
                            </>
                        ) : t.status === "in_progress" ? (
                            <>
                                {spin ? <Spinner /> : <Icon name="DotsCircle" size="sm" />}
                                <span className="sr-only select-none">in progress</span>
                            </>
                        ) : (
                            <>
                                <Icon name="Placeholder" size="sm" className="text-muted" />
                                <span className="sr-only select-none">not done</span>
                            </>
                        )}
                    </span>
                    <div className="epitaxy-markdown-inherit-color min-w-0 flex-1">{t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}</div>
                </li>
            ))}
        </ul>
    );
}

function AgentBody({ tool, ctx, out }: { tool: ToolItem; ctx: ToolCtx; out: string }) {
    const sub = ctx.children[tool.id] ?? [];
    const task = ctx.tasks[tool.id];
    return (
        <div className="flex flex-col gap-[var(--chat-item-gap)] pt-xs pl-md border-l-2 border-alpha-2">
            {tool.input?.prompt && (
                <div className="text-body text-muted whitespace-pre-wrap break-words max-h-[calc(4*var(--cds-leading-body))] overflow-y-auto">{tool.input.prompt}</div>
            )}
            {sub.map((x: any) =>
                x.kind === "tool" ? (
                    <ToolRow key={x.id} run={[x]} ctx={{ ...ctx, busy: ctx.busy && !tool.result }} />
                ) : x.kind === "text" && x.text?.trim() && !(tool.result && out && out.includes(x.text.trim().slice(0, 80))) ? (
                    <div key={x.id} className="text-body text-secondary">
                        <Prose text={x.text} cwd={ctx.cwd} />
                    </div>
                ) : null,
            )}
            {task?.summary && !tool.result && <div className="text-body text-secondary">{task.summary}</div>}
            {out && <Prose text={out} cwd={ctx.cwd} />}
        </div>
    );
}

function ToolImages({ tool }: { tool: ToolItem }) {
    const imgs = resultImages(tool.result?.content);
    const [lightbox, openImage] = useLightbox();
    if (!imgs.length) return null;
    return (
        <div className="flex flex-col items-start gap-1 pt-md">
            {lightbox}
            {imgs.map((im, k) => (
                <button
                    key={k}
                    type="button"
                    aria-label="View screenshot"
                    className="max-w-full cursor-zoom-in focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus rounded-sm"
                    onClick={() => openImage(`data:${im.mime};base64,${im.data}`)}
                >
                    <img src={`data:${im.mime};base64,${im.data}`} alt="" className="max-w-full max-h-[360px] w-auto rounded-[5px] border" />
                </button>
            ))}
        </div>
    );
}

function QuestionReceipt({ tool }: { tool: ToolItem }) {
    const out = resultText(tool.result?.content);
    const qs: any[] = tool.input?.questions ?? [];
    const pairs = qs.map(q => {
        const m = out.match(new RegExp(`"${q.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*=\\s*"([^"]*)"`));
        let a = m?.[1] ?? "";
        if (/did not answer this question|\[No preference\]/.test(a)) a = "Skipped";
        else if (/sent a message instead/.test(a)) a = "Replied in chat";
        else if (/User dismissed/.test(a)) a = "Not answered";
        return { q: q.question, a: a || "Not answered" };
    });
    return (
        <div className="epitaxy-question-receipt epitaxy-card-outline flex w-full max-w-[480px] flex-col overflow-clip rounded-lg select-text">
            {pairs.map((p, k) => (
                <div key={k} className="flex flex-col gap-0.5 px-lg py-md">
                    <div className="text-body font-medium text-primary break-words">{p.q}</div>
                    <div className="text-body text-secondary [overflow-wrap:anywhere]">{p.a}</div>
                </div>
            ))}
        </div>
    );
}

export { TASK_CARD, BTN_FOCUS, Chevron };
