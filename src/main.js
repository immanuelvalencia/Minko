/**
 * main.js — wiring. Owns the clip lifecycle, playback clock and every control.
 */

import { Viewer } from './viewer.js';
import { VolumeBlock } from './volume.js';
import { Effects } from './effects.js';
import {
  exportVideo,
  saveBlob,
  outputSize,
  pickMimeType,
  extensionFor,
  CAMERA_MOVES,
  ASPECTS,
  ExportCancelled,
  ExportUnsupportedError,
} from './export.js';
import {
  probeVideo,
  extractVolume,
  volumeLayout,
  UnsupportedVideoError,
  CancelledError,
} from './extractor.js';

/**
 * Block length runs from 0.3 to 80 world units, which is a wide enough range that a
 * linear slider would spend almost all its travel on lengths nobody wants. The
 * control therefore carries a 0-1 position and the length is exponential in it, so
 * short blocks stay adjustable and long ones stay reachable.
 */
const DEPTH_MIN = 0.3;
const DEPTH_MAX = 80;
const depthFromPos = (pos) => DEPTH_MIN * Math.pow(DEPTH_MAX / DEPTH_MIN, pos);
const posFromDepth = (span) =>
  Math.log(Math.max(DEPTH_MIN, span) / DEPTH_MIN) / Math.log(DEPTH_MAX / DEPTH_MIN);

/** Texel budget for the whole clip. Slice resolution shrinks to fit it. */
const VOLUME_BUDGET_BYTES = 256 * 1024 * 1024;

/* ------------------------------------------------------------------- DOM */

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('gl'),
  openBtn: $('openBtn'),
  dzBtn: $('dzBtn'),
  fileInput: $('fileInput'),
  dropzone: $('dropzone'),
  resetCamBtn: $('resetCamBtn'),
  clipMeta: $('clipMeta'),

  progressPane: $('progressPane'),
  ppTitle: $('ppTitle'),
  ppDetail: $('ppDetail'),
  ppBar: $('ppBar'),
  ppCount: $('ppCount'),
  ppCancel: $('ppCancel'),

  errorPane: $('errorPane'),
  errTitle: $('errTitle'),
  errDetail: $('errDetail'),
  errDismiss: $('errDismiss'),

  noticeBar: $('noticeBar'),
  noticeText: $('noticeText'),
  noticeClose: $('noticeClose'),

  hud: $('hud'),
  hudFrame: $('hudFrame'),
  hudMem: $('hudMem'),
  hudFps: $('hudFps'),

  playBtn: $('playBtn'),
  prevBtn: $('prevBtn'),
  nextBtn: $('nextBtn'),
  scrub: $('scrub'),
  timeLabel: $('timeLabel'),
  durLabel: $('durLabel'),
  frameLabel: $('frameLabel'),

  blockDepth: $('blockDepth'),
  depthVal: $('depthVal'),
  trailOpacity: $('trailOpacity'),
  trailOpacityVal: $('trailOpacityVal'),
  fade: $('fade'),
  fadeVal: $('fadeVal'),
  trailDesat: $('trailDesat'),
  trailDesatVal: $('trailDesatVal'),
  aheadOpacity: $('aheadOpacity'),
  aheadOpacityVal: $('aheadOpacityVal'),
  aheadDesat: $('aheadDesat'),
  aheadDesatVal: $('aheadDesatVal'),
  sliceDensity: $('sliceDensity'),
  sliceVal: $('sliceVal'),
  steps: $('steps'),
  stepsVal: $('stepsVal'),
  followCam: $('followCam'),

  tabVolume: $('tabVolume'),
  tabEffects: $('tabEffects'),
  panelVolume: $('panelVolume'),
  panelEffects: $('panelEffects'),
  fxMaster: $('fxMaster'),

  cinemaBtn: $('cinemaBtn'),
  cinemaExit: $('cinemaExit'),

  exportBtn: $('exportBtn'),
  exportPane: $('exportPane'),
  exForm: $('exForm'),
  exMove: $('exMove'),
  exMoveHint: $('exMoveHint'),
  exSeconds: $('exSeconds'),
  exFps: $('exFps'),
  exHeight: $('exHeight'),
  exAspect: $('exAspect'),
  exSummary: $('exSummary'),
  exProgress: $('exProgress'),
  exProgressText: $('exProgressText'),
  exBar: $('exBar'),
  exCancel: $('exCancel'),
  exStart: $('exStart'),
};

