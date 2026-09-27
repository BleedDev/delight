/**
 * Which device someone is on: desktop, mobile, web or a console, one icon for the one they're using.
 * A small outline icon in Discord's muted icon color with a status dot cut into its corner, like the
 * dot on an avatar.
 *
 * - Where from: PresenceStore.getClientStatus(userId) is Discord's own `{ desktop?, mobile?, web?,
 *   embedded? }` of statuses per device, the same data behind its mobile phone icon. Your own come
 *   from SessionsStore, one session per logged-in client.
 * - Profiles: a profile badge through ctx.profileBadges, so it gets Discord's own tooltip and layout,
 *   and shows in Discord's badge directory ("Your badges") too.
 * - Chat: added to the message header's badge decorations, after the name.
 * - Member list: a source patch adds them to the row's `decorators` (the crown, bot tag and boost
 *   icons), which Discord's member row renders after the name.
 */
import { Components, definePlugin, filters, getStore, React } from "@evi/api";
import type { PluginContext } from "@evi/api";

/** The username in a message header, with decorations = { [SYSTEM_TAG]: …, [BADGES]: [...] } */
const usernameFilter = filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
/** Discord's MessageHeaderDecorations.BADGES */
const BADGES = 1;

type Platform = "desktop" | "mobile" | "web" | "embedded";
type Status = "online" | "idle" | "dnd";

const PLATFORMS: Platform[] = ["desktop", "mobile", "web", "embedded"];
const NAMES: Record<Platform, string> = { desktop: "desktop", mobile: "mobile", web: "the web", embedded: "a console" };
const STATUS_NAMES: Record<Status, string> = { online: "Online", idle: "Idle", dnd: "Do Not Disturb" };
/** Discord's status colors */
const COLORS: Record<Status, string> = { online: "#23a55a", idle: "#f0b232", dnd: "#f23f43" };
/** Discord's muted icon color, for profiles where the icon is an image and can't inherit it */
const MUTED = "#949ba4";

/** Outline glyphs on a 24px grid, 2px strokes */
const GLYPHS: Record<Platform, string> = {
    desktop: `<rect x="2.5" y="3.5" width="19" height="12.5" rx="2.5"/><path d="M12 16v4.5M8 20.5h8"/>`,
    mobile: `<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 18.5h3"/>`,
    web: `<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5Z"/>`,
    embedded: `<path d="M7.5 6.5h9a5 5 0 0 1 4.9 4l.9 4.6a3.2 3.2 0 0 1-5.6 2.6L15 15.5H9l-1.7 2.2a3.2 3.2 0 0 1-5.6-2.6l.9-4.6a5 5 0 0 1 4.9-4Z"/><path d="M7.5 10v3M6 11.5h3"/><path d="M15.5 11h.01M17.5 13h.01"/>`,
};

/** The icon as SVG markup; the glyph is cut away around the status dot so the dot reads on any background */
function svg(p: Platform, s: Status, glyph: string, maskId: string) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
        + `<mask id="${maskId}"><rect width="24" height="24" fill="white"/><circle cx="19.5" cy="19.5" r="6" fill="black"/></mask>`
        + `<g mask="url(#${maskId})" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[p]}</g>`
        + `<circle cx="19.5" cy="19.5" r="4" fill="${COLORS[s]}"/></svg>`;
}

/** Profile icons as data URLs, built once per device and status */
const iconSrcs = new Map<string, string>();
const iconSrc = (p: Platform, s: Status) => {
    const key = `${p}:${s}`;
    let src = iconSrcs.get(key);
    if (!src) iconSrcs.set(key, src = `data:image/svg+xml,${encodeURIComponent(svg(p, s, MUTED, "m"))}`);
    return src;
};

const settings = {
    showOnProfiles: { type: "boolean", label: "On profiles", description: "Next to the badges on someone's profile.", default: true },
    showInChat: { type: "boolean", label: "In chat", description: "After the name on each message.", default: true },
    showInMemberList: { type: "boolean", label: "In the member list", description: "After each name in a server's member list.", default: true },
    showOwn: { type: "boolean", label: "Your own devices", description: "Show which of your own clients are online too.", default: true },
} as const;

let context: PluginContext<typeof settings> | undefined;

const stores = new Map<string, any>();

