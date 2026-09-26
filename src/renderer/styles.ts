import { Native } from "./native";
import { Settings } from "./settings";

function whenDomReady(cb: () => void) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb, { once: true });
    else cb();
}

export interface ManagedStyle {
    update(css: string): void;
    remove(): void;
}

/** A <style> element appended to <head>. Created before the DOM exists is fine, it's attached later. */
export function createStyle(css: string, id?: string): ManagedStyle {
    const el = document.createElement("style");
    if (id) el.id = id;
    el.textContent = css;
    let removed = false;
    whenDomReady(() => !removed && document.head.append(el));

    return {
        update: next => void (el.textContent = next),
        remove() {
            removed = true;
            el.remove();
        },
    };
}

let quickCss: ManagedStyle | undefined;
let quickCssSource = "";
let saveTimer: ReturnType<typeof setTimeout> | undefined;

addEventListener("pagehide", () => QuickCss.flush());

export const QuickCss = {
    get source() {
        return quickCssSource;
    },

    init(initial: string) {
        quickCssSource = initial;
        // Last in <head> so it wins over plugin styles of equal specificity
        quickCss = createStyle(Settings.data.quickCss ? initial : "", "delight-quickcss");
        Native.onQuickCssChange(css => {
            quickCssSource = css;
            QuickCss.apply();
        });
    },

    apply() {
        quickCss?.update(Settings.data.quickCss ? quickCssSource : "");
    },

    /** Applies immediately, writes to disk debounced */
    save(css: string) {
        quickCssSource = css;
        QuickCss.apply();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = undefined;
            Native.saveQuickCss(css);
        }, 300);
    },

    flush() {
        if (saveTimer === undefined) return;
        clearTimeout(saveTimer);
        saveTimer = undefined;
        Native.saveQuickCssSync(quickCssSource);
    },
};
