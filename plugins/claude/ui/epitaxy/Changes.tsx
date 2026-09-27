// Git: the branch/PR bar above the composer and the Changes pane (diffs, commit, push, PR).
import { N } from "../native";
import { useCallback, useEffect, useState } from "react";
import { useAgents, sendPrompt, type AgentChat } from "../store";
import { Button } from "../cds/Button";
import { Icon, type IconName } from "../cds/Icon";
import { TextArea, Checkbox } from "../cds/Controls";
import { FileDiff, FileCode, langFromPath } from "./Diffs";
import { Caret, DiffCounts, ExpandingBody, Spinner } from "./primitives";

const G = () => N().git;

export interface GitFile {
    path: string;
    staged: boolean;
    kind: "modified" | "added" | "deleted" | "renamed" | "untracked";
    adds?: number;
    dels?: number;
}
export interface GitStatus {
    repo: boolean;
    root?: string;
    branch?: string;
    files?: GitFile[];
    ahead?: number;
    behind?: number;
    hasUpstream?: boolean;
    remote?: string | null;
}

// status refreshes when a turn ends, when the window regains focus, and on demand
export function useGit(chat: AgentChat) {
    const [st, setSt] = useState<GitStatus | null>(null);
    const [pr, setPr] = useState<any>(null);
    const turns = useAgents(s => s.runtimes[chat.localId]?.items.filter(x => x.kind === "result").length ?? 0);
    const refresh = useCallback(async () => {
        try {
            const s = await G().status(chat.cwd);
            setSt(s);
            if (s.repo && s.remote && /github/.test(s.remote))
                G()
                    .prView(chat.cwd)
                    .then(setPr, () => setPr(null));
        } catch {
            setSt({ repo: false });
        }
    }, [chat.cwd]);
    useEffect(() => {
        refresh();
    }, [refresh, turns]);
    useEffect(() => {
        const f = () => refresh();
        window.addEventListener("focus", f);
        window.addEventListener("evi-claude:git-refresh", f);
        return () => (window.removeEventListener("focus", f), window.removeEventListener("evi-claude:git-refresh", f));
    }, [refresh]);
    return { st, pr, refresh };
}

const ROW = "flex items-center gap-[5px] w-full min-h-[40px] p-[8px] rounded-[10px] bg-alpha-1";
export function BranchBar({ chat, onOpenChanges }: { chat: AgentChat; onOpenChanges: () => void }) {
    const { st, pr } = useGit(chat);
    const busy = useAgents(s => s.runtimes[chat.localId]?.busy);
    if (!st?.repo) return null;
    const files = st.files ?? [];
    const adds = files.reduce((a, f) => a + (f.adds ?? 0), 0);
    const dels = files.reduce((a, f) => a + (f.dels ?? 0), 0);
    if (!files.length && !st.ahead && !pr) return null;
    return (
        <nav aria-label="Repository and pull request controls" className="scroll-fade-y flex max-h-[50vh] flex-col overflow-y-auto overscroll-contain empty:hidden gap-xs">
            <div className={`${ROW} px-md`}>
                <Icon name="GitBranch" size="sm" className="shrink-0 text-secondary" />
                <span className="text-body-medium text-primary truncate min-w-0 shrink">{st.branch}</span>
                {files.length > 0 && (
                    <span className="flex items-center gap-xs text-body text-muted shrink-0">
                        <span>
                            · {files.length} change{files.length === 1 ? "" : "s"}
                        </span>
                        {(adds > 0 || dels > 0) && <DiffCounts adds={adds} dels={dels} />}
                    </span>
                )}
                {!!st.ahead && <span className="text-body text-muted shrink-0">· {st.ahead} unpushed</span>}
                {!!st.behind && <span className="text-body text-muted shrink-0">· {st.behind} behind</span>}
                {pr && (
                    <a href={pr.url} target="_blank" rel="noreferrer" className="flex items-center gap-xs text-body text-secondary hover:text-primary shrink-0" title={pr.title}>
                        <Icon
                            name={
                                pr.state === "MERGED" ? "GitMergedSimple" : pr.state === "CLOSED" ? "GitPullRequestClosed" : pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"
                            }
                            size="sm"
                        />
                        #{pr.number}
                    </a>
                )}
                <span className="ms-auto flex items-center gap-xs shrink-0">
                    {files.length > 0 && (
                        <Button variant="ghost" onClick={onOpenChanges}>
                            Review
                        </Button>
                    )}
                    {files.length > 0 && (
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                                sendPrompt(
                                    chat,
                                    "Commit the current changes with a clear, conventional commit message. Group unrelated changes into separate commits if it makes sense.",
                                )
                            }
                        >
                            Commit
                        </Button>
                    )}
                    {!files.length && !!st.ahead && (
                        <Button
                            variant="secondary"
                            onClick={() =>
                                G()
                                    .push(chat.cwd)
                                    .then(() => window.dispatchEvent(new Event("evi-claude:git-refresh")))
                            }
                        >
                            Push
                        </Button>
                    )}
                </span>
            </div>
        </nav>
    );
}

