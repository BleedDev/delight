/**
 * Spotify Player's playback state, pure: no Discord, DOM or network, so it's tested on its own
 * (tests/spotifyPlayer.test.ts).
 */

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
    accountId: string;
    track: Track;
    isPlaying: boolean;
    /** ms into the track when this state arrived */
    position: number;
    /** Date.now() when it arrived: the position moves on from there while playing */
    at: number;
    deviceId?: string;
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

/** The song's page on Spotify. None for local files, which only exist on your computer */
export function trackUrl(t: Track) {
    if (t.isLocal || !/^[A-Za-z0-9]+$/.test(t.id)) return undefined;
    return `https://open.spotify.com/${t.type === "episode" ? "episode" : "track"}/${t.id}`;
}

/** Only Spotify's own image server: the address comes from Spotify's data */
export function artUrl(t: Track) {
    const url = t.album.image?.url;
    return url && /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/.test(url) ? url : undefined;
}
