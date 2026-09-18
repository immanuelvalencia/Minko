/**
 * extractor.js — turns a video file into an ordered list of compressed frame blobs.
 *
 * Strategy: deterministic seek-and-capture. We step `currentTime` to the midpoint of
 * every frame interval and draw the settled video into a canvas. This is slower than a
 * WebCodecs pipeline but needs no demuxer, works on every format the browser can play,
 * and guarantees we land on *every* frame rather than whatever the compositor happened
 * to present.
 *
 * Frames are stored as compressed blobs, not raw bitmaps. A 1080p RGBA bitmap is ~8 MB;
 * a few hundred of those would exhaust memory long before they reached the GPU. Blobs at
 * plane resolution are ~20-40 KB, and frameStore.js decodes them to textures on demand.
 */

const SEEK_TIMEOUT_MS = 8000;
const FPS_PROBE_FRAMES = 24;
const FPS_PROBE_TIMEOUT_MS = 2500;

export class UnsupportedVideoError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'UnsupportedVideoError';
    this.detail = detail || '';
  }
}

/** Signals a user-initiated cancel; callers swallow this rather than surfacing it. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

/* ------------------------------------------------------------------ probing */

/**
 * Load a file into a <video> and work out its geometry, duration and frame rate.
 * Throws UnsupportedVideoError for anything the browser refuses to decode.
 */
export async function probeVideo(file, { onStatus } = {}) {
  if (!file) throw new UnsupportedVideoError('No file supplied.');

  const looksLikeVideo =
    (file.type && file.type.startsWith('video/')) ||
    /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i.test(file.name || '');

  if (!looksLikeVideo) {
    throw new UnsupportedVideoError(
      'That does not look like a video file.',
      `${file.name || 'file'} reports type "${file.type || 'unknown'}".`
    );
  }

  onStatus?.('Reading file…');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = url;

  try {
    await waitForMetadata(video, file);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  const duration = await resolveDuration(video);

  if (!width || !height) {
    URL.revokeObjectURL(url);
    throw new UnsupportedVideoError(
      'The browser could not decode any video track.',
      'The file may be audio-only, or use a codec this browser does not support.'
    );
  }
  if (!isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new UnsupportedVideoError(
      'This video has no usable duration.',
      'The container carries no length, and the decoder could not work one out.'
    );
  }

  onStatus?.('Measuring frame rate…');
  const { fps, exact } = await detectFrameRate(video, duration);

  const totalFrames = Math.max(1, Math.round(duration * fps));

  return { file, url, video, width, height, duration, fps, fpsExact: exact, totalFrames };
}

function waitForMetadata(video, file) {
  return new Promise((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', ok);
      video.removeEventListener('error', bad);
      clearTimeout(timer);
    };
    const ok = () => { if (done) return; done = true; cleanup(); resolve(); };
    const bad = () => {
      if (done) return; done = true; cleanup();
      reject(new UnsupportedVideoError(
        'This browser cannot play that video.',
        describeMediaError(video.error, file)
      ));
    };

    const timer = setTimeout(() => {
      if (done) return; done = true; cleanup();
      reject(new UnsupportedVideoError(
        'Timed out while reading the video.',
        'The file may be corrupt, or too large to open from disk.'
      ));
    }, 30000);

    video.addEventListener('loadedmetadata', ok, { once: true });
    video.addEventListener('error', bad, { once: true });
  });
}

/**
 * Recover a usable duration.
 *
 * Files produced by MediaRecorder — screen recordings, anything captured in a
 * browser — ship without a duration in the container, and report Infinity until
 * the decoder has been pushed past the end. Seeking to a absurd timestamp forces
 * it to settle on the real value.
 */