/** A Flux store, found once: every message header and member row asks */
const store = (name: string) => {
    let found = stores.get(name);
    if (found) return found;
    try {
        found = getStore(name);
    } catch {
        return undefined;
    }
    stores.set(name, found);
    return found;
};

/** Your id, looked up once and again on reconnect */
let me: string | undefined;
const ownId = () => me ??= store("UserStore")?.getCurrentUser?.()?.id as string | undefined;

/** How present a device's status says someone is there: an idle device is one they walked away from */
const PRESENCE: Record<Status, number> = { online: 2, dnd: 2, idle: 1 };

/**
 * The one device someone is on right now. Discord keeps a status per logged-in client, and a web
 * session left open in a background tab (or not yet timed out) reads as online next to the desktop
 * app they're actually using. So one icon: the most present device, and between equals, desktop,
 * then mobile, web and consoles.
 */
function deviceOf(statuses: Partial<Record<string, string>> | undefined): [Platform, Status] | undefined {
    let best: [Platform, Status] | undefined;
    for (const p of PLATFORMS) {
        const s = statuses?.[p];
        if (s !== "online" && s !== "idle" && s !== "dnd") continue;
        if (!best || PRESENCE[s] > PRESENCE[best[1]]) best = [p, s];
    }
    return best;
}

/** The device someone is on, as a list (empty or one) for the places that draw it */
function devicesOf(userId: string | undefined): [Platform, Status][] {
    if (!userId) return [];
    let statuses: Partial<Record<string, string>> | undefined;
    if (userId === ownId()) {
        if (!context?.settings.get("showOwn")) return [];
        // One session per logged-in client. Only ones in use count: SessionsStore keeps idle and
        // closed ones around for a while
        const status = (store("PresenceStore")?.getStatus?.(userId) ?? "online") as string;
        const sessions = Object.values(store("SessionsStore")?.getSessions?.() ?? {}) as any[];
        const live = sessions.filter(s => s?.active !== false && s?.status !== "invisible" && s?.status !== "offline");
        statuses = {};
        for (const s of live.length ? live : sessions) {
            const client = s?.clientInfo?.client;
            if (typeof client === "string") statuses[client] = s.status === "idle" ? "idle" : status;
        }
    } else {
        statuses = store("PresenceStore")?.getClientStatus?.(userId);
    }
    const device = deviceOf(statuses);
    return device ? [device] : [];
}

/** "desktop:online", or "" when there's nothing to show: what an icon depends on */
function deviceKey(userId: string): string {
    const [device] = devicesOf(userId);
    return device ? `${device[0]}:${device[1]}` : "";
}

const tooltip = (p: Platform, s: Status) => `${STATUS_NAMES[s]} on ${NAMES[p]}`;

/**
 * Icons listen per person. PresenceStore changes on every presence update anywhere, so on each
 * change only the people with an icon on screen are checked, against the device they were last
 * drawn with, and only the ones who switched are told.
 */
const listeners = new Map<string, Set<() => void>>();
const lastKeys = new Map<string, string>();
let diffTimer: ReturnType<typeof setTimeout> | undefined;

function subscribe(userId: string, cb: () => void) {
    let set = listeners.get(userId);
    if (!set) {
        listeners.set(userId, set = new Set());
        lastKeys.set(userId, deviceKey(userId));
    }
    set.add(cb);
    return () => {
        set.delete(cb);
        if (set.size || listeners.get(userId) !== set) return;
        listeners.delete(userId);
        lastKeys.delete(userId);
    };
}

/** Tells everyone whose device changed; with `all`, everyone (settings changes, stopping) */
function diff(all = false) {
    clearTimeout(diffTimer);
    diffTimer = undefined;
    for (const [userId, set] of [...listeners]) {
        const key = deviceKey(userId);
        if (!all && lastKeys.get(userId) === key) continue;
        lastKeys.set(userId, key);
        for (const cb of [...set]) cb();
    }
}

/** Several presence changes in one dispatch are checked once */
const diffSoon = () => void (diffTimer ??= setTimeout(diff, 0));

function useDevice(userId: string) {
    const sub = React.useCallback((cb: () => void) => subscribe(userId, cb), [userId]);
    return React.useSyncExternalStore(sub, () => lastKeys.get(userId) ?? deviceKey(userId));
}

