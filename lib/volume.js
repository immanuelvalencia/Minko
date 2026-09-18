/**
 * volume.js — the clip as one solid block.
 *
 * Instead of drawing a plane per frame, the whole clip is uploaded once as a 3D
 * texture (x, y, time) and a single box is raymarched through it. Two things fall
 * out of that:
 *
 *   - There is no gap between frames. Trilinear filtering interpolates along the
 *     temporal axis exactly as it does across x and y, so a pixel moving through
 *     the clip draws a continuous streak through the block rather than a dotted
 *     line of separate planes.
 *   - It is one draw call and one texture, whatever the frame count.
 *
 * The playhead is a bright slice travelling through the block. Frames behind it
 * form the desaturated trail; frames ahead stay as a faint shell.
 */

import * as THREE from 'three';

const VERT = /* glsl */`
uniform vec3 uCameraLocal;

out vec3 vOrigin;
out vec3 vDirection;

void main() {
  vOrigin = uCameraLocal;
  vDirection = position - uCameraLocal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;

in vec3 vOrigin;
in vec3 vDirection;

layout(location = 0) out vec4 outColor;

uniform sampler3D uVolume;
uniform vec3  uBoxSize;
uniform float uDepth;
uniform float uPlayhead;
uniform float uSliceFrames;
uniform float uSliceDensity;

uniform float uTrailDensity;
uniform float uTrailReach;
uniform float uTrailDesat;

uniform float uAheadDensity;
uniform float uAheadReach;
uniform float uAheadDesat;

// 0 = every frame in range keeps full weight, 1 = weight falls off with age.
uniform float uFade;

uniform float uSteps;
uniform float uExposure;

// ---- effects. Each is inert at 0, and the branches are uniform-driven, so a
// ---- disabled effect costs nothing per fragment beyond the compare.
uniform float uHaze;          // far end of the block dissolves into the void
uniform vec3  uHazeColor;
uniform float uMotionGlow;    // moving pixels emit light
uniform float uMotionReveal;  // still pixels turn transparent
uniform vec3  uGlowColor;

vec2 hitBox(vec3 ro, vec3 rd) {
  vec3 halfSize = uBoxSize * 0.5;   // uBoxSize is (1,1,1): the mesh carries the scale
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-halfSize - ro) * inv;
  vec3 t1 = ( halfSize - ro) * inv;
  vec3 lo = min(t0, t1);
  vec3 hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

/** Local point -> (colour, per-frame density) at that moment in the clip. */
vec4 sampleVolume(vec3 p, float bandFrames) {
  vec3 n = p / uBoxSize + 0.5;

  // Two flips, both deliberate:
  //   u — the default camera sits on the -z side so frame 0 is the near face, and
  //       from there world +x runs leftwards across the screen. Without this the
  //       picture is mirrored and text reads backwards.
  //   v — slices are stored in canvas row order, top-down, the opposite of the
  //       box's +y.
  vec3 tc = vec3(1.0 - n.x, 1.0 - n.y, n.z);

  float frame = n.z * uDepth;
  float d = frame - uPlayhead;
  float ad = abs(d);

  vec3 rgb = texture(uVolume, tc).rgb;

  // How much this pixel is changing at this moment, from the slices either side.
  // This is the one quantity both motion effects are built on, so it is computed
  // once and only when something actually wants it.
  float motion = 0.0;
  if (uMotionGlow > 0.0 || uMotionReveal > 0.0) {
    float dz = 1.5 / uDepth;
    vec3 before = texture(uVolume, vec3(tc.xy, clamp(tc.z - dz, 0.0, 1.0))).rgb;
    vec3 after  = texture(uVolume, vec3(tc.xy, clamp(tc.z + dz, 0.0, 1.0))).rgb;
    motion = clamp(length(after - before) * 2.0, 0.0, 1.0);
  }

  float density;
  float desat;
  if (d < 0.0) {
    float fade = 1.0 - smoothstep(0.0, max(uTrailReach, 1.0), ad);
    density = uTrailDensity * mix(1.0, fade, uFade);
    desat = uTrailDesat;
  } else {
    float fade = 1.0 - smoothstep(0.0, max(uAheadReach, 1.0), ad);
    density = uAheadDensity * mix(1.0, fade, uFade);
    desat = uAheadDesat;
  }

  // The playhead: full colour, high density, over a band that is never thinner
  // than one marching step so it cannot be stepped over.
  float slice = 1.0 - smoothstep(0.0, bandFrames, ad);
  density = mix(density, uSliceDensity, slice);
  desat = mix(desat, 0.0, slice);

  // Dissolve whatever is holding still, so only the moving part of the clip is
  // left hanging in the volume and you fly through it.
  if (uMotionReveal > 0.0) {
    density *= mix(1.0, smoothstep(0.02, 0.35, motion), uMotionReveal);
  }

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(rgb, vec3(luma), clamp(desat, 0.0, 1.0));

  // Glow is additive colour, so it would tint the very frame you are trying to
  // read. Fade it out across the playhead band and leave the present frame true.
  //
  // Motion reveal deliberately does NOT get the same treatment: it works by
  // dissolving material, and sparing the playhead would leave an opaque slice
  // blocking the view into everything the effect just opened up.
  if (uMotionGlow > 0.0) {
    rgb += uGlowColor * motion * uMotionGlow * 1.5 * (1.0 - slice);
  }

  return vec4(rgb, clamp(density, 0.0, 1.0));
}

void main() {
  vec3 rd = normalize(vDirection);
  vec2 bounds = hitBox(vOrigin, rd);
  bounds.x = max(bounds.x, 0.0);
  if (bounds.x >= bounds.y) discard;

  float span = bounds.y - bounds.x;
  float dt = span / uSteps;

  // Density is quoted per frame-thickness of material. One frame is 1/uDepth of the
  // box, so this converts a step into the number of frame-thicknesses it crosses.
  //
  // Deliberately isotropic: it does NOT scale by the ray's component along time.
  // Doing that would be physically tidy and visually useless — a ray travelling
  // perpendicular to the time axis crosses zero frames, so the block would
  // disappear the moment you orbited to look at it side-on. Treating the material
  // as uniform means the block reads with the same weight from every angle, while
  // the trail/ahead falloff still shades it along time.
  float unitsPerStep = max(dt * uDepth, 1e-4);

  // The playhead band must be at least as thick as one step, or a coarse march
  // steps straight over the bright slice.
  float bandFrames = max(uSliceFrames, unitsPerStep * 1.5);

  vec4 acc = vec4(0.0);

  for (int i = 0; i < 1024; i++) {
    if (float(i) >= uSteps) break;

    float t = bounds.x + (float(i) + 0.5) * dt;
    if (t > bounds.y) break;

    vec4 s = sampleVolume(vOrigin + rd * t, bandFrames);

    if (uHaze > 0.0) {
      float into = t - bounds.x;
      s.rgb = mix(s.rgb, uHazeColor, 1.0 - exp(-uHaze * into * 2.5));
    }

    float a = 1.0 - pow(1.0 - s.a, unitsPerStep);

    acc.rgb += (1.0 - acc.a) * s.rgb * a;
    acc.a   += (1.0 - acc.a) * a;

    if (acc.a > 0.995) break;
  }

  if (acc.a <= 0.002) discard;

  outColor = vec4(acc.rgb * uExposure, acc.a);
}
`;

