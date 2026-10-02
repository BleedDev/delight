/**
 * Main-process side of Hover Converter. Discord's page can't reach the exchange rate APIs: its
 * Content-Security-Policy only allows connections to Discord's own hosts (and Evi doesn't loosen it),
 * so the rates are fetched here with Electron's net module and only the numbers go back.
 */
import type { NativePlugin } from "@evi/api/native";
import { net } from "electron";

/** The only two addresses it asks: rates per euro */
const SOURCES = {
    ecb: "https://api.frankfurter.dev/v1/latest?base=EUR",
    other: "https://open.er-api.com/v6/latest/EUR",
} as const;
const TIMEOUT = 15_000;

async function ratesFrom(url: string): Promise<Record<string, number>> {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    const body = await res.json();
    const out: Record<string, number> = {};
    for (const [code, v] of Object.entries(body?.rates ?? {})) {
        if (/^[A-Z]{3}$/.test(code) && typeof v === "number" && v > 0) out[code] = v;
    }
    return out;
}

export default {
    /** ctx.native.call("rates") -> { ecb, other }: each source's rates per euro, or its error */
    async rates() {
        const [ecb, other] = await Promise.allSettled([ratesFrom(SOURCES.ecb), ratesFrom(SOURCES.other)]);
        const result = (r: PromiseSettledResult<Record<string, number>>) => r.status === "fulfilled" ? { rates: r.value } : { error: String(r.reason?.message ?? r.reason) };
        return { ecb: result(ecb), other: result(other) };
    },
} satisfies NativePlugin;