const KIND: Record<GitFile["kind"], { icon: IconName; label: string; cls: string }> = {
    modified: { icon: "Edit", label: "M", cls: "text-accent" },
    added: { icon: "FileAdd", label: "A", cls: "text-git-added" },
    untracked: { icon: "FileAdd", label: "U", cls: "text-git-added" },
    deleted: { icon: "Trash", label: "D", cls: "text-git-removed" },
    renamed: { icon: "ArrowRight", label: "R", cls: "text-accent" },
};

// "checks passing / failing / running" from gh's statusCheckRollup
function checksLabel(pr: any): string | null {
    const c: any[] = pr?.statusCheckRollup ?? [];
    if (!c.length) return null;
    const state = (x: any) => String(x.conclusion || x.state || x.status || "").toUpperCase();
    if (c.some(x => /FAIL|ERROR|CANCELLED|TIMED_OUT/.test(state(x)))) return "checks failing";
    if (c.some(x => /PENDING|IN_PROGRESS|QUEUED|EXPECTED/.test(state(x)))) return "checks running";
    return "checks passing";
}

export function ChangesPane({ chat, onClose }: { chat: AgentChat; onClose: () => void }) {
    const { st, pr, refresh } = useGit(chat);
    const [msg, setMsg] = useState("");
    const [working, setWorking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(new Set()); // files left out of the next commit
    const files = st?.files ?? [];
    const picked = excluded.size ? files.filter(f => !excluded.has(f.path)).map(f => f.path) : undefined;
    const toggle = (p: string) => setExcluded(x => (x.has(p) ? (x.delete(p), new Set(x)) : new Set(x.add(p))));
    const act = async (label: string, fn: () => Promise<any>) => {
        setWorking(label);
        setError(null);
        const r = await fn().catch((e: any) => ({ ok: false, stderr: String(e) }));
        setWorking(null);
        if (r && r.ok === false) setError((r.stderr || r.stdout || "Failed").trim().slice(0, 600));
        refresh();
        return r;
    };
    return (
        <aside
            className="flex flex-col min-h-0 h-full shrink-0"
            style={{ width: "min(520px, 45%)", borderLeft: "1px solid var(--cds-border)", background: "var(--cds-surface-1)" }}
            aria-label="Changes"
        >
            <div className="flex items-center gap-xs h-[calc(2rem*var(--cds-rem-scale,1))] px-md shrink-0">
                <Icon name="ChangesPlusMinus" size="sm" className="text-secondary" />
                <span className="text-body-medium text-primary">Changes</span>
                {st?.branch && <span className="text-footnote text-muted truncate">on {st.branch}</span>}
                <span className="ms-auto flex items-center gap-0.5">
                    <Button iconOnly icon="ArrowClockwise" aria-label="Refresh" title="Refresh" onClick={refresh} />
                    <Button iconOnly icon="X" aria-label="Close changes" title="Close" onClick={onClose} />
                </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-fade-y px-md pb-md flex flex-col gap-xs">
                {!st && (
                    <div className="flex items-center gap-xs text-footnote text-muted py-md">
                        <Spinner /> Loading…
                    </div>
                )}
                {st && !st.repo && <div className="text-body text-muted py-md">This folder isn’t a git repository.</div>}
                {st?.repo && !files.length && <div className="text-body text-muted py-md">No uncommitted changes.</div>}
                {files.map(f => (
                    <ChangedFile
                        key={f.path}
                        chat={chat}
                        f={f}
                        root={st!.root!}
                        included={!excluded.has(f.path)}
                        onToggle={() => toggle(f.path)}
                        onDiscard={() =>
                            confirm(f.kind === "untracked" ? `Move ${f.path} to the Trash?` : `Discard your changes to ${f.path}?`) &&
                            act("Discarding", () => G().discard(chat.cwd, f.path))
                        }
                    />
                ))}
            </div>
            {st?.repo && (
                <div className="shrink-0 flex flex-col gap-sm p-md" style={{ borderTop: "1px solid var(--cds-border)" }}>
                    {error && <div className="text-footnote text-danger whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{error}</div>}
                    {files.length > 0 && <TextArea rows={2} autosize placeholder="Commit message" aria-label="Commit message" value={msg} onChange={e => setMsg(e.target.value)} />}
                    <div className="flex flex-wrap items-center gap-xs">
                        {files.length > 0 && (
                            <>
                                <Button
                                    variant="primary"
                                    busy={working === "Committing"}
                                    disabled={!msg.trim() || !!working || picked?.length === 0}
                                    onClick={() => act("Committing", () => G().commit(chat.cwd, msg.trim(), picked)).then(r => r?.ok && setMsg(""))}
                                >
                                    {picked ? `Commit ${picked.length} of ${files.length}` : "Commit"}
                                </Button>
                                <Button
                                    variant="secondary"
                                    disabled={!msg.trim() || !!working}
                                    onClick={async () => {
                                        const r = await act("Committing", () => G().commit(chat.cwd, msg.trim(), picked));
                                        if (r?.ok) (setMsg(""), act("Pushing", () => G().push(chat.cwd)));
                                    }}
                                >
                                    Commit & push
                                </Button>
                                <Button variant="ghost" disabled={!!working} onClick={() => sendPrompt(chat, "Write a commit message for the current changes and commit them.")}>
                                    Ask Claude
                                </Button>
                            </>
                        )}
                        {!files.length && !!st.ahead && (
                            <Button variant="primary" busy={working === "Pushing"} onClick={() => act("Pushing", () => G().push(chat.cwd))}>
                                Push {st.ahead} commit{st.ahead === 1 ? "" : "s"}
                            </Button>
                        )}
                        {!pr && st.remote && /github/.test(st.remote) && st.branch && (
                            <>
                                <Button
                                    variant="secondary"
                                    disabled={!!working || /^(main|master)$/.test(st.branch) || !!files.length}
                                    title={
                                        /^(main|master)$/.test(st.branch)
                                            ? "Already on the base branch"
                                            : files.length
                                              ? "Commit your changes first"
                                              : "Push this branch and open a pull request (title and description from the commits)"
                                    }
                                    busy={working === "Creating PR"}
                                    onClick={() => act("Creating PR", () => G().pr(chat.cwd, "", "", false))}
                                >
                                    Create PR
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled={!!working || /^(main|master)$/.test(st.branch) || !!files.length}
                                    busy={working === "Creating draft PR"}
                                    onClick={() => act("Creating draft PR", () => G().pr(chat.cwd, "", "", true))}
                                >
                                    Draft
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled={!!working}
                                    onClick={() => sendPrompt(chat, "Push this branch and open a GitHub pull request for it with gh. Write a clear title and description.")}
                                >
                                    Ask Claude
                                </Button>
                            </>
                        )}
                        {pr && (
                            <>
                                <a className="text-footnote text-secondary hover:text-primary" href={pr.url} target="_blank" rel="noreferrer">
                                    PR #{pr.number} · {pr.isDraft ? "draft" : String(pr.state).toLowerCase()}
                                    {checksLabel(pr) && ` · ${checksLabel(pr)}`}
                                    {pr.reviewDecision && ` · ${String(pr.reviewDecision).toLowerCase().replace(/_/g, " ")}`}
                                </a>
                                {pr.state === "OPEN" && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={!!working}
                                        onClick={() => act(pr.isDraft ? "Marking ready" : "Converting to draft", () => G().prReady(chat.cwd, pr.isDraft))}
                                    >
                                        {pr.isDraft ? "Mark ready" : "Convert to draft"}
                                    </Button>
                                )}
                                {checksLabel(pr) && (
                                    <a className="text-footnote text-secondary hover:text-primary" href={`${pr.url}/checks`} target="_blank" rel="noreferrer">
                                        Checks
                                    </a>
                                )}
                                {pr.state === "OPEN" && !pr.isDraft && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={!!working}
                                        title="gh pr merge --auto --squash: merges once checks and reviews pass"
                                        onClick={() => confirm(`Merge PR #${pr.number} when it's ready (squash)?`) && act("Enabling auto-merge", () => G().prMerge(chat.cwd))}
                                    >
                                        Merge when ready
                                    </Button>
                                )}
                            </>
                        )}
                        {working && <span className="text-footnote text-muted">{working}…</span>}
                    </div>
                </div>
            )}
        </aside>
    );
}

