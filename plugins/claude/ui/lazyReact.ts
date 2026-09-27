// Evi evaluates plugins before Discord's modules (and so its React) are ready, so nothing here may call React at
// module load. These create contexts and memo components on first use instead.
import { createContext, createElement, memo, type ComponentType, type Context } from "react";

export function lazyContext<T>(initial: T): () => Context<T> {
    let ctx: Context<T> | undefined;
    return () => (ctx ??= createContext(initial));
}

export function lazyMemo<P extends object>(component: ComponentType<P>, equal?: (a: Readonly<P>, b: Readonly<P>) => boolean): ComponentType<P> {
    let M: any;
    const Wrapper = (props: P) => createElement((M ??= memo(component as any, equal as any)), props as any);
    Wrapper.displayName = component.displayName ?? component.name;
    return Wrapper as ComponentType<P>;
}
