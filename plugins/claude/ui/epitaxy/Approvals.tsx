// Approval dock cards: tool permissions, plan approval (ExitPlanMode), questions (AskUserQuestion) and MCP requests.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAgents, rt, answerPermission, answerRequest, setMode, type AgentChat, type Permission, type PermissionMode, type PendingRequest } from "../store";
import { Button } from "../cds/Button";
import { Icon } from "../cds/Icon";
import { Shortcut, TextArea, Checkbox } from "../cds/Controls";
import { Menu, MenuItem } from "../cds/Menu";
import { ExpandingBody } from "./primitives";
import { FileDiff, FileCode, langFromPath } from "./Diffs";
import { Prose } from "./Prose";
import { mcpParts, conjugate } from "./labels";
import { Stores, channelLabel } from "../discord";
import { kv } from "../kv";
const discordChannel = (id?: string) => (id ? channelLabel(Stores.Channel()?.getChannel(id)) : "Discord");

const CARD =
    "epitaxy-approval-card relative isolate flex flex-col rounded-card p-[12px] gap-[12px] max-h-[60vh] origin-top @container animate-code-approval-promote group-data-[skip-approval-enter]/approval-dock:animate-none motion-reduce:animate-none";
const BODY =
    "epitaxy-scroll-clamp scroll-fade-y focus-visible:outline-hidden focus-visible:shadow-focus epitaxy-approval-body flex min-h-0 flex-col gap-[12px] overflow-y-auto -mx-[12px] px-[12px] -mt-[4px] pt-[4px] -mb-[8px] pb-[8px] [&>*]:shrink-0 overscroll-contain";
const DETAIL = "bg-alpha-1 rounded-[5px] py-md px-lg text-code text-secondary whitespace-pre-wrap break-words select-text [unicode-bidi:plaintext]";
const SEL = "bg-[light-dark(var(--cds-surface-popover),var(--cds-alpha-2))] [box-shadow:inset_0_0_0_1px_var(--cds-fill-secondary-ring)]";
const MOD = navigator.platform.toLowerCase().includes("mac") ? "metaKey" : "ctrlKey";

function ApprovalCard({
    queueDepth = 0,
    className = "",
    children,
    ...rest
}: { queueDepth?: number; className?: string; children: ReactNode; ref?: any } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={`${CARD} ${className}`}
            {...rest}
            onKeyDown={e => {
                rest.onKeyDown?.(e);
                // ←/→ move between the card's action buttons
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const t = e.target as HTMLElement;
                const bar = t.closest(".epitaxy-approval-actions");
                if (!bar || t.tagName !== "BUTTON") return;
                const btns = [...bar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
                const i = btns.indexOf(t as HTMLButtonElement);
                const next = btns[i + (e.key === "ArrowRight" ? 1 : -1)];
                if (next) (e.preventDefault(), next.focus());
            }}
        >
            {Array.from({ length: Math.min(queueDepth, 2) }, (_, k) => {
                const i = k + 1;
                return (
                    <div
                        key={i}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-card bg-surface-1 origin-top transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none"
                        style={{ transform: `translateY(-${i * 6}px) scale(${1 - i * 0.03})`, zIndex: -i, opacity: 1 - i * 0.25 }}
                    />
                );
            })}
            <div aria-hidden="true" data-surface="sidebar" className="absolute inset-0 -z-[1] rounded-[inherit] pointer-events-none bg-surface-panel shadow-panel-sm" />
            {children}
        </div>
    );
}
function TitleRow({ leading, trailing, subtitle, children }: { leading?: ReactNode; trailing?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
    return (
        <div className="text-primary min-h-[24px] flex items-center gap-1">
            <span className="flex flex-1 min-w-0 flex-col gap-[2px]">
                <span className="flex items-start gap-xs min-w-0">
                    {leading}
                    <span className="text-body-semibold min-w-0 break-words">{children}</span>
                </span>
                {subtitle ? <div className="text-body text-muted">{subtitle}</div> : null}
            </span>
            {trailing ? <span className="shrink-0 self-center">{trailing}</span> : null}
        </div>
    );
}
const B = ({ children }: { children: ReactNode }) => <span className="text-primary [unicode-bidi:plaintext]">{children}</span>;

// arm grace: ignore shortcut presses for 400ms after a card appears
function useArmed() {
    const at = useRef(Date.now());
    return () => Date.now() - at.current > 400;
}
// shortcuts only for a card that's on screen and whose view has the keyboard (not a hidden page, not Discord itself)
function ownsKey(e: KeyboardEvent, el: Element | null | undefined) {
    if (!el?.isConnected || !(el as any).checkVisibility?.()) return false;
    return e.composedPath().includes(el.getRootNode() as EventTarget);
}
function typingElsewhere(e: KeyboardEvent) {
    const t = (e.composedPath()[0] as HTMLElement) ?? null;
    return !!t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "INPUT");
}

