/**
 * Desktop Voice Messages' source patch, pure so tests/voiceMessages.test.ts can apply it to Discord's
 * code (checked 2026-10-02). Discord's chat bar builds its buttons into an array:
 *     K&&L&&j.push((0,i.jsx)(v,{channelId:T.id,type:f},"appLauncher")),$&&j.push(...submit...),0===j.length)?null:...
 * Our microphone goes in right after the app launcher, before the send button, with the channel and
 * the chat bar's type (only the normal chat bar gets it, not edits, threads' first message or forms).
 */
import type { SourcePatch } from "@evi/api";

export const PATCHES = {
    chatButton: {
        find: '"appLauncher")',
        replace: {
            match: /(\i)\.push\(\(0,\i\.jsx\)\(\i,\{channelId:(\i)\.id,type:(\i)\},"appLauncher"\)\),/,
            with: "$&$self?.chatButton?.($1,$2,$3),",
        },
    },
} satisfies Record<string, SourcePatch>;