function ChangedFile({
    chat,
    f,
    root,
    onDiscard,
    included,
    onToggle,
}: {
    chat: AgentChat;
    f: GitFile;
    root: string;
    onDiscard: () => void;
    included: boolean;
    onToggle: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [diff, setDiff] = useState<{ old: string; new: string } | null>(null);
    useEffect(() => {
        if (open && !diff) G().fileDiff(chat.cwd, f.path).then(setDiff);
    }, [open]);
    const k = KIND[f.kind];
    const name = f.path.split("/").pop();
    const dir = f.path.split("/").slice(0, -1).join("/");
    return (
        <div className="flex flex-col group/body">
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(!open)}
                onKeyDown={e => e.key === "Enter" && setOpen(!open)}
                className="flex items-center gap-xs rounded px-xs py-1 hover:bg-fill-ghost-hover cursor-pointer min-w-0"
            >
                <span
                    role="checkbox"
                    aria-checked={included}
                    aria-label={`Include ${name} in the commit`}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={e => (e.stopPropagation(), onToggle())}
                    onKeyDown={e => (e.key === " " || e.key === "Enter") && (e.preventDefault(), e.stopPropagation(), onToggle())}
                >
                    <Checkbox checked={included} />
                </span>
                <Caret expanded={open} colorClassName="text-muted" />
                <span className={`text-footnote font-medium w-[12px] shrink-0 ${k.cls}`} title={f.staged ? `${f.kind} · staged` : f.kind}>
                    {k.label}
                </span>
                <span className="text-body text-primary truncate shrink-0 max-w-[60%]">{name}</span>
                {dir && <span className="text-footnote text-muted truncate min-w-0">{dir}</span>}
                <span className="ms-auto flex items-center gap-xs shrink-0">
                    {(f.adds != null || f.dels != null) && <DiffCounts adds={f.adds ?? 0} dels={f.dels ?? 0} />}
                    <span className="opacity-0 group-hover/body:opacity-100" onClick={e => e.stopPropagation()}>
                        <Button iconOnly size="xs" icon="ArrowCounterClockwise" aria-label={`Discard changes to ${name}`} title="Discard changes" onClick={onDiscard} />
                    </span>
                    <span onClick={e => e.stopPropagation()}>
                        <Button iconOnly size="xs" icon="ArrowOutSquare" aria-label="Open file" title="Open file" onClick={() => N().agents.openPath(`${root}/${f.path}`)} />
                    </span>
                </span>
            </div>
            <ExpandingBody expanded={open}>
                <div
                    className="epitaxy-diff epitaxy-code-card rounded-lg overflow-clip my-xs overflow-y-auto"
                    style={{ maxHeight: 480, background: "light-dark(#fff, #1a1a19)", boxShadow: "0 0 0 1px var(--cds-border)" }}
                >
                    {!diff ? (
                        <div className="p-md text-footnote text-muted">Loading diff…</div>
                    ) : f.kind === "untracked" || f.kind === "added" ? (
                        <FileCode code={diff.new} lang={langFromPath(f.path)} sided="added" />
                    ) : f.kind === "deleted" ? (
                        <FileCode code={diff.old} lang={langFromPath(f.path)} sided="removed" />
                    ) : (
                        <FileDiff oldText={diff.old} newText={diff.new} lang={langFromPath(f.path)} />
                    )}
                </div>
            </ExpandingBody>
        </div>
    );
}
