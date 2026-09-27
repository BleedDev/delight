/**
 * DM sidebar: "Last seen 3h ago" under offline 1:1 DM contacts.
 *
 * The row's subText is `isSystemDM() ? … : isMultiUserDM() ? members : hasActivity ? activity : null`.
 * Only that final `null` is replaced, so system DMs, group DMs and anyone Discord already shows an
 * activity or custom status for keep Discord's own line and the row keeps its single-line height.
 */
import { React } from "@evi/api";
import type { SourcePatch } from "@evi/api";

import { LastSeenLine } from "./line";
import { entryOf, ignored, state } from "./state";
import { isOnlineStatus, lineText } from "./track";

export const dmPatches: SourcePatch[] = [
    {
        // subText:t.isSystemDM()?…:t.isMultiUserDM()?…:(0,w.A)({activities:A,status:m,applicationStream:f,voiceChannel:p})?(0,i.jsx)(x.A,{…}):null,name:
        find: "PrivateChannel.renderAvatar: Invalid prop",
        replace: {
            match: /(subText:(\i)\.isSystemDM\(\)\?.{0,600}?:\(0,\i\.\i\)\(\{activities:\i,status:(\i),applicationStream:\i,voiceChannel:\i\}\)\?.{0,300}?):null,name:/,
            with: "$1:$self?.dmSubText?.($2,$3)??null,name:",
        },
    },
];

export const dmMethods = {
    dmSubText(channel: { getRecipientId?: () => string | undefined; } | null | undefined, status: string | undefined) {
        try {
            if (!state.context?.settings.get("showInDms") || isOnlineStatus(status)) return null;
            const id = channel?.getRecipientId?.();
            // Nothing to say: return null so Discord doesn't render an empty subtext row
            if (!id || ignored(id) || !lineText(entryOf(id), Date.now())) return null;
            return <LastSeenLine userId={id} setting="showInDms" />;
        } catch (e) {
            state.context?.logger.error("DM subtext failed", e);
            return null;
        }
    },
};
