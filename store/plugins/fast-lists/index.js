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

// plugins/fast-lists/index.ts
var exports_fast_lists = {};
__export(exports_fast_lists, {
  default: () => fast_lists_default
});
module.exports = __toCommonJS(exports_fast_lists);
var import_api2 = require("@evi/api");

// plugins/fast-lists/strings.ts
var import_api = require("@evi/api");
var t = import_api.defineStrings({
  en: {
    "settings.servers": "Server list",
    "settings.servers.description": "Skip servers far out of view and remove the pills' GPU-layer hack.",
    "settings.chat": "Chat (experimental)",
    "settings.chat.description": "Skip messages far above or below what you're reading. Not measured yet.",
    "settings.members": "Member list (experimental)",
    "settings.members.description": "Skip members far out of view. Not measured yet.",
    "settings.margin": "Render distance (screens)",
    "settings.margin.description": "How many screen heights above and below stay fully rendered. Higher never shows an unrendered row even on very fast scrolls, lower saves more work."
  },
  de: {
    "settings.servers": "Serverliste",
    "settings.servers.description": "Überspringt Server weit außerhalb des Sichtbereichs und entfernt den GPU-Ebenen-Trick der Pillen.",
    "settings.chat": "Chat (experimentell)",
    "settings.chat.description": "Überspringt Nachrichten weit über oder unter dem, was du gerade liest. Noch nicht gemessen.",
    "settings.members": "Mitgliederliste (experimentell)",
    "settings.members.description": "Überspringt Mitglieder weit außerhalb des Sichtbereichs. Noch nicht gemessen.",
    "settings.margin": "Renderdistanz (Bildschirme)",
    "settings.margin.description": "Wie viele Bildschirmhöhen darüber und darunter vollständig gerendert bleiben. Höher zeigt selbst bei sehr schnellem Scrollen nie eine ungerenderte Zeile, niedriger spart mehr Arbeit."
  },
  es: {
    "settings.servers": "Lista de servidores",
    "settings.servers.description": "Omite los servidores muy fuera de la vista y quita el truco de capa GPU de las píldoras.",
    "settings.chat": "Chat (experimental)",
    "settings.chat.description": "Omite los mensajes muy por encima o por debajo de lo que estás leyendo. Aún sin medir.",
    "settings.members": "Lista de miembros (experimental)",
    "settings.members.description": "Omite los miembros muy fuera de la vista. Aún sin medir.",
    "settings.margin": "Distancia de renderizado (pantallas)",
    "settings.margin.description": "Cuántas alturas de pantalla por encima y por debajo se mantienen totalmente renderizadas. Más alto nunca muestra una fila sin renderizar, ni siquiera al desplazarte muy rápido; más bajo ahorra más trabajo."
  },
  fr: {
    "settings.servers": "Liste des serveurs",
    "settings.servers.description": "Ignore les serveurs très loin de la vue et supprime l'astuce de couche GPU des pastilles.",
    "settings.chat": "Chat (expérimental)",
    "settings.chat.description": "Ignore les messages très au-dessus ou en dessous de ce que tu lis. Pas encore mesuré.",
    "settings.members": "Liste des membres (expérimental)",
    "settings.members.description": "Ignore les membres très loin de la vue. Pas encore mesuré.",
    "settings.margin": "Distance de rendu (écrans)",
    "settings.margin.description": "Combien de hauteurs d'écran au-dessus et en dessous restent entièrement rendues. Plus élevé, aucune ligne non rendue n'apparaît, même en défilant très vite ; plus bas, on économise plus de travail."
  },
  ja: {
    "settings.servers": "サーバーリスト",
    "settings.servers.description": "画面から大きく外れたサーバーの描画を省き、ピルの GPU レイヤー対策を取り除きます。",
    "settings.chat": "チャット（試験的）",
    "settings.chat.description": "読んでいる位置から大きく離れた上下のメッセージの描画を省きます。効果はまだ計測していません。",
    "settings.members": "メンバーリスト（試験的）",
    "settings.members.description": "画面から大きく外れたメンバーの描画を省きます。効果はまだ計測していません。",
    "settings.margin": "描画範囲（画面数）",
    "settings.margin.description": "上下それぞれ、画面何枚分の高さを常にきちんと描画するかです。大きくすると、とても速くスクロールしても未描画の行が見えません。小さくすると、より多くの処理を節約できます。"
  },
  pl: {
    "settings.servers": "Lista serwerów",
    "settings.servers.description": "Pomija serwery daleko poza widokiem i usuwa sztuczkę z warstwą GPU dla wskaźników.",
    "settings.chat": "Czat (eksperymentalne)",
    "settings.chat.description": "Pomija wiadomości daleko powyżej lub poniżej tego, co czytasz. Jeszcze niezmierzone.",
    "settings.members": "Lista członków (eksperymentalne)",
    "settings.members.description": "Pomija członków daleko poza widokiem. Jeszcze niezmierzone.",
    "settings.margin": "Zasięg renderowania (ekrany)",
    "settings.margin.description": "Ile wysokości ekranu powyżej i poniżej pozostaje w pełni wyrenderowane. Wyższa wartość sprawia, że nawet przy bardzo szybkim przewijaniu nie zobaczysz niewyrenderowanego wiersza, niższa oszczędza więcej pracy."
  },
  "pt-BR": {
    "settings.servers": "Lista de servidores",
    "settings.servers.description": "Pula servidores bem fora da tela e remove o truque de camada de GPU das pílulas.",
    "settings.chat": "Chat (experimental)",
    "settings.chat.description": "Pula mensagens bem acima ou abaixo do que você está lendo. Ainda não medido.",
    "settings.members": "Lista de membros (experimental)",
    "settings.members.description": "Pula membros bem fora da tela. Ainda não medido.",
    "settings.margin": "Distância de renderização (telas)",
    "settings.margin.description": "Quantas alturas de tela acima e abaixo continuam totalmente renderizadas. Mais alto nunca mostra uma linha sem renderizar, nem em rolagens muito rápidas; mais baixo economiza mais trabalho."
  },
  ru: {
    "settings.servers": "Список серверов",
    "settings.servers.description": "Пропускает серверы далеко за пределами экрана и убирает хак GPU-слоя для индикаторов.",
    "settings.chat": "Чат (экспериментально)",
    "settings.chat.description": "Пропускает сообщения далеко выше или ниже того, что вы читаете. Пока не измерено.",
    "settings.members": "Список участников (экспериментально)",
    "settings.members.description": "Пропускает участников далеко за пределами экрана. Пока не измерено.",
    "settings.margin": "Дальность отрисовки (экранов)",
    "settings.margin.description": "Сколько высот экрана выше и ниже остаётся полностью отрисованным. Чем больше, тем меньше шанс увидеть неотрисованную строку даже при очень быстрой прокрутке; чем меньше, тем больше экономия ресурсов."
  },
  tr: {
    "settings.servers": "Sunucu listesi",
    "settings.servers.description": "Görüş alanının çok dışındaki sunucuları atlar ve rozetlerin GPU katmanı hilesini kaldırır.",
    "settings.chat": "Sohbet (deneysel)",
    "settings.chat.description": "Okuduğun yerin çok üstündeki veya altındaki mesajları atlar. Henüz ölçülmedi.",
    "settings.members": "Üye listesi (deneysel)",
    "settings.members.description": "Görüş alanının çok dışındaki üyeleri atlar. Henüz ölçülmedi.",
    "settings.margin": "Oluşturma mesafesi (ekran)",
    "settings.margin.description": "Üstte ve altta kaç ekran yüksekliğinin tamamen oluşturulmuş kalacağı. Yüksek değer çok hızlı kaydırmada bile oluşturulmamış satır göstermez, düşük değer daha çok işten tasarruf sağlar."
  }
});

