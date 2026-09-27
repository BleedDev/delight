import type { CSSProperties, ReactNode } from "react";

// ShimmerText: a soft gradient sweep across text while something is in progress.
const SHIMMER =
    "bg-clip-text [-webkit-text-fill-color:transparent] bg-no-repeat [background-size:400%_100%] [background-position:83.333%_0%] animate-[cds-shimmer-text-shine_3s_linear_infinite] motion-reduce:animate-none motion-reduce:bg-none dark:motion-reduce:bg-none motion-reduce:[-webkit-text-fill-color:currentcolor] forced-colors:animate-none forced-colors:bg-none forced-colors:[-webkit-text-fill-color:CanvasText]";
const VARIANT = {
    default:
        "[background-image:linear-gradient(120deg,var(--cds-text-primary)_37.5%,color-mix(in_srgb,var(--cds-text-primary)_30%,white)_50%,var(--cds-text-primary)_62.5%)] dark:[background-image:linear-gradient(120deg,var(--cds-text-secondary)_37.5%,var(--cds-text-primary)_50%,var(--cds-text-secondary)_62.5%)] motion-reduce:text-primary dark:motion-reduce:text-secondary",
    secondary:
        "[background-image:linear-gradient(120deg,var(--cds-text-secondary)_37.5%,var(--cds-text-primary)_50%,var(--cds-text-secondary)_62.5%)] dark:[background-image:linear-gradient(120deg,var(--cds-text-muted)_37.5%,var(--cds-text-secondary)_50%,var(--cds-text-muted)_62.5%)] motion-reduce:text-secondary dark:motion-reduce:text-muted",
    muted: "[background-image:linear-gradient(120deg,var(--cds-text-muted)_37.5%,var(--cds-text-secondary)_50%,var(--cds-text-muted)_62.5%)] motion-reduce:text-muted",
};

export function ShimmerText({
    active,
    variant = "default",
    className = "",
    style,
    children,
    title,
}: {
    active?: boolean;
    variant?: keyof typeof VARIANT;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
    title?: string;
}) {
    return (
        <span
            data-cds="ShimmerText"
            data-shimmering={active ? "true" : "false"}
            className={active ? `${SHIMMER} ${VARIANT[variant]} ${className}` : className}
            style={style}
            title={title}
        >
            {children}
        </span>
    );
}
