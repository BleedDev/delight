import { definePlugin, Dispatcher, filters, find, findStore, Menu, React } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import {
    createFolder, deleteFolder, EMPTY, Folder, FolderState, filterFavourites, foldersContaining, getFolder, MAX_NAME_LENGTH, nameError,
    parseState, PICKER_PATCH, pruneFolders, removeFromFolder, renameFolder, toggleInFolder, UNSORTED, unsortedCount,
} from "./folders";

/**
 * Folders for favourite GIFs. Discord keeps favourites in its synced FrecencyUserSettings
 * (favoriteGifs.gifs: url -> {format, src, width, height, order}); the folders are ours, kept in
 * this plugin's settings entry under a key the settings panel doesn't show, so they survive restarts.
 *
 * The source patch (folders.ts) filters the picker's favourites list by the selected folder before
 * Discord's own search filter, and renders the folder tabs under the picker's header. Discord's grid
 * does the rest, so clicking a GIF sends it exactly as before. GIFs get "Add to folder" in the
 * picker's right-click menu ("gif-picker"), folder tabs get Rename and Delete.
 *
 * The GIF tab can be resized from its free corner. Discord positions the picker once, with inline
 * coordinates, so every size change moves that layer by however far the anchored edges (the ones
 * against the chat bar) moved: the picker grows away from the chat bar instead of over it.
 */

const STORAGE_KEY = "folders";
const SIZE_KEY = "pickerSize";
const FAVORITES_VIEW = "Favorites";

type Settings = typeof settings;
const settings = {
    unsortedTab: {
        type: "boolean",
        label: "Unsorted tab",
        description: "A tab with only the favourites that aren't in a folder. All always shows everything.",
        default: true,
    },
    oneFolderPerGif: {
        type: "boolean",
        label: "One folder per GIF",
        description: "Adding a GIF to a folder takes it out of its other folders, so it moves instead of being in several.",
        default: false,
    },
    showCounts: {
        type: "boolean",
        label: "Show counts",
        description: "How many GIFs each tab holds, next to its name.",
        default: true,
    },
} as const;

let ctx: PluginContext<Settings> | undefined;
let state: FolderState = EMPTY;
/** The selected folder tab, null for All. Back to All whenever the favourites view closes. */
let active: string | null = null;

/** Mounted pickers: their favourites list only re-filters when they render */
const owners = new Set<{ forceUpdate?(): void; }>();
const listeners = new Set<() => void>();

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => ctx?.settings as unknown as Storage | undefined;

function notify() {
    for (const listener of listeners) listener();
    for (const owner of owners) {
        try {
            owner.forceUpdate?.();
        } catch { /* unmounted */ }
    }
}

function commit(next: FolderState) {
    if (next === state) return;
    state = next;
    if (active && !getFolder(state, active)) active = null;
    storage()?.set(STORAGE_KEY, state);
    notify();
}

function select(id: string | null) {
    if (active === id) return;
    active = id;
    notify();
}

function favouriteGifs(): Record<string, unknown> {
    try {
        return findStore("UserSettingsProtoStore")?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? {};
    } catch {
        return {};
    }
}

const isFavourite = (url: string) => Object.prototype.hasOwnProperty.call(favouriteGifs(), url);
const prune = () => commit(pruneFolders(state, Object.keys(favouriteGifs())));

// ---- Discord's context menu (for the folder tabs) -----------------------------------------------

type OpenContextMenu = (event: ReactMouseEvent, render: (props: any) => ReactNode) => void;
const openContextMenu = (): OpenContextMenu | undefined => find(filters.byCode("enableSpellCheck", "renderLazy"));
const MenuRoot = (): React.ComponentType<any> | undefined => find(filters.componentByCode("Menu API only allows Items"));
const closeContextMenu = () => void Dispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });

function openFolderMenu(event: ReactMouseEvent, folder: Folder, rename: () => void) {
    const open = openContextMenu();
    const Root = MenuRoot();
    if (!open || !Root) {
        event.preventDefault();
        return rename();
    }
    open(event, () => (
        <Root navId="evi-gif-folder" onClose={closeContextMenu} aria-label={`${folder.name} folder`} onSelect={undefined}>
            <Menu.Item id="evi-gif-folder-rename" label="Rename Folder" action={rename} />
            <Menu.Item
                id="evi-gif-folder-delete"
                label="Delete Folder"
                color="danger"
                subtext={folder.urls.length ? "The GIFs stay in your favourites" : undefined}
                action={() => commit(deleteFolder(state, folder.id))}
            />
        </Root>
    ));
}

