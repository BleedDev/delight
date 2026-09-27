// Claude Code web composer: editor, / and @ typeaheads, attachments, chin (add, mode, model, effort, usage), send/stop, queue.
import { N } from "../native";
import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
    useAgents,
    rt,
    rewindTo,
    runShell,
    newChat,
    updateChat,
    sendPrompt,
    interrupt,
    setMode,
    setModel,
    setEffort,
    setFast,
    removeQueued,
    sendQueuedNow,
    clearSuggestion,
    refreshUsage,
    type AgentChat,
    type PermissionMode,
    type Effort,
} from "../store";
import { Button } from "../cds/Button";
import { Icon, type IconName } from "../cds/Icon";
import { Menu, MenuItem, MenuLabel, MenuSeparator, Popover, Switch, MENU_ITEM, POPOVER } from "../cds/Menu";
import { usePortal } from "../cds/shadow";
import { fmtTokens } from "./Transcript";
import { Spinner } from "./primitives";
import { kv } from "../kv";
import { useLightbox } from "./Lightbox";
import { lazyContext } from "../lazyReact";

export const MODES: { id: PermissionMode; label: string; short?: string; description: string; icon: IconName; warning?: boolean }[] = [
    { id: "default", label: "Manual", description: "Always ask before making changes", icon: "Hand" },
    { id: "acceptEdits", label: "Accept edits", short: "Accept", description: "Automatically accept all file edits", icon: "Code" },
    { id: "plan", label: "Plan", description: "Create a plan before making changes", icon: "Scroll" },
    { id: "auto", label: "Auto", description: "Claude handles permission decisions", icon: "Lightning" },
    { id: "bypassPermissions", label: "Bypass permissions", short: "Bypass", description: "Accepts all permissions", icon: "Warning", warning: true },
    { id: "dontAsk", label: "Don’t ask", description: "Deny actions that aren’t pre-approved, without prompting", icon: "Hand" },
];
const EFFORT_LABEL: Record<string, string> = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra" };
const EFFORT_DESC: Record<string, string> = {
    minimal: "Answers right away with almost no thinking.",
    ultra: "Maximum reasoning; Codex may split the work across sub-agents.",
    low: "Fastest responses with the least thinking.",
    medium: "Balanced speed and depth.",
    high: "Thinks more for harder problems.",
    xhigh: "Thinks even longer on the hardest problems.",
    max: "Claude thinks longer with Max effort and uses your limits faster than High.",
};

const CARD =
    "bg-surface-3 [--cmp-pad-x:0.5rem] compact:[--cmp-pad-x:0.5rem] comfortable:[--cmp-pad-x:0.5rem] relative z-[1] flex w-full min-w-0 flex-col text-primary rounded-composer px-[var(--cmp-pad-x)] py-2 compact:py-2 comfortable:py-2 [--cmp-gap-y:0.375rem] compact:[--cmp-gap-y:0.375rem] comfortable:[--cmp-gap-y:0.5rem] gap-y-[var(--cmp-gap-y)] [--cmp-type-size:max(var(--cds-font-size-text-entry-floor,0px),var(--cmp-font-size,var(--cds-font-size-prose)))] [--cmp-leading:round(var(--cmp-type-size)*1.4,1px)] [--cmp-row-py:max(0px,(var(--cds-h-control)-var(--cmp-leading))/2)] [--cmp-row-h:calc(var(--cmp-leading)+2*var(--cmp-row-py))] transition-[background-color,border-color,box-shadow,opacity] duration-200 shadow-composer hover:[&:not(:where(:has(button:hover,a:hover,[role=button]:hover,label:hover)))]:shadow-composer-hover focus-within:shadow-composer-focus hover:focus-within:shadow-composer-focus cursor-text";
const TYPE_VARS =
    "[--cmp-type-size:max(var(--cds-font-size-text-entry-floor,0px),var(--cmp-font-size,var(--cds-font-size-prose)))] [--cmp-leading:round(var(--cmp-type-size)*1.4,1px)] [--cmp-row-py:max(0px,(var(--cds-h-control)-var(--cmp-leading))/2)] [--cmp-row-h:calc(var(--cmp-leading)+2*var(--cmp-row-py))] py-[var(--cmp-row-py)] text-[length:var(--cmp-type-size)] leading-[var(--cmp-leading)] font-normal";
const PLACEHOLDER = `pointer-events-none select-none absolute left-0 top-0 max-w-full max-h-96 overflow-hidden ${TYPE_VARS} break-words pl-[4px] compact:pl-[4px] comfortable:pl-[6px] transition-opacity duration-200 motion-safe:transition-[opacity,padding-left,padding-right] motion-safe:duration-200 text-muted`;
const EDITOR = `w-full max-h-96 min-h-[var(--cmp-row-h)] overflow-y-auto break-words ${TYPE_VARS} transition-opacity duration-200 motion-safe:transition-[opacity,padding-left,padding-right] motion-safe:duration-200 pl-[4px] compact:pl-[4px] comfortable:pl-[6px] [&_.ProseMirror:focus]:outline-none grid [&>*]:[grid-area:1/1] [&>*]:min-w-0 epitaxy-prompt-input`;
const CHIN_ROW =
    "flex min-h-control items-center gap-0 text-footnote font-normal text-secondary mt-1.5 compact:mt-1.5 comfortable:mt-2 ps-[calc(var(--cmp-chin-start)_-_var(--cmp-chin-touch-grow,0px))] pe-[calc(var(--cmp-chin-end)_-_var(--cmp-chin-touch-grow,0px))] [--cmp-chin-row-h:var(--cds-h-control--xs)] @max-[25rem]:text-caption [&_[data-cds=Button]:not([aria-pressed=true])]:text-secondary [&_[data-cds=Button]]:font-normal justify-between";
const CHIN_ICON = "text-secondary group-hover/btn:text-primary group-aria-pressed/btn:text-accent group-hover/btn:group-aria-pressed/btn:text-accent";
const PILL_BODY = "epitaxy-pill-body overflow-hidden focus-visible:outline-hidden focus-visible:shadow-focus hide-focus-ring";

export interface Attachment {
    id: string;
    name: string;
    mediaType: string;
    data: string; // base64 (images) or plain text (pasted text)
    text?: boolean;
}
const history: string[] = kv.get<string[]>("promptHistory", []);

