// Template 2, modelled on Stripe "Créez votre société aux États-Unis".
// Artwork fills the top half, a white panel below carries the logo,
// a light three line headline and a plain text call to action.

import { brand, logo } from '../brand.mjs';
import { art } from '../art.mjs';

export const size = { w: 1080, h: 1080 };

export function render(v) {
  const c = brand.colors;
  return `
<div class="ad" style="position:relative;width:1080px;height:1080px;overflow:hidden;background:#fff;font-family:${brand.fonts.text}">
  <div style="position:absolute;left:0;top:0;width:1080px;height:520px">${art({ w: 1080, h: 520, ...v.art })}</div>
  <div style="position:absolute;left:64px;top:600px">${logo({ size: 50, color: c.ink })}</div>
  <h1 style="position:absolute;left:64px;right:80px;top:700px;margin:0;color:${c.ink};font-family:${brand.fonts.display};font-weight:400;font-size:72px;line-height:1.08;letter-spacing:-0.03em">${v.headline}</h1>
  <div style="position:absolute;left:64px;bottom:62px;color:${c.ink};font-size:40px;font-weight:400;letter-spacing:-0.01em">${v.cta}</div>
</div>`;
}