function resolveDuration(video) {
  if (isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(video.duration);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('durationchange', onChange);
      video.removeEventListener('timeupdate', onChange);
      clearTimeout(timer);
      const found = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      try { video.currentTime = 0; } catch { /* ignore */ }
      resolve(found);
    };

    const onChange = () => {
      if (isFinite(video.duration) && video.duration > 0) finish();
    };

    const timer = setTimeout(finish, 5000);
    video.addEventListener('durationchange', onChange);
    video.addEventListener('timeupdate', onChange);

    try {
      video.currentTime = 1e7;
    } catch {
      finish();
    }
  });
}

function describeMediaError(error, file) {
  const name = file?.name ? `"${file.name}"` : 'The file';
  if (!error) return `${name} could not be opened.`;
  switch (error.code) {
    case 1: return 'Loading was aborted.';
    case 2: return 'A network error interrupted loading.';
    case 3: return `${name} is corrupt, or uses a codec this browser cannot decode.`;
    case 4: return `${name} uses a container or codec this browser does not support. Try an MP4 (H.264) or WebM.`;
    default: return `${name} could not be decoded (code ${error.code}).`;
  }
}

/**
 * Measure real frame rate from presentation timestamps.
 * requestVideoFrameCallback gives us `mediaTime` per presented frame; the median gap
 * between consecutive frames is the frame interval. Falls back to 30 fps.
 */
async function detectFrameRate(video, duration) {
  if (typeof video.requestVideoFrameCallback !== 'function') {
    return { fps: 30, exact: false };
  }

  const times = [];

  const collected = await new Promise((resolve) => {
    let handle = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (handle != null && video.cancelVideoFrameCallback) {
        try { video.cancelVideoFrameCallback(handle); } catch { /* ignore */ }
      }
      video.pause();
      resolve(times.slice());
    };

    const timer = setTimeout(finish, FPS_PROBE_TIMEOUT_MS);

    const step = (_now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= FPS_PROBE_FRAMES) return finish();
      handle = video.requestVideoFrameCallback(step);
    };

    try { video.currentTime = 0; } catch { /* ignore */ }
    handle = video.requestVideoFrameCallback(step);
    video.play().catch(finish);
  });

  video.pause();
  try { video.currentTime = 0; } catch { /* ignore */ }

  const deltas = [];
  for (let i = 1; i < collected.length; i++) {
    const d = collected[i] - collected[i - 1];
    if (d > 1e-4 && d < 1) deltas.push(d);
  }

  if (deltas.length < 4) return { fps: 30, exact: false };

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  let fps = 1 / median;

  // Snap to a common broadcast rate when we are within ~2%, so 29.97 does not
  // silently become 29.94 and drift a frame across a long clip.
  const COMMON = [8, 10, 12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120];
  for (const c of COMMON) {
    if (Math.abs(fps - c) / c < 0.02) { fps = c; break; }
  }

  fps = Math.min(120, Math.max(1, fps));

  // Sanity: a clip cannot have fewer than one frame.
  if (!isFinite(fps) || duration * fps < 1) return { fps: 30, exact: false };

  return { fps, exact: true };
}

/* --------------------------------------------------------------- extraction */

/**
 * Work out the volume's dimensions.
 *
 * Every frame becomes one slice along the temporal axis, so depth is fixed by the
 * clip. That leaves the per-slice resolution to absorb the memory budget: the more
 * frames, the smaller each slice. We never upscale beyond the source, and we never
 * exceed the driver's 3D texture limit in any axis.
 *
 * @param {number} budgetBytes  RGBA texel budget for the whole volume
 * @param {number} maxDim       gl.MAX_3D_TEXTURE_SIZE
 */
