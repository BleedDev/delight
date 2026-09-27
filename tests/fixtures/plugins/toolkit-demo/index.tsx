import { definePlugin, Menu } from "@evi/api";

async function copy(text: string) {
    const native = (window as any).DiscordNative?.clipboard;
    if (native?.copy) native.copy(text);
    else await navigator.clipboard.writeText(text);
}

export default definePlugin({
    start(ctx) {
        // Runs locally and replies with an "Only you can see this" message. Returning { content } instead would send a real message.
        ctx.command({
            name: "evi",
            description: "Say hi from Evi",
            options: [{ name: "text", description: "What the toast says", type: "string" }],
            execute(args) {
                return { ephemeral: args.text || `Evi ${(window as any).Evi?.version ?? ""} is running` };
            },
        });

        // props is what the message menu was rendered with: message, channel...
        ctx.contextMenu("message", (children, { message }) => {
            if (!message?.id) return;
            children.push(
                <Menu.Group>
                    <Menu.Item
                        id="evi-copy-message-id"
                        label="Copy Message ID (Evi)"
                        action={async () => {
                            try {
                                await copy(message.id);
                                ctx.toast("Message ID copied", { type: "success" });
                            } catch {
                                ctx.toast("Couldn't copy the message ID", { type: "failure" });
                            }
                        }}
                    />
                </Menu.Group>,
            );
        });
    },
});
