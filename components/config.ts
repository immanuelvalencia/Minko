/**
 * The control panel is generated from these tables rather than hand-written, which
 * is the main thing the React rewrite buys: adding an effect is one row here, not
 * a block of markup plus a DOM lookup plus a listener.
 */

export type VolumeSettings = {
  spacing: number;
  aheadOpacity: number;
  aheadDesat: number;
  aheadReach: number;
  trailOpacity: number;
  trailDesat: number;
  trailReach: number;
  fade: number;
  sliceDensity: number;
  sliceFrames: number;
  steps: number;
  exposure: number;
  haze: number;
  motionGlow: number;
  motionReveal: number;
};

export type PostSettings = {
  streak: number;
  chroma: number;
  vignette: number;
  grain: number;
};

/** Sliders on the Volume tab. `key` is either a block setting or a UI-only value. */
export type VolumeControl = {
  key: 'blockDepth' | 'aheadOpacity' | 'fade' | 'aheadDesat' | 'trailOpacity' | 'trailDesat' | 'sliceDensity' | 'steps';
  label: string;
  min: number;
  max: number;
  step: number;
  /** How many decimals to show, or 0 for a whole number. */
  decimals: number;
};

export const VOLUME_CONTROLS: VolumeControl[] = [
  { key: 'blockDepth',   label: 'Block depth',        min: 0,    max: 1,   step: 0.001, decimals: 2 },
  { key: 'aheadOpacity', label: 'Block opacity',      min: 0,    max: 1,   step: 0.01,  decimals: 2 },
  { key: 'fade',         label: 'Fade with distance', min: 0,    max: 1,   step: 0.01,  decimals: 2 },
  { key: 'aheadDesat',   label: 'Block desaturation', min: 0,    max: 1,   step: 0.01,  decimals: 2 },
  { key: 'trailOpacity', label: 'Trail opacity',      min: 0,    max: 1,   step: 0.01,  decimals: 2 },
  { key: 'trailDesat',   label: 'Trail desaturation', min: 0,    max: 1,   step: 0.01,  decimals: 2 },
  { key: 'sliceDensity', label: 'Slice strength',     min: 0.05, max: 1,   step: 0.01,  decimals: 2 },
  { key: 'steps',        label: 'Ray quality',        min: 96,   max: 768, step: 16,    decimals: 0 },
];

/**
 * Effects. `target` says which shader owns the value: the raymarch for anything
 * that depends on where a sample sits inside the clip, the post pass for anything
 * screen-space.
 */
export type EffectDef = {
  id: string;
  label: string;
  target: 'volume' | 'post';
  key: keyof VolumeSettings | keyof PostSettings;
  defaultOn: boolean;
  defaultAmount: number;
};

export const EFFECTS: EffectDef[] = [
  { id: 'haze',     label: 'Depth haze',     target: 'volume', key: 'haze',         defaultOn: true,  defaultAmount: 0.35 },
  { id: 'glow',     label: 'Motion glow',    target: 'volume', key: 'motionGlow',   defaultOn: false, defaultAmount: 0.6  },
  { id: 'reveal',   label: 'Motion reveal',  target: 'volume', key: 'motionReveal', defaultOn: false, defaultAmount: 0.8  },
  { id: 'streak',   label: 'Warp streaks',   target: 'post',   key: 'streak',       defaultOn: false, defaultAmount: 0.5  },
  { id: 'chroma',   label: 'Chromatic warp', target: 'post',   key: 'chroma',       defaultOn: false, defaultAmount: 0.45 },
  { id: 'vignette', label: 'Vignette',       target: 'post',   key: 'vignette',     defaultOn: true,  defaultAmount: 0.4  },
  { id: 'grain',    label: 'Film grain',     target: 'post',   key: 'grain',        defaultOn: false, defaultAmount: 0.35 },
];

export type EffectState = { on: boolean; amount: number };

export const initialEffectState = (): Record<string, EffectState> =>
  Object.fromEntries(EFFECTS.map((e) => [e.id, { on: e.defaultOn, amount: e.defaultAmount }]));

/**
 * Block length spans 0.3 to 80 world units. A linear slider would spend nearly all
 * its travel on lengths nobody wants, so the control carries a 0-1 position and the
 * length is exponential in it.
 */
export const DEPTH_MIN = 0.3;
export const DEPTH_MAX = 80;
export const depthFromPos = (pos: number) => DEPTH_MIN * Math.pow(DEPTH_MAX / DEPTH_MIN, pos);
export const posFromDepth = (span: number) =>
  Math.log(Math.max(DEPTH_MIN, span) / DEPTH_MIN) / Math.log(DEPTH_MAX / DEPTH_MIN);

export const DEFAULT_CONTROLS: Record<VolumeControl['key'], number> = {
  blockDepth: posFromDepth(2.4),
  aheadOpacity: 1,
  fade: 0,
  aheadDesat: 0,
  trailOpacity: 0.22,
  trailDesat: 0.8,
  sliceDensity: 0.85,
  steps: 320,
};

/** Texel budget for the whole clip. Slice resolution shrinks to fit it. */
export const VOLUME_BUDGET_BYTES = 256 * 1024 * 1024;
