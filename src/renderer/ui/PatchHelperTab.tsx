/**
 * Develop a source patch live against Discord's real code: see which modules the find hits, what the
 * match catches, the code before and after, and whether the patched module still compiles.
 */
import type { ReactNode } from "react";

import { moduleSources } from "../patching/diagnose";
import { evaluatePatch, Excerpt, PatchDraft, PatchHelperResult } from "../patching/helper";
import { React } from "../webpack/common";
import { Button, Status, TextField } from "./components";

/** Scanning every module isn't free, wait for a typing pause */
const DEBOUNCE_MS = 250;
const MAX_LISTED_MODULES = 20;

// Kept outside the component so the draft survives switching tabs and closing the panel
const draft: PatchDraft = { find: "", match: "", replace: "" };

function Code({ label, excerpt, kind }: { label: string; excerpt: Excerpt; kind?: "removed" | "added"; }) {
    return (
        <figure className="dl-code-figure">
            <figcaption className="dl-code-label">{label}</figcaption>
            <pre className="dl-code">
                {excerpt.clippedStart && "…"}
                {excerpt.lead}
                <mark data-kind={kind} data-empty={excerpt.mark ? undefined : ""}>{excerpt.mark}</mark>
                {excerpt.tail}
                {excerpt.clippedEnd && "…"}
            </pre>
        </figure>
    );
}

function ResultCard({ id, title, status, children }: { id: string; title: string; status: ReactNode; children?: ReactNode; }) {
    return (
        <section className="dl-card" id={id} aria-labelledby={`${id}-title`}>
            <div className="dl-card-head" style={{ alignItems: "center" }}>
                <h3 className="dl-card-title" id={`${id}-title`} style={{ flex: 1 }}>{title}</h3>
                {status}
            </div>
            {children && <div className="dl-card-body">{children}</div>}
        </section>
    );
}

function ModuleCard({ result, scanned, onPick }: { result: PatchHelperResult; scanned: number; onPick(id: string): void; }) {
    const { candidates, moduleId, errors } = result;
    if (errors.find) {
        return (
            <ResultCard id="dl-ph-modules" title="Module" status={<Status tone="danger">Invalid regex</Status>}>
                <pre className="dl-error">{errors.find}</pre>
            </ResultCard>
        );
    }

    const status = candidates.length === 0
        ? <Status tone="danger">No module matches</Status>
        : candidates.length === 1
            ? <Status tone="success">1 module</Status>
            : <Status tone="warning">{candidates.length} modules</Status>;

    return (
        <ResultCard id="dl-ph-modules" title="Module" status={status}>
            {candidates.length === 0 && (
                <p className="dl-hint">None of the {scanned.toLocaleString()} modules Discord has registered contain this. Check for typos, or open the part of Discord that uses the code so its chunk loads.</p>
            )}
            {candidates.length === 1 && <p className="dl-hint dl-mono">Module {moduleId}</p>}
            {candidates.length > 1 && (
                <>
                    <p className="dl-hint">The find should match exactly one module, make it more specific. Showing results for the selected one.</p>
                    <div className="dl-chips" role="group" aria-label="Matching modules">
                        {candidates.slice(0, MAX_LISTED_MODULES).map(id => (
                            <button key={id} type="button" className="dl-chip dl-mono" aria-pressed={id === moduleId} onClick={() => onPick(id)}>{id}</button>
                        ))}
                        {candidates.length > MAX_LISTED_MODULES && <span className="dl-hint">and {candidates.length - MAX_LISTED_MODULES} more</span>}
                    </div>
                </>
            )}
        </ResultCard>
    );
}

function MatchCard({ result, hasMatch }: { result: PatchHelperResult; hasMatch: boolean; }) {
    let status: ReactNode;
    if (result.errors.match) status = <Status tone="danger">Invalid regex</Status>;
    else if (!hasMatch) status = <Status tone="muted">Enter a match</Status>;
    else if (!result.matchCount) status = <Status tone="danger">Matched nothing</Status>;
    else status = <Status tone="success">{result.matchCount === 1 ? "Matched once" : `Matched ${result.matchCount} times`}</Status>;

    return (
        <ResultCard id="dl-ph-match" title="Match" status={status}>
            {result.errors.match && <pre className="dl-error">{result.errors.match}</pre>}
            {result.match && <Code label={result.matchCount > 1 ? "First match" : "Matched code"} excerpt={result.match} />}
            {result.groups.length > 0 && (
                <dl className="dl-groups dl-mono">
                    {result.groups.map((g, i) => (
                        <div key={i}><dt>${i + 1}</dt><dd>{g === undefined ? "(no match)" : JSON.stringify(g)}</dd></div>
                    ))}
                </dl>
            )}
        </ResultCard>
    );
}

