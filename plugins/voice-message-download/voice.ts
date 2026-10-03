/** Pure helpers for Voice Message Download, unit tested in tests/voiceMessageDownload.test.ts */

/** Discord's MessageFlags.IS_VOICE_MESSAGE */
export const IS_VOICE_MESSAGE = 1 << 13;

export interface VoiceAttachment {
    url?: string;
    proxy_url?: string;
    filename?: string;
    content_type?: string;
    contentType?: string;
    waveform?: string;
    duration_secs?: number;
}

const AUDIO_NAME = /\.(ogg|oga|opus|mp3|m4a|wav|webm)(?:$|[?#])/i;

/** Whether an attachment is audio, by content type or, without one, by file name or voice metadata */
export function isAudioAttachment(a: VoiceAttachment | null | undefined): boolean {
    if (!a) return false;
    const type = a.content_type ?? a.contentType;
    if (type) return type.startsWith("audio/");
    return a.waveform != null || a.duration_secs != null || AUDIO_NAME.test(a.filename ?? "") || AUDIO_NAME.test(a.url ?? "");
}

/** The voice recording of a voice message, if the message is one */
export function voiceAttachment(message: { flags?: number; attachments?: VoiceAttachment[]; } | null | undefined): VoiceAttachment | undefined {
    if (!message || ((message.flags ?? 0) & IS_VOICE_MESSAGE) === 0) return;
    const audio = (message.attachments ?? []).find(isAudioAttachment);
    return audio?.url || audio?.proxy_url ? audio : undefined;
}

export const isVoiceMessage = (message: Parameters<typeof voiceAttachment>[0]) => !!voiceAttachment(message);

/** Letters, digits, dot, dash and underscore; everything else (path separators, reserved chars) becomes "_" */
export function sanitizeFilePart(text: string): string {
    return text
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[^\w.-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^[_.]+|[_.]+$/g, "")
        .slice(0, 64);
}

/** Accepts a Date, an ISO string / epoch number, or a moment-like object with toDate() */
export function toDate(value: unknown): Date | undefined {
    if (value == null) return;
    const candidate = value instanceof Date
        ? value
        : typeof (value as any).toDate === "function" ? (value as any).toDate()
            : typeof value === "string" || typeof value === "number" ? new Date(value) : undefined;
    return candidate instanceof Date && !isNaN(candidate.getTime()) ? candidate : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD_HH-mm-ss in local time */
export function formatStamp(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** The recording's extension from its file name or URL, "ogg" by default */
export function audioExtension(a: VoiceAttachment | undefined): string {
    const match = AUDIO_NAME.exec(a?.filename ?? "") ?? AUDIO_NAME.exec(a?.url ?? "");
    return match ? match[1].toLowerCase() : "ogg";
}

/** voice-<author>-<YYYY-MM-DD_HH-mm-ss>.ogg; falls back to "unknown" and to now */
export function voiceFilename(author: string | null | undefined, timestamp: unknown, extension = "ogg", now: () => Date = () => new Date()): string {
    const name = sanitizeFilePart(author ?? "") || "unknown";
    return `voice-${name}-${formatStamp(toDate(timestamp) ?? now())}.${extension}`;
}
