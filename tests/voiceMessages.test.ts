import { describe, expect, test } from "bun:test";

import { isOgg, oggCrc, oggOpusDuration, opusHead, opusSamples, readWebmOpus, toOggOpus, writeOggOpus } from "../plugins/voice-messages/ogg";
import { PATCHES } from "../plugins/voice-messages/patches";
import { canSendVoice, clock, IS_VOICE_MESSAGE, MAX_BARS, messageBody, nonce, PERMISSIONS, recorderType, toBase64, waveform } from "../plugins/voice-messages/voice";
import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";

// Half a second of a 300 Hz tone, Opus in WebM with an unknown-size Segment, like a live MediaRecorder file
const WEBM = Uint8Array.from(atob("GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggE97AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDEWVK5r7a4BAAAAAAAAZNeBAXPFiE45mLKHFGaznIEAIrWcg3VuZIiBAIaGQV9PUFVTVqqDYy6gVruEBMS0AIOBAiPjg4QBMS0A4ZGfgQG1iEDncAAAAAAAYmSBEGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn13Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc7JjwItjxYhOOZiyhxRms2fIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1cx9DtnVCgueBAKOdgQAAgAiCiDP3oeqH/9lxR9TF4Y3xkv4aIahBmKCjmYEAFYAIoLI7JjQ/OZIrckHJlK5bem2D4ECjmIEAKYAInIw+UL82UIcgDinRyMWVMpqMoKOWgQA9gAicjD5QvzZQhxiwNyX1gsqQaKOWgQBRgAicjD5QvzZQibSIiY3Mes3AiKOWgQBlgAicj6swC9IR8J04cHvveGS7VKOUgQB5gAicj6swC9IR8KGBFH4xkM+jlYEAjYAInI+rMAvSEgd9GETQTt6igKOUgQChgAicj6swC9ISB30jlj7PxUmjloEAtYAInIw+UL9fqj/NheI+WWIUsoWjmIEAyYAInIw+UL9fqj/OSBRXyhz8eIDCMKOWgQDdgAicjD5Qv1+qPrdEeAw2mIpoxaOVgQDxgAicj6swC9ISB3w2d07M8wloo5eBAQWACJyMPlC/X6o/zXRU3/6WZx0ltqOWgQEZgAicjD5Qv1+qPrdDvJsF3g/FXqOWgQEtgAicjD5Qv1+qP814cxdGLnQ/kKOVgQFBgAicj6swC9ISB3s+U4GZimj2o5WBAVWACJyMPlC/X6pASlS+FjlfZg6jlYEBaYAInI+rMAvSEfChhE/TneBqIKOWgQF9gAicjD5QvzZQiwIySIWsuPDJcKOWgQGRgAicjD5Qv1+qP78zrxYL4Gh4QKOWgQGlgAicjD5Qv1+qPzQW22g9SilSgKOUgQG5gAicjD5Qv1+qPqbM3LdxBOCjlIEBzYAInIyWzJ1g+kX3EftsxOKAo5iBAeGACJ1V6BtYuZ+8IVa6++Sp0+srnICgoaGVgQH1AAgGA3CkZ5CFO9o6/pUqL5cwm4EHdaKEAM3+YA=="), c => c.charCodeAt(0));

// Verbatim from Discord's web build (2026-10-02): the end of the chat bar's buttons component
const CHAT_BAR = "return(!a.Fr&&(f.gifts?.button!=null&&null==x&&!F&&(null==Y||U.Ay.isPremiumEligible(Y))&&j.push((0,i.jsx)(X.A,{disabled:p,channel:T},\"gift\")),f.gifs?.button!=null&&null==x&&S&&D&&!N&&j.push((0,i.jsx)(z,{disabled:p,type:f,channel:T},\"gif\")),f.stickers?.button!=null&&null==x&&S&&w&&!N&&j.push((0,i.jsx)(et,{disabled:p,type:f,channel:T},\"sticker\"))),f.emojis?.button!=null&&!N&&q&&(S||N?y&&j.push((0,i.jsx)(V,{disabled:p,type:f,channelId:T.id},\"emoji\")):j.push((0,i.jsx)(H.A,{disabled:p,type:f,channel:T},\"expression\"))),K&&L&&j.push((0,i.jsx)(v,{channelId:T.id,type:f},\"appLauncher\")),$&&j.push((0,i.jsx)(Q,{onClick:m,disabled:p||G},\"submit\")),0===j.length)?null:(0,i.jsx)(\"div\",{className:B.Uo,children:j})";

