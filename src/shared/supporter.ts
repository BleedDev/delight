/**
 * Supporter levels: one badge per level, picked by how long someone has supported Evi. The server
 * works out everyone's level from their start date plus any time an admin granted; the client only
 * shows it, with "Supporting Evi since …" from `since`.
 */
export const DAY = 24 * 60 * 60 * 1000;

export interface SupporterTier {
    /** The badge shown at this level */
    badge: string;
    name: string;
    /** Days of support to reach it */
    days: number;
}

export const SUPPORTER_TIERS: readonly SupporterTier[] = [
    { badge: "supporter-bronze", name: "Bronze", days: 0 },
    { badge: "supporter-silver", name: "Silver", days: 91 },
    { badge: "supporter-gold", name: "Gold", days: 182 },
    { badge: "supporter-emerald", name: "Emerald", days: 365 },
    { badge: "supporter-sapphire", name: "Sapphire", days: 730 },
    { badge: "supporter-amethyst", name: "Amethyst", days: 1095 },
    { badge: "supporter-ruby", name: "Ruby", days: 1461 },
    { badge: "supporter-prismatic", name: "Prismatic", days: 1826 },
];

export const isSupporterBadge = (id: string) => SUPPORTER_TIERS.some(t => t.badge === id);

/** Days supported, counted from `since` (the start date moved back by any granted time) */
export const supportedDays = (since: number, now = Date.now()) => Math.max(0, Math.floor((now - since) / DAY));

export function supporterTier(since: number, now = Date.now()): SupporterTier {
    const days = supportedDays(since, now);
    let tier = SUPPORTER_TIERS[0];
    for (const t of SUPPORTER_TIERS) if (days >= t.days) tier = t;
    return tier;
}

/** The next level and when it's reached, or undefined at the top */
export function nextSupporterTier(since: number, now = Date.now()): { tier: SupporterTier; at: number; } | undefined {
    const days = supportedDays(since, now);
    const tier = SUPPORTER_TIERS.find(t => t.days > days);
    return tier && { tier, at: since + tier.days * DAY };
}