/**
 * The effects roster. `target` says which shader the value belongs to: the
 * raymarch for anything that depends on position inside the clip, the post pass
 * for anything screen-space.
 */
const EFFECTS = [
  { id: 'Haze',     key: 'haze',         target: 'volume' },
  { id: 'Glow',     key: 'motionGlow',   target: 'volume' },
  { id: 'Reveal',   key: 'motionReveal', target: 'volume' },
  { id: 'Streak',   key: 'streak',       target: 'post'   },
  { id: 'Chroma',   key: 'chroma',       target: 'post'   },
  { id: 'Vignette', key: 'vignette',     target: 'post'   },
  { id: 'Grain',    key: 'grain',        target: 'post'   },
];

for (const fx of EFFECTS) {
  fx.toggle = $(`fx${fx.id}`);
  fx.slider = $(`fx${fx.id}Amt`);
  fx.label = $(`fx${fx.id}Val`);
  fx.row = fx.toggle.closest('.param');
}

const SLIDERS = [
  el.blockDepth, el.trailOpacity, el.fade, el.trailDesat,
  el.aheadOpacity, el.aheadDesat, el.sliceDensity, el.steps,
];

const iPlay = el.playBtn.querySelector('.i-play');
const iPause = el.playBtn.querySelector('.i-pause');

/* ----------------------------------------------------------------- state */

const viewer = new Viewer(el.canvas);
const effects = new Effects(viewer.renderer);
viewer.setEffects(effects);
viewer.start();

/** @type {{probe:object, block:VolumeBlock, frameTimes:Float64Array, depth:number, rate:number}|null} */
let clip = null;
let playing = false;
let playhead = 0;
let abortController = null;
let busy = false;

/* ------------------------------------------------------------- utilities */

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  if (!isFinite(seconds)) return '—';
  if (seconds < 90) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Driver ceiling for any axis of a 3D texture; also caps the frame count. */
function max3DTextureSize() {
  try {
    const gl = viewer.renderer.getContext();
    return gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) || 2048;
  } catch {
    return 2048;
  }
}

/* ------------------------------------------------------------- UI helpers */

function showError(title, detail) {
  el.errTitle.textContent = title;
  el.errDetail.textContent = detail || '';
  el.errorPane.hidden = false;
}

function hideError() { el.errorPane.hidden = true; }

function showNotice(text) {
  el.noticeText.textContent = text;
  el.noticeBar.hidden = false;
}

function hideNotice() { el.noticeBar.hidden = true; }

function setProgress({ title, detail, ratio, count, indeterminate }) {
  el.progressPane.hidden = false;
  if (title !== undefined) el.ppTitle.textContent = title;
  if (detail !== undefined) el.ppDetail.textContent = detail;
  if (count !== undefined) el.ppCount.textContent = count;
  el.ppBar.classList.toggle('indeterminate', !!indeterminate);
  if (!indeterminate && ratio !== undefined) {
    el.ppBar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }
}

function hideProgress() {
  el.progressPane.hidden = true;
  el.ppBar.classList.remove('indeterminate');
  el.ppBar.style.width = '0%';
}

function setControlsEnabled(on) {
  const fxNodes = EFFECTS.flatMap((fx) => [fx.toggle, fx.slider]);
  for (const node of [el.playBtn, el.prevBtn, el.nextBtn, el.scrub, el.followCam,
                      el.resetCamBtn, el.fxMaster, el.cinemaBtn, el.exportBtn,
                      ...SLIDERS, ...fxNodes]) {
    node.disabled = !on;
  }
}

