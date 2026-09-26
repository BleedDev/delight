/**
 * Minimal asar support: enough to read Discord's package.json and to write our small loader archive.
 *
 * Layout: a pickle holding the header size (uint32 4, uint32 headerSize), then the header pickle
 * (uint32 payload size, uint32 JSON length, the JSON padded to 4 bytes), then file contents.
 * File offsets in the header are relative to the end of the header.
 */
import { closeSync, openSync, readSync } from "fs";

interface AsarEntry {
    files?: Record<string, AsarEntry>;
    offset?: string;
    size?: number;
}

export function readAsarFile(asarPath: string, filePath: string): string {
    const fd = openSync(asarPath, "r");
    try {
        const sizes = Buffer.alloc(16);
        readSync(fd, sizes, 0, 16, 0);
        const headerSize = sizes.readUInt32LE(4);
        const jsonLength = sizes.readUInt32LE(12);

        const json = Buffer.alloc(jsonLength);
        readSync(fd, json, 0, jsonLength, 16);
        const header: AsarEntry = JSON.parse(json.toString("utf8"));

        let entry: AsarEntry | undefined = header;
        for (const part of filePath.split("/")) entry = entry?.files?.[part];
        if (!entry || entry.offset === undefined || entry.size === undefined) {
            throw new Error(`${filePath} not found in ${asarPath}`);
        }

        const content = Buffer.alloc(entry.size);
        readSync(fd, content, 0, entry.size, 8 + headerSize + Number(entry.offset));
        return content.toString("utf8");
    } finally {
        closeSync(fd);
    }
}

/** Builds a flat asar archive (no folders) from file name -> text content */
export function createAsar(files: Record<string, string>): Buffer {
    const contents = Object.entries(files).map(([name, text]) => [name, Buffer.from(text, "utf8")] as const);

    const header: AsarEntry = { files: {} };
    let offset = 0;
    for (const [name, data] of contents) {
        header.files![name] = { size: data.length, offset: String(offset) };
        offset += data.length;
    }

    const json = Buffer.from(JSON.stringify(header), "utf8");
    const padded = Math.ceil(json.length / 4) * 4;

    const headerPickle = Buffer.alloc(8 + padded);
    headerPickle.writeUInt32LE(4 + padded, 0);
    headerPickle.writeUInt32LE(json.length, 4);
    json.copy(headerPickle, 8);

    const sizePickle = Buffer.alloc(8);
    sizePickle.writeUInt32LE(4, 0);
    sizePickle.writeUInt32LE(headerPickle.length, 4);

    return Buffer.concat([sizePickle, headerPickle, ...contents.map(([, data]) => data)]);
}
