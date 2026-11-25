// Tiny PNG writer so we can draw the play button and the extension icons
// without pulling in an image library.
import zlib from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** paint(x, y) returns [r, g, b, a] with every channel 0 to 255. */
export function drawPng(width, height, paint, samples = 4) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      // Supersample each pixel so edges come out smooth.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const [pr, pg, pb, pa] = paint(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const n = samples * samples;
      const o = row + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

export const ACCENT = [91, 75, 255];

/** Round accent badge with a white play triangle. */
export function playButtonPng(size = 256, { ring = true } = {}) {
  const c = size / 2;
  const r = size * 0.46;
  const ringW = size * 0.035;
  const t = size * 0.2;
  const tri = [
    [c - t * 0.55, c - t],
    [c - t * 0.55, c + t],
    [c + t * 1.05, c],
  ];
  return drawPng(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d > r) return [0, 0, 0, 0];
    if (inTriangle(x, y, ...tri)) return [255, 255, 255, 255];
    if (ring && d > r - ringW) return [255, 255, 255, 235];
    return [...ACCENT, 240];
  });
}
