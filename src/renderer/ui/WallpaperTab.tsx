import { BLUR_MAX, BLUR_MIN, DIM_MAX, DIM_MIN, DIM_STEP, normalizeWallpaper, WALLPAPER_DEFAULTS, WallpaperSettings } from "@shared/wallpaper";

import { t } from "../i18n";
import { SafeMode } from "../safeMode";
import { Settings } from "../settings";
import { Wallpaper } from "../wallpaper";
import { React } from "../webpack/common";
import { Button, EmptyState, Notice, Section, SettingField, Status, SwitchRow, Text, useStore } from "./components";

const change = (patch: Partial<WallpaperSettings>) => Settings.update(d => {
    d.wallpaper = { ...normalizeWallpaper(d.wallpaper), ...patch };
});

/** The wallpaper as it looks behind Discord, dim and blur included */
function Preview({ url, kind, dim, blur }: { url: string; kind: "image" | "video"; dim: number; blur: number; }) {
    // Scaled down with the thumbnail, so the blur reads the same as on the full window
    const filter = blur ? `blur(${blur / 4}px)` : undefined;
    return (
        <div className="dl-wallpaper-thumb">
            {kind === "video"
                ? <video src={url} muted preload="metadata" style={{ filter }} aria-label={t("wallpaper.previewVideo")} />
                : <img src={url} alt={t("wallpaper.previewImage")} style={{ filter }} />}
            <div className="dl-wallpaper-thumb-dim" style={{ opacity: dim / 100 }} />
        </div>
    );
}

export function WallpaperTab() {
    const w = normalizeWallpaper(useStore(Settings.subscribe, () => Settings.data).wallpaper);
    const state = useStore(Wallpaper.subscribe, Wallpaper.getSnapshot);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();

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
                        <div className="dl-card-body dl-wallpaper-current">
                            {state.url && state.kind
                                ? <Preview url={state.url} kind={state.kind} dim={w.dim} blur={w.blur} />
                                : <div className="dl-wallpaper-thumb" />}
                            <div className="dl-grow dl-row-text">
                                <Text tag="h3" variant="text-md/semibold" color="text-strong" id="dl-wallpaper-current">
                                    {t(w.kind === "video" ? "wallpaper.currentVideo" : "wallpaper.currentImage")}
                                </Text>
                                <span role="status">{status}</span>
                                <div className="dl-toolbar">
                                    <Button variant="danger" icon="trash" onClick={remove} disabled={busy}>{t("wallpaper.remove")}</Button>
                                </div>
                            </div>
                        </div>
                    </article>
                ) : (
                    <EmptyState icon="image" title={t("wallpaper.emptyTitle")}>{t("wallpaper.emptyBody")}</EmptyState>
                )}
            </Section>

            {w.file && (
                <Section>
                    <SwitchRow id="dl-wallpaper-enabled" label={t("wallpaper.show")} description={t("wallpaper.showHint")} checked={w.enabled} onChange={enabled => change({ enabled })} />
                    <SettingField
                        id="dl-wallpaper-dim"
                        definition={{ type: "number", label: t("wallpaper.dim"), description: t("wallpaper.dimHint"), default: WALLPAPER_DEFAULTS.dim, min: DIM_MIN, max: DIM_MAX, step: DIM_STEP }}
                        value={w.dim}
                        onChange={v => change({ dim: Number(v) })}
                    />
                    <SettingField
                        id="dl-wallpaper-blur"
                        definition={{ type: "number", label: t("wallpaper.blur"), description: t("wallpaper.blurHint"), default: WALLPAPER_DEFAULTS.blur, min: BLUR_MIN, max: BLUR_MAX, step: 2 }}
                        value={w.blur}
                        onChange={v => change({ blur: Number(v) })}
                    />
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
            )}
        </div>
    );
}
