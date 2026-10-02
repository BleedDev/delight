import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import type { Replacement, SourcePatch } from "../src/renderer/patching/source";
import { canonicalizeMatch, canonicalizeReplace, matchesFind } from "../src/renderer/patching/source";
import { cssVars, paletteKey, paletteOf, parseKey, PATCHES, typerIds } from "../plugins/role-colours/colours";
import { PATCHES as TYPING_TWEAKS } from "../plugins/typing-tweaks/typing";
import { missingTranslations } from "../src/shared/pluginTranslations";

// Verbatim from Discord's web build (2026-10-02): the "is typing" line, the user mention component
// (it's in the main bundle and a lazy chunk), a voice channel member row and a reactions popout row
const SOURCES = {
    typing: "function Q(e){let{activityInviteEducationActivity:t,isFocused:i,typingUsers:l,className:r,channel:d,isThreadCreation:o,renderDots:u,renderSlowmode:m,isInTextChannel:h=!1,shouldShowLegacyGameInviteCreationBanner:p=!1}=e,A=(0,W.v)(\"TypingUsers\"),{rateLimitPerUser:g}=d,x=s.useRef(null),f=s.useRef(null),[v,E]=s.useState(!1),C=s.useCallback(()=>{if(null==x.current||null==f.current)return;let e=x.current.getBoundingClientRect();f.current.scrollWidth+48>e.width?E(!0):E(!1)},[]);(0,I.g)(x,C,[],{enabled:h}),(0,I.g)(f,C,[],{enabled:h});let[S,j,y]=l,N=\"\";1===l.length?N=H.intl.format(H.t.lJ9sZX,{a:S}):2===l.length?N=H.intl.format(H.t.rB0CUa,{a:S,b:j}):3===l.length?N=H.intl.format(H.t.StKThj,{a:S,b:j,c:y}):l.length>3&&(N=H.intl.format(H.t.Q8lUnE,{}));let b=v&&l.length>0&&l.length<=3?H.intl.format(H.t[\"qD/0qZ\"],{}):N,_=l.length>0||g>0||p,D=!_&&null!=t,G=null;return _?G=(0,n.jsxs)(\"div\",{className:a()(q.IW,{\"stop-animation\":!i,[q.Il]:h},r),\"data-mtctest-ignore\":\"true\",children:[0===l.length&&p?(0,n.jsx)(O.A,{}):(0,n.jsxs)(\"div\",{className:q.y5,ref:x,children:[l.length>0&&!1!==u&&(A?(0,n.jsx)(X,{}):(0,n.jsx)(c.n,{className:q.gO,dotRadius:3.5,themed:!0})),(0,n.jsx)(\"span\",{className:q.Qq,\"aria-hidden\":!0,children:b}),(0,n.jsx)(\"span\",{className:q.Qq,style:{position:\"absolute\",visibility:\"hidden\"},\"aria-hidden\":!0,ref:f,children:N})]}),!1!==m&&(0,n.jsx)(T,{channel:d,isThreadCreation:o})]}):D&&null!=t&&(G=(0,n.jsx)(z,{activity:t,isFocused:i})),(0,n.jsxs)(n.Fragment,{children:[G,(0,n.jsx)(\"span\",{className:q.y4,\"aria-live\":\"polite\",\"aria-atomic\":!0,children:N})]})}",
    mention: "function m(e){let{className:t,userId:c,channelId:m,parsedUserId:g,content:S,inlinePreview:N=!1,viewingChannelId:C}=e,O=r.useRef(null),{analyticsLocations:R}=(0,d.Ay)(o.A.USER_MENTION),L=(0,s.bG)([I.default],()=>I.default.getUser(c)),y=(0,s.bG)([E.A],()=>E.A.getChannel(m)),D=null!=y?y.getGuildId():null,v=N||null==L||null==m||null==y?void 0:e=>{null!=D?(0,l.L3)(e,async()=>{let{default:e}=await Promise.all([n.e(\"403382\"),n.e(\"597981\"),n.e(\"622936\"),n.e(\"216947\"),n.e(\"463317\"),n.e(\"326692\"),n.e(\"993103\"),n.e(\"834552\"),n.e(\"708757\"),n.e(\"585968\"),n.e(\"893190\"),n.e(\"21921\"),n.e(\"571210\"),n.e(\"676418\"),n.e(\"189673\"),n.e(\"166495\"),n.e(\"88342\"),n.e(\"311802\"),n.e(\"698965\"),n.e(\"882073\"),n.e(\"797558\"),n.e(\"931319\"),n.e(\"229787\"),n.e(\"691994\"),n.e(\"682337\"),n.e(\"576665\"),n.e(\"235313\"),n.e(\"371133\"),n.e(\"454625\"),n.e(\"538887\"),n.e(\"436564\"),n.e(\"939171\"),n.e(\"624198\"),n.e(\"252229\"),n.e(\"245996\"),n.e(\"856753\"),n.e(\"700792\"),n.e(\"592822\"),n.e(\"529422\"),n.e(\"823427\"),n.e(\"309291\"),n.e(\"449145\"),n.e(\"214461\"),n.e(\"307059\"),n.e(\"365826\"),n.e(\"493014\"),n.e(\"242204\"),n.e(\"649520\"),n.e(\"349644\"),n.e(\"825486\"),n.e(\"522261\"),n.e(\"678195\"),n.e(\"343116\"),n.e(\"713708\"),n.e(\"139103\"),n.e(\"470314\"),n.e(\"774021\"),n.e(\"70515\"),n.e(\"404524\"),n.e(\"654148\"),n.e(\"830221\"),n.e(\"666939\"),n.e(\"324240\"),n.e(\"221879\"),n.e(\"717334\"),n.e(\"184841\")]).then(n.bind(n,107632));return t=>(0,i.jsx)(e,{...t,viewingChannelId:C,user:L,channel:y,guildId:D})}):y.isDM()&&(0,l.L3)(e,async()=>{let{default:e}=await Promise.all([n.e(\"790484\"),n.e(\"403382\"),n.e(\"597981\"),n.e(\"622936\"),n.e(\"216947\"),n.e(\"463317\"),n.e(\"326692\"),n.e(\"926132\"),n.e(\"146652\"),n.e(\"993103\"),n.e(\"834552\"),n.e(\"708757\"),n.e(\"393336\"),n.e(\"585968\"),n.e(\"893190\"),n.e(\"776273\"),n.e(\"391763\"),n.e(\"955557\"),n.e(\"571210\"),n.e(\"189673\"),n.e(\"88342\"),n.e(\"311802\"),n.e(\"698965\"),n.e(\"882073\"),n.e(\"797558\"),n.e(\"229787\"),n.e(\"691994\"),n.e(\"682337\"),n.e(\"576665\"),n.e(\"235313\"),n.e(\"371133\"),n.e(\"454625\"),n.e(\"538887\"),n.e(\"947502\"),n.e(\"436564\"),n.e(\"965789\"),n.e(\"252229\"),n.e(\"245996\"),n.e(\"856753\"),n.e(\"979630\"),n.e(\"700792\"),n.e(\"198415\"),n.e(\"592822\"),n.e(\"529422\"),n.e(\"823427\"),n.e(\"838056\"),n.e(\"309291\"),n.e(\"508829\"),n.e(\"214461\"),n.e(\"307059\"),n.e(\"935483\"),n.e(\"493014\"),n.e(\"242204\"),n.e(\"172883\"),n.e(\"349644\"),n.e(\"920628\"),n.e(\"522261\"),n.e(\"678195\"),n.e(\"21106\"),n.e(\"368358\"),n.e(\"713708\"),n.e(\"836150\"),n.e(\"699011\"),n.e(\"710014\"),n.e(\"774021\"),n.e(\"17244\"),n.e(\"298199\"),n.e(\"864464\"),n.e(\"703168\"),n.e(\"439778\"),n.e(\"324240\"),n.e(\"996028\"),n.e(\"960816\"),n.e(\"221879\"),n.e(\"363071\")]).then(n.bind(n,385913));return t=>(0,i.jsx)(e,{...t,user:L,channel:y,targetIsUser:!0})})},b=p.Ay.useName(L),M=(0,s.bG)([E.A,A.Ay,h.A],()=>f.Ay.getNickname(D,m,L));if(null==L)return(0,i.jsx)(T,{userId:g,className:t,children:S});function P(e){return(0,i.jsx)(u.A,{ref:O,className:t,onContextMenu:v,...e,children:`@${M??b}`})}return N?(0,i.jsx)(d.f5,{value:R,children:P()}):(0,i.jsx)(d.f5,{value:R,children:(0,i.jsx)(_.A,{targetElementRef:O,user:L,guildId:D??void 0,channelId:m,position:a.Fr?\"top\":\"right\",clickTrap:!0,children:e=>P(e)})})}",
    mentionLazy: "function E(e){let{className:t,userId:c,channelId:E,parsedUserId:I,content:y,inlinePreview:S=!1,viewingChannelId:v}=e,N=i.useRef(null),{analyticsLocations:_}=(0,u.Ay)(o.A.USER_MENTION),j=(0,r.bG)([g.default],()=>g.default.getUser(c)),b=(0,r.bG)([h.A],()=>h.A.getChannel(E)),T=null!=b?b.getGuildId():null,R=S||null==j||null==E||null==b?void 0:e=>{null!=T?(0,a.L3)(e,async()=>{let{default:e}=await Promise.all([n.e(\"403382\"),n.e(\"597981\"),n.e(\"622936\"),n.e(\"216947\"),n.e(\"463317\"),n.e(\"326692\"),n.e(\"993103\"),n.e(\"834552\"),n.e(\"708757\"),n.e(\"585968\"),n.e(\"893190\"),n.e(\"21921\"),n.e(\"571210\"),n.e(\"676418\"),n.e(\"189673\"),n.e(\"166495\"),n.e(\"88342\"),n.e(\"311802\"),n.e(\"698965\"),n.e(\"882073\"),n.e(\"797558\"),n.e(\"931319\"),n.e(\"229787\"),n.e(\"691994\"),n.e(\"682337\"),n.e(\"576665\"),n.e(\"235313\"),n.e(\"371133\"),n.e(\"454625\"),n.e(\"538887\"),n.e(\"436564\"),n.e(\"939171\"),n.e(\"624198\"),n.e(\"252229\"),n.e(\"245996\"),n.e(\"856753\"),n.e(\"700792\"),n.e(\"592822\"),n.e(\"529422\"),n.e(\"823427\"),n.e(\"309291\"),n.e(\"449145\"),n.e(\"214461\"),n.e(\"307059\"),n.e(\"365826\"),n.e(\"493014\"),n.e(\"242204\"),n.e(\"649520\"),n.e(\"349644\"),n.e(\"825486\"),n.e(\"522261\"),n.e(\"678195\"),n.e(\"343116\"),n.e(\"713708\"),n.e(\"139103\"),n.e(\"470314\"),n.e(\"774021\"),n.e(\"70515\"),n.e(\"404524\"),n.e(\"654148\"),n.e(\"830221\"),n.e(\"666939\"),n.e(\"324240\"),n.e(\"221879\"),n.e(\"717334\"),n.e(\"184841\")]).then(n.bind(n,107632));return t=>(0,l.jsx)(e,{...t,viewingChannelId:v,user:j,channel:b,guildId:T})}):b.isDM()&&(0,a.L3)(e,async()=>{let{default:e}=await Promise.all([n.e(\"790484\"),n.e(\"403382\"),n.e(\"597981\"),n.e(\"622936\"),n.e(\"216947\"),n.e(\"463317\"),n.e(\"326692\"),n.e(\"926132\"),n.e(\"146652\"),n.e(\"993103\"),n.e(\"834552\"),n.e(\"708757\"),n.e(\"393336\"),n.e(\"585968\"),n.e(\"893190\"),n.e(\"776273\"),n.e(\"391763\"),n.e(\"955557\"),n.e(\"571210\"),n.e(\"189673\"),n.e(\"88342\"),n.e(\"311802\"),n.e(\"698965\"),n.e(\"882073\"),n.e(\"797558\"),n.e(\"229787\"),n.e(\"691994\"),n.e(\"682337\"),n.e(\"576665\"),n.e(\"235313\"),n.e(\"371133\"),n.e(\"454625\"),n.e(\"538887\"),n.e(\"947502\"),n.e(\"436564\"),n.e(\"965789\"),n.e(\"252229\"),n.e(\"245996\"),n.e(\"856753\"),n.e(\"979630\"),n.e(\"700792\"),n.e(\"198415\"),n.e(\"592822\"),n.e(\"529422\"),n.e(\"823427\"),n.e(\"838056\"),n.e(\"309291\"),n.e(\"508829\"),n.e(\"214461\"),n.e(\"307059\"),n.e(\"935483\"),n.e(\"493014\"),n.e(\"242204\"),n.e(\"172883\"),n.e(\"349644\"),n.e(\"920628\"),n.e(\"522261\"),n.e(\"678195\"),n.e(\"21106\"),n.e(\"368358\"),n.e(\"713708\"),n.e(\"836150\"),n.e(\"699011\"),n.e(\"710014\"),n.e(\"774021\"),n.e(\"17244\"),n.e(\"298199\"),n.e(\"864464\"),n.e(\"703168\"),n.e(\"439778\"),n.e(\"324240\"),n.e(\"996028\"),n.e(\"960816\"),n.e(\"221879\"),n.e(\"363071\")]).then(n.bind(n,385913));return t=>(0,l.jsx)(e,{...t,user:j,channel:b,targetIsUser:!0})})},O=A.Ay.useName(j),L=(0,r.bG)([h.A,p.Ay,f.A],()=>x.Ay.getNickname(T,E,j));if(null==j)return(0,l.jsx)(C,{userId:I,className:t,children:y});function M(e){return(0,l.jsx)(d.A,{ref:N,className:t,onContextMenu:R,...e,children:`@${L??O}`})}return S?(0,l.jsx)(u.f5,{value:_,children:M()}):(0,l.jsx)(u.f5,{value:_,children:(0,l.jsx)(m.A,{targetElementRef:N,user:j,guildId:T??void 0,channelId:E,position:s.Fr?\"top\":\"right\",clickTrap:!0,children:e=>M(e)})})}",
    voice: "function(e){let s,t,n,l,{avatarContainerClass:c=es.H,userNameClassName:o=es.gr,size:u=Q.OSZ.SMALL,selected:A=!1,disabled:x=!1,isOverlay:h=!1,ref:E,...N}=e,{onClick:g,onKeyDown:C,onDoubleClick:I,onContextMenu:f,onMouseLeave:L,onMouseDown:O,priority:R,speaking:T=!1,collapsed:_,mute:D,localMute:v,serverMute:M,deaf:P,serverDeaf:F,guildId:K,nick:z,isGuest:w,flipped:B,className:Z,overlap:H,\"aria-label\":X,ringing:W,user:Y}=N,q=(0,b.A)({userId:Y.id,guildId:K}),en=(0,G.a)({displayNameStyles:q}),er=(0,S.A)(Y.id),el=(0,y.v)({isSpeaking:T,voiceDb:er,...H?{spreadDirection:y.O.INSET_ONLY,maxInnerSpreadRadius:3}:{}}),[ea,ec]=r.useState(!1),eo=(()=>{if(null!=X)return X;let e=z??Y.username,s=null;return(F?s=ee.intl.string(ee.t.btxSdB):P?s=ee.intl.string(ee.t.NjmiOL):v?s=ee.intl.string(ee.t.Q8Uzof):M?s=ee.intl.string(ee.t.uLddbQ):D&&(s=ee.intl.string(ee.t.tjtv3P)),null!=s)?ee.intl.formatToPlainString(ee.t[\"1+MVBP\"],{userName:e,status:s}):e})(),eu=(0,d.bG)([U.A],()=>U.A.getProgressForUserId(Y.id),[Y.id]),ed=(0,V.Uk)(\"VoiceUser\")&&null!=eu;return(0,i.jsx)(p.s,{ref:E,className:a()(Z,{[es.q7]:!0,[es.EF]:H,[es.wH]:A,[es.vk]:null!=g,[es.L9]:u===Q.OSZ.SMALL,[es.p8]:u===Q.OSZ.LARGE,[es.r9]:!A&&x}),onClick:function(e){g?.(e,Y)},onDoubleClick:function(e){I?.(e,Y)},onContextMenu:function(e){f?.(e,Y)},onMouseLeave:function(e){L?.(e,Y),ec(!1)},onMouseDown:function(e){O?.(e,Y)},onMouseEnter:function(){ec(!0)},onKeyDown:C,\"aria-label\":eo,focusProps:{offset:{right:4}},children:(0,i.jsxs)(\"div\",{className:a()(es.Qs,{[es.zq]:B}),children:[R&&!_?(0,i.jsx)(m.m,{text:ee.intl.string(ee.t.BVK71i),children:(0,i.jsx)(\"div\",{className:a()(es.G,{[es.g4]:!D&&!M&&T})})}):null,(s=a()(es.my,{[es.Jb]:u===Q.OSZ.LARGE,[es.dT]:u===Q.OSZ.SMALL,[es.DF]:W}),t={backgroundImage:`url(${Y.getAvatarURL(K,u===Q.OSZ.LARGE?38:24)})`,...el},W?(0,i.jsx)(k.Ay,{size:u===Q.OSZ.LARGE?j._3.SIZE_40:j._3.SIZE_24,ringing:!0,src:Y.getAvatarURL(K,u===Q.OSZ.LARGE?40:24),className:a()(c,s)}):ed?(0,i.jsx)(J,{userId:Y.id,wrapperClassName:c,children:(0,i.jsx)(\"div\",{className:s,style:t})}):(0,i.jsx)(\"div\",{className:a()(c,s),style:t})),(n=(0,i.jsxs)(\"div\",{className:a()(o,es.Xh,en,{[es.Pi]:!D&&!M&&T,[es.DF]:W}),children:[z??$.Ay.getName(Y),w?(0,i.jsxs)(\"span\",{className:es.IW,children:[\"\\xa0\",ee.intl.string(ee.t[\"pFO/Ph\"])]}):\"\"]}),l={primaryGuild:Y.primaryGuild,userId:Y.id,contextGuildId:K,isOverlay:h,disableTooltip:!0,className:a()(es.fc,h&&es.zW),profileViewedAnalytics:{source:h?Q.JJy.OVERLAY:Q.ThZ.VOICE_PANEL}},!_||h?(0,i.jsx)(et,{...l,children:n}):null),(0,i.jsx)(ei,{disabled:x,...N,isHovered:ea})]})})}",
    reactor: "function ed(e){let{emoji:t,user:s,message:l,channel:i,guildId:r,reactionType:o,onRemoveReactor:d}=e,{analyticsLocations:m}=(0,C.Ay)(y.A.MESSAGE_REACTIONS),h=(0,c.bG)([O.default],()=>O.default.getId()),g=(0,c.bG)([X.default],()=>X.default.getUser(s.id),[s]),j=(0,L.Id)(i),S=(0,c.bG)([Z.A],()=>Z.A.can(es.xBc.MANAGE_MESSAGES,i)&&j)||h===s.id,M=(0,c.bG)([$.Ay,P.A,q.A],()=>K.Ay.getName(r,i.id,s));async function v(){await (0,H.A)(s.id,s.getAvatarURL(r??void 0,80),{guildId:r??void 0,channelId:i.id}),(0,D.openUserProfileModal)({userId:s.id,guildId:r??void 0,channelId:i.id,messageId:l.id,sourceAnalyticsLocations:m})}return(0,n.jsxs)(E.A,{className:el.Px,align:E.A.Align.CENTER,children:[(0,n.jsx)(A.D,{className:el.Z7,onClick:v,onContextMenu:e=>(0,Y.wQ)(e,s,i),children:(0,n.jsxs)(E.A,{align:E.A.Align.CENTER,children:[(0,n.jsx)(E.A.Child,{wrap:!0,grow:0,shrink:0,className:ei.Gf,children:(0,n.jsx)(R.A,{\"aria-hidden\":!0,user:g??s,size:x._3.SIZE_32})}),(0,n.jsxs)(E.A.Child,{className:el.Bi,children:[(0,n.jsx)(p.E,{tag:\"strong\",variant:\"text-md/medium\",className:el.UU,children:null!=M&&\"\"!==M&&(0,n.jsx)(\"span\",{className:el.Ci,children:M})}),(0,n.jsx)(N.A,{user:s,className:null!=M&&\"\"!==M?el.rW:null,usernameClass:a()(el.Xh,el.Ci),discriminatorClass:el.D2,forceUsername:!0})]})]})}),S&&(0,n.jsx)(\"div\",{className:el.TF,children:(0,n.jsx)(u.K,{onClick:function(){ee.et({channelId:i.id,messageId:l.id,emoji:t,location:ee.qN.MESSAGE,userId:s.id,options:{burst:o===w.v.BURST}}),d?.()},\"aria-label\":en.intl.string(en.t[\"+BdaDn\"]),icon:f.P,size:\"sm\",variant:\"icon-only\"})})]})}",
};

