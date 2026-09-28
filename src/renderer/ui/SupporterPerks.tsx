/**
 * What supporting Evi gets you, in Account: your supporter badge in a colour of your own, and your
 * name in the credits (evi.rest/credits and Evi's Updates tab) if you want it there. Shown to
 * supporters with a linked Evi; evi.rest checks both again.
 */
import { isBadgeColor } from "@shared/badges";

import { Badges } from "../badges";
import { t } from "../i18n";
import { Native } from "../native";
import { React } from "../webpack/common";
import { Button, Section, Status, SwitchRow, Text, useStore } from "./components";
import { currentUserId } from "./StoreCommunity";

/** A few that look good on Discord's dark and light themes, then any colour you like */
const SWATCHES = ["#f47fff", "#5865f2", "#00a8fc", "#23a55a", "#f0b232", "#ed4245", "#ffffff"];

export function SupporterPerks() {
    useStore(Badges.subscribe, Badges.getVersion);
    const userId = currentUserId();
    const since = Badges.supporterSince(userId);
    const color = Badges.prefsFor(userId).color;
    const [credited, setCredited] = React.useState<boolean | null>();
    const [error, setError] = React.useState<string>();
    const [custom, setCustom] = React.useState(color ?? "#f47fff");

    React.useEffect(() => {
        if (since === undefined) return;
        Native.credited?.().then(r => setCredited(r.ok ? r.value : null), () => setCredited(null));
    }, [since]);
    React.useEffect(() => void (color && setCustom(color)), [color]);

    if (!userId || since === undefined) return null;

    const pick = async (next: string | null) => {
        setError(undefined);
        const result = await Badges.setPrefs(userId, { color: next });
        if (!result.ok) setError(result.error);
    };

    return (
        <Section title={t("perks.title")} description={t("perks.description")}>
            <div className="dl-stack">
                <div className="dl-field">
                    <Text variant="text-md/medium" color="text-strong" id="dl-perks-color-label">{t("perks.color")}</Text>
                    <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("perks.colorHint")}</Text>
                    <div className="dl-swatches" role="radiogroup" aria-labelledby="dl-perks-color-label">
                        <button type="button" role="radio" aria-checked={!color} className="dl-swatch dl-swatch-default" aria-label={t("perks.levelColor")} onClick={() => pick(null)} />
                        {SWATCHES.map(s => (
                            <button key={s} type="button" role="radio" aria-checked={color === s} className="dl-swatch" style={{ background: s }} aria-label={s} onClick={() => pick(s)} />
                        ))}
                        <label className="dl-swatch-custom">
                            <span className="dl-sr-only">{t("perks.customColor")}</span>
                            <input type="color" value={custom} onChange={e => setCustom(e.currentTarget.value)} />
                        </label>
                        <Button disabled={!isBadgeColor(custom) || custom === color} onClick={() => pick(custom)}>{t("perks.useColor")}</Button>
                    </div>
                </div>
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
            </div>
        </Section>
    );
}

/** The credits, under Updates: supporters who chose to be named */
export function Credits() {
    const [names, setNames] = React.useState<string[]>();
    React.useEffect(() => {
        Native.credits?.().then(r => r.ok && setNames(r.value.supporters.map(s => s.name)), () => { });
    }, []);
    if (!names?.length) return null;
    return (
        <Section title={t("perks.creditsTitle")} description={t("perks.creditsDescription")}>
            <Text tag="p" variant="text-sm/normal" color="text-default" className="dl-credits">{names.join(" · ")}</Text>
        </Section>
    );
}
