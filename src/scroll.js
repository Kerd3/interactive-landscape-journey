import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CONFIG } from './config.js';
import { clamp, lerp, smootherstep } from './noise.js';

// Scroll → { t on the camera curve, timeOfDay, focusX, progress, active }.
export function createScroll({ reduced }) {
  const restT = CONFIG.sections.map((s) => s.point / (CONFIG.camera.points.length - 1));
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const els = [...document.querySelectorAll('[data-section]')];
  const S = CONFIG.sections;
  const L = CONFIG.layout;
  let anchors = [];
  let tops = [];
  let maxScroll = 1;

  function measure() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    tops = els.map((el) => el.getBoundingClientRect().top + window.scrollY);
    anchors = tops.map((t) => Math.min(t, maxScroll));
    for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
  }
  measure();
  window.addEventListener('resize', measure);
  new ResizeObserver(measure).observe(document.body);
  document.fonts?.ready.then(measure);

  const out = { t: 0, tod: S[0].tod, focusX: S[0].focusX, progress: 0, active: 0 };

  function sample() {
    const y = window.scrollY;
    const n = S.length;
    let i = n - 1;
    let g = 0;
    if (y <= anchors[0]) {
      i = 0;
    } else {
      for (let k = 0; k < n - 1; k++) {
        if (y < anchors[k + 1]) {
          i = k;
          const f = (y - anchors[k]) / (anchors[k + 1] - anchors[k]);
          // Rest while the section's text is on screen, then glide to the next stop.
          g = smootherstep((f - L.holdStart) / (L.holdEnd - L.holdStart));
          break;
        }
      }
    }
    const j = Math.min(i + 1, n - 1);
    out.t = lerp(restT[i], restT[j], g);
    out.tod = lerp(S[i].tod, S[j].tod, g);
    out.focusX = lerp(S[i].focusX, S[j].focusX, g);
    out.progress = clamp(y / maxScroll, 0, 1);

    const probe = y + window.innerHeight * 0.5;
    let active = 0;
    for (let k = 0; k < n; k++) if (tops[k] <= probe) active = k;
    out.active = active;
    return out;
  }

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = Math.min(el.getBoundingClientRect().top + window.scrollY, maxScroll);
    if (lenis) lenis.scrollTo(top, { duration: 1.8 });
    else window.scrollTo({ top, behavior: 'auto' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  return { sample, scrollTo, measure, lenis };
}

// Text panel reveals (ScrollTrigger is used only for this).
export function setupReveals(reduced) {
  document.querySelectorAll('[data-section]').forEach((sec, i) => {
    const items = sec.querySelectorAll('[data-reveal]');
    if (!items.length) return;
    const hidden = { opacity: 0, y: reduced ? 0 : 26 };
    if (i > 0) gsap.set(items, hidden);
    ScrollTrigger.create({
      trigger: sec,
      start: i === 0 ? 'top bottom' : 'top 60%',
      end: 'bottom 60%',
      onToggle(self) {
        gsap.to(items, {
          ...(self.isActive ? { opacity: 1, y: 0 } : hidden),
          duration: reduced ? 0.3 : 0.9,
          stagger: self.isActive && !reduced ? 0.07 : 0,
          ease: 'power2.out',
          overwrite: true,
        });
      },
    });
  });
}