// ---- Folder tabs --------------------------------------------------------------------------------

function NameInput({ initial, placeholder, onDone, exceptId }: { initial: string; placeholder: string; onDone(name: string | null): void; exceptId?: string; }) {
    const [value, setValue] = React.useState(initial);
    const error = value.trim() && value.trim() !== initial ? nameError(state, value, exceptId) : null;
    const finish = (name: string | null) => onDone(name && !nameError(state, name, exceptId) ? name : null);
    return (
        <input
            className="evi-gif-folders-input"
            data-invalid={error ? "true" : undefined}
            title={error ?? undefined}
            aria-label={placeholder}
            aria-invalid={!!error}
            placeholder={placeholder}
            value={value}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            onFocus={e => e.currentTarget.select()}
            onChange={e => setValue(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                // Keep Escape from closing the picker, Enter from reaching the search bar
                e.stopPropagation();
                if (e.key === "Enter") finish(value);
                else if (e.key === "Escape") onDone(null);
            }}
            onBlur={() => finish(value.trim() === initial ? null : value)}
            onClick={e => e.stopPropagation()}
        />
    );
}

function FolderBar({ owner }: { owner: { forceUpdate?(): void; }; }) {
    const [, rerender] = React.useReducer((n: number) => n + 1, 0);
    const { unsortedTab, showCounts } = ctx!.settings.use();
    if (!unsortedTab && active === UNSORTED) active = null;
    const [creating, setCreating] = React.useState(false);
    const [renaming, setRenaming] = React.useState<string | null>(null);

    React.useEffect(() => {
        owners.add(owner);
        listeners.add(rerender);
        prune();
        return () => {
            owners.delete(owner);
            listeners.delete(rerender);
            active = null;
        };
    }, [owner]);

    return (
        <div className="evi-gif-folders" role="tablist" aria-label="GIF folders" onClick={e => e.stopPropagation()}>
            <button
                type="button"
                role="tab"
                className="evi-gif-folders-tab"
                aria-selected={active === null}
                title="All your favourites"
                onClick={() => select(null)}
            >
                All
            </button>
            {unsortedTab && (
                <button
                    type="button"
                    role="tab"
                    className="evi-gif-folders-tab"
                    aria-selected={active === UNSORTED}
                    title="Favourites that aren't in any folder"
                    onClick={() => select(UNSORTED)}
                >
                    Unsorted
                    {showCounts && <span className="evi-gif-folders-count">{unsortedCount(state, Object.keys(favouriteGifs()))}</span>}
                </button>
            )}
            {state.folders.map(folder => renaming === folder.id
                ? (
                    <NameInput
                        key={folder.id}
                        initial={folder.name}
                        placeholder="Folder name"
                        exceptId={folder.id}
                        onDone={name => {
                            setRenaming(null);
                            if (name) commit(renameFolder(state, folder.id, name));
                        }}
                    />
                )
                : (
                    <button
                        key={folder.id}
                        type="button"
                        role="tab"
                        className="evi-gif-folders-tab"
                        aria-selected={active === folder.id}
                        title="Right-click to rename or delete"
                        onClick={() => select(folder.id)}
                        onDoubleClick={() => setRenaming(folder.id)}
                        onContextMenu={e => openFolderMenu(e, folder, () => setRenaming(folder.id))}
                    >
                        {folder.name}
                        {showCounts && <span className="evi-gif-folders-count">{folder.urls.length}</span>}
                    </button>
                ))}
            {creating
                ? (
                    <NameInput
                        initial=""
                        placeholder="New folder"
                        onDone={name => {
                            setCreating(false);
                            if (!name) return;
                            const result = createFolder(state, name);
                            commit(result.state);
                            if (result.folder) select(result.folder.id);
                        }}
                    />
                )
                : (
                    <button type="button" className="evi-gif-folders-tab evi-gif-folders-new" onClick={() => setCreating(true)} aria-label="New folder">
                        + New Folder
                    </button>
                )}
        </div>
    );
}

// ---- GIF right-click menu -----------------------------------------------------------------------

function nextFolderName() {
    for (let n = state.folders.length + 1; ; n++) {
        const name = `Folder ${n}`;
        if (!nameError(state, name)) return name;
    }
}

