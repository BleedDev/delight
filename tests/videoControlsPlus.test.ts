import { describe, expect, test } from "bun:test";

import {
    actionForKey, clampFps, clampSeekSeconds, clampSpeed, DEFAULT_FPS, estimateFps, formatPosition, formatSpeed, formatTime, frameDuration,
    frameStepTime, isArrowAction, MAX_SPEED, MIN_SPEED, seekTime, SPEEDS, stepSpeed, withShortcut,
} from "../plugins/video-controls-plus/controls";

describe("speeds", () => {
    test("the menu covers 0.25x to 3x in order", () => {
        expect(SPEEDS[0]).toBe(0.25);
        expect(SPEEDS[SPEEDS.length - 1]).toBe(3);
        expect([...SPEEDS]).toEqual([...SPEEDS].sort((a, b) => a - b));
        expect(SPEEDS).toContain(1);
    });

    test("clampSpeed keeps speeds in range and rejects garbage", () => {
        expect(clampSpeed(1.5)).toBe(1.5);
        expect(clampSpeed(10)).toBe(MAX_SPEED);
        expect(clampSpeed(0.1)).toBe(MIN_SPEED);
        expect(clampSpeed(0)).toBe(1);
        expect(clampSpeed(-2)).toBe(1);
        expect(clampSpeed(NaN)).toBe(1);
        expect(clampSpeed(undefined)).toBe(1);
        expect(clampSpeed(null)).toBe(1);
        expect(clampSpeed("2")).toBe(2);
        expect(clampSpeed("fast")).toBe(1);
        expect(clampSpeed(1.23456)).toBe(1.23);
    });

    test("stepSpeed moves one step and stops at the ends", () => {
        expect(stepSpeed(1, 1)).toBe(1.25);
        expect(stepSpeed(1, -1)).toBe(0.75);
        expect(stepSpeed(3, 1)).toBe(3);
        expect(stepSpeed(0.25, -1)).toBe(0.25);
        expect(stepSpeed(2, 1)).toBe(2.5);
        expect(stepSpeed(2.5, 1)).toBe(3);
    });

    test("stepSpeed from an off-step speed goes to the nearest step that way", () => {
        expect(stepSpeed(1.1, 1)).toBe(1.25);
        expect(stepSpeed(1.1, -1)).toBe(1);
        expect(stepSpeed(NaN, 1)).toBe(1.25);
    });

    test("formatSpeed", () => {
        expect(formatSpeed(1)).toBe("1×");
        expect(formatSpeed(1.5)).toBe("1.5×");
        expect(formatSpeed(0.25)).toBe("0.25×");
        expect(formatSpeed(99)).toBe("3×");
    });
});

describe("actionForKey", () => {
    test("maps the shortcuts", () => {
        expect(actionForKey({ key: " " })).toBe("togglePlay");
        expect(actionForKey({ key: "k" })).toBe("togglePlay");
        expect(actionForKey({ key: "K" })).toBe("togglePlay");
        expect(actionForKey({ key: "j" })).toBe("seekBack");
        expect(actionForKey({ key: "l" })).toBe("seekForward");
        expect(actionForKey({ key: "ArrowLeft" })).toBe("seekBack");
        expect(actionForKey({ key: "ArrowRight" })).toBe("seekForward");
        expect(actionForKey({ key: "m" })).toBe("mute");
        expect(actionForKey({ key: "f" })).toBe("fullscreen");
        expect(actionForKey({ key: "[" })).toBe("speedDown");
        expect(actionForKey({ key: "]" })).toBe("speedUp");
        expect(actionForKey({ key: "p" })).toBe("pip");
        expect(actionForKey({ key: "," })).toBe("frameBack");
        expect(actionForKey({ key: "." })).toBe("frameForward");
    });

    test("ignores other keys and modified presses", () => {
        expect(actionForKey({ key: "a" })).toBeNull();
        expect(actionForKey({ key: "Enter" })).toBeNull();
        expect(actionForKey({ key: "ArrowUp" })).toBeNull();
        expect(actionForKey({ key: "" })).toBeNull();
        expect(actionForKey({ key: "k", ctrlKey: true })).toBeNull();
        expect(actionForKey({ key: "f", metaKey: true })).toBeNull();
        expect(actionForKey({ key: "m", altKey: true })).toBeNull();
        expect(actionForKey({ key: " ", shiftKey: true })).toBeNull();
    });

    test("isArrowAction", () => {
        expect(isArrowAction({ key: "ArrowLeft" })).toBe(true);
        expect(isArrowAction({ key: "ArrowRight" })).toBe(true);
        expect(isArrowAction({ key: "j" })).toBe(false);
    });
});

