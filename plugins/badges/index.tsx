/**
 * Evi badges, drawn by Discord itself where it can:
 *
 * - Profiles: Discord gets a profile's badges from one hook, `useProfileBadges(displayProfile)`, and
 *   renders `badge.iconSrc ?? cdn(badge.icon)`. Ours go in front of Discord's with an iconSrc, so they
 *   get Discord's own sizing, tooltip and layout.
 * - Chat: the message username takes `decorations[BADGES]`, the elements after the name (role icon,
 *   new member, …). Ours are added to that list.
 *
 * Both are export hooks: no source patches, and turning the plugin off restores Discord exactly.
 */
import { Badge, BadgeAdminAction, Badges, Components, definePlugin, filters, React } from "@evi/api";
import type { ReactElement } from "react";

/** Discord's `(displayProfile, hideLegacyUsername?) => ProfileBadge[]` */
const profileBadgesFilter = filters.byCode("getBadges()??[]", "hidePersonalInformation");
/** The username in a message header, with decorations = { [SYSTEM_TAG]: …, [BADGES]: [...] } */
const usernameFilter = filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
/** Discord's MessageHeaderDecorations.BADGES */
const BADGES = 1;

const css = `
.evi-chat-badges { display: inline-flex; gap: 4px; margin-inline-start: 4px; vertical-align: -3px; }
.evi-chat-badges img { width: 16px; height: 16px; object-fit: contain; }
.evi-chat-badges[data-compact] { vertical-align: -2px; }
.evi-chat-badges[data-compact] img { width: 14px; height: 14px; }
`;

const tooltip = (b: Badge) => b.description ? `${b.name}: ${b.description}` : b.name;

/** In Discord's profile badge format */
const toProfileBadge = (b: Badge) => ({ id: `evi-${b.id}`, description: tooltip(b), iconSrc: b.icon });

function useUserBadges(userId: string | undefined) {
    React.useSyncExternalStore(Badges.subscribe, Badges.getVersion);
    return Badges.forUser(userId);
}

function ChatBadges({ userId, compact }: { userId: string; compact: boolean; }) {
    const badges = useUserBadges(userId);
    if (!badges.length) return null;
    const Tooltip = Components.Tooltip;
    return (
        <span className="evi-chat-badges" data-compact={compact ? "" : undefined}>
            {badges.map(b => {
                const img = <img src={b.icon} alt={b.name} aria-label={tooltip(b)} draggable={false} />;
                return Tooltip ? <Tooltip key={b.id} text={tooltip(b)}>{img}</Tooltip> : React.cloneElement(img, { key: b.id, title: tooltip(b) });
            })}
        </span>
    );
}

export default definePlugin({
    start(ctx) {
        ctx.addStyle(css);
        ctx.onDispose(Badges.use());

        ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
            const ours = Badges.forUser(args[0]?.userId);
            if (!ours.length) return;
            return [...ours.map(toProfileBadge), ...(Array.isArray(result) ? result : [])];
        });

        ctx.hookExport("before", usernameFilter, ({ args }) => {
            const props = args[0];
            const userId = props?.message?.author?.id;
            // Only the message's own header: replies pass decorations without a BADGES slot
            if (!userId || !props.decorations || !(BADGES in props.decorations)) return;
            const existing = props.decorations[BADGES];
            const ours: ReactElement = <ChatBadges key="evi-badges" userId={userId} compact={!!props.compact} />;
            args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...(Array.isArray(existing) ? existing : existing != null ? [existing] : []), ours] } };
        });

        // Managing badges: only on an install holding the admin token, which never leaves main
        void Badges.canManage().then(allowed => {
            if (!allowed) return;
            ctx.command({
                name: "badge",
                description: "Manage Evi badges",
                options: [
                    {
                        name: "action",
                        description: "What to do",
                        required: true,
                        choices: [
                            { name: "grant: give a badge to someone", value: "grant" },
                            { name: "revoke: take a badge away", value: "revoke" },
                            { name: "create: make a new badge", value: "create" },
                            { name: "delete: remove a badge from everyone", value: "delete" },
                            { name: "list: every badge", value: "list" },
                        ],
                    },
                    { name: "badge", description: "Badge id, like early-supporter" },
                    { name: "user", description: "Who gets it or loses it (grant, revoke)", type: "user" },
                    { name: "name", description: "Shown on hover (create)" },
                    { name: "icon", description: "Link to a PNG, GIF, JPEG or WebP, 1 MB max (create)" },
                    { name: "description", description: "Extra line on hover (create)" },
                ],
                async execute(args) {
                    const { action, badge, user, name, icon, description } = args as Record<string, string | undefined>;
                    const missing = (...fields: [string, unknown][]) => fields.filter(([, v]) => !v).map(([k]) => k);
                    const need = {
                        grant: missing(["badge", badge], ["user", user]),
                        revoke: missing(["badge", badge], ["user", user]),
                        create: missing(["badge", badge], ["name", name], ["icon", icon]),
                        delete: missing(["badge", badge]),
                        list: [],
                    }[action as "list"] ?? [];
                    if (need.length) return { ephemeral: `/badge ${action} needs ${need.join(" and ")}.` };

                    const input: BadgeAdminAction = action === "grant" || action === "revoke" ? { action, userId: user!, badgeId: badge! }
                        : action === "create" ? { action, id: badge!, name: name!, description, iconUrl: icon! }
                            : action === "delete" ? { action, id: badge! }
                                : { action: "list" };
                    const result = await Badges.manage(input);
                    return { ephemeral: result.ok ? result.message : `Couldn’t ${action}: ${result.error}` };
                },
            });
        });
    },
});
