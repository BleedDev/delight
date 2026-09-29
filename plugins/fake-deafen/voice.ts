import type { SourcePatch } from "@evi/api";

/**
 * Pure pieces of Fake Deafen, kept free of Discord so they can be tested.
 *
 * Discord keeps one gateway socket for the whole session (GatewayConnectionStore.getSocket()), and
 * every change to your voice state goes out through its
 *     voiceStateUpdate({guildId,channelId,selfMute,selfDeaf,selfVideo,preferredRegion,...,flags})
 * which sends op 4 (VOICE_STATE_UPDATE). What the server gets is only that message: whether you
 * hear anything is decided locally by the media engine. So telling the server selfDeaf while the
 * media engine keeps playing is all fake deafen is.
 */

export interface VoiceState {
    guildId?: string | null;
    channelId?: string | null;
    selfMute?: boolean;
    selfDeaf?: boolean;
    [key: string]: unknown;
}

/** How a toggle reached the server: sent now, not in voice, or in voice but nothing to resend yet */
export type ResendResult = "sent" | "idle" | "pending";

export interface FakeOptions {
    deafen: boolean;
    mute: boolean;
}

/**
 * What to tell the server instead of `real`: deafened and/or muted on top of your real state, never
 * less. Leaving a channel (no channelId) goes through untouched.
 */
export function fakeState(real: VoiceState, options: FakeOptions): VoiceState {
    if (real.channelId == null) return real;
    return {
        ...real,
        selfDeaf: !!real.selfDeaf || options.deafen,
        selfMute: !!real.selfMute || options.mute || options.deafen,
    };
}

export const PATCHES = {
    /**
     * Discord's voice state committer, the one that calls socket.voiceStateUpdate:
     *     H=new class extends M{socket;constructor(e){super(),this.socket=e}get guildId(){...}...computeVoiceFlags(){...}
     * Its forceUpdate() resends the whole real state (camera, regions, recording and clips flags),
     * so toggling doesn't have to rebuild it. The object isn't exported, so the constructor hands it over.
     */
    committer: {
        find: "computeVoiceFlags(){",
        replace: {
            match: /(constructor\((\i)\)\{super\(\),this\.socket=\2)(?=\}get guildId\(\))/,
            with: "$1,$self?.captureCommitter?.(this)",
        },
    },
} satisfies Record<string, SourcePatch>;
