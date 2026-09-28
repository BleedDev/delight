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
var import_api2 = require("@evi/api");

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

// plugins/gif-folders/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.unsortedTab": "Unsorted tab",
    "settings.unsortedTab.description": "A tab with only the favourites that aren't in a folder. All always shows everything.",
    "settings.oneFolderPerGif": "One folder per GIF",
    "settings.oneFolderPerGif.description": "Adding a GIF to a folder takes it out of its other folders, so it moves instead of being in several.",
    "settings.showCounts": "Show counts",
    "settings.showCounts.description": "How many GIFs each tab holds, next to its name.",
    "tabs.label": "GIF folders",
    "tab.all": "All",
    "tab.all.title": "All your favourites",
    "tab.unsorted": "Unsorted",
    "tab.unsorted.title": "Favourites that aren't in any folder",
    "tab.folder.title": "Right-click to rename or delete",
    "tab.new": "+ New Folder",
    "tab.new.label": "New folder",
    "input.rename": "Folder name",
    "input.new": "New folder",
    "error.empty": "Give the folder a name",
    "error.taken": "A folder with that name already exists",
    "folder.menu": "{name} folder",
    "folder.rename": "Rename Folder",
    "folder.delete": "Delete Folder",
    "folder.delete.subtext": "The GIFs stay in your favourites",
    "folder.default": "Folder {n}",
    "gif.removeFrom": "Remove from {name}",
    "gif.newFolder": "New Folder",
    "gif.move": "Move to Folder",
    "gif.add": "Add to Folder",
    "toast.added": "Added to {name}. Right-click its tab to rename it.",
    "toast.addedNew": "Added to a new folder. Right-click its tab to rename it.",
    "resize.title": "Drag to resize, double-click to reset"
  },
  de: {
    "settings.unsortedTab": "Tab „Unsortiert“",
    "settings.unsortedTab.description": "Ein Tab nur mit den Favoriten, die in keinem Ordner sind. „Alle“ zeigt immer alles.",
    "settings.oneFolderPerGif": "Ein Ordner pro GIF",
    "settings.oneFolderPerGif.description": "Wenn du ein GIF zu einem Ordner hinzufügst, wird es aus seinen anderen Ordnern entfernt und also verschoben, statt in mehreren zu liegen.",
    "settings.showCounts": "Anzahl anzeigen",
    "settings.showCounts.description": "Wie viele GIFs jeder Tab enthält, neben seinem Namen.",
    "tabs.label": "GIF-Ordner",
    "tab.all": "Alle",
    "tab.all.title": "Alle deine Favoriten",
    "tab.unsorted": "Unsortiert",
    "tab.unsorted.title": "Favoriten, die in keinem Ordner sind",
    "tab.folder.title": "Rechtsklick zum Umbenennen oder Löschen",
    "tab.new": "+ Neuer Ordner",
    "tab.new.label": "Neuer Ordner",
    "input.rename": "Ordnername",
    "input.new": "Neuer Ordner",
    "error.empty": "Gib dem Ordner einen Namen",
    "error.taken": "Ein Ordner mit diesem Namen existiert bereits",
    "folder.menu": "Ordner {name}",
    "folder.rename": "Ordner umbenennen",
    "folder.delete": "Ordner löschen",
    "folder.delete.subtext": "Die GIFs bleiben in deinen Favoriten",
    "folder.default": "Ordner {n}",
    "gif.removeFrom": "Aus {name} entfernen",
    "gif.newFolder": "Neuer Ordner",
    "gif.move": "In Ordner verschieben",
    "gif.add": "Zu Ordner hinzufügen",
    "toast.added": "Zu {name} hinzugefügt. Rechtsklicke den Tab, um ihn umzubenennen.",
    "toast.addedNew": "Zu einem neuen Ordner hinzugefügt. Rechtsklicke den Tab, um ihn umzubenennen.",
    "resize.title": "Ziehen zum Ändern der Größe, Doppelklick zum Zurücksetzen"
  },
  es: {
    "settings.unsortedTab": "Pestaña Sin clasificar",
    "settings.unsortedTab.description": "Una pestaña solo con los favoritos que no están en ninguna carpeta. Todos siempre muestra todo.",
    "settings.oneFolderPerGif": "Una carpeta por GIF",
    "settings.oneFolderPerGif.description": "Al añadir un GIF a una carpeta se quita de sus otras carpetas, así que se mueve en lugar de estar en varias.",
    "settings.showCounts": "Mostrar recuentos",
    "settings.showCounts.description": "Cuántos GIF tiene cada pestaña, junto a su nombre.",
    "tabs.label": "Carpetas de GIF",
    "tab.all": "Todos",
    "tab.all.title": "Todos tus favoritos",
    "tab.unsorted": "Sin clasificar",
    "tab.unsorted.title": "Favoritos que no están en ninguna carpeta",
    "tab.folder.title": "Clic derecho para cambiar el nombre o eliminar",
    "tab.new": "+ Nueva carpeta",
    "tab.new.label": "Nueva carpeta",
    "input.rename": "Nombre de la carpeta",
    "input.new": "Nueva carpeta",
    "error.empty": "Ponle un nombre a la carpeta",
    "error.taken": "Ya existe una carpeta con ese nombre",
    "folder.menu": "Carpeta {name}",
    "folder.rename": "Cambiar nombre de la carpeta",
    "folder.delete": "Eliminar carpeta",
    "folder.delete.subtext": "Los GIF se quedan en tus favoritos",
    "folder.default": "Carpeta {n}",
    "gif.removeFrom": "Quitar de {name}",
    "gif.newFolder": "Nueva carpeta",
    "gif.move": "Mover a carpeta",
    "gif.add": "Añadir a carpeta",
    "toast.added": "Añadido a {name}. Haz clic derecho en su pestaña para cambiarle el nombre.",
    "toast.addedNew": "Añadido a una carpeta nueva. Haz clic derecho en su pestaña para cambiarle el nombre.",
    "resize.title": "Arrastra para cambiar el tamaño, doble clic para restablecer"
  },
  fr: {
    "settings.unsortedTab": "Onglet Non classés",
    "settings.unsortedTab.description": "Un onglet avec uniquement les favoris qui ne sont dans aucun dossier. Tous affiche toujours tout.",
    "settings.oneFolderPerGif": "Un dossier par GIF",
    "settings.oneFolderPerGif.description": "Ajouter un GIF à un dossier le retire de ses autres dossiers : il est déplacé au lieu d'être dans plusieurs.",
    "settings.showCounts": "Afficher les totaux",
    "settings.showCounts.description": "Le nombre de GIF de chaque onglet, à côté de son nom.",
    "tabs.label": "Dossiers de GIF",
    "tab.all": "Tous",
    "tab.all.title": "Tous vos favoris",
    "tab.unsorted": "Non classés",
    "tab.unsorted.title": "Favoris qui ne sont dans aucun dossier",
    "tab.folder.title": "Clic droit pour renommer ou supprimer",
    "tab.new": "+ Nouveau dossier",
    "tab.new.label": "Nouveau dossier",
    "input.rename": "Nom du dossier",
    "input.new": "Nouveau dossier",
    "error.empty": "Donnez un nom au dossier",
    "error.taken": "Un dossier portant ce nom existe déjà",
    "folder.menu": "Dossier {name}",
    "folder.rename": "Renommer le dossier",
    "folder.delete": "Supprimer le dossier",
    "folder.delete.subtext": "Les GIF restent dans vos favoris",
    "folder.default": "Dossier {n}",
    "gif.removeFrom": "Retirer de {name}",
    "gif.newFolder": "Nouveau dossier",
    "gif.move": "Déplacer vers un dossier",
    "gif.add": "Ajouter à un dossier",
    "toast.added": "Ajouté à {name}. Faites un clic droit sur son onglet pour le renommer.",
    "toast.addedNew": "Ajouté à un nouveau dossier. Faites un clic droit sur son onglet pour le renommer.",
    "resize.title": "Faites glisser pour redimensionner, double-cliquez pour réinitialiser"
  },
  ja: {
    "settings.unsortedTab": "「未分類」タブ",
    "settings.unsortedTab.description": "どのフォルダにも入っていないお気に入りだけを表示するタブです。「すべて」には常にすべてが表示されます。",
    "settings.oneFolderPerGif": "GIFごとにフォルダは1つ",
    "settings.oneFolderPerGif.description": "GIFをフォルダに追加すると他のフォルダから外れ、複数に入る代わりに移動します。",
    "settings.showCounts": "件数を表示",
    "settings.showCounts.description": "各タブの名前の横に、入っているGIFの数を表示します。",
    "tabs.label": "GIFフォルダ",
    "tab.all": "すべて",
    "tab.all.title": "すべてのお気に入り",
    "tab.unsorted": "未分類",
    "tab.unsorted.title": "どのフォルダにも入っていないお気に入り",
    "tab.folder.title": "右クリックで名前の変更や削除ができます",
    "tab.new": "+ 新しいフォルダ",
    "tab.new.label": "新しいフォルダ",
    "input.rename": "フォルダ名",
    "input.new": "新しいフォルダ",
    "error.empty": "フォルダに名前を付けてください",
    "error.taken": "その名前のフォルダはすでにあります",
    "folder.menu": "{name} フォルダ",
    "folder.rename": "フォルダ名を変更",
    "folder.delete": "フォルダを削除",
    "folder.delete.subtext": "GIFはお気に入りに残ります",
    "folder.default": "フォルダ {n}",
    "gif.removeFrom": "{name} から削除",
    "gif.newFolder": "新しいフォルダ",
    "gif.move": "フォルダに移動",
    "gif.add": "フォルダに追加",
    "toast.added": "{name} に追加しました。タブを右クリックすると名前を変更できます。",
    "toast.addedNew": "新しいフォルダに追加しました。タブを右クリックすると名前を変更できます。",
    "resize.title": "ドラッグでサイズ変更、ダブルクリックでリセット"
  },
  pl: {
    "settings.unsortedTab": "Karta Nieposortowane",
    "settings.unsortedTab.description": "Karta tylko z ulubionymi, których nie ma w żadnym folderze. Karta Wszystkie zawsze pokazuje wszystko.",
    "settings.oneFolderPerGif": "Jeden folder na GIF",
    "settings.oneFolderPerGif.description": "Dodanie GIF-a do folderu usuwa go z pozostałych folderów, więc jest przenoszony zamiast być w kilku naraz.",
    "settings.showCounts": "Pokaż liczniki",
    "settings.showCounts.description": "Liczba GIF-ów w każdej karcie, obok jej nazwy.",
    "tabs.label": "Foldery GIF-ów",
    "tab.all": "Wszystkie",
    "tab.all.title": "Wszystkie twoje ulubione",
    "tab.unsorted": "Nieposortowane",
    "tab.unsorted.title": "Ulubione, których nie ma w żadnym folderze",
    "tab.folder.title": "Kliknij prawym przyciskiem, aby zmienić nazwę lub usunąć",
    "tab.new": "+ Nowy folder",
    "tab.new.label": "Nowy folder",
    "input.rename": "Nazwa folderu",
    "input.new": "Nowy folder",
    "error.empty": "Nadaj folderowi nazwę",
    "error.taken": "Folder o tej nazwie już istnieje",
    "folder.menu": "Folder {name}",
    "folder.rename": "Zmień nazwę folderu",
    "folder.delete": "Usuń folder",
    "folder.delete.subtext": "GIF-y zostają w twoich ulubionych",
    "folder.default": "Folder {n}",
    "gif.removeFrom": "Usuń z {name}",
    "gif.newFolder": "Nowy folder",
    "gif.move": "Przenieś do folderu",
    "gif.add": "Dodaj do folderu",
    "toast.added": "Dodano do {name}. Kliknij prawym przyciskiem jego kartę, aby zmienić nazwę.",
    "toast.addedNew": "Dodano do nowego folderu. Kliknij prawym przyciskiem jego kartę, aby zmienić nazwę.",
    "resize.title": "Przeciągnij, aby zmienić rozmiar, kliknij dwukrotnie, aby zresetować"
  },
  "pt-BR": {
    "settings.unsortedTab": "Aba Sem pasta",
    "settings.unsortedTab.description": "Uma aba só com os favoritos que não estão em nenhuma pasta. Todos sempre mostra tudo.",
    "settings.oneFolderPerGif": "Uma pasta por GIF",
    "settings.oneFolderPerGif.description": "Adicionar um GIF a uma pasta o tira das outras pastas, então ele é movido em vez de ficar em várias.",
    "settings.showCounts": "Mostrar contagens",
    "settings.showCounts.description": "Quantos GIFs cada aba tem, ao lado do nome dela.",
    "tabs.label": "Pastas de GIFs",
    "tab.all": "Todos",
    "tab.all.title": "Todos os seus favoritos",
    "tab.unsorted": "Sem pasta",
    "tab.unsorted.title": "Favoritos que não estão em nenhuma pasta",
    "tab.folder.title": "Clique com o botão direito para renomear ou excluir",
    "tab.new": "+ Nova pasta",
    "tab.new.label": "Nova pasta",
    "input.rename": "Nome da pasta",
    "input.new": "Nova pasta",
    "error.empty": "Dê um nome à pasta",
    "error.taken": "Já existe uma pasta com esse nome",
    "folder.menu": "Pasta {name}",
    "folder.rename": "Renomear pasta",
    "folder.delete": "Excluir pasta",
    "folder.delete.subtext": "Os GIFs continuam nos seus favoritos",
    "folder.default": "Pasta {n}",
    "gif.removeFrom": "Remover de {name}",
    "gif.newFolder": "Nova pasta",
    "gif.move": "Mover para pasta",
    "gif.add": "Adicionar à pasta",
    "toast.added": "Adicionado a {name}. Clique com o botão direito na aba dela para renomear.",
    "toast.addedNew": "Adicionado a uma nova pasta. Clique com o botão direito na aba dela para renomear.",
    "resize.title": "Arraste para redimensionar, clique duas vezes para redefinir"
  },
  ru: {
    "settings.unsortedTab": "Вкладка «Без папки»",
    "settings.unsortedTab.description": "Вкладка только с теми избранными, которые не лежат ни в одной папке. Во вкладке «Все» всегда видно всё.",
    "settings.oneFolderPerGif": "Одна папка на GIF",
    "settings.oneFolderPerGif.description": "При добавлении GIF в папку он убирается из остальных папок, то есть переносится, а не лежит сразу в нескольких.",
    "settings.showCounts": "Показывать количество",
    "settings.showCounts.description": "Сколько GIF в каждой вкладке, рядом с её названием.",
    "tabs.label": "Папки с GIF",
    "tab.all": "Все",
    "tab.all.title": "Всё ваше избранное",
    "tab.unsorted": "Без папки",
    "tab.unsorted.title": "Избранное, которое не лежит ни в одной папке",
    "tab.folder.title": "Нажмите правой кнопкой, чтобы переименовать или удалить",
    "tab.new": "+ Новая папка",
    "tab.new.label": "Новая папка",
    "input.rename": "Название папки",
    "input.new": "Новая папка",
    "error.empty": "Назовите папку",
    "error.taken": "Папка с таким названием уже существует",
    "folder.menu": "Папка «{name}»",
    "folder.rename": "Переименовать папку",
    "folder.delete": "Удалить папку",
    "folder.delete.subtext": "GIF останутся в избранном",
    "folder.default": "Папка {n}",
    "gif.removeFrom": "Убрать из «{name}»",
    "gif.newFolder": "Новая папка",
    "gif.move": "Переместить в папку",
    "gif.add": "Добавить в папку",
    "toast.added": "Добавлено в «{name}». Нажмите правой кнопкой на её вкладку, чтобы переименовать.",
    "toast.addedNew": "Добавлено в новую папку. Нажмите правой кнопкой на её вкладку, чтобы переименовать.",
    "resize.title": "Перетащите, чтобы изменить размер, дважды щёлкните, чтобы сбросить"
  },
  tr: {
    "settings.unsortedTab": "Sınıflandırılmamış sekmesi",
    "settings.unsortedTab.description": "Yalnızca hiçbir klasörde olmayan favorileri gösteren bir sekme. Tümü her zaman her şeyi gösterir.",
    "settings.oneFolderPerGif": "GIF başına tek klasör",
    "settings.oneFolderPerGif.description": "Bir GIF'i klasöre eklemek onu diğer klasörlerinden çıkarır; yani birden fazla klasörde durmak yerine taşınır.",
    "settings.showCounts": "Sayıları göster",
    "settings.showCounts.description": "Her sekmenin adının yanında kaç GIF içerdiği.",
    "tabs.label": "GIF klasörleri",
    "tab.all": "Tümü",
    "tab.all.title": "Tüm favorilerin",
    "tab.unsorted": "Sınıflandırılmamış",
    "tab.unsorted.title": "Hiçbir klasörde olmayan favoriler",
    "tab.folder.title": "Yeniden adlandırmak veya silmek için sağ tıkla",
    "tab.new": "+ Yeni klasör",
    "tab.new.label": "Yeni klasör",
    "input.rename": "Klasör adı",
    "input.new": "Yeni klasör",
    "error.empty": "Klasöre bir ad ver",
    "error.taken": "Bu adda bir klasör zaten var",
    "folder.menu": "{name} klasörü",
    "folder.rename": "Klasörü yeniden adlandır",
    "folder.delete": "Klasörü sil",
    "folder.delete.subtext": "GIF'ler favorilerinde kalır",
    "folder.default": "Klasör {n}",
    "gif.removeFrom": "{name} klasöründen kaldır",
    "gif.newFolder": "Yeni klasör",
    "gif.move": "Klasöre taşı",
    "gif.add": "Klasöre ekle",
    "toast.added": "{name} klasörüne eklendi. Yeniden adlandırmak için sekmesine sağ tıkla.",
    "toast.addedNew": "Yeni bir klasöre eklendi. Yeniden adlandırmak için sekmesine sağ tıkla.",
    "resize.title": "Yeniden boyutlandırmak için sürükle, sıfırlamak için çift tıkla"
  }
});

