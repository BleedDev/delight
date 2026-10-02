import { definePlugin, Dispatcher, find, React, useLocale } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import {
    ACTIVITY_TYPES, ActivityKind, Button, EMPTY_STATE, formatTimer, fromLocalInput, httpsUrl, imageUrls, isStreamUrl, LIMITS, newPreset,
    parseState, Preset, PresetState, Problem, problems, startOfDay, TIME_MODES, TimeMode, toActivity, toLocalInput,
} from "./rpc";
import { t } from "./strings";

/**
 * A custom "Playing …" on your profile, with your own pictures, text and buttons, and no app running.
 *
 * Games show Rich Presence by talking to Discord over RPC; Discord's RPC server then dispatches
 * LOCAL_ACTIVITY_UPDATE { socketId, applicationId, activity } and LocalActivityStore sends it to the
 * gateway with the rest of your presence (checked in Discord's web build, 2026-10-02). We dispatch
 * the same action under our own socket id, and the same action with `activity: null` takes it away.
 *
 * Every activity belongs to a Discord application, and pictures from links only show through one:
 * POST /applications/:id/external-assets { urls } turns each https link into an `mp:external/…` key,
 * which is what Discord's own RPC code does for games that send links. Evi's own application will be
 * the default (DEFAULT_APP_ID); until it's filled in, the Application ID setting is required.
 *
 * Presets live in this plugin's settings entry under a key the generated settings don't show.
 */

/** Evi's own Discord application. TODO before release: fill in the ID of the "Evi" app. */
export const DEFAULT_APP_ID = "";

const SOCKET_ID = "evi-rich-presence";
const STORAGE_KEY = "presets";
const APPLY_DELAY = 600;

type Settings = typeof settings;
const settings = {
    appId: {
        type: "string",
        get label() { return t("settings.appId"); },
        get description() { return t(DEFAULT_APP_ID ? "settings.appId.descriptionDefault" : "settings.appId.description"); },
        get placeholder() { return DEFAULT_APP_ID || "123456789012345678"; },
        default: "",
    },
} as const;

let ctx: PluginContext<Settings> | undefined;
/** The settings panel can show while the plugin is off: it saves through its own context then */
let panelCtx: PluginContext<Settings> | undefined;
let state: PresetState = EMPTY_STATE;

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => (ctx ?? panelCtx)?.settings as unknown as Storage | undefined;
const appId = () => String((ctx ?? panelCtx)?.settings.get("appId") ?? "").trim() || DEFAULT_APP_ID;

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
const useState$ = () => React.useSyncExternalStore(subscribe, () => state);

function commit(next: PresetState) {
    if (next === state) return;
    state = next;
    storage()?.set(STORAGE_KEY, state);
    for (const fn of [...listeners]) fn();
    scheduleApply();
}

function load() {
    state = parseState(storage()?.get(STORAGE_KEY));
    for (const fn of [...listeners]) fn();
}

const activePreset = () => state.presets.find(p => p.id === state.active);

// ---- Discord ------------------------------------------------------------------------------------

/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR: skipped.
 */
const http = (): any => find(v => typeof v?.post === "function" && typeof v?.del === "function"
    && typeof v?.patch === "function" && !("getXHR" in v) && !("Request" in v));

/** https link -> mp: key, per application. Links Discord refused are remembered as "" */
const assetCache = new Map<string, string>();
const cacheKey = (app: string, url: string) => `${app} ${url}`;

async function resolveAssets(app: string, urls: string[]): Promise<Record<string, string>> {
    const missing = urls.filter(u => !assetCache.has(cacheKey(app, u)));
    if (missing.length) {
        const client = http();
        if (!client) throw new Error("Discord's HTTP client wasn't found");
        const res = await client.post({ url: `/applications/${app}/external-assets`, body: { urls: missing }, oldFormErrors: true });
        const body: unknown = res?.body;
        const found = new Map<string, string>();
        if (Array.isArray(body)) {
            for (const item of body) {
                if (typeof item?.url === "string" && typeof item?.external_asset_path === "string") found.set(item.url, item.external_asset_path);
            }
        }
        for (const url of missing) {
            const path = found.get(url);
            assetCache.set(cacheKey(app, url), path ? `mp:${path}` : "");
        }
    }
    const out: Record<string, string> = {};
    for (const url of urls) {
        const key = assetCache.get(cacheKey(app, url));
        if (key) out[url] = key;
    }
    return out;
}

