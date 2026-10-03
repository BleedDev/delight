/**
 * Audit Log Plus, without Discord: what each audit log action is, who and what it's about, what it
 * changed, how entries group, filter and export. The numbers are Discord's own AuditLogActions,
 * checked against its web build on 2026-10-02 (up to GUILD_MIGRATE_BYPASS_SLOWMODE_PERMISSION, 213).
 * Pure: no DOM, no stores. Text comes from a `tr` passed in, so this works in every language.
 */

export type Group = "server" | "channels" | "members" | "roles" | "messages" | "invites" | "apps" | "expressions" | "events" | "threads" | "automod" | "onboarding" | "other";
export const GROUPS: Group[] = ["server", "channels", "members", "roles", "messages", "invites", "apps", "expressions", "events", "threads", "automod", "onboarding", "other"];

export type Kind = "channel" | "overwrite" | "role" | "invite" | "webhook" | "emoji" | "integration" | "stage" | "sticker" | "event" | "thread" | "sound" | "automodRule" | "prompt" | "onboarding" | "homeSettings" | "eventException" | "voiceStatus";
export type Op = "create" | "update" | "delete";
/** What target_id points at */
export type TargetType = "guild" | "channel" | "user" | "role" | "invite" | "webhook" | "emoji" | "integration" | "stage" | "sticker" | "event" | "thread" | "command" | "sound" | "automodRule" | "none";

export interface ActionInfo {
    group: Group;
    target: TargetType;
    /** Create, update or delete of a kind of thing: labelled from the op and the kind */
    kind?: Kind;
    op?: Op;
    /** Otherwise its own label, "action.<key>" */
    key?: string;
}

const crud = (group: Group, kind: Kind, target: TargetType, first: number): [number, ActionInfo][] =>
    (["create", "update", "delete"] as Op[]).map((op, i) => [first + i, { group, kind, op, target }]);

export const ACTIONS: Record<number, ActionInfo> = Object.fromEntries([
    [1, { group: "server", target: "guild", key: "guildUpdate" }],
    ...crud("channels", "channel", "channel", 10),
    ...crud("channels", "overwrite", "channel", 13),
    [16, { group: "channels", target: "channel", key: "channelPositions" }],
    [20, { group: "members", target: "user", key: "kick" }],
    [21, { group: "members", target: "none", key: "prune" }],
    [22, { group: "members", target: "user", key: "ban" }],
    [23, { group: "members", target: "user", key: "unban" }],
    [24, { group: "members", target: "user", key: "memberUpdate" }],
    [25, { group: "members", target: "user", key: "memberRoles" }],
    [26, { group: "members", target: "none", key: "move" }],
    [27, { group: "members", target: "none", key: "disconnect" }],
    [28, { group: "apps", target: "user", key: "botAdd" }],
    ...crud("roles", "role", "role", 30),
    [33, { group: "roles", target: "role", key: "rolePositions" }],
    ...crud("invites", "invite", "invite", 40),
    ...crud("apps", "webhook", "webhook", 50),
    ...crud("expressions", "emoji", "emoji", 60),
    [72, { group: "messages", target: "user", key: "messageDelete" }],
    [73, { group: "messages", target: "channel", key: "bulkDelete" }],
    [74, { group: "messages", target: "user", key: "pin" }],
    [75, { group: "messages", target: "user", key: "unpin" }],
    ...crud("apps", "integration", "integration", 80),
    ...crud("events", "stage", "stage", 83),
    ...crud("expressions", "sticker", "sticker", 90),
    ...crud("events", "event", "event", 100),
    ...crud("threads", "thread", "thread", 110),
    [121, { group: "apps", target: "command", key: "commandPermissions" }],
    ...crud("expressions", "sound", "sound", 130),
    ...crud("automod", "automodRule", "automodRule", 140),
    [143, { group: "automod", target: "user", key: "automodBlock" }],
    [144, { group: "automod", target: "user", key: "automodFlag" }],
    [145, { group: "automod", target: "user", key: "automodTimeout" }],
    [146, { group: "automod", target: "user", key: "automodQuarantine" }],
    [150, { group: "server", target: "none", key: "monetizationRequest" }],
    [151, { group: "server", target: "none", key: "monetizationTerms" }],
    ...crud("onboarding", "prompt", "none", 163),
    [166, { group: "onboarding", target: "none", kind: "onboarding", op: "create" }],
    [167, { group: "onboarding", target: "none", kind: "onboarding", op: "update" }],
    [171, { group: "server", target: "none", key: "homeFeature" }],
    [172, { group: "server", target: "none", key: "homeRemove" }],
    [180, { group: "automod", target: "user", key: "harmfulLink" }],
    [190, { group: "onboarding", target: "none", kind: "homeSettings", op: "create" }],
    [191, { group: "onboarding", target: "none", kind: "homeSettings", op: "update" }],
    [192, { group: "channels", target: "channel", key: "voiceStatusSet" }],
    [193, { group: "channels", target: "channel", key: "voiceStatusClear" }],
    ...crud("events", "eventException", "event", 200),
    [210, { group: "members", target: "none", key: "verificationUpdate" }],
    [211, { group: "server", target: "guild", key: "profileUpdate" }],
    [212, { group: "server", target: "none", key: "migratePins" }],
    [213, { group: "server", target: "none", key: "migrateSlowmode" }],
]);

