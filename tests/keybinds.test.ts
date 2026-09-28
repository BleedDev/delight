import { describe, expect, test } from "bun:test";

import { comboFromEvent, comboKeys, comboProblem, formatCombo, keyName, matchesCombo, parseCombo } from "../src/shared/keybinds";
import { keybindConflict, matchesPlugin, matchingSettings } from "../src/shared/pluginSearch";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) =>
    ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("combos", () => {
    test("a key press makes the stored form, modifiers in one order", () => {
        expect(formatCombo(comboFromEvent(key("KeyG", { shiftKey: true, ctrlKey: true }))!)).toBe("Ctrl+Shift+KeyG");
        expect(formatCombo(comboFromEvent(key("F5"))!)).toBe("F5");
        expect(formatCombo(parseCombo("Shift+Ctrl+KeyG")!)).toBe("Ctrl+Shift+KeyG");
    });

    test("modifiers alone aren't a shortcut yet", () => {
        expect(comboFromEvent(key("ControlLeft", { ctrlKey: true }))).toBeUndefined();
        expect(comboFromEvent(key("ShiftRight", { shiftKey: true, ctrlKey: true }))).toBeUndefined();
        expect(comboFromEvent(key("MetaLeft", { metaKey: true }))).toBeUndefined();
    });

    test("matches exactly the keys recorded", () => {
        expect(matchesCombo(key("KeyG", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+KeyG")).toBe(true);
        expect(matchesCombo(key("KeyG", { ctrlKey: true }), "Ctrl+Shift+KeyG")).toBe(false);
        expect(matchesCombo(key("KeyG", { ctrlKey: true, shiftKey: true, altKey: true }), "Ctrl+Shift+KeyG")).toBe(false);
        expect(matchesCombo(key("KeyG", { ctrlKey: true, shiftKey: true }), "")).toBe(false);
    });

    test("rejects what isn't a combo", () => {
        expect(parseCombo("")).toBeUndefined();
        expect(parseCombo(undefined)).toBeUndefined();
        expect(parseCombo("Ctrl+Shift")).toBeUndefined();
        expect(parseCombo("Hyper+KeyA")).toBeUndefined();
        expect(parseCombo("Ctrl+ShiftLeft")).toBeUndefined();
    });

    test("needs Ctrl, Alt or Meta, except the function keys", () => {
        expect(comboProblem(parseCombo("KeyG")!)).toBe("needsModifier");
        expect(comboProblem(parseCombo("Shift+KeyG")!)).toBe("needsModifier");
        expect(comboProblem(parseCombo("Alt+KeyG")!)).toBeUndefined();
        expect(comboProblem(parseCombo("Meta+KeyG")!)).toBeUndefined();
        expect(comboProblem(parseCombo("F9")!)).toBeUndefined();
        expect(comboProblem(parseCombo("Shift+F24")!)).toBeUndefined();
        expect(comboProblem(parseCombo("F25")!)).toBe("needsModifier");
    });

    test("Evi's settings shortcut stays Evi's", () => {
        expect(comboProblem(parseCombo("Ctrl+Shift+KeyD")!)).toBe("reserved");
        expect(comboProblem(parseCombo("Ctrl+Alt+Shift+KeyD")!)).toBeUndefined();
    });
});

describe("labels", () => {
    test("keys by what's printed on them", () => {
        expect(keyName("KeyG")).toBe("G");
        expect(keyName("Digit7")).toBe("7");
        expect(keyName("ArrowUp")).toBe("↑");
        expect(keyName("Numpad1")).toBe("Num 1");
        expect(keyName("NumpadAdd")).toBe("Num +");
        expect(keyName("F11")).toBe("F11");
    });

    test("keycaps, with macOS's symbols there", () => {
        expect(comboKeys("Ctrl+Shift+KeyG")).toEqual(["Ctrl", "Shift", "G"]);
        expect(comboKeys("Alt+Meta+Space", true)).toEqual(["⌥", "⌘", "Space"]);
        expect(comboKeys("")).toEqual([]);
    });
});

describe("plugin search", () => {
    const settings = {
        blur: { type: "number", label: "Blur strength", description: "In pixels." },
        media: { type: "boolean", label: "Images and embeds", description: "Images, videos and stickers in chat." },
        mode: { type: "select", label: "Turn on", options: [{ label: "When you go live" }, { label: "Never" }] },
    };
    const plugin = { name: "Streamer Mode+", description: "Hides things while you stream.", id: "streamer-mode-plus", authors: ["Evi"], settings };

    test("finds settings by label, description or option", () => {
        expect(matchingSettings(settings, "blur")).toEqual(["blur"]);
        expect(matchingSettings(settings, "stickers")).toEqual(["media"]);
        expect(matchingSettings(settings, "go live")).toEqual(["mode"]);
        expect(matchingSettings(settings, "")).toEqual([]);
        expect(matchingSettings(undefined, "blur")).toEqual([]);
    });

    test("a plugin matches by what it is or by one of its settings", () => {
        expect(matchesPlugin(plugin, "")).toBe(true);
        expect(matchesPlugin(plugin, "streamer")).toBe(true);
        expect(matchesPlugin(plugin, "evi")).toBe(true);
        expect(matchesPlugin(plugin, "pixels")).toBe(true);
        expect(matchesPlugin(plugin, "translate")).toBe(false);
    });

    test("says who else has a shortcut, never the setting itself", () => {
        const owners = [
            { pluginId: "a", pluginName: "Alpha", key: "k", label: "Toggle", value: "Ctrl+KeyK" },
            { pluginId: "b", pluginName: "Beta", key: "go", label: "Go", value: "Alt+KeyG" },
        ];
        expect(keybindConflict(owners, "Ctrl+KeyK", { pluginId: "b", key: "go" })).toBe("Alpha: Toggle");
        expect(keybindConflict(owners, "Ctrl+KeyK", { pluginId: "a", key: "k" })).toBeUndefined();
        expect(keybindConflict(owners, "Ctrl+KeyJ", { pluginId: "b", key: "go" })).toBeUndefined();
    });
});
