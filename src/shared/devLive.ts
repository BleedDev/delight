/**
 * The developers' numbers (GET /v1/admin/live, server/src/usage.ts), as Evi's Developers page reads
 * them. Anything malformed becomes zero or is left out.
 */

export interface DevLive {
    at: number;
    now: { online: number; connections: number; versions: { version: string; count: number; }[]; };
    today: { active: number; peak: number; };
    /** Oldest first, today last */
    days: { day: string; active: number; peak: number; }[];
    people: { accounts: number; linked: number; };
    topPlugins: { id: string; name: string; installs: number; }[];
    store: { plugins: number; waiting: number; reports: number; };
}

const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const str = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
const list = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, max) : [];

export function parseDevLive(raw: any): DevLive {
    return {
        at: n(raw?.at),
        now: {
            online: n(raw?.now?.online),
            connections: n(raw?.now?.connections),
            versions: list(raw?.now?.versions, 30).map((v: any) => ({ version: str(v?.version, 40) || "unknown", count: n(v?.count) })),
        },
        today: { active: n(raw?.today?.active), peak: n(raw?.today?.peak) },
        days: list(raw?.days, 400).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d?.day)).map((d: any) => ({ day: d.day, active: n(d.active), peak: n(d.peak) })),
        people: { accounts: n(raw?.people?.accounts), linked: n(raw?.people?.linked) },
        topPlugins: list(raw?.topPlugins, 20).map((p: any) => ({ id: str(p?.id, 64), name: str(p?.name, 100) || str(p?.id, 64), installs: n(p?.installs) })),
        store: { plugins: n(raw?.store?.plugins), waiting: n(raw?.store?.waiting), reports: n(raw?.store?.reports) },
    };
}

/** The last `count` days ending today, with a zero for days evi.rest has no row for */
export function fillDays(days: DevLive["days"], today: string, count = 30): DevLive["days"] {
    const byDay = new Map(days.map(d => [d.day, d]));
    const end = Date.parse(`${today}T00:00:00Z`);
    return Array.from({ length: count }, (_, i) => {
        const day = new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        return byDay.get(day) ?? { day, active: 0, peak: 0 };
    });
}