function gifMenuItems(url: string): ReactNode[] {
    const exclusive = !!ctx?.settings.get("oneFolderPerGif");
    const inFolders = foldersContaining(state, url);
    const current = getFolder(state, active);
    const items: ReactNode[] = [];

    if (current && inFolders.includes(current.id)) {
        items.push(
            <Menu.Item
                key="evi-gif-folders-remove"
                id="evi-gif-folders-remove"
                label={`Remove from ${current.name}`}
                color="danger"
                action={() => commit(removeFromFolder(state, current.id, url))}
            />,
        );
    }

    const choices: ReactNode[] = state.folders.map(folder => (
        <Menu.CheckboxItem
            key={folder.id}
            id={`evi-gif-folders-${folder.id}`}
            label={folder.name}
            checked={inFolders.includes(folder.id)}
            action={() => commit(toggleInFolder(state, folder.id, url, exclusive))}
        />
    ));
    if (choices.length) choices.push(<Menu.Separator key="evi-gif-folders-sep" />);
    choices.push(
        <Menu.Item
            key="evi-gif-folders-create"
            id="evi-gif-folders-create"
            label="New Folder"
            action={() => {
                const result = createFolder(state, nextFolderName());
                if (result.folder) commit(toggleInFolder(result.state, result.folder.id, url, exclusive));
                ctx?.toast(`Added to ${result.folder?.name ?? "a new folder"}. Right-click its tab to rename it.`, { type: "success" });
            }}
        />,
    );
    const label = exclusive && inFolders.length ? "Move to Folder" : "Add to Folder";
    items.push(<Menu.Item key="evi-gif-folders-add" id="evi-gif-folders-add" label={label}>{choices}</Menu.Item>);
    return items;
}

// ---- Resizing the GIF tab -----------------------------------------------------------------------

type Size = { width: number; height: number; };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MARGIN = 8;

function savedSize(): Size | null {
    const size = storage()?.get(SIZE_KEY) as Partial<Size> | null | undefined;
    return size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size as Size : null;
}

/** Discord's popout layer: the nearest ancestor it placed with inline coordinates */
function layerOf(drawer: HTMLElement): HTMLElement | undefined {
    for (let el = drawer.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.style.top || el.style.bottom || el.style.left || el.style.right) return el;
    }
}

/** Which edges stay put: the ones nearest the window's edges, i.e. against the chat bar */
const anchorsOf = (rect: DOMRect) => ({
    right: window.innerWidth - rect.right < rect.left,
    bottom: window.innerHeight - rect.bottom < rect.top,
});

function nudge(layer: HTMLElement, dx: number, dy: number) {
    const move = (side: "top" | "left" | "bottom" | "right", by: number) => {
        const value = parseFloat(layer.style[side]);
        if (Number.isFinite(value)) layer.style[side] = `${value + by}px`;
    };
    if (dy) layer.style.top ? move("top", -dy) : move("bottom", dy);
    if (dx) layer.style.left ? move("left", -dx) : move("right", dx);
}

/** Sizes the drawer (null: Discord's size) and moves its layer so the anchored edges stay where they were */
function applySize(drawer: HTMLElement, size: Size | null) {
    const before = drawer.getBoundingClientRect();
    const anchors = anchorsOf(before);
    if (size) {
        const maxWidth = (anchors.right ? before.right : window.innerWidth - before.left) - MARGIN;
        const maxHeight = (anchors.bottom ? before.bottom : window.innerHeight - before.top) - MARGIN;
        drawer.style.setProperty("--evi-gif-width", `${Math.round(Math.max(MIN_WIDTH, Math.min(size.width, maxWidth)))}px`);
        drawer.style.setProperty("--evi-gif-height", `${Math.round(Math.max(MIN_HEIGHT, Math.min(size.height, maxHeight)))}px`);
        drawer.classList.add("evi-gif-sized");
    } else {
        drawer.classList.remove("evi-gif-sized");
    }
    const after = drawer.getBoundingClientRect();
    const layer = layerOf(drawer);
    if (!layer) return;
    nudge(
        layer,
        anchors.right ? after.right - before.right : after.left - before.left,
        anchors.bottom ? after.bottom - before.bottom : after.top - before.top,
    );
}

