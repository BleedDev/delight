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
            <SafeModeHint what="Quick CSS edits" />
            <SwitchRow
                id="dl-quickcss-toggle"
                label="Apply Quick CSS"
                description="Styles apply as you type. Saving the file in another editor updates Discord too."
                checked={applied}
                onChange={v => {
                    Settings.update(d => void (d.quickCss = v));
                    QuickCss.apply();
                }}
            />
            <Section
                id="dl-quickcss-editor"
                title="Editor"
                description="Anything here goes on top of Discord and your themes."
                action={<Button icon="pencil" onClick={() => Native.openPath("quickCss")}>Open in your editor</Button>}
            >
                <CodeArea id="dl-quickcss" label="Quick CSS" placeholder="/* Anything here is applied on top of Discord */" value={css} onChange={onInput} />
            </Section>
        </div>
    );
}
