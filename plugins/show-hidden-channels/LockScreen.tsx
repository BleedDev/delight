/**
 * What a hidden channel shows instead of its messages: its type, topic (for forums), when it was
 * last active, its settings, and who can see it. All of it comes from the channel object Discord
 * already has; the allowed users and roles list is Discord's own channel header component.
 */
import { Components, Dispatcher, filters, find, React } from "@evi/api";
import type { ComponentType } from "react";

import { cssClasses, findCached, getContext, Permissions, setting, store } from "./shared";

const enum ChannelFlags {
    REQUIRE_TAG = 1 << 4,
}

const TYPE_NAMES: Record<number, string> = { 0: "text", 2: "voice", 5: "announcement", 13: "stage", 15: "forum", 16: "media" };
const SORT_ORDERS: Record<number, string> = { 0: "Latest activity", 1: "Creation date" };
const FORUM_LAYOUTS: Record<number, string> = { 0: "Not set", 1: "List view", 2: "Gallery view" };
const VIDEO_QUALITY: Record<number, string> = { 1: "Automatic", 2: "720p" };

/** Discord's picture for a message link you can't open */
const LOGO = "/assets/433e3ec4319a9d11b0cbe39342614982.svg";
const DISCORD_EPOCH = 1420070400000;

const scrollerClasses = cssClasses("auto", "customTheme", "managedReactiveScroller");
const topicParser = findCached<any>(() => find(filters.byProps("parseTopic")));

let ChannelBeginHeader: ComponentType<{ channel: any; }> = () => null;
export const setChannelBeginHeader = (component: ComponentType<{ channel: any; }>) => void (ChannelBeginHeader = component);

const snowflakeDate = (id: string) => new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
const formatDate = (date: Date) => date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatDuration(amount: number, unit: "seconds" | "minutes") {
    let seconds = unit === "minutes" ? amount * 60 : amount;
    const parts: string[] = [];
    for (const [name, size] of [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]] as const) {
        const n = Math.floor(seconds / size);
        if (!n) continue;
        seconds -= n * size;
        parts.push(`${n} ${name}${n === 1 ? "" : "s"}`);
    }
    return parts.join(" ") || "0 seconds";
}

function Emoji({ id, name }: { id?: string | null; name?: string | null; }) {
    if (name) return <span className="evi-shc-emoji">{name}</span>;
    if (!id) return null;
    const alt = store("EmojiStore")?.getCustomEmojiById?.(id)?.name ?? "emoji";
    return <img className="evi-shc-emoji" src={`https://cdn.discordapp.com/emojis/${id}.webp?size=48`} alt={`:${alt}:`} />;
}

function Topic({ channel }: { channel: any; }) {
    const parser = topicParser();
    try {
        if (parser) return <>{parser.parseTopic(channel.topic, false, { channelId: channel.id })}</>;
    } catch { }
    return <>{channel.topic}</>;
}

function WithTooltip({ text, children }: { text: string; children: (props: { onMouseEnter?(): void; onMouseLeave?(): void; }) => React.ReactNode; }) {
    const Tooltip = Components.Tooltip as any;
    return Tooltip ? <Tooltip text={text}>{children}</Tooltip> : <span title={text}>{children({})}</span>;
}

