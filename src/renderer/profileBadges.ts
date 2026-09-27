/**
 * Badges plugins add to profiles: "Online on desktop" (Platform Indicators), "Last seen …" (Last Seen).
 * A plugin registers a provider with ctx.profileBadges(userId => [...]); Evi's badge hooks
 * (ui/badges.tsx, ui/badgeSettings.ts) put what it returns on the profile, after Evi's own badges,
 * and in Discord's badge directory ("Your badges", "Explore their badges"). Providers are asked on
 * every render, so they answer from state the plugin already has.
 */
import { Logger } from "./logger";

export interface ProfileBadge {
    /** Unique among the plugin's badges, e.g. "platform-desktop" */
    id: string;
    /** The tooltip on the profile */
    description: string;
    /** An image URL; data: URLs work */
    iconSrc: string;
    /** Where clicking it goes */
    link?: string;
    /** The name in the badge directory, when it should differ from the tooltip */
    name?: string;
}

export type ProfileBadgeProvider = (userId: string) => ProfileBadge[] | null | undefined;

/** A plugin's badge in Discord's badge directory: never sent to Discord or evi.rest when saving */
export { PLUGIN_PREFIX as PLUGIN_BADGE_PREFIX } from "@shared/badges";

/** What decides how a badge looks and acts, in Discord's format or ours */
const BADGE_FIELDS = ["id", "description", "icon", "iconSrc", "link", "name", "plugin", "eviKey"] as const;

/**
 * Whether two badge lists draw the same, field by field. Badge hooks run on every profile render,
 * and Discord compares what they return by identity: an unchanged list is handed back as the same
 * array. Cheaper than building a key with JSON.stringify.
 */
export function sameBadges(a: readonly any[] | undefined, b: readonly any[]): boolean {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x === y) continue;
        if (!x || !y) return false;
        for (const field of BADGE_FIELDS) if (x[field] !== y[field]) return false;
    }
    return true;
}

const logger = new Logger("ProfileBadges", "#5865f2");
const providers = new Map<ProfileBadgeProvider, string>();

export const ProfileBadges = {
    /** Registers a provider for `plugin` (its name, shown in the directory); returns the unregister */
    add(plugin: string, provider: ProfileBadgeProvider) {
        providers.set(provider, plugin);
        return () => void providers.delete(provider);
    },

    /** Every plugin's badges for a user, each tagged with the plugin that added it */
    forUser(userId: string): (ProfileBadge & { plugin: string; })[] {
        const out: (ProfileBadge & { plugin: string; })[] = [];
        for (const [provider, plugin] of providers) {
            try {
                for (const badge of provider(userId) ?? []) out.push({ ...badge, plugin });
            } catch (err) {
                logger.error(`${plugin}'s profile badges failed`, err);
            }
        }
        return out;
    },

    get size() {
        return providers.size;
    },
};
