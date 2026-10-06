// Renders every angle x template combination to PNG, plus a contact sheet.
//   node render.mjs                  all combinations
//   node render.mjs speed            one angle
//   node render.mjs speed phone_chat one angle, one template

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { brand } from './brand.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const templates = {
  proof_card: await import('./templates/proof_card.mjs'),
  split_editorial: await import('./templates/split_editorial.mjs'),
  phone_chat: await import('./templates/phone_chat.mjs'),
};

const [onlyAngle, onlyTemplate] = process.argv.slice(2);
const { angles } = JSON.parse(readFileSync(new URL('./angles.json', import.meta.url)));
const outDir = new URL('./out/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const page = (body, w, h) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${w}px;height:${h}px;background:${brand.colors.ink}}*{-webkit-font-smoothing:antialiased}</style>
</head><body>${body}</body></html>`;

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const made = [];

for (const angle of angles) {
  if (onlyAngle && angle.id !== onlyAngle) continue;
  for (const [name, tpl] of Object.entries(templates)) {
    if (onlyTemplate && name !== onlyTemplate) continue;
    const vars = { art: angle.art, ...angle[name] };
    const { w, h } = tpl.size;
    await tab.setViewportSize({ width: w, height: h });
    await tab.setContent(page(tpl.render(vars), w, h));
    await tab.evaluate(() => document.fonts.ready);
    const file = `${angle.id}__${name}.png`;
    await tab.screenshot({ path: outDir + file });
    made.push(file);
    console.log('rendered', file);
  }
}

// Contact sheet: one row per angle, one column per template.
const cells = made.map((f) => `<figure><img src="${f}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`).join('');
writeFileSync(outDir + 'sheet.html', `<!doctype html><html><head><meta charset="utf-8"><title>Tenthmark ads</title>
<style>body{margin:0;padding:24px;background:#111;font:14px Inter,sans-serif;color:#aaa}
.g{display:grid;grid-template-columns:repeat(3,360px);gap:20px}img{width:360px;display:block;border-radius:6px}
figure{margin:0}figcaption{margin-top:6px}</style></head><body><div class="g">${cells}</div></body></html>`);
await tab.goto('file://' + outDir + 'sheet.html');
await tab.setViewportSize({ width: 1180, height: 400 });
await tab.screenshot({ path: outDir + 'sheet.png', fullPage: true });

await browser.close();
console.log(`done: ${made.length} ads`);
