import { CONFIG } from './config.js';

// DOM-side UI: nav, dots, progress bar, accent colour, form, card tilt.
export function initUI({ reduced, finePointer }) {
  const root = document.documentElement;
  const ids = CONFIG.sections.map((s) => s.id);
  const highlightable = [...document.querySelectorAll('.nav a[data-nav], .dots a[data-nav]')];
  const bar = document.querySelector('.progress__bar');
  let lastActive = -1;
  let lastAccent = '';
  let lastProgress = -1;

  function bindNavigation(scrollTo) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        scrollTo(a.dataset.nav);
      });
    });
  }

  function update({ progress, active, accent }) {
    if (Math.abs(progress - lastProgress) > 0.0005) {
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      lastProgress = progress;
    }
    if (active !== lastActive) {
      for (const a of highlightable) {
        const on = a.dataset.nav === ids[active];
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      }
      lastActive = active;
    }
    if (accent && accent !== lastAccent) {
      root.style.setProperty('--accent', accent);
      lastAccent = accent;
    }
  }

  // Contact form: native validation, nothing is sent anywhere.
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = "Thanks — we'll be in touch.";
    form.reset();
  });
  form?.addEventListener('input', () => {
    if (status.textContent) status.textContent = '';
  });

  // Subtle 3D tilt on the experience cards (pointer devices only).
  if (finePointer && !reduced) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(700px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
      });
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
      });
    });
  }

  return { bindNavigation, update };
}
