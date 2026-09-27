/** The muted "Last seen 3h ago" line under a name, shared by the member list, friends list and DM list */
import { Components, React } from "@evi/api";

import { entryOf, fullText, isOnline, state, useVersion } from "./state";
import type { Settings } from "./state";
import { lineText } from "./track";

export const lineCss = `
.evi-last-seen-sub { display: block; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

type Where = { [K in keyof Settings]: Settings[K]["type"] extends "boolean" ? K : never }[keyof Settings];

/** Renders nothing when the setting is off, the person is online, or nothing is known */
export function LastSeenLine({ userId, setting, className }: { userId: string; setting: Where; className?: string; }) {
    useVersion();
    if (!state.context?.settings.get(setting)) return null;
    if (isOnline(userId)) return null;
    const text = lineText(entryOf(userId), Date.now());
    if (!text) return null;
    const full = fullText(userId) ?? text;
    const line = <span className={className ? `evi-last-seen-sub ${className}` : "evi-last-seen-sub"}>{text}</span>;
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={full}>{line}</Tooltip> : <span title={full}>{line}</span>;
}
