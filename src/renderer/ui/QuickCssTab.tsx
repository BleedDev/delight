import { t } from "../i18n";
import { Native } from "../native";
import { Settings } from "../settings";
import { QuickCss } from "../styles";
import { React } from "../webpack/common";
import { Button, CodeArea, Section, SwitchRow, useStore } from "./components";
import { SafeModeHint } from "./SafeModeNotice";

export function QuickCssTab() {
    const { quickCss: applied } = useStore(Settings.subscribe, () => Settings.data);
    const [css, setCss] = React.useState(QuickCss.source);

    const onInput = (next: string) => {
        setCss(next);
        QuickCss.save(next);
    };

    return (
        <div className="dl-tab">
            <SafeModeHint what="quickCss" />
            <SwitchRow
                id="dl-quickcss-toggle"
                label={t("quickCss.apply")}
                description={t("quickCss.applyHint")}
                checked={applied}
                onChange={v => {
                    Settings.update(d => void (d.quickCss = v));
                    QuickCss.apply();
                }}
            />
            <Section
                id="dl-quickcss-editor"
                title={t("quickCss.editor")}
                description={t("quickCss.editorHint")}
                action={<Button icon="pencil" onClick={() => Native.openPath("quickCss")}>{t("quickCss.openInEditor")}</Button>}
            >
                <CodeArea id="dl-quickcss" label="Quick CSS" placeholder={t("quickCss.placeholder")} value={css} onChange={onInput} />
            </Section>
        </div>
    );
}
