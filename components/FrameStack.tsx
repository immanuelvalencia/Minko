'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Viewer } from '@/lib/viewer.js';
import { VolumeBlock } from '@/lib/volume.js';
import { Effects } from '@/lib/effects.js';
import {
  probeVideo,
  extractVolume,
  volumeLayout,
  UnsupportedVideoError,
  CancelledError,
} from '@/lib/extractor.js';
import { exportVideo, saveBlob, extensionFor, ExportCancelled, ExportUnsupportedError } from '@/lib/export.js';

import {
  EFFECTS,
  VOLUME_CONTROLS,
  DEFAULT_CONTROLS,
  VOLUME_BUDGET_BYTES,
  depthFromPos,
  initialEffectState,
  type EffectState,
  type VolumeControl,
} from './config';
import VolumePanel from './VolumePanel';
import EffectsPanel from './EffectsPanel';
import ExportDialog, { type ExportOptions } from './ExportDialog';
import { Dropzone, ProgressPane, ErrorPane, Notice, AboutPane } from './Overlays';

/* --------------------------------------------------------------- helpers */

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDuration(seconds: number) {
  if (!isFinite(seconds)) return '—';
  if (seconds < 90) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

type ClipInfo = {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  depth: number;
  volumeBytes: number;
  sliceWidth: number;
  sliceHeight: number;
};

type ProgressState = { title: string; detail: string; ratio: number | null; count: string };

const DEMOS = [
  { id: 'kinetic-bounce', title: 'Kinetic Bounce', description: 'A ball tracing motion through space.' },
  { id: 'dvd-corner-chase', title: 'DVD Corner Chase', description: 'A classic screensaver path study.' },
];

const SETTINGS_KEY = 'framestack.viewer-settings.v1';

function loadSavedSettings(): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------- component */

export default function FrameStack() {
  const savedSettings = useMemo(loadSavedSettings, []);
  // The canvas is created imperatively inside the boot effect rather than
  // rendered by React. A WebGL context belongs to a canvas element for its
  // lifetime, so StrictMode's double mount would otherwise hand the second
  // Viewer the first one's dead context. A fresh element each mount avoids it.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The engine lives in refs: it runs its own loop and must not be rebuilt by a
  // React render. React owns the chrome, never the frame.
  const viewerRef = useRef<any>(null);
  const effectsRef = useRef<any>(null);
  const blockRef = useRef<any>(null);
  const probeRef = useRef<any>(null);
  const frameTimesRef = useRef<Float64Array | null>(null);
  const playRef = useRef({ playing: false, head: 0, rate: 1 });
  const loopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<'volume' | 'effects'>('volume');
  const [cinema, setCinema] = useState(false);
  const [idle, setIdle] = useState(false);
  const [hud, setHud] = useState({ fps: 0 });

  const [controls, setControls] = useState<Record<VolumeControl['key'], number>>(() => ({ ...DEFAULT_CONTROLS, ...savedSettings.controls }));
  const [effectState, setEffectState] = useState<Record<string, EffectState>>(() => {
    const defaults = initialEffectState();
    return Object.fromEntries(Object.entries(defaults).map(([id, value]) => [id, { ...value, ...(savedSettings.effectState?.[id] || {}) }]));
  });
  const [effectsOn, setEffectsOn] = useState<boolean>(savedSettings.effectsOn ?? true);
  const [followCamera, setFollowCamera] = useState<boolean>(savedSettings.followCamera ?? true);
  const [showBorder, setShowBorder] = useState<boolean>(savedSettings.showBorder ?? true);
  const [loop, setLoop] = useState<boolean>(savedSettings.loop ?? false);
  const [playbackRate, setPlaybackRate] = useState<number>(savedSettings.playbackRate ?? 1);
  const [showOriginal, setShowOriginal] = useState<boolean>(savedSettings.showOriginal ?? false);
  // A lower temporal cap keeps very long clips practical. Frames are sampled
  // evenly over the entire duration, never truncated.
  const [temporalLimit, setTemporalLimit] = useState<number>(savedSettings.temporalLimit ?? 0);

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportStatus, setExportStatus] = useState('');

  /* ------------------------------------------------------------ engine boot */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const viewer = new Viewer(canvas);
    const effects = new Effects(viewer.renderer);
    viewer.setEffects(effects);
    viewer.start();

    viewerRef.current = viewer;
    effectsRef.current = effects;

    if (!viewer.renderer.capabilities.isWebGL2) {
      setError({
        title: 'WebGL2 is not available in this browser.',
        detail:
          'FrameStack raymarches a 3D texture, which needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari.',
      });
    }

    const stop = viewer.onFrame((dt: number) => {
      const block = blockRef.current;
      if (block) {
        const state = playRef.current;
        if (state.playing) {
          state.head += dt * state.rate;
          if (state.head >= block.depth - 1) {
            if (loopRef.current) {
              state.head = 0;
            } else {
              state.head = block.depth - 1;
              state.playing = false;
              setPlaying(false);
            }
          }
          block.setPlayhead(state.head);
          viewer.setFocusZ(block.zOf(state.head));
          // Only re-render when the whole frame number changes, not every tick.
          setPlayhead((prev) =>
            Math.round(prev) === Math.round(state.head) ? prev : state.head
          );
        }
        block.syncCamera(viewer.camera);
      }
      setHud((prev) => {
        const next = Math.round(viewer.fps);
        return prev.fps === next ? prev : { fps: next };
      });
    });

    setReady(true);

    return () => {
      stop();
      blockRef.current?.dispose();
      blockRef.current = null;
      viewer.dispose();
      viewerRef.current = null;
      effectsRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  }, []);

  /* --------------------------------------------------------- push settings */

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;

    const span = depthFromPos(controls.blockDepth);
    const volumeEffects: Record<string, number> = {};
    for (const fx of EFFECTS) {
      if (fx.target !== 'volume') continue;
      const s = effectState[fx.id];
      volumeEffects[fx.key] = effectsOn && s.on ? s.amount : 0;
    }

    block.set({
      spacing: span / Math.max(1, block.depth),
      aheadOpacity: controls.aheadOpacity,
      aheadDesat: controls.aheadDesat,
      aheadReach: block.depth,
      trailOpacity: controls.trailOpacity,
      trailDesat: controls.trailDesat,
      trailReach: block.depth,
      fade: controls.fade,
      sliceDensity: controls.sliceDensity,
      steps: controls.steps,
      ...volumeEffects,
    });

    viewerRef.current?.setFocusZ(block.zOf(block.playhead));
  }, [controls, effectState, effectsOn, clip]);

  useEffect(() => {
    const effects = effectsRef.current;
    if (!effects) return;
    const post: Record<string, number> = {};
    for (const fx of EFFECTS) {
      if (fx.target !== 'post') continue;
      const s = effectState[fx.id];
      post[fx.key] = effectsOn && s.on ? s.amount : 0;
    }
    effects.enabled = effectsOn;
    effects.set(post);
  }, [effectState, effectsOn]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.followTarget = followCamera;
  }, [followCamera]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    const block = blockRef.current;
    const probe = probeRef.current;
    if (block && probe) playRef.current.rate = (block.depth / Math.max(0.001, probe.duration)) * playbackRate;
  }, [clip, playbackRate]);

  useEffect(() => {
    blockRef.current?.setEdgesVisible(showBorder);
  }, [showBorder, clip]);

  useEffect(() => {
    canvasRef.current?.classList.toggle('ready', !!clip);
  }, [clip]);

  // Keep the original clip in lockstep with the frame stack. During normal
  // playback the browser video clock runs smoothly; seeking corrects any drift.
  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video || !clip || !showOriginal) return;
    const targetTime = (playhead / Math.max(1, clip.depth - 1)) * clip.duration;
    video.playbackRate = playbackRate;
    if (Math.abs(video.currentTime - targetTime) > 0.12) video.currentTime = targetTime;
    if (playing) video.play().catch(() => { /* muted preview can safely remain paused */ });
    else video.pause();
  }, [clip, playhead, playbackRate, playing, showOriginal]);

  // Preferences belong to this browser only; source video data remains local and
  // is never stored or uploaded. Saving after each change also survives a reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        controls, effectState, effectsOn, followCamera, showBorder, loop,
        playbackRate, temporalLimit, showOriginal,
      }));
    } catch {
      // Private browsing or a full storage quota should not break the viewer.
    }
  }, [controls, effectState, effectsOn, followCamera, showBorder, loop, playbackRate, temporalLimit, showOriginal]);

  /* ------------------------------------------------------------- seeking */

  const seek = useCallback((frame: number) => {
    const block = blockRef.current;
    const viewer = viewerRef.current;
    if (!block || !viewer) return;
    const clamped = Math.min(block.depth - 1, Math.max(0, frame));
    playRef.current.head = clamped;
    block.setPlayhead(clamped);
    viewer.setFocusZ(block.zOf(clamped));
    setPlayhead(clamped);
  }, []);

  const pause = useCallback(() => {
    playRef.current.playing = false;
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const block = blockRef.current;
    if (!block) return;
    const state = playRef.current;
    if (!state.playing && block.playhead >= block.depth - 1) {
      seek(0);
    } else {
      state.head = block.playhead;
    }
    state.playing = !state.playing;
    setPlaying(state.playing);
  }, [seek]);

  const step = useCallback(
    (delta: number) => {
      const block = blockRef.current;
      if (!block) return;
      pause();
      seek(Math.round(block.playhead) + delta);
    },
    [pause, seek]
  );

  const jumpTo = useCallback((frame: number) => {
    pause();
    seek(frame);
  }, [pause, seek]);

  /* ------------------------------------------------------------- loading */

  const loadFile = useCallback(async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setNotice(null);
    pause();

    blockRef.current?.dispose();
    blockRef.current = null;
    if (probeRef.current?.url) URL.revokeObjectURL(probeRef.current.url);
    probeRef.current = null;
    setClip(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setProgress({ title: 'Reading video', detail: 'Opening the file…', ratio: null, count: '' });

    let probe: any = null;
    try {
      probe = await probeVideo(file, {
        onStatus: (s: string) =>
          setProgress((p) => (p ? { ...p, detail: s } : p)),
      });
      if (signal.aborted) throw new CancelledError();

      const viewer = viewerRef.current;
      const gl = viewer.renderer.getContext();
      const maxDim = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) || 2048;
      const maxDepth = temporalLimit > 0 ? Math.min(maxDim, temporalLimit) : maxDim;

      const layout = volumeLayout(probe.width, probe.height, probe.totalFrames, VOLUME_BUDGET_BYTES, maxDim, maxDepth);

      setProgress({
        title: 'Building the frame stack',
        detail: `${layout.depth.toLocaleString()} slices at ${layout.width}×${layout.height} · ${formatBytes(layout.bytes)}`,
        ratio: 0,
        count: `0 / ${layout.depth.toLocaleString()}`,
      });

      // The renderer modules are intentionally plain JavaScript, so their
      // structured result is not inferred across the TS boundary.
      const result: any = await extractVolume(probe, {
        budgetBytes: VOLUME_BUDGET_BYTES,
        maxDim,
        maxDepth,
        signal,
        onProgress: ({ done, total, etaSeconds }: { done: number; total: number; etaSeconds: number }) =>
          setProgress({
            title: 'Building the frame stack',
            detail: `${layout.width}×${layout.height} slices · ${formatBytes(layout.bytes)} · about ${formatDuration(etaSeconds)} left`,
            ratio: done / total,
            count: `${done.toLocaleString()} / ${total.toLocaleString()}`,
          }),
      });
      if (signal.aborted) throw new CancelledError();

      const block = new VolumeBlock(viewer.scene, {
        data: result.data,
        layout: result.layout,
        aspect: probe.width / probe.height,
      });

      blockRef.current = block;
      probeRef.current = probe;
      frameTimesRef.current = result.frameTimes;
      playRef.current = {
        playing: false,
        head: 0,
        rate: result.layout.depth / Math.max(0.001, probe.duration),
      };

      viewer.frameBlock({
        blockWidth: block.blockWidth,
        blockHeight: block.blockHeight,
        depthSpan: block.depthSpan,
      });
      viewer.setFocusZ(block.zOf(0), { immediate: true });
      block.setPlayhead(0);

      setClip({
        name: file.name,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        duration: probe.duration,
        depth: result.layout.depth,
        volumeBytes: block.bytes,
        sliceWidth: result.layout.width,
        sliceHeight: result.layout.height,
      });
      setPlayhead(0);
      setProgress(null);

      const notes: string[] = [];
      if (result.layout.sampled) {
        notes.push(
          temporalLimit > 0
            ? `${probe.totalFrames.toLocaleString()} source frames were reduced to ${result.layout.depth.toLocaleString()} evenly spaced slices for the selected long-video mode`
            : `${probe.totalFrames.toLocaleString()} frames exceed this GPU's 3D texture limit, so the block holds ${result.layout.depth.toLocaleString()} slices sampled evenly across the clip`
        );
      }
      if (result.layout.downscaled) {
        notes.push(
          `slices are ${result.layout.width}×${result.layout.height} rather than the source ${probe.width}×${probe.height}, to keep the frame stack inside ${formatBytes(VOLUME_BUDGET_BYTES)}`
        );
      }
      if (notes.length) setNotice(`${notes.join('; ')}.`);
    } catch (err: any) {
      setProgress(null);
      if (probe?.url && !blockRef.current) URL.revokeObjectURL(probe.url);
      if (err instanceof CancelledError || signal.aborted) {
        // user stopped it
      } else if (err instanceof UnsupportedVideoError) {
        setError({ title: err.message, detail: err.detail });
      } else {
        console.error(err);
        setError({ title: 'Something went wrong while processing that video.', detail: String(err?.message ?? err) });
      }
    } finally {
      busyRef.current = false;
      abortRef.current = null;
    }
  }, [pause, temporalLimit]);

  const loadDemo = useCallback(async (id: string) => {
    const demo = DEMOS.find((item) => item.id === id);
    if (!demo) return;
    try {
      const response = await fetch(`/demos/${demo.id}.mp4`);
      if (!response.ok) throw new Error(`Demo could not be loaded (${response.status}).`);
      const blob = await response.blob();
      await loadFile(new File([blob], `${demo.title}.mp4`, { type: 'video/mp4' }));
    } catch (err: any) {
      setError({ title: 'Could not load the demo video.', detail: String(err?.message ?? err) });
    }
  }, [loadFile]);

  /* -------------------------------------------------------------- export */

  const runExport = useCallback(
    async (options: ExportOptions) => {
      const block = blockRef.current;
      const viewer = viewerRef.current;
      if (!block || !viewer || !probeRef.current) return;

      pause();
      setExporting(true);
      setExportProgress(null);
      setExportStatus('Starting…');

      const controller = new AbortController();
      abortRef.current = controller;
      const before = block.playhead;
      let originalPost: any = null;
      let originalVolume: any = null;

      try {
        const sourceDuration = probeRef.current.duration;
        const effects = effectsRef.current;
        originalPost = effects ? { ...effects.settings, enabled: effects.enabled } : null;
        originalVolume = block.settings
          ? { haze: block.settings.haze, motionGlow: block.settings.motionGlow, motionReveal: block.settings.motionReveal }
          : null;

        if (options.cinematic) {
          // This treatment is export-only: it makes the chosen camera move read
          // as a film pass without changing the interactive viewer controls.
          block.set({ haze: Math.max(Number(block.settings?.haze) || 0, 0.42), motionGlow: Math.max(Number(block.settings?.motionGlow) || 0, 0.48) });
          effects?.set({
            streak: Math.max(effects.settings.streak, 0.28),
            chroma: Math.max(effects.settings.chroma, 0.16),
            vignette: Math.max(effects.settings.vignette, 0.56),
            grain: Math.max(effects.settings.grain, 0.14),
          });
          if (effects) effects.enabled = true;
        }
        // The watermark is part of the encoded frame, never a DOM overlay, so it
        // appears reliably in the downloaded MP4 at every chosen resolution.
        if (effects) {
          effects.enabled = true;
          effects.set({ watermark: 1 });
        }

        const result = await exportVideo({
          viewer,
          block,
          setPlayhead: (frame: number) => block.setPlayhead(frame),
          ...options,
          seconds: sourceDuration,
          sourceAspect: probeRef.current.width / probeRef.current.height,
          signal: controller.signal,
          onProgress: (p: { done: number; total: number }) => setExportProgress(p),
        });

        const base = (probeRef.current.file?.name ?? 'framestack').replace(/\.[^.]+$/, '');
        saveBlob(result.blob, `${base}-framestack.${extensionFor(result.mimeType)}`);
        setExportStatus(`Saved ${result.width}×${result.height}, ${formatBytes(result.blob.size)}.`);
        setTimeout(() => setExportOpen(false), 1400);
      } catch (err: any) {
        setExportOpen(false);
        if (err instanceof ExportCancelled) {
          // user stopped it
        } else if (err instanceof ExportUnsupportedError) {
          setError({ title: err.message, detail: err.detail });
        } else {
          console.error(err);
          setError({ title: 'The export failed.', detail: String(err?.message ?? err) });
        }
      } finally {
        // Restore the interactive look even if recording or encoding fails.
        const effects = effectsRef.current;
        // exportVideo restores the camera itself; the React effects state remains
        // the authority after this one-off export treatment.
        if (effects) {
          const post: Record<string, number> = {};
          for (const fx of EFFECTS) {
            if (fx.target === 'post') post[fx.key] = effectsOn && effectState[fx.id].on ? effectState[fx.id].amount : 0;
          }
          effects.enabled = effectsOn;
          effects.set({ ...post, watermark: originalPost?.watermark ?? 0 });
        }
        if (originalVolume) block.set(originalVolume);
        setExporting(false);
        setExportProgress(null);
        abortRef.current = null;
        block.setPlayhead(before);
        seek(before);
      }
    },
    [pause, seek, effectState, effectsOn]
  );

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type !== 'range') return;
      if (target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (exporting) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          step(e.shiftKey ? -10 : -1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          step(e.shiftKey ? 10 : 1);
          break;
        case 'Home':
          e.preventDefault();
          pause();
          seek(0);
          break;
        case 'End':
          if (blockRef.current) {
            e.preventDefault();
            pause();
            seek(blockRef.current.depth - 1);
          }
          break;
        case 'r':
        case 'R':
          viewerRef.current?.resetCamera();
          break;
        case 'c':
        case 'C':
          if (clip) setCinema((v) => !v);
          break;
        case 'e':
        case 'E':
          if (clip) setExportOpen(true);
          break;
        case 'Escape':
          if (exportOpen) setExportOpen(false);
          else if (aboutOpen) setAboutOpen(false);
          else setCinema(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aboutOpen, clip, exportOpen, exporting, pause, seek, step, togglePlay]);

  /* --------------------------------------------------------- cinema idle */

  useEffect(() => {
    if (!cinema) {
      setIdle(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2600);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [cinema]);

  // The canvas changes size when the chrome hides; nudge the viewer's observer.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [cinema]);

  useEffect(() => {
    document.body.classList.toggle('cinema', cinema);
    document.body.classList.toggle('idle', cinema && idle);
    return () => {
      document.body.classList.remove('cinema', 'idle');
    };
  }, [cinema, idle]);

  useEffect(() => {
    document.body.classList.toggle('exporting-video', exporting || exportOpen);
    return () => document.body.classList.remove('exporting-video');
  }, [exporting, exportOpen]);

  /* ---------------------------------------------------------------- view */

  const currentFrame = Math.round(playhead);
  // `clip` is in the deps because frameTimesRef changes with it; without it a new
  // clip loading at frame 0 would keep the previous clip's timestamp.
  const timeLabel = useMemo(() => {
    const times = frameTimesRef.current;
    return formatTime(times ? times[currentFrame] ?? 0 : 0);
  }, [currentFrame, clip]);

  const metaLine = clip
    ? `${clip.name} · ${clip.width}×${clip.height} · ${clip.fps.toFixed(2)} fps · ${clip.depth.toLocaleString()} slices · ${formatBytes(clip.volumeBytes)} frame stack`
    : '';

  const disabled = !clip;

  return (
    <div id="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 24" aria-hidden="true">
            <rect x="1" y="5" width="17" height="12" rx="1.5" opacity=".28" />
            <rect x="5" y="6.5" width="17" height="12" rx="1.5" opacity=".55" />
            <rect x="9" y="8" width="17" height="12" rx="1.5" />
          </svg>
          <div className="brand-text">
            <h1>FrameStack</h1>
            <p>width × height × time</p>
          </div>
        </div>

        <div className="topbar-actions">
          {clip && <span className="clip-meta">{metaLine}</span>}
          <label className="sampling-select" title="Lower sample counts make longer videos faster to process; the full duration is always retained.">
            <span>Video length</span>
            <select value={temporalLimit} disabled={!!clip} onChange={(e) => setTemporalLimit(Number(e.target.value))}>
              <option value={0}>Full detail</option>
              <option value={1024}>Long video · 1,024 samples</option>
              <option value={512}>Very long · 512 samples</option>
            </select>
          </label>
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={() => viewerRef.current?.resetCamera()}>
            Reset view
          </button>
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={() => viewerRef.current?.frontCamera()}>
            Front view
          </button>
          <button className={showOriginal ? 'btn btn-ghost is-active' : 'btn btn-ghost'} type="button" disabled={disabled} aria-pressed={showOriginal} onClick={() => setShowOriginal((value) => !value)}>
            Side by side
          </button>
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={() => setCinema(true)}>
            Cinema
          </button>
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={() => setExportOpen(true)}>
            Export
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <button className="btn btn-primary" type="button" onClick={() => fileInputRef.current?.click()}>
            Open video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) loadFile(file);
            }}
          />
        </div>
      </header>

      <main
        className={showOriginal && clip ? 'stage stage-split' : 'stage'}
        onDragEnter={(e) => {
          if (!e.dataTransfer?.types?.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer?.types?.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) loadFile(file);
        }}
      >
        <div className="canvas-host" ref={hostRef} />
        {showOriginal && clip && (
          <section className="source-preview" aria-label="Original video preview">
            <span className="source-preview-label">Original video</span>
            <video
              ref={sourceVideoRef}
              src={probeRef.current?.url}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                video.currentTime = (playRef.current.head / Math.max(1, clip.depth - 1)) * clip.duration;
                video.playbackRate = playbackRate;
                if (playRef.current.playing) video.play().catch(() => {});
              }}
            />
          </section>
        )}

        {!clip && !progress && (
          <Dropzone dragging={dragging} onChoose={() => fileInputRef.current?.click()} demos={DEMOS} onDemo={loadDemo} />
        )}

        {progress && (
          <ProgressPane
            {...progress}
            onCancel={() => {
              abortRef.current?.abort();
              setProgress(null);
            }}
          />
        )}

        {error && <ErrorPane {...error} onDismiss={() => setError(null)} />}
        {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
        {aboutOpen && <AboutPane onClose={() => setAboutOpen(false)} />}

        {cinema && (
          <button className="cinema-pill" type="button" onClick={() => setCinema(false)}>
            Show controls <kbd>C</kbd>
          </button>
        )}

        {exportOpen && clip && (
          <ExportDialog
            sourceAspect={clip.width / clip.height}
            duration={clip.duration}
            busy={exporting}
            progress={exportProgress}
            statusText={exportStatus}
            onStart={runExport}
            onStop={() => abortRef.current?.abort()}
            onClose={() => setExportOpen(false)}
          />
        )}

        {clip && (
          <div className="hud">
            <span className="mono">
              {(currentFrame + 1).toLocaleString()} / {clip.depth.toLocaleString()}
            </span>
            <span className="hud-sep" />
            <span className="mono">
              {clip.sliceWidth}×{clip.sliceHeight}×{clip.depth} · {formatBytes(clip.volumeBytes)}
            </span>
            <span className="hud-sep" />
            <span className="mono">{hud.fps} fps</span>
          </div>
        )}
      </main>

      {clip && <footer className="controls">
        <div className="transport">
          <button
            className="btn btn-icon"
            type="button"
            disabled={disabled}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={togglePlay}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.6 2.9h2.6v10.2H4.6zM8.8 2.9h2.6v10.2H8.8z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 2.8v10.4L13 8Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button className="btn btn-icon btn-sm" type="button" disabled={disabled} aria-label="Previous frame" onClick={() => step(-1)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 3.2v9.6L4.6 8Z" fill="currentColor" />
              <rect x="10.9" y="3.2" width="1.5" height="9.6" fill="currentColor" opacity=".55" />
            </svg>
          </button>
          <button className="btn btn-icon btn-sm" type="button" disabled={disabled} aria-label="Jump to start" onClick={() => jumpTo(0)}>
            <span aria-hidden="true">⏮</span>
          </button>
          <button className="btn btn-icon btn-sm" type="button" disabled={disabled} aria-label="Next frame" onClick={() => step(1)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 3.2v9.6L11.4 8Z" fill="currentColor" />
              <rect x="3.6" y="3.2" width="1.5" height="9.6" fill="currentColor" opacity=".55" />
            </svg>
          </button>
          <button className="btn btn-icon btn-sm" type="button" disabled={disabled} aria-label="Jump to end" onClick={() => jumpTo((clip?.depth ?? 1) - 1)}>
            <span aria-hidden="true">⏭</span>
          </button>

          <label className="transport-select">
            <span className="sr-only">Playback speed</span>
            <select value={playbackRate} disabled={disabled} aria-label="Playback speed" onChange={(e) => setPlaybackRate(Number(e.target.value))}>
              {[0.25, 0.5, 1, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
          <button
            className={loop ? 'btn btn-icon btn-sm is-active' : 'btn btn-icon btn-sm'}
            type="button"
            disabled={disabled}
            aria-label={loop ? 'Disable loop' : 'Enable loop'}
            aria-pressed={loop}
            onClick={() => setLoop((value) => !value)}
          >
            <span aria-hidden="true">↻</span>
          </button>

          <div className="scrub">
            <input
              className="slider slider-scrub"
              type="range"
              min={0}
              max={clip ? clip.depth - 1 : 0}
              step={1}
              value={currentFrame}
              disabled={disabled}
              aria-label="Timeline"
              onChange={(e) => {
                pause();
                seek(Number(e.target.value));
              }}
            />
          </div>

          <div className="readout">
            <span className="mono time">{timeLabel}</span>
            <span className="readout-sep">/</span>
            <span className="mono time dim">{formatTime(clip?.duration ?? 0)}</span>
            <span className="readout-frame mono">
              slice {(currentFrame + 1).toLocaleString()} of {(clip?.depth ?? 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="param-tabs">
          <div className="tabstrip" role="tablist">
            <button
              className={tab === 'volume' ? 'tab is-active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'volume'}
              onClick={() => setTab('volume')}
            >
              Frame stack
            </button>
            <button
              className={tab === 'effects' ? 'tab is-active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'effects'}
              onClick={() => setTab('effects')}
            >
              Effects
            </button>
          </div>
          <label className="fx-master" htmlFor="fxMaster">
            <span className="fx-master-label">All effects</span>
            <span className="switch switch-sm">
              <input
                id="fxMaster"
                type="checkbox"
                checked={effectsOn}
                disabled={disabled}
                onChange={(e) => setEffectsOn(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>
        </div>

        {tab === 'volume' ? (
          <VolumePanel
            values={controls}
            followCamera={followCamera}
            showBorder={showBorder}
            disabled={disabled}
            onChange={(key, value) => setControls((prev) => ({ ...prev, [key]: value }))}
            onFollowChange={setFollowCamera}
            onBorderChange={setShowBorder}
          />
        ) : (
          <EffectsPanel
            state={effectState}
            disabled={disabled}
            onChange={(id, next) =>
              setEffectState((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }))
            }
          />
        )}
      </footer>}

      {!ready && null}
    </div>
  );
}
