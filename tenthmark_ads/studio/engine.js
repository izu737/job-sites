/* Tenthmark ad engine.
 * One file shared by the studio page and the bulk renderer, so what you tune
 * in the studio is exactly what render.mjs produces.
 *
 *   TM.renderAd(root, preset, copy, { bgScale })  draws one ad into root
 *   TM.TEMPLATES                                  starting presets
 *   TM.SCHEMA                                     slider definitions
 */
(function () {
  'use strict';
  const TM = {};

  /* ---------- fonts ---------- */
  TM.FONTS = [
    { id: 'inter', label: 'Inter Display', css: "'Inter', 'Inter Display', system-ui, sans-serif", opsz: 32 },
    { id: 'inter_text', label: 'Inter', css: "'Inter', system-ui, sans-serif", opsz: 14 },
    { id: 'inter_tight', label: 'Inter Tight', css: "'Inter Tight', 'Inter', system-ui, sans-serif" },
    { id: 'hanken', label: 'Hanken Grotesk', css: "'Hanken Grotesk', 'Inter', system-ui, sans-serif" },
    { id: 'geist', label: 'Geist', css: "'Geist', 'Inter', system-ui, sans-serif" },
    { id: 'manrope', label: 'Manrope', css: "'Manrope', 'Inter', system-ui, sans-serif" },
    { id: 'dm_sans', label: 'DM Sans', css: "'DM Sans', 'Inter', system-ui, sans-serif" },
    { id: 'jakarta', label: 'Plus Jakarta Sans', css: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" },
    { id: 'instrument_sans', label: 'Instrument Sans', css: "'Instrument Sans', 'Inter', system-ui, sans-serif" },
    { id: 'figtree', label: 'Figtree', css: "'Figtree', 'Inter', system-ui, sans-serif" },
    { id: 'onest', label: 'Onest', css: "'Onest', 'Inter', system-ui, sans-serif" },
    { id: 'sora', label: 'Sora', css: "'Sora', 'Inter', system-ui, sans-serif" },
    { id: 'space_grotesk', label: 'Space Grotesk', css: "'Space Grotesk', 'Inter', system-ui, sans-serif" },
    { id: 'fraunces', label: 'Fraunces (serif)', css: "'Fraunces', Georgia, serif" },
    { id: 'instrument_serif', label: 'Instrument Serif', css: "'Instrument Serif', Georgia, serif" },
    { id: 'newsreader', label: 'Newsreader (serif)', css: "'Newsreader', Georgia, serif" },
  ];
  TM.FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..800&family=Inter+Tight:wght@300..800&family=Hanken+Grotesk:wght@300..800&family=Geist:wght@300..800&family=Manrope:wght@300..800&family=DM+Sans:opsz,wght@9..40,300..800&family=Plus+Jakarta+Sans:wght@300..800&family=Instrument+Sans:wght@400..700&family=Figtree:wght@300..800&family=Onest:wght@300..800&family=Sora:wght@300..800&family=Space+Grotesk:wght@300..700&family=Fraunces:opsz,wght@9..144,300..800&family=Instrument+Serif&family=Newsreader:opsz,wght@6..72,300..800&display=swap';
  const font = (id) => TM.FONTS.find((f) => f.id === id) || TM.FONTS[0];

  /* ---------- palettes: deep, mid, bright, accent, light ---------- */
  TM.PALETTES = {
    forest: ['#06231B', '#0F5A43', '#19A374', '#D7F75B', '#F2FBEA'],
    mint: ['#0B3B34', '#1E8C74', '#5EE6A8', '#B8F5D8', '#F6FFF9'],
    citrus: ['#0E3B2E', '#1BA36B', '#C6F432', '#FFE45C', '#FFFBE6'],
    lagoon: ['#022B3A', '#04778A', '#1FB5C4', '#9BF2E8', '#F0FFFD'],
    cobalt: ['#0A2AA8', '#2F5BFF', '#6EA8FF', '#B9D7FF', '#F2F7FF'],
    iris: ['#2A1B8F', '#6B4CF5', '#B08CFF', '#F48FD8', '#F7EEFF'],
    solar: ['#4B2BD6', '#8E6CFF', '#FFB347', '#FFE27A', '#FFF6DA'],
    dusk: ['#101436', '#3A2E7A', '#E0607E', '#FFB38A', '#FFE9D6'],
    ember: ['#2B0B0B', '#8A1E12', '#F0582A', '#FFB067', '#FFF1E0'],
    graphite: ['#0D0F12', '#2A2F36', '#5F6B78', '#C9D2DC', '#F4F6F8'],
  };

  TM.STYLES = ['silk', 'fold', 'mesh', 'ribbon', 'aurora', 'conic', 'linear'];
  TM.FORMATS = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], landscape: [1200, 628] };

  /* ---------- helpers ---------- */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgba = (h, a = 1) => `rgba(${hex(h).join(',')},${a})`;
  function sample(P, t, a = 1) {
    t = Math.min(1, Math.max(0, t)) * (P.length - 1);
    const i = Math.min(P.length - 2, Math.floor(t)), f = t - i;
    const x = hex(P[i]), y = hex(P[i + 1]);
    return `rgba(${x.map((v, k) => Math.round(v + (y[k] - v) * f)).join(',')},${a})`;
  }
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // Draw at low resolution (cheap natural blur), in full size coordinates.
  function lowres(D, f, draw) {
    const s = Math.max(8, Math.round(D / f));
    const c = mk(s, s), x = c.getContext('2d');
    x.scale(s / D, s / D);
    draw(x);
    return c;
  }
  // Box blur by averaging offset copies; cross browser (no ctx.filter).
  function soften(c, r = 2, passes = 2) {
    const t = mk(c.width, c.height), tx = t.getContext('2d'), x = c.getContext('2d');
    const offs = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]];
    for (let p = 0; p < passes; p++) {
      tx.clearRect(0, 0, t.width, t.height);
      offs.forEach(([dx, dy], k) => { tx.globalAlpha = 1 / (k + 1); tx.drawImage(c, dx, dy); });
      tx.globalAlpha = 1;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(t, 0, 0);
    }
    return c;
  }
  function blit(ctx, src, D, mode = 'source-over', alpha = 1) {
    let cur = src;
    while (cur.width * 2 < D) {
      const n = mk(cur.width * 2, cur.height * 2), nx = n.getContext('2d');
      nx.imageSmoothingQuality = 'high';
      nx.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, D, D);
    ctx.restore();
  }
  function curve(x, pts) {
    x.beginPath();
    x.moveTo(pts[0], pts[1]);
    x.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  }

  /* ---------- background styles ----------
   * Each draws into a D x D square (D = diagonal of the ad, so rotation
   * never shows a corner). v(a) maps 0..1 onto the visible middle.      */
  const STY = {};

  // Stripe ad 2: long silky light streaks.
  STY.silk = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a), u = D / 1500;
    const g = x.createLinearGradient(0, 0, D, D);
    g.addColorStop(0, P[1]); g.addColorStop(0.55, P[0]); g.addColorStop(1, P[1]);
    x.fillStyle = g; x.fillRect(0, 0, D, D);
    const n = Math.round(40 + b.complexity * 2.6);
    const strands = [];
    for (let i = 0; i < n; i++) {
      const w = (r() + r() + r()) / 3, o = (w - 0.5) * D * 0.55 * b.spread, sag = (r() - 0.5) * D * 0.08;
      strands.push({ w, pts: [v(-0.2), v(0.95) + o, v(0.25), v(0.7) + o * 1.4 + sag, v(0.6), v(0.25) + o * 0.9 - sag, v(1.25), v(-0.05) + o * 0.5], wide: u * (20 + r() * 110), thin: u * (0.6 + r() * 2.6), a: 0.05 + r() * 0.3 });
    }
    const glow = lowres(D, 8, (lx) => {
      lx.lineCap = 'round';
      strands.forEach((s) => { curve(lx, s.pts); lx.strokeStyle = sample(P.slice(1), s.w, s.a * 0.9); lx.lineWidth = s.wide; lx.stroke(); });
    });
    blit(x, soften(glow, 2, 2), D, 'screen', 0.9);
    x.save(); x.globalCompositeOperation = 'screen';
    strands.forEach((s) => { curve(x, s.pts); x.strokeStyle = sample(P.slice(2), s.w, s.a * b.intensity); x.lineWidth = s.thin; x.stroke(); });
    x.restore();
    const core = lowres(D, 10, (lx) => {
      curve(lx, [v(-0.2), v(0.95), v(0.25), v(0.7), v(0.6), v(0.25), v(1.25), v(-0.05)]);
      lx.strokeStyle = rgba(P[4], 0.9); lx.lineWidth = D * 0.05 * b.spread; lx.stroke();
    });
    blit(x, soften(core, 2, 3), D, 'screen', 0.6 * b.intensity);
  };

  // Stripe ad 1: a glossy folded sheet of light with a crisp edge.
  STY.fold = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a), u = D / 1500;
    const g = x.createLinearGradient(v(1), v(0), v(0), v(1));
    g.addColorStop(0, P[3]); g.addColorStop(0.45, P[2]); g.addColorStop(1, P[1]);
    x.fillStyle = g; x.fillRect(0, 0, D, D);
    blit(x, soften(lowres(D, 10, (lx) => {
      const rg = lx.createRadialGradient(v(0), v(1), 0, v(0), v(1), D * 0.5);
      rg.addColorStop(0, rgba(P[0], 0.7)); rg.addColorStop(1, rgba(P[0], 0));
      lx.fillStyle = rg; lx.fillRect(0, 0, D, D);
    }), 2, 2), D);
    const folds = 1 + Math.round(b.complexity / 50);
    for (let k = 0; k < folds; k++) {
      const s = k === 0 ? 1 : -1;
      const sx = k === 0 ? 0.3 + r() * 0.35 : 0.0, ey = k === 0 ? 0.35 + r() * 0.35 * b.spread : 0.75 + r() * 0.15;
      const pts = k === 0
        ? [v(sx), v(-0.2), v(sx + 0.15), v(0.25), v(0.75), v(ey - 0.05), v(1.25), v(ey)]
        : [v(-0.25), v(ey), v(0.2), v(ey - 0.1), v(0.4), v(0.95), v(0.45), v(1.25)];
      // soft shadow outside the sheet
      blit(x, soften(lowres(D, 14, (lx) => {
        lx.translate(-s * D * 0.02, s * D * 0.03);
        curve(lx, pts); lx.strokeStyle = rgba(P[0], 0.5); lx.lineWidth = D * 0.09; lx.stroke();
      }), 2, 4), D, 'multiply', 0.45 * b.shadow);
      // the sheet itself
      x.save();
      curve(x, pts);
      if (k === 0) { x.lineTo(v(1.25), v(-0.2)); } else { x.lineTo(v(-0.25), v(1.25)); }
      x.closePath();
      const mx = (pts[2] + pts[4]) / 2, my = (pts[3] + pts[5]) / 2;
      const cx = k === 0 ? v(1.1) : v(-0.1), cy = k === 0 ? v(-0.1) : v(1.1);
      const sg = x.createLinearGradient(mx, my, cx, cy);
      sg.addColorStop(0, rgba(P[4], 0.95)); sg.addColorStop(0.18, rgba(P[3], 0.9)); sg.addColorStop(0.6, rgba(P[2], 0.85)); sg.addColorStop(1, rgba(P[1], 0.9));
      x.fillStyle = sg; x.fill();
      x.restore();
      // bright rim
      blit(x, soften(lowres(D, 8, (lx) => { curve(lx, pts); lx.strokeStyle = rgba(P[4], 0.9); lx.lineWidth = D * 0.02; lx.stroke(); }), 1, 2), D, 'screen', 0.7 * b.intensity);
      curve(x, pts); x.strokeStyle = `rgba(255,255,255,${0.75 * b.intensity})`; x.lineWidth = 2.2 * u; x.stroke();
    }
    if (b.accents > 0) {
      x.strokeStyle = `rgba(255,255,255,${0.4 * b.accents})`; x.lineWidth = 1.6 * u;
      x.beginPath(); x.arc(v(0.02), v(0.88), D * 0.26, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(v(0.02), v(0.88), D * 0.36, 0, Math.PI * 2); x.stroke();
    }
  };

  // Stripe ad 3: big soft colour blobs (pair with fluted glass or the glass column).
  STY.mesh = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a);
    x.fillStyle = P[1]; x.fillRect(0, 0, D, D);
    const n = 4 + Math.round(b.complexity / 12);
    const blobs = Array.from({ length: n }, (_, i) => ({ x: v(r() * 1.1 - 0.05), y: v(r() * 1.1 - 0.05), rad: D * (0.14 + r() * 0.28) * b.spread, c: P[[0, 2, 3, 4, 2, 0, 3][i % 7]], a: 0.75 + r() * 0.25 }));
    const paint = (lx, scale, alpha) => blobs.forEach((o) => {
      const rg = lx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.rad * scale);
      rg.addColorStop(0, rgba(o.c, o.a * alpha)); rg.addColorStop(0.55, rgba(o.c, o.a * alpha * 0.55)); rg.addColorStop(1, rgba(o.c, 0));
      lx.fillStyle = rg; lx.fillRect(0, 0, D, D);
    });
    blit(x, soften(lowres(D, 10, (lx) => paint(lx, 1, 1)), 2, 3), D);
    blit(x, soften(lowres(D, 5, (lx) => paint(lx, 0.45, 0.5 * b.intensity)), 2, 2), D, 'screen');
  };

  // Round 1 growth ribbon, upgraded with a glow pass.
  STY.ribbon = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a), u = D / 1500;
    const g = x.createLinearGradient(0, 0, D, D);
    g.addColorStop(0, P[0]); g.addColorStop(0.55, P[0]); g.addColorStop(1, P[1]);
    x.fillStyle = g; x.fillRect(0, 0, D, D);
    blit(x, soften(lowres(D, 10, (lx) => {
      const rg = lx.createRadialGradient(v(0.65), v(0.5), 0, v(0.65), v(0.5), D * 0.4);
      rg.addColorStop(0, rgba(P[3], 0.45)); rg.addColorStop(1, rgba(P[3], 0));
      lx.fillStyle = rg; lx.fillRect(0, 0, D, D);
    }), 2, 2), D);
    const n = Math.round(30 + b.complexity * 1.2), twist = 0.4 + r() * 0.5, paths = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), j = () => (r() - 0.5) * D * 0.01;
      paths.push({ t, pts: [v(-0.15), v(0.95) + (t - 0.5) * D * 0.25 * b.spread + j(), v(0.38), v(1.1) - t * D * 0.5 * twist + j(), v(0.58), v(0.3) + t * D * 0.35 * twist + j(), v(1.15), v(0.05) + (t - 0.5) * D * 0.15 * b.spread + j()] });
    }
    const draw = (lx, w, k) => paths.forEach((p) => { curve(lx, p.pts); lx.strokeStyle = sample([P[2], P[3], P[4]], p.t, (0.12 + 0.55 * Math.sin(Math.PI * p.t)) * k); lx.lineWidth = w; lx.stroke(); });
    blit(x, soften(lowres(D, 6, (lx) => draw(lx, 6 * u, 0.8)), 2, 2), D, 'screen');
    x.save(); x.globalCompositeOperation = 'screen'; draw(x, 1.6 * u, b.intensity); x.restore();
  };

  // Vertical curtains of light.
  STY.aurora = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a);
    x.fillStyle = P[0]; x.fillRect(0, 0, D, D);
    const bands = 3 + Math.round(b.complexity / 20);
    const c = lowres(D, 6, (lx) => {
      lx.globalCompositeOperation = 'screen';
      for (let k = 0; k < bands; k++) {
        const ph = r() * 6.28, fq = (1.5 + r() * 3) / D, amp = D * (0.06 + r() * 0.12) * b.spread, base = v(0.15 + r() * 0.45), col = P[1 + (k % 4)];
        for (let px = 0; px < D; px += D / 160) {
          const top = base + Math.sin(px * fq * 6.28 + ph) * amp, len = D * (0.25 + 0.2 * Math.sin(px * fq * 3 + ph * 2));
          const lg = lx.createLinearGradient(0, top, 0, top + len);
          lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.15, rgba(col, 0.55)); lg.addColorStop(1, rgba(col, 0));
          lx.fillStyle = lg; lx.fillRect(px, top, D / 150, len);
        }
      }
    });
    blit(x, soften(c, 2, 3), D, 'screen', b.intensity);
  };

  // Swirl of colour around a point.
  STY.conic = (x, D, r, b, P) => {
    const v = (a) => D * (0.15 + 0.7 * a);
    x.fillStyle = P[1]; x.fillRect(0, 0, D, D);
    const cx = v(0.3 + r() * 0.4), cy = v(0.3 + r() * 0.4);
    const c = lowres(D, 6, (lx) => {
      if (!lx.createConicGradient) return;
      const cg = lx.createConicGradient(r() * 6.28, cx, cy);
      [P[1], P[2], P[3], P[4], P[2], P[0], P[1]].forEach((col, i, a) => cg.addColorStop(i / (a.length - 1), col));
      lx.fillStyle = cg; lx.fillRect(0, 0, D, D);
      const rg = lx.createRadialGradient(cx, cy, 0, cx, cy, D * 0.5 * b.spread);
      rg.addColorStop(0, rgba(P[4], 0.6 * b.intensity)); rg.addColorStop(1, rgba(P[4], 0));
      lx.fillStyle = rg; lx.fillRect(0, 0, D, D);
    });
    blit(x, soften(c, 2, 1 + Math.round(b.complexity / 25)), D);
  };

  // Clean multi stop gradient with a soft highlight.
  STY.linear = (x, D, r, b, P) => {
    const g = x.createLinearGradient(0, D, D, 0);
    P.forEach((col, i) => g.addColorStop(i / (P.length - 1), col));
    x.fillStyle = g; x.fillRect(0, 0, D, D);
    const v = (a) => D * (0.15 + 0.7 * a);
    blit(x, soften(lowres(D, 10, (lx) => {
      const rg = lx.createRadialGradient(v(0.7), v(0.3), 0, v(0.7), v(0.3), D * 0.35 * b.spread);
      rg.addColorStop(0, rgba(P[4], 0.7)); rg.addColorStop(1, rgba(P[4], 0));
      lx.fillStyle = rg; lx.fillRect(0, 0, D, D);
    }), 2, 2), D, 'screen', b.intensity);
  };

  /* ---------- background compositor ---------- */
  const cache = new Map();
  function source(b, D) {
    const key = JSON.stringify([b.style, b.seed, b.colors, b.complexity, b.spread, b.intensity, b.accents, b.shadow, Math.round(D)]);
    if (cache.has(key)) return cache.get(key);
    const c = mk(D, D), x = c.getContext('2d');
    (STY[b.style] || STY.silk)(x, D, rng(b.seed), b, b.colors);
    cache.set(key, c);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return c;
  }

  TM.drawBackground = function (canvas, b, W, H, scale = 1) {
    const w = Math.round(W * scale), h = Math.round(H * scale), D = Math.ceil(Math.hypot(w, h));
    canvas.width = w; canvas.height = h;
    const x = canvas.getContext('2d');
    x.fillStyle = b.colors[0]; x.fillRect(0, 0, w, h);
    const src = source(b, D);
    x.save();
    x.translate(w / 2 + b.offsetX * w, h / 2 + b.offsetY * h);
    x.rotate((b.rotate * Math.PI) / 180);
    x.scale(b.zoom * (b.flipX ? -1 : 1), b.zoom * (b.flipY ? -1 : 1));
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, -D / 2, -D / 2, D, D);
    x.restore();
    if (b.flutes > 0) {
      const copy = mk(w, h);
      copy.getContext('2d').drawImage(canvas, 0, 0);
      const n = Math.round(b.flutes), sw = w / n, k = 1 - b.fluteStrength * 0.6;
      for (let i = 0; i < n; i++) {
        const sx = i * sw;
        x.drawImage(copy, sx + (sw * (1 - k)) / 2 + sw * b.fluteStrength * 0.35, 0, sw * k, h, sx, 0, sw + 0.5, h);
        const lg = x.createLinearGradient(sx, 0, sx + sw, 0);
        lg.addColorStop(0, `rgba(255,255,255,${0.16 * b.fluteStrength})`);
        lg.addColorStop(0.5, 'rgba(255,255,255,0)');
        lg.addColorStop(1, `rgba(0,0,0,${0.1 * b.fluteStrength})`);
        x.fillStyle = lg; x.fillRect(sx, 0, sw + 0.5, h);
      }
    }
  };

  const grainCache = new Map();
  function grain(w, h) {
    const key = w + 'x' + h;
    if (grainCache.has(key)) return grainCache.get(key);
    const c = mk(w, h), x = c.getContext('2d'), d = x.createImageData(c.width, c.height), r = rng(99);
    for (let i = 0; i < d.data.length; i += 4) { const g = (r() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = g; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    grainCache.set(key, c);
    return c;
  }

  /* ---------- logo (kept from round 1) ---------- */
  function logoHTML(p) {
    const s = p.size, col = p.color;
    return `<div style="display:flex;align-items:center;gap:${s * 0.28}px;color:${col};white-space:nowrap">
      <svg width="${s * 0.82}" height="${s * 0.82}" viewBox="0 0 40 40" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" aria-hidden="true">
        <line x1="8" y1="6" x2="8" y2="34"/><line x1="16" y1="6" x2="16" y2="34"/><line x1="24" y1="6" x2="24" y2="34"/><line x1="32" y1="6" x2="32" y2="34"/><line x1="3" y1="30" x2="37" y2="10"/>
      </svg>
      <span style="font-family:${font('inter').css};font-variation-settings:'opsz' 32;font-weight:700;font-size:${s}px;letter-spacing:-0.045em;line-height:1">tenthmark</span>
    </div>`;
  }

  /* ---------- widgets ---------- */
  const THEMES = {
    light: { bg: '#FFFFFF', fg: '#0B1F1A', muted: '#5B6B66', line: '#E3E8E5', thumb: 'linear-gradient(160deg,#F6F3EA,#E6EFE9)', btn: '#0B1F1A', filter: '' },
    glass: { bg: 'rgba(255,255,255,.74)', fg: '#0B1F1A', muted: '#3F4F4A', line: 'rgba(11,31,26,.12)', thumb: 'rgba(255,255,255,.6)', btn: '#0B1F1A', filter: 'backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);' },
    dark: { bg: '#0E1A17', fg: '#FFFFFF', muted: '#9DB0A9', line: 'rgba(255,255,255,.12)', thumb: 'rgba(255,255,255,.06)', btn: '#FFFFFF', filter: '' },
  };

  function cardHTML(p, c) {
    const t = THEMES[p.theme] || THEMES.light, card = c.card || {};
    return `<div style="width:664px;box-sizing:border-box;background:${t.bg};${t.filter}border-radius:${p.radius}px;padding:40px 44px 46px;box-shadow:0 ${p.shadow * 40}px ${p.shadow * 100}px rgba(0,0,0,${0.3 * p.shadow});font-family:${font(p.font).css}">
      <div style="font-size:36px;font-weight:600;color:${t.fg};letter-spacing:-0.02em">${esc(card.title)} <span style="color:${p.accent}">${esc(card.status)}</span></div>
      <div style="height:1.5px;background:${t.line};margin:28px 0 30px"></div>
      <div style="display:flex;align-items:center;gap:28px">
        <div style="width:104px;height:104px;flex:none;border-radius:18px;background:${t.thumb};display:flex;align-items:flex-end;justify-content:center;gap:8px;padding-bottom:20px;box-sizing:border-box">
          ${(card.bars || []).map((h) => `<div style="width:13px;height:${h}px;border-radius:3px;background:${p.accent}"></div>`).join('')}
        </div>
        <div><div style="font-size:30px;font-weight:600;color:${t.fg};letter-spacing:-0.01em">${esc(card.item)}</div>
        <div style="font-size:25px;color:${t.muted};margin-top:6px">${esc(card.meta)}</div></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:32px">
        <div style="flex:1;border:1.5px solid ${t.line};border-radius:14px;padding:20px 22px;font-size:25px;color:${t.fg};display:flex;justify-content:space-between;gap:12px"><span style="color:${t.muted}">${esc(card.metricLabel)}</span><b style="font-weight:600">${esc(card.metric)}</b></div>
        <div style="width:72px;flex:none;border-radius:14px;background:${t.btn};display:flex;align-items:center;justify-content:center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${t.bg === '#0E1A17' ? '#0E1A17' : '#fff'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>
        </div>
      </div>
    </div>`;
  }

  function toastHTML(p, c) {
    return `<div style="display:inline-block;background:${p.bg};color:${p.color};font-family:${font(p.font).css};font-weight:600;font-size:26px;padding:15px 28px;border-radius:12px;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.18)">${esc(c.toast)}</div>`;
  }

  function phoneHTML(p, c) {
    const ph = c.phone || {}, pct = Math.min(100, Math.round(((ph.current || 0) / (ph.target || 1)) * 100));
    const muted = '#5B6B66', fg = '#0B1F1A';
    return `<div style="position:relative;width:400px;height:660px;background:rgba(255,255,255,.95);border-radius:52px;box-shadow:0 30px 90px rgba(0,0,0,.22);overflow:hidden;font-family:${font(p.font).css}">
      <div style="position:absolute;left:50%;transform:translateX(-50%);top:0;width:150px;height:28px;background:#fff;border-radius:0 0 16px 16px;box-shadow:0 1.5px 0 #E3E8E5"></div>
      <div style="display:flex;justify-content:space-between;padding:20px 38px 0;font-size:16px;font-weight:600;color:${muted}"><span>Chat</span><span>●●● ▮</span></div>
      <div style="margin:50px 0 0 34px;width:200px;height:36px;border-radius:18px;background:#E9EDEB"></div>
      <div style="margin:18px 34px 0 auto;width:240px;height:36px;border-radius:18px;background:linear-gradient(90deg,${p.accent2},${p.accent})"></div>
      <div style="margin:18px 34px 0 auto;width:276px;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden">
        <div style="height:150px;background:linear-gradient(160deg,#F6F3EA,#E3EEE8);padding:20px 22px;box-sizing:border-box">
          <div style="font-size:13px;font-weight:600;color:${muted};text-transform:uppercase;letter-spacing:.08em">${esc(ph.label)}</div>
          <div style="font-size:48px;font-weight:700;color:${fg};letter-spacing:-0.04em;margin-top:6px">${esc(ph.current)}<span style="color:${muted};font-weight:500"> / ${esc(ph.target)}</span></div>
          <div style="height:10px;border-radius:5px;background:#D3E0D9;margin-top:12px"><div style="height:10px;width:${pct}%;border-radius:5px;background:${p.accent2}"></div></div>
        </div>
        <div style="padding:16px 22px 20px"><div style="font-size:21px;font-weight:600;color:${fg}">${esc(ph.title)}</div><div style="font-size:16px;color:${muted};margin-top:4px">${esc(ph.sub)}</div></div>
      </div>
    </div>`;
  }

  /* ---------- schema: every slider the studio shows ---------- */
  const fontOpts = TM.FONTS.map((f) => [f.id, f.label]);
  const text = (slots) => [
    ['visible', 'toggle', 'Show'], ['slot', 'select', 'Copy slot', slots],
    ['x', 'range', 'X', 0, 1200, 1], ['y', 'range', 'Y', 0, 1920, 1], ['w', 'range', 'Box width', 100, 1200, 1],
    ['font', 'select', 'Font', fontOpts], ['weight', 'range', 'Weight', 300, 800, 50], ['size', 'range', 'Size', 14, 180, 1],
    ['lineHeight', 'range', 'Line height', 0.8, 1.6, 0.01], ['tracking', 'range', 'Letter spacing', -0.08, 0.1, 0.005],
    ['align', 'select', 'Align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]],
    ['color', 'color', 'Colour'], ['opacity', 'range', 'Opacity', 0, 1, 0.01],
  ];
  const slotOpts = [['headline', 'Headline (long)'], ['headline_short', 'Headline (two short lines)'], ['headline_split', 'Headline (editorial)'], ['cta', 'Call to action'], ['toast', 'Toast text']];
  const themeOpts = [['light', 'Light'], ['glass', 'Frosted glass'], ['dark', 'Dark']];
  TM.SCHEMA = {
    logo: [['visible', 'toggle', 'Show'], ['x', 'range', 'X', 0, 1200, 1], ['y', 'range', 'Y', 0, 1920, 1], ['size', 'range', 'Size', 16, 140, 1], ['color', 'color', 'Colour']],
    headline: text(slotOpts),
    sub: text(slotOpts),
    card: [['visible', 'toggle', 'Show'], ['x', 'range', 'X', -200, 1200, 1], ['y', 'range', 'Y', -200, 1920, 1], ['scale', 'range', 'Scale', 0.4, 1.6, 0.01], ['theme', 'select', 'Style', themeOpts], ['font', 'select', 'Font', fontOpts], ['accent', 'color', 'Accent'], ['radius', 'range', 'Corner radius', 0, 48, 1], ['shadow', 'range', 'Shadow', 0, 1.5, 0.01]],
    toast: [['visible', 'toggle', 'Show'], ['x', 'range', 'X', -200, 1200, 1], ['y', 'range', 'Y', -200, 1920, 1], ['scale', 'range', 'Scale', 0.4, 1.8, 0.01], ['font', 'select', 'Font', fontOpts], ['bg', 'color', 'Fill'], ['color', 'color', 'Text']],
    phone: [['visible', 'toggle', 'Show'], ['x', 'range', 'X', -200, 1200, 1], ['y', 'range', 'Y', -200, 1920, 1], ['scale', 'range', 'Scale', 0.4, 1.8, 0.01], ['font', 'select', 'Font', fontOpts], ['accent', 'color', 'Bubble end'], ['accent2', 'color', 'Bubble start']],
    bg: [
      ['style', 'select', 'Style', TM.STYLES.map((s) => [s, s[0].toUpperCase() + s.slice(1)])],
      ['seed', 'range', 'Seed', 1, 999, 1],
      ['complexity', 'range', 'Detail', 0, 100, 1], ['spread', 'range', 'Spread', 0.2, 2, 0.01], ['intensity', 'range', 'Light intensity', 0, 1.6, 0.01], ['accents', 'range', 'Line accents', 0, 1, 0.01], ['shadow', 'range', 'Fold shadow', 0, 2, 0.01],
      ['rotate', 'range', 'Rotate', -180, 180, 1], ['zoom', 'range', 'Zoom', 0.5, 3, 0.01], ['offsetX', 'range', 'Shift X', -0.6, 0.6, 0.005], ['offsetY', 'range', 'Shift Y', -0.6, 0.6, 0.005],
      ['flipX', 'toggle', 'Flip horizontal'], ['flipY', 'toggle', 'Flip vertical'],
      ['softness', 'range', 'Softness (blur)', 0, 40, 0.5], ['flutes', 'range', 'Fluted glass strips', 0, 30, 1], ['fluteStrength', 'range', 'Flute strength', 0, 1, 0.01],
      ['hue', 'range', 'Hue shift', -180, 180, 1], ['saturation', 'range', 'Saturation', 0, 2, 0.01], ['brightness', 'range', 'Brightness', 0.4, 1.6, 0.01], ['contrast', 'range', 'Contrast', 0.5, 1.6, 0.01],
      ['grain', 'range', 'Grain', 0, 0.5, 0.005], ['vignette', 'range', 'Vignette', 0, 1, 0.01],
      ['region', 'select', 'Artwork area', [['full', 'Full bleed'], ['top', 'Top band, panel below']]], ['artHeight', 'range', 'Band height', 150, 1920, 1], ['panel', 'color', 'Panel colour'],
    ],
    overlay: [
      ['vOn', 'toggle', 'Vertical guide'], ['vX', 'range', 'Vertical guide X', 0, 1200, 1], ['vDashed', 'toggle', 'Dashed'],
      ['hOn', 'toggle', 'Horizontal guide 1'], ['hY', 'range', 'Guide 1 Y', 0, 1920, 1],
      ['h2On', 'toggle', 'Horizontal guide 2'], ['h2Y', 'range', 'Guide 2 Y', 0, 1920, 1],
      ['guideOpacity', 'range', 'Guide opacity', 0, 1, 0.01],
      ['colOn', 'toggle', 'Glass column'], ['colX', 'range', 'Column X', 0, 1200, 1], ['colW', 'range', 'Column width', 100, 1200, 1],
      ['colBlur', 'range', 'Column blur', 0, 80, 1], ['colTint', 'range', 'Column whiteness', 0, 0.6, 0.005], ['colBorder', 'range', 'Column edge', 0, 1, 0.01],
    ],
  };

  /* ---------- starting presets (traced from the three Stripe ads) ---------- */
  const T = (o) => JSON.parse(JSON.stringify(o));
  const baseBg = { seed: 7, complexity: 55, spread: 1, intensity: 1, accents: 0.6, shadow: 1, rotate: 0, zoom: 1, offsetX: 0, offsetY: 0, flipX: false, flipY: false, softness: 0, flutes: 0, fluteStrength: 0.5, hue: 0, saturation: 1, brightness: 1, contrast: 1, grain: 0.06, vignette: 0, region: 'full', artHeight: 510, panel: '#FFFFFF' };
  const baseOverlay = { vOn: false, vX: 136, vDashed: true, hOn: false, hY: 500, h2On: false, h2Y: 1012, guideOpacity: 0.3, colOn: false, colX: 216, colW: 648, colBlur: 34, colTint: 0.16, colBorder: 0.45 };
  const txt = (o) => Object.assign({ visible: true, slot: 'headline', x: 80, y: 160, w: 900, font: 'inter', weight: 500, size: 80, lineHeight: 1.08, tracking: -0.03, align: 'left', color: '#FFFFFF', opacity: 1 }, o);
  const hidden = { visible: false };
  const card0 = { visible: false, x: 208, y: 578, scale: 1, theme: 'light', font: 'inter_text', accent: '#18A374', radius: 28, shadow: 1 };
  const toast0 = { visible: false, x: 430, y: 930, scale: 1, font: 'inter_text', bg: '#0B1F1A', color: '#FFFFFF' };
  const phone0 = { visible: false, x: 355, y: 540, scale: 0.93, font: 'inter_text', accent: '#D7F75B', accent2: '#18A374' };

  TM.TEMPLATES = {
    proof_card: {
      name: 'Proof card', format: 'square',
      bg: Object.assign({}, baseBg, { style: 'fold', colors: TM.PALETTES.lagoon.slice(), seed: 11 }),
      overlay: Object.assign({}, baseOverlay, { vOn: true, hOn: true, hY: 500 }),
      els: {
        logo: { visible: true, x: 185, y: 92, size: 46, color: '#FFFFFF' },
        headline: txt({ x: 185, y: 168, w: 760, size: 80, weight: 500, lineHeight: 1.1 }),
        sub: txt(Object.assign({ slot: 'cta' }, hidden)),
        card: Object.assign({}, card0, { visible: true }),
        toast: Object.assign({}, toast0, { visible: true }),
        phone: Object.assign({}, phone0),
      },
    },
    split_editorial: {
      name: 'Split editorial', format: 'square',
      bg: Object.assign({}, baseBg, { style: 'silk', colors: TM.PALETTES.citrus.slice(), seed: 21, region: 'top', artHeight: 510 }),
      overlay: Object.assign({}, baseOverlay),
      els: {
        logo: { visible: true, x: 66, y: 590, size: 50, color: '#0B1F1A' },
        headline: txt({ slot: 'headline_split', x: 66, y: 682, w: 900, size: 60, weight: 400, lineHeight: 1.08, tracking: -0.025, color: '#0B1F1A' }),
        sub: txt({ slot: 'cta', x: 66, y: 905, w: 600, size: 40, weight: 400, lineHeight: 1.2, tracking: -0.01, color: '#0B1F1A' }),
        card: Object.assign({}, card0), toast: Object.assign({}, toast0), phone: Object.assign({}, phone0),
      },
    },
    phone_chat: {
      name: 'Phone chat', format: 'square',
      bg: Object.assign({}, baseBg, { style: 'mesh', colors: TM.PALETTES.mint.slice(), seed: 42, flutes: 6, fluteStrength: 0.45 }),
      overlay: Object.assign({}, baseOverlay, { colOn: true, hOn: true, hY: 68, h2On: true, h2Y: 1012 }),
      els: {
        logo: { visible: true, x: 432, y: 150, size: 54, color: '#FFFFFF' },
        headline: txt({ slot: 'headline_short', x: 90, y: 248, w: 900, size: 80, weight: 500, lineHeight: 1.1, align: 'center' }),
        sub: txt(Object.assign({ slot: 'cta' }, hidden)),
        card: Object.assign({}, card0), toast: Object.assign({}, toast0),
        phone: Object.assign({}, phone0, { visible: true }),
      },
    },
  };
  TM.clone = T;

  /* ---------- render one ad ---------- */
  TM.size = (preset) => TM.FORMATS[preset.format] || TM.FORMATS.square;

  TM.renderAd = function (root, preset, copy, opts = {}) {
    const [W, H] = TM.size(preset), b = preset.bg, o = preset.overlay, e = preset.els;
    const artH = b.region === 'top' ? Math.min(H, b.artHeight) : H;
    root.innerHTML = '';
    const ad = document.createElement('div');
    ad.className = 'tm-ad';
    ad.style.cssText = `position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${b.region === 'top' ? b.panel : b.colors[0]};`;
    root.appendChild(ad);

    const art = document.createElement('div');
    art.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${artH}px;overflow:hidden;`;
    const cv = document.createElement('canvas');
    TM.drawBackground(cv, b, W, artH, opts.bgScale || 1);
    const pad = b.softness > 0 ? 1 + (b.softness * 4) / Math.min(W, artH) : 1;
    cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${artH}px;transform:scale(${pad});filter:hue-rotate(${b.hue}deg) saturate(${b.saturation}) brightness(${b.brightness}) contrast(${b.contrast})${b.softness > 0 ? ` blur(${b.softness}px)` : ''};`;
    art.appendChild(cv);
    if (b.grain > 0) {
      const g = grain(Math.round(W * (opts.bgScale || 1)), Math.round(artH * (opts.bgScale || 1)));
      const gc = document.createElement('canvas');
      gc.width = g.width; gc.height = g.height; gc.getContext('2d').drawImage(g, 0, 0);
      gc.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${artH}px;mix-blend-mode:overlay;opacity:${b.grain};`;
      art.appendChild(gc);
    }
    if (b.vignette > 0) {
      const vg = document.createElement('div');
      vg.style.cssText = `position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${b.vignette * 0.7}) 100%);`;
      art.appendChild(vg);
    }
    ad.appendChild(art);

    // overlay: glass column then guides
    let ov = '';
    if (o.colOn) {
      const bd = `rgba(255,255,255,${o.colBorder})`;
      ov += `<div style="position:absolute;left:${o.colX}px;width:${o.colW}px;top:${-o.colBlur * 3}px;height:${artH + o.colBlur * 6}px;background:rgba(255,255,255,${o.colTint});backdrop-filter:blur(${o.colBlur}px);-webkit-backdrop-filter:blur(${o.colBlur}px);border-left:1.5px solid ${bd};border-right:1.5px solid ${bd}"></div>`;
    }
    const gc = `rgba(255,255,255,${o.guideOpacity})`;
    if (o.vOn) ov += `<div style="position:absolute;left:${o.vX}px;top:0;height:${artH}px;border-left:1.5px ${o.vDashed ? 'dashed' : 'solid'} ${gc}"></div>`;
    if (o.hOn) ov += `<div style="position:absolute;left:0;width:${W}px;top:${o.hY}px;border-top:1.5px solid ${gc}"></div>`;
    if (o.h2On) ov += `<div style="position:absolute;left:0;width:${W}px;top:${o.h2Y}px;border-top:1.5px solid ${gc}"></div>`;
    if (ov) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;pointer-events:none'; d.innerHTML = ov; ad.appendChild(d); }

    const place = (key, html, css = '') => {
      const d = document.createElement('div');
      d.dataset.el = key;
      d.style.cssText = `position:absolute;left:${e[key].x}px;top:${e[key].y}px;${css}`;
      d.innerHTML = html;
      ad.appendChild(d);
      return d;
    };
    for (const key of ['card', 'phone', 'toast']) {
      const p = e[key];
      if (!p.visible) continue;
      const html = key === 'card' ? cardHTML(p, copy) : key === 'phone' ? phoneHTML(p, copy) : toastHTML(p, copy);
      const d = place(key, html, `transform:scale(${p.scale});transform-origin:0 0;`);
      if (key === 'toast') d.style.transformOrigin = '0 0';
    }
    if (e.logo.visible) place('logo', logoHTML(e.logo));
    for (const key of ['headline', 'sub']) {
      const p = e[key];
      if (!p.visible) continue;
      const f = font(p.font);
      const d = place(key, '', `width:${p.w}px;font-family:${f.css};${f.opsz ? `font-variation-settings:'opsz' ${f.opsz};` : ''}font-weight:${p.weight};font-size:${p.size}px;line-height:${p.lineHeight};letter-spacing:${p.tracking}em;text-align:${p.align};color:${p.color};opacity:${p.opacity};white-space:pre-line;text-wrap:balance;margin:0;`);
      d.textContent = copy[p.slot] ?? '';
    }
    return ad;
  };

  /* Fill in any keys a saved preset is missing, so old presets keep working. */
  TM.normalize = function (p) {
    const base = TM.TEMPLATES[p.template] || TM.TEMPLATES.proof_card;
    const out = T(base);
    out.template = p.template || 'proof_card';
    if (p.format) out.format = p.format;
    if (p.name) out.name = p.name;
    Object.assign(out.bg, p.bg || {});
    Object.assign(out.overlay, p.overlay || {});
    for (const k of Object.keys(out.els)) Object.assign(out.els[k], (p.els || {})[k] || {});
    return out;
  };

  TM.fromTemplate = function (id) {
    const t = T(TM.TEMPLATES[id]);
    t.template = id;
    return t;
  };

  window.TM = TM;
})();
