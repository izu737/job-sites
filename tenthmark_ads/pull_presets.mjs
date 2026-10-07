// Turns presets saved in the Ad Studio into render ready files in presets/.
// Claude first downloads the studio's "presets" collection with ArtifactData
// (action "list", out_dir <dir>); this script then converts <dir>/presets/*.json.
//
//   node pull_presets.mjs <dir>              add or overwrite, skip the Starter presets
//   node pull_presets.mjs <dir> --clean      empty presets/ first, so it matches the studio exactly
//   node pull_presets.mjs <dir> --starters   include the Starter presets too

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dir) throw new Error('Usage: node pull_presets.mjs <download dir> [--clean] [--starters]');
const src = readdirSync(join(dir, 'presets')).filter((f) => f.endsWith('.json'));
const out = new URL('./presets/', import.meta.url).pathname;
if (process.argv.includes('--clean')) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let n = 0;
for (const f of src) {
  const id = f.replace('.json', '');
  if (id.startsWith('starter_') && !process.argv.includes('--starters')) continue;
  const doc = JSON.parse(readFileSync(join(dir, 'presets', f), 'utf8'));
  const p = doc.preset ?? doc.data?.preset;
  if (!p || !p.bg || !p.els) { console.log('skipped', f, '(not a studio preset)'); continue; }
  writeFileSync(out + id + '.json', JSON.stringify(p, null, 2) + '\n');
  console.log('preset', id, `(${p.template}, ${p.bg.style}, seed ${p.bg.seed})`);
  n++;
}
console.log(`${n} presets written to presets/`);