export class VolumeBlock {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts
   * @param {Uint8Array} opts.data   RGBA volume, x fastest then y then z
   * @param {object} opts.layout     {width, height, depth}
   * @param {number} opts.aspect     source video aspect ratio
   */
  constructor(scene, { data, layout, aspect }) {
    this.scene = scene;
    this.layout = layout;
    this.depth = layout.depth;

    this.texture = new THREE.Data3DTexture(data, layout.width, layout.height, layout.depth);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.wrapR = THREE.ClampToEdgeWrapping;
    this.texture.unpackAlignment = 4;
    this.texture.needsUpdate = true;

    this.blockHeight = 1;
    this.blockWidth = aspect;

    this.settings = {
      spacing: 0.006,
      // Opacity is per frame, not per block: at 1.0 the very first slice a ray
      // meets is already opaque, which is what makes the near face read as frame 0
      // and the far face as the last frame rather than a smear of the first twenty.
      aheadOpacity: 1,
      aheadDesat: 0,
      aheadReach: 1,
      // The played-through region is thinned out so you can see into the block.
      trailOpacity: 0.22,
      trailDesat: 0.8,
      trailReach: 1,
      fade: 0,
      sliceDensity: 0.85,
      sliceFrames: 1,
      steps: 320,
      exposure: 1,

      haze: 0.35,
      motionGlow: 0,
      motionReveal: 0,
    };

    this.playhead = 0;

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uVolume: { value: this.texture },
        uCameraLocal: { value: new THREE.Vector3() },
        uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
        uDepth: { value: layout.depth },
        uPlayhead: { value: 0 },
        uSliceFrames: { value: 1 },
        uSliceDensity: { value: 0.85 },
        uTrailDensity: { value: 0.02 },
        uTrailReach: { value: 1 },
        uTrailDesat: { value: 0.7 },
        uAheadDensity: { value: 0.001 },
        uAheadReach: { value: 1 },
        uAheadDesat: { value: 0.5 },
        uFade: { value: 0.25 },
        uSteps: { value: 320 },
        uExposure: { value: 1 },
        uHaze: { value: 0 },
        uHazeColor: { value: new THREE.Color(0x070810) },
        uMotionGlow: { value: 0 },
        uMotionReveal: { value: 0 },
        uGlowColor: { value: new THREE.Color(0x6fb0ff) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      transparent: true,
      // The march accumulates colour already multiplied by coverage.
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.edges = this._makeEdges();
    scene.add(this.edges);

    this.applyGeometry();
    this.applySettings();
  }

  get bytes() {
    return this.layout.width * this.layout.height * this.layout.depth * 4;
  }

  /** Length of the block along the time axis, in world units. */
  get depthSpan() {
    return Math.max(this.settings.spacing, this.depth * this.settings.spacing);
  }

  /** World-space z of a frame. Frame 0 sits at the near face. */
  zOf(frame) {
    const span = this.depthSpan;
    return (frame / Math.max(1, this.depth)) * span - span / 2;
  }

  applyGeometry() {
    const span = this.depthSpan;
    // The geometry stays a unit cube and the transform carries the real extents, so
    // uBoxSize stays (1,1,1) — the shader works entirely in the box's local space.
    this.mesh.scale.set(this.blockWidth, this.blockHeight, span);
    this.edges.scale.set(this.blockWidth, this.blockHeight, span);
  }

  set(partial) {
    Object.assign(this.settings, partial);
    if ('spacing' in partial) this.applyGeometry();
    this.applySettings();
  }

  setPlayhead(frame) {
    this.playhead = Math.min(this.depth - 1, Math.max(0, frame));
    this.material.uniforms.uPlayhead.value = this.playhead;
  }

  /** Show or hide the rectangular volume outline without changing the render. */
  setEdgesVisible(visible) {
    this.edges.visible = visible;
  }

  applySettings() {
    const s = this.settings;
    const u = this.material.uniforms;

    // Sliders are per-frame density, curved so the low end — where a translucent
    // trail lives — has usable resolution, while 1.0 stays exactly opaque.
    u.uTrailDensity.value = density(s.trailOpacity);
    u.uAheadDensity.value = density(s.aheadOpacity);

    u.uTrailReach.value = s.trailReach;
    u.uTrailDesat.value = s.trailDesat;
    u.uAheadReach.value = s.aheadReach;
    u.uAheadDesat.value = s.aheadDesat;

    u.uFade.value = s.fade;
    u.uSliceDensity.value = s.sliceDensity;
    u.uSliceFrames.value = s.sliceFrames;
    u.uSteps.value = s.steps;
    u.uExposure.value = s.exposure;

    u.uHaze.value = s.haze;
    u.uMotionGlow.value = s.motionGlow;
    u.uMotionReveal.value = s.motionReveal;
  }

  /** Call once per rendered frame: the shader needs the camera in box space. */
  syncCamera(camera) {
    const local = this.material.uniforms.uCameraLocal.value;
    local.copy(camera.position);
    this.mesh.updateMatrixWorld();
    this.mesh.worldToLocal(local);
  }

  _makeEdges() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const mat = new THREE.LineBasicMaterial({
      color: 0x3f4d6b,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      depthTest: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = -1;
    lines.frustumCulled = false;
    return lines;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.edges);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.edges.geometry.dispose();
    this.edges.material.dispose();
  }
}

/**
 * Slider position -> per-frame density.
 *
 * Cubic, so most of the travel covers the thin densities that make a see-through
 * trail, and the top of the range is a genuinely solid 1.0.
 */
function density(value) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * v;
}
