import type { SourcePatch } from "@evi/api";

/**
 * Pure pieces of Game Activity Toggle, kept free of Discord so they can be tested.
 *
 * The setting is "Share my activity" (User Settings > Activity Privacy), stored in the
 * PreloadedUserSettings proto as `status.showCurrentGame`, a BoolValue wrapper where a missing
 * value means shown. Discord wraps it in a setting object built by
 *     ey=f("status","showCurrentGame",e=>e?.value??!0,e=>l._t.create({value:e}));
 * with { getSetting, updateSetting, useSetting }. Nothing names that object from outside, so a
 * source patch hands it to the plugin right after it's created.
 */

/** Reads the setting from UserSettingsProtoStore.settings the way Discord does: missing means shown */
export function readShowCurrentGame(protoSettings: any): boolean {
    const value = protoSettings?.status?.showCurrentGame?.value;
    return typeof value === "boolean" ? value : true;
}

/** Button tooltip and aria-label: what a click does */
export const buttonLabel = (shown: boolean) => shown ? "Hide game activity" : "Show game activity";

/** Toast and /gameactivity reply after flipping to `shown` */
export const toggledMessage = (shown: boolean) => shown
    ? "Game activity is visible: others can see what you're playing."
    : "Game activity is hidden: others won't see what you're playing.";

export const PATCHES = {
    /** Captures Discord's showCurrentGame setting object right after it's defined */
    setting: {
        find: '"status","showCurrentGame"',
        replace: {
            match: /(?<=(\i)=\i\("status","showCurrentGame",e=>e\?\.value\?\?!0,e=>\i\.\i\.create\(\{value:e\}\)\);)/,
            with: "$self?.captureSetting?.($1);",
        },
    },
    /**
     * The user panel's button row: <div className style children:[<Mute/>, <Deafen/>, <Settings/>]>.
     * Ours goes first, left of the microphone.
     */
    userPanel: {
        find: "handleOpenSettingsContextMenu",
        replace: {
            match: /children:\[(?=\(0,\i\.jsx\)\(\i,\{accountContainerRef:)/,
            with: "children:[$self?.renderButton?.(arguments[0]),",
        },
    },
} satisfies Record<string, SourcePatch>;
