/**
 * viewer.js — renderer, camera, orbit controls and the render loop.
 *
 * Time runs along +Z and the block is centred on the origin, so frame 0 sits at
 * the near face and the clip recedes away from the default camera. Scrubbing
 * forward carries the camera deeper into the block.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // Required so canvas.captureStream() can read a frame back after render;
      // without it exported frames come back black on some drivers.
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x07080c, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.02, 8000);
    this.camera.position.set(1.6, 1.0, 2.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 6000;
    this.controls.zoomSpeed = 0.9;
    this.controls.rotateSpeed = 0.85;
    this.controls.panSpeed = 0.9;

    this.homeOffset = new THREE.Vector3(1.6, 1.0, 2.6);
    this.desiredTargetZ = 0;
    this.followTarget = true;

    /** @type {import('./effects.js').Effects|null} */
    this.effects = null;

    this._frameCallbacks = new Set();
    this._running = false;
    this._lastTime = performance.now();
    this._fpsSmoothed = 0;

    this._onResize = this._onResize.bind(this);
    this._loop = this._loop.bind(this);

    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(canvas.parentElement || canvas);
    window.addEventListener('resize', this._onResize);

    canvas.addEventListener('pointerdown', () => canvas.classList.add('grabbing'));
    window.addEventListener('pointerup', () => canvas.classList.remove('grabbing'));

    this._onResize();
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  /** Register a per-frame callback; returns an unsubscribe function. */
  onFrame(fn) {
    this._frameCallbacks.add(fn);
    return () => this._frameCallbacks.delete(fn);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this.renderer.setAnimationLoop(this._loop);
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  /**
   * Choose a starting camera that makes the layering obvious: off to one side,
   * slightly above, far enough back that several planes are visible at once.
   */
  frameBlock({ blockWidth, blockHeight, depthSpan }) {
    const reach = Math.max(blockWidth, blockHeight);
    const back = Math.max(reach * 1.9, Math.min(depthSpan, reach * 4) * 0.85);

    // Negative z: the camera sits in front of the block's first frame and looks
    // down the time axis, so the opening view is frame 0 with the clip behind it.
    this.homeOffset.set(reach * 1.15, reach * 0.72, -back);
    this.controls.minDistance = reach * 0.08;
    this.controls.maxDistance = Math.max(reach * 40, depthSpan * 4 + reach * 10);
    this.camera.near = Math.max(0.01, reach * 0.004);
    this.camera.far = Math.max(2000, depthSpan * 8 + reach * 80);
    this.camera.updateProjectionMatrix();

    this.resetCamera();
  }

  resetCamera() {
    const target = new THREE.Vector3(0, 0, this.desiredTargetZ);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(this.homeOffset);
    this.camera.lookAt(target);
    this.controls.update();
  }

  /**
   * Slide the orbit pivot to the selected frame so it stays in view as time
   * advances, without moving any plane: the camera moves, the stack does not.
   */
  setFocusZ(z, { immediate = false } = {}) {
    this.desiredTargetZ = z;
    if (immediate || !this.followTarget) {
      const dz = z - this.controls.target.z;
      this.controls.target.z = z;
      this.camera.position.z += dz;
      this.controls.update();
    }
  }

  _loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;

    if (dt > 0) {
      const inst = 1 / dt;
      this._fpsSmoothed = this._fpsSmoothed ? this._fpsSmoothed * 0.9 + inst * 0.1 : inst;
    }

    if (this.followTarget) {
      const dz = this.desiredTargetZ - this.controls.target.z;
      if (Math.abs(dz) > 1e-5) {
        const step = dz * Math.min(1, dt * 9);
        this.controls.target.z += step;
        this.camera.position.z += step;
      }
    }

    this.renderFrame(dt, now);
  }

  /** One full frame: callbacks, controls, then the render (via the post pass). */
  renderFrame(dt, now) {
    for (const fn of this._frameCallbacks) fn(dt, now);

    this.controls.update();

    if (this.effects && this.effects.active) {
      this.renderer.setRenderTarget(this.effects.target);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.effects.render(this.renderer, now);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  get fps() {
    return this._fpsSmoothed;
  }

  _onResize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent ? parent.clientWidth : window.innerWidth);
    const h = Math.max(1, parent ? parent.clientHeight : window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects?.setSize(w, h, pixelRatio);
  }

  /**
   * Switch to a fixed output size for offline rendering, ignoring the element's
   * own dimensions and the device pixel ratio so the captured buffer is exactly
   * the requested size.
   */
  beginOffline(width, height) {
    this._resizeObserver.disconnect();
    this._offline = {
      pixelRatio: this.renderer.getPixelRatio(),
      size: this.renderer.getSize(new THREE.Vector2()),
      aspect: this.camera.aspect,
    };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects?.setSize(width, height, 1);
  }

  endOffline() {
    const saved = this._offline;
    this._offline = null;
    if (saved) {
      this.renderer.setPixelRatio(saved.pixelRatio);
      this.renderer.setSize(saved.size.x, saved.size.y, false);
      this.camera.aspect = saved.aspect;
      this.camera.updateProjectionMatrix();
    }
    this._resizeObserver.observe(this.canvas.parentElement || this.canvas);
    this._onResize();
  }

  setEffects(effects) {
    this.effects = effects;
    const parent = this.canvas.parentElement;
    effects.setSize(
      Math.max(1, parent ? parent.clientWidth : window.innerWidth),
      Math.max(1, parent ? parent.clientHeight : window.innerHeight),
      Math.min(window.devicePixelRatio || 1, 2)
    );
  }

  dispose() {
    this.stop();
    this.effects?.dispose();
    this._resizeObserver.disconnect();
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
