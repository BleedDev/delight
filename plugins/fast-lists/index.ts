import { definePlugin } from "@delight/api";

/**
 * Makes Discord's long lists cheap to render, with no patches to Discord's code: it works on the
 * DOM through the `data-list-id` / `data-list-item-id` attributes all of Discord's keyboard-navigable
 * lists carry, so Discord updates can't silently break it.
 *
 * Rows far outside the visible area get `content-visibility: hidden`: the browser skips their
 * style, layout and paint, but keeps their rendered state (decoded images included) and their
 * size. They are never unmounted or emptied, so nothing flickers or disappears. We decide when a
 * row renders again, a generous distance before it can scroll into view; a jump bigger than that
 * reveals every row before the frame paints; and revealing rows above the viewport keeps the first
 * visible row pinned, so a message that changed size while skipped can't make the chat jump.
 *
 * Measured on a 185-server account on a ~300Hz display: p95 frame gap 6.7ms -> 3.7ms (server list).
 * Measured and rejected: `contain: layout style` on every row made frames slower (p95 10ms).
 *
 * The server list additionally has Discord's `translateZ(0)` hack on every unread pill removed
 * (flattened to the identical 2D transform): 132 compositor layers -> 39, animations unchanged.
 */

const ROW = "dl-fl-row";
const FAR = "dl-fl-far";

const css = `
.${ROW} {
    contain-intrinsic-size: auto 48px;
}
.${ROW}.${FAR} {
    content-visibility: hidden;
}
`;

interface ListKind {
    key: "servers" | "chat" | "members";
    list: string;
    /** Items of one list element, given its data-list-id */
    item: (listId: string) => string;
    flattenPills?: boolean;
}

const LISTS: ListKind[] = [
    { key: "servers", list: '[data-list-id="guildsnav"]', item: id => `[data-list-item-id^="${id}___"]`, flattenPills: true },
    { key: "chat", list: '[data-list-id^="chat-messages"]', item: id => `[data-list-item-id^="${id}___"]` },
    { key: "members", list: '[data-list-id^="members"]', item: id => `[data-list-item-id^="${id}___"]` },
];

function isScrollable(el: Element) {
    return /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
}

function findScroller(list: Element): HTMLElement | null {
    for (let el: Element | null = list; el; el = el.parentElement) {
        if (el instanceof HTMLElement && isScrollable(el)) return el;
    }
    for (const el of list.querySelectorAll<HTMLElement>("*")) {
        if (isScrollable(el)) return el;
    }
    return null;
}

/**
 * Discord puts `translateZ(0)` on every server's unread pill, an old "force a GPU layer" hack.
 * With 185 servers that is 184 compositor layers, and every icon overlapping one gets promoted too.
 * The same transform in 2D looks identical, keeps every animation, and needs no layer. Rules are
 * found by what they do, not by Discord's hashed class names.
 */
function flattenRules(root: Element) {
    const inside = [...root.querySelectorAll("*")];
    const flatten = (value: string) => value
        .replace(/translate3d\(\s*([^,]+),\s*([^,]+),\s*0(?:px)?\s*\)/g, "translate($1, $2)")
        .replace(/\s*translateZ\(\s*0(?:px)?\s*\)/g, "")
        .trim() || "none";

    const css: string[] = [];
    const visit = (list: CSSRuleList) => {
        for (const rule of list) {
            if (rule instanceof CSSStyleRule) {
                const transform = rule.style.getPropertyValue("transform");
                if (!transform || !/translateZ\(\s*0|translate3d\([^)]*,\s*0(?:px)?\s*\)/.test(transform)) continue;
                let applies = false;
                try {
                    applies = inside.some(el => el.matches(rule.selectorText));
                } catch { }
                if (!applies) continue;
                // Scoped to the server list and one step more specific, so it wins without !important
                const selector = rule.selectorText.split(",").map(part => `[data-list-id="guildsnav"] ${part.trim()}`).join(", ");
                css.push(`${selector} { transform: ${flatten(transform)}; }`);
            } else if ("cssRules" in rule) {
                visit((rule as CSSGroupingRule).cssRules);
            }
        }
    };
    for (const sheet of document.styleSheets) {
        try {
            visit(sheet.cssRules);
        } catch {
            // Cross-origin sheets can't be read, Discord's own are same-origin
        }
    }
    return css.join("\n");
}

