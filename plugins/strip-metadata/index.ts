import { definePlugin, filters } from "@evi/api";
import type { HookContext, PluginContext } from "@evi/api";

import { randomFileName, stripMetadata } from "./strip";

/**
 * Every file you attach goes through Discord's upload attachment actions before it reaches the
 * upload queue (UploadAttachmentStore): addFiles({ files: [{ file, platform }], channelId, ... })
 * for picks, drops and pastes, setFile for an edited attachment, and instantBatchUpload for
 * uploads that skip the queue. We hook those with `instead`: the File objects found in the
 * arguments are read, cleaned and swapped for new Files before the original runs. Calls
 * carrying no File run straight through, synchronously as before.
 */

type Settings = typeof settings;
const settings = {
    stripImages: {
        type: "boolean",
        label: "Strip image metadata",
        description: "Remove EXIF (camera, GPS location, dates), XMP and text chunks from JPEG, PNG and WebP images.",
        default: true,
    },
    randomNames: {
        type: "boolean",
        label: "Random file names",
        description: "Upload files with a random name, keeping the extension.",
        default: true,
    },
} as const;

/** Images bigger than this are uploaded as they are rather than read into memory */
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|jfif|png|apng|webp)$/i;
const METHODS = ["addFiles", "addFile", "setFile", "instantBatchUpload"];

const uploadActions = filters.byProps("addFiles", "clearAll");
const uploadHandler = filters.byProps("instantBatchUpload");

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

/** Finds every File in the arguments (arrays and plain objects, a few levels deep) */
function collectFiles(value: unknown, found: { owner: any; key: PropertyKey; file: File; }[], depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return;
    const entries: [PropertyKey, unknown][] = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    for (const [key, v] of entries) {
        if (v instanceof File) found.push({ owner: value, key, file: v });
        else if (v && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype)) collectFiles(v, found, depth + 1);
    }
}

async function cleanArgs(args: any[]) {
    const found: { owner: any; key: PropertyKey; file: File; }[] = [];
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
    const found: { owner: any; key: PropertyKey; file: File; }[] = [];
    collectFiles(args, found);
    return found.some(f => !cleaned.has(f.file));
}

function interceptUpload(call: HookContext) {
    const ctx = context;
    if (!ctx || (!ctx.settings.get("stripImages") && !ctx.settings.get("randomNames")) || !hasFiles(call.args)) {
        return call.callOriginal(...call.args);
    }
    return cleanArgs(call.args).then(() => call.callOriginal(...call.args));
}

export default definePlugin({
    settings,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));

        // Both filters may find the same object: hook each method once
        const hooked = new WeakSet<object>();
        for (const filter of [uploadActions, uploadHandler]) {
            ctx.waitFor(filter, actions => {
                if (hooked.has(actions)) return;
                hooked.add(actions);
                for (const method of METHODS) {
                    if (typeof actions[method] === "function") ctx.hook.instead(actions, method, interceptUpload);
                }
            });
        }
    },
});
