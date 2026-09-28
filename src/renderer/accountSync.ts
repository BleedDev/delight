/**
 * Keeps evi.rest's copy of your Discord name and avatar current (credits, author pages, reviews):
 * sent once Discord is up, whenever you change them, and after switching accounts. Main drops a
 * profile it already sent, and evi.rest only takes it for the account this Evi is linked to.
 */
import { Native } from "./native";
import { PluginContext } from "./plugins/context";
import { findStore } from "./webpack/find";

let started: PluginContext | undefined;

function send() {
    const user = findStore("UserStore")?.getCurrentUser?.();
    if (!user?.id || typeof user.username !== "string") return;
    void Native.syncProfile({
        id: user.id,
        username: user.username,
        globalName: user.globalName ?? user.global_name ?? null,
        avatar: user.avatar ?? null,
    }).catch(() => { });
}

/** Starts syncing; once, for the life of the page */
export function startAccountSync() {
    if (started) return;
    const ctx = started = new PluginContext({ id: "evi-account-sync", name: "Account sync" }, {});
    send();
    // Your own profile edits, and a new account after switching
    ctx.flux.subscribe("CURRENT_USER_UPDATE", send);
    ctx.flux.subscribe("CONNECTION_OPEN", send);
}

/** After linking this Evi: the account now takes the profile */
export const syncProfileNow = send;
