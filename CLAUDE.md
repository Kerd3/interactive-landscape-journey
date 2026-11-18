# Interactive Landscape Journey

A scroll-driven three.js site for the fictional "Northwind Retreat": a procedural mountain valley the camera travels through as time moves from dawn to night. Vite + vanilla JS; `three`, `gsap` (ScrollTrigger) and `lenis` come from npm. Nothing loads from a CDN except Google Fonts.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

## Structure

| File | What it does |
|---|---|
| `index.html` | All markup. One `<section data-section>` per journey stop, with a sticky inner `.section__sticky` holding a `.panel`. |
| `src/config.js` | **The file to tweak.** World layout, camera points, section list, time-of-day colour stops, particle counts, quality thresholds. |
| `src/main.js` | Bootstrap, WebGL check and fallback, render loop (driven by `gsap.ticker`), adaptive quality, visibility pause. |
| `src/scroll.js` | Lenis setup, synced with ScrollTrigger, plus the scroll → `{ t, tod, focusX }` mapping. `setupReveals()` is the only use of ScrollTrigger. |
| `src/camera-path.js` | Builds the two `CatmullRomCurve3`s (camera position and look target) from config points. |
| `src/ui.js` | Nav and dot highlighting, progress bar, `--accent` CSS variable, contact form, card tilt. |
| `src/noise.js` | Seeded simplex noise, FBM and ridged noise, plus math helpers. |
| `src/scene/terrain.js` | `heightAt(x, z)` (the single source of ground height), terrain mesh with vertex colours, distant silhouette rings. Exports `LAKE` and `CAMP` positions. |
| `src/scene/trees.js` | One `InstancedMesh` (~2,200 low-poly trees). Placement avoids the trail, lake, camp, the camera path, and each rest view's line of sight. |
| `src/scene/water.js` | Lake shader: analytic wave normals, fresnel blend to the sky, sun glint, manual fog. |
| `src/scene/sky.js` | Gradient sky dome with sun and moon discs. `sampleTime()` interpolates every time-of-day value into a shared state object. |
| `src/scene/fog.js` | Drifting horizontal mist sheets and the morning light shafts. |
| `src/scene/particles.js` | Pollen (wraps around the camera), fireflies (camp) and stars (dome following the camera). |
| `src/scene/camp.js` | Campfire, logs, stones, tent, flame sprite and the flickering point light. |

## How scroll maps to camera and time of day

1. `scroll.js` measures the top of each section (its *anchor*; the last one is clamped to the maximum scroll).
2. For scroll `y` between anchor `i` and anchor `i+1`, it computes `f ∈ [0,1]`, then
   `g = smootherstep((f - holdStart) / (holdEnd - holdStart))`.
   The camera **rests** for the first `holdStart` (42%) of each gap, while that section's text is on screen, then glides to the next stop.
3. `t = lerp(restT[i], restT[i+1], g)`, where `restT = section.point / (points.length - 1)`. `CatmullRomCurve3.getPoint(t)` is uniform per segment, so point `k` sits exactly at `k/(n-1)`. `tod` and `focusX` are interpolated the same way.
4. `main.js` damps the values toward these targets with `cur += (target - cur) * (1 - exp(-damping * dt))`, which is independent of frame rate. With reduced motion, `cur = target` and nothing idles.
5. `sampleTime(tod)` turns time of day into sky, fog, light, water, silhouette and accent colours, plus particle and shaft visibility.
6. `focusX` shifts the projection with `camera.setViewOffset`, so the focal point sits beside the text panel. On narrow screens, `mobileLift` moves the scene up above the bottom panel instead.

## Tweaking

- **Colours / mood**: edit `CONFIG.time.stops`. `sunEl` and `sunAz` are radians; azimuth 0 looks down the valley (−z).
- **Camera**: edit `CONFIG.camera.points`. Each point is `{ x | dx, z, y | above }`. `dx` offsets from the trail (`world.pathX(z)`) and `above` is a height above the terrain. The camera is clamped to `minHeightAboveGround` every frame.
- **Landscape**: `heightAt()` in `terrain.js`, plus `world.lake`, `world.camp`, `world.ridge` and `world.pathX` in config.
- **Performance**: `world.segments` (terrain triangles = segments² × 2), `world.trees.count`, `CONFIG.particles`, `CONFIG.quality`.

## Adding a section

1. **Markup**: copy a `<section data-section>` block in `index.html`. Give it a unique `id`, `data-side="left|right"` (panel side on desktop) and `aria-labelledby`. Put `data-reveal` on each element that should fade in.
2. **Nav**: add a link to `.nav` and a dot to `.dots`, each with `data-nav="<id>"`.
3. **Camera**: add one transition point and one rest point in `CONFIG.camera.points` where the new stop belongs, in path order.
4. **Section config**: add `{ id, label, point, tod, focusX }` to `CONFIG.sections`, in the same order as the HTML.
   - `point` is the index of the rest point.
   - Update the `point` of every later section, because their indices shift.
   - Keep `tod` increasing along the journey.
   - Use a positive `focusX` when the panel is on the left and a negative one when it is on the right.
5. **Optional colour stop**: if the new stop needs its own look, add a stop to `CONFIG.time.stops`. Stops must stay sorted by `t`.
6. **Check**: run `npm run dev`, scroll to the section at 1366×768 and 390×844, and confirm the panel doesn't cover the focal point. On mobile, panels must stay under ~45% of the viewport height.

## Behaviour notes

- **Adaptive quality**: if the rolling 60-frame average stays above 26 ms for 2 s, the pixel ratio steps down by 0.25 (to a minimum of 1). After that, particle draw ranges are halved. Quality never steps back up. Frames over 100 ms are ignored, because they are stalls or throttled windows, not GPU cost.
- **Hidden tab**: rendering pauses while `document.hidden` is true.
- **`prefers-reduced-motion`**: no Lenis (native scroll), no damping, idle motion or parallax, opacity-only reveals, and rendering only happens when the view changes.
- **No WebGL**, or `?nowebgl` in the URL: the canvas is removed and a CSS gradient replaces it. The nav, dots, accent colour and form still work.
- **Dev only**: `window.__journey` exposes `stats`, `renderer`, `camera`, `scene`, `cur` and `scrollTo`, and the triangle count is logged once.
- **Shared light**: don't toggle `visible` on lights. That changes the light count and recompiles every shader. Set the intensity to 0 instead.
- **Programmatic scrolling**: go through `scroll.scrollTo(id)` (Lenis). A raw `window.scrollTo` gets pulled back by Lenis.
