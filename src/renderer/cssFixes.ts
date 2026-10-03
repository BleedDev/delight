/**
 * Takes rules out of Discord's own stylesheets that cost a lot and do nothing for the user.
 *
 * Chromium flags an element the first time it's tested against a `:has()` rule, and the flag stays
 * for the element's lifetime. After that, changes inside it make Chromium check the rule again. A
 * rule whose subject is any element flags `html`, `body` and every app wrapper, which Discord never
 * recreates, so in a voice call every speaking ring restyled all ~7000 elements, ~100ms a few times
 * a second. Deleting such a rule later doesn't clear the flags: it has to go before any element was
 * ever tested against it.
 *
 * So every Discord stylesheet is held back (`media="not all"`) from the moment it's added until it
 * has loaded and been cleaned, then released. Rules are recognised by what they are, never by
 * Discord's hashed class names.
 */
import { Logger } from "./logger";

const logger = new Logger("CssFixes");

interface Fix {
    /** Shown in the log */
    name: string;
    /** True to delete this top-level rule */
    matches(rule: CSSRule): boolean;
}

const FIXES: Fix[] = [
    {
        // Discord's internal "highlight text variants" tool, for staff. It only ever draws inside
        // `.highlight-mana-text`, but its `:not(:has(*))` rules have any element as their subject.
        // Measured in a 7-person call: main thread busy 1558 -> 451ms per 3s, longest task 99 -> 15ms.
        name: "staff text highlighter",
        matches: rule => typeof CSSScopeRule !== "undefined" && rule instanceof CSSScopeRule && rule.start?.trim() === ".highlight-mana-text",
    },
];

const HELD = "data-evi-held";
const cleaned = new WeakSet<CSSStyleSheet>();

function clean(sheet: CSSStyleSheet) {
    if (cleaned.has(sheet)) return;
    cleaned.add(sheet);
    let rules: CSSRuleList;
    try {
        rules = sheet.cssRules;
    } catch {
        // Cross-origin: not Discord's
        return;
    }
    for (let i = rules.length - 1; i >= 0; i--) {
        const fix = FIXES.find(f => f.matches(rules[i]));
        if (!fix) continue;
        sheet.deleteRule(i);
        logger.info(`Removed Discord's ${fix.name} (${(sheet.href ?? "").split("/").pop()})`);
    }
}

function isStylesheet(node: Node): node is HTMLLinkElement {
    return node instanceof HTMLLinkElement && node.rel === "stylesheet";
}

/** Holds the link back until its rules are cleaned. Its own `load` listeners (webpack's) still fire as usual. */
function hold(link: HTMLLinkElement) {
    if (link.hasAttribute(HELD)) return;
    if (link.sheet) {
        // Already loaded: clean it now, nothing has rendered with it yet this early
        clean(link.sheet);
        return;
    }
    link.setAttribute(HELD, link.media);
    link.media = "not all";
    const release = () => {
        link.removeEventListener("load", release);
        link.removeEventListener("error", release);
        if (link.sheet) clean(link.sheet);
        const media = link.getAttribute(HELD)!;
        link.removeAttribute(HELD);
        if (media) link.media = media;
        else link.removeAttribute("media");
    };
    link.addEventListener("load", release);
    link.addEventListener("error", release);
}

/** Before Discord's first stylesheet: from boot, which runs before Discord's own scripts */
export function installCssFixes() {
    if (typeof CSSScopeRule === "undefined") return;
    for (const link of document.querySelectorAll("link")) if (isStylesheet(link)) hold(link);
    // The initial HTML's links are parsed into <head>, lazily loaded ones appended to it. Watching
    // the whole document only until <head> is done parsing keeps this to one cheap childList
    // observer on <head> for the rest of the session.
    const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) if (isStylesheet(node)) hold(node);
    });
    observer.observe(document, { childList: true, subtree: true });
    const narrow = () => {
        observer.disconnect();
        observer.observe(document.head, { childList: true });
        for (const link of document.head.querySelectorAll("link")) if (isStylesheet(link)) hold(link);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", narrow, { once: true });
    else narrow();
}

/**
 * Discord's UI fonts load on first use, and a face arriving makes Chromium lay out all text in that
 * family again: 64ms of the first settings open. They're a few small files, so load them once the
 * app is up, when the browser is idle.
 */
const UI_FONTS = /^(gg sans|ABC Ginto)/i;

export function warmUiFonts() {
    const faces: FontFace[] = [];
    document.fonts.forEach(face => {
        if (face.status === "unloaded" && UI_FONTS.test(face.family.replace(/["']/g, ""))) faces.push(face);
    });
    const next = () => {
        const face = faces.shift();
        if (!face) return;
        // One at a time, each in its own idle period: nothing competes with what the user is doing
        face.load().catch(() => { }).finally(() => requestIdleCallback(next, { timeout: 5000 }));
    };
    requestIdleCallback(next, { timeout: 5000 });
}
