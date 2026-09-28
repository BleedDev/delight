/**
 * Timezones: remember where someone lives and show their local time.
 *
 * - Setting it: "Set Timezone" in the user right-click menu opens a searchable picker of every
 *   IANA zone Intl knows (cities, "EST", "UTC+3"...). "Remove Timezone" forgets it.
 * - Storage: a userId → zone map under a non-schema key of this plugin's settings, on this device.
 * - Chat: added to the message header's badge decorations (the slot Platform Indicators also
 *   appends to), so it sits after the name: "3:42 PM", hover for the day, offset and difference.
 * - Profiles: a clock badge through Discord's profile badges hook; its hands show their time.
 * - Member list: an export hook on Discord's generic list row appends to its `decorators` prop,
 *   after whatever source patches (Platform Indicators) put there, so nothing clashes.
 * - One shared ticker, aligned to the minute, re-renders every visible time at once.
 * The time math lives in tz.ts.
 */
import { Components, definePlugin, filters, getStore, Menu, openLayer, React } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";

import {
    allZones, cityOf, describeTime, formatOffset, formatTime, isValidZone, localeUses12h, localZone, offsetMinutes, parseZones, regionOf,
    sameZone, searchZones, tooltipText, withoutZone, withZone,
} from "./tz";
import type { Describe, HourCycle, Tr, ZoneMap } from "./tz";
import { t } from "./strings";

/** Discord's `(displayProfile, hideLegacyUsername?) => ProfileBadge[]` */
const profileBadgesFilter = filters.byCode("getBadges()??[]", "hidePersonalInformation");
/** The username in a message header, with decorations = { [SYSTEM_TAG]: …, [BADGES]: [...] } */
const usernameFilter = filters.componentByCode("withMentionPrefix", "hideSystemTag", "decorations");
/** Discord's list row (member list): { avatar, name, subText, decorators, nameplate, wrapContent… } */
const listRowFilter = filters.componentByCode("wrapContent:", "decorators:", "avatarClassName:");
/** Discord's MessageHeaderDecorations.BADGES */
const BADGES = 1;

const STORAGE_KEY = "zones";

const settings = {
    timeFormat: {
        type: "select",
        get label() { return t("settings.timeFormat"); },
        get description() { return t("settings.timeFormat.description"); },
        default: "auto",
        options: [
            { get label() { return t("settings.timeFormat.auto"); }, value: "auto" },
            { get label() { return t("settings.timeFormat.12h"); }, value: "12h" },
            { get label() { return t("settings.timeFormat.24h"); }, value: "24h" },
        ],
    },
    chatTime: {
        type: "select",
        get label() { return t("settings.chatTime"); },
        get description() { return t("settings.chatTime.description"); },
        default: "current",
        options: [
            { get label() { return t("settings.chatTime.current"); }, value: "current" },
            { get label() { return t("settings.chatTime.sent"); }, value: "sent" },
        ],
    },
    showInChat: {
        type: "boolean",
        get label() { return t("settings.inChat"); },
        get description() { return t("settings.inChat.description"); },
        default: true,
    },
    showOnProfiles: {
        type: "boolean",
        get label() { return t("settings.onProfiles"); },
        get description() { return t("settings.onProfiles.description"); },
        default: true,
    },
    showInMemberList: {
        type: "boolean",
        get label() { return t("settings.inMemberList"); },
        get description() { return t("settings.inMemberList.description"); },
        default: false,
    },
} as const;

let context: PluginContext<typeof settings> | undefined;
let zones: ZoneMap = {};
let yourZone = "UTC";
let zoneList: string[] | undefined;
const getZoneList = () => zoneList ??= allZones();

const store = (name: string): any => {
    try {
        return getStore(name);
    } catch {
        return undefined;
    }
};

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => context?.settings as unknown as Storage | undefined;

// ---- Shared re-render signal --------------------------------------------------------------------

/** Bumped on zone and settings changes and once a minute, on the minute */
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
    version++;
    listeners.forEach(l => l());
};

function useVersion() {
    return React.useSyncExternalStore(
        cb => {
            listeners.add(cb);
            return () => void listeners.delete(cb);
        },
        () => version,
    );
}

function commit(next: ZoneMap) {
    if (next === zones) return;
    zones = next;
    storage()?.set(STORAGE_KEY, zones);
    bump();
}

// ---- Formatting with the user's settings --------------------------------------------------------

const locale = () => document.documentElement.lang || navigator.language || "en-US";

function cycle(): HourCycle {
    const f = context?.settings.get("timeFormat") ?? "auto";
    return f === "12h" || f === "24h" ? f : localeUses12h(locale()) ? "12h" : "24h";
}

/** The time difference words in Discord's language */
const tr: Tr = (key, vars) => t(key, vars);

