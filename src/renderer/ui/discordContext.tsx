/**
 * Discord's newer components (text, buttons, inputs: "Mana") read a context Discord provides around
 * its app. Evi's own windows are separate React roots, outside it: every one of those components
 * then warned "useManaContext must be used within a ManaContext.Provider", hundreds per render, each
 * through Discord's error tracker, and turning a plugin on froze the panel for a moment.
 *
 * The context isn't exported, so it's taken from Discord's rendered tree: the provider whose value
 * has Mana's fields. Its current value is read each time an Evi window opens (the theme can change).
 */
import type { Context, ReactNode } from "react";

import { React } from "../webpack/common";

let context: Context<unknown> | null | undefined;

const isManaValue = (v: any) => !!v && typeof v === "object" && "saturation" in v && "locale" in v && "theme" in v && "defaultLayerContext" in v;

/** Discord's Mana context and its current value, found in its app's fiber tree */
function findMana(): { context: Context<unknown>; value: unknown; } | undefined {
    if (context === null) return;
    const container = document.getElementById("app-mount");
    const key = container && Object.keys(container).find(k => k.startsWith("__reactContainer$"));
    if (!key) return;
    const stack = [(container as any)[key]];
    let visited = 0;
    while (stack.length && visited++ < 20_000) {
        const fiber = stack.pop();
        if (!fiber) continue;
        // React 18 marks providers with type._context, React 19 uses the context itself as the type
        const ctx = fiber.type?._context ?? (fiber.type?.$$typeof === Symbol.for("react.context") ? fiber.type : undefined);
        if (ctx && (!context || ctx === context) && isManaValue(fiber.memoizedProps?.value)) {
            context = ctx;
            return { context: ctx, value: fiber.memoizedProps.value };
        }
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
    }
}

/** Wraps an Evi root in Discord's app contexts, so Discord's components inside it behave as in Discord */
export function DiscordContext({ children }: { children: ReactNode; }) {
    const [mana] = React.useState(findMana);
    if (!mana) return <>{children}</>;
    const Provider = (mana.context as any).Provider ?? mana.context;
    return <Provider value={mana.value}>{children}</Provider>;
}
