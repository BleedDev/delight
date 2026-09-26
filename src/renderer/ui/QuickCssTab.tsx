import { Native } from "../native";
import { Settings } from "../settings";
import { QuickCss } from "../styles";
import { React } from "../webpack/common";
import { Button, Icon, Switch, useStore } from "./components";

export function QuickCssTab() {
    const { quickCss: applied } = useStore(Settings.subscribe, () => Settings.data);
    const [css, setCss] = React.useState(QuickCss.source);

    const onInput = (next: string) => {
        setCss(next);
        QuickCss.save(next);
    };

    return (
        <div className="dl-stack" style={{ gap: 16 }}>
            <div className="dl-field-row">
                <div className="dl-field-text">
                    <div className="dl-label" id="dl-quickcss-toggle">Apply Quick CSS</div>
                    <p className="dl-hint">Styles apply as you type. Saving the file in another editor updates Discord too.</p>
                </div>
                <Button onClick={() => Native.openPath("quickCss")}><Icon name="folder" />Open in editor</Button>
                <Switch
                    checked={applied}
                    labelledBy="dl-quickcss-toggle"
                    onChange={v => {
                        Settings.update(d => void (d.quickCss = v));
                        QuickCss.apply();
                    }}
                />
            </div>
            <div className="dl-field">
                <label className="dl-label" htmlFor="dl-quickcss">Quick CSS</label>
                <textarea
                    id="dl-quickcss"
                    className="dl-textarea dl-code-editor"
                    spellCheck={false}
                    placeholder={"/* Anything here is applied on top of Discord */"}
                    value={css}
                    onChange={e => onInput(e.currentTarget.value)}
                />
            </div>
        </div>
    );
}
