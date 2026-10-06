// Template 1, modelled on Stripe "Start accepting payments in minutes, not days".
// Full bleed artwork, logo top left, big white headline, a product UI card
// that proves the claim, and a small toast under the card.

import { brand, logo } from '../brand.mjs';
import { art } from '../art.mjs';

export const size = { w: 1080, h: 1080 };

export function render(v) {
  const c = brand.colors;
  const card = v.card;
  return `
<div class="ad" style="position:relative;width:1080px;height:1080px;overflow:hidden;font-family:${brand.fonts.text}">
  <div style="position:absolute;inset:0">${art({ w: 1080, h: 1080, ...v.art })}</div>
  <div style="position:absolute;inset:0;pointer-events:none">
    <div style="position:absolute;left:84px;top:0;bottom:0;border-left:1.5px dashed rgba(255,255,255,.22)"></div>
    <div style="position:absolute;left:0;right:0;top:500px;border-top:1.5px solid rgba(255,255,255,.18)"></div>
  </div>
  <div style="position:absolute;left:84px;top:96px">${logo({ size: 46 })}</div>
  <h1 style="position:absolute;left:84px;right:90px;top:178px;margin:0;color:#fff;font-family:${brand.fonts.display};font-weight:600;font-size:84px;line-height:1.06;letter-spacing:-0.035em">${v.headline}</h1>

  <div style="position:absolute;left:216px;width:648px;top:572px;background:#fff;border-radius:28px;padding:40px 44px 44px;box-shadow:0 30px 80px rgba(0,0,0,.28)">
    <div style="font-size:34px;font-weight:600;color:${c.ink};letter-spacing:-0.02em">${card.title} <span style="color:${c.emerald}">${card.status}</span></div>
    <div style="height:1.5px;background:${c.line};margin:28px 0"></div>
    <div style="display:flex;align-items:center;gap:26px">
      <div style="width:96px;height:96px;border-radius:16px;background:linear-gradient(160deg,${c.cream},#E6EFE9);display:flex;align-items:flex-end;justify-content:center;gap:8px;padding-bottom:18px;box-sizing:border-box">
        ${card.bars.map((b) => `<div style="width:12px;height:${b}px;border-radius:3px;background:${c.emerald}"></div>`).join('')}
      </div>
      <div>
        <div style="font-size:28px;font-weight:600;color:${c.ink}">${card.item}</div>
        <div style="font-size:24px;color:${c.muted};margin-top:6px">${card.meta}</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-top:30px">
      <div style="flex:1;border:1.5px solid ${c.line};border-radius:14px;padding:18px 22px;font-size:24px;color:${c.ink};display:flex;justify-content:space-between">
        <span style="color:${c.muted}">${card.metricLabel}</span><b>${card.metric}</b>
      </div>
      <div style="width:68px;border-radius:14px;background:${c.ink};display:flex;align-items:center;justify-content:center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>
      </div>
    </div>
  </div>
  <div style="position:absolute;left:50%;transform:translateX(-50%);top:${card.toastTop ?? 922}px;background:${c.ink};color:#fff;font-weight:600;font-size:24px;padding:14px 26px;border-radius:12px">${card.toast}</div>
</div>`;
}