function ResultChangeCard({ result }: { result: PatchHelperResult; }) {
    if (!result.changed) {
        return (
            <ResultCard id="dl-ph-result" title="Result" status={<Status tone="danger">No change</Status>}>
                <p className="dl-hint">The replacement produces the same code. Delight reports this as a failed replacement.</p>
            </ResultCard>
        );
    }
    const { compile } = result;
    const status = compile?.ok
        ? <Status tone="success">Compiles</Status>
        : <Status tone="danger">Doesn’t compile</Status>;
    return (
        <ResultCard id="dl-ph-result" title="Result" status={status}>
            <div className="dl-diff">
                {result.before && <Code label="Before" excerpt={result.before} kind="removed" />}
                {result.after && <Code label="After" excerpt={result.after} kind="added" />}
            </div>
            {compile && !compile.ok && (
                <pre className="dl-error">{compile.error}{"\n"}Delight would revert this patch.</pre>
            )}
        </ResultCard>
    );
}

function SnippetCard({ snippet }: { snippet: string; }) {
    const [copied, setCopied] = React.useState(false);
    React.useEffect(() => setCopied(false), [snippet]);
    React.useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);

    const copy = () => navigator.clipboard.writeText(snippet).then(() => setCopied(true), () => { });

    return (
        <ResultCard
            id="dl-ph-snippet"
            title="Patch"
            status={<Button onClick={copy}>{copied ? "Copied" : "Copy patch"}</Button>}
        >
            <p className="dl-hint">Add this to your plugin’s <code className="dl-mono">patches</code> array.</p>
            <pre className="dl-code">{snippet}</pre>
            <span className="dl-sr-only" role="status">{copied ? "Patch copied to clipboard" : ""}</span>
        </ResultCard>
    );
}

export function PatchHelperTab() {
    const [input, setInput] = React.useState<PatchDraft>(() => ({ ...draft }));
    const [preferred, setPreferred] = React.useState<string>();
    const [state, setState] = React.useState<{ result: PatchHelperResult; scanned: number; } | null>(null);
    const [checking, setChecking] = React.useState(false);

    React.useEffect(() => {
        Object.assign(draft, input);
        if (!input.find) {
            setState(null);
            setChecking(false);
            return;
        }
        setChecking(true);
        const t = setTimeout(() => {
            const sources = moduleSources();
            setState({ result: evaluatePatch(input, sources, preferred), scanned: sources.length });
            setChecking(false);
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [input.find, input.match, input.replace, preferred]);

    const field = (key: keyof PatchDraft) => (value: string) => setInput(prev => ({ ...prev, [key]: value }));
    const result = state?.result;

    return (
        <div className="dl-stack" style={{ gap: 16 }}>
            <div className="dl-ph-fields dl-stack" style={{ gap: 16 }}>
                <TextField
                    id="dl-ph-find"
                    label="Find"
                    description="Text that only the target module contains. Write /…/flags for a regex."
                    placeholder="Object.defineProperties(this,{isDeveloper"
                    value={input.find}
                    onChange={field("find")}
                />
                <TextField
                    id="dl-ph-match"
                    label="Match"
                    description="What to replace in that module, text or /…/flags. \i matches any identifier."
                    placeholder="/(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/"
                    value={input.match}
                    onChange={field("match")}
                />
                <TextField
                    id="dl-ph-replace"
                    label="Replace with"
                    description="$1 inserts a capture group, $& the whole match, $self your plugin."
                    placeholder="true"
                    value={input.replace}
                    onChange={field("replace")}
                />
            </div>

            <p className="dl-hint" role="status" aria-live="polite">
                {!input.find ? "" : checking || !state ? "Checking…" : `Checked ${state.scanned.toLocaleString()} modules.`}
            </p>

            {!input.find ? (
                <div className="dl-empty">
                    <strong>Try a patch against Discord’s code</strong>
                    Enter a find to see which module it hits. Nothing is applied, it’s a preview.
                </div>
            ) : result && (
                <div className="dl-stack" aria-busy={checking} data-checking={checking ? "" : undefined}>
                    <ModuleCard result={result} scanned={state.scanned} onPick={setPreferred} />
                    {result.moduleId && <MatchCard result={result} hasMatch={!!input.match} />}
                    {result.matchCount > 0 && <ResultChangeCard result={result} />}
                    {result.snippet && <SnippetCard snippet={result.snippet} />}
                </div>
            )}
        </div>
    );
}
