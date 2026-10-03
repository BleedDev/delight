import { definePlugin, filters } from "@evi/api";
import type { HookContext, PluginContext } from "@evi/api";

import { t } from "./strings";
import { randomFileName, stripMetadata } from "./strip";

/**
 * Picks, drops and pastes go through Discord's upload entry point, (files, channel, draftType,
 * { requireConfirm }). It either queues them with the upload attachment actions
 * (addFiles({ files: [{ file, platform }], channelId, ... })) or, for uploads that skip the queue,
 * sends them right away. setFile replaces an edited attachment. We hook all of them with `instead`:
 * the File objects found in the arguments are read, cleaned and swapped for new Files before the
 * original runs. Calls carrying no File run straight through, synchronously as before.
 */

type Settings = typeof settings;
const settings = {
    stripImages: {
        type: "boolean",
        get label() { return t("settings.stripImages"); },
        get description() { return t("settings.stripImages.description"); },
        default: true,
    },
    randomNames: {
        type: "boolean",
        get label() { return t("settings.randomNames"); },
        get description() { return t("settings.randomNames.description"); },
        default: true,
    },
} as const;

/** Images bigger than this are uploaded as they are rather than read into memory */
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|jfif|png|apng|webp)$/i;
const METHODS = ["addFiles", "addFile", "setFile"];

const uploadActions = filters.byProps("addFiles", "clearAll");
/** The entry point: its instant branch sends without the queue, so those files never reach addFiles */
const uploadEntry = filters.byCode("INSTANT_UPLOAD", "requireConfirm");

let context: PluginContext<Settings> | undefined;
/** Files we made, so a call passing them on to another hooked method doesn't clean them twice */
const cleaned = new WeakSet<File>();

async function cleanFile(file: File): Promise<File> {
    const ctx = context;
    if (!ctx || cleaned.has(file)) return file;
    const strip = ctx.settings.get("stripImages");
    const rename = ctx.settings.get("randomNames");
    let parts: BlobPart[] = [file];
    let name = file.name;

    if (strip && file.size <= MAX_IMAGE_BYTES && (file.type.startsWith("image/") || IMAGE_NAME.test(file.name))) {
        const result = stripMetadata(new Uint8Array(await file.arrayBuffer()));
        if (result.changed) parts = [result.data as Uint8Array<ArrayBuffer>];
    }
    if (rename) name = randomFileName(file.name);
    if (parts[0] === file && name === file.name) return file;
    const clean = new File(parts, name, { type: file.type, lastModified: Date.now() });
    cleaned.add(clean);
    return clean;
}

type FoundFile = { owner: any; key: PropertyKey; file: File; };

/** Finds every File in the arguments (arrays and plain objects, a few levels deep) */
function collectFiles(value: unknown, found: FoundFile[], depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return;
    const entries: [PropertyKey, unknown][] = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    for (const [key, v] of entries) {
        if (v instanceof File) found.push({ owner: value, key, file: v });
        else if (v && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype)) collectFiles(v, found, depth + 1);
    }
}

async function cleanArgs(args: any[]) {
    const found: FoundFile[] = [];
    collectFiles(args, found);
    await Promise.all(found.map(async ({ owner, key, file }) => {
        try {
            const clean = await cleanFile(file);
            if (clean === file) return;
            owner[key] = clean;
            // Some upload items carry the name next to the file
            for (const prop of ["name", "filename"]) {
                if (!Array.isArray(owner) && owner[prop] === file.name) owner[prop] = clean.name;
            }
        } catch (err) {
            context?.logger.error("Couldn't clean", file.name, err);
        }
    }));
}

function hasFiles(args: any[]) {
    const found: FoundFile[] = [];
    collectFiles(args, found);
    return found.some(f => !cleaned.has(f.file));
}

const enabled = () => !!context && (context.settings.get("stripImages") || context.settings.get("randomNames"));

/** The entry point takes a FileList or an array of Files first */
function interceptEntry(call: HookContext) {
    const [files, ...rest] = call.args;
    const list: unknown[] = files && typeof files === "object" && typeof files.length === "number" ? Array.from(files as ArrayLike<unknown>) : [];
    if (!enabled() || !list.some(f => f instanceof File && !cleaned.has(f))) {
        return call.callOriginal(...call.args);
    }
    const clean = list.map(f => f instanceof File
        ? cleanFile(f).catch(err => {
            context?.logger.error("Couldn't clean", f.name, err);
            return f;
        })
        : f);
    return Promise.all(clean).then(files => call.callOriginal(files, ...rest));
}

function interceptUpload(call: HookContext) {
    if (!enabled() || !hasFiles(call.args)) {
        return call.callOriginal(...call.args);
    }
    return cleanArgs(call.args).then(() => call.callOriginal(...call.args));
}

export default definePlugin({
    settings,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));

        ctx.hookExport("instead", uploadEntry, interceptEntry);
        ctx.waitFor(uploadActions, actions => {
            for (const method of METHODS) {
                if (typeof actions[method] === "function") ctx.hook.instead(actions, method, interceptUpload);
            }
        });
    },
});
