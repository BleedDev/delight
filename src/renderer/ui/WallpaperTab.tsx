import type { EviKey } from "@shared/locales";
import {
    BLUR_MAX, BLUR_MIN, buildMediaCss, canMove, DIM_MAX, DIM_MIN, fitsFor, NATURAL_WIDTH_VAR, normalizeWallpaper, PANEL_DEFAULTS, PANEL_MAX, PANEL_MIN,
    WALLPAPER_DEFAULTS, WallpaperFit, WallpaperPanel, WallpaperSettings, WallpaperTint, ZOOM_MAX, ZOOM_MIN,
} from "@shared/wallpaper";

import { t } from "../i18n";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { Wallpaper } from "../wallpaper";
import { React } from "../webpack/common";
import { Button, Dropdown, EmptyState, FilterChips, Notice, Section, Status, SwitchRow, Text, useStore } from "./components";
import { DiscordUI } from "./discord";
import { Icon } from "./icons";

const change = (patch: Partial<WallpaperSettings>) => Settings.update(d => {
    d.wallpaper = { ...normalizeWallpaper(d.wallpaper), ...patch };
});

const changePanels = (patch: Partial<WallpaperSettings["panels"]>) => Settings.update(d => {
    const w = normalizeWallpaper(d.wallpaper);
    d.wallpaper = { ...w, panels: { ...w.panels, ...patch } };
});

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The window's shape, so the preview is Discord in miniature */
function useWindowAspect() {
    const read = () => Math.min(2.4, Math.max(1.2, window.innerWidth / Math.max(1, window.innerHeight)));
    const [aspect, setAspect] = React.useState(read);
    React.useEffect(() => {
        const onResize = () => setAspect(read());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return aspect;
}

/**
 * A labelled slider: Discord's when it's there, otherwise a native range input. `resetKey` restarts
 * Discord's, which only reads its value when it mounts.
 */
function RangeField({ id, label, description, value, min, max, step = 1, unit = "%", markers, resetKey, onChange }: {
    id: string;
    label: string;
    description?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    /** Where the ticks go; quarters by default */
    markers?: number[];
    resetKey?: unknown;
    onChange(value: number): void;
}) {
    const Slider = DiscordUI.Slider.get;
    const labelId = `${id}-label`;
    const render = (v: number) => `${Math.round(v / step) * step}${unit}`;
    const quarter = (max - min) / 4;
    return (
        <div className="dl-field dl-wp-range">
            <Text variant="text-md/medium" color="text-strong" id={labelId}>{label}</Text>
            {description && <Text tag="p" variant="text-sm/normal" color="text-subtle">{description}</Text>}
            {Slider ? (
                <div aria-labelledby={labelId} role="group">
                    <Slider
                        key={String(resetKey)}
                        initialValue={value}
                        minValue={min}
                        maxValue={max}
                        markers={markers ?? [0, 1, 2, 3, 4].map(i => min + i * quarter)}
                        keyboardStep={step}
                        onValueChange={v => onChange(Math.round(v / step) * step)}
                        onMarkerRender={render}
                        onValueRender={render}
                    />
                </div>
            ) : (
                <input type="range" className="dl-wp-native-range" aria-labelledby={labelId} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.currentTarget.value))} />
            )}
        </div>
    );
}

// ---- The editor: Discord in miniature, with the wallpaper behind it ------------------------------

/** Discord's widths, px: the server list, the channel list and the member list */
const RAIL = 72;
const SIDEBAR = 240;
const TITLE = 32;

/** A panel colour as the wallpaper paints it: the saved theme colour (or black/white) at `percent` */
function panelColor(v: string, percent: number, tint: WallpaperTint) {
    if (tint === "neutral") return `rgb(var(--dl-wp-neutral) / ${percent / 100})`;
    return `color-mix(in srgb, var(--evi-wp${v.slice(1)}, var(${v})) ${percent}%, transparent)`;
}

interface Natural { width: number; height: number; }

/**
 * How far the picture moves per pixel dragged, in % of x or y. Its left edge sits at
 * x% × (box − zoom × content): dragging by d moves x by d / (box − zoom × content).
 */