function LockScreen({ channel }: { channel: any; }) {
    const ctx = getContext();
    const [, rerender] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => ctx?.settings.onChange(rerender), [ctx]);
    const showAllowed = setting("showAllowedByDefault");

    const {
        type, topic, lastMessageId, lastPinTimestamp, rateLimitPerUser, defaultThreadRateLimitPerUser, bitrate, rtcRegion,
        videoQualityMode, defaultAutoArchiveDuration, defaultForumLayout, defaultSortOrder, defaultReactionEmoji, availableTags,
        permissionOverwrites, guild_id: guildId,
    } = channel;

    // The allowed users list needs the members loaded: ask for the owner and every user with an overwrite
    React.useEffect(() => {
        const members = store("GuildMemberStore");
        const ownerId = store("GuildStore")?.getGuild(guildId)?.ownerId;
        const missing = new Set<string>();
        if (ownerId && !members?.getMember(guildId, ownerId)) missing.add(ownerId);
        for (const { type, id } of Object.values<any>(permissionOverwrites ?? {})) {
            if (type === 1 && !members?.getMember(guildId, id)) missing.add(id);
        }
        if (missing.size) Dispatcher.dispatch({ type: "GUILD_MEMBERS_REQUEST", guildIds: [guildId], userIds: [...missing] });
    }, [channel.id]);

    const isVoice = channel.isGuildVoice?.() || channel.isGuildStageVoice?.();
    const isForum = channel.isForumChannel?.();
    const hidden = !store("PermissionStore")?.can(Permissions.VIEW_CHANNEL, channel);
    const scroller = scrollerClasses();

    return (
        <div className={[scroller.auto, scroller.customTheme, scroller.managedReactiveScroller].filter(Boolean).join(" ")}>
            <div className="evi-shc-container">
                <img className="evi-shc-logo" src={LOGO} alt="" />

                <div className="evi-shc-heading">
                    <h2>This is a {hidden ? "hidden" : "locked"} {TYPE_NAMES[type] ?? ""} channel</h2>
                    {channel.isNSFW?.() && (
                        <WithTooltip text="NSFW">
                            {props => (
                                <svg {...props} className="evi-shc-nsfw" width="32" height="32" viewBox="0 0 48 48" aria-hidden role="img">
                                    <path fill="currentColor" d="M.7 43.05 24 2.85l23.3 40.2Zm23.55-6.25q.75 0 1.275-.525.525-.525.525-1.275 0-.75-.525-1.3t-1.275-.55q-.8 0-1.325.55-.525.55-.525 1.3t.55 1.275q.55.525 1.3.525Zm-1.85-6.1h3.65V19.4H22.4Z" />
                                </svg>
                            )}
                        </WithTooltip>
                    )}
                </div>

                {!isVoice && (
                    <p className="evi-shc-lead">
                        You can't see the {isForum ? "posts" : "messages"} in this channel.
                        {isForum && topic && " Its guidelines are below."}
                    </p>
                )}

                {isForum && topic && <div className="evi-shc-box evi-shc-topic"><Topic channel={channel} /></div>}

                {lastMessageId && <p>Last {isForum ? "post" : "message"}: {formatDate(snowflakeDate(lastMessageId))}</p>}
                {lastPinTimestamp && <p>Last pin: {formatDate(new Date(lastPinTimestamp))}</p>}
                {rateLimitPerUser > 0 && <p>Slowmode: {formatDuration(rateLimitPerUser, "seconds")}</p>}
                {defaultThreadRateLimitPerUser > 0 && <p>Default thread slowmode: {formatDuration(defaultThreadRateLimitPerUser, "seconds")}</p>}
                {isVoice && bitrate != null && <p>Bitrate: {Math.round(bitrate / 1000)} kbps</p>}
                {rtcRegion !== undefined && <p>Region: {rtcRegion ?? "Automatic"}</p>}
                {isVoice && <p>Video quality: {VIDEO_QUALITY[videoQualityMode ?? 1]}</p>}
                {defaultAutoArchiveDuration > 0 && (
                    <p>{isForum ? "Posts" : "Threads"} archive after {formatDuration(defaultAutoArchiveDuration, "minutes")} of inactivity</p>
                )}
                {defaultForumLayout != null && <p>Default layout: {FORUM_LAYOUTS[defaultForumLayout]}</p>}
                {defaultSortOrder != null && <p>Default sort order: {SORT_ORDERS[defaultSortOrder]}</p>}
                {defaultReactionEmoji != null && (
                    <div className="evi-shc-box evi-shc-row">
                        <p>Default reaction:</p>
                        <Emoji id={defaultReactionEmoji.emojiId} name={defaultReactionEmoji.emojiName} />
                    </div>
                )}
                {channel.hasFlag?.(ChannelFlags.REQUIRE_TAG) && <p>Posts in this forum need a tag.</p>}
                {availableTags?.length > 0 && (
                    <div className="evi-shc-box">
                        <h3>Available tags</h3>
                        <div className="evi-shc-tags">
                            {availableTags.map((tag: any) => (
                                <span key={tag.id} className="evi-shc-tag">
                                    <Emoji id={tag.emojiId} name={tag.emojiName} />
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="evi-shc-box evi-shc-allowed">
                    <div className="evi-shc-row">
                        <h3>Allowed users and roles</h3>
                        <WithTooltip text={showAllowed ? "Hide allowed users and roles" : "Show allowed users and roles"}>
                            {props => (
                                <button {...props} className="evi-shc-toggle" aria-expanded={showAllowed} onClick={() => ctx?.settings.set("showAllowedByDefault", !showAllowed)}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: showAllowed ? "scaleY(-1)" : undefined }}>
                                        <path fill="currentColor" d="M16.59 8.59003L12 13.17L7.41 8.59003L6 10L12 16L18 10L16.59 8.59003Z" />
                                    </svg>
                                </button>
                            )}
                        </WithTooltip>
                    </div>
                    {showAllowed && <ChannelBeginHeader channel={channel} />}
                </div>
            </div>
        </div>
    );
}

let Boundary: ComponentType<{ children: React.ReactNode; }> | undefined;

/** Made on first use: React isn't loaded yet when the plugin's code runs */
function getBoundary() {
    return Boundary ??= class extends React.Component<{ children: React.ReactNode; }, { failed: boolean; }> {
        override state = { failed: false };
        static getDerivedStateFromError() {
            return { failed: true };
        }
        override componentDidCatch(err: unknown) {
            getContext()?.logger.error("The hidden channel page crashed", err);
        }
        override render() {
            return this.state.failed ? <div className="evi-shc-container"><p>Couldn't show this hidden channel.</p></div> : this.props.children;
        }
    };
}

export function renderLockScreen(channel: any) {
    if (!channel) return null;
    const ErrorBoundary = getBoundary();
    return <ErrorBoundary key={channel.id}><LockScreen channel={channel} /></ErrorBoundary>;
}

export const lockScreenCss = `
.evi-shc-container { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 0.65em; margin: 0.5em 0; min-height: 100%; color: var(--text-default); font-size: 16px; line-height: 1.375; }
.evi-shc-container p { margin: 0; }
.evi-shc-container h2 { margin: 0; font-size: 32px; font-weight: 700; line-height: 1.25; color: var(--text-strong, var(--header-primary)); }
.evi-shc-container h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-strong, var(--header-primary)); }
.evi-shc-lead { font-size: 18px; }
.evi-shc-logo { width: 12em; height: 12em; }
.evi-shc-heading { display: flex; align-items: center; gap: 0.5em; }
.evi-shc-nsfw { color: var(--text-default); }
.evi-shc-box { display: flex; flex-direction: column; align-items: center; gap: 0.75em; padding: 0.75em; max-width: 70vw; border-radius: 8px; background: var(--background-base-lower); }
.evi-shc-row { display: flex; flex-direction: row; align-items: center; gap: 0.5em; }
.evi-shc-topic { display: block; text-align: start; }
.evi-shc-tags { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.35em; }
.evi-shc-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 14px; background: var(--background-mod-normal, var(--background-base-low)); }
.evi-shc-emoji { font-size: 20px; line-height: 1; }
img.evi-shc-emoji { width: 20px; height: 20px; object-fit: contain; }
.evi-shc-tag .evi-shc-emoji { font-size: 14px; }
.evi-shc-tag img.evi-shc-emoji { width: 14px; height: 14px; }
.evi-shc-toggle { all: unset; display: flex; align-items: center; cursor: pointer; color: var(--text-default); border-radius: 4px; }
.evi-shc-toggle:focus-visible { outline: 2px solid var(--focus-primary, #00a8fc); }
.evi-shc-allowed > [class*="members"] { margin-left: 12px; flex-wrap: wrap; justify-content: center; }
`;
