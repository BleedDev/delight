import { describe, expect, test } from "bun:test";

import {
    audioExtension, formatStamp, IS_VOICE_MESSAGE, isAudioAttachment, isVoiceMessage, sanitizeFilePart, toDate, voiceAttachment,
    voiceFilename,
} from "../plugins/voice-message-download/voice";

const voice = {
    url: "https://cdn.discordapp.com/attachments/1/2/voice-message.ogg?ex=a&is=b&hm=c",
    filename: "voice-message.ogg",
    content_type: "audio/ogg",
    waveform: "AAAA",
    duration_secs: 3.2,
};

describe("voice message detection", () => {
    test("needs the voice flag and an audio attachment", () => {
        expect(isVoiceMessage({ flags: IS_VOICE_MESSAGE, attachments: [voice] })).toBe(true);
        expect(isVoiceMessage({ flags: IS_VOICE_MESSAGE | 1, attachments: [voice] })).toBe(true);
        expect(isVoiceMessage({ flags: 0, attachments: [voice] })).toBe(false);
        expect(isVoiceMessage({ attachments: [voice] })).toBe(false);
        expect(isVoiceMessage({ flags: IS_VOICE_MESSAGE, attachments: [] })).toBe(false);
        expect(isVoiceMessage({ flags: IS_VOICE_MESSAGE })).toBe(false);
        expect(isVoiceMessage(null)).toBe(false);
        expect(isVoiceMessage(undefined)).toBe(false);
    });

    test("picks the audio attachment, skipping others and ones without a URL", () => {
        const image = { url: "https://cdn.discordapp.com/a.png", content_type: "image/png" };
        expect(voiceAttachment({ flags: IS_VOICE_MESSAGE, attachments: [image, voice] })).toBe(voice);
        expect(voiceAttachment({ flags: IS_VOICE_MESSAGE, attachments: [image] })).toBeUndefined();
        expect(voiceAttachment({ flags: IS_VOICE_MESSAGE, attachments: [{ ...voice, url: undefined }] })).toBeUndefined();
    });

    test("audio by content type, or by name and voice metadata without one", () => {
        expect(isAudioAttachment({ contentType: "audio/ogg" })).toBe(true);
        expect(isAudioAttachment({ content_type: "video/webm", filename: "a.webm" })).toBe(false);
        expect(isAudioAttachment({ filename: "voice-message.ogg" })).toBe(true);
        expect(isAudioAttachment({ waveform: "AAAA" })).toBe(true);
        expect(isAudioAttachment({ filename: "a.png" })).toBe(false);
        expect(isAudioAttachment(undefined)).toBe(false);
    });
});

describe("voice message file names", () => {
    const date = new Date(2026, 8, 7, 4, 5, 6);

    test("voice-<author>-<YYYY-MM-DD_HH-mm-ss>.ogg in local time", () => {
        expect(formatStamp(date)).toBe("2026-09-07_04-05-06");
        expect(voiceFilename("alica", date)).toBe("voice-alica-2026-09-07_04-05-06.ogg");
        expect(voiceFilename("alica", date, "opus")).toBe("voice-alica-2026-09-07_04-05-06.opus");
    });

    test("timestamps as Date, ISO string, epoch or moment-like", () => {
        expect(toDate(date)?.getTime()).toBe(date.getTime());
        expect(toDate(date.toISOString())?.getTime()).toBe(date.getTime());
        expect(toDate(date.getTime())?.getTime()).toBe(date.getTime());
        expect(toDate({ toDate: () => date })?.getTime()).toBe(date.getTime());
        expect(toDate("not a date")).toBeUndefined();
        expect(toDate(null)).toBeUndefined();
        expect(voiceFilename("a", "garbage", "ogg", () => date)).toBe("voice-a-2026-09-07_04-05-06.ogg");
    });

    test("author names are made safe for any file system", () => {
        expect(sanitizeFilePart("../evil/..\\name")).toBe("evil_.._name");
        expect(sanitizeFilePart("a:b*c?d\"e<f>g|h")).toBe("a_b_c_d_e_f_g_h");
        expect(sanitizeFilePart("Zoë Café")).toBe("Zoe_Cafe");
        expect(sanitizeFilePart("x".repeat(100))).toHaveLength(64);
        expect(voiceFilename("🎤🎤", date)).toBe("voice-unknown-2026-09-07_04-05-06.ogg");
        expect(voiceFilename(undefined, date)).toBe("voice-unknown-2026-09-07_04-05-06.ogg");
        expect(voiceFilename("  ", date)).toBe("voice-unknown-2026-09-07_04-05-06.ogg");
    });

    test("extension from the file name or URL, ogg by default", () => {
        expect(audioExtension(voice)).toBe("ogg");
        expect(audioExtension({ url: "https://x/a.MP3?x=1" })).toBe("mp3");
        expect(audioExtension({ filename: "clip" })).toBe("ogg");
        expect(audioExtension(undefined)).toBe("ogg");
    });
});
