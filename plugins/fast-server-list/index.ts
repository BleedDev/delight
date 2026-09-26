import { definePlugin } from "@delight/api";

/**
 * Every server icon in the sidebar is an SVG mask (the rounded shape and badge cutouts), and the
 * browser pays for all of them on every frame that repaints anything. On a 185-server account on a
 * ~300Hz display that pushed frames past their 3.3ms budget: p95 frame gap 6.7ms (missed frames)
 * versus 3.7ms with this plugin, measured interleaved over 8 rounds.
 *
 * Servers far outside the visible area get `content-visibility: hidden`: the browser skips their
 * style, layout and paint, but keeps their rendered state (decoded icons included) and their
 * size. They are never unmounted or emptied, so nothing flickers or disappears. We decide when a
 * row renders again, a generous distance before it can scroll into view, and a jump bigger than
 * that reveals every row before the frame paints.
 *
 * Measured and rejected: `contain: layout style` on every row made frames slower (p95 10ms),
 * because each row becoming its own stacking context multiplies the compositor's work.
 *
 * Pure DOM, no patches to Discord's code, so Discord updates can't silently break it.
 */

const ITEM = '[data-list-item-id^="guildsnav___"]';
const ROW = "dl-fsl-row";
const FAR = "dl-fsl-far";

const css = `
.${ROW} {
    contain-intrinsic-size: auto 48px;
}
.${ROW}.${FAR} {
    content-visibility: hidden;
}
`;

function isScrollable(el: Element) {
    return /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
}

function findScroller(nav: Element): HTMLElement | null {
    for (let el: Element | null = nav; el; el = el.parentElement) {
        if (el instanceof HTMLElement && isScrollable(el)) return el;
    }
    for (const el of nav.querySelectorAll<HTMLElement>("*")) {
        if (isScrollable(el)) return el;
    }
    return null;
}

/**
 * Discord puts `translateZ(0)` on every server's unread pill, an old "force a GPU layer" hack. With
 * 185 servers that is 184 compositor layers, plus every icon overlapping one gets promoted too:
 * 132 layers on the page, 93 of them in the server list. The same transform in 2D looks identical
 * and keeps every animation, but needs no layer (132 -> 39 measured). Rules are found by what they
 * do, not by Discord's hashed class names, so this survives Discord updates.
 */
function flattenRules(nav: Element) {
    const inNav = [...nav.querySelectorAll("*")];
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
                    applies = inNav.some(el => el.matches(rule.selectorText));
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

/** Removes our classes from every element carrying them, whoever added them */
function sweep() {
    for (const el of document.querySelectorAll(`.${ROW}, .${FAR}`)) el.classList.remove(ROW, FAR);
}

/**
 * Everything attached to one sidebar element with one configuration. A new configuration or a
 * rebuilt sidebar gets a new session; a disposed session can't be revived.
 */
function createSession(nav: Element, marginScreens: number) {
    const scroller = findScroller(nav);
    const rows = new Set<HTMLElement>();
    let disposed = false;
    let queued = false;

    /** The outermost element around an item that contains no other item: one row, for servers and folder headers alike */
    const rowOf = (item: Element) => {
        let el = item as HTMLElement;
        while (el.parentElement && el.parentElement !== scroller && el.parentElement.querySelectorAll(ITEM).length === 1) {
            el = el.parentElement;
        }
        return el;
    };

    const margin = () => (scroller?.clientHeight ?? 800) * marginScreens;

    // Without a scroller (short list) there is nothing far away to skip
    const visibility = scroller
        ? new IntersectionObserver(entries => {
            if (disposed) return;
            for (const entry of entries) {
                const row = entry.target as HTMLElement;
                if (rows.has(row)) row.classList.toggle(FAR, !entry.isIntersecting);
            }
        }, { root: scroller, rootMargin: `${Math.round(margin())}px 0px` })
        : undefined;

    const sync = () => {
        if (disposed) return;
        const current = new Set<HTMLElement>();
        for (const item of nav.querySelectorAll(ITEM)) current.add(rowOf(item));

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

    // The sidebar mutates constantly (badges, typing, unreads), only resync when rows come or go
    const touchesRows = (nodes: NodeList) => {
        for (const node of nodes) {
            if (node instanceof Element && (node.matches(ITEM) || node.querySelector(ITEM))) return true;
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
    mutations.observe(nav, { childList: true, subtree: true });

    // A jump further than the render distance (scrollbar drag, jump to server): reveal everything
    // synchronously, before this frame paints. The observer re-hides what's still far away.
    let lastTop = scroller?.scrollTop ?? 0;
    const onScroll = () => {
        const top = scroller!.scrollTop;
        if (Math.abs(top - lastTop) > margin() / 2) {
            for (const row of rows) row.classList.remove(FAR);
        }
        lastTop = top;
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    const flat = document.createElement("style");
    flat.id = "delight-fsl-flatten";
    flat.textContent = flattenRules(nav);
    document.head.append(flat);

    sync();

    return {
        nav,
        dispose() {
            disposed = true;
            visibility?.disconnect();
            mutations.disconnect();
            scroller?.removeEventListener("scroll", onScroll);
            flat.remove();
            rows.clear();
            sweep();
        },
    };
}

export default definePlugin({
    settings: {
        margin: {
            type: "number",
            label: "Render distance (screens)",
            description: "How many screen heights above and below the visible servers stay rendered. Higher never shows an unrendered server even on very fast scrolls, lower saves more work.",
            default: 2,
            min: 1,
            max: 10,
            step: 1,
        },
    },

    start(ctx) {
        ctx.addStyle(css);
        sweep();

        let session: ReturnType<typeof createSession> | undefined;

        const attach = () => {
            session?.dispose();
            session = undefined;
            const nav = document.querySelector('[data-list-id="guildsnav"]');
            if (nav) session = createSession(nav, ctx.settings.get("margin"));
        };

        attach();
        ctx.onDispose(() => session?.dispose());
        ctx.settings.onChange(attach);

        // The sidebar can be rebuilt (account switch, layout change): re-attach when it's replaced
        ctx.setInterval(() => {
            const nav = document.querySelector('[data-list-id="guildsnav"]');
            if (nav !== (session?.nav ?? null)) attach();
        }, 2000);
    },
});
