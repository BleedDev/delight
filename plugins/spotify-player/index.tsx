import { definePlugin, Filter, find, getStore, Logger, React, showToast } from "@evi/api";

import { artistLine, artUrl, formatTime, fromApi, fromEvent, livePosition, Playback, trackUrl, withPlaying } from "./player";
import { t } from "./strings";

/**
 * A small Spotify player on top of the user panel, above Voice Connected: the song, its cover, play
 * and pause, previous and next, and where you are in it. It shows while Spotify is playing (or paused)
 * on your connected account, and goes away when it stops.
 *
 * - What's playing comes from Discord's own SPOTIFY_PLAYER_STATE events, which Spotify pushes to
 *   Discord for your connected account. SpotifyStore forgets the track the moment it pauses, so the
 *   plugin keeps its own copy (player.ts).
 * - The buttons call Spotify's player API with the access token Discord already holds for that
 *   account. When Spotify says it expired, Discord's own Spotify client refreshes it, then we retry.
 *   Controlling playback is a Spotify Premium feature: without it the player only shows the song.
 */

const API = "https://api.spotify.com/v1";

/** Discord's Spotify client: { get, put }, adding the account's token and refreshing it on a 401 */
const spotifyApiFilter: Filter = Object.assign(
    (v: any) => !!v && typeof v === "object" && typeof v.get === "function" && typeof v.put === "function" && Object.keys(v).length === 2,
    { $code: ['"SPOTIFY_PLAYER_PAUSE"', "NOTIFICATIONS_PLAYER"], $label: "Discord's Spotify API client" },
);

interface Socket { accountId: string; accessToken: string; isPremium?: boolean; }

let running = false;
let logger: Logger | undefined;
let playback: Playback | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
function set(next: Playback | null) {
    playback = next;
    for (const l of listeners) l();
}

/** The connected account Spotify is playing on, from Discord's SpotifyStore */
const activeSocket = (): Socket | undefined => getStore("SpotifyStore")?.getActiveSocketAndDevice?.()?.socket;

class SpotifyError extends Error {
    constructor(readonly kind: "premium" | "device" | "failed") { super(kind); }
}

async function request(method: "GET" | "PUT" | "POST", path: string, query: Record<string, string> = {}) {
    const socket = activeSocket();
    if (!socket?.accessToken) throw new SpotifyError("device");
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const send = (token: string) => fetch(url, { method, headers: { authorization: `Bearer ${token}` } });

    let res = await send(socket.accessToken);
    if (res.status === 401) {
        // Discord's client gets a new token for the account and tells SpotifyStore, then we go again
        await find(spotifyApiFilter)?.get(socket.accountId, socket.accessToken, { url: `${API}/me` }).catch(() => { });
        const fresh = activeSocket()?.accessToken;
        if (fresh && fresh !== socket.accessToken) res = await send(fresh);
    }
    if (res.status === 403) throw new SpotifyError("premium");
    if (res.status === 404) throw new SpotifyError("device");
    if (!res.ok) throw new SpotifyError("failed");
    return res.status === 204 ? null : await res.json().catch(() => null);
}

type Action = "play" | "pause" | "previous" | "next" | "seek";

async function control(action: Action, position?: number) {
    const before = playback;
    const now = Date.now();
    const device: Record<string, string> = before?.deviceId ? { device_id: before.deviceId } : {};
    try {
        // Play, pause and seek show straight away; Spotify's own report follows and corrects it
        if (before && action === "play") set(withPlaying(before, true, now));
        if (before && action === "pause") set(withPlaying(before, false, now));
        if (before && action === "seek") set(withPlaying(before, before.isPlaying, now, position));

        if (action === "play") await request("PUT", "/me/player/play", device);
        else if (action === "pause") await request("PUT", "/me/player/pause", device);
        else if (action === "next") await request("POST", "/me/player/next", device);
        else if (action === "previous") await request("POST", "/me/player/previous", device);
        else await request("PUT", "/me/player/seek", { ...device, position_ms: String(Math.round(position ?? 0)) });
    } catch (e) {
        if (playback !== before && before) set(before);
        const kind = e instanceof SpotifyError ? e.kind : "failed";
        if (kind === "failed") logger?.warn(`${action} failed`, e);
        showToast(t(`error.${kind}`), { type: "failure" });
    }
}

/** What's playing when the plugin starts: Discord only reports changes */
function seed() {
    const socket = activeSocket();
    if (!socket) return;
    request("GET", "/me/player", { additional_types: "episode" })
        .then(body => {
            if (running && !playback) set(fromApi(body, socket.accountId, Date.now()));
        })
        .catch(() => { });
}

