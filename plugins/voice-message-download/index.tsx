import { definePlugin, findMenuGroup, Menu } from "@evi/api";

import { audioExtension, voiceAttachment, voiceFilename } from "./voice";

/** Opens in the user's browser: Discord's desktop app sends window.open of web links there */
const openExternal = (url: string) => void window.open(url, "_blank", "noopener,noreferrer");

/** Saves bytes with the desktop app's save dialog, or else a browser download. */
async function save(data: Uint8Array, filename: string, type: string): Promise<void> {
    const fileManager = (window as any).DiscordNative?.fileManager;
    if (typeof fileManager?.saveWithDialog === "function") {
        await fileManager.saveWithDialog(data, filename);
        return;
    }
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default definePlugin({
    start(ctx) {
        async function download(message: any) {
            const attachment = voiceAttachment(message);
            const url = attachment?.url || attachment?.proxy_url;
            if (!attachment || !url) return;
            const author = message.author?.username ?? message.author?.globalName ?? message.author?.global_name;
            const filename = voiceFilename(author, message.timestamp, audioExtension(attachment));
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = new Uint8Array(await res.arrayBuffer());
                await save(data, filename, attachment.content_type ?? res.headers.get("content-type") ?? "audio/ogg");
            } catch (e) {
                ctx.logger.error("Voice message download failed", e);
                ctx.toast("Couldn't download the voice message, opening it in the browser", { type: "failure" });
                openExternal(url);
            }
        }

        ctx.contextMenu("message", (children, props) => {
            const { message } = props;
            if (!voiceAttachment(message)) return;
            const item = (
                <Menu.Item key="dl-vmd-download" id="dl-vmd-download" label="Download Voice Message" action={() => void download(message)} />
            );
            const group = findMenuGroup(children, "copy-text");
            if (group) group.push(item);
            else children.push(<Menu.Group key="dl-voice-message-download">{item}</Menu.Group>);
        });
    },
});
