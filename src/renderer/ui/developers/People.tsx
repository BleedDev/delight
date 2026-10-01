/**
 * People with an evi.rest account: search by name or Discord id, with their badges and supporter
 * level, latest login first.
 */
import { parsePeople, Person } from "@shared/devAdmin";

import { t, timeAgo } from "../../i18n";
import { React } from "../../webpack/common";
import { Badge, EmptyState, List, SearchField, Section, Text } from "../components";
import { LoadError } from "./common";
import { useAdmin } from "./data";

const avatar = (p: Person) => p.user.avatar
    ? `https://cdn.discordapp.com/avatars/${p.user.id}/${p.user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${/^\d+$/.test(p.user.id) ? Number((BigInt(p.user.id) >> 22n) % 6n) : 0}.png`;

/** Badge ids read better with spaces: "early-supporter" → "early supporter" */
const badgeName = (id: string) => id.replace(/[-_]+/g, " ");

export function PeopleTab() {
    const [query, setQuery] = React.useState("");
    const [debounced, setDebounced] = React.useState("");
    React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);
    const people = useAdmin(`/admin/people${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`, parsePeople);

    return (
        <div className="dl-dev">
            <Section
                title={t("dev.people")}
                description={t("dev.peopleHint")}
                id="dl-dev-people"
                action={<div className="dl-dev-search"><SearchField id="dl-dev-people-search" label={t("dev.searchPeople")} placeholder={t("dev.searchPeople")} value={query} onChange={setQuery} /></div>}
            >
                {people.error && <LoadError error={people.error} onRetry={people.reload} />}
                {people.value && !people.value.length && <EmptyState icon="search" title={t("dev.noMatch")}>{t("dev.noPeopleBody")}</EmptyState>}
                {!!people.value?.length && (
                    <List>
                        {people.value.map(p => (
                            <li key={p.user.id} className="dl-row">
                                <div className="dl-row-head">
                                    <img className="dl-dev-avatar" src={avatar(p)} alt="" width={32} height={32} loading="lazy" />
                                    <div className="dl-row-text">
                                        <div className="dl-row-title">
                                            <Text tag="h3" variant="text-md/semibold" color="text-strong">{p.user.name}</Text>
                                            {p.user.username && <Text tag="span" variant="text-sm/normal" color="text-muted">@{p.user.username}</Text>}
                                            {p.badges.map(b => <Badge key={b}>{badgeName(b)}</Badge>)}
                                        </div>
                                        <Text tag="p" variant="text-xs/normal" color="text-muted">{p.lastLogin ? t("dev.lastLogin", { time: timeAgo(p.lastLogin) }) : p.user.id}</Text>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </List>
                )}
            </Section>
        </div>
    );
}
