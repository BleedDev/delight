/**
 * Raster image formats, recognised by their first bytes rather than what a server or client claims.
 * SVG is left out on purpose: it's a document that can carry script.
 */
export function imageType(data: Uint8Array): { ext: "png" | "jpg" | "gif" | "webp"; type: string; } | undefined {
    const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
    if (starts(0x89, 0x50, 0x4e, 0x47)) return { ext: "png", type: "image/png" };
    if (starts(0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
    if (starts(0x47, 0x49, 0x46, 0x38)) return { ext: "gif", type: "image/gif" };
    if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return { ext: "webp", type: "image/webp" };
}

/** A data: URL for a raster image, or undefined when the bytes aren't one */
export function imageDataUrl(data: Uint8Array) {
    const type = imageType(data);
    if (!type) return;
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return `data:${type.type};base64,${btoa(binary)}`;
}
