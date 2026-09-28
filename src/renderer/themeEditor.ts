/**
 * The theme being edited, and its live preview on Discord itself. Kept outside React so the preview
 * stays while Evi's settings are closed: people close them to look at their chat, and come back to
 * keep going, save, or throw it away. Nothing is written until Save; Discard takes the preview off
 * and Discord is exactly as it was.
 *
 * The preview is one <style> right after the enabled themes and before Quick CSS, so it wins over
 * the theme it may have started from, and Quick CSS still wins over it, as it will once saved.
 * Colour pickers change it many times a frame while dragging: it's rewritten at most once a frame.
 */
import type { ThemeSaveResult } from "@shared/ipc";
import { buildThemeCss, isEditorTheme, parseThemeCss, ThemeDraft } from "@shared/themeEditor";

import { t } from "./i18n";
import { Native } from "./native";
import { SafeMode } from "./safeMode";
import { createStyle, ManagedStyle, QUICK_CSS_ID } from "./styles";
import { Themes } from "./themes";

export interface EditorSession {
    draft: ThemeDraft;
    /** The file it's saved to: set once saved, or from the start when editing one of the editor's own themes */
    file?: string;
    /** The CSS as last saved, to tell unsaved changes apart */
    savedCss?: string;
    /** The installed theme it started from, by name, when it isn't being edited in place */
    startedFrom?: string;
}

let session: EditorSession | null = null;
let preview: ManagedStyle | undefined;
let frame = 0;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

function paint() {
    frame = 0;
    if (!session || SafeMode.active) {
        preview?.remove();
        preview = undefined;
        return;
    }
    const css = buildThemeCss(session.draft);
    if (preview) preview.update(css);
    else preview = createStyle(css, "evi-theme-preview", QUICK_CSS_ID);
}

const schedule = () => {
    frame ||= requestAnimationFrame(paint);
};

export const ThemeEditor = {
    getSnapshot: () => session,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },

    /** A blank theme or a copy to start from; previewing starts right away */
    start(draft: ThemeDraft, from?: { file: string; name: string; css: string; }) {
        // The editor's own themes are edited in place; any other theme is only a starting point
        const inPlace = from && isEditorTheme(from.css);
        session = {
            draft,
            ...(inPlace && { file: from.file, savedCss: from.css }),
            ...(from && !inPlace && { startedFrom: from.name }),
        };
        paint();
        notify();
    },

    /** Starts from an installed theme */
    startFrom(file: string) {
        const theme = Themes.getSnapshot().find(t => t.file === file);
        if (!theme) return;
        const draft = parseThemeCss(theme.css, theme.file);
        // Someone else's theme becomes yours: a name of its own, and a first version
        const copy = isEditorTheme(theme.css) ? draft : { ...draft, name: t("themeEditor.copyName", { name: theme.name }), author: "", version: "1.0.0" };
        ThemeEditor.start(copy, { file: theme.file, name: theme.name, css: theme.css });
    },

    update(change: Partial<ThemeDraft>) {
        if (!session) return;
        session = { ...session, draft: { ...session.draft, ...change } };
        schedule();
        notify();
    },

    /** The CSS the draft makes now */
    css: () => session ? buildThemeCss(session.draft) : "",

    dirty: () => !!session && buildThemeCss(session.draft) !== session.savedCss,

    /** Writes it to the themes folder and turns it on; the editor stays open on it */
    async save(): Promise<ThemeSaveResult> {
        if (!session) return { ok: false, error: t("themeEditor.nothingToSave") };
        const css = buildThemeCss(session.draft);
        const result = await Native.saveTheme({ css, name: session.draft.name, ...(session.file && { file: session.file }) });
        if (!result.ok || !session) return result;
        session = { ...session, file: result.file, savedCss: css, startedFrom: undefined };
        Themes.setEnabled(result.file, true);
        notify();
        return result;
    },

    /** Stops editing: the preview comes off, and whatever was saved stays */
    close() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        session = null;
        preview?.remove();
        preview = undefined;
        notify();
    },
};
