// Evi Setup's window. The Rust side (src/main.rs) does the work: scan, check_update and run.
"use strict";

const tauri = window.__TAURI__;
const invoke = tauri.core.invoke;
const appWindow = tauri.window.getCurrentWindow();

const $ = id => document.getElementById(id);
const state = { scan: null, selected: new Set(), latest: null, busy: false };

const ICONS = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
};

function describe(install) {
    switch (install.state) {
        case "evi":
            if (install.devBuild) return "Evi dev build installed";
            return install.eviVersion ? `Evi ${install.eviVersion} installed` : "Evi installed";
        case "clean":
            return "Evi not installed";
        case "other-mod":
            return "Another client mod is installed";
        default:
            return "Not found on this computer";
    }
}

const selectable = install => install.state === "clean" || install.state === "evi";

/** Evi's installs stay picked, plus Stable; otherwise the first one Evi can go into */
function defaultSelection(installs) {
    const usable = installs.filter(selectable);
    const picked = usable.filter(i => i.state === "evi" || i.flavor === "stable");
    return new Set((picked.length ? picked : usable.slice(0, 1)).map(i => i.flavor));
}

function renderInstalls(animate) {
    const list = $("installs");
    list.replaceChildren();
    state.scan.installs.forEach((install, index) => {
        const row = document.createElement("label");
        row.className = `install state-${install.state}`;
        if (!selectable(install)) row.classList.add("unavailable");
        if (animate) {
            row.classList.add("entering");
            row.style.setProperty("--i", index);
        }
        if (install.path) row.title = install.path;

        const box = document.createElement("input");
        box.type = "checkbox";
        box.className = "check";
        box.disabled = !selectable(install);
        box.checked = state.selected.has(install.flavor);
        box.addEventListener("change", () => {
            if (box.checked) state.selected.add(install.flavor);
            else state.selected.delete(install.flavor);
            updateButtons();
        });

        const text = document.createElement("span");
        text.className = "install-text";
        const name = document.createElement("span");
        name.className = "install-name";
        name.textContent = `Discord ${install.label}`;
        const status = document.createElement("span");
        status.className = "install-state";
        const dot = document.createElement("span");
        dot.className = "dot";
        status.append(dot, describe(install));
        text.append(name, status);

        row.append(box, text);
        if (install.discordVersion && install.discordVersion !== "?") {
            const version = document.createElement("span");
            version.className = "install-version";
            version.textContent = install.discordVersion;
            row.append(version);
        }
        list.append(row);
    });

    const found = state.scan.installs.some(i => i.state !== "missing");
    $("hint").textContent = found
        ? "Discord closes and opens again while Evi installs."
        : "Install Discord first, then open Evi Setup again.";
    updateButtons();
}

function chosen() {
    return state.scan ? state.scan.installs.filter(i => state.selected.has(i.flavor) && selectable(i)) : [];
}

function updateButtons() {
    const picked = chosen();
    $("install").disabled = state.busy || !picked.length;
    $("uninstall").disabled = state.busy || !picked.some(i => i.state === "evi");
    $("banner-install").disabled = state.busy || !picked.length;
    $("close").disabled = state.busy;
}

function show(view) {
    // The update offer belongs to the choosing screen: its button acts on the ticked installs
    $("banner").hidden = view !== "choose" || !state.latest;
    for (const id of ["choose", "working"]) {
        const el = $(id);
        el.hidden = id !== view;
        el.classList.remove("entering");
        if (id === view) {
            void el.offsetWidth;
            el.classList.add("entering");
        }
    }
}

function setStatus(kind, title, text) {
    const icon = $("status-icon");
    icon.className = `status-icon ${kind}`;
    icon.innerHTML = kind === "done" ? ICONS.check : kind === "failed" ? ICONS.cross : "";
    $("status-title").textContent = title;
    $("status-text").textContent = text ?? "";
}

function listOutcomes(outcomes) {
    const list = $("outcomes");
    list.replaceChildren(...outcomes.map(o => {
        const item = document.createElement("li");
        item.className = `outcome ${o.ok ? "ok" : "failed"}`;
        item.innerHTML = o.ok ? ICONS.check : ICONS.cross;
        item.append(o.message);
        return item;
    }));
}

async function scan(animate) {
    state.scan = await invoke("scan");
    $("version").textContent = `· v${state.scan.version}`;
    if (!state.selected.size) state.selected = defaultSelection(state.scan.installs);
    renderInstalls(animate);
}

async function run(action, latest = false) {
    const flavors = chosen().map(i => i.flavor);
    if (!flavors.length || state.busy) return;
    state.busy = true;
    updateButtons();
    listOutcomes([]);
    $("status-actions").hidden = true;
    const verb = action === "install" ? "Installing Evi" : "Removing Evi";
    setStatus("busy", verb, action === "install" ? "Getting ready…" : "");
    show("working");

    let report;
    try {
        report = await invoke("run", { action, flavors, latest });
    } catch (err) {
        report = { ok: false, error: String(err), outcomes: [], restarted: [], startByHand: [] };
    }
    state.busy = false;
    updateButtons();

    if (report.error) {
        setStatus("failed", action === "install" ? "Evi couldn’t be installed" : "Evi couldn’t be removed", report.error);
    } else if (report.ok) {
        const restarting = report.restarted.length > 0;
        const title = restarting ? "Done — Discord is restarting" : action === "install" ? "Done — Evi is installed" : "Done — Evi is removed";
        let text = action === "install"
            ? `Evi ${report.version} is installed.${restarting ? " Discord opens with it in a moment." : ""}`
            : "Discord is back to how it was.";
        if (report.startByHand.length) text += ` Open Discord ${report.startByHand.join(" and ")} yourself.`;
        setStatus("done", title, text);
        if (report.outcomes.length > 1) listOutcomes(report.outcomes);
    } else {
        setStatus("failed", "Some installs didn’t work", "What happened with each:");
        listOutcomes(report.outcomes);
    }
    if (latest && report.ok) state.latest = null;
    $("status-actions").hidden = false;
    $("finish").focus();
    // What's installed now, for Back
    scan(false).catch(() => { });
}

async function checkForUpdate() {
    try {
        const check = await invoke("check_update");
        if (!check.available) return;
        state.latest = check.latest;
        $("banner-text").textContent = `Evi ${check.latest} is available`;
        $("banner-install").textContent = `Install ${check.latest}`;
        $("banner").hidden = $("choose").hidden;
    } catch { }
}

$("install").addEventListener("click", () => run("install"));
$("uninstall").addEventListener("click", () => run("uninstall"));
$("banner-install").addEventListener("click", () => run("install", true));
$("back").addEventListener("click", () => show("choose"));
$("finish").addEventListener("click", () => appWindow.close());
$("minimize").addEventListener("click", () => appWindow.minimize());
$("close").addEventListener("click", () => {
    if (!state.busy) appWindow.close();
});

tauri.event.listen("progress", event => {
    if (state.busy) $("status-text").textContent = event.payload;
});

// No browser context menu or reload shortcuts in an installer
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("keydown", e => {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) e.preventDefault();
});

scan(true).catch(err => {
    $("installs").textContent = `Couldn’t look for Discord: ${err}`;
});
checkForUpdate();
