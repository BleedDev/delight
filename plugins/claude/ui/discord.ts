import { N } from "./native";
// Access to Discord's own client internals (webpack modules / Flux stores) through Evi's finders.
// Everything runs inside the user's logged-in Discord session; no token is ever read or exported.
import { find as eviFind, getStore } from "@evi/api";

export const find = (filter: (m: any) => boolean): any => eviFind(filter as any);
const fnSrc = (f: any) => {
    try {
        return typeof f === "function" ? Function.prototype.toString.call(f) : "";
    } catch {
        return "";
    }
};
export const findByCode = (...needles: string[]) => lazy("code:" + needles.join("|"), m => typeof m === "function" && needles.every(n => fnSrc(m).includes(n)));

const cache = new Map<string, any>();
function lazy<T = any>(key: string, filter: (m: any) => boolean): () => T {
    return () => {
        let v = cache.get(key);
        if (!v) {
            v = find(filter);
            if (v) cache.set(key, v);
        }
        return v;
    };
}
export const findByProps = (...props: string[]) => lazy(props.join(","), m => props.every(p => m?.[p] !== undefined));
export const findStore = (name: string) => () => getStore(name) as any;

export const Stores = {
    Channel: findStore("ChannelStore"),
    User: findStore("UserStore"),
    Guild: findStore("GuildStore"),
    GuildChannel: findStore("GuildChannelStore"),
    Message: findStore("MessageStore"),
    SelectedChannel: findStore("SelectedChannelStore"),
    PrivateChannelSort: findStore("PrivateChannelSortStore"),
    GuildMember: findStore("GuildMemberStore"),
    Relationship: findStore("RelationshipStore"),
    ReadState: findStore("ReadStateStore"),
    Presence: findStore("PresenceStore"),
    VoiceState: findStore("VoiceStateStore"),
    GuildMemberCount: findStore("GuildMemberCountStore"),
    Emoji: findStore("EmojiStore"),
    UserGuildSettings: findStore("UserGuildSettingsStore"),
};
export const RestAPI = lazy("restapi", m => m && typeof m === "object" && ["get", "post", "put", "patch", "del"].every(f => typeof m[f] === "function") && !("Request" in m));
export const Dispatcher = findByProps("dispatch", "subscribe", "unsubscribe", "wait");
const transitionToFn = findByCode("transitionTo - Transitioning to");
const RouterProps = findByProps("transitionTo", "replaceWith", "goBack");
export const Router = () => {
    const fn = transitionToFn();
    if (fn) return { transitionTo: (path: string) => fn(path) };
    return RouterProps();
};
export const ComponentDispatch = lazy("componentDispatch", m => typeof m?.dispatchToLastSubscribed === "function" && typeof m?.emitter === "object");

// ---------- helpers
export function userLabel(u: any) {
    if (!u) return "Unknown";
    return u.globalName || u.global_name || u.username;
}
export function channelLabel(c: any) {
    if (!c) return "Unknown";
    if (c.name) return c.name;
    const users = (c.recipients ?? []).map((id: string) => Stores.User()?.getUser(id)).filter(Boolean);
    return users.map(userLabel).join(", ") || "Direct Message";
}
export function openChannel(channelId: string) {
    const c = Stores.Channel()?.getChannel(channelId);
    if (!c) throw new Error("Unknown channel " + channelId);
    Router()?.transitionTo(`/channels/${c.guild_id ?? "@me"}/${channelId}`);
    return true;
}
function slimMessage(m: any) {
    return {
        id: m.id,
        author: userLabel(m.author),
        author_id: m.author?.id,
        timestamp: new Date(m.timestamp?.toString?.() ?? m.timestamp).toISOString(),
        content: m.content,
        ...(m.attachments?.length ? { attachments: m.attachments.map((a: any) => ({ filename: a.filename, url: a.url })) } : {}),
        ...(m.embeds?.length ? { embeds: m.embeds.map((e: any) => ({ title: e.rawTitle ?? e.title, description: e.rawDescription ?? e.description, url: e.url })) } : {}),
        ...(m.messageReference?.message_id || m.message_reference?.message_id ? { reply_to: m.messageReference?.message_id ?? m.message_reference?.message_id } : {}),
    };
}

