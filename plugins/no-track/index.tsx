import { definePlugin, React, useLocale } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { t } from "./strings";

function BlockedCounter({ ctx }: { ctx: PluginContext; }) {
    useLocale();
    const [count, setCount] = React.useState<number | null>(null);

    React.useEffect(() => {
        let alive = true;
        const refresh = () => ctx.native.call<number>("getBlockedCount").then(n => alive && setCount(n));
        refresh();
        const timer = setInterval(refresh, 2000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, []);

    return (
        <p className="dl-hint" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
            {count === null ? t("counter.loading") : t("counter.blocked", { count })}
        </p>
    );
}

/** The blocking itself happens in native.ts, in the main process. This part only shows stats. */
export default definePlugin({
    settingsPanel: ctx => <BlockedCounter ctx={ctx} />,
});