function setPlayingUI(on) {
  playing = on;
  iPlay.hidden = on;
  iPause.hidden = !on;
  el.playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
}

/* -------------------------------------------------------------- lifecycle */

function teardownClip() {
  setPlayingUI(false);
  if (clip) {
    clip.block.dispose();
    if (clip.probe.url) URL.revokeObjectURL(clip.probe.url);
    try { clip.probe.video.src = ''; clip.probe.video.load(); } catch { /* ignore */ }
    clip = null;
  }
  el.hud.hidden = true;
  el.clipMeta.hidden = true;
  setControlsEnabled(false);
  el.canvas.classList.remove('ready');
}

async function loadFile(file) {
  if (busy) return;
  busy = true;
  hideError();
  hideNotice();
  teardownClip();

  abortController = new AbortController();
  const { signal } = abortController;

  el.dropzone.hidden = true;
  setProgress({ title: 'Reading video', detail: 'Opening the file…', indeterminate: true, count: '' });

  let probe = null;

  try {
    probe = await probeVideo(file, {
      onStatus: (s) => setProgress({ detail: s, indeterminate: true }),
    });
    if (signal.aborted) throw new CancelledError();

    const maxDim = max3DTextureSize();
    const layout = volumeLayout(probe.width, probe.height, probe.totalFrames, VOLUME_BUDGET_BYTES, maxDim);

    setProgress({
      title: 'Building the volume',
      detail: `${layout.depth.toLocaleString()} slices at ${layout.width}×${layout.height} · ${formatBytes(layout.bytes)}`,
      ratio: 0,
      indeterminate: false,
      count: `0 / ${layout.depth.toLocaleString()}`,
    });

    const result = await extractVolume(probe, {
      budgetBytes: VOLUME_BUDGET_BYTES,
      maxDim,
      signal,
      onProgress: ({ done, total, etaSeconds }) => {
        setProgress({
          detail: `${layout.width}×${layout.height} slices · ${formatBytes(layout.bytes)} · about ${formatDuration(etaSeconds)} left`,
          ratio: done / total,
          count: `${done.toLocaleString()} / ${total.toLocaleString()}`,
        });
      },
    });

    if (signal.aborted) throw new CancelledError();

    buildClip(probe, result);
    hideProgress();
    reportCompromises(probe, result.layout);
  } catch (err) {
    hideProgress();

    if (err instanceof CancelledError || signal.aborted) {
      if (probe?.url) URL.revokeObjectURL(probe.url);
    } else if (err instanceof UnsupportedVideoError) {
      showError(err.message, err.detail);
      if (probe?.url) URL.revokeObjectURL(probe.url);
    } else {
      console.error(err);
      showError('Something went wrong while processing that video.', String(err?.message || err));
      if (probe?.url) URL.revokeObjectURL(probe.url);
    }

    if (!clip) el.dropzone.hidden = false;
  } finally {
    busy = false;
    abortController = null;
  }
}

/** Say plainly when the volume is not a full-resolution copy of the clip. */
function reportCompromises(probe, layout) {
  const notes = [];
  if (layout.sampled) {
    notes.push(
      `${probe.totalFrames.toLocaleString()} frames exceed this GPU's 3D texture limit, so the block holds ` +
      `${layout.depth.toLocaleString()} slices sampled evenly across the clip`
    );
  }
  if (layout.downscaled) {
    notes.push(
      `slices are ${layout.width}×${layout.height} rather than the source ${probe.width}×${probe.height}, ` +
      `to keep the volume inside ${formatBytes(VOLUME_BUDGET_BYTES)}`
    );
  }
  if (notes.length) showNotice(`${notes.join('; ')}.`);
}

