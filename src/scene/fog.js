import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from '../noise.js';
import { heightAt } from './terrain.js';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm3(vec2 p) {
    return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15;
  }`;

// Horizontal mist sheets at different heights. Where they cut through the
// terrain the depth test hides them, so mist pools in the valleys.
export function createFogLayers(shared) {
  const W = CONFIG.world;
  const group = new Group();
  const layers = [
    { y: 5, scale: 0.014, drift: [0.012, 0.004], opacity: 0.55 },
    { y: 10, scale: 0.01, drift: [-0.008, 0.006], opacity: 0.45 },
    { y: 17, scale: 0.008, drift: [0.006, -0.005], opacity: 0.35 },
    { y: 28, scale: 0.006, drift: [-0.004, -0.003], opacity: 0.25 },
  ];
  const color = new Color();
  const materials = layers.map((L) => {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: DoubleSide,
      uniforms: {
        uTime: shared.uTime,
        uColor: { value: color },
        uOpacity: { value: L.opacity },
        uScale: { value: L.scale },
        uDrift: { value: L.drift },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOpacity, uScale;
        uniform vec2 uDrift;
        uniform vec3 uColor;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz * uScale + uDrift * uTime;
          float n = fbm3(p);
          float a = smoothstep(0.38, 0.85, n) * uOpacity;
          float d = length(cameraPosition - vWorld);
          a *= smoothstep(6.0, 60.0, d) * (1.0 - smoothstep(520.0, 760.0, d));
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(new PlaneGeometry(1000, 1000, 1, 1).rotateX(-Math.PI / 2), mat);
    mesh.position.set(W.center.x, L.y, W.center.z);
    mesh.renderOrder = 2;
    group.add(mesh);
    return mat;
  });

  return {
    group,
    update(time) {
      color.copy(time.colors.fog).lerp(time.colors.horizon, 0.25);
      materials.forEach((m, i) => {
        m.uniforms.uOpacity.value = layers[i].opacity * time.mist * 1.6;
      });
    },
  };
}

// Soft additive god-rays between the trees for the morning section.
export function createLightShafts() {
  const W = CONFIG.world;
  const rng = mulberry32(99);
  const group = new Group();
  const uniforms = { uOpacity: { value: 0 }, uColor: { value: new Color('#ffe7b8') } };
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float s = sin(vUv.x * 3.14159);
        float a = s * s * smoothstep(0.0, 0.3, vUv.y) * pow(1.0 - vUv.y, 1.3) * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new PlaneGeometry(4, 38).translate(0, 19, 0);
  for (let i = 0; i < 10; i++) {
    const z = 30 + rng() * 80;
    const side = rng() < 0.5 ? -1 : 1;
    const x = W.pathX(z) + side * (5 + rng() * 14);
    const shaft = new Group();
    shaft.position.set(x, heightAt(x, z) - 1, z);
    shaft.rotation.set(0, rng() * Math.PI, 0.32 + rng() * 0.12);
    const a = new Mesh(geo, mat);
    const b = new Mesh(geo, mat);
    b.rotation.y = Math.PI / 2;
    shaft.add(a, b);
    shaft.scale.setScalar(0.8 + rng() * 0.6);
    group.add(shaft);
  }
  return {
    group,
    update(time) {
      uniforms.uOpacity.value = time.shafts * 0.06;
      group.visible = time.shafts > 0.001;
    },
  };
}
