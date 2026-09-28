/**
 * Keyboard shortcuts as plugins store them: modifiers then a key's `code`, joined with "+", like
 * "Ctrl+Shift+KeyG". `code` is the physical key, so a shortcut works whatever the keyboard layout
 * types and whether Shift changes the character. "" is no shortcut.
 */

export const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
export type Modifier = typeof MODIFIERS[number];

export interface KeyCombo {
    modifiers: Set<Modifier>;
    code: string;
}

/** The fields of a KeyboardEvent a combo is made of */
export interface KeyLike {
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

/** Codes of the modifier keys themselves: pressed alone, they aren't a shortcut yet */
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

/** Evi's own Ctrl+Shift+D (settings panel) always wins, so a plugin can't have it */
export const RESERVED = ["Ctrl+Shift+KeyD"];

export function parseCombo(value: unknown): KeyCombo | undefined {
    if (typeof value !== "string" || !value) return;
    const parts = value.split("+");
    const code = parts.pop()!;
    if (!code || MODIFIER_CODES.test(code)) return;
    const modifiers = new Set<Modifier>();
    for (const part of parts) {
        if (!(MODIFIERS as readonly string[]).includes(part)) return;
        modifiers.add(part as Modifier);
    }
    return { modifiers, code };
}

/** The stored form, modifiers always in the same order */
export function formatCombo(combo: KeyCombo): string {
    return [...MODIFIERS.filter(m => combo.modifiers.has(m)), combo.code].join("+");
}

/** The combo a key press makes, or undefined while only modifiers are down */
export function comboFromEvent(e: KeyLike): KeyCombo | undefined {
    if (!e.code || MODIFIER_CODES.test(e.code)) return;
    const modifiers = new Set<Modifier>();
    if (e.ctrlKey) modifiers.add("Ctrl");
    if (e.altKey) modifiers.add("Alt");
    if (e.shiftKey) modifiers.add("Shift");
    if (e.metaKey) modifiers.add("Meta");
    return { modifiers, code: e.code };
}

export function matchesCombo(e: KeyLike, value: string): boolean {
    const pressed = comboFromEvent(e);
    return !!pressed && !!value && formatCombo(pressed) === value;
}

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

export type ComboProblem = "needsModifier" | "reserved";

/**
 * Why a combo can't be a shortcut. Without Ctrl, Alt or Meta it would fire while typing (Shift+G is
 * just a capital G), so only the function keys go alone.
 */
export function comboProblem(combo: KeyCombo): ComboProblem | undefined {
    if (RESERVED.includes(formatCombo(combo))) return "reserved";
    const strong = combo.modifiers.has("Ctrl") || combo.modifiers.has("Alt") || combo.modifiers.has("Meta");
    if (!strong && !FUNCTION_KEY.test(combo.code)) return "needsModifier";
}

const KEY_NAMES: Record<string, string> = {
    Space: "Space", Enter: "Enter", Escape: "Esc", Backspace: "Backspace", Tab: "Tab", Delete: "Del", Insert: "Ins",
    Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
    Comma: ",", Period: ".", Slash: "/", Backquote: "`", IntlBackslash: "\\",
};

/** A key's label: KeyG is G, Digit1 is 1, Numpad1 is Num 1 */
export function keyName(code: string): string {
    if (code in KEY_NAMES) return KEY_NAMES[code];
    const m = /^(?:Key|Digit)(.)$/.exec(code);
    if (m) return m[1];
    const pad = /^Numpad(.+)$/.exec(code);
    if (pad) return `Num ${({ Add: "+", Subtract: "-", Multiply: "*", Divide: "/", Decimal: ".", Enter: "Enter" } as Record<string, string>)[pad[1]] ?? pad[1]}`;
    return code;
}

/** The labels to draw as keycaps, in the order they're pressed. macOS names its modifiers by symbol. */
export function comboKeys(value: string, mac = false): string[] {
    const combo = parseCombo(value);
    if (!combo) return [];
    const names: Record<Modifier, string> = mac
        ? { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" }
        : { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Win" };
    return [...MODIFIERS.filter(m => combo.modifiers.has(m)).map(m => names[m]), keyName(combo.code)];
}
