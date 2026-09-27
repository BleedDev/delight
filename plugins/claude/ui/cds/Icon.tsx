// CDS Icon: Anthropicons-Variable glyphs, sized and weighted exactly like claude.ai's Icon component.
import type { CSSProperties } from "react";
import manifest from "../../vendor/icons.json";

export type IconName = keyof typeof manifest.icons;
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const SIZES: Record<IconSize, { px: number; regular: number; strong?: number }> = {
    xs: { px: 12, regular: 0.8 },
    sm: { px: 16, regular: 1, strong: 1.25 },
    md: { px: 20, regular: 1.2, strong: 1.5 },
    lg: { px: 24, regular: 1.4 },
    xl: { px: 28, regular: 1.6 },
    xxl: { px: 32, regular: 1.8 },
};
const ORDER: IconSize[] = ["xs", "sm", "md", "lg", "xl", "xxl"];
const WGHT = manifest.wght as Record<string, { lo: number; hi: number }>;

export const rem = (px: number) => `calc(${px / 16}rem * var(--cds-rem-scale, 1))`;

// stroke width at a rendered size -> variable-font weight (400..700), same curve as the source
function weight(stroke: number, px: number) {
    const master = px <= 18 ? 16 : 20;
    const r = (stroke * master) / px;
    const { lo, hi } = WGHT[master];
    const w = 400 + 300 * ((r - lo) / (hi - lo));
    return Math.round(Math.max(400, Math.min(700, w)) * 10) / 10;
}
function nearest(px: number): IconSize {
    let best: IconSize = "md";
    let d = Infinity;
    for (const s of ORDER) {
        const x = Math.abs(SIZES[s].px - px);
        if (x <= d) ((d = x), (best = s));
    }
    return best;
}

export function iconStyle(size: IconSize | number = "md", bold = false): CSSProperties {
    const preset = typeof size === "number" ? SIZES[nearest(size)] : SIZES[size];
    const px = typeof size === "number" ? size : preset.px;
    const stroke = bold && preset.strong ? preset.strong : preset.regular;
    return { fontSize: rem(px), fontWeight: weight(stroke, px) };
}

const ANIM = new Set<string>(manifest.anim);

export function Icon({
    name,
    size = "md",
    bold,
    animated,
    className,
    style,
    label,
}: {
    name: IconName;
    size?: IconSize | number;
    bold?: boolean;
    animated?: boolean;
    className?: string;
    style?: CSSProperties;
    label?: string;
}) {
    const cp = manifest.icons[name];
    const secondary = (manifest.secondary as Record<string, number>)[name];
    const base = iconStyle(size, bold);
    const anim = animated && ANIM.has(name);
    const st: any = anim ? { ...base, "--cds-opsz": (typeof size === "number" ? size : SIZES[size].px) <= 18 ? 16 : 20, "--cds-wght": base.fontWeight } : base;
    if (anim) {
        const dur = (manifest.animDur as any)[name];
        const out = (manifest.animDurOut as any)[name];
        const ease = (manifest.animEase as any)[name];
        if (dur !== undefined) st["--cds-anim-dur"] = `${dur}ms`;
        if (out !== undefined) st["--cds-anim-dur-out"] = `${out}ms`;
        if (ease !== undefined) st["--cds-anim-ease"] = ease;
    }
    return (
        <span
            data-cds="Icon"
            data-cds-anim={anim ? "" : undefined}
            data-cds-anim-loop={anim && manifest.animLoop.includes(name) ? "" : undefined}
            className={className}
            style={style ? { ...st, ...style } : st}
            role={label ? "img" : undefined}
            aria-hidden={label ? undefined : true}
            aria-label={label}
        >
            {secondary !== undefined && (
                <span data-cds-icon-layer="secondary" aria-hidden="true">
                    {String.fromCodePoint(secondary)}
                </span>
            )}
            {cp === undefined ? null : String.fromCodePoint(cp)}
        </span>
    );
}
