// Bulk renderer. Runs the same engine as the studio (studio/engine.js) in
// headless Chromium and writes one PNG per preset x angle x seed.
//
//   node render.mjs                         every preset x every angle
//   node render.mjs --preset proof_card     one preset (file name in presets/)
//   node render.mjs --angle speed           one angle
//   node render.mjs --seeds 5               5 background variations each
//   node render.mjs --flips                 also render mirrored versions

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const here = new URL('.', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const seeds = Number(arg('seeds', 1));
const flips = process.argv.includes('--flips');
const onlyPreset = arg('preset'), onlyAngle = arg('angle');

const presets = readdirSync(here + 'presets').filter((f) => f.endsWith('.json'))
  .map((f) => ({ id: f.replace('.json', ''), data: JSON.parse(readFileSync(here + 'presets/' + f, 'utf8')) }))
  .filter((p) => !onlyPreset || p.id === onlyPreset);
const { angles } = JSON.parse(readFileSync(here + 'angles.json', 'utf8'));
const outDir = here + 'out/';
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 1920 } });
const tab = await ctx.newPage();
await tab.goto('file://' + here + 'studio/render_page.html');
await tab.evaluate(() => document.fonts.ready);

const made = [];
for (const p of presets) {
  for (const a of angles.filter((a) => !onlyAngle || a.id === onlyAngle)) {
    for (let s = 0; s < seeds; s++) {
      for (const flip of flips ? [false, true] : [false]) {
        const file = `${p.id}__${a.id}__s${s}${flip ? 'f' : ''}.png`;
        const box = await tab.evaluate(async ({ preset, copy, s, flip }) => {
          const pr = TM.normalize(preset);
          pr.bg.seed += s * 17;
          if (flip) pr.bg.flipX = !pr.bg.flipX;
          const ad = TM.renderAd(document.getElementById('root'), pr, copy);
          await document.fonts.ready;
          const r = ad.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, { preset: p.data, copy: a, s, flip });
        await tab.screenshot({ path: outDir + file, clip: box });
        made.push(file);
      }
    }
  }
  console.log('rendered', p.id);
}

const cells = made.map((f) => `<figure><img src="${f}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`).join('');
writeFileSync(outDir + 'sheet.html', `<!doctype html><meta charset="utf-8"><title>Tenthmark ads</title><style>body{margin:0;padding:24px;background:#111;font:14px Inter,sans-serif;color:#aaa}.g{display:grid;grid-template-columns:repeat(3,360px);gap:20px}img{width:360px;display:block;border-radius:6px}figure{margin:0}figcaption{margin-top:6px}</style><div class="g">${cells}</div>`);
await tab.setViewportSize({ width: 1180, height: 400 });
await tab.goto('file://' + outDir + 'sheet.html');
await tab.screenshot({ path: outDir + 'sheet.png', fullPage: true });
await browser.close();
console.log(`done: ${made.length} ads`);
