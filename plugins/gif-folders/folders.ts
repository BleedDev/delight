import type { SourcePatch } from "@evi/api";

/**
 * Pure pieces of GIF Folders: the folder data and every change to it, free of Discord and Evi
 * runtime imports so tests can run them. Every function returns a new state (or the same object
 * when nothing changed) and never mutates its input.
 *
 * A folder holds favourite GIF URLs, the keys of Discord's favoriteGifs map. A GIF can be in any
 * number of folders; Discord's own favourites stay the source of truth, so URLs that are no longer
 * favourited get pruned.
 */

export interface Folder {
    id: string;
    name: string;
    /** Favourite GIF URLs, most recently added first */
    urls: string[];
}

export interface FolderState {
    folders: Folder[];
}

export const EMPTY: FolderState = { folders: [] };
export const MAX_NAME_LENGTH = 32;
/** The Unsorted tab's id: favourites in no folder. The colon keeps it apart from makeId()'s ids. */
export const UNSORTED = "evi:unsorted";

export function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** A trimmed, length-capped folder name, or "" when there is nothing usable */
export function cleanName(name: unknown) {
    return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
}

/** A valid state from whatever was stored: drops broken folders, duplicate ids and duplicate URLs */
export function parseState(raw: unknown): FolderState {
    const list = (raw as FolderState | null)?.folders;
    if (!Array.isArray(list)) return EMPTY;
    const seen = new Set<string>();
    const folders: Folder[] = [];
    for (const f of list) {
        const id = typeof f?.id === "string" ? f.id : "";
        const name = cleanName(f?.name);
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        const urls = Array.isArray(f.urls) ? [...new Set(f.urls.filter((u: unknown): u is string => typeof u === "string" && u !== ""))] : [];
        folders.push({ id, name, urls });
    }
    return { folders };
}

export function getFolder(state: FolderState, id: string | null | undefined) {
    return id == null ? undefined : state.folders.find(f => f.id === id);
}

function nameTaken(state: FolderState, name: string, exceptId?: string) {
    const lower = name.toLowerCase();
    return state.folders.some(f => f.id !== exceptId && f.name.toLowerCase() === lower);
}

/** Why a name can't be used, or null when it can */
export function nameError(state: FolderState, name: unknown, exceptId?: string): string | null {
    const clean = cleanName(name);
    if (!clean) return "Give the folder a name";
    if (nameTaken(state, clean, exceptId)) return "A folder with that name already exists";
    return null;
}

/** Adds a folder at the end. Returns the same state and no folder when the name is empty or taken. */
export function createFolder(state: FolderState, name: unknown, id = makeId()): { state: FolderState; folder?: Folder; } {
    if (nameError(state, name) || getFolder(state, id)) return { state };
    const folder: Folder = { id, name: cleanName(name), urls: [] };
    return { state: { folders: [...state.folders, folder] }, folder };
}

function updateFolder(state: FolderState, id: string, update: (f: Folder) => Folder): FolderState {
    let changed = false;
    const folders = state.folders.map(f => {
        if (f.id !== id) return f;
        const next = update(f);
        if (next !== f) changed = true;
        return next;
    });
    return changed ? { folders } : state;
}

export function renameFolder(state: FolderState, id: string, name: unknown): FolderState {
    if (nameError(state, name, id)) return state;
    const clean = cleanName(name);
    return updateFolder(state, id, f => f.name === clean ? f : { ...f, name: clean });
}

export function deleteFolder(state: FolderState, id: string): FolderState {
    const folders = state.folders.filter(f => f.id !== id);
    return folders.length === state.folders.length ? state : { folders };
}

/** Moves a folder to a new position in the tab row */
export function reorderFolder(state: FolderState, id: string, index: number): FolderState {
    const from = state.folders.findIndex(f => f.id === id);
    if (from === -1) return state;
    const to = Math.max(0, Math.min(state.folders.length - 1, Math.trunc(index)));
    if (to === from) return state;
    const folders = [...state.folders];
    const [folder] = folders.splice(from, 1);
    folders.splice(to, 0, folder);
    return { folders };
}

export function addToFolder(state: FolderState, id: string, url: string): FolderState {
    if (!url) return state;
    return updateFolder(state, id, f => f.urls.includes(url) ? f : { ...f, urls: [url, ...f.urls] });
}