/** Applies a patch like Evi does, each replacement matching exactly once */
function apply(patch: SourcePatch, code: string) {
    expect(matchesFind(code, patch.find)).toBe(true);
    let next = code;
    for (const r of ([] as Replacement[]).concat(patch.replace)) {
        const re = canonicalizeMatch(r.match) as RegExp;
        expect(next.match(new RegExp(re.source, "g"))?.length).toBe(1);
        const before = next;
        next = next.replace(re, canonicalizeReplace(r.with, "role-colours") as string);
        expect(next).not.toBe(before);
    }
    return next;
}

/** Throws if the code isn't valid JavaScript */
const parses = (code: string) => new Function(`return (${code});`);

describe("Role Colours Everywhere: patches on Discord's code", () => {
    test("typing line: the names go through typers() before they're formatted", () => {
        const out = apply(PATCHES.typing, SOURCES.typing);
        expect(out).toContain('let[S,j,y]=Evi.$("role-colours")?.typers?.(l,arguments[0])??l,N="";1===l.length?');
        expect(() => parses(out)).not.toThrow();
    });

    test("typing line: still matches after Typing Tweaks patched its visible span", () => {
        const tt = SOURCES.typing.replace(/(?<="aria-hidden":!0,children:)b(?=\}\))/, 'Evi.$("typing-tweaks")?.renderTypingText?.(b,b===N,arguments[0])??b');
        expect(tt).not.toBe(SOURCES.typing);
        expect(() => parses(apply(PATCHES.typing, tt))).not.toThrow();
    });

    test("typing line: Typing Tweaks' patch still applies after ours", () => {
        const ours = apply(PATCHES.typing, SOURCES.typing);
        const both = apply(TYPING_TWEAKS.typingLine, ours);
        expect(both).toContain('Evi.$("role-colours")?.typers?.(l,arguments[0])');
        expect(both).toContain('Evi.$("role-colours")?.renderTypingText?.(b,b===N,arguments[0])??b');
        expect(() => parses(both)).not.toThrow();
    });

    test("mention: the @name is wrapped with the user and the guild, in both copies", () => {
        const main = apply(PATCHES.mention, SOURCES.mention);
        expect(main).toContain('children:Evi.$("role-colours")?.wrap?.("mentions",`@${M??b}`,L,D)??`@${M??b}`})');
        expect(() => parses(main)).not.toThrow();
        const lazy = apply(PATCHES.mention, SOURCES.mentionLazy);
        expect(lazy).toContain('wrap?.("mentions",`@${L??O}`,j,T)');
        expect(() => parses(lazy)).not.toThrow();
        expect(PATCHES.mention.all).toBe(true);
    });

    test("voice row: the name is wrapped with the row's user and guild", () => {
        const out = apply(PATCHES.voice, SOURCES.voice);
        expect(out).toContain('children:[Evi.$("role-colours")?.wrap?.("voice",z??$.Ay.getName(Y),arguments[0]?.user,arguments[0]?.guildId)??(z??$.Ay.getName(Y)),w?');
        expect(() => parses(out)).not.toThrow();
    });

    test("reactions row: the nickname span is wrapped with the row's user and guild", () => {
        const out = apply(PATCHES.reactions, SOURCES.reactor);
        expect(out).toContain('("span",{className:el.Ci,children:Evi.$("role-colours")?.wrap?.("reactions",M,arguments[0]?.user,arguments[0]?.guildId)??M})');
        expect(() => parses(out)).not.toThrow();
    });

    test("turned off, every call falls back to Discord's own value", () => {
        for (const [patch, code] of [[PATCHES.typing, SOURCES.typing], [PATCHES.voice, SOURCES.voice], [PATCHES.reactions, SOURCES.reactor], [PATCHES.mention, SOURCES.mention]] as const) {
            expect(apply(patch, code)).toMatch(/\?\.(?:wrap|typers)\?\.\(/);
        }
    });
});

