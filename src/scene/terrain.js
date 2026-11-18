import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { CONFIG } from '../config.js';
import { fbm, ridged, lerp, smoothstep } from '../noise.js';

const W = CONFIG.world;

export const LAKE = { x: W.pathX(W.lake.z) + W.lake.dx, z: W.lake.z, r: W.lake.r };
export const CAMP = { x: W.pathX(W.camp.z) + W.camp.dx, z: W.camp.z, r: W.camp.r };

// Height of the ground at (x, z). Used by the mesh, tree placement,
// the camera path and the per-frame camera ground clamp.
export function heightAt(x, z) {
  const d = Math.abs(x - W.pathX(z));

  // Gentle valley floor near the trail, mountains further out.
  const low = 2.6 + fbm(x * 0.018, z * 0.018, 3) * 1.6;
  const n = fbm(x * 0.0055 + 31.7, z * 0.0055 - 12.3, 5) * 0.5 + 0.5;
  const r = ridged(x * 0.009 - 7.1, z * 0.009 + 3.3, 4);
  const mtn = 8 + n * 70 + r * 38;
  let h = lerp(low, mtn, smoothstep(22, 175, d));

  // Lookout ridge.
  const rx = x - W.ridge.x;
  const rz = z - W.ridge.z;
  h += W.ridge.height * Math.exp(-(rx * rx + rz * rz) / (2 * W.ridge.sigma * W.ridge.sigma));

  // Lake basin.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(h, W.lake.depth, smoothstep(LAKE.r + 16, LAKE.r - 4, dl));

  // Camp clearing.
  const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
  h = lerp(h, W.camp.height, smoothstep(CAMP.r + 14, CAMP.r, dc));

  // Sink the far edge so it hides behind the silhouette rings.
  const de = Math.hypot(x - W.center.x, z - W.center.z);
  h = lerp(h, -30, smoothstep(W.edge - 40, W.edge + 20, de));
  return h;
}

export function createTerrain() {
  const seg = W.segments;
  const geo = new PlaneGeometry(W.size, W.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(W.center.x, 0, W.center.z);

  const pos = geo.attributes.position;
  const count = pos.count;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    heights[i] = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, heights[i]);
  }

  const cell = W.size / seg;
  const row = seg + 1;
  const colors = new Float32Array(count * 3);
  const cMud = new Color('#3f4234');
  const cSand = new Color('#8f8566');
  const cGrass = new Color('#5b7440');
  const cForest = new Color('#3a5230');
  const cRock = new Color('#6f6a62');
  const cSnow = new Color('#dfe3e8');
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const ix = i % row;
    const iz = (i / row) | 0;
    const h = heights[i];
    const hx = heights[iz * row + Math.min(ix + 1, seg)] - heights[iz * row + Math.max(ix - 1, 0)];
    const hz = heights[Math.min(iz + 1, seg) * row + ix] - heights[Math.max(iz - 1, 0) * row + ix];
    const slope = Math.hypot(hx, hz) / (2 * cell);

    c.copy(cGrass).lerp(cForest, smoothstep(4, 22, h));
    c.lerp(cRock, Math.min(1, smoothstep(30, 62, h) + smoothstep(0.55, 1.1, slope) * 0.8));
    c.lerp(cSnow, smoothstep(92, 112, h) * (1 - smoothstep(0.9, 1.4, slope)));
    c.lerp(cSand, smoothstep(2.0, 0.9, h));
    c.lerp(cMud, smoothstep(0.2, -1.5, h));
    const v = 0.92 + fbm(pos.getX(i) * 0.05, pos.getZ(i) * 0.05, 2) * 0.1;
    colors[i * 3] = c.r * v;
    colors[i * 3 + 1] = c.g * v;
    colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new MeshLambertMaterial({ vertexColors: true });
  const mesh = new Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh };
}

// Three layered mountain rings in the distance, tinted toward the horizon
// colour with distance for an aerial-perspective look.
export function createSilhouettes() {
  const group = new Group();
  const layers = [
    { radius: 470, base: 40, amp: 80, seed: 3.1 },
    { radius: 560, base: 70, amp: 110, seed: 8.7 },
    { radius: 650, base: 100, amp: 140, seed: 15.2 },
  ];
  const materials = [];
  const segs = 320;
  for (const L of layers) {
    const verts = new Float32Array((segs + 1) * 2 * 3);
    const idx = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = W.center.x + ca * L.radius;
      const z = W.center.z + sa * L.radius;
      const n = ridged(ca * 2.4 + L.seed, sa * 2.4 + L.seed, 5);
      const top = L.base + L.amp * Math.pow(n, 1.6);
      verts.set([x, -40, z, x, top, z], k * 6);
      if (k < segs) {
        const b = k * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const mat = new ShaderMaterial({
      side: DoubleSide,
      fog: false,
      uniforms: { uColor: { value: new Color() }, uHaze: { value: new Color() } },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uHaze;
        varying float vY;
        void main() {
          float haze = 1.0 - smoothstep(-10.0, 140.0, vY);
          gl_FragColor = vec4(mix(uColor, uHaze, haze * 0.65), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    materials.push(mat);
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return {
    group,
    update(colors) {
      materials.forEach((m, i) => {
        m.uniforms.uColor.value.copy(colors.silhouette).lerp(colors.horizon, 0.12 + i * 0.22);
        m.uniforms.uHaze.value.copy(colors.fog);
      });
    },
  };
}
