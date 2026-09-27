import type { PermissionKey } from "./declaredPermissions";

/**
 * What each plugin actually did, as opposed to what it can do (pluginPermissions.ts): the requests it
 * sent, the full-access calls it made and what Evi refused because its manifest doesn't declare it
 * (declaredPermissions.ts), for the "Activity" section of its details.
 *
 * Privacy first: a request is kept as its method, host and path, never its query string, fragment,
 * credentials or body, and path segments that look like keys or tokens are masked. Pure: no DOM, no
 * network, no disk, shared by the renderer and the tests.
 */

/** Per plugin: older events are dropped past this */
export const ACTIVITY_CAP = 200;

export type ActivityKind =
    /** fetch or XMLHttpRequest */
    | "request"
    /** A WebSocket */
    | "socket"
    /** A call into its full-access part (native.js), which runs outside Discord */
    | "native"
    /** Something else that needs a permission it doesn't declare: always blocked */
    | "permission";

export interface ActivityEvent {
    kind: ActivityKind;
    /** Epoch ms */
    at: number;
    /** "GET", "POST"... ("WS" for sockets) */
    method?: string;
    /** Lowercase host, with the port when it isn't the default */
    host?: string;
    /** Path only: no query string, no fragment, secret-looking segments masked */
    path?: string;
    /** HTTP status, "error" when it failed, undefined while it's pending. Native calls: 200 or "error". */
    status?: number | "error";
    /** Native calls: the method it called. Permission events: what it tried ("MESSAGE_CREATE", "/snip"). */
    target?: string;
    /** Evi refused it: the permission its manifest doesn't declare. Nothing was sent or run. */
    blocked?: PermissionKey;
}

/** A masked path segment */
export const MASK = "•••";
const MAX_PATH = 120;

/**
 * A segment that looks like a key, token or signature rather than a name: long, one run of
 * URL-safe characters mixing letters and digits (API keys, webhook tokens, JWT parts, hashes).
 */
function secretLooking(segment: string) {
    let text = segment;
    try {
        text = decodeURIComponent(segment);
    } catch { }
    if (text.length >= 40) return true;
    if (text.length < 16) return false;
    if (!/^[\w\-.~+=/:]+$/.test(text)) return false;
    // Plain numbers are ids (Discord snowflakes), not secrets
    if (/^\d+$/.test(text)) return false;
    return /\d/.test(text) && /[a-z]/i.test(text);
}

/**
 * The part of a URL that's safe to keep: host and path. Undefined for what isn't a network request
 * (data:, blob:, about:) or can't be read. Relative URLs resolve against `base` (Discord's page).
 */
export function scrubUrl(input: string, base?: string): { host: string; path: string; } | undefined {
    let url: URL;
    try {
        url = base ? new URL(input, base) : new URL(input);
    } catch {
        return undefined;
    }
    if (!/^(?:https?|wss?):$/.test(url.protocol) || !url.hostname) return undefined;
    const segments = url.pathname.split("/").map(s => s && secretLooking(s) ? MASK : s);
    let path = segments.join("/") || "/";
    if (path.length > MAX_PATH) path = `${path.slice(0, MAX_PATH - 1)}…`;
    // URL.host drops default ports and never includes credentials
    return { host: url.host.toLowerCase(), path };
}

/** Discord's own hosts: talking to them is what Discord does anyway */
export const DISCORD_HOST = /(?:^|\.)(?:discord\.com|discordapp\.com|discordapp\.net|discord\.gg|discord\.media|discordcdn\.com|discord\.new|dis\.gd)$/;

/**
 * Whether a host is one the plugin's code names (the permissions scan's domains, which is what
 * its store page and details list), or Discord's. Subdomains of a named host count as named.
 */
export function isExpectedHost(host: string, named: readonly string[]) {
    const bare = host.replace(/:\d+$/, "");
    if (DISCORD_HOST.test(bare)) return true;
    return named.some(n => bare === n || bare.endsWith(`.${n}`));
}

/** Keeps the newest events per plugin, `cap` at most */
export class ActivityLog {
    private readonly events = new Map<string, ActivityEvent[]>();

    constructor(private readonly cap = ACTIVITY_CAP) { }

    add(id: string, event: ActivityEvent) {
        let list = this.events.get(id);
        if (!list) this.events.set(id, list = []);
        list.push(event);
        if (list.length > this.cap) list.splice(0, list.length - this.cap);
        return event;
    }

    /** Oldest first */
    get(id: string): readonly ActivityEvent[] {
        return this.events.get(id) ?? [];
    }

    clear(id: string) {
        this.events.delete(id);
    }
}

export interface ActivityGroup {
    /** Stable key: "request:api.example.com", "native:readFile", "permission:sendMessages" */
    key: string;
    kind: ActivityKind;
    /** Host for requests and sockets, method name for native calls, the permission for permission events */
    target: string;
    count: number;
    lastAt: number;
    /** Hosts its code doesn't name (see isExpectedHost). Always false for native calls and permission events. */
    unexpected: boolean;
    /** Up to `recentLimit` distinct "GET /v1/thing 200" lines (what it tried, for permission events), newest first */
    recent: string[];
    /** How many of them failed */
    errors: number;
    /** How many of them Evi blocked */
    blocked: number;
}

function describe(e: ActivityEvent) {
    const status = e.blocked ? " blocked" : e.status === undefined ? "" : ` ${e.status === "error" ? "failed" : e.status}`;
    return `${e.method ?? ""} ${e.path ?? ""}${status}`.trim();
}

/** What a group is about: the host, the native method, or the permission a blocked action needed */
function targetOf(e: ActivityEvent) {
    if (e.kind === "native") return e.target;
    if (e.kind === "permission") return e.blocked;
    return e.host;
}

/** One group per host (and per native method), most recently used first */
export function groupActivity(events: readonly ActivityEvent[], named: readonly string[] = [], recentLimit = 3): ActivityGroup[] {
    const groups = new Map<string, ActivityGroup>();
    // Newest first, so each group's first lines are its latest
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        const target = targetOf(e);
        if (!target) continue;
        const key = `${e.kind}:${target}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                key, kind: e.kind, target, count: 0, lastAt: e.at, errors: 0, blocked: 0, recent: [],
                unexpected: (e.kind === "request" || e.kind === "socket") && !isExpectedHost(target, named),
            };
            groups.set(key, group);
        }
        group.count++;
        group.lastAt = Math.max(group.lastAt, e.at);
        if (e.status === "error") group.errors++;
        if (e.blocked) group.blocked++;
        const line = e.kind === "native" ? "" : e.kind === "permission" ? e.target ?? "" : describe(e);
        if (line && group.recent.length < recentLimit && !group.recent.includes(line)) group.recent.push(line);
    }
    return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt);
}
