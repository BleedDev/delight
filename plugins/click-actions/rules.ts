/**
 * What a click on a message does: pure, so it's tested without Discord. The message type sets are
 * Discord's own (its MessageTypeSets, checked 2026-10-02): REPLYABLE is what its Reply button
 * shows on, UNDELETABLE what its Delete never does.
 */

export const REPLYABLE = new Set([0, 7, 19, 20, 23, 24, 25, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46]);
export const UNDELETABLE = new Set([1, 2, 3, 4, 5, 21, 35, 56, 57, 64, 68]);
/** Messages people type themselves (DEFAULT and REPLY): the only ones Discord lets you edit */
export const EDITABLE = new Set([0, 19]);

const EPHEMERAL = 1 << 6;
const VOICE_MESSAGE = 1 << 13;

export interface MessageLike {
    id: string;
    type: number;
    flags?: number;
    state?: string;
    author?: { id: string; };
}

/** Sent and on Discord's side: not still sending, not failed, not "only you can see this" */
const settled = (m: MessageLike) => (m.state ?? "SENT") === "SENT" && !((m.flags ?? 0) & EPHEMERAL);

export function canEdit(m: MessageLike, me: string) {
    return settled(m) && m.author?.id === me && EDITABLE.has(m.type) && !((m.flags ?? 0) & VOICE_MESSAGE);
}

export function canReply(m: MessageLike, canSend: boolean) {
    return canSend && settled(m) && REPLYABLE.has(m.type);
}

/** Yours, or anyone's in a server where you can manage messages */
export function canDelete(m: MessageLike, me: string, canManage: boolean) {
    if (!settled(m) || UNDELETABLE.has(m.type)) return false;
    return m.author?.id === me || canManage;
}

/** Discord's message rows: <li id="chat-messages-<channel>-<message>"> */
export function parseRowId(id: string | null | undefined): { channelId: string; messageId: string; } | undefined {
    const m = /^chat-messages-(\d+)-(\d+)$/.exec(id ?? "");
    return m ? { channelId: m[1], messageId: m[2] } : undefined;
}

/**
 * Clicks on these do their own thing (open a link, play a video, react, reveal a spoiler), or are
 * inside the message editor: never a click action
 */
export const IGNORE = [
    "a", "button", "input", "textarea", "select", "video", "audio", "img", "svg", "canvas",
    "[role=button]", "[role=link]", "[role=textbox]", "[contenteditable=true]",
    "[class*=reactions_]", "[class*=embed]", "[class*=spoiler]", "[class*=attachment]", "[class*=mediaMosaic]",
    "[class*=buttons_]", "[class*=poll]", "[class*=codeContainer]", "[class*=codeBlock]", "[class*=threadSuggestionBar]",
    "[class*=repliedMessage]", "[class*=messageAccessories] [class*=container]",
].join(",");

export type Modifier = "none" | "ctrl" | "alt";
export type Action = "edit" | "reply" | "delete";

export interface ClickSettings {
    doubleClickEdit: boolean;
    editModifier: Modifier;
    doubleClickReply: boolean;
    shiftClickDelete: boolean;
    deleteOthers: boolean;
}

export interface ClickInput {
    kind: "click" | "dblclick";
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
}

export interface Abilities {
    mine: boolean;
    edit: boolean;
    reply: boolean;
    delete: boolean;
}

const held = (input: ClickInput, modifier: Modifier) =>
    modifier === "ctrl" ? (input.ctrl || input.meta) && !input.alt : modifier === "alt" ? input.alt && !input.ctrl && !input.meta : !input.ctrl && !input.alt && !input.meta;

/** The action a click asks for, or nothing */
export function decide(input: ClickInput, settings: ClickSettings, can: Abilities): Action | undefined {
    if (input.kind === "click") {
        if (!input.shift || input.ctrl || input.alt || input.meta || !settings.shiftClickDelete) return;
        if (!can.delete || (!can.mine && !settings.deleteOthers)) return;
        return "delete";
    }
    // Shift+double-click is two Shift+clicks: the first already deleted
    if (input.shift) return;
    if (can.mine) return settings.doubleClickEdit && can.edit && held(input, settings.editModifier) ? "edit" : undefined;
    return settings.doubleClickReply && can.reply && !input.ctrl && !input.alt && !input.meta ? "reply" : undefined;
}

/** A drag, not a click: the pointer moved further than a shaky hand would */
export const isDrag = (from: { x: number; y: number; }, to: { x: number; y: number; }) => Math.hypot(to.x - from.x, to.y - from.y) > 4;
