import { definePlugin } from "@evi/api";

/**
 * Everything happens at startup through `chromiumSwitches` in the manifest. `force_high_performance_gpu`
 * makes Chromium's GPU process pick the high-performance adapter when there are two, on Windows and
 * macOS (gpu_init.cc); with one GPU it changes nothing. Discord's own bootstrap accepts the same switch.
 * It used to be `enable-zero-copy`, which Chromium only uses when GPU rasterization is off, and
 * Discord has it on, so it did nothing.
 */
export default definePlugin({});
