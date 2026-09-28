/** The muted "Last seen 3h ago" line under a name, shared by the member list, friends list and DM list */
import { Components, React, useLocale } from "@evi/api";

import { fullText, lineOf, useUser } from "./state";
import type { Where } from "./state";

// The text sits in a block that fills the line, so hovering anywhere on it reaches its handler
export const lineCss = `
.evi-last-seen-sub { display: block; color: var(--text-muted, #949ba4); font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-last-seen-sub > span { display: block; overflow: hidden; text-overflow: ellipsis; }
`;

interface LineProps { userId: string; setting: Where; className?: string; }

let memoized: React.ComponentType<LineProps> | undefined;

/**
 * The line component, memoized. React.memo can't run when the plugin loads (Discord's React isn't
 * there yet), so it's made on first use: `const Line = lastSeenLine(); <Line ... />`.
 */
export const lastSeenLine = () => memoized ??= React.memo(LastSeenLine);

/**
 * Renders nothing when the setting is off, the person is online, or nothing is known. Re-renders
 * only when this person's line changes; the long hover text is only put together on hover.
 */
function LastSeenLine({ userId, setting, className }: LineProps) {
    useLocale();
    const text = useUser(userId, () => lineOf(userId, setting));
    const [hovered, setHovered] = React.useState(false);
    if (!text) return null;
    const Tooltip = Components.Tooltip;
    const full = hovered || !Tooltip ? fullText(userId) ?? text : text;
    const line = (
        <span className={className ? `evi-last-seen-sub ${className}` : "evi-last-seen-sub"}>
            <span onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>{text}</span>
        </span>
    );
    return Tooltip ? <Tooltip text={full}>{line}</Tooltip> : <span title={full}>{line}</span>;
}
