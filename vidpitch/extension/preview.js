// Builds the email GIF, the video poster and the link preview image in the
// browser while you record, so there is nothing left to process afterwards.
// It reads the same video the recorder records (face bubble included).
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';

const SECONDS = 3;
const FPS = 10;
const GIF_TARGET_BYTES = 1024 * 1024;
const GIF_WIDTHS = [480, 400, 320];
const ACCENT = '#1868db';

function drawPlayButton(ctx, cx, cy, d) {
  const r = d / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = d * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r - d * 0.02, 0, Math.PI * 2);
  ctx.lineWidth = d * 0.04;
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.stroke();
  const t = d * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.55, cy - t);
  ctx.lineTo(cx - t * 0.55, cy + t);
  ctx.lineTo(cx + t * 1.05, cy);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function evenHeight(srcW, srcH, w) {
  const h = Math.round((srcH / srcW) * w);
  return h - (h % 2);
}

async function stillJpeg(source, srcW, srcH, width, withButton) {
  const w = Math.min(width, srcW - (srcW % 2));
  const h = evenHeight(srcW, srcH, w);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  if (withButton) drawPlayButton(ctx, w / 2, h / 2, Math.round(Math.min(w, h) * 0.28));
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
}

function encodeGif(frames, width) {
  // Frames are stored at the largest width; shrink them for smaller tries.
  const src = frames[0].canvas;
  const h = evenHeight(src.width, src.height, width);
  const canvas = new OffscreenCanvas(width, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgbaFrames = frames.map((f) => {
    ctx.drawImage(f.canvas, 0, 0, width, h);
    return ctx.getImageData(0, 0, width, h).data;
  });

  // One shared palette, sampled from across the clip, keeps colours steady.
  const step = Math.max(1, Math.floor(rgbaFrames.length / 6));
  const samples = rgbaFrames.filter((_, i) => i % step === 0);
  const pool = new Uint8ClampedArray(samples.reduce((n, s) => n + s.length, 0));
  let o = 0;
  for (const s of samples) { pool.set(s, o); o += s.length; }
  const palette = quantize(pool, 128);

  const gif = GIFEncoder();
  rgbaFrames.forEach((rgba, i) => {
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, width, h, { palette: i === 0 ? palette : undefined, delay: frames[i].delay, repeat: 0 });
  });
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), width };
}

/**
 * Start reading the first 3 seconds of a video track.
 * Returns a promise for { gif, gifWidth, poster, og } (Blobs).
 */
export function startPreviewCapture(track) {
  const copy = track.clone();
  const reader = new MediaStreamTrackProcessor({ track: copy }).readable.getReader();
  // A still screen sends very few frames, so stop on a timer as well.
  const stopTimer = setTimeout(() => reader.cancel().catch(() => {}), SECONDS * 1000 + 600);

  return (async () => {
    const frames = [];
    let first = null;
    let lastKept = -Infinity;
    let posterFrame = null;
    let srcW = 0, srcH = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (first === null) first = value.timestamp;
        const t = (value.timestamp - first) / 1e6;
        if (t > SECONDS) { value.close(); break; }
        srcW = value.displayWidth; srcH = value.displayHeight;

        if (t - lastKept >= 1 / FPS - 0.01) {
          const w = Math.min(GIF_WIDTHS[0], srcW);
          const canvas = new OffscreenCanvas(w, evenHeight(srcW, srcH, w));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(value, 0, 0, canvas.width, canvas.height);
          drawPlayButton(ctx, canvas.width / 2, canvas.height / 2, Math.round(canvas.width * 0.18));
          frames.push({ canvas, t });
          lastKept = t;
        }
        // Poster: a frame just after the start, when the screen has settled.
        if (!posterFrame || t < 0.6) {
          if (posterFrame) posterFrame.close();
          posterFrame = value.clone();
        }
        value.close();
      }
    } finally {
      clearTimeout(stopTimer);
      reader.cancel().catch(() => {});
      copy.stop();
    }
    if (!frames.length || !posterFrame) throw new Error('No video frames arrived in the first seconds.');

    // Each frame shows until the next one; the last fills out the 3 seconds.
    frames.forEach((f, i) => {
      const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(SECONDS, f.t + 0.1);
      f.delay = Math.max(20, Math.round((next - f.t) * 1000));
    });

    let gif = null;
    for (const w of GIF_WIDTHS) {
      if (w > frames[0].canvas.width && gif) continue;
      gif = encodeGif(frames, Math.min(w, frames[0].canvas.width));
      if (gif.blob.size <= GIF_TARGET_BYTES) break;
    }

    const poster = await stillJpeg(posterFrame, srcW, srcH, 1280, false);
    const og = await stillJpeg(posterFrame, srcW, srcH, 1200, true);
    posterFrame.close();
    return { gif: gif.blob, gifWidth: gif.width, poster, og };
  })();
}

window.VidpitchPreview = { startPreviewCapture };
