import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  PointLight,
  Sprite,
  SpriteMaterial,
} from 'three';
import { CAMP, heightAt } from './terrain.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,220,160,0.75)');
  grad.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

// Campfire, stones, logs and a tent with a warm glow at night.
export function createCamp() {
  const group = new Group();
  const y = heightAt(CAMP.x, CAMP.z);
  group.position.set(CAMP.x, y, CAMP.z);

  const wood = new MeshLambertMaterial({ color: '#4b3324', flatShading: true });
  const stone = new MeshLambertMaterial({ color: '#77746d', flatShading: true });
  const logGeo = new CylinderGeometry(0.16, 0.18, 2.0, 6);
  for (let i = 0; i < 3; i++) {
    const log = new Mesh(logGeo, wood);
    log.position.y = 0.25;
    log.rotation.set(Math.PI / 2 - 0.35, (i / 3) * Math.PI * 2, 0);
    group.add(log);
  }
  const stoneGeo = new IcosahedronGeometry(0.32, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new Mesh(stoneGeo, stone);
    s.position.set(Math.cos(a) * 1.25, 0.12, Math.sin(a) * 1.25);
    s.rotation.set(a, a * 2, 0);
    group.add(s);
  }
  // Log benches.
  const benchGeo = new CylinderGeometry(0.3, 0.3, 3.2, 7);
  [
    [3.2, 0.3, 0.8, 0.3],
    [-2.6, 0.3, 2.4, -0.9],
  ].forEach(([x, by, z, r]) => {
    const b = new Mesh(benchGeo, wood);
    b.position.set(x, by, z);
    b.rotation.set(0, r, Math.PI / 2);
    group.add(b);
  });

  const tentMat = new MeshLambertMaterial({ color: '#c9b48f', flatShading: true, emissive: new Color('#ff9a4a') });
  const tent = new Mesh(new ConeGeometry(2.6, 3.4, 4), tentMat);
  tent.position.set(-4.5, 1.7, -4.5);
  tent.rotation.y = 0.4;
  group.add(tent);

  const flame = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: '#ffb466',
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    }),
  );
  flame.position.y = 1.0;
  group.add(flame);

  const light = new PointLight('#ff8a3d', 0, 70, 1.5);
  light.position.y = 1.6;
  group.add(light);

  return {
    group,
    update(time, elapsed) {
      const n = time.night;
      const flicker = 0.85 + 0.1 * Math.sin(elapsed * 13.0) + 0.05 * Math.sin(elapsed * 31.0 + 1.3);
      // Keep the light in the scene (toggling visibility recompiles shaders).
      light.intensity = n * 60 * flicker;
      flame.visible = n > 0.01;
      flame.material.opacity = n;
      flame.scale.set(3.2 * flicker, 4.0 * flicker, 1);
      tentMat.emissiveIntensity = n * 0.22 * flicker;
    },
  };
}