// ---- UI -----------------------------------------------------------------------------------------

const Icon = ({ d, hidden }: { d: string; hidden?: boolean; }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-hidden={hidden || undefined}><path fill="currentColor" d={d} /></svg>
);
const PLAY = "M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z";
const PAUSE = "M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z";
const PREVIOUS = "M6 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm13 .87v12.26a1 1 0 0 1-1.52.85L8.6 13.3a1.5 1.5 0 0 1 0-2.6l8.88-5.68A1 1 0 0 1 19 5.87Z";
const NEXT = "M18 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1ZM5 5.87v12.26a1 1 0 0 0 1.52.85l8.88-5.68a1.5 1.5 0 0 0 0-2.6L6.52 5.02A1 1 0 0 0 5 5.87Z";

function Player() {
    const current = React.useSyncExternalStore(subscribe, () => playback);
    // The last song stays for its exit, after playback stops
    const [last, setLast] = React.useState(current);
    const [, tick] = React.useReducer((n: number) => n + 1, 0);
    const [drag, setDrag] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (current) return void setLast(current);
        const id = setTimeout(() => setLast(null), 150);
        return () => clearTimeout(id);
    }, [current]);
    React.useEffect(() => {
        if (!current?.isPlaying) return;
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [current?.isPlaying]);

    const view = current ?? last;
    if (!view) return null;
    const { track } = view;
    const duration = track.duration;
    const position = drag ?? livePosition(view, Date.now());
    const canControl = activeSocket()?.isPremium !== false;
    const link = trackUrl(track);
    const art = artUrl(track);
    const artists = artistLine(track);
    const commit = () => {
        if (drag === null) return;
        void control("seek", drag);
        setDrag(null);
    };

    return (
        <div className="evi-sp" role="group" aria-label={t("player")} data-leaving={!current || undefined}>
            <div className="evi-sp-row">
                {art ? <img className="evi-sp-art" src={art} alt="" width={40} height={40} /> : <div className="evi-sp-art" />}
                <div className="evi-sp-info">
                    {link
                        ? <a className="evi-sp-title" href={link} target="_blank" rel="noreferrer noopener" title={t("open", { name: track.name })}>{track.name}</a>
                        : <span className="evi-sp-title" title={track.name}>{track.name}</span>}
                    {artists && <span className="evi-sp-artist" title={artists}>{artists}</span>}
                </div>
                {canControl && (
                    <div className="evi-sp-controls">
                        <button type="button" className="evi-sp-btn" aria-label={t("previous")} onClick={() => void control("previous")}><Icon d={PREVIOUS} /></button>
                        <button type="button" className="evi-sp-btn evi-sp-play" aria-label={view.isPlaying ? t("pause") : t("play")} onClick={() => void control(view.isPlaying ? "pause" : "play")}>
                            <Icon d={PLAY} hidden={view.isPlaying} />
                            <Icon d={PAUSE} hidden={!view.isPlaying} />
                        </button>
                        <button type="button" className="evi-sp-btn" aria-label={t("next")} onClick={() => void control("next")}><Icon d={NEXT} /></button>
                    </div>
                )}
            </div>
            <div className="evi-sp-time">
                <span>{formatTime(position)}</span>
                <input
                    type="range"
                    className="evi-sp-seek"
                    min={0}
                    max={duration}
                    step={1000}
                    value={position}
                    disabled={!canControl}
                    aria-label={t("seek")}
                    aria-valuetext={t("timeOf", { position: formatTime(position), duration: formatTime(duration) })}
                    style={{ "--evi-sp-progress": `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties}
                    onChange={e => setDrag(Number(e.currentTarget.value))}
                    onPointerUp={commit}
                    onKeyUp={commit}
                    onBlur={commit}
                />
                <span>{formatTime(duration)}</span>
            </div>
        </div>
    );
}

/**
 * A crash in the player leaves Discord's user panel alone. Made on first use: React is Discord's, and
 * isn't there yet when the plugin loads at startup.
 */
let boundary: React.ComponentType<{ children: React.ReactNode; }> | undefined;
function Boundary(props: { children: React.ReactNode; }) {
    boundary ??= class extends React.Component<{ children: React.ReactNode; }, { failed: boolean; }> {
        override state = { failed: false };
        static getDerivedStateFromError() {
            return { failed: true };
        }
        override componentDidCatch(error: unknown) {
            logger?.error("The player crashed", error);
        }
        override render() {
            return this.state.failed ? null : this.props.children;
        }
    };
    return React.createElement(boundary, props);
}

const css = `
.evi-sp { padding: var(--space-8, 8px); border-block-end: 1px solid var(--border-muted, var(--background-modifier-accent)); }
:root:not(.reduce-motion) .evi-sp { animation: evi-sp-in 180ms ease-out; }
:root:not(.reduce-motion) .evi-sp[data-leaving] { animation: evi-sp-out 150ms ease-in forwards; }
@keyframes evi-sp-in { from { opacity: 0; translate: 0 4px; } }
@keyframes evi-sp-out { to { opacity: 0; translate: 0 4px; } }
.evi-sp-row { display: flex; align-items: center; gap: 8px; }
.evi-sp-art { flex: none; width: 40px; height: 40px; border-radius: var(--radius-xs, 4px); object-fit: cover; outline: 1px solid rgb(255 255 255 / .08); outline-offset: -1px;
  background: var(--background-mod-subtle, rgb(255 255 255 / .04)); }
.evi-sp-info { flex: 1; min-width: 0; }
.evi-sp-title, .evi-sp-artist { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.evi-sp-title { font-size: 14px; line-height: 18px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); text-decoration: none; }
a.evi-sp-title:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 1px; border-radius: 2px; }
@media (hover: hover) { a.evi-sp-title:hover { text-decoration: underline; text-underline-position: from-font; } }
.evi-sp-artist { font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); }
.evi-sp-controls { display: flex; flex: none; gap: 2px; }
.evi-sp-btn { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--radius-xs, 4px); background: none; cursor: pointer;
  color: var(--interactive-icon-default, var(--interactive-normal, #b5bac1)); }
.evi-sp-btn svg { grid-area: 1 / 1; width: 20px; height: 20px; }
.evi-sp-btn svg[data-hidden] { opacity: 0; scale: .25; filter: blur(4px); }
@media (hover: hover) { .evi-sp-btn:hover { background: var(--background-mod-subtle, var(--background-modifier-hover)); color: var(--interactive-icon-hover, var(--interactive-hover, #dbdee1)); } }
.evi-sp-btn:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: -2px; }
:root:not(.reduce-motion) .evi-sp-btn { transition: scale 200ms ease-out; }
:root:not(.reduce-motion) .evi-sp-btn:active { scale: .96; }
:root:not(.reduce-motion) .evi-sp-play svg { transition: opacity 150ms ease-out, scale 150ms ease-out, filter 150ms ease-out; }
.evi-sp-time { display: flex; align-items: center; gap: 8px; margin-block-start: 6px; font-size: 11px; line-height: 14px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-sp-seek { --evi-sp-fill: var(--interactive-text-active, var(--white, #fff)); flex: 1; min-width: 0; height: 12px; margin: 0; background: none; appearance: none; cursor: pointer; }
.evi-sp-seek::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--evi-sp-fill) var(--evi-sp-progress), var(--background-mod-strong, rgb(255 255 255 / .16)) var(--evi-sp-progress)); }
.evi-sp-seek::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; margin-top: -3px; border-radius: 50%; background: var(--evi-sp-fill); opacity: 0; }
@media (hover: hover) { .evi-sp-seek:not(:disabled):hover::-webkit-slider-thumb { opacity: 1; } }
.evi-sp-seek:focus-visible::-webkit-slider-thumb, .evi-sp-seek:active::-webkit-slider-thumb { opacity: 1; }
.evi-sp-seek:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 2px; border-radius: 2px; }
.evi-sp-seek:disabled { cursor: default; }
`;

export default definePlugin({
    patches: [
        {
            // The user area's panels, checked 2026-10-01:
            //   children:[…,(0,y.jsx)(C$,{}),(0,y.jsx)(sv.A,{section:F.JJy.RTC_CONNECTION_PANEL,children:(0,y.jsx)(RV,{})}),(…ACCOUNT_PANEL…)]
            // The player goes in right before Voice Connected, at the top of the stack.
            find: '"--custom-app-panels-height"',
            replace: {
                match: /(?=\(0,\i\.jsx\)\(\i\.\i,\{section:\i\.\i\.RTC_CONNECTION_PANEL,)/,
                with: "$self?.renderPlayer?.(),",
            },
        },
    ],

    renderPlayer() {
        try {
            return running ? <Boundary key="evi-spotify-player"><Player /></Boundary> : null;
        } catch (e) {
            logger?.error("Couldn't render the player", e);
            return null;
        }
    },

    flux: {
        SPOTIFY_PLAYER_STATE(action: any) {
            set(fromEvent(action, Date.now()));
        },
        SPOTIFY_ACCOUNT_ACCESS_TOKEN_REVOKE() {
            set(null);
        },
    },

    start(ctx) {
        running = true;
        logger = ctx.logger;
        ctx.addStyle(css);
        seed();
    },

    stop() {
        running = false;
        set(null);
    },
});
