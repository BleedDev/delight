import { describe, expect, test } from "bun:test";

import type { Replacement } from "../src/renderer/patching/source";
import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";
import { fakeState, PATCHES } from "../plugins/fake-deafen/voice";
import { PATCHES as GAME_ACTIVITY_PATCHES } from "../plugins/game-activity-toggle/toggle";

// Verbatim from Discord's web build (test-results/chunks), trimmed to the patched spots
const SOURCES = {
    committer: 'H=new class extends M{socket;constructor(e){super(),this.socket=e}get guildId(){return this.getState().guildId}get channelId(){return this.getState().channelId}computeVoiceFlags(){return 0}}(B);',
    userPanel: 'function lT(e){let{selfDeaf:t,selfMute:n,awaitingRemote:a,serverMute:s,serverDeaf:r,suppress:o,shouldShowSpeakingWhileMutedTooltip:d,webBuildOverride:c,handleMouseEnterMute:u,handleMouseLeaveMute:m,handleToggleSelfDeaf:h,handleToggleSelfMute:f,handleInputAudioContextMenu:p,handleOutputAudioContextMenu:g,handleOpenAccountSettings:A,handleOpenSettingsContextMenu:x,dismissibleContents:v,occluded:E,nameplate:C,accountContainerRef:_,deviceChangedTooltipType:I,dismissTooltips:b,speaking:S}=e,j=(0,en.K)(C);function T(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return(0,i.jsx)(lv,{webBuildOverride:c,onClick:A,onContextMenu:x,dismissibleContents:[...v.settings,...e],iconForeground:null!=C?lE.t4:void 0,nameplate:C})}return(0,i.jsxs)("div",{className:lE.Uo,style:j,children:[(0,i.jsx)(ls,{accountContainerRef:_,selfMute:n,serverMute:s,suppress:o,awaitingRemote:a,onMouseEnter:u,onMouseLeave:m,onClick:f,onContextMenu:p,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowSpeakingWhileMutedTooltip:d,shouldShowInputDeviceChangedTooltip:!d&&"input"===I,dismissTooltips:b,speaking:S}),(0,i.jsx)(i5,{selfDeaf:t,serverDeaf:r,onClick:h,onContextMenu:g,awaitingRemote:a,iconForeground:null!=C?lE.t4:void 0,nameplate:C,shouldShowOutputDeviceChangedTooltip:"output"===I,dismissTooltips:b}),T()]})}',
};

type AnyPatch = { find: string; replace: Replacement | Replacement[]; };

function apply(patch: AnyPatch, code: string, self = "S") {
    expect(matchesFind(code, patch.find)).toBe(true);
    let next = code;
    for (const r of ([] as Replacement[]).concat(patch.replace)) {
        const re = canonicalizeMatch(r.match) as RegExp;
        expect(next.match(new RegExp(re.source, "g"))?.length).toBe(1);
        const before = next;
        next = next.replace(re, (r.with as string).replaceAll("$self", self));
        expect(next).not.toBe(before);
    }
    return next;
}

describe("fakeState", () => {
    const real = { guildId: "1", channelId: "2", selfMute: false, selfDeaf: false, selfVideo: true, flags: 3 };

    test("deafens and mutes, keeping everything else", () => {
        expect(fakeState(real, { deafen: true, mute: true })).toEqual({ ...real, selfDeaf: true, selfMute: true });
    });
    test("deafened always shows muted too, like Discord", () => {
        expect(fakeState(real, { deafen: true, mute: false })).toEqual({ ...real, selfDeaf: true, selfMute: true });
    });
    test("mute alone", () => {
        expect(fakeState(real, { deafen: false, mute: true })).toEqual({ ...real, selfDeaf: false, selfMute: true });
    });
    test("never undoes a real mute or deafen", () => {
        const deaf = { ...real, selfMute: true, selfDeaf: true };
        expect(fakeState(deaf, { deafen: false, mute: false })).toEqual(deaf);
    });
    test("leaving a channel goes through untouched", () => {
        const leave = { guildId: null, channelId: null, selfMute: false, selfDeaf: false };
        expect(fakeState(leave, { deafen: true, mute: true })).toBe(leave);
    });
});

describe("patches", () => {
    test("committer: hands Discord's voice state committer to the plugin", () => {
        const out = apply(PATCHES.committer, SOURCES.committer);
        expect(out).toContain("constructor(e){super(),this.socket=e,S?.captureCommitter?.(this)}get guildId()");
        let captured: any;
        const S = { captureCommitter: (v: any) => (captured = v) };
        const H = new Function("M", "B", "S", `let ${out} return H;`)(class { }, "socket", S);
        expect(captured).toBe(H);
        expect(captured.socket).toBe("socket");
    });

    test("user panel: button goes right after deafen", () => {
        const out = apply(PATCHES.userPanel, SOURCES.userPanel);
        expect(out).toContain('dismissTooltips:b}),S?.renderButton?.(arguments[0]),T()]})}');
        expect(() => new Function(out)).not.toThrow();
    });

    test("user panel: works alongside Game Activity Toggle, in either order", () => {
        const both = apply(PATCHES.userPanel, apply(GAME_ACTIVITY_PATCHES.userPanel, SOURCES.userPanel, "G"));
        const reversed = apply(GAME_ACTIVITY_PATCHES.userPanel, apply(PATCHES.userPanel, SOURCES.userPanel), "G");
        expect(both).toBe(reversed);
        expect(both).toContain("children:[G?.renderButton?.(arguments[0]),(0,i.jsx)(ls,");
        expect(both).toContain("dismissTooltips:b}),S?.renderButton?.(arguments[0]),T()]");
    });
});