export const actionInfo = (type: number): ActionInfo => ACTIONS[type] ?? { group: "other", target: "none", key: "unknown" };

/** Every action in a group, for the API's action_type filter */
export const actionsIn = (group: Group) => Object.entries(ACTIONS).filter(([, a]) => a.group === group).map(([n]) => Number(n));

export interface RawChange { key: string; old_value?: unknown; new_value?: unknown; }
export interface RawEntry {
    id: string;
    action_type: number;
    user_id?: string | null;
    target_id?: string | null;
    changes?: RawChange[];
    options?: Record<string, any>;
    reason?: string;
}
export interface RawUser { id: string; username?: string; global_name?: string | null; avatar?: string | null; discriminator?: string; bot?: boolean; }
export interface RawLog {
    audit_log_entries?: RawEntry[];
    users?: RawUser[];
    webhooks?: { id: string; name?: string; avatar?: string | null; }[];
    threads?: { id: string; name?: string; }[];
    integrations?: { id: string; name?: string; }[];
    guild_scheduled_events?: { id: string; name?: string; }[];
    auto_moderation_rules?: { id: string; name?: string; }[];
    application_commands?: { id: string; name?: string; }[];
}

const DISCORD_EPOCH = 1420070400000n;
/** When a snowflake (here, the entry) was made */
export function snowflakeTime(id: string): number {
    try {
        return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
    } catch {
        return 0;
    }
}

export interface Person { id: string; name: string; avatar?: string | null; bot?: boolean; webhook?: boolean; }
export interface Target { type: TargetType; id?: string; name: string; color?: number; }

/** What Discord's stores know, for names the response doesn't carry (all optional) */
export interface Lookup {
    user?(id: string): Person | undefined;
    channel?(id: string): string | undefined;
    role?(id: string): { name: string; color?: number; } | undefined;
    emoji?(id: string): string | undefined;
    sticker?(id: string): string | undefined;
}

export const userName = (u: RawUser) => u.global_name || u.username || u.id;

/** Who's who in one page of the log */
export class Directory {
    users = new Map<string, Person>();
    named = new Map<string, string>();

    constructor(private readonly lookup: Lookup = {}) { }

    add(log: RawLog) {
        for (const u of log.users ?? []) if (u?.id) this.users.set(u.id, { id: u.id, name: userName(u), avatar: u.avatar, bot: !!u.bot });
        for (const w of log.webhooks ?? []) if (w?.id) this.users.set(w.id, { id: w.id, name: w.name || w.id, avatar: w.avatar, webhook: true });
        for (const list of [log.threads, log.integrations, log.guild_scheduled_events, log.auto_moderation_rules, log.application_commands]) {
            for (const x of list ?? []) if (x?.id && x.name) this.named.set(x.id, x.name);
        }
    }

    person(id: string | null | undefined): Person | undefined {
        if (!id) return undefined;
        return this.users.get(id) ?? this.lookup.user?.(id) ?? { id, name: id };
    }

