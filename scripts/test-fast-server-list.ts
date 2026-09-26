/**
 * Runs the Fast Server List plugin against a synthetic 185-server sidebar in headless Chrome and
 * checks the guarantees that matter: no visible server is ever hidden, no stale state survives a
 * strategy switch or disabling, and rows added later (opened folders) are handled.
 *
 *   node scripts/test-fast-server-list.ts
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const code = readFileSync(join(ROOT, "dist", "plugins", "fast-server-list", "index.js"), "utf8");

const browser = await chromium.launch({
    executablePath: ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync),
    headless: true,
});
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });

await page.setContent(`<!doctype html><style>
    body { margin: 0; }
    .scroller { height: 600px; overflow-y: auto; width: 72px; }
    .listItem { position: relative; height: 48px; margin-bottom: 8px; }
    .pill { position: absolute; left: 0; width: 4px; height: 8px; background: white; }
    img { width: 48px; height: 48px; display: block; }
</style>
<nav><ul data-list-id="guildsnav" class="scroller"><div class="list"></div></ul></nav>`);

const results = await page.evaluate(async (pluginCode) => {
    const list = document.querySelector(".list")!;
    const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="purple"/></svg>');
    const row = (id: string) => {
        const div = document.createElement("div");
        div.className = "listItem";
        div.innerHTML = `<div class="pill"></div><div><div data-list-item-id="guildsnav___${id}" role="treeitem"><img src="${icon}"></div></div>`;
        return div;
    };
    for (let i = 0; i < 175; i++) list.append(row(String(i)));
    // Folders: a header item plus a group of children, collapsed by default
    const folders: HTMLElement[] = [];
    for (let f = 0; f < 10; f++) {
        const folder = document.createElement("div");
        folder.className = "folder";
        folder.append(row(`folder-${f}`));
        list.append(folder);
        folders.push(folder);
    }

    // Minimal plugin host
    const settings: Record<string, any> = { margin: 2 };
    const changeListeners: (() => void)[] = [];
    const disposers: (() => void)[] = [];
    const ctx = {
        addStyle(css: string) {
            const el = document.createElement("style");
            el.textContent = css;
            document.head.append(el);
            disposers.push(() => el.remove());
        },
        onDispose: (fn: () => void) => void disposers.push(fn),
        setInterval(fn: () => void, ms: number) {
            const h = setInterval(fn, ms);
            disposers.push(() => clearInterval(h));
        },
        settings: {
            get: (k: string) => settings[k],
            onChange: (cb: () => void) => void changeListeners.push(cb),
        },
    };
    const module = { exports: {} as any };
    new Function("module", "exports", "require", pluginCode)(module, module.exports, (n: string) => {
        if (n === "@delight/api") return { definePlugin: (d: any) => d };
        throw new Error(n);
    });
    const plugin = module.exports.default;
    const setSetting = (k: string, v: any) => {
        settings[k] = v;
        changeListeners.forEach(cb => cb());
    };
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const sc = document.querySelector<HTMLElement>(".scroller")!;
    const counts = () => ({ rows: document.querySelectorAll(".dl-fsl-row").length, far: document.querySelectorAll(".dl-fsl-far").length });
    const hiddenVisible = () => {
        const view = sc.getBoundingClientRect();
        return [...sc.querySelectorAll(".dl-fsl-far")].filter(r => {
            const b = r.getBoundingClientRect();
            return b.bottom > view.top && b.top < view.bottom;
        }).length;
    };
    const renderedHeight = () => sc.scrollHeight;

    const out: Record<string, unknown> = {};
    const heightBefore = renderedHeight();

    plugin.start(ctx);
    await frame();
    await new Promise(r => setTimeout(r, 50));
    out.rowsMarked = counts().rows;
    out.skipFarAtTop = counts().far;
    // Measured: containment on visible rows made frames slower, so they must stay plain
    const visibleRow = [...document.querySelectorAll<HTMLElement>(".dl-fsl-row:not(.dl-fsl-far)")][0];
    out.visibleRowContain = visibleRow ? getComputedStyle(visibleRow).contain : "missing";
    let worst = 0;
    for (let i = 0; i < 120; i++) {
        sc.scrollTop += 120;
        await frame();
        worst = Math.max(worst, hiddenVisible());
    }
    // Jumps: bottom, top, middle
    for (const to of [sc.scrollHeight, 0, sc.scrollHeight / 2]) {
        sc.scrollTop = to;
        await new Promise(r => requestAnimationFrame(r));
        worst = Math.max(worst, hiddenVisible());
        await frame();
        worst = Math.max(worst, hiddenVisible());
    }
    out.skipWorstHiddenVisible = worst;
    out.skipKeepsLayout = renderedHeight() === heightBefore;

    // Open a folder: its children must be picked up
    const group = document.createElement("div");
    for (let c = 0; c < 5; c++) group.append(row(`child-${c}`));
    folders[0].append(group);
    await frame();
    await frame();
    out.folderChildrenHandled = [...group.children].every(ch => ch.classList.contains("dl-fsl-row"));

    // A smaller render distance applies live and hides more
    sc.scrollTop = 0;
    await frame();
    setSetting("margin", 1);
    await frame();
    await new Promise(r => setTimeout(r, 50));
    out.farWithMargin1 = counts().far;
    out.hiddenVisibleAfterSettingChange = hiddenVisible();

    // Rebuilt sidebar: plugin re-attaches within its polling interval
    const nav = document.querySelector("nav")!;
    const clone = nav.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".dl-fsl-row, .dl-fsl-far").forEach(e => e.classList.remove("dl-fsl-row", "dl-fsl-far"));
    nav.replaceWith(clone);
    await new Promise(r => setTimeout(r, 2300));
    out.reattached = document.querySelectorAll(".dl-fsl-row").length > 150;

    // Disable: nothing may be left
    disposers.splice(0).reverse().forEach(fn => fn());
    await frame();
    out.afterDisable = counts();
    out.styleRemoved = ![...document.querySelectorAll("style")].some(s => s.textContent?.includes("dl-fsl"));
    return out;
}, code);

await browser.close();

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
    if (!ok) failed++;
    console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${name}\x1b[0m${detail !== undefined ? `  \x1b[2m${JSON.stringify(detail)}\x1b[0m` : ""}`);
}
const r = results as any;
check("marks every server and folder row", r.rowsMarked === 185, r.rowsMarked);
check("hides rows far out of view", r.skipFarAtTop > 50, r.skipFarAtTop);
check("visible rows get no containment (measured slower)", r.visibleRowContain === "none", r.visibleRowContain);
check("no visible row is ever hidden, scrolling or jumping", r.skipWorstHiddenVisible === 0, r.skipWorstHiddenVisible);
check("skipping doesn't change the list's size", r.skipKeepsLayout);
check("opened folder's servers are picked up", r.folderChildrenHandled);
check("smaller render distance applies live", r.farWithMargin1 > r.skipFarAtTop && r.hiddenVisibleAfterSettingChange === 0, { margin2: r.skipFarAtTop, margin1: r.farWithMargin1 });
check("re-attaches when Discord rebuilds the sidebar", r.reattached);
check("disabling leaves no trace", r.afterDisable.rows === 0 && r.afterDisable.far === 0 && r.styleRemoved, r.afterDisable);
process.exit(failed ? 1 : 0);
