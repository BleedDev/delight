/**
 * Music Player's playback state, pure: no Discord, DOM or network, so it's tested on its own
 * (tests/musicPlayer.test.ts). Songs come from Spotify or from Evi, the music player at evi.wtf.
 */

/** Evi's Discord application, which its desktop app shows "Listening to" with */
export const EVI_APP_ID = "1168999733726019707";

export interface Track {
    id: string;
    name: string;
    /** ms */
    duration: number;
    album: { name?: string; image?: { url: string; }; };
    artists: { name: string; }[];
    isLocal?: boolean;
    /** "track", or "episode" for podcasts */
    type?: string;
}

export interface Playback {
    source: "spotify" | "evi";
    /** Spotify's connected account; none for Evi */
    accountId?: string;
    track: Track;
    isPlaying: boolean;
    /** ms into the track when this state arrived */
    position: number;
    /** Date.now() when it arrived: the position moves on from there while playing */
    at: number;
    deviceId?: string;
    /** Evi: the song's page */
    url?: string;
    /** Evi: the cover, a blob: or Discord media URL made by the plugin */
    art?: string;
    /** Whether the buttons work: Evi's presence alone can only be shown */
    controls: boolean;
}

/**
 * Discord's SPOTIFY_PLAYER_STATE, as Spotify reports it. Unlike SpotifyStore, which forgets the track
 * the moment playback pauses, this keeps it: a paused song stays in the player with a play button.
 * Null when nothing is playing any more (Discord sends track: null then).
 */
export function fromEvent(action: any, now: number): Playback | null {
    const track = action?.track;
    if (!track || typeof track.id !== "string" || typeof action.accountId !== "string") return null;
    return {
        source: "spotify",
        controls: true,
        accountId: action.accountId,
        track: {
            id: track.id,
            name: String(track.name ?? ""),
            duration: Number(track.duration) || 0,
            album: { name: track.album?.name, image: track.album?.image?.url ? { url: track.album.image.url } : undefined },
            artists: Array.isArray(track.artists) ? track.artists.filter((a: any) => a?.name).map((a: any) => ({ name: String(a.name) })) : [],
            isLocal: track.isLocal === true,
            type: track.type,
        },
        isPlaying: action.isPlaying === true,
        position: Math.max(0, Number(action.position) || 0),
        at: now,
        deviceId: typeof action.device?.id === "string" ? action.device.id : undefined,
    };
}

/** Spotify's GET /me/player, for the state when the plugin starts: Discord only reports changes */
export function fromApi(body: any, accountId: string, now: number): Playback | null {
    const item = body?.item;
    if (!item || typeof item.id !== "string") return null;
    const images: { url?: string; width?: number; }[] = item.album?.images ?? item.show?.images ?? [];
    // The smallest one at least 64px wide: it's shown at 40
    const image = [...images].filter(i => i?.url).sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).find(i => (i.width ?? 0) >= 64) ?? images[0];
    return {
        source: "spotify",
        controls: true,
        accountId,
        track: {
            id: item.id,
            name: String(item.name ?? ""),
            duration: Number(item.duration_ms) || 0,
            album: { name: item.album?.name ?? item.show?.name, image: image?.url ? { url: image.url } : undefined },
            artists: (item.artists ?? []).filter((a: any) => a?.name).map((a: any) => ({ name: String(a.name) })),
            isLocal: item.is_local === true,
            type: item.type,
        },
        isPlaying: body.is_playing === true,
        position: Math.max(0, Number(body.progress_ms) || 0),
        at: now,
        deviceId: typeof body.device?.id === "string" ? body.device.id : undefined,
    };
}

/** Where the song is now: it moves on from the last report while playing, never past the end */
export function livePosition(p: Playback, now: number) {
    const moved = p.isPlaying ? now - p.at : 0;
    return Math.min(p.track.duration, Math.max(0, p.position + moved));
}