// ---------- tool implementations for the agent
export const discordTools: Record<string, (a: any) => Promise<any> | any> = {
    listConversations({ limit = 40 }: any) {
        const ids: string[] = Stores.PrivateChannelSort()?.getPrivateChannelIds?.() ?? [];
        return ids.slice(0, limit).map(id => {
            const c = Stores.Channel()?.getChannel(id);
            return {
                id,
                name: channelLabel(c),
                type: c?.type === 3 ? "group_dm" : "dm",
                recipients: (c?.recipients ?? []).map((u: string) => userLabel(Stores.User()?.getUser(u))),
                last_message_id: c?.lastMessageId,
            };
        });
    },
    listServers() {
        const guilds = Object.values(Stores.Guild()?.getGuilds?.() ?? {}) as any[];
        return guilds.map(g => {
            const chans = Stores.GuildChannel()?.getChannels?.(g.id);
            const text = (chans?.SELECTABLE ?? []).map((x: any) => ({ id: x.channel.id, name: x.channel.name }));
            return { id: g.id, name: g.name, channels: text };
        });
    },
    async readMessages({ channel_id, limit = 50, before, after }: any) {
        const res = await RestAPI()!.get({
            url: `/channels/${channel_id}/messages`,
            query: { limit: Math.min(100, limit), ...(before ? { before } : {}), ...(after ? { after } : {}) },
        });
        const msgs = (res.body ?? []).map(slimMessage).reverse();
        return { channel: channelLabel(Stores.Channel()?.getChannel(channel_id)), messages: msgs };
    },
    async searchMessages({ query, guild_id, channel_id, author_id }: any) {
        const url = guild_id ? `/guilds/${guild_id}/messages/search` : `/channels/${channel_id}/messages/search`;
        if (!guild_id && !channel_id) throw new Error("Provide guild_id or channel_id");
        const res = await RestAPI()!.get({ url, query: { content: query, ...(author_id ? { author_id } : {}), ...(guild_id && channel_id ? { channel_id } : {}) } });
        return { total: res.body?.total_results, results: (res.body?.messages ?? []).map((g: any[]) => slimMessage(g[0])) };
    },
    async getUser({ user_id }: any) {
        const u = Stores.User()?.getUser(user_id);
        let profile: any = null;
        try {
            profile = (await RestAPI()!.get({ url: `/users/${user_id}/profile`, query: { with_mutual_guilds: false } })).body;
        } catch {}
        return { id: user_id, username: u?.username, display_name: userLabel(u), bio: profile?.user_profile?.bio ?? profile?.user?.bio, pronouns: profile?.user_profile?.pronouns };
    },
    placeDraft({ channel_id, content, reply_to_message_id }: any) {
        openChannel(channel_id);
        setTimeout(() => {
            if (reply_to_message_id) {
                const channel = Stores.Channel()?.getChannel(channel_id);
                const message = Stores.Message()?.getMessage(channel_id, reply_to_message_id);
                if (channel && message) Dispatcher()?.dispatch({ type: "CREATE_PENDING_REPLY", channel, message, shouldMention: true, showMentionToggle: true });
            }
            ComponentDispatch()?.dispatchToLastSubscribed("INSERT_TEXT", { rawText: content, plainText: content });
        }, 350);
        return true;
    },
    openChannel({ channel_id }: any) {
        return openChannel(channel_id);
    },
    currentContext({ localId }: any) {
        const id = Stores.SelectedChannel()?.getChannelId?.();
        const c = id ? Stores.Channel()?.getChannel(id) : null;
        return { open_channel: c ? { id, name: channelLabel(c), guild_id: c.guild_id ?? null } : null, agent_chat: localId };
    },
};

