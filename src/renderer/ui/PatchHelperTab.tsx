/**
 * Develop a source patch live against Discord's real code: see which modules the find hits, what the
 * match catches, the code before and after, and whether the patched module still compiles.
 */
import { hotfixDraft } from "@shared/hotfixes";
import type { ReactNode } from "react";

import { moduleSources } from "../patching/diagnose";
import { evaluatePatch, Excerpt, parsePatchValue, PatchDraft, PatchHelperResult } from "../patching/helper";
import { getPatchRecords } from "../patching/source";
import { PluginManager } from "../plugins/manager";
import { React } from "../webpack/common";
import { ApiText } from "./ApiText";
import { Button, Dropdown, EmptyState, Section, Status, Text, TextField } from "./components";

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
                <ApiText text={excerpt.lead} />
                <mark data-kind={kind} data-empty={excerpt.mark ? undefined : ""}><ApiText text={excerpt.mark} /></mark>
                <ApiText text={excerpt.tail} />
                {excerpt.clippedEnd && "…"}
            </pre>
        </figure>
    );
}

function ResultCard({ id, title, status, children }: { id: string; title: string; status: ReactNode; children?: ReactNode; }) {
    return (
        <section className="dl-card" id={id} aria-labelledby={`${id}-title`}>
            <div className="dl-card-head">
                <Text tag="h3" variant="heading-md/medium" color="text-strong" id={`${id}-title`} className="dl-grow">{title}</Text>
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
                <p className="dl-hint">The replacement produces the same code. Evi reports this as a failed replacement.</p>
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
                <pre className="dl-error">{compile.error}{"\n"}Evi would revert this patch.</pre>
            )}
        </ResultCard>
    );
}

/** Copies `text`, and says so for a moment: the icon swaps to a check, and screen readers hear `done` */
function useCopy(text: string) {
    const [copied, setCopied] = React.useState(false);
    React.useEffect(() => setCopied(false), [text]);
    React.useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);

    // Only animate the icon once it actually swaps, not when the card first appears
    const swapped = React.useRef(false);
    const copy = () => navigator.clipboard.writeText(text).then(() => {
        swapped.current = true;
        setCopied(true);
    }, () => { });
    return { copied, copy, className: swapped.current ? "dl-icon-swap" : undefined };
}

function SnippetCard({ snippet }: { snippet: string; }) {
    const { copied, copy, className } = useCopy(snippet);
    return (
        <ResultCard
            id="dl-ph-snippet"
            title="Patch"
            status={<Button icon={copied ? "check" : "copy"} className={className} onClick={copy}>{copied ? "Copied" : "Copy patch"}</Button>}
        >
            <p className="dl-hint">Add this to your plugin’s <code className="dl-mono">patches</code> array.</p>
            <pre className="dl-code"><ApiText text={snippet} /></pre>
            <span className="dl-sr-only" role="status">{copied ? "Patch copied to clipboard" : ""}</span>
        </ResultCard>
    );
}

/** The draft as a hotfix for the patch it's fixing (shared/hotfixes.ts), for Evi's team to publish */
function HotfixCard({ json }: { json: string; }) {
    const { copied, copy, className } = useCopy(json);
    return (
        <ResultCard
            id="dl-ph-hotfix"
            title="Hotfix"
            status={<Button icon={copied ? "check" : "copy"} className={className} onClick={copy}>{copied ? "Copied" : "Copy as hotfix"}</Button>}
        >
            <p className="dl-hint">For Evi’s team: paste it into Hotfixes on evi.rest, write the note people see, and publish. Every install on this version gets the fix within minutes.</p>
            <pre className="dl-code">{json}</pre>
            <span className="dl-sr-only" role="status">{copied ? "Hotfix copied to clipboard" : ""}</span>
        </ResultCard>
    );
}

// ---- fixing a plugin's patch ------------------------------------------------------------------

/** "plugin:index", or "" for a new patch. Kept with the draft. */
let fixing = "";

/** How the fields show a find or match: text as is, a RegExp as /…/flags (what parsePatchValue reads back) */
const asField = (value: string | RegExp) => typeof value === "string" ? value : `/${value.source}/${value.flags}`;