/** The same playback, paused or playing from `position` as of `now` */
export function withPlaying(p: Playback, isPlaying: boolean, now: number, position = livePosition(p, now)): Playback {
    return { ...p, isPlaying, position, at: now };
}

/** 3:07, or 1:02:09 past an hour */
export function formatTime(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const artistLine = (t: Track) => t.artists.map(a => a.name).join(", ") || t.album.name || "";

/** The song's page: on Spotify (none for local files, which only exist on your computer), or on Evi */
export function trackUrl(p: Playback) {
    if (p.source === "evi") return p.url && /^https:\/\/([a-z0-9-]+\.)*evi\.wtf\//.test(p.url) ? p.url : undefined;
    const t = p.track;
    if (t.isLocal || !/^[A-Za-z0-9]+$/.test(t.id)) return undefined;
    return `https://open.spotify.com/${t.type === "episode" ? "episode" : "track"}/${t.id}`;
}

/** The cover, only from where it's expected: Spotify's image server, Discord's media proxy or a blob */
export function artUrl(p: Playback) {
    if (p.source === "evi") return p.art && /^(blob:|https:\/\/media\.discordapp\.net\/external\/)/.test(p.art) ? p.art : undefined;
    const url = p.track.album.image?.url;
    return url && /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/.test(url) ? url : undefined;
}

/** What Evi's desktop app sends (its electron/control.js): times in ms, playing null when stopped */
export function fromEviApp(msg: any, now: number, art?: string): Playback | null {
    if (!msg || msg.v !== 1 || typeof msg.playing !== "boolean" || typeof msg.title !== "string" || !msg.title) return null;
    return {
        source: "evi",
        controls: true,
        track: {
            id: String(msg.id ?? msg.title),
            name: msg.title,
            duration: Math.max(0, Number(msg.duration) || 0),
            album: { name: typeof msg.album === "string" ? msg.album : undefined },
            artists: typeof msg.artist === "string" && msg.artist ? [{ name: msg.artist }] : [],
        },
        isPlaying: msg.playing,
        position: Math.max(0, Number(msg.position) || 0),
        at: now,
        url: typeof msg.songUrl === "string" ? msg.songUrl : undefined,
        art,
    };
}

/**
 * Evi's own rich presence, from Discord's LocalActivityStore: what an Evi desktop app without the
 * control connection still tells Discord. It's only there while a song plays, and can't be driven.
 */
export function fromEviPresence(activity: any, now: number): Playback | null {
    if (!activity || activity.application_id !== EVI_APP_ID || typeof activity.details !== "string") return null;
    const start = Number(activity.timestamps?.start), end = Number(activity.timestamps?.end);
    const timed = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const image = typeof activity.assets?.large_image === "string" ? activity.assets.large_image : "";
    return {
        source: "evi",
        controls: false,
        track: {
            id: activity.details,
            name: activity.details.trim(),
            duration: timed ? end - start : 0,
            album: { name: typeof activity.assets?.large_text === "string" ? activity.assets.large_text.trim() : undefined },
            artists: typeof activity.state === "string" && activity.state.trim() ? [{ name: activity.state.trim() }] : [],
        },
        isPlaying: true,
        position: timed ? Math.max(0, now - start) : 0,
        at: now,
        url: typeof activity.details_url === "string" ? activity.details_url : undefined,
        // mp:external/… is Discord's media proxy
        art: image.startsWith("mp:external/") ? `https://media.discordapp.net/${image.slice(3)}` : undefined,
    };
}

/**
 * Which player to show: what's playing wins, Evi's app first; then what's paused; Evi's presence
 * only when its app isn't connected.
 */
export function choose(eviApp: Playback | null, spotify: Playback | null, eviPresence: Playback | null): Playback | null {
    const evi = eviApp ?? eviPresence;
    if (evi?.isPlaying) return evi;
    if (spotify?.isPlaying) return spotify;
    return eviApp ?? spotify ?? eviPresence;
}
