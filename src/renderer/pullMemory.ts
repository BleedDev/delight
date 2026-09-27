/**
 * Which pulls (shared/pulls.ts) the user was already told about, so Evi says it once per pull
 * rather than at every start. Plain functions, no Discord or Evi state, so they can be tested on
 * their own.
 */
import type { PulledPlugin } from "@shared/pulls";

/** Pulls already told about: key -> epoch ms it was said */
export type PullMemory = Record<string, number>;

/** Pulled again later is a new pull (a new `at`), and is said again */
export const pullKey = (id: string, pull: Pick<PulledPlugin, "at">) => `${id}@${pull.at}`;

export function readPullMemory(raw: string | null | undefined): PullMemory {
    try {
        const parsed = JSON.parse(raw ?? "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number"));
    } catch {
        return {};
    }
}

export interface PulledInstall {
    id: string;
    pull: PulledPlugin;
    /** Turned on: it was running, or would have. Pulls of plugins that were off anyway aren't news. */
    enabled: boolean;
}

/**
 * The pulls to tell the user about now, and the memory to save. Only pulls that still apply are
 * remembered, so the memory never grows past the plugins that are pulled right now.
 */
export function unseenPulls<T extends PulledInstall>(pulled: T[], memory: PullMemory, now: number): { due: T[]; memory: PullMemory; } {
    const kept: PullMemory = {};
    const due: T[] = [];
    for (const p of pulled) {
        const key = pullKey(p.id, p.pull);
        if (key in memory) kept[key] = memory[key];
        else if (p.enabled) {
            due.push(p);
            kept[key] = now;
        }
    }
    return { due, memory: kept };
}
