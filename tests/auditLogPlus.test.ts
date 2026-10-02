import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
    ACTIONS, actionInfo, actionsIn, changeViews, describe as describeEntry, Directory, durationParts, exportName, GROUPS, groupRuns, humanize,
    matches, permissionDiff, permissionNames, RawEntry, snowflakeTime, toCsv,
} from "../plugins/audit-log-plus/audit";
import { missingTranslations } from "../src/shared/pluginTranslations";

const dir = join(import.meta.dir, "../plugins/audit-log-plus");
const stringsSource = readFileSync(join(dir, "strings.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

/** A snowflake made at `ms` */
const flake = (ms: number, n = 0) => String((BigInt(ms - 1420070400000) << 22n) + BigInt(n));

describe("Audit Log Plus: actions", () => {
    test("Discord's numbers map to the right things", () => {
        expect(actionInfo(20)).toMatchObject({ group: "members", key: "kick", target: "user" });
        expect(actionInfo(10)).toMatchObject({ group: "channels", kind: "channel", op: "create" });
        expect(actionInfo(12)).toMatchObject({ kind: "channel", op: "delete" });
        expect(actionInfo(31)).toMatchObject({ group: "roles", kind: "role", op: "update", target: "role" });
        expect(actionInfo(132)).toMatchObject({ group: "expressions", kind: "sound", op: "delete" });
        expect(actionInfo(213)).toMatchObject({ key: "migrateSlowmode" });
        expect(actionInfo(9999)).toMatchObject({ group: "other", key: "unknown" });
        expect(actionsIn("members")).toEqual(expect.arrayContaining([20, 21, 22, 23, 24, 25, 26, 27, 210]));
    });

    test("every action, kind and group has a label in English", () => {
        for (const a of Object.values(ACTIONS)) {
            const key = a.kind ? `kind.${a.kind}` : `action.${a.key}`;
            expect(stringsSource.includes(`"${key}"`)).toBe(true);
            if (a.op) expect(stringsSource.includes(`"op.${a.op}"`)).toBe(true);
        }
        for (const g of GROUPS) expect(stringsSource.includes(`"group.${g}"`)).toBe(true);
    });

    test("every string is in all nine languages, as the store requires", () => {
        expect(missingTranslations(manifest, stringsSource)).toEqual([]);
    });
});

describe("Audit Log Plus: entries", () => {
    const log = {
        users: [{ id: "1", username: "alice", global_name: "Alice" }, { id: "2", username: "bob" }],
        webhooks: [{ id: "9", name: "Deploys" }],
        threads: [{ id: "7", name: "bug-reports" }],
    };
    const directory = new Directory({ channel: id => id === "5" ? "general" : undefined, role: id => id === "6" ? { name: "Mods", color: 0x5865f2 } : undefined });
    directory.add(log);

    test("who did it and to whom, from the response or the stores", () => {
        const kick = describeEntry({ id: flake(Date.UTC(2026, 9, 1)), action_type: 20, user_id: "1", target_id: "2", reason: "spam" }, directory);
        expect(kick.actor?.name).toBe("Alice");
        expect(kick.target).toMatchObject({ type: "user", id: "2", name: "bob" });
        expect(kick.time).toBe(Date.UTC(2026, 9, 1));

        const channel = describeEntry({ id: flake(1), action_type: 11, user_id: "1", target_id: "5" }, directory);
        expect(channel.target).toMatchObject({ type: "channel", name: "general" });

        const deleted = describeEntry({ id: flake(1), action_type: 12, user_id: "1", target_id: "55", changes: [{ key: "name", old_value: "old-chat" }] }, directory);
        expect(deleted.target.name).toBe("old-chat");

        const role = describeEntry({ id: flake(1), action_type: 31, user_id: "1", target_id: "6" }, directory);
        expect(role.target).toMatchObject({ type: "role", name: "Mods", color: 0x5865f2 });

        const webhook = describeEntry({ id: flake(1), action_type: 51, user_id: "9", target_id: "9" }, directory);
        expect(webhook.actor).toMatchObject({ name: "Deploys", webhook: true });
        expect(webhook.target.name).toBe("Deploys");

        const thread = describeEntry({ id: flake(1), action_type: 111, user_id: "1", target_id: "7" }, directory);
        expect(thread.target.name).toBe("bug-reports");

        const invite = describeEntry({ id: flake(1), action_type: 40, user_id: "1", changes: [{ key: "code", new_value: "abc123" }] }, directory);
        expect(invite.target.name).toBe("abc123");

        // Someone the response doesn't know falls back to their id
        expect(directory.person("404")).toEqual({ id: "404", name: "404" });
        expect(describeEntry({ id: flake(1), action_type: 1 }, directory).actor).toBeUndefined();
    });

    test("changes: permissions by name, roles, colours, durations, dates and flags", () => {
        const entry: RawEntry = {
            id: flake(1), action_type: 31, changes: [
                { key: "permissions", old_value: String(1 << 10), new_value: String((1 << 10) | (1 << 11) | (1 << 3)) },
                { key: "color", old_value: 0, new_value: 0xff0000 },
                { key: "rate_limit_per_user", old_value: 0, new_value: 300 },
                { key: "auto_archive_duration", new_value: 1440 },
                { key: "communication_disabled_until", new_value: "2026-10-02T12:00:00.000Z" },
                { key: "hoist", old_value: false, new_value: true },
                { key: "$add", new_value: [{ id: "6", name: "Mods" }] },
                { key: "name", old_value: "a", new_value: "b" },
                { key: "id", new_value: "123" },
            ],
        };
        const views = changeViews(entry);
        expect(views.map(v => v.key)).toEqual(["permissions", "color", "rate_limit_per_user", "auto_archive_duration", "communication_disabled_until", "hoist", "$add", "name"]);
        expect(views[0]).toMatchObject({ type: "perms", added: ["ADMINISTRATOR", "SEND_MESSAGES"], removed: [] });
        expect(views[1]).toMatchObject({ type: "color", old: "#000000", new: "#ff0000" });
        expect(views[2]).toMatchObject({ type: "seconds", old: 0, new: 300 });
        expect(views[3]).toMatchObject({ type: "seconds", new: 86400 });
        expect(views[4]).toMatchObject({ type: "date", new: Date.UTC(2026, 9, 2, 12) });
        expect(views[5]).toMatchObject({ type: "bool", old: false, new: true });
        expect(views[6]).toMatchObject({ type: "roles", added: true, roles: [{ id: "6", name: "Mods" }] });
        expect(views[7]).toMatchObject({ type: "text", old: "a", new: "b" });
    });

    test("permission bits beyond 32, and nonsense, decode safely", () => {
        expect(permissionNames((1n << 52n).toString())).toEqual(["BYPASS_SLOWMODE"]);
        expect(permissionNames("not a number")).toEqual([]);
        expect(permissionDiff("8", "0")).toEqual({ added: [], removed: ["ADMINISTRATOR"] });
        expect(humanize("MANAGE_GUILD_EXPRESSIONS")).toBe("Manage Guild Expressions");
        expect(humanize("$add")).toBe("Add");
    });

    test("durations pick the biggest whole unit", () => {
        expect(durationParts(300)).toEqual([5, "minute"]);
        expect(durationParts(86400)).toEqual([1, "day"]);
        expect(durationParts(604800)).toEqual([1, "week"]);
        expect(durationParts(90)).toEqual([2, "minute"]);
        expect(durationParts(5)).toEqual([5, "second"]);
    });

    test("snowflakes give the time; junk gives 0", () => {
        expect(snowflakeTime(flake(Date.UTC(2025, 0, 1)))).toBe(Date.UTC(2025, 0, 1));
        expect(snowflakeTime("nope")).toBe(0);
    });
});

describe("Audit Log Plus: grouping, filters, export", () => {
    const t0 = Date.UTC(2026, 9, 1, 12);
    const item = (n: number, over: Partial<RawEntry> = {}, minutesAgo = n) => ({
        entry: { id: flake(t0 - minutesAgo * 60_000, n), action_type: 72, user_id: "1", target_id: "2", ...over },
        time: t0 - minutesAgo * 60_000,
        count: 1,
    });

    test("runs of the same thing within 15 minutes fold into one", () => {
        const list = [item(0), item(1), item(2), item(3, { user_id: "3" }), item(4), item(40)];
        const out = groupRuns(list);
        expect(out.map(o => o.count)).toEqual([3, 1, 1, 1]);
        // Different keys changed: kept apart
        const a = item(0, { action_type: 24, changes: [{ key: "nick" }] });
        const b = item(1, { action_type: 24, changes: [{ key: "mute" }] });
        expect(groupRuns([a, b]).length).toBe(2);
    });

    test("filters by person, kind of action, dates and every search word", () => {
        const d = { entry: { id: "1", action_type: 20, user_id: "1" }, info: actionInfo(20), time: t0, text: "alice kicked bob spam" };
        expect(matches(d, {})).toBe(true);
        expect(matches(d, { actorId: "2" })).toBe(false);
        expect(matches(d, { groups: new Set(["members"]) })).toBe(true);
        expect(matches(d, { groups: new Set(["roles"]) })).toBe(false);
        expect(matches(d, { from: t0 + 1 })).toBe(false);
        expect(matches(d, { to: t0 - 1 })).toBe(false);
        expect(matches(d, { query: "  BOB   spam " })).toBe(true);
        expect(matches(d, { query: "bob ban" })).toBe(false);
    });

    test("CSV quotes what needs it and defuses spreadsheet formulas", () => {
        const csv = toCsv([{ time: "2026-10-01T12:00:00.000Z", action: "kicked", actionType: 20, actorId: "1", actor: "Alice, the mod", targetId: "2", target: "=HYPERLINK(\"x\")", reason: "said \"hi\"\nthen left", changes: "", count: 1 }]);
        expect(csv.startsWith("﻿time,action,actionType,")).toBe(true);
        expect(csv).toContain('"Alice, the mod"');
        expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
        expect(csv).toContain('"said ""hi""\nthen left"');
        expect(csv.endsWith("\r\n")).toBe(true);
    });

    test("export file names are safe", () => {
        expect(exportName("My Cool Server! 🎮", "csv", Date.UTC(2026, 9, 2))).toBe("audit-log-my-cool-server-2026-10-02.csv");
        expect(exportName("🎮🎮", "json", Date.UTC(2026, 9, 2))).toBe("audit-log-server-2026-10-02.json");
    });
});
