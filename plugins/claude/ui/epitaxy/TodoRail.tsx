// Live todo list ("turn box") pinned above the composer while Claude works through a TodoWrite plan.
import { useState } from "react";
import { useAgents, type AgentChat } from "../store";
import { TodoList } from "./Tools";
import { Button } from "../cds/Button";

export function TodoRail({ chat }: { chat: AgentChat }) {
    const r = useAgents(s => s.runtimes[chat.localId]);
    const [dismissed, setDismissed] = useState<string | null>(null);
    if (!r) return null;
    const last = [...r.items].reverse().find(x => x.kind === "tool" && x.name === "TodoWrite" && !(x as any).parentId) as any;
    const todos: any[] = last?.input?.todos ?? [];
    if (!last || !todos.length || dismissed === last.id) return null;
    const done = todos.filter(t => t.status === "completed").length;
    if (done === todos.length && !r.busy) return null;
    // a window of at most 7 steps around the active one
    const active = Math.max(
        0,
        todos.findIndex(t => t.status !== "completed"),
    );
    const start = Math.max(0, Math.min(active - 2, todos.length - 7));
    const shown = todos.slice(start, start + 7);
    const before = start;
    const after = todos.length - start - shown.length;
    return (
        <div
            className="epitaxy-root motion-safe:animate-fade-in text-body text-primary break-words overflow-clip rounded-card shadow-[inset_0_0_0_1px_var(--cds-ring-color)]"
            style={{ background: "var(--cds-surface-1)" }}
        >
            <div data-turnbox-part="" className="flex flex-col gap-1 p-4" style={{ padding: 12 }}>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-secondary select-text">
                        Progress · {done} of {todos.length}
                    </span>
                    {!r.busy && <Button iconOnly icon="X" aria-label="Dismiss status" className="-mr-1.5 shrink-0 text-secondary" onClick={() => setDismissed(last.id)} />}
                </div>
                {before > 0 && (
                    <p className="pl-6 text-caption text-muted">
                        {before} earlier step{before === 1 ? "" : "s"}
                    </p>
                )}
                <TodoList todos={shown} mutedDone spin={r.busy} unpadded />
                {after > 0 && <p className="pl-6 text-caption text-muted">{after} more to go</p>}
            </div>
        </div>
    );
}