function buildClip(probe, { data, layout, frameTimes }) {
  const block = new VolumeBlock(viewer.scene, {
    data,
    layout,
    aspect: probe.width / probe.height,
  });

  clip = {
    probe,
    block,
    frameTimes,
    depth: layout.depth,
    // Slices per second of playback: the block always spans the whole clip.
    rate: layout.depth / Math.max(0.001, probe.duration),
  };

  // Start with a block whose length reads well next to its own width, then let
  // the slider take over.
  const targetSpan = 2.4;
  el.blockDepth.value = String(posFromDepth(targetSpan));
  applySettings();
  applyEffects();

  playhead = 0;
  el.scrub.min = '0';
  el.scrub.max = String(layout.depth - 1);
  el.scrub.value = '0';
  el.durLabel.textContent = formatTime(probe.duration);

  viewer.frameBlock({
    blockWidth: block.blockWidth,
    blockHeight: block.blockHeight,
    depthSpan: block.depthSpan,
  });
  viewer.setFocusZ(block.zOf(0), { immediate: true });

  setCurrentFrame(0, { immediate: true });
  setControlsEnabled(true);
  el.canvas.classList.add('ready');

  el.hud.hidden = false;
  el.clipMeta.hidden = false;
  el.clipMeta.textContent =
    `${probe.file.name} · ${probe.width}×${probe.height} · ${probe.fps.toFixed(2)} fps · ` +
    `${layout.depth.toLocaleString()} slices · ${formatBytes(block.bytes)} volume`;

  document.title = `${probe.file.name} — FrameStack`;
}

/* --------------------------------------------------------------- playback */

function setCurrentFrame(index, { immediate = false } = {}) {
  if (!clip) return;
  const clamped = Math.min(clip.depth - 1, Math.max(0, index));

  clip.block.setPlayhead(clamped);
  viewer.setFocusZ(clip.block.zOf(clamped), { immediate });

  const whole = Math.round(clamped);
  if (el.scrub.value !== String(whole)) el.scrub.value = String(whole);

  el.timeLabel.textContent = formatTime(clip.frameTimes[whole] ?? 0);
  el.frameLabel.textContent = `slice ${(whole + 1).toLocaleString()} of ${clip.depth.toLocaleString()}`;
}

function applySettings() {
  const span = depthFromPos(Number(el.blockDepth.value));
  const trailOpacity = Number(el.trailOpacity.value);
  const fade = Number(el.fade.value);
  const trailDesat = Number(el.trailDesat.value);
  const aheadOpacity = Number(el.aheadOpacity.value);
  const aheadDesat = Number(el.aheadDesat.value);
  const sliceDensity = Number(el.sliceDensity.value);
  const steps = Number(el.steps.value);

  el.depthVal.textContent = span < 10 ? span.toFixed(2) : span.toFixed(1);
  el.trailOpacityVal.textContent = trailOpacity.toFixed(2);
  el.fadeVal.textContent = fade.toFixed(2);
  el.trailDesatVal.textContent = trailDesat.toFixed(2);
  el.aheadOpacityVal.textContent = aheadOpacity.toFixed(2);
  el.aheadDesatVal.textContent = aheadDesat.toFixed(2);
  el.sliceVal.textContent = sliceDensity.toFixed(2);
  el.stepsVal.textContent = String(steps);

  if (!clip) return;

  clip.block.set({
    spacing: span / Math.max(1, clip.depth),
    trailOpacity,
    // Reach spans the whole clip so every earlier frame stays in the block; the
    // fade control decides how much older ones give way, rather than clipping them.
    trailReach: clip.depth,
    trailDesat,
    aheadOpacity,
    aheadReach: clip.depth,
    aheadDesat,
    fade,
    sliceDensity,
    steps,
  });

  viewer.setFocusZ(clip.block.zOf(clip.block.playhead));
}

/**
 * Push every effect's state into whichever shader owns it. A switched-off effect
 * is sent as 0 rather than merely ignored, so the shaders can skip its work.
 */
function applyEffects() {
  const master = el.fxMaster.checked;
  const volumeValues = {};
  const postValues = {};

  for (const fx of EFFECTS) {
    const on = master && fx.toggle.checked;
    const amount = Number(fx.slider.value);

    fx.label.textContent = amount.toFixed(2);
    fx.row.classList.toggle('is-off', !on);

    const value = on ? amount : 0;
    if (fx.target === 'volume') volumeValues[fx.key] = value;
    else postValues[fx.key] = value;
  }

  effects.enabled = master;
  effects.set(postValues);
  clip?.block.set(volumeValues);
}

