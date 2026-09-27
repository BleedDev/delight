/**
 * Better Image Viewer: Discord's own image viewer, with the arrows going through every loaded image
 * in the channel instead of stopping at the edges of the clicked message.
 *
 * Discord opens its viewer through one function (module "Media Viewer Modal", export
 * openMediaViewer({ items, startingIndex, location, contextKey, ... })), found by the analytics
 * call only it makes: markSessionStarted({ ..., hasMediaOptions: !shouldHideMediaOptions }).
 * Before it runs we widen `items`: the clicked message keeps the items Discord built, and the
 * channel's other images are added around them, built by Discord's own attachment helper
 * ({ ...media, type: "IMAGE" | "VIDEO" | "INVALID", alt, sourceMetadata: { message, identifier } }).
 * Everything else about the viewer (zoom, save, copy, forward, the right-click menu) is Discord's.
 *
 * Spoilers, media flagged as sensitive and blocked or ignored users' images are never added.
 * Anything that isn't an image clicked in a single message is left exactly as Discord made it.
 */
import { definePlugin, filters, findStore } from "@evi/api";

import { AttachmentToItem, attachmentItem, channelGallery, MediaItem } from "./gallery";

// Discord's attachment -> viewer item helper, with our copy of it until (or unless) it's found
let toItem: AttachmentToItem = attachmentItem;

function channelMessages(channelId: string): any[] {
    const channel = findStore("MessageStore")?.getMessages?.(channelId);
    if (!channel) return [];
    return channel.toArray?.() ?? channel._array ?? (Array.isArray(channel) ? channel : []);
}

/** Whether a message's author is blocked or ignored; RelationshipStore is looked up once per gallery, not per message */
function hiddenAuthors(): (message: any) => boolean {
    const relationships = findStore("RelationshipStore");
    return message => {
        const id = message?.author?.id;
        if (!id) return false;
        return !!(relationships?.isBlockedOrIgnored?.(id) ?? relationships?.isBlocked?.(id));
    };
}

/** The options with the whole channel's images, or undefined to leave them alone */
function widen(options: any) {
    const items: MediaItem[] = Array.isArray(options?.items) ? options.items : [];
    const start = options?.startingIndex ?? 0;
    const message = items[start]?.sourceMetadata?.message;
    if (items[start]?.type !== "IMAGE" || !message?.id || !message.channel_id) return;
    // Already a multi-message gallery (a media channel, search...): Discord knows best there
    if (!items.every(i => i?.sourceMetadata?.message?.id === message.id)) return;

    const gallery = channelGallery(channelMessages(message.channel_id), message.id, items, start, toItem, hiddenAuthors());
    if (!gallery || gallery.items.length === items.length) return;
    return { ...options, ...gallery };
}

export default definePlugin({
    start(ctx) {
        ctx.waitFor<AttachmentToItem>(filters.byCode('"VIDEO":"INVALID",alt:', 'identifier:{type:"attachment",attachmentId:'), helper => toItem = helper);
        ctx.onDispose(() => toItem = attachmentItem);

        // Discord's openMediaViewer: the only function reporting hasMediaOptions when it starts a session
        ctx.hookExport("before", filters.byCode("markSessionStarted", "hasMediaOptions:!"), call => {
            try {
                const widened = widen(call.args[0]);
                if (widened) call.args = [widened, ...call.args.slice(1)];
            } catch (err) {
                ctx.logger.error("Couldn't add the channel's images, opening the viewer as is", err);
            }
        });
    },
});
