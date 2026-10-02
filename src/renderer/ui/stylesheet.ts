import { createStyle } from "../styles";
import css from "./styles.css" with { type: "text" };

let styled = false;
/**
 * Our stylesheet, shared by the floating panel, the tabs embedded in Discord settings and the
 * components plugins get through @evi/api. Its own module, so the API doesn't load the panel.
 */
export function ensureStyles() {
    if (styled) return;
    styled = true;
    createStyle(css, "evi-ui");
}