/** The Ogg pages in a file: flags, sequence, lacing, body, and whether the CRC holds */
function pages(b: Uint8Array) {
    const out: { flags: number; sequence: number; segments: number[]; body: Uint8Array; crcOk: boolean; }[] = [];
    let pos = 0;
    while (pos < b.length) {
        expect(isOgg(b.subarray(pos))).toBe(true);
        const count = b[pos + 26];
        const segments = [...b.subarray(pos + 27, pos + 27 + count)];
        const end = pos + 27 + count + segments.reduce((n, s) => n + s, 0);
        const copy = b.slice(pos, end);
        const view = new DataView(copy.buffer);
        const crc = view.getUint32(22, true);
        view.setUint32(22, 0, true);
        out.push({ flags: copy[5], sequence: view.getUint32(18, true), segments, body: copy.slice(27 + count), crcOk: oggCrc(copy) === crc });
        pos = end;
    }
    return out;
}

/** Packet lengths from a page's lacing values */
const packetLengths = (segments: number[]) => {
    const out: number[] = [];
    let len = 0;
    for (const s of segments) {
        len += s;
        if (s < 255) {
            out.push(len);
            len = 0;
        }
    }
    return out;
};

/** A WebM element: ID, a two-byte size, the body */
function el(id: number[], body: Uint8Array | number[]): Uint8Array {
    const data = body instanceof Uint8Array ? body : new Uint8Array(body);
    return new Uint8Array([...id, 0x40 | (data.length >> 8), data.length & 0xff, ...data]);
}
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
};

