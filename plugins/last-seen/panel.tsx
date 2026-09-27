/**
 * Settings panel: how many people are remembered, clear (with confirm and undo), export and
 * import, and a searchable list of everyone, most recently seen first.
 */
import { Components, React } from "@evi/api";

import { fullText, opts, replaceAll, state, store, useVersion } from "./state";
import { DEFAULT_CAP, deserialize, merge, serialize } from "./track";
import type { Entry, Tracker } from "./track";

const SHOWN = 100;
const UNDO_FOR = 10_000;

const css = `
.evi-ls-panel { display: flex; flex-direction: column; gap: 16px; }
.evi-ls-row { display: flex; align-items: center; gap: 12px; }
.evi-ls-row > .dl-field-text { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 4px; }
.evi-ls-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.evi-ls-meter { block-size: 4px; margin-block-start: 4px; border-radius: 999px; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); overflow: hidden; }
.evi-ls-meter > span { display: block; block-size: 100%; border-radius: inherit; background: var(--dl-text-muted, #949ba4); }
.evi-ls-meter[data-full] > span { background: var(--dl-text-warning, #f0b232); }
.evi-ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.evi-ls-person { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: var(--dl-radius-control, 8px); }
@media (hover: hover) { .evi-ls-person:hover { background: var(--dl-bg-hover, rgb(151 151 159 / 0.12)); } }
.evi-ls-avatar { flex: none; inline-size: 32px; block-size: 32px; border-radius: 50%; object-fit: cover; background: var(--dl-bg-emphasis, rgb(151 151 159 / 0.16)); display: grid; place-items: center; color: var(--dl-text-subtle, #b5bac1); font-size: 14px; font-weight: 600; }
.evi-ls-text { min-inline-size: 0; display: flex; flex-direction: column; }
.evi-ls-name { color: var(--dl-text-strong, #f2f3f5); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-times { color: var(--dl-text-muted, #949ba4); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evi-ls-id { font-family: var(--dl-font-code, ui-monospace, Consolas, monospace); }
`;

function SmallButton({ children, onClick, disabled, danger, label }: { children: React.ReactNode; onClick(): void; disabled?: boolean; danger?: boolean; label?: string; }) {
    const Button = Components.Button as any;
    return Button
        ? <Button color={danger ? Button.Colors?.RED : Button.Colors?.PRIMARY} size={Button.Sizes?.SMALL} disabled={disabled} onClick={onClick} aria-label={label}>{children}</Button>
        : <button type="button" className="dl-button" data-variant={danger ? "danger" : undefined} disabled={disabled} onClick={onClick} aria-label={label}>{children}</button>;
}

const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"}`;

const latest = (e: Entry) => Math.max(e.seen ?? 0, e.active ?? 0, e.message ?? 0);

function nameOf(id: string): { name: string; known: boolean; search: string; user: any; } {
    const user = store("UserStore")?.getUser?.(id);
    const nick = store("RelationshipStore")?.getNickname?.(id) as string | undefined;
    const name = nick || user?.globalName || user?.global_name || user?.username;
    const search = [nick, user?.globalName ?? user?.global_name, user?.username, id].filter(Boolean).join(" ").toLowerCase();
    return { name: name ?? id, known: !!name, search, user };
}

