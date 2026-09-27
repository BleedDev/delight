/**
 * Claude: Claude Code (and Codex) sessions inside Discord.
 *
 * How it hooks into Discord (everything below is undone when the plugin stops):
 *  - DM list: a "Coding Agents" row under Message Requests, and pinned sessions above the DMs. They're clones of
 *    Discord's own rows, kept in sync from a MutationObserver. Opening Coding Agents slides the DM list out and the
 *    sessions list in (same sidebar), and covers the page area with the agents view.
 *  - Chat header: a button that attaches a session to the conversation; attached sessions render beside the chat.
 *  - Slash commands (/claude, /catchup, /summarize, /draft, /todo) through ctx.command. Their answers are local
 *    messages from "Claude" with a live card inside.
 *  - The agent UI renders in shadow roots with claude.ai's Code stylesheet (vendor/), colored by Discord's theme.
 *
 * The CLIs run in native.ts (host/): the user's own `claude` (and optionally `codex`) on their own login.
 */
import { definePlugin, type PluginContext } from "@evi/api";
import { mountShadow, uninstallGlobal, type ShadowMount } from "./ui/cds/shadow";
import { useAgents, loadChats, installAgentEvents, setView, updateChat, rt, restoreLive, newChat, sendPrompt, stopSession } from "./ui/store";
import { installDiscordTools, disposeDiscordTools, Stores, channelLabel, watchChannel, Router } from "./ui/discord";
import { setDiscordNamer } from "./ui/epitaxy/labels";
import { AgentsView, SessionList } from "./ui/components/AgentsView";
import { installMentions } from "./ui/mentions";
import { ChatPanel } from "./ui/epitaxy/ChatPanel";
import { Toasts } from "./ui/epitaxy/Toasts";
import { SettingsPanel } from "./ui/settings";
import { connectNative, loadEnv, N } from "./ui/native";
import { connectKv, kv } from "./ui/kv";
import pageCss from "./page.css" with { type: "text" };
import sparkPath from "./vendor/spark-path.txt" with { type: "text" };

type Settings = typeof settings;
const settings = {
    commands: { type: "boolean", label: "Slash commands", description: "/claude, /catchup, /summarize, /draft and /todo in Discord's slash menu. They run locally and answer with a message only you can see.", default: true },
    "mention.placement": {
        type: "select", label: "New sessions from slash commands", default: "background",
        options: [{ label: "Run in the background", value: "background" }, { label: "Open beside the chat", value: "beside" }],
    },
    lastProvider: {
        type: "select", label: "Default agent", description: "Which CLI new sessions run: your Claude Code login, or your Codex (ChatGPT) login.", default: "claude",
        options: [{ label: "Claude Code", value: "claude" }, { label: "Codex", value: "codex" }],
    },
    headerButton: { type: "boolean", label: "Chat header button", description: "A button in each chat's header that opens a session beside the conversation.", default: true },
    toasts: { type: "boolean", label: "In-app notices", description: "A notice when a session needs you or finishes while you're elsewhere in Discord.", default: true },
    osNotifications: { type: "boolean", label: "System notifications", description: "Desktop notifications while Discord isn't focused.", default: true },
    "notify.approval": { type: "boolean", label: "Notify for approval requests", default: true },
    "notify.question": { type: "boolean", label: "Notify for questions", default: true },
    "notify.done": { type: "boolean", label: "Notify when a session finishes", default: true },
    "notify.sound": { type: "boolean", label: "Notification sound", default: true },
    keepAwake: { type: "boolean", label: "Keep the computer awake", description: "While a session is working, stop the computer from sleeping.", default: false },
    allowBypass: { type: "boolean", label: "Allow bypass permissions mode", description: "Offer \"Bypass permissions\" in the mode menu and the plan card. Discord actions still ask, unless the session is in Bypass and you started the turn.", default: true },
} as const;

let context: PluginContext<Settings> | undefined;
const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const ACCENT = "#d97757";

