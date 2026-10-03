/**
 * People with an evi.rest account: search by name or Discord id, a page at a time, latest login
 * first, with the badges they show in Discord. Clicking someone opens their page (PersonDialog):
 * badges, supporter time, their plugins, and bans. "Manage badges" edits the badges themselves.
 */
import { AdminBadge, parseAdminBadges, parsePeople, Person } from "@shared/devAdmin";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { Badge, Button, discordAvatarUrl, EmptyState, Icon, Pagination, SearchField, Section, Text, Tooltip } from "../components";
import { BadgesDialog } from "./BadgesDialog";
import { LoadError } from "./common";
import { useAdmin } from "./data";
import { PersonDialog } from "./PersonDialog";

const PAGE_SIZE = 25;

/** The badges someone shows in Discord, as their icons, with each one's name on hover */
export function BadgeIcons({ ids, catalogue, size = 18 }: { ids: string[]; catalogue: Map<string, AdminBadge>; size?: number; }) {
    const shown = ids.map(id => catalogue.get(id)).filter((b): b is AdminBadge => !!b?.icon);
    if (!shown.length) return null;
    return (
        <span className="dl-dev-badges" role="list" aria-label={t("dev.people.badges")}>
            {shown.map(b => (
                <Tooltip key={b.id} text={b.name}>
                    {/* An icon that doesn't load leaves no broken image behind */}
                    <img role="listitem" className="dl-dev-badge" src={b.icon} alt={b.name} width={size} height={size} loading="lazy" draggable={false} onError={e => void (e.currentTarget.hidden = true)} />
                </Tooltip>
            ))}
        </span>
    );
}

/** Every badge evi.rest has, by id; loaded once per People tab, again after the badges change */
export function useBadgeCatalogue() {
    const badges = useAdmin("/admin/badges", parseAdminBadges);
    const map = React.useMemo(() => new Map((badges.value ?? []).map(b => [b.id, b])), [badges.value]);
    return { list: badges.value ?? [], map, reload: badges.reload, error: badges.error };
}

function PersonRow({ person, catalogue, onOpen }: { person: Person; catalogue: Map<string, AdminBadge>; onOpen(): void; }) {
    const { user } = person;
    return (
        <li className="dl-row dl-dev-person-row">
            <button type="button" className="dl-dev-person" onClick={onOpen} aria-label={t("dev.people.open", { name: user.name })}>
                <img className="dl-dev-avatar" src={discordAvatarUrl(user.id, user.avatar, 64, "auto")} alt="" width={36} height={36} loading="lazy" />
                <span className="dl-dev-person-text">
                    <span className="dl-dev-person-names">
                        <Text tag="span" variant="text-md/semibold" color="text-strong" className="dl-dev-name">{user.name}</Text>
                        {user.username && user.username !== user.name && <Text tag="span" variant="text-sm/normal" color="text-muted" className="dl-dev-name">@{user.username}</Text>}
                        <BadgeIcons ids={person.badges} catalogue={catalogue} />
                        {person.admin && <Badge>{t("dev.people.admin")}</Badge>}
                        {person.banned && <Badge tone="warning">{t("dev.people.banned")}</Badge>}
                    </span>
                    <Text tag="span" variant="text-xs/normal" color="text-muted">
                        {[
                            person.lastLogin ? t("dev.lastLogin", { time: timeAgo(person.lastLogin) }) : undefined,
                            person.installs ? t("dev.people.evis", { count: person.installs }) : t("dev.people.noEvis"),
                        ].filter(Boolean).join(" · ")}
                    </Text>
                </span>
                <Icon name="chevronRight" size={16} className="dl-dev-person-chevron" />
            </button>
        </li>
    );
}

export function PeopleTab() {
    const [query, setQuery] = React.useState("");
    const [debounced, setDebounced] = React.useState("");
    const [page, setPage] = React.useState(0);
    const [open, setOpen] = React.useState<Person>();
    const [managing, setManaging] = React.useState(false);
    const listRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebounced(query.trim());
            setPage(0);
        }, 250);
        return () => clearTimeout(timer);
    }, [query]);

    const people = useAdmin(`/admin/people?page=${page + 1}&size=${PAGE_SIZE}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`, parsePeople);
    const badges = useBadgeCatalogue();
    const value = people.value;
    const pages = value ? Math.ceil(value.total / PAGE_SIZE) : 0;

    const goTo = (p: number) => {
        setPage(p);
        listRef.current?.scrollIntoView({ block: "nearest" });
    };

    return (
        <div className="dl-dev" ref={listRef}>
            <Section
                title={t("dev.people")}
                description={value ? t("dev.people.total", { count: value.total }) : t("dev.peopleHint")}
                id="dl-dev-people"
                action={(
                    <div className="dl-dev-people-actions">
                        <div className="dl-dev-search"><SearchField id="dl-dev-people-search" label={t("dev.searchPeople")} placeholder={t("dev.searchPeople")} value={query} onChange={setQuery} /></div>
                        <Button icon="star" onClick={() => setManaging(true)}>{t("dev.people.manageBadges")}</Button>
                    </div>
                )}
            >
                {people.error && <LoadError error={people.error} onRetry={people.reload} />}
                {!value && !people.error && <EmptyState icon="clock" title={t("dev.loading")} />}
                {value && !value.people.length && <EmptyState icon="search" title={t("dev.noMatch")}>{t("dev.noPeopleBody")}</EmptyState>}
                {!!value?.people.length && (
                    <ul className="dl-list dl-dev-people" aria-busy={people.loading}>
                        {value.people.map(p => <PersonRow key={p.user.id} person={p} catalogue={badges.map} onOpen={() => setOpen(p)} />)}
                    </ul>
                )}
                <Pagination page={page} count={pages} onChange={goTo} label={t("dev.people.pages")} />
            </Section>
            {open && (
                <PersonDialog
                    person={open}
                    catalogue={badges}
                    onChanged={people.reload}
                    onClose={() => setOpen(undefined)}
                />
            )}
            {managing && (
                <BadgesDialog
                    catalogue={badges}
                    onChanged={() => {
                        badges.reload();
                        people.reload();
                    }}
                    onClose={() => setManaging(false)}
                />
            )}
        </div>
    );
}
