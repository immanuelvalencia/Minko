/**
 * effects.js — screen-space pass applied after the volume is drawn.
 *
 * The scene renders into an offscreen target, then one fullscreen shader adds the
 * effects that only make sense in screen space: radial streaks smeared out from
 * the centre, chromatic fringing that grows toward the edges, a vignette, and
 * grain. Anything that depends on where a sample sits *inside* the clip — haze,
 * motion — belongs in the raymarch instead and lives in volume.js.
 *
 * When every effect is off the whole pass is skipped and the scene renders
 * straight to the canvas, so this costs nothing until it is switched on.
 */

import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uStreak;
uniform float uChroma;
uniform float uVignette;
uniform float uGrain;

varying vec2 vUv;

const int TAPS = 6;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec2 toEdge = uv - 0.5;
  float radius = length(toEdge) * 2.0;

  vec3 col;

  if (uStreak > 0.0 || uChroma > 0.0) {
    // Smear each channel back toward the centre by a slightly different amount.
    // The shared loop means chromatic fringing rides along the streaks instead of
    // fighting them, which is what makes it read as speed rather than as a glitch.
    float reach = uStreak * 0.22 * radius;
    float split = uChroma * 0.010 * radius;

    vec3 sum = vec3(0.0);
    float weight = 0.0;

    for (int i = 0; i < TAPS; i++) {
      float f = float(i) / float(TAPS - 1);
      float w = 1.0 - f * 0.65;
      float pull = 1.0 - reach * f;

      sum.r += texture2D(tDiffuse, 0.5 + toEdge * (pull + split)).r * w;
      sum.g += texture2D(tDiffuse, 0.5 + toEdge * pull).g * w;
      sum.b += texture2D(tDiffuse, 0.5 + toEdge * (pull - split)).b * w;
      weight += w;
    }
    col = sum / weight;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }

  if (uVignette > 0.0) {
    col *= mix(1.0, smoothstep(1.45, 0.35, radius), uVignette);
  }

  if (uGrain > 0.0) {
    float n = hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
    col += n * uGrain * 0.10;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Effects {
  constructor(renderer) {
    this.renderer = renderer;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    // The volume shader writes display-ready values and no pass converts colour
    // space, so keep the round trip through the target equally untouched.
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.target.texture.generateMipmaps = false;
    this.target.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.target.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uTime: { value: 0 },
        uStreak: { value: 0 },
        uChroma: { value: 0 },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.settings = { streak: 0, chroma: 0, vignette: 0.4, grain: 0 };
    this.enabled = true;
  }

  /** True when the pass would actually change anything. */
  get active() {
    if (!this.enabled) return false;
    const s = this.settings;
    return s.streak > 0 || s.chroma > 0 || s.vignette > 0 || s.grain > 0;
  }

  set(partial) {
    Object.assign(this.settings, partial);
    const u = this.material.uniforms;
    u.uStreak.value = this.settings.streak;
    u.uChroma.value = this.settings.chroma;
    u.uVignette.value = this.settings.vignette;
    u.uGrain.value = this.settings.grain;
  }

  setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.target.setSize(w, h);
  }

  render(renderer, timeMs) {
    this.material.uniforms.uTime.value = timeMs / 1000;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
