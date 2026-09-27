import { definePlugin, filters, find, getStore } from "@evi/api";

import {
    clampMultiplier, clampSynced, DEFAULT_MULTIPLIER, DISCORD_MAX_AMPLITUDE, keepBoosted, MAX_MULTIPLIER, MIN_MULTIPLIER, PATCHES,
    sliderMax,
} from "./volume";

/**
 * Discord caps a user's volume at 200% on desktop. The cap is only the slider's maxValue: the
 * action creator (AudioActionCreators.setLocalVolume) and MediaEngineStore take any number, and
 * the desktop voice engine gets amplitude / 100. So the patches raise the slider caps, and keep
 * Discord's synced audio settings (which accept at most 200) from pulling boosted volumes back.
 *
 * Patched code keeps calling $self after the plugin is turned off until Discord reloads, so every
 * helper falls back to Discord's own behaviour while the plugin isn't running.
 */

const audioActions = filters.byProps("setLocalVolume", "toggleLocalMute", "toggleSelfDeaf");

let running = false;
let multiplier = DEFAULT_MULTIPLIER;

/** Puts anyone above Discord's own maximum back at it, so turning the plugin off really turns it off */
function resetBoosted() {
    try {
        const state = getStore("MediaEngineStore")?.getState?.();
        const actions = find(audioActions);
        if (!state?.settingsByContext || !actions) return;
        for (const [context, settings] of Object.entries<any>(state.settingsByContext)) {
            for (const [userId, volume] of Object.entries<any>(settings?.localVolumes ?? {})) {
                if (typeof volume === "number" && volume > DISCORD_MAX_AMPLITUDE) actions.setLocalVolume(userId, DISCORD_MAX_AMPLITUDE, context);
            }
        }
    } catch {
        // Best effort: a reload applies Discord's cap anyway
    }
}

export default definePlugin({
    settings: {
        multiplier: {
            type: "number",
            label: "Volume limit",
            description: "How far past Discord's 200% the slider goes: 2 is 400%, 5 is 1000%. Very high volumes clip and distort.",
            default: DEFAULT_MULTIPLIER,
            min: MIN_MULTIPLIER,
            max: MAX_MULTIPLIER,
            step: 0.5,
        },
    },

    patches: [PATCHES.userVolumeMenu, PATCHES.streamTile, PATCHES.syncWrite, PATCHES.syncRead],

    sliderMax: (discordMax: number) => running ? sliderMax(discordMax, multiplier) : discordMax,
    clampSynced,
    keepBoosted: (local: unknown, synced: unknown) => running && keepBoosted(local, synced),

    start(ctx) {
        multiplier = clampMultiplier(ctx.settings.get("multiplier"));
        running = true;
        ctx.settings.onChange(values => void (multiplier = clampMultiplier(values.multiplier)));
        ctx.onDispose(() => {
            running = false;
            resetBoosted();
        });
    },
});