    target(entry: RawEntry, info: ActionInfo): Target {
        const id = entry.target_id ?? undefined;
        const fromChanges = changeName(entry);
        const by = (name: string | undefined) => name || fromChanges || id || "";
        switch (info.target) {
            case "user": {
                const p = this.person(id);
                return { type: "user", id, name: p?.name ?? by(undefined) };
            }
            case "channel":
                return { type: "channel", id, name: by(id ? this.lookup.channel?.(id) ?? this.named.get(id) : undefined) };
            case "role": {
                const r = id ? this.lookup.role?.(id) : undefined;
                const color = num(changed(entry, "color")?.new_value) ?? num(changed(entry, "color")?.old_value) ?? r?.color;
                return { type: "role", id, name: by(r?.name), color };
            }
            case "invite":
                return { type: "invite", id, name: String(changed(entry, "code")?.new_value ?? changed(entry, "code")?.old_value ?? id ?? "") };
            case "webhook":
                return { type: "webhook", id, name: by(id ? this.users.get(id)?.name : undefined) };
            case "emoji":
                return { type: "emoji", id, name: by(id ? this.lookup.emoji?.(id) : undefined) };
            case "sticker":
                return { type: "sticker", id, name: by(id ? this.lookup.sticker?.(id) : undefined) };
            case "guild":
                return { type: "guild", id, name: by(undefined) };
            case "none":
                return { type: "none", name: fromChanges ?? "" };
            default:
                return { type: info.target, id, name: by(id ? this.named.get(id) : undefined) };
        }
    }
}

const changed = (entry: RawEntry, key: string) => entry.changes?.find(c => c.key === key);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** The thing's name from its changes: new name, or the old one for something deleted */
function changeName(entry: RawEntry): string | undefined {
    const c = changed(entry, "name");
    const v = c?.new_value ?? c?.old_value;
    return typeof v === "string" && v ? v : undefined;
}

export const PERMISSIONS: [string, number][] = [
    ["CREATE_INSTANT_INVITE", 0], ["KICK_MEMBERS", 1], ["BAN_MEMBERS", 2], ["ADMINISTRATOR", 3], ["MANAGE_CHANNELS", 4],
    ["MANAGE_GUILD", 5], ["ADD_REACTIONS", 6], ["VIEW_AUDIT_LOG", 7], ["PRIORITY_SPEAKER", 8], ["STREAM", 9],
    ["VIEW_CHANNEL", 10], ["SEND_MESSAGES", 11], ["SEND_TTS_MESSAGES", 12], ["MANAGE_MESSAGES", 13], ["EMBED_LINKS", 14],
    ["ATTACH_FILES", 15], ["READ_MESSAGE_HISTORY", 16], ["MENTION_EVERYONE", 17], ["USE_EXTERNAL_EMOJIS", 18],
    ["VIEW_GUILD_ANALYTICS", 19], ["CONNECT", 20], ["SPEAK", 21], ["MUTE_MEMBERS", 22], ["DEAFEN_MEMBERS", 23],
    ["MOVE_MEMBERS", 24], ["USE_VAD", 25], ["CHANGE_NICKNAME", 26], ["MANAGE_NICKNAMES", 27], ["MANAGE_ROLES", 28],
    ["MANAGE_WEBHOOKS", 29], ["MANAGE_GUILD_EXPRESSIONS", 30], ["USE_APPLICATION_COMMANDS", 31], ["REQUEST_TO_SPEAK", 32],
    ["MANAGE_EVENTS", 33], ["MANAGE_THREADS", 34], ["CREATE_PUBLIC_THREADS", 35], ["CREATE_PRIVATE_THREADS", 36],
    ["USE_EXTERNAL_STICKERS", 37], ["SEND_MESSAGES_IN_THREADS", 38], ["USE_EMBEDDED_ACTIVITIES", 39], ["MODERATE_MEMBERS", 40],
    ["VIEW_CREATOR_MONETIZATION_ANALYTICS", 41], ["USE_SOUNDBOARD", 42], ["CREATE_GUILD_EXPRESSIONS", 43], ["CREATE_EVENTS", 44],
    ["USE_EXTERNAL_SOUNDS", 45], ["SEND_VOICE_MESSAGES", 46], ["SET_VOICE_CHANNEL_STATUS", 48], ["SEND_POLLS", 49],
    ["USE_EXTERNAL_APPS", 50], ["PIN_MESSAGES", 51], ["BYPASS_SLOWMODE", 52], ["MANAGE_OFFICIAL_MESSAGES", 53],
];