viewer.onFrame((dt) => {
  if (clip) {
    if (playing) {
      playhead += dt * clip.rate;
      if (playhead >= clip.depth - 1) {
        playhead = clip.depth - 1;
        setPlayingUI(false);
      }
      setCurrentFrame(playhead);
    }
    clip.block.syncCamera(viewer.camera);

    el.hudFrame.textContent =
      `${(Math.round(clip.block.playhead) + 1).toLocaleString()} / ${clip.depth.toLocaleString()}`;
    el.hudMem.textContent =
      `${clip.block.layout.width}×${clip.block.layout.height}×${clip.depth} · ${formatBytes(clip.block.bytes)}`;
  }
  el.hudFps.textContent = `${viewer.fps.toFixed(0)} fps`;
});

function togglePlay() {
  if (!clip) return;
  if (!playing && clip.block.playhead >= clip.depth - 1) {
    playhead = 0;
    setCurrentFrame(0);
  } else {
    playhead = clip.block.playhead;
  }
  setPlayingUI(!playing);
}

function step(delta) {
  if (!clip) return;
  setPlayingUI(false);
  playhead = Math.round(clip.block.playhead) + delta;
  setCurrentFrame(playhead);
}

/* ---------------------------------------------------------------- events */

el.openBtn.addEventListener('click', () => el.fileInput.click());
el.dzBtn.addEventListener('click', () => el.fileInput.click());

el.fileInput.addEventListener('change', () => {
  const file = el.fileInput.files?.[0];
  el.fileInput.value = '';
  if (file) loadFile(file);
});

el.ppCancel.addEventListener('click', () => {
  abortController?.abort();
  hideProgress();
  if (!clip) el.dropzone.hidden = false;
});

el.errDismiss.addEventListener('click', hideError);
el.noticeClose.addEventListener('click', hideNotice);

el.playBtn.addEventListener('click', togglePlay);
el.prevBtn.addEventListener('click', () => step(-1));
el.nextBtn.addEventListener('click', () => step(1));

el.scrub.addEventListener('input', () => {
  setPlayingUI(false);
  playhead = Number(el.scrub.value);
  setCurrentFrame(playhead);
});

for (const input of SLIDERS) {
  input.addEventListener('input', applySettings);
}

for (const fx of EFFECTS) {
  fx.toggle.addEventListener('change', applyEffects);
  fx.slider.addEventListener('input', () => {
    // Nudging a slider is a clear signal you want that effect, so switch it on.
    if (!fx.toggle.checked && Number(fx.slider.value) > 0) fx.toggle.checked = true;
    applyEffects();
  });
}

el.fxMaster.addEventListener('change', applyEffects);

function selectTab(which) {
  const effectsTab = which === 'effects';
  el.tabVolume.classList.toggle('is-active', !effectsTab);
  el.tabEffects.classList.toggle('is-active', effectsTab);
  el.tabVolume.setAttribute('aria-selected', String(!effectsTab));
  el.tabEffects.setAttribute('aria-selected', String(effectsTab));
  el.panelVolume.hidden = effectsTab;
  el.panelEffects.hidden = !effectsTab;
}

el.tabVolume.addEventListener('click', () => selectTab('volume'));
el.tabEffects.addEventListener('click', () => selectTab('effects'));

el.followCam.addEventListener('change', () => {
  viewer.followTarget = el.followCam.checked;
});

el.resetCamBtn.addEventListener('click', () => viewer.resetCamera());

/* ------------------------------------------------------------ cinema mode */

let idleTimer = null;

function setCinema(on) {
  document.body.classList.toggle('cinema', on);
  el.cinemaExit.hidden = !on;
  el.cinemaBtn.setAttribute('aria-pressed', String(on));
  if (!on) {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
  } else {
    markActive();
  }
  // The canvas just changed size; let the viewer catch up on the next tick.
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

/** Fade the pill and the cursor out after a few still seconds. */
function markActive() {
  if (!document.body.classList.contains('cinema')) return;
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2600);
}

