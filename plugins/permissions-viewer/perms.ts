/**
 * Discord's permission math, as the server does it:
 *   1. base = @everyone's permissions | every role the member has
 *   2. the owner, or anyone whose base has Administrator, has everything
 *   3. in a channel: the @everyone overwrite, then all the member's role overwrites together, then
 *      the member's own overwrite. Each step removes its deny bits, then adds its allow bits.
 * Alongside the result, each permission records which role or overwrite decided it.
 */

export interface PermissionInfo {
    bit: number;
    flag: bigint;
    key: string;
    name: string;
}

const TABLE: [number, string, string][] = [
    [0, "CREATE_INSTANT_INVITE", "Create Invite"],
    [1, "KICK_MEMBERS", "Kick Members"],
    [2, "BAN_MEMBERS", "Ban Members"],
    [3, "ADMINISTRATOR", "Administrator"],
    [4, "MANAGE_CHANNELS", "Manage Channels"],
    [5, "MANAGE_GUILD", "Manage Server"],
    [6, "ADD_REACTIONS", "Add Reactions"],
    [7, "VIEW_AUDIT_LOG", "View Audit Log"],
    [8, "PRIORITY_SPEAKER", "Priority Speaker"],
    [9, "STREAM", "Video"],
    [10, "VIEW_CHANNEL", "View Channels"],
    [11, "SEND_MESSAGES", "Send Messages"],
    [12, "SEND_TTS_MESSAGES", "Send Text-to-Speech Messages"],
    [13, "MANAGE_MESSAGES", "Manage Messages"],
    [14, "EMBED_LINKS", "Embed Links"],
    [15, "ATTACH_FILES", "Attach Files"],
    [16, "READ_MESSAGE_HISTORY", "Read Message History"],
    [17, "MENTION_EVERYONE", "Mention @everyone, @here and All Roles"],
    [18, "USE_EXTERNAL_EMOJIS", "Use External Emoji"],
    [19, "VIEW_GUILD_INSIGHTS", "View Server Insights"],
    [20, "CONNECT", "Connect"],
    [21, "SPEAK", "Speak"],
    [22, "MUTE_MEMBERS", "Mute Members"],
    [23, "DEAFEN_MEMBERS", "Deafen Members"],
    [24, "MOVE_MEMBERS", "Move Members"],
    [25, "USE_VAD", "Use Voice Activity"],
    [26, "CHANGE_NICKNAME", "Change Nickname"],
    [27, "MANAGE_NICKNAMES", "Manage Nicknames"],
    [28, "MANAGE_ROLES", "Manage Roles"],
    [29, "MANAGE_WEBHOOKS", "Manage Webhooks"],
    [30, "MANAGE_GUILD_EXPRESSIONS", "Manage Expressions"],
    [31, "USE_APPLICATION_COMMANDS", "Use Application Commands"],
    [32, "REQUEST_TO_SPEAK", "Request to Speak"],
    [33, "MANAGE_EVENTS", "Manage Events"],
    [34, "MANAGE_THREADS", "Manage Threads"],
    [35, "CREATE_PUBLIC_THREADS", "Create Public Threads"],
    [36, "CREATE_PRIVATE_THREADS", "Create Private Threads"],
    [37, "USE_EXTERNAL_STICKERS", "Use External Stickers"],
    [38, "SEND_MESSAGES_IN_THREADS", "Send Messages in Threads"],
    [39, "USE_EMBEDDED_ACTIVITIES", "Use Activities"],
    [40, "MODERATE_MEMBERS", "Timeout Members"],
    [41, "VIEW_CREATOR_MONETIZATION_ANALYTICS", "View Server Subscription Insights"],
    [42, "USE_SOUNDBOARD", "Use Soundboard"],
    [43, "CREATE_GUILD_EXPRESSIONS", "Create Expressions"],
    [44, "CREATE_EVENTS", "Create Events"],
    [45, "USE_EXTERNAL_SOUNDS", "Use External Sounds"],
    [46, "SEND_VOICE_MESSAGES", "Send Voice Messages"],
    [49, "SEND_POLLS", "Create Polls"],
    [50, "USE_EXTERNAL_APPS", "Use External Apps"],
    [51, "PIN_MESSAGES", "Pin Messages"],
    [52, "BYPASS_SLOWMODE", "Bypass Slowmode"],
];