/** "MANAGE_CHANNELS" -> "Manage Channels" */
export const humanize = (key: string) => key.replace(/^\$/, "").toLowerCase().split(/[_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

function bits(v: unknown): bigint {
    try {
        return typeof v === "string" || typeof v === "number" ? BigInt(v) : 0n;
    } catch {
        return 0n;
    }
}

/** Permission names set in `value` */
export function permissionNames(value: unknown): string[] {
    const b = bits(value);
    return PERMISSIONS.filter(([, bit]) => b & (1n << BigInt(bit))).map(([name]) => name);
}

export function permissionDiff(oldValue: unknown, newValue: unknown): { added: string[]; removed: string[]; } {
    const before = new Set(permissionNames(oldValue));
    const after = new Set(permissionNames(newValue));
    return { added: [...after].filter(p => !before.has(p)), removed: [...before].filter(p => !after.has(p)) };
}

export const hexColor = (v: number) => `#${(v & 0xffffff).toString(16).padStart(6, "0")}`;

const PERMISSION_KEYS = new Set(["permissions", "allow", "deny", "allow_new", "deny_new"]);
const COLOR_KEYS = new Set(["color", "colors"]);
const SECONDS_KEYS = new Set(["rate_limit_per_user", "max_age", "afk_timeout", "default_thread_rate_limit_per_user"]);
const MINUTES_KEYS = new Set(["auto_archive_duration", "default_auto_archive_duration"]);
const DATE_KEYS = new Set(["communication_disabled_until", "scheduled_start_time", "scheduled_end_time"]);
const HIDDEN_KEYS = new Set(["id", "guild_id", "flags_new"]);

export type ChangeView =
    | { key: string; type: "perms"; added: string[]; removed: string[]; }
    | { key: string; type: "roles"; added: boolean; roles: { id: string; name: string; }[]; }
    | { key: string; type: "color"; old?: string; new?: string; }
    | { key: string; type: "seconds"; old?: number; new?: number; }
    | { key: string; type: "date"; old?: number; new?: number; }
    | { key: string; type: "bool"; old?: boolean; new?: boolean; }
    | { key: string; type: "text"; old?: string; new?: string; };

const colorOf = (v: unknown): string | undefined => {
    if (typeof v === "number") return hexColor(v);
    if (v && typeof v === "object" && typeof (v as any).primary_color === "number") return hexColor((v as any).primary_color);
    return undefined;
};

const text = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "bigint") return String(v);
    if (Array.isArray(v)) return v.map(x => typeof x === "object" && x ? (x.name ?? x.id ?? JSON.stringify(x)) : String(x)).join(", ");
    return JSON.stringify(v);
};

const date = (v: unknown) => {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : undefined;
};

