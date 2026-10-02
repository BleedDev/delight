/**
 * "View Permissions" in the user, role, channel and server menus. Opens a dialog with:
 * - a member: every permission in the channel (and server-wide), and which role or overwrite decided it
 * - a role: its server-level permissions
 * - a channel: each overwrite's allowed and denied permissions
 * - a server: your own permissions, then each role's
 * The math lives in perms.ts; this file reads Discord's stores and draws the dialog.
 */
import { definePlugin, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer } from "@evi/api";
import type { CSSProperties, ReactNode } from "react";

import {
    ADMINISTRATOR, computePermissions, OverwriteInput, PermissionEntry, PERMISSIONS, permissionsIn, RoleInput, sortRoles, Source,
    summarizeOverwrites, toBits,
} from "./perms";
import { t } from "./strings";

/** t() for keys built at runtime (permission and category names) */
const td = (key: string, vars?: Record<string, string | number>) => (t as (key: string, vars?: Record<string, string | number>) => string)(key, vars);

/** A permission's name in Discord's language */
const permName = (p: { key: string; }) => p.key.startsWith("BIT_") ? t("perm.unknown", { bit: p.key.slice(4) }) : td(`perm.${p.key}`);

// ---- Discord's stores ---------------------------------------------------------------------------

const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

interface Role extends RoleInput {
    name: string;
    color?: string;
}

/** Discord's role objects for a server, unsorted */
function rawRoles(guildId: string): any[] {
    const guild = store("GuildStore")?.getGuild?.(guildId);
    const roleStore = store("GuildRoleStore");
    let raw: any;
    try {
        raw = roleStore?.getRolesSnapshot?.(guildId) ?? roleStore?.getRoles?.(guildId) ?? roleStore?.getSortedRoles?.(guildId);
    } catch { /* older Discord keeps roles on the guild */ }
    raw ??= guild?.roles;
    return !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
}

const toRole = (r: any, guildId: string): Role => ({
    id: r.id,
    name: r.id === guildId ? "@everyone" : r.name ?? r.id,
    permissions: toBits(r.permissions),
    position: r.position ?? 0,
    color: r.colorString ?? undefined,
});

function guildRoles(guildId: string): Role[] {
    return sortRoles(rawRoles(guildId).filter(r => r?.id).map(r => toRole(r, guildId)), guildId);
}

/** One role, without converting and sorting all of them: the role menu checks this on every Developer Mode menu */
function guildRole(guildId: string, roleId: string): Role | undefined {
    const raw = rawRoles(guildId).find(r => r?.id === roleId);
    return raw ? toRole(raw, guildId) : undefined;
}

const getGuild = (id: string | undefined) => id ? store("GuildStore")?.getGuild?.(id) : undefined;
const getChannel = (id: string | undefined) => id ? store("ChannelStore")?.getChannel?.(id) : undefined;
const memberRoleIds = (guildId: string, userId: string): string[] | undefined => store("GuildMemberStore")?.getMember?.(guildId, userId)?.roles;
const ownId = (): string | undefined => store("UserStore")?.getCurrentUser?.()?.id;

function userName(guildId: string | undefined, userId: string) {
    const nick = guildId ? store("GuildMemberStore")?.getMember?.(guildId, userId)?.nick : undefined;
    const user = store("UserStore")?.getUser?.(userId);
    return nick || user?.globalName || user?.username || userId;
}

const attempt = <T,>(fn: () => T): T | undefined => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

/** Threads take their parent's overwrites */
function overwritesOf(channel: any): OverwriteInput[] {
    const source = channel?.isThread?.() ? getChannel(channel.parent_id) ?? channel : channel;
    const raw = source?.permissionOverwrites ?? {};
    return (Object.values(raw) as any[]).map(o => ({ id: o.id, type: o.type, allow: toBits(o.allow), deny: toBits(o.deny) }));
}

const channelLabel = (channel: any) => channel?.name ? `#${channel.name}` : t("this.channel");

// ---- Categories, in the order Discord's role editor uses ----------------------------------------

