import type { ImportMode, ImportPreview } from "@shared/backup";
import type { BackupOpenResult } from "@shared/ipc";

import { Backup } from "../backup";
import { React } from "../webpack/common";
import { Button, Icon, SettingField, Status, Tone } from "./components";

type Opened = Extract<BackupOpenResult, { ok: true; }>;
type Note = { tone: Tone; text: string; } | null;

const MODES = [
    { value: "merge", label: "Merge into what you have" },
    { value: "replace", label: "Replace everything" },
] as const;

const MODE_HINTS: Record<ImportMode, string> = {
    merge: "The backup’s plugin choices and settings win, everything else stays. Enabled themes are combined. Your Quick CSS is kept unless it’s empty.",
    replace: "Your settings and Quick CSS become exactly the backup’s. Themes that aren’t in the backup are turned off, their files stay.",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (items: string[]) => items.join(", ");

/** One line per kind of change, in plain words */
function describe(p: ImportPreview) {
    const lines: string[] = [];
    if (p.pluginsEnabled.length) lines.push(`Turns on ${plural(p.pluginsEnabled.length, "plugin")}: ${list(p.pluginsEnabled)}`);
    if (p.pluginsDisabled.length) lines.push(`Turns off ${plural(p.pluginsDisabled.length, "plugin")}: ${list(p.pluginsDisabled)}`);
    if (p.pluginSettingsChanged.length) lines.push(`Changes settings of ${plural(p.pluginSettingsChanged.length, "plugin")}: ${list(p.pluginSettingsChanged)}`);
    if (p.themesAdded.length) lines.push(`Adds ${plural(p.themesAdded.length, "theme")}: ${list(p.themesAdded)}`);
    if (p.themesOverwritten.length) lines.push(`Overwrites ${plural(p.themesOverwritten.length, "theme")} with the backup’s version: ${list(p.themesOverwritten)}`);
    if (p.themesEnabled.length) lines.push(`Turns on ${plural(p.themesEnabled.length, "theme")}: ${list(p.themesEnabled)}`);
    if (p.themesDisabled.length) lines.push(`Turns off ${plural(p.themesDisabled.length, "theme")}: ${list(p.themesDisabled)}`);
    if (p.quickCss === "replaced") lines.push("Replaces your Quick CSS with the backup’s");
    if (p.quickCss === "kept") lines.push("Keeps your Quick CSS, the backup’s is different. Replace everything to use it.");
    if (p.quickCssToggle !== undefined) lines.push(`Turns Quick CSS ${p.quickCssToggle ? "on" : "off"}`);
    return lines;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Preview({ opened, onDone, onCancel }: { opened: Opened; onDone(note: Note): void; onCancel(): void; }) {
    const [mode, setMode] = React.useState<ImportMode>("merge");
    const [error, setError] = React.useState<string>();
    const [busy, setBusy] = React.useState(false);
    const preview = opened.previews[mode];
    const lines = describe(preview);
    const userMissing = preview.missingPlugins.filter(p => p.source === "user");
    const devMissing = preview.missingPlugins.filter(p => p.source === "dev");

    const apply = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await Backup.apply(opened.token, mode);
            if (result.ok) onDone({ tone: "success", text: `Restored ${opened.fileName}, ${plural(result.preview.changes, "change")} applied` });
            else if (!result.canceled) setError(result.error);
        } catch (err) {
            setError(String((err as Error)?.message ?? err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className="dl-card dl-backup-preview" aria-labelledby="dl-backup-file">
            <div className="dl-card-head">
                <div className="dl-card-main">
                    <h3 className="dl-card-title" id="dl-backup-file"><span className="dl-mono">{opened.fileName}</span></h3>
                    <p className="dl-card-desc">Made {formatDate(opened.createdAt)} with Delight v{opened.delightVersion}</p>
                </div>
            </div>
            <div className="dl-card-body">
                <SettingField
                    id="dl-backup-mode"
                    definition={{ type: "select", label: "How to restore", description: MODE_HINTS[mode], default: "merge", options: MODES }}
                    value={mode}
                    onChange={v => setMode(v as ImportMode)}
                />
                <div className="dl-field">
                    <div className="dl-label">What changes</div>
                    {lines.length ? (
                        <ul className="dl-backup-changes">{lines.map(line => <li key={line}>{line}</li>)}</ul>
                    ) : (
                        <p className="dl-hint">{preview.changes ? "Only settings of plugins that aren’t installed here." : "Nothing, this backup matches what you have."}</p>
                    )}
                </div>
                {preview.missingPlugins.length > 0 && (
                    <div className="dl-field">
                        <div className="dl-label">Not installed here</div>
                        <p className="dl-hint">Backups don’t include plugin code. Their settings are restored anyway and apply once you install them.</p>
                        <ul className="dl-backup-changes">
                            {userMissing.map(p => <li key={p.id}>{p.name} <span className="dl-mono">plugins/{p.id}</span></li>)}
                            {devMissing.map(p => <li key={p.id}>{p.name} <span className="dl-badge">Dev</span></li>)}
                        </ul>
                    </div>
                )}
                <div className="dl-toolbar dl-toolbar-flush">
                    <Button variant="accent" onClick={apply} disabled={busy || !preview.changes}>
                        {mode === "merge" ? "Merge backup" : "Replace with backup"}
                    </Button>
                    <Button onClick={onCancel} disabled={busy}>Cancel</Button>
                </div>
                <div role="status">{error && <Status tone="danger">{error}</Status>}</div>
            </div>
        </article>
    );
}

export function BackupTab() {
    const [exportNote, setExportNote] = React.useState<Note>(null);
    const [importNote, setImportNote] = React.useState<Note>(null);
    const [opened, setOpened] = React.useState<Opened | null>(null);
    const [busy, setBusy] = React.useState<"export" | "open" | null>(null);

    const run = async <T,>(kind: "export" | "open", task: () => Promise<T>) => {
        if (busy) return;
        setBusy(kind);
        try {
            return await task();
        } catch (err) {
            const note = { tone: "danger" as const, text: String((err as Error)?.message ?? err) };
            kind === "export" ? setExportNote(note) : setImportNote(note);
        } finally {
            setBusy(null);
        }
    };

    const exportBackup = () => run("export", async () => {
        setExportNote(null);
        const result = await Backup.export();
        if (result.ok) setExportNote({ tone: "success", text: `Saved to ${result.path}` });
        else if (!result.canceled) setExportNote({ tone: "danger", text: result.error });
    });

    const openBackup = () => run("open", async () => {
        setImportNote(null);
        const result = await Backup.open();
        if (result.ok) setOpened(result);
        else if (!result.canceled) setImportNote({ tone: "danger", text: result.error });
    });

    return (
        <div className="dl-stack dl-backup" style={{ gap: 16 }}>
            <section className="dl-field" aria-labelledby="dl-backup-export">
                <div className="dl-field-row">
                    <div className="dl-field-text">
                        <h3 className="dl-label" id="dl-backup-export">Save a backup</h3>
                        <p className="dl-hint">One file with your settings, plugin choices, themes and Quick CSS. Plugin code isn’t included, the file lists which plugins you had.</p>
                    </div>
                    <Button variant="accent" onClick={exportBackup} disabled={busy === "export"}>Export backup</Button>
                </div>
                <div role="status">{exportNote && <Status tone={exportNote.tone}>{exportNote.text}</Status>}</div>
            </section>
            <section className="dl-field" aria-labelledby="dl-backup-import">
                <div className="dl-field-row">
                    <div className="dl-field-text">
                        <h3 className="dl-label" id="dl-backup-import">Restore a backup</h3>
                        <p className="dl-hint">You’ll see exactly what changes before anything is written.</p>
                    </div>
                    <Button onClick={openBackup} disabled={busy === "open"}><Icon name="folder" />Choose backup file</Button>
                </div>
                <div role="status">{importNote && <Status tone={importNote.tone}>{importNote.text}</Status>}</div>
            </section>
            {opened && (
                <Preview
                    key={opened.token}
                    opened={opened}
                    onCancel={() => setOpened(null)}
                    onDone={note => {
                        setOpened(null);
                        setImportNote(note);
                    }}
                />
            )}
        </div>
    );
}
