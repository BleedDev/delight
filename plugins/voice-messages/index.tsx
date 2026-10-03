/**
 * Voice messages from the desktop: a microphone in the chat bar opens a small recorder above it.
 * Record, listen back, record again, send. What's sent is what Discord's phone apps send: one Ogg
 * Opus file with its length and waveform, on a message flagged as a voice message, so everyone sees
 * Discord's own voice message player.
 *
 * Checked against Discord's code on 2026-10-02:
 * - The chat bar's buttons are built into an array; patches.ts puts ours after the app launcher.
 * - Uploads go through Discord's CloudUpload: new CloudUpload({ file, platform: 1 }, channelId,
 *   undefined, allowOptimization) then upload(), which emits "progress", then "complete" or "error".
 *   It gets an upload URL from Discord, puts the file there and leaves us its uploadedFilename.
 * - The message is then posted with Discord's HTTP client, like its phone apps do.
 */
import { Dispatcher, definePlugin, find, getStore, openLayer, React, showToast } from "@evi/api";
import type { CloseLayer, PluginContext } from "@evi/api";

import { oggOpusDuration, toOggOpus } from "./ogg";
import { PATCHES } from "./patches";
import { t } from "./strings";
import { canSendVoice, clock, MAX_SECONDS, messageBody, recorderType, toBase64, waveform } from "./voice";

const settings = {
    noiseSuppression: {
        type: "boolean",
        get label() { return t("settings.noiseSuppression"); },
        get description() { return t("settings.noiseSuppression.description"); },
        default: true,
    },
} as const;

let ctx: PluginContext<typeof settings> | undefined;

const WEB = 1;

/** Discord's upload: the class whose instances upload a file to Discord's storage */
const findCloudUpload = (): any => find(v => typeof v === "function" && typeof v.prototype?.uploadFileToCloud === "function" && typeof v.prototype?.upload === "function");

type HttpClient = { post(opts: any): Promise<any>; };
/** Discord's API client: exactly { get, post, put, patch, del }; superagent under it also has Request and getXHR */
const http = (): HttpClient | undefined => find(v => typeof v?.patch === "function" && typeof v?.del === "function"
    && typeof v?.post === "function" && !("getXHR" in v) && !("Request" in v));

function canSendHere(channel: any): boolean {
    if (!channel?.id) return false;
    const perms = getStore("PermissionStore") as any;
    const isPrivate = typeof channel.isPrivate === "function" ? channel.isPrivate() : !channel.guild_id;
    return canSendVoice(isPrivate, p => !!perms?.can?.(p, channel));
}

interface Recording { ogg: Uint8Array; url: string; duration: number; wave: Uint8Array; }

type State =
    | { kind: "starting"; }
    | { kind: "recording"; since: number; }
    | { kind: "processing"; }
    | { kind: "review"; rec: Recording; }
    | { kind: "sending"; rec: Recording; progress: number; }
    | { kind: "error"; message: string; rec?: Recording; };

/** Recording from the microphone: the MediaRecorder, a level meter, and cleanup */
class Recorder {
    private stream?: MediaStream;
    private recorder?: MediaRecorder;
    private audio?: AudioContext;
    private analyser?: AnalyserNode;
    private chunks: Blob[] = [];
    private levelData?: Float32Array<ArrayBuffer>;

