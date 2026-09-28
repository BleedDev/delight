/**
 * Friends list: offline friends get "Last seen 3h ago" in place of Discord's "Offline" line. The
 * row has room for one line of subtext, so this replaces it rather than adding a second one, and
 * falls back to Discord's own when there's nothing to show.
 */
import { React, useLocale } from "@evi/api";
import type { SourcePatch } from "@evi/api";

import { lastSeenLine } from "./line";
import { ignored, lineOf, state, useUser } from "./state";
import { isOnlineStatus } from "./track";

export const friendsPatches: SourcePatch[] = [
    {
        // The friends page row: subText:(0,L.jsx)(dU,{hovered:t,activities:i,applicationStream:r,status:a,user:e,userIgnored:nY.A.isIgnored(e.id)})
        find: "peopleListItemRef",
        replace: {
            match: /subText:(\(0,\i\.jsx\)\(\i,\{hovered:\i,activities:\i,applicationStream:\i,status:(\i),user:(\i),userIgnored:[^}]*\}\))/,
            with: "subText:$self?.friendSubText?.($1,$3,$2)??$1",
        },
    },
];

interface SubTextProps { original: React.ReactNode; userId: string; }

/** Re-renders only when whether this friend has a line changes (or the row itself re-renders) */
function FriendSubText({ original, userId }: SubTextProps) {
    useLocale();
    const show = useUser(userId, () => !!lineOf(userId, "showInFriends"));
    const Line = lastSeenLine();
    return show ? <Line userId={userId} setting="showInFriends" /> : <>{original}</>;
}

/** Memoized on first use: React isn't there yet when the plugin loads */
let memoized: React.ComponentType<SubTextProps> | undefined;

export const friendsMethods = {
    friendSubText(original: any, user: { id?: string; bot?: boolean; } | null | undefined, status: string | undefined) {
        try {
            // Ignored users show "Ignored" there, which matters more
            if (!state.context || !user?.id || isOnlineStatus(status) || original?.props?.userIgnored || ignored(user.id, user.bot)) return original;
            const SubText = memoized ??= React.memo(FriendSubText);
            return <SubText original={original} userId={user.id} />;
        } catch (e) {
            state.context?.logger.error("Friends list line failed", e);
            return original;
        }
    },
};
