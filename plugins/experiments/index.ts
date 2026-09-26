import { definePlugin } from "@evi/api";

/**
 * Source patch example. DeveloperExperimentStore defines
 *     Object.defineProperties(this, { isDeveloper: { configurable: !1, get: () => c, ... } })
 * and we make that getter return true.
 */
export default definePlugin({
    patches: [
        {
            find: "Object.defineProperties(this,{isDeveloper",
            replace: {
                match: /(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/,
                with: "true",
            },
        },
    ],
});
