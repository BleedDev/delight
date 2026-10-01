/**
 * Pure pieces of View Icons' Profile details: what a profile is made of (its theme gradient, banner
 * colour, display name style and nameplate) read from Discord's user and display profile. No Discord
 * or DOM access, so tests can run them.
 */

/** Discord's display name fonts and effects by id, as its own enums name them */
const FONTS: Record<number, string> = {
    1: "Bangers", 2: "BioRhyme", 3: "Cherry Bomb", 4: "Chicle", 5: "Compagnon", 6: "MuseoModerno", 7: "Néo-Castel",
    8: "Pixelify", 9: "Ribes", 10: "Sinistre", 12: "Zilla Slab", 13: "Playpen Sans", 14: "Orbitron", 15: "New Rocker",
    16: "Kalam", 17: "Hexagon",
};
const EFFECTS: Record<number, string> = {
    1: "Solid", 2: "Gradient", 3: "Neon", 4: "Toon", 5: "Pop", 6: "Glow", 7: "Prism", 8: "Gummy",
};

export interface NameStyle {
    font?: string;
    effect?: string;
    colors: string[];
    /** As Discord has it, for drawing the name with Discord's own component and applying it */
    raw: { fontId: number; effectId: number; colors: number[]; };
}

export interface ProfileDetails {
    /** Nitro profile theme: top and bottom of the profile's gradient */
    theme?: { primary: string; accent: string; };
    /** The plain banner colour shown without a banner picture */
    bannerColor?: string;
    nameStyle?: NameStyle;
    nameplate?: { name: string; skuId?: string; };
}

/** 0xRRGGBB as an int (how Discord stores profile colours) to "#rrggbb" */
export function hex(value: unknown): string | undefined {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffff) return undefined;
    return `#${value.toString(16).padStart(6, "0")}`;
}

const titleCase = (s: string) => s.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();

export function nameStyleOf(styles: any): NameStyle | undefined {
    if (!styles || typeof styles !== "object") return undefined;
    const colors = (Array.isArray(styles.colors) ? styles.colors : []).map(hex).filter((c: string | undefined): c is string => !!c);
    const fontId = Number(styles.fontId ?? styles.font_id), effectId = Number(styles.effectId ?? styles.effect_id);
    const font = FONTS[fontId] ?? (fontId > 0 ? `Font ${fontId}` : undefined);
    const effect = EFFECTS[effectId] ?? (effectId > 0 ? `Effect ${effectId}` : undefined);
    if (!colors.length && !font && !effect) return undefined;
    const raw = { fontId: fontId || 0, effectId: effectId || 0, colors: (Array.isArray(styles.colors) ? styles.colors : []).filter((c: unknown) => hex(c) !== undefined) };
    return { font, effect, colors, raw };
}

export function profileDetails(user: any, displayProfile: any): ProfileDetails {
    const details: ProfileDetails = {};
    const [primary, accent] = Array.isArray(displayProfile?.themeColors) ? displayProfile.themeColors.map(hex) : [];
    if (primary || accent) details.theme = { primary: primary ?? accent!, accent: accent ?? primary! };
    const bannerColor = hex(displayProfile?.accentColor);
    if (bannerColor) details.bannerColor = bannerColor;
    const nameStyle = nameStyleOf(user?.displayNameStyles);
    if (nameStyle) details.nameStyle = nameStyle;
    const plate = user?.collectibles?.nameplate;
    // The label is the nameplate's name; older ones only have an asset path like "nameplates/koi_pond/"
    const plateName = typeof plate?.label === "string" && plate.label && !/^[A-Z0-9_]+$/.test(plate.label) ? plate.label
        : typeof plate?.asset === "string" ? titleCase(plate.asset.split("/").filter(Boolean).pop() ?? "") : "";
    const skuId = plate?.skuId ?? plate?.sku_id;
    if (plateName) details.nameplate = { name: plateName, ...(typeof skuId === "string" || typeof skuId === "number") && /^\d+$/.test(String(skuId)) && { skuId: String(skuId) } };
    return details;
}

export const hasDetails = (d: ProfileDetails) => !!(d.theme || d.bannerColor || d.nameStyle || d.nameplate);

/** The CSS gradient a set of colours makes: one colour is a flat fill */
export function gradient(colors: string[], angle = 180) {
    if (colors.length <= 1) return colors[0] ?? "transparent";
    return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}

/** What a colour copies as: without the #, which Discord's colour fields add themselves */
export const copyText = (color: string) => color.replace(/^#/, "");

/** "#rrggbb" back to the int Discord stores */
export const toInt = (color: string) => parseInt(color.replace(/^#/, ""), 16);