/** Rendered with the GIF tab: a resize handle on the picker's free corner while the tab is open */
function PickerResizer() {
    const ref = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        const drawer = ref.current?.closest<HTMLElement>('[class*="drawerSizingWrapper_"]');
        if (!drawer) return;

        const saved = savedSize();
        if (saved) applySize(drawer, saved);

        const anchors = anchorsOf(drawer.getBoundingClientRect());
        const handle = document.createElement("div");
        handle.className = "evi-gif-resize";
        handle.dataset.corner = `${anchors.bottom ? "top" : "bottom"}-${anchors.right ? "left" : "right"}`;
        handle.title = "Drag to resize, double-click to reset";
        if (getComputedStyle(drawer).position === "static") drawer.style.position = "relative";
        drawer.appendChild(handle);

        let start: { x: number; y: number; width: number; height: number; } | null = null;
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = drawer.getBoundingClientRect();
            start = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
            handle.setPointerCapture(e.pointerId);
            drawer.classList.add("evi-gif-resizing");
        };
        const onMove = (e: PointerEvent) => {
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            applySize(drawer, {
                width: start.width + (anchors.right ? -dx : dx),
                height: start.height + (anchors.bottom ? -dy : dy),
            });
        };
        const onUp = (e: PointerEvent) => {
            if (!start) return;
            start = null;
            handle.releasePointerCapture(e.pointerId);
            drawer.classList.remove("evi-gif-resizing");
            const rect = drawer.getBoundingClientRect();
            storage()?.set(SIZE_KEY, { width: Math.round(rect.width), height: Math.round(rect.height) });
        };
        const onReset = (e: MouseEvent) => {
            e.stopPropagation();
            storage()?.set(SIZE_KEY, null);
            applySize(drawer, null);
        };
        const swallow = (e: MouseEvent) => e.stopPropagation();
        handle.addEventListener("pointerdown", onDown);
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
        handle.addEventListener("dblclick", onReset);
        handle.addEventListener("click", swallow);

        return () => {
            handle.remove();
            drawer.classList.remove("evi-gif-resizing");
            // Other tabs get Discord's size back; nothing to do when the whole picker is closing
            if (drawer.isConnected && drawer.classList.contains("evi-gif-sized")) applySize(drawer, null);
        };
    }, []);

    return <span ref={ref} hidden />;
}

// ---- Plugin -------------------------------------------------------------------------------------