el.cinemaBtn.addEventListener('click', () => setCinema(true));
el.cinemaExit.addEventListener('click', () => setCinema(false));
window.addEventListener('mousemove', markActive);
window.addEventListener('pointerdown', markActive);

/* ------------------------------------------------------------ video export */

let exportAbort = null;
let exporting = false;

for (const move of CAMERA_MOVES) {
  const opt = document.createElement('option');
  opt.value = move.id;
  opt.textContent = move.label;
  el.exMove.append(opt);
}
for (const aspect of ASPECTS) {
  const opt = document.createElement('option');
  opt.value = aspect.id;
  opt.textContent = aspect.label;
  if (aspect.id === 'wide') opt.selected = true;
  el.exAspect.append(opt);
}

function exportOptions() {
  const aspect = ASPECTS.find((a) => a.id === el.exAspect.value) || ASPECTS[0];
  const sourceAspect = clip ? clip.probe.width / clip.probe.height : 16 / 9;
  return {
    move: el.exMove.value,
    seconds: Number(el.exSeconds.value),
    fps: Number(el.exFps.value),
    height: Number(el.exHeight.value),
    aspectRatio: aspect.ratio,
    sourceAspect,
  };
}

function refreshExportSummary() {
  const o = exportOptions();
  const size = outputSize(o.height, o.aspectRatio, o.sourceAspect);
  const frames = Math.round(o.seconds * o.fps);
  const mime = pickMimeType();

  const hint = CAMERA_MOVES.find((m) => m.id === el.exMove.value)?.hint || '';
  el.exMoveHint.textContent = hint;

  el.exSummary.textContent = mime
    ? `${size.width}×${size.height} · ${frames.toLocaleString()} frames · .${extensionFor(mime)}`
    : 'This browser cannot encode video.';
  el.exStart.disabled = !mime;
}

function openExport() {
  if (!clip || exporting) return;
  el.exForm.hidden = false;
  el.exProgress.hidden = true;
  el.exStart.hidden = false;
  el.exCancel.textContent = 'Cancel';
  refreshExportSummary();
  el.exportPane.hidden = false;
}

function closeExport() {
  if (exporting) return;
  el.exportPane.hidden = true;
}

for (const node of [el.exMove, el.exSeconds, el.exFps, el.exHeight, el.exAspect]) {
  node.addEventListener('change', refreshExportSummary);
}

el.exportBtn.addEventListener('click', openExport);

el.exCancel.addEventListener('click', () => {
  if (exporting) exportAbort?.abort();
  else closeExport();
});

el.exStart.addEventListener('click', async () => {
  if (!clip || exporting) return;

  exporting = true;
  exportAbort = new AbortController();
  setPlayingUI(false);

  el.exForm.hidden = true;
  el.exProgress.hidden = false;
  el.exStart.hidden = true;
  el.exCancel.textContent = 'Stop';
  el.exBar.style.width = '0%';
  el.exProgressText.textContent = 'Starting…';

  const options = exportOptions();
  const playheadBefore = clip.block.playhead;

  try {
    const result = await exportVideo({
      viewer,
      block: clip.block,
      setPlayhead: (frame) => clip.block.setPlayhead(frame),
      ...options,
      signal: exportAbort.signal,
      onProgress: ({ done, total }) => {
        el.exBar.style.width = `${(done / total) * 100}%`;
        el.exProgressText.textContent = `Rendering frame ${done.toLocaleString()} of ${total.toLocaleString()}`;
      },
    });

    const base = (clip.probe.file.name || 'framestack').replace(/\.[^.]+$/, '');
    saveBlob(result.blob, `${base}-framestack.${extensionFor(result.mimeType)}`);

    el.exProgressText.textContent =
      `Saved ${result.width}×${result.height}, ${formatBytes(result.blob.size)}.`;
    el.exBar.style.width = '100%';
    setTimeout(() => { el.exportPane.hidden = true; }, 1600);
  } catch (err) {
    el.exportPane.hidden = true;
    if (err instanceof ExportCancelled) {
      // nothing to say: the user stopped it
    } else if (err instanceof ExportUnsupportedError) {
      showError(err.message, err.detail);
    } else {
      console.error(err);
      showError('The export failed.', String(err?.message || err));
    }
  } finally {
    exporting = false;
    exportAbort = null;
    clip?.block.setPlayhead(playheadBefore);
    setCurrentFrame(playheadBefore, { immediate: true });
  }
});

