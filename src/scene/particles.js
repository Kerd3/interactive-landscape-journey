import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from '../noise.js';
import { CAMP, heightAt } from './terrain.js';

const SOFT_DOT = /* glsl */ `
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);`;

function makePoints(positions, seeds, material) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const points = new Points(geo, material);
  points.frustumCulled = false;
  const total = seeds.length;
  return {
    points,
    material,
    setFraction(f) {
      geo.setDrawRange(0, Math.max(1, Math.floor(total * f)));
    },
  };
}

// Pollen / dust drifting in a box that wraps around the camera.
function createPollen(shared, count, rng) {
  const box = new Vector3(70, 30, 70);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([rng() * box.x, rng() * box.y, rng() * box.z], i * 3);
    seed[i] = rng();
  }
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uPixelRatio: shared.uPixelRatio,
      uCam: { value: new Vector3() },
      uBox: { value: box },
      uOpacity: { value: 0 },
      uColor: { value: new Color('#fff1c9') },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPixelRatio;
      uniform vec3 uCam, uBox;
      varying float vA;
      void main() {
        vec3 p = position + vec3(
          sin(uTime * 0.3 + aSeed * 6.28) * 1.5,
          uTime * 0.35 + sin(uTime * 0.5 + aSeed * 10.0) * 0.8,
          cos(uTime * 0.25 + aSeed * 4.0) * 1.5);
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min((0.6 + aSeed) * uPixelRatio * (34.0 / -mv.z), 24.0);
        vA = smoothstep(40.0, 6.0, -mv.z) * smoothstep(0.5, 2.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vA;
      void main() {
        ${SOFT_DOT}
        gl_FragColor = vec4(uColor * a * vA * uOpacity, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return makePoints(pos, seed, mat);
}

// Fireflies around the camp: wander, glow and flicker per particle.
function createFireflies(shared, count, rng) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 5 + Math.pow(rng(), 0.7) * 48;
    const x = CAMP.x + Math.cos(a) * r;
    const z = CAMP.z + Math.sin(a) * r;
    pos.set([x, heightAt(x, z) + 0.6 + rng() * 4, z], i * 3);
    seed[i] = rng();
  }
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: shared.uTime,
      uPixelRatio: shared.uPixelRatio,
      uOpacity: { value: 0 },
      uColor: { value: new Color('#ffd27a') },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPixelRatio;
      varying float vFlicker;
      void main() {
        vec3 p = position;
        float s = aSeed * 40.0;
        p += vec3(sin(uTime * 0.4 + s) * 1.6, sin(uTime * 0.7 + s * 1.3) * 0.6, cos(uTime * 0.35 + s) * 1.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float f = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 2.5) + s);
        vFlicker = 0.15 + 0.85 * f * f * f;
        gl_PointSize = min(2.2 * uPixelRatio * (60.0 / -mv.z), 40.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vFlicker;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.18, 0.0, d);
        float glow = smoothstep(0.5, 0.0, d) * 0.45;
        gl_FragColor = vec4(uColor * (core + glow) * vFlicker * uOpacity, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return makePoints(pos, seed, mat);
}

// Stars on a dome that follows the camera.
function createStars(shared, count, rng) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const R = 1200;
  for (let i = 0; i < count; i++) {
    const az = rng() * Math.PI * 2;
    const el = Math.asin(0.04 + rng() * 0.96);
    pos.set([Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R], i * 3);
    seed[i] = rng();
  }
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    fog: false,
    uniforms: {
      uTime: shared.uTime,
      uPixelRatio: shared.uPixelRatio,
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPixelRatio;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float big = step(0.93, aSeed);
        gl_PointSize = (1.2 + aSeed * 1.4 + big * 1.6) * uPixelRatio;
        vA = (0.45 + 0.55 * aSeed) * (0.75 + 0.25 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 90.0));
        vA *= smoothstep(0.0, 0.25, normalize(position).y);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vA;
      void main() {
        ${SOFT_DOT}
        gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), a * vA * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const s = makePoints(pos, seed, mat);
  s.points.renderOrder = -9;
  return s;
}

export function createParticles(shared) {
  const rng = mulberry32(42);
  const C = CONFIG.particles;
  const pollen = createPollen(shared, C.pollen, rng);
  const fireflies = createFireflies(shared, C.fireflies, rng);
  const stars = createStars(shared, C.stars, rng);
  const all = [pollen, fireflies, stars];

  return {
    objects: all.map((p) => p.points),
    setFraction(f) {
      all.forEach((p) => p.setFraction(f));
    },
    update(time, cameraPos) {
      pollen.material.uniforms.uCam.value.copy(cameraPos);
      pollen.material.uniforms.uOpacity.value = time.pollen * 0.9;
      pollen.points.visible = time.pollen > 0.001;
      fireflies.material.uniforms.uOpacity.value = time.night;
      fireflies.points.visible = time.night > 0.001;
      stars.material.uniforms.uOpacity.value = time.stars;
      stars.points.visible = time.stars > 0.001;
      stars.points.position.copy(cameraPos);
    },
  };
}
