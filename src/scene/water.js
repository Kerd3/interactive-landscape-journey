import { CircleGeometry, Color, Mesh, ShaderMaterial } from 'three';
import { CONFIG } from '../config.js';
import { LAKE } from './terrain.js';

// Cheap lake: analytic wave normals + fresnel blend toward the sky colour.
export function createWater(shared) {
  const geo = new CircleGeometry(LAKE.r + 14, 64);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: shared.uTime,
    uFogColor: shared.uFogColor,
    uFogNear: shared.uFogNear,
    uFogFar: shared.uFogFar,
    uDeep: { value: new Color() },
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunColor: { value: new Color() },
    uSunDir: { value: shared.sunDir },
  };

  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uZenith, uHorizon, uSunColor, uSunDir, uFogColor;
      uniform float uFogNear, uFogFar;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        // Sum of a few directional waves; gradient gives the normal.
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.55 + t * 0.9) * 0.035;
        g += vec2(-0.4, 0.9) * cos(dot(p, vec2(-0.4, 0.9)) * 0.9 + t * 1.3) * 0.022;
        g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 1.7 + t * 1.9) * 0.012;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = 0.06 + 0.94 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.6));
        vec3 col = mix(uDeep, sky, fres);
        float spec = pow(max(dot(r, uSunDir), 0.0), 220.0);
        col += uSunColor * spec * 1.6;
        float d = length(cameraPosition - vWorld);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new Mesh(geo, mat);
  mesh.position.set(LAKE.x, CONFIG.world.waterLevel, LAKE.z);

  return {
    mesh,
    update(colors) {
      uniforms.uDeep.value.copy(colors.water);
      uniforms.uZenith.value.copy(colors.zenith);
      uniforms.uHorizon.value.copy(colors.horizon);
      uniforms.uSunColor.value.copy(colors.sun);
    },
  };
}
