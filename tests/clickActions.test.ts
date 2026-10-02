import { describe, expect, test } from "bun:test";

import { canDelete, canEdit, canReply, ClickInput, ClickSettings, decide, isDrag, parseRowId } from "../plugins/click-actions/rules";

const ME = "1";
const mine = { id: "10", type: 0, author: { id: ME } };
const theirs = { id: "11", type: 0, author: { id: "2" } };
const settings: ClickSettings = { doubleClickEdit: true, editModifier: "none", doubleClickReply: true, shiftClickDelete: true, deleteOthers: false };
const dbl: ClickInput = { kind: "dblclick", shift: false, ctrl: false, alt: false, meta: false };
const shiftClick: ClickInput = { kind: "click", shift: true, ctrl: false, alt: false, meta: false };
const all = { edit: true, reply: true, delete: true };

describe("Click Actions: what Discord would allow", () => {
    test("edit: your own typed messages, sent, not voice messages", () => {
        expect(canEdit(mine, ME)).toBe(true);
        expect(canEdit({ ...mine, type: 19 }, ME)).toBe(true);
        expect(canEdit(theirs, ME)).toBe(false);
        expect(canEdit({ ...mine, type: 7 }, ME)).toBe(false);
        expect(canEdit({ ...mine, flags: 1 << 13 }, ME)).toBe(false);
        expect(canEdit({ ...mine, state: "SENDING" }, ME)).toBe(false);
        expect(canEdit({ ...mine, state: "SEND_FAILED" }, ME)).toBe(false);
    });

    test("reply: Discord's replyable types, where you can send, not ephemeral", () => {
        expect(canReply(theirs, true)).toBe(true);
        expect(canReply({ ...theirs, type: 7 }, true)).toBe(true);
        expect(canReply(theirs, false)).toBe(false);
        expect(canReply({ ...theirs, type: 3 }, true)).toBe(false);
        expect(canReply({ ...theirs, flags: 1 << 6 }, true)).toBe(false);
    });

    test("delete: yours, or anyone's where you manage messages; never undeletable types", () => {
        expect(canDelete(mine, ME, false)).toBe(true);
        expect(canDelete(theirs, ME, false)).toBe(false);
        expect(canDelete(theirs, ME, true)).toBe(true);
        expect(canDelete({ ...mine, type: 21 }, ME, true)).toBe(false);
        expect(canDelete({ ...mine, state: "SENDING" }, ME, false)).toBe(false);
    });

    test("the message row's id gives the channel and message", () => {
        expect(parseRowId("chat-messages-123-456")).toEqual({ channelId: "123", messageId: "456" });
        expect(parseRowId("chat-messages-123")).toBeUndefined();
        expect(parseRowId("message-content-456")).toBeUndefined();
        expect(parseRowId(null)).toBeUndefined();
    });
});

describe("Click Actions: which click does what", () => {
    test("double-click edits yours and replies to theirs", () => {
        expect(decide(dbl, settings, { mine: true, ...all })).toBe("edit");
        expect(decide(dbl, settings, { mine: false, ...all })).toBe("reply");
        // Yours but not editable (a system message): nothing, not a reply to yourself
        expect(decide(dbl, settings, { mine: true, ...all, edit: false })).toBeUndefined();
        expect(decide(dbl, { ...settings, doubleClickEdit: false }, { mine: true, ...all })).toBeUndefined();
        expect(decide(dbl, { ...settings, doubleClickReply: false }, { mine: false, ...all })).toBeUndefined();
    });

    test("an edit modifier has to be held, and only it", () => {
        const ctrl = { ...settings, editModifier: "ctrl" as const };
        expect(decide(dbl, ctrl, { mine: true, ...all })).toBeUndefined();
        expect(decide({ ...dbl, ctrl: true }, ctrl, { mine: true, ...all })).toBe("edit");
        expect(decide({ ...dbl, meta: true }, ctrl, { mine: true, ...all })).toBe("edit");
        expect(decide({ ...dbl, ctrl: true, alt: true }, ctrl, { mine: true, ...all })).toBeUndefined();
        expect(decide({ ...dbl, alt: true }, { ...settings, editModifier: "alt" }, { mine: true, ...all })).toBe("edit");
        // With no modifier set, a modifier held means something else: no edit
        expect(decide({ ...dbl, ctrl: true }, settings, { mine: true, ...all })).toBeUndefined();
    });

    test("Shift+click deletes yours; others' only when turned on", () => {
        expect(decide(shiftClick, settings, { mine: true, ...all })).toBe("delete");
        expect(decide(shiftClick, settings, { mine: false, ...all })).toBeUndefined();
        expect(decide(shiftClick, { ...settings, deleteOthers: true }, { mine: false, ...all })).toBe("delete");
        expect(decide(shiftClick, { ...settings, deleteOthers: true }, { mine: false, ...all, delete: false })).toBeUndefined();
        expect(decide(shiftClick, { ...settings, shiftClickDelete: false }, { mine: true, ...all })).toBeUndefined();
    });

    test("a plain click, Ctrl+Shift+click and Shift+double-click do nothing", () => {
        expect(decide({ ...shiftClick, shift: false }, settings, { mine: true, ...all })).toBeUndefined();
        expect(decide({ ...shiftClick, ctrl: true }, settings, { mine: true, ...all })).toBeUndefined();
        expect(decide({ ...dbl, shift: true }, settings, { mine: true, ...all })).toBeUndefined();
    });

    test("a drag isn't a click", () => {
        expect(isDrag({ x: 0, y: 0 }, { x: 2, y: 3 })).toBe(false);
        expect(isDrag({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
    });
});