export const PERMISSIONS: PermissionInfo[] = TABLE.map(([bit, key, name]) => ({ bit, flag: 1n << BigInt(bit), key, name }));

export const Permission = Object.fromEntries(PERMISSIONS.map(p => [p.key, p.flag])) as Record<string, bigint>;
export const ADMINISTRATOR = 1n << 3n;
export const ALL_PERMISSIONS = PERMISSIONS.reduce((all, p) => all | p.flag, 0n);

/** Known permissions plus any unknown set bits, so nothing Discord adds later goes missing */
export function permissionsIn(bits: bigint): PermissionInfo[] {
    const known = PERMISSIONS.filter(p => bits & p.flag);
    const unknown: PermissionInfo[] = [];
    for (let bit = 0; bit < 64; bit++) {
        const flag = 1n << BigInt(bit);
        if (bits & flag && !(ALL_PERMISSIONS & flag)) unknown.push({ bit, flag, key: `BIT_${bit}`, name: `Unknown (bit ${bit})` });
    }
    return [...known, ...unknown];
}

/** Discord keeps permissions as BigInt; API payloads and tests may pass strings or numbers */
export function toBits(value: unknown): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
    return 0n;
}

export interface RoleInput {
    id: string;
    name?: string;
    permissions: bigint | string | number;
    position?: number;
}

export interface OverwriteInput {
    id: string;
    /** 0 or "role" for a role (the guild id is @everyone), 1 or "member" for a member */
    type: 0 | 1 | "role" | "member" | number | string;
    allow: bigint | string | number;
    deny: bigint | string | number;
}

export interface ComputeInput {
    guildId: string;
    ownerId?: string | null;
    userId: string;
    /** The member's role ids, without @everyone */
    memberRoleIds: string[];
    /** Every role in the guild, @everyone included (its id is the guild id) */
    roles: RoleInput[] | Record<string, RoleInput>;
    /** A channel's overwrites; leave out for guild-level permissions */
    overwrites?: OverwriteInput[] | Record<string, OverwriteInput> | null;
}

export type Source =
    | { kind: "owner"; }
    | { kind: "administrator"; roleId: string; }
    | { kind: "role"; roleId: string; }
    | { kind: "overwrite"; target: "everyone" | "role" | "member"; id: string; }
    | { kind: "none"; };

export interface PermissionEntry extends PermissionInfo {
    granted: boolean;
    /** What decided it: the last step that allowed or denied it */
    source: Source;
}

export interface ComputeResult {
    permissions: bigint;
    entries: PermissionEntry[];
}

const list = <T>(v: T[] | Record<string, T> | null | undefined): T[] => !v ? [] : Array.isArray(v) ? v : Object.values(v);
export const isMemberOverwrite = (o: OverwriteInput) => o.type === 1 || o.type === "member" || o.type === "1";

/** Highest role first, @everyone last */
export function sortRoles<T extends RoleInput>(roles: T[], guildId: string): T[] {
    return [...roles].sort((a, b) => (a.id === guildId ? 1 : 0) - (b.id === guildId ? 1 : 0) || (b.position ?? 0) - (a.position ?? 0));
}