    async start(noiseSuppression: boolean) {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression, autoGainControl: true, channelCount: 1 },
        });
        const mimeType = recorderType(type => MediaRecorder.isTypeSupported(type));
        this.recorder = new MediaRecorder(this.stream, { ...mimeType && { mimeType }, audioBitsPerSecond: 64000 });
        this.chunks = [];
        this.recorder.ondataavailable = e => void (e.data.size && this.chunks.push(e.data));
        this.recorder.start(250);
        this.audio = new AudioContext();
        this.analyser = this.audio.createAnalyser();
        this.analyser.fftSize = 1024;
        this.audio.createMediaStreamSource(this.stream).connect(this.analyser);
        this.levelData = new Float32Array(this.analyser.fftSize);
    }

    /** 0–1, how loud the microphone is right now */
    level(): number {
        if (!this.analyser || !this.levelData) return 0;
        this.analyser.getFloatTimeDomainData(this.levelData);
        let sum = 0;
        for (const v of this.levelData) sum += v * v;
        return Math.min(1, Math.sqrt(sum / this.levelData.length) * 4);
    }

    /** Stops recording: the recording as Ogg Opus, its length and waveform */
    async stop(): Promise<Recording> {
        const rec = this.recorder;
        if (!rec) throw new Error("Not recording");
        const done = new Promise<void>(resolve => rec.addEventListener("stop", () => resolve(), { once: true }));
        if (rec.state !== "inactive") rec.stop();
        await done;
        const recorded = new Uint8Array(await new Blob(this.chunks).arrayBuffer());
        this.release();
        const ogg = toOggOpus(recorded);
        let duration = oggOpusDuration(ogg);
        let wave: Uint8Array = new Uint8Array(0);
        const decoder = new AudioContext();
        try {
            const buffer = await decoder.decodeAudioData(ogg.slice().buffer);
            duration = buffer.duration || duration;
            wave = waveform(buffer.getChannelData(0), duration);
        } finally {
            void decoder.close();
        }
        if (duration < 0.3) throw new Error(t("error.tooShort"));
        const url = URL.createObjectURL(new Blob([ogg.slice()], { type: "audio/ogg" }));
        return { ogg, url, duration, wave };
    }

    release() {
        if (this.recorder && this.recorder.state !== "inactive") {
            try {
                this.recorder.stop();
            } catch { }
        }
        this.stream?.getTracks().forEach(track => track.stop());
        void this.audio?.close().catch(() => { });
        this.stream = this.recorder = this.audio = this.analyser = undefined;
    }
}

function send(channelId: string, rec: Recording, onProgress: (p: number) => void): Promise<void> {
    const CloudUpload = findCloudUpload();
    const client = http();
    if (!CloudUpload || !client) return Promise.reject(new Error(t("error.discordChanged")));
    const file = new File([rec.ogg.slice()], "voice-message.ogg", { type: "audio/ogg" });
    const upload = new CloudUpload({ file, platform: WEB, isThumbnail: false }, channelId, undefined, false);
    return new Promise<void>((resolve, reject) => {
        upload.on("progress", (loaded: number, total: number) => total && onProgress(loaded / total));
        upload.on("error", () => reject(new Error(t("error.upload"))));
        upload.on("complete", async () => {
            if (upload.status !== "COMPLETED" || !upload.uploadedFilename) return reject(new Error(t("error.upload")));
            try {
                const replyStore = getStore("PendingReplyStore") as any;
                const pending = replyStore?.getPendingReply?.(channelId);
                const channel = (getStore("ChannelStore") as any)?.getChannel?.(channelId);
                const reply = pending?.message?.id
                    ? { channelId, messageId: pending.message.id, guildId: channel?.guild_id, mention: pending.shouldMention !== false }
                    : undefined;
                await client.post({
                    url: `/channels/${channelId}/messages`,
                    body: messageBody(channelId, { filename: upload.filename ?? file.name, uploadedFilename: upload.uploadedFilename }, rec.duration, toBase64(rec.wave), reply),
                });
                if (reply) Dispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
                resolve();
            } catch (err: any) {
                reject(new Error(err?.body?.message ?? err?.message ?? t("error.send")));
            }
        });
        upload.upload();
    });
}

const ICONS = {
    mic: "M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4ZM6 11a1 1 0 1 0-2 0 8 8 0 0 0 7 7.94V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 11a1 1 0 1 0-2 0 6 6 0 0 1-12 0Z",
    stop: "M6 5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6Z",
    play: "M8 5.14v13.72a1 1 0 0 0 1.5.86l11.24-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z",
    pause: "M6 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H6Zm9 0a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3Z",
    redo: "M12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35A7.96 7.96 0 0 0 12 4Z",
    trash: "M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5ZM5 7a1 1 0 0 1 1 .94l.72 11.5a.5.5 0 0 0 .5.47h9.56a.5.5 0 0 0 .5-.47L18 7.94a1 1 0 0 1 2 .12l-.72 11.5A2.5 2.5 0 0 1 16.78 22H7.22a2.5 2.5 0 0 1-2.5-2.44L4 8.06A1 1 0 0 1 5 7Z",
    send: "M6.6 10.02 14 11.4a.6.6 0 0 1 0 1.18L6.6 14l-2.94 5.87a1.48 1.48 0 0 0 1.99 1.98l17.03-8.52a1.48 1.48 0 0 0 0-2.64L5.65 2.16a1.48 1.48 0 0 0-1.99 1.98l2.94 5.88Z",
};