// ---------------------------------------------------------------- dispatcher
export function ApprovalDock({ chat }: { chat: AgentChat }) {
    const perms = useAgents(s => s.runtimes[chat.localId]?.permissions) ?? rt(chat.localId).permissions;
    const reqs = useAgents(s => s.runtimes[chat.localId]?.requests) ?? [];
    const p = perms[0];
    if (!p) return reqs[0] ? <RequestCard key={reqs[0].requestId} chat={chat} q={reqs[0]} depth={reqs.length - 1} /> : null;
    const depth = perms.length - 1 + reqs.length;
    if (p.toolName === "AskUserQuestion") return <QuestionCard key={p.requestId} chat={chat} p={p} depth={depth} />;
    if (p.toolName === "ExitPlanMode") return <PlanCard key={p.requestId} chat={chat} p={p} depth={depth} />;
    return <ToolCard key={p.requestId} chat={chat} p={p} depth={depth} />;
}

// ---------------------------------------------------------------- tool approval
const base = (s?: string) => (s ? s.split("/").filter(Boolean).pop() : undefined);
function copyFor(p: Permission): { action: string; meta?: string; detail?: string; note?: string; diff?: ReactNode; subtitle?: string; clamp?: boolean } {
    const i = p.input ?? {};
    switch (p.toolName) {
        case "Bash":
        case "BashTool":
        case "PowerShell":
            if (i.description && conjugate(i.description))
                return {
                    action: conjugate(i.description)!.infinitive,
                    detail: i.command,
                    clamp: true,
                    note: i.run_in_background ? "Keeps running in the background." : i.dangerouslyDisableSandbox ? "Runs outside Claude’s sandbox." : undefined,
                };
            return {
                action: "run",
                meta: i.description,
                detail: i.command,
                clamp: true,
                note: i.run_in_background ? "Keeps running in the background." : i.dangerouslyDisableSandbox ? "Runs outside Claude’s sandbox." : undefined,
            };
        case "Read":
            return { action: "read", meta: base(i.file_path), detail: i.file_path, clamp: true };
        case "Write":
            return { action: "write", meta: base(i.file_path), detail: i.file_path, diff: <FileCode code={i.content ?? ""} lang={langFromPath(i.file_path)} sided="added" /> };
        case "Edit":
            return {
                action: "edit",
                meta: base(i.file_path),
                detail: i.file_path,
                diff: <FileDiff oldText={i.old_string ?? ""} newText={i.new_string ?? ""} lang={langFromPath(i.file_path)} />,
            };
        case "MultiEdit":
            return {
                action: "edit",
                meta: base(i.file_path),
                detail: i.file_path,
                diff: (
                    <>
                        {(i.edits ?? []).map((e: any, k: number) => (
                            <FileDiff key={k} oldText={e.old_string ?? ""} newText={e.new_string ?? ""} lang={langFromPath(i.file_path)} />
                        ))}
                    </>
                ),
            };
        case "NotebookEdit":
            return { action: "edit", meta: base(i.notebook_path), detail: i.notebook_path };
        case "ApplyPatch": {
            const ch: any[] = i.changes ?? [];
            const one = ch.length === 1 ? ch[0] : null;
            return {
                action: one?.kind === "add" ? "create" : one?.kind === "delete" ? "delete" : "edit",
                meta: one ? base(one.path) : `${ch.length} files`,
                detail: one?.path,
                diff: (
                    <>
                        {ch.map((c, k) => (
                            <FileCode key={k} code={String(c.diff ?? "").replace(/^(---|\+\+\+) .*\n/gm, "")} lang="diff" lineNumbers={false} />
                        ))}
                    </>
                ),
            };
        }
        case "Permissions":
            return { action: "use extra sandbox access", detail: JSON.stringify(i, null, 2) };
        case "Grep":
        case "Glob":
            return { action: "search", meta: i.pattern };
        case "WebFetch":
            return { action: "fetch", meta: i.url, detail: i.prompt };
        case "WebSearch":
            return { action: "search the web", meta: i.query };
        case "Skill":
            return { action: "run skill", meta: `/${i.skill}`, detail: i.args };
        case "Task":
        case "Agent":
            return { action: "run an agent", meta: i.description };
    }
    if (p.toolName.startsWith("mcp__discord__")) {
        const ch = discordChannel(i.channel_id);
        switch (p.toolName.slice(14)) {
            case "send_message":
                return { action: "send a message", meta: `to ${ch}`, detail: i.content, subtitle: i.reply_to_message_id ? "As a reply" : "Sent as you, on Discord" };
            case "edit_message":
                return { action: "edit your message", meta: `in ${ch}`, detail: i.content };
            case "delete_message":
                return { action: "delete your message", meta: `in ${ch}` };
            case "add_reaction":
                return { action: `react ${i.emoji}`, meta: `in ${ch}` };
        }
    }
    if (p.toolName.startsWith("mcp__")) {
        const { server, tool } = mcpParts(p.toolName);
        return { action: `use ${p.displayName ?? tool.replace(/_+/g, " ")} (${p.mcpServer?.name ?? server})`, subtitle: p.description };
    }
    return { action: `use ${p.displayName ?? p.toolName}`, subtitle: p.description };
}
const scopeText = (s: any) => {
    const d = s?.destination;
    return d === "userSettings"
        ? "Saves to user settings (all projects)"
        : d === "projectSettings"
          ? "Saves to project settings"
          : d === "localSettings"
            ? "Saves to local project settings"
            : d === "session"
              ? "Applies to this session only"
              : "Don’t ask again for this tool";
};