describe("frames", () => {
    test("frame duration defaults to 30fps", () => {
        expect(frameDuration()).toBeCloseTo(1 / 30);
        expect(frameDuration(60)).toBeCloseTo(1 / 60);
        expect(frameDuration(0)).toBeCloseTo(1 / DEFAULT_FPS);
        expect(frameDuration(NaN)).toBeCloseTo(1 / DEFAULT_FPS);
        expect(clampFps(1000)).toBe(240);
        expect(clampFps(0.5)).toBe(1);
    });

    test("estimateFps snaps to common rates", () => {
        expect(estimateFps(Array(30).fill(1 / 30))).toBe(30);
        expect(estimateFps(Array(30).fill(1 / 60))).toBe(60);
        expect(estimateFps(Array(30).fill(1001 / 24000))).toBe(23.976);
        expect(estimateFps(Array(30).fill(1 / 25))).toBe(25);
    });

    test("estimateFps ignores dropped frames and bad samples", () => {
        const deltas = [...Array(20).fill(1 / 30), 2 / 30, 3 / 30, 0, -1, NaN, 5];
        expect(estimateFps(deltas)).toBe(30);
        expect(estimateFps([1 / 30, 1 / 30])).toBeUndefined();
        expect(estimateFps([])).toBeUndefined();
    });

    test("estimateFps rounds unusual rates", () => {
        expect(estimateFps(Array(10).fill(1 / 37))).toBe(37);
    });

    test("frameStepTime steps and clamps", () => {
        expect(frameStepTime(1, 1, 30, 10)).toBeCloseTo(1 + 1 / 30);
        expect(frameStepTime(1, -1, 30, 10)).toBeCloseTo(1 - 1 / 30);
        expect(frameStepTime(0, -1, 30, 10)).toBe(0);
        expect(frameStepTime(10, 1, 30, 10)).toBe(10);
        expect(frameStepTime(5, 1, undefined, NaN)).toBeCloseTo(5 + 1 / 30);
    });
});

describe("seeking", () => {
    test("seekTime clamps to the video", () => {
        expect(seekTime(10, 5, 60)).toBe(15);
        expect(seekTime(2, -5, 60)).toBe(0);
        expect(seekTime(58, 5, 60)).toBe(60);
        expect(seekTime(58, 5, Infinity)).toBe(63);
        expect(seekTime(58, 5, NaN)).toBe(63);
        expect(seekTime(NaN, 5, 60)).toBe(5);
    });

    test("clampSeekSeconds", () => {
        expect(clampSeekSeconds(5)).toBe(5);
        expect(clampSeekSeconds(0)).toBe(1);
        expect(clampSeekSeconds(100)).toBe(60);
        expect(clampSeekSeconds(2.6)).toBe(3);
        expect(clampSeekSeconds("x")).toBe(5);
    });
});

describe("time formatting", () => {
    test("formatTime", () => {
        expect(formatTime(0)).toBe("0:00");
        expect(formatTime(5.9)).toBe("0:05");
        expect(formatTime(62)).toBe("1:02");
        expect(formatTime(600)).toBe("10:00");
        expect(formatTime(3723)).toBe("1:02:03");
        expect(formatTime(-3)).toBe("0:00");
        expect(formatTime(NaN)).toBe("0:00");
        expect(formatTime(Infinity)).toBe("0:00");
    });

    test("formatPosition", () => {
        expect(formatPosition(42, 90)).toBe("0:42 / 1:30");
        expect(formatPosition(42, Infinity)).toBe("0:42");
        expect(formatPosition(42)).toBe("0:42");
    });

    test("withShortcut", () => {
        expect(withShortcut("Loop", "L")).toBe("Loop (L)");
        expect(withShortcut("Loop")).toBe("Loop");
    });
});