export default definePlugin({
    settings,
    patches: [PICKER_PATCH],

    css: `
.evi-gif-folders {
    display: flex;
    gap: 6px;
    padding: 8px 0 2px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
    width: 100%;
}
.evi-gif-folders::-webkit-scrollbar { display: none; }
*:has(> .evi-gif-folders) {
    flex-direction: column;
    align-items: stretch;
    height: auto;
}
/*
 * Tab colours are scoped and !important, with plain fallbacks: Discord's own button:hover rules (and
 * variables newer Discord no longer defines) otherwise turn the text black on hover.
 */
.evi-gif-folders {
    --evi-tab-text: var(--interactive-text-default, var(--interactive-normal, #b5bac1));
    --evi-tab-text-hover: var(--interactive-text-hover, var(--interactive-hover, #dbdee1));
    --evi-tab-bg: var(--background-mod-subtle, rgba(78, 80, 88, 0.3));
    --evi-tab-bg-hover: var(--background-mod-normal, rgba(78, 80, 88, 0.48));
    --evi-tab-selected: var(--brand-500, #5865f2);
    --evi-tab-selected-hover: var(--brand-560, #4752c4);
}
.evi-gif-folders .evi-gif-folders-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--border-subtle, transparent);
    background: var(--evi-tab-bg) !important;
    color: var(--evi-tab-text) !important;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
}
.evi-gif-folders .evi-gif-folders-tab:hover { background: var(--evi-tab-bg-hover) !important; color: var(--evi-tab-text-hover) !important; }
.evi-gif-folders .evi-gif-folders-tab:focus-visible { outline: 2px solid var(--focus-primary, #5865f2); outline-offset: 1px; }
.evi-gif-folders .evi-gif-folders-tab[aria-selected="true"] { background: var(--evi-tab-selected) !important; border-color: transparent; color: #fff !important; }
.evi-gif-folders .evi-gif-folders-tab[aria-selected="true"]:hover { background: var(--evi-tab-selected-hover) !important; color: #fff !important; }
.evi-gif-folders-count { font-size: 11px; opacity: .7; font-variant-numeric: tabular-nums; }
.evi-gif-folders .evi-gif-folders-new { background: transparent !important; border-style: dashed; }
.evi-gif-folders .evi-gif-folders-new:hover { background: var(--evi-tab-bg) !important; }
/* Scoped and !important: Discord's own input styles otherwise add padding that clips the text out of sight */
.evi-gif-folders .evi-gif-folders-input {
    box-sizing: border-box !important;
    flex-shrink: 0;
    width: 150px !important;
    height: 28px !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 10px !important;
    border-radius: 14px !important;
    border: 1px solid var(--brand-500, #5865f2) !important;
    background: var(--input-background, var(--background-tertiary, #1e1f22)) !important;
    color: var(--text-default, var(--text-normal, #dbdee1)) !important;
    -webkit-text-fill-color: currentColor !important;
    caret-color: currentColor;
    font: inherit;
    font-size: 13px !important;
    line-height: 26px !important;
    text-indent: 0 !important;
    opacity: 1 !important;
    appearance: none;
    outline: none;
}
.evi-gif-folders .evi-gif-folders-input::placeholder { color: var(--text-muted, #949ba4); -webkit-text-fill-color: var(--text-muted, #949ba4); }
.evi-gif-folders .evi-gif-folders-input[data-invalid] { border-color: var(--status-danger, #da373c) !important; }
.evi-gif-sized {
    width: var(--evi-gif-width) !important;
    height: var(--evi-gif-height) !important;
    max-width: none !important;
    max-height: none !important;
}
.evi-gif-sized > [class*="contentWrapper_"] { height: 100% !important; max-height: none !important; }
.evi-gif-resizing, .evi-gif-resizing * { user-select: none !important; }
.evi-gif-resize { position: absolute; z-index: 10; width: 18px; height: 18px; touch-action: none; }
.evi-gif-resize::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 0 solid var(--interactive-normal, #b5bac1);
    opacity: 0;
    transition: opacity 120ms ease;
}
[class*="drawerSizingWrapper_"]:hover > .evi-gif-resize::after, .evi-gif-resizing > .evi-gif-resize::after { opacity: .6; }
.evi-gif-resize:hover::after { opacity: 1 !important; }
.evi-gif-resize[data-corner="top-left"] { top: -2px; left: -2px; cursor: nwse-resize; }
.evi-gif-resize[data-corner="top-left"]::after { border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 6px; }
.evi-gif-resize[data-corner="top-right"] { top: -2px; right: -2px; cursor: nesw-resize; }
.evi-gif-resize[data-corner="top-right"]::after { border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 6px; }
.evi-gif-resize[data-corner="bottom-left"] { bottom: -2px; left: -2px; cursor: nesw-resize; }
.evi-gif-resize[data-corner="bottom-left"]::after { border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 6px; }
.evi-gif-resize[data-corner="bottom-right"] { bottom: -2px; right: -2px; cursor: nwse-resize; }
.evi-gif-resize[data-corner="bottom-right"]::after { border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 6px; }
@media (prefers-reduced-motion: reduce) { .evi-gif-folders-tab, .evi-gif-resize::after { transition: none; } }
`,

    /** Patched in: the picker's favourites, narrowed to the selected folder */
    filterFavorites<T extends { url: string; }>(items: T[]): T[] {
        if (!ctx || !Array.isArray(items)) return items;
        return filterFavourites(items, state, active) as T[];
    },

    /** Patched in: the resize handle on every GIF view, the folder tabs in the favourites view only */
    renderFolderBar(owner: any) {
        if (!ctx) return null;
        return (
            <>
                <PickerResizer />
                {owner?.state?.resultType === FAVORITES_VIEW && <FolderBar owner={owner} />}
            </>
        );
    },

    start(context) {
        ctx = context;
        state = parseState(storage()?.get(STORAGE_KEY));
        active = null;
        prune();
        // The picker re-filters when these change
        context.settings.onChange(notify);

        context.contextMenu("gif-picker", (children, props, menuProps) => {
            const url = props?.link ?? menuProps?.link;
            if (typeof url !== "string" || !isFavourite(url)) return;
            children.push(<Menu.Group key="evi-gif-folders">{gifMenuItems(url)}</Menu.Group>);
        });

        context.onDispose(() => {
            ctx = undefined;
            active = null;
            notify();
        });
    },
});