/**
 * Everything attached to one list element with one configuration. A new configuration or a
 * re-rendered list gets a new session; a disposed session can't be revived.
 */
function createSession(list: Element, kind: ListKind, marginScreens: number) {
    const itemSelector = kind.item(list.getAttribute("data-list-id")!);
    const scroller = findScroller(list);
    const rows = new Set<HTMLElement>();
    let disposed = false;
    let queued = false;

    /** Whether any of el's siblings is or contains an item. Usually answered by the first sibling. */
    const siblingHasItem = (el: Element) => {
        for (const sibling of el.parentElement!.children) {
            if (sibling !== el && (sibling.matches(itemSelector) || sibling.querySelector(itemSelector))) return true;
        }
        return false;
    };

    // Rows only change when Discord re-renders them, so work each item's row out once
    const rowCache = new WeakMap<Element, HTMLElement>();

    /** The outermost element around an item that contains no other item: one row, for servers and folder headers alike */
    const rowOf = (item: Element) => {
        const cached = rowCache.get(item);
        if (cached?.isConnected && cached.contains(item)) return cached;
        const row = computeRow(item);
        rowCache.set(item, row);
        return row;
    };

    const computeRow = (item: Element) => {
        let el = item as HTMLElement;
        while (el.parentElement && el.parentElement !== scroller && el.parentElement !== list && !siblingHasItem(el)) {
            el = el.parentElement;
        }
        // A bare wrapper lets its only child's vertical margin collapse through it. Skipping the
        // wrapper would stop that and shift the list by the margin, so skip the child instead.
        while (el.children.length === 1) {
            const cs = getComputedStyle(el);
            const child = el.children[0] as HTMLElement;
            const childCs = getComputedStyle(child);
            const bare = cs.display === "block" && parseFloat(cs.paddingTop) === 0 && parseFloat(cs.paddingBottom) === 0
                && parseFloat(cs.borderTopWidth) === 0 && parseFloat(cs.borderBottomWidth) === 0;
            if (!bare || (parseFloat(childCs.marginTop) === 0 && parseFloat(childCs.marginBottom) === 0)) break;
            el = child;
        }
        return el;
    };

    const margin = () => (scroller?.clientHeight ?? 800) * marginScreens;

    /** First row inside the viewport, to keep it pinned while rows above it change */
    const firstVisible = () => {
        const top = scroller!.getBoundingClientRect().top;
        let best: HTMLElement | undefined, bestTop = Infinity;
        for (const row of rows) {
            if (row.classList.contains(FAR)) continue;
            const t = row.getBoundingClientRect().top;
            if (t >= top && t < bestTop) {
                best = row;
                bestTop = t;
            }
        }
        return best && { row: best, top: bestTop };
    };

    // Without a scroller (short list) there is nothing far away to skip
    const visibility = scroller
        ? new IntersectionObserver(entries => {
            if (disposed) return;
            // The real visible top, rootBounds is expanded by the margin
            const viewTop = scroller.getBoundingClientRect().top;
            // Revealing rows above the viewport can change their height (edited while skipped): pin the view
            const revealsAbove = entries.some(e => e.isIntersecting && e.boundingClientRect.bottom < viewTop && (e.target as HTMLElement).classList.contains(FAR));
            const anchor = revealsAbove ? firstVisible() : undefined;

            for (const entry of entries) {
                const row = entry.target as HTMLElement;
                if (rows.has(row)) row.classList.toggle(FAR, !entry.isIntersecting);
            }

            if (anchor) {
                const shift = anchor.row.getBoundingClientRect().top - anchor.top;
                if (Math.abs(shift) > 0.5) scroller.scrollTop += shift;
            }
        }, { root: scroller, rootMargin: `${Math.round(margin())}px 0px` })
        : undefined;

    const sync = () => {
        if (disposed) return;
        const current = new Set<HTMLElement>();
        for (const item of list.querySelectorAll(itemSelector)) current.add(rowOf(item));

        for (const row of rows) {
            if (current.has(row)) continue;
            visibility?.unobserve(row);
            row.classList.remove(ROW, FAR);
            rows.delete(row);
        }
        for (const row of current) {
            if (rows.has(row)) continue;
            rows.add(row);
            row.classList.add(ROW);
            // Starts rendered; the observer's first callback hides it only if it really is far away
            visibility?.observe(row);
        }
    };

    // Lists mutate constantly (badges, typing, reactions), only resync when rows come or go
    const touchesRows = (nodes: NodeList) => {
        for (const node of nodes) {
            if (node instanceof Element && (node.matches(itemSelector) || node.querySelector(itemSelector))) return true;
        }
        return false;
    };
    const mutations = new MutationObserver(records => {
        if (queued || !records.some(r => touchesRows(r.addedNodes) || touchesRows(r.removedNodes))) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            sync();
        });
    });
    mutations.observe(list, { childList: true, subtree: true });

    // A jump further than the render distance (scrollbar drag, jump to message): reveal everything
    // synchronously, before this frame paints. The observer re-hides what's still far away.
    let lastTop = scroller?.scrollTop ?? 0;
    const onScroll = () => {
        const top = scroller!.scrollTop;
        if (Math.abs(top - lastTop) > margin() / 2) {
            for (const row of rows) row.classList.remove(FAR);
            // The observer only reports changes: rows still far away wouldn't be re-hidden.
            // Re-observing gives every row a fresh initial report.
            requestAnimationFrame(() => {
                if (disposed || !visibility) return;
                for (const row of rows) {
                    visibility.unobserve(row);
                    visibility.observe(row);
                }
            });
        }
        lastTop = top;
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    let flat: HTMLStyleElement | undefined;
    if (kind.flattenPills) {
        flat = document.createElement("style");
        flat.id = "delight-fl-flatten";
        flat.textContent = flattenRules(list);
        document.head.append(flat);
    }

    sync();

    return {
        list,
        /** Attached before the list could scroll (still loading): needs a fresh session now that it can */
        stale: () => !scroller && !!findScroller(list),
        dispose() {
            disposed = true;
            visibility?.disconnect();
            mutations.disconnect();
            scroller?.removeEventListener("scroll", onScroll);
            flat?.remove();
            for (const row of rows) row.classList.remove(ROW, FAR);
            rows.clear();
        },
    };
}

