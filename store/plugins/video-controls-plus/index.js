var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// plugins/video-controls-plus/index.ts
var exports_video_controls_plus = {};
__export(exports_video_controls_plus, {
  default: () => video_controls_plus_default
});
module.exports = __toCommonJS(exports_video_controls_plus);
var import_api = require("@evi/api");

// plugins/video-controls-plus/controls.ts
var SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
var MIN_SPEED = SPEEDS[0];
var MAX_SPEED = SPEEDS[SPEEDS.length - 1];
var DEFAULT_FPS = 30;
var MIN_FPS = 1;
var MAX_FPS = 240;
var COMMON_FPS = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120, 144, 240];
function clampSpeed(value) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0)
    return 1;
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, n)) * 100) / 100;
}
function stepSpeed(current, direction) {
  const speed = clampSpeed(current);
  const eps = 0.000001;
  if (direction > 0)
    return SPEEDS.find((s) => s > speed + eps) ?? MAX_SPEED;
  for (let i = SPEEDS.length - 1;i >= 0; i--)
    if (SPEEDS[i] < speed - eps)
      return SPEEDS[i];
  return MIN_SPEED;
}
function formatSpeed(speed) {
  return `${Number(clampSpeed(speed).toFixed(2))}×`;
}
var KEY_ACTIONS = {
  " ": "togglePlay",
  k: "togglePlay",
  j: "seekBack",
  l: "seekForward",
  arrowleft: "seekBack",
  arrowright: "seekForward",
  m: "mute",
  f: "fullscreen",
  "[": "speedDown",
  "]": "speedUp",
  p: "pip",
  ",": "frameBack",
  ".": "frameForward"
};
function actionForKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
    return null;
  if (!e.key)
    return null;
  return KEY_ACTIONS[e.key.toLowerCase()] ?? null;
}
function isArrowAction(e) {
  return e.key === "ArrowLeft" || e.key === "ArrowRight";
}
function clampFps(fps) {
  const n = typeof fps === "number" ? fps : NaN;
  if (!Number.isFinite(n) || n <= 0)
    return DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, n));
}
function frameDuration(fps) {
  return 1 / clampFps(fps);
}
function estimateFps(deltas) {
  const valid = deltas.filter((d) => Number.isFinite(d) && d > 1 / (MAX_FPS * 2) && d < 1).sort((a, b) => a - b);
  if (valid.length < 5)
    return;
  const mid = valid.length >> 1;
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  const raw = 1 / median;
  let snapped, best = 0.03;
  for (const f of COMMON_FPS) {
    const error = Math.abs(f - raw) / f;
    if (error < best)
      [snapped, best] = [f, error];
  }
  return clampFps(snapped ?? Math.round(raw));
}
function finiteDuration(duration) {
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : Infinity;
}
function seekTime(current, delta, duration) {
  const now = Number.isFinite(current) ? current : 0;
  return Math.min(finiteDuration(duration), Math.max(0, now + delta));
}
function frameStepTime(current, direction, fps, duration) {
  return seekTime(current, direction * frameDuration(fps), duration);
}
function formatTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
function formatPosition(current, duration) {
  const d = finiteDuration(duration);
  return d === Infinity ? formatTime(current) : `${formatTime(current)} / ${formatTime(d)}`;
}
function clampSeekSeconds(value) {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n))
    return 5;
  return Math.min(60, Math.max(1, Math.round(n)));
}
function withShortcut(label, shortcut) {
  return shortcut ? `${label} (${shortcut})` : label;
}

