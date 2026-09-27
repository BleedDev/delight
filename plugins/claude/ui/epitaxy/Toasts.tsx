// In-app notices when a session needs you or finishes while you're elsewhere in Discord.
import { N } from "../native";
import { useEffect, useState } from "react";
import { useAgents, setView, chatById } from "../store";
import { Button } from "../cds/Button";
import { Icon } from "../cds/Icon";
import { StaticSpark } from "../cds/Spark";
import { kv } from "../kv";
import { openChannel } from "../discord";

interface Toast {
    id: string;
    localId: string;
    kind: "approval" | "done" | "ping" | "error";
    title: string;
    body?: string;
}

export function Toasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    useEffect(() => {
        const off = N().agents.onEvent((ev: any) => {
            const { localId, type, data } = ev;
            const st = useAgents.getState();
            // not when this session is already on screen
            const visible = (st.open && st.activeId === localId) || Object.values(st.panelFor).includes(localId);
            if (visible || !kv.get("toasts", true)) return;
            const chat = chatById(localId);
            const name = chat?.title ?? "Claude Code";
            let t: Toast | null = null;
            if (type === "permission" || type === "request")
                t = {
                    id: `${localId}:need`,
                    localId,
                    kind: "approval",
                    title: `${name} needs your input`,
                    body: data?.toolName
                        ? `Wants to use ${String(data.toolName)
                              .replace(/^mcp__\w+?__/, "")
                              .replace(/_/g, " ")}`
                        : undefined,
                };
            else if (type === "ping") t = { id: `${localId}:ping:${Date.now()}`, localId, kind: "ping", title: data?.title ?? name, body: data?.body };
            else if (type === "message" && data?.type === "result")
                t =
                    data.subtype === "success"
                        ? {
                              id: `${localId}:done`,
                              localId,
                              kind: "done",
                              title: `${name} finished`,
                              body:
                                  String(data.result ?? "")
                                      .replace(/\s+/g, " ")
                                      .slice(0, 140) || undefined,
                          }
                        : null;
            if (!t) return;
            setToasts(ts => [...ts.filter(x => x.id !== t!.id), t!].slice(-4));
            if (t.kind !== "approval") setTimeout(() => setToasts(ts => ts.filter(x => x.id !== t!.id)), 8000);
        });
        // plain notices from anywhere in the UI (attachment errors, etc.)
        const onNotice = (e: any) => {
            const t: Toast = { id: "notice:" + Date.now(), localId: "", kind: "error", title: e.detail?.title ?? "", body: e.detail?.body };
            setToasts(ts => [...ts, t].slice(-4));
            setTimeout(() => setToasts(ts => ts.filter(x => x.id !== t.id)), 6000);
        };
        window.addEventListener("evi-claude:toast", onNotice);
        return () => (off?.(), window.removeEventListener("evi-claude:toast", onNotice));
    }, []);
    // approvals disappear once answered
    const pending = useAgents(s => s.runtimes);
    useEffect(() => {
        setToasts(ts => ts.filter(t => t.kind !== "approval" || (pending[t.localId]?.permissions.length ?? 0) + (pending[t.localId]?.requests?.length ?? 0) > 0));
    }, [pending]);
    if (!toasts.length) return null;
    return (
        <div
            data-cds="Toast"
            className="cds-reset pointer-events-none flex flex-col-reverse gap-md"
            style={{ position: "fixed", right: 16, bottom: 16, width: 360, maxWidth: "calc(100vw - 2rem)", zIndex: 9000 }}
        >
            {toasts.map(t => (
                <div
                    key={t.id}
                    role="status"
                    className="pointer-events-auto flex items-start gap-sm rounded-card bg-surface-3 shadow-panel p-md motion-safe:animate-[cds-fade-in_0.15s_ease-out]"
                >
                    <span className="shrink-0 pt-0.5">
                        {t.kind === "error" ? (
                            <Icon name="Warning" size="sm" className="text-danger" />
                        ) : t.kind === "approval" ? (
                            <Icon name="Hand" size="sm" className="text-warning" />
                        ) : t.kind === "ping" ? (
                            <Icon name="Notification" size="sm" style={{ color: "var(--cds-clay)" }} />
                        ) : (
                            <StaticSpark size={16} />
                        )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-body-medium text-primary truncate">{t.title}</span>
                        {t.body && <span className="text-footnote text-secondary line-clamp-2">{t.body}</span>}
                        {t.localId && (
                            <div className="flex gap-xs pt-xs">
                                <Button
                                    variant={t.kind === "approval" ? "primary" : "secondary"}
                                    size="sm"
                                    onClick={() => {
                                        const c = chatById(t.localId);
                                        if (c?.attachedChannelId && !useAgents.getState().open) openChannel(c.attachedChannelId);
                                        else setView({ open: true, activeId: t.localId });
                                        setToasts(ts => ts.filter(x => x.id !== t.id));
                                    }}
                                >
                                    {t.kind === "approval" ? "Review" : "Open"}
                                </Button>
                            </div>
                        )}
                    </div>
                    <Button iconOnly icon="X" size="sm" aria-label="Dismiss" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))} />
                </div>
            ))}
        </div>
    );
}
