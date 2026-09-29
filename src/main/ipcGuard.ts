import { isDiscordAppUrl } from "@shared/appHosts";
import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";

/**
 * Evi's channels answer only Discord's app, from the top frame of its window: never an iframe in it
 * (embeds, activities) or any other page that ends up in Discord's session. The preload hands the
 * bridge to that frame only; this holds main to the same rule should anything else reach ipcRenderer.
 */
const EVI_CHANNEL = /^evi:/;

function trusted(e: IpcMainEvent | IpcMainInvokeEvent) {
    const frame = e.senderFrame;
    return !!frame && frame === e.sender.mainFrame && isDiscordAppUrl(frame.url);
}

/** Wraps ipcMain before Evi registers anything, so every evi:* handler gets the check */
export function guardIpc() {
    const handle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, listener) => handle(channel, EVI_CHANNEL.test(channel)
        ? (e, ...args) => {
            if (!trusted(e)) throw new Error(`Evi refused ${channel} from ${e.senderFrame?.url ?? "an unknown frame"}`);
            return listener(e, ...args);
        }
        : listener);

    const on = ipcMain.on.bind(ipcMain);
    ipcMain.on = (channel, listener) => on(channel, EVI_CHANNEL.test(channel)
        ? (e: IpcMainEvent, ...args: any[]) => {
            if (trusted(e)) return listener(e, ...args);
            console.warn(`[Evi] Refused ${channel} from ${e.senderFrame?.url ?? "an unknown frame"}`);
            // A sync call waits for an answer: give it one rather than hang the page
            e.returnValue = undefined;
        }
        : listener);
}
