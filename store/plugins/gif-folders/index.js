var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// plugins/gif-folders/index.tsx
var exports_gif_folders = {};
__export(exports_gif_folders, {
  default: () => gif_folders_default
});
module.exports = __toCommonJS(exports_gif_folders);
var import_api = require("@evi/api");

// plugins/gif-folders/folders.ts
var EMPTY = { folders: [] };
var MAX_NAME_LENGTH = 32;
var UNSORTED = "evi:unsorted";
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function cleanName(name) {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
}
function parseState(raw) {
  const list = raw?.folders;
  if (!Array.isArray(list))
    return EMPTY;
  const seen = new Set;
  const folders = [];
  for (const f of list) {
    const id = typeof f?.id === "string" ? f.id : "";
    const name = cleanName(f?.name);
    if (!id || !name || seen.has(id))
      continue;
    seen.add(id);
    const urls = Array.isArray(f.urls) ? [...new Set(f.urls.filter((u) => typeof u === "string" && u !== ""))] : [];
    folders.push({ id, name, urls });
  }
  return { folders };
}
function getFolder(state, id) {
  return id == null ? undefined : state.folders.find((f) => f.id === id);
}
function nameTaken(state, name, exceptId) {
  const lower = name.toLowerCase();
  return state.folders.some((f) => f.id !== exceptId && f.name.toLowerCase() === lower);
}
function nameError(state, name, exceptId) {
  const clean = cleanName(name);
  if (!clean)
    return "Give the folder a name";
  if (nameTaken(state, clean, exceptId))
    return "A folder with that name already exists";
  return null;
}
function createFolder(state, name, id = makeId()) {
  if (nameError(state, name) || getFolder(state, id))
    return { state };
  const folder = { id, name: cleanName(name), urls: [] };
  return { state: { folders: [...state.folders, folder] }, folder };
}
function updateFolder(state, id, update) {
  let changed = false;
  const folders = state.folders.map((f) => {
    if (f.id !== id)
      return f;
    const next = update(f);
    if (next !== f)
      changed = true;
    return next;
  });
  return changed ? { folders } : state;
}
function renameFolder(state, id, name) {
  if (nameError(state, name, id))
    return state;
  const clean = cleanName(name);
  return updateFolder(state, id, (f) => f.name === clean ? f : { ...f, name: clean });
}
function deleteFolder(state, id) {
  const folders = state.folders.filter((f) => f.id !== id);
  return folders.length === state.folders.length ? state : { folders };
}
function addToFolder(state, id, url) {
  if (!url)
    return state;
  return updateFolder(state, id, (f) => f.urls.includes(url) ? f : { ...f, urls: [url, ...f.urls] });
}
function removeFromFolder(state, id, url) {
  return updateFolder(state, id, (f) => f.urls.includes(url) ? { ...f, urls: f.urls.filter((u) => u !== url) } : f);
}
function removeFromOtherFolders(state, keepId, url) {
  return state.folders.reduce((next, f) => f.id === keepId ? next : removeFromFolder(next, f.id, url), state);
}
function toggleInFolder(state, id, url, exclusive = false) {
  const folder = getFolder(state, id);
  if (!folder)
    return state;
  if (folder.urls.includes(url))
    return removeFromFolder(state, id, url);
  return addToFolder(exclusive ? removeFromOtherFolders(state, id, url) : state, id, url);
}
function foldersContaining(state, url) {
  return state.folders.filter((f) => f.urls.includes(url)).map((f) => f.id);
}
function pruneFolders(state, favourites) {
  const keep = new Set(favourites);
  if (keep.size === 0)
    return state;
  let changed = false;
  const folders = state.folders.map((f) => {
    const urls = f.urls.filter((u) => keep.has(u));
    if (urls.length === f.urls.length)
      return f;
    changed = true;
    return { ...f, urls };
  });
  return changed ? { folders } : state;
}
function unsortedCount(state, favourites) {
  const sorted = new Set(state.folders.flatMap((f) => f.urls));
  let count = 0;
  for (const url of favourites)
    if (!sorted.has(url))
      count++;
  return count;
}
function filterFavourites(items, state, folderId) {
  if (folderId === UNSORTED) {
    const sorted = new Set(state.folders.flatMap((f) => f.urls));
    return items.filter((item) => !sorted.has(item.url));
  }
  const folder = getFolder(state, folderId);
  if (!folder)
    return items;
  const urls = new Set(folder.urls);
  return items.filter((item) => urls.has(item.url));
}
var PICKER_PATCH = {
  find: "renderHeaderContent(){",
  replace: [
    {
      match: /(data:\i===\i\.\i\.FAVORITES\?function\((\i),\i\)\{)/,
      with: "$1$2=$self?.filterFavorites?.($2)??$2;"
    },
    {
      match: /children:this\.renderHeader\(\)\}/,
      with: "children:[this.renderHeader(),$self?.renderFolderBar?.(this)]}"
    }
  ]
};

