/**
 * Preloaded by `bun test` (bunfig.toml). Evi's JSX compiles to `react/jsx-runtime`, which the build
 * points at src/renderer/react/jsx-runtime.ts (Discord's own React at runtime). Tests do the same,
 * so importing a .tsx module never depends on a `react` package being installed: the repo has none.
 */
import { mock } from "bun:test";

import * as shim from "../src/renderer/react/jsx-runtime";

mock.module("react/jsx-runtime", () => shim);
mock.module("react/jsx-dev-runtime", () => shim);
