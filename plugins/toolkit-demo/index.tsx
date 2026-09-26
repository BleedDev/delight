import { definePlugin, Menu } from "@delight/api";

async function copy(text: string) {
    const native = (window as any).DiscordNative?.clipboard;
    if (native?.copy) native.copy(text);
    else await navigator.clipboard.writeText(text);
}

export default definePlugin({
    start(ctx) {
        // Runs locally; returning { content } would have Discord send it as your message
        ctx.command({
            name: "delight",
            description: "Say hi from Delight",
            options: [{ name: "text", description: "What the toast says", type: "string" }],
            execute(args) {
                ctx.toast(args.text || `Delight ${(window as any).Delight?.version ?? ""} is running`, { type: "success" });
            },
        });

        // props is what the message menu was rendered with: message, channel...
        ctx.contextMenu("message", (children, { message }) => {
            if (!message?.id) return;
            children.push(
                <Menu.Group>
                    <Menu.Item
                        id="delight-copy-message-id"
                        label="Copy Message ID (Delight)"
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