function Glyph({ name, size = 20 }: { name: keyof typeof ICONS; size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={ICONS[name]} /></svg>;
}

/** The recording's waveform as bars, the played part in the accent colour */
function Wave({ wave, progress, bars = 48 }: { wave: Uint8Array; progress: number; bars?: number; }) {
    const shown = React.useMemo(() => {
        if (!wave.length) return Array.from({ length: bars }, () => 0);
        return Array.from({ length: bars }, (_, i) => {
            const from = Math.floor(i * wave.length / bars), to = Math.max(from + 1, Math.floor((i + 1) * wave.length / bars));
            let max = 0;
            for (let j = from; j < to; j++) max = Math.max(max, wave[j]);
            return max / 255;
        });
    }, [wave, bars]);
    return (
        <div className="evi-vm-wave" aria-hidden="true">
            {shown.map((v, i) => <span key={i} data-played={i / bars < progress ? "" : undefined} style={{ height: `${Math.max(12, v * 100)}%` }} />)}
        </div>
    );
}

function RecorderPanel({ channelId, anchor, onClose }: { channelId: string; anchor: DOMRect; onClose(): void; }) {
    const [state, setState] = React.useState<State>({ kind: "starting" });
    const [now, setNow] = React.useState(Date.now());
    const [level, setLevel] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);
    const [played, setPlayed] = React.useState(0);
    const recorder = React.useRef<Recorder | undefined>(undefined);
    const audio = React.useRef<HTMLAudioElement>(null);
    const urls = React.useRef<string[]>([]);
    const stateRef = React.useRef(state);
    stateRef.current = state;

    const start = React.useCallback(async () => {
        recorder.current?.release();
        const r = recorder.current = new Recorder();
        setState({ kind: "starting" });
        setPlaying(false);
        setPlayed(0);
        try {
            await r.start(ctx?.settings.get("noiseSuppression") ?? true);
            if (recorder.current !== r) return r.release();
            setState({ kind: "recording", since: Date.now() });
        } catch (err: any) {
            r.release();
            const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
            const missing = err?.name === "NotFoundError";
            setState({ kind: "error", message: denied ? t("error.denied") : missing ? t("error.noMic") : String(err?.message ?? err) });
        }
    }, []);

    const stop = React.useCallback(async () => {
        const r = recorder.current;
        if (!r || stateRef.current.kind !== "recording") return;
        setState({ kind: "processing" });
        try {
            const rec = await r.stop();
            urls.current.push(rec.url);
            setState({ kind: "review", rec });
        } catch (err: any) {
            setState({ kind: "error", message: String(err?.message ?? err) });
        }
    }, []);

    // Start at once; let go of the microphone and the recordings when closed
    React.useEffect(() => {
        void start();
        return () => {
            recorder.current?.release();
            recorder.current = undefined;
            urls.current.forEach(u => URL.revokeObjectURL(u));
        };
    }, []);

    // The timer and level meter while recording, stopping at Discord's limit
    React.useEffect(() => {
        if (state.kind !== "recording") return;
        let frame = 0;
        const tick = () => {
            const at = Date.now();
            setNow(at);
            setLevel(recorder.current?.level() ?? 0);
            if ((at - state.since) / 1000 >= MAX_SECONDS) return void stop();
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [state]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (stateRef.current.kind !== "sending") onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    const togglePlay = () => {
        const el = audio.current;
        if (!el) return;
        if (el.paused) void el.play();
        else el.pause();
    };

    const doSend = async (rec: Recording) => {
        audio.current?.pause();
        setState({ kind: "sending", rec, progress: 0 });
        try {
            await send(channelId, rec, progress => setState(s => s.kind === "sending" ? { ...s, progress } : s));
            onClose();
        } catch (err: any) {
            setState({ kind: "error", message: String(err?.message ?? err), rec });
        }
    };

    const rec = "rec" in state ? state.rec : undefined;
    const style: React.CSSProperties = {
        right: Math.max(8, window.innerWidth - anchor.right - 8),
        bottom: Math.max(8, window.innerHeight - anchor.top + 8),
    };

    let body: React.ReactNode;
    switch (state.kind) {
        case "starting":
        case "processing":
            body = <div className="evi-vm-row"><span className="evi-vm-status">{state.kind === "starting" ? t("status.starting") : t("status.processing")}</span></div>;
            break;
        case "recording": {
            const seconds = (now - state.since) / 1000;
            body = (
                <div className="evi-vm-row">
                    <span className="evi-vm-dot" aria-hidden="true" />
                    <span className="evi-vm-time" aria-live="off">{clock(seconds)}</span>
                    <span className="evi-vm-meter" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0.02, level)})` }} /></span>
                    <button type="button" className="evi-vm-icon" aria-label={t("action.discard")} title={t("action.discard")} onClick={onClose}><Glyph name="trash" /></button>
                    <button type="button" className="evi-vm-icon" data-variant="stop" aria-label={t("action.stop")} title={t("action.stop")} onClick={() => void stop()}><Glyph name="stop" /></button>
                </div>
            );
            break;
        }
        case "review":
        case "sending":
            body = (
                <div className="evi-vm-row">
                    <button type="button" className="evi-vm-icon" data-variant="play" aria-label={playing ? t("action.pause") : t("action.play")} title={playing ? t("action.pause") : t("action.play")} disabled={state.kind === "sending"} onClick={togglePlay}>
                        <Glyph name={playing ? "pause" : "play"} />
                    </button>
                    <Wave wave={state.rec.wave} progress={state.kind === "sending" ? state.progress : played} />
                    <span className="evi-vm-time">{clock(state.rec.duration)}</span>
                    {state.kind === "review" ? <>
                        <button type="button" className="evi-vm-icon" aria-label={t("action.discard")} title={t("action.discard")} onClick={onClose}><Glyph name="trash" /></button>
                        <button type="button" className="evi-vm-icon" aria-label={t("action.again")} title={t("action.again")} onClick={() => void start()}><Glyph name="redo" /></button>
                        <button type="button" className="evi-vm-icon" data-variant="send" aria-label={t("action.send")} title={t("action.send")} onClick={() => void doSend(state.rec)}><Glyph name="send" /></button>
                    </> : <span className="evi-vm-status">{t("status.sending", { percent: Math.round(state.progress * 100) })}</span>}
                </div>
            );
            break;
        case "error":
            body = (
                <div className="evi-vm-row">
                    <span className="evi-vm-error" role="alert">{state.message}</span>
                    {state.rec && <button type="button" className="evi-vm-text" onClick={() => void doSend(state.rec!)}>{t("action.retry")}</button>}
                    <button type="button" className="evi-vm-text" onClick={() => void start()}>{t("action.again")}</button>
                    <button type="button" className="evi-vm-icon" aria-label={t("action.close")} title={t("action.close")} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
                </div>
            );
            break;
    }

    return (
        <div className="evi-vm-panel evi-popout" role="dialog" aria-label={t("panel.title")} style={style}>
            <div className="evi-vm-title">{t("panel.title")}</div>
            {body}
            {state.kind === "recording" && <div className="evi-vm-hint">{t("hint.limit", { limit: clock(MAX_SECONDS) })}</div>}
            {rec && (
                <audio
                    ref={audio}
                    src={rec.url}
                    preload="auto"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                        setPlaying(false);
                        setPlayed(0);
                    }}
                    onTimeUpdate={e => setPlayed(rec.duration ? e.currentTarget.currentTime / rec.duration : 0)}
                />
            )}
        </div>
    );
}

let closeOpen: CloseLayer | undefined;
let openFor: string | undefined;

function openRecorder(channelId: string, button: HTMLElement) {
    if (closeOpen) {
        // A second click on the microphone closes it
        const same = openFor === channelId;
        closeOpen();
        if (same) return;
    }
    const anchor = button.getBoundingClientRect();
    const close = openLayer(close => <RecorderPanel channelId={channelId} anchor={anchor} onClose={() => close()} />, {
        onClosed: () => {
            if (closeOpen === close) closeOpen = openFor = undefined;
        },
    });
    closeOpen = close;
    openFor = channelId;
}

function MicButton({ channelId }: { channelId: string; }) {
    return (
        <div className="evi-vm-button-wrap">
            <button
                type="button"
                className="evi-vm-button"
                aria-label={t("button")}
                title={t("button")}
                onClick={e => openRecorder(channelId, e.currentTarget)}
            >
                <Glyph name="mic" size={22} />
            </button>
        </div>
    );
}

const css = `
.evi-vm-button-wrap { display: flex; align-items: center; }
.evi-vm-button {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    margin-inline: 2px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--interactive-normal, var(--interactive-icon-default, #b5bac1));
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
}
.evi-vm-button:hover { color: var(--interactive-hover, #dbdee1); }
.evi-vm-button:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 0; }

.evi-vm-panel {
    position: fixed;
    z-index: 1002;
    display: flex;
    flex-direction: column;
    gap: 8px;
    inline-size: min(420px, calc(100vw - 16px));
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--background-surface-higher, var(--background-floating, #232428));
    border: 1px solid var(--border-subtle, rgb(255 255 255 / 0.06));
    box-shadow: var(--shadow-high, 0 12px 32px rgb(0 0 0 / 0.4));
    color: var(--text-normal, #dbdee1);
    font-size: 14px;
}
.evi-vm-title { font-size: 12px; font-weight: 600; color: var(--text-muted, #949ba4); }
.evi-vm-row { display: flex; align-items: center; gap: 8px; min-block-size: 36px; }
.evi-vm-status { flex: 1; color: var(--text-muted, #949ba4); }
.evi-vm-hint { font-size: 12px; color: var(--text-muted, #949ba4); }
.evi-vm-error { flex: 1; color: var(--text-feedback-critical, #f23f43); }
.evi-vm-time { font-variant-numeric: tabular-nums; font-weight: 500; min-inline-size: 40px; text-align: end; }
.evi-vm-dot {
    inline-size: 10px;
    block-size: 10px;
    border-radius: 50%;
    background: var(--status-danger, #f23f43);
}
@media (prefers-reduced-motion: no-preference) {
    .evi-vm-dot { animation: evi-vm-pulse 1.2s ease-in-out infinite; }
}
@keyframes evi-vm-pulse { 50% { opacity: 0.35; } }
.evi-vm-meter {
    flex: 1;
    block-size: 6px;
    border-radius: 3px;
    background: var(--background-modifier-accent, rgb(255 255 255 / 0.08));
    overflow: hidden;
}
.evi-vm-meter > span {
    display: block;
    block-size: 100%;
    background: var(--status-positive, #23a55a);
    transform-origin: left;
    transition: transform 80ms linear;
}
.evi-vm-wave { flex: 1; display: flex; align-items: center; gap: 2px; block-size: 28px; }
.evi-vm-wave > span {
    flex: 1;
    min-inline-size: 2px;
    border-radius: 2px;
    background: var(--interactive-muted, rgb(255 255 255 / 0.25));
}
.evi-vm-wave > span[data-played] { background: var(--brand-500, #5865f2); }
.evi-vm-icon, .evi-vm-text {
    display: grid;
    place-items: center;
    flex: none;
    min-inline-size: 36px;
    block-size: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--interactive-normal, #b5bac1);
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
}
.evi-vm-icon:hover:not(:disabled), .evi-vm-text:hover { background: var(--background-modifier-hover, rgb(255 255 255 / 0.06)); color: var(--interactive-hover, #dbdee1); }
.evi-vm-icon:disabled { opacity: 0.4; cursor: default; }
.evi-vm-icon[data-variant="send"], .evi-vm-icon[data-variant="play"] { background: var(--brand-500, #5865f2); color: var(--white, #fff); }
.evi-vm-icon[data-variant="send"]:hover:not(:disabled), .evi-vm-icon[data-variant="play"]:hover:not(:disabled) { background: var(--brand-560, #4752c4); color: var(--white, #fff); }
.evi-vm-icon[data-variant="stop"] { background: var(--status-danger, #f23f43); color: var(--white, #fff); }
.evi-vm-icon[data-variant="stop"]:hover { background: var(--red-500, #d83c3e); color: var(--white, #fff); }
.evi-vm-text { padding-inline: 12px; border-radius: 8px; font: inherit; font-weight: 500; }
.evi-vm-icon:focus-visible, .evi-vm-text:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 2px; }
`;

export default definePlugin({
    settings,
    css,
    patches: Object.values(PATCHES),

    /** Adds the microphone to the chat bar's buttons: the normal chat bar, where voice messages are allowed */
    chatButton(buttons: unknown[], channel: any, type: any) {
        try {
            if (!ctx || !Array.isArray(buttons) || type?.analyticsName !== "normal" || !canSendHere(channel)) return;
            buttons.push(<MicButton key="evi-voice-message" channelId={channel.id} />);
        } catch (err) {
            ctx?.logger.error("Couldn't add the microphone", err);
        }
    },

    start(context) {
        ctx = context;
        if (typeof MediaRecorder === "undefined") showToast(t("error.noRecorder"), { type: "failure" });
    },

    stop() {
        closeOpen?.({ instant: true });
        ctx = undefined;
    },
});
