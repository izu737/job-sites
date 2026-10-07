// Bulk renderer. Runs the same engine as the studio (studio/engine.js) in
// headless Chromium and writes one PNG per preset x angle x seed (x flip).
//
//   node render.mjs                              every preset x every angle
//   node render.mjs --preset proof_card          one preset (file name in presets/)
//   node render.mjs --angles angles/devtools.json  a different copy file
//   node render.mjs --angle speed                one angle from that file
//   node render.mjs --seeds 5                    5 background variations each
//   node render.mjs --flips                      also render mirrored versions
//   node render.mjs --out my_run                 write to out/my_run/ (default: out/latest/)
//   node render.mjs --jitter 0.5                 also vary rotation, zoom and position (0 to 1) per seed
//
// Every run also writes report.json and flags ads where text collides with
// another element, runs off the canvas, or sits on a background too close to
// its own colour to read, so a big batch can be screened fast.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const here = new URL('.', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const seeds = Number(arg('seeds', 1));
const flips = process.argv.includes('--flips');
const onlyPreset = arg('preset'), onlyAngle = arg('angle');
const anglesFile = resolve(here, arg('angles', 'angles.json'));
const runName = arg('out', 'latest');
const jitter = Math.max(0, Math.min(1, Number(arg('jitter', 0))));

const presets = readdirSync(here + 'presets').filter((f) => f.endsWith('.json'))
  .map((f) => ({ id: f.replace('.json', ''), data: JSON.parse(readFileSync(here + 'presets/' + f, 'utf8')) }))
  .filter((p) => !onlyPreset || p.id === onlyPreset);
const angles = JSON.parse(readFileSync(anglesFile, 'utf8')).angles.filter((a) => !onlyAngle || a.id === onlyAngle);
if (!presets.length) throw new Error('No presets matched. Check presets/ and --preset.');
if (!angles.length) throw new Error('No angles matched. Check ' + anglesFile + ' and --angle.');

const outDir = here + 'out/' + runName + '/';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 1920 } });
const tab = await ctx.newPage();
await tab.goto('file://' + here + 'studio/render_page.html');
await tab.evaluate(() => document.fonts.ready);

