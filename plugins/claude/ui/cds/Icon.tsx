// Icons: Lucide (ISC license, https://lucide.dev) drawn as inline SVG in the current text colour.
// The names are the UI's own vocabulary; each maps to the closest Lucide glyph.
import type { CSSProperties } from "react";
import * as L from "lucide";

type Node = L.IconNode;

const MAP = {
    Add: L.Plus,
    AddCircle: L.CirclePlus,
    AddLarge: L.Plus,
    Agent: L.Bot,
    Archive: L.Archive,
    ArrowClockwise: L.RotateCw,
    ArrowCounterClockwise: L.RotateCcw,
    ArrowLeft: L.ArrowLeft,
    ArrowRight: L.ArrowRight,
    ArrowOutSquare: L.SquareArrowOutUpRight,
    ArrowReturn: L.CornerDownLeft,
    ArrowSplitRight: L.Split,
    Attachment: L.Paperclip,
    Bookmark: L.Bookmark,
    CaretDown: L.ChevronDown,
    CaretRight: L.ChevronRight,
    CaretUp: L.ChevronUp,
    ChangesPlusMinus: L.Diff,
    Chat: L.MessageCircle,
    ChatAdd: L.MessageCirclePlus,
    ChatSimple: L.MessageSquare,
    Check: L.Check,
    CheckCircle: L.CircleCheck,
    CheckCircleFilled: L.CircleCheckBig,
    Checklist: L.ListChecks,
    Clock: L.Clock,
    CloudSlash: L.CloudOff,
    Code: L.Code,
    CommandLine: L.SquareTerminal,
    Connectors: L.Plug,
    Copy: L.Copy,
    DotsCircle: L.CircleEllipsis,
    DotsHorizontal: L.Ellipsis,
    DotsVertical: L.EllipsisVertical,
    Edit: L.Pencil,
    EditFilled: L.PencilLine,
    ExtendedThinking: L.Brain,
    Eye: L.Eye,
    EyeSlash: L.EyeOff,
    File: L.File,
    FileAdd: L.FilePlus,
    Files: L.Files,
    Filter: L.SlidersHorizontal,
    Folder: L.Folder,
    FolderOpen: L.FolderOpen,
    FolderPlus: L.FolderPlus,
    GitBranch: L.GitBranch,
    GitMergedSimple: L.GitMerge,
    GitPullRequest: L.GitPullRequest,
    GitPullRequestClosed: L.GitPullRequestClosed,
    GitPullRequestDraft: L.GitPullRequestDraft,
    Globe: L.Globe,
    Hand: L.Hand,
    Help: L.CircleHelp,
    History: L.History,
    Info: L.Info,
    Key: L.KeyRound,
    Laptop: L.Laptop,
    LaptopSlash: L.MonitorOff,
    Lightbulb: L.Lightbulb,
    Lightning: L.Zap,
    LinkSimple: L.Link,
    ListBullet: L.List,
    Microphone: L.Mic,
    Notification: L.Bell,
    PaperPlane: L.Send,
    Pin: L.Pin,
    PinFilled: L.Pin,
    PinSlash: L.PinOff,
    Placeholder: L.Circle,
    Plugin: L.Puzzle,
    Scroll: L.ScrollText,
    Search: L.Search,
    Settings: L.Settings,
    SidebarClose: L.PanelLeftClose,
    SidebarOpen: L.PanelLeftOpen,
    SlashShortcutCommand: L.SquareSlash,
    Speaker: L.Volume2,
    StopCircle: L.CircleStop,
    TextAlignLeft: L.TextAlignStart,
    Trash: L.Trash2,
    User: L.User,
    Users: L.Users,
    UsageGaugeHigh: L.Gauge,
    Warning: L.TriangleAlert,
    Wrench: L.Wrench,
    X: L.X,
    XCircle: L.CircleX,
} satisfies Record<string, L.IconNode>;

export type IconName = keyof typeof MAP;
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const PX: Record<IconSize, number> = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28, xxl: 32 };

export const rem = (px: number) => `calc(${px / 16}rem * var(--cds-rem-scale, 1))`;

export function iconStyle(size: IconSize | number = "md"): CSSProperties {
    const px = typeof size === "number" ? size : PX[size];
    return { width: rem(px), height: rem(px) };
}

export function Icon({
    name,
    size = "md",
    bold,
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
    const node = MAP[name] as Node | undefined;
    const px = typeof size === "number" ? size : PX[size];
    // thinner strokes at small sizes, like the text around them
    const stroke = (bold ? 2.25 : 2) * (px <= 12 ? 1.1 : px <= 16 ? 1 : 0.9);
    return (
        <svg
            data-cds="Icon"
            className={`evi-claude-icon ${className ?? ""}`}
            viewBox="0 0 24 24"
            width={px}
            height={px}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ...iconStyle(size), flex: "none", ...style }}
            role={label ? "img" : undefined}
            aria-hidden={label ? undefined : true}
            aria-label={label}
        >
            {node?.map(([tag, attrs], i) => {
                const Tag = tag as any;
                return <Tag key={i} {...(attrs as any)} />;
            })}
        </svg>
    );
}
