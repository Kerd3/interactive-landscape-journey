// Single source of truth for everything you are likely to tweak:
// world layout, camera path, sections, and the time-of-day palette.

// The trail winds along this centre line (x as a function of z).
const pathX = (z) => 18 * Math.sin(z * 0.012) + 6 * Math.sin(z * 0.031);

export const CONFIG = {
  world: {
    pathX,
    center: { x: 0, z: -80 }, // terrain centre
    size: 900, // terrain plane size (world units)
    segments: 220, // terrain grid resolution (segments²·2 triangles)
    edge: 430, // radius where terrain sinks behind the silhouette rings
    waterLevel: 0.3,
    // Positions given as offsets from the trail (dx) at a given z.
    lake: { z: -70, dx: -4, r: 40, depth: -3.5 },
    camp: { z: -226, dx: 4, r: 16, height: 2.4 },
    ridge: { x: 92, z: -150, sigma: 30, height: 44 },
    trees: { count: 2200, pathClearance: 7, maxHeight: 62 },
  },

  fog: { near: 30, far: 600 },

  camera: {
    fov: 50,
    fovPortrait: 64,
    damping: 4, // k in current += (target - current) * (1 - exp(-k·dt))
    parallax: 0.035, // radians (~2°) of mouse tilt
    // Each point: { x | dx, z, y | above }.
    //   x   absolute, or dx = offset from the trail at z
    //   y   absolute, or above = height above the terrain
    points: [
      /* 0 Hero    */ { pos: { z: 200, dx: 0, y: 56 }, look: { z: 20, dx: 0, y: 14 } },
      /* 1         */ { pos: { z: 130, dx: 6, above: 16 }, look: { z: 60, dx: 0, above: 5 } },
      /* 2 Forest  */ { pos: { z: 72, dx: 2, above: 4 }, look: { z: 30, dx: -2, above: 4 } },
      /* 3         */ { pos: { z: 18, dx: 4, above: 6 }, look: { z: -70, dx: -4, y: 1 } },
      /* 4 Lake    */ { pos: { z: -20, dx: 4, above: 11 }, look: { z: -76, dx: -6, y: 0 } },
      /* 5         */ { pos: { x: 45, z: -100, above: 20 }, look: { x: -30, z: -220, y: 20 } },
      /* 6 Ridge   */ { pos: { x: 88, z: -148, above: 5 }, look: { x: -70, z: -270, y: 40 } },
      /* 7         */ { pos: { x: 40, z: -190, above: 14 }, look: { z: -226, dx: 4, y: 3 } },
      /* 8 Camp    */ { pos: { z: -202, dx: 16, above: 5 }, look: { z: -228, dx: 2, above: 1.4 } },
    ],
    minHeightAboveGround: 2.5,
  },

  // One entry per <section data-section> in index.html, in order.
  //   point   index into camera.points where the camera rests
  //   tod     time of day at rest (0 dawn → 1 night)
  //   focusX  where the scene's focal point sits horizontally on desktop
  //           (+ moves it right, used when the text panel is on the left)
  sections: [
    { id: 'home', label: 'Home', point: 0, tod: 0.05, focusX: 0.1 },
    { id: 'story', label: 'Story', point: 2, tod: 0.25, focusX: 0.16 },
    { id: 'about', label: 'About', point: 4, tod: 0.5, focusX: -0.16 },
    { id: 'experiences', label: 'Experiences', point: 6, tod: 0.75, focusX: 0.16 },
    { id: 'contact', label: 'Contact', point: 8, tod: 0.95, focusX: -0.16 },
  ],

  layout: {
    mobileBreakpoint: 900,
    mobileLift: 0.2, // on narrow screens, lift the scene up by this fraction of the height
    // Fraction of the scroll between two sections spent resting before the camera moves.
    holdStart: 0.42,
    holdEnd: 0.95,
  },

  // Time-of-day colour stops. Values in between are interpolated.
  // sunEl / sunAz in radians (azimuth 0 = straight down the valley, -z).
  time: {
    moon: { az: -0.55, el: 0.2 },
    stops: [
      {
        t: 0.0, // dawn
        zenith: '#3b4a73', horizon: '#f2b8a0', fog: '#c9a9a6',
        sun: '#ffc69a', sunI: 1.4, sunEl: 0.06, sunAz: 0.6,
        hemiSky: '#b8c4e0', hemiGround: '#4a3f3a', hemiI: 1.0,
        silhouette: '#5a5a78', water: '#2a3550', mist: 0.6, accent: '#f0a98a',
      },
      {
        t: 0.25, // morning
        zenith: '#4f86c6', horizon: '#cfe3ef', fog: '#c4d6de',
        sun: '#fff2dc', sunI: 2.4, sunEl: 0.62, sunAz: 0.3,
        hemiSky: '#cfe5ff', hemiGround: '#4d5a3a', hemiI: 1.2,
        silhouette: '#6d8597', water: '#1f4a5a', mist: 0.35, accent: '#a6d4b2',
      },
      {
        t: 0.5, // golden hour
        zenith: '#4f6fa8', horizon: '#f5b469', fog: '#d9a774',
        sun: '#ffbe6b', sunI: 2.2, sunEl: 0.16, sunAz: -0.35,
        hemiSky: '#f3d2a6', hemiGround: '#5a4528', hemiI: 1.0,
        silhouette: '#7a6680', water: '#1f3c4a', mist: 0.25, accent: '#f2c46d',
      },
      {
        t: 0.75, // dusk
        zenith: '#2c2f5e', horizon: '#f08a5d', fog: '#8a6378',
        sun: '#ff8a5c', sunI: 1.0, sunEl: 0.015, sunAz: -0.75,
        hemiSky: '#8a7aa8', hemiGround: '#3a2a30', hemiI: 0.75,
        silhouette: '#4a3b5c', water: '#1d2340', mist: 0.5, accent: '#f5a07c',
      },
      {
        t: 1.0, // night (sun colour = moonlight)
        zenith: '#050914', horizon: '#1a2342', fog: '#121a30',
        sun: '#9fb4ff', sunI: 0.35, sunEl: -0.3, sunAz: -0.9,
        hemiSky: '#3a4a7a', hemiGround: '#0e1018', hemiI: 0.45,
        silhouette: '#141a2e', water: '#070b18', mist: 0.3, accent: '#a9bfff',
      },
    ],
  },

  particles: { pollen: 700, fireflies: 260, stars: 1800 },

  quality: {
    slowFrameMs: 26, // average frame time considered "too slow"
    slowForSeconds: 2,
    pixelRatioStep: 0.25,
  },
};
