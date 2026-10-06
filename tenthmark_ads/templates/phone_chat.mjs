// Template 3, modelled on Stripe "Create a link. Sell anywhere."
// Artwork background behind a frosted centre column, centred logo,
// two short sentences, and a phone showing a chat with a rich card.

import { brand, logo } from '../brand.mjs';
import { art } from '../art.mjs';

export const size = { w: 1080, h: 1080 };

export function render(v) {
  const c = brand.colors;
  const p = v.phone;
  const pct = Math.round((p.current / p.target) * 100);
  return `
<div class="ad" style="position:relative;width:1080px;height:1080px;overflow:hidden;font-family:${brand.fonts.text}">
  <div style="position:absolute;inset:0">${art({ w: 1080, h: 1080, ...v.art })}</div>
  <div style="position:absolute;left:180px;right:180px;top:-2px;bottom:-2px;background:rgba(214,247,226,.18);backdrop-filter:blur(30px);border-left:1.5px solid rgba(255,255,255,.35);border-right:1.5px solid rgba(255,255,255,.35)"></div>
  <div style="position:absolute;left:0;right:0;top:70px;border-top:1.5px solid rgba(255,255,255,.3)"></div>
  <div style="position:absolute;left:0;right:0;bottom:70px;border-top:1.5px solid rgba(255,255,255,.3)"></div>

  <div style="position:absolute;left:0;right:0;top:118px;display:flex;justify-content:center">${logo({ size: 48 })}</div>
  <h1 style="position:absolute;left:0;right:0;top:200px;margin:0;text-align:center;color:#fff;font-family:${brand.fonts.display};font-weight:600;font-size:80px;line-height:1.1;letter-spacing:-0.035em">${v.headline}</h1>

  <div style="position:absolute;left:300px;width:480px;top:440px;height:700px;background:rgba(255,255,255,.94);border-radius:56px;box-shadow:0 30px 90px rgba(0,0,0,.25);overflow:hidden">
    <div style="position:absolute;left:50%;transform:translateX(-50%);top:0;width:170px;height:30px;background:rgba(255,255,255,.94);border-radius:0 0 18px 18px;box-shadow:0 2px 0 ${c.line}"></div>
    <div style="display:flex;justify-content:space-between;padding:22px 44px 0;font-size:18px;font-weight:600;color:${c.muted}"><span>Chat</span><span>●●● ▮</span></div>
    <div style="margin:56px 0 0 40px;width:250px;height:40px;border-radius:20px;background:#E9EDEB"></div>
    <div style="margin:22px 40px 0 auto;width:290px;height:40px;border-radius:20px;background:linear-gradient(90deg,${c.mint},${c.lime})"></div>
    <div style="margin:22px 40px 0 auto;width:330px;border-radius:20px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden">
      <div style="height:170px;background:linear-gradient(160deg,${c.cream},#E3EEE8);padding:24px 26px;box-sizing:border-box">
        <div style="font-size:15px;font-weight:600;color:${c.muted};text-transform:uppercase;letter-spacing:.08em">${p.label}</div>
        <div style="font-family:${brand.fonts.display};font-size:56px;font-weight:700;color:${c.ink};letter-spacing:-0.04em;margin-top:8px">${p.current}<span style="color:${c.muted};font-weight:500"> / ${p.target}</span></div>
        <div style="height:12px;border-radius:6px;background:#D3E0D9;margin-top:14px"><div style="height:12px;width:${pct}%;border-radius:6px;background:${c.emerald}"></div></div>
      </div>
      <div style="padding:18px 26px 22px">
        <div style="font-size:24px;font-weight:600;color:${c.ink}">${p.title}</div>
        <div style="font-size:19px;color:${c.muted};margin-top:4px">${p.sub}</div>
      </div>
    </div>
  </div>
</div>`;
}