const made = [], report = [];
for (const p of presets) {
  for (const a of angles) {
    for (let s = 0; s < seeds; s++) {
      for (const flip of flips ? [false, true] : [false]) {
        const file = `${p.id}__${a.id}__s${s}${flip ? 'f' : ''}.png`;
        const res = await tab.evaluate(async ({ preset, copy, s, flip, jitter }) => {
          const pr = TM.normalize(preset);
          pr.bg.seed = ((pr.bg.seed + s * 17 - 1) % 999) + 1;
          if (flip) pr.bg.flipX = !pr.bg.flipX;
          if (jitter > 0 && s > 0) {
            // deterministic per seed, so a variation can be reproduced from report.json
            let a = pr.bg.seed * 2654435761 >>> 0;
            const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
            pr.bg.rotate = Math.round(pr.bg.rotate + rnd() * 35 * jitter);
            pr.bg.zoom = +(pr.bg.zoom * (1 + Math.abs(rnd()) * 0.45 * jitter)).toFixed(3);
            pr.bg.offsetX = +(pr.bg.offsetX + rnd() * 0.18 * jitter).toFixed(3);
            pr.bg.offsetY = +(pr.bg.offsetY + rnd() * 0.18 * jitter).toFixed(3);
          }
          const ad = TM.renderAd(document.getElementById('root'), pr, copy);
          await document.fonts.ready;
          const r = ad.getBoundingClientRect();
          // QA: text blocks must stay on the canvas and clear of other elements
          const box = (n) => n.getBoundingClientRect();
          const els = [...ad.querySelectorAll('[data-el]')].map((n) => ({ key: n.dataset.el, b: box(n), text: n.dataset.el === 'headline' || n.dataset.el === 'sub' }));
          const hit = (x, y) => x.left < y.right - 2 && y.left < x.right - 2 && x.top < y.bottom - 2 && y.top < x.bottom - 2;
          const warnings = [];
          for (const e of els) {
            if (e.b.left < r.left - 1 || e.b.right > r.right + 1 || e.b.top < r.top - 1 || (e.text && e.b.bottom > r.bottom + 1)) warnings.push(`${e.key} runs off the canvas`);
            if (!e.text) continue;
            for (const o of els) if (o !== e && hit(e.b, o.b)) warnings.push(`${e.key} overlaps ${o.key}`);
          }
          // QA: contrast between text colour and the artwork right behind it
          const cv = ad.querySelector('canvas');
          const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
          const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
          for (const key of ['logo', 'headline', 'sub']) {
            const el = pr.els[key], n = ad.querySelector(`[data-el="${key}"]`);
            if (!el.visible || !n || !cv) continue;
            const b = n.getBoundingClientRect(), x0 = Math.max(0, Math.round(b.left - r.left)), y0 = Math.max(0, Math.round(b.top - r.top));
            const w = Math.min(cv.width - x0, Math.round(b.width)), h = Math.min(cv.height - y0, Math.round(b.height));
            if (w < 4 || h < 4) continue;
            const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
            // 24 sample points behind the element; flag when 3 or more sit on a colour too close to the text
            const ratios = [];
            for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 6; gx++) {
              const cx = Math.floor(((gx + 0.5) / 6) * w), cy = Math.floor(((gy + 0.5) / 4) * h), i = (cy * w + cx) * 4;
              const L1 = lum(hex(el.color)), L2 = lum([d[i], d[i + 1], d[i + 2]]);
              ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
            }
            ratios.sort((x, y) => x - y);
            if (ratios[2] < 2) warnings.push(`${key} is hard to read (contrast ${ratios[2].toFixed(1)}:1 behind part of it)`);
          }
          return { clip: { x: r.x, y: r.y, width: r.width, height: r.height }, seed: pr.bg.seed, bg: { rotate: pr.bg.rotate, zoom: pr.bg.zoom, offsetX: pr.bg.offsetX, offsetY: pr.bg.offsetY, flipX: pr.bg.flipX, flipY: pr.bg.flipY }, warnings: [...new Set(warnings)] };
        }, { preset: p.data, copy: a, s, flip, jitter });
        await tab.screenshot({ path: outDir + file, clip: res.clip });
        made.push(file);
        report.push({ file, preset: p.id, angle: a.id, seed: res.seed, bg: res.bg, warnings: res.warnings });
      }
    }
  }
  console.log('rendered', p.id);
}

writeFileSync(outDir + 'report.json', JSON.stringify(report, null, 2) + '\n');
const cols = Math.min(4, made.length);
const cells = report.map((r) => `<figure${r.warnings.length ? ' class="warn"' : ''}><img src="${r.file}"><figcaption>${r.file.replace('.png', '')}${r.warnings.length ? '<br><b>' + r.warnings.join(', ') + '</b>' : ''}</figcaption></figure>`).join('');
writeFileSync(outDir + 'sheet.html', `<!doctype html><meta charset="utf-8"><title>Tenthmark ads</title><style>body{margin:0;padding:24px;background:#111;font:13px Inter,sans-serif;color:#aaa}.g{display:grid;grid-template-columns:repeat(${cols},300px);gap:18px}img{width:300px;display:block;border-radius:6px}figure{margin:0}figcaption{margin-top:6px}.warn img{outline:3px solid #ff4d4d}b{color:#ff8a80;font-weight:600}</style><div class="g">${cells}</div>`);
await tab.setViewportSize({ width: 48 + cols * 318, height: 400 });
await tab.goto('file://' + outDir + 'sheet.html');
await tab.screenshot({ path: outDir + 'sheet.png', fullPage: true });
await browser.close();
const flagged = report.filter((r) => r.warnings.length).length;
console.log(`done: ${made.length} ads in out/${runName}/ (${flagged} flagged, see report.json)`);