/** One entry's changes as things to show, in Discord's order, minus noise */
export function changeViews(entry: RawEntry): ChangeView[] {
    const out: ChangeView[] = [];
    for (const c of entry.changes ?? []) {
        if (HIDDEN_KEYS.has(c.key)) continue;
        if (c.key === "$add" || c.key === "$remove") {
            const roles = (Array.isArray(c.new_value) ? c.new_value : []).filter((r: any) => r?.id).map((r: any) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
            out.push({ key: c.key, type: "roles", added: c.key === "$add", roles });
        } else if (PERMISSION_KEYS.has(c.key)) {
            out.push({ key: c.key, type: "perms", ...permissionDiff(c.old_value, c.new_value) });
        } else if (COLOR_KEYS.has(c.key)) {
            out.push({ key: c.key, type: "color", old: colorOf(c.old_value), new: colorOf(c.new_value) });
        } else if (SECONDS_KEYS.has(c.key) || MINUTES_KEYS.has(c.key)) {
            const k = MINUTES_KEYS.has(c.key) ? 60 : 1;
            out.push({ key: c.key, type: "seconds", old: num(c.old_value) !== undefined ? num(c.old_value)! * k : undefined, new: num(c.new_value) !== undefined ? num(c.new_value)! * k : undefined });
        } else if (DATE_KEYS.has(c.key)) {
            out.push({ key: c.key, type: "date", old: date(c.old_value), new: date(c.new_value) });
        } else if (typeof c.old_value === "boolean" || typeof c.new_value === "boolean") {
            out.push({ key: c.key, type: "bool", old: c.old_value as boolean | undefined, new: c.new_value as boolean | undefined });
        } else {
            out.push({ key: c.key, type: "text", old: text(c.old_value), new: text(c.new_value) });
        }
    }
    return out;
}

/** 90 -> [1, "minute"], 7200 -> [2, "hour"]; whole units only, the biggest that fits */
export function durationParts(seconds: number): [number, "second" | "minute" | "hour" | "day" | "week"] {
    const units = [["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const;
    for (const [unit, size] of units) if (seconds >= size && seconds % size === 0) return [seconds / size, unit];
    for (const [unit, size] of units) if (seconds >= size) return [Math.round(seconds / size), unit];
    return [seconds, "second"];
}

export interface Described {
    entry: RawEntry;
    info: ActionInfo;
    time: number;
    actor?: Person;
    target: Target;
    changes: ChangeView[];
    /** Other entries folded into this one (consecutive, same actor, action and target) */
    count: number;
    /** Everything shown, lowercased, for the search box */
    text: string;
}

export function describe(entry: RawEntry, dir: Directory): Omit<Described, "text" | "count"> {
    const info = actionInfo(entry.action_type);
    return { entry, info, time: snowflakeTime(entry.id), actor: dir.person(entry.user_id), target: dir.target(entry, info), changes: changeViews(entry) };
}

const GROUP_WINDOW = 15 * 60 * 1000;

/**
 * Folds runs of the same actor doing the same action to the same target within 15 minutes (a
 * bot deleting messages one by one, someone fiddling with a role), keeping the newest. Entries come
 * newest first, as Discord sends them.
 */
export function groupRuns<T extends { entry: RawEntry; time: number; count: number; }>(list: T[]): T[] {
    const out: T[] = [];
    for (const item of list) {
        const last = out[out.length - 1];
        if (last && last.entry.action_type === item.entry.action_type && last.entry.user_id === item.entry.user_id
            && last.entry.target_id === item.entry.target_id && Math.abs(last.time - item.time) <= GROUP_WINDOW
            && sameChanges(last.entry, item.entry)) {
            out[out.length - 1] = { ...last, count: last.count + item.count };
        } else out.push(item);
    }
    return out;
}

/** Same kind of change: the same keys changed (values may differ, like a nickname typed twice) */
const sameChanges = (a: RawEntry, b: RawEntry) => (a.changes ?? []).map(c => c.key).join() === (b.changes ?? []).map(c => c.key).join();

export interface Filters {
    actorId?: string;
    groups?: Set<Group>;
    /** Inclusive, ms */
    from?: number;
    to?: number;
    query?: string;
}

export function matches(d: Pick<Described, "entry" | "info" | "time" | "text">, f: Filters): boolean {
    if (f.actorId && d.entry.user_id !== f.actorId) return false;
    if (f.groups?.size && !f.groups.has(d.info.group)) return false;
    if (f.from !== undefined && d.time < f.from) return false;
    if (f.to !== undefined && d.time > f.to) return false;
    const q = f.query?.trim().toLowerCase();
    if (q && !q.split(/\s+/).every(word => d.text.includes(word))) return false;
    return true;
}

export interface ExportRow {
    time: string;
    action: string;
    actionType: number;
    actorId: string;
    actor: string;
    targetId: string;
    target: string;
    reason: string;
    changes: string;
    count: number;
}

const csvCell = (v: unknown) => {
    const s = String(v ?? "");
    // Formula injection: a cell starting with = + - @ runs in spreadsheets
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const CSV_COLUMNS: (keyof ExportRow)[] = ["time", "action", "actionType", "actorId", "actor", "targetId", "target", "reason", "changes", "count"];

/** CSV with a BOM, so Excel reads it as UTF-8 */
export function toCsv(rows: ExportRow[]): string {
    return "﻿" + [CSV_COLUMNS.join(","), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** A file name for the export: audit-log-<server>-<date>.<ext> */
export function exportName(guildName: string, ext: "csv" | "json", now = Date.now()) {
    const slug = guildName.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "server";
    return `audit-log-${slug}-${new Date(now).toISOString().slice(0, 10)}.${ext}`;
}