/** When each preset went on, so "elapsed" doesn't restart on every edit */
const since = new Map<string, number>();
let shown = false;
let applyTimer: ReturnType<typeof setTimeout> | undefined;
let applying = 0;
let warnedImages = false;

function dispatch(activity: Record<string, unknown> | null) {
    Dispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", socketId: SOCKET_ID, activity } as any);
    shown = !!activity;
}

function clear() {
    if (shown) dispatch(null);
}

function scheduleApply() {
    if (!ctx) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => void apply(), APPLY_DELAY);
}

async function apply() {
    const run = ++applying;
    const preset = activePreset();
    const app = appId();
    if (!ctx || !preset || problems(preset, app).length) return clear();
    const now = Date.now();
    if (!since.has(preset.id)) since.set(preset.id, now);
    let assets: Record<string, string> = {};
    try {
        assets = await resolveAssets(app, imageUrls(preset));
    } catch (err) {
        ctx?.logger.warn("Couldn't turn the pictures into Discord assets", err);
        if (!warnedImages) {
            warnedImages = true;
            ctx?.toast(t("toast.imagesFailed"), { type: "failure" });
        }
    }
    // A newer edit started while the pictures were on their way: that one decides
    if (run !== applying || !ctx) return;
    dispatch(toActivity(preset, app, { since: since.get(preset.id)!, now }, assets));
}

// ---- Editor -------------------------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 10);

function update(id: string, change: Partial<Preset>) {
    commit({ ...state, presets: state.presets.map(p => p.id === id ? { ...p, ...change } : p) });
}

function addPreset(from?: Preset) {
    if (state.presets.length >= LIMITS.presets) return;
    const preset = from
        ? { ...from, id: uid(), title: t("panel.copyOf", { title: from.title || from.name || t("panel.untitled") }).slice(0, 60), buttons: from.buttons.map(b => ({ ...b })) }
        : newPreset(uid(), t("panel.newTitle", { n: state.presets.length + 1 }));
    commit({ ...state, presets: [...state.presets, preset] });
    return preset.id;
}

function removePreset(id: string) {
    since.delete(id);
    commit({ presets: state.presets.filter(p => p.id !== id), active: state.active === id ? "" : state.active });
}

const typeLabel = (type: ActivityKind) => t(`type.${type}` as "type.playing");
const timeLabel = (mode: TimeMode) => t(`time.${mode}` as "time.none");
const problemText = (p: Problem) => t(`problem.${p}` as "problem.noName");

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean; }) {
    return (
        <label className="evi-rp-field" data-wide={wide ? "" : undefined}>
            <span className="evi-rp-label">{label}</span>
            {children}
            {hint && <span className="evi-rp-hint">{hint}</span>}
        </label>
    );
}

function TextInput({ value, onChange, placeholder, max = LIMITS.text, invalid, type = "text" }: {
    value: string; onChange(v: string): void; placeholder?: string; max?: number; invalid?: boolean; type?: string;
}) {
    return (
        <input
            className="evi-rp-input"
            type={type}
            value={value}
            maxLength={max}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            spellCheck={false}
            onChange={e => onChange(e.currentTarget.value)}
        />
    );
}

function Select<V extends string>({ value, options, onChange, label }: { value: V; options: readonly V[]; onChange(v: V): void; label(v: V): string; }) {
    return (
        <select className="evi-rp-input evi-rp-select" value={value} onChange={e => onChange(e.currentTarget.value as V)}>
            {options.map(o => <option key={o} value={o}>{label(o)}</option>)}
        </select>
    );
}

