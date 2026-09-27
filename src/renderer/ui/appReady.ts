/**
 * When Discord is past its loading screen. Evi's startup popups (What's new, plugin changelogs, the
 * update and safe mode notices) wait for it, so they never show over the splash while Discord is
 * still connecting.
 *
 * Logged in, that's a moment after the gateway connection opened (POST_CONNECTION_OPEN), once the
 * app has had time to draw and the loading screen to fade. On the login page there's no loading
 * screen to wait for.
 */
import { Logger } from "../logger";
import { Dispatcher, FluxAction } from "../webpack/common";
import { findStore } from "../webpack/find";

const logger = new Logger("AppReady", "#5865f2");

/** After the connection opens, for the app to draw and the loading screen to fade out */
const SETTLE_MS = 1500;
/** Offline or stuck connecting: show them anyway rather than never */
const GIVE_UP_MS = 60_000;

let ready = false;
let waiting: (() => void)[] | undefined;

function connected() {
    try {
        return !!findStore<any>("UserStore")?.getCurrentUser?.();
    } catch {
        return false;
    }
}

function loggedOut() {
    try {
        const auth = findStore<any>("AuthenticationStore");
        return !!auth && !auth.getToken?.() && !auth.isAuthenticated?.();
    } catch {
        return false;
    }
}

function start() {
    waiting = [];
    let settle: ReturnType<typeof setTimeout> | undefined;
    const settleSoon = () => void (settle ??= setTimeout(finish, SETTLE_MS));
    const onOpen = (_: FluxAction) => settleSoon();
    // The stores load a little after Evi starts: until they say, keep asking whether this is the
    // login page (nothing to wait for) or an app that finished connecting before we subscribed
    const check = () => {
        if (loggedOut()) finish();
        else if (connected()) settleSoon();
    };
    const poll = setInterval(check, 500);
    const giveUp = setTimeout(finish, GIVE_UP_MS);

    function finish() {
        if (ready) return;
        ready = true;
        clearTimeout(settle);
        clearTimeout(giveUp);
        clearInterval(poll);
        try {
            Dispatcher.unsubscribe("POST_CONNECTION_OPEN", onOpen);
        } catch { }
        for (const fn of waiting!.splice(0)) {
            try {
                fn();
            } catch (err) {
                logger.error("A startup popup failed", err);
            }
        }
    }

    try {
        Dispatcher.subscribe("POST_CONNECTION_OPEN", onOpen);
    } catch (err) {
        logger.warn("Couldn't watch for Discord's connection, showing popups now", err);
        return void setTimeout(finish, 0);
    }
    // Checked once more after this call, so `fn` is queued before anything runs
    setTimeout(check, 0);
}

/** Runs `fn` once Discord's app is showing; right away when it already is */
export function whenAppReady(fn: () => void) {
    if (ready) return fn();
    if (!waiting) start();
    waiting!.push(fn);
}
