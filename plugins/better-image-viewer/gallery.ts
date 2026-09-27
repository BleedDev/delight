/** Pure helpers for Better Image Viewer, unit tested in tests/betterImageViewer.test.ts */

/** An item of Discord's media viewer, the shape openMediaViewer({ items }) takes */
export interface MediaItem {
    type?: string;
    url?: string;
    proxyUrl?: string;
    width?: number;
    height?: number;
    alt?: string;
    sourceMetadata?: { message?: any; identifier?: { type?: string; attachmentId?: string; embedIndex?: number; }; };
    [key: string]: any;
}

/** Turns a message attachment into a viewer item: Discord's own helper, or attachmentItem below */
export type AttachmentToItem = (attachment: any, message: any) => MediaItem | null | undefined;

/** Images kept on each side of the clicked one, so a huge channel doesn't hand the viewer thousands */
export const MAX_AROUND = 100;

// MessageAttachmentFlags / EmbedFlags
const IS_SPOILER = 1 << 3;
const CONTAINS_EXPLICIT_MEDIA = 1 << 4;

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff?)(?:$|[?#])/i;

/** Whether an attachment is an image, by content type or, without one, by file name */
export function isImageAttachment(a: { content_type?: string; contentType?: string; filename?: string; url?: string; }) {
    const type = a.content_type ?? a.contentType;
    if (type) return type.startsWith("image/");
    return IMAGE_EXT.test(a.filename ?? "") || IMAGE_EXT.test(a.url ?? "");
}

/** Spoilered or flagged as sensitive: never shown unless the user clicks it themselves */
export function isHiddenAttachment(a: { filename?: string; spoiler?: boolean; flags?: number; }) {
    return !!a.spoiler || /^SPOILER_/.test(a.filename ?? "") || ((a.flags ?? 0) & (IS_SPOILER | CONTAINS_EXPLICIT_MEDIA)) !== 0;
}

const isHttp = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

/** Fallback for Discord's attachment helper, in the same shape */
export const attachmentItem: AttachmentToItem = (a, message) => ({
    type: "IMAGE",
    url: a.url,
    proxyUrl: a.proxy_url ?? a.proxyUrl,
    width: a.width,
    height: a.height,
    contentType: a.content_type,
    placeholder: a.placeholder,
    placeholderVersion: a.placeholder_version,
    alt: a.description || undefined,
    sourceMetadata: { message, identifier: { type: "attachment", attachmentId: a.id, filename: a.filename, size: a.size } },
});

/** An embed image as a viewer item, the shape Discord builds for them */
function embedItem(media: any, message: any, embedIndex: number): MediaItem | undefined {
    const proxyUrl = media?.proxyURL ?? media?.proxy_url;
    if (!isHttp(media?.url) && !isHttp(proxyUrl)) return;
    return {
        type: "IMAGE",
        url: media.url ?? proxyUrl,
        proxyUrl,
        width: media.width,
        height: media.height,
        placeholder: media.placeholder,
        placeholderVersion: media.placeholderVersion,
        contentType: media.contentType,
        sourceMetadata: { message, identifier: { type: "embed", embedIndex } },
    };
}

/** The images of one message Discord's viewer can show: attachments, then embed images */
export function imagesOfMessage(message: any, toItem: AttachmentToItem = attachmentItem): MediaItem[] {
    const out: MediaItem[] = [];
    if (!message) return out;
    const seen = new Set<string>();
    const add = (item: MediaItem | null | undefined) => {
        const key = item?.url?.split("?")[0];
        if (!item || item.type !== "IMAGE" || !key || seen.has(key)) return;
        seen.add(key);
        out.push(item);
    };

    for (const a of message.attachments ?? []) {
        if (a && isImageAttachment(a) && !isHiddenAttachment(a)) add(toItem(a, message));
    }

    // Links wrapped in ||spoilers|| still embed, so skip a spoilered message's embeds altogether
    if (typeof message.content === "string" && message.content.includes("||")) return out;
    (message.embeds ?? []).forEach((embed: any, i: number) => {
        if (!embed || embed.type === "gifv" || embed.video || ((embed.flags ?? 0) & CONTAINS_EXPLICIT_MEDIA)) return;
        const media: any[] = [];
        if (embed.image) media.push(embed.image);
        if (Array.isArray(embed.images)) media.push(...embed.images.filter((m: any) => m !== embed.image));
        // A bare image link comes through as an "image" embed with the picture in the thumbnail
        if (!media.length && embed.type === "image" && embed.thumbnail) media.push(embed.thumbnail);
        for (const m of media) add(embedItem(m, message, i));
    });
    return out;
}

/**
 * The viewer's items widened to every image in the channel. The clicked message keeps exactly the
 * items Discord gave it, the other messages add their images around them, oldest first. Undefined
 * when the clicked message isn't among `messages`, which leaves the call as it was.
 */
export function channelGallery(
    messages: readonly any[],
    clickedMessageId: string,
    items: readonly MediaItem[],
    startingIndex: number,
    toItem: AttachmentToItem = attachmentItem,
    skip: (message: any) => boolean = () => false,
): { items: MediaItem[]; startingIndex: number; } | undefined {
    const at = messages.findIndex(m => m?.id === clickedMessageId);
    if (at === -1) return;

    const before = messages.slice(0, at).filter(m => !skip(m)).flatMap(m => imagesOfMessage(m, toItem));
    const after = messages.slice(at + 1).filter(m => !skip(m)).flatMap(m => imagesOfMessage(m, toItem));
    const kept = before.slice(Math.max(0, before.length - MAX_AROUND));
    return {
        items: [...kept, ...items, ...after.slice(0, MAX_AROUND)],
        startingIndex: kept.length + startingIndex,
    };
}