function ToolCard({ chat, p, depth }: { chat: AgentChat; p: Permission; depth: number }) {
    const c = copyFor(p);
    const armed = useArmed();
    const ref = useRef<HTMLDivElement>(null);
    const canAlways = !p.suppressAlwaysAllowRule && !!p.suggestions?.length && !p.input?.dangerouslyDisableSandbox;
    const deny = () => answerPermission(chat.localId, p, { allow: false });
    const once = () => answerPermission(chat.localId, p, { allow: true });
    const always = () => answerPermission(chat.localId, p, { allow: true, updatedPermissions: p.suggestions });
    const denyFirst = !!p.defaultToNo;
    // a command that runs outside the sandbox: read all of it before Allow unlocks
    const unsandboxed = !!p.input?.dangerouslyDisableSandbox;
    const detailRef = useRef<HTMLDivElement>(null);
    const [readAll, setReadAll] = useState(!unsandboxed);
    const readAllRef = useRef(readAll);
    readAllRef.current = readAll;
    useEffect(() => {
        const el = detailRef.current;
        if (unsandboxed && (!el || el.scrollHeight <= el.clientHeight + 4)) setReadAll(true);
    }, [p.requestId]);
    const [more, setMore] = useState(false);
    const moreRef = useRef<HTMLButtonElement>(null);
    // "More allow options": allow and change how the rest of the session asks (not for acting-as-you Discord tools)
    const modeOptions: [PermissionMode, string][] =
        chat.provider === "codex" || p.toolName.startsWith("mcp__discord__") || p.input?.dangerouslyDisableSandbox
            ? []
            : (
                  [
                      ["acceptEdits", "Allow and accept edits"],
                      ["auto", "Allow and switch to Auto"],
                  ] as [PermissionMode, string][]
              ).filter(([m]) => m !== chat.permissionMode);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.repeat || !armed() || !ownsKey(e, ref.current)) return;
            if (e.key === "Escape" && !typingElsewhere(e)) (e.preventDefault(), e.stopPropagation(), deny());
            else if (e.key === "Enter" && (e as any)[MOD] && typingElsewhere(e) && ((e.composedPath()[0] as HTMLElement)?.textContent ?? "").trim())
                return; // typing a message, not approving
            else if (e.key === "Enter" && (e as any)[MOD] && e.shiftKey && canAlways) (e.preventDefault(), always());
            else if (e.key === "Enter" && (e as any)[MOD]) (e.preventDefault(), readAllRef.current && once());
            else if (/^[1-3]$/.test(e.key) && !typingElsewhere(e) && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                const acts = [deny, ...(canAlways ? [always] : []), () => readAllRef.current && once()];
                acts[Number(e.key) - 1]?.();
            }
        };
        window.addEventListener("keydown", onKey, true);
        ref.current?.focus({ preventScroll: true });
        return () => window.removeEventListener("keydown", onKey, true);
    }, [p.requestId]);
    const title = p.title ? (
        <B>{p.title}</B>
    ) : c.meta ? (
        <>
            Allow Claude to <B>{c.action}</B> <B>{c.meta}</B>?
        </>
    ) : (
        <>
            Allow Claude to <B>{c.action}</B>?
        </>
    );
    const detailBlock =
        c.detail && c.detail !== c.meta ? (
            <div
                ref={detailRef}
                data-approval-value=""
                className={DETAIL}
                style={unsandboxed ? { maxHeight: 180, overflowY: "auto" } : undefined}
                onScroll={e => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 4) setReadAll(true);
                }}
            >
                {c.detail}
            </div>
        ) : null;
    const digit = (n: number) => <Shortcut keys={String(n)} onFill={false} />;
    return (
        <ApprovalCard
            queueDepth={depth}
            ref={ref as any}
            tabIndex={0}
            role="group"
            aria-label={`Permission request: ${c.action}`}
            className="gap-[24px] focus-visible:outline-1 focus-visible:outline-fill-accent focus-visible:outline-offset-2"
        >
            <div className={`${BODY} gap-[24px]`}>
                <div className="flex flex-col gap-[10px]">
                    <TitleRow subtitle={c.subtitle}>
                        <span data-approval-value="" className={c.clamp && detailBlock ? "line-clamp-2" : undefined}>
                            {title}
                        </span>
                    </TitleRow>
                    <div className="flex flex-col gap-[12px]">
                        {p.decisionReason && (
                            <div className="text-body text-secondary select-text break-words max-h-[calc(3*var(--cds-leading-body))] overflow-y-auto [unicode-bidi:plaintext]">
                                {p.decisionReason}
                            </div>
                        )}
                        {p.blockedPath && (
                            <p className="text-footnote text-muted select-text break-words [unicode-bidi:plaintext]">Outside the working directory: {p.blockedPath}</p>
                        )}
                        {p.toolName.startsWith("mcp__") && Object.keys(p.input ?? {}).length > 0 && (
                            <div className="flex flex-col gap-1 rounded bg-alpha-1 px-lg py-md">
                                <div className="text-footnote text-muted">What Claude sent</div>
                                {Object.entries(p.input).map(([k, v]) => (
                                    <div key={k} className="break-words text-body text-secondary">
                                        <span className="text-code opacity-70">{k}:</span>{" "}
                                        <span className="text-code whitespace-pre-wrap">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flow-root">
                            {c.diff ? (
                                <div data-approval-value="" className="flex flex-col gap-md">
                                    {detailBlock}
                                    <div
                                        className="epitaxy-diff epitaxy-code-card rounded-lg overflow-clip max-h-[280px] overflow-y-auto"
                                        style={{ background: "light-dark(#fff, #1a1a19)" }}
                                    >
                                        {c.diff}
                                    </div>
                                </div>
                            ) : c.note && detailBlock ? (
                                <div className="flex flex-col gap-[12px]">
                                    {detailBlock}
                                    <p data-testid="approval-detail-note" className="text-footnote text-muted select-text break-words [unicode-bidi:plaintext]">
                                        {c.note}
                                    </p>
                                </div>
                            ) : (
                                detailBlock
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-md gap-y-sm items-start justify-between epitaxy-approval-actions">
                <span className="contents">
                    <Button variant={denyFirst ? "primary" : "secondary"} className="max-w-full min-w-0" shortcut="esc" onMouseDown={e => e.preventDefault()} onClick={deny}>
                        <span className="min-w-0 [unicode-bidi:plaintext] truncate" data-approval-digit="1">
                            Deny
                        </span>
                        {digit(1)}
                    </Button>
                </span>
                <div className="flex min-w-0 flex-wrap gap-sm items-start">
                    <span className="contents" title={canAlways ? scopeText(p.suggestions?.[0]) : "This tool requires approval each time."}>
                        <Button
                            variant="secondary"
                            className="max-w-full min-w-0"
                            disabled={!canAlways}
                            shortcut="cmd+shift+enter"
                            onMouseDown={e => e.preventDefault()}
                            onClick={always}
                        >
                            <span className="min-w-0 [unicode-bidi:plaintext] truncate" data-approval-digit="2">
                                Always allow
                            </span>
                            {canAlways && digit(2)}
                        </Button>
                    </span>
                    <span className="contents">
                        <Button
                            variant={denyFirst ? "secondary" : "primary"}
                            className="max-w-full min-w-0"
                            data-approval-primary=""
                            shortcut="cmd+enter"
                            disabled={!readAll}
                            title={readAll ? undefined : "Scroll through the whole command first"}
                            onMouseDown={e => e.preventDefault()}
                            onClick={once}
                        >
                            <span className="min-w-0 [unicode-bidi:plaintext] truncate" data-approval-digit={canAlways ? "3" : "2"}>
                                Allow once
                            </span>
                        </Button>
                    </span>
                    {modeOptions.length > 0 && (
                        <>
                            <Button
                                ref={moreRef}
                                variant="secondary"
                                iconOnly
                                icon="CaretDown"
                                iconSize="xs"
                                aria-label="More allow options"
                                aria-haspopup="menu"
                                aria-expanded={more}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setMore(!more)}
                            />
                            <Menu open={more} onClose={() => setMore(false)} anchor={moreRef} side="top" align="end">
                                {modeOptions.map(([m, label]) => (
                                    <MenuItem key={m} label={label} onSelect={() => (setMode(chat, m), once())} />
                                ))}
                            </Menu>
                        </>
                    )}
                </div>
            </div>
        </ApprovalCard>
    );
}

// ---------------------------------------------------------------- plan approval
const ACCEPT_LABEL: Record<string, string> = {
    default: "Accept",
    acceptEdits: "Accept and allow edits",
    auto: "Accept and auto mode",
    bypassPermissions: "Accept and bypass permissions",
};
function PlanCard({ chat, p, depth }: { chat: AgentChat; p: Permission; depth: number }) {
    const [revising, setRevising] = useState(false);
    const [showPlan, setShowPlan] = useState(true);
    const [menu, setMenu] = useState(false);
    const split = useRef<HTMLButtonElement>(null);
    const group = useRef<HTMLDivElement>(null);
    const fb = useRef<HTMLTextAreaElement>(null);
    const armed = useArmed();
    const forward: PermissionMode = p.suppressAlwaysAllowRule ? "default" : "acceptEdits";
    const options: PermissionMode[] = p.suppressAlwaysAllowRule
        ? ["default"]
        : kv.get("allowBypass", true)
          ? ["acceptEdits", "auto", "bypassPermissions"]
          : ["acceptEdits", "auto"];
    const accept = (m: PermissionMode) => {
        answerPermission(chat.localId, p, { allow: true, updatedInput: p.input });
        setMode(chat, m);
    };
    const reject = (feedback: string) =>
        answerPermission(chat.localId, p, {
            allow: false,
            message: feedback ? `The user wants changes to the plan:\n\n${feedback}` : "The user rejected the plan. Wait for their next instruction.",
        });
    useEffect(() => {
        if (revising) return fb.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.repeat || !armed() || !ownsKey(e, group.current)) return;
            if (e.key === "Escape" && !typingElsewhere(e)) (e.preventDefault(), e.stopPropagation(), setRevising(true));
            else if (e.key === "Enter" && (e as any)[MOD] && e.shiftKey) (e.preventDefault(), accept("default"));
            else if (e.key === "Enter" && (e as any)[MOD]) (e.preventDefault(), accept(forward));
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [revising, p.requestId]);
    return (
        <ApprovalCard queueDepth={depth} data-approval-card-root="">
            <div className={BODY}>
                <TitleRow
                    trailing={
                        <span
                            data-cds="TextLink"
                            role="button"
                            tabIndex={0}
                            className="cds-reset cds-text-link cds-text-link-underline inline cursor-pointer text-footnote"
                            onClick={() => setShowPlan(!showPlan)}
                        >
                            {showPlan ? "Hide plan" : "Open plan"}
                        </span>
                    }
                >
                    Claude proposed a plan
                </TitleRow>
                {showPlan && p.input?.plan && (
                    <div className="rounded bg-alpha-1 px-lg py-md max-h-[40vh] overflow-y-auto">
                        <Prose text={p.input.plan} cwd={chat.cwd} />
                    </div>
                )}
                {revising && (
                    <TextArea
                        ref={fb}
                        rows={3}
                        aria-label="Plan feedback"
                        placeholder="What should change? (optional)"
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), reject(e.currentTarget.value));
                            if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setRevising(false));
                        }}
                    />
                )}
            </div>
            {revising ? (
                <div className="epitaxy-approval-actions flex flex-wrap justify-between gap-x-1 gap-y-[8px]">
                    <Button variant="secondary" onMouseDown={e => e.preventDefault()} onClick={() => setRevising(false)}>
                        Back
                    </Button>
                    <Button variant="primary" onMouseDown={e => e.preventDefault()} onClick={() => reject(fb.current?.value ?? "")}>
                        Revise
                    </Button>
                </div>
            ) : (
                <div className="epitaxy-approval-actions flex flex-wrap justify-between gap-x-1 gap-y-[8px] [&>div]:grow">
                    <div className="flex gap-[8px]">
                        <Button variant="secondary" onClick={() => reject("")}>
                            Reject
                        </Button>
                        <Button variant="secondary" shortcut="esc" onClick={() => setRevising(true)}>
                            Revise…
                        </Button>
                    </div>
                    <div className="flex flex-wrap justify-end gap-[8px]">
                        {forward !== "default" && (
                            <Button variant="secondary" shortcut="cmd+shift+enter" onClick={() => accept("default")}>
                                Accept
                            </Button>
                        )}
                        <div
                            ref={group}
                            data-cds="SplitDropdownButton"
                            role="group"
                            className="relative inline-flex w-fit shrink-0 items-stretch rounded group/split [&>button:first-child]:rounded-e-none [&>button:last-child]:rounded-s-none"
                        >
                            <Button variant="primary" squish={false} shortcut="cmd+enter" onClick={() => accept(forward)}>
                                {ACCEPT_LABEL[forward]}
                            </Button>
                            {options.length > 1 && (
                                <>
                                    <span aria-hidden="true" className="w-px shrink-0 self-stretch bg-alpha-3" />
                                    <Button
                                        ref={split}
                                        variant="primary"
                                        squish={false}
                                        iconOnly
                                        icon="CaretDown"
                                        iconSize="xs"
                                        aria-label="More accept options"
                                        aria-haspopup="menu"
                                        aria-expanded={menu}
                                        onClick={() => setMenu(!menu)}
                                    />
                                    <Menu open={menu} onClose={() => setMenu(false)} anchor={split} side="top" align="end">
                                        {options.map(m => (
                                            <MenuItem key={m} label={ACCEPT_LABEL[m]} danger={m === "bypassPermissions"} onSelect={() => accept(m)} />
                                        ))}
                                    </Menu>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ApprovalCard>
    );
}

// ---------------------------------------------------------------- AskUserQuestion (dock)
function QuestionCard({ chat, p, depth }: { chat: AgentChat; p: Permission; depth: number }) {
    const qs: any[] = p.input?.questions ?? [];
    const [i, setI] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
    const [sel, setSel] = useState<Record<number, Set<number>>>({});
    const [other, setOther] = useState<Record<number, string>>({});
    const [hl, setHl] = useState(0);
    const [collapsed, setCollapsed] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const armed = useArmed();
    const q = qs[i];
    const multi = !!q?.multiSelect;
    const chosen = sel[i] ?? new Set<number>();
    const otherIdx = q?.options?.length ?? 0;
    const has = chosen.size > 0;

    const finish = (ans: Record<string, string | string[]>) => answerPermission(chat.localId, p, { allow: true, updatedInput: { ...p.input, answers: ans } });
    const answerOf = (k: number) => {
        const s = sel[k] ?? new Set();
        const labels = [...s].sort().map(j => (j === qs[k].options.length ? other[k]?.trim() || "Something else" : qs[k].options[j].label));
        return qs[k].multiSelect ? labels : labels[0];
    };
    const next = (skip = false) => {
        const a = { ...answers, [q.question]: skip ? "[No preference]" : answerOf(i) };
        setAnswers(a);
        if (i >= qs.length - 1) finish(a);
        else (setI(i + 1), setHl(0));
    };
    const toggle = (j: number) =>
        setSel(s => {
            const cur = new Set(multi ? (s[i] ?? []) : []);
            cur.has(j) && multi ? cur.delete(j) : cur.add(j);
            return { ...s, [i]: cur };
        });
    const dismiss = () => finish(Object.fromEntries(qs.map(x => [x.question, "[User dismissed — do not proceed, wait for next instruction]"])));

    useEffect(() => {
        if (!qs.length) finish({});
        const onKey = (e: KeyboardEvent) => {
            if (collapsed || !armed() || e.repeat || !ownsKey(e, ref.current)) return;
            const typing = typingElsewhere(e);
            if (/^[1-9]$/.test(e.key) && !typing && !e.metaKey && !e.ctrlKey) {
                const j = Number(e.key) - 1;
                if (j <= otherIdx) (e.preventDefault(), toggle(j), setHl(j));
            } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !typing) {
                e.preventDefault();
                setHl(h => (e.key === "ArrowDown" ? (h + 1) % (otherIdx + 1) : (h - 1 + otherIdx + 1) % (otherIdx + 1)));
            } else if (e.key === "Enter" && !typing) {
                e.preventDefault();
                if (multi && !(e as any)[MOD]) toggle(hl);
                else if (has) next();
                else (toggle(hl), !multi && setTimeout(() => ref.current?.querySelector<HTMLButtonElement>("[data-approval-primary]")?.click(), 0));
            } else if (e.key === "Enter" && (e as any)[MOD] && has) (e.preventDefault(), next());
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });
    if (!q) return null;
    const rowClass = (j: number, selected: boolean) =>
        `flex items-center gap-sm rounded-[5px] px-md py-md text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus transition-[background-color] ${selected ? SEL : hl === j ? "bg-alpha-2" : "bg-alpha-1 hover:bg-alpha-2"}`;
    return (
        <div style={{ display: "contents" }} data-approval-card-root="">
            <ApprovalCard queueDepth={depth} ref={ref as any} data-collapsed={collapsed || undefined} tabIndex={0} className="outline-none" data-cds="AskUserQuestion">
                <div className={BODY}>
                    <TitleRow
                        leading={
                            qs.length > 1 && (
                                <span
                                    className="grid shrink-0 place-items-center rounded-full bg-warning px-sm text-caption tabular-nums text-warning"
                                    style={{ height: "var(--cds-leading-body)" }}
                                >
                                    {i + 1}/{qs.length}
                                </span>
                            )
                        }
                        trailing={
                            <span className="flex items-center gap-0.5">
                                <Button
                                    iconOnly
                                    icon="CaretRight"
                                    iconClassName={`transition-transform duration-fast motion-reduce:transition-none ${collapsed ? "" : "rotate-90"}`}
                                    aria-expanded={!collapsed}
                                    aria-label="View question options"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => setCollapsed(!collapsed)}
                                />
                                <Button iconOnly icon="X" aria-label="Dismiss question" onMouseDown={e => e.preventDefault()} onClick={dismiss} />
                            </span>
                        }
                    >
                        <span className="select-text whitespace-pre-wrap">{q.question}</span>
                    </TitleRow>
                    <ExpandingBody expanded={!collapsed}>
                        <div className="flex flex-col gap-0.75">
                            {q.options.map((o: any, j: number) => (
                                <button
                                    key={j}
                                    type="button"
                                    aria-pressed={multi ? chosen.has(j) : undefined}
                                    className={rowClass(j, chosen.has(j))}
                                    onMouseEnter={() => setHl(j)}
                                    onClick={() => toggle(j)}
                                >
                                    <div className="flex flex-col gap-0.5 min-w-0 flex-1 select-text">
                                        <div className="text-body text-primary">{o.label}</div>
                                        {o.description && <div className="text-footnote text-muted whitespace-pre-wrap">{o.description}</div>}
                                        {o.preview && chosen.has(j) && <pre className="mt-1 rounded bg-alpha-1 p-xs text-code text-secondary whitespace-pre-wrap">{o.preview}</pre>}
                                    </div>
                                    {multi ? (
                                        <span data-size="sm" className="flex shrink-0">
                                            <Checkbox checked={chosen.has(j)} />
                                        </span>
                                    ) : (
                                        <span className="pointer-events-none flex pointer-coarse:hidden">
                                            <Shortcut keys={String(j + 1)} />
                                        </span>
                                    )}
                                </button>
                            ))}
                            <div
                                className={`flex flex-col gap-[12px] rounded-[5px] px-md py-md ${chosen.has(otherIdx) ? SEL : hl === otherIdx ? "bg-alpha-2" : "bg-alpha-1 hover:bg-alpha-2"}`}
                            >
                                <button
                                    type="button"
                                    aria-pressed={multi ? chosen.has(otherIdx) : undefined}
                                    onClick={() => toggle(otherIdx)}
                                    className="flex items-center gap-sm text-body text-primary text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus"
                                >
                                    <span className="flex-1 select-text">Other</span>
                                    {multi ? (
                                        <span data-size="sm" className="flex shrink-0">
                                            <Checkbox checked={chosen.has(otherIdx)} />
                                        </span>
                                    ) : (
                                        <span className="pointer-events-none flex pointer-coarse:hidden">
                                            <Shortcut keys={String(otherIdx + 1)} />
                                        </span>
                                    )}
                                </button>
                                <TextArea
                                    tabIndex={chosen.has(otherIdx) ? 0 : -1}
                                    rows={1}
                                    autosize
                                    aria-label="Other option"
                                    placeholder="Type your own answer here"
                                    style={{ maxHeight: "calc(4lh + 2 * var(--cds-pad-sm))" }}
                                    value={other[i] ?? ""}
                                    onFocus={() => !chosen.has(otherIdx) && toggle(otherIdx)}
                                    onChange={e => setOther(o => ({ ...o, [i]: e.target.value }))}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), next())}
                                />
                            </div>
                        </div>
                    </ExpandingBody>
                </div>
                <ExpandingBody expanded={!collapsed}>
                    <div className="flex items-center justify-end gap-[8px]">
                        {i > 0 && (
                            <Button variant="secondary" className="mr-auto" onClick={() => setI(i - 1)}>
                                Back
                            </Button>
                        )}
                        <Button variant="secondary" onClick={() => next(true)}>
                            Skip
                        </Button>
                        <Button variant="primary" data-approval-primary="" disabled={!has} onClick={() => next()}>
                            {i >= qs.length - 1 ? "Submit" : "Next"}
                        </Button>
                    </div>
                </ExpandingBody>
            </ApprovalCard>
        </div>
    );
}