/* drag and drop anywhere on the stage */

const stage = el.canvas.parentElement;
let dragDepth = 0;

for (const type of ['dragenter', 'dragover']) {
  stage.addEventListener(type, (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (type === 'dragenter') dragDepth++;
    el.dropzone.classList.add('dragover');
    if (!clip && !busy) el.dropzone.hidden = false;
  });
}

stage.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) el.dropzone.classList.remove('dragover');
});

stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
  else if (clip) el.dropzone.hidden = true;
});

/* keyboard */

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.target instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (exporting) return;

  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); step(e.shiftKey ? -10 : -1); break;
    case 'ArrowRight': e.preventDefault(); step(e.shiftKey ? 10 : 1); break;
    case 'Home': e.preventDefault(); setPlayingUI(false); playhead = 0; setCurrentFrame(0); break;
    case 'End':
      if (clip) { e.preventDefault(); setPlayingUI(false); playhead = clip.depth - 1; setCurrentFrame(playhead); }
      break;
    case 'r': case 'R': viewer.resetCamera(); break;
    case 'c': case 'C':
      if (clip) setCinema(!document.body.classList.contains('cinema'));
      break;
    case 'Escape':
      if (!el.exportPane.hidden) closeExport();
      else if (document.body.classList.contains('cinema')) setCinema(false);
      break;
    case 'e': case 'E': openExport(); break;
    default: break;
  }
});

/* ------------------------------------------------------------------ boot */

setControlsEnabled(false);
applySettings();
applyEffects();
refreshExportSummary();

if (!viewer.renderer.capabilities.isWebGL2) {
  showError(
    'WebGL2 is not available in this browser.',
    'FrameStack raymarches a 3D texture, which needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari.'
  );
}

window.addEventListener('beforeunload', () => {
  if (clip?.probe?.url) URL.revokeObjectURL(clip.probe.url);
});

/* --------------------------------------------------------------- debug API
 * Exposed for automated checks and for the planned Supabase layer, which will
 * hand loadFile() a Blob pulled from storage instead of a picked File.
 */
window.FrameStack = {
  load: loadFile,
  get state() {
    if (!clip) return { ready: false };
    return {
      ready: true,
      name: clip.probe.file.name,
      source: `${clip.probe.width}x${clip.probe.height}`,
      fps: clip.probe.fps,
      duration: clip.probe.duration,
      volume: `${clip.block.layout.width}x${clip.block.layout.height}x${clip.depth}`,
      volumeBytes: clip.block.bytes,
      sampled: clip.block.layout.sampled,
      downscaled: clip.block.layout.downscaled,
      playhead: clip.block.playhead,
      playing,
      viewerFps: Math.round(viewer.fps),
      cameraZ: Number(viewer.camera.position.z.toFixed(3)),
      targetZ: Number(viewer.controls.target.z.toFixed(3)),
      settings: { ...clip.block.settings },
    };
  },
  seek: (i) => { setPlayingUI(false); playhead = i; setCurrentFrame(i); },
  cinema: setCinema,
  openExport,
  play: togglePlay,
  viewer,
  effects,
  get block() { return clip?.block ?? null; },
  get effectState() {
    return {
      master: el.fxMaster.checked,
      post: { ...effects.settings },
      postActive: effects.active,
      volume: clip
        ? { haze: clip.block.settings.haze,
            motionGlow: clip.block.settings.motionGlow,
            motionReveal: clip.block.settings.motionReveal }
        : null,
    };
  },
};