function Editor({ preset }: { preset: Preset; }) {
    const set = (change: Partial<Preset>) => update(preset.id, change);
    const setButton = (i: number, change: Partial<Button>) => {
        const buttons = [0, 1].map(n => preset.buttons[n] ?? { label: "", url: "" });
        buttons[i] = { ...buttons[i], ...change };
        // Empty ones at the end aren't kept
        while (buttons.length && !buttons[buttons.length - 1].label && !buttons[buttons.length - 1].url) buttons.pop();
        set({ buttons });
    };
    const badUrl = (v: string) => !!v.trim() && !httpsUrl(v);

    return (
        <div className="evi-rp-editor">
            <div className="evi-rp-group">
                <Field label={t("field.title")} hint={t("field.title.hint")}>
                    <TextInput value={preset.title} max={60} onChange={title => set({ title })} />
                </Field>
                <Field label={t("field.type")}>
                    <Select value={preset.type} options={ACTIVITY_TYPES} label={typeLabel} onChange={type => set({ type })} />
                </Field>
            </div>

            <h4 className="evi-rp-section">{t("section.text")}</h4>
            <div className="evi-rp-group">
                <Field label={t("field.name")} wide>
                    <TextInput value={preset.name} placeholder={t("field.name.placeholder")} invalid={!preset.name.trim()} onChange={name => set({ name })} />
                </Field>
                <Field label={t("field.details")}>
                    <TextInput value={preset.details} placeholder={t("field.details.placeholder")} onChange={details => set({ details })} />
                </Field>
                <Field label={t("field.state")}>
                    <TextInput value={preset.state} placeholder={t("field.state.placeholder")} onChange={state => set({ state })} />
                </Field>
                {preset.type === "streaming" && (
                    <Field label={t("field.streamUrl")} hint={t("field.streamUrl.hint")} wide>
                        <TextInput value={preset.streamUrl} type="url" max={LIMITS.url} placeholder="https://twitch.tv/…" invalid={!!preset.streamUrl.trim() && !isStreamUrl(preset.streamUrl)} onChange={streamUrl => set({ streamUrl })} />
                    </Field>
                )}
            </div>

            <h4 className="evi-rp-section">{t("section.images")}</h4>
            <div className="evi-rp-group">
                <Field label={t("field.largeImage")} hint={t("field.imageHint")}>
                    <TextInput value={preset.largeImage} type="url" max={LIMITS.url} placeholder="https://…/picture.png" invalid={badUrl(preset.largeImage)} onChange={largeImage => set({ largeImage })} />
                </Field>
                <Field label={t("field.largeText")}>
                    <TextInput value={preset.largeText} onChange={largeText => set({ largeText })} />
                </Field>
                <Field label={t("field.smallImage")}>
                    <TextInput value={preset.smallImage} type="url" max={LIMITS.url} placeholder="https://…/icon.png" invalid={badUrl(preset.smallImage)} onChange={smallImage => set({ smallImage })} />
                </Field>
                <Field label={t("field.smallText")}>
                    <TextInput value={preset.smallText} onChange={smallText => set({ smallText })} />
                </Field>
            </div>

            <h4 className="evi-rp-section">{t("section.buttons")}</h4>
            <div className="evi-rp-group">
                {[0, 1].map(i => {
                    const b = preset.buttons[i] ?? { label: "", url: "" };
                    return (
                        <React.Fragment key={i}>
                            <Field label={t("field.buttonLabel", { n: i + 1 })}>
                                <TextInput value={b.label} max={LIMITS.button} invalid={!!b.url && !b.label.trim()} onChange={label => setButton(i, { label })} />
                            </Field>
                            <Field label={t("field.buttonUrl", { n: i + 1 })}>
                                <TextInput value={b.url} type="url" max={LIMITS.url} placeholder="https://…" invalid={(!!b.label || !!b.url) && !httpsUrl(b.url)} onChange={url => setButton(i, { url })} />
                            </Field>
                        </React.Fragment>
                    );
                })}
                <p className="evi-rp-note" data-wide="">{t("field.buttons.hint")}</p>
            </div>

            <h4 className="evi-rp-section">{t("section.more")}</h4>
            <div className="evi-rp-group">
                <Field label={t("field.time")}>
                    <Select value={preset.timeMode} options={TIME_MODES} label={timeLabel} onChange={timeMode => set({ timeMode, time: timeMode === "start" || timeMode === "end" ? preset.time || Date.now() + (timeMode === "end" ? 3600_000 : 0) : preset.time })} />
                </Field>
                {(preset.timeMode === "start" || preset.timeMode === "end") && (
                    <Field label={t(preset.timeMode === "start" ? "field.timeStart" : "field.timeEnd")}>
                        <input className="evi-rp-input" type="datetime-local" value={toLocalInput(preset.time)} onChange={e => set({ time: fromLocalInput(e.currentTarget.value) })} />
                    </Field>
                )}
                <Field label={t("field.party")} hint={t("field.party.hint")}>
                    <span className="evi-rp-party">
                        <input className="evi-rp-input" type="number" min={0} max={LIMITS.party} value={preset.partySize || ""} aria-label={t("field.partySize")} onChange={e => set({ partySize: clampInt(e.currentTarget.value) })} />
                        <span className="evi-rp-of">{t("field.partyOf")}</span>
                        <input className="evi-rp-input" type="number" min={0} max={LIMITS.party} value={preset.partyMax || ""} aria-label={t("field.partyMax")} onChange={e => set({ partyMax: clampInt(e.currentTarget.value) })} />
                    </span>
                </Field>
            </div>
        </div>
    );
}

