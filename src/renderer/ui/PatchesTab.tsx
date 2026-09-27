import { diagnosePatches, PatchDiagnosis, PatchHealth } from "../patching/diagnose";
import { diagnoseLookups, LookupDiagnosis, LookupHealth } from "../plugins/lookups";
import { React } from "../webpack/common";
import { Button, EmptyState, List, Section, Status, Text, Tone } from "./components";

const health: Record<PatchHealth, { tone: Tone; label: string; hint: string; order: number; }> = {
    broken: { tone: "danger", label: "Broken", hint: "No module matches the find. Discord probably changed this code.", order: 0 },
    failed: { tone: "danger", label: "Failed", hint: "Found its module but couldn’t change it.", order: 0 },
    partial: { tone: "danger", label: "Partly applied", hint: "Some replacements matched nothing.", order: 0 },
    ambiguous: { tone: "warning", label: "Ambiguous", hint: "The find matches several modules. Make it more specific.", order: 1 },
    waiting: { tone: "success", label: "Applies when needed", hint: "Its code loads later, when you open the part of Discord that uses it, and is patched as it loads.", order: 2 },
    applied: { tone: "success", label: "Applied", hint: "", order: 3 },
};

function PatchRow({ d }: { d: PatchDiagnosis; }) {
    const info = health[d.health];
    const titleId = `dl-patch-${d.plugin}-${d.index}`;
    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{d.plugin}</Text>
                        <Text variant="text-xs/medium" color="text-muted" className="dl-version" tabular>{`Patch ${d.index + 1}`}</Text>
                    </div>
                    <p className="dl-code-inline"><span className="dl-code-key">find</span>{String(d.patch.find)}</p>
                    {info.hint && <Text tag="p" variant="text-sm/normal" color="text-subtle">{info.hint}</Text>}
                    {d.modules.length > 0 && (
                        <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-mono">
                            {`${d.modules.length === 1 ? "Module" : "Modules"} ${d.modules.join(", ")}`}
                        </Text>
                    )}
                </div>
                <div className="dl-row-controls">
                    <Status tone={info.tone}>{info.label}</Status>
                </div>
            </div>
            {d.errors.map((e, i) => <pre key={i} className="dl-error">{e}</pre>)}
        </li>
    );
}

const lookupHealth: Record<LookupHealth, { tone: Tone; label: string; hint: (d: LookupDiagnosis) => string; order: number; }> = {
    broken: {
        tone: "danger", label: "Not found", order: 0,
        hint: d => d.candidates.length
            ? "Its module loaded, but nothing in it matches any more. Discord probably changed this code."
            : "No module matches. Discord probably changed this code.",
    },
    missing: {
        tone: "warning", label: "Not found yet", order: 1,
        hint: () => "Nothing Discord has loaded so far matches. If you’ve already used the part of Discord it’s for, Discord probably changed it.",
    },
    waiting: { tone: "success", label: "Found when needed", order: 2, hint: () => "Its code loads later, when you open the part of Discord that uses it." },
    found: { tone: "success", label: "Found", order: 3, hint: () => "" },
};

function LookupRow({ d, index }: { d: LookupDiagnosis; index: number; }) {
    const info = lookupHealth[d.health];
    const titleId = `dl-lookup-${d.plugin}-${index}`;
    const hint = info.hint(d);
    return (
        <li className="dl-row" aria-labelledby={titleId}>
            <div className="dl-row-head">
                <div className="dl-row-text">
                    <div className="dl-row-title">
                        <Text tag="h3" variant="heading-md/medium" color="text-strong" id={titleId}>{d.plugin}</Text>
                    </div>
                    <p className="dl-code-inline"><span className="dl-code-key">finds</span>{d.target}</p>
                    {hint && <Text tag="p" variant="text-sm/normal" color="text-subtle">{hint}</Text>}
                    {d.candidates.length > 0 && (
                        <Text tag="p" variant="text-xs/normal" color="text-muted" className="dl-mono">
                            {`${d.candidates.length === 1 ? "Module" : "Modules"} ${d.candidates.join(", ")}`}
                        </Text>
                    )}
                </div>
                <div className="dl-row-controls">
                    <Status tone={info.tone}>{info.label}</Status>
                </div>
            </div>
        </li>
    );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PatchesTab() {
    const check = () => ({ patches: diagnosePatches(), lookups: diagnoseLookups() });
    const [{ patches: results, lookups }, setResults] = React.useState(check);
    // What needs attention first; the sort is stable, so plugin order holds within each group
    const sorted = [...results].sort((a, b) => health[a.health].order - health[b.health].order);
    const sortedLookups = lookups
        .map((d, index) => ({ d, index }))
        .sort((a, b) => lookupHealth[a.d.health].order - lookupHealth[b.d.health].order);
    const problems = results.filter(r => health[r.health].tone === "danger").length
        + lookups.filter(d => lookupHealth[d.health].tone !== "success").length;

    const counts = [
        results.length && plural(results.length, "source patch", "source patches"),
        lookups.length && plural(lookups.length, "lookup", "lookups"),
    ].filter(Boolean).join(", ");

    return (
        <div className="dl-tab">
            <div className="dl-toolbar">
                <div className="dl-grow">
                    <Text variant="text-sm/medium" color="text-subtle" role="status" tabular>
                        {counts
                            ? `${counts}, ${problems ? `${problems} ${problems === 1 ? "needs" : "need"} attention` : "no problems found"}`
                            : "No source patches or lookups active"}
                    </Text>
                </div>
                <Button icon="refresh" onClick={() => setResults(check())}>Check again</Button>
            </div>
            {results.length ? (
                <List label="Source patches">{sorted.map(d => <PatchRow key={`${d.plugin}-${d.index}`} d={d} />)}</List>
            ) : !lookups.length && (
                <EmptyState icon="wrench" title="No source patches active">
                    Plugins that rewrite Discord’s code list their patches here, with a health check after every Discord update.
                </EmptyState>
            )}
            {lookups.length > 0 && (
                <Section
                    id="dl-lookups"
                    title="Lookups"
                    description="Parts of Discord plugins wait for before they hook or use them. One that’s never found fails quietly, so it’s checked here."
                >
                    <List label="Lookups">{sortedLookups.map(({ d, index }) => <LookupRow key={`${d.plugin}-${index}`} d={d} index={index} />)}</List>
                </Section>
            )}
        </div>
    );
}
