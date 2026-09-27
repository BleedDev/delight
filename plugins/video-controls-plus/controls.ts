/**
 * Pure logic for Video Controls+: speed steps, key mapping, frame timing and time formatting.
 * No DOM here, so it can be tested with bun test.
 */

/** The speeds offered in the menu and stepped through with [ and ] */
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const MIN_SPEED = SPEEDS[0];
export const MAX_SPEED = SPEEDS[SPEEDS.length - 1];

export const DEFAULT_FPS = 30;
export const MIN_FPS = 1;
export const MAX_FPS = 240;

/** Frame rates videos actually use; an estimate close to one of these is snapped to it */
const COMMON_FPS = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120, 144, 240];

/** Any number to a playable speed in range, rounded to hundredths. Garbage becomes 1. */
export function clampSpeed(value: unknown): number {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, n)) * 100) / 100;
}

/**
 * The next speed in SPEEDS above (direction 1) or below (-1) the current one. A speed between two
 * steps (set by Discord's own menu, say) moves to the nearest step in that direction.
 */
export function stepSpeed(current: number, direction: 1 | -1): number {
    const speed = clampSpeed(current);
    const eps = 1e-6;
    if (direction > 0) return SPEEDS.find(s => s > speed + eps) ?? MAX_SPEED;
    for (let i = SPEEDS.length - 1; i >= 0; i--) if (SPEEDS[i] < speed - eps) return SPEEDS[i];
    return MIN_SPEED;
}

/** "1×", "1.5×", "0.25×" */
export function formatSpeed(speed: number): string {
    return `${Number(clampSpeed(speed).toFixed(2))}×`;
}

export type Action =
    | "togglePlay"
    | "seekBack"
    | "seekForward"
    | "mute"
    | "fullscreen"
    | "speedDown"
    | "speedUp"
    | "pip"
    | "frameBack"
    | "frameForward";

export interface KeyInput {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
}

const KEY_ACTIONS: Record<string, Action> = {
    " ": "togglePlay",
    k: "togglePlay",
    j: "seekBack",
    l: "seekForward",
    arrowleft: "seekBack",
    arrowright: "seekForward",
    m: "mute",
    f: "fullscreen",
    "[": "speedDown",
    "]": "speedUp",
    p: "pip",
    ",": "frameBack",
    ".": "frameForward",
};

/** The action for a key press, or null. Any modifier (Shift included) means it isn't ours. */
export function actionForKey(e: KeyInput): Action | null {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    if (!e.key) return null;
    return KEY_ACTIONS[e.key.toLowerCase()] ?? null;
}

/** Arrow keys also move through items in Discord's media viewer, so they only seek in some places */
export function isArrowAction(e: KeyInput): boolean {
    return e.key === "ArrowLeft" || e.key === "ArrowRight";
}

export function clampFps(fps: unknown): number {
    const n = typeof fps === "number" ? fps : NaN;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_FPS;
    return Math.min(MAX_FPS, Math.max(MIN_FPS, n));
}

/** Seconds per frame */
export function frameDuration(fps?: number): number {
    return 1 / clampFps(fps);
}

/**
 * Frame rate from the media-time gaps between presented frames (requestVideoFrameCallback), or
 * undefined if there isn't enough to go on. Uses the median gap so dropped frames don't skew it,
 * then snaps to the nearest common rate within 3%.
 */
export function estimateFps(deltas: readonly number[]): number | undefined {
    const valid = deltas.filter(d => Number.isFinite(d) && d > 1 / (MAX_FPS * 2) && d < 1).sort((a, b) => a - b);
    if (valid.length < 5) return undefined;
    const mid = valid.length >> 1;
    const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
    const raw = 1 / median;
    let snapped: number | undefined, best = 0.03;
    for (const f of COMMON_FPS) {
        const error = Math.abs(f - raw) / f;
        if (error < best) [snapped, best] = [f, error];
    }
    return clampFps(snapped ?? Math.round(raw));
}

function finiteDuration(duration: number | undefined): number {
    return typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : Infinity;
}

/** current + delta, kept within [0, duration] (an unknown duration only clamps at 0) */
export function seekTime(current: number, delta: number, duration?: number): number {
    const now = Number.isFinite(current) ? current : 0;
    return Math.min(finiteDuration(duration), Math.max(0, now + delta));
}

/** The time one frame before or after the current one */
export function frameStepTime(current: number, direction: 1 | -1, fps?: number, duration?: number): number {
    return seekTime(current, direction * frameDuration(fps), duration);
}

/** "0:05", "1:02:03". Negative, NaN and Infinity show as 0:00. */
export function formatTime(seconds: number): string {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "0:42 / 1:30", or just the position when the duration isn't known */
export function formatPosition(current: number, duration?: number): string {
    const d = finiteDuration(duration);
    return d === Infinity ? formatTime(current) : `${formatTime(current)} / ${formatTime(d)}`;
}

/** Clamps the seek step setting */
export function clampSeekSeconds(value: unknown): number {
    const n = typeof value === "number" ? value : NaN;
    if (!Number.isFinite(n)) return 5;
    return Math.min(60, Math.max(1, Math.round(n)));
}

/** Label with its keyboard shortcut, for button titles */
export function withShortcut(label: string, shortcut?: string): string {
    return shortcut ? `${label} (${shortcut})` : label;
}
