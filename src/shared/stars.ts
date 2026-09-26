/**
 * Store stars, GitHub-style: one star per Evi install per item, counted by the evi.rest server
 * (server/index.ts). Shared by main, the renderer, the server and the tests.
 *
 *   GET    /api/stars                 { counts: { "plugin:fast-lists": 12, … }, mine: ["plugin:fast-lists"] }
 *   PUT    /api/stars/:kind/:id       star it, answers { count }
 *   DELETE /api/stars/:kind/:id       unstar it, answers { count }
 *
 * Requests carry the install's random id in X-Evi-Install; GET without it just has no `mine`.
 */
import { isPluginId } from "./store";

export const DEFAULT_API_URL = "https://evi.rest/api";

export type StarKind = "plugin" | "theme";

/** "plugin:fast-lists", "theme:midnight" */
export const starKey = (kind: StarKind, id: string) => `${kind}:${id}`;

export function parseStarKey(key: unknown): { kind: StarKind; id: string; } | undefined {
    if (typeof key !== "string") return;
    const [kind, id, ...rest] = key.split(":");
    if (rest.length || (kind !== "plugin" && kind !== "theme") || !isPluginId(id)) return;
    return { kind, id };
}

const INSTALL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A random v4 UUID, nothing about the person or the machine */
export const isInstallId = (id: unknown): id is string => typeof id === "string" && INSTALL_RE.test(id);

export interface StarsSnapshot {
    counts: Record<string, number>;
    mine: string[];
}

export type StarsResult = ({ ok: true; } & StarsSnapshot) | { ok: false; error: string; };
export type StarResult = { ok: true; count: number; starred: boolean; } | { ok: false; error: string; };

/** Cleans a server answer: known keys and whole, non-negative counts only */
export function parseStars(json: unknown): StarsSnapshot | undefined {
    if (!json || typeof json !== "object") return;
    const { counts, mine } = json as Record<string, unknown>;
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) return;
    const clean: Record<string, number> = {};
    for (const [key, n] of Object.entries(counts)) {
        if (parseStarKey(key) && Number.isSafeInteger(n) && (n as number) >= 0) clean[key] = n as number;
    }
    return { counts: clean, mine: Array.isArray(mine) ? mine.filter(k => !!parseStarKey(k)) : [] };
}