export default definePlugin({
    settings: {
        servers: { type: "boolean", label: "Server list", description: "Skip servers far out of view and remove the pills' GPU-layer hack.", default: true },
        chat: { type: "boolean", label: "Chat", description: "Skip messages far above or below what you're reading.", default: true },
        members: { type: "boolean", label: "Member list", description: "Skip members far out of view.", default: true },
        margin: {
            type: "number",
            label: "Render distance (screens)",
            description: "How many screen heights above and below stay fully rendered. Higher never shows an unrendered row even on very fast scrolls, lower saves more work.",
            default: 2,
            min: 1,
            max: 10,
            step: 1,
        },
    },

    start(ctx) {
        ctx.addStyle(css);
        const sessions = new Map<ListKind["key"], ReturnType<typeof createSession>>();

        const refresh = (force = false) => {
            for (const kind of LISTS) {
                const enabled = ctx.settings.get(kind.key);
                const list = enabled ? document.querySelector(kind.list) : null;
                const current = sessions.get(kind.key);
                if (!force && current?.list === list && !current.stale()) continue;
                current?.dispose();
                sessions.delete(kind.key);
                if (list) sessions.set(kind.key, createSession(list, kind, ctx.settings.get("margin")));
            }
        };

        refresh();
        ctx.onDispose(() => {
            for (const session of sessions.values()) session.dispose();
            // Belt and braces: nothing of ours may survive a disable
            for (const el of document.querySelectorAll(`.${ROW}, .${FAR}`)) el.classList.remove(ROW, FAR);
        });
        ctx.settings.onChange(() => refresh(true));

        // Chats and member lists are replaced when you switch channels: re-attach to the new ones
        ctx.setInterval(() => refresh(), 1000);
    },
});
