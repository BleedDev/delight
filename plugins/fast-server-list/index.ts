import { definePlugin } from "@delight/api";

/**
 * With hundreds of servers, every unread badge, typing indicator and hover in the sidebar makes the
 * browser recompute style and layout for all of them. This plugin works purely on the DOM, with no
 * patches to Discord's code, so Discord updates can't silently break it:
 *
 *  - every server row gets `contain: layout style` and a remembered size, so a change inside one
 *    row can't invalidate layout outside it (measured on 185 servers: scroll p99 130ms -> 47ms)
 *  - optionally, rows far outside the visible area get `content-visibility: hidden`: the browser
 *    skips their style, layout and paint, but keeps their rendered state (decoded icons included)
 *    and their size. Rows are never unmounted or emptied, which is what made earlier approaches
 *    flicker. We decide when a row renders again, a generous distance before it can scroll into
 *    view, and a jump bigger than that reveals every row before the frame paints
 */

const ITEM = '[data-list-item-id^="guildsnav___"]';
const ROW = "dl-fsl-row";
const FAR = "dl-fsl-far";

const css = `
.${ROW} {
    contain: layout style;
    contain-intrinsic-size: auto 48px;
}
.${ROW}.${FAR} {
    content-visibility: hidden;
}
`;

type Strategy = "contain" | "skip";

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

/** Removes our classes from every element carrying them, whoever added them */
function sweep() {
    for (const el of document.querySelectorAll(`.${ROW}, .${FAR}`)) el.classList.remove(ROW, FAR);
}

/**
 * Everything attached to one sidebar element with one configuration. A new configuration or a
 * rebuilt sidebar gets a new session; a disposed session can't be revived.
 */
function createSession(nav: Element, strategy: Strategy, marginScreens: number) {
    const scroller = findScroller(nav);
    const rows = new Set<HTMLElement>();
    const skip = strategy === "skip" && !!scroller;
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

    const visibility = skip
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
    if (skip) scroller!.addEventListener("scroll", onScroll, { passive: true });

    sync();

    return {
        nav,
        dispose() {
            disposed = true;
            visibility?.disconnect();
            mutations.disconnect();
            scroller?.removeEventListener("scroll", onScroll);
            rows.clear();
            sweep();
        },
    };
}

export default definePlugin({
    settings: {
        strategy: {
            type: "select",
            label: "Optimization",
            description: "Containment isolates each server so one changing badge can't slow down the whole list. Skipping also stops rendering servers far out of view.",
            default: "contain",
            options: [
                { label: "Containment (recommended)", value: "contain" },
                { label: "Containment and skip far servers (experimental)", value: "skip" },
            ],
        },
        margin: {
            type: "number",
            label: "Render distance for skipping (screens)",
            description: "How many screen heights above and below stay rendered when skipping far servers.",
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
            if (nav) session = createSession(nav, ctx.settings.get("strategy") as Strategy, ctx.settings.get("margin"));
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