describe("Desktop Voice Messages: WebM to Ogg", () => {
    test("a real Opus WebM becomes a valid Ogg Opus file with every packet", () => {
        const track = readWebmOpus(WEBM);
        expect(new TextDecoder().decode(track.head!.subarray(0, 8))).toBe("OpusHead");
        expect(track.packets.length).toBeGreaterThan(20);

        const ogg = toOggOpus(WEBM);
        const list = pages(ogg);
        expect(list.every(p => p.crcOk)).toBe(true);
        expect(list[0].flags).toBe(2);
        expect(new TextDecoder().decode(list[0].body.subarray(0, 8))).toBe("OpusHead");
        expect(new TextDecoder().decode(list[1].body.subarray(0, 8))).toBe("OpusTags");
        expect(list.at(-1)!.flags & 4).toBe(4);
        expect(list.map(p => p.sequence)).toEqual(list.map((_, i) => i));
        expect(list.slice(2).flatMap(p => packetLengths(p.segments))).toEqual(track.packets.map(p => p.length));
        expect(oggOpusDuration(ogg)).toBeGreaterThan(0.45);
        expect(oggOpusDuration(ogg)).toBeLessThan(0.6);
    });

    test("unknown-size clusters, block groups and a recording cut off mid-block", () => {
        const packet = (n: number) => [0xf8, n, n, n]; // CELT 20 ms, one frame
        const simple = (n: number) => el([0xa3], [0x81, 0x00, n, 0x80, ...packet(n)]);
        const track = el([0xae], cat(el([0xd7], [1]), el([0x86], [...new TextEncoder().encode("A_OPUS")]), el([0x63, 0xa2], opusHead(1))));
        const file = cat(
            el([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]),
            new Uint8Array([0x18, 0x53, 0x80, 0x67, ...UNKNOWN]),
            el([0x16, 0x54, 0xae, 0x6b], track),
            new Uint8Array([0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN]),
            el([0xe7], [0]), simple(1), simple(2),
            el([0xa0], el([0xa1], [0x81, 0x00, 0x28, 0x00, ...packet(3)])),
            new Uint8Array([0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN]),
            simple(4),
            simple(5).subarray(0, 5),
        );
        expect(readWebmOpus(file).packets.map(p => p[1])).toEqual([1, 2, 3, 4]);
        const ogg = toOggOpus(file);
        expect(pages(ogg).every(p => p.crcOk)).toBe(true);
        expect(oggOpusDuration(ogg)).toBeCloseTo((4 * 960 - 312) / 48000, 5);
    });

    test("Ogg passes through as it is, anything else is refused", () => {
        const ogg = writeOggOpus({ head: undefined, channels: 1, packets: [new Uint8Array([0xf8, 1])] });
        expect(toOggOpus(ogg)).toBe(ogg);
        expect(() => toOggOpus(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
    });

    test("big packets span several lacing values, pages stay within 255 of them", () => {
        const big = new Uint8Array(600).fill(7);
        big[0] = 0xf8;
        const list = pages(writeOggOpus({ head: undefined, channels: 1, packets: Array.from({ length: 120 }, () => big) }));
        expect(list.every(p => p.crcOk && p.segments.length <= 255)).toBe(true);
        expect(list[2].segments.slice(0, 3)).toEqual([255, 255, 90]);
        expect(list.slice(2).flatMap(p => packetLengths(p.segments))).toEqual(Array(120).fill(600));
    });

    test("an Opus packet's length from its first byte", () => {
        expect(opusSamples(new Uint8Array([0xf8]))).toBe(960); // CELT 20 ms
        expect(opusSamples(new Uint8Array([0xf9]))).toBe(1920); // two frames
        expect(opusSamples(new Uint8Array([0xfb, 3]))).toBe(2880); // three frames
        expect(opusSamples(new Uint8Array([3 << 3]))).toBe(2880); // SILK 60 ms
        expect(opusSamples(new Uint8Array([16 << 3]))).toBe(120); // CELT 2.5 ms
        expect(opusSamples(new Uint8Array([13 << 3]))).toBe(960); // hybrid 20 ms
        expect(opusSamples(new Uint8Array(0))).toBe(0);
    });
});

describe("Desktop Voice Messages: the message", () => {
    const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 10));

    test("the waveform: about ten bars a second, 32 to 256 of them, scaled to the loudest, silence flat", () => {
        expect(waveform(tone(48000 * 5, 0.5), 5).length).toBe(50);
        expect(waveform(tone(48000 * 60, 0.5), 60).length).toBe(MAX_BARS);
        expect(waveform(tone(4800, 0.5), 0.1).length).toBe(32);
        expect([...waveform(new Float32Array(48000), 1)].every(v => v === 0)).toBe(true);
        const quiet = waveform(tone(48000, 0.05), 1);
        expect(Math.max(...quiet)).toBe(255);
        expect([...waveform(tone(48000, 0.005), 1)].every(v => v < 3)).toBe(true);
        expect(waveform(new Float32Array(0), 0).length).toBe(0);
    });

    test("the message is a voice message with one attachment and no text", () => {
        const body = messageBody("123", { filename: "voice-message.ogg", uploadedFilename: "abc/voice-message.ogg" }, 3.214, toBase64(new Uint8Array([0, 128, 255])), undefined, 1420070400000 + 1000);
        expect(body.flags).toBe(IS_VOICE_MESSAGE);
        expect(body.content).toBe("");
        expect(body.nonce).toBe((1000n << 22n).toString());
        expect(body.attachments).toEqual([{ id: "0", filename: "voice-message.ogg", uploaded_filename: "abc/voice-message.ogg", duration_secs: 3.21, waveform: "AID/" }]);
        expect("message_reference" in body).toBe(false);
    });

    test("a reply keeps its reference, and doesn't ping when the reply was set not to", () => {
        const quiet = messageBody("1", { filename: "a.ogg", uploadedFilename: "u" }, 1, "", { channelId: "1", messageId: "9", guildId: "5", mention: false }) as any;
        expect(quiet.message_reference).toEqual({ channel_id: "1", message_id: "9", guild_id: "5" });
        expect(quiet.allowed_mentions.replied_user).toBe(false);
        const ping = messageBody("1", { filename: "a.ogg", uploadedFilename: "u" }, 1, "", { channelId: "1", messageId: "9", mention: true }) as any;
        expect(ping.message_reference).toEqual({ channel_id: "1", message_id: "9" });
        expect("allowed_mentions" in ping).toBe(false);
    });

    test("where voice messages can be sent: DMs always, servers with all three permissions", () => {
        expect(canSendVoice(true, () => false)).toBe(true);
        const all = [PERMISSIONS.SEND_MESSAGES, PERMISSIONS.ATTACH_FILES, PERMISSIONS.SEND_VOICE_MESSAGES];
        expect(canSendVoice(false, p => all.includes(p))).toBe(true);
        for (const missing of all) expect(canSendVoice(false, p => all.includes(p) && p !== missing)).toBe(false);
        expect(nonce()).toMatch(/^\d{17,20}$/);
    });

    test("the clock and the recorder's type", () => {
        expect(clock(0)).toBe("0:00");
        expect(clock(75.9)).toBe("1:15");
        expect(clock(1200)).toBe("20:00");
        expect(recorderType(t => t.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
        expect(recorderType(t => t === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
        expect(recorderType(() => false)).toBe("");
    });
});

describe("Desktop Voice Messages: the chat bar patch", () => {
    test("the microphone goes in once, after the app launcher, and the code still parses", () => {
        const patch = PATCHES.chatButton;
        expect(matchesFind(CHAT_BAR, patch.find)).toBe(true);
        const re = canonicalizeMatch(patch.replace.match) as RegExp;
        expect(CHAT_BAR.match(new RegExp(re.source, "g"))?.length).toBe(1);
        const out = CHAT_BAR.replace(re, patch.replace.with.replaceAll("$self", "S"));
        expect(out).toContain('"appLauncher")),S?.chatButton?.(j,T,f),$&&j.push(');
        expect(() => new Function(`function x(){${out}}`)).not.toThrow();
    });
});