function download(data: unknown) {
    const date = new Date();
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `evi-last-seen-${day}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Remembered: count, clear with undo, export, import --------------------------------------

function Remembered() {
    useVersion();
    const count = state.tracker.size;
    const [confirming, setConfirming] = React.useState(false);
    const [undo, setUndo] = React.useState<{ tracker: Tracker; count: number; }>();
    const fileRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (!undo) return;
        const timer = setTimeout(() => setUndo(undefined), UNDO_FOR);
        return () => clearTimeout(timer);
    }, [undo]);

    const clear = () => {
        setConfirming(false);
        setUndo({ tracker: state.tracker, count });
        void replaceAll(new Map());
    };

    const restore = () => {
        if (!undo) return;
        // Keep anything seen since clearing, on top of what's restored
        const tracker = new Map(undo.tracker);
        for (const [id, entry] of state.tracker) {
            const old = tracker.get(id);
            tracker.delete(id);
            tracker.set(id, merge(old, entry));
        }
        setUndo(undefined);
        void replaceAll(tracker);
        state.context?.toast(`Restored ${people(tracker.size)}`, { type: "success" });
    };

    const importFile = async (file: File) => {
        try {
            const imported = deserialize(JSON.parse(await file.text()), opts);
            if (!imported.size) {
                state.context?.toast("Nothing to import in that file", { type: "failure" });
                return;
            }
            const tracker = new Map(state.tracker);
            for (const [id, entry] of imported) {
                const current = tracker.get(id);
                tracker.delete(id);
                tracker.set(id, current ? merge(entry, current) : entry);
            }
            await replaceAll(tracker);
            state.context?.toast(`Imported ${people(imported.size)}`, { type: "success" });
        } catch (e) {
            state.context?.logger.error("Couldn't import", e);
            state.context?.toast("That file isn't a Last Seen export", { type: "failure" });
        }
    };

    const ratio = Math.min(1, count / DEFAULT_CAP);

    return (
        <div className="evi-ls-row">
            <div className="dl-field-text">
                <div className="dl-label">Remembered</div>
                <p className="dl-hint" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {undo
                        ? `Cleared ${people(undo.count)}.`
                        : `${people(count)} of ${DEFAULT_CAP.toLocaleString()}. Kept on this device only; friends and DMs are kept longest.`}
                </p>
                {!undo && (
                    <div className="evi-ls-meter" data-full={ratio >= 0.9 || undefined} role="meter" aria-label="Space used" aria-valuemin={0} aria-valuemax={DEFAULT_CAP} aria-valuenow={count}>
                        <span style={{ inlineSize: `${ratio * 100}%` }} />
                    </div>
                )}
            </div>
            <div className="evi-ls-actions">
                {undo
                    ? <SmallButton onClick={restore}>Undo</SmallButton>
                    : confirming
                        ? <>
                            <SmallButton onClick={() => setConfirming(false)}>Cancel</SmallButton>
                            <SmallButton danger onClick={clear}>Clear {people(count)}?</SmallButton>
                        </>
                        : <>
                            <SmallButton disabled={!count} onClick={() => download(serialize(state.tracker, Date.now()))}>Export</SmallButton>
                            <SmallButton onClick={() => fileRef.current?.click()}>Import</SmallButton>
                            <SmallButton danger disabled={!count} onClick={() => setConfirming(true)}>Clear data</SmallButton>
                        </>}
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={e => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (file) void importFile(file);
                    }}
                />
            </div>
        </div>
    );
}

// --- Everyone, searchable --------------------------------------------------------------------

function Avatar({ user, name }: { user: any; name: string; }) {
    const [broken, setBroken] = React.useState(false);
    let src: string | undefined;
    try {
        src = user?.getAvatarURL?.(undefined, 32);
    } catch { }
    if (!src || broken) return <span className="evi-ls-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
    return <img className="evi-ls-avatar" src={src} alt="" width={32} height={32} onError={() => setBroken(true)} />;
}

function People() {
    const [query, setQuery] = React.useState("");
    const q = query.trim().toLowerCase();

    const version = useVersion();
    // Up to 25000 people: sort once per data change, and only look names up when searching
    const sorted = React.useMemo(() => [...state.tracker].sort((a, b) => latest(b[1]) - latest(a[1])).map(([id]) => id), [version, state.tracker]);
    const matches: { id: string; name: ReturnType<typeof nameOf>; }[] = [];
    let total = 0;
    for (const id of sorted) {
        if (!q) {
            if (matches.length < SHOWN) matches.push({ id, name: nameOf(id) });
            continue;
        }
        const name = nameOf(id);
        if (!name.search.includes(q)) continue;
        total++;
        if (matches.length < SHOWN) matches.push({ id, name });
    }
    if (!q) total = sorted.length;

    const TextField = Components.TextField as any;
    const label = "Search remembered people";

    return (
        <div className="dl-field">
            <div className="dl-label">People</div>
            {TextField
                ? <TextField value={query} onChange={(v: string) => setQuery(v)} placeholder="Search by name or ID" aria-label={label} />
                : <input className="dl-input" type="search" autoComplete="off" spellCheck={false} placeholder="Search by name or ID" aria-label={label} value={query} onChange={e => setQuery(e.currentTarget.value)} />}
            {matches.length
                ? <ul className="evi-ls-list">
                    {matches.map(({ id, name }) => (
                        <li key={id} className="evi-ls-person">
                            <Avatar user={name.user} name={name.name} />
                            <span className="evi-ls-text">
                                <span className={name.known ? "evi-ls-name" : "evi-ls-name evi-ls-id"}>{name.name}</span>
                                <span className="evi-ls-times">{fullText(id) ?? "Nothing recent"}</span>
                            </span>
                        </li>
                    ))}
                </ul>
                : <p className="dl-hint">{state.tracker.size ? "No one matches that." : "No one yet. People show up here as Discord tells your client about them."}</p>}
            {total > matches.length && <p className="dl-hint" style={{ fontVariantNumeric: "tabular-nums" }}>Showing {matches.length.toLocaleString()} of {total.toLocaleString()}. Search to find someone else.</p>}
        </div>
    );
}

export function SettingsPanel() {
    return (
        <div className="evi-ls-panel">
            <style>{css}</style>
            <Remembered />
            <People />
        </div>
    );
}
