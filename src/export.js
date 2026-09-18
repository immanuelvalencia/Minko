/**
 * export.js — records a cinematic pass through the block to a video file.
 *
 * Capture is frame-accurate rather than real-time. `captureStream(0)` hands back a
 * track that produces a frame only when asked, so each output frame is rendered,
 * pushed, and only then is the next one started. A slow machine therefore makes a
 * slow export, never a stuttering video — which is the opposite of what happens if
 * you let MediaRecorder sample the canvas on a clock.
 */

export const CAMERA_MOVES = [
  { id: 'fly',    label: 'Fly through',  hint: 'Travels down the time axis, from before the first frame to past the last.' },
  { id: 'orbit',  label: 'Slow orbit',   hint: 'Circles the block while time advances.' },
  { id: 'drift',  label: 'Drift in',     hint: 'A three-quarter view easing closer as it goes.' },
  { id: 'hold',   label: 'Hold camera',  hint: 'Keeps your current view; only the playhead moves.' },
];

export const ASPECTS = [
  { id: 'source', label: 'Source', ratio: null },
  { id: 'wide',   label: '16:9',   ratio: 16 / 9 },
  { id: 'scope',  label: '2.39:1 anamorphic', ratio: 2.39 },
];

export class ExportCancelled extends Error {
  constructor() { super('cancelled'); this.name = 'ExportCancelled'; }
}

export class ExportUnsupportedError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'ExportUnsupportedError';
    this.detail = detail || '';
  }
}

/** Pick the best container this browser will actually encode. */
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return null;
}

export function extensionFor(mimeType) {
  return mimeType && mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Output pixel size from a height and a target aspect. */
export function outputSize(height, aspectRatio, sourceAspect) {
  const ratio = aspectRatio || sourceAspect || 16 / 9;
  const h = Math.max(2, Math.round(height / 2) * 2);
  const w = Math.max(2, Math.round((h * ratio) / 2) * 2);
  return { width: w, height: h };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Position the camera for a normalised point along the move.
 * `t` is eased already; this only describes shape.
 */
function applyMove(move, t, ctx) {
  const { camera, controls, block, home } = ctx;
  const span = block.depthSpan;
  const reach = Math.max(block.blockWidth, block.blockHeight);
  const near = -span / 2;
  const far = span / 2;

  switch (move) {
    case 'fly': {
      // Start outside the near face and finish past the far one, looking along time.
      const z = lerp(near - reach * 1.5, far + reach * 0.6, t);
      camera.position.set(
        Math.sin(t * Math.PI * 2) * reach * 0.05,
        Math.sin(t * Math.PI) * reach * 0.06,
        z
      );
      controls.target.set(0, 0, z + reach * 1.2);
      break;
    }
    case 'orbit': {
      const angle = -0.7 + t * 1.9;
      const radius = Math.max(span * 0.62, reach * 2.1);
      const centreZ = lerp(near, far, t) * 0.35;
      camera.position.set(
        Math.sin(angle) * radius,
        reach * lerp(0.75, 0.42, t),
        centreZ - Math.cos(angle) * radius
      );
      controls.target.set(0, 0, centreZ);
      break;
    }
    case 'drift': {
      const pull = lerp(1.35, 0.72, t);
      const z = lerp(near - reach * 1.1, near + span * 0.45, t);
      camera.position.set(
        reach * 1.25 * pull,
        reach * 0.68 * pull,
        z
      );
      controls.target.set(0, 0, lerp(near, far * 0.5, t));
      break;
    }
    case 'hold':
    default: {
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      break;
    }
  }
  camera.lookAt(controls.target);
}

/**
 * Render and record the whole move.
 *
 * @returns {Promise<{blob: Blob, mimeType: string, width: number, height: number, frames: number}>}
 */
export async function exportVideo({
  viewer,
  block,
  setPlayhead,
  move = 'fly',
  seconds = 12,
  fps = 30,
  height = 1080,
  aspectRatio = null,
  sourceAspect = 16 / 9,
  signal,
  onProgress,
}) {
  const canvas = viewer.canvas;

  if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new ExportUnsupportedError(
      'This browser cannot record the canvas.',
      'Canvas capture needs a recent Chrome, Edge or Firefox.'
    );
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new ExportUnsupportedError(
      'No video encoder is available in this browser.',
      'MediaRecorder reported no supported container.'
    );
  }

  const size = outputSize(height, aspectRatio, sourceAspect);
  const totalFrames = Math.max(2, Math.round(seconds * fps));

  // Remember where the camera was so "hold" can use it and so the session is
  // handed back exactly as it was found.
  const home = {
    position: viewer.camera.position.clone(),
    target: viewer.controls.target.clone(),
  };
  const followWasOn = viewer.followTarget;
  const dampingWasOn = viewer.controls.enableDamping;

  viewer.stop();
  viewer.followTarget = false;
  viewer.controls.enableDamping = false;
  viewer.beginOffline(size.width, size.height);

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  if (!track) {
    viewer.endOffline();
    viewer.controls.enableDamping = dampingWasOn;
    viewer.followTarget = followWasOn;
    viewer.start();
    throw new ExportUnsupportedError('The canvas produced no video track.');
  }

  const bitsPerSecond = Math.min(
    40_000_000,
    Math.max(4_000_000, Math.round(size.width * size.height * fps * 0.12))
  );

  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const finished = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(e.error || new Error('Recording failed.'));
  });

  const ctx = { camera: viewer.camera, controls: viewer.controls, block, home };
  let cancelled = false;

  try {
    recorder.start();

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) { cancelled = true; break; }

      const raw = i / (totalFrames - 1);
      const eased = smooth(raw);

      applyMove(move, eased, ctx);
      setPlayhead(eased * (block.depth - 1));

      viewer.renderFrame(0, performance.now());
      track.requestFrame();

      onProgress?.({ done: i + 1, total: totalFrames });

      // Yield so the compositor can pick the frame up and the UI stays alive.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    track.stop();

    viewer.endOffline();
    viewer.controls.enableDamping = dampingWasOn;
    viewer.followTarget = followWasOn;
    viewer.camera.position.copy(home.position);
    viewer.controls.target.copy(home.target);
    viewer.camera.lookAt(home.target);
    viewer.controls.update();
    viewer.start();
  }

  await finished;

  if (cancelled || signal?.aborted) throw new ExportCancelled();

  const blob = new Blob(chunks, { type: mimeType });
  if (!blob.size) {
    throw new ExportUnsupportedError(
      'The recording came back empty.',
      'The browser produced no encoded data for the canvas stream.'
    );
  }

  return { blob, mimeType, width: size.width, height: size.height, frames: totalFrames };
}

/** Hand the finished recording to the user as a download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
