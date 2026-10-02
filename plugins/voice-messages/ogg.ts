/**
 * Discord's voice messages are Opus in an Ogg file. Chromium's MediaRecorder records Opus in WebM
 * (some builds also offer Ogg), so the WebM is remuxed: its Opus packets are copied into Ogg pages
 * as they are, nothing is re-encoded. Pure, no DOM: tests/voiceMessages.test.ts runs it.
 *
 * WebM: EBML elements, each an ID and a size (variable-length integers). We walk them in order,
 * stepping into the ones holding what we need (Segment, Tracks, TrackEntry, Cluster, BlockGroup) and
 * skipping the rest, so sizes MediaRecorder leaves unknown (a live recording's Segment and Clusters)
 * don't matter. The Opus track's CodecPrivate is its OpusHead; its SimpleBlocks are the packets.
 *
 * Ogg (RFC 3533, RFC 7845): a page with OpusHead, a page with OpusTags, then the packets, each page's
 * granule position the samples (at 48 kHz) decoded by its end.
 */

const ID = {
    segment: 0x18538067,
    tracks: 0x1654ae6b,
    trackEntry: 0xae,
    trackNumber: 0xd7,
    codecId: 0x86,
    codecPrivate: 0x63a2,
    audio: 0xe1,
    channels: 0x9f,
    cluster: 0x1f43b675,
    blockGroup: 0xa0,
    block: 0xa1,
    simpleBlock: 0xa3,
} as const;

/** Elements holding the ones we need: stepped into instead of skipped */
const MASTERS = new Set<number>([ID.segment, ID.tracks, ID.trackEntry, ID.audio, ID.cluster, ID.blockGroup]);

export const isOgg = (b: Uint8Array) => b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
export const isWebm = (b: Uint8Array) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

/** An EBML variable-length integer at `pos`: its value (marker bit kept for IDs) and length */
function vint(b: Uint8Array, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean; } {
    const first = b[pos];
    if (first === undefined || first === 0) throw new Error("Bad WebM: unreadable element");
    let length = 1;
    while (!(first & (0x80 >> (length - 1)))) length++;
    if (pos + length > b.length) throw new Error("Bad WebM: cut off");
    let value = keepMarker ? first : first & (0xff >> length);
    let allOnes = value === (0xff >> length);
    for (let i = 1; i < length; i++) {
        value = value * 256 + b[pos + i];
        if (b[pos + i] !== 0xff) allOnes = false;
    }
    return { value, length, unknown: !keepMarker && allOnes };
}

export interface OpusTrack {
    head: Uint8Array | undefined;
    channels: number;
    packets: Uint8Array[];
}

/** The Opus packets (and OpusHead) of a WebM file's first Opus track */
export function readWebmOpus(b: Uint8Array): OpusTrack {
    let pos = 0;
    let trackNumber: number | undefined;
    let current: { number?: number; codec?: string; head?: Uint8Array; channels?: number; } | undefined;
    const tracks: { number?: number; codec?: string; head?: Uint8Array; channels?: number; }[] = [];
    const packets: Uint8Array[] = [];
    const block = (start: number, end: number) => {
        const track = vint(b, start, false);
        if (trackNumber === undefined) {
            const opus = tracks.find(t => t.codec === "A_OPUS");
            trackNumber = opus?.number ?? track.value;
        }
        if (track.value !== trackNumber) return;
        const flags = b[start + track.length + 2];
        if (flags & 0x06) throw new Error("Laced WebM blocks aren't supported");
        packets.push(b.slice(start + track.length + 3, end));
    };
    while (pos < b.length) {
        const id = vint(b, pos, true);
        const size = vint(b, pos + id.length, false);
        const start = pos + id.length + size.length;
        if (MASTERS.has(id.value)) {
            if (id.value === ID.trackEntry) tracks.push(current = {});
            pos = start;
            continue;
        }
        if (size.unknown) break;
        const end = start + size.value;
        if (end > b.length) break; // a recording cut off mid-element: keep what came before
        switch (id.value) {
            case ID.trackNumber: if (current) current.number = readUint(b, start, end); break;
            case ID.codecId: if (current) current.codec = new TextDecoder().decode(b.subarray(start, end)); break;
            case ID.codecPrivate: if (current) current.head = b.slice(start, end); break;
            case ID.channels: if (current) current.channels = readUint(b, start, end); break;
            case ID.simpleBlock:
            case ID.block: block(start, end); break;
        }
        pos = end;
    }
    const opus = tracks.find(t => t.codec === "A_OPUS");
    if (!opus && tracks.length) throw new Error("The recording has no Opus audio");
    return { head: opus?.head, channels: opus?.channels ?? 1, packets };
}

function readUint(b: Uint8Array, start: number, end: number) {
    let v = 0;
    for (let i = start; i < end; i++) v = v * 256 + b[i];
    return v;
}

