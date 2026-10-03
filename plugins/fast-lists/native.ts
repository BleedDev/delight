/**
 * Main-process side of Fast Lists: whether a screen reader (or other assistive technology) is on.
 * Only Electron's main process can tell; the page asks every second, so turning one on mid-session
 * brings every row back within a second.
 */
import type { NativePlugin } from "@evi/api/native";
import { app } from "electron";

export default {
    /** Called from the renderer via ctx.native.call("accessibilityOn") */
    accessibilityOn() {
        return app.isAccessibilitySupportEnabled();
    },
} satisfies NativePlugin;