function sparkSvg(size: number, fill = "currentColor") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="${fill}" aria-hidden="true"><path d="${sparkPath}"/></svg>`;
}

// ---------------------------------------------------------------- DM list rows
function cloneRow(template: HTMLElement, id: string) {
    const li = template.cloneNode(true) as HTMLElement;
    li.dataset.eviClaude = id;
    li.removeAttribute("aria-setsize");
    const a = li.querySelector("a") as HTMLAnchorElement;
    a.removeAttribute("href");
    a.removeAttribute("data-list-item-id");
    a.style.cursor = "pointer";
    li.querySelector("[class*=\"numberBadge\"]")?.remove();
    return li;
}
function setBadge(li: HTMLElement, count: number) {
    let b = li.querySelector(".evi-claude-row-badge") as HTMLElement | null;
    if (!count) return b?.remove();
    if (!b) {
        b = document.createElement("span");
        b.className = "evi-claude-row-badge";
        li.querySelector("a")!.appendChild(b);
    }
    if (b.textContent !== String(count)) b.textContent = String(count);
}
function setSelected(li: HTMLElement, on: boolean) {
    const box = li.firstElementChild as HTMLElement;
    for (const c of Array.from(box.classList)) if (/^interactiveSelected_|^selected_/.test(c)) box.classList.remove(c);
    if (on) {
        const ref = document.querySelector("nav[class*=\"privateChannels_\"] [class*=\"interactiveSelected_\"]");
        const cls = ref ? Array.from(ref.classList).filter(c => /^interactiveSelected_|^selected_/.test(c)) : [];
        box.classList.add(...(cls.length ? cls : ["evi-claude-selected"]));
    }
}

function injectSidebar() {
    const nav = q("nav[class*=\"privateChannels_\"]");
    if (!nav) return;
    const mr = q<HTMLAnchorElement>("a[href=\"/message-requests\"]", nav)?.closest("li") as HTMLElement | null;
    if (!mr) return;
    const s = useAgents.getState();
    let row = q<HTMLElement>("li[data-evi-claude=\"agents\"]", nav);
    if (!row) {
        row = cloneRow(mr, "agents");
        row.querySelector("[class*=\"name_\"]")!.textContent = "Coding Agents";
        (row.querySelector("[class*=\"avatar_\"]") as HTMLElement).innerHTML = `<span class="evi-claude-row-icon">${sparkSvg(22, ACCENT)}</span>`;
        row.addEventListener("click", e => {
            e.preventDefault();
            setView({ open: true, activeId: null });
        });
        mr.after(row);
    }
    setBadge(row, s.chats.reduce((n, c) => n + rt(c.localId).permissions.length + (c.unread ?? 0), 0));
    setSelected(row, s.open && !s.activeId);

    // pinned sessions sit at the top of the DM list
    const firstDm = q<HTMLAnchorElement>("a[href^=\"/channels/@me/\"]", nav)?.closest("li") as HTMLElement | null;
    const pinned = s.chats.filter(c => c.pinned);
    for (const el of Array.from(nav.querySelectorAll<HTMLElement>("li[data-evi-claude^=\"pin:\"]")))
        if (!pinned.some(c => "pin:" + c.localId === el.dataset.eviClaude) && !el.dataset.eviClaudeLeaving) {
            // unpinned: fold away, then remove
            el.dataset.eviClaudeLeaving = "1";
            el.style.height = `${el.offsetHeight}px`;
            void el.offsetHeight;
            el.classList.add("evi-claude-pin-out");
            setTimeout(() => el.remove(), 240);
        }
    if (firstDm) {
        for (const c of pinned) {
            let li = q<HTMLElement>(`li[data-evi-claude="pin:${c.localId}"]`, nav);
            if (!li) {
                li = cloneRow(mr, "pin:" + c.localId);
                li.classList.add("evi-claude-agent-row", "evi-claude-pin-in");
                li.draggable = true;
                li.addEventListener("dragstart", e => e.dataTransfer!.setData("evi-claude/agent", c.localId));
                li.addEventListener("click", e => {
                    e.preventDefault();
                    setView({ open: true, activeId: c.localId });
                });
                firstDm.before(li);
            }
            const av = li.querySelector("[class*=\"avatar_\"]") as HTMLElement;
            const busy = rt(c.localId).busy;
            if (av.dataset.eviClaudeState !== (busy ? "busy" : "idle")) {
                av.dataset.eviClaudeState = busy ? "busy" : "idle";
                av.innerHTML = `<div class="evi-claude-avatar ${busy ? "busy" : ""}" style="width:32px;height:32px">${sparkSvg(18)}</div>`;
            }
            const nameEl = li.querySelector("[class*=\"name_\"]")!;
            if (nameEl.textContent !== c.title) nameEl.textContent = c.title;
            setBadge(li, rt(c.localId).permissions.length + (c.unread ?? 0));
            setSelected(li, s.open && s.activeId === c.localId);
        }
    }
    // drop a session onto a DM to attach it to that conversation
    for (const a of Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href^=\"/channels/@me/\"]"))) {
        const li = a.closest("li") as HTMLElement;
        if (!li || li.dataset.eviClaudeDrop) continue;
        li.dataset.eviClaudeDrop = "1";
        li.addEventListener("dragover", e => {
            if (e.dataTransfer?.types.includes("evi-claude/agent")) {
                e.preventDefault();
                li.classList.add("evi-claude-drop");
            }
        });
        li.addEventListener("dragleave", () => li.classList.remove("evi-claude-drop"));
        li.addEventListener("drop", e => {
            li.classList.remove("evi-claude-drop");
            const id = e.dataTransfer?.getData("evi-claude/agent");
            if (!id) return;
            e.preventDefault();
            attach(id, a.getAttribute("href")!.split("/").pop()!);
        });
    }
}

export function attach(localId: string, channelId: string) {
    for (const c of useAgents.getState().chats) if (c.attachedChannelId === channelId && c.localId !== localId) updateChat(c.localId, { attachedChannelId: null });
    updateChat(localId, { attachedChannelId: channelId });
    stopSession(localId); // restarts with the new Discord context on the next message
}

const defaultCwd = () => kv.get<string | null>("lastCwd", null) ?? N().env.home;

// ---------------------------------------------------------------- chat header button
function injectHeaderButton() {
    if (!context?.settings.get("headerButton")) return document.querySelector("[data-evi-claude=\"header-agent\"]")?.remove();
    const tb = q("section[class*=\"title_\"] [class*=\"toolbar_\"]");
    const channelId = Stores.SelectedChannel()?.getChannelId?.();
    if (!tb || !channelId || useAgents.getState().open) return;
    const ref = Array.from(tb.children).find(c => (c as HTMLElement).getAttribute("aria-label") === "Pinned Messages" || (c as HTMLElement).querySelector?.("[aria-label=\"Pinned Messages\"]")) as HTMLElement | undefined;
    let btn = tb.querySelector<HTMLElement>("[data-evi-claude=\"header-agent\"]");
    if (!btn && ref) {
        btn = ref.cloneNode(true) as HTMLElement;
        btn.dataset.eviClaude = "header-agent";
        btn.querySelectorAll("[class*=\"selected\"]").forEach(e => e.classList.forEach(c => /selected/.test(c) && e.classList.remove(c)));
        const svg = btn.querySelector("svg");
        if (svg) svg.outerHTML = sparkSvg(22);
        btn.addEventListener("click", async e => {
            e.preventDefault();
            e.stopPropagation();
            const cid = Stores.SelectedChannel()?.getChannelId?.();
            if (!cid) return;
            const st = useAgents.getState();
            if (st.panelFor[cid]) return updateChat(st.panelFor[cid], { attachedChannelId: null });
            // a fresh session for this conversation (drag an existing one onto the DM to reuse it)
            const chat = await newChat({ cwd: defaultCwd(), title: `Discord · ${channelLabel(Stores.Channel()?.getChannel(cid))}`, attachedChannelId: cid });
            if (chat) setView({ open: false });
        });
        ref.before(btn);
    }
    if (btn) {
        const on = !!useAgents.getState().panelFor[channelId];
        const label = on ? "Hide the Claude panel" : "Open Claude for this chat";
        if (btn.getAttribute("aria-label") !== label) {
            btn.setAttribute("aria-label", label);
            btn.querySelector("[aria-label]")?.setAttribute("aria-label", label);
        }
        btn.style.color = on ? ACCENT : "";
    }
}

// ---------------------------------------------------------------- ⌘⇧↵ in Discord's message box: ask this chat's agent
async function onComposerKey(e: KeyboardEvent) {
    if (!(e.key === "Enter" && e.shiftKey && (e.metaKey || e.ctrlKey))) return;
    const box = (e.target as HTMLElement)?.closest?.("[role=\"textbox\"][data-slate-editor]") as HTMLElement | null;
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    const text = box.innerText.trim();
    const cid = Stores.SelectedChannel()?.getChannelId?.();
    if (!text || !cid) return;
    const st = useAgents.getState();
    let chat = st.panelFor[cid] ? st.chats.find(c => c.localId === st.panelFor[cid]) : undefined;
    if (!chat) {
        chat = (await newChat({ cwd: defaultCwd(), title: `Discord · ${channelLabel(Stores.Channel()?.getChannel(cid))}`, attachedChannelId: cid })) ?? undefined;
        setView({ open: false });
    }
    if (!chat) return;
    // clear Discord's draft (it was meant for Claude, not the chat)
    box.focus();
    document.execCommand("selectAll");
    document.execCommand("delete");
    sendPrompt(useAgents.getState().chats.find(c => c.localId === chat!.localId) ?? chat, text);
}

// ---------------------------------------------------------------- the agents page, the sessions list, the attached panel
let overlay: { el: HTMLElement; root: ShadowMount; } | null = null;
let sidebar: { el: HTMLElement; root: ShadowMount; list: HTMLElement; nav: HTMLElement; } | null = null;
let panel: { el: HTMLElement; grip: HTMLElement; root: ShadowMount; chatId: string; } | null = null;
let keepOpenOnNav = false;

function syncOverlay() {
    const s = useAgents.getState();
    document.body.classList.toggle("evi-claude-agents-open", s.open);
    const page = q("[class^=\"base__\"] [class^=\"page__\"]");
    if (!s.open || !page) {
        if (overlay) overlay.el.style.display = "none";
        return;
    }
    if (!overlay || !page.contains(overlay.el)) {
        if (overlay) (overlay.root.unmount(), overlay.el.remove());
        const el = document.createElement("div");
        el.className = "evi-claude-root evi-claude-overlay";
        el.dataset.eviClaude = "page";
        page.appendChild(el);
        const root = mountShadow(el, { density: "compact" });
        root.render(<AgentsView />);
        overlay = { el, root };
    }
    overlay.el.style.display = "";
}

// the sessions slide in over the DM list while the agents page is open (no third sidebar)
function syncSidebarList() {
    const s = useAgents.getState();
    const nav = q("nav[class^=\"privateChannels_\"]");
    const list = nav?.parentElement as HTMLElement | null;
    if (!list || !nav) {
        // opened from a server (⌘⇧J, a notice…): the sessions live in the DM sidebar, so hop to the DM home
        if (s.open && !location.pathname.startsWith("/channels/@me")) {
            keepOpenOnNav = true;
            Router()?.transitionTo?.("/channels/@me");
        }
        return;
    }
    if (!sidebar || !list.contains(sidebar.el)) {
        if (sidebar) (sidebar.root.unmount(), sidebar.el.remove());
        const el = document.createElement("div");
        el.className = "evi-claude-root evi-claude-sb-host";
        el.dataset.eviClaude = "sessions";
        list.style.position ||= "relative";
        list.appendChild(el);
        const root = mountShadow(el, { density: "compact", detachedPortal: true });
        root.render(<SessionList />);
        sidebar = { el, root, list, nav };
    }
    if (list.classList.contains("evi-claude-sb-on") !== s.open) {
        list.classList.toggle("evi-claude-sb-on", s.open);
        sidebar.el.inert = !s.open;
        nav.inert = s.open;
    }
}

function removePanel() {
    if (!panel) return;
    panel.root.unmount();
    panel.grip.remove();
    panel.el.remove();
    panel = null;
}
function syncPanel() {
    const s = useAgents.getState();
    const channelId = Stores.SelectedChannel()?.getChannelId?.();
    const chatId = channelId ? s.panelFor[channelId] : undefined;
    const content = q("[class^=\"chat_\"] > [class^=\"content_\"]");
    if (!chatId || !content || s.open) return removePanel();
    if (panel && content.contains(panel.el) && panel.chatId === chatId) return;
    removePanel();
    const el = document.createElement("aside");
    el.className = "evi-claude-root evi-claude-panel";
    el.dataset.eviClaude = "panel";
    el.style.width = `${kv.get("panelWidth", 420)}px`;
    // drag the left edge to resize (remembered)
    const grip = document.createElement("div");
    grip.className = "evi-claude-panel-grip";
    grip.dataset.eviClaude = "grip";
    grip.addEventListener("pointerdown", e => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = el.getBoundingClientRect().width;
        const move = (ev: PointerEvent) => void (el.style.width = `${Math.max(320, Math.min(window.innerWidth * 0.7, startW + (startX - ev.clientX)))}px`);
        const up = () => {
            grip.removeEventListener("pointermove", move);
            grip.removeEventListener("pointerup", up);
            kv.set("panelWidth", Math.round(el.getBoundingClientRect().width));
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
    });
    content.appendChild(el);
    el.before(grip);
    const root = mountShadow(el, { density: "compact" });
    root.render(<AttachedPanel chatId={chatId} />);
    panel = { el, grip, root, chatId };
}
function AttachedPanel({ chatId }: { chatId: string; }) {
    const chat = useAgents(s => s.chats.find(c => c.localId === chatId));
    if (!chat) return null;
    return <ChatPanel key={chat.localId} chat={chat} compact onClose={() => updateChat(chat.localId, { attachedChannelId: null })} />;
}

// ---------------------------------------------------------------- the plugin
export default definePlugin({
    settings,
    css: pageCss,

    async start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));
        connectKv(ctx);
        connectNative(ctx);
        await loadEnv();
        installDiscordTools();
        ctx.onDispose(disposeDiscordTools);
        ctx.onDispose(uninstallGlobal);
        setDiscordNamer(id => {
            const c = Stores.Channel()?.getChannel(id);
            return c ? (c.guild_id ? "#" : "") + channelLabel(c) : undefined;
        });
        const offEvents = installAgentEvents();
        if (typeof offEvents === "function") ctx.onDispose(offEvents);

        // notification preferences live in the main process (it shows them)
        const pushPrefs = () => N().agents.setNotifications({
            enabled: ctx.settings.get("osNotifications"),
            approval: ctx.settings.get("notify.approval"),
            question: ctx.settings.get("notify.question"),
            done: ctx.settings.get("notify.done"),
            sound: ctx.settings.get("notify.sound"),
        }).catch(() => { });
        pushPrefs();
        ctx.settings.onChange(pushPrefs);

        // keep the computer awake while any session works (setting)
        let awake = false;
        const keepAwake = () => {
            const want = !!ctx.settings.get("keepAwake") && Object.values(useAgents.getState().runtimes).some(r => r.busy);
            if (want !== awake) (awake = want), N().agents.keepAwake(want).catch(() => { });
        };
        ctx.onDispose(useAgents.subscribe(keepAwake));
        ctx.onDispose(() => void (awake && N().agents.keepAwake(false).catch(() => { })));

        await loadChats();
        await restoreLive();

        // leaving the agents view when Discord navigates somewhere else
        let last = location.pathname;
        const checkNav = () => {
            if (location.pathname === last) return;
            last = location.pathname;
            if (keepOpenOnNav) return void (keepOpenOnNav = false); // our own hop to the DM home
            if (useAgents.getState().open) setView({ open: false });
        };
        ctx.hook.after(history, "pushState", checkNav);
        ctx.hook.after(history, "replaceState", checkNav);
        const listen = <K extends keyof WindowEventMap>(target: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void, capture = true) => {
            target.addEventListener(type, fn as any, capture);
            ctx.onDispose(() => target.removeEventListener(type, fn as any, capture));
        };
        listen(window, "popstate", checkNav);
        // ⌘⇧J / Ctrl+Shift+J toggles the agents page from anywhere in Discord
        listen(window, "keydown", e => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "j") {
                e.preventDefault();
                e.stopPropagation();
                setView({ open: !useAgents.getState().open });
            }
        });
        listen(document, "keydown", e => void onComposerKey(e));
        // clicking a real Discord destination (even the one already selected) leaves the agents view
        listen(document, "click", e => {
            if (!useAgents.getState().open) return;
            const path = e.composedPath() as HTMLElement[];
            if (path.some(el => el instanceof HTMLElement && el.dataset?.eviClaude)) return;
            const a = path.find(el => el instanceof HTMLAnchorElement && /^\/(channels|message-requests|store|shop|discovery|quest|activities|library)/.test(el.getAttribute("href") ?? ""));
            const guild = path.find(el => el instanceof HTMLElement && el.getAttribute?.("data-list-item-id")?.startsWith("guildsnav___"));
            if (a || guild) setView({ open: false });
        });

        installMentions(ctx);

        // keep our pieces of Discord's page in sync
        let queued = false;
        const tick = () => {
            queued = false;
            if (!context) return;
            try {
                injectSidebar();
                injectHeaderButton();
                syncOverlay();
                syncSidebarList();
                syncPanel();
            } catch (e) {
                ctx.logger.error("sync", e);
            }
        };
        const schedule = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(tick);
        };
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
        ctx.onDispose(() => observer.disconnect());
        ctx.onDispose(useAgents.subscribe(schedule));
        ctx.settings.onChange(schedule);

        // in-app notices in their own layer above Discord
        const toastHost = document.createElement("div");
        toastHost.className = "evi-claude-root";
        toastHost.dataset.eviClaude = "toasts";
        toastHost.style.cssText = "position:fixed;inset:auto 0 0 auto;z-index:10000;width:0;height:0";
        document.body.appendChild(toastHost);
        const toasts = mountShadow(toastHost, { density: "compact" });
        toasts.render(<Toasts />);
        ctx.onDispose(() => (toasts.unmount(), toastHost.remove()));

        // channel watches follow sessions that have "watch" on
        const armed = new Map<string, string>(); // localId -> channelId
        const syncWatches = () => {
            const want = new Map(useAgents.getState().chats.filter(c => c.watching && c.attachedChannelId).map(c => [c.localId, c.attachedChannelId!]));
            for (const [id, ch] of armed) if (want.get(id) !== ch) (watchChannel(id, ch, false), armed.delete(id));
            for (const [id, ch] of want) if (!armed.has(id)) (watchChannel(id, ch, true), armed.set(id, ch));
        };
        syncWatches();
        ctx.onDispose(useAgents.subscribe(syncWatches));

        ctx.onDispose(() => {
            // everything we put into Discord's page
            removePanel();
            if (overlay) (overlay.root.unmount(), overlay.el.remove(), (overlay = null));
            if (sidebar) {
                sidebar.root.unmount();
                sidebar.el.remove();
                sidebar.list.classList.remove("evi-claude-sb-on");
                sidebar.nav.inert = false;
                sidebar = null;
            }
            document.querySelectorAll("[data-evi-claude]").forEach(el => el.remove());
            document.body.classList.remove("evi-claude-agents-open");
            useAgents.setState({ open: false } as any);
        });
        schedule();
    },

    settingsPanel() {
        return <SettingsPanel />;
    },
});