const describeAt = (zone: string, at: Date): Describe => describeTime(at, zone, yourZone, { cycle: cycle(), locale: locale() }, tr);

function zoneOf(userId: string | undefined) {
    return userId ? zones[userId] : undefined;
}

function toDate(timestamp: unknown): Date | undefined {
    const ms = typeof timestamp === "number" ? timestamp
        : typeof timestamp === "string" ? Date.parse(timestamp)
            : typeof (timestamp as any)?.valueOf === "function" ? Number((timestamp as any).valueOf()) : NaN;
    return Number.isFinite(ms) ? new Date(ms) : undefined;
}

function userName(userId: string) {
    const user = store("UserStore")?.getUser?.(userId);
    return user?.globalName || user?.username || t("user.them");
}

// ---- Inline times -------------------------------------------------------------------------------

function WithTooltip({ text, children }: { text: string; children: React.ReactElement; }) {
    const Tooltip = Components.Tooltip;
    return Tooltip ? <Tooltip text={text}>{children}</Tooltip> : React.cloneElement(children, { title: text } as any);
}

function ChatTime({ userId, sentAt }: { userId: string; sentAt?: Date; }) {
    useVersion();
    const zone = zoneOf(userId);
    if (!zone || !context?.settings.get("showInChat")) return null;
    const sent = context.settings.get("chatTime") === "sent" && sentAt;
    const d = describeAt(zone, sent ? sentAt : new Date());
    const text = sent ? tooltipText(d, t("tooltip.sent")) : tooltipText(d, t("tooltip.theirs"));
    return (
        <WithTooltip text={text}>
            <span className="evi-tz-time" data-where="chat" aria-label={text}>{d.short}</span>
        </WithTooltip>
    );
}

function MemberTime({ userId }: { userId: string; }) {
    useVersion();
    const zone = zoneOf(userId);
    if (!zone || !context?.settings.get("showInMemberList")) return null;
    const d = describeAt(zone, new Date());
    const text = tooltipText(d, t("tooltip.theirs"));
    return (
        <WithTooltip text={text}>
            <span className="evi-tz-time" data-where="members" aria-label={text}>{d.short}</span>
        </WithTooltip>
    );
}

