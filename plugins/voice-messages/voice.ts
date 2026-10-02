/**
 * The parts of a voice message that aren't audio: its waveform, who may send one where, and the
 * message Discord's API takes. Pure: tests/voiceMessages.test.ts runs it.
 *
 * Discord's mobile apps send a voice message as one Ogg Opus attachment with `duration_secs` and a
 * `waveform` (base64 of up to 256 bytes, each a loudness from 0 to 255), on a message flagged
 * IS_VOICE_MESSAGE (1 << 13) with no text. Its web client reads both off an upload when it builds
 * the attachment ("durationSecs" in e && (a.duration_secs = ...), checked 2026-10-02).
 */

export const IS_VOICE_MESSAGE = 1 << 13;
/** Discord's limit on the phone apps */
export const MAX_SECONDS = 20 * 60;
export const MAX_BARS = 256;
/** Loudest bar below this (out of 255) is silence: about -40 dB */
const SILENCE = 3;

export const PERMISSIONS = {
    SEND_MESSAGES: 1n << 11n,
    ATTACH_FILES: 1n << 15n,
    SEND_VOICE_MESSAGES: 1n << 46n,
} as const;

/**
 * One loudness per bar, 0–255: about ten a second, at least as many as fit 32 (short clips), at most 256.
 * Scaled so the loudest bar is full height.
 */
export function waveform(samples: Float32Array, durationSecs: number): Uint8Array {
    if (!samples.length) return new Uint8Array(0);
    const count = Math.max(1, Math.min(MAX_BARS, samples.length, Math.max(32, Math.floor(durationSecs * 10))));
    const per = samples.length / count;
    const bars = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        const start = Math.floor(i * per), end = Math.max(start + 1, Math.floor((i + 1) * per));
        let sum = 0;
        for (let j = start; j < end; j++) sum += samples[j] * samples[j];
        bars[i] = Math.min(255, Math.round(Math.sqrt(sum / (end - start)) * 255));
    }
    // The loudest bar is full height, so a quietly recorded voice still shows its shape; near silence
    // (hiss, a muted mic) stays flat rather than being blown up
    const max = Math.max(...bars);
    if (max < SILENCE) return bars;
    for (let i = 0; i < count; i++) bars[i] = Math.min(255, Math.round(bars[i] * 255 / max));
    return bars;
}

export function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

/** A snowflake for "now", as Discord's clients make their message nonces */
export const nonce = (now = Date.now()) => ((BigInt(now) - 1420070400000n) << 22n).toString();

export interface ReplyTo { channelId: string; messageId: string; guildId?: string | null; mention: boolean; }

/** The body of POST /channels/:id/messages for an uploaded voice message */
export function messageBody(channelId: string, upload: { filename: string; uploadedFilename: string; }, durationSecs: number, wave: string, reply?: ReplyTo, now = Date.now()) {
    return {
        flags: IS_VOICE_MESSAGE,
        channel_id: channelId,
        content: "",
        nonce: nonce(now),
        sticker_ids: [],
        type: 0,
        attachments: [{
            id: "0",
            filename: upload.filename,
            uploaded_filename: upload.uploadedFilename,
            duration_secs: Math.round(durationSecs * 100) / 100,
            waveform: wave,
        }],
        ...reply && {
            message_reference: { channel_id: reply.channelId, message_id: reply.messageId, ...reply.guildId ? { guild_id: reply.guildId } : {} },
            ...!reply.mention && { allowed_mentions: { parse: ["users", "roles", "everyone"], replied_user: false } },
        },
    };
}

/** Whether a channel takes voice messages: always in DMs, in servers with send, attach and voice message permissions */
export function canSendVoice(isPrivate: boolean, can: (permission: bigint) => boolean): boolean {
    if (isPrivate) return true;
    return can(PERMISSIONS.SEND_MESSAGES) && can(PERMISSIONS.ATTACH_FILES) && can(PERMISSIONS.SEND_VOICE_MESSAGES);
}

/** 75 -> "1:15" */
export function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The MediaRecorder type to ask for: Ogg Opus when Chromium has it, else WebM Opus (remuxed after) */
export function recorderType(isSupported: (type: string) => boolean): string {
    for (const type of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"]) if (isSupported(type)) return type;
    return "";
}