// ---------------------------------------------------------------- MCP elicitation / CLI dialog
function RequestCard({ chat, q, depth }: { chat: AgentChat; q: PendingRequest; depth: number }) {
    const d = q.data ?? {};
    const [values, setValues] = useState<Record<string, any>>({});
    const props: Record<string, any> = (d.requestedSchema as any)?.properties ?? {};
    const required: string[] = (d.requestedSchema as any)?.required ?? [];
    const verdict = props.verdict?.enum as string[] | undefined;
    const ref = useRef<HTMLDivElement>(null);
    const armed = useArmed();
    // Esc declines, ⌘↵ accepts (with the form's values once required fields are filled)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.repeat || !armed() || !ownsKey(e, ref.current)) return;
            const dialog = q.kind === "dialog";
            if (e.key === "Escape" && !typingElsewhere(e)) {
                e.preventDefault();
                e.stopPropagation();
                answerRequest(chat.localId, q, dialog ? { behavior: "cancelled" } : { action: "decline" });
            } else if (e.key === "Enter" && (e as any)[MOD]) {
                if (!dialog && d.mode !== "url" && required.some(k => values[k] == null || values[k] === "")) return;
                e.preventDefault();
                answerRequest(
                    chat.localId,
                    q,
                    dialog
                        ? { behavior: "completed", result: { confirmed: true } }
                        : verdict?.includes("allow")
                          ? { action: "accept", content: { verdict: "allow" } }
                          : { action: "accept", ...(Object.keys(values).length ? { content: values } : {}) },
                );
            }
        };
        window.addEventListener("keydown", onKey, true);
        ref.current?.focus({ preventScroll: true });
        return () => window.removeEventListener("keydown", onKey, true);
    }, [q.requestId, values]);
    if (q.kind === "dialog")
        return (
            <ApprovalCard queueDepth={depth} ref={ref as any} tabIndex={-1} className="outline-none">
                <div className={BODY}>
                    <TitleRow subtitle={String(d.dialogKind ?? "")}>Claude Code needs your input</TitleRow>
                    <div className={DETAIL}>{JSON.stringify(d.payload ?? {}, null, 2)}</div>
                </div>
                <div className="epitaxy-approval-actions flex flex-wrap justify-between gap-x-md gap-y-sm">
                    <Button variant="secondary" onClick={() => answerRequest(chat.localId, q, { behavior: "cancelled" })}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={() => answerRequest(chat.localId, q, { behavior: "completed", result: { confirmed: true } })}>
                        Continue
                    </Button>
                </div>
            </ApprovalCard>
        );
    const respond = (action: "accept" | "decline" | "cancel", content?: any) => answerRequest(chat.localId, q, { action, ...(content ? { content } : {}) });
    const title = d.title ?? d.displayName ?? d.serverName;
    if (verdict?.includes("allow"))
        return (
            <ApprovalCard queueDepth={depth} ref={ref as any} tabIndex={-1} className="outline-none">
                <div className={BODY}>
                    <TitleRow subtitle={d.message ?? d.description}>
                        Allow Claude to use <B>{title}</B>?
                    </TitleRow>
                </div>
                <div className="flex flex-wrap gap-x-md gap-y-sm items-start justify-between epitaxy-approval-actions">
                    <Button variant="secondary" shortcut="esc" onClick={() => respond("decline")}>
                        Deny
                    </Button>
                    <div className="flex min-w-0 flex-wrap gap-sm items-start">
                        {verdict.includes("always_allow") && (
                            <Button variant="secondary" onClick={() => respond("accept", { verdict: "always_allow" })}>
                                Always allow
                            </Button>
                        )}
                        <Button variant="primary" onClick={() => respond("accept", { verdict: "allow" })}>
                            Allow once
                        </Button>
                    </div>
                </div>
            </ApprovalCard>
        );
    const valid = required.every(k => values[k] !== undefined && values[k] !== "");
    return (
        <ApprovalCard queueDepth={depth} ref={ref as any} tabIndex={-1} className="outline-none">
            <div className={BODY}>
                <TitleRow subtitle={d.description}>
                    <B>{title}</B> is asking for input
                </TitleRow>
                {d.message && <p className="text-body text-secondary select-text break-words">{d.message}</p>}
                {d.mode === "url" && d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className={DETAIL + " underline"}>
                        {d.url}
                    </a>
                )}
                {Object.entries(props).map(([k, sch]: [string, any]) => (
                    <label key={k} className="flex flex-col gap-1">
                        <span className="text-footnote text-muted">
                            {sch.title ?? k}
                            {required.includes(k) ? " *" : ""}
                        </span>
                        {sch.enum ? (
                            <div className="flex flex-wrap gap-xs">
                                {sch.enum.map((opt: string, i: number) => (
                                    <Button key={opt} variant={values[k] === opt ? "primary" : "secondary"} onClick={() => setValues(v => ({ ...v, [k]: opt }))}>
                                        {sch.enumNames?.[i] ?? opt}
                                    </Button>
                                ))}
                            </div>
                        ) : sch.type === "boolean" ? (
                            <Button variant="secondary" pressed={!!values[k]} onClick={() => setValues(v => ({ ...v, [k]: !v[k] }))}>
                                {values[k] ? "Yes" : "No"}
                            </Button>
                        ) : (
                            <TextArea
                                rows={1}
                                autosize
                                placeholder={sch.description ?? ""}
                                value={values[k] ?? ""}
                                onChange={e => setValues(v => ({ ...v, [k]: sch.type === "number" || sch.type === "integer" ? Number(e.target.value) : e.target.value }))}
                            />
                        )}
                        {sch.description && sch.enum && <span className="text-footnote text-muted">{sch.description}</span>}
                    </label>
                ))}
            </div>
            <div className="epitaxy-approval-actions flex flex-wrap justify-between gap-x-md gap-y-sm">
                <Button variant="secondary" onClick={() => respond("decline")}>
                    Decline
                </Button>
                <Button variant="primary" disabled={!valid} onClick={() => respond("accept", d.mode === "url" ? undefined : values)}>
                    {d.mode === "url" ? "Done" : "Submit"}
                </Button>
            </div>
        </ApprovalCard>
    );
}

export { Icon };