/** A small clock face showing their time, for the profile badge */
function clockIcon(zone: string, at: Date) {
    const minutes = (at.getTime() / 60_000 + offsetMinutes(zone, at)) % 1440;
    const m = minutes % 60;
    const h = (minutes / 60) % 12;
    const hand = (deg: number, len: number) => {
        const r = (deg - 90) * Math.PI / 180;
        return `${(12 + Math.cos(r) * len).toFixed(2)} ${(12 + Math.sin(r) * len).toFixed(2)}`;
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#949ba4" stroke-width="2" stroke-linecap="round">`
        + `<circle cx="12" cy="12" r="9.5"/><path d="M12 12L${hand(h * 30, 4.5)}"/><path d="M12 12L${hand(m * 6, 6.5)}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ---- The picker ---------------------------------------------------------------------------------

let closeOpen: CloseLayer | undefined;

function openPicker(userId: string) {
    closeOpen?.();
    const close = openLayer(close => <Picker userId={userId} onClose={() => close()} />, {
        onClosed: () => void (closeOpen === close && (closeOpen = undefined)),
    });
    closeOpen = close;
}

function Picker({ userId, onClose }: { userId: string; onClose(): void; }) {
    useVersion();
    const [query, setQuery] = React.useState("");
    const [active, setActive] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const now = new Date();
    const current = zoneOf(userId);
    const name = userName(userId);
    const results = React.useMemo(() => searchZones(query, getZoneList(), new Date()), [query, version]);
    const listId = "evi-tz-results";

    React.useEffect(() => setActive(0), [query]);

    React.useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);

    React.useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const choose = (zone: string) => {
        commit(withZone(zones, userId, zone));
        context?.toast(t("toast.set", { name, city: cityOf(zone) }), { type: "success" });
        onClose();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!results.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive(a => (a + step + results.length) % results.length);
        } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
        }
    };

    const cyc = cycle();
    const loc = locale();

    return (
        <div className="evi-tz-scrim evi-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="evi-tz-modal evi-modal" role="dialog" aria-modal="true" aria-labelledby="evi-tz-title">
                <header className="evi-tz-head">
                    <div>
                        <h2 id="evi-tz-title">{t("picker.title", { name })}</h2>
                        <p>
                            {current
                                ? <>{t("picker.now", { city: cityOf(current), time: formatTime(now, current, { cycle: cyc, locale: loc, weekday: true }) })}</>
                                : <>{t("picker.hint")}</>}
                        </p>
                    </div>
                    <button type="button" className="evi-tz-close" aria-label={t("picker.close")} onClick={onClose}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                </header>
                <div className="evi-tz-search">
                    <input
                        ref={inputRef}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={results[active] ? `evi-tz-opt-${active}` : undefined}
                        aria-label={t("picker.search")}
                        placeholder={t("picker.placeholder")}
                        spellCheck={false}
                        autoComplete="off"
                        value={query}
                        onChange={e => setQuery(e.currentTarget.value)}
                        onKeyDown={onKeyDown}
                    />
                </div>
                <div className="evi-tz-list" id={listId} role="listbox" aria-label={t("picker.list")} ref={listRef}>
                    {results.length === 0 && <p className="evi-tz-empty" role="status">{t("picker.empty", { query })}</p>}
                    {results.map((zone, i) => {
                        const offset = offsetMinutes(zone, now);
                        const region = regionOf(zone);
                        return (
                            <div
                                key={zone}
                                id={`evi-tz-opt-${i}`}
                                data-index={i}
                                role="option"
                                aria-selected={i === active}
                                data-current={current && sameZone(zone, current) ? "true" : undefined}
                                className="evi-tz-option"
                                onMouseMove={() => i !== active && setActive(i)}
                                onClick={() => choose(zone)}
                            >
                                <span className="evi-tz-place">
                                    <span className="evi-tz-city">{cityOf(zone)}{sameZone(zone, yourZone) && <span className="evi-tz-tag">{t("picker.you")}</span>}</span>
                                    {region && <span className="evi-tz-region">{region}</span>}
                                </span>
                                <span className="evi-tz-offset">{formatOffset(offset)}</span>
                                <span className="evi-tz-clock">{formatTime(now, zone, { cycle: cyc, locale: loc })}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ---- Settings panel -----------------------------------------------------------------------------

function SavedPanel() {
    useVersion();
    const entries = Object.entries(zones);
    const now = new Date();
    return (
        <div className="evi-tz-saved">
            <div className="dl-label">{t("saved.people")}</div>
            {entries.length === 0
                ? <p className="dl-hint">{t("saved.nobody")}</p>
                : (
                    <ul>
                        {entries.map(([id, zone]) => (
                            <li key={id}>
                                <span className="evi-tz-saved-name">{userName(id)}</span>
                                <span className="evi-tz-saved-zone">{cityOf(zone)} · {formatTime(now, zone, { cycle: cycle(), locale: locale() })}</span>
                                <button type="button" className="evi-tz-link" onClick={() => openPicker(id)}>{t("saved.change")}</button>
                                <button type="button" className="evi-tz-link" data-danger="true" onClick={() => commit(withoutZone(zones, id))}>{t("saved.remove")}</button>
                            </li>
                        ))}
                    </ul>
                )}
        </div>
    );
}

const css = `
.evi-tz-time { display: inline-block; margin-inline-start: 6px; color: var(--text-muted, #949ba4); font-size: 12px; font-weight: 500; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: baseline; cursor: default; }
.evi-tz-time[data-where="members"] { margin-inline-start: 4px; font-size: 11px; }
.evi-tz-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-tz-modal { width: min(520px, calc(100vw - 32px)); height: min(600px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--border-subtle, transparent);
  box-shadow: var(--shadow-high, 0 8px 24px rgba(0,0,0,.4)); font-family: var(--font-primary); }
.evi-tz-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 12px; }
.evi-tz-head h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 600; color: var(--text-strong, var(--header-primary, #f2f3f5)); overflow-wrap: anywhere; }
.evi-tz-head p { margin: 4px 0 0; font-size: 14px; line-height: 18px; color: var(--text-muted, #949ba4); }
.evi-tz-close { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.evi-tz-close:hover { background: var(--background-modifier-hover, rgba(255,255,255,.06)); color: var(--interactive-hover, #dbdee1); }
.evi-tz-close:focus-visible, .evi-tz-link:focus-visible { outline: 2px solid var(--focus-primary, #00a8fc); outline-offset: 2px; }
.evi-tz-search { padding: 0 20px 12px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.06)); }
.evi-tz-search input { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--input-border, rgba(255,255,255,.08));
  background: var(--input-background, var(--background-tertiary, #1e1f22)); color: inherit; font: inherit; font-size: 16px; outline: none; }
.evi-tz-search input:focus { border-color: var(--focus-primary, #00a8fc); }
.evi-tz-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.evi-tz-option { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.evi-tz-option[aria-selected="true"] { background: var(--background-modifier-hover, rgba(255,255,255,.06)); }
.evi-tz-option[data-current="true"] { box-shadow: inset 3px 0 0 var(--brand-500, #5865f2); }
.evi-tz-place { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-tz-city { font-size: 15px; line-height: 20px; color: var(--text-strong, var(--header-primary, #f2f3f5)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-tz-region { font-size: 12px; line-height: 16px; color: var(--text-muted, #949ba4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-tz-tag { margin-inline-start: 6px; padding: 1px 5px; border-radius: 4px; font-size: 11px; font-weight: 600; vertical-align: 1px; background: var(--background-modifier-accent, rgba(255,255,255,.08)); color: var(--text-muted, #949ba4); }
.evi-tz-offset { flex: none; width: 72px; text-align: end; font-size: 13px; color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; }
.evi-tz-clock { flex: none; width: 72px; text-align: end; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-tz-empty { margin: 16px 12px; font-size: 14px; color: var(--text-muted, #949ba4); }
.evi-tz-saved ul { list-style: none; margin: 8px 0 0; padding: 0; }
.evi-tz-saved li { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04)); }
.evi-tz-saved-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-tz-saved-zone { color: var(--text-muted, #949ba4); font-variant-numeric: tabular-nums; white-space: nowrap; }
.evi-tz-link { border: 0; padding: 0; background: none; font: inherit; font-size: 14px; color: var(--text-link, #00a8fc); cursor: pointer; }
.evi-tz-link[data-danger="true"] { color: var(--text-danger, #f23f43); }
.evi-tz-link:hover { text-decoration: underline; }
`;

export default definePlugin({
    settings,

    start(ctx) {
        context = ctx;
        yourZone = localZone();
        zones = parseZones(storage()?.get(STORAGE_KEY));
        ctx.addStyle(css);
        ctx.settings.onChange(bump);
        ctx.onDispose(() => closeOpen?.({ instant: true }));

        // One ticker for every visible time, on the minute
        ctx.setTimeout(() => {
            bump();
            ctx.setInterval(bump, 60_000);
        }, 60_000 - (Date.now() % 60_000) + 50);

        ctx.contextMenu("user-context", (children, props) => {
            const userId: string | undefined = props.user?.id;
            if (!userId) return;
            const zone = zoneOf(userId);
            children.push(
                <Menu.Group key="evi-tz-group">
                    <Menu.Item
                        id="evi-tz-set"
                        label={t("menu.set")}
                        subtext={zone ? `${cityOf(zone)} · ${formatTime(new Date(), zone, { cycle: cycle(), locale: locale() })}` : undefined}
                        action={() => openPicker(userId)}
                    />
                    {zone && <Menu.Item id="evi-tz-remove" label={t("menu.remove")} color="danger" action={() => commit(withoutZone(zones, userId))} />}
                </Menu.Group>,
            );
        });

        // Discord's badge row compares the list by identity: the same array goes back until their
        // badges or the time shown change
        const badgeLists = new Map<string, { result: unknown; description: string; iconSrc: string; list: unknown[]; }>();
        ctx.hookExport("after", profileBadgesFilter, ({ args, result }) => {
            if (!ctx.settings.get("showOnProfiles")) return;
            const userId: string | undefined = args[0]?.userId;
            const zone = zoneOf(userId);
            if (!userId || !zone || !isValidZone(zone)) return;
            const now = new Date();
            const description = tooltipText(describeAt(zone, now), t("tooltip.theirs"));
            const iconSrc = clockIcon(zone, now);
            const cached = badgeLists.get(userId);
            if (cached && cached.result === result && cached.description === description && cached.iconSrc === iconSrc) return cached.list;
            const list = [...(Array.isArray(result) ? result : []), { id: "evi-timezone", description, iconSrc }];
            if (badgeLists.size >= 100) badgeLists.clear();
            badgeLists.set(userId, { result, description, iconSrc, list });
            return list;
        });

        ctx.hookExport("before", usernameFilter, ({ args }) => {
            const props = args[0];
            const author = props?.message?.author;
            // Only the message's own header: replies pass decorations without a BADGES slot. Added for
            // everyone (it renders nothing without a zone), so a zone set later shows up right away.
            if (!author?.id || !props.decorations || !(BADGES in props.decorations)) return;
            const existing = props.decorations[BADGES];
            const ours = <ChatTime key="evi-tz" userId={author.id} sentAt={toDate(props.message.timestamp)} />;
            args[0] = { ...props, decorations: { ...props.decorations, [BADGES]: [...(Array.isArray(existing) ? existing : existing != null ? [existing] : []), ours] } };
        });

        ctx.hookExport("before", listRowFilter, ({ args }) => {
            const props = args[0];
            const userId: string | undefined = props?.avatar?.props?.user?.id;
            if (!userId) return;
            args[0] = { ...props, decorators: <>{props.decorators}<MemberTime userId={userId} /></> };
        });
    },

    stop() {
        closeOpen?.({ instant: true });
        context = undefined;
        bump();
    },

    settingsPanel: () => <SavedPanel />,
});