// ---------- more of Discord for the agent
const nonce = () => String(BigInt(Date.now() - 1420070400000) << 22n);
function channelInfo(c: any) {
    if (!c) return null;
    const g = c.guild_id ? Stores.Guild()?.getGuild(c.guild_id) : null;
    return {
        id: c.id,
        name: channelLabel(c),
        type:
            (
                {
                    0: "text",
                    1: "dm",
                    2: "voice",
                    3: "group_dm",
                    4: "category",
                    5: "announcement",
                    10: "thread",
                    11: "thread",
                    12: "private_thread",
                    13: "stage",
                    15: "forum",
                } as any
            )[c.type] ?? c.type,
        guild: g ? { id: g.id, name: g.name } : null,
        topic: c.topic || undefined,
        parent_id: c.parent_id || undefined,
        recipients: c.recipients?.map((id: string) => ({ id, name: userLabel(Stores.User()?.getUser(id)) })),
        unread: Stores.ReadState()?.hasUnread?.(c.id) ?? undefined,
        mentions: Stores.ReadState()?.getMentionCount?.(c.id) || undefined,
    };
}
Object.assign(discordTools, {
    async sendMessage({ channel_id, content, reply_to_message_id }: any) {
        const body: any = { content, nonce: nonce(), tts: false, flags: 0 };
        if (reply_to_message_id) body.message_reference = { channel_id, message_id: reply_to_message_id };
        const res = await RestAPI()!.post({ url: `/channels/${channel_id}/messages`, body });
        return { sent: true, id: res.body?.id, channel: channelLabel(Stores.Channel()?.getChannel(channel_id)) };
    },
    async editMessage({ channel_id, message_id, content }: any) {
        await RestAPI()!.patch({ url: `/channels/${channel_id}/messages/${message_id}`, body: { content } });
        return { edited: true };
    },
    async deleteMessage({ channel_id, message_id }: any) {
        await RestAPI()!.del({ url: `/channels/${channel_id}/messages/${message_id}` });
        return { deleted: true };
    },
    async addReaction({ channel_id, message_id, emoji }: any) {
        await RestAPI()!.put({ url: `/channels/${channel_id}/messages/${message_id}/reactions/${encodeURIComponent(emoji)}/@me`, query: { location: "Message", type: 0 } });
        return { reacted: true };
    },
    getChannel({ channel_id }: any) {
        const c = Stores.Channel()?.getChannel(channel_id);
        if (!c) throw new Error("Unknown channel " + channel_id);
        return channelInfo(c);
    },
    async getMessage({ channel_id, message_id }: any) {
        const cached = Stores.Message()?.getMessage(channel_id, message_id);
        if (cached) return slimMessage(cached);
        const res = await RestAPI()!.get({ url: `/channels/${channel_id}/messages`, query: { around: message_id, limit: 1 } });
        const m = (res.body ?? []).find((x: any) => x.id === message_id);
        if (!m) throw new Error("Message not found");
        return slimMessage(m);
    },
    getUnread({ limit = 30 }: any) {
        const rs = Stores.ReadState();
        const out: any[] = [];
        const ids: string[] = [...(Stores.PrivateChannelSort()?.getPrivateChannelIds?.() ?? [])];
        for (const g of Object.values(Stores.Guild()?.getGuilds?.() ?? {}) as any[])
            for (const x of Stores.GuildChannel()?.getChannels?.(g.id)?.SELECTABLE ?? []) ids.push(x.channel.id);
        for (const id of ids) {
            const c = Stores.Channel()?.getChannel(id);
            if (!c || !rs?.hasUnread?.(id)) continue;
            const muted = c.guild_id ? Stores.UserGuildSettings()?.isChannelMuted?.(c.guild_id, id) || Stores.UserGuildSettings()?.isMuted?.(c.guild_id) : false;
            if (muted && !rs.getMentionCount?.(id)) continue;
            out.push({ ...channelInfo(c), unread_count: rs.getUnreadCount?.(id) || undefined });
        }
        return out.sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0) || Number(b.type === "dm") - Number(a.type === "dm")).slice(0, limit);
    },
    async getMentions({ limit = 25, guild_id }: any) {
        const res = await RestAPI()!.get({ url: "/users/@me/mentions", query: { limit: Math.min(50, limit), roles: true, everyone: true, ...(guild_id ? { guild_id } : {}) } });
        return (res.body ?? []).map((m: any) => ({ ...slimMessage(m), channel_id: m.channel_id, channel: channelLabel(Stores.Channel()?.getChannel(m.channel_id)) }));
    },
    listFriends() {
        const rel = Stores.Relationship();
        const ids: string[] = rel?.getFriendIDs?.() ?? [];
        return ids.map(id => {
            const u = Stores.User()?.getUser(id);
            return { id, name: userLabel(u), username: u?.username, status: Stores.Presence()?.getStatus?.(id), activity: Stores.Presence()?.getActivities?.(id)?.[0]?.name };
        });
    },
    getPresence({ user_id }: any) {
        const p = Stores.Presence();
        return {
            status: p?.getStatus?.(user_id),
            activities: (p?.getActivities?.(user_id) ?? []).map((a: any) => ({ name: a.name, type: a.type, details: a.details, state: a.state })),
        };
    },
    async getGuild({ guild_id }: any) {
        const g = Stores.Guild()?.getGuild(guild_id);
        if (!g) throw new Error("Unknown server " + guild_id);
        const chans = Stores.GuildChannel()?.getChannels?.(guild_id);
        return {
            id: g.id,
            name: g.name,
            description: g.description,
            member_count: Stores.GuildMemberCount()?.getMemberCount?.(guild_id),
            owner: g.ownerId === Stores.User()?.getCurrentUser()?.id,
            channels: (chans?.SELECTABLE ?? []).map((x: any) => ({ id: x.channel.id, name: x.channel.name, topic: x.channel.topic || undefined })),
            voice_channels: (chans?.VOCAL ?? []).map((x: any) => ({ id: x.channel.id, name: x.channel.name })),
            roles: Object.values(g.roles ?? {}).map((r: any) => r.name),
        };
    },
    async searchMembers({ guild_id, query, limit = 20 }: any) {
        const res = await RestAPI()!.get({ url: `/guilds/${guild_id}/members/search`, query: { query, limit } });
        return (res.body ?? []).map((m: any) => ({ id: m.user.id, name: m.nick || m.user.global_name || m.user.username, username: m.user.username, roles: m.roles }));
    },
    async getPins({ channel_id }: any) {
        const res = await RestAPI()!.get({ url: `/channels/${channel_id}/pins` });
        return (res.body ?? []).map(slimMessage);
    },
    getVoice({ guild_id }: any) {
        const vs = Stores.VoiceState();
        const states = guild_id ? (vs?.getVoiceStates?.(guild_id) ?? {}) : (vs?.getAllVoiceStates?.() ?? {});
        const flat: any[] = [];
        const push = (st: any) =>
            flat.push({
                user: userLabel(Stores.User()?.getUser(st.userId)),
                user_id: st.userId,
                channel: channelLabel(Stores.Channel()?.getChannel(st.channelId)),
                channel_id: st.channelId,
                muted: st.selfMute || st.mute,
                deafened: st.selfDeaf || st.deaf,
                streaming: st.selfStream,
            });
        for (const v of Object.values(states) as any[]) v?.userId ? push(v) : Object.values(v ?? {}).forEach(push);
        return flat;
    },
    async openDm({ user_id }: any) {
        const res = await RestAPI()!.post({ url: "/users/@me/channels", body: { recipients: [user_id] } });
        openChannel(res.body.id);
        return { channel_id: res.body.id };
    },
    async markRead({ channel_id }: any) {
        const c = Stores.Channel()?.getChannel(channel_id);
        const last = c?.lastMessageId;
        if (!last) return { ok: true };
        await RestAPI()!.post({ url: `/channels/${channel_id}/messages/${last}/ack`, body: { token: null } });
        return { ok: true };
    },
    currentUser() {
        const u = Stores.User()?.getCurrentUser();
        return { id: u?.id, username: u?.username, display_name: userLabel(u), status: Stores.Presence()?.getStatus?.(u?.id) };
    },
});