// chin chords (claude.ai Code): ⌥⌘M mode menu, ⇧⌘I model menu, ⇧⌘E effort, ⌥⌘F fast mode — dispatched by ChatPanel
export function useChord(name: string, fn: () => void) {
    const ref = useRef(fn);
    ref.current = fn;
    useEffect(() => {
        const h = (e: any) => e.detail === name && ref.current();
        window.addEventListener("evi-claude:chord", h);
        return () => window.removeEventListener("evi-claude:chord", h);
    }, [name]);
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const toast = (title: string, body?: string) => window.dispatchEvent(new CustomEvent("evi-claude:toast", { detail: { title, body } }));
function readFile(f: File): Promise<Attachment | null> {
    return new Promise(res => {
        if (!f.type.startsWith("image/")) return res(null);
        if (!IMAGE_TYPES.includes(f.type)) return (toast("Couldn’t attach " + (f.name || "image"), "Only PNG, JPEG, GIF, and WebP images are supported."), res(null));
        if (f.size > 30 * 1024 * 1024) return (toast("Couldn’t attach " + (f.name || "image"), "Images must be smaller than 30 MB."), res(null));
        const r = new FileReader();
        r.onload = () => res({ id: crypto.randomUUID(), name: f.name || "image.png", mediaType: f.type, data: String(r.result).split(",")[1] });
        r.onerror = () => res(null);
        r.readAsDataURL(f);
    });
}

// caret rect inside the contenteditable (for the @ menu)
function caretRect(): DOMRect | null {
    const root = document.activeElement?.shadowRoot as any;
    const sel: Selection | null = root?.getSelection?.() ?? window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange();
    const rects = r.getClientRects();
    return rects[0] ?? (r.startContainer as Element).getBoundingClientRect?.() ?? null;
}

export function Composer({ chat, placeholder = "Type / for commands", autoFocus }: { chat: AgentChat; placeholder?: string; autoFocus?: boolean }) {
    const r = useAgents(s => s.runtimes[chat.localId]) ?? rt(chat.localId);
    const [lightbox, openImage] = useLightbox();
    const [editingPaste, setEditingPaste] = useState<string | null>(null);
    const [cmdError, setCmdError] = useState<string | null>(null);
    const [text, setText] = useState("");
    const [atts, setAtts] = useState<Attachment[]>([]);
    const [drag, setDrag] = useState(false);
    const [menu, setMenu] = useState<null | "slash" | "mention">(null);
    const [mention, setMention] = useState<{ query: string; items: any[] }>({ query: "", items: [] });
    const [hi, setHi] = useState(0);
    const [histIdx, setHistIdx] = useState(-1);
    const draftStash = useRef("");
    const lastEsc = useRef(0);
    const [hsearch, setHsearch] = useState<null | { skip: number }>(null); // Ctrl+R reverse history search
    const ed = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const busy = r.busy;
    const empty = !text.trim() && !atts.length;
    const bashMode = text.startsWith("!") && !atts.length;

    const setEditor = useCallback((t: string) => {
        if (ed.current) {
            ed.current.textContent = t;
            const range = document.createRange();
            range.selectNodeContents(ed.current);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
        setText(t);
    }, []);

    // external: rewind puts the message back in the composer; drafts from elsewhere
    useEffect(() => {
        const fn = (e: any) => e.detail?.localId === chat.localId && (setEditor(e.detail.text ?? ""), ed.current?.focus());
        window.addEventListener("evi-claude:composer-set", fn);
        return () => window.removeEventListener("evi-claude:composer-set", fn);
    }, [chat.localId]);
    useEffect(() => {
        if (autoFocus) ed.current?.focus();
    }, [chat.localId]);
    // agents page: start typing anywhere (nothing else focused) and it goes to the composer
    useEffect(() => {
        if (!autoFocus) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || !ed.current?.checkVisibility?.()) return;
            if (rt(chat.localId).permissions.length || rt(chat.localId).requests?.length) return; // digits/keys belong to the approval card
            const t = e.composedPath()[0] as HTMLElement;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.closest?.("[role=menu],[role=dialog],[role=listbox]"))) return;
            const active = (ed.current.getRootNode() as ShadowRoot).activeElement;
            if (active && (active as HTMLElement).isContentEditable) return;
            ed.current.focus();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [autoFocus]);
    // each session keeps its own draft, across switching and reloads
    useEffect(() => {
        const d = kv.get<string>("draft:" + chat.localId, "");
        if (d && ed.current) ((ed.current.textContent = d), setText(d));
    }, [chat.localId]);
    useEffect(() => {
        const t = setTimeout(() => kv.set("draft:" + chat.localId, text.trim() ? text : null), 300);
        return () => clearTimeout(t);
    }, [text, chat.localId]);

    // ---- typeaheads
    const commands: any[] = r.capabilities?.commands ?? [];
    useEffect(() => setCmdError(null), [text]);
    const slashQuery = /^\/(\S*)$/.exec(text)?.[1];
    const slashItems = useMemo(() => {
        if (slashQuery === undefined) return [];
        const q = slashQuery.toLowerCase();
        const builtin = [
            { name: "compact", description: "Clear conversation history but keep a summary in context" },
            { name: "clear", description: "Clear conversation history and free up context" },
            { name: "context", description: "Visualize current context usage" },
            { name: "cost", description: "Show the total cost and duration of the current session" },
            { name: "review", description: "Review a pull request" },
            { name: "init", description: "Initialize a new CLAUDE.md file with codebase documentation" },
        ];
        const all = [...commands, ...builtin.filter(b => !commands.some(c => c.name === b.name))];
        return all.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)));
    }, [slashQuery, commands]);
    useEffect(() => {
        // stays open with "No matching commands" rather than vanishing mid-typing
        setMenu(slashQuery !== undefined ? "slash" : m => (m === "slash" ? null : m));
        setHi(0);
    }, [slashQuery, slashItems.length]);

    const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1];
    useEffect(() => {
        if (mentionQuery === undefined) return setMenu(m => (m === "mention" ? null : m));
        let live = true;
        N()
            .agents.fileSuggestions(chat.localId, mentionQuery, chat.cwd)
            .then((res: any) => {
                if (!live) return;
                const items = (res?.suggestions ?? res?.files ?? res ?? []).slice?.(0, 30) ?? [];
                setMention({ query: mentionQuery, items });
                setMenu("mention");
                setHi(0);
            })
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [mentionQuery]);

    const pickSlash = (c: any) => {
        setEditor(`/${c.name} `);
        setMenu(null);
        ed.current?.focus();
    };
    const pickMention = (m: any) => {
        const p = typeof m === "string" ? m : (m.path ?? m.displayText ?? m.id ?? m.name);
        setEditor(text.replace(/@([^\s@]*)$/, `@${p} `));
        setMenu(null);
        ed.current?.focus();
    };

    // ---- send
    const sendForked = () => {
        const t = text.trim();
        if (!t) return;
        setEditor("");
        newChat({
            cwd: chat.cwd,
            title: chat.title + " (fork)",
            provider: chat.provider,
            sessionId: chat.sessionId,
            model: chat.model,
            effort: chat.effort,
            fast: chat.fast,
            permissionMode: chat.permissionMode,
        }).then(f => {
            if (!f) return;
            updateChat(f.localId, { forkSession: true });
            sendPrompt({ ...f, forkSession: true }, t);
        });
    };
    // steer: stop the current turn and send this right away (it goes to the head of the queue)
    const steer = () => {
        submit();
        setTimeout(() => {
            const q = rt(chat.localId).queued;
            if (q.length) sendQueuedNow(chat.localId, q[q.length - 1].id);
        }, 0);
    };
    const [sendMenu, setSendMenu] = useState(false);
    const sendMenuRef = useRef<HTMLButtonElement>(null);
    const submit = (queue = false) => {
        const t = text.trim();
        if (!t && !atts.length) return;
        // rate-limited until reset: the banner says so; don't send into a wall
        const rl: any = (r as any).rateLimit;
        if (rl?.status === "rejected" && (!rl.resetsAt || rl.resetsAt * (rl.resetsAt < 1e12 ? 1000 : 1) > Date.now()) && !t.startsWith("/")) return;
        if (t) {
            history.unshift(t);
            history.splice(200);
            kv.set("promptHistory", history);
        }
        setHistIdx(-1);
        // an unknown /command says so instead of going to Claude as text (built-ins like /compact are in the list)
        const slash = /^\/([\w:.-]+)(?:\s|$)/.exec(t)?.[1]; // not a path like /Users/…
        if (slash && commands.length && !commands.some((c: any) => c.name === slash || c.name === slash.replace(/^\//, "")) && !/^(compact|clear|review)$/.test(slash)) {
            setCmdError(`Unknown command /${slash}`);
            return;
        }
        if (bashMode) {
            const cmd = t.replace(/^!\s*/, "");
            // a shell command runs as you, outside Claude's permissions: confirm it (pasted text can start with "!")
            if (!confirm(`Run this command in ${chat.cwd.split("/").pop()}?\n\n${cmd.slice(0, 500)}`)) return;
            runShell(chat, cmd);
            setEditor("");
            return;
        }
        // pasted-text pills travel as text before the prompt, like claude.ai
        const pasted = atts.filter(a => a.text);
        const body = [...pasted.map(a => `<pasted_text name="${a.name}">\n${a.data}\n</pasted_text>`), t].filter(Boolean).join("\n\n");
        sendPrompt(
            chat,
            body,
            atts.filter(a => !a.text).map(a => ({ mediaType: a.mediaType, data: a.data })),
        );
        setEditor("");
        setAtts([]);
        clearSuggestion(chat.localId);
        requestAnimationFrame(() => window.dispatchEvent(new Event("evi-claude:scroll-bottom")));
        void queue;
    };

    const hmatches = hsearch ? history.filter(h => h.toLowerCase().includes(text.toLowerCase())) : [];
    const hmatch = hsearch ? hmatches[Math.min(hsearch.skip, Math.max(0, hmatches.length - 1))] : undefined;
    const onKeyDown = (e: React.KeyboardEvent) => {
        if ((e.nativeEvent as any).isComposing) return;
        if (e.key === "r" && e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setHsearch(h => (h ? { skip: h.skip + 1 } : { skip: 0 }));
            return;
        }
        if (hsearch) {
            if (e.key === "Escape") return (e.preventDefault(), setHsearch(null));
            if (e.key === "ArrowUp") return (e.preventDefault(), setHsearch({ skip: hsearch.skip + 1 }));
            if (e.key === "ArrowDown") return (e.preventDefault(), setHsearch({ skip: Math.max(0, hsearch.skip - 1) }));
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (hmatch) setEditor(hmatch);
                setHsearch(null);
                return;
            }
        }
        const list = menu === "slash" ? slashItems : menu === "mention" ? mention.items : null;
        if (list && !list.length && e.key === "Escape") return (e.preventDefault(), setMenu(null));
        if (list && list.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setHi(h => (e.key === "ArrowDown" ? (h + 1) % list.length : (h - 1 + list.length) % list.length));
                return;
            }
            if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                e.preventDefault();
                menu === "slash" ? pickSlash(list[hi]) : pickMention(list[hi]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMenu(null);
                return;
            }
        }
        // ⌘⌥↵: send in a forked session (this one stays as it is)
        if (e.key === "Enter" && e.altKey && (e.metaKey || e.ctrlKey) && text.trim() && chat.sessionId && chat.provider !== "codex") {
            e.preventDefault();
            sendForked();
            return;
        }
        if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            submit(e.metaKey || e.ctrlKey);
            return;
        }
        if (e.key === "Escape" && busy) {
            e.preventDefault();
            interrupt(chat.localId);
            return;
        }
        if (e.key === "Escape" && !text && !atts.length) {
            // Esc on an empty input takes the latest queued message back for editing
            const q = rt(chat.localId).queued;
            if (q.length) {
                e.preventDefault();
                const last = q[q.length - 1];
                removeQueued(chat.localId, last.id);
                setEditor(last.text);
                return;
            }
            // Esc Esc: edit your last message (rewinds to it, like the CLI)
            const now = Date.now();
            if (now - lastEsc.current < 500 && chat.provider !== "codex" && chat.sessionId) {
                e.preventDefault();
                lastEsc.current = 0;
                const lastUser = [...rt(chat.localId).items]
                    .reverse()
                    .find((x: any) => x.kind === "user" && !x.local && !String(x.id).startsWith("local:") && !String(x.id).startsWith("reply:")) as any;
                // rewinding also restores files, so it's never silent
                if (lastUser && confirm("Edit your last message?\n\nThis rewinds the conversation to before it and restores files Claude changed since then."))
                    rewindTo(chat, lastUser).then(t => t != null && setEditor(t));
                return;
            }
            lastEsc.current = now;
        }
        if (e.key === "Tab" && e.shiftKey) {
            // Claude Code CLI: Shift+Tab cycles permission modes
            e.preventDefault();
            const order: PermissionMode[] = ["default", "acceptEdits", "plan", "auto"];
            const i = order.indexOf(chat.permissionMode);
            setMode(chat, order[(i + 1) % order.length]);
            return;
        }
        if ((e.key === "Tab" || e.key === "ArrowRight") && !text && r.suggestion) {
            e.preventDefault();
            setEditor(r.suggestion);
            return;
        }
        const atStart = (() => {
            const sel = (ed.current?.getRootNode() as any)?.getSelection?.() ?? window.getSelection();
            return !!sel && sel.isCollapsed && sel.anchorOffset === 0 && !text.includes("\n");
        })();
        if (e.key === "ArrowUp" && (!text || histIdx >= 0 || atStart) && history.length) {
            e.preventDefault();
            if (histIdx < 0) draftStash.current = text; // ↓ past the newest entry brings it back
            const i = Math.min(histIdx + 1, history.length - 1);
            setHistIdx(i);
            setEditor(history[i]);
            return;
        }
        if (e.key === "ArrowDown" && histIdx >= 0) {
            e.preventDefault();
            const i = histIdx - 1;
            setHistIdx(i);
            setEditor(i >= 0 ? history[i] : draftStash.current);
        }
    };

    const addFiles = async (files: FileList | File[]) => {
        const list = Array.from(files);
        const got = (await Promise.all(list.map(readFile))).filter(Boolean) as Attachment[];
        if (got.length) {
            if (atts.length + got.length > 20) toast("Too many images", "You can attach up to 20 images per message.");
            setAtts(a => [...a, ...got].slice(0, 20));
        }
        // other files become @mentions of their path (Claude Code reads them itself)
        const paths = list
            .filter(f => !f.type.startsWith("image/"))
            .map(f => N().pathForFile?.(f))
            .filter(Boolean);
        if (paths.length) {
            const rel = paths.map((p: string) => (p.startsWith(chat.cwd + "/") ? p.slice(chat.cwd.length + 1) : p));
            const next = `${text}${text && !text.endsWith(" ") ? " " : ""}${rel.map((p: string) => "@" + p).join(" ")} `;
            setEditor(next);
            ed.current?.focus();
        }
    };

    return (
        <div className="epitaxy-prompt" data-cds-shell="" data-session-id={chat.sessionId} data-perf-region="composer">
            {lightbox}
            {editingPaste && atts.find(a => a.id === editingPaste) && (
                <PasteEditor
                    att={atts.find(a => a.id === editingPaste)!}
                    onClose={() => setEditingPaste(null)}
                    onSave={data => (setAtts(xs => xs.map(x => (x.id === editingPaste ? { ...x, data } : x))), setEditingPaste(null))}
                />
            )}
            <div
                data-cds="ChatComposer"
                data-cds-dock-group=""
                data-start-inset="text"
                data-end-inset="actions"
                data-busy={busy ? "true" : undefined}
                data-drag-over={drag ? "true" : undefined}
                data-multiline={text.includes("\n") ? "true" : undefined}
                className="flex w-full min-w-0 flex-col font-sans in-data-cds-dock-masked:bg-page"
                onDragOver={e => {
                    if (e.dataTransfer.types.includes("Files")) (e.preventDefault(), setDrag(true));
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => {
                    setDrag(false);
                    if (e.dataTransfer.files.length) (e.preventDefault(), addFiles(e.dataTransfer.files));
                }}
            >
                <div ref={card} className={CARD} onClick={e => e.target === e.currentTarget && ed.current?.focus()}>
                    {hsearch && (
                        <div
                            data-cds="ChatComposerHeader"
                            aria-hidden="true"
                            className="flex min-h-[var(--cds-h-control-nested)] min-w-0 items-center gap-xs text-footnote font-normal text-muted whitespace-nowrap px-1"
                        >
                            <span className={hmatch ? "" : "text-danger"}>Search history:</span>
                            <span className="text-primary truncate min-w-0">{hmatch ?? "no match"}</span>
                            <span aria-hidden="true" className="ml-auto inline-flex min-w-0 items-center gap-1 truncate">
                                <kbd>↑</kbd>
                                <kbd>↓</kbd> cycle <span aria-hidden="true">·</span> <kbd>↵</kbd> use <span aria-hidden="true">·</span> <kbd>esc</kbd> cancel
                            </span>
                        </div>
                    )}
                    {!!atts.length && (
                        <div
                            data-cds-composer-attachments-clip=""
                            className="-mx-2 grid grid-rows-[1fr] overflow-hidden px-2 -mt-2 pt-2 compact:-mt-2 compact:pt-2 comfortable:-mt-2 comfortable:pt-2"
                        >
                            <div data-cds-composer-attachments="" className="min-h-0 min-w-0 px-1 pt-1 pb-2.5">
                                <div className="epitaxy-attachment-shelf w-full">
                                    <div className="flex flex-wrap items-center gap-1">
                                        {atts.map(a => (
                                            <div key={a.id} className="group/pill relative shrink-0 hover:z-10 focus-within:z-10" data-cds-attachment="">
                                                {a.text ? (
                                                    <button
                                                        aria-label={`${a.name} — view or edit`}
                                                        title={a.data.slice(0, 400)}
                                                        onClick={() => setEditingPaste(a.id)}
                                                        className={`${PILL_BODY} rounded-sm border-0 inline-flex items-center gap-sm py-xs pr-md pl-lg text-secondary text-body bg-fill-secondary`}
                                                    >
                                                        <span className="flex items-center justify-center shrink-0">
                                                            <Icon name="File" size="sm" />
                                                        </span>
                                                        <span className="flex min-w-0 flex-col items-start text-left">
                                                            <span className="truncate max-w-[160px]">{a.name}</span>
                                                            <span className="truncate max-w-[160px] text-muted">
                                                                {a.data.split("\n").length} lines · {Math.round(a.data.length / 100) / 10}k chars
                                                            </span>
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        aria-label={a.name}
                                                        title={a.name}
                                                        className={`${PILL_BODY} rounded-sm border-0 grid place-items-stretch w-10 h-10 p-0 bg-fill-secondary`}
                                                        onClick={() => openImage(`data:${a.mediaType};base64,${a.data}`)}
                                                    >
                                                        <div className="relative">
                                                            <img className="absolute inset-0 w-full h-full object-cover" alt="" src={`data:${a.mediaType};base64,${a.data}`} />
                                                        </div>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    aria-label={`Remove ${a.name}`}
                                                    onClick={() => setAtts(x => x.filter(y => y.id !== a.id))}
                                                    className="epitaxy-pill-remove absolute -top-1.5 -right-1.5 z-10 grid place-items-center size-4 rounded-full bg-surface-2 text-secondary ring-1 ring-alpha-2 opacity-0 pointer-events-none transition-opacity motion-reduce:transition-none group-hover/pill:opacity-100 group-hover/pill:pointer-events-auto group-focus-within/pill:opacity-100 group-focus-within/pill:pointer-events-auto hover:text-primary"
                                                >
                                                    <Icon name="X" size="xs" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {cmdError && (
                        <div role="alert" className="flex items-center gap-xs px-[4px] text-footnote text-danger select-none">
                            <Icon name="Warning" size="xs" />
                            <span className="truncate">{cmdError} · type / to see what’s available</span>
                        </div>
                    )}
                    {bashMode && (
                        <div className="flex items-center gap-xs px-[4px] text-footnote text-accent select-none">
                            <Icon name="CommandLine" size="xs" />
                            <span className="truncate">Shell mode · runs in {chat.cwd.split("/").pop()} · the output goes to Claude with your next message</span>
                        </div>
                    )}
                    <div className="relative w-full min-w-0" style={{ ["--cmp-lead-w" as any]: "0px", ["--cmp-trail-w" as any]: "30px" }}>
                        <div
                            className={`w-full min-w-0 motion-safe:transition-[padding-left,padding-right,padding-bottom] motion-safe:duration-200 ${text.includes("\n") ? "pb-[calc(var(--cds-h-control)+var(--cmp-gap-y))]" : "pr-[var(--cmp-trail-w,0px)]"}`}
                            style={{ ["--cmp-wrap-h" as any]: "20px" }}
                        >
                            <div className="relative min-w-0 break-words">
                                <div className="relative min-w-0">
                                    {!text && (
                                        <span data-composer-placeholder="" aria-hidden="true" className={PLACEHOLDER} style={{ maxHeight: "min(24rem, 40svh)" }}>
                                            {r.suggestion ? "" : placeholder}
                                        </span>
                                    )}
                                    {!text && r.suggestion && (
                                        <div data-cds="ChatComposerOverlay" className="absolute inset-0 overflow-hidden pr-[var(--cmp-trail-w,0px)] pointer-events-none">
                                            <div aria-hidden="true" data-prompt-suggestion-ghost="" className={`truncate text-muted ${TYPE_VARS} pl-[4px]`}>
                                                {r.suggestion}
                                            </div>
                                        </div>
                                    )}
                                    <div data-cds="ChatComposerEditor" className={EDITOR} style={{ maxHeight: "min(24rem, 40svh)" }}>
                                        <div
                                            ref={ed}
                                            contentEditable="plaintext-only"
                                            role="textbox"
                                            enterKeyHint="enter"
                                            data-cds="Editor"
                                            aria-multiline="true"
                                            data-testid="code-prompt-input"
                                            aria-label="Prompt"
                                            translate="no"
                                            className="tiptap ProseMirror"
                                            data-doc-empty={text ? "false" : "true"}
                                            tabIndex={0}
                                            style={{ whiteSpace: "break-spaces", overflowWrap: "break-word", outline: "none" }}
                                            suppressContentEditableWarning
                                            onInput={e => setText((e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ""))}
                                            onKeyDown={onKeyDown}
                                            onPaste={e => {
                                                const files = Array.from(e.clipboardData.files);
                                                if (files.length) {
                                                    e.preventDefault();
                                                    addFiles(files);
                                                    return;
                                                }
                                                const pasted = e.clipboardData.getData("text/plain");
                                                if (pasted.length > 2500 || pasted.split("\n").length > 40) {
                                                    e.preventDefault();
                                                    const n = atts.filter(a => a.text).length + 1;
                                                    setAtts(a => [...a, { id: crypto.randomUUID(), name: `Pasted text ${n}`, mediaType: "text/plain", data: pasted, text: true }]);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div data-cds="ChatComposerActions" className="contents">
                            <div className="absolute bottom-0 right-0 flex shrink-0 items-center gap-xs pl-1.5 compact:pl-1.5 comfortable:pl-2 min-h-[var(--cmp-row-h)]">
                                <div className="grid shrink-0 items-center justify-items-end">
                                    <div
                                        data-cds-part="send-slot"
                                        className="col-start-1 row-start-1 flex cursor-default items-center transition-[opacity,visibility] duration-fast"
                                    >
                                        <div className="flex items-center gap-xs">
                                            <div className="grid items-center justify-items-end">
                                                <div
                                                    key={busy && empty ? "stop" : "send"}
                                                    className="col-start-1 row-start-1 flex cursor-default items-center justify-end motion-safe:animate-[cds-fade-in_0.12s_ease-out_0.08s_backwards]"
                                                >
                                                    <div className="flex">
                                                        {busy && empty ? (
                                                            <Button
                                                                iconOnly
                                                                icon="StopCircle"
                                                                aria-label={r.stopping ? "Stopping" : "Stop"}
                                                                title={r.stopping ? "Stopping…" : "Stop (esc)"}
                                                                data-testid="code-prompt-stop"
                                                                busy={!!r.stopping}
                                                                disabled={!!r.stopping}
                                                                onClick={() => interrupt(chat.localId)}
                                                            />
                                                        ) : (
                                                            <>
                                                                {!empty && (busy || (chat.sessionId && chat.provider !== "codex")) && (
                                                                    <>
                                                                        <Button
                                                                            ref={sendMenuRef}
                                                                            iconOnly
                                                                            icon="CaretDown"
                                                                            iconSize="xs"
                                                                            aria-label="More send options"
                                                                            aria-haspopup="menu"
                                                                            aria-expanded={sendMenu}
                                                                            onClick={() => setSendMenu(!sendMenu)}
                                                                        />
                                                                        <Menu open={sendMenu} onClose={() => setSendMenu(false)} anchor={sendMenuRef} side="top" align="end">
                                                                            {busy && (
                                                                                <MenuItem
                                                                                    icon="ArrowReturn"
                                                                                    label="Stop and send now"
                                                                                    description="Interrupts Claude and sends this next"
                                                                                    onSelect={steer}
                                                                                />
                                                                            )}
                                                                            {busy && (
                                                                                <MenuItem
                                                                                    icon="Clock"
                                                                                    label="Queue for later"
                                                                                    description="Sent when Claude finishes (↵)"
                                                                                    onSelect={() => submit()}
                                                                                />
                                                                            )}
                                                                            {chat.sessionId && chat.provider !== "codex" && (
                                                                                <MenuItem
                                                                                    icon="ArrowSplitRight"
                                                                                    label="Send in a forked session"
                                                                                    shortcut="⌥⌘↵"
                                                                                    description="This session stays as it is"
                                                                                    onSelect={sendForked}
                                                                                />
                                                                            )}
                                                                        </Menu>
                                                                    </>
                                                                )}
                                                                <Button
                                                                    iconOnly
                                                                    icon="ArrowReturn"
                                                                    aria-label={busy ? "Queue for later" : "Send"}
                                                                    title={busy ? "Queue for later ↵" : "Send ↵"}
                                                                    data-testid="code-prompt-send"
                                                                    disabled={empty}
                                                                    onClick={() => submit()}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {drag && (
                        <div
                            data-cds="ChatComposerDropPanel"
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] motion-safe:animate-[cds-drop-ring-in_0.15s_cubic-bezier(0.215,0.61,0.355,1)]"
                        >
                            <div className="absolute inset-0 rounded-[inherit] transition-opacity duration-fast shadow-[inset_0_0_0_2px_var(--cds-fill-accent)]" />
                            <div className="absolute inset-0 rounded-[inherit] transition-opacity duration-fast shadow-[inset_0_0_24px_0_color-mix(in_srgb,var(--cds-fill-accent)_20%,transparent)]" />
                        </div>
                    )}
                </div>
                <Chin chat={chat} r={r} onAddFiles={() => fileInput.current?.click()} insert={t => (setEditor(t), ed.current?.focus())} text={text} />
                <input
                    ref={fileInput}
                    id="chat-input-file-upload-epitaxy"
                    multiple
                    className="hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={e => e.target.files && addFiles(e.target.files)}
                />
            </div>
            {menu === "slash" && <SlashMenu items={slashItems} hi={hi} setHi={setHi} anchor={card} onPick={pickSlash} query={slashQuery ?? ""} />}
            {menu === "mention" && <MentionMenu items={mention.items} hi={hi} setHi={setHi} onPick={pickMention} />}
        </div>
    );
}

// ---------------------------------------------------------------- chin
function Chin({ chat, r, onAddFiles, insert, text }: { chat: AgentChat; r: ReturnType<typeof rt>; onAddFiles: () => void; insert: (t: string) => void; text: string }) {
    return (
        <div
            data-cds="ChatComposerChin"
            aria-hidden="false"
            className="relative z-0 overflow-clip px-2 -mx-2 pt-2 -mt-2 @container [--cmp-pad-x:0.5rem] compact:[--cmp-pad-x:0.5rem] comfortable:[--cmp-pad-x:0.5rem] [--cmp-chin-start:calc(var(--cmp-pad-x)-1px)] [--cmp-chin-end:calc(var(--cmp-pad-x)+2px)] compact:[--cmp-chin-end:calc(var(--cmp-pad-x)+2px)] comfortable:[--cmp-chin-end:calc(var(--cmp-pad-x)+3px)] pb-2 -mb-2"
        >
            <div className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-[280ms] ease-out motion-reduce:transition-none grid-rows-[1fr]">
                <div className="min-h-0 transition-[opacity,translate] duration-[280ms] ease-out motion-reduce:transition-none translate-none opacity-100">
                    <div data-size="xs" data-touch-size="" className={CHIN_ROW}>
                        <div className="flex items-center self-start">
                            <AddMenu chat={chat} onAddFiles={onAddFiles} insert={insert} text={text} />
                            <div className="[&_[data-cds=SplitDropdownButton]_button:not([aria-haspopup=menu])]:rounded-e-none [&_[data-cds=SplitDropdownButton]_button[aria-haspopup=menu]]:rounded-s-none flex shrink-0 items-center empty:hidden gap-xs">
                                <Button iconOnly icon="Microphone" iconClassName={CHIN_ICON} aria-label="Dictate" title="Dictation isn’t available in Discord" disabled />
                            </div>
                            <span className="inline-flex min-w-0">
                                <ModeMenu chat={chat} />
                            </span>
                        </div>
                        <div className="ms-auto flex min-w-0 items-center gap-1 ps-2">
                            <div className="grid min-w-0 grid-flow-col auto-cols-[minmax(0,max-content)] items-center gap-1">
                                <ModelMenu chat={chat} r={r} />
                                <EffortControl chat={chat} r={r} />
                                <UsageRing chat={chat} r={r} />
                                <span role="status" aria-live="polite" className="sr-only">
                                    {chat.fast ? "Fast mode on" : "Fast mode off"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AddMenu({ chat, onAddFiles, insert, text }: { chat: AgentChat; onAddFiles: () => void; insert: (t: string) => void; text: string }) {
    const [open, setOpen] = useState(false);
    const [mcp, setMcp] = useState<any[] | null>(null);
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (open)
            N()
                .agents.mcpStatus(chat.localId)
                .then(setMcp, () => setMcp([]));
    }, [open]);
    return (
        <>
            <Button ref={ref} iconOnly icon="Add" iconClassName={CHIN_ICON} aria-label="Add" title="Add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
            <Menu open={open} onClose={() => setOpen(false)} anchor={ref} side="top" align="start">
                <MenuItem icon="Attachment" label="Add files or photos" onSelect={onAddFiles} />
                <MenuItem
                    icon="Folder"
                    label="Add folder"
                    onSelect={async () => {
                        const p = await N().agents.pickFolder();
                        if (p) insert(`${text}${text && !text.endsWith(" ") ? " " : ""}@${p} `);
                    }}
                />
                <MenuItem icon="SlashShortcutCommand" label="Slash commands" onSelect={() => insert("/")} />
                <MenuSeparator />
                <MenuLabel>Connectors</MenuLabel>
                {mcp === null && <MenuItem icon="Connectors" label="Loading…" disabled />}
                {mcp?.map(s => (
                    <MenuItem
                        key={s.name}
                        icon={s.status === "failed" || s.status === "needs-auth" ? "CloudSlash" : "Connectors"}
                        label={s.name}
                        description={
                            s.status === "connected"
                                ? `${s.tools?.length ?? 0} tools`
                                : s.status === "needs-auth"
                                  ? "Needs authentication · Reconnect"
                                  : s.status === "failed"
                                    ? "Failed · Reconnect"
                                    : s.status
                        }
                        keepOpen
                        checkedRole="checkbox"
                        checked={s.status !== "disabled"}
                        trailing={
                            <span inert>
                                <Switch size="xs" checked={s.status !== "disabled"} />
                            </span>
                        }
                        onSelect={async () => {
                            // failed / needs-auth: reconnect (which runs the server's auth); otherwise toggle on/off
                            if (s.status === "failed" || s.status === "needs-auth")
                                await N()
                                    .agents.reconnectMcp?.(chat.localId, s.name)
                                    .catch(() => {});
                            else await N().agents.toggleMcp?.(chat.localId, s.name, s.status === "disabled");
                            N().agents.mcpStatus(chat.localId).then(setMcp);
                        }}
                    />
                ))}
                {mcp && !mcp.length && <MenuItem icon="Connectors" label="No connectors" disabled />}
            </Menu>
        </>
    );
}

// the new-session page reuses the chin's menus on a draft (not yet a session): changes go to the draft
const DraftCtx = lazyContext<null | ((patch: Partial<AgentChat>) => void)>(null);
const DraftProvider = (p: { value: (patch: Partial<AgentChat>) => void; children: ReactNode }) => {
    const P = DraftCtx().Provider;
    return <P value={p.value}>{p.children}</P>;
};
export function DraftChin({ draft, onChange }: { draft: AgentChat; onChange: (patch: Partial<AgentChat>) => void }) {
    // model list etc. from any running session of the same provider (the CLI reports them on start)
    const caps = useAgents(
        s =>
            Object.entries(s.runtimes).find(
                ([id, x]) => x.capabilities?.models?.length && (s.chats.find(c => c.localId === id)?.provider ?? "claude") === (draft.provider ?? "claude"),
            )?.[1],
    );
    const r = caps ?? rt("__draft__");
    return (
        <DraftProvider value={onChange}>
            <div className="flex items-center gap-0.5 min-w-0">
                {draft.provider !== "codex" && <ModeMenu chat={draft} />}
                <span className="flex-1" />
                {r.capabilities?.models?.length ? <ModelMenu chat={draft} r={r} /> : null}
                {r.capabilities?.models?.length ? <EffortControl chat={draft} r={r} /> : null}
            </div>
        </DraftProvider>
    );
}

// view / edit a pasted-text pill before sending
function PasteEditor({ att, onClose, onSave }: { att: Attachment; onClose: () => void; onSave: (data: string) => void }) {
    const portal = usePortal();
    const [val, setVal] = useState(att.data);
    const close = () => (val === att.data || confirm("Discard changes?") ? onClose() : undefined);
    if (!portal) return null;
    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={att.name}
            className="fixed inset-0 grid place-items-center pointer-events-auto"
            style={{ background: "rgba(0,0,0,.5)", zIndex: 1000 }}
            onClick={close}
            onKeyDown={e => e.key === "Escape" && (e.stopPropagation(), close())}
        >
            <div
                className="flex flex-col gap-md rounded-card bg-surface-3 shadow-panel p-lg"
                style={{ width: "min(720px, 92vw)", maxHeight: "80vh" }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-sm">
                    <span className="text-body-medium text-primary flex-1 truncate">{att.name}</span>
                    <span className="text-footnote text-muted">{val.split("\n").length} lines</span>
                </div>
                <textarea
                    autoFocus
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    className="cds-reset flex-1 min-h-[240px] rounded bg-alpha-1 border-0 outline-none p-md font-mono text-footnote text-primary resize-none"
                    style={{ height: "50vh" }}
                />
                <div className="flex justify-end gap-xs">
                    <Button variant="secondary" onClick={close}>
                        Cancel
                    </Button>
                    <Button variant="primary" disabled={val === att.data} onClick={() => onSave(val)}>
                        Save
                    </Button>
                </div>
            </div>
        </div>,
        portal,
    );
}

function ModeMenu({ chat }: { chat: AgentChat }) {
    const draft = useContext(DraftCtx());
    const [open, setOpen] = useState(false);
    useChord("mode", () => setOpen(o => !o));
    const ref = useRef<HTMLButtonElement>(null);
    const mode = MODES.find(m => m.id === chat.permissionMode) ?? MODES[0];
    // Settings → "Allow bypass permissions mode"
    const modes = kv.get("allowBypass", true) || chat.permissionMode === "bypassPermissions" ? MODES : MODES.filter(m => m.id !== "bypassPermissions");
    const choose = (m: PermissionMode) => {
        draft ? draft({ permissionMode: m }) : setMode(chat, m);
        setOpen(false);
    };
    return (
        <>
            <Button
                ref={ref}
                shrink={false}
                className="shrink"
                aria-haspopup="menu"
                aria-expanded={open}
                title={mode.warning ? "Claude can modify or delete files without asking" : "Mode (⇧⇥ to cycle)"}
                onClick={() => setOpen(!open)}
            >
                <span className="grid grid-cols-[minmax(0,1fr)]">
                    <span className={`overflow-x-clip text-ellipsis whitespace-nowrap ${mode.warning ? "text-warning" : ""}`}>{mode.short ?? mode.label}</span>
                </span>
            </Button>
            <Menu open={open} onClose={() => setOpen(false)} anchor={ref} side="top" onDigit={n => modes[n - 1] && choose(modes[n - 1].id)}>
                <MenuLabel>Mode</MenuLabel>
                {modes.map((m, i) => (
                    <MenuItem
                        key={m.id}
                        iconNode={<Icon name={m.icon} size={12} />}
                        label={m.label}
                        description={m.description}
                        shortcut={String(i + 1)}
                        checked={m.id === chat.permissionMode}
                        checkedRole="radio"
                        danger={m.warning}
                        onSelect={() => choose(m.id)}
                    />
                ))}
            </Menu>
        </>
    );
}

export function prettyModelId(id: string) {
    const mm = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(id);
    if (!mm) return null;
    return `${mm[1][0].toUpperCase()}${mm[1].slice(1)} ${mm[2]}${mm[3] ? "." + mm[3] : ""}`;
}
export function modelName(chat: AgentChat, models: any[]) {
    const m = models.find(x => x.value === chat.model);
    if (m?.displayName) return m.displayName.replace(/\s*\(.*\)$/, "");
    const pretty = chat.model ? prettyModelId(chat.model) : null;
    if (pretty) return pretty;
    const def = models.find(x => x.value === "default");
    const fromDesc = def?.description && prettyModelId(def.description.toLowerCase().replace(/(opus|sonnet|haiku|fable) (\d+)(?:\.(\d+))?/, "claude-$1-$2-$3"));
    return fromDesc || (def?.displayName ?? chat.model ?? "Default model").replace(/\s*\(.*\)$/, "");
}

// why Fast can't run right now (fast_mode_state / fast_mode_disabled_reason from the CLI)
const FAST_REASON: Record<string, string> = {
    free: "Not available on your plan.",
    extra_usage_disabled: "Needs extra usage turned on for your account.",
    network_error: "Couldn’t check availability (network error).",
    model_not_allowed: "Not available for this model.",
    disabled_by_env: "Turned off by an environment setting.",
    not_first_party: "Only available with a Claude subscription login.",
    pending: "Checking availability…",
};
function fastNote(r: ReturnType<typeof rt>): string | null {
    const f = (r as any).fastMode;
    if (f?.state === "cooldown") return "Paused after hitting a rate limit — standard speed for now.";
    return f?.reason ? (FAST_REASON[f.reason] ?? null) : null;
}

function ModelMenu({ chat, r }: { chat: AgentChat; r: ReturnType<typeof rt> }) {
    const draft = useContext(DraftCtx());
    const [open, setOpen] = useState(false);
    useChord("model", () => setOpen(o => !o));
    useChord("fast", () => r.capabilities?.models?.some((m: any) => m.supportsFastMode) && (draft ? draft({ fast: !chat.fast }) : setFast(chat, !chat.fast)));
    const ref = useRef<HTMLButtonElement>(null);
    const models: any[] = r.capabilities?.models ?? [];
    const current = models.find(m => m.value === chat.model) ?? models[0];
    const name = models.length ? modelName(chat, models) : r.status === "running" ? null : modelName(chat, []);
    const fastOK = models.some(m => m.supportsFastMode);
    const [showMore, setShowMore] = useState(false);
    // latest families first; older versions go under "More models" (like claude.ai)
    const MAIN = new Set(["default", "opus", "sonnet", "haiku"]);
    const latestFable = models.find(m => /fable/i.test(m.value));
    const main = chat.provider === "codex" ? models : models.filter(m => MAIN.has(m.value) || m === latestFable || m.value === chat.model);
    const more = models.filter(m => !main.includes(m));
    const row = (m: any, i: number) => {
        const sel = m === current || m.value === chat.model;
        return (
            <MenuItem
                key={m.value}
                checkedRole="radio"
                label={
                    <span className="flex min-w-0 items-center gap-xs">
                        <span className="truncate">{m.displayName}</span>
                    </span>
                }
                description={m.description}
                trailing={
                    <span aria-hidden="true" className="-mr-1 flex size-icon shrink-0 items-center justify-center">
                        {sel ? (
                            <Icon name="Check" size="sm" bold style={{ color: "var(--cds-fill-accent)" }} />
                        ) : i < 9 ? (
                            <span className="pointer-coarse:hidden text-footnote text-muted">{i + 1}</span>
                        ) : null}
                    </span>
                }
                onSelect={() => pick(m)}
            />
        );
    };
    const pick = (m: any) => {
        const next = m.value === "default" ? undefined : m.value;
        // mid-session, a different model re-reads the whole conversation (no cache): say so first
        if (
            !draft &&
            next !== chat.model &&
            rt(chat.localId).items.some(x => x.kind === "text") &&
            !confirm("Switch model?\n\nThe new model reads the whole conversation again, which uses more of your limits.")
        )
            return setOpen(false);
        draft ? draft({ model: next }) : setModel(chat, next);
        setOpen(false);
    };
    return (
        <>
            <Button
                ref={ref}
                cds="ModelSelector"
                className="max-w-full"
                aria-label={`Model: ${name ?? ""}`}
                data-testid="epitaxy-cds-model-selector"
                aria-haspopup="menu"
                aria-expanded={open}
                title="Model"
                onClick={() => setOpen(!open)}
            >
                {name === null ? (
                    <span className="flex min-w-0 items-center gap-xs">
                        <Spinner />
                        <span className="truncate">Loading models…</span>
                    </span>
                ) : (
                    <span className="truncate">
                        {name}
                        {chat.fast && <span className="text-muted @max-[280px]:hidden"> Fast</span>}
                    </span>
                )}
            </Button>
            <Menu
                open={open}
                onClose={() => setOpen(false)}
                anchor={ref}
                side="top"
                align="end"
                cds="ModelSelector"
                className="max-w-[min(26rem,var(--available-width))]"
                onDigit={n => {
                    const list = showMore ? [...main, ...more] : main;
                    list[n - 1] && pick(list[n - 1]);
                }}
            >
                {main.map((m, i) => row(m, i))}
                {more.length > 0 && (
                    <>
                        <MenuSeparator />
                        <MenuItem
                            keepOpen
                            label="More models"
                            trailing={
                                <Icon name="CaretRight" size="sm" className={`-mr-1 shrink-0 text-muted transition-transform duration-fast ${showMore ? "rotate-90" : ""}`} />
                            }
                            onSelect={() => setShowMore(!showMore)}
                        />
                        {showMore && more.map((m, i) => row(m, main.length + i))}
                    </>
                )}
                {!models.length && <MenuItem label="Default model" disabled />}
                {fastOK && (
                    <>
                        <MenuSeparator />
                        <MenuItem
                            keepOpen
                            checkedRole="checkbox"
                            checked={!!chat.fast}
                            label={
                                <span className="block min-w-0 whitespace-normal">
                                    Fast mode
                                    <span className={`mt-1 block text-footnote ${fastNote(r) ? "text-warning" : "text-muted"}`}>
                                        {fastNote(r) ?? "Faster output from the same model. Uses your limits faster."}
                                    </span>
                                </span>
                            }
                            trailing={
                                <div aria-hidden="true" className="pointer-events-none inline-flex items-center">
                                    <span className="inline-flex">
                                        <Switch size="sm" checked={!!chat.fast} />
                                    </span>
                                </div>
                            }
                            onSelect={() => (draft ? draft({ fast: !chat.fast }) : setFast(chat, !chat.fast))}
                        />
                    </>
                )}
            </Menu>
        </>
    );
}

function EffortControl({ chat, r }: { chat: AgentChat; r: ReturnType<typeof rt> }) {
    const draft = useContext(DraftCtx());
    const [open, setOpen] = useState(false);
    useChord("effort", () => setOpen(o => !o));
    const ref = useRef<HTMLButtonElement>(null);
    const models: any[] = r.capabilities?.models ?? [];
    const m = models.find(x => x.value === chat.model) ?? models[0];
    const levels: Effort[] = m?.supportedEffortLevels ?? (m?.supportsEffort === false ? [] : ["low", "medium", "high", "xhigh", "max"]);
    if (!levels.length || (m && m.supportsEffort === false)) return null;
    const cur: Effort = chat.effort && levels.includes(chat.effort) ? chat.effort : levels.includes("medium") ? "medium" : levels[0];
    const idx = levels.indexOf(cur);
    const pct = levels.length > 1 ? idx / (levels.length - 1) : 0;
    const set = (i: number) =>
        draft ? draft({ effort: levels[Math.max(0, Math.min(levels.length - 1, i))] as any }) : setEffort(chat, levels[Math.max(0, Math.min(levels.length - 1, i))]);
    const onTrack = (e: React.PointerEvent<HTMLDivElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const f = (e.clientX - box.left) / box.width;
        set(Math.round(f * (levels.length - 1)));
    };
    return (
        <>
            <Button
                ref={ref}
                cds="ModelSelectorEffort"
                aria-label={`Effort: ${EFFORT_LABEL[cur]}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                title="Effort"
                onClick={() => setOpen(!open)}
            >
                <span className="min-w-0 truncate">{EFFORT_LABEL[cur]}</span>
                {cur === "max" && <Icon name="Warning" size="xs" className="shrink-0 text-warning" label="High usage" />}
            </Button>
            <Popover
                open={open}
                onClose={() => setOpen(false)}
                anchor={ref}
                side="top"
                align="center"
                cds="ModelSelectorEffort"
                className="isolate flex w-[220px] select-none flex-col gap-lg"
            >
                <div className="flex items-center justify-between gap-sm">
                    <div className="flex min-w-0 items-center gap-sm">
                        <span className="shrink-0 text-muted">Effort</span>
                        <span aria-hidden="true" className="relative min-w-0">
                            <span className={`block min-w-0 truncate ${cur === "max" ? "font-medium text-pro" : ""}`}>{EFFORT_LABEL[cur]}</span>
                        </span>
                    </div>
                    <span title={EFFORT_DESC[cur]} className="text-muted hover:text-primary inline-flex shrink-0 items-center justify-center rounded-full">
                        <Icon name="Help" size="sm" />
                    </span>
                </div>
                <div className="flex w-full flex-col gap-sm">
                    <div dir="ltr" className="flex items-center justify-between gap-sm text-footnote text-muted">
                        <span>Faster</span>
                        <span>Smarter</span>
                    </div>
                    <div
                        data-cds="Slider"
                        className="group/slider flex w-full items-center"
                        tabIndex={0}
                        role="slider"
                        aria-label="Effort"
                        aria-valuemin={0}
                        aria-valuemax={levels.length - 1}
                        aria-valuenow={idx}
                        aria-valuetext={EFFORT_LABEL[cur]}
                        onKeyDown={e => {
                            if (e.key === "ArrowRight" || e.key === "ArrowUp") (e.preventDefault(), set(idx + 1));
                            if (e.key === "ArrowLeft" || e.key === "ArrowDown") (e.preventDefault(), set(idx - 1));
                        }}
                    >
                        <div
                            className="relative flex w-full touch-none select-none items-center h-control cursor-interactive"
                            onPointerDown={e => {
                                e.currentTarget.setPointerCapture(e.pointerId);
                                onTrack(e);
                            }}
                            onPointerMove={e => e.buttons && onTrack(e)}
                        >
                            <div
                                className="relative w-full overflow-hidden [container-type:inline-size] my-[2px] h-[calc(100%-4px)] rounded"
                                style={{ background: "var(--cds-slider-track, var(--cds-alpha-2))" }}
                            >
                                <div
                                    className="absolute inset-y-0"
                                    style={{
                                        left: 0,
                                        width: `calc(${pct * 100}% + (var(--cds-h-control) - 8px) * ${0.5 - pct})`,
                                        background: "var(--cds-slider-fill, var(--cds-alpha-3))",
                                    }}
                                />
                            </div>
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-[calc(var(--cds-h-control)/2-2px)]">
                                {levels.map((l, i) => (
                                    <span
                                        key={l}
                                        title={EFFORT_LABEL[l]}
                                        className="pointer-events-auto relative flex size-[3px] items-center justify-center rounded-full"
                                        style={{ background: "var(--cds-slider-stop-dot, var(--cds-text-muted))", opacity: i === idx ? 0 : 1 }}
                                    />
                                ))}
                            </div>
                            <div
                                className="w-[calc(var(--cds-h-control)-8px)] h-[calc(var(--cds-h-control)-4px)] rounded absolute top-1/2 -translate-x-1/2 -translate-y-1/2 motion-safe:transition-[left]"
                                style={{
                                    left: `calc(${pct * 100}% + (var(--cds-h-control) - 8px) * ${0.5 - pct})`,
                                    background: "var(--cds-slider-handle, var(--cds-text-primary))",
                                    boxShadow: "0 0 0 1px var(--cds-slider-handle-shadow-outer, #0003), 0 0 12px var(--cds-slider-handle-shadow-depth, #0002)",
                                }}
                            />
                        </div>
                    </div>
                    {cur === "max" && (
                        <div className="flex items-start gap-xs text-footnote text-warning">
                            <Icon name="Warning" size="xs" className="mt-0.5 shrink-0" />
                            <span className="min-w-0 text-pretty break-words">{EFFORT_DESC.max}</span>
                        </div>
                    )}
                </div>
                <span className="text-pretty text-footnote text-muted break-words">{EFFORT_DESC[cur]}</span>
            </Popover>
        </>
    );
}

const pctOf = (u: number | null | undefined) => (u == null ? null : u <= 1 ? u * 100 : u);
function resetLabel(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(+d)) return "";
    const sameDay = d.toDateString() === new Date().toDateString();
    return (
        "Resets " +
        (sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }))
    );
}

// "On track" / "Heads up": usage so far against how much of the window has passed
function paceNote(x: { pct: number; reset?: string; windowH?: number }): { text: string; warn: boolean } | null {
    if (!x.reset || !x.windowH || x.pct < 20) return null;
    const left = new Date(x.reset).getTime() - Date.now();
    if (!(left > 0)) return null;
    const elapsed = Math.max(0.02, 1 - left / (x.windowH * 3600_000));
    const projected = x.pct / elapsed;
    if (projected > 110) return { text: `Heads up: at this pace you’ll hit this limit before it resets.`, warn: true };
    return { text: "On track for this window.", warn: false };
}

function UsageRing({ chat, r }: { chat: AgentChat; r: ReturnType<typeof rt> }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (open) refreshUsage(chat.localId);
    }, [open]);
    const cu = r.contextUsage;
    const ctxPct = cu?.percentage ?? (cu?.maxTokens ? (cu.totalTokens / cu.maxTokens) * 100 : null);
    const rl = r.usage?.rate_limits;
    const rows = [
        rl?.five_hour && { label: "5-hour limit", pct: pctOf(rl.five_hour.utilization), reset: rl.five_hour.resets_at, windowH: 5 },
        rl?.seven_day && { label: "Weekly · all models", pct: pctOf(rl.seven_day.utilization), reset: rl.seven_day.resets_at, windowH: 168 },
        rl?.seven_day_opus && { label: "Weekly · Opus", pct: pctOf(rl.seven_day_opus.utilization), reset: rl.seven_day_opus.resets_at },
        rl?.seven_day_sonnet && { label: "Weekly · Sonnet", pct: pctOf(rl.seven_day_sonnet.utilization), reset: rl.seven_day_sonnet.resets_at },
        ...(rl?.model_scoped ?? []).map((m: any) => ({ label: `Weekly · ${m.display_name}`, pct: pctOf(m.utilization), reset: m.resets_at })),
    ].filter((x: any) => x && x.pct != null) as { label: string; pct: number; reset?: string; windowH?: number }[];
    const pct = ctxPct ?? rows[0]?.pct ?? 0;
    const C = 2 * Math.PI * 5;
    const color = pct >= 90 ? "var(--cds-fill-danger)" : pct >= 75 ? "var(--cds-fill-warning)" : "var(--cds-fill-accent)";
    const ctxSummary = cu ? `${fmtShort(cu.totalTokens)} / ${fmtShort(cu.maxTokens)} (${Math.round(ctxPct ?? 0)}%)` : null;
    const aria = [
        "Usage:",
        ctxSummary ? `Context ${ctxSummary}` : "Context 0",
        ...rows.map(x => `${x.label}: ${Math.round(x.pct)}%`),
        rows[0]?.reset ? resetLabel(rows[0].reset) : "",
    ]
        .filter(Boolean)
        .join(", ")
        .replace("Usage:,", "Usage:");
    const cost = r.usage?.session?.total_cost_usd;
    return (
        <>
            <Button ref={ref} iconOnly className="shrink-0" aria-label={aria} title={aria} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
                <svg width="12" height="12" viewBox="0 0 12 12" className="-rotate-90" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" fill="none" strokeWidth="2" stroke="var(--cds-alpha-2)" />
                    <circle
                        cx="6"
                        cy="6"
                        r="5"
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray={C}
                        strokeDashoffset={C * (1 - Math.max(0, Math.min(100, pct)) / 100)}
                        strokeLinecap="round"
                        stroke={color}
                        className="transition-[stroke-dashoffset] duration-300"
                    />
                </svg>
            </Button>
            <Popover
                open={open}
                onClose={() => setOpen(false)}
                anchor={ref}
                side="top"
                align="end"
                offset={8}
                padding="p-0"
                className="epitaxy-root break-words w-[360px] max-w-[calc(100vw-2rem)] max-h-[min(var(--available-height),640px)]"
            >
                <span className="sr-only">Usage</span>
                <div className="flex flex-col py-sm">
                    <ContextSection cu={cu} ctxPct={ctxPct} summary={ctxSummary} onCompact={r.busy ? undefined : () => (setOpen(false), sendPrompt(chat, "/compact"))} />
                    <div className="mx-pad-lg my-xs h-px bg-alpha-2 first:hidden" />
                    <div className="flex flex-col gap-xs">
                        <div className="flex items-center justify-between gap-2 px-lg py-xs min-h-[20px]">
                            <span className="text-footnote text-muted">Plan usage{r.usage?.subscription_type ? ` · ${cap(r.usage.subscription_type)}` : ""}</span>
                        </div>
                        <div className="flex flex-col gap-sm px-lg pb-xs">
                            {!r.usage && <span className="text-footnote text-muted">Loading usage…</span>}
                            {r.usage && !rows.length && (
                                <span className="text-footnote text-muted">
                                    {r.usage.rate_limits_available === false ? "Plan usage unavailable" : "Couldn’t load usage limits"}
                                </span>
                            )}
                            {rows.map(x => (
                                <div key={x.label} className="flex flex-col">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-footnote text-primary truncate">{x.label}</span>
                                        <span className="flex items-baseline gap-1.5 text-footnote text-muted tabular-nums shrink-0">
                                            <span>{resetLabel(x.reset)}</span>
                                            <span>{Math.round(x.pct)}%</span>
                                        </span>
                                    </div>
                                    <div className="mt-pad-xs h-[4px] rounded-[3px] overflow-hidden bg-alpha-1" role="progressbar" aria-valuenow={Math.round(x.pct)}>
                                        <div
                                            className={`h-full ${x.pct >= 90 ? "bg-fill-danger" : x.pct >= 75 ? "bg-fill-warning" : "bg-fill-accent"} transition-[width]`}
                                            style={{ width: `${Math.min(100, x.pct)}%` }}
                                        />
                                    </div>
                                    {paceNote(x) && <span className={`mt-pad-xs text-footnote ${paceNote(x)!.warn ? "text-warning" : "text-muted"}`}>{paceNote(x)!.text}</span>}
                                </div>
                            ))}
                            {rl?.extra_usage?.is_enabled && (
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-footnote text-primary truncate">Extra usage</span>
                                    <span className="text-footnote text-muted tabular-nums">
                                        {rl.extra_usage.used_credits ?? 0}
                                        {rl.extra_usage.monthly_limit ? ` of ${rl.extra_usage.monthly_limit}` : " spent"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    {cost != null && (
                        <>
                            <div className="mx-pad-lg my-xs h-px bg-alpha-2 first:hidden" />
                            <div className="flex items-center justify-between gap-2 px-lg py-xs min-h-[20px]">
                                <span className="text-footnote text-muted">This session</span>
                                <span className="text-footnote text-muted tabular-nums">
                                    ${cost.toFixed(2)} · +{r.usage.session.total_lines_added} −{r.usage.session.total_lines_removed} lines
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </Popover>
        </>
    );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtShort = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

function ContextSection({ cu, ctxPct, summary, onCompact }: { cu: any; ctxPct: number | null; summary: string | null; onCompact?: () => void }) {
    const left = cu?.isAutoCompactEnabled && cu.autoCompactThreshold ? cu.autoCompactThreshold - cu.totalTokens : null;
    const [open, setOpen] = useState(false);
    const cats: any[] = (cu?.categories ?? []).filter((c: any) => c.kind !== "free" && c.tokens > 0);
    return (
        <div className="flex flex-col">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="group flex items-center gap-2 px-lg py-xs min-h-[20px] text-left outline-none focus-visible:shadow-focus rounded"
            >
                <span className="text-footnote text-muted">Context window</span>
                <span className="text-footnote text-muted tabular-nums ml-auto">{summary ?? "—"}</span>
                <Icon
                    name="CaretRight"
                    size="xs"
                    className={`text-muted group-hover:text-primary shrink-0 transition-transform duration-fast motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
                />
            </button>
            <div className="mt-pad-xs px-lg pb-xs">
                {cu ? (
                    <div className="h-[4px] rounded-full overflow-hidden bg-alpha-1" role="progressbar" aria-label="Context window" aria-valuenow={Math.round(ctxPct ?? 0)}>
                        <div className="h-full bg-fill-accent transition-[width]" style={{ width: `${Math.min(100, ctxPct ?? 0)}%` }} />
                    </div>
                ) : (
                    <div className="text-footnote text-secondary">Send a message to see context usage.</div>
                )}
                {cu && (left != null || (ctxPct ?? 0) >= 50) && (
                    <div className="flex items-center gap-xs pt-xs text-footnote">
                        <span className={left != null && left < cu.maxTokens * 0.05 ? "text-warning" : "text-muted"}>
                            {left == null
                                ? cu?.isAutoCompactEnabled === false
                                    ? "Auto-compact is off"
                                    : ""
                                : left <= 0
                                  ? "Auto-compacts on the next message"
                                  : left < cu.maxTokens * 0.05
                                    ? "Auto-compacts soon"
                                    : `${fmtShort(left)} until auto-compact`}
                        </span>
                        {onCompact && (ctxPct ?? 0) >= 30 && (
                            <button
                                type="button"
                                className="ms-auto cds-reset cds-text-link cds-text-link-underline text-footnote text-secondary hover:text-primary cursor-pointer"
                                onClick={onCompact}
                            >
                                Compact now
                            </button>
                        )}
                    </div>
                )}
                {open && cats.length > 0 && (
                    <div className="flex flex-col gap-0.5 pt-sm">
                        {cats.map(c => (
                            <div key={c.name} className="flex items-center gap-xs text-footnote">
                                <span className="size-[8px] shrink-0 rounded-full" style={{ background: c.color?.startsWith("#") ? c.color : "var(--cds-fill-accent)" }} />
                                <span className="flex-1 truncate text-secondary">{c.name}</span>
                                <span className="tabular-nums text-muted">{fmtShort(c.tokens)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- typeahead menus
const SLASH_POP = "z-dropdown rounded-card bg-surface-3 shadow-panel flex flex-col min-w-60 max-w-lg max-h-96";
function SlashMenu({
    items,
    hi,
    setHi,
    anchor,
    onPick,
    query,
}: {
    items: any[];
    hi: number;
    setHi: (i: number) => void;
    anchor: React.RefObject<HTMLDivElement | null>;
    onPick: (c: any) => void;
    query: string;
}) {
    const portal = usePortal();
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
    const list = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const a = anchor.current?.getBoundingClientRect();
        if (a) setPos({ left: a.left, bottom: window.innerHeight - a.top + 10 });
    }, [items.length]);
    useEffect(() => {
        list.current?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" });
    }, [hi]);
    if (!portal || !pos) return null;
    const cur = items[hi];
    return createPortal(
        <div
            className="cds-root pointer-events-auto"
            data-cds-portal=""
            style={{ position: "fixed", left: pos.left, bottom: pos.bottom, display: "flex", gap: 8, alignItems: "flex-end" }}
        >
            <div role="menu" className={SLASH_POP} style={{ maxWidth: "min(32rem, 60vw)" }}>
                <div ref={list} className="min-h-0 overflow-y-auto scroll-fade-y rounded-[inherit] border-b-[length:var(--cds-ring-inner)] border-transparent p-1">
                    <div className="flex flex-col">
                        {!items.length && <div className="px-md py-sm text-body text-muted">No matching commands</div>}
                        {items.map((c, i) => (
                            <div
                                key={c.name}
                                role="menuitem"
                                tabIndex={-1}
                                data-highlighted={i === hi ? "" : undefined}
                                className={`${MENU_ITEM} text-primary data-[highlighted]:bg-fill-ghost-hover`}
                                onMouseMove={() => setHi(i)}
                                onMouseDown={e => (e.preventDefault(), onPick(c))}
                            >
                                <div className="flex size-icon shrink-0 items-center justify-center opacity-50">
                                    <Icon name={c.name.includes(":") ? "Plugin" : "SlashShortcutCommand"} size="sm" />
                                </div>
                                <span className="shrink-0">{highlightMatch(c.name, query)}</span>
                                {c.argumentHint && <span className="min-w-0 truncate text-muted">{c.argumentHint}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {cur?.description && (
                <div
                    className="px-2 py-1 text-xs font-normal font-sans leading-tight rounded-md shadow-md text-gray-0 bg-always-black/80 backdrop-blur break-words text-pretty pointer-events-none"
                    style={{ marginBottom: 4, maxWidth: "min(22rem, calc(100vw - 38rem))" }}
                >
                    <div className="line-clamp-[10]">{cur.description}</div>
                </div>
            )}
        </div>,
        portal,
    );
}
function highlightMatch(s: string, q: string): ReactNode {
    const i = q ? s.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return s;
    return (
        <>
            {s.slice(0, i)}
            <span className="font-semibold">{s.slice(i, i + q.length)}</span>
            {s.slice(i + q.length)}
        </>
    );
}

function MentionMenu({ items, hi, setHi, onPick }: { items: any[]; hi: number; setHi: (i: number) => void; onPick: (m: any) => void }) {
    const portal = usePortal();
    const [rect] = useState(() => caretRect());
    if (!portal) return null;
    const label = (m: any) => (typeof m === "string" ? m : (m.displayText ?? m.path ?? m.name ?? m.id));
    const top = rect ? rect.top - 24 : window.innerHeight / 2;
    return createPortal(
        <div
            className={`${POPOVER} max-h-[min(var(--available-height),384px)] max-w-none select-none`}
            data-testid="mention-dropdown"
            role="presentation"
            style={{
                position: "fixed",
                left: Math.max(8, (rect?.left ?? 100) - 16),
                bottom: window.innerHeight - top,
                width: 420,
                ["--available-height" as any]: `${top - 8}px`,
                overflowY: "auto",
            }}
        >
            <div data-cds="MentionDropdown" role="listbox" aria-label="Mention suggestions" tabIndex={-1} className="p-1">
                <div aria-hidden="true" className="compact:px-2 comfortable:px-2.5 py-1 text-footnote font-medium text-muted flex items-center gap-xs select-none">
                    <span className="truncate">
                        <bdi>Files</bdi>
                    </span>
                </div>
                {!items.length && <div className="px-md py-sm text-body text-muted">No matching files</div>}
                {items.map((m, i) => {
                    const l = label(m);
                    const dir = l.endsWith("/") || m?.type === "directory";
                    const base = l.replace(/\/$/, "").split("/").pop();
                    const parent = l.replace(/\/$/, "").split("/").slice(0, -1).join("/");
                    return (
                        <button
                            key={l}
                            type="button"
                            role="option"
                            aria-selected={i === hi}
                            data-highlighted={i === hi ? "" : undefined}
                            className={`${MENU_ITEM} text-primary data-[highlighted]:bg-fill-ghost-hover text-left`}
                            onMouseMove={() => setHi(i)}
                            onMouseDown={e => (e.preventDefault(), onPick(m))}
                            title={l}
                        >
                            <span aria-hidden="true" className="flex size-icon shrink-0 items-center justify-center overflow-hidden">
                                <Icon name={dir ? "Folder" : "File"} size="sm" />
                            </span>
                            <span className="flex min-w-0 flex-1 items-baseline gap-xs text-left">
                                <span className="truncate text-primary max-w-full flex-shrink-0">
                                    <bdi>{base}</bdi>
                                </span>
                                {parent && (
                                    <span className="truncate text-caption text-muted">
                                        <bdi>{parent}</bdi>
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>,
        portal,
    );
}

// ---------------------------------------------------------------- queue (above the composer)
export function QueueStack({ chat }: { chat: AgentChat }) {
    const q = useAgents(s => s.runtimes[chat.localId]?.queued) ?? [];
    const [open, setOpen] = useState(false);
    if (!q.length) return null;
    const edit = (id: string, text: string) => {
        removeQueued(chat.localId, id);
        window.dispatchEvent(new CustomEvent("evi-claude:composer-set", { detail: { localId: chat.localId, text } }));
    };
    const now = (id: string, _text?: string) => sendQueuedNow(chat.localId, id);
    if (q.length === 1) {
        const it = q[0];
        return (
            <div data-take-back-entry={it.id} className="flex items-center gap-[5px] w-full min-h-[40px] p-[8px] rounded-[10px] bg-alpha-1 px-lg select-none">
                <span className="text-body-medium text-primary shrink-0">1 message queued</span>
                <span className="flex-1 min-w-0 truncate text-body text-muted">{it.text || "Image"}</span>
                <Button iconOnly icon="ArrowReturn" aria-label="Send now" title="Send now" className="text-muted hover:text-primary" onClick={() => now(it.id, it.text)} />
                <Button
                    iconOnly
                    icon="Edit"
                    aria-label="Edit in composer"
                    title="Edit in composer"
                    className="text-muted hover:text-primary"
                    onClick={() => edit(it.id, it.text)}
                />
                <Button
                    iconOnly
                    icon="X"
                    aria-label="Remove from queue"
                    title="Remove from queue"
                    className="text-muted hover:text-primary"
                    onClick={() => removeQueued(chat.localId, it.id)}
                />
            </div>
        );
    }
    if (!open)
        return (
            <button
                type="button"
                aria-expanded="false"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.25 w-full min-w-0 min-h-10 px-lg rounded-card bg-alpha-1 select-none text-left focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus hover:bg-alpha-2"
            >
                <span className="text-body-medium text-primary shrink-0">{q.length} messages queued</span>
                <span className="flex-1 min-w-0 truncate text-body text-muted">Next: {q[0].text}</span>
                <span aria-hidden="true" className="grid size-control shrink-0 place-items-center text-muted">
                    <Icon name="CaretDown" size="sm" />
                </span>
            </button>
        );
    return (
        <div className="flex flex-col w-full rounded-card bg-alpha-1 select-none overflow-clip divide-y">
            <div className="flex items-center gap-1.25 w-full min-h-10 px-lg">
                <span className="flex-1 min-w-0 text-body-medium text-primary">{q.length} messages queued</span>
                <Button
                    iconOnly
                    icon="CaretUp"
                    aria-expanded="true"
                    aria-label="Collapse queued messages"
                    className="text-muted hover:text-primary"
                    onClick={() => setOpen(false)}
                />
            </div>
            <div role="list" aria-label="Queued messages" className="flex flex-col max-h-[min(40vh,22rem)] overflow-y-auto overscroll-contain p-xs">
                {q.map(it => (
                    <div key={it.id} role="listitem" data-take-back-entry={it.id} className="group/row relative flex items-start gap-1.25 min-w-0 p-1.25 rounded">
                        <span className="flex-1 min-w-0 text-body line-clamp-2 select-text text-primary">{it.text}</span>
                        <div className="absolute right-1.25 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100">
                            <Button iconOnly icon="ArrowReturn" aria-label="Send now" onClick={() => now(it.id, it.text)} />
                            <Button iconOnly icon="Edit" aria-label="Edit in composer" onClick={() => edit(it.id, it.text)} />
                            <Button iconOnly icon="X" aria-label="Remove from queue" onClick={() => removeQueued(chat.localId, it.id)} />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end px-lg py-sm">
                <button className="text-footnote text-danger" onClick={() => q.forEach(it => removeQueued(chat.localId, it.id))}>
                    Clear all
                </button>
            </div>
        </div>
    );
}

export function ScrollToBottom() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const fn = (e: any) => setShow(!!e.detail);
        window.addEventListener("evi-claude:scroll-pill", fn);
        return () => window.removeEventListener("evi-claude:scroll-pill", fn);
    }, []);
    return (
        <button
            type="button"
            aria-label="Scroll to bottom"
            aria-hidden={!show}
            tabIndex={show ? 0 : -1}
            onClick={() => window.dispatchEvent(new Event("evi-claude:scroll-bottom"))}
            className={`inline-flex items-center h-[24px] px-xs rounded bg-surface-panel text-secondary shadow-field hover:bg-[linear-gradient(var(--cds-fill-secondary-hover),var(--cds-fill-secondary-hover))] border-0 focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus absolute -top-[32px] left-1/2 -translate-x-1/2 z-[1] gap-xs transition-opacity duration-150 ${show ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
            <Icon name="CaretDown" size="xs" />
        </button>
    );
}
