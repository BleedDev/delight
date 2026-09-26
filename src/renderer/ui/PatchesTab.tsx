import { diagnosePatches, PatchDiagnosis, PatchHealth } from "../patching/diagnose";
import { React } from "../webpack/common";
import { Button, Icon, Status, Tone } from "./components";

const health: Record<PatchHealth, { tone: Tone; label: string; hint: string; }> = {
    applied: { tone: "success", label: "Applied", hint: "" },
    partial: { tone: "danger", label: "Partly applied", hint: "Some replacements matched nothing." },
    failed: { tone: "danger", label: "Failed", hint: "Found its module but couldn’t change it." },
    waiting: { tone: "muted", label: "Waiting", hint: "Its module loads later, when you open the part of Discord that uses it." },
    broken: { tone: "danger", label: "Broken", hint: "No module matches the find. Discord probably changed this code." },
    ambiguous: { tone: "warning", label: "Ambiguous", hint: "The find matches several modules, make it more specific." },
};

function PatchRow({ d }: { d: PatchDiagnosis; }) {
    const info = health[d.health];
    return (
        <article className="dl-card">
            <div className="dl-card-head">
                <div className="dl-card-main">
                    <h3 className="dl-card-title">{d.plugin} <span className="dl-version">patch {d.index + 1}</span></h3>
                    <p className="dl-card-desc dl-mono" title={String(d.patch.find)}>find: {String(d.patch.find)}</p>
                    {info.hint && <p className="dl-hint">{info.hint}</p>}
                    {d.modules.length > 0 && <p className="dl-hint dl-mono">modules: {d.modules.join(", ")}</p>}
                    {d.errors.map((e, i) => <pre key={i} className="dl-error" style={{ marginBlockStart: 8 }}>{e}</pre>)}
                </div>
                <Status tone={info.tone}>{info.label}</Status>
            </div>
        </article>
    );
}

export function PatchesTab() {
    const [results, setResults] = React.useState(() => diagnosePatches());
    const problems = results.filter(r => health[r.health].tone === "danger").length;

    return (
        <>
            <div className="dl-toolbar">
                <span className="dl-hint" role="status" style={{ flex: 1 }}>
                    {results.length
                        ? `${results.length} source patches, ${problems ? `${problems} need attention` : "no problems found"}.`
                        : ""}
                </span>
                <Button onClick={() => setResults(diagnosePatches())}><Icon name="reload" />Check again</Button>
            </div>
            {results.length ? (
                <div className="dl-stack">{results.map(d => <PatchRow key={`${d.plugin}-${d.index}`} d={d} />)}</div>
            ) : (
                <div className="dl-empty">
                    <strong>No source patches active</strong>
                    Plugins that rewrite Discord’s code list their patches here, with a health check after every Discord update.
                </div>
            )}
        </>
    );
}
