import { describe, expect, test } from "bun:test";

import { arrowHead, blockFor, canMarkUp, isTiny, outputType, rectFrom, strokeFor } from "../plugins/quick-markup/draw";

describe("Quick Markup", () => {
    const size = { w: 1000, h: 500 };

    test("a drag in any direction is the same rectangle, kept inside the picture", () => {
        expect(rectFrom({ x: 10, y: 20 }, { x: 110, y: 70 }, size)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
        expect(rectFrom({ x: 110, y: 70 }, { x: 10, y: 20 }, size)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
        expect(rectFrom({ x: -50, y: 400 }, { x: 1200, y: 900 }, size)).toEqual({ x: 0, y: 400, w: 1000, h: 100 });
        expect(isTiny(rectFrom({ x: 5, y: 5 }, { x: 7, y: 30 }, size))).toBe(true);
    });

    test("blur blocks are big enough to hide text, lines scale with the picture", () => {
        expect(blockFor({ x: 0, y: 0, w: 300, h: 30 })).toBe(8);
        expect(blockFor({ x: 0, y: 0, w: 300, h: 120 })).toBe(20);
        expect(strokeFor({ w: 400, h: 300 })).toBe(3);
        expect(strokeFor({ w: 3840, h: 2160 })).toBe(15);
    });

    test("the arrow head points back along the line", () => {
        const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
        expect(l.x).toBeLessThan(100);
        expect(r.x).toBeLessThan(100);
        expect(Math.sign(l.y)).toBe(-Math.sign(r.y));
    });

    test("PNG, JPEG and WebP keep their type; still pictures only", () => {
        expect(outputType("image/jpeg", "a.jpg")).toEqual({ type: "image/jpeg", name: "a.jpg" });
        expect(outputType("image/bmp", "shot.bmp")).toEqual({ type: "image/png", name: "shot.png" });
        expect(outputType("image/png", "shot.png")).toEqual({ type: "image/png", name: "shot.png" });
        expect(canMarkUp({ type: "image/png", name: "a.png" })).toBe(true);
        expect(canMarkUp({ type: "image/gif", name: "a.gif" })).toBe(false);
        expect(canMarkUp({ type: "video/mp4", name: "a.mp4" })).toBe(false);
    });
});