// plugins/gif-folders/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var STORAGE_KEY = "folders";
var SIZE_KEY = "pickerSize";
var FAVORITES_VIEW = "Favorites";
var settings = {
  unsortedTab: {
    type: "boolean",
    label: "Unsorted tab",
    description: "A tab with only the favourites that aren't in a folder. All always shows everything.",
    default: true
  },
  oneFolderPerGif: {
    type: "boolean",
    label: "One folder per GIF",
    description: "Adding a GIF to a folder takes it out of its other folders, so it moves instead of being in several.",
    default: false
  },
  showCounts: {
    type: "boolean",
    label: "Show counts",
    description: "How many GIFs each tab holds, next to its name.",
    default: true
  }
};
var ctx;
var state = EMPTY;
var active = null;
var owners = new Set;
var listeners = new Set;
var storage = () => ctx?.settings;
function notify() {
  for (const listener of listeners)
    listener();
  for (const owner of owners) {
    try {
      owner.forceUpdate?.();
    } catch {}
  }
}
function commit(next) {
  if (next === state)
    return;
  state = next;
  if (active && !getFolder(state, active))
    active = null;
  storage()?.set(STORAGE_KEY, state);
  notify();
}
function select(id) {
  if (active === id)
    return;
  active = id;
  notify();
}
function favouriteGifs() {
  try {
    return import_api.findStore("UserSettingsProtoStore")?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? {};
  } catch {
    return {};
  }
}
var isFavourite = (url) => Object.prototype.hasOwnProperty.call(favouriteGifs(), url);
var prune = () => commit(pruneFolders(state, Object.keys(favouriteGifs())));
var openContextMenu = () => import_api.find(import_api.filters.byCode("enableSpellCheck", "renderLazy"));
var MenuRoot = () => import_api.find(import_api.filters.componentByCode("Menu API only allows Items"));
var closeContextMenu = () => void import_api.Dispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });
function openFolderMenu(event, folder, rename) {
  const open = openContextMenu();
  const Root = MenuRoot();
  if (!open || !Root) {
    event.preventDefault();
    return rename();
  }
  open(event, () => /* @__PURE__ */ jsx_runtime.jsxs(Root, {
    navId: "evi-gif-folder",
    onClose: closeContextMenu,
    "aria-label": `${folder.name} folder`,
    onSelect: undefined,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
        id: "evi-gif-folder-rename",
        label: "Rename Folder",
        action: rename
      }),
      /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
        id: "evi-gif-folder-delete",
        label: "Delete Folder",
        color: "danger",
        subtext: folder.urls.length ? "The GIFs stay in your favourites" : undefined,
        action: () => commit(deleteFolder(state, folder.id))
      })
    ]
  }));
}
function NameInput({ initial, placeholder, onDone, exceptId }) {
  const [value, setValue] = import_api.React.useState(initial);
  const error = value.trim() && value.trim() !== initial ? nameError(state, value, exceptId) : null;
  const finish = (name) => onDone(name && !nameError(state, name, exceptId) ? name : null);
  return /* @__PURE__ */ jsx_runtime.jsx("input", {
    className: "evi-gif-folders-input",
    "data-invalid": error ? "true" : undefined,
    title: error ?? undefined,
    "aria-label": placeholder,
    "aria-invalid": !!error,
    placeholder,
    value,
    maxLength: MAX_NAME_LENGTH,
    autoFocus: true,
    onFocus: (e) => e.currentTarget.select(),
    onChange: (e) => setValue(e.currentTarget.value),
    onKeyDown: (e) => {
      e.stopPropagation();
      if (e.key === "Enter")
        finish(value);
      else if (e.key === "Escape")
        onDone(null);
    },
    onBlur: () => finish(value.trim() === initial ? null : value),
    onClick: (e) => e.stopPropagation()
  });
}
function FolderBar({ owner }) {
  const [, rerender] = import_api.React.useReducer((n) => n + 1, 0);
  const { unsortedTab, showCounts } = ctx.settings.use();
  if (!unsortedTab && active === UNSORTED)
    active = null;
  const [creating, setCreating] = import_api.React.useState(false);
  const [renaming, setRenaming] = import_api.React.useState(null);
  import_api.React.useEffect(() => {
    owners.add(owner);
    listeners.add(rerender);
    prune();
    return () => {
      owners.delete(owner);
      listeners.delete(rerender);
      active = null;
    };
  }, [owner]);
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "evi-gif-folders",
    role: "tablist",
    "aria-label": "GIF folders",
    onClick: (e) => e.stopPropagation(),
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        role: "tab",
        className: "evi-gif-folders-tab",
        "aria-selected": active === null,
        title: "All your favourites",
        onClick: () => select(null),
        children: "All"
      }),
      unsortedTab && /* @__PURE__ */ jsx_runtime.jsxs("button", {
        type: "button",
        role: "tab",
        className: "evi-gif-folders-tab",
        "aria-selected": active === UNSORTED,
        title: "Favourites that aren't in any folder",
        onClick: () => select(UNSORTED),
        children: [
          "Unsorted",
          showCounts && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-gif-folders-count",
            children: unsortedCount(state, Object.keys(favouriteGifs()))
          })
        ]
      }),
      state.folders.map((folder) => renaming === folder.id ? /* @__PURE__ */ jsx_runtime.jsx(NameInput, {
        initial: folder.name,
        placeholder: "Folder name",
        exceptId: folder.id,
        onDone: (name) => {
          setRenaming(null);
          if (name)
            commit(renameFolder(state, folder.id, name));
        }
      }, folder.id) : /* @__PURE__ */ jsx_runtime.jsxs("button", {
        type: "button",
        role: "tab",
        className: "evi-gif-folders-tab",
        "aria-selected": active === folder.id,
        title: "Right-click to rename or delete",
        onClick: () => select(folder.id),
        onDoubleClick: () => setRenaming(folder.id),
        onContextMenu: (e) => openFolderMenu(e, folder, () => setRenaming(folder.id)),
        children: [
          folder.name,
          showCounts && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-gif-folders-count",
            children: folder.urls.length
          })
        ]
      }, folder.id)),
      creating ? /* @__PURE__ */ jsx_runtime.jsx(NameInput, {
        initial: "",
        placeholder: "New folder",
        onDone: (name) => {
          setCreating(false);
          if (!name)
            return;
          const result = createFolder(state, name);
          commit(result.state);
          if (result.folder)
            select(result.folder.id);
        }
      }) : /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        className: "evi-gif-folders-tab evi-gif-folders-new",
        onClick: () => setCreating(true),
        "aria-label": "New folder",
        children: "+ New Folder"
      })
    ]
  });
}
function nextFolderName() {
  for (let n = state.folders.length + 1;; n++) {
    const name = `Folder ${n}`;
    if (!nameError(state, name))
      return name;
  }
}
function gifMenuItems(url) {
  const exclusive = !!ctx?.settings.get("oneFolderPerGif");
  const inFolders = foldersContaining(state, url);
  const current = getFolder(state, active);
  const items = [];
  if (current && inFolders.includes(current.id)) {
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
      id: "evi-gif-folders-remove",
      label: `Remove from ${current.name}`,
      color: "danger",
      action: () => commit(removeFromFolder(state, current.id, url))
    }, "evi-gif-folders-remove"));
  }
  const choices = state.folders.map((folder) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.CheckboxItem, {
    id: `evi-gif-folders-${folder.id}`,
    label: folder.name,
    checked: inFolders.includes(folder.id),
    action: () => commit(toggleInFolder(state, folder.id, url, exclusive))
  }, folder.id));
  if (choices.length)
    choices.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Separator, {}, "evi-gif-folders-sep"));
  choices.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
    id: "evi-gif-folders-create",
    label: "New Folder",
    action: () => {
      const result = createFolder(state, nextFolderName());
      if (result.folder)
        commit(toggleInFolder(result.state, result.folder.id, url, exclusive));
      ctx?.toast(`Added to ${result.folder?.name ?? "a new folder"}. Right-click its tab to rename it.`, { type: "success" });
    }
  }, "evi-gif-folders-create"));
  const label = exclusive && inFolders.length ? "Move to Folder" : "Add to Folder";
  items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
    id: "evi-gif-folders-add",
    label,
    children: choices
  }, "evi-gif-folders-add"));
  return items;
}
var MIN_WIDTH = 320;
var MIN_HEIGHT = 280;
var MARGIN = 8;
function savedSize() {
  const size = storage()?.get(SIZE_KEY);
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : null;
}
function layerOf(drawer) {
  for (let el = drawer.parentElement;el && el !== document.body; el = el.parentElement) {
    if (el.style.top || el.style.bottom || el.style.left || el.style.right)
      return el;
  }
}
var anchorsOf = (rect) => ({
  right: window.innerWidth - rect.right < rect.left,
  bottom: window.innerHeight - rect.bottom < rect.top
});
function nudge(layer, dx, dy) {
  const move = (side, by) => {
    const value = parseFloat(layer.style[side]);
    if (Number.isFinite(value))
      layer.style[side] = `${value + by}px`;
  };
  if (dy)
    layer.style.top ? move("top", -dy) : move("bottom", dy);
  if (dx)
    layer.style.left ? move("left", -dx) : move("right", dx);
}
function applySize(drawer, size) {
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
  if (!layer)
    return;
  nudge(layer, anchors.right ? after.right - before.right : after.left - before.left, anchors.bottom ? after.bottom - before.bottom : after.top - before.top);
}
function PickerResizer() {
  const ref = import_api.React.useRef(null);
  import_api.React.useEffect(() => {
    const drawer = ref.current?.closest('[class*="drawerSizingWrapper_"]');
    if (!drawer)
      return;
    const saved = savedSize();
    if (saved)
      applySize(drawer, saved);
    const anchors = anchorsOf(drawer.getBoundingClientRect());
    const handle = document.createElement("div");
    handle.className = "evi-gif-resize";
    handle.dataset.corner = `${anchors.bottom ? "top" : "bottom"}-${anchors.right ? "left" : "right"}`;
    handle.title = "Drag to resize, double-click to reset";
    if (getComputedStyle(drawer).position === "static")
      drawer.style.position = "relative";
    drawer.appendChild(handle);
    let start = null;
    const onDown = (e) => {
      if (e.button !== 0)
        return;
      e.preventDefault();
      e.stopPropagation();
      const rect = drawer.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
      handle.setPointerCapture(e.pointerId);
      drawer.classList.add("evi-gif-resizing");
    };
    const onMove = (e) => {
      if (!start)
        return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      applySize(drawer, {
        width: start.width + (anchors.right ? -dx : dx),
        height: start.height + (anchors.bottom ? -dy : dy)
      });
    };
    const onUp = (e) => {
      if (!start)
        return;
      start = null;
      handle.releasePointerCapture(e.pointerId);
      drawer.classList.remove("evi-gif-resizing");
      const rect = drawer.getBoundingClientRect();
      storage()?.set(SIZE_KEY, { width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    const onReset = (e) => {
      e.stopPropagation();
      storage()?.set(SIZE_KEY, null);
      applySize(drawer, null);
    };
    const swallow = (e) => e.stopPropagation();
    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    handle.addEventListener("dblclick", onReset);
    handle.addEventListener("click", swallow);
    return () => {
      handle.remove();
      drawer.classList.remove("evi-gif-resizing");
      if (drawer.isConnected && drawer.classList.contains("evi-gif-sized"))
        applySize(drawer, null);
    };
  }, []);
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    ref,
    hidden: true
  });
}
var gif_folders_default = import_api.definePlugin({
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
  filterFavorites(items) {
    if (!ctx || !Array.isArray(items))
      return items;
    return filterFavourites(items, state, active);
  },
  renderFolderBar(owner) {
    if (!ctx)
      return null;
    return /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
      children: [
        /* @__PURE__ */ jsx_runtime.jsx(PickerResizer, {}),
        owner?.state?.resultType === FAVORITES_VIEW && /* @__PURE__ */ jsx_runtime.jsx(FolderBar, {
          owner
        })
      ]
    });
  },
  start(context) {
    ctx = context;
    state = parseState(storage()?.get(STORAGE_KEY));
    active = null;
    const idle = typeof requestIdleCallback === "function" ? requestIdleCallback(() => ctx === context && prune(), { timeout: 1e4 }) : undefined;
    if (idle !== undefined)
      context.onDispose(() => cancelIdleCallback(idle));
    else
      prune();
    context.settings.onChange(notify);
    context.contextMenu("gif-picker", (children, props, menuProps) => {
      const url = props?.link ?? menuProps?.link;
      if (typeof url !== "string" || !isFavourite(url))
        return;
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
        children: gifMenuItems(url)
      }, "evi-gif-folders"));
    });
    context.onDispose(() => {
      ctx = undefined;
      active = null;
      notify();
    });
  }
});
