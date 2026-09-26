import { definePlugin, findMenuGroup, getStore, Menu } from "@evi/api";
import type { ReactNode } from "react";

import {
    cleanImageUrl, discordOrigin, googleLanguage, IMAGE_SEARCH_ENGINES, isImageAttachment, isVideoUrl, messageLink, translateUrl,
} from "./urls";

async function copy(text: string) {
    const native = (window as any).DiscordNative?.clipboard;
    if (native?.copy) native.copy(text);
    else await navigator.clipboard.writeText(text);
}

/** Opens in the user's browser: Discord's desktop app sends window.open of web links there */
const openExternal = (url: string) => void window.open(url, "_blank", "noopener,noreferrer");

/** The image the menu was opened on, or else the message's first image attachment or embed image */
function findImage(message: any, props: Record<string, any>): string | undefined {
    const target = props.itemSafeSrc || props.itemSrc;
    if (typeof target === "string" && !isVideoUrl(target)) return cleanImageUrl(target);

    const attachment = (message.attachments ?? []).find(isImageAttachment);
    if (attachment?.url) return cleanImageUrl(attachment.url);
    for (const embed of message.embeds ?? []) {
        const url = embed?.image?.url ?? embed?.thumbnail?.url;
        if (url && !isVideoUrl(url)) return cleanImageUrl(url);
    }
}

export default definePlugin({
    settings: {
        translateTo: {
            type: "string",
            label: "Translate to",
            description: "Google Translate language code, like en, de or zh-TW. Empty uses Discord's language.",
            placeholder: "en",
            default: "",
        },
    },

    start(ctx) {
        const copyItem = (id: string, label: string, text: string, done: string) => (
            <Menu.Item
                key={id}
                id={id}
                label={label}
                action={async () => {
                    try {
                        await copy(text);
                        ctx.toast(done, { type: "success" });
                    } catch {
                        ctx.toast("Couldn't copy to the clipboard", { type: "failure" });
                    }
                }}
            />
        );

        ctx.contextMenu("message", (children, props) => {
            const { message } = props;
            if (!message?.id) return;
            const channelId: string | undefined = message.channel_id ?? props.channel?.id;
            const content: string = typeof message.content === "string" ? message.content : "";
            const has = (id: string) => !!findMenuGroup(children, id);

            const copies: ReactNode[] = [];
            // Skip what Discord's own menu already offers
            if (channelId && !has("copy-link")) {
                const guildId = props.channel?.guild_id ?? getStore("ChannelStore")?.getChannel?.(channelId)?.guild_id;
                copies.push(copyItem("dl-qa-copy-link", "Copy Message Link", messageLink(discordOrigin(location), guildId, channelId, message.id), "Message link copied"));
            }
            if (content.trim()) copies.push(copyItem("dl-qa-copy-raw", "Copy Raw Text", content, "Raw text copied"));
            if (!has(`devmode-copy-id-${message.id}`)) copies.push(copyItem("dl-qa-copy-id", "Copy Message ID", message.id, "Message ID copied"));

            const extras: ReactNode[] = [];
            const image = findImage(message, props);
            if (image) {
                extras.push(
                    <Menu.Item key="dl-qa-search-image" id="dl-qa-search-image" label="Search Image">
                        {IMAGE_SEARCH_ENGINES.map(engine => (
                            <Menu.Item key={engine.id} id={`dl-qa-search-${engine.id}`} label={engine.name} action={() => openExternal(engine.url(image))} />
                        ))}
                    </Menu.Item>,
                );
            }
            if (content.trim()) {
                const target = ctx.settings.get("translateTo").trim()
                    || googleLanguage(getStore("LocaleStore")?.locale ?? navigator.language);
                extras.push(<Menu.Item key="dl-qa-translate" id="dl-qa-translate" label="Translate with Google" action={() => openExternal(translateUrl(content, target))} />);
            }

            // Next to Discord's Copy Text, or in a group of our own at the end
            const group = findMenuGroup(children, "copy-text");
            if (group) group.push(...copies, ...extras);
            else if (copies.length || extras.length) children.push(<Menu.Group key="dl-quick-actions">{[...copies, ...extras]}</Menu.Group>);
        });
    },
});