describe("Role Colours Everywhere: colours", () => {
    test("a plain role colour", () => {
        expect(paletteOf({ colorString: "#E91E63" }, true)).toEqual({ primary: "#e91e63" });
        expect(paletteOf({ colorString: null }, true)).toBeNull();
        expect(paletteOf(undefined, true)).toBeNull();
        expect(paletteOf({ colorString: "red" }, true)).toBeNull();
    });

    test("gradient and holographic roles, or just their first colour", () => {
        const gradient = { colorString: "#ff0000", colorStrings: { primaryColor: "#ff0000", secondaryColor: "#0000ff", tertiaryColor: null } };
        const holo = { colorString: "#a9c9ff", colorStrings: { primaryColor: "#a9c9ff", secondaryColor: "#ffbbec", tertiaryColor: "#ffc3a0" } };
        expect(paletteOf(gradient, true)).toEqual({ primary: "#ff0000", secondary: "#0000ff" });
        expect(paletteOf(holo, true)).toEqual({ primary: "#a9c9ff", secondary: "#ffbbec", tertiary: "#ffc3a0" });
        expect(paletteOf(holo, false)).toEqual({ primary: "#a9c9ff" });
    });

    test("palette keys round-trip, and are empty without a colour", () => {
        const p = { primary: "#a9c9ff", secondary: "#ffbbec", tertiary: "#ffc3a0" };
        expect(parseKey(paletteKey(p))).toEqual(p);
        expect(parseKey(paletteKey({ primary: "#123456" }))).toEqual({ primary: "#123456" });
        expect(paletteKey(null)).toBe("");
        expect(parseKey("")).toBeNull();
    });

    test("CSS variables for the stylesheet", () => {
        expect(cssVars({ primary: "#111111" })).toEqual({ "--evi-rc": "#111111" });
        expect(cssVars({ primary: "#111111", secondary: "#222222", tertiary: "#333333" })).toEqual({ "--evi-rc": "#111111", "--evi-rc-2": "#222222", "--evi-rc-3": "#333333" });
    });

    test("typers in Discord's order, minus you, hidden people and unknown users", () => {
        const typing = { a: 1, me: 1, blocked: 1, ghost: 1, b: 1 };
        expect(typerIds(typing, "me", id => id === "blocked", id => id !== "ghost")).toEqual(["a", "b"]);
        expect(typerIds(undefined, "me", () => false, () => true)).toEqual([]);
    });
});

describe("Role Colours Everywhere: the store's checks", () => {
    const dir = join(import.meta.dir, "../plugins/role-colours");
    test("every string and the manifest in all of Evi's languages", () => {
        const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
        expect(missingTranslations(manifest, readFileSync(join(dir, "strings.ts"), "utf8"))).toEqual([]);
        expect(manifest.enabledByDefault).toBe(false);
        expect(manifest.version).toBe("1.0.0");
    });
});
