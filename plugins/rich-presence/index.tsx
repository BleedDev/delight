import { definePlugin, Dispatcher, Dropdown, find, React, useLocale } from "@evi/api";
import type { PluginContext } from "@evi/api";
import type { ReactNode } from "react";

import {
    ACTIVITY_TYPES, ActivityKind, Button, EMPTY_STATE, formatTimer, fromLocalInput, httpsUrl, imageKeys, imageRef, imageUrls, isAppId, isStreamUrl,
    keySlot, LIMITS, newPreset, parseState, Preset, PresetState, Problem, problems, startOfDay, TIME_MODES, TimeMode, toActivity, toLocalInput,
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
 * Every activity belongs to a Discord application, and everyone brings their own: the settings show a
 * setup guide until there's an Application ID. Pictures resolve the way Discord's RPC server does it
 * for games: POST /applications/:id/external-assets { urls } turns each https link into an
 * `mp:external/…` key, and an art asset's key name becomes its id from the application's asset list
 * (GET /oauth2/applications/:id/assets). With no name, the activity takes the application's name.
 *
 * Presets live in this plugin's settings entry under a key the generated settings don't show.
 */

const SOCKET_ID = "evi-rich-presence";
const STORAGE_KEY = "presets";
/** The application the guide checked: { id, name, icon }, for its name and the panel's header */
const APP_KEY = "app";
const PORTAL_URL = "https://discord.com/developers/applications";
const APPLY_DELAY = 600;

type Settings = typeof settings;
const settings = {
    appId: {
        type: "string",
        get label() { return t("settings.appId"); },
        get description() { return t("settings.appId.description"); },
        placeholder: "123456789012345678",
        default: "",
    },
} as const;

let ctx: PluginContext<Settings> | undefined;
/** The settings panel can show while the plugin is off: it saves through its own context then */
let panelCtx: PluginContext<Settings> | undefined;
let state: PresetState = EMPTY_STATE;

type Storage = { get(key: string): unknown; set(key: string, value: unknown): void; };
const storage = () => (ctx ?? panelCtx)?.settings as unknown as Storage | undefined;
const appId = () => String((ctx ?? panelCtx)?.settings.get("appId") ?? "").trim();

interface AppInfo { id: string; name: string; icon: string | null; }

/** The checked application, if it's still the one in the setting */
function appInfo(): AppInfo | undefined {
    const v = storage()?.get(APP_KEY) as Partial<AppInfo> | undefined;
    return v && typeof v.id === "string" && v.id === appId() && typeof v.name === "string"
        ? { id: v.id, name: v.name, icon: typeof v.icon === "string" ? v.icon : null }
        : undefined;
}
const appName = () => appInfo()?.name ?? "";
const appIcon = (app: AppInfo) => app.icon ? `https://cdn.discordapp.com/app-icons/${app.id}/${app.icon}.png?size=64` : undefined;

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
const useState$ = () => React.useSyncExternalStore(subscribe, () => state);
const emit = () => { for (const fn of [...listeners]) fn(); };

function commit(next: PresetState) {
    if (next === state) return;
    state = next;
    storage()?.set(STORAGE_KEY, state);
    emit();
    scheduleApply();
}

function load() {
    state = parseState(storage()?.get(STORAGE_KEY));
    emit();
}

const activePreset = () => state.presets.find(p => p.id === state.active);

/**
 * Discord's API client: exactly { get, post, put, patch, del }. The HTTP library under it (superagent)
 * has those too, plus Request and getXHR: skipped.
 */
const http = (): any => find(v => typeof v?.post === "function" && typeof v?.del === "function"
    && typeof v?.patch === "function" && !("getXHR" in v) && !("Request" in v));

function client() {
    const c = http();
    if (!c) throw new Error("Discord's HTTP client wasn't found");
    return c;
}

/** https link -> mp: key, per application. Links Discord refused are remembered as "" */
const assetCache = new Map<string, string>();
const cacheKey = (app: string, url: string) => `${app} ${url}`;

/** An application's art assets, key name (lowercase) -> asset id */
const artCache = new Map<string, Map<string, string>>();

async function artAssets(app: string, refresh = false): Promise<Map<string, string>> {
    const cached = artCache.get(app);
    if (cached && !refresh) return cached;
    const res = await client().get({ url: `/oauth2/applications/${app}/assets`, oldFormErrors: true });
    const map = new Map<string, string>();
    if (Array.isArray(res?.body)) {
        for (const a of res.body) if (typeof a?.name === "string" && typeof a?.id === "string") map.set(a.name.toLowerCase(), a.id);
    }
    artCache.set(app, map);
    return map;
}

async function resolveAssets(app: string, urls: string[], keys: string[] = []): Promise<Record<string, string>> {
    const missing = urls.filter(u => !assetCache.has(cacheKey(app, u)));
    if (missing.length) {
        const res = await client().post({ url: `/applications/${app}/external-assets`, body: { urls: missing }, oldFormErrors: true });
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
    if (keys.length) {
        // A key we don't know yet may have just been uploaded: ask once more, as Discord does
        let art = await artAssets(app);
        if (keys.some(k => !art.has(k.toLowerCase()))) art = await artAssets(app, true);
        for (const k of keys) {
            const id = art.get(k.toLowerCase());
            if (id) out[keySlot(k)] = id;
        }
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
    const name = appName();
    if (!ctx || !preset || problems(preset, app, name).length) return clear();
    const now = Date.now();
    if (!since.has(preset.id)) since.set(preset.id, now);
    let assets: Record<string, string> = {};
    try {
        assets = await resolveAssets(app, imageUrls(preset), imageKeys(preset));
    } catch (err) {
        ctx?.logger.warn("Couldn't turn the pictures into Discord assets", err);
        if (!warnedImages) {
            warnedImages = true;
            ctx?.toast(t("toast.imagesFailed"), { type: "failure" });
        }
    }
    // A newer edit started while the pictures were on their way: that one decides
    if (run !== applying || !ctx) return;
    dispatch(toActivity(preset, app, { since: since.get(preset.id)!, now }, assets, name));
}

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

function Select<V extends string>({ value, options, onChange, label, name }: { value: V; options: readonly V[]; onChange(v: V): void; label(v: V): string; name: string; }) {
    return <Dropdown className="evi-rp-select" label={name} value={value} onChange={onChange} options={options.map(o => ({ value: o, label: label(o) }))} />;
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
    const badImage = (v: string) => !!v.trim() && !imageRef(v);
    const name = appName();

    return (
        <div className="evi-rp-editor">
            <div className="evi-rp-group">
                <Field label={t("field.title")} hint={t("field.title.hint")}>
                    <TextInput value={preset.title} max={60} onChange={title => set({ title })} />
                </Field>
                <Field label={t("field.type")}>
                    <Select name={t("field.type")} value={preset.type} options={ACTIVITY_TYPES} label={typeLabel} onChange={type => set({ type })} />
                </Field>
            </div>

            <h4 className="evi-rp-section">{t("section.text")}</h4>
            <div className="evi-rp-group">
                <Field label={t("field.name")} hint={name ? t("field.name.hintApp", { name }) : undefined} wide>
                    <TextInput value={preset.name} placeholder={name || t("field.name.placeholder")} invalid={!preset.name.trim() && !name} onChange={name => set({ name })} />
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
                    <TextInput value={preset.largeImage} max={LIMITS.url} placeholder="https://…/picture.png" invalid={badImage(preset.largeImage)} onChange={largeImage => set({ largeImage })} />
                </Field>
                <Field label={t("field.largeText")}>
                    <TextInput value={preset.largeText} onChange={largeText => set({ largeText })} />
                </Field>
                <Field label={t("field.smallImage")}>
                    <TextInput value={preset.smallImage} max={LIMITS.url} placeholder="https://…/icon.png" invalid={badImage(preset.smallImage)} onChange={smallImage => set({ smallImage })} />
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
                    <Select name={t("field.time")} value={preset.timeMode} options={TIME_MODES} label={timeLabel} onChange={timeMode => set({ timeMode, time: timeMode === "start" || timeMode === "end" ? preset.time || Date.now() + (timeMode === "end" ? 3600_000 : 0) : preset.time })} />
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

/** What the preview shows for a picture: the link itself, or an art asset from Discord's CDN */
function pictureSrc(value: string, app: string, art: Map<string, string> | undefined) {
    const ref = imageRef(value);
    if (!ref) return undefined;
    if (ref.kind === "url") return ref.url;
    const id = art?.get(ref.key.toLowerCase());
    return id ? `https://cdn.discordapp.com/app-assets/${app}/${id}.png` : undefined;
}

/** Shaped like the activity card on Discord's profiles */
function Preview({ preset, art }: { preset: Preset; art?: Map<string, string>; }) {
    const now = useNow();
    const app = appId();
    const large = pictureSrc(preset.largeImage, app, art), small = pictureSrc(preset.smallImage, app, art);
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
                    <span className="evi-rp-name">{preset.name.trim() || appName() || t("field.name.placeholder")}</span>
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

/** Discord's public info about an application: what GET /applications/:id/rpc gives anyone */
async function checkApp(id: string): Promise<AppInfo> {
    const res = await client().get({ url: `/applications/${id}/rpc`, oldFormErrors: true });
    const body = res?.body;
    if (typeof body?.id !== "string" || typeof body?.name !== "string") throw new Error("Unexpected answer from Discord");
    return { id: body.id, name: body.name, icon: typeof body.icon === "string" ? body.icon : null };
}

type Check =
    | { kind: "idle"; }
    | { kind: "checking"; }
    | { kind: "ok"; app: AppInfo; }
    | { kind: "error"; text: string; };

function Step({ n, title, children }: { n: number; title: string; children: ReactNode; }) {
    return (
        <li className="evi-rp-step">
            <span className="evi-rp-step-n" aria-hidden="true">{n}</span>
            <div className="evi-rp-step-body">
                <h4 className="evi-rp-step-title">{title}</h4>
                {children}
            </div>
        </li>
    );
}

function Guide({ onDone }: { onDone(): void; }) {
    const [value, setValue] = React.useState(() => appId());
    const [check, setCheck] = React.useState<Check>(() => {
        const info = appInfo();
        return info ? { kind: "ok", app: info } : { kind: "idle" };
    });

    async function run() {
        const id = value.trim();
        if (!isAppId(id)) return setCheck({ kind: "error", text: t("guide.step4.invalid") });
        setCheck({ kind: "checking" });
        try {
            const app = await checkApp(id);
            const store = storage();
            store?.set("appId", app.id);
            store?.set(APP_KEY, app);
            setCheck({ kind: "ok", app });
        } catch (err: any) {
            const status = err?.status ?? err?.statusCode;
            if (status === 404 || status === 400) return setCheck({ kind: "error", text: t("guide.step4.notFound") });
            const message = err?.body?.message ?? err?.message ?? String(err);
            setCheck({ kind: "error", text: t("guide.step4.failed", { error: message }) });
        }
    }

    const ok = check.kind === "ok" && check.app.id === value.trim();

    return (
        <div className="evi-rp-guide">
            <header className="evi-rp-guide-head">
                <h3 className="evi-rp-guide-title">{t("guide.title")}</h3>
                <p className="evi-rp-guide-intro">{t("guide.intro")}</p>
            </header>
            <ol className="evi-rp-steps">
                <Step n={1} title={t("guide.step1.title")}>
                    <p>{t("guide.step1.body")}</p>
                    <button type="button" className="evi-rp-button" data-variant="secondary" onClick={() => window.open(PORTAL_URL, "_blank", "noopener,noreferrer")}>
                        {t("guide.step1.button")} ↗
                    </button>
                </Step>
                <Step n={2} title={t("guide.step2.title")}>
                    <p>{t("guide.step2.body")}</p>
                </Step>
                <Step n={3} title={t("guide.step3.title")}>
                    <p>{t("guide.step3.body")}</p>
                    {/* What to look for on the portal's General Information page */}
                    <div className="evi-rp-mock" aria-hidden="true">
                        <span className="evi-rp-mock-label">APPLICATION ID</span>
                        <span className="evi-rp-mock-row">
                            <code>123456789012345678</code>
                            <span className="evi-rp-mock-copy">Copy</span>
                        </span>
                    </div>
                </Step>
                <Step n={4} title={t("guide.step4.title")}>
                    <form className="evi-rp-check" onSubmit={e => { e.preventDefault(); void run(); }}>
                        <input
                            className="evi-rp-input"
                            value={value}
                            inputMode="numeric"
                            spellCheck={false}
                            placeholder={t("guide.step4.placeholder")}
                            aria-label={t("guide.step4.title")}
                            aria-invalid={check.kind === "error" || undefined}
                            onChange={e => {
                                setValue(e.currentTarget.value.replace(/\s+/g, ""));
                                if (check.kind === "error") setCheck({ kind: "idle" });
                            }}
                        />
                        <button type="submit" className="evi-rp-button" data-variant="primary" disabled={!value.trim() || check.kind === "checking"}>
                            {t(check.kind === "checking" ? "guide.step4.checking" : "guide.step4.check")}
                        </button>
                    </form>
                    {check.kind === "error" && <p className="evi-rp-check-error" role="alert">{check.text}</p>}
                    {ok && check.kind === "ok" && (
                        <p className="evi-rp-check-ok" role="status">
                            {appIcon(check.app)
                                ? <img className="evi-rp-app-icon" src={appIcon(check.app)} alt="" />
                                : <span className="evi-rp-app-icon" aria-hidden="true">{check.app.name.slice(0, 1)}</span>}
                            {t("guide.step4.ok", { name: check.app.name })}
                        </p>
                    )}
                </Step>
                <Step n={5} title={t("guide.step5.title")}>
                    <p>{t("guide.step5.body")}</p>
                </Step>
            </ol>
            <div className="evi-rp-guide-foot">
                <button type="button" className="evi-rp-button" data-variant="primary" disabled={!ok} onClick={onDone}>{t("guide.done")}</button>
            </div>
        </div>
    );
}

function Panel() {
    useLocale();
    const current = useState$();
    const [selected, setSelected] = React.useState<string>(() => current.active || current.presets[0]?.id || "");
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [guide, setGuide] = React.useState(false);
    const [, refresh] = React.useReducer((n: number) => n + 1, 0);
    const [art, setArt] = React.useState<Map<string, string>>();
    const app = appId();
    const info = appInfo();
    const preset = current.presets.find(p => p.id === selected) ?? current.presets[0];
    const issues = preset ? problems(preset, app, info?.name ?? "") : [];
    const isShown = !!preset && current.active === preset.id;
    const usesKeys = !!preset && imageKeys(preset).length > 0;

    React.useEffect(() => setConfirmDelete(false), [preset?.id]);
    // Art asset keys show in the preview once we know their ids
    React.useEffect(() => {
        if (!usesKeys || !isAppId(app)) return;
        let live = true;
        artAssets(app, true).then(map => live && setArt(map), () => { });
        return () => void (live = false);
    }, [app, usesKeys, preset?.largeImage, preset?.smallImage]);

    if (guide || !isAppId(app)) {
        return (
            <section className="evi-rp-panel">
                <style>{CSS}</style>
                <Guide onDone={() => { setGuide(false); refresh(); }} />
            </section>
        );
    }

    return (
        <section className="evi-rp-panel">
            <style>{CSS}</style>
            {!ctx && <p className="evi-rp-notice" role="note">{t("panel.pluginOff")}</p>}
            <div className="evi-rp-app">
                {info && appIcon(info) ? <img className="evi-rp-app-icon" src={appIcon(info)} alt="" /> : <span className="evi-rp-app-icon" aria-hidden="true">{(info?.name ?? "?").slice(0, 1)}</span>}
                <span className="evi-rp-app-name">{info?.name ?? app}</span>
                <button type="button" className="evi-rp-link" onClick={() => setGuide(true)}>{t("guide.change")}</button>
                <button type="button" className="evi-rp-link" onClick={() => setGuide(true)}>{t("guide.reopen")}</button>
            </div>

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
                            <Preview preset={preset} art={art} />
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
.evi-rp-app { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.evi-rp-app-name { font-weight: 600; color: var(--header-primary, var(--text-strong, #f2f3f5)); margin-inline-end: auto; }
.evi-rp-app-icon {
    flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px;
    background: var(--evi-rp-brand); color: #fff; font-weight: 700; font-size: 14px; object-fit: cover;
}
.evi-rp-link {
    border: 0; padding: 0; background: none; font: inherit; font-size: 13px; color: var(--text-link, #00a8fc); cursor: pointer;
}
.evi-rp-link:hover { text-decoration: underline; }
.evi-rp-guide { display: flex; flex-direction: column; gap: 18px; max-width: 640px; }
.evi-rp-guide-head { display: flex; flex-direction: column; gap: 6px; }
.evi-rp-guide-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--header-primary, var(--text-strong, #f2f3f5)); }
.evi-rp-guide-intro { margin: 0; color: var(--evi-rp-muted); line-height: 1.45; }
.evi-rp-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
.evi-rp-step { position: relative; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 14px; padding-bottom: 20px; }
/* The line joining one step's number to the next */
.evi-rp-step:not(:last-child)::before {
    content: ""; position: absolute; left: 15px; top: 34px; bottom: 2px; width: 2px; border-radius: 1px; background: var(--evi-rp-border);
}
.evi-rp-step-n {
    display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%;
    background: var(--background-mod-strong, rgba(78, 80, 88, 0.6)); color: var(--header-primary, #f2f3f5); font-weight: 700; font-size: 14px;
}
.evi-rp-step-body { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding-top: 5px; min-width: 0; }
.evi-rp-step-body p { margin: 0; line-height: 1.45; color: var(--evi-rp-text); }
.evi-rp-step-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--header-primary, var(--text-strong, #f2f3f5)); }
.evi-rp-mock {
    display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 8px;
    background: var(--evi-rp-input); border: 1px solid var(--evi-rp-border);
}
.evi-rp-mock-label { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: var(--evi-rp-muted); }
.evi-rp-mock-row { display: flex; align-items: center; gap: 12px; }
.evi-rp-mock-row code { font-family: var(--font-code, monospace); font-size: 13px; }
.evi-rp-mock-copy {
    padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #fff; background: var(--evi-rp-brand);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--evi-rp-brand) 35%, transparent);
}
.evi-rp-check { display: flex; gap: 8px; width: 100%; max-width: 440px; }
.evi-rp-check .evi-rp-input { flex: 1; min-width: 0; font-family: var(--font-code, monospace); }
.evi-rp-check-error { color: var(--text-feedback-critical, #f23f43) !important; font-size: 13px; }
.evi-rp-check-ok { display: flex; align-items: center; gap: 8px; color: var(--text-feedback-positive, #23a55a) !important; font-weight: 600; }
.evi-rp-guide-foot { display: flex; justify-content: flex-start; padding-left: 46px; }
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
    activityFor: (preset: Preset, app: string, name = "") => toActivity(preset, app, { since: Date.now(), now: Date.now() }, {}, name),
});
