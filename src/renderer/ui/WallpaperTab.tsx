import type { EviKey } from "@shared/locales";
import {
    BLUR_MAX, BLUR_MIN, DIM_MAX, DIM_MIN, imageRect, LOGIN_BLUR_MAX, normalizeWallpaper, PANEL_MAX, PANEL_MIN, WALLPAPER_DEFAULTS,
    WallpaperPanel, WallpaperRotation, WallpaperSettings, WallpaperTint, ZOOM_MAX, ZOOM_MIN,
} from "@shared/wallpaper";

import { t } from "../i18n";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { Wallpaper } from "../wallpaper";
import { React } from "../webpack/common";
import { Button, Collapse, Dialog, Dropdown, EmptyState, IconButton, Notice, Section, Status, SwitchRow, Text, useStore } from "./components";
import { DiscordUI } from "./discord";
import { Icon } from "./icons";

const change = (patch: Partial<WallpaperSettings>) => Settings.update(d => {
    d.wallpaper = { ...normalizeWallpaper(d.wallpaper), ...patch };
});

const changePanels = (patch: Partial<WallpaperSettings["panels"]>) => Settings.update(d => {
    const w = normalizeWallpaper(d.wallpaper);
    d.wallpaper = { ...w, panels: { ...w.panels, ...patch } };
});

const changeLogin = (patch: Partial<WallpaperSettings["login"]>) => Settings.update(d => {
    const w = normalizeWallpaper(d.wallpaper);
    d.wallpaper = { ...w, login: { ...w.login, ...patch } };
});

/**
 * One slider for every panel: the channel list at `v`, the frame a little more solid, the chat a
 * little less, the message box more so it's easy to find. The defaults come out at 25.
 */
const panelsFor = (v: number) => ({ frame: Math.min(100, v + 10), sidebars: v, chat: Math.round(v / 2), input: Math.min(100, v + 25) });

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type Look = Pick<WallpaperSettings, "zoom" | "x" | "y" | "rotation">;
interface Natural { width: number; height: number; }

/** The window's shape, so the frame is Discord's */
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

/** An element's size, kept up to date */
function useSize<T extends HTMLElement>() {
    const ref = React.useRef<T>(null);
    const [size, setSize] = React.useState({ width: 0, height: 0 });
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const read = () => setSize({ width: el.clientWidth, height: el.clientHeight });
        const observer = new ResizeObserver(read);
        observer.observe(el);
        read();
        return () => observer.disconnect();
    }, []);
    return [ref, size] as const;
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

