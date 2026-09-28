/**
 * Supporting Evi, in Account: your level and when the next one comes, what you get, and your name
 * in the credits (evi.rest/credits and Evi's Updates tab) if you want it there. Shown to supporters
 * with a linked Evi; evi.rest checks both again. The credits themselves are under Updates.
 */
import { isSupporterBadge, nextSupporterTier, supportedDays, SUPPORTER_TIERS } from "@shared/supporter";

import { Badges, levelName } from "../badges";
import { I18n, t } from "../i18n";
import { Native } from "../native";
import { React } from "../webpack/common";
import { Icon } from "./icons";
import { Section, Status, SwitchRow, Text, useStore } from "./components";
import { currentUserId } from "./StoreCommunity";

const CREDITS_URL = "https://evi.rest/credits";

const formatDate = (ms: number) => new Intl.DateTimeFormat(I18n.discordLocale, { dateStyle: "long" }).format(ms);

export function SupporterPerks() {
    useStore(Badges.subscribe, Badges.getVersion);
    useStore(I18n.subscribe, () => I18n.locale);
    const userId = currentUserId();
    const since = Badges.supporterSince(userId);
    const [credited, setCredited] = React.useState<boolean | null>();
    const [error, setError] = React.useState<string>();

    React.useEffect(() => {
        if (since === undefined) return;
        Native.credited?.().then(r => setCredited(r.ok ? r.value : null), () => setCredited(null));
    }, [since]);

    if (!userId || since === undefined) return null;

    const badge = Badges.allForUser(userId).find(b => isSupporterBadge(b.id));
    const days = supportedDays(since);
    const next = nextSupporterTier(since);
    const current = SUPPORTER_TIERS.filter(tier => tier.days <= days).at(-1) ?? SUPPORTER_TIERS[0];
    // How far between this level and the next
    const progress = next ? Math.min(1, (days - current.days) / (next.tier.days - current.days)) : 1;
    const perks = [t("perks.have.badge"), t("perks.have.exclusive"), t("perks.have.credits"), t("perks.have.thanks")];

    return (
        <Section title={t("perks.title")} description={t("perks.description")}>
            <article className="dl-card dl-perks" aria-labelledby="dl-perks-level">
                <div className="dl-card-body dl-perks-head">
                    {badge && <img className="dl-perks-badge" src={badge.icon} alt="" width={48} height={48} />}
                    <div className="dl-grow dl-row-text">
                        <Text tag="h3" variant="heading-md/semibold" color="text-strong" id="dl-perks-level">
                            {t("badge.supporterLevel", { level: levelName(current.badge) })}
                        </Text>
                        <Text variant="text-sm/normal" color="text-subtle">{t("badge.supportingSince", { date: formatDate(since) })}</Text>
                    </div>
                </div>
                <div className="dl-card-body dl-perks-progress">
                    <div className="dl-perks-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-labelledby="dl-perks-next">
                        <span style={{ inlineSize: `${progress * 100}%` }} />
                    </div>
                    <Text variant="text-xs/medium" color="text-muted" id="dl-perks-next">
                        {next
                            ? t("perks.nextLevel", { level: levelName(next.tier.badge), date: formatDate(next.at) })
                            : t("perks.topLevel")}
                    </Text>
                </div>
                <div className="dl-card-body">
                    <Text tag="h4" variant="text-sm/semibold" color="text-strong">{t("perks.haveTitle")}</Text>
                    <ul className="dl-perks-list">
                        {perks.map(perk => (
                            <li key={perk}>
                                <span className="dl-perks-check" aria-hidden="true"><Icon name="circleCheck" size={16} /></span>
                                <Text variant="text-sm/normal" color="text-default">{perk}</Text>
                            </li>
                        ))}
                    </ul>
                </div>
            </article>
            {credited !== undefined && credited !== null && (
                <SwitchRow
                    id="dl-perks-credits"
                    label={t("perks.credits")}
                    description={t("perks.creditsHint")}
                    checked={credited}
                    onChange={async on => {
                        setError(undefined);
                        setCredited(on);
                        const result = await Native.setCredited?.(on);
                        if (result && !result.ok) {
                            setCredited(!on);
                            setError(result.error);
                        }
                    }}
                />
            )}
            <span role="status">{error && <Status tone="danger">{error}</Status>}</span>
        </Section>
    );
}

interface Supporter {
    name: string;
    avatar: string | null;
    userId: string;
    level: string;
}

const avatarOf = (s: Supporter) => s.avatar
    ? `https://cdn.discordapp.com/avatars/${s.userId}/${s.avatar}.webp?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(s.userId) >> 22n) % 6n)}.png`;

/** How many faces the Updates tab shows before "and N more" */
const SHOWN = 24;

/** The credits, under Updates: supporters who chose to be named, with their faces and levels */
export function Credits() {
    const [supporters, setSupporters] = React.useState<Supporter[]>();
    useStore(I18n.subscribe, () => I18n.locale);
    React.useEffect(() => {
        Native.credits?.().then(r => r.ok && setSupporters(r.value.supporters), () => { });
    }, []);
    if (!supporters?.length) return null;
    const shown = supporters.slice(0, SHOWN);
    const more = supporters.length - shown.length;
    return (
        <Section title={t("perks.creditsTitle")} description={t("perks.creditsDescription")}>
            <article className="dl-card dl-credits" aria-label={t("perks.creditsTitle")}>
                <div className="dl-card-body">
                    <ul className="dl-credits-list">
                        {shown.map(s => (
                            <li key={s.userId} className="dl-credits-person">
                                <img src={avatarOf(s)} alt="" width={32} height={32} loading="lazy" />
                                <span className="dl-row-text">
                                    <Text variant="text-sm/semibold" color="text-strong">{s.name}</Text>
                                    {isSupporterBadge(s.level) && <Text variant="text-xs/normal" color="text-muted">{levelName(s.level)}</Text>}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="dl-credits-foot">
                        <span className="dl-credits-heart" aria-hidden="true"><Icon name="heart" size={16} /></span>
                        <Text variant="text-sm/normal" color="text-subtle">
                            {more > 0 ? t("perks.creditsMore", { count: more }) : t("perks.creditsThanks")}
                        </Text>
                        <a className="dl-store-source" href={CREDITS_URL} target="_blank" rel="noreferrer noopener">
                            <Icon name="link" size={16} />{t("perks.creditsAll")}
                        </a>
                    </div>
                </div>
            </article>
        </Section>
    );
}
