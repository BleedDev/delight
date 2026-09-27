// CDS Spark: Claude's asterisk. Static SVG, or an animated sprite strip (thinking, writing, waiting…)
// stepped with the Web Animations API exactly like claude.ai does.
import { useEffect, useRef } from "react";
import sprites from "../../vendor/spark-sprites.json";
import sparkPath from "../../vendor/spark-path.txt" with { type: "text" };
import { rem } from "./Icon";

export type SparkState = keyof typeof sprites;
const ONE_SHOT = new Set(["entrance", "exit", "tickle"]);
const CLAY = "var(--cds-clay, #d97757)";

export function StaticSpark({ size = 18, color = CLAY, className = "" }: { size?: number; color?: string; className?: string }) {
    return (
        <svg
            data-cds="Spark"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={`h-[var(--cds-spark-size)] w-[var(--cds-spark-size)] shrink-0 ${className}`}
            fill={color}
            aria-hidden="true"
            style={{ ["--cds-spark-size" as any]: rem(size) }}
        >
            <path d={sparkPath} />
        </svg>
    );
}

export function Spark({
    state,
    size = 18,
    color = CLAY,
    className = "",
    onEnd,
}: {
    state?: SparkState | null;
    size?: number;
    color?: string;
    className?: string;
    onEnd?: () => void;
}) {
    const strip = useRef<HTMLSpanElement>(null);
    const sprite = state ? sprites[state] : null;
    useEffect(() => {
        const el = strip.current;
        if (!sprite || !el || typeof el.animate !== "function") return;
        const { frameCount, speed } = sprite;
        const once = ONE_SHOT.has(state!);
        const frames = Array.from({ length: frameCount }, (_, n) => ({ transform: `translateY(-${(100 / frameCount) * n}%)` }));
        const a = el.animate(frames, { duration: speed * frameCount, iterations: once ? 1 : Infinity, easing: `steps(${frameCount}, jump-none)`, fill: "forwards" });
        if (once && onEnd) a.addEventListener("finish", onEnd);
        return () => a.cancel();
    }, [sprite, state]);
    if (!sprite) return <StaticSpark size={size} color={color} className={className} />;
    return (
        <span
            data-cds="Spark"
            aria-hidden="true"
            className={`relative inline-block overflow-hidden select-none [@media(max-resolution:1.99dppx)]:[clip-path:inset(1px_0)] ${className}`}
            style={{ width: rem(size), height: rem((sprite.height / sprite.width) * size), color }}
        >
            <span
                ref={strip}
                data-cds-spark-strip=""
                className="absolute inset-x-0 top-0 block [&>svg]:block [&>svg]:w-full [&>svg]:fill-current"
                dangerouslySetInnerHTML={{ __html: sprite.svg }}
            />
        </span>
    );
}