/** The picture as `look` places it in a box: an element sized and turned from imageRect */
function Placed({ url, kind, natural, look, box, offset = { left: 0, top: 0 }, onNatural }: {
    url: string;
    kind: "image" | "video";
    natural?: Natural;
    look: Look;
    box: { width: number; height: number; };
    offset?: { left: number; top: number; };
    onNatural?(natural: Natural): void;
}) {
    const rect = natural && box.width ? imageRect(box.width, box.height, natural.width, natural.height, look) : undefined;
    const turned = look.rotation % 180 !== 0;
    const style: React.CSSProperties = rect ? {
        left: offset.left + rect.left + rect.width / 2,
        top: offset.top + rect.top + rect.height / 2,
        width: turned ? rect.height : rect.width,
        height: turned ? rect.width : rect.height,
        transform: `translate(-50%, -50%) rotate(${look.rotation}deg)`,
    } : { visibility: "hidden" };
    return kind === "video"
        ? <video className="dl-wp-placed" src={url} muted loop autoPlay={!matchMedia("(prefers-reduced-motion: reduce)").matches} playsInline style={style} onLoadedMetadata={e => onNatural?.({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} />
        : <img className="dl-wp-placed" src={url} alt="" draggable={false} style={style} onLoad={e => onNatural?.({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />;
}

// Edit Image, like Discord's

/** Room around the frame inside the editor, px */
const EDGE = 24;

function EditImage({ url, kind, initial, onApply, onClose }: { url: string; kind: "image" | "video"; initial: Look; onApply(look: Look): void; onClose(): void; }) {
    const aspect = useWindowAspect();
    const [stageRef, stage] = useSize<HTMLDivElement>();
    const [natural, setNatural] = React.useState<Natural>();
    const [look, setLook] = React.useState<Look>(initial);
    const latest = React.useRef(look);
    latest.current = look;
    const drag = React.useRef<{ id: number; x: number; y: number; start: Look; } | null>(null);
    const [dragging, setDragging] = React.useState(false);

    const frameWidth = Math.max(1, Math.min(stage.width - EDGE * 2, (stage.height - EDGE * 2) * aspect));
    const frame = { width: frameWidth, height: frameWidth / aspect };
    const offset = { left: (stage.width - frame.width) / 2, top: (stage.height - frame.height) / 2 };

    /** % of x/y per pixel moved: the picture's edge is x% of (frame − picture) across */
    const perPixel = (l: Look) => {
        if (!natural) return { x: 0, y: 0 };
        const rect = imageRect(frame.width, frame.height, natural.width, natural.height, l);
        const room = (b: number, c: number) => Math.abs(b - c) < 1 ? 0 : 100 / (b - c);
        return { x: room(frame.width, rect.width), y: room(frame.height, rect.height) };
    };
    const zoomTo = (zoom: number) => setLook(l => ({ ...l, zoom: clamp(Math.round(zoom), ZOOM_MIN, ZOOM_MAX) }));

    // Scrolling zooms, like Discord's
    React.useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomTo(latest.current.zoom + (e.deltaY < 0 ? 10 : -10));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: look };
        setDragging(true);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const per = perPixel(d.start);
        setLook(l => ({
            ...l,
            x: clamp(Math.round(d.start.x + (e.clientX - d.x) * per.x), 0, 100),
            y: clamp(Math.round(d.start.y + (e.clientY - d.y) * per.y), 0, 100),
        }));
    };
    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const per = perPixel(look);
        // Arrows move the picture the way it looks like it moves
        const nudge = (axis: "x" | "y", dir: number) => {
            const sign = Math.sign(per[axis]) || 0;
            setLook(l => ({ ...l, [axis]: clamp(l[axis] + dir * (e.shiftKey ? 10 : 2) * sign, 0, 100) }));
        };
        const keys: Record<string, () => void> = {
            ArrowLeft: () => nudge("x", -1),
            ArrowRight: () => nudge("x", 1),
            ArrowUp: () => nudge("y", -1),
            ArrowDown: () => nudge("y", 1),
            "+": () => zoomTo(look.zoom + 10),
            "=": () => zoomTo(look.zoom + 10),
            "-": () => zoomTo(look.zoom - 10),
        };
        const run = keys[e.key];
        if (!run) return;
        e.preventDefault();
        run();
    };

    return (
        <Dialog id="dl-wp-edit" title={t("wallpaper.editTitle")} onClose={onClose}>
            {close => (
                <div className="dl-wp-edit">
                    <div
                        ref={stageRef}
                        className="dl-wp-edit-stage"
                        data-dragging={dragging || undefined}
                        tabIndex={0}
                        role="group"
                        aria-label={t("wallpaper.editorLabel")}
                        aria-describedby="dl-wp-edit-hint"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={onKeyDown}
                    >
                        <Placed url={url} kind={kind} natural={natural} look={look} box={frame} offset={offset} onNatural={setNatural} />
                        {/* What shows in the window: everything outside it dimmed */}
                        <div className="dl-wp-edit-frame" style={{ left: offset.left, top: offset.top, width: frame.width, height: frame.height }} />
                    </div>
                    <Text tag="p" variant="text-xs/normal" color="text-muted" id="dl-wp-edit-hint">{t("wallpaper.editorHint")}</Text>
                    <div className="dl-wp-edit-controls">
                        <span className="dl-wp-edit-zoom">
                            <Icon name="image" size={14} />
                            <input
                                type="range"
                                aria-label={t("wallpaper.zoom")}
                                min={ZOOM_MIN}
                                max={ZOOM_MAX}
                                step={1}
                                value={look.zoom}
                                style={{ "--dl-wp-fill": `${((look.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` } as React.CSSProperties}
                                onChange={e => zoomTo(Number(e.currentTarget.value))}
                            />
                            <Icon name="image" size={22} />
                        </span>
                        <IconButton icon="rotate" label={t("wallpaper.rotate")} onClick={() => setLook(l => ({ ...l, rotation: ((l.rotation + 90) % 360) as WallpaperRotation }))} />
                    </div>
                    <footer className="dl-wp-edit-foot">
                        <button type="button" className="dl-wp-edit-reset" onClick={() => setLook({ zoom: 100, x: 50, y: 50, rotation: 0 })}>{t("wallpaper.editReset")}</button>
                        <span className="dl-grow" />
                        <Button onClick={close}>{t("common.cancel")}</Button>
                        <Button variant="accent" onClick={() => { onApply(look); close(); }}>{t("wallpaper.editApply")}</Button>
                    </footer>
                </div>
            )}
        </Dialog>
    );
}

/** The wallpaper as the window shows it, small: the crop, and the dim over it */
function Thumb({ w, url, kind, onEdit }: { w: WallpaperSettings; url: string; kind: "image" | "video"; onEdit(): void; }) {
    const aspect = useWindowAspect();
    const [ref, box] = useSize<HTMLDivElement>();
    const [natural, setNatural] = React.useState<Natural>();
    // A click shortcut: the Edit image button next to it is the one keyboards and screen readers use
    return (
        <div ref={ref} className="dl-wp-thumb" style={{ aspectRatio: String(aspect) }} onClick={onEdit}>
            <Placed url={url} kind={kind} natural={natural} look={w} box={box} onNatural={setNatural} />
            <span className="dl-wp-thumb-dim" style={{ opacity: w.dim / 100 }} />
        </div>
    );
}

const PANEL_ROWS: [WallpaperPanel, EviKey][] = [
    ["frame", "wallpaper.panel.frame"],
    ["sidebars", "wallpaper.panel.sidebars"],
    ["chat", "wallpaper.panel.chat"],
    ["input", "wallpaper.panel.input"],
];

export function WallpaperTab() {
    const w = normalizeWallpaper(useStore(Settings.subscribe, () => Settings.data).wallpaper);
    const state = useStore(Wallpaper.subscribe, Wallpaper.getSnapshot);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const [editing, setEditing] = React.useState(false);
    const [more, setMore] = React.useState(false);
    // Bumped by the reset button: Discord's sliders only read their value when they mount
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
    const resetAll = () => {
        const { enabled, file, kind, login } = w;
        change({ ...WALLPAPER_DEFAULTS, enabled, file, kind, login: { ...WALLPAPER_DEFAULTS.login, show: login.show } });
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
                            {state.url && state.kind
                                ? <Thumb w={w} url={state.url} kind={state.kind} onEdit={() => setEditing(true)} />
                                : <span className="dl-wp-thumb" />}
                            <div className="dl-grow dl-row-text">
                                <Text tag="h3" variant="text-md/semibold" color="text-strong" id="dl-wallpaper-current">
                                    {t(w.kind === "video" ? "wallpaper.currentVideo" : "wallpaper.currentImage")}
                                </Text>
                                <span role="status">{status}</span>
                                <div className="dl-toolbar">
                                    <Button icon="pencil" onClick={() => setEditing(true)} disabled={!state.url}>{t("wallpaper.edit")}</Button>
                                    <Button variant="danger" icon="trash" onClick={remove} disabled={busy}>{t("wallpaper.remove")}</Button>
                                </div>
                            </div>
                        </div>
                    </article>
                ) : (
                    <EmptyState icon="image" title={t("wallpaper.emptyTitle")}>{t("wallpaper.emptyBody")}</EmptyState>
                )}
            </Section>

            {editing && state.url && state.kind && (
                <EditImage
                    url={state.url}
                    kind={state.kind}
                    initial={{ zoom: w.zoom, x: w.x, y: w.y, rotation: w.rotation }}
                    onApply={look => change(look)}
                    onClose={() => setEditing(false)}
                />
            )}

            {w.file && (
                <Section>
                    <SwitchRow id="dl-wallpaper-enabled" label={t("wallpaper.show")} description={t("wallpaper.showHint")} checked={w.enabled} onChange={enabled => change({ enabled })} />
                    <RangeField id="dl-wallpaper-dim" label={t("wallpaper.dim")} description={t("wallpaper.dimHint")} value={w.dim} min={DIM_MIN} max={DIM_MAX} step={5} markers={[0, 15, 30, 45, 60, 75, 90]} resetKey={resets} onChange={dim => change({ dim })} />
                    <RangeField id="dl-wallpaper-panels" label={t("wallpaper.panelsSimple")} description={t("wallpaper.panelsSimpleHint")} value={w.panels.sidebars} min={PANEL_MIN} max={PANEL_MAX} step={5} resetKey={resets} onChange={v => changePanels(panelsFor(v))} />
                    <SwitchRow id="dl-wallpaper-login-show" label={t("wallpaper.login.show")} description={t("wallpaper.login.showHint")} checked={w.login.show} onChange={show => changeLogin({ show })} />
                    {w.kind === "video" && (
                        <SwitchRow id="dl-wallpaper-battery" label={t("wallpaper.pauseOnBattery")} description={t("wallpaper.pauseOnBatteryHint")} checked={w.pauseOnBattery} onChange={pauseOnBattery => change({ pauseOnBattery })} />
                    )}

                    <button type="button" className="dl-disclosure" aria-expanded={more} aria-controls="dl-wallpaper-more" onClick={() => setMore(!more)}>
                        <Icon name="chevronRight" size={16} />
                        <Text tag="span" variant="text-sm/semibold" color="text-subtle">{t("wallpaper.more")}</Text>
                    </button>
                    <Collapse open={more} id="dl-wallpaper-more">
                        <div className="dl-stack">
                            <RangeField id="dl-wallpaper-blur" label={t("wallpaper.blur")} description={t("wallpaper.blurHint")} value={w.blur} min={BLUR_MIN} max={BLUR_MAX} unit="px" resetKey={resets} onChange={blur => change({ blur })} />
                            {PANEL_ROWS.map(([panel, label]) => (
                                <RangeField key={panel} id={`dl-wallpaper-panel-${panel}`} label={t(label)} value={w.panels[panel]} min={PANEL_MIN} max={PANEL_MAX} step={5} resetKey={`${resets}-${w.panels.sidebars}`} onChange={value => changePanels({ [panel]: value })} />
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
                                <RangeField id="dl-wallpaper-panel-popouts" label={t("wallpaper.panel.popouts")} value={w.panels.popouts} min={PANEL_MIN} max={PANEL_MAX} step={5} resetKey={resets} onChange={popouts => changePanels({ popouts })} />
                            )}
                            {w.login.show && (
                                <>
                                    <RangeField id="dl-wallpaper-login-opacity" label={t("wallpaper.login.boxOpacity")} value={w.login.boxOpacity} min={PANEL_MIN} max={PANEL_MAX} step={5} resetKey={resets} onChange={boxOpacity => changeLogin({ boxOpacity })} />
                                    <RangeField id="dl-wallpaper-login-blur" label={t("wallpaper.login.blur")} value={w.login.blur} min={0} max={LOGIN_BLUR_MAX} unit="px" resetKey={resets} onChange={blur => changeLogin({ blur })} />
                                    <SwitchRow id="dl-wallpaper-login-art" label={t("wallpaper.login.hideArt")} description={t("wallpaper.login.hideArtHint")} checked={w.login.hideArt} onChange={hideArt => changeLogin({ hideArt })} />
                                </>
                            )}
                            <div className="dl-toolbar">
                                <Button icon="refresh" onClick={resetAll}>{t("wallpaper.resetAll")}</Button>
                            </div>
                        </div>
                    </Collapse>
                </Section>
            )}
        </div>
    );
}
