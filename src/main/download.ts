import { net } from "electron";

import { mt } from "./locale";

export type Download = { ok: true; body: Uint8Array; contentType: string; } | { ok: false; error: string; };

/** Reads the body, giving up as soon as it passes the size cap */
export async function readCapped(res: Response, max: number) {
    const declared = Number(res.headers.get("content-length"));
    if (declared > max) return null;

    const reader = res.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
            reader.cancel().catch(() => { });
            return null;
        }
        chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
}

const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${bytes / 1024 / 1024} MB` : `${bytes / 1024} KB`;

/** Downloads an https URL (and only https, redirects included) of at most `max` bytes */
export async function downloadHttps(input: string, max: number, { what = mt("main.dl.thatFile"), cache }: { what?: string; cache?: RequestCache; } = {}): Promise<Download> {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return { ok: false, error: mt("main.dl.invalidUrl") };
    }
    if (url.protocol !== "https:") return { ok: false, error: mt("main.dl.httpsOnly") };

    let res: Response;
    try {
        // Discord's session holds Discord's cookies: none of them go to a URL someone pasted
        res = await net.fetch(url.href, { signal: AbortSignal.timeout(20_000), cache, credentials: "omit" });
    } catch (err) {
        return { ok: false, error: mt("main.dl.failed", { error: (err as Error).message }) };
    }
    if (!res.ok) return { ok: false, error: mt("main.dl.status", { status: `${res.status} ${res.statusText}`.trim() }) };
    if (new URL(res.url || url.href).protocol !== "https:") return { ok: false, error: mt("main.dl.redirect") };

    const body = await readCapped(res, max).catch(() => undefined);
    if (body === undefined) return { ok: false, error: mt("main.dl.interrupted") };
    if (body === null) return { ok: false, error: mt("main.dl.tooLarge", { what, size: sizeLabel(max) }) };
    return { ok: true, body, contentType: res.headers.get("content-type") ?? "" };
}
