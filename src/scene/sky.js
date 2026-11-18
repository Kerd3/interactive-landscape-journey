import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { CONFIG } from '../config.js';
import { clamp, lerp, smoothstep } from '../noise.js';

const COLOR_KEYS = ['zenith', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'silhouette', 'water', 'accent'];
const NUM_KEYS = ['sunI', 'hemiI', 'sunEl', 'sunAz', 'mist'];

const STOPS = CONFIG.time.stops.map((s) => {
  const o = { t: s.t, colors: {} };
  for (const k of COLOR_KEYS) o.colors[k] = new Color(s[k]);
  for (const k of NUM_KEYS) o[k] = s[k];
  return o;
});

function dirFrom(az, el, out) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

// Mutable state shared by every system that reacts to time of day.
export function createTimeState() {
  const colors = {};
  for (const k of COLOR_KEYS) colors[k] = new Color();
  const m = CONFIG.time.moon;
  return {
    colors,
    sunDir: new Vector3(),
    moonDir: dirFrom(m.az, m.el, new Vector3()),
    lightDir: new Vector3(),
    sunI: 1,
    hemiI: 1,
    mist: 0.4,
    night: 0, // 0 → 1 as night falls
    stars: 0, // fades in from dusk
    pollen: 1, // daytime particles
    shafts: 0, // morning light shafts
    accentHex: '#ffffff',
  };
}

export function sampleTime(tod, out) {
  tod = clamp(tod, 0, 1);
  let k = 0;
  while (k < STOPS.length - 2 && tod > STOPS[k + 1].t) k++;
  const a = STOPS[k];
  const b = STOPS[k + 1];
  const f = clamp((tod - a.t) / (b.t - a.t), 0, 1);
  for (const key of COLOR_KEYS) out.colors[key].copy(a.colors[key]).lerp(b.colors[key], f);
  out.sunI = lerp(a.sunI, b.sunI, f);
  out.hemiI = lerp(a.hemiI, b.hemiI, f);
  out.mist = lerp(a.mist, b.mist, f);
  dirFrom(lerp(a.sunAz, b.sunAz, f), lerp(a.sunEl, b.sunEl, f), out.sunDir);

  out.night = smoothstep(0.8, 0.95, tod);
  out.stars = smoothstep(0.66, 0.9, tod);
  out.pollen = smoothstep(0.08, 0.2, tod) * (1 - smoothstep(0.45, 0.68, tod));
  out.shafts = smoothstep(0.1, 0.22, tod) * (1 - smoothstep(0.36, 0.5, tod));

  // Directional light follows the sun, then the moon; never from below.
  out.lightDir.copy(out.sunDir).lerp(out.moonDir, out.night).normalize();
  if (out.lightDir.y < 0.08) {
    out.lightDir.y = 0.08;
    out.lightDir.normalize();
  }
  out.accentHex = '#' + out.colors.accent.getHexString();
  return out;
}

export function createSky() {
  const uniforms = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunColor: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uMoon: { value: 0 },
  };
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uSunColor, uSunDir, uMoonDir;
      uniform float uMoon;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.65));
        float sunVis = smoothstep(-0.08, 0.02, uSunDir.y) * (1.0 - uMoon);
        float sd = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.4) * sunVis;
        col = mix(col, uSunColor * 1.4 + 0.2, smoothstep(0.99935, 0.99965, sd) * sunVis);
        float md = max(dot(dir, uMoonDir), 0.0);
        col += vec3(0.45, 0.55, 0.85) * pow(md, 40.0) * 0.18 * uMoon;
        col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.99955, 0.99975, md) * uMoon);
        col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(1500, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  return {
    mesh,
    update(time, cameraPos) {
      mesh.position.copy(cameraPos);
      uniforms.uZenith.value.copy(time.colors.zenith);
      uniforms.uHorizon.value.copy(time.colors.horizon);
      uniforms.uSunColor.value.copy(time.colors.sun);
      uniforms.uSunDir.value.copy(time.sunDir);
      uniforms.uMoonDir.value.copy(time.moonDir);
      uniforms.uMoon.value = time.night;
    },
  };
}
