import { describe, expect, test } from "bun:test";

import type { Replacement } from "../src/renderer/patching/source";
import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";
import { buttonLabel, PATCHES, readShowCurrentGame, toggledMessage } from "../plugins/game-activity-toggle/toggle";

// Verbatim from Discord's web build (test-results/chunks), trimmed to the patched spots
const SOURCES = {
    setting: 'f("textAndImages","dmSpamFilter",e=>e?.value??N.uH.NON_FRIENDS,e=>l.ZQ.create({value:e}));let eL=f("textAndImages","dmSpamFilterV2",e=>e??s.he.DEFAULT_UNSET,e=>e),ey=f("status","showCurrentGame",e=>e?.value??!0,e=>l._t.create({value:e}));f("privacy","recentGamesEnabled",e=>e?.value??!0,e=>l._t.create({value:e}));let eD=f("privacy","profileVisibility",e=>null==e||e===s.KP.UNSET?s.KP.FRIENDS_AND_ALL_GUILDS:e,e=>e);',
    userPanel: 'function lT(e){let{selfDeaf:t,selfMute:n,awaitingRemote:a,serverMute:s,serverDeaf:r,suppress:o,shouldShowSpeakingWhileMutedTooltip:d,webBuildOverride:c,handleMouseEnterMute:u,handleMouseLeaveMute:m,handleToggleSelfDeaf:h,handleToggleSelfMute:f,handleInputAudioContextMenu:p,handleOutputAudioContextMenu:g,handleOpenAccountSettings:A,handleOpenSettingsContextMenu:x,dismissibleContents:v,occluded:E,nameplate:C,accountContainerRef:_,deviceChangedTooltipType:I,dismissTooltips:b,speaking:S}=e,j=(0,en.K)(C);function T(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return(0,i.jsx)(lv,{webBuildOverride:c,onClick:A,onContextMenu:x,dismissibleContents:[...v.settings,...e],iconForeground:null!=C?lE.t4:void 0,nameplate:C})}return(0,i.jsxs)("div",{className:lE.Uo,style:j,children:[(0,i.jsx)(ls,{accountContainerRef:_,selfMute:n,serverMute:s,suppress:o,awaitingRemote:a,onMouseEnter:u,onMouseLeave:m,onClick:f,onContextMenu:p,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowSpeakingWhileMutedTooltip:d,shouldShowInputDeviceChangedTooltip:!d&&"input"===I,dismissTooltips:b,speaking:S}),(0,i.jsx)(i5,{selfDeaf:t,serverDeaf:r,onClick:h,onContextMenu:g,awaitingRemote:a,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowOutputDeviceChangedTooltip:"output"===I,dismissTooltips:b}),T()]})}',
    /** The panel's class component also passes accountContainerRef, but not first in a children array */
    panelRender: 'children:[(0,i.jsx)(el.A,{nameplate:t,hovered:r,placement:ei.u.ACCOUNT}),this.renderNameZone(e),(0,i.jsx)(lT,{...this.props,...this.state,accountContainerRef:this.containerRef,handleOpenSettingsContextMenu:this.handleOpenSettingsContextMenu})]',
};

function apply(key: keyof typeof PATCHES, code: string = SOURCES[key], self = "S") {
    const patch = PATCHES[key];
    expect(matchesFind(code, patch.find)).toBe(true);
    let next = code;
    for (const r of ([] as Replacement[]).concat(patch.replace)) {
        const re = canonicalizeMatch(r.match) as RegExp;
        expect(code.match(new RegExp(re.source, "g"))?.length).toBe(1);
        const before = next;
        next = next.replace(re, (r.with as string).replaceAll("$self", self));
        expect(next).not.toBe(before);
    }
    return next;
}

describe("readShowCurrentGame", () => {
    test("reads the BoolValue", () => {
        expect(readShowCurrentGame({ status: { showCurrentGame: { value: false } } })).toBe(false);
        expect(readShowCurrentGame({ status: { showCurrentGame: { value: true } } })).toBe(true);
    });
    test("missing means shown, like Discord's e?.value??!0", () => {
        expect(readShowCurrentGame(undefined)).toBe(true);
        expect(readShowCurrentGame({})).toBe(true);
        expect(readShowCurrentGame({ status: {} })).toBe(true);
        expect(readShowCurrentGame({ status: { showCurrentGame: {} } })).toBe(true);
    });
});

describe("labels", () => {
    test("button says what a click does", () => {
        expect(buttonLabel(true)).toBe("Hide game activity");
        expect(buttonLabel(false)).toBe("Show game activity");
    });
    test("toast describes the new state", () => {
        expect(toggledMessage(true)).toContain("visible");
        expect(toggledMessage(false)).toContain("hidden");
    });
});

describe("patches", () => {
    test("setting: hands the showCurrentGame setting object to the plugin", () => {
        const out = apply("setting");
        expect(out).toContain('ey=f("status","showCurrentGame",e=>e?.value??!0,e=>l._t.create({value:e}));S?.captureSetting?.(ey);f("privacy"');
        let captured: any;
        const f = (group: string, name: string) => ({ group, name });
        new Function("f", "l", "N", "s", "S", out)(f, {}, { uH: {} }, { he: {}, KP: {} }, { captureSetting: (v: any) => (captured = v) });
        expect(captured).toEqual({ group: "status", name: "showCurrentGame" });
    });

    test("user panel: button goes first in the button row", () => {
        const out = apply("userPanel");
        expect(out).toContain('children:[S?.renderButton?.(arguments[0]),(0,i.jsx)(ls,{accountContainerRef:_');
        expect(() => new Function(out)).not.toThrow();
    });

    test("user panel: leaves the class component's render alone", () => {
        const re = canonicalizeMatch(PATCHES.userPanel.replace.match) as RegExp;
        expect(re.test(SOURCES.panelRender)).toBe(false);
    });
});
