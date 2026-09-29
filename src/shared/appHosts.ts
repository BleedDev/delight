/**
 * Where Evi runs: Discord's app, on its three release channels. Not any other *.discord.com page
 * (support, status, the developer portal), which the session preload also reaches.
 */
export const DISCORD_APP_HOSTS: readonly string[] = ["discord.com", "ptb.discord.com", "canary.discord.com"];

export function isDiscordAppUrl(url: string) {
    try {
        const u = new URL(url);
        return u.protocol === "https:" && DISCORD_APP_HOSTS.includes(u.hostname);
    } catch {
        return false;
    }
}