const clampInt = (v: string) => Math.min(LIMITS.party, Math.max(0, Math.floor(Number(v) || 0)));

/** Ticks once a second while mounted, for the preview's timer */
function useNow() {
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

/** Shaped like the activity card on Discord's profiles */
function Preview({ preset }: { preset: Preset; }) {
    const now = useNow();
    const large = httpsUrl(preset.largeImage), small = httpsUrl(preset.smallImage);
    const started = since.get(preset.id) ?? now;
    let timer = "";
    if (preset.timeMode === "elapsed") timer = t("preview.elapsed", { time: formatTimer(now - started) });
    else if (preset.timeMode === "localTime") timer = t("preview.elapsed", { time: formatTimer(now - startOfDay(now)) });
    else if (preset.timeMode === "start" && preset.time) timer = t("preview.elapsed", { time: formatTimer(now - preset.time) });
    else if (preset.timeMode === "end" && preset.time > now) timer = t("preview.left", { time: formatTimer(preset.time - now) });
    const party = preset.partyMax > 0 && preset.partySize >= 1 && preset.partySize <= preset.partyMax
        ? t("preview.party", { size: preset.partySize, max: preset.partyMax }) : "";
    const buttons = preset.buttons.filter(b => b.label.trim() && httpsUrl(b.url));

    return (
        <div className="evi-rp-card" aria-label={t("preview.title")}>
            <div className="evi-rp-card-head">{typeLabel(preset.type)}</div>
            <div className="evi-rp-card-body">
                {large && (
                    <span className="evi-rp-art">
                        <img src={large} alt="" title={preset.largeText || undefined} referrerPolicy="no-referrer" />
                        {small && <img className="evi-rp-art-small" src={small} alt="" title={preset.smallText || undefined} referrerPolicy="no-referrer" />}
                    </span>
                )}
                <span className="evi-rp-lines">
                    <span className="evi-rp-name">{preset.name.trim() || t("field.name.placeholder")}</span>
                    {preset.details.trim() && <span>{preset.details}</span>}
                    {(preset.state.trim() || party) && <span>{[preset.state.trim(), party].filter(Boolean).join(" ")}</span>}
                    {timer && <span className="evi-rp-timer">{timer}</span>}
                </span>
            </div>
            {buttons.length > 0 && (
                <div className="evi-rp-card-buttons">
                    {buttons.map((b, i) => <span key={i} className="evi-rp-card-button" title={httpsUrl(b.url)}>{b.label}</span>)}
                </div>
            )}
        </div>
    );
}

function Panel() {
    useLocale();
    const current = useState$();
    const [selected, setSelected] = React.useState<string>(() => current.active || current.presets[0]?.id || "");
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const app = appId();
    const preset = current.presets.find(p => p.id === selected) ?? current.presets[0];
    const issues = preset ? problems(preset, app) : [];
    const isShown = !!preset && current.active === preset.id;

    React.useEffect(() => setConfirmDelete(false), [preset?.id]);

    return (
        <section className="evi-rp-panel">
            <style>{CSS}</style>
            {!app && <p className="evi-rp-notice" role="note">{t("panel.noAppId")}</p>}
            {!ctx && <p className="evi-rp-notice" role="note">{t("panel.pluginOff")}</p>}

            <div className="evi-rp-presets" role="tablist" aria-label={t("panel.presets")}>
                {current.presets.map(p => (
                    <button
                        key={p.id}
                        type="button"
                        role="tab"
                        className="evi-rp-chip"
                        aria-selected={p.id === preset?.id}
                        onClick={() => setSelected(p.id)}
                    >
                        {current.active === p.id && <span className="evi-rp-live" aria-label={t("panel.showing")} />}
                        {p.title || p.name || t("panel.untitled")}
                    </button>
                ))}
                {current.presets.length < LIMITS.presets && (
                    <button type="button" className="evi-rp-chip evi-rp-chip-add" onClick={() => setSelected(addPreset() ?? selected)}>+ {t("panel.new")}</button>
                )}
            </div>

            {!preset
                ? <p className="evi-rp-empty">{t("panel.empty")}</p>
                : (
                    <div className="evi-rp-layout">
                        <Editor preset={preset} />
                        <aside className="evi-rp-side">
                            <Preview preset={preset} />
                            {issues.length > 0 && (
                                <ul className="evi-rp-problems">
                                    {issues.map(p => <li key={p}>{problemText(p)}</li>)}
                                </ul>
                            )}
                            <button
                                type="button"
                                className="evi-rp-button"
                                data-variant={isShown ? "secondary" : "primary"}
                                disabled={!isShown && issues.length > 0}
                                onClick={() => commit({ ...current, active: isShown ? "" : preset.id })}
                            >
                                {t(isShown ? "panel.hide" : "panel.show")}
                            </button>
                            <div className="evi-rp-row">
                                <button type="button" className="evi-rp-button" data-variant="secondary" disabled={current.presets.length >= LIMITS.presets} onClick={() => setSelected(addPreset(preset) ?? selected)}>{t("panel.duplicate")}</button>
                                <button
                                    type="button"
                                    className="evi-rp-button"
                                    data-variant="danger"
                                    onClick={() => {
                                        if (!confirmDelete) return setConfirmDelete(true);
                                        removePreset(preset.id);
                                        setSelected(state.presets[0]?.id ?? "");
                                    }}
                                >
                                    {t(confirmDelete ? "panel.deleteConfirm" : "panel.delete")}
                                </button>
                            </div>
                            <p className="evi-rp-note">{t("panel.whoSees")}</p>
                        </aside>
                    </div>
                )}
        </section>
    );
}

const CSS = `
.evi-rp-panel {
    --evi-rp-text: var(--text-default, var(--text-normal, #dbdee1));
    --evi-rp-muted: var(--text-muted, #949ba4);
    --evi-rp-input: var(--input-background, var(--background-tertiary, #1e1f22));
    --evi-rp-border: var(--border-subtle, rgba(255, 255, 255, 0.08));
    --evi-rp-brand: var(--brand-500, #5865f2);
    --evi-rp-card: var(--background-base-lower, var(--background-secondary, #2b2d31));
    display: flex; flex-direction: column; gap: 14px; margin-top: 16px; color: var(--evi-rp-text); font-size: 14px;
}
.evi-rp-notice {
    margin: 0; padding: 10px 12px; border-radius: 8px; line-height: 1.4;
    background: var(--info-help-background, rgba(88, 101, 242, 0.1)); border: 1px solid var(--info-help-border, rgba(88, 101, 242, 0.4));
}
.evi-rp-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.evi-rp-chip {
    display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--evi-rp-border); background: none; color: var(--evi-rp-text); font: inherit; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease;
}
.evi-rp-chip:hover { background: var(--background-mod-subtle, rgba(78, 80, 88, 0.3)); }
.evi-rp-chip[aria-selected="true"] { background: var(--background-mod-strong, rgba(78, 80, 88, 0.6)); border-color: transparent; font-weight: 600; }
.evi-rp-chip-add { color: var(--evi-rp-muted); border-style: dashed; }
.evi-rp-live { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--status-positive, #23a55a); }
.evi-rp-empty { margin: 0; color: var(--evi-rp-muted); }
.evi-rp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
@container (max-width: 640px) { .evi-rp-layout { grid-template-columns: 1fr; } }
@media (max-width: 1000px) { .evi-rp-layout { grid-template-columns: 1fr; } }
.evi-rp-editor { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.evi-rp-section { margin: 8px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: var(--evi-rp-muted); }
.evi-rp-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
.evi-rp-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.evi-rp-field[data-wide], .evi-rp-note[data-wide] { grid-column: 1 / -1; }
.evi-rp-label { font-size: 13px; font-weight: 500; }
.evi-rp-hint, .evi-rp-note { margin: 0; font-size: 12px; color: var(--evi-rp-muted); line-height: 1.35; }
.evi-rp-input {
    box-sizing: border-box; width: 100%; min-height: 36px; padding: 7px 10px; border-radius: 8px; border: 1px solid transparent;
    background: var(--evi-rp-input); color: inherit; font: inherit; outline: none; color-scheme: dark;
}
.evi-rp-input:focus-visible { border-color: var(--evi-rp-brand); }
.evi-rp-input[aria-invalid="true"] { border-color: var(--status-danger, #da373c); }
.evi-rp-input::placeholder { color: var(--evi-rp-muted); }
.evi-rp-select { cursor: pointer; }
.evi-rp-party { display: flex; align-items: center; gap: 8px; }
.evi-rp-party .evi-rp-input { width: 80px; }
.evi-rp-of { color: var(--evi-rp-muted); }
.evi-rp-side { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 16px; }
.evi-rp-card { border-radius: 12px; padding: 12px; background: var(--evi-rp-card); border: 1px solid var(--evi-rp-border); display: flex; flex-direction: column; gap: 10px; }
.evi-rp-card-head { font-size: 12px; font-weight: 600; color: var(--evi-rp-muted); }
.evi-rp-card-body { display: flex; gap: 12px; align-items: center; min-width: 0; }
.evi-rp-art { position: relative; flex: none; width: 64px; height: 64px; }
.evi-rp-art > img:first-child { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; display: block; }
.evi-rp-art-small {
    position: absolute; right: -4px; bottom: -4px; width: 22px; height: 22px; border-radius: 50%; object-fit: cover;
    border: 3px solid var(--evi-rp-card); background: var(--evi-rp-card);
}
.evi-rp-lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; }
.evi-rp-lines > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-rp-name { font-weight: 600; font-size: 14px; }
.evi-rp-timer { color: var(--text-positive, #23a55a); font-variant-numeric: tabular-nums; }
.evi-rp-card-buttons { display: flex; flex-direction: column; gap: 6px; }
.evi-rp-card-button {
    display: block; padding: 7px 10px; border-radius: 8px; text-align: center; font-weight: 500; font-size: 13px;
    background: var(--button-secondary-background, rgba(255, 255, 255, 0.08)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.evi-rp-problems { margin: 0; padding: 8px 12px 8px 26px; border-radius: 8px; font-size: 13px; line-height: 1.4; color: var(--text-feedback-warning, var(--text-warning, #f0b232)); background: var(--background-mod-subtle, rgba(78, 80, 88, 0.2)); }
.evi-rp-row { display: flex; gap: 8px; }
.evi-rp-row > * { flex: 1; }
.evi-rp-button {
    min-height: 36px; padding: 2px 14px; border: 0; border-radius: 8px; font: inherit; font-weight: 500; cursor: pointer;
    transition: background-color 120ms ease, opacity 120ms ease;
}
.evi-rp-button[data-variant="primary"] { background: var(--button-filled-brand-background, #5865f2); color: var(--white, #fff); }
.evi-rp-button[data-variant="primary"]:hover:not(:disabled) { background: var(--button-filled-brand-background-hover, #4752c4); }
.evi-rp-button[data-variant="secondary"] { background: var(--button-secondary-background, rgba(255, 255, 255, 0.08)); color: var(--evi-rp-text); }
.evi-rp-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--button-secondary-background-hover, rgba(255, 255, 255, 0.12)); }
.evi-rp-button[data-variant="danger"] { background: none; color: var(--text-feedback-critical, #f23f43); box-shadow: inset 0 0 0 1px currentColor; }
.evi-rp-button[data-variant="danger"]:hover { background: rgba(242, 63, 67, 0.1); }
.evi-rp-button:disabled { opacity: 0.5; cursor: default; }
.evi-rp-button:focus-visible, .evi-rp-chip:focus-visible { outline: 2px solid var(--evi-rp-brand); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .evi-rp-chip, .evi-rp-button { transition: none; } }
`;

// ---- Plugin -------------------------------------------------------------------------------------

export default definePlugin({
    settings,

    start(context) {
        ctx = context;
        panelCtx = undefined;
        load();
        context.settings.onChange(() => {
            warnedImages = false;
            scheduleApply();
        });
        // Back after a reconnect or once Discord's ready, in case the store was reset
        void apply();
        context.onDispose(() => {
            clearTimeout(applyTimer);
            applying++;
            clear();
            ctx = undefined;
        });
    },

    settingsPanel(context) {
        if (!ctx && panelCtx !== context) {
            panelCtx = context;
            load();
        }
        return <Panel />;
    },

    flux: {
        // A new gateway session starts from what the local stores hold; ours must still be there
        CONNECTION_OPEN() {
            if (shown) scheduleApply();
        },
    },

    /** For tests and debugging */
    getState: () => state,
    activityFor: (preset: Preset, app: string) => toActivity(preset, app, { since: Date.now(), now: Date.now() }, {}),
});
