import { describe, expect, test } from "bun:test";

import {
    ALL_PERMISSIONS, computePermissions, ComputeInput, Permission, PERMISSIONS, permissionsIn, summarizeOverwrites, toBits,
} from "../plugins/permissions-viewer/perms";

const G = "100";
const { VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, MANAGE_MESSAGES, ADMINISTRATOR, KICK_MEMBERS } = Permission;

const roles = [
    { id: G, name: "@everyone", permissions: VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS, position: 0 },
    { id: "r1", name: "Mod", permissions: MANAGE_MESSAGES | KICK_MEMBERS, position: 2 },
    { id: "r2", name: "Member", permissions: SEND_MESSAGES, position: 1 },
    { id: "r3", name: "Admin", permissions: ADMINISTRATOR, position: 3 },
];

const input = (over: Partial<ComputeInput> = {}): ComputeInput => ({ guildId: G, ownerId: "owner", userId: "u1", memberRoleIds: [], roles, ...over });
const entry = (r: ReturnType<typeof computePermissions>, flag: bigint) => r.entries.find(e => e.flag === flag)!;

describe("permissions viewer", () => {
    test("the table has unique bits and names", () => {
        expect(new Set(PERMISSIONS.map(p => p.bit)).size).toBe(PERMISSIONS.length);
        expect(new Set(PERMISSIONS.map(p => p.key)).size).toBe(PERMISSIONS.length);
        expect(ADMINISTRATOR).toBe(8n);
        expect(Permission.USE_EXTERNAL_APPS).toBe(1n << 50n);
    });

    test("toBits accepts BigInt, decimal strings and numbers", () => {
        expect(toBits(8n)).toBe(8n);
        expect(toBits("1125899906842624")).toBe(1n << 50n);
        expect(toBits(2048)).toBe(2048n);
        expect(toBits("nope")).toBe(0n);
        expect(toBits(undefined)).toBe(0n);
    });

    test("base permissions are @everyone plus roles, credited to the highest role", () => {
        const r = computePermissions(input({ memberRoleIds: ["r1", "r2"] }));
        expect(r.permissions).toBe(VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS | MANAGE_MESSAGES | KICK_MEMBERS);
        expect(entry(r, SEND_MESSAGES).source).toEqual({ kind: "role", roleId: "r2" });
        expect(entry(r, MANAGE_MESSAGES).source).toEqual({ kind: "role", roleId: "r1" });
        expect(entry(r, VIEW_CHANNEL).source).toEqual({ kind: "role", roleId: G });
        expect(entry(r, Permission.BAN_MEMBERS)).toMatchObject({ granted: false, source: { kind: "none" } });
    });

    test("the owner has everything, even with overwrites denying it", () => {
        const r = computePermissions(input({ userId: "owner", overwrites: [{ id: G, type: 0, allow: 0n, deny: VIEW_CHANNEL }] }));
        expect(r.permissions).toBe(ALL_PERMISSIONS);
        expect(r.entries.every(e => e.granted && e.source.kind === "owner")).toBe(true);
    });

    test("Administrator grants everything and ignores overwrites", () => {
        const r = computePermissions(input({
            memberRoleIds: ["r3"],
            overwrites: [{ id: "u1", type: 1, allow: 0n, deny: VIEW_CHANNEL | SEND_MESSAGES }],
        }));
        expect(r.permissions).toBe(ALL_PERMISSIONS);
        expect(entry(r, VIEW_CHANNEL)).toMatchObject({ granted: true, source: { kind: "administrator", roleId: "r3" } });
    });

    test("Administrator on @everyone counts too", () => {
        const r = computePermissions(input({ roles: [{ id: G, permissions: ADMINISTRATOR }] }));
        expect(entry(r, KICK_MEMBERS).source).toEqual({ kind: "administrator", roleId: G });
    });

    test("the @everyone overwrite applies deny then allow", () => {
        const r = computePermissions(input({ overwrites: [{ id: G, type: 0, allow: MANAGE_MESSAGES, deny: SEND_MESSAGES }] }));
        expect(entry(r, SEND_MESSAGES)).toMatchObject({ granted: false, source: { kind: "overwrite", target: "everyone", id: G } });
        expect(entry(r, MANAGE_MESSAGES)).toMatchObject({ granted: true, source: { kind: "overwrite", target: "everyone", id: G } });
        expect(entry(r, VIEW_CHANNEL)).toMatchObject({ granted: true, source: { kind: "role", roleId: G } });
    });

    test("role overwrites beat @everyone, and allow beats deny between roles", () => {
        const r = computePermissions(input({
            memberRoleIds: ["r1", "r2"],
            overwrites: {
                [G]: { id: G, type: 0, allow: 0n, deny: SEND_MESSAGES | VIEW_CHANNEL },
                r2: { id: "r2", type: 0, allow: SEND_MESSAGES, deny: ADD_REACTIONS },
                r1: { id: "r1", type: 0, allow: ADD_REACTIONS, deny: MANAGE_MESSAGES },
                // Not the member's role: ignored
                r3: { id: "r3", type: 0, allow: VIEW_CHANNEL, deny: 0n },
            },
        }));
        expect(entry(r, SEND_MESSAGES)).toMatchObject({ granted: true, source: { kind: "overwrite", target: "role", id: "r2" } });
        expect(entry(r, ADD_REACTIONS)).toMatchObject({ granted: true, source: { kind: "overwrite", target: "role", id: "r1" } });
        expect(entry(r, MANAGE_MESSAGES)).toMatchObject({ granted: false, source: { kind: "overwrite", target: "role", id: "r1" } });
        expect(entry(r, VIEW_CHANNEL)).toMatchObject({ granted: false, source: { kind: "overwrite", target: "everyone", id: G } });
    });

    test("the member overwrite beats roles and @everyone", () => {
        const r = computePermissions(input({
            memberRoleIds: ["r2"],
            overwrites: [
                { id: G, type: "role", allow: 0n, deny: VIEW_CHANNEL },
                { id: "r2", type: "role", allow: VIEW_CHANNEL, deny: SEND_MESSAGES },
                { id: "u1", type: "member", allow: SEND_MESSAGES, deny: VIEW_CHANNEL },
                // Someone else's member overwrite
                { id: "u2", type: 1, allow: KICK_MEMBERS, deny: 0n },
            ],
        }));
        expect(entry(r, VIEW_CHANNEL)).toMatchObject({ granted: false, source: { kind: "overwrite", target: "member", id: "u1" } });
        expect(entry(r, SEND_MESSAGES)).toMatchObject({ granted: true, source: { kind: "overwrite", target: "member", id: "u1" } });
        expect(entry(r, KICK_MEMBERS).granted).toBe(false);
    });

    test("a member overwrite with the same id as a role is not mistaken for it", () => {
        const r = computePermissions(input({ userId: "r2", memberRoleIds: [], overwrites: [{ id: "r2", type: 1, allow: KICK_MEMBERS, deny: 0n }] }));
        expect(entry(r, KICK_MEMBERS).granted).toBe(true);
    });

    test("unknown bits are listed, not dropped", () => {
        const names = permissionsIn(SEND_MESSAGES | (1n << 60n)).map(p => p.name);
        expect(names).toEqual(["Send Messages", "Unknown (bit 60)"]);
    });

    test("overwrite summaries list @everyone, then roles by position, then members", () => {
        const summary = summarizeOverwrites(G, [
            { id: "u1", type: 1, allow: SEND_MESSAGES, deny: 0n },
            { id: "r2", type: 0, allow: 0n, deny: ADD_REACTIONS },
            { id: G, type: 0, allow: 0n, deny: VIEW_CHANNEL },
            { id: "r1", type: 0, allow: MANAGE_MESSAGES, deny: 0n },
        ], roles);
        expect(summary.map(s => [s.target, s.id])).toEqual([["everyone", G], ["role", "r1"], ["role", "r2"], ["member", "u1"]]);
        expect(summary[0].denied.map(p => p.key)).toEqual(["VIEW_CHANNEL"]);
        expect(summary[3].allowed.map(p => p.key)).toEqual(["SEND_MESSAGES"]);
    });
});
