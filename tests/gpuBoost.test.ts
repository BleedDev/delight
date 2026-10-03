import { describe, expect, test } from "bun:test";

import manifest from "../plugins/gpu-boost/manifest.json";

describe("gpu-boost", () => {
    test("asks Chromium for the high-performance GPU, nothing else", () => {
        // enable-zero-copy only applies with GPU rasterization off, and Discord has it on
        expect(manifest.chromiumSwitches).toEqual({ force_high_performance_gpu: true });
    });

    test("stays opt-in: it costs battery on laptops", () => {
        expect((manifest as { enabledByDefault?: boolean; }).enabledByDefault).not.toBe(true);
    });
});