// plugins/fast-lists/index.ts
var ROW = "dl-fl-row";
var FAR = "dl-fl-far";
var css = `
.${ROW} {
    contain-intrinsic-size: auto 48px;
}
.${ROW}.${FAR} {
    content-visibility: hidden;
}
`;
var LISTS = [
  { key: "servers", list: '[data-list-id="guildsnav"]', item: (id) => `[data-list-item-id^="${id}___"]`, flattenPills: true },
  { key: "chat", list: '[data-list-id^="chat-messages"]', item: (id) => `[data-list-item-id^="${id}___"]` },
  { key: "members", list: '[data-list-id^="members"]', item: (id) => `[data-list-item-id^="${id}___"]` }
];
function isScrollable(el) {
  return /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
}
var SCROLLER_DEPTH = 4;
function findScroller(list) {
  for (let el = list;el; el = el.parentElement) {
    if (el instanceof HTMLElement && isScrollable(el))
      return el;
  }
  let level = [...list.children];
  for (let depth = 1;depth <= SCROLLER_DEPTH && level.length; depth++) {
    for (const el of level) {
      if (el instanceof HTMLElement && isScrollable(el))
        return el;
    }
    level = level.flatMap((el) => [...el.children]);
  }
  return null;
}
var flatten = (value) => value.replace(/translate3d\(\s*([^,]+),\s*([^,]+),\s*0(?:px)?\s*\)/g, "translate($1, $2)").replace(/\s*translateZ\(\s*0(?:px)?\s*\)/g, "").trim() || "none";
var LAYER_HACK = /translateZ\(\s*0|translate3d\([^)]*,\s*0(?:px)?\s*\)/;
var SLICE_MS = 4;
var flattened;
function flattenRules(root, done) {
  const sheetCount = document.styleSheets.length;
  if (flattened?.sheets === sheetCount) {
    done(flattened.css);
    return () => {};
  }
  const css2 = [];
  const sheets = [...document.styleSheets];
  const stack = [];
  const visit = (rule) => {
    if (rule instanceof CSSStyleRule) {
      const transform = rule.style.getPropertyValue("transform");
      if (!transform || !LAYER_HACK.test(transform))
        return false;
      let applies = false;
      try {
        applies = root.querySelector(rule.selectorText) !== null;
      } catch {}
      if (!applies)
        return false;
      const selector = rule.selectorText.split(",").map((part) => `[data-list-id="guildsnav"] ${part.trim()}`).join(", ");
      css2.push(`${selector} { transform: ${flatten(transform)}; }`);
    } else if ("cssRules" in rule) {
      stack.push({ rules: rule.cssRules, next: 0 });
      return true;
    }
    return false;
  };
  const step = (deadline) => {
    while (performance.now() < deadline) {
      const top = stack[stack.length - 1];
      if (!top) {
        const sheet = sheets.shift();
        if (!sheet)
          return true;
        try {
          stack.push({ rules: sheet.cssRules, next: 0 });
        } catch {}
        continue;
      }
      if (top.next >= top.rules.length) {
        stack.pop();
        continue;
      }
      const end = Math.min(top.next + 200, top.rules.length);
      while (top.next < end && !visit(top.rules[top.next++]))
        ;
    }
    return false;
  };
  return inIdleSlices(step, () => {
    flattened = { sheets: sheetCount, css: css2.join(`
`) };
    done(flattened.css);
  });
}
function inIdleSlices(step, finish) {
  let cancelled = false;
  const schedule = (fn) => typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 16);
  const run = () => {
    if (cancelled)
      return;
    if (step(performance.now() + SLICE_MS))
      finish();
    else
      schedule(run);
  };
  schedule(run);
  return () => void (cancelled = true);
}
function createSession(list, kind, marginScreens) {
  const itemSelector = kind.item(list.getAttribute("data-list-id"));
  const scroller = findScroller(list);
  const rows = new Set;
  let disposed = false;
  let queued = false;
  const siblingHasItem = (el) => {
    for (const sibling of el.parentElement.children) {
      if (sibling !== el && (sibling.matches(itemSelector) || sibling.querySelector(itemSelector)))
        return true;
    }
    return false;
  };
  const rowCache = new WeakMap;
  const rowOf = (item) => {
    const cached = rowCache.get(item);
    if (cached?.isConnected && cached.contains(item))
      return cached;
    const row = computeRow(item);
    rowCache.set(item, row);
    return row;
  };
  const computeRow = (item) => {
    let el = item;
    while (el.parentElement && el.parentElement !== scroller && el.parentElement !== list && !siblingHasItem(el)) {
      el = el.parentElement;
    }
    while (el.children.length === 1) {
      const cs = getComputedStyle(el);
      const child = el.children[0];
      const childCs = getComputedStyle(child);
      const bare = cs.display === "block" && parseFloat(cs.paddingTop) === 0 && parseFloat(cs.paddingBottom) === 0 && parseFloat(cs.borderTopWidth) === 0 && parseFloat(cs.borderBottomWidth) === 0;
      if (!bare || parseFloat(childCs.marginTop) === 0 && parseFloat(childCs.marginBottom) === 0)
        break;
      el = child;
    }
    return el;
  };
  const margin = Math.round((scroller?.clientHeight ?? 800) * marginScreens);
  const visibility = scroller ? new IntersectionObserver((entries) => {
    if (disposed)
      return;
    for (const entry of entries) {
      const row = entry.target;
      if (rows.has(row))
        row.classList.toggle(FAR, !entry.isIntersecting);
    }
  }, { root: scroller, rootMargin: `${margin}px 0px` }) : undefined;
  let cancelSync;
  let again = false;
  let grew = false;
  const sync = () => {
    if (disposed)
      return;
    if (cancelSync) {
      again = true;
      return;
    }
    const items = [...list.querySelectorAll(itemSelector)];
    const current = new Set;
    let next = 0;
    cancelSync = inIdleSlices((deadline) => {
      while (next < items.length && performance.now() < deadline) {
        const end = Math.min(next + 50, items.length);
        for (;next < end; next++)
          if (items[next].isConnected)
            current.add(rowOf(items[next]));
      }
      return next >= items.length;
    }, () => {
      cancelSync = undefined;
      if (disposed)
        return;
      for (const row of rows) {
        if (current.has(row))
          continue;
        visibility?.unobserve(row);
        row.classList.remove(ROW, FAR);
        rows.delete(row);
      }
      for (const row of current) {
        if (rows.has(row))
          continue;
        rows.add(row);
        row.classList.add(ROW);
        visibility?.observe(row);
      }
      grew = true;
      if (again) {
        again = false;
        sync();
      }
    });
  };
  const touchesRows = (nodes) => {
    for (const node of nodes) {
      if (node instanceof Element && (node.matches(itemSelector) || node.querySelector(itemSelector)))
        return true;
    }
    return false;
  };
  const mutations = new MutationObserver((records) => {
    if (queued || !records.some((r) => touchesRows(r.addedNodes) || touchesRows(r.removedNodes)))
      return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  });
  mutations.observe(list, { childList: true, subtree: true });
  let lastTop = scroller?.scrollTop ?? 0;
  const onScroll = () => {
    const top = scroller.scrollTop;
    if (Math.abs(top - lastTop) > margin / 2) {
      for (const row of rows)
        row.classList.remove(FAR);
      requestAnimationFrame(() => {
        if (disposed || !visibility)
          return;
        for (const row of rows) {
          visibility.unobserve(row);
          visibility.observe(row);
        }
      });
    }
    lastTop = top;
  };
  scroller?.addEventListener("scroll", onScroll, { passive: true });
  let flat;
  const stopFlattening = kind.flattenPills ? flattenRules(list, (css2) => {
    if (disposed || !css2)
      return;
    flat = document.createElement("style");
    flat.id = "evi-fl-flatten";
    flat.textContent = css2;
    document.head.append(flat);
  }) : undefined;
  sync();
  return {
    list,
    stale() {
      if (scroller || !grew)
        return false;
      grew = false;
      return !!findScroller(list);
    },
    dispose() {
      disposed = true;
      cancelSync?.();
      stopFlattening?.();
      visibility?.disconnect();
      mutations.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
      flat?.remove();
      for (const row of rows)
        row.classList.remove(ROW, FAR);
      rows.clear();
    }
  };
}
var fast_lists_default = import_api2.definePlugin({
  settings: {
    servers: {
      type: "boolean",
      get label() {
        return t("settings.servers");
      },
      get description() {
        return t("settings.servers.description");
      },
      default: true
    },
    chat: {
      type: "boolean",
      get label() {
        return t("settings.chat");
      },
      get description() {
        return t("settings.chat.description");
      },
      default: false
    },
    members: {
      type: "boolean",
      get label() {
        return t("settings.members");
      },
      get description() {
        return t("settings.members.description");
      },
      default: false
    },
    margin: {
      type: "number",
      get label() {
        return t("settings.margin");
      },
      get description() {
        return t("settings.margin.description");
      },
      default: 2,
      min: 1,
      max: 10,
      step: 1
    }
  },
  start(ctx) {
    ctx.addStyle(css);
    const sessions = new Map;
    const refresh = (force = false) => {
      for (const kind of LISTS) {
        const enabled = ctx.settings.get(kind.key);
        const list = enabled ? document.querySelector(kind.list) : null;
        const current = sessions.get(kind.key);
        if (!force && current?.list === list && !current.stale())
          continue;
        current?.dispose();
        sessions.delete(kind.key);
        if (list)
          sessions.set(kind.key, createSession(list, kind, ctx.settings.get("margin")));
      }
    };
    refresh();
    ctx.onDispose(() => {
      for (const session of sessions.values())
        session.dispose();
      for (const el of document.querySelectorAll(`.${ROW}, .${FAR}`))
        el.classList.remove(ROW, FAR);
    });
    ctx.settings.onChange(() => refresh(true));
    ctx.setInterval(() => refresh(), 1000);
  }
});
