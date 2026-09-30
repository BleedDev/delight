import { describe, expect, test } from "bun:test";

import { artistLine, artUrl, formatTime, fromApi, fromEvent, livePosition, trackUrl, withPlaying } from "../plugins/spotify-player/player";

const event = {
    type: "SPOTIFY_PLAYER_STATE", accountId: "acc", isPlaying: true, position: 60_000, device: { id: "dev" },
    track: {
        id: "4uLU6hMCjMI75M1A2tKUQC", name: "Never Gonna Give You Up", duration: 213_000, isLocal: false, type: "track",
        album: { id: "a", name: "Whenever You Need Somebody", image: { url: "https://i.scdn.co/image/ab67616d00004851abc", width: 64 } },
        artists: [{ id: "r", name: "Rick Astley" }],
    },
};

describe("Spotify Player", () => {
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
        expect(trackUrl(p.track)).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
        expect(trackUrl({ ...p.track, isLocal: true })).toBeUndefined();
        expect(trackUrl({ ...p.track, type: "episode" })).toBe("https://open.spotify.com/episode/4uLU6hMCjMI75M1A2tKUQC");
        expect(artUrl(p.track)).toBe("https://i.scdn.co/image/ab67616d00004851abc");
        expect(artUrl({ ...p.track, album: { image: { url: "https://evil.example/x.png" } } })).toBeUndefined();
    });
});