export function volumeLayout(srcWidth, srcHeight, frameCount, budgetBytes, maxDim, maxDepth = maxDim) {
  const depth = Math.min(frameCount, maxDepth);
  const sampled = depth < frameCount;

  const budgetTexels = Math.max(1, Math.floor(budgetBytes / 4));
  const perSlice = Math.max(256, Math.floor(budgetTexels / depth));

  const aspect = srcWidth / srcHeight;
  let height = Math.sqrt(perSlice / aspect);
  let width = height * aspect;

  // Never upscale, never exceed the driver limit.
  const scale = Math.min(1, srcWidth / width, srcHeight / height, maxDim / width, maxDim / height);
  width = Math.max(8, Math.floor(width * scale));
  height = Math.max(8, Math.floor(height * scale));

  return {
    width,
    height,
    depth,
    sampled,
    downscaled: width < srcWidth || height < srcHeight,
    bytes: width * height * depth * 4,
  };
}

/**
 * Decode the clip into one contiguous RGBA volume, slice by slice.
 *
 * The array is laid out the way WebGL wants a 3D texture: x fastest, then y, then
 * z (time). Rows stay in canvas order — top-down — and the shader flips v.
 *
 * @returns {Promise<{data: Uint8Array, layout: object, frameTimes: Float64Array}>}
 */
export async function extractVolume(probe, options = {}) {
  const {
    budgetBytes = 256 * 1024 * 1024,
    maxDim = 2048,
    maxDepth = maxDim,
    signal,
    onProgress,
  } = options;

  const { video, duration, fps, totalFrames } = probe;

  const layout = volumeLayout(probe.width, probe.height, totalFrames, budgetBytes, maxDim, maxDepth);
  const { width, height, depth } = layout;

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!ctx) throw new UnsupportedVideoError('Could not create a drawing surface.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let data;
  try {
    data = new Uint8Array(layout.bytes);
  } catch {
    throw new UnsupportedVideoError(
      'Not enough memory to build the volume for this clip.',
      `${(layout.bytes / 1048576).toFixed(0)} MB was needed for ${depth.toLocaleString()} slices.`
    );
  }

  const sliceTexels = width * height;
  const sliceBytes = sliceTexels * 4;
  const frameTimes = new Float64Array(depth);

  video.pause();
  const startedAt = performance.now();

  for (let z = 0; z < depth; z++) {
    if (signal?.aborted) throw new CancelledError();

    // When the clip has more frames than the texture can hold, spread the slices
    // evenly across the whole timeline rather than truncating it.
    const frameIndex = layout.sampled
      ? Math.round((z * (totalFrames - 1)) / Math.max(1, depth - 1))
      : z;

    const t = Math.min((frameIndex + 0.5) / fps, Math.max(0, duration - 1e-3));
    frameTimes[z] = t;

    await seekTo(video, t, signal);
    ctx.drawImage(video, 0, 0, width, height);

    const pixels = ctx.getImageData(0, 0, width, height).data;
    data.set(pixels, z * sliceBytes);

    if (onProgress && (z % 2 === 0 || z === depth - 1)) {
      const done = z + 1;
      const elapsed = performance.now() - startedAt;
      const rate = done / (elapsed / 1000);
      onProgress({
        done,
        total: depth,
        bytes: done * sliceBytes,
        etaSeconds: rate > 0 ? (depth - done) / rate : Infinity,
      });
    }
  }

  return { data, layout, frameTimes };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function seekTo(video, time, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onSeeked = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const onError = () => {
      if (settled) return; settled = true; cleanup();
      reject(new UnsupportedVideoError('Decoding failed partway through the video.',
        'The file may be truncated or damaged.'));
    };
    const onAbort = () => { if (settled) return; settled = true; cleanup(); reject(new CancelledError()); };
    const timer = setTimeout(() => {
      if (settled) return; settled = true; cleanup();
      reject(new UnsupportedVideoError('Timed out seeking within the video.',
        `The decoder stopped responding around ${time.toFixed(2)}s.`));
    }, SEEK_TIMEOUT_MS);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });

    if (Math.abs(video.currentTime - time) < 1e-6) {
      settled = true; cleanup(); resolve(); return;
    }
    try {
      video.currentTime = time;
    } catch (err) {
      if (settled) return; settled = true; cleanup(); reject(err);
    }
  });
}
