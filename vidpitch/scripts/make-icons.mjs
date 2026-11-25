// Draws the extension icons. Run: node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playButtonPng } from './png.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(out, `icon${size}.png`), playButtonPng(size, { ring: size >= 48 }));
}
console.log('icons written to', out);
