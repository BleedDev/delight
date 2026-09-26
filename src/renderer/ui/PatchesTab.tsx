import { diagnosePatches, PatchDiagnosis, PatchHealth } from "../patching/diagnose";
import { React } from "../webpack/common";
import { Button, EmptyState, List, Status, Text, Tone } from "./components";

const health: Record<PatchHealth, { tone: Tone; label: string; hint: string; order: number; }> = {
    broken: { tone: "danger", label: "Broken", hint: "No module matches the find. Discord probably changed this code.", order: 0 },
    failed: { tone: "danger", label: "Failed", hint: "Found its module but couldn’t change it.", order: 0 },
    partial: { tone: "danger", label: "Partly applied", hint: "Some replacements matched nothing.", order: 0 },
    ambiguous: { tone: "warning", label: "Ambiguous", hint: "The find matches several modules. Make it more specific.", order: 1 },
    waiting: { tone: "muted", label: "Waiting", hint: "Its module loads later, when you open the part of Discord that uses it.", order: 2 },
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

export function PatchesTab() {
    const [results, setResults] = React.useState(() => diagnosePatches());
    // What needs attention first; the sort is stable, so plugin order holds within each group
    const sorted = [...results].sort((a, b) => health[a.health].order - health[b.health].order);
    const problems = results.filter(r => health[r.health].tone === "danger").length;

    return (
        <div className="dl-tab">
            <div className="dl-toolbar">
                <div className="dl-grow">
                    <Text variant="text-sm/medium" color="text-subtle" role="status" tabular>
                        {results.length
                            ? `${results.length} source ${results.length === 1 ? "patch" : "patches"}, ${problems ? `${problems} ${problems === 1 ? "needs" : "need"} attention` : "no problems found"}`
                            : "No source patches active"}
                    </Text>
                </div>
                <Button icon="refresh" onClick={() => setResults(diagnosePatches())}>Check again</Button>
            </div>
            {results.length ? (
                <List label="Source patches">{sorted.map(d => <PatchRow key={`${d.plugin}-${d.index}`} d={d} />)}</List>
            ) : (
                <EmptyState icon="wrench" title="No source patches active">
                    Plugins that rewrite Discord’s code list their patches here, with a health check after every Discord update.
                </EmptyState>
            )}
        </div>
    );
}
