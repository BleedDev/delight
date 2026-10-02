import type { SourcePatch } from "@evi/api";

/**
 * Pure pieces of Role Colours Everywhere, kept free of Discord so they can be tested.
 *
 * A member's colour is GuildMemberStore.getMember(guildId, userId).colorString, "#rrggbb" or null
 * without a coloured role. Gradient and holographic roles add colorStrings: { primaryColor,
 * secondaryColor, tertiaryColor? }, the stops Discord draws a name's gradient with.
 */

export interface Palette {
    primary: string;
    secondary?: string;
    tertiary?: string;
}

export interface MemberColours {
    colorString?: string | null;
    colorStrings?: { primaryColor?: string | null; secondaryColor?: string | null; tertiaryColor?: string | null; } | null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown): string | undefined => typeof v === "string" && HEX.test(v) ? v.toLowerCase() : undefined;

/** The colours a member's name is drawn in, or null when no role colours it */
export function paletteOf(member: MemberColours | null | undefined, gradients: boolean): Palette | null {
    if (!member) return null;
    const stops = member.colorStrings;
    const primary = hex(stops?.primaryColor) ?? hex(member.colorString);
    if (!primary) return null;
    const secondary = gradients ? hex(stops?.secondaryColor) : undefined;
    if (!secondary) return { primary };
    const tertiary = hex(stops?.tertiaryColor);
    return tertiary ? { primary, secondary, tertiary } : { primary, secondary };
}

/** A palette as a string, so a store snapshot only changes when the colours do */
export const paletteKey = (p: Palette | null) => p ? [p.primary, p.secondary ?? "", p.tertiary ?? ""].join("|") : "";

export function parseKey(key: string): Palette | null {
    const [primary, secondary, tertiary] = key.split("|");
    if (!hex(primary)) return null;
    return { primary, ...(hex(secondary) ? { secondary } : {}), ...(hex(tertiary) ? { tertiary } : {}) };
}

/** CSS variables for the name: the stylesheet makes them readable on the theme and draws the gradient */
export function cssVars(p: Palette): Record<string, string> {
    const vars: Record<string, string> = { "--evi-rc": p.primary };
    if (p.secondary) vars["--evi-rc-2"] = p.secondary;
    if (p.tertiary) vars["--evi-rc-3"] = p.tertiary;
    return vars;
}

/**
 * Who's typing, in the order Discord names them: TypingStore's ids in the order they started, minus
 * you, people you've blocked or ignored and users it doesn't know (the same filter as Discord's).
 */
export function typerIds(
    typing: Record<string, unknown> | undefined,
    selfId: string | undefined,
    hidden: (id: string) => boolean,
    known: (id: string) => boolean,
): string[] {
    return Object.keys(typing ?? {}).filter(id => id !== selfId && !hidden(id) && known(id));
}

/** The places a name gets its colour, each with its own setting */
export type Place = "mentions" | "typing" | "voice" | "reactions";

export const PATCHES = {
    /**
     * The "is typing" line (checked 2026-10-02). Its props' typingUsers are the typers' names only,
     * unpacked right before they're formatted into "a is typing", "a and b are typing"...:
     *     let[S,j,y]=l,N="";1===l.length?N=H.intl.format(H.t.lJ9sZX,{a:S}):...
     * We hand back the same names as coloured elements; intl.format takes elements as values. Typing
     * Tweaks patches the visible span further down; this stays clear of it.
     */
    typing: {
        find: "Q8lUnE,{})",
        replace: {
            match: /let\[(\i),(\i),(\i)\]=(\i),(\i)="";(?=1===\4\.length\?)/,
            with: "let[$1,$2,$3]=$self?.typers?.($4,arguments[0])??$4,$5=\"\";",
        },
    },
    /**
     * A user @mention in a message. Discord has the component twice (the main bundle and a lazy
     * chunk), so `all`. Its text is `@${nick??name}`, inside a popout's render function:
     *     M=(0,r.bG)([...],()=>x.Ay.getNickname(T,E,j));...function M(e){return(0,l.jsx)(d.A,{ref:N,className:t,onContextMenu:R,...e,children:`@${L??O}`})}
     * getNickname(guildId, channelId, user) names the guild and the user for us.
     */
    mention: {
        find: "targetIsUser:!0})})},",
        all: true,
        replace: {
            match: /(getNickname\((\i),\i,(\i)\)\);[^]*?onContextMenu:\i,\.\.\.\i,children:)(`@\$\{\i\?\?\i\}`)/,
            with: "$1$self?.wrap?.(\"mentions\",$4,$3,$2)??$4",
        },
    },
    /**
     * A member in a voice channel in the channel list. The name is the first child of its div,
     * directly in the row component's body, whose props have user and guildId:
     *     (n=(0,i.jsxs)("div",{className:...,children:[z??$.Ay.getName(Y),w?(0,i.jsxs)("span",...
     */
    voice: {
        find: ")(\"VoiceUser\")&&null!=",
        replace: {
            match: /(children:\[)(\i\?\?\i\.\i\.getName\(\i\))(?=,\i\?\(0,\i\.jsxs\)\("span")/,
            with: "$1$self?.wrap?.(\"voice\",$2,arguments[0]?.user,arguments[0]?.guildId)??($2)",
        },
    },
    /**
     * A person in the reactions popout. Their name is a span in the row component's body, whose
     * props have user and guildId:
     *     children:null!=M&&""!==M&&(0,n.jsx)("span",{className:el.Ci,children:M})}),(0,n.jsx)(N.A,{user:s,className:null!=M&&...
     */
    reactions: {
        find: "forceUsername:!0})]})]})}),",
        replace: {
            match: /(\("span",\{className:\i\.\i,children:)(\i)(?=\}\)\}\),\(0,\i\.jsx\)\(\i\.\i,\{user:\i,className:null!=\2&&)/,
            with: "$1$self?.wrap?.(\"reactions\",$2,arguments[0]?.user,arguments[0]?.guildId)??$2",
        },
    },
} satisfies Record<string, SourcePatch>;