// plugins/video-controls-plus/index.ts
var settings = {
  rememberSpeed: {
    type: "boolean",
    label: "Remember playback speed",
    description: "Videos start at the speed you last picked, instead of 1x.",
    default: true
  },
  showStrip: {
    type: "boolean",
    label: "Show the control strip",
    description: "Speed, loop, frame step and picture-in-picture buttons at the top right of a video you hover.",
    default: true
  },
  shortcuts: {
    type: "boolean",
    label: "Keyboard shortcuts",
    description: "While hovering a video: Space/K play, J/L and arrow keys seek, M mute, F fullscreen, [ ] speed, P picture-in-picture, , and . step one frame.",
    default: true
  },
  seekSeconds: {
    type: "number",
    label: "Seek step (seconds)",
    description: "How far J, L and the arrow keys jump.",
    default: 5,
    min: 1,
    max: 60,
    step: 1
  }
};
var PLAYER = '[data-testid="discord-web-video-player-container"]';
var PLAYER_BUTTON = (name) => `[data-testid="discord-web-video-player-${name}-btn"]`;
var MESSAGE_SCOPE = '[id^="chat-messages-"], [id^="message-accessories-"]';
var EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]';
var LAST_SPEED_KEY = "lastSpeed";
var IDLE_MS = 2500;
var FLASH_MS = 900;
var MIN_STRIP_WIDTH = 180;
var ctx;
var events;
var attached = new WeakSet;
var sped = new WeakSet;
var touched = new Map;
var fps = new WeakMap;
var hovered = null;
var current = null;
var idle = false;
var idleTimer;
var flashTimer;
var flashing = false;
var menuOpen = false;
var frame = 0;
var storage = () => ctx?.settings;
function touch(video, change) {
  for (const v of touched.keys())
    if (!v.isConnected)
      touched.delete(v);
  touched.set(video, { ...touched.get(video), ...change });
}
function isEligible(video) {
  if (!video.isConnected || video.srcObject || video.classList.contains("media-engine-video"))
    return false;
  if (!(video.currentSrc || video.src || video.querySelector("source")))
    return false;
  if (video.closest(PLAYER))
    return true;
  if (!video.closest(MESSAGE_SCOPE))
    return false;
  return attached.has(video) || !(video.autoplay && video.loop);
}
function videoFor(target) {
  if (!(target instanceof Element))
    return null;
  if (root?.contains(target))
    return current;
  if (target instanceof HTMLVideoElement)
    return isEligible(target) ? target : null;
  const video = target.closest(PLAYER)?.querySelector("video");
  return video && isEligible(video) ? video : null;
}
var playerOf = (video) => video.closest(PLAYER);
var playerButton = (video, name) => playerOf(video)?.querySelector(PLAYER_BUTTON(name)) ?? null;
function rememberedSpeed() {
  return clampSpeed(storage()?.get(LAST_SPEED_KEY) ?? 1);
}
function setSpeed(video, speed) {
  const s = clampSpeed(speed);
  video.defaultPlaybackRate = s;
  video.playbackRate = s;
  touch(video, { rate: true });
}
function applyRememberedSpeed(video) {
  if (sped.has(video))
    return;
  sped.add(video);
  if (!ctx?.settings.get("rememberSpeed"))
    return;
  const speed = rememberedSpeed();
  if (speed !== 1 && video.playbackRate === 1)
    setSpeed(video, speed);
}
function sampleFps(video) {
  if (fps.has(video) || typeof video.requestVideoFrameCallback !== "function")
    return;
  const signal = events?.signal;
  const deltas = [];
  let last;
  const onFrame = (_now, meta) => {
    if (signal?.aborted || fps.has(video))
      return;
    if (video.playbackRate <= 1 && last !== undefined)
      deltas.push(meta.mediaTime - last);
    last = meta.mediaTime;
    if (deltas.length >= 24) {
      const estimate = estimateFps(deltas);
      if (estimate)
        return void fps.set(video, estimate);
    }
    if (deltas.length < 120 && !video.paused)
      video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}
function attach(video) {
  if (attached.has(video) || !events)
    return;
  attached.add(video);
  const { signal } = events;
  video.addEventListener("ratechange", () => {
    if (ctx?.settings.get("rememberSpeed")) {
      const speed = clampSpeed(video.playbackRate);
      if (speed !== rememberedSpeed())
        storage()?.set(LAST_SPEED_KEY, speed);
    }
    if (video === current)
      sync();
  }, { signal });
  for (const type of ["play", "pause", "enterpictureinpicture", "leavepictureinpicture"]) {
    video.addEventListener(type, () => {
      if (type === "play")
        sampleFps(video);
      if (video === current) {
        sync();
        if (type === "pause")
          setIdle(false);
        else
          armIdle();
      }
    }, { signal });
  }
  if (!video.paused)
    sampleFps(video);
}
function togglePlay(video) {
  const button = playerButton(video, "play-pause");
  if (button)
    return button.click();
  if (playerOf(video))
    return video.click();
  if (video.paused)
    video.play().catch(() => {});
  else
    video.pause();
}
function pause(video) {
  if (video.paused)
    return;
  const button = playerButton(video, "play-pause");
  if (button)
    button.click();
  if (!video.paused)
    video.pause();
}
function toggleMute(video) {
  const button = playerButton(video, "volume");
  if (button)
    button.click();
  else
    video.muted = !video.muted;
  flash(video.muted || video.volume === 0 ? "Muted" : "Unmuted");
}
function toggleFullscreen(video) {
  const button = playerButton(video, "fullscreen");
  if (button)
    return button.click();
  if (document.fullscreenElement)
    document.exitFullscreen().catch(() => {});
  else
    (playerOf(video) ?? video).requestFullscreen().catch(() => {});
}
function toggleLoop(video) {
  video.loop = !video.loop;
  touch(video, { loop: true });
  flash(video.loop ? "Loop on" : "Loop off");
  sync();
}
async function togglePip(video) {
  if (!document.pictureInPictureEnabled)
    return flash("Picture-in-picture isn't available");
  try {
    if (document.pictureInPictureElement === video)
      return void await document.exitPictureInPicture();
    if (video.readyState < HTMLMediaElement.HAVE_METADATA)
      return flash("Play the video first");
    if (video.disablePictureInPicture) {
      video.disablePictureInPicture = false;
      touch(video, { pip: true });
    }
    await video.requestPictureInPicture();
  } catch (err) {
    ctx?.logger.warn("Picture-in-picture failed", err);
    flash("Couldn't open picture-in-picture");
  }
}
function seek(video, delta) {
  video.currentTime = seekTime(video.currentTime, delta, video.duration);
  flash(formatPosition(video.currentTime, video.duration));
}
function stepFrame(video, direction) {
  pause(video);
  video.currentTime = frameStepTime(video.currentTime, direction, fps.get(video), video.duration);
  flash(`${direction > 0 ? "Next" : "Previous"} frame · ${formatPosition(video.currentTime, video.duration)}`);
}
function changeSpeed(video, speed) {
  setSpeed(video, speed);
  flash(formatSpeed(video.playbackRate));
  sync();
}
function perform(action, video) {
  const step = clampSeekSeconds(ctx?.settings.get("seekSeconds"));
  switch (action) {
    case "togglePlay":
      return togglePlay(video);
    case "seekBack":
      return seek(video, -step);
    case "seekForward":
      return seek(video, step);
    case "mute":
      return toggleMute(video);
    case "fullscreen":
      return toggleFullscreen(video);
    case "speedDown":
      return changeSpeed(video, stepSpeed(video.playbackRate, -1));
    case "speedUp":
      return changeSpeed(video, stepSpeed(video.playbackRate, 1));
    case "pip":
      return void togglePip(video);
    case "frameBack":
      return stepFrame(video, -1);
    case "frameForward":
      return stepFrame(video, 1);
  }
}
var NO_REPEAT = new Set(["togglePlay", "mute", "fullscreen", "pip"]);
var root;
var strip;
var menu;
var flashEl;
var speedButton;
var loopButton;
var pipButton;
var svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
var ICONS = {
  frameBack: "M18 6l-7 6 7 6M7 6v12",
  frameForward: "M6 6l7 6-7 6M17 6v12",
  loop: "M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4",
  pip: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM12 12h6v5h-6z"
};
function button(act, label, content) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "evi-vcp-btn";
  el.dataset.act = act;
  el.title = label;
  el.setAttribute("aria-label", label);
  el.innerHTML = content;
  return el;
}
function buildOverlay() {
  root = document.createElement("div");
  root.className = "evi-vcp";
  root.dataset.visible = "false";
  strip = document.createElement("div");
  strip.className = "evi-vcp-strip";
  strip.setAttribute("role", "toolbar");
  strip.setAttribute("aria-label", "Video controls");
  speedButton = button("speed", "Playback speed ([ and ])", "1×");
  speedButton.classList.add("evi-vcp-speed");
  speedButton.setAttribute("aria-haspopup", "menu");
  speedButton.setAttribute("aria-expanded", "false");
  loopButton = button("loop", "Loop", svg(ICONS.loop));
  loopButton.setAttribute("aria-pressed", "false");
  pipButton = button("pip", withShortcut("Picture-in-picture", "P"), svg(ICONS.pip));
  pipButton.hidden = !document.pictureInPictureEnabled;
  const sep = document.createElement("span");
  sep.className = "evi-vcp-sep";
  strip.append(button("frameBack", withShortcut("Previous frame", ","), svg(ICONS.frameBack)), speedButton, button("frameForward", withShortcut("Next frame", "."), svg(ICONS.frameForward)), sep, loopButton, pipButton);
  menu = document.createElement("div");
  menu.className = "evi-vcp-menu evi-popout";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Playback speed");
  menu.hidden = true;
  for (const speed of SPEEDS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "evi-vcp-item";
    item.setAttribute("role", "menuitemradio");
    item.dataset.speed = String(speed);
    item.textContent = formatSpeed(speed);
    menu.append(item);
  }
  flashEl = document.createElement("div");
  flashEl.className = "evi-vcp-flash";
  flashEl.setAttribute("role", "status");
  flashEl.setAttribute("aria-live", "polite");
  root.append(strip, menu, flashEl);
  root.addEventListener("click", onOverlayClick);
  root.addEventListener("keydown", onOverlayKey);
  document.body.append(root);
}
function onOverlayClick(e) {
  const video = current;
  const target = e.target instanceof Element ? e.target : null;
  if (!video || !target)
    return;
  const item = target.closest(".evi-vcp-item");
  if (item) {
    changeSpeed(video, Number(item.dataset.speed));
    setMenu(false, true);
    return;
  }
  switch (target.closest(".evi-vcp-btn")?.dataset.act) {
    case "speed":
      return setMenu(!menuOpen, false);
    case "loop":
      return toggleLoop(video);
    case "pip":
      return void togglePip(video);
    case "frameBack":
      return stepFrame(video, -1);
    case "frameForward":
      return stepFrame(video, 1);
  }
}
function onOverlayKey(e) {
  if (!menuOpen || !menu)
    return;
  const items = [...menu.querySelectorAll(".evi-vcp-item")];
  const index = items.indexOf(document.activeElement);
  const move = (to) => items[(to + items.length) % items.length]?.focus();
  switch (e.key) {
    case "Escape":
      setMenu(false, true);
      break;
    case "ArrowRight":
    case "ArrowDown":
      move(index + 1);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      move(index - 1);
      break;
    case "Home":
      move(0);
      break;
    case "End":
      move(items.length - 1);
      break;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
}
function setMenu(open, refocus) {
  if (!menu || !speedButton)
    return;
  menuOpen = open;
  if (open) {
    menu.removeAttribute("data-closing");
    menu.hidden = false;
  } else if (!menu.hidden) {
    const el = menu;
    el.setAttribute("data-closing", "");
    import_api.exitDone(el).then(() => {
      if (menuOpen || !el.hasAttribute("data-closing"))
        return;
      el.removeAttribute("data-closing");
      el.hidden = true;
    });
  }
  speedButton.setAttribute("aria-expanded", String(open));
  if (open) {
    sync();
    setIdle(false);
    const active = menu.querySelector('[aria-checked="true"]') ?? menu.querySelector(".evi-vcp-item");
    active?.focus({ preventScroll: true });
  } else if (refocus) {
    speedButton.focus({ preventScroll: true });
  }
  update();
}
function sync() {
  const video = current;
  if (!video || !speedButton || !loopButton || !pipButton || !menu)
    return;
  const speed = clampSpeed(video.playbackRate);
  speedButton.textContent = formatSpeed(speed);
  speedButton.dataset.changed = String(speed !== 1);
  loopButton.setAttribute("aria-pressed", String(video.loop));
  loopButton.title = video.loop ? "Loop: on" : "Loop: off";
  pipButton.setAttribute("aria-pressed", String(document.pictureInPictureElement === video));
  for (const item of menu.querySelectorAll(".evi-vcp-item")) {
    item.setAttribute("aria-checked", String(Math.abs(Number(item.dataset.speed) - speed) < 0.000001));
  }
}
function flash(text) {
  if (!flashEl)
    return;
  flashEl.textContent = text;
  flashEl.dataset.shown = "true";
  flashing = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashing = false;
    if (flashEl)
      flashEl.dataset.shown = "false";
    update();
  }, FLASH_MS);
  update();
}
function setIdle(value) {
  clearTimeout(idleTimer);
  if (idle !== value) {
    idle = value;
    update();
  }
}
function armIdle() {
  setIdle(false);
  idleTimer = setTimeout(() => {
    const focusInside = !!root?.contains(document.activeElement);
    if (current && !current.paused && !menuOpen && !focusInside)
      setIdle(true);
  }, IDLE_MS);
}
function stripVisible() {
  return !!current && (menuOpen || hovered === current && !idle) && ctx?.settings.get("showStrip") !== false;
}
function visibleRect(video) {
  const box = (playerOf(video) ?? video).getBoundingClientRect();
  let top = Math.max(box.top, 0), left = Math.max(box.left, 0);
  let bottom = Math.min(box.bottom, window.innerHeight), right = Math.min(box.right, window.innerWidth);
  if (!document.fullscreenElement) {
    const scroller = video.closest('[class*="scroller"]')?.getBoundingClientRect();
    if (scroller) {
      top = Math.max(top, scroller.top);
      bottom = Math.min(bottom, scroller.bottom);
    }
  }
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function update() {
  if (!root || !strip)
    return;
  const video = current;
  const showStrip = stripVisible();
  const active = !!video?.isConnected && (showStrip || flashing);
  root.dataset.visible = String(active);
  strip.dataset.visible = String(showStrip);
  if (!active || !video) {
    if (menuOpen && !video?.isConnected)
      setMenu(false, false);
    cancelAnimationFrame(frame);
    frame = 0;
    return;
  }
  const host = document.fullscreenElement?.contains(video) ? document.fullscreenElement : document.body;
  if (root.parentElement !== host)
    host.append(root);
  const rect = visibleRect(video);
  root.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  root.style.width = `${rect.width}px`;
  root.style.height = `${rect.height}px`;
  root.dataset.compact = String(rect.width < MIN_STRIP_WIDTH || rect.height < 64);
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }
}
function show(video) {
  if (current !== video) {
    if (menuOpen)
      setMenu(false, false);
    current = video;
  }
  sync();
  armIdle();
}
function setHovered(video) {
  if (video === hovered)
    return;
  hovered = video;
  if (video) {
    attach(video);
    show(video);
  } else {
    update();
  }
}
function onPointerOver(e) {
  if (root?.contains(e.target))
    return;
  setHovered(videoFor(e.target));
}
var lastMove = 0;
function onPointerMove(e) {
  if (!current || hovered !== current && !root?.contains(e.target))
    return;
  if (!idle && e.timeStamp - lastMove < 200)
    return;
  lastMove = e.timeStamp;
  armIdle();
}
function onPointerDown(e) {
  if (menuOpen && !menu?.contains(e.target) && !speedButton?.contains(e.target))
    setMenu(false, false);
}
function onMouseOut(e) {
  if (!e.relatedTarget)
    setHovered(null);
}
function onPlay(e) {
  const video = e.target;
  if (!(video instanceof HTMLVideoElement) || !isEligible(video))
    return;
  attach(video);
  applyRememberedSpeed(video);
}
function isEditable(el) {
  return !!el?.closest(EDITABLE);
}
function keyTarget(e) {
  const active = document.activeElement;
  const focused = active && active !== document.body ? videoFor(active) : null;
  if (focused)
    return focused;
  if (!hovered?.isConnected || isEditable(active))
    return null;
  if (isArrowAction(e) && hovered.closest('[role="dialog"]'))
    return null;
  return hovered;
}
function onKeyDown(e) {
  if (!ctx?.settings.get("shortcuts") || e.defaultPrevented)
    return;
  const action = actionForKey(e);
  if (!action)
    return;
  if (root?.contains(document.activeElement) && (e.key === " " || menuOpen))
    return;
  const video = keyTarget(e);
  if (!video)
    return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.repeat && NO_REPEAT.has(action))
    return;
  attach(video);
  show(video);
  try {
    perform(action, video);
  } catch (err) {
    ctx.logger.error(`Couldn't ${action}`, err);
  }
}
function restore() {
  for (const [video, change] of touched) {
    if (!video.isConnected)
      continue;
    try {
      if (change.rate) {
        video.defaultPlaybackRate = 1;
        video.playbackRate = 1;
      }
      if (change.loop)
        video.loop = false;
      if (change.pip) {
        if (document.pictureInPictureElement === video)
          document.exitPictureInPicture().catch(() => {});
        video.disablePictureInPicture = true;
      }
    } catch {}
  }
  touched.clear();
}
var video_controls_plus_default = import_api.definePlugin({
  settings,
  css: `
        .evi-vcp { position: fixed; left: 0; top: 0; z-index: 10000; pointer-events: none; overflow: visible;
            font-family: var(--font-primary, inherit); color: var(--white, #fff); }
        .evi-vcp[data-visible="false"] { visibility: hidden; transition: visibility 0s linear 0.15s; }
        .evi-vcp-strip { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 2px; padding: 2px;
            border-radius: var(--radius-sm, 8px); background: rgb(0 0 0 / 0.6); backdrop-filter: blur(6px);
            box-shadow: var(--shadow-low, 0 1px 3px rgb(0 0 0 / 0.3)); pointer-events: auto;
            opacity: 1; transition: opacity 0.15s ease-out; }
        .evi-vcp-strip[data-visible="false"] { opacity: 0; pointer-events: none; }
        .evi-vcp[data-compact="true"] .evi-vcp-strip { display: none; }
        .evi-vcp-btn, .evi-vcp-item { display: flex; align-items: center; justify-content: center; border: 0; padding: 0;
            color: inherit; background: transparent; border-radius: calc(var(--radius-sm, 8px) - 2px); cursor: pointer;
            font: inherit; transition: background-color 0.12s ease-out; }
        .evi-vcp-btn { width: 30px; height: 30px; }
        .evi-vcp-btn[hidden] { display: none; }
        .evi-vcp-speed { width: auto; min-width: 44px; padding: 0 6px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .evi-vcp-speed[data-changed="true"] { color: var(--text-brand, var(--brand-360, #949cf7)); }
        .evi-vcp-btn:hover, .evi-vcp-item:hover { background: rgb(255 255 255 / 0.16); }
        .evi-vcp-btn[aria-pressed="true"] { color: var(--text-brand, var(--brand-360, #949cf7)); background: rgb(255 255 255 / 0.12); }
        .evi-vcp button:focus-visible { outline: 2px solid var(--focus-primary, #00b0f4); outline-offset: 1px; }
        .evi-vcp-sep { width: 1px; height: 18px; margin: 0 3px; background: rgb(255 255 255 / 0.25); }
        .evi-vcp-menu { position: absolute; top: 46px; right: 8px; display: grid; grid-template-columns: repeat(5, auto); gap: 2px;
            padding: 4px; border-radius: var(--radius-sm, 8px); pointer-events: auto;
            background: var(--background-floating, var(--background-surface-highest, #111214)); color: var(--text-default, var(--text-normal, #dbdee1));
            border: 1px solid var(--border-subtle, rgb(255 255 255 / 0.08)); box-shadow: var(--shadow-high, 0 8px 16px rgb(0 0 0 / 0.24)); }
        .evi-vcp-menu[hidden] { display: none; }
        .evi-vcp-item { min-width: 48px; height: 28px; padding: 0 6px; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
        .evi-vcp-item:hover { background: var(--background-modifier-hover, rgb(255 255 255 / 0.08)); }
        .evi-vcp-item[aria-checked="true"] { background: var(--brand-500, #5865f2); color: var(--white, #fff); }
        .evi-vcp-flash { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 6px 12px; max-width: calc(100% - 16px);
            border-radius: var(--radius-sm, 8px); background: rgb(0 0 0 / 0.7); font-size: 14px; font-weight: 600;
            font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            opacity: 0; transition: opacity 0.15s ease-out; }
        .evi-vcp-flash[data-shown="true"] { opacity: 1; transition-duration: 0.05s; }
        @media (prefers-reduced-motion: reduce) {
            .evi-vcp, .evi-vcp[data-visible="false"], .evi-vcp-strip, .evi-vcp-btn, .evi-vcp-item, .evi-vcp-flash { transition: none; }
        }
    `,
  start(context) {
    ctx = context;
    events = new AbortController;
    const { signal } = events;
    buildOverlay();
    const capture = { capture: true, signal };
    document.addEventListener("pointerover", onPointerOver, capture);
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true, signal });
    document.addEventListener("pointerdown", onPointerDown, capture);
    document.addEventListener("mouseout", onMouseOut, capture);
    document.addEventListener("play", onPlay, capture);
    window.addEventListener("keydown", onKeyDown, capture);
    document.addEventListener("fullscreenchange", () => update(), { signal });
    window.addEventListener("resize", () => update(), { signal });
    context.settings.onChange(() => {
      sync();
      update();
    });
    context.onDispose(() => {
      events?.abort();
      events = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(idleTimer);
      clearTimeout(flashTimer);
      idleTimer = flashTimer = undefined;
      root?.remove();
      root = strip = menu = flashEl = speedButton = loopButton = pipButton = undefined;
      restore();
      hovered = current = null;
      idle = flashing = menuOpen = false;
      ctx = undefined;
    });
  }
});
