/**
 * Pure pieces of Voice Chat Utilities, kept free of Discord so they can be tested.
 *
 * Every action is Discord's own member edit, the one its user menu uses:
 *     PATCH /guilds/{guildId}/members/{userId}  { channel_id } | { mute } | { deaf }
 * where channel_id null disconnects. The permission bits are Discord's (MUTE_MEMBERS 1<<22,
 * DEAFEN_MEMBERS 1<<23, MOVE_MEMBERS 1<<24), checked with PermissionStore.can in the channel.
 */

export const PERMS = {
    MUTE_MEMBERS: 1n << 22n,
    DEAFEN_MEMBERS: 1n << 23n,
    MOVE_MEMBERS: 1n << 24n,
} as const;

export const VOICE_TYPES = new Set([2, 13]);

export type Action =
    | { kind: "disconnect"; }
    | { kind: "move"; channelId: string; }
    | { kind: "mute"; value: boolean; }
    | { kind: "deafen"; value: boolean; };

export interface MemberVoice {
    userId: string;
    /** Server muted / deafened */
    mute?: boolean;
    deaf?: boolean;
}

/** The request body for one member */
export function bodyFor(action: Action): Record<string, unknown> {
    switch (action.kind) {
        case "disconnect": return { channel_id: null };
        case "move": return { channel_id: action.channelId };
        case "mute": return { mute: action.value };
        case "deafen": return { deaf: action.value };
    }
}

/** Everyone in the channel, you last so you're still there while the rest are handled */
export function targets(states: Record<string, MemberVoice> | undefined | null, me: string | undefined): string[] {
    const ids = Object.values(states ?? {}).map(s => s?.userId).filter((id): id is string => typeof id === "string");
    const unique = [...new Set(ids)];
    return me && unique.includes(me) ? [...unique.filter(id => id !== me), me] : unique;
}

/** Which of mute/unmute and deafen/undeafen make sense: only those that would change someone */
export function toggles(states: Record<string, MemberVoice> | undefined | null) {
    const list = Object.values(states ?? {});
    return {
        mute: list.some(s => !s.mute),
        unmute: list.some(s => s.mute),
        deafen: list.some(s => !s.deaf),
        undeafen: list.some(s => s.deaf),
    };
}

export interface RunResult {
    done: number;
    failed: number;
}

/** Runs `step` for each id one after another, `delayMs` apart, counting what worked */
export async function runSequential(ids: string[], step: (id: string) => Promise<unknown>, delayMs: number, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<RunResult> {
    const result: RunResult = { done: 0, failed: 0 };
    for (let i = 0; i < ids.length; i++) {
        if (i > 0 && delayMs > 0) await sleep(delayMs);
        try {
            await step(ids[i]);
            result.done++;
        } catch {
            result.failed++;
        }
    }
    return result;
}
