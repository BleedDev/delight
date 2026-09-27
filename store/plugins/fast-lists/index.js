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
var import_api = require("@evi/api");
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
function findScroller(list) {
  for (let el = list;el; el = el.parentElement) {
    if (el instanceof HTMLElement && isScrollable(el))
      return el;
  }
  for (const el of list.querySelectorAll("*")) {
    if (isScrollable(el))
      return el;
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
  const margin = () => (scroller?.clientHeight ?? 800) * marginScreens;
  const visibility = scroller ? new IntersectionObserver((entries) => {
    if (disposed)
      return;
    for (const entry of entries) {
      const row = entry.target;
      if (rows.has(row))
        row.classList.toggle(FAR, !entry.isIntersecting);
    }
  }, { root: scroller, rootMargin: `${Math.round(margin())}px 0px` }) : undefined;
  const sync = () => {
    if (disposed)
      return;
    const current = new Set;
    for (const item of list.querySelectorAll(itemSelector))
      current.add(rowOf(item));
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
    if (Math.abs(top - lastTop) > margin() / 2) {
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
    stale: () => !scroller && !!findScroller(list),
    dispose() {
      disposed = true;
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
var fast_lists_default = import_api.definePlugin({
  settings: {
    servers: { type: "boolean", label: "Server list", description: "Skip servers far out of view and remove the pills' GPU-layer hack.", default: true },
    chat: { type: "boolean", label: "Chat (experimental)", description: "Skip messages far above or below what you're reading. Not measured yet.", default: false },
    members: { type: "boolean", label: "Member list (experimental)", description: "Skip members far out of view. Not measured yet.", default: false },
    margin: {
      type: "number",
      label: "Render distance (screens)",
      description: "How many screen heights above and below stay fully rendered. Higher never shows an unrendered row even on very fast scrolls, lower saves more work.",
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
