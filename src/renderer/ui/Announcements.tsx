/**
 * Announcements from Evi's team (shared/announcements.ts) show live, top and centre over Discord:
 * evi.rest says over its change stream that one was sent, and every running Evi shows it within
 * seconds. Each shows once and stays until it's closed: an announcement is worth reading, so it
 * doesn't time out. One at a time; a second waits for the first to close. One withdrawn while on
 * screen leaves. Never in Discord's in-game overlay, where Evi doesn't run at all.
 */
import type { Announcement } from "@shared/announcements";

import { t, useLocale } from "../i18n";
import { Native } from "../native";
import { Settings } from "../settings";
import { Icon, IconButton, Text, useExit, useStore } from "./components";
import { mountRoot } from "./discordContext";
import { ensureStyles } from "./index";

/** Looked at this often besides the live event, for a connection that missed it */
const EVERY = 30 * 60 * 1000;
const MAX_SEEN = 100;

let queue: Announcement[] = [];
let current: Announcement | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

const seen = () => new Set(Settings.data.announcementsSeen ?? []);

function markSeen(id: number) {
    Settings.update(d => void (d.announcementsSeen = [...new Set([id, ...(d.announcementsSeen ?? [])])].slice(0, MAX_SEEN)));
}

async function check() {
    if (!Native.announcements) return;
    const result = await Native.announcements().catch(() => undefined);
    if (!result?.ok) return;
    const live = new Set(result.value.map(a => a.id));
    const done = seen();
    // Oldest first, so they read in the order they were sent
    const fresh = [...result.value].reverse().filter(a => !done.has(a.id) && a.id !== current?.id && !queue.some(q => q.id === a.id));
    // Withdrawn: out of the queue, and off the screen
    queue = [...queue.filter(a => live.has(a.id)), ...fresh];
    if (current && !live.has(current.id)) current = undefined;
    if (!current) current = queue.shift();
    emit();
}

function next() {
    if (current) markSeen(current.id);
    current = queue.shift();
    emit();
}

function Banner({ a }: { a: Announcement; }) {
    useLocale();
    const exit = useExit(next);
    const open = () => {
        if (a.link) window.open(a.link, "_blank", "noopener,noreferrer");
        exit.close();
    };
    return (
        <div className="dl-announcement" role="status" aria-label={t("announcement.region")} {...exit.closingProps}>
            <span className="dl-announcement-icon" aria-hidden="true"><Icon name="bell" size={18} /></span>
            <span className="dl-announcement-text">
                <Text tag="span" variant="text-xs/medium" color="text-muted">{t("announcement.from")}</Text>
                <Text tag="span" variant="text-sm/semibold" color="text-strong" className="dl-announcement-title">{a.title}</Text>
                {a.body && <Text tag="span" variant="text-sm/normal" color="text-subtle" className="dl-announcement-body">{a.body}</Text>}
            </span>
            {a.link && <button type="button" className="dl-announcement-link" onClick={open}>{t("announcement.open")}</button>}
            <IconButton icon="close" label={t("announcement.close")} onClick={exit.close} />
        </div>
    );
}

function Host() {
    const a = useStore(cb => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
    }, () => current);
    // Keyed by id: the next one enters fresh after the last one's exit
    return a ? <Banner key={a.id} a={a} /> : null;
}

let started = false;
/** Once the app is up */
export function startAnnouncements() {
    if (started || !Native.announcements) return;
    started = true;
    ensureStyles();
    mountRoot(<Host />, "dl-root dl-announcements");

    void check();
    setInterval(() => void check(), EVERY);
    Native.onAnnouncementsChange?.(() => void check());
}
