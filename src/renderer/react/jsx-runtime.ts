/**
 * Target of every `react/jsx-runtime` import, ours and plugins'. Forwards to Discord's runtime so
 * elements are created by the exact React instance that renders them.
 */
import { unlazy } from "../utils/lazy";
import { JsxRuntime } from "../webpack/common";

export const Fragment = Symbol.for("react.fragment");

// Resolved once on first use: going through the lazy proxy on every element would cost a trap per call
let runtime: typeof import("react/jsx-runtime") | undefined;

export function jsx(type: any, props: any, key?: any) {
    return (runtime ??= unlazy(JsxRuntime)).jsx(type, props, key);
}

export function jsxs(type: any, props: any, key?: any) {
    return (runtime ??= unlazy(JsxRuntime)).jsxs(type, props, key);
}

export const jsxDEV = jsx;
