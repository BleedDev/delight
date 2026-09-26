/**
 * Source patches rewrite a module's code before it first runs. They can change anything, at the
 * cost of depending on Discord's minified code. Prefer export hooks when they can do the job.
 *
 * Matching conveniences:
 *   \i      in a RegExp matches any identifier (minified names change every build)
 *   $self   in a replacement refers to the plugin's definition object at runtime
 */
import { Logger } from "../logger";
import type { ModuleFactory } from "../webpack/runtime";

export interface Replacement {
    match: string | RegExp;
    /** Same semantics as String.prototype.replace */
    with: string | ((substring: string, ...args: any[]) => string);
}

export interface SourcePatch {
    /** A string or RegExp that only the target module's source contains */
    find: string | RegExp;
    replace: Replacement | Replacement[];
    /** Patch every module matching `find` instead of only the first */
    all?: boolean;
    /** If one replacement fails, apply none of them */
    group?: boolean;
    /** Don't report this patch as broken when nothing matches */
    optional?: boolean;
    /** Skip the patch when this returns false. Evaluated when a matching module loads. */
    predicate?: () => boolean;
    /**
     * Whether the target module may be re-run in place when this patch changes after the module
     * already executed (see live.ts). Default: decided by a safety check. `false` always asks for a
     * reload, `true` skips the check (for modules you know are safe to run twice).
     */
    live?: boolean;
}

export type PatchState = "pending" | "applied" | "partial" | "failed";

export interface PatchRecord {
    plugin: string;
    index: number;
    patch: SourcePatch;
    state: PatchState;
    /** Modules this patch was applied to */
    modules: string[];
    errors: string[];
}

const logger = new Logger("SourcePatcher", "#f7a072");
const records: PatchRecord[] = [];

const IDENT = String.raw`(?:[A-Za-z_$][\w$]*)`;

function canonicalizeMatch(match: string | RegExp) {
    if (typeof match === "string") return match;
    const source = match.source.replace(/(?<!\\)\\i/g, IDENT);
    return new RegExp(source, match.flags);
}

function canonicalizeReplace(replace: Replacement["with"], plugin: string): Replacement["with"] {
    const self = `Delight.$(${JSON.stringify(plugin)})`;
    if (typeof replace === "string") return replace.replaceAll("$self", self);
    return (...args) => replace(...args).replaceAll("$self", self);
}

export function matchesFind(code: string, find: string | RegExp) {
    if (typeof find === "string") return code.includes(find);
    find.lastIndex = 0;
    return find.test(code);
}

/** Method shorthand factories like `123(e,t,n){...}` are not expressions, turn them into functions */
function normalizeFactorySource(code: string) {
    if (/^(?:function\b|async\b|\()/.test(code)) return code;
    return code.replace(/^(?:[\w$]+|"(?:[^"\\]|\\.)*")(?=\s*\()/, "function");
}

function compile(code: string, moduleId: string): ModuleFactory {
    // Indirect eval: global scope, no access to our locals
    return (0, eval)(`0,${code}\n//# sourceURL=delight://modules/${moduleId}.js`);
}

export function registerPatches(plugin: string, patches: SourcePatch[]) {
    patches.forEach((patch, index) => {
        records.push({ plugin, index, patch, state: "pending", modules: [], errors: [] });
    });
}

export function unregisterPatches(plugin: string) {
    for (let i = records.length - 1; i >= 0; i--) {
        if (records[i].plugin === plugin) records.splice(i, 1);
    }
}

export function getPatchRecords(plugin?: string) {
    return plugin ? records.filter(r => r.plugin === plugin) : [...records];
}

/**
 * Applies every relevant patch to one module factory.
 *
 * @param source  the factory's original source (shared with other consumers, computed lazily)
 * @param rerun   the module already ran and is being re-run by live replacement: patches that were
 *                already applied to it count again, and nothing new is logged for them
 */
export function applySourcePatches(
    moduleId: string,
    factory: ModuleFactory,
    source: () => string,
    rerun = false,
): { factory: ModuleFactory; patchedBy: string[]; } {
    const patchedBy: string[] = [];
    if (!records.length) return { factory, patchedBy };

    let originalCode: string | undefined;
    let code = "";
    let current = factory;

    for (const record of records) {
        const { patch } = record;
        const appliedHere = record.modules.includes(moduleId);
        // A single-module patch is done once it found its module
        if (!patch.all && record.modules.length && !(rerun && appliedHere)) continue;

        // Always match against the original, so plugins can't break each other's finds
        if (!matchesFind(source(), patch.find)) continue;
        if (originalCode === undefined) {
            originalCode = normalizeFactorySource(source());
            code = originalCode;
        }

        try {
            if (patch.predicate && !patch.predicate()) continue;
        } catch (err) {
            record.errors.push(`predicate threw: ${err}`);
            continue;
        }

        if (!appliedHere) record.modules.push(moduleId);

        const replacements = Array.isArray(patch.replace) ? patch.replace : [patch.replace];
        const errors: string[] = [];
        let next = code;
        let failed = 0;

        replacements.forEach((r, i) => {
            const before = next;
            try {
                next = next.replace(canonicalizeMatch(r.match) as any, canonicalizeReplace(r.with, record.plugin) as any);
            } catch (err) {
                errors.push(`module ${moduleId}, replacement ${i}: ${err}`);
            }
            if (next === before) {
                failed++;
                errors.push(`module ${moduleId}, replacement ${i} matched nothing: ${String(r.match)}`);
            }
        });

        if (patch.group && failed) next = code;

        if (next !== code) {
            try {
                current = compile(next, moduleId);
                code = next;
                patchedBy.push(record.plugin);
            } catch (err) {
                failed = replacements.length;
                errors.push(`module ${moduleId}: patched code does not compile, patch reverted: ${err}`);
            }
        }

        record.state = failed === 0 ? "applied" : failed < replacements.length && !patch.group ? "partial" : "failed";
        if (!rerun || record.state !== "applied") record.errors.push(...errors);
        if (record.state !== "applied" && !rerun) {
            logger.warn(`Patch ${record.index} of ${record.plugin} ${record.state} on module ${moduleId}`, errors);
        }
    }

    return { factory: current, patchedBy };
}
