/**
 * Layers: dialogs and popovers rendered into their own root on <body>, with Discord's motion.
 *
 * Measured from Discord's own bundle: a modal fades and springs up from 90% scale (tension 1000,
 * friction 48, a hair of overshoot) a frame after its backdrop starts fading in, and on close
 * shrinks back to 90% while fading out (tension 1200, friction 80). A popout slides 10px towards
 * where it ends up. The springs are baked into `linear()` curves below.
 *
 * Markup opts in with classes: `evi-scrim` on the backdrop, `evi-modal` on a centred dialog,
 * `evi-popout` on a popover (with `data-side="top"` etc. for the side of its anchor it sits on).
 * `openLayer` sets `data-closing` on its container when it closes, plays the exit animations and
 * unmounts once they finish. `exitDone` is that last step, for layers mounted some other way.
 */
import type { ReactNode } from "react";

import { createStyle } from "../styles";
import { createRoot } from "../webpack/common";

const SPRING_IN = "linear(0, 0.08, 0.252, 0.447, 0.625, 0.769, 0.875, 0.946, 0.99, 1.014, 1.024, 1.026, 1.023, 1.018, 1.013, 1.009, 1)";
const SPRING_OUT = "linear(0, 0.149, 0.382, 0.578, 0.721, 0.821, 0.889, 0.935, 0.965, 0.986, 1)";

/** Evi's own dialogs (ui/) use the same classes */
export const layerCss = `
:root {
    --evi-spring-in: ${SPRING_IN};
    --evi-spring-out: ${SPRING_OUT};
    --evi-modal-in: 230ms;
    --evi-modal-out: 200ms;
}
/* Clicks go to what's underneath while it fades out */
:is(.evi-scrim, .evi-modal, .evi-popout):is([data-closing], [data-closing] *) { pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
    :root:not(.reduce-motion) .evi-scrim { animation: evi-scrim-in 200ms ease-out; }
    :root:not(.reduce-motion) .evi-modal { animation: evi-modal-in var(--evi-modal-in) var(--evi-spring-in) 64ms backwards; }
    :root:not(.reduce-motion) .evi-popout { animation: evi-popout-in 200ms ease-out; }
    :root:not(.reduce-motion) :is([data-closing] .evi-scrim, .evi-scrim[data-closing]) { animation: evi-scrim-out var(--evi-modal-out) var(--evi-spring-out) forwards; }
    :root:not(.reduce-motion) :is([data-closing] .evi-modal, .evi-modal[data-closing]) { animation: evi-modal-out var(--evi-modal-out) var(--evi-spring-out) forwards; }
    :root:not(.reduce-motion) :is([data-closing] .evi-popout, .evi-popout[data-closing]) { animation: evi-popout-out 100ms ease-in forwards; }
}
@keyframes evi-scrim-in { from { opacity: 0; } }
@keyframes evi-scrim-out { to { opacity: 0; } }
@keyframes evi-modal-in { from { opacity: 0; scale: 0.9; } }
@keyframes evi-modal-out { to { opacity: 0; scale: 0.9; } }
.evi-popout { --evi-popout-from: 0 10px; }
.evi-popout[data-side="top"] { --evi-popout-from: 0 -10px; }
.evi-popout[data-side="left"] { --evi-popout-from: -10px 0; }
.evi-popout[data-side="right"] { --evi-popout-from: 10px 0; }
@keyframes evi-popout-in { from { opacity: 0; translate: var(--evi-popout-from); } 50% { opacity: 1; } }
@keyframes evi-popout-out { to { opacity: 0; } }
`;

let styled = false;
/** Evi installs it at boot, before themes, so a theme can restyle the motion */
export function installLayerStyles() {
    if (styled) return;
    styled = true;
    createStyle(layerCss, "evi-layer-motion");
}

/**
 * Resolves when the finite animations running inside `el` have finished: call it right after
 * setting whatever starts the exit. Infinite ones (spinners) don't count; nothing running
 * (reduced motion) resolves at once. Capped, so a stuck animation can't keep a layer around.
 */
export function exitDone(el: Element | null | undefined, maxMs = 500): Promise<void> {
    if (!el) return Promise.resolve();
    installLayerStyles();
    // getAnimations flushes styles, so the exit animations the attribute just started are included
    const running = el.getAnimations({ subtree: true }).filter(a => {
        const end = a.effect?.getComputedTiming().endTime;
        return typeof end === "number" && Number.isFinite(end);
    });
    if (!running.length) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(resolve, maxMs);
        Promise.allSettled(running.map(a => a.finished)).then(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

export interface LayerOptions {
    /** Class for the container, e.g. one that stacks it above Discord's own layers */
    className?: string;
    /** Called once it's gone from the page */
    onClosed?(): void;
}

/** Closes the layer. `{ instant: true }` skips the exit, for when its plugin is stopping. */
export type CloseLayer = (options?: { instant?: boolean; }) => void;

/**
 * Renders `render(close)` into a new root on <body>. Returns `close`, which plays the exit
 * animation and then unmounts. Calling it again while it's closing does nothing, unless
 * `instant` asks to finish now.
 */
export function openLayer(render: (close: CloseLayer) => ReactNode, options: LayerOptions = {}): CloseLayer {
    installLayerStyles();
    const container = document.createElement("div");
    if (options.className) container.className = options.className;
    document.body.append(container);
    const root = createRoot(container);
    let state: "open" | "closing" | "closed" = "open";

    const finish = () => {
        if (state === "closed") return;
        state = "closed";
        root.unmount();
        container.remove();
        options.onClosed?.();
    };
    const close: CloseLayer = ({ instant } = {}) => {
        if (instant) return finish();
        if (state !== "open") return;
        state = "closing";
        container.setAttribute("data-closing", "");
        void exitDone(container).then(finish);
    };

    root.render(render(close));
    return close;
}
