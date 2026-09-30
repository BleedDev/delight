import { describe, expect, test } from "bun:test";

import { artistLine, artUrl, choose, EVI_APP_ID, formatTime, fromApi, fromEvent, fromEviApp, fromEviPresence, livePosition, trackUrl, withPlaying } from "../plugins/music-player/player";

const event = {
    type: "SPOTIFY_PLAYER_STATE", accountId: "acc", isPlaying: true, position: 60_000, device: { id: "dev" },
    track: {
        id: "4uLU6hMCjMI75M1A2tKUQC", name: "Never Gonna Give You Up", duration: 213_000, isLocal: false, type: "track",
        album: { id: "a", name: "Whenever You Need Somebody", image: { url: "https://i.scdn.co/image/ab67616d00004851abc", width: 64 } },
        artists: [{ id: "r", name: "Rick Astley" }],
    },
};

describe("Music Player", () => {
    test("a player event keeps the track, paused or not", () => {
        const p = fromEvent({ ...event, isPlaying: false }, 1000)!;
        expect(p.track.name).toBe("Never Gonna Give You Up");
        expect(p.isPlaying).toBe(false);
        expect(p.deviceId).toBe("dev");
        expect(fromEvent({ ...event, track: null }, 1000)).toBeNull();
    });

    test("the position moves on while playing, stops while paused, never passes the end", () => {
        const p = fromEvent(event, 1000)!;
        expect(livePosition(p, 6000)).toBe(65_000);
        expect(livePosition(withPlaying(p, false, 6000), 60_000)).toBe(65_000);
        expect(livePosition(p, 10_000_000)).toBe(213_000);
    });

    test("Spotify's own player state, for when the plugin starts", () => {
        const p = fromApi({
            is_playing: true, progress_ms: 5000, device: { id: "d" },
            item: { id: "x1", name: "Song", duration_ms: 100_000, type: "track", album: { name: "Album", images: [{ url: "https://i.scdn.co/image/big", width: 640 }, { url: "https://i.scdn.co/image/small", width: 64 }] }, artists: [{ name: "A" }, { name: "B" }] },
        }, "acc", 0)!;
        expect(p.track.album.image?.url).toBe("https://i.scdn.co/image/small");
        expect(artistLine(p.track)).toBe("A, B");
        expect(fromApi(null, "acc", 0)).toBeNull();
    });

    test("times", () => {
        expect(formatTime(0)).toBe("0:00");
        expect(formatTime(187_400)).toBe("3:07");
        expect(formatTime(3_729_000)).toBe("1:02:09");
    });

    test("links and images only from Spotify", () => {
        const p = fromEvent(event, 0)!;
        expect(trackUrl(p)).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
        expect(trackUrl({ ...p, track: { ...p.track, isLocal: true } })).toBeUndefined();
        expect(trackUrl({ ...p, track: { ...p.track, type: "episode" } })).toBe("https://open.spotify.com/episode/4uLU6hMCjMI75M1A2tKUQC");
        expect(artUrl(p)).toBe("https://i.scdn.co/image/ab67616d00004851abc");
        expect(artUrl({ ...p, track: { ...p.track, album: { image: { url: "https://evil.example/x.png" } } } })).toBeUndefined();
    });

    const eviMsg = { v: 1, id: "42", title: "Evi Song", artist: "Evi Artist", album: "LP", songUrl: "https://evi.wtf/song/42", cover: "https://evi.wtf/api/cover/42", duration: 200_000, position: 30_000, playing: true };
    const presence = {
        application_id: EVI_APP_ID, type: 2, details: "Evi Song", state: "Evi Artist", details_url: "https://evi.wtf/song/42",
        assets: { large_image: "mp:external/abc/https/img.evi.wtf/api/cover/42", large_text: "LP" }, timestamps: { start: 1000, end: 201_000 },
    };

    test("Evi's desktop app: its song, with buttons, and nothing once it stops", () => {
        const p = fromEviApp(eviMsg, 0, "blob:https://discord.com/1")!;
        expect(p.source).toBe("evi");
        expect(p.controls).toBe(true);
        expect(p.track.name).toBe("Evi Song");
        expect(artistLine(p.track)).toBe("Evi Artist");
        expect(livePosition(p, 5000)).toBe(35_000);
        expect(trackUrl(p)).toBe("https://evi.wtf/song/42");
        expect(artUrl(p)).toBe("blob:https://discord.com/1");
        expect(fromEviApp({ v: 1, playing: null }, 0)).toBeNull();
        expect(trackUrl({ ...p, url: "https://evil.example/song" })).toBeUndefined();
    });

    test("Evi's presence alone: shown, not driven, cover through Discord's proxy", () => {
        const p = fromEviPresence(presence, 31_000)!;
        expect(p.controls).toBe(false);
        expect(p.position).toBe(30_000);
        expect(p.track.duration).toBe(200_000);
        expect(artUrl(p)).toBe("https://media.discordapp.net/external/abc/https/img.evi.wtf/api/cover/42");
        expect(fromEviPresence({ ...presence, application_id: "1" }, 0)).toBeNull();
    });

    test("what plays wins, Evi's app first; its presence only without the app", () => {
        const spotify = fromEvent(event, 0);
        const spotifyPaused = fromEvent({ ...event, isPlaying: false }, 0);
        const app = fromEviApp(eviMsg, 0);
        const appPaused = fromEviApp({ ...eviMsg, playing: false }, 0);
        const pres = fromEviPresence(presence, 0);
        expect(choose(app, spotify, pres)?.source).toBe("evi");
        expect(choose(appPaused, spotify, pres)?.source).toBe("spotify");
        expect(choose(appPaused, spotifyPaused, null)?.source).toBe("evi");
        expect(choose(null, spotifyPaused, pres)?.controls).toBe(false);
        expect(choose(null, null, null)).toBeNull();
    });
});
