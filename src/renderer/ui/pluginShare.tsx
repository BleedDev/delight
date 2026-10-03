/**
 * Plugins shared in Discord chats: a message with an evi.rest/p/<id> link gets an install card
 * under it (SharedPluginCard in Store.tsx), for anyone running Evi. Everyone else sees Discord's
 * embed of evi.rest's page for it.
 *
 * One export hook on Discord's renderMessageAccessories({ channelMessageProps: { message }, ... }):
 *  - before: hand it a copy of the message without Discord's embeds of share links, so the card
 *    replaces them rather than sitting next to them. Message records are immutable, `set` copies;
 *  - after: the cards go after the rest of the accessories.
 */
import { isShareUrl, sharedPluginIds } from "@shared/share";

import { PluginContext } from "../plugins/context";
import { filters } from "../webpack/find";
import { ensureStyles } from "./index";
import { SharedPluginCard } from "./Store";

const accessoriesFilter = filters.byCode("channelMessageProps:{message:", "isAutomodBlockedMessage:");

let started: PluginContext | undefined;

/** Starts drawing share cards; once, for the life of the page */
export function startPluginShare() {
    if (started) return;
    const ctx = started = new PluginContext({ id: "evi-share", name: "Plugin sharing" }, {});

    ctx.hookExport("before", accessoriesFilter, call => {
        const props = call.args[0];
        const message = props?.channelMessageProps?.message;
        if (!message || typeof message.content !== "string" || typeof message.set !== "function") return;
        if (!sharedPluginIds(message.content).length || !Array.isArray(message.embeds)) return;
        const embeds = message.embeds.filter((e: any) => !isShareUrl(e?.url));
        if (embeds.length === message.embeds.length) return;
        call.args[0] = { ...props, channelMessageProps: { ...props.channelMessageProps, message: message.set("embeds", embeds) } };
    });

    ctx.hookExport("after", accessoriesFilter, ({ args, result }) => {
        const message = args[0]?.channelMessageProps?.message;
        if (args[0]?.isMessageSnapshot || typeof message?.content !== "string") return;
        const ids = sharedPluginIds(message.content);
        if (!ids.length) return;
        ensureStyles();
        return (
            <>
                {result}
                <div className="dl-root dl-share-cards">
                    {ids.map(id => <SharedPluginCard key={id} id={id} />)}
                </div>
            </>
        );
    });
}
