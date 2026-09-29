import { describe, expect, test } from "bun:test";

import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";
import { panelPatch } from "../src/renderer/toolkit/panel";

// Verbatim from Discord's web build (test-results/chunks), trimmed to the user panel's button row
const USER_PANEL = 'function lT(e){let{selfDeaf:t,selfMute:n,awaitingRemote:a,serverMute:s,serverDeaf:r,suppress:o,shouldShowSpeakingWhileMutedTooltip:d,webBuildOverride:c,handleMouseEnterMute:u,handleMouseLeaveMute:m,handleToggleSelfDeaf:h,handleToggleSelfMute:f,handleInputAudioContextMenu:p,handleOutputAudioContextMenu:g,handleOpenAccountSettings:A,handleOpenSettingsContextMenu:x,dismissibleContents:v,occluded:E,nameplate:C,accountContainerRef:_,deviceChangedTooltipType:I,dismissTooltips:b,speaking:S}=e,j=(0,en.K)(C);function T(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return(0,i.jsx)(lv,{webBuildOverride:c,onClick:A,onContextMenu:x,dismissibleContents:[...v.settings,...e],iconForeground:null!=C?lE.t4:void 0,nameplate:C})}return(0,i.jsxs)("div",{className:lE.Uo,style:j,children:[(0,i.jsx)(ls,{accountContainerRef:_,selfMute:n,serverMute:s,suppress:o,awaitingRemote:a,onMouseEnter:u,onMouseLeave:m,onClick:f,onContextMenu:p,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowSpeakingWhileMutedTooltip:d,shouldShowInputDeviceChangedTooltip:!d&&"input"===I,dismissTooltips:b,speaking:S}),(0,i.jsx)(i5,{selfDeaf:t,serverDeaf:r,onClick:h,onContextMenu:g,awaitingRemote:a,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowOutputDeviceChangedTooltip:"output"===I,dismissTooltips:b}),T()]})}';
/** The panel's class component also passes the panel's props, but has no deafen button */
const PANEL_RENDER = 'children:[(0,i.jsx)(el.A,{nameplate:t,hovered:r,placement:ei.u.ACCOUNT}),this.renderNameZone(e),(0,i.jsx)(lT,{...this.props,...this.state})]';

describe("Evi's spot in the user panel", () => {
    const replace = panelPatch.replace as { match: RegExp; with: string; };
    const re = canonicalizeMatch(replace.match) as RegExp;

    test("one spot, right after deafen and before the settings gear", () => {
        expect(matchesFind(USER_PANEL, panelPatch.find)).toBe(true);
        expect(USER_PANEL.match(new RegExp(re.source, "g"))?.length).toBe(1);
        const out = USER_PANEL.replace(re, replace.with);
        expect(out).toContain("dismissTooltips:b}),window.Evi?.panelSlot?.(arguments[0]),T()]})}");
        expect(() => new Function(out)).not.toThrow();
    });

    test("leaves the class component's render alone", () => {
        expect(re.test(PANEL_RENDER)).toBe(false);
    });
});
