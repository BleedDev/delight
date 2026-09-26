import { functionSource } from "../webpack/find";
import { getOriginalFactory, wreq } from "../webpack/runtime";
import { getPatchRecords, matchesFind, PatchRecord } from "./source";

export type PatchHealth =
    | "applied"   // every replacement worked
    | "partial"   // some replacements matched nothing
    | "failed"    // found its module, but no replacement worked or the result didn't compile
    | "waiting"   // its module exists but hasn't been loaded yet (lazy chunk)
    | "broken"    // no module matches `find`, most likely Discord changed
    | "ambiguous"; // `find` matches several modules but the patch isn't marked `all`

export interface PatchDiagnosis extends PatchRecord {
    health: PatchHealth;
    candidates: string[];
}

/** [id, original source] of every module factory Discord has registered so far, loaded or not */
export function moduleSources(): [id: string, source: string][] {
    const sources: [string, string][] = [];
    if (wreq) {
        for (const id in wreq.m) {
            const factory = getOriginalFactory(wreq.m[id]);
            if (factory) sources.push([id, functionSource(factory)]);
        }
    }
    return sources;
}

/** Checks every registered patch against all module factories Discord has registered so far */
export function diagnosePatches(): PatchDiagnosis[] {
    const sources = moduleSources();

    return getPatchRecords().map(record => {
        const candidates = sources.filter(([, src]) => matchesFind(src, record.patch.find)).map(([id]) => id);

        let health: PatchHealth;
        if (record.state !== "pending") health = record.state;
        else if (!candidates.length) health = "broken";
        else health = "waiting";

        if (!record.patch.all && candidates.length > 1 && (health === "waiting" || health === "applied")) health = "ambiguous";

        return { ...record, health, candidates };
    });
}
