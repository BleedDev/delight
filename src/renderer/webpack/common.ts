/**
 * Discord internals most plugins need, resolved lazily so they can be imported at any time.
 */
import type * as ReactTypes from "react";

import { lazy } from "../utils/lazy";
import { filters, find, findStore, waitFor } from "./find";

// Every top-level React export across 18 and 19. Needed by CommonJS interop that copies keys at require time.
const REACT_KEYS = [
    "Children", "Component", "Fragment", "Profiler", "PureComponent", "StrictMode", "Suspense", "Activity",
    "cloneElement", "createContext", "createElement", "createRef", "forwardRef", "isValidElement", "lazy", "memo",
    "startTransition", "use", "useActionState", "useCallback", "useContext", "useDebugValue", "useDeferredValue",
    "useEffect", "useId", "useImperativeHandle", "useInsertionEffect", "useLayoutEffect", "useMemo", "useOptimistic",
    "useReducer", "useRef", "useState", "useSyncExternalStore", "useTransition", "version",
];

function required<T>(value: T | undefined, what: string): T {
    if (value == null) throw new Error(`Evi: could not find ${what}`);
    return value;
}

const reactFilter = filters.byProps("useState", "createElement", "Component");
export const React: typeof ReactTypes = lazy(
    () => required(find(reactFilter), "React"),
    REACT_KEYS,
);

export const ReactDOM: typeof import("react-dom") = lazy(() => required(find(filters.byProps("createPortal", "flushSync")), "ReactDOM"));

const reactDomClientFilter = filters.byProps("createRoot");
export const createRoot: typeof import("react-dom/client").createRoot = lazy(
    () => required(find<typeof import("react-dom/client")>(reactDomClientFilter), "react-dom/client").createRoot,
);

let reactDomClientLoaded = false;
let reactDomClientQueue: (() => void)[] | undefined;

/** Calls back once createRoot can be used: one lookup for every popup of Evi's that waits for it */
export function onCreateRootReady(callback: () => void) {
    if (reactDomClientLoaded) return callback();
    if (reactDomClientQueue) return void reactDomClientQueue.push(callback);
    reactDomClientQueue = [];
    waitFor(reactDomClientFilter, () => {
        reactDomClientLoaded = true;
        for (const queued of reactDomClientQueue!.splice(0)) {
            try {
                queued();
            } catch (err) {
                console.error("[Evi] waitFor callback threw", err);
            }
        }
    });
    // Already loaded: waitFor called back right away, and so does this, throwing to the caller like it would
    if (reactDomClientLoaded) callback();
    else reactDomClientQueue.push(callback);
}

/** Discord's own react/jsx-runtime, used by our JSX shim */
export const JsxRuntime: typeof import("react/jsx-runtime") = lazy(() => required(find(filters.byProps("jsx", "jsxs", "Fragment")), "jsx-runtime"));

export interface FluxAction {
    type: string;
    [key: string]: any;
}

export interface FluxDispatcher {
    dispatch(action: FluxAction): Promise<void>;
    subscribe(type: string, handler: (action: FluxAction) => void): void;
    unsubscribe(type: string, handler: (action: FluxAction) => void): void;
}

const dispatcherFilter = filters.byProps("dispatch", "subscribe", "_actionHandlers");
export const Dispatcher: FluxDispatcher = lazy(() => required(find(dispatcherFilter), "FluxDispatcher"));

/** A Flux store by name, e.g. getStore("UserStore") */
export function getStore<T = any>(name: string): T {
    return required(findStore<T>(name), `store ${name}`);
}

/** Calls back once React and the Flux dispatcher are available */
export function onCommonReady(callback: () => void) {
    let pending = 2;
    const done = () => --pending === 0 && callback();
    waitFor(reactFilter, done);
    waitFor(dispatcherFilter, done);
}