function Icon({ platform, status }: { platform: Platform; status: Status; }) {
    // Inline, so the glyph takes the surrounding icon color; each needs its own mask id
    const id = `evi-platform-${React.useId().replace(/:/g, "")}`;
    return <span className="evi-platform-icon" aria-label={tooltip(platform, status)} role="img" dangerouslySetInnerHTML={{ __html: svg(platform, status, "currentColor", id) }} />;
}

interface IndicatorProps { userId: string; where: "chat" | "members"; }

let memoized: React.ComponentType<IndicatorProps> | undefined;
/** Memoized on first use: React.memo can't run when the plugin loads, before Discord's React is there */
const indicators = () => memoized ??= React.memo(Indicators);

/** Re-renders only when this person switches devices or the settings change */
function Indicators({ userId, where }: IndicatorProps) {
    const key = useDevice(userId);
    if (!key || !context?.settings.get(where === "chat" ? "showInChat" : "showInMemberList")) return null;
    const [p, s] = key.split(":") as [Platform, Status];
    const Tooltip = Components.Tooltip;
    const icon = <Icon platform={p} status={s} />;
    return (
        <span className="evi-platforms" data-where={where}>
            {Tooltip
                ? <Tooltip key={p} text={tooltip(p, s)}><span>{icon}</span></Tooltip>
                : <span key={p} title={tooltip(p, s)}>{icon}</span>}
        </span>
    );
}

const css = `
.evi-platforms { display: inline-flex; align-items: center; gap: 3px; margin-inline-start: 4px; color: var(--icon-muted, #949ba4); vertical-align: -3px; }
.evi-platforms[data-where="members"] { vertical-align: middle; }
.evi-platforms > span { display: inline-flex; }
.evi-platform-icon { display: inline-flex; width: 16px; height: 16px; }
.evi-platform-icon svg { width: 100%; height: 100%; }
`;

export default definePlugin({
    settings,

    patches: [
        {
            // The member row: decorators:(0,i.jsx)(er,{user:p,isOwner:u,…}) → [that, ours]
            find: "lostPermissionTooltipText",
            replace: {
                match: /decorators:(\(0,\i\.jsx\)\(\i,\{user:(\i),isOwner:[^}]*\}\))/,
                with: "decorators:[$1,$self.memberIndicators($2)]",
            },
        },
    ],

    memberIndicators(user: { id?: string; bot?: boolean; } | null | undefined) {
        // Nothing at all while the setting is off: no component, no subscription per row
        if (!user?.id || user.bot || !context?.settings.get("showInMemberList")) return null;
        const Icons = indicators();
        return <Icons key="evi-platforms" userId={user.id} where="members" />;
    },

    start(ctx) {
        context = ctx;
        ctx.addStyle(css);

        // Your own devices come from SessionsStore
        const watched = ["PresenceStore", "SessionsStore"].map(store).filter(Boolean);
        for (const s of watched) s.addChangeListener?.(diffSoon);
        ctx.onDispose(() => watched.forEach(s => s.removeChangeListener?.(diffSoon)));
        ctx.settings.onChange(() => diff(true));
        ctx.flux.subscribe("CONNECTION_OPEN", () => {
            me = undefined;
            diff(true);
        });
        diff(true);

        // On profiles and in Discord's badge directory, through Evi's badges
        ctx.profileBadges(userId => ctx.settings.get("showOnProfiles")
            ? devicesOf(userId).map(([p, s]) => ({ id: `platform-${p}`, name: `${STATUS_NAMES[s]} on ${NAMES[p]}`, description: tooltip(p, s), iconSrc: iconSrc(p, s) }))
            : []);

        ctx.hookExport("before", usernameFilter, ({ args }) => {
            const props = args[0];
            const userId = props?.message?.author?.id;
            // Only the message's own header: replies pass decorations without a BADGES slot
            if (!userId || !props.decorations || !(BADGES in props.decorations) || props.message?.author?.bot) return;
            // Nothing at all while the setting is off
            if (!ctx.settings.get("showInChat")) return;
            const existing = props.decorations[BADGES];
            const Icons = indicators();
            const ours = <Icons key="evi-platforms" userId={userId} where="chat" />;
            args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...(Array.isArray(existing) ? existing : existing != null ? [existing] : []), ours] } };
        });
    },

    stop() {
        context = undefined;
        me = undefined;
        diff(true);
    },
});