/** Every patch a plugin registered, as the plugin wrote it (not with a hotfix already in place) */
function fixablePatches() {
    return getPatchRecords().flatMap(r => {
        const state = PluginManager.get(r.plugin);
        const original = state?.definition?.patches?.[r.index];
        return state && original ? [{ value: `${r.plugin}:${r.index}`, label: `${state.manifest.name} · Patch ${r.index + 1}`, state, original, index: r.index }] : [];
    });
}

/** The draft as a hotfix for the patch being fixed, when there's one and the draft parses */
function hotfixJson(draft: PatchDraft): string | undefined {
    const target = fixablePatches().find(p => p.value === fixing);
    if (!target || !draft.find || !draft.match) return;
    try {
        return JSON.stringify(hotfixDraft({
            plugin: target.state.manifest.id,
            version: target.state.manifest.version,
            index: target.index,
            was: target.original.find,
            find: parsePatchValue(draft.find),
            match: parsePatchValue(draft.match),
            replace: draft.replace,
        }), null, 2);
    } catch {
        return undefined;
    }
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

    // Starting from a plugin's own patch fills the fields in with it, and offers the result as a hotfix
    const [target, setTarget] = React.useState(fixing);
    const targets = fixablePatches();
    const pick = (value: string) => {
        fixing = value;
        setTarget(value);
        const picked = targets.find(p => p.value === value);
        if (!picked) return;
        const [first] = [picked.original.replace].flat();
        setInput({ find: asField(picked.original.find), match: first ? asField(first.match) : "", replace: typeof first?.with === "string" ? first.with : "" });
    };
    const hotfix = target && result?.snippet ? hotfixJson(input) : undefined;

    return (
        <div className="dl-tab">
            <Section id="dl-ph-draft" title="Patch" description="Nothing is applied: this previews a patch against the code Discord is running right now.">
                <div className="dl-ph-fields dl-stack-loose">
                    {targets.length > 0 && (
                        <div className="dl-field">
                            <Text variant="text-md/medium" color="text-strong" id="dl-ph-target-label">Start from</Text>
                            <p className="dl-hint">A plugin’s patch to fix, or a new one.</p>
                            <Dropdown
                                id="dl-ph-target"
                                label="Start from"
                                labelledBy="dl-ph-target-label"
                                options={[{ label: "A new patch", value: "" }, ...targets.map(({ label, value }) => ({ label, value }))]}
                                value={targets.some(p => p.value === target) ? target : ""}
                                onChange={pick}
                            />
                        </div>
                    )}
                    <TextField
                        id="dl-ph-find"
                        label="Find"
                        description="Text that only the target module contains. Write /…/flags for a regex."
                        placeholder="Object.defineProperties(this,{isDeveloper"
                        spellCheck={false}
                        value={input.find}
                        onChange={field("find")}
                    />
                    <TextField
                        id="dl-ph-match"
                        label="Match"
                        description="What to replace in that module, text or /…/flags. \i matches any identifier."
                        placeholder="/(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/"
                        spellCheck={false}
                        value={input.match}
                        onChange={field("match")}
                    />
                    <TextField
                        id="dl-ph-replace"
                        label="Replace with"
                        description="$1 inserts a capture group, $& the whole match, $self your plugin."
                        placeholder="true"
                        spellCheck={false}
                        value={input.replace}
                        onChange={field("replace")}
                    />
                </div>
            </Section>

            <Section id="dl-ph-results" title="Results">
                <p className="dl-hint dl-tabular" role="status" aria-live="polite">
                    {!input.find ? "" : checking || !state ? "Checking…" : `Checked ${state.scanned.toLocaleString()} modules.`}
                </p>

                {!input.find ? (
                    <EmptyState icon="beaker" title="Try a patch against Discord’s code">
                        Enter a find above to see which module it hits, what your match catches, and whether the result still compiles.
                    </EmptyState>
                ) : result && (
                    <div className="dl-stack" aria-busy={checking} data-checking={checking ? "" : undefined}>
                        <ModuleCard result={result} scanned={state.scanned} onPick={setPreferred} />
                        {result.moduleId && <MatchCard result={result} hasMatch={!!input.match} />}
                        {result.matchCount > 0 && <ResultChangeCard result={result} />}
                        {result.snippet && <SnippetCard snippet={result.snippet} />}
                        {hotfix && <HotfixCard json={hotfix} />}
                    </div>
                )}
            </Section>
        </div>
    );
}
