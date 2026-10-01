/**
 * Live notifications: a notification that arrives while Discord is open (a review, an approval, an
 * update; renderer/inbox.ts) pops up in the corner for a few seconds. What was already in the inbox
 * when Evi started waits there, and a whole batch at once becomes a single "N new" toast.
 *
 * Hovering or focusing a toast holds it, and so does Discord being in the background: its timer is a
 * CSS animation on the bar at its foot, paused by the same rules, so what you see is what's left.
 */
import { EviNotification, freshArrivals, NotificationKind } from "@shared/notifications";

import { Inbox } from "../inbox";
import { t, timeAgo as ago, useLocale } from "../i18n";
import { Settings } from "../settings";
import { createRoot, React } from "../webpack/common";
import { Icon, IconButton, IconName, Text, useExit, useStore } from "./components";
import { DiscordContext } from "./discordContext";
import { ensureStyles, SettingsUI } from "./index";
import { openStore, showTab } from "./nav";

/** On screen at once; more wait their turn */
const VISIBLE = 3;
/** A batch bigger than this arriving together shows as one summary instead */
const BATCH = 3;

const kindIcon: Record<NotificationKind, IconName> = {
    review: "star",
    submission: "puzzle",
    theme: "palette",
    follow: "people",
    api: "code",
    wishlist: "heart",
    fixed: "circleCheck",
    update: "download",
};

type Toast =
    | { key: string; kind: "one"; n: EviNotification; }
    | { key: string; kind: "summary"; count: number; };

let shown: Toast[] = [];
const waiting: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function pump() {
    // In the background, they wait: nobody would see them go
    if (document.hidden) return;
    let changed = false;
    while (shown.length < VISIBLE && waiting.length) {
        shown = [...shown, waiting.shift()!];
        changed = true;
    }
    if (changed) emit();
}

function remove(key: string) {
    shown = shown.filter(toast => toast.key !== key);
    emit();
    pump();
}

const enabled = () => Settings.data.liveToasts !== false;

function openInbox() {
    showTab("plugins", "inbox");
    SettingsUI.open("plugins");
}

/** Goes where a notification points, like its row in the inbox */
function openNotification(n: EviNotification) {
    const link = n.link;
    if (link?.kind === "url") return void window.open(link.url, "_blank", "noopener");
    if (link?.kind === "plugin" || link?.kind === "theme") {
        openStore(link.kind, link.id);
        return SettingsUI.open(link.kind === "plugin" ? "plugins" : "themes");
    }
    openInbox();
}

function ToastCard({ toast }: { toast: Toast; }) {
    const exit = useExit(() => remove(toast.key));
    const one = toast.kind === "one" ? toast.n : undefined;
    const title = one ? one.title : t("liveToasts.summary", { count: toast.kind === "summary" ? toast.count : 0 });
    const body = one ? one.body : t("liveToasts.summaryBody");
    const open = () => {
        if (one) openNotification(one);
        else openInbox();
        exit.close();
    };

    return (
        <div className="dl-live-toast-slot" {...exit.closingProps}>
            <div className="dl-live-toast" role="status">
                <button type="button" className="dl-live-toast-main" onClick={open}>
                    <span className="dl-inbox-icon" data-kind={one?.kind ?? "update"} aria-hidden="true">
                        <Icon name={one ? kindIcon[one.kind] : "bell"} size={16} />
                    </span>
                    <span className="dl-live-toast-text">
                        <Text tag="span" variant="text-xs/medium" color="text-muted">
                            {one ? t("liveToasts.from", { time: ago(one.at) }) : t("liveToasts.fromEvi")}
                        </Text>
                        <Text tag="span" variant="text-sm/semibold" color="text-strong" className="dl-live-toast-title">{title}</Text>
                        {body && <Text tag="span" variant="text-sm/normal" color="text-subtle" className="dl-live-toast-body">{body}</Text>}
                    </span>
                </button>
                <IconButton icon="close" label={t("liveToasts.dismiss", { title })} onClick={exit.close} className="dl-live-toast-close" />
                <span className="dl-live-toast-timer" aria-hidden="true" onAnimationEnd={e => e.target === e.currentTarget && exit.close()} />
            </div>
        </div>
    );
}

function Stack() {
    useLocale();
    const list = useStore(cb => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
    }, () => shown);
    const [background, setBackground] = React.useState(document.hidden);
    React.useEffect(() => {
        const onVisibility = () => {
            setBackground(document.hidden);
            pump();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, []);

    return (
        <section className="dl-live-toasts" aria-label={t("liveToasts.region")} data-paused={background ? "" : undefined}>
            {list.map(toast => <ToastCard key={toast.key} toast={toast} />)}
        </section>
    );
}

let started = false;
/** Starts watching the inbox; call once the app is up (after Inbox.start) */
export function startLiveToasts() {
    if (started) return;
    started = true;
    ensureStyles();

    // Everything there before the first look is old news: it's in the inbox already
    const seen = new Set<string>();
    let primed = false;
    let batchId = 0;
    const prime = () => {
        if (primed) return;
        primed = true;
        for (const n of Inbox.getSnapshot()) seen.add(n.id);
    };
    // Offline or slow, evi.rest may take a while: stop waiting for it after a bit
    setTimeout(prime, 20_000);
    const look = () => {
        const list = Inbox.getSnapshot();
        if (!primed) {
            // The account's list arrives with evi.rest's first answer (or its error): wait for that
            const s = Inbox.state();
            if (s.linked !== undefined || s.error) prime();
            return;
        }
        const fresh = freshArrivals(list, seen);
        for (const n of fresh) seen.add(n.id);
        if (!fresh.length || !enabled()) return;
        if (fresh.length > BATCH) waiting.push({ key: `summary:${++batchId}`, kind: "summary", count: fresh.length });
        else waiting.push(...fresh.map(n => ({ key: n.id, kind: "one" as const, n })));
        pump();
    };
    Inbox.subscribe(look);
    look();

    // Turned off: what's showing goes too
    Settings.subscribe(() => {
        if (enabled() || (!shown.length && !waiting.length)) return;
        waiting.length = 0;
        shown = [];
        emit();
    });

    const container = document.createElement("div");
    container.className = "dl-root";
    document.body.append(container);
    createRoot(container).render(<DiscordContext><Stack /></DiscordContext>);
}