// ---------- watched channels: new messages are forwarded to the agent that asked for them
const watches = new Map<string, Set<string>>(); // channelId -> agent localIds
let watchSubscribed = false;
function onWatchedMessage(e: any) {
    const m = e.message;
    const agents = m && watches.get(e.channelId ?? m.channel_id);
    if (!agents?.size || m.author?.id === Stores.User()?.getCurrentUser()?.id) return;
    const c = Stores.Channel()?.getChannel(m.channel_id);
    for (const id of agents) N().discord.emit(id, { channel_id: m.channel_id, channel: channelLabel(c), message: slimMessage(m) });
}
export function watchChannel(localId: string, channelId: string, on: boolean) {
    const set = watches.get(channelId) ?? new Set();
    on ? set.add(localId) : set.delete(localId);
    if (set.size) watches.set(channelId, set);
    else watches.delete(channelId);
    if (!watchSubscribed && watches.size) {
        watchSubscribed = true;
        Dispatcher()?.subscribe("MESSAGE_CREATE", onWatchedMessage);
    }
    return [...watches.entries()].filter(([, s]) => s.has(localId)).map(([ch]) => ({ channel_id: ch, channel: channelLabel(Stores.Channel()?.getChannel(ch)) }));
}
Object.assign(discordTools, {
    watchChannel({ localId, channel_id, watch = true }: any) {
        return { watching: watchChannel(localId, channel_id, watch) };
    },
});

/** Stop watching everything (the plugin is stopping) */
export function disposeDiscordTools() {
    if (watchSubscribed) Dispatcher()?.unsubscribe("MESSAGE_CREATE", onWatchedMessage);
    watchSubscribed = false;
    watches.clear();
}

