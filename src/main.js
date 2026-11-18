import 'lenis/dist/lenis.css';
import './style.css';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CONFIG } from './config.js';
import { createScroll, setupReveals } from './scroll.js';
import { initUI } from './ui.js';
import { createCameraPath } from './camera-path.js';
import { createTerrain, createSilhouettes, heightAt } from './scene/terrain.js';
import { createTrees } from './scene/trees.js';
import { createWater } from './scene/water.js';
import { createSky, createTimeState, sampleTime } from './scene/sky.js';
import { createFogLayers, createLightShafts } from './scene/fog.js';
import { createParticles } from './scene/particles.js';
import { createCamp } from './scene/camp.js';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const root = document.documentElement;
if (reduced) root.classList.add('reduced-motion');

const ui = initUI({ reduced, finePointer });
const scroll = createScroll({ reduced });
ui.bindNavigation(scroll.scrollTo);
setupReveals(reduced);

const canvas = document.getElementById('scene');

function hasWebGL() {
  // ?nowebgl forces the static fallback (handy for testing it).
  if (new URLSearchParams(window.location.search).has('nowebgl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function finishLoading() {
  root.classList.add('is-loaded');
  scroll.measure();
  ScrollTrigger.refresh();
}

// Static gradient fallback: the page and UI keep working without WebGL.
function startFallback() {
  root.classList.add('no-webgl');
  canvas.remove();
  const time = createTimeState();
  gsap.ticker.add(() => {
    const s = scroll.sample();
    sampleTime(s.tod, time);
    ui.update({ progress: s.progress, active: s.active, accent: time.accentHex });
  });
  finishLoading();
}

function startScene() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 1.5,
    powerPreference: 'high-performance',
  });
  let pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, CONFIG.fog.near, CONFIG.fog.far);
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 3200);

  const time = createTimeState();
  const shared = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uFogColor: { value: scene.fog.color }, // same Color object as scene.fog
    uFogNear: { value: CONFIG.fog.near },
    uFogFar: { value: CONFIG.fog.far },
    sunDir: time.sunDir,
  };

  const path = createCameraPath();
  const terrain = createTerrain();
  const silhouettes = createSilhouettes();
  const trees = createTrees(path.samples, path.views);
  const water = createWater(shared);
  const sky = createSky();
  const fog = createFogLayers(shared);
  const shafts = createLightShafts();
  const particles = createParticles(shared);
  const camp = createCamp();
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  const hemi = new THREE.HemisphereLight('#ffffff', '#000000', 1);
  scene.add(
    sky.mesh,
    terrain.mesh,
    silhouettes.group,
    trees.mesh,
    water.mesh,
    fog.group,
    shafts.group,
    camp.group,
    sun,
    hemi,
    ...particles.objects,
  );

  // ---------- sizing ----------
  let W = window.innerWidth;
  let H = window.innerHeight;
  let mobile = W < CONFIG.layout.mobileBreakpoint;
  let dirty = true;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    mobile = W < CONFIG.layout.mobileBreakpoint;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect < 0.8 ? CONFIG.camera.fovPortrait : CONFIG.camera.fov;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- input ----------
  const mouse = { x: 0, y: 0, cx: 0, cy: 0 };
  if (finePointer && !reduced) {
    window.addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / W) * 2 - 1;
      mouse.y = (e.clientY / H) * 2 - 1;
    });
  }
  const intro = { y: reduced ? 0 : -16 };

  // ---------- adaptive quality ----------
  const Q = CONFIG.quality;
  const frameTimes = new Float32Array(60);
  let ftIndex = 0;
  let ftFilled = 0;
  let ftSum = 0;
  let slowFor = 0;
  let particleFraction = 1;
  function resetFrameStats() {
    frameTimes.fill(0);
    ftIndex = ftFilled = 0;
    ftSum = 0;
    slowFor = 0;
  }
  function trackFrame(ms, dt) {
    // Frames >100 ms are stalls or a throttled/occluded window, not GPU cost.
    if (ms > 100) return;
    ftSum += ms - frameTimes[ftIndex];
    frameTimes[ftIndex] = ms;
    ftIndex = (ftIndex + 1) % frameTimes.length;
    ftFilled = Math.min(ftFilled + 1, frameTimes.length);
    const avg = ftSum / ftFilled;
    stats.avgFrameMs = avg;
    if (ftFilled === frameTimes.length && avg > Q.slowFrameMs) slowFor += dt;
    else slowFor = 0;
    if (slowFor < Q.slowForSeconds) return;
    // Step down only — never back up, so quality can't oscillate.
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - Q.pixelRatioStep);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(W, H, false);
      shared.uPixelRatio.value = pixelRatio;
    } else if (particleFraction > 0.25) {
      particleFraction *= 0.5;
      particles.setFraction(particleFraction);
    }
    stats.pixelRatio = pixelRatio;
    stats.particleFraction = particleFraction;
    resetFrameStats();
  }
  const stats = { avgFrameMs: 0, triangles: 0, pixelRatio, particleFraction, trees: trees.count };

  // ---------- visibility ----------
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    resetFrameStats();
  });

  // ---------- render loop ----------
  const cur = { t: 0, tod: CONFIG.sections[0].tod, fx: 0, fy: 0 };
  const vPos = new THREE.Vector3();
  const vLook = new THREE.Vector3();
  let elapsed = 0;
  let first = true;
  let lastKey = '';

  function frame(_t, deltaMs) {
    if (paused) return;
    const dt = Math.min(deltaMs / 1000, 0.1);
    const s = scroll.sample();
    const fxTarget = mobile ? 0 : s.focusX;
    const fyTarget = mobile ? CONFIG.layout.mobileLift : 0;

    if (reduced || first) {
      cur.t = s.t;
      cur.tod = s.tod;
      cur.fx = fxTarget;
      cur.fy = fyTarget;
    } else {
      // Frame-rate independent exponential smoothing.
      const k = 1 - Math.exp(-CONFIG.camera.damping * dt);
      cur.t += (s.t - cur.t) * k;
      cur.tod += (s.tod - cur.tod) * k;
      cur.fx += (fxTarget - cur.fx) * k;
      cur.fy += (fyTarget - cur.fy) * k;
      mouse.cx += (mouse.x - mouse.cx) * k;
      mouse.cy += (mouse.y - mouse.cy) * k;
      elapsed += dt;
    }
    shared.uTime.value = elapsed;

    ui.update({ progress: s.progress, active: s.active, accent: time.accentHex });

    // Reduced motion: render only when something actually changed.
    if (reduced && !first && !dirty) {
      const key = `${cur.t.toFixed(5)}|${cur.fx.toFixed(4)}`;
      if (key === lastKey) return;
      lastKey = key;
    }
    dirty = false;

    sampleTime(cur.tod, time);

    // Camera
    path.posCurve.getPoint(cur.t, vPos);
    path.lookCurve.getPoint(cur.t, vLook);
    if (!reduced) {
      vPos.x += Math.sin(elapsed * 0.21) * 0.35;
      vPos.y += Math.sin(elapsed * 0.33) * 0.22 + intro.y * Math.max(0, 1 - cur.t * 4);
    }
    const ground = heightAt(vPos.x, vPos.z) + CONFIG.camera.minHeightAboveGround;
    if (vPos.y < ground) vPos.y = ground;
    camera.position.copy(vPos);
    camera.lookAt(vLook);
    if (!reduced && finePointer) {
      camera.rotateY(-mouse.cx * CONFIG.camera.parallax);
      camera.rotateX(-mouse.cy * CONFIG.camera.parallax * 0.6);
    }
    camera.setViewOffset(W, H, -cur.fx * W, cur.fy * H, W, H);

    // Atmosphere
    scene.fog.color.copy(time.colors.fog);
    sun.color.copy(time.colors.sun);
    sun.intensity = time.sunI;
    sun.position.copy(time.lightDir).multiplyScalar(200);
    hemi.color.copy(time.colors.hemiSky);
    hemi.groundColor.copy(time.colors.hemiGround);
    hemi.intensity = time.hemiI;

    sky.update(time, camera.position);
    silhouettes.update(time.colors);
    water.update(time.colors);
    fog.update(time);
    shafts.update(time);
    particles.update(time, camera.position);
    camp.update(time, elapsed);

    renderer.render(scene, camera);
    trackFrame(deltaMs, dt);

    if (first) {
      first = false;
      stats.triangles = renderer.info.render.triangles;
      if (import.meta.env.DEV) {
        console.info(`[journey] ${stats.triangles.toLocaleString()} triangles, ${trees.count} trees`);
      }
      finishLoading();
      if (!reduced) gsap.to(intro, { y: 0, duration: 3.6, ease: 'power2.out', delay: 0.2 });
    }
  }

  gsap.ticker.add(frame);
  if (import.meta.env.DEV) window.__journey = { stats, renderer, camera, scene, cur, scrollTo: scroll.scrollTo };
}

let started = false;
if (hasWebGL()) {
  try {
    startScene();
    started = true;
  } catch (err) {
    console.error('[journey] WebGL scene failed, using fallback.', err);
  }
}
if (!started) startFallback();