export function computePermissions(input: ComputeInput): ComputeResult {
    const { guildId, userId } = input;
    const byId = new Map(list(input.roles).map(r => [r.id, r]));
    const everyone = byId.get(guildId);
    const memberRoles = sortRoles(input.memberRoleIds.filter(id => id !== guildId).flatMap(id => byId.get(id) ?? []), guildId);
    // Which role grants each bit at guild level: the highest one, @everyone last
    const baseRoles = [...memberRoles, ...everyone ? [everyone] : []];

    const sources = new Map<bigint, Source>();
    let perms = 0n;
    for (const role of [...baseRoles].reverse()) perms |= toBits(role.permissions);

    const everything = (source: Source): ComputeResult => ({
        permissions: ALL_PERMISSIONS,
        entries: PERMISSIONS.map(p => ({ ...p, granted: true, source })),
    });
    if (input.ownerId && input.ownerId === userId) return everything({ kind: "owner" });
    if (perms & ADMINISTRATOR) {
        const admin = baseRoles.find(r => toBits(r.permissions) & ADMINISTRATOR)!;
        return everything({ kind: "administrator", roleId: admin.id });
    }

    for (const p of PERMISSIONS) {
        const role = baseRoles.find(r => toBits(r.permissions) & p.flag);
        if (role) sources.set(p.flag, { kind: "role", roleId: role.id });
    }

    if (input.overwrites) {
        const overwrites = list(input.overwrites);
        const apply = (allow: bigint, deny: bigint, source: (flag: bigint, allowed: boolean) => Source) => {
            perms &= ~deny;
            perms |= allow;
            for (const p of PERMISSIONS) {
                if (allow & p.flag) sources.set(p.flag, source(p.flag, true));
                else if (deny & p.flag) sources.set(p.flag, source(p.flag, false));
            }
        };

        const everyoneOw = overwrites.find(o => o.id === guildId && !isMemberOverwrite(o));
        if (everyoneOw) apply(toBits(everyoneOw.allow), toBits(everyoneOw.deny), () => ({ kind: "overwrite", target: "everyone", id: guildId }));

        // Role overwrites act as one: allow beats deny between roles
        const memberRoleIds = new Set(memberRoles.map(r => r.id));
        const roleOws = sortRoles(
            overwrites.filter(o => !isMemberOverwrite(o) && o.id !== guildId && memberRoleIds.has(o.id)).map(o => ({ ...o, permissions: 0n, position: byId.get(o.id)?.position })),
            guildId,
        );
        let allow = 0n, deny = 0n;
        for (const o of roleOws) {
            allow |= toBits(o.allow);
            deny |= toBits(o.deny);
        }
        apply(allow, deny, (flag, allowed) => ({
            kind: "overwrite",
            target: "role",
            id: roleOws.find(o => toBits(allowed ? o.allow : o.deny) & flag)!.id,
        }));

        const memberOw = overwrites.find(o => o.id === userId && isMemberOverwrite(o));
        if (memberOw) apply(toBits(memberOw.allow), toBits(memberOw.deny), () => ({ kind: "overwrite", target: "member", id: userId }));
    }

    return {
        permissions: perms,
        entries: PERMISSIONS.map(p => ({ ...p, granted: !!(perms & p.flag), source: sources.get(p.flag) ?? { kind: "none" } })),
    };
}

export interface OverwriteSummary {
    id: string;
    target: "everyone" | "role" | "member";
    allowed: PermissionInfo[];
    denied: PermissionInfo[];
}

/** A channel's overwrites, @everyone first, then roles (highest first), then members */
export function summarizeOverwrites(guildId: string, overwrites: OverwriteSummaryInput, roles: RoleInput[] | Record<string, RoleInput> = []): OverwriteSummary[] {
    const position = new Map(list(roles).map(r => [r.id, r.position ?? 0]));
    const rank = (o: OverwriteInput) => o.id === guildId && !isMemberOverwrite(o) ? 0 : isMemberOverwrite(o) ? 2 : 1;
    return list(overwrites)
        .sort((a, b) => rank(a) - rank(b) || (position.get(b.id) ?? 0) - (position.get(a.id) ?? 0))
        .map(o => ({
            id: o.id,
            target: rank(o) === 0 ? "everyone" : rank(o) === 1 ? "role" : "member",
            allowed: permissionsIn(toBits(o.allow)),
            denied: permissionsIn(toBits(o.deny)),
        }));
}

type OverwriteSummaryInput = OverwriteInput[] | Record<string, OverwriteInput> | null | undefined;