export function installDiscordTools() {
    N().discord.onCall(async (method: string, args: any) => {
        const fn = discordTools[method];
        if (!fn) throw new Error("Unknown Discord tool " + method);
        return fn(args ?? {});
    });
}

// ---------------- local "Only you can see this" messages (Discord's own ephemeral message; never sent anywhere)
const BotMessage = lazy("botMessage", m => typeof m?.pO === "function" && String(m.pO).includes("loggingName"));
const localMessages = new Map<string, any>();
function snowflake() {
    return ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();
}
const CLAUDE_AUTHOR = { id: "1", username: "Claude", global_name: "Claude", discriminator: "0", avatar: null, bot: false };
// A message that exists only in this client (never sent). By default it's from "Claude"; `author: 'me'` echoes the
// user's own prompt; `replyTo` makes it a reply to another local message, so the chat reads like a conversation.
export function localMessage(channelId: string, content: string, id = snowflake(), opts: { author?: "claude" | "me"; replyTo?: string; command?: string; prompt?: string } = {}) {
    const base = BotMessage()?.pO?.({ channelId, content, messageId: id, loggingName: "evi-claude" }) ?? {
        id,
        type: 0,
        content,
        channel_id: channelId,
        attachments: [],
        embeds: [],
        pinned: false,
        mentions: [],
        mention_channels: [],
        mention_roles: [],
        mention_everyone: false,
        timestamp: new Date().toISOString(),
        state: "SENT",
        tts: false,
    };
    const me = Stores.User()?.getCurrentUser?.();
    const author =
        opts.author === "me" && me
            ? { id: me.id, username: me.username, global_name: me.globalName ?? me.global_name, discriminator: me.discriminator ?? "0", avatar: me.avatar, bot: false }
            : CLAUDE_AUTHOR;
    const ref = opts.replyTo ? localMessages.get(opts.replyTo) : null;
    // a slash-command reply: Discord's own "<you> used /claude" header and "Only you can see this"
    const cmd = opts.command && me ? { id: snowflake(), type: 2, name: opts.command, user: me } : null;
    const msg = {
        ...base,
        author: cmd ? { ...CLAUDE_AUTHOR, bot: true } : author,
        flags: cmd ? 64 : 0,
        type: cmd ? 20 : ref ? 19 : 0,
        ...(ref ? { message_reference: { channel_id: channelId, message_id: ref.id }, referenced_message: ref } : {}),
        ...(cmd ? { interaction: cmd, interaction_metadata: { id: cmd.id, type: 2, name: opts.command, user: me, command_type: 1, authorizing_integration_owners: {} } } : {}),
    };
    localMessages.set(id, msg);
    Dispatcher()?.dispatch({ type: "MESSAGE_CREATE", channelId, message: msg, optimistic: false, isPushNotification: false });
    // Claude's own picture instead of a default avatar
    if (msg.author.id === CLAUDE_AUTHOR.id) {
        const rec = Stores.Message()?.getMessage(channelId, id);
        if (rec?.author) rec.author.getAvatarURL = () => CLAUDE_AVATAR;
    }
    return id;
}
const CLAUDE_AVATAR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#d97757"/><g transform="translate(24 24) scale(0.8)" fill="#fff">' +
            Array.from({ length: 8 }, (_, i) => `<rect x="45" y="${i % 2 ? 14 : 4}" width="10" height="${i % 2 ? 36 : 46}" rx="5" transform="rotate(${i * 45} 50 50)"/>`).join("") +
            "</g></svg>",
    );
// Discord replaces a chat's messages when it (re)loads history; put our local ones back
export function ensureLocalMessage(channelId: string, id: string) {
    const msg = localMessages.get(id);
    if (!msg || Stores.Message()?.getMessage(channelId, id)) return;
    const list = Stores.Message()?.getMessages(channelId);
    if (!list?.ready) return; // still loading
    Dispatcher()?.dispatch({ type: "MESSAGE_CREATE", channelId, message: msg, optimistic: false, isPushNotification: false });
    const rec = Stores.Message()?.getMessage(channelId, id);
    if (rec?.author && msg.author.id === CLAUDE_AUTHOR.id) rec.author.getAvatarURL = () => CLAUDE_AVATAR;
}
export function updateLocalMessage(channelId: string, id: string, content: string) {
    const prev = localMessages.get(id);
    if (!prev) return localMessage(channelId, content, id);
    const msg = { ...prev, content, edited_timestamp: null };
    localMessages.set(id, msg);
    Dispatcher()?.dispatch({ type: "MESSAGE_UPDATE", message: msg });
    return id;
}
