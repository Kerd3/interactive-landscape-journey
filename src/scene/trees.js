import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { fbm, lerp, mulberry32 } from '../noise.js';
import { CAMP, LAKE, heightAt } from './terrain.js';

function painted(geo, hex) {
  const c = new Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}

// cameraSamples: points along the camera path, so no tree blocks the lens.
// views: [camera, focal point] pairs for each section rest.
export function createTrees(cameraSamples, views = []) {
  const W = CONFIG.world;
  const T = W.trees;
  const rng = mulberry32(7);

  const trunk = painted(new CylinderGeometry(0.18, 0.26, 2.0, 5, 1, true).translate(0, 1.0, 0), '#4a3628');
  const lower = painted(new ConeGeometry(1.6, 3.4, 7, 1, true).translate(0, 3.1, 0), '#3d6644');
  const upper = painted(new ConeGeometry(1.15, 2.8, 7, 1, true).translate(0, 4.9, 0), '#46734b');
  const geo = mergeGeometries([trunk, lower, upper]);
  trunk.dispose();
  lower.dispose();
  upper.dispose();

  const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new InstancedMesh(geo, mat, T.count);

  const dummy = new Object3D();
  const tint = new Color();
  const warm = new Color('#e6e9a8');
  const cool = new Color('#9fc2b0');
  let placed = 0;

  for (let tries = 0; tries < 80000 && placed < T.count; tries++) {
    let x, z;
    if (rng() < 0.65) {
      z = lerp(-300, 230, rng());
      x = W.pathX(z) + (rng() * 2 - 1) * 110;
    } else {
      x = lerp(-420, 420, rng());
      z = lerp(-500, 340, rng());
    }
    if (Math.hypot(x - W.center.x, z - W.center.z) > W.edge - 50) continue;
    if (Math.abs(x - W.pathX(z)) < T.pathClearance) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 10) continue;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.r + 3) continue;

    const h = heightAt(x, z);
    if (h < 1.0 || h > T.maxHeight) continue;
    const slope =
      (Math.abs(heightAt(x + 1.5, z) - heightAt(x - 1.5, z)) +
        Math.abs(heightAt(x, z + 1.5) - heightAt(x, z - 1.5))) /
      3;
    if (slope > 0.9) continue;
    if (fbm(x * 0.02 + 50, z * 0.02, 2) < -0.22) continue;

    const scale = 0.8 + rng() * 1.4;
    let blocked = false;
    for (let i = 0; i < cameraSamples.length; i++) {
      const p = cameraSamples[i];
      if (p.y < h + 8 * scale && Math.hypot(p.x - x, p.z - z) < 4 + 1.6 * scale) {
        blocked = true;
        break;
      }
    }
    // Keep each rest view's sight line to its focal point open.
    for (let i = 0; i < views.length && !blocked; i++) {
      const [a, b] = views[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      if (t > 0.9) continue;
      const lineY = a.y + (b.y - a.y) * t;
      const dist = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (h + 8 * scale > lineY - 1 && dist < 5 + 2.5 * scale + t * 8) blocked = true;
    }
    if (blocked) continue;

    dummy.position.set(x, h - 0.2, z);
    dummy.rotation.set((rng() - 0.5) * 0.08, rng() * Math.PI * 2, (rng() - 0.5) * 0.08);
    dummy.scale.set(scale * (0.85 + rng() * 0.3), scale, scale * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    tint.setRGB(1, 1, 1).lerp(rng() < 0.5 ? warm : cool, rng() * 0.6);
    tint.multiplyScalar(0.78 + rng() * 0.35);
    mesh.setColorAt(placed, tint);
    placed++;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, count: placed };
}
