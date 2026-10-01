import { definePlugin, filters } from "@evi/api";

import { Choices, fixMessage, SERVICES } from "./fix";
import { t } from "./strings";

const settings = Object.fromEntries(SERVICES.map(service => [service.id, {
    type: "select" as const,
    label: service.name,
    get description() { return t("settings.site.description", { service: service.name }); },
    default: service.sites[0],
    options: [
        ...service.sites.map(site => ({ label: site, value: site })),
        { get label() { return t("settings.off"); }, value: "off" },
    ],
}]));

export default definePlugin({
    settings,

    start(ctx) {
        const fix = (content: string) => {
            const choices: Choices = Object.fromEntries(SERVICES.map(s => [s.id, ctx.settings.get(s.id) as string]));
            return fixMessage(content, choices);
        };

        // The message actions module, hooked whenever it loads and unhooked on stop (like Clear URLs)
        const actions = filters.byProps("sendMessage", "editMessage");
        // sendMessage(channelId, message, ...)
        ctx.hookExport("before", actions, "sendMessage", ({ args }) => {
            if (args[1]?.content) args[1].content = fix(args[1].content);
        });
        // editMessage(channelId, messageId, { content })
        ctx.hookExport("before", actions, "editMessage", ({ args }) => {
            if (args[2]?.content) args[2].content = fix(args[2].content);
        });
    },
});
