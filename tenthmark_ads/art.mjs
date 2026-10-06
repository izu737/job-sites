// Generative hero artwork. Replaces the Stripe gradient with a Tenthmark
// visual: a silk ribbon of lines rising from bottom left to top right
// (a growth curve), on a deep green field with film grain.
// Same seed in, same image out, so a variant can be reproduced exactly.

import { brand } from './brand.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

const palettes = {
  forest: { bg: ['ink', 'deep', 'base'], line: ['mint', 'lime'], glow: 'lime' },
  dawn: { bg: ['deep', 'base', 'emerald'], line: ['lime', 'cream'], glow: 'mint' },
  night: { bg: ['ink', 'ink', 'deep'], line: ['emerald', 'mint'], glow: 'emerald' },
};

export function art({ w, h, seed = 7, palette = 'forest', lines = 70 }) {
  const c = brand.colors;
  const p = palettes[palette] ?? palettes.forest;
  const r = rng(seed);
  const tilt = 0.85 + r() * 0.3;
  const twist = 0.4 + r() * 0.5;
  const id = `a${seed}${palette}`;

  let paths = '';
  for (let i = 0; i < lines; i++) {
    const t = i / (lines - 1);
    const j = () => (r() - 0.5) * h * 0.015;
    const y0 = h * (0.92 * tilt) + (t - 0.5) * h * 0.3 + j();
    const y3 = h * 0.08 + (t - 0.5) * h * 0.2 + j();
    const c1y = h * 1.1 - t * h * 0.7 * twist + j();
    const c2y = h * 0.3 + t * h * 0.45 * twist + j();
    const d = `M${-80},${y0.toFixed(1)} C${(w * 0.38).toFixed(1)},${c1y.toFixed(1)} ${(w * 0.58).toFixed(1)},${c2y.toFixed(1)} ${w + 80},${y3.toFixed(1)}`;
    const op = (0.12 + 0.55 * Math.sin(Math.PI * t)).toFixed(2);
    paths += `<path d="${d}" stroke="${mix(c[p.line[0]], c[p.line[1]], t)}" stroke-opacity="${op}" stroke-width="1.6" fill="none"/>`;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" style="display:block">
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c[p.bg[0]]}"/>
      <stop offset="0.55" stop-color="${c[p.bg[1]]}"/>
      <stop offset="1" stop-color="${c[p.bg[2]]}"/>
    </linearGradient>
    <radialGradient id="${id}glow">
      <stop offset="0" stop-color="${c[p.glow]}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${c[p.glow]}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id}bg)"/>
  <ellipse cx="${w * (0.55 + r() * 0.2)}" cy="${h * 0.5}" rx="${w * 0.55}" ry="${h * 0.45}" fill="url(#${id}glow)"/>
  <g filter="url(#${id}blur)" opacity="0.7">${paths}</g>
  <g>${paths}</g>
  <rect width="${w}" height="${h}" filter="url(#${id}grain)"/>
</svg>`;
}
