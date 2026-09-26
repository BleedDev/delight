import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS, DelightSettings, PluginManifest, RecentChange } from "../src/shared/ipc";
import { addChange, diffSettings, MAX_CHANGES, pickSuspect, startupMode } from "../src/shared/safeMode";

const settings = (patch: Partial<DelightSettings> = {}): DelightSettings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch });
const change = (c: Partial<RecentChange>): RecentChange => ({ kind: "plugin", id: "a", action: "enabled", at: 1, ...c });

describe("startup mode", () => {
    test("two failed starts in a row mean safe mode, four mean one vanilla start", () => {
        expect(startupMode({ pendingStarts: 0, changes: [] }, false)).toBe("normal");
        expect(startupMode({ pendingStarts: 1, changes: [] }, false)).toBe("normal");
        expect(startupMode({ pendingStarts: 2, changes: [] }, false)).toBe("safe");
        expect(startupMode({ pendingStarts: 3, changes: [] }, false)).toBe("safe");
        expect(startupMode({ pendingStarts: 4, changes: [] }, false)).toBe("vanilla");
    });

    test("the flag and sticky safe mode", () => {
        expect(startupMode({ pendingStarts: 0, changes: [] }, true)).toBe("safe");
        expect(startupMode({ pendingStarts: 0, forceSafe: "renderer-crash", changes: [] }, false)).toBe("safe");
    });
});

describe("recent changes", () => {
    test("records what got turned on or changed, not what got turned off", () => {
        const prev = settings({ plugins: { a: { enabled: true }, b: { enabled: false, settings: { x: 1 } } }, enabledThemes: ["old.css"], quickCss: false });
        const next = settings({ plugins: { a: { enabled: false }, b: { enabled: false, settings: { x: 2 } }, c: { enabled: true } }, enabledThemes: ["new.css"], quickCss: true });
        expect(diffSettings(prev, next)).toEqual([
            { kind: "plugin", id: "b", action: "settings" },
            { kind: "plugin", id: "c", action: "enabled" },
            { kind: "theme", id: "new.css", action: "enabled" },
            { kind: "quickCss", id: "quick.css", action: "enabled" },
        ]);
        expect(diffSettings(next, next)).toEqual([]);
    });

    test("newest first, repeats only bump the time, capped", () => {
        let list: RecentChange[] = [];
        list = addChange(list, change({ id: "a", at: 1 }));
        list = addChange(list, change({ kind: "quickCss", id: "quick.css", action: "edited", at: 2 }));
        list = addChange(list, change({ kind: "quickCss", id: "quick.css", action: "edited", at: 3 }));
        expect(list.map(c => [c.id, c.at])).toEqual([["quick.css", 3], ["a", 1]]);
        for (let i = 0; i < 20; i++) list = addChange(list, change({ id: `p${i}` }));
        expect(list.length).toBe(MAX_CHANGES);
        expect(list[0].id).toBe("p19");
    });

    test("the suspect is the newest change that's still on", () => {
        const manifests: PluginManifest[] = [{ id: "a", name: "A" }, { id: "b", name: "B", enabledByDefault: true }];
        const changes = [
            change({ id: "a", at: 3 }),
            change({ kind: "theme", id: "t.css", at: 2 }),
            change({ id: "b", action: "updated", at: 1 }),
        ];
        // a was turned off again, t.css is on
        expect(pickSuspect(changes, settings({ plugins: { a: { enabled: false } }, enabledThemes: ["t.css"] }), manifests)?.id).toBe("t.css");
        // Both off: b is on by default
        expect(pickSuspect(changes, settings(), manifests)?.id).toBe("b");
        // A plugin that's gone can't be it
        expect(pickSuspect([change({ id: "gone" })], settings({ plugins: { gone: { enabled: true } } }), manifests)).toBeUndefined();
    });
});