function dragRatio(w: WallpaperSettings, box: { width: number; height: number; }, natural: Natural | undefined, scale: number) {
    const zoom = w.zoom / 100;
    const nw = natural?.width || box.width;
    const nh = natural?.height || box.height;
    let cw: number, ch: number, z = zoom;
    if (w.fit === "tile" || w.fit === "center") {
        cw = nw * zoom * scale;
        ch = nh * zoom * scale;
        z = 1;
    } else if (w.fit === "stretch") {
        cw = box.width;
        ch = box.height;
    } else {
        const s = (w.fit === "fill" ? Math.max : Math.min)(box.width / nw, box.height / nh);
        cw = nw * s;
        ch = nh * s;
    }
    const room = (b: number, c: number) => {
        const r = b - z * c;
        return Math.abs(r) < 1 ? 0 : 100 / r;
    };
    return { x: room(box.width, cw), y: room(box.height, ch) };
}

function Editor({ w, url, kind, naturalWidth, resetKey }: { w: WallpaperSettings; url: string; kind: "image" | "video"; naturalWidth?: number; resetKey: number; }) {
    const aspect = useWindowAspect();
    const boxRef = React.useRef<HTMLDivElement>(null);
    const [boxWidth, setBoxWidth] = React.useState(0);
    const [natural, setNatural] = React.useState<Natural>();
    const [dragging, setDragging] = React.useState(false);
    const drag = React.useRef<{ id: number; x: number; y: number; start: WallpaperSettings; } | null>(null);
    // The latest settings for the wheel listener, which is attached once
    const latest = React.useRef(w);
    latest.current = w;
    // Zoom changed from outside the slider (wheel, keys, double-click): the slider starts over at it
    const [zoomKey, setZoomKey] = React.useState(0);
    const zoomTo = (zoom: number, extra: Partial<WallpaperSettings> = {}) => {
        change({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX), ...extra });
        setZoomKey(k => k + 1);
    };
    const zoomRef = React.useRef(zoomTo);
    zoomRef.current = zoomTo;

    React.useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setBoxWidth(el.clientWidth));
        observer.observe(el);
        setBoxWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);

    const scale = boxWidth ? boxWidth / window.innerWidth : 0.25;
    const box = { width: boxWidth || 1, height: (boxWidth || 1) / aspect };
    const movable = canMove(w);

    // Scrolling zooms, like Discord's image cropper
    React.useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomRef.current(latest.current.zoom + (e.deltaY < 0 ? 10 : -10));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: w };
        setDragging(true);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const ratio = dragRatio(d.start, box, natural, scale);
        change({
            x: clamp(Math.round(d.start.x + (e.clientX - d.x) * ratio.x), 0, 100),
            y: clamp(Math.round(d.start.y + (e.clientY - d.y) * ratio.y), 0, 100),
        });
    };
    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 10 : 2;
        // Arrows move the picture the way it looks like it moves
        const ratio = dragRatio(w, box, natural, scale);
        const nudge = (axis: "x" | "y", dir: number) => {
            const sign = Math.sign(ratio[axis]) || 1;
            change({ [axis]: clamp(w[axis] + dir * step * sign, 0, 100) });
        };
        const keys: Record<string, () => void> = {
            ArrowLeft: () => nudge("x", -1),
            ArrowRight: () => nudge("x", 1),
            ArrowUp: () => nudge("y", -1),
            ArrowDown: () => nudge("y", 1),
            "+": () => zoomTo(w.zoom + 10),
            "=": () => zoomTo(w.zoom + 10),
            "-": () => zoomTo(w.zoom - 10),
            "0": () => zoomTo(100, { x: 50, y: 50 }),
        };
        const run = keys[e.key];
        if (!run) return;
        e.preventDefault();
        run();
    };

    const scope = ".dl-wp-stage";
    const css = buildMediaCss(scope, w, scale);
    const pct = (px: number) => `${(px / window.innerWidth) * 100}%`;
    const panel = (p: WallpaperPanel, v: string) => ({ background: panelColor(v, w.panels[p], w.tint) });

    return (
        <div className="dl-wp-editor">
            <style>{css}</style>
            <div
                ref={boxRef}
                className="dl-wp-stage"
                data-dragging={dragging || undefined}
                data-movable={movable || undefined}
                style={{ aspectRatio: String(aspect), [NATURAL_WIDTH_VAR as string]: `${naturalWidth ?? natural?.width ?? 512}px` }}
                tabIndex={0}
                role="group"
                aria-label={t("wallpaper.editorLabel")}
                aria-describedby="dl-wp-editor-hint"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={() => zoomTo(100, { x: 50, y: 50 })}
                onKeyDown={onKeyDown}
            >
                {kind === "image" && <img className="evi-wallpaper-backdrop" src={url} alt="" draggable={false} />}
                {kind === "video"
                    ? <video className="evi-wallpaper-media" src={url} muted loop autoPlay playsInline onLoadedMetadata={e => setNatural({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} />
                    : <img className="evi-wallpaper-media" src={url} alt="" draggable={false} onLoad={e => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />}
                {kind === "image" && <div className="evi-wallpaper-tile" style={{ backgroundImage: `url("${url}")` }} />}
                <div className="dl-wp-stage-dim" style={{ opacity: w.dim / 100 }} />
                {/* Discord's layout at the panel settings: what stays readable, and where the wallpaper shows */}
                <div className="dl-wp-mock" aria-hidden="true">
                    <div className="dl-wp-mock-title" style={{ blockSize: `${(TITLE / (window.innerWidth / aspect)) * 100}%`, ...panel("frame", "--app-frame-background") }} />
                    <div className="dl-wp-mock-body">
                        <div className="dl-wp-mock-rail" style={{ inlineSize: pct(RAIL), ...panel("frame", "--background-base-lowest") }}>
                            {[0, 1, 2, 3].map(i => <span key={i} />)}
                        </div>
                        <div className="dl-wp-mock-sidebar" style={{ inlineSize: pct(SIDEBAR), ...panel("sidebars", "--background-base-low") }}>
                            {[70, 55, 62, 48, 58].map((width, i) => <span key={i} style={{ inlineSize: `${width}%` }} />)}
                        </div>
                        <div className="dl-wp-mock-chat" style={panel("chat", "--background-base-lower")}>
                            <div className="dl-wp-mock-messages">
                                {[62, 40, 75, 52].map((width, i) => <span key={i} style={{ inlineSize: `${width}%` }} />)}
                            </div>
                            <div className="dl-wp-mock-input" style={panel("input", "--channeltextarea-background")} />
                        </div>
                        <div className="dl-wp-mock-sidebar" style={{ inlineSize: pct(SIDEBAR), ...panel("sidebars", "--background-base-low") }}>
                            {[50, 64, 44].map((width, i) => <span key={i} style={{ inlineSize: `${width}%` }} />)}
                        </div>
                    </div>
                </div>
            </div>
            <Text tag="p" variant="text-xs/normal" color="text-muted" id="dl-wp-editor-hint">
                {t(movable ? "wallpaper.editorHint" : "wallpaper.editorHintZoom")}
            </Text>
            <div className="dl-wp-zoom">
                <span className="dl-wp-zoom-icon" aria-hidden="true"><Icon name="image" size={16} /></span>
                <div className="dl-grow">
                    <RangeField id="dl-wp-zoom" label={t("wallpaper.zoom")} value={w.zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={5} resetKey={`${zoomKey}-${resetKey}`} onChange={zoom => change({ zoom })} />
                </div>
                <span className="dl-wp-zoom-icon" aria-hidden="true"><Icon name="image" size={24} /></span>
            </div>
        </div>
    );
}

// ---- The tab --------------------------------------------------------------------------------------

const FIT_LABELS: Record<WallpaperFit, EviKey> = {
    fill: "wallpaper.fit.fill",
    fit: "wallpaper.fit.fit",
    stretch: "wallpaper.fit.stretch",
    center: "wallpaper.fit.center",
    tile: "wallpaper.fit.tile",
};

const PANEL_ROWS: [WallpaperPanel, EviKey, EviKey][] = [
    ["frame", "wallpaper.panel.frame", "wallpaper.panel.frameHint"],
    ["sidebars", "wallpaper.panel.sidebars", "wallpaper.panel.sidebarsHint"],
    ["chat", "wallpaper.panel.chat", "wallpaper.panel.chatHint"],
    ["input", "wallpaper.panel.input", "wallpaper.panel.inputHint"],
];

export function WallpaperTab() {
    const w = normalizeWallpaper(useStore(Settings.subscribe, () => Settings.data).wallpaper);
    const state = useStore(Wallpaper.subscribe, Wallpaper.getSnapshot);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    // Bumped by the reset buttons: Discord's sliders only read their value when they mount
    const [resets, setResets] = React.useState(0);

    // Keeps the file loaded for the preview while the wallpaper itself is off
    React.useEffect(() => Wallpaper.watchPreview(), []);

    const run = (task: () => Promise<void>) => async () => {
        if (busy) return;
        setBusy(true);
        setError(undefined);
        try {
            await task();
        } catch (err) {
            setError(String((err as Error)?.message ?? err));
        } finally {
            setBusy(false);
        }
    };

    const pick = run(async () => {
        const result = await Wallpaper.pick();
        if (!result.ok && !result.canceled) setError(result.error);
    });
    const remove = run(() => Wallpaper.remove());

    const resetLook = () => {
        change({ fit: WALLPAPER_DEFAULTS.fit, zoom: 100, x: 50, y: 50, dim: WALLPAPER_DEFAULTS.dim, blur: WALLPAPER_DEFAULTS.blur });
        setResets(n => n + 1);
    };
    const resetPanels = () => {
        change({ panels: PANEL_DEFAULTS, tint: WALLPAPER_DEFAULTS.tint, behindSettings: false, behindPopouts: false });
        setResets(n => n + 1);
    };

    const chooseButton = (
        <Button variant={w.file ? "secondary" : "accent"} icon="image" onClick={pick} disabled={busy}>
            {t(w.file ? "wallpaper.chooseAnother" : "wallpaper.choose")}
        </Button>
    );

    let status: React.ReactNode = null;
    if (state.status === "error") status = <Status tone="danger">{state.error}</Status>;
    else if (state.status === "loading") status = <Status tone="muted">{t("wallpaper.loading")}</Status>;
    else if (state.paused) status = <Status tone="muted">{t(state.onBattery && w.pauseOnBattery ? "wallpaper.pausedBattery" : "wallpaper.pausedMotion")}</Status>;
    else if (state.status === "shown") status = <Status tone="success" quiet>{t("wallpaper.showing")}</Status>;

    return (
        <div className="dl-tab dl-wallpaper">
            {SafeMode.active && <Notice tone="warning">{t("wallpaper.safeMode")}</Notice>}
            <Section id="dl-wallpaper" title={t("wallpaper.title")} description={t("wallpaper.hint")} action={chooseButton}>
                <div className="dl-add-status" role="status">{error && <Status tone="danger">{error}</Status>}</div>
                {w.file && w.kind ? (
                    <article className="dl-card" aria-labelledby="dl-wallpaper-current">
                        <div className="dl-card-body dl-wp-card">
                            <div className="dl-wp-card-head">
                                <div className="dl-grow dl-row-text">
                                    <Text tag="h3" variant="text-md/semibold" color="text-strong" id="dl-wallpaper-current">
                                        {t(w.kind === "video" ? "wallpaper.currentVideo" : "wallpaper.currentImage")}
                                    </Text>
                                    <span role="status">{status}</span>
                                </div>
                                <Button variant="danger" icon="trash" onClick={remove} disabled={busy}>{t("wallpaper.remove")}</Button>
                            </div>
                            {state.url && state.kind
                                ? <Editor w={w} url={state.url} kind={state.kind} naturalWidth={state.naturalWidth} resetKey={resets} />
                                : <div className="dl-wp-stage dl-wp-stage-empty" />}
                        </div>
                    </article>
                ) : (
                    <EmptyState icon="image" title={t("wallpaper.emptyTitle")}>{t("wallpaper.emptyBody")}</EmptyState>
                )}
            </Section>

            {w.file && (
                <>
                    <Section>
                        <SwitchRow id="dl-wallpaper-enabled" label={t("wallpaper.show")} description={t("wallpaper.showHint")} checked={w.enabled} onChange={enabled => change({ enabled })} />
                        {w.kind === "video" && (
                            <SwitchRow
                                id="dl-wallpaper-battery"
                                label={t("wallpaper.pauseOnBattery")}
                                description={t("wallpaper.pauseOnBatteryHint")}
                                checked={w.pauseOnBattery}
                                onChange={pauseOnBattery => change({ pauseOnBattery })}
                            />
                        )}
                    </Section>

                    <Section
                        id="dl-wallpaper-look"
                        title={t("wallpaper.lookTitle")}
                        description={t("wallpaper.lookHint")}
                        action={<Button icon="refresh" onClick={resetLook}>{t("wallpaper.resetLook")}</Button>}
                    >
                        <div className="dl-field">
                            <Text variant="text-md/medium" color="text-strong">{t("wallpaper.fit")}</Text>
                            <Text tag="p" variant="text-sm/normal" color="text-subtle">{t(w.kind === "video" ? "wallpaper.fitHintVideo" : "wallpaper.fitHint")}</Text>
                            <FilterChips
                                label={t("wallpaper.fit")}
                                options={fitsFor(w.kind).map(id => ({ id, label: t(FIT_LABELS[id]) }))}
                                value={w.fit}
                                onChange={fit => change({ fit })}
                            />
                        </div>
                        <RangeField id="dl-wallpaper-dim" label={t("wallpaper.dim")} description={t("wallpaper.dimHint")} value={w.dim} min={DIM_MIN} max={DIM_MAX} step={5} markers={[0, 15, 30, 45, 60, 75, 90]} resetKey={resets} onChange={dim => change({ dim })} />
                        <RangeField id="dl-wallpaper-blur" label={t("wallpaper.blur")} description={t("wallpaper.blurHint")} value={w.blur} min={BLUR_MIN} max={BLUR_MAX} unit="px" resetKey={resets} onChange={blur => change({ blur })} />
                    </Section>

                    <Section
                        id="dl-wallpaper-panels"
                        title={t("wallpaper.panelsTitle")}
                        description={t("wallpaper.panelsHint")}
                        action={<Button icon="refresh" onClick={resetPanels}>{t("wallpaper.resetPanels")}</Button>}
                    >
                        {PANEL_ROWS.map(([panel, label, hint]) => (
                            <RangeField
                                key={panel}
                                id={`dl-wallpaper-panel-${panel}`}
                                label={t(label)}
                                description={t(hint)}
                                value={w.panels[panel]}
                                min={PANEL_MIN}
                                max={PANEL_MAX}
                                step={5}
                                resetKey={resets}
                                onChange={value => changePanels({ [panel]: value })}
                            />
                        ))}
                        <div className="dl-field">
                            <Text variant="text-md/medium" color="text-strong" id="dl-wallpaper-tint-label">{t("wallpaper.tint")}</Text>
                            <Text tag="p" variant="text-sm/normal" color="text-subtle">{t("wallpaper.tintHint")}</Text>
                            <Dropdown<WallpaperTint>
                                id="dl-wallpaper-tint"
                                labelledBy="dl-wallpaper-tint-label"
                                label={t("wallpaper.tint")}
                                options={[{ value: "theme", label: t("wallpaper.tint.theme") }, { value: "neutral", label: t("wallpaper.tint.neutral") }]}
                                value={w.tint}
                                onChange={tint => change({ tint })}
                            />
                        </div>
                        <SwitchRow id="dl-wallpaper-settings" label={t("wallpaper.behindSettings")} description={t("wallpaper.behindSettingsHint")} checked={w.behindSettings} onChange={behindSettings => change({ behindSettings })} />
                        <SwitchRow id="dl-wallpaper-popouts" label={t("wallpaper.behindPopouts")} description={t("wallpaper.behindPopoutsHint")} checked={w.behindPopouts} onChange={behindPopouts => change({ behindPopouts })} />
                        {w.behindPopouts && (
                            <RangeField
                                id="dl-wallpaper-panel-popouts"
                                label={t("wallpaper.panel.popouts")}
                                description={t("wallpaper.panel.popoutsHint")}
                                value={w.panels.popouts}
                                min={PANEL_MIN}
                                max={PANEL_MAX}
                                step={5}
                                resetKey={resets}
                                onChange={popouts => changePanels({ popouts })}
                            />
                        )}
                    </Section>
                </>
            )}
        </div>
    );
}