/** How many 48 kHz samples an Opus packet decodes to (RFC 6716, 3.1) */
export function opusSamples(packet: Uint8Array): number {
    if (!packet.length) return 0;
    const toc = packet[0];
    const config = toc >> 3;
    let tenths: number; // frame length in tenths of a millisecond
    if (config < 12) tenths = [100, 200, 400, 600][config % 4];
    else if (config < 16) tenths = [100, 200][config % 2];
    else tenths = [25, 50, 100, 200][config % 4];
    const code = toc & 3;
    const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
    return frames * tenths * 48 / 10;
}

/** OpusHead for a track that didn't carry one: mono or stereo, 48 kHz, 312 samples of pre-skip */
export function opusHead(channels: number, preSkip = 312): Uint8Array {
    const h = new Uint8Array(19);
    h.set(new TextEncoder().encode("OpusHead"));
    const v = new DataView(h.buffer);
    h[8] = 1;
    h[9] = channels;
    v.setUint16(10, preSkip, true);
    v.setUint32(12, 48000, true);
    return h;
}

export function opusTags(vendor = "Evi"): Uint8Array {
    const name = new TextEncoder().encode(vendor);
    const t = new Uint8Array(8 + 4 + name.length + 4);
    t.set(new TextEncoder().encode("OpusTags"));
    new DataView(t.buffer).setUint32(8, name.length, true);
    t.set(name, 12);
    return t;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let r = i << 24;
        for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
        table[i] = r >>> 0;
    }
    return table;
})();

/** Ogg's CRC-32: polynomial 0x04c11db7, no reflection, starts at 0 */
export function oggCrc(b: Uint8Array): number {
    let crc = 0;
    for (let i = 0; i < b.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b[i]) & 0xff]) >>> 0;
    return crc;
}

const FLAG_BOS = 2, FLAG_EOS = 4;

function page(packets: Uint8Array[], granule: number, serial: number, sequence: number, flags: number): Uint8Array {
    const lacing: number[] = [];
    for (const p of packets) {
        let left = p.length;
        while (left >= 255) {
            lacing.push(255);
            left -= 255;
        }
        lacing.push(left);
    }
    const bodyLength = packets.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(27 + lacing.length + bodyLength);
    const v = new DataView(out.buffer);
    out.set([0x4f, 0x67, 0x67, 0x53]);
    out[5] = flags;
    v.setUint32(6, granule % 0x100000000, true);
    v.setUint32(10, Math.floor(granule / 0x100000000), true);
    v.setUint32(14, serial, true);
    v.setUint32(18, sequence, true);
    out[26] = lacing.length;
    out.set(lacing, 27);
    let at = 27 + lacing.length;
    for (const p of packets) {
        out.set(p, at);
        at += p.length;
    }
    v.setUint32(22, oggCrc(out), true);
    return out;
}

/** An Ogg Opus file from a track's packets. Pages hold up to ~1 second of audio (50 packets). */
export function writeOggOpus(track: OpusTrack, serial = 0x45766921): Uint8Array {
    const head = track.head && track.head.length >= 19 ? track.head : opusHead(track.channels);
    const pages: Uint8Array[] = [page([head], 0, serial, 0, FLAG_BOS), page([opusTags()], 0, serial, 1, 0)];
    let granule = 0;
    let sequence = 2;
    let batch: Uint8Array[] = [];
    let segments = 0;
    const flush = (last: boolean) => {
        if (!batch.length && !last) return;
        pages.push(page(batch, granule, serial, sequence++, last ? FLAG_EOS : 0));
        batch = [];
        segments = 0;
    };
    track.packets.forEach((p, i) => {
        const need = Math.floor(p.length / 255) + 1;
        if (segments + need > 255 || batch.length >= 50) flush(false);
        batch.push(p);
        segments += need;
        granule += opusSamples(p);
        if (i === track.packets.length - 1) flush(true);
    });
    if (!track.packets.length) flush(true);
    const total = pages.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of pages) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

/** The recording as Ogg Opus, whichever container MediaRecorder used */
export function toOggOpus(bytes: Uint8Array): Uint8Array {
    if (isOgg(bytes)) return bytes;
    if (!isWebm(bytes)) throw new Error("The recording isn't WebM or Ogg");
    const track = readWebmOpus(bytes);
    if (!track.packets.length) throw new Error("The recording is empty");
    return writeOggOpus(track);
}

/** Seconds of audio in an Ogg Opus file: the last page's granule position less the pre-skip */
export function oggOpusDuration(b: Uint8Array): number {
    let granule = 0;
    let preSkip = 0;
    let pos = 0;
    while (pos + 27 <= b.length && isOgg(b.subarray(pos))) {
        const v = new DataView(b.buffer, b.byteOffset + pos);
        const lo = v.getUint32(6, true), hi = v.getUint32(10, true);
        // -1: no packet ends on this page
        const g = lo === 0xffffffff && hi === 0xffffffff ? 0 : lo + hi * 0x100000000;
        const count = b[pos + 26];
        let body = 0;
        for (let i = 0; i < count; i++) body += b[pos + 27 + i];
        const bodyStart = pos + 27 + count;
        if (pos === 0 && body >= 12) preSkip = new DataView(b.buffer, b.byteOffset + bodyStart).getUint16(10, true);
        if (g > granule) granule = g;
        pos = bodyStart + body;
    }
    return Math.max(0, granule - preSkip) / 48000;
}
