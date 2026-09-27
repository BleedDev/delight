// Shadow-root host for the Claude UI: its stylesheet (styles.css, Discord's theme variables) stays out of Discord's
// page and Discord's styles stay out of it.
import { useContext, type ReactNode } from "react";
import { lazyContext } from "../lazyReact";
import { createRoot } from "@evi/api";
import css from "../../styles.css" with { type: "text" };

type Root = { render(node: ReactNode): void; unmount(): void };

let sheet: CSSStyleSheet | null = null;
function claudeSheet() {
    if (!sheet) ((sheet = new CSSStyleSheet()), sheet.replaceSync(css));
    return sheet;
}

const PortalCtx = lazyContext<HTMLElement | null>(null);
export const usePortal = () => useContext(PortalCtx());

const cdsRootProps = (pageBg: string, density: "compact" | "comfortable") => ({
    "data-density": density,
    "data-mode": "dark",
    "data-platform": "web",
    "data-page-bg": "surface-1",
    style: `font-size: var(--cds-font-size-body); --cds-page-bg: var(${pageBg});`,
});

function el(tag: string, cls: string, attrs: Record<string, string> = {}) {
    const e = document.createElement(tag);
    e.className = cls;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
}

// Keys typed inside the shadow tree are retargeted to the host, so Discord would think nothing is focused and
// steal them for its own composer. Keep them inside.
const CONTAINED = ["keydown", "keyup", "keypress", "paste", "copy", "cut", "input", "beforeinput", "compositionstart", "compositionend"];

// Tooltips for everything with a title: after a short hover, a small card above the control
// (first line = label, other lines = detail, a trailing "(⇧⌘I)" becomes keycaps). Native titles are suppressed.
function installTooltips(shadow: ShadowRoot, layer: HTMLElement) {
    const tip = el("div", "bg-surface-3 shadow-panel rounded text-footnote text-primary");
    tip.setAttribute("role", "tooltip");
    tip.style.cssText = "position:fixed;max-width:280px;padding:4px 8px;pointer-events:none;opacity:0;transition:opacity .12s;white-space:pre-line;z-index:2";
    layer.appendChild(tip);
    let timer = 0;
    let cur: HTMLElement | null = null;
    const hide = () => {
        clearTimeout(timer);
        tip.style.opacity = "0";
        cur = null;
    };
    const show = (t: HTMLElement) => {
        const text = t.dataset.tip ?? "";
        if (!text.trim() || !t.isConnected) return;
        const [first, ...rest] = text.split("\n");
        // only a real chord becomes keycaps: modifier symbols plus at most one key ("(⇧⌘I)", not "(⇧⇥ to cycle)")
        const m0 = first.match(/^(.*?)\s*\(([^()]+)\)$/);
        const m = m0 && /^[⇧⌘⌥⌃⇥↵⏎⌫]+[A-Za-z0-9]?$/.test(m0[2].replace(/[\s+]/g, "")) ? m0 : null;
        tip.replaceChildren();
        const head = el("div", "flex items-center gap-sm");
        head.append(Object.assign(document.createElement("span"), { textContent: m ? m[1] : first }));
        if (m)
            for (const k of m[2].replace(/\s+/g, "").split("")) {
                const kbd = el("kbd", "text-caption text-secondary rounded-[4px] bg-alpha-2 px-[4px]");
                kbd.textContent = k;
                head.append(kbd);
            }
        tip.append(head);
        if (rest.length) tip.append(Object.assign(el("div", "text-secondary"), { textContent: rest.join("\n") }));
        const r = t.getBoundingClientRect();
        tip.style.opacity = "0";
        tip.style.left = "0px";
        tip.style.top = "0px";
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        const top = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.opacity = "1";
    };
    shadow.addEventListener("pointerover", e => {
        const t = (e.target as HTMLElement).closest?.("[title],[data-tip]") as HTMLElement | null;
        if (!t || t === cur) return;
        if (t.hasAttribute("title")) {
            t.dataset.tip = t.getAttribute("title") ?? "";
            t.removeAttribute("title");
        }
        hide();
        cur = t;
        timer = window.setTimeout(() => cur === t && show(t), 500);
    });
    shadow.addEventListener("pointerout", e => {
        if (cur && !cur.contains((e as PointerEvent).relatedTarget as Node)) hide();
    });
    for (const ev of ["pointerdown", "keydown", "wheel"]) shadow.addEventListener(ev, hide, { capture: true, passive: true } as any);
}

export interface ShadowMount {
    root: Root;
    render(node: ReactNode): void;
    unmount(): void;
}

export function mountShadow(host: HTMLElement, { density = "compact" as "compact" | "comfortable", className = "", detachedPortal = false } = {}): ShadowMount {
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [claudeSheet()];
    shadow.replaceChildren();
    for (const t of CONTAINED) host.addEventListener(t, e => e.stopPropagation());

    const page = el("div", "cds-root text-primary cds-body", {
        ...cdsRootProps("--cds-surface-1", density),
        style: cdsRootProps("--cds-surface-1", density).style + " height:100%; width:100%; flex:1 1 auto; min-width:0; --tiles-padding:0px; --tiles-gap:0px;",
    });
    const app = el("div", `epitaxy-root text-body text-primary break-words h-full w-full flex flex-col ${className}`);
    page.appendChild(app);
    const portal = el("div", "cds-root pointer-events-auto", { "data-cds-portal": "", ...cdsRootProps("--cds-surface-3", density) });
    const portalWrap = el("div", "epitaxy-root text-body text-primary break-words");
    portalWrap.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:1100";
    portalWrap.appendChild(portal);
    // hosts inside clipped Discord containers (the DM sidebar) put menus/popovers in their own layer on <body>
    let layerHost: HTMLElement | null = null;
    if (detachedPortal) {
        layerHost = document.createElement("div");
        layerHost.className = "dl-root dl-layer";
        layerHost.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:10001";
        const ls = layerHost.attachShadow({ mode: "open" });
        ls.adoptedStyleSheets = [claudeSheet()];
        for (const t of CONTAINED) layerHost.addEventListener(t, e => e.stopPropagation());
        ls.append(portalWrap);
        document.body.appendChild(layerHost);
        shadow.append(page);
    } else shadow.append(page, portalWrap);

    installTooltips(shadow, portalWrap);
    const root = createRoot(app);
    return {
        root,
        render: node => {
            const P = PortalCtx().Provider;
            root.render(<P value={portal}>{node}</P>);
        },
        unmount: () => (root.unmount(), layerHost?.remove()),
    };
}
