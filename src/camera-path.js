import { CatmullRomCurve3, Vector3 } from 'three';
import { CONFIG } from './config.js';
import { heightAt } from './scene/terrain.js';

// { x | dx, z, y | above } → Vector3 (see config.camera.points).
export function resolvePoint(p) {
  const x = p.x ?? CONFIG.world.pathX(p.z) + (p.dx ?? 0);
  const y = p.y ?? heightAt(x, p.z) + (p.above ?? 0);
  return new Vector3(x, y, p.z);
}

export function createCameraPath() {
  const pts = CONFIG.camera.points;
  const posCurve = new CatmullRomCurve3(pts.map((p) => resolvePoint(p.pos)), false, 'centripetal');
  const lookCurve = new CatmullRomCurve3(pts.map((p) => resolvePoint(p.look)), false, 'centripetal');
  // getPoint(t) is uniform per segment, so point k sits exactly at t = k / (n - 1).
  const restT = CONFIG.sections.map((s) => s.point / (pts.length - 1));
  // Camera → focal-point sight lines at each rest, kept clear of trees.
  const views = CONFIG.sections.map((s) => [resolvePoint(pts[s.point].pos), resolvePoint(pts[s.point].look)]);
  return { posCurve, lookCurve, restT, views, samples: posCurve.getPoints(300) };
}
