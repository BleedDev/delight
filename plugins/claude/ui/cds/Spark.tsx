// The spark: an eight-ray asterisk drawn here (not a copied asset), animated with CSS.
// States: thinking (rays breathe and the mark turns), writing (a steady turn), waiting (a slow pulse).
import { rem } from "./Icon";

export type SparkState = "thinking" | "writing" | "waiting" | "shimmer" | "entrance" | "exit" | "orbiting" | "tickle";
const ACCENT = "var(--evi-claude-accent, #d97757)";

// eight rounded rays around the centre, alternating long and short
const RAYS = Array.from({ length: 8 }, (_, i) => ({ angle: i * 45, long: i % 2 === 0 }));

function Mark({ size, color, anim, className = "" }: { size: number; color: string; anim?: string; className?: string }) {
    return (
        <svg
            data-cds="Spark"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={`evi-claude-spark ${anim ? `evi-claude-spark-${anim}` : ""} ${className}`}
            style={{ width: rem(size), height: rem(size), flex: "none", color }}
            aria-hidden="true"
        >
            <g fill="currentColor">
                {RAYS.map(({ angle, long }, i) => (
                    <rect
                        key={angle}
                        className="evi-claude-ray"
                        style={{ ["--i" as any]: i }}
                        x={45}
                        y={long ? 4 : 14}
                        width={10}
                        height={long ? 46 : 36}
                        rx={5}
                        transform={`rotate(${angle} 50 50)`}
                    />
                ))}
            </g>
        </svg>
    );
}

export function StaticSpark({ size = 18, color = ACCENT, className = "" }: { size?: number; color?: string; className?: string }) {
    return <Mark size={size} color={color} className={className} />;
}

export function Spark({ state, size = 18, color = ACCENT, className = "" }: { state?: SparkState | null; size?: number; color?: string; className?: string; onEnd?: () => void }) {
    const anim = state === "thinking" || state === "orbiting" ? "thinking" : state === "writing" || state === "shimmer" ? "writing" : state === "waiting" ? "waiting" : undefined;
    return <Mark size={size} color={color} anim={anim} className={className} />;
}