// plugins/gif-folders/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var STORAGE_KEY = "folders";
var SIZE_KEY = "pickerSize";
var FAVORITES_VIEW = "Favorites";
var settings = {
  unsortedTab: {
    type: "boolean",
    get label() {
      return t("settings.unsortedTab");
    },
    get description() {
      return t("settings.unsortedTab.description");
    },
    default: true
  },
  oneFolderPerGif: {
    type: "boolean",
    get label() {
      return t("settings.oneFolderPerGif");
    },
    get description() {
      return t("settings.oneFolderPerGif.description");
    },
    default: false
  },
  showCounts: {
    type: "boolean",
    get label() {
      return t("settings.showCounts");
    },
    get description() {
      return t("settings.showCounts.description");
    },
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
    return import_api2.findStore("UserSettingsProtoStore")?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? {};
  } catch {
    return {};
  }
}
var isFavourite = (url) => Object.prototype.hasOwnProperty.call(favouriteGifs(), url);
var prune = () => commit(pruneFolders(state, Object.keys(favouriteGifs())));
var openContextMenu = () => import_api2.find(import_api2.filters.byCode("enableSpellCheck", "renderLazy"));
var MenuRoot = () => import_api2.find(import_api2.filters.componentByCode("Menu API only allows Items"));
var closeContextMenu = () => void import_api2.Dispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });
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
    "aria-label": t("folder.menu", { name: folder.name }),
    onSelect: undefined,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
        id: "evi-gif-folder-rename",
        label: t("folder.rename"),
        action: rename
      }),
      /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
        id: "evi-gif-folder-delete",
        label: t("folder.delete"),
        color: "danger",
        subtext: folder.urls.length ? t("folder.delete.subtext") : undefined,
        action: () => commit(deleteFolder(state, folder.id))
      })
    ]
  }));
}
function NameInput({ initial, placeholder, onDone, exceptId }) {
  const [value, setValue] = import_api2.React.useState(initial);
  const error = value.trim() && value.trim() !== initial && nameError(state, value, exceptId) ? t("error.taken") : null;
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
var HOST = "evi-gif-folders-host";
function FolderBar({ owner }) {
  const [, rerender] = import_api2.React.useReducer((n) => n + 1, 0);
  const { unsortedTab, showCounts } = ctx.settings.use();
  if (!unsortedTab && active === UNSORTED)
    active = null;
  const [creating, setCreating] = import_api2.React.useState(false);
  const [renaming, setRenaming] = import_api2.React.useState(null);
  import_api2.React.useEffect(() => {
    owners.add(owner);
    listeners.add(rerender);
    prune();
    return () => {
      owners.delete(owner);
      listeners.delete(rerender);
      active = null;
    };
  }, [owner]);
  const bar = import_api2.React.useRef(null);
  import_api2.React.useLayoutEffect(() => {
    const host = bar.current?.parentElement;
    host?.classList.add(HOST);
    return () => host?.classList.remove(HOST);
  }, []);
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    ref: bar,
    className: "evi-gif-folders",
    role: "tablist",
    "aria-label": t("tabs.label"),
    onClick: (e) => e.stopPropagation(),
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("button", {
        type: "button",
        role: "tab",
        className: "evi-gif-folders-tab",
        "aria-selected": active === null,
        title: t("tab.all.title"),
        onClick: () => select(null),
        children: t("tab.all")
      }),
      unsortedTab && /* @__PURE__ */ jsx_runtime.jsxs("button", {
        type: "button",
        role: "tab",
        className: "evi-gif-folders-tab",
        "aria-selected": active === UNSORTED,
        title: t("tab.unsorted.title"),
        onClick: () => select(UNSORTED),
        children: [
          t("tab.unsorted"),
          showCounts && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-gif-folders-count",
            children: unsortedCount(state, Object.keys(favouriteGifs()))
          })
        ]
      }),
      state.folders.map((folder) => renaming === folder.id ? /* @__PURE__ */ jsx_runtime.jsx(NameInput, {
        initial: folder.name,
        placeholder: t("input.rename"),
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
        title: t("tab.folder.title"),
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
        placeholder: t("input.new"),
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
        "aria-label": t("tab.new.label"),
        children: t("tab.new")
      })
    ]
  });
}
function nextFolderName() {
  for (let n = state.folders.length + 1;; n++) {
    const name = t("folder.default", { n });
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
    items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
      id: "evi-gif-folders-remove",
      label: t("gif.removeFrom", { name: current.name }),
      color: "danger",
      action: () => commit(removeFromFolder(state, current.id, url))
    }, "evi-gif-folders-remove"));
  }
  const choices = state.folders.map((folder) => /* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.CheckboxItem, {
    id: `evi-gif-folders-${folder.id}`,
    label: folder.name,
    checked: inFolders.includes(folder.id),
    action: () => commit(toggleInFolder(state, folder.id, url, exclusive))
  }, folder.id));
  if (choices.length)
    choices.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Separator, {}, "evi-gif-folders-sep"));
  choices.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
    id: "evi-gif-folders-create",
    label: t("gif.newFolder"),
    action: () => {
      const result = createFolder(state, nextFolderName());
      if (result.folder)
        commit(toggleInFolder(result.state, result.folder.id, url, exclusive));
      ctx?.toast(result.folder ? t("toast.added", { name: result.folder.name }) : t("toast.addedNew"), { type: "success" });
    }
  }, "evi-gif-folders-create"));
  const label = t(exclusive && inFolders.length ? "gif.move" : "gif.add");
  items.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Item, {
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
  const ref = import_api2.React.useRef(null);
  import_api2.React.useEffect(() => {
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
    handle.title = t("resize.title");
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
var gif_folders_default = import_api2.definePlugin({
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
.evi-gif-folders-host {
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
      children.push(/* @__PURE__ */ jsx_runtime.jsx(import_api2.Menu.Group, {
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