const CATEGORIES: [string, string[]][] = [
    ["General", ["VIEW_CHANNEL", "MANAGE_CHANNELS", "MANAGE_ROLES", "CREATE_GUILD_EXPRESSIONS", "MANAGE_GUILD_EXPRESSIONS", "VIEW_AUDIT_LOG", "VIEW_GUILD_INSIGHTS", "VIEW_CREATOR_MONETIZATION_ANALYTICS", "MANAGE_WEBHOOKS", "MANAGE_GUILD"]],
    ["Membership", ["CREATE_INSTANT_INVITE", "CHANGE_NICKNAME", "MANAGE_NICKNAMES", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"]],
    ["Text", ["SEND_MESSAGES", "SEND_MESSAGES_IN_THREADS", "CREATE_PUBLIC_THREADS", "CREATE_PRIVATE_THREADS", "EMBED_LINKS", "ATTACH_FILES", "ADD_REACTIONS", "USE_EXTERNAL_EMOJIS", "USE_EXTERNAL_STICKERS", "MENTION_EVERYONE", "MANAGE_MESSAGES", "PIN_MESSAGES", "BYPASS_SLOWMODE", "MANAGE_THREADS", "READ_MESSAGE_HISTORY", "SEND_TTS_MESSAGES", "SEND_VOICE_MESSAGES", "SEND_POLLS"]],
    ["Voice", ["CONNECT", "SPEAK", "STREAM", "USE_SOUNDBOARD", "USE_EXTERNAL_SOUNDS", "USE_VAD", "PRIORITY_SPEAKER", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "REQUEST_TO_SPEAK"]],
    ["Apps", ["USE_APPLICATION_COMMANDS", "USE_EMBEDDED_ACTIVITIES", "USE_EXTERNAL_APPS"]],
    ["Events", ["CREATE_EVENTS", "MANAGE_EVENTS"]],
    ["Advanced", ["ADMINISTRATOR"]],
];

const ORDER = new Map(CATEGORIES.flatMap(([category, keys]) => keys.map((key, i) => [key, { category, i }] as const)));

function byCategory<T extends { key: string; }>(items: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>([...CATEGORIES.map(([c]) => [c, []] as [string, T[]]), ["Other", []]]);
    for (const item of items) groups.get(ORDER.get(item.key)?.category ?? "Other")!.push(item);
    for (const list of groups.values()) list.sort((a, b) => (ORDER.get(a.key)?.i ?? 99) - (ORDER.get(b.key)?.i ?? 99));
    return [...groups].filter(([, list]) => list.length);
}

// ---- The dialog ---------------------------------------------------------------------------------

type State = "allow" | "deny" | "none";

/** What decided a permission, drawn as a pill next to it */
interface Chip {
    label: string;
    /** The full sentence, on hover */
    title: string;
    color?: string;
    overwrite?: boolean;
    tone?: "quiet" | "deny";
}

interface Item {
    key: string;
    name: string;
    state: State;
    chip?: Chip;
}

interface Section {
    key: string;
    label: string;
    color?: string;
    /** The nav heading this section sits under */
    group?: string;
    /** An overwrite only lists what it allows or denies */
    overwrite?: boolean;
    notice?: string;
    items: Item[];
    empty?: string;
}

interface Subject {
    title: string;
    subtitle: string;
    image?: string;
    glyph: string;
    color?: string;
}

type Filter = "all" | "allow" | "off";

let closeOpen: CloseLayer | undefined;

function openDialog(subject: Subject, sections: Section[]) {
    closeOpen?.();
    const close = openLayer(close => <Dialog subject={subject} sections={sections} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

function Dialog({ subject, sections, onClose }: { subject: Subject; sections: Section[]; onClose(): void; }) {
    const [selected, setSelected] = React.useState(sections[0]?.key);
    const [filter, setFilter] = React.useState<Filter>("all");
    const [query, setQuery] = React.useState("");
    const ref = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLInputElement>(null);
    const current = sections.find(s => s.key === selected) ?? sections[0];

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        (searchRef.current ?? ref.current)?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            // The first Escape clears the search, the next one closes
            const search = searchRef.current;
            if (search && document.activeElement === search && search.value) setQuery("");
            else onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    const items = current?.items ?? [];
    const granted = items.filter(i => i.state === "allow").length;
    const q = query.trim().toLowerCase();
    const visible = items.filter(i => (filter === "all" || (filter === "allow") === (i.state === "allow")) && (!q || i.name.toLowerCase().includes(q)));
    const names = current?.overwrite ? ["allowed", "denied"] as const : ["granted", "notGranted"] as const;
    const filters: [Filter, string, number][] = [["all", t("filter.all"), items.length], ["allow", td(`filter.${names[0]}`), granted], ["off", td(`filter.${names[1]}`), items.length - granted]];
    const emptyText = () => {
        const which = filter === "all" ? undefined : filter === "allow" ? names[0] : names[1];
        if (q) return td(`empty.match.${which ?? "all"}`, { query: query.trim() });
        return td(`empty.none.${which ?? "granted"}`);
    };

    return (
        <div className="evi-pv-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="evi-pv-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-pv-title" aria-describedby="evi-pv-subtitle" tabIndex={-1} ref={ref}>
                <header className="evi-pv-head">
                    <SubjectIcon subject={subject} />
                    <div className="evi-pv-titles">
                        <h2 id="evi-pv-title">{subject.title}</h2>
                        <p id="evi-pv-subtitle">{subject.subtitle}</p>
                    </div>
                    <button className="evi-pv-close" aria-label={t("ui.close")} onClick={onClose}>
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                </header>
                <div className="evi-pv-main">
                    {sections.length > 1 && (
                        <nav className="evi-pv-nav" aria-label={t("ui.sections")}>
                            {sections.map((s, i) => (
                                <React.Fragment key={s.key}>
                                    {s.group && s.group !== sections[i - 1]?.group && <h3 className="evi-pv-nav-group">{s.group}</h3>}
                                    <button className="evi-pv-tab" aria-current={s.key === current?.key} onClick={() => setSelected(s.key)}>
                                        <span className="evi-pv-dot" style={s.color ? { background: s.color } : undefined} data-empty={!s.color || undefined} />
                                        <span className="evi-pv-tab-label" title={s.label}>{s.label}</span>
                                        <TabCount section={s} />
                                    </button>
                                </React.Fragment>
                            ))}
                        </nav>
                    )}
                    <div className="evi-pv-body">
                        {items.length > 0 && (
                            <div className="evi-pv-toolbar">
                                <div className="evi-pv-seg" role="group" aria-label={t("ui.show")}>
                                    {filters.map(([key, label, count]) => (
                                        <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                                            {label}
                                            <span className="evi-pv-seg-count">{count}</span>
                                        </button>
                                    ))}
                                </div>
                                <label className="evi-pv-search">
                                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                    <span className="evi-pv-sr">{t("ui.searchLabel")}</span>
                                    <input ref={searchRef} type="search" inputMode="search" placeholder={t("ui.search")} autoComplete="off" spellCheck={false} value={query} onChange={e => setQuery(e.target.value)} />
                                </label>
                            </div>
                        )}
                        <div className="evi-pv-scroll" key={current?.key}>
                            {current?.notice && <Notice>{current.notice}</Notice>}
                            {!items.length
                                ? <p className="evi-pv-empty">{current?.empty ?? t("ui.nothing")}</p>
                                : !visible.length
                                ? (
                                    <div className="evi-pv-empty">
                                        <p>{emptyText()}</p>
                                        <button className="evi-pv-link" onClick={() => { setFilter("all"); setQuery(""); }}>{t("ui.showAll")}</button>
                                    </div>
                                )
                                : byCategory(visible).map(([category, list]) => {
                                    const all = items.filter(i => (ORDER.get(i.key)?.category ?? "Other") === category);
                                    return (
                                        <section className="evi-pv-group" key={category} aria-label={td(`category.${category}`)}>
                                            <h3 className="evi-pv-heading">
                                                <span>{td(`category.${category}`)}</span>
                                                <span className="evi-pv-heading-count">{current.overwrite ? list.length : t("count.of", { granted: all.filter(i => i.state === "allow").length, total: all.length })}</span>
                                            </h3>
                                            <ul className="evi-pv-list">{list.map(i => <Row key={i.key} item={i} />)}</ul>
                                        </section>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SubjectIcon({ subject }: { subject: Subject; }) {
    const [broken, setBroken] = React.useState(false);
    if (subject.image && !broken) return <img className="evi-pv-avatar" src={subject.image} alt="" onError={() => setBroken(true)} />;
    return (
        <span className="evi-pv-avatar" data-glyph="" style={subject.color ? { "--evi-pv-tint": subject.color } as CSSProperties : undefined} aria-hidden="true">
            {subject.glyph}
        </span>
    );
}

function TabCount({ section }: { section: Section; }) {
    if (!section.items.length) return null;
    const allowed = section.items.filter(i => i.state === "allow").length;
    if (!section.overwrite) return <span className="evi-pv-tab-count" title={t("count.granted", { count: allowed })}>{allowed}</span>;
    const denied = section.items.length - allowed;
    return (
        <span className="evi-pv-tab-count" title={t("count.allowedDenied", { allowed, denied })}>
            {allowed > 0 && <span data-state="allow">+{allowed}</span>}
            {denied > 0 && <span data-state="deny">−{denied}</span>}
        </span>
    );
}

const Notice = ({ children }: { children: ReactNode; }) => (
    <p className="evi-pv-notice">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <span>{children}</span>
    </p>
);

const MARKS: Record<State, [() => string, string]> = {
    allow: [() => t("filter.granted"), "M6.5 12.5l3.5 3.5 7.5-8"],
    deny: [() => t("filter.denied"), "M8 8l8 8M16 8l-8 8"],
    none: [() => t("filter.notGranted"), "M8 12h8"],
};

function Row({ item }: { item: Item; }) {
    const [labelOf, path] = MARKS[item.state];
    const label = labelOf();
    const { chip } = item;
    return (
        <li className="evi-pv-row" data-state={item.state}>
            <span className="evi-pv-mark" role="img" aria-label={label}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="evi-pv-name">{item.name}</span>
            {chip && (
                <span className="evi-pv-chip" data-tone={chip.tone} title={chip.title}>
                    {chip.tone !== "quiet" && <span className="evi-pv-dot" style={chip.color ? { background: chip.color } : undefined} data-empty={!chip.color || undefined} />}
                    <span className="evi-pv-chip-label">{chip.label}</span>
                    {chip.overwrite && <span className="evi-pv-chip-kind">{t("chip.overwrite")}</span>}
                </span>
            )}
        </li>
    );
}

// ---- What each menu shows -----------------------------------------------------------------------

function sourceChip(source: Source, granted: boolean, guildId: string, roles: Map<string, Role>): Chip | undefined {
    const name = (id: string) => roles.get(id)?.name ?? t("chip.deletedRole");
    switch (source.kind) {
        case "owner": return { label: t("chip.owner"), title: t("chip.owner") };
        case "administrator": return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: t("chip.admin", { role: name(source.roleId) }) };
        case "none": return undefined;
        case "role": {
            if (source.roleId === guildId) return { label: "@everyone", tone: "quiet", title: t("chip.everyone") };
            return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: t("chip.role", { role: name(source.roleId) }) };
        }
        case "overwrite": {
            const tone = granted ? undefined : "deny";
            if (source.target === "everyone") return { label: "@everyone", overwrite: true, tone, title: granted ? t("chip.everyone.allowed") : t("chip.everyone.denied") };
            if (source.target === "role") return { label: name(source.id), color: roles.get(source.id)?.color, overwrite: true, tone, title: t(granted ? "chip.roleOverwrite.allowed" : "chip.roleOverwrite.denied", { role: name(source.id) }) };
            return { label: t("chip.member"), overwrite: true, tone, title: granted ? t("chip.memberOverwrite.allowed") : t("chip.memberOverwrite.denied") };
        }
    }
}

function entrySection(entries: PermissionEntry[], guildId: string, roles: Role[]): Pick<Section, "items" | "notice"> {
    const byId = new Map(roles.map(r => [r.id, r]));
    // The owner and administrators have everything for one reason: say it once instead of on every row
    const first = entries[0]?.source;
    if (first?.kind === "owner" || first?.kind === "administrator") {
        return {
            notice: first.kind === "owner"
                ? t("notice.owner")
                : byId.get(first.roleId) ? t("notice.admin", { role: byId.get(first.roleId)!.name }) : t("notice.adminDeleted"),
            items: entries.map(e => ({ key: e.key, name: permName(e), state: "allow" })),
        };
    }
    return {
        items: entries.map(e => ({
            key: e.key,
            name: permName(e),
            state: e.granted ? "allow" : e.source.kind === "overwrite" ? "deny" : "none",
            chip: sourceChip(e.source, e.granted, guildId, byId),
        })),
    };
}

function roleSection(role: Role): Pick<Section, "items" | "notice"> {
    const bits = toBits(role.permissions);
    return {
        notice: bits & ADMINISTRATOR ? t("notice.roleAdmin") : undefined,
        items: [
            ...PERMISSIONS.map(p => ({ key: p.key, name: permName(p), state: bits & p.flag ? "allow" as const : "none" as const })),
            ...permissionsIn(bits).filter(p => p.key.startsWith("BIT_")).map(p => ({ key: p.key, name: permName(p), state: "allow" as const })),
        ],
    };
}

function memberSections(guildId: string, userId: string, channel: any): Section[] | undefined {
    const guild = getGuild(guildId);
    const roleIds = memberRoleIds(guildId, userId);
    if (!guild || !roleIds) return;
    const roles = guildRoles(guildId);
    const compute = (overwrites?: OverwriteInput[]) => computePermissions({ guildId, ownerId: guild.ownerId, userId, memberRoleIds: roleIds, roles, overwrites }).entries;
    const sections: Section[] = [];
    if (channel) sections.push({ key: "channel", label: t("section.inChannel", { channel: channelLabel(channel) }), ...entrySection(compute(overwritesOf(channel)), guildId, roles) });
    sections.push({ key: "server", label: t("section.serverWide"), ...entrySection(compute(), guildId, roles) });
    return sections;
}

function viewMember(guildId: string, userId: string, channel: any) {
    const sections = memberSections(guildId, userId, channel);
    if (!sections) return false;
    const guildName = getGuild(guildId)?.name ?? t("this.server");
    const name = userName(guildId, userId);
    openDialog({
        title: name,
        subtitle: channel ? t("subtitle.memberChannel", { channel: channelLabel(channel), guild: guildName }) : t("subtitle.member", { guild: guildName }),
        image: attempt(() => store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId, 80)),
        glyph: [...name][0]?.toUpperCase() ?? "?",
    }, sections);
    return true;
}

function viewRole(guildId: string, role: Role) {
    openDialog({
        title: role.name,
        subtitle: t("subtitle.role", { guild: getGuild(guildId)?.name ?? t("this.server") }),
        glyph: "@",
        color: role.color,
    }, [{ key: role.id, label: role.name, color: role.color, ...roleSection(role) }]);
}

function computeYou(guildId: string, userId: string, channel: any) {
    const guild = getGuild(guildId);
    return computePermissions({
        guildId, ownerId: guild?.ownerId, userId, memberRoleIds: memberRoleIds(guildId, userId) ?? [], roles: guildRoles(guildId), overwrites: channel ? overwritesOf(channel) : undefined,
    }).entries;
}

function viewChannel(channel: any) {
    const guildId: string = channel.guild_id;
    const roles = guildRoles(guildId);
    const byId = new Map(roles.map(r => [r.id, r]));
    const summaries = summarizeOverwrites(guildId, overwritesOf(channel), roles);
    const sections: Section[] = [];
    const me = ownId();
    if (me && memberRoleIds(guildId, me)) sections.push({ key: "you", label: t("section.you"), ...entrySection(computeYou(guildId, me, channel), guildId, roles) });
    for (const s of summaries) {
        const label = s.target === "member" ? userName(guildId, s.id) : byId.get(s.id)?.name ?? (s.target === "everyone" ? "@everyone" : t("chip.deletedRole"));
        sections.push({
            key: s.id,
            label,
            color: s.target === "role" ? byId.get(s.id)?.color : undefined,
            group: t("section.overwrites"),
            overwrite: true,
            notice: t(s.target === "member" ? "notice.overwrite.member" : "notice.overwrite.role"),
            items: [
                ...s.allowed.map(p => ({ key: p.key, name: permName(p), state: "allow" as const })),
                ...s.denied.map(p => ({ key: p.key, name: permName(p), state: "deny" as const })),
            ],
            empty: t("empty.overwrite"),
        });
    }
    if (!summaries.length) sections.push({ key: "none", label: t("section.overwrites"), items: [], empty: t("empty.noOverwrites") });
    const count = t("overwrites.count", { count: summaries.length });
    openDialog({
        title: channelLabel(channel),
        subtitle: t("subtitle.channel", { overwrites: count, guild: getGuild(guildId)?.name ?? t("this.server") }),
        glyph: "#",
    }, sections);
}

function viewGuild(guild: any) {
    const roles = guildRoles(guild.id);
    const sections: Section[] = [];
    const me = ownId();
    if (me && memberRoleIds(guild.id, me)) sections.push({ key: "you", label: t("section.you"), ...entrySection(computeYou(guild.id, me, undefined), guild.id, roles) });
    for (const role of roles) sections.push({ key: role.id, label: role.name, color: role.color, group: t("section.roles"), ...roleSection(role) });
    openDialog({
        title: guild.name,
        subtitle: t("subtitle.guild", { roles: t("roles.count", { count: roles.length }) }),
        image: attempt(() => guild.getIconURL?.(80, false)),
        glyph: [...(guild.name ?? "?")][0]?.toUpperCase() ?? "?",
    }, sections);
}

// ---- Styles -------------------------------------------------------------------------------------

const css = `
.evi-pv-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-pv-modal {
  --evi-pv-muted: var(--text-muted, #949ba4);
  --evi-pv-strong: var(--text-strong, var(--header-primary, #f2f3f5));
  --evi-pv-line: var(--border-subtle, rgba(255,255,255,.07));
  --evi-pv-hover: var(--background-modifier-hover, rgba(255,255,255,.05));
  --evi-pv-selected: var(--background-modifier-selected, rgba(255,255,255,.1));
  --evi-pv-well: color-mix(in srgb, currentColor 4%, transparent);
  --evi-pv-positive: var(--status-positive, #23a55a);
  --evi-pv-danger: var(--status-danger, #f23f43);
  --evi-pv-brand: var(--brand-500, #5865f2);
  --evi-pv-focus: var(--focus-primary, #00a8fc);
  width: min(760px, calc(100vw - 32px)); height: min(680px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--evi-pv-line);
  box-shadow: var(--shadow-high, 0 12px 40px rgba(0,0,0,.45)); outline: none; font-family: var(--font-primary); font-size: 14px; line-height: 20px;
}
.evi-pv-modal ::-webkit-scrollbar { width: 12px; height: 12px; }
.evi-pv-modal ::-webkit-scrollbar-track { background: transparent; }
.evi-pv-modal ::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-thumb, rgba(255,255,255,.14)); border: 4px solid transparent; border-radius: 8px; background-clip: padding-box; min-height: 40px; }
.evi-pv-modal ::-webkit-scrollbar-corner { background: transparent; }

.evi-pv-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 16px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; outline: 1px solid rgba(255,255,255,.08); outline-offset: -1px; }
.evi-pv-avatar[data-glyph] { --evi-pv-tint: var(--evi-pv-muted); display: grid; place-items: center; border-radius: 12px; outline: none; font-size: 18px; font-weight: 700;
  color: var(--evi-pv-tint); background: color-mix(in srgb, var(--evi-pv-tint) 16%, transparent); }
.evi-pv-titles { flex: 1; min-width: 0; }
.evi-pv-titles h2 { margin: 0; font-size: 18px; line-height: 22px; font-weight: 700; color: var(--evi-pv-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-titles p { margin: 2px 0 0; font-size: 13px; line-height: 18px; color: var(--evi-pv-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-close { flex: none; align-self: flex-start; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; transition: scale 200ms ease-out; }

.evi-pv-main { flex: 1; min-height: 0; display: flex; }
.evi-pv-nav { flex: none; width: 208px; overflow-y: auto; padding: 8px; border-inline-end: 1px solid var(--evi-pv-line); display: flex; flex-direction: column; gap: 2px; }
.evi-pv-nav-group { margin: 12px 10px 4px; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-tab { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 6px 10px; border: 0; border-radius: 8px; background: none;
  color: var(--interactive-normal, #b5bac1); font: inherit; text-align: start; cursor: pointer; }
.evi-pv-tab-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-tab[aria-current="true"] { background: var(--evi-pv-selected); color: var(--interactive-active, #fff); }
.evi-pv-tab-count { flex: none; display: flex; gap: 4px; font-size: 12px; color: var(--evi-pv-muted); font-variant-numeric: tabular-nums; }
.evi-pv-tab-count [data-state="allow"] { color: var(--evi-pv-positive); }
.evi-pv-tab-count [data-state="deny"] { color: var(--evi-pv-danger); }
.evi-pv-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
.evi-pv-dot[data-empty] { background: var(--evi-pv-muted); opacity: .5; }

.evi-pv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-pv-toolbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--evi-pv-well); }
.evi-pv-seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 10px; border: 0; border-radius: 7px; background: none;
  color: var(--evi-pv-muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-seg button[aria-pressed="true"] { background: var(--evi-pv-selected); color: var(--evi-pv-strong); }
.evi-pv-seg-count { font-size: 12px; opacity: .7; font-variant-numeric: tabular-nums; }
.evi-pv-search { flex: 1 1 140px; max-width: 240px; margin-inline-start: auto; display: flex; align-items: center; gap: 8px; height: 32px; padding-inline: 10px;
  border-radius: 8px; border: 1px solid var(--evi-pv-line); background: var(--input-background, var(--evi-pv-well)); color: var(--evi-pv-muted); cursor: text; }
.evi-pv-search:focus-within { border-color: var(--evi-pv-focus); }
.evi-pv-search input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--text-default, var(--text-normal, #dbdee1)); font: inherit; }
.evi-pv-search input::placeholder { color: var(--evi-pv-muted); }

.evi-pv-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 20px; }
.evi-pv-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; padding-inline: 4px; font-size: 12px; line-height: 16px;
  font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-heading-count { font-weight: 500; text-transform: none; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.evi-pv-list { list-style: none; margin: 0; padding: 4px; border-radius: 12px; background: var(--evi-pv-well); }
.evi-pv-row { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 6px 8px; border-radius: 8px; }
.evi-pv-name { flex: 1; min-width: 0; overflow-wrap: break-word; }
.evi-pv-row[data-state="none"] .evi-pv-name { color: var(--evi-pv-muted); }
.evi-pv-mark { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
.evi-pv-row[data-state="allow"] .evi-pv-mark { color: var(--evi-pv-positive); background: color-mix(in srgb, var(--evi-pv-positive) 16%, transparent); }
.evi-pv-row[data-state="deny"] .evi-pv-mark { color: var(--evi-pv-danger); background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-row[data-state="none"] .evi-pv-mark { color: var(--evi-pv-muted); background: var(--evi-pv-well); }

.evi-pv-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 45%; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 16px;
  white-space: nowrap; color: var(--text-default, var(--text-normal, #dbdee1)); background: var(--evi-pv-selected); }
.evi-pv-chip .evi-pv-dot { width: 8px; height: 8px; }
.evi-pv-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.evi-pv-chip-kind { flex: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="quiet"] { padding-inline: 0; background: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="deny"] { background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-chip[data-tone="deny"] .evi-pv-chip-kind { color: var(--evi-pv-danger); }

.evi-pv-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 18px; text-wrap: pretty;
  background: color-mix(in srgb, var(--evi-pv-brand) 12%, transparent); }
.evi-pv-notice svg { flex: none; margin-block-start: 1px; color: var(--evi-pv-brand); }
.evi-pv-empty { margin: auto; max-width: 320px; padding: 24px 0; text-align: center; color: var(--evi-pv-muted); text-wrap: pretty; }
.evi-pv-empty p { margin: 0 0 12px; }
.evi-pv-link { padding: 6px 12px; border: 0; border-radius: 8px; background: var(--evi-pv-selected); color: var(--evi-pv-strong); font: inherit; font-weight: 500; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.evi-pv-close:active, .evi-pv-seg button:active, .evi-pv-link:active { scale: .96; }
:is(.evi-pv-close, .evi-pv-seg button, .evi-pv-link):focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: 2px; }
.evi-pv-tab:focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: -2px; }
@media (hover: hover) {
  .evi-pv-close:hover { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-tab:hover:not([aria-current="true"]) { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-seg button:hover:not([aria-pressed="true"]) { color: var(--interactive-hover, #dbdee1); }
  .evi-pv-row:hover { background: var(--evi-pv-hover); }
}
`;

// ---- Menus --------------------------------------------------------------------------------------

const item = (id: string, action: () => void) => (
    <Menu.Group key={`${id}-group`}>
        <Menu.Item id={id} label={t("menu.view")} action={action} />
    </Menu.Group>
);

export default definePlugin({
    start(ctx) {
        ctx.addStyle(css);
        ctx.onDispose(() => closeOpen?.({ instant: true }));

        const fail = () => ctx.toast(t("toast.fail"), { type: "failure" });

        ctx.contextMenu("user-context", (children, props) => {
            const userId: string | undefined = props.user?.id;
            const guildId: string | undefined = props.guildId ?? props.guild?.id ?? props.channel?.guild_id;
            if (!userId || !guildId || !memberRoleIds(guildId, userId)) return;
            // The channel the menu was opened in, or the one being viewed, if it's in this server
            let channel = props.channel?.guild_id === guildId ? props.channel : undefined;
            if (!channel) {
                const viewed = getChannel(store("SelectedChannelStore")?.getChannelId?.());
                if (viewed?.guild_id === guildId) channel = viewed;
            }
            children.push(item("evi-pv-user", () => {
                try {
                    if (!viewMember(guildId, userId, channel)) fail();
                } catch (err) {
                    ctx.logger.error("Viewing member permissions failed", err);
                    fail();
                }
            }));
        });

        // Right-clicking a role pill (Developer Mode) or a role in server settings
        ctx.contextMenu(["dev-context", "guild-settings-role-context"], (children, props) => {
            const roleId: string | undefined = props.role?.id ?? props.id;
            const guildId: string | undefined = props.guild?.id ?? props.guildId ?? store("SelectedGuildStore")?.getGuildId?.();
            if (!roleId || !guildId) return;
            const role = guildRole(guildId, roleId);
            if (!role) return;
            children.push(item("evi-pv-role", () => {
                try {
                    viewRole(guildId, role);
                } catch (err) {
                    ctx.logger.error("Viewing role permissions failed", err);
                    fail();
                }
            }));
        });

        ctx.contextMenu(["channel-context", "thread-context"], (children, props) => {
            const channel = props.channel;
            if (!channel?.guild_id) return;
            children.push(item("evi-pv-channel", () => {
                try {
                    viewChannel(channel);
                } catch (err) {
                    ctx.logger.error("Viewing channel permissions failed", err);
                    fail();
                }
            }));
        });

        ctx.contextMenu("guild-context", (children, props) => {
            const guild = props.guild;
            if (!guild?.id) return;
            children.push(item("evi-pv-guild", () => {
                try {
                    viewGuild(getGuild(guild.id) ?? guild);
                } catch (err) {
                    ctx.logger.error("Viewing server permissions failed", err);
                    fail();
                }
            }));
        });
    },

    stop() {
        closeOpen?.({ instant: true });
    },
});