export function removeFromFolder(state: FolderState, id: string, url: string): FolderState {
    return updateFolder(state, id, f => f.urls.includes(url) ? { ...f, urls: f.urls.filter(u => u !== url) } : f);
}

/** Takes a GIF out of every folder except one */
export function removeFromOtherFolders(state: FolderState, keepId: string, url: string): FolderState {
    return state.folders.reduce((next, f) => f.id === keepId ? next : removeFromFolder(next, f.id, url), state);
}

/**
 * Adds a GIF to a folder, or takes it out when it's already there. With `exclusive` (one folder per
 * GIF), adding also takes it out of every other folder, so it moves.
 */
export function toggleInFolder(state: FolderState, id: string, url: string, exclusive = false): FolderState {
    const folder = getFolder(state, id);
    if (!folder) return state;
    if (folder.urls.includes(url)) return removeFromFolder(state, id, url);
    return addToFolder(exclusive ? removeFromOtherFolders(state, id, url) : state, id, url);
}

/** Takes a GIF out of one folder and puts it in another */
export function moveToFolder(state: FolderState, url: string, fromId: string, toId: string): FolderState {
    if (fromId === toId || !getFolder(state, toId)) return state;
    return addToFolder(removeFromFolder(state, fromId, url), toId, url);
}

/** Ids of the folders holding this GIF */
export function foldersContaining(state: FolderState, url: string) {
    return state.folders.filter(f => f.urls.includes(url)).map(f => f.id);
}

/**
 * Drops URLs that are no longer favourited. An empty favourites list is ignored rather than
 * emptying every folder: it usually means Discord's settings haven't loaded yet.
 */
export function pruneFolders(state: FolderState, favourites: Iterable<string>): FolderState {
    const keep = new Set(favourites);
    if (keep.size === 0) return state;
    let changed = false;
    const folders = state.folders.map(f => {
        const urls = f.urls.filter(u => keep.has(u));
        if (urls.length === f.urls.length) return f;
        changed = true;
        return { ...f, urls };
    });
    return changed ? { folders } : state;
}

/** How many of these favourites are in no folder */
export function unsortedCount(state: FolderState, favourites: Iterable<string>) {
    const sorted = new Set(state.folders.flatMap(f => f.urls));
    let count = 0;
    for (const url of favourites) if (!sorted.has(url)) count++;
    return count;
}

/**
 * The favourites to show for the selected tab, in Discord's order: a folder shows its GIFs,
 * Unsorted the GIFs in no folder, and All (null, or a folder that no longer exists) everything.
 */
export function filterFavourites<T extends { url: string; }>(items: readonly T[], state: FolderState, folderId: string | null | undefined): readonly T[] {
    if (folderId === UNSORTED) {
        const sorted = new Set(state.folders.flatMap(f => f.urls));
        return items.filter(item => !sorted.has(item.url));
    }
    const folder = getFolder(state, folderId);
    if (!folder) return items;
    const urls = new Set(folder.urls);
    return items.filter(item => urls.has(item.url));
}

// ---- Source patch -------------------------------------------------------------------------------


/**
 * The GIF picker's class component, found against Discord's web build cached in
 * test-results/chunks (Sep 2026). `\i` is Evi's identifier shorthand and `$self` the plugin.
 *  - its favourites list: `data:h===b.dD.FAVORITES?function(e,t){...query filter...}(l,s):t` gets
 *    the selected folder's filter first, so Discord's own grid, search and click-to-send still work
 *  - its header: `children:this.renderHeader()` also renders the folder tabs
 * Both call $self optionally, so the picker keeps working once the plugin is off.
 */
export const PICKER_PATCH: SourcePatch = {
    find: "renderHeaderContent(){",
    replace: [
        {
            match: /(data:\i===\i\.\i\.FAVORITES\?function\((\i),\i\)\{)/,
            with: "$1$2=$self?.filterFavorites?.($2)??$2;",
        },
        {
            match: /children:this\.renderHeader\(\)\}/,
            with: "children:[this.renderHeader(),$self?.renderFolderBar?.(this)]}",
        },
    ],
};
