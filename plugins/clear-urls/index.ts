import { definePlugin, filters } from "@evi/api";

const DEFAULT_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "fbclid", "gclid", "dclid", "msclkid", "igshid", "mc_eid", "si", "ref_src", "ref_url", "_hsenc", "_hsmi",
];

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;

export default definePlugin({
    settings: {
        extraParams: {
            type: "string",
            label: "Extra parameters to remove",
            description: "Comma separated, on top of the built-in list of common trackers.",
            placeholder: "ref, source",
            default: "",
        },
    },

    start(ctx) {
        const clean = (content: string) => {
            if (!content?.includes("http")) return content;
            const extra = ctx.settings.get("extraParams").split(",").map(s => s.trim()).filter(Boolean);
            const params = new Set([...DEFAULT_PARAMS, ...extra]);

            return content.replace(URL_REGEX, raw => {
                try {
                    const url = new URL(raw);
                    let changed = false;
                    for (const key of [...url.searchParams.keys()]) {
                        if (params.has(key)) {
                            url.searchParams.delete(key);
                            changed = true;
                        }
                    }
                    return changed ? url.toString() : raw;
                } catch {
                    return raw;
                }
            });
        };

        // Export hooks: the message actions module is found whenever it loads, and unhooked on stop
        const actions = filters.byProps("sendMessage", "editMessage");

        // sendMessage(channelId, message, ...)
        ctx.hookExport("before", actions, "sendMessage", ({ args }) => {
            if (args[1]?.content) args[1].content = clean(args[1].content);
        });
        // editMessage(channelId, messageId, { content })
        ctx.hookExport("before", actions, "editMessage", ({ args }) => {
            if (args[2]?.content) args[2].content = clean(args[2].content);
        });
    },
});
